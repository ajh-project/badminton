import './style.css'
import * as THREE from 'three'
import QRCode from 'qrcode'
import { Character, photoToFace, type Gender, type Look } from './character'
import { bindKeyboard, bindMouseSwing, bindTouchPads, clearTaps, merge, readKeyboard, readTouch } from './input'
import { LONG_SERVE_HOLD, WIN_SCORE, newMatch, noControls, startMatch, step, type Controls, type GameEvent, type Match, type Side } from './match'
import { Online, joinLink } from './net'
import { ShuttleView, buildWorld } from './world'

type Mode = 'cpu' | 'duo' | 'online'
type View = 'third' | 'first' | 'tv'
type LookBase = Omit<Look, 'face'>

const SHIRTS = ['#ff6b5e', '#3d9bff', '#ffb020', '#2fbf71', '#a26bff', '#ff5fa2', '#2b2f3a']
const VIEW_NAME: Record<View, string> = { third: '3인칭', first: '1인칭', tv: '중계' }
const SWING_TIME = 0.32

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!

// ---------- 설정 (사진 말고는 이 기기에 기억) ----------

interface Settings {
  mode: Mode
  view: View
  /** 시야: 자동 추적 / 직접 조작(마우스·기울이기) */
  look: 'auto' | 'manual'
  looks: [LookBase, LookBase]
  auto: [boolean, boolean]
}

const DEFAULTS: Settings = {
  mode: 'cpu',
  view: 'third',
  look: 'auto',
  looks: [
    { gender: 'm', shirt: SHIRTS[0] },
    { gender: 'f', shirt: SHIRTS[1] },
  ],
  auto: [true, true],
}

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('badminton3d') ?? 'null')
    if (s && s.looks?.length === 2) return { ...DEFAULTS, ...s }
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
  return structuredClone(DEFAULTS)
}
const settings = loadSettings()
const saveSettings = () => {
  try {
    localStorage.setItem('badminton3d', JSON.stringify(settings))
  } catch {
    /* 무시 */
  }
}
const faces: [HTMLCanvasElement | null, HTMLCanvasElement | null] = [null, null]

// ---------- 온라인 상태 ----------

const online = new Online()
/** 이 기기에서 조작하는 선수 (온라인 참가자는 P2) */
let me: Side = 0
const remote = { look: null as LookBase | null, face: null as HTMLCanvasElement | null, auto: false }
const isOnline = () => settings.mode === 'online'

// ---------- 3D 장면 ----------

const canvas = $<HTMLCanvasElement>('#c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

const scene = new THREE.Scene()
buildWorld(scene)
const shuttle = new ShuttleView(scene)

const cams: [THREE.PerspectiveCamera, THREE.PerspectiveCamera] = [
  new THREE.PerspectiveCamera(60, 1, 0.05, 300),
  new THREE.PerspectiveCamera(60, 1, 0.05, 300),
]
const tvCam = new THREE.PerspectiveCamera(42, 1, 0.1, 300)

/** 중계 카메라는 내 쪽 코트 뒤 (둘이서 한 화면이면 P1 쪽) */
const tvSide = (): Side => (settings.mode === 'duo' ? 0 : me)
function placeTv() {
  const f = tvSide() === 0 ? 1 : -1
  tvCam.position.set(0, 7.2, -14.5 * f)
  tvCam.lookAt(0, 0, 0.8 * f)
}
placeTv()

let chars: [Character, Character] | null = null
const match: Match = newMatch()

function lookFor(side: Side): Look {
  if (isOnline()) {
    if (side === me) return { ...settings.looks[0], face: faces[0] }
    const look = { ...(remote.look ?? settings.looks[1]) }
    // 상대가 나와 같은 색 옷이면 구분되게 다른 색으로
    if (look.shirt === settings.looks[0].shirt) look.shirt = SHIRTS[(SHIRTS.indexOf(look.shirt) + 1) % SHIRTS.length]
    return { ...look, face: remote.face }
  }
  return { ...settings.looks[side], face: faces[side] }
}

function buildCharacters() {
  if (chars) for (const c of chars) scene.remove(c.root)
  chars = [lookFor(0), lookFor(1)].map((l) => new Character(l)) as [Character, Character]
  for (const c of chars) scene.add(c.root)
}
buildCharacters()

// ---------- 카메라 ----------

// 시야 각도: yaw = 좌우(라디안, atan2(x, z) 기준), pitch = 위아래 (+가 위)
const camAim = [
  { yaw: 0, pitch: 0 },
  { yaw: Math.PI, pitch: 0 },
]
/** 직접 조작으로 더한 시야 (마우스·기울이기). 정면 기준 */
const manualLook = { yaw: 0, pitch: 0 }
const MAX_TURN = 2.4 // 자동 추적 최대 회전 속도 (rad/s, 멀미 방지)
const FOV_FIRST = 88 // 1인칭 세로 화각 (넓게: 높은 공과 양쪽 사이드라인이 보이게)
const FOV_THIRD = 64

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const fwdYaw = (f: 1 | -1) => (f === 1 ? 0 : Math.PI)

function aimAt(from: THREE.Vector3, to: { x: number; y: number; z: number }) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

/** 이 선수가 지금 보고 싶은 시야 (정면 기준 상대 각도) */
function desiredAim(side: Side, eye: THREE.Vector3, base: { x: number; y: number; z: number }, track: number) {
  const p = match.players[side]
  const fy = fwdYaw(p.facing)
  const b = aimAt(eye, base)
  let tracking = false
  // 기준: 셔틀을 볼 때는 지금 보는 방향(가만히 있기), 아니면 정면
  const cur = camAim[side]
  let yaw = wrapAngle(b.yaw - fy)
  let pitch = b.pitch

  if (settings.look === 'manual') {
    yaw += manualLook.yaw
    pitch += manualLook.pitch
  } else if (track > 0) {
    // 자동 추적 (실제 배드민턴처럼): 몸은 네트를 보고, 셔틀이 시야 가장자리로 가면 그만큼만 고개를 돌림
    const s = match.shuttle
    const ahead = (s.p.z - p.z) * p.facing
    if (ahead > 0.3 && (s.inPlay || s.heldBy !== null)) {
      const t = aimAt(eye, { x: s.p.x, y: Math.max(0.3, s.p.y), z: s.p.z })
      const ty = wrapAngle(t.yaw - fy)
      const cam = cams[side]
      const halfV = (cam.fov * Math.PI) / 360
      const halfH = Math.atan(Math.tan(halfV) * cam.aspect)
      // 지금 보는 방향에서 셔틀이 화면 가운데 영역(track 비율) 안에 있으면 그대로, 벗어날 때만 그만큼 돌림
      yaw = clamp(wrapAngle(cur.yaw - fy), ty - halfH * track, ty + halfH * track)
      pitch = clamp(cur.pitch, t.pitch - halfV * track, t.pitch + halfV * track)
      tracking = true
    }
  }
  return { yaw: clamp(yaw, -1.35, 1.35) + fy, pitch: clamp(pitch, -0.6, 1.25), tracking }
}

function turnToward(side: Side, want: { yaw: number; pitch: number }, dt: number, rate: number) {
  const a = camAim[side]
  const dy = wrapAngle(want.yaw - a.yaw)
  const dp = want.pitch - a.pitch
  const k = Math.min(1, dt * rate)
  const limit = settings.look === 'manual' ? Infinity : MAX_TURN * dt
  a.yaw = wrapAngle(a.yaw + clamp(dy * k, -limit, limit))
  a.pitch += clamp(dp * k, -limit, limit)
}

function lookDir(a: { yaw: number; pitch: number }) {
  return new THREE.Vector3(Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), Math.cos(a.yaw) * Math.cos(a.pitch))
}

