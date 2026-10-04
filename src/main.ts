import './style.css'
import * as THREE from 'three'
import { Character, photoToFace, type Gender, type Look } from './character'
import { bindKeyboard, bindMouseSwing, bindTouchPads, clearTaps, merge, readKeyboard, readTouch } from './input'
import { WIN_SCORE, newMatch, noControls, startMatch, step, type Controls, type Match, type Side } from './match'
import { ShuttleView, buildWorld } from './world'

type Mode = 'cpu' | 'duo'
type View = 'third' | 'first' | 'tv'

const SHIRTS = ['#ff6b5e', '#3d9bff', '#ffb020', '#2fbf71', '#a26bff', '#ff5fa2', '#2b2f3a']
const VIEW_NAME: Record<View, string> = { third: '3인칭', first: '1인칭', tv: '중계' }
const SWING_TIME = 0.32

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!

// ---------- 설정 (사진 말고는 이 기기에 기억) ----------

interface Settings {
  mode: Mode
  view: View
  looks: [Omit<Look, 'face'>, Omit<Look, 'face'>]
  auto: [boolean, boolean]
}

const DEFAULTS: Settings = {
  mode: 'cpu',
  view: 'third',
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
tvCam.position.set(0, 7.2, -14.5)
tvCam.lookAt(0, 0, 0.8)

let chars: [Character, Character] | null = null
const match: Match = newMatch()

function buildCharacters() {
  if (chars) for (const c of chars) scene.remove(c.root)
  chars = [0, 1].map((i) => new Character({ ...settings.looks[i], face: faces[i] })) as [Character, Character]
  for (const c of chars) scene.add(c.root)
}
buildCharacters()

// ---------- 카메라 ----------

const lookTargets = [new THREE.Vector3(), new THREE.Vector3()]

function updateCamera(side: Side, dt: number, view: View) {
  const cam = cams[side]
  const p = match.players[side]
  const f = p.facing
  const s = match.shuttle.p
  const pos = new THREE.Vector3()
  const look = new THREE.Vector3()

  if (view === 'first') {
    cam.fov = 74
    pos.set(p.x, p.y + 1.66, p.z + f * 0.14)
    // 기본은 상대 코트를 보고, 앞쪽에 있는 셔틀을 고개로 따라감
    look.set(p.x * 0.4, 1.5, f * 6)
    const ahead = (s.z - p.z) * f
    if (ahead > 0.6) {
      const w = Math.min(0.75, ahead / 3)
      look.lerp(new THREE.Vector3(s.x, Math.max(0.6, s.y), s.z), w)
    }
  } else {
    cam.fov = 58
    pos.set(p.x * 0.65, 2.5 + p.y * 0.4, p.z - f * 4.6)
    look.set(p.x * 0.3, 1.1, f * 3.2)
  }
  cam.updateProjectionMatrix()
  const k = Math.min(1, dt * (view === 'first' ? 18 : 6))
  cam.position.lerp(pos, k)
  lookTargets[side].lerp(look, Math.min(1, dt * (view === 'first' ? 7 : 6)))
  cam.lookAt(lookTargets[side])
}

function snapCameras() {
  for (const side of [0, 1] as Side[]) {
    const p = match.players[side]
    cams[side].position.set(p.x * 0.65, 2.5, p.z - p.facing * 4.6)
    lookTargets[side].set(0, 1.1, p.facing * 3.2)
  }
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

// ---------- 화면 표시 ----------

const SHOT_TEXT: Record<string, string> = { smash: 'SMASH!', drop: '드롭', drive: '드라이브' }

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

const nameOf = (side: Side) => (settings.mode === 'cpu' && side === 1 ? '컴퓨터' : `P${side + 1}`)
const colorOf = (side: Side) => settings.looks[side].shirt

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
    const human = !match.players[match.server].isCpu
    const auto = settings.auto[match.server]
    hint.textContent = `${nameOf(match.server)} 서브${human && !auto ? ' (스윙)' : ''}`
  } else if (match.players.some((p) => p.score === WIN_SCORE - 1) && match.phase !== 'over') {
    hint.textContent = '매치 포인트!'
  } else hint.textContent = `${WIN_SCORE}점 먼저!`
}

// ---------- 조작 ----------

/** 화면 기준 입력 → 선수 기준 조작 (중계 시점은 화면 방향이 코트 방향과 다름) */
function toPlayer(side: Side, raw: { mx: number; my: number; jump: boolean; swing: boolean }): Controls {
  const p = match.players[side]
  if (settings.view !== 'tv') return { mx: raw.mx, mz: raw.my, jump: raw.jump, swing: raw.swing }
  // 중계 카메라는 P1 쪽 끝(-z)에서 +z를 봄: 화면 오른쪽 = -x, 화면 위 = +z
  const wx = -raw.mx
  const wz = raw.my
  return { mx: wx * -p.facing, mz: wz * p.facing, jump: raw.jump, swing: raw.swing }
}

