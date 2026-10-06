// 개발용 확인: 메뉴(경기 방식·난이도) 캡처 + 경기 중 점수판(게임 수)·심판 콜 화면 캡처
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:5175/'
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await page.click('.seg[data-setting="mode"] button[data-value="cpu"]')
await page.click('.seg[data-setting="format"] button[data-value="match"]')
await page.click('.seg[data-setting="level"] button[data-value="pro"]')
await page.locator('#menu .card').screenshot({ path: 'shot-rules-menu.png' })

await page.click('#start')
await page.waitForTimeout(1200)
await page.screenshot({ path: 'shot-rules-start.png' })

// 1게임을 이긴 상태 + 20:19 로 만들어서 점수판·안내 확인
const hud = await page.evaluate(async () => {
  const m = window.__match
  m.games = [1, 0]
  m.gameNo = 2
  m.gameScores = [[21, 17]]
  m.players[0].score = 20
  m.players[1].score = 19
  await new Promise((r) => setTimeout(r, 300))
  return document.querySelector('.hud').innerText.replace(/\n/g, ' | ')
})
console.log('HUD:', hud)
await page.screenshot({ path: 'shot-rules-hud.png' })
console.log('errors:', JSON.stringify(errs))
await b.close()