function updateCamera(side: Side, dt: number, view: View) {
  const cam = cams[side]
  const p = match.players[side]
  const f = p.facing

  if (view === 'first') {
    cam.fov = FOV_FIRST
    // 눈 위치를 머리 살짝 위로: 내 코트와 라켓까지 시야에 들어오게
    const eye = new THREE.Vector3(p.x, p.y + 1.72, p.z - f * 0.05)
    // 기본 시선: 상대 코트 가운데, 약간 아래를 내려다봄
    const want = desiredAim(side, eye, { x: p.x * 0.35, y: 1.2, z: f * 6 }, 0.75)
    // 셔틀을 따라갈 땐 보통 속도, 정면으로 돌아올 땐 천천히
    turnToward(side, want, dt, settings.look === 'manual' ? 30 : want.tracking ? 4 : 1.2)
    cam.position.copy(eye)
    cam.lookAt(eye.clone().add(lookDir(camAim[side])))
  } else {
    cam.fov = FOV_THIRD
    const pos = new THREE.Vector3(p.x * 0.6, 2.9 + p.y * 0.4, p.z - f * 5.3)
    const want = desiredAim(side, pos, { x: p.x * 0.3, y: 1.0, z: f * 3.4 }, 0.8)
    if (settings.look === 'manual') {
      // 3인칭 직접 조작: 내 캐릭터를 중심으로 카메라가 돌아감
      const rel = pos.clone().sub(new THREE.Vector3(p.x, 0, p.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), manualLook.yaw)
      pos.set(p.x + rel.x, rel.y, p.z + rel.z)
    }
    cam.position.lerp(pos, Math.min(1, dt * 6))
    turnToward(side, want, dt, settings.look === 'manual' ? 20 : want.tracking ? 4 : 1.5)
    cam.lookAt(cam.position.clone().add(lookDir(camAim[side])))
  }
  cam.updateProjectionMatrix()
}

function snapCameras() {
  for (const side of [0, 1] as Side[]) {
    const p = match.players[side]
    cams[side].position.set(p.x * 0.6, 2.9, p.z - p.facing * 5.3)
    camAim[side] = { yaw: fwdYaw(p.facing), pitch: -0.15 }
  }
  recenterLook()
}

// ---------- 직접 조작 시야 (PC 마우스 / 폰 기울이기) ----------

let gyroBase: { a: number; b: number; g: number } | null = null

function recenterLook() {
  manualLook.yaw = manualLook.pitch = 0
  gyroBase = null
}

// PC: 화면을 누르면 마우스 고정 → 마우스로 시야 (Esc로 해제)
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || settings.look !== 'manual') return
  manualLook.yaw = clamp(manualLook.yaw - e.movementX * 0.0028, -1.35, 1.35)
  manualLook.pitch = clamp(manualLook.pitch - e.movementY * 0.0028, -0.6, 1.1)
})
function lockMouse() {
  if (isTouch || settings.look !== 'manual' || document.pointerLockElement) return
  canvas.requestPointerLock?.()?.catch?.(() => {})
}

