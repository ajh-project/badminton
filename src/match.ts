// 경기 규칙, 선수 이동, 타구, 컴퓨터 상대 (화면과 무관한 순수 로직)

import { COURT, predictAt, simulate, solveAngle, solveClearingNet, stepShuttle, type V3 } from './physics'

export const WIN_SCORE = 11
const MOVE_SPEED = 5.2
const JUMP_V = 3.6
const P_GRAVITY = 14
const SWING_TIME = 0.32
const EYE = 1.62

export type Side = 0 | 1
export type ShotKind = 'clear' | 'drop' | 'drive' | 'smash' | 'serveShort' | 'serveLong'

/** 서브 버튼을 이 시간(초) 이상 누르면 롱서브 */
export const LONG_SERVE_HOLD = 0.3

/** 선수 기준 조작: mz>0 = 네트 쪽(앞), mx>0 = 오른쪽 */
export interface Controls {
  mx: number
  mz: number
  jump: boolean
  swing: boolean
}

export const noControls = (): Controls => ({ mx: 0, mz: 0, jump: false, swing: false })

export interface Player {
  side: Side
  facing: 1 | -1 // 바라보는 z 방향 (P1 +1, P2 -1)
  x: number
  z: number
  y: number // 점프 높이
  vy: number
  vx: number
  vz: number
  swing: number // 남은 스윙 시간
  swingOver: boolean // 머리 위 스윙인지
  swingHit: boolean
  prevSwing: boolean
  prevJump: boolean
  score: number
  autoSwing: boolean
  isCpu: boolean
  /** 서브 버튼을 누르고 있는 시간 (-1이면 안 누름) */
  serveCharge: number
  serveKind: 'short' | 'long' | null
}

export interface Shuttle {
  p: V3
  v: V3
  heldBy: Side | null
  lastHitter: Side | null
  inPlay: boolean
}

export interface GameEvent {
  kind: 'hit' | 'net' | 'point' | 'serve'
  side?: Side
  shot?: ShotKind
  text?: string
  at?: V3
}

export type Phase = 'menu' | 'serve' | 'rally' | 'point' | 'over'

export interface Match {
  phase: Phase
  players: [Player, Player]
  shuttle: Shuttle
  server: Side
  timer: number
  winner: Side | null
  lastPoint: { side: Side; reason: string } | null
  events: GameEvent[]
  time: number
  /** 온라인 참가자 쪽: 이동과 셔틀 비행만 계산하고 타격·득점 판정은 방장에게 맡김 */
  remote: boolean
  /** 위치를 네트워크로 받는 선수 (방장 쪽에서 본 참가자) */
  external: [boolean, boolean]
}

function makePlayer(side: Side): Player {
  return {
    side,
    facing: side === 0 ? 1 : -1,
    x: 0,
    z: side === 0 ? -4 : 4,
    y: 0,
    vy: 0,
    vx: 0,
    vz: 0,
    swing: 0,
    swingOver: true,
    swingHit: false,
    prevSwing: false,
    prevJump: false,
    score: 0,
    autoSwing: false,
    isCpu: false,
    serveCharge: -1,
    serveKind: null,
  }
}

export function newMatch(): Match {
  return {
    phase: 'menu',
    players: [makePlayer(0), makePlayer(1)],
    shuttle: { p: { x: 0, y: 1, z: -3 }, v: { x: 0, y: 0, z: 0 }, heldBy: 0, lastHitter: null, inPlay: false },
    server: 0,
    timer: 0,
    winner: null,
    lastPoint: null,
    events: [],
    time: 0,
    remote: false,
    external: [false, false],
  }
}

export function startMatch(
  m: Match,
  opts: { cpu: [boolean, boolean]; auto: [boolean, boolean]; remote?: boolean; external?: [boolean, boolean] },
) {
  const fresh = newMatch()
  fresh.players.forEach((p, i) => {
    p.isCpu = opts.cpu[i]
    p.autoSwing = opts.auto[i]
  })
  fresh.remote = opts.remote ?? false
  fresh.external = opts.external ?? [false, false]
  Object.assign(m, fresh)
  m.phase = 'serve'
  setupServe(m)
}

