// 입력: 키보드(한 대로 둘이서) + 터치 조이스틱/버튼. 결과는 "화면 기준" 조작값

export interface RawControls {
  mx: number // 화면 오른쪽 +
  my: number // 화면 위(앞) +
  jump: boolean
  swing: boolean
}

const blank = (): RawControls => ({ mx: 0, my: 0, jump: false, swing: false })

const down = new Set<string>()
/** 한 프레임보다 짧게 눌렀다 뗀 키도 놓치지 않도록, 다음 프레임에 읽을 때까지 기억 */
const tapped = new Set<string>()
let mouseSwing = false
let mouseTapped = false
const touch: [RawControls, RawControls] = [blank(), blank()]

export function bindKeyboard(onKey: (code: string) => void) {
  addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (/^(Arrow|Space|Enter)/.test(e.code) || e.code === 'Space') e.preventDefault()
    down.add(e.code)
    tapped.add(e.code)
    onKey(e.code)
  })
  addEventListener('keyup', (e) => down.delete(e.code))
  addEventListener('blur', () => down.clear())
}

export function bindMouseSwing(el: HTMLElement) {
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') mouseSwing = mouseTapped = true
  })
  addEventListener('pointerup', () => (mouseSwing = false))
}

/** 매 프레임 입력을 읽은 뒤 호출 */
export function clearTaps() {
  tapped.clear()
  mouseTapped = false
  for (const t of touchTapped) t.swing = t.jump = false
}

const k = (...codes: string[]) => codes.some((c) => down.has(c) || tapped.has(c))
const axis = (neg: boolean, pos: boolean) => (pos ? 1 : 0) - (neg ? 1 : 0)

/** solo: 혼자 할 때는 WASD·방향키 둘 다. 점프는 Space, 스윙은 F/J/Enter/클릭 */
export function readKeyboard(side: 0 | 1, solo: boolean): RawControls {
  if (solo) {
    return {
      mx: axis(k('KeyA', 'ArrowLeft'), k('KeyD', 'ArrowRight')),
      my: axis(k('KeyS', 'ArrowDown'), k('KeyW', 'ArrowUp')),
      swing: k('KeyF', 'KeyJ', 'Enter') || mouseSwing || mouseTapped,
      jump: k('Space', 'KeyG', 'ShiftLeft', 'ShiftRight', 'KeyK'),
    }
  }
  if (side === 0) {
    return {
      mx: axis(k('KeyA'), k('KeyD')),
      my: axis(k('KeyS'), k('KeyW')),
      swing: k('KeyF'),
      jump: k('Space', 'KeyG'),
    }
  }
  return {
    mx: axis(k('ArrowLeft'), k('ArrowRight')),
    my: axis(k('ArrowDown'), k('ArrowUp')),
    swing: k('Enter', 'Numpad0', 'Slash'),
    jump: k('ShiftRight', 'Numpad1', 'Period'),
  }
}

const touchTapped = [
  { swing: false, jump: false },
  { swing: false, jump: false },
]

export function readTouch(side: 0 | 1): RawControls {
  const t = touch[side]
  const tt = touchTapped[side]
  return { ...t, swing: t.swing || tt.swing, jump: t.jump || tt.jump }
}

/** 터치 패드: [data-pad="0|1"] 안에 .stick(조이스틱), [data-btn="swing|jump"] */
export function bindTouchPads(root: HTMLElement) {
  for (const pad of root.querySelectorAll<HTMLElement>('[data-pad]')) {
    const side = Number(pad.dataset.pad) as 0 | 1
    const t = touch[side]
    const stick = pad.querySelector<HTMLElement>('.stick')!
    const knob = stick.querySelector<HTMLElement>('.knob')!
    let id: number | null = null
    let ox = 0
    let oy = 0
    const R = 46
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      id = e.pointerId
      stick.setPointerCapture(id)
      const r = stick.getBoundingClientRect()
      ox = r.left + r.width / 2
      oy = r.top + r.height / 2
      move(e)
    })
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      let dx = e.clientX - ox
      let dy = e.clientY - oy
      const d = Math.hypot(dx, dy)
      if (d > R) {
        dx = (dx / d) * R
        dy = (dy / d) * R
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`
      t.mx = dx / R
      t.my = -dy / R
    }
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = null
      t.mx = t.my = 0
      knob.style.transform = ''
    }
    stick.addEventListener('pointermove', move)
    stick.addEventListener('pointerup', end)
    stick.addEventListener('pointercancel', end)

    for (const btn of pad.querySelectorAll<HTMLElement>('[data-btn]')) {
      const key = btn.dataset.btn as 'swing' | 'jump'
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        btn.setPointerCapture(e.pointerId)
        t[key] = true
        touchTapped[side][key] = true
        btn.classList.add('down')
      })
      const off = () => {
        t[key] = false
        btn.classList.remove('down')
      }
      btn.addEventListener('pointerup', off)
      btn.addEventListener('pointercancel', off)
      btn.addEventListener('lostpointercapture', off)
    }
  }
}

export function merge(a: RawControls, b: RawControls): RawControls {
  return {
    mx: Math.abs(a.mx) > Math.abs(b.mx) ? a.mx : b.mx,
    my: Math.abs(a.my) > Math.abs(b.my) ? a.my : b.my,
    jump: a.jump || b.jump,
    swing: a.swing || b.swing,
  }
}