// 폰: 기울이기 (처음 각도를 정면으로)
const wrapDeg = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
addEventListener('deviceorientation', (e) => {
  if (!isTouch || settings.look !== 'manual' || e.alpha === null || e.beta === null || e.gamma === null) return
  if (!gyroBase) {
    gyroBase = { a: e.alpha, b: e.beta, g: e.gamma }
    return
  }
  const angle = screen.orientation?.angle ?? 0
  // 가로로 들었을 때: 좌우로 돌리면 alpha, 앞뒤로 기울이면 gamma
  const dYaw = wrapDeg(e.alpha - gyroBase.a)
  const dPitch = angle === 90 ? -(e.gamma - gyroBase.g) : angle === 270 ? e.gamma - gyroBase.g : e.beta - gyroBase.b
  manualLook.yaw = clamp((dYaw * Math.PI) / 180, -1.35, 1.35)
  manualLook.pitch = clamp((dPitch * Math.PI) / 180, -0.6, 1.1)
})

/** 아이폰은 기울기 센서 권한을 사용자 터치 때 요청해야 함 */
let gyroAsked = false
function askGyro() {
  if (gyroAsked || !isTouch || settings.look !== 'manual') return
  gyroAsked = true
  const DO = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
  DO?.requestPermission?.().catch(() => {})
}

// ---------- 소리 (짧은 잡음으로 만든 타격음) ----------

let audio: AudioContext | null = null
function sound(kind: 'hit' | 'smash' | 'point' | 'net') {
  if (!audio) return
  const t = audio.currentTime
  if (kind === 'point') {
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.setValueAtTime(660, t)
    o.frequency.setValueAtTime(880, t + 0.09)
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    o.connect(g).connect(audio.destination)
    o.start(t)
    o.stop(t + 0.3)
    return
  }
  const len = kind === 'smash' ? 0.12 : 0.06
  const buf = audio.createBuffer(1, audio.sampleRate * len, audio.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3
  const src = audio.createBufferSource()
  src.buffer = buf
  const filt = audio.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = kind === 'net' ? 400 : kind === 'smash' ? 1400 : 2400
  const g = audio.createGain()
  g.gain.value = kind === 'smash' ? 1.2 : 0.7
  src.connect(filt).connect(g).connect(audio.destination)
  src.start(t)
}

function wakeAudio() {
  audio ??= new AudioContext()
  void audio.resume()
}

// ---------- 전체 화면 (폰) ----------

const isTouch = matchMedia('(pointer: coarse)').matches
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
document.body.classList.toggle('is-touch', isTouch)
document.body.classList.toggle('is-ios', isIOS && !standalone)

function enterFullscreen() {
  if (!isTouch || document.fullscreenElement || !document.fullscreenEnabled) return
  document.documentElement
    .requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {})
}
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else if (document.fullscreenEnabled) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
  } else if (isIOS) alert('아이폰은 공유 버튼 → "홈 화면에 추가"로 열면 전체 화면으로 할 수 있어요.')
}
// 게임 중 화면을 처음 만지면 전체 화면 + 소리 켜기 (온라인 참가자는 시작 버튼을 누르지 않으므로)
addEventListener('pointerdown', (e) => {
  if (!document.body.classList.contains('playing')) return
  wakeAudio()
  enterFullscreen()
  askGyro()
  if (e.target === canvas) lockMouse()
})
if (!document.fullscreenEnabled) $('#btn-full').style.display = isIOS ? '' : 'none'

// ---------- 화면 표시 ----------

const SHOT_TEXT: Record<string, string> = { smash: 'SMASH!', drop: '드롭', drive: '드라이브', serveShort: '숏서브', serveLong: '롱서브' }

function toast(text: string, color = '#fff', side: Side | null = null) {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = text
  el.style.color = color
  const split = document.body.classList.contains('is-split')
  el.style.left = split && side !== null ? (side === 0 ? '25%' : '75%') : '50%'
  $('#toasts').append(el)
  setTimeout(() => el.remove(), 1000)
}

function nameOf(side: Side) {
  if (settings.mode === 'cpu') return side === 1 ? '컴퓨터' : '나'
  if (isOnline()) return side === me ? '나' : '상대'
  return `P${side + 1}`
}
const colorOf = (side: Side) => lookFor(side).shirt

function handleEvents() {
  for (const e of match.events) {
    if (e.kind === 'hit') {
      sound(e.shot === 'smash' ? 'smash' : 'hit')
      const t = SHOT_TEXT[e.shot ?? '']
      if (t) toast(t, e.shot === 'smash' ? '#ffd23f' : '#fff', e.side ?? null)
    } else if (e.kind === 'net') {
      sound('net')
    } else if (e.kind === 'point' && e.side !== undefined) {
      sound('point')
      toast(`${nameOf(e.side)} 득점! ${e.text ?? ''}`, colorOf(e.side))
    }
  }
  match.events.length = 0
}

