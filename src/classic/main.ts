import './style.css'
import { aiControls, newGame, startMatch, step, WIN_SCORE, type Controls } from './game'
import { bindKeyboard, bindTouchButtons, controls } from './input'
import { COLORS, render } from './render'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const $ = (id: string) => document.getElementById(id)!

const game = newGame()
if (import.meta.env.DEV) Object.assign(window, { __game: game })
bindKeyboard()
bindTouchButtons($('touch'))

// 터치 기기면 화면 버튼 표시
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('is-touch')

let cw = 0
let ch = 0
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  cw = innerWidth
  ch = innerHeight
  canvas.width = Math.round(cw * dpr)
  canvas.height = Math.round(ch * dpr)
  canvas.style.width = `${cw}px`
  canvas.style.height = `${ch}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
addEventListener('resize', resize)
resize()

// 모드: 둘이서 / 컴퓨터랑 (?demo 는 컴퓨터끼리 — 테스트·녹화용)
type Mode = 'duo' | 'cpu' | 'demo'
let mode: Mode = new URLSearchParams(location.search).has('demo') ? 'demo' : 'duo'

function start(m: Mode = mode) {
  mode = m
  document.body.classList.toggle('vs-cpu', mode !== 'duo')
  $('n1').textContent = mode === 'demo' ? 'CPU' : 'P1'
  $('n2').textContent = mode === 'duo' ? 'P2' : 'CPU'
  startMatch(game)
  $('overlay').classList.add('hidden')
  ;(document.activeElement as HTMLElement | null)?.blur()
}
$('start').addEventListener('click', () => start('duo'))
$('start-cpu').addEventListener('click', () => start('cpu'))
addEventListener('keydown', (e) => {
  if ((game.phase === 'title' || game.phase === 'over') && e.code === 'Enter') start()
})
if (mode === 'demo') start('demo')

function currentControls(): [Controls, Controls] {
  return [
    mode === 'demo' ? aiControls(game, 0) : controls[0],
    mode === 'duo' ? controls[1] : aiControls(game, 1),
  ]
}

function showOver() {
  const w = game.winner!
  const name = (w === 0 ? $('n1') : $('n2')).textContent
  $('title').textContent = mode === 'cpu' ? (w === 0 ? '이겼다! 🎉' : '컴퓨터 승리… 😵') : `${name} 승리! 🎉`
  $('title').style.color = COLORS[w].main
  $('subtitle').textContent = `${game.players[0].score} : ${game.players[1].score}`
  $('howto').style.display = 'none'
  ;(document.querySelector('.tips') as HTMLElement).style.display = 'none'
  $('start').textContent = '둘이서 다시'
  $('start-cpu').textContent = '컴퓨터랑 다시'
  $('overlay').classList.remove('hidden')
}

function updateHud() {
  $('s0').textContent = String(game.players[0].score)
  $('s1').textContent = String(game.players[1].score)
  const hint = $('hint')
  const nameOf = (side: 0 | 1) => (side === 0 ? $('n1') : $('n2')).textContent
  if (game.phase === 'serve') {
    const keys = document.body.classList.contains('is-touch') ? '스윙' : game.server === 0 ? 'S' : '↓'
    const human = mode === 'duo' || (mode === 'cpu' && game.server === 0)
    hint.textContent = human ? `${nameOf(game.server)} 서브 (${keys})` : `${nameOf(game.server)} 서브`
  } else if (game.phase === 'point' && game.lastPoint) {
    const match = game.players.some((p) => p.score === WIN_SCORE - 1)
    hint.textContent = `${nameOf(game.lastPoint.side)} 득점!${match ? ' · 매치 포인트' : ''}`
  } else {
    hint.textContent = `${WIN_SCORE}점 먼저!`
  }
}

// 물리는 1/120초 고정 간격으로, 그리기는 화면 주사율대로
const DT = 1 / 120
let acc = 0
let last = performance.now()
let prevPhase = game.phase
function frame(now: number) {
  acc += Math.min(0.1, (now - last) / 1000)
  last = now
  while (acc >= DT) {
    step(game, DT, currentControls())
    acc -= DT
  }
  if (game.phase === 'over' && prevPhase !== 'over') showOver()
  prevPhase = game.phase
  updateHud()
  render(ctx, game, cw, ch)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
