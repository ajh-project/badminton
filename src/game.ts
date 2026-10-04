// 게임 규칙과 물리 (화면과 무관한 순수 로직)

export const W = 1600
export const H = 900
export const GROUND = 800
export const NET_X = 800
export const NET_TOP = 590
export const COURT_L = 70
export const COURT_R = 1530
export const WIN_SCORE = 11

const P_SPEED = 640
const P_JUMP = 1050
const P_GRAVITY = 2900
const S_GRAVITY = 1500
const S_DRAG = 0.0005
const SWING_TIME = 0.26
const ARM = 34 // 어깨 → 손
const RACKET = 62 // 손 → 라켓 헤드 중심
export const HEAD_R = 24

export type Side = 0 | 1

export interface Controls {
  left: boolean
  right: boolean
  jump: boolean
  swing: boolean
}

export interface Player {
  side: Side
  x: number
  y: number // 발 위치
  vx: number
  vy: number
  dir: 1 | -1 // 바라보는 방향 (상대 코트 쪽)
  swing: number // 남은 스윙 시간
  swingHit: boolean
  prevJump: boolean
  prevSwing: boolean
  score: number
}

export interface Shuttle {
  x: number
  y: number
  vx: number
  vy: number
  heldBy: Side | null
  lastHitter: Side | null
  trail: { x: number; y: number }[]
}

export type FxKind = 'text' | 'burst' | 'shake'
export interface Fx {
  kind: FxKind
  x: number
  y: number
  text?: string
  color?: string
  t: number // 남은 시간
  life: number
}

export type Phase = 'title' | 'serve' | 'rally' | 'point' | 'over'

export interface Game {
  phase: Phase
  players: [Player, Player]
  shuttle: Shuttle
  server: Side
  pointTimer: number
  serveTimer: number
  winner: Side | null
  lastPoint: { side: Side; reason: string } | null
  fx: Fx[]
  shake: number
  time: number
}

function newPlayer(side: Side): Player {
  return {
    side,
    x: side === 0 ? 300 : W - 300,
    y: GROUND,
    vx: 0,
    vy: 0,
    dir: side === 0 ? 1 : -1,
    swing: 0,
    swingHit: false,
    prevJump: false,
    prevSwing: false,
    score: 0,
  }
}

export function newGame(): Game {
  const g: Game = {
    phase: 'title',
    players: [newPlayer(0), newPlayer(1)],
    shuttle: { x: 0, y: 0, vx: 0, vy: 0, heldBy: 0, lastHitter: null, trail: [] },
    server: 0,
    pointTimer: 0,
    serveTimer: 0,
    winner: null,
    lastPoint: null,
    fx: [],
    shake: 0,
    time: 0,
  }
  resetRally(g)
  return g
}

export function startMatch(g: Game) {
  const fresh = newGame()
  Object.assign(g, fresh)
  g.phase = 'serve'
}

function resetRally(g: Game) {
  for (const p of g.players) {
    p.x = p.side === 0 ? 300 : W - 300
    p.y = GROUND
    p.vx = p.vy = 0
    p.swing = 0
  }
  const s = g.shuttle
  s.heldBy = g.server
  s.lastHitter = null
  s.vx = s.vy = 0
  s.trail = []
  g.serveTimer = 0
  holdShuttle(g)
}

function holdShuttle(g: Game) {
  const p = g.players[g.shuttle.heldBy!]
  g.shuttle.x = p.x + p.dir * 40
  g.shuttle.y = p.y - 92
}

// ---------- 라켓 위치 ----------

/** 스윙 진행도 0~1에 따른 팔 각도 (오른쪽을 볼 때 기준, 화면 좌표라 위쪽이 음수) */
function armAngle(p: Player): number {
  const deg =
    p.swing > 0
      ? -150 + (1 - p.swing / SWING_TIME) * 185 // 뒤로 젖혔다가 앞으로 휘두름
      : -115 // 기본 자세: 라켓을 위로 들고 있음
  const a = (deg * Math.PI) / 180
  return p.dir === 1 ? a : Math.PI - a
}

export function racketPose(p: Player) {
  const sx = p.x + p.dir * 6
  const sy = p.y - 104
  const a = armAngle(p)
  const hx = sx + Math.cos(a) * ARM
  const hy = sy + Math.sin(a) * ARM
  const rx = hx + Math.cos(a) * RACKET
  const ry = hy + Math.sin(a) * RACKET
  return { sx, sy, hx, hy, rx, ry, a }
}

/** 몸 앞쪽 타격 범위 */
export function hitZone(p: Player) {
  return { x: p.x + p.dir * 45, y: p.y - 150, r: 105 }
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - dx * t, py - ay - dy * t)
}

// ---------- 효과 ----------

function addFx(g: Game, fx: Omit<Fx, 't'>) {
  g.fx.push({ ...fx, t: fx.life })
}

// ---------- 타구 ----------