function updateHud() {
  $('#s0').textContent = String(match.players[0].score)
  $('#s1').textContent = String(match.players[1].score)
  const hint = $('#hint')
  if (match.phase === 'serve') {
    const server = match.server
    const p = match.players[server]
    const mine = settings.mode === 'duo' || server === me
    if (mine && p.serveCharge >= 0) {
      // 누르는 동안 게이지: 다 차면 롱서브
      const k = Math.min(1, p.serveCharge / LONG_SERVE_HOLD)
      const filled = Math.round(k * 5)
      hint.textContent = `${'■'.repeat(filled)}${'□'.repeat(5 - filled)} ${k >= 1 ? '롱서브!' : '숏서브'}`
    } else if (mine) {
      hint.textContent = `${nameOf(server)} 서브 · 탁=숏 꾹=롱`
    } else hint.textContent = `${nameOf(server)} 서브`
  } else if (match.players.some((p) => p.score === WIN_SCORE - 1) && match.phase !== 'over') {
    hint.textContent = '매치 포인트!'
  } else hint.textContent = `${WIN_SCORE}점 먼저!`
}

// ---------- 조작 ----------

/** 화면 기준 입력 → 선수 기준 조작 (중계 시점은 카메라가 코트 끝에 고정이라 변환) */
function toPlayer(side: Side, raw: { mx: number; my: number; jump: boolean; swing: boolean }): Controls {
  const p = match.players[side]
  if (settings.view !== 'tv') return { mx: raw.mx, mz: raw.my, jump: raw.jump, swing: raw.swing }
  const fc = match.players[tvSide()].facing // 카메라가 바라보는 z 방향
  const wx = -fc * raw.mx
  const wz = fc * raw.my
  return { mx: wx * -p.facing, mz: wz * p.facing, jump: raw.jump, swing: raw.swing }
}

const localControls = (side: Side, solo: boolean, pad: Side) => toPlayer(side, merge(readKeyboard(side, solo), readTouch(pad)))

// 방장 쪽: 참가자가 보낸 조작 (짧은 터치도 놓치지 않게 다음 프레임까지 기억)
const guestIn = {
  c: noControls(),
  pos: null as null | { x: number; z: number; y: number; vx: number; vz: number },
  tapSwing: false,
  tapJump: false,
}

function readControls(): [Controls, Controls] {
  if (settings.mode === 'cpu') return [localControls(0, true, 0), noControls()]
  if (settings.mode === 'duo') return [localControls(0, false, 0), localControls(1, false, 1)]
  if (online.role === 'guest') return [noControls(), localControls(1, true, 0)]
  const g = { ...guestIn.c, swing: guestIn.c.swing || guestIn.tapSwing, jump: guestIn.c.jump || guestIn.tapJump }
  guestIn.tapSwing = guestIn.tapJump = false
  return [localControls(0, true, 0), g]
}

// ---------- 온라인 메시지 ----------

function faceToData(c: HTMLCanvasElement | null) {
  if (!c) return null
  const small = document.createElement('canvas')
  small.width = small.height = 128
  small.getContext('2d')!.drawImage(c, 0, 0, 128, 128)
  return small.toDataURL('image/jpeg', 0.82)
}

function dataToFace(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      c.getContext('2d')!.drawImage(img, 0, 0, 256, 256)
      resolve(c)
    }
    img.onerror = reject
    img.src = url
  })
}

function sendHello() {
  online.send({ t: 'hello', look: settings.looks[0], face: faceToData(faces[0]), auto: settings.auto[0] })
}

let lastSnap = 0
const pendingEvents: GameEvent[] = []
const r2 = (n: number) => Math.round(n * 1000) / 1000

function sendSnapshot(now: number) {
  if (now - lastSnap < 33) return
  lastSnap = now
  const s = match.shuttle
  online.send({
    t: 's',
    pl: match.players.map((p) => [r2(p.x), r2(p.z), r2(p.y), r2(p.vx), r2(p.vz), r2(p.swing), p.swingOver ? 1 : 0, p.score]),
    sh: [r2(s.p.x), r2(s.p.y), r2(s.p.z), r2(s.v.x), r2(s.v.y), r2(s.v.z), s.heldBy ?? -1, s.inPlay ? 1 : 0, s.lastHitter ?? -1],
    ph: match.phase,
    sv: match.server,
    wn: match.winner,
    ev: pendingEvents.splice(0),
  })
}

// 참가자 쪽: 상대(방장) 선수를 부드럽게 따라가게 할 목표 위치
const oppTarget = { x: 0, z: 0, y: 0 }

function applySnapshot(msg: any) {
  const [p0, p1] = match.players
  const [x, z, y, vx, vz, sw, over, score] = msg.pl[0]
  Object.assign(oppTarget, { x, z, y })
  Object.assign(p0, { vx, vz, swing: sw, swingOver: !!over, score })
  const mine = msg.pl[1]
  p1.score = mine[7]
  const phase = msg.ph as Match['phase']
  // 서브 준비·득점 중에는 방장이 정한 위치로 맞춤
  if (phase === 'serve' || phase === 'point') Object.assign(p1, { x: mine[0], z: mine[1], y: mine[2] })
  if (phase === 'serve' && match.phase !== 'serve') {
    Object.assign(p0, { x, z, y })
    // 새 서브 준비: 내 스윙·서브 게이지 초기화 (방장 쪽 setupServe와 맞춤)
    Object.assign(p1, { swing: 0, swingHit: false, serveCharge: -1, serveKind: null })
  }
  const s = match.shuttle
  const [sx, sy, sz, svx, svy, svz, held, inPlay, last] = msg.sh
  s.p = { x: sx, y: sy, z: sz }
  s.v = { x: svx, y: svy, z: svz }
  s.heldBy = held < 0 ? null : held
  s.inPlay = !!inPlay
  s.lastHitter = last < 0 ? null : last
  match.phase = phase
  match.server = msg.sv
  match.winner = msg.wn
  for (const e of msg.ev as GameEvent[]) match.events.push(e)
}

