// 개발용 확인: 폰 가로 화면에서 점수판·버튼 배치 캡처 (컴퓨터랑 / 한 화면 둘이서)
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:5175/'
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errs = []
for (const mode of ['cpu', 'duo']) {
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.tap(`.seg[data-setting="mode"] button[data-value="${mode}"]`)
  await page.tap('.seg[data-setting="view"] button[data-value="third"]')
  await page.tap('#start')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `shot-hud-${mode}.png` })
  await ctx.close()
}
console.log('errors:', JSON.stringify(errs))
await b.close()
