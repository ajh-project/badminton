// 배포 사이트 확인: 오류 없이 열리고, 시작하면 경기가 진행되는지
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'https://ajh-project.github.io/badminton/'
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
await page.goto(URL + '?demo&view=third')
await page.waitForTimeout(12000)
const hud = await page.evaluate(() => [document.querySelector('#s0').textContent, document.querySelector('#s1').textContent, document.querySelector('#hint').textContent])
await page.screenshot({ path: 'shot-live.png' })
const classic = await b.newPage()
await classic.goto(URL + 'classic.html')
await classic.waitForTimeout(1000)
const classicTitle = await classic.title()
console.log('score after 12s demo:', hud.join(' | '), '| classic:', classicTitle, '| errors:', JSON.stringify(errs))
await b.close()
