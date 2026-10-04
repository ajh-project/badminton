// 개발용 확인: 테스트 얼굴 사진을 P2에 넣고 메뉴 카드와 3D 얼굴 클로즈업을 캡처
// 사용법: npm run dev 실행 중에 node scripts/check-face.mjs
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:5175/'
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(URL)
await page.waitForTimeout(1200)

// 테스트용 "사진": 하늘색 배경, 갈색 머리, 선글라스, 웃는 입
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas')
  c.width = 400
  c.height = 500
  const g = c.getContext('2d')
  g.fillStyle = '#7ab8e8'
  g.fillRect(0, 0, 400, 500)
  g.fillStyle = '#3a2618'
  g.beginPath()
  g.ellipse(200, 190, 135, 150, 0, 0, 7)
  g.fill()
  g.fillStyle = '#f2c09a'
  g.beginPath()
  g.ellipse(200, 230, 115, 140, 0, 0, 7)
  g.fill()
  g.fillStyle = '#111'
  g.fillRect(105, 190, 80, 40)
  g.fillRect(215, 190, 80, 40)
  g.fillRect(185, 200, 30, 8)
  g.strokeStyle = '#a33'
  g.lineWidth = 10
  g.beginPath()
  g.arc(200, 290, 45, 0.2, Math.PI - 0.2)
  g.stroke()
  return c.toDataURL('image/png')
})
const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')

await page.click('.seg[data-setting="mode"] button[data-value="duo"]')
await page.setInputFiles('.pcard[data-player="1"] input[type=file]', { name: 'me.png', mimeType: 'image/png', buffer })
await page.waitForTimeout(500)
await page.locator('.players').screenshot({ path: 'shot-cards.png' })

await page.click('.seg[data-setting="view"] button[data-value="tv"]')
await page.click('#start')
await page.waitForTimeout(800)
// 경기를 멈추고(over) 중계 카메라를 P2 얼굴 앞으로
await page.evaluate(() => {
  const m = window.__match
  m.phase = 'over'
})
await page.waitForTimeout(100)
await page.evaluate(() => {
  document.querySelector('#over').classList.add('hidden')
  const p = window.__match.players[1]
  window.__tv.position.set(p.x + 0.45, 1.72, p.z - 1.15)
  window.__tv.lookAt(p.x, 1.62, p.z)
})
await page.waitForTimeout(200)
await page.screenshot({ path: 'shot-face.png' })
console.log('errors:', JSON.stringify(errs))
await b.close()