function hit(g: Game, p: Player, c: Controls) {
  const s = g.shuttle
  const fwd = p.dir === 1 ? c.right : c.left
  const back = p.dir === 1 ? c.left : c.right
  const distNet = Math.abs(NET_X - p.x)
  const airborne = p.y < GROUND - 1
  const high = s.y < p.y - 175

  let deg: number
  let speed: number
  let label: string | null = null

  if (airborne && high) {
    deg = -(15 - Math.min(14, distNet / 32)) // 멀리서는 각도를 덜 꺾어야 네트를 넘음
    speed = 1900 + distNet * 0.2
    label = 'SMASH!'
    g.shake = 0.25
  } else if (back) {
    deg = 52
    speed = 760 + distNet * 0.5
    label = '드롭'
  } else if (fwd) {
    deg = 18
    speed = 1250 + distNet * 0.35
    label = '드라이브'
  } else {
    deg = 56
    speed = 1200 + distNet * 0.36
  }

  const a = (deg * Math.PI) / 180
  s.vx = p.dir * Math.cos(a) * speed
  s.vy = -Math.sin(a) * speed
  s.heldBy = null
  s.lastHitter = p.side
  p.swingHit = true

  addFx(g, { kind: 'burst', x: s.x, y: s.y, color: p.side === 0 ? '#ff7a6b' : '#4aa8ff', life: 0.35 })
  if (label) addFx(g, { kind: 'text', x: s.x, y: s.y - 50, text: label, color: '#fff', life: 0.8 })
}

// ---------- 매 프레임 ----------

export function step(g: Game, dt: number, controls: [Controls, Controls]) {
  g.time += dt
  g.shake = Math.max(0, g.shake - dt)
  for (const f of g.fx) f.t -= dt
  g.fx = g.fx.filter((f) => f.t > 0)

  if (g.phase === 'title' || g.phase === 'over') return

  if (g.phase === 'point') {
    g.pointTimer -= dt
    if (g.pointTimer <= 0) {
      if (g.winner !== null) g.phase = 'over'
      else {
        resetRally(g)
        g.phase = 'serve'
      }
    }
  }

  // 선수 이동
  for (const p of g.players) {
    const c = controls[p.side]
    const move = (c.right ? 1 : 0) - (c.left ? 1 : 0)
    const frozen = g.phase === 'point'
    p.vx = frozen ? 0 : move * P_SPEED

    const onGround = p.y >= GROUND - 0.5
    if (!frozen && c.jump && !p.prevJump && onGround) p.vy = -P_JUMP
    p.vy += P_GRAVITY * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.y > GROUND) {
      p.y = GROUND
      p.vy = 0
    }
    // 자기 코트 안에서만
    const minX = p.side === 0 ? 30 : NET_X + 45
    const maxX = p.side === 0 ? NET_X - 45 : W - 30
    p.x = Math.max(minX, Math.min(maxX, p.x))

    // 스윙
    if (!frozen && c.swing && !p.prevSwing && p.swing <= 0) {
      p.swing = SWING_TIME
      p.swingHit = false
    }
    p.swing = Math.max(0, p.swing - dt)
    p.prevJump = c.jump
    p.prevSwing = c.swing
  }

  const s = g.shuttle

  // 서브: 셔틀을 들고 있다가 스윙하면 친다
  if (g.phase === 'serve') {
    holdShuttle(g)
    const p = g.players[g.server]
    g.serveTimer += dt
    if (p.swing > 0 && !p.swingHit && p.swing < SWING_TIME * 0.6) {
      const distNet = Math.abs(NET_X - p.x)
      const a = (60 * Math.PI) / 180
      const speed = 1100 + distNet * 0.45
      s.vx = p.dir * Math.cos(a) * speed
      s.vy = -Math.sin(a) * speed
      s.heldBy = null
      s.lastHitter = p.side
      p.swingHit = true
      g.phase = 'rally'
      addFx(g, { kind: 'burst', x: s.x, y: s.y, color: '#fff', life: 0.3 })
    }
    return
  }

  if (g.phase !== 'rally') return

  // 셔틀콕 물리 (속도 제곱에 비례하는 공기 저항)
  const v = Math.hypot(s.vx, s.vy)
  s.vx -= S_DRAG * v * s.vx * dt
  s.vy += (S_GRAVITY - S_DRAG * v * s.vy) * dt
  const px = s.x
  s.x += s.vx * dt
  s.y += s.vy * dt
  s.trail.push({ x: s.x, y: s.y })
  if (s.trail.length > 14) s.trail.shift()

  // 네트에 걸림
  const crossed = (px - NET_X) * (s.x - NET_X) <= 0 && px !== s.x
  if (crossed && s.y > NET_TOP) {
    s.x = px < NET_X ? NET_X - 8 : NET_X + 8
    s.vx *= -0.2
    s.vy *= 0.3
    addFx(g, { kind: 'text', x: NET_X, y: NET_TOP - 40, text: '네트!', color: '#ffd54a', life: 0.8 })
  }

  // 라켓에 맞았는지
  for (const p of g.players) {
    if (p.swing <= 0 || p.swingHit) continue
    const prog = 1 - p.swing / SWING_TIME
    if (prog < 0.1 || prog > 0.9) continue
    // 라켓 헤드에 닿았거나, 몸 앞 타격 범위 안에 있으면 맞은 것으로 (사람이 하기 쉽게 넉넉히)
    const r = racketPose(p)
    const onRacket = Math.min(Math.hypot(s.x - r.rx, s.y - r.ry), distToSegment(s.x, s.y, r.hx, r.hy, r.rx, r.ry) + 10)
    const z = hitZone(p)
    const inZone = Math.hypot(s.x - z.x, s.y - z.y) < z.r
    if (onRacket < HEAD_R + 30 || inZone) hit(g, p, controls[p.side])
  }

  // 바닥에 떨어짐 → 득점
  if (s.y >= GROUND - 6) {
    s.y = GROUND - 6
    const out = s.x < COURT_L || s.x > COURT_R
    let winner: Side
    let reason: string
    if (out) {
      winner = s.lastHitter === 0 ? 1 : 0
      reason = '아웃!'
    } else {
      winner = s.x < NET_X ? 1 : 0
      reason = '인!'
    }
    scorePoint(g, winner, reason)
  }
}