online.onMessage = async (msg) => {
  switch (msg.t) {
    case 'hello':
      remote.look = msg.look
      remote.auto = !!msg.auto
      remote.face = msg.face ? await dataToFace(msg.face).catch(() => null) : null
      match.players[online.role === 'host' ? 1 : 0].autoSwing = remote.auto
      syncMenu()
      if (document.body.classList.contains('playing')) buildCharacters()
      break
    case 'start':
      if (online.role === 'guest') beginMatch()
      break
    case 'menu':
      if (document.body.classList.contains('playing') || !$('#over').classList.contains('hidden')) {
        openMenu(false)
        toast('상대가 메뉴로 나갔어요')
      }
      break
    case 'in':
      guestIn.c = msg.c
      guestIn.pos = msg.p
      if (msg.c.swing) guestIn.tapSwing = true
      if (msg.c.jump) guestIn.tapJump = true
      break
    case 's':
      if (online.role === 'guest' && match.phase !== 'menu') applySnapshot(msg)
      break
  }
}

online.onStatus = (status, text) => {
  const el = $('#on-status')
  el.textContent = text
  el.className = `on-status ${status === 'connected' ? 'ok' : status === 'error' || status === 'closed' ? 'err' : ''}`
  if (status === 'connected') sendHello()
  if ((status === 'closed' || status === 'error') && match.phase !== 'menu') {
    openMenu(false)
    toast('연결이 끊겼어요', '#ffd23f')
  }
  if (status === 'closed' || status === 'error') remote.look = remote.face = null
  syncMenu()
}

// ---------- 메뉴 ----------

function drawFace(cv: HTMLCanvasElement, face: HTMLCanvasElement | null, gender: Gender) {
  const g = cv.getContext('2d')!
  g.clearRect(0, 0, 96, 96)
  if (face) g.drawImage(face, 0, 0, 96, 96)
  else {
    g.fillStyle = '#ffd6b5'
    g.fillRect(0, 0, 96, 96)
    g.font = '52px system-ui'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(gender === 'f' ? '👧' : '👦', 48, 52)
  }
}

function syncMenu() {
  document.body.classList.toggle('mode-online', isOnline())
  for (const seg of document.querySelectorAll<HTMLElement>('.seg[data-setting]')) {
    const key = seg.dataset.setting as 'mode' | 'view' | 'look'
    for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.value === settings[key])
  }
  for (const card of document.querySelectorAll<HTMLElement>('.pcard')) {
    const i = Number(card.dataset.player) as Side
    const cpu = settings.mode === 'cpu' && i === 1
    card.classList.toggle('cpu-card', cpu)
    $('.pname', card).textContent = cpu ? '🤖 컴퓨터' : i === 0 && settings.mode !== 'duo' ? '나' : `P${i + 1}`
    for (const b of card.querySelectorAll<HTMLButtonElement>('[data-look="gender"] button'))
      b.classList.toggle('on', b.dataset.value === settings.looks[i].gender)
    for (const b of card.querySelectorAll<HTMLButtonElement>('[data-look="shirt"] button'))
      b.classList.toggle('on', b.dataset.value === settings.looks[i].shirt)
    $<HTMLInputElement>('[data-look="auto"]', card).checked = settings.auto[i]
    drawFace($<HTMLCanvasElement>('canvas.face', card), faces[i], settings.looks[i].gender)
  }

  // 온라인 패널
  const panel = $('#online')
  panel.classList.toggle('in-room', online.role !== null)
  panel.classList.toggle('hosting', online.role === 'host')
  panel.classList.toggle('connected', online.connected)
  if (online.connected) {
    drawFace($<HTMLCanvasElement>('#on-opp-face'), remote.face, remote.look?.gender ?? 'm')
    $('#on-opp-text').textContent = remote.look ? '상대가 준비됐어요!' : '상대 정보를 받는 중…'
  }
  $('#privacy').textContent = isOnline()
    ? '얼굴 사진은 연결된 상대 폰에만 직접 전달돼요. 서버에 저장되지 않아요.'
    : '얼굴 사진은 이 기기 안에서만 쓰여요. 어디에도 올라가지 않아요.'

  const start = $<HTMLButtonElement>('#start')
  if (isOnline()) {
    start.disabled = !(online.role === 'host' && online.connected)
    start.textContent =
      online.role === 'guest' && online.connected
        ? '방장이 시작하면 바로 시작돼요'
        : online.connected
          ? '시작하기'
          : '방을 만들거나 참가하세요'
  } else {
    start.disabled = false
    start.textContent = '시작하기'
  }

  const split = settings.mode === 'duo' && settings.view !== 'tv'
  $('#view-note').textContent =
    settings.view === 'tv'
      ? '코트 뒤 높은 곳에서 보는 TV 중계 화면이에요.'
      : split
        ? '한 화면 둘이서는 화면이 좌우 반반으로 나뉘어요.'
        : settings.view === 'first'
          ? '내 눈높이에서 봐요. 셔틀 그림자를 보고 위치를 잡으세요!'
          : '내 캐릭터 뒤에서 봐요.'
  $('#look-note').textContent =
    settings.view === 'tv'
      ? ''
      : settings.look === 'auto'
        ? '고개가 셔틀을 알아서 따라가요.'
        : isTouch
          ? '폰을 기울이면 시야가 돌아가요. 🎯 버튼으로 정면 맞추기'
          : '게임 화면을 클릭하면 마우스로 시야를 돌려요 (Esc로 해제, C로 정면)'
  document.body.classList.toggle('view-tv', settings.view === 'tv')
  $('#keys-body').innerHTML =
    settings.mode !== 'duo'
      ? `<table><tr><td>이동</td><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 또는 방향키</td></tr>
         <tr><td>점프</td><td><kbd>Space</kbd></td></tr>
         <tr><td>스윙</td><td><kbd>F</kbd> · <kbd>J</kbd> · 마우스 클릭</td></tr>
         <tr><td>샷</td><td>스윙할 때 앞(W) 누르면 드라이브, 뒤(S)면 드롭, 점프하며 치면 스매시</td></tr>
         <tr><td>시점</td><td><kbd>V</kbd> · 메뉴 <kbd>Esc</kbd></td></tr></table>`
      : `<table><tr><th></th><th>P1</th><th>P2</th></tr>
         <tr><td>이동</td><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>방향키</td></tr>
         <tr><td>점프</td><td><kbd>Space</kbd></td><td>오른쪽 <kbd>Shift</kbd></td></tr>
         <tr><td>스윙</td><td><kbd>F</kbd></td><td><kbd>Enter</kbd></td></tr>
         <tr><td>샷</td><td colspan="2">스윙할 때 앞 → 드라이브, 뒤 → 드롭, 점프하며 → 스매시</td></tr></table>`
}