function readControls(): [Controls, Controls] {
  const solo = settings.mode === 'cpu'
  return [0, 1].map((i) => {
    const side = i as Side
    if (solo && side === 1) return noControls()
    return toPlayer(side, merge(readKeyboard(side, solo), readTouch(side)))
  }) as [Controls, Controls]
}

// ---------- 메뉴 ----------

const isTouch = matchMedia('(pointer: coarse)').matches
document.body.classList.toggle('is-touch', isTouch)

function drawFacePreview(i: number) {
  const cv = $<HTMLCanvasElement>(`.pcard[data-player="${i}"] canvas.face`)
  const g = cv.getContext('2d')!
  g.clearRect(0, 0, 96, 96)
  if (faces[i]) g.drawImage(faces[i]!, 0, 0, 96, 96)
  else {
    // 기본 얼굴 미리보기
    g.fillStyle = '#ffd6b5'
    g.fillRect(0, 0, 96, 96)
    g.font = '52px system-ui'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(settings.looks[i].gender === 'f' ? '👧' : '👦', 48, 52)
  }
}

function syncMenu() {
  for (const seg of document.querySelectorAll<HTMLElement>('.seg[data-setting]')) {
    const key = seg.dataset.setting as 'mode' | 'view'
    for (const b of seg.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.value === settings[key])
  }
  for (const card of document.querySelectorAll<HTMLElement>('.pcard')) {
    const i = Number(card.dataset.player) as Side
    const cpu = settings.mode === 'cpu' && i === 1
    card.classList.toggle('cpu-card', cpu)
    $('.pname', card).textContent = cpu ? '🤖 컴퓨터' : i === 0 && settings.mode === 'cpu' ? '나' : `P${i + 1}`
    for (const b of card.querySelectorAll<HTMLButtonElement>('[data-look="gender"] button'))
      b.classList.toggle('on', b.dataset.value === settings.looks[i].gender)
    for (const b of card.querySelectorAll<HTMLButtonElement>('[data-look="shirt"] button'))
      b.classList.toggle('on', b.dataset.value === settings.looks[i].shirt)
    $<HTMLInputElement>('[data-look="auto"]', card).checked = settings.auto[i]
    drawFacePreview(i)
  }
  const split = settings.mode === 'duo' && settings.view !== 'tv'
  $('#view-note').textContent =
    settings.view === 'tv'
      ? '코트 뒤 높은 곳에서 보는 TV 중계 화면이에요.'
      : split
        ? '둘이서 할 때는 화면이 좌우 반반으로 나뉘어요.'
        : settings.view === 'first'
          ? '내 눈높이에서 봐요. 셔틀 그림자를 보고 위치를 잡으세요!'
          : '내 캐릭터 뒤에서 봐요.'
  $('#keys-body').innerHTML =
    settings.mode === 'cpu'
      ? `<table><tr><td>이동</td><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 또는 방향키</td></tr>
         <tr><td>스윙</td><td><kbd>Space</kbd> · <kbd>F</kbd> · 마우스 클릭</td></tr>
         <tr><td>점프</td><td><kbd>G</kbd> · <kbd>Shift</kbd></td></tr>
         <tr><td>샷</td><td>스윙할 때 앞(W) 누르면 드라이브, 뒤(S)면 드롭, 점프하며 치면 스매시</td></tr>
         <tr><td>시점</td><td><kbd>V</kbd> · 메뉴 <kbd>Esc</kbd></td></tr></table>`
      : `<table><tr><th></th><th>P1</th><th>P2</th></tr>
         <tr><td>이동</td><td><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></td><td>방향키</td></tr>
         <tr><td>스윙</td><td><kbd>F</kbd></td><td><kbd>Enter</kbd></td></tr>
         <tr><td>점프</td><td><kbd>G</kbd></td><td>오른쪽 <kbd>Shift</kbd></td></tr>
         <tr><td>샷</td><td colspan="2">스윙할 때 앞 → 드라이브, 뒤 → 드롭, 점프하며 → 스매시</td></tr></table>`
}

async function setFacePhoto(i: Side, file: Blob) {
  try {
    faces[i] = await photoToFace(file)
  } catch {
    alert('이 사진은 쓸 수 없어요. 다른 사진을 골라주세요.')
  }
  syncMenu()
}

let pasteTarget: Side = 0
function selectPasteTarget(i: Side) {
  if (settings.mode === 'cpu' && i === 1) return
  pasteTarget = i
  for (const c of document.querySelectorAll<HTMLElement>('.pcard')) c.classList.toggle('paste-target', Number(c.dataset.player) === i)
}

