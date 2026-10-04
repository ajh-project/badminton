// 개발용 확인: 키보드로 이동·스윙이 되는지 + 폰 가로 화면(터치 버튼) 캡처
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:5175/'
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errs = []

// 1) PC 키보드
{
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(URL)
  await page.click('.seg[data-setting="mode"] button[data-value="cpu"]')
  await page.click('.seg[data-setting="view"] button[data-value="third"]')
  await page.click('#start')
  await page.waitForTimeout(400)
  // 서브 (F를 아주 짧게) → 랠리 시작
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(600)
  const phase = await page.evaluate(() => window.__match.phase)
  const before = await page.evaluate(() => ({ ...window.__match.players[0] }))
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyD')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(300)
  await page.keyboard.up('KeyW')
  const after = await page.evaluate(() => ({ ...window.__match.players[0] }))
  await page.keyboard.down('Space')
  await page.waitForTimeout(80)
  const jumpY = await page.evaluate(() => window.__match.players[0].y)
  await page.keyboard.up('Space')
  console.log('Space → jump height', jumpY.toFixed(2))
  await page.keyboard.press('KeyV')
  await page.waitForTimeout(200)
  const view = await page.evaluate(() => window.__settings.view)
  console.log('serve → phase', phase)
  console.log(`move D: x ${before.x.toFixed(2)} → ${after.x.toFixed(2)} (오른쪽 = -x 여야 함), W: z ${before.z.toFixed(2)} → ${after.z.toFixed(2)} (네트 쪽 = +z)`)
  console.log('V →', view)
  await page.close()
}

// 2) 폰 가로 화면
{
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(URL)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'shot-phone-menu.png' })
  await page.tap('.seg[data-setting="mode"] button[data-value="duo"]')
  await page.tap('.seg[data-setting="view"] button[data-value="third"]')
  await page.tap('#start')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'shot-phone-duo.png' })
  await ctx.close()
}
console.log('errors:', JSON.stringify(errs))
await b.close()