/** 선수 기준 오른쪽 방향의 월드 x 부호 (P1이 +z를 볼 때 오른쪽은 -x) */
const rightX = (p: Player) => -p.facing

function setupServe(m: Match) {
  const server = m.players[m.server]
  const recv = m.players[m.server === 0 ? 1 : 0]
  // 점수가 짝수면 오른쪽, 홀수면 왼쪽 서비스 코트
  const lane = server.score % 2 === 0 ? 1 : -1
  server.x = rightX(server) * lane * 1.3
  server.z = -server.facing * 2.8
  recv.x = rightX(server) * lane * 1.3 // 대각선
  recv.z = -recv.facing * 3.2
  for (const p of m.players) {
    p.y = p.vy = p.vx = p.vz = 0
    p.swing = 0
    p.swingHit = false
    p.serveCharge = -1
    p.serveKind = null
  }
  const s = m.shuttle
  s.heldBy = m.server
  s.lastHitter = null
  s.inPlay = false
  s.v = { x: 0, y: 0, z: 0 }
  m.timer = 0
  holdShuttle(m)
}

function holdShuttle(m: Match) {
  const p = m.players[m.shuttle.heldBy!]
  m.shuttle.p = { x: p.x + rightX(p) * -0.25, y: 1.0, z: p.z + p.facing * 0.45 }
}

// ---------- 타격 범위 ----------

/** 몸 앞쪽의 세로 캡슐 모양 범위 (넉넉하게) */
export function inHitZone(p: Player, s: V3) {
  const cx = p.x + rightX(p) * 0.3
  const cz = p.z + p.facing * 0.45
  const horiz = Math.hypot(s.x - cx, s.z - cz)
  const low = p.y + 0.25
  const high = p.y + 3.0
  return horiz < 1.05 && s.y > low && s.y < high
}

export const eyeHeight = (p: Player) => p.y + EYE

// ---------- 샷 ----------

function rand(a: number, b: number) {
  return a + Math.random() * (b - a)
}

function decideShot(p: Player, c: Controls, s: Shuttle): ShotKind {
  const airborne = p.y > 0.15
  if (airborne && s.p.y > 2.2) return 'smash'
  if (c.mz < -0.4) return 'drop'
  if (c.mz > 0.4) return 'drive'
  return 'clear'
}

function shoot(m: Match, p: Player, c: Controls, kind: ShotKind) {
  const s = m.shuttle
  // 상대 코트 깊이 → 월드 z (P1이 치면 +z 쪽)
  const depth = (d: number) => p.facing * d
  // 좌우 조작으로 방향 조절, 약간의 오차
  const aimX = Math.max(-1, Math.min(1, c.mx)) * rightX(p) * 1.9
  const err = p.isCpu ? 0.45 : 0.3
  const from = { ...s.p }
  let v: V3
  switch (kind) {
    case 'serveShort':
      // 네트 바로 위로 낮게 → 상대 숏 서비스 라인 근처
      v = solveClearingNet(from, { x: -from.x * 0.7 + rand(-0.2, 0.2), z: depth(rand(2.15, 2.8)) }, 12, 0.1)
      break
    case 'serveLong':
      // 높이 띄워서 상대 코트 맨 뒤로
      v = solveClearingNet(from, { x: -from.x * 0.8 + rand(-0.3, 0.3), z: depth(rand(5.3, 6.4)) }, 56, 0.6)
      break
    case 'smash': {
      const target = { x: aimX + rand(-err, err), z: depth(rand(2.4, 4.6)) }
      v = solveAngle(from, target, 30)
      const r = simulate(from, v, 1 / 90)
      if (r.netY !== null && r.netY < COURT.netH + 0.05) v = solveClearingNet(from, target, -5, 0.05)
      break
    }
    case 'drop':
      v = solveClearingNet(from, { x: aimX * 0.8 + rand(-err, err), z: depth(rand(0.9, 2.2)) }, 28, 0.08)
      break
    case 'drive':
      v = solveClearingNet(from, { x: aimX + rand(-err, err), z: depth(rand(3.2, 5.0)) }, 6, 0.1)
      break
    default:
      v = solveClearingNet(from, { x: aimX + rand(-err, err), z: depth(5.6 + rand(-err, err * 1.6)) }, 42, 0.5)
  }
  s.v = v
  s.heldBy = null
  s.lastHitter = p.side
  s.inPlay = true
  p.swingHit = true
  m.events.push({ kind: 'hit', side: p.side, shot: kind, at: { ...from } })
}

