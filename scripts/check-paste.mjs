// 개발용 확인: 이미지 붙여넣기(Ctrl+V)와 끌어다 놓기로 얼굴이 들어가는지
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:5175/'
const b = await chromium.launch({ channel: 'msedge' })
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(URL)
await page.waitForTimeout(800)
await page.click('.seg[data-setting="mode"] button[data-value="duo"]')

const result = await page.evaluate(async () => {
  const makeImage = async (color) => {
    const c = document.createElement('canvas')
    c.width = c.height = 200
    const g = c.getContext('2d')
    g.fillStyle = color
    g.fillRect(0, 0, 200, 200)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    return new File([blob], 'face.png', { type: 'image/png' })
  }
  const centerColor = (sel) => {
    const g = document.querySelector(sel).getContext('2d')
    return [...g.getImageData(48, 48, 1, 1).data.slice(0, 3)].join(',')
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  // 1) P1 카드는 기본 대상 → 붙여넣기
  const dt1 = new DataTransfer()
  dt1.items.add(await makeImage('#00ff00'))
  dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt1 }))
  await wait(400)
  const p1 = centerColor('.pcard[data-player="0"] canvas.face')

  // 2) P2 카드에 끌어다 놓기
  const dt2 = new DataTransfer()
  dt2.items.add(await makeImage('#0000ff'))
  document.querySelector('.pcard[data-player="1"]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt2, bubbles: true, cancelable: true }))
  await wait(400)
  const p2 = centerColor('.pcard[data-player="1"] canvas.face')
  return { p1, p2 }
})
console.log('P1 after paste (green expected):', result.p1, '| P2 after drop (blue expected):', result.p2, '| errors:', JSON.stringify(errs))
await b.close()
