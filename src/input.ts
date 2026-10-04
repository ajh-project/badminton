// 키보드 + 터치 버튼 입력 → 선수별 조작 상태

import type { Controls } from './game'

export const controls: [Controls, Controls] = [
  { left: false, right: false, jump: false, swing: false },
  { left: false, right: false, jump: false, swing: false },
]

type Action = keyof Controls

const KEYS: Record<string, [0 | 1, Action]> = {
  KeyA: [0, 'left'],
  KeyD: [0, 'right'],
  KeyW: [0, 'jump'],
  KeyS: [0, 'swing'],
  Space: [0, 'swing'],
  ArrowLeft: [1, 'left'],
  ArrowRight: [1, 'right'],
  ArrowUp: [1, 'jump'],
  ArrowDown: [1, 'swing'],
  Enter: [1, 'swing'],
}

export function bindKeyboard() {
  const set = (e: KeyboardEvent, on: boolean) => {
    const k = KEYS[e.code]
    if (!k) return
    e.preventDefault()
    controls[k[0]][k[1]] = on
  }
  addEventListener('keydown', (e) => set(e, true))
  addEventListener('keyup', (e) => set(e, false))
  addEventListener('blur', () => {
    for (const c of controls) c.left = c.right = c.jump = c.swing = false
  })
}

/** data-player="0|1" data-action="left|right|jump|swing" 버튼들 (여러 손가락 동시 입력 지원) */
export function bindTouchButtons(root: HTMLElement) {
  for (const btn of root.querySelectorAll<HTMLElement>('[data-action]')) {
    const side = Number(btn.dataset.player) as 0 | 1
    const action = btn.dataset.action as Action
    const on = (e: PointerEvent) => {
      e.preventDefault()
      btn.setPointerCapture(e.pointerId)
      controls[side][action] = true
      btn.classList.add('down')
    }
    const off = () => {
      controls[side][action] = false
      btn.classList.remove('down')
    }
    btn.addEventListener('pointerdown', on)
    btn.addEventListener('pointerup', off)
    btn.addEventListener('pointercancel', off)
    btn.addEventListener('lostpointercapture', off)
    btn.addEventListener('contextmenu', (e) => e.preventDefault())
  }
}