// ---------- 매 프레임 ----------

let stepDt = 1 / 120

export function step(m: Match, dt: number, input: [Controls, Controls]) {
  stepDt = dt
  m.time += dt
  if (m.phase === 'menu' || m.phase === 'over') return

  if (m.phase === 'point' && !m.remote) {
    m.timer -= dt
    if (m.timer <= 0) {
      if (m.winner !== null) m.phase = 'over'
      else {
        m.phase = 'serve'
        setupServe(m)
      }
    }
  }

  const controls: [Controls, Controls] = [0, 1].map((i) =>
    m.players[i].isCpu ? aiControls(m, i as Side) : withAutoSwing(m, m.players[i], input[i]),
  ) as [Controls, Controls]

  for (const p of m.players) {
    const c = controls[p.side]
    const locked = m.phase === 'point' || m.phase === 'serve' // 서브 전에는 제자리
    if (m.external[p.side]) {
      // 위치는 네트워크로 받음. 스윙만 처리
      handleSwing(m, p, c)
      continue
    }
    // 이동 (선수 기준 → 월드)
    let mx = locked ? 0 : c.mx
    let mz = locked ? 0 : c.mz
    const len = Math.hypot(mx, mz)
    if (len > 1) {
      mx /= len
      mz /= len
    }
    const tvx = mx * rightX(p) * MOVE_SPEED
    const tvz = mz * p.facing * MOVE_SPEED
    const k = Math.min(1, dt * 14)
    p.vx += (tvx - p.vx) * k
    p.vz += (tvz - p.vz) * k
    p.x += p.vx * dt
    p.z += p.vz * dt
    // 자기 코트 안에서만
    p.x = Math.max(-3.4, Math.min(3.4, p.x))
    const nearNet = 0.45
    if (p.facing === 1) p.z = Math.max(-7.4, Math.min(-nearNet, p.z))
    else p.z = Math.min(7.4, Math.max(nearNet, p.z))

    // 점프
    if (!locked && c.jump && !p.prevJump && p.y <= 0) p.vy = JUMP_V
    p.vy -= P_GRAVITY * dt
    p.y = Math.max(0, p.y + p.vy * dt)
    if (p.y === 0 && p.vy < 0) p.vy = 0

    handleSwing(m, p, c)
    p.prevJump = c.jump
  }

  const s = m.shuttle

  if (m.remote) {
    // 참가자 쪽: 셔틀 비행만 (판정은 방장 스냅샷으로 받음)
    if (s.heldBy !== null) holdShuttle(m)
    else if (s.inPlay) {
      for (let i = 0; i < 4; i++) stepShuttle(s.p, s.v, dt / 4)
      if (s.p.y < 0.02) {
        s.p.y = 0.02
        s.inPlay = false
      }
    }
    return
  }

  if (m.phase === 'serve') {
    holdShuttle(m)
    m.timer += dt
    const p = m.players[m.server]
    if (p.swing > 0 && !p.swingHit && p.swing < SWING_TIME * 0.55) {
      // 사람은 누른 길이로 정해짐, 컴퓨터는 섞어서
      const kind = p.serveKind ?? (Math.random() < 0.55 ? 'short' : 'long')
      shoot(m, p, controls[p.side], kind === 'long' ? 'serveLong' : 'serveShort')
      m.phase = 'rally'
      m.events.push({ kind: 'serve', side: p.side })
    }
    return
  }

  if (m.phase !== 'rally' && m.phase !== 'point') return
  if (!s.inPlay) return

  // 셔틀 이동 (빠를 때 네트 통과 판정이 새지 않게 잘게 나눔)
  const sub = 4
  for (let i = 0; i < sub; i++) {
    const pz = s.p.z
    stepShuttle(s.p, s.v, dt / sub)
    if (pz * s.p.z <= 0 && pz !== s.p.z && Math.abs(s.p.x) < COURT.halfWDoubles + 0.1 && s.p.y < COURT.netH) {
      // 네트에 걸림 → 맞은 쪽으로 떨어짐
      s.p.z = pz < 0 ? -0.06 : 0.06
      s.v.z *= -0.12
      s.v.x *= 0.3
      s.v.y = Math.min(s.v.y, 0) * 0.3
      m.events.push({ kind: 'net', at: { ...s.p } })
    }
  }

  // 라켓에 맞았는지
  if (m.phase === 'rally') {
    for (const p of m.players) {
      if (p.swing <= 0 || p.swingHit) continue
      const prog = 1 - p.swing / SWING_TIME
      if (prog < 0.12 || prog > 0.85) continue
      // 자기 쪽으로 오는 셔틀만
      const toward = Math.sign(s.v.z) === -p.facing || Math.sign(s.p.z) === -p.facing
      if (toward && inHitZone(p, s.p)) shoot(m, p, controls[p.side], decideShot(p, controls[p.side], s))
    }
  }

  // 바닥
  if (s.p.y <= 0.02) {
    s.p.y = 0.02
    s.inPlay = false
    if (m.phase !== 'rally') return
    const landSide = s.p.z < 0 ? 0 : 1 // 떨어진 코트의 주인
    const inside = Math.abs(s.p.x) <= COURT.halfW + 0.02 && Math.abs(s.p.z) <= COURT.halfLen + 0.02
    let winner: Side
    let reason: string
    if (s.lastHitter === landSide) {
      winner = landSide === 0 ? 1 : 0 // 자기 코트에 떨어뜨림 (네트 등)
      reason = '네트!'
    } else if (inside) {
      winner = landSide === 0 ? 1 : 0
      reason = '인!'
    } else {
      winner = landSide // 상대가 친 게 아웃
      reason = '아웃!'
    }
    scorePoint(m, winner, reason)
  }
}

