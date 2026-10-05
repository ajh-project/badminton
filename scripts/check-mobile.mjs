// 개발용 확인: 갤럭시 가로 화면(780×360, 3배)에서 화면 크기 맞춤·셔틀 보이는지·1/3인칭 캡처
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:5175/'
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errs = []
for (const view of ['third', 'first']) {
  const ctx = await b.newContext({
    viewport: { width: 780, height: 360 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(`${URL}?demo&view=${view}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__match && window.__match.phase === 'rally', null, { timeout: 30000 })
  // 셔틀이 P1 쪽으로 높이 날아오는 순간을 기다렸다가 캡처
  await page.waitForFunction(
    () => {
      const s = window.__match.shuttle
      return s.inPlay && s.p.z < 0 && s.p.y > 2.5 && s.v.z < 0
    },
    null,
    { timeout: 30000 },
  ).catch(() => {})
  const info = await page.evaluate(() => {
    const c = document.querySelector('#c')
    const cam = window.__cams[0]
    const s = window.__match.shuttle.p
    const v = new cam.position.constructor(s.x, s.y, s.z).project(cam)
    return {
      canvas: `${c.clientWidth}x${c.clientHeight}`,
      screen: `${innerWidth}x${innerHeight}`,
      shuttleOnScreen: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1,
      shuttleY: s.y.toFixed(1),
    }
  })
  console.log(view, JSON.stringify(info))
  await page.screenshot({ path: `shot-mobile-${view}.png` })
  await ctx.close()
}
console.log('errors:', JSON.stringify(errs))
await b.close()