async function setFacePhoto(i: Side, file: Blob) {
  try {
    faces[i] = await photoToFace(file)
  } catch {
    alert('이 사진은 쓸 수 없어요. 다른 사진을 골라주세요.')
  }
  syncMenu()
  if (i === 0 && online.connected) sendHello()
}

let pasteTarget: Side = 0
function selectPasteTarget(i: Side) {
  if (settings.mode !== 'duo' && i === 1) return
  pasteTarget = i
  for (const c of document.querySelectorAll<HTMLElement>('.pcard')) c.classList.toggle('paste-target', Number(c.dataset.player) === i)
}

// 이미지 복사 후 Ctrl+V → 선택된 카드의 얼굴로
addEventListener('paste', (e) => {
  if ($('#menu').classList.contains('hidden')) return
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'))
  const file = item?.getAsFile()
  if (file) {
    e.preventDefault()
    void setFacePhoto(settings.mode === 'duo' ? pasteTarget : 0, file)
  }
})

async function showRoom(code: string) {
  const link = joinLink(code)
  $('#on-room-code').textContent = code
  await QRCode.toCanvas($<HTMLCanvasElement>('#on-qr'), link, { width: 132, margin: 1 })
}

function bindMenu() {
  for (const seg of document.querySelectorAll<HTMLElement>('.seg[data-setting]')) {
    seg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button')
      if (!b) return
      ;(settings as unknown as Record<string, string>)[seg.dataset.setting!] = b.dataset.value!
      saveSettings()
      syncMenu()
    })
  }
  for (const card of document.querySelectorAll<HTMLElement>('.pcard')) {
    const i = Number(card.dataset.player) as Side
    const lookChanged = () => {
      saveSettings()
      syncMenu()
      if (i === 0 && online.connected) sendHello()
    }
    const sw = $('[data-look="shirt"]', card)
    sw.innerHTML = SHIRTS.map((c) => `<button type="button" data-value="${c}" style="background:${c}" aria-label="옷 색"></button>`).join('')
    sw.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button')
      if (!b) return
      settings.looks[i].shirt = b.dataset.value!
      lookChanged()
    })
    $('[data-look="gender"]', card).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button')
      if (!b) return
      settings.looks[i].gender = b.dataset.value as Gender
      lookChanged()
    })
    $<HTMLInputElement>('[data-look="auto"]', card).addEventListener('change', (e) => {
      settings.auto[i] = (e.target as HTMLInputElement).checked
      lookChanged()
    })
    $<HTMLInputElement>('input[type=file]', card).addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) void setFacePhoto(i, file)
    })
    // 카드를 누르면 붙여넣기(Ctrl+V) 대상이 됨
    card.addEventListener('pointerdown', () => selectPasteTarget(i))
    // 사진 파일이나 브라우저 이미지를 카드에 끌어다 놓기
    card.addEventListener('dragover', (e) => {
      e.preventDefault()
      card.classList.add('drop')
    })
    card.addEventListener('dragleave', () => card.classList.remove('drop'))
    card.addEventListener('drop', (e) => {
      e.preventDefault()
      card.classList.remove('drop')
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) void setFacePhoto(i, file)
    })
    $('.reset-face', card).addEventListener('click', () => {
      faces[i] = null
      $<HTMLInputElement>('input[type=file]', card).value = ''
      syncMenu()
      if (i === 0 && online.connected) sendHello()
    })
  }

  // 온라인
  $('#on-host').addEventListener('click', async () => {
    syncMenu()
    try {
      await showRoom(await online.host())
    } catch {
      /* 상태 표시는 onStatus에서 */
    }
    syncMenu()
  })
  const join = () => {
    const code = $<HTMLInputElement>('#on-code').value.trim()
    if (code.length < 4) {
      $('#on-status').textContent = '방 코드 5자리를 입력하세요'
      return
    }
    online.join(code)
    syncMenu()
  }
  $('#on-join').addEventListener('click', join)
  $('#on-code').addEventListener('keydown', (e) => e.key === 'Enter' && join())
  $('#on-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(joinLink(online.code)).catch(() => {})
    $('#on-copy').textContent = '복사됨 ✓'
    setTimeout(() => ($('#on-copy').textContent = '링크 복사'), 1500)
  })
  $('#on-share').addEventListener('click', () => {
    navigator
      .share?.({ title: '배드민턴 같이 해요 🏸', text: `방 코드 ${online.code}`, url: joinLink(online.code) })
      .catch(() => {})
  })
  if (!('share' in navigator)) $('#on-share').style.display = 'none'
  $('#on-leave').addEventListener('click', () => {
    online.close()
    remote.look = remote.face = null
    $('#on-status').textContent = ''
    syncMenu()
  })

  $('#start').addEventListener('click', startGame)
  $('#again').addEventListener('click', startGame)
  $('#to-menu').addEventListener('click', () => openMenu())
  $('#btn-menu').addEventListener('click', () => openMenu())
  $('#btn-view').addEventListener('click', cycleView)
  $('#btn-full').addEventListener('click', toggleFullscreen)
  $('#btn-center').addEventListener('click', () => {
    recenterLook()
    toast('정면')
  })
}