/** 사람이 서브할 때는 누르는 길이로 숏/롱 서브, 그 외에는 보통 스윙 */
function handleSwing(m: Match, p: Player, c: Controls) {
  if (m.phase === 'serve' && p.side === m.server && !p.isCpu) serveInput(p, c)
  else swingLogic(m, p, c)
}

function serveInput(p: Player, c: Controls) {
  if (p.swing > 0 || p.swingHit) {
    // 이미 휘두르는 중
    p.swing = Math.max(0, p.swing - stepDt)
  } else if (c.swing && !p.prevSwing) {
    p.serveCharge = 0 // 누르기 시작
  } else if (c.swing && p.serveCharge >= 0) {
    p.serveCharge = Math.min(1, p.serveCharge + stepDt)
  } else if (!c.swing && p.serveCharge >= 0) {
    // 떼는 순간 서브 종류가 정해지고 스윙
    p.serveKind = p.serveCharge >= LONG_SERVE_HOLD ? 'long' : 'short'
    p.serveCharge = -1
    p.swing = SWING_TIME
    p.swingHit = false
    p.swingOver = false
  }
  p.prevSwing = c.swing
}

function swingLogic(m: Match, p: Player, c: Controls) {
  if (m.phase !== 'point' && c.swing && !p.prevSwing && p.swing <= 0) {
    p.swing = SWING_TIME
    p.swingHit = false
    p.swingOver = m.shuttle.p.y > eyeHeight(p) - 0.2
  }
  p.swing = Math.max(0, p.swing - stepDt)
  p.prevSwing = c.swing
}

function scorePoint(m: Match, side: Side, reason: string) {
  const p = m.players[side]
  p.score++
  m.server = side
  m.lastPoint = { side, reason }
  m.phase = 'point'
  m.timer = 1.8
  m.events.push({ kind: 'point', side, text: reason, at: { ...m.shuttle.p } })
  if (p.score >= WIN_SCORE) m.winner = side
}