// 이미지 복사 후 Ctrl+V → 선택된 카드의 얼굴로
addEventListener('paste', (e) => {
  if ($('#menu').classList.contains('hidden')) return
  const item = [...(e.clipboardData?.items ?? [])].find((it) => it.type.startsWith('image/'))
  const file = item?.getAsFile()
  if (file) {
    e.preventDefault()
    void setFacePhoto(settings.mode === 'cpu' ? 0 : pasteTarget, file)
  }
})

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
    const sw = $('[data-look="shirt"]', card)
    sw.innerHTML = SHIRTS.map((c) => `<button type="button" data-value="${c}" style="background:${c}" aria-label="옷 색"></button>`).join('')
    sw.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button')
      if (!b) return
      settings.looks[i].shirt = b.dataset.value!
      saveSettings()
      syncMenu()
    })
    $('[data-look="gender"]', card).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button')
      if (!b) return
      settings.looks[i].gender = b.dataset.value as Gender
      saveSettings()
      syncMenu()
    })
    $<HTMLInputElement>('[data-look="auto"]', card).addEventListener('change', (e) => {
      settings.auto[i] = (e.target as HTMLInputElement).checked
      saveSettings()
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
    })
  }
  $('#start').addEventListener('click', startGame)
  $('#again').addEventListener('click', startGame)
  $('#to-menu').addEventListener('click', openMenu)
  $('#btn-menu').addEventListener('click', openMenu)
  $('#btn-view').addEventListener('click', cycleView)
}

function applyLayout() {
  const split = settings.mode === 'duo' && settings.view !== 'tv'
  document.body.classList.toggle('is-split', split)
  document.body.classList.toggle('solo', settings.mode === 'cpu' || !split)
  document.body.classList.toggle('duo', settings.mode === 'duo' && split)
  document.body.classList.toggle('vs-cpu', settings.mode === 'cpu')
  $('#view-label').textContent = VIEW_NAME[settings.view]
  $('#n0').textContent = nameOf(0)
  $('#n1').textContent = nameOf(1)
  // 둘이서 중계 시점이면 터치 패드도 좌우로
  if (settings.mode === 'duo' && !split) {
    document.body.classList.remove('solo')
    document.body.classList.add('duo')
  }
}

function startGame() {
  audio ??= new AudioContext()
  void audio.resume()
  buildCharacters()
  startMatch(match, { cpu: [false, settings.mode === 'cpu'], auto: settings.auto })
  snapCameras()
  applyLayout()
  $('#menu').classList.add('hidden')
  $('#over').classList.add('hidden')
  document.body.classList.add('playing')
  ;(document.activeElement as HTMLElement | null)?.blur()
}

function openMenu() {
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
  const cpuWon = settings.mode === 'cpu' && w === 1
  $('#over-title').textContent = settings.mode === 'cpu' ? (cpuWon ? '컴퓨터 승리… 😵' : '이겼다! 🎉') : `${nameOf(w)} 승리! 🎉`
  $('#over-title').style.color = colorOf(w)
  $('#over-score').textContent = `${match.players[0].score} : ${match.players[1].score}`
  $('#over').classList.remove('hidden')
  document.body.classList.remove('playing')
}

bindMenu()
selectPasteTarget(0)
syncMenu()
bindKeyboard((code) => {
  if (code === 'KeyV' && document.body.classList.contains('playing')) cycleView()
  if (code === 'Escape') {
    if (document.body.classList.contains('playing')) openMenu()
    else if (!$('#menu').classList.contains('hidden')) startGame()
  }
})
bindMouseSwing(canvas)
bindTouchPads($('#pads'))

// ?demo: 컴퓨터끼리 (테스트·녹화용), ?view=first 등으로 시점 지정
const params = new URLSearchParams(location.search)
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
    passes.push({ cam: match.phase === 'menu' ? tvCam : tvCam, x: 0, w, side: null })
  } else if (split) {
    passes.push({ cam: cams[0], x: 0, w: w / 2, side: 0 }, { cam: cams[1], x: w / 2, w: w / 2, side: 1 })
  } else {
    passes.push({ cam: cams[0], x: 0, w, side: 0 })
  }

  renderer.setScissorTest(passes.length > 1)
  for (const pass of passes) {
    pass.cam.aspect = pass.w / h
    // 중계 화면이 좁으면 코트가 다 보이게 화각을 넓힘
    if (pass.cam === tvCam) tvCam.fov = Math.min(75, 46 * Math.max(1, (16 / 9) / (pass.w / h)) ** 0.8)
    pass.cam.updateProjectionMatrix()
    if (chars) for (const [i, c] of chars.entries()) c.setHeadVisible(!(view === 'first' && pass.side === i))
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
  while (acc >= DT) {
    step(match, DT, controls)
    acc -= DT
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
  if (match.phase !== 'menu' && prevPhase === 'menu') {
    tvCam.position.set(0, 7.2, -14.5)
    tvCam.lookAt(0, 0, 0.8)
  }
  prevPhase = match.phase
  updateHud()
  render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// 개발 중 디버깅용
if (import.meta.env.DEV) Object.assign(window, { __match: match, __settings: settings, __cams: cams, __tv: tvCam })