function applyLayout() {
  const split = settings.mode === 'duo' && settings.view !== 'tv'
  document.body.classList.toggle('is-split', split)
  document.body.classList.toggle('duo', settings.mode === 'duo')
  document.body.classList.toggle('solo', settings.mode !== 'duo')
  document.body.classList.toggle('vs-cpu', settings.mode !== 'duo')
  $('#view-label').textContent = VIEW_NAME[settings.view]
  document.body.classList.toggle('look-manual', settings.look === 'manual' && settings.view !== 'tv')
  document.body.classList.toggle('view-tv', settings.view === 'tv')
  if (settings.look !== 'manual' && document.pointerLockElement) document.exitPointerLock()
  $('#n0').textContent = nameOf(0)
  $('#n1').textContent = nameOf(1)
  placeTv()
}

/** 시작 버튼 (온라인이면 방장만) */
function startGame() {
  if (isOnline()) {
    if (online.role !== 'host' || !online.connected) return
    online.send({ t: 'start' })
  }
  beginMatch()
}

function beginMatch() {
  wakeAudio()
  enterFullscreen()
  me = isOnline() && online.role === 'guest' ? 1 : 0
  buildCharacters()
  if (isOnline()) {
    const host = online.role === 'host'
    startMatch(match, {
      cpu: [false, false],
      auto: host ? [settings.auto[0], remote.auto] : [remote.auto, settings.auto[0]],
      remote: !host,
      external: host ? [false, true] : [true, false],
    })
    guestIn.pos = null
  } else {
    startMatch(match, { cpu: [false, settings.mode === 'cpu'], auto: settings.auto })
  }
  Object.assign(oppTarget, { x: match.players[0].x, z: match.players[0].z, y: 0 })
  snapCameras()
  applyLayout()
  $('#menu').classList.add('hidden')
  $('#over').classList.add('hidden')
  document.body.classList.add('playing')
  ;(document.activeElement as HTMLElement | null)?.blur()
}

function openMenu(notify = true) {
  if (notify && isOnline()) online.send({ t: 'menu' })
  match.phase = 'menu'
  document.body.classList.remove('playing')
  $('#over').classList.add('hidden')
  $('#menu').classList.remove('hidden')
  syncMenu()
}

function cycleView() {
  const order: View[] = ['third', 'first', 'tv']
  settings.view = order[(order.indexOf(settings.view) + 1) % order.length]
  saveSettings()
  applyLayout()
  toast(VIEW_NAME[settings.view])
}

function showOver() {
  if (match.winner === null) return
  const w = match.winner
  let title: string
  if (settings.mode === 'duo') title = `${nameOf(w)} 승리! 🎉`
  else title = w === me ? '이겼다! 🎉' : settings.mode === 'cpu' ? '컴퓨터 승리… 😵' : '졌다… 😵'
  $('#over-title').textContent = title
  $('#over-title').style.color = colorOf(w)
  $('#over-score').textContent = `${match.players[me].score} : ${match.players[me === 0 ? 1 : 0].score}`
  const guest = isOnline() && online.role === 'guest'
  $('#again').style.display = guest ? 'none' : ''
  $('#over').classList.remove('hidden')
  document.body.classList.remove('playing')
}

bindMenu()
selectPasteTarget(0)