// ---------- 자동 스윙 (쉬움) / 컴퓨터 ----------

/** 셔틀이 칠 수 있는 높이까지 내려오는 곳과 시간 */
function incoming(m: Match, p: Player) {
  const s = m.shuttle
  if (!s.inPlay || m.phase !== 'rally') return null
  const toward = Math.sign(s.v.z) === -p.facing
  if (!toward && Math.sign(s.p.z) !== -p.facing) return null
  if (s.lastHitter === p.side) return null
  return predictAt(s.p, s.v, p.y + 2.0) ?? predictAt(s.p, s.v, 1.0)
}

function withAutoSwing(m: Match, p: Player, c: Controls): Controls {
  if (!p.autoSwing) return c
  const out = { ...c }
  // 서브는 자동으로 하지 않음 (사람이 직접 짧게/길게 눌러서)
  if (m.phase !== 'rally') return out
  const s = m.shuttle
  if (s.lastHitter !== p.side && s.inPlay) {
    // 실제 셔틀 위치가 범위 안이거나 곧 들어올 때
    const soon = { x: s.p.x + s.v.x * 0.1, y: s.p.y + s.v.y * 0.1, z: s.p.z + s.v.z * 0.1 }
    if (inHitZone(p, soon)) out.swing = true
  }
  return out
}

interface AiMem {
  plan: ShotKind
  planned: boolean
  missX: number
  missZ: number
}
const aiMem = new WeakMap<Player, AiMem>()

export function aiControls(m: Match, side: Side, level = 0.75): Controls {
  const p = m.players[side]
  const c = noControls()
  const mem = aiMem.get(p) ?? { plan: 'clear', planned: false, missX: 0, missZ: 0 }
  aiMem.set(p, mem)

  if (m.phase === 'serve') {
    mem.planned = false
    if (m.server === side && m.timer > 1.0) c.swing = Math.floor(m.time * 3) % 2 === 0
    return c
  }
  if (m.phase !== 'rally') return c

  const hit = incoming(m, p)
  let tx = 0
  let tz = -p.facing * 3.2 // 기본 위치: 코트 가운데
  if (hit) {
    if (!mem.planned) {
      const r = Math.random()
      mem.plan = r < 0.22 ? 'smash' : r < 0.42 ? 'drop' : r < 0.58 ? 'drive' : 'clear'
      mem.planned = true
      const miss = Math.random() < (1 - level) * 0.55
      const a = Math.random() * Math.PI * 2
      mem.missX = miss ? Math.cos(a) * 1.4 : 0
      mem.missZ = miss ? Math.sin(a) * 1.4 : 0
    }
    // 타격 범위 중심이 셔틀 낙하 지점에 오도록
    tx = hit.x - rightX(p) * 0.3 + mem.missX
    tz = hit.z - p.facing * 0.45 + mem.missZ
  } else {
    mem.planned = false
  }

  // 월드 → 선수 기준 조작
  const dx = tx - p.x
  const dz = tz - p.z
  if (Math.hypot(dx, dz) > 0.12) {
    c.mx = Math.max(-1, Math.min(1, (dx * rightX(p)) / 0.5))
    c.mz = Math.max(-1, Math.min(1, (dz * p.facing) / 0.5))
  }

  if (hit) {
    if (mem.plan === 'smash' && hit.t < 0.5 && hit.t > 0.3 && m.shuttle.p.y > 2.6) c.jump = true
    const s = m.shuttle
    const soon = { x: s.p.x + s.v.x * 0.1, y: s.p.y + s.v.y * 0.1, z: s.p.z + s.v.z * 0.1 }
    if (inHitZone(p, soon)) {
      c.swing = true
      // 샷 종류는 스윙 순간의 앞뒤 입력으로 정해짐
      c.mz = mem.plan === 'drop' ? -1 : mem.plan === 'drive' ? 1 : 0
    }
  }
  return c
}