// ---------- 컴퓨터 상대 ----------

/** 셔틀이 칠 높이(머리 위)까지 내려오는 지점을 미리 계산 */
function predict(g: Game, hitY: number) {
  const s = g.shuttle
  let { x, y, vx, vy } = s
  const dt = 1 / 60
  for (let i = 0; i < 400; i++) {
    const v = Math.hypot(vx, vy)
    vx -= S_DRAG * v * vx * dt
    vy += (S_GRAVITY - S_DRAG * v * vy) * dt
    x += vx * dt
    y += vy * dt
    if (vy > 0 && y >= hitY) return { x, t: i * dt }
  }
  return { x, t: 99 }
}

const aiMemory = new WeakMap<Player, { wobble: number; plan: 'clear' | 'smash' | 'drop' | 'drive'; planFor: number }>()

export function aiControls(g: Game, side: Side, level = 0.8): Controls {
  const p = g.players[side]
  const c: Controls = { left: false, right: false, jump: false, swing: false }
  const s = g.shuttle
  const mem = aiMemory.get(p) ?? { wobble: 0, plan: 'clear' as const, planFor: -1 }
  aiMemory.set(p, mem)
  const homeX = side === 0 ? 380 : W - 380

  if (g.phase === 'serve') {
    mem.planFor = -1
    mem.wobble = 0
    if (g.server === side && g.serveTimer > 0.9) c.swing = Math.floor(g.time * 4) % 2 === 0
    return c
  }
  if (g.phase !== 'rally') return c

  const comingToMe = side === 0 ? s.x < NET_X || s.vx < 0 : s.x > NET_X || s.vx > 0
  let targetX = homeX
  let eta = 99
  if (comingToMe) {
    const z = hitZone(p)
    const land = predict(g, z.y)
    eta = land.t
    targetX = land.x - p.dir * 45 + mem.wobble
  }
  const dx = targetX - p.x
  if (Math.abs(dx) > 12) {
    c.left = dx < 0
    c.right = dx > 0
  }

  // 상대가 칠 때마다 이번에 어떤 샷을 칠지 정함
  const shotId = g.fx.length + Math.round(s.x) // 대충 매번 다른 값
  if (comingToMe && mem.planFor === -1) {
    const r = Math.random()
    mem.plan = r < 0.25 ? 'smash' : r < 0.45 ? 'drop' : r < 0.6 ? 'drive' : 'clear'
    mem.planFor = shotId
    // 실력에 따라 가끔 타이밍을 놓침
    mem.wobble = Math.random() < (1 - level) * 0.6 ? (Math.random() < 0.5 ? -1 : 1) * (150 + Math.random() * 100) : 0
  }
  if (!comingToMe) mem.planFor = -1

  if (comingToMe && mem.plan === 'smash' && eta < 0.42 && eta > 0.3 && Math.abs(NET_X - p.x) < 520) c.jump = true

  // 셔틀이 타격 범위에 들어오기 직전에 스윙
  if (comingToMe && eta < 0.12) {
    c.swing = true
    const toNet = p.dir === 1 ? 'right' : 'left'
    const away = p.dir === 1 ? 'left' : 'right'
    if (mem.plan === 'drop') c[away] = true
    if (mem.plan === 'drive') c[toNet] = true
  }
  return c
}

function scorePoint(g: Game, side: Side, reason: string) {
  const p = g.players[side]
  p.score++
  g.server = side
  g.lastPoint = { side, reason }
  g.phase = 'point'
  g.pointTimer = 1.4
  addFx(g, { kind: 'text', x: g.shuttle.x, y: GROUND - 80, text: reason, color: '#fff', life: 1.2 })
  if (p.score >= WIN_SCORE) g.winner = side
}