// ?join=코드 로 들어오면 온라인 모드로 바로 참가
const params = new URLSearchParams(location.search)
const joinCode = params.get('join')
if (joinCode) {
  settings.mode = 'online'
  $<HTMLInputElement>('#on-code').value = joinCode.toUpperCase()
  online.join(joinCode)
  history.replaceState(null, '', location.pathname)
}
syncMenu()

bindKeyboard((code) => {
  if (code === 'KeyV' && document.body.classList.contains('playing')) cycleView()
  if (code === 'KeyC' && document.body.classList.contains('playing')) recenterLook()
  if (code === 'Escape') {
    if (document.body.classList.contains('playing')) openMenu()
    else if (!$('#menu').classList.contains('hidden') && !isOnline()) startGame()
  }
})
bindMouseSwing(canvas)
bindTouchPads($('#pads'))

// ?demo: 컴퓨터끼리 (테스트·녹화용), ?view=first 등으로 시점 지정
if (params.has('demo')) {
  if (params.get('view')) settings.view = params.get('view') as View
  settings.mode = 'duo'
  startGame()
  match.players.forEach((p) => (p.isCpu = true))
  $('#n0').textContent = 'CPU'
  $('#n1').textContent = 'CPU'
}

// ---------- 루프 ----------

const DT = 1 / 120
let acc = 0
let last = performance.now()
let prevPhase = match.phase

function render() {
  const w = innerWidth
  const h = innerHeight
  const size = renderer.getSize(new THREE.Vector2())
  if (size.x !== w || size.y !== h) renderer.setSize(w, h, false)

  const split = document.body.classList.contains('is-split')
  const view = settings.view
  const passes: { cam: THREE.PerspectiveCamera; x: number; w: number; side: Side | null }[] = []
  if (view === 'tv' || match.phase === 'menu') {
    passes.push({ cam: tvCam, x: 0, w, side: null })
  } else if (split) {
    passes.push({ cam: cams[0], x: 0, w: w / 2, side: 0 }, { cam: cams[1], x: w / 2, w: w / 2, side: 1 })
  } else {
    passes.push({ cam: cams[me], x: 0, w, side: me })
  }

  renderer.setScissorTest(passes.length > 1)
  for (const pass of passes) {
    pass.cam.aspect = pass.w / h
    // 중계 화면이 좁으면 코트가 다 보이게 화각을 넓힘
    if (pass.cam === tvCam) tvCam.fov = Math.min(75, 46 * Math.max(1, (16 / 9) / (pass.w / h)) ** 0.8)
    pass.cam.updateProjectionMatrix()
    if (chars) for (const [i, c] of chars.entries()) c.setFirstPerson(view === 'first' && pass.side === i)
    renderer.setViewport(pass.x, 0, pass.w, h)
    renderer.setScissor(pass.x, 0, pass.w, h)
    renderer.render(scene, pass.cam)
  }
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  acc += dt
  // 짧게 눌렀다 뗀 키도 이번 프레임 입력에는 들어감 (스윙은 누르는 순간에만 시작되므로 한 번만 휘두름)
  const controls = readControls()
  clearTaps()

  const playingOnline = isOnline() && online.connected && match.phase !== 'menu'
  // 방장: 참가자 위치는 참가자가 보낸 값 사용 (서브 준비·득점 중에는 방장이 정한 위치)
  if (playingOnline && online.role === 'host' && guestIn.pos && match.phase !== 'serve' && match.phase !== 'point') {
    Object.assign(match.players[1], guestIn.pos)
  }

  while (acc >= DT) {
    step(match, DT, controls)
    acc -= DT
  }

  if (playingOnline && online.role === 'host') {
    pendingEvents.push(...match.events)
    sendSnapshot(now)
  }
  if (playingOnline && online.role === 'guest') {
    // 내 조작과 위치를 방장에게
    const p = match.players[1]
    online.send({ t: 'in', c: controls[1], p: { x: r2(p.x), z: r2(p.z), y: r2(p.y), vx: r2(p.vx), vz: r2(p.vz) } })
    // 상대 선수는 받은 위치로 부드럽게
    const o = match.players[0]
    const k = Math.min(1, dt * 14)
    o.x += (oppTarget.x - o.x) * k
    o.z += (oppTarget.z - o.z) * k
    o.y += (oppTarget.y - o.y) * k
  }
  handleEvents()

  if (chars) for (const [i, c] of chars.entries()) c.update(match.players[i], dt, SWING_TIME)
  const s = match.shuttle
  shuttle.update(s.p, s.v, s.heldBy === null)
  if (match.phase !== 'menu') {
    for (const side of [0, 1] as Side[]) updateCamera(side, dt, settings.view)
  } else {
    // 메뉴 뒤 배경: 천천히 도는 카메라
    const a = now / 9000
    tvCam.position.set(Math.cos(a) * 12, 5.5, Math.sin(a) * 12)
    tvCam.lookAt(0, 0.8, 0)
  }
  if (match.phase === 'over' && prevPhase !== 'over') showOver()
  if (match.phase !== 'menu' && prevPhase === 'menu') placeTv()
  prevPhase = match.phase
  updateHud()
  render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// 개발 중 디버깅용
if (import.meta.env.DEV)
  Object.assign(window, { __match: match, __settings: settings, __cams: cams, __tv: tvCam, __online: online, __look: manualLook })
