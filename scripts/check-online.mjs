// 개발용 확인: 브라우저 2개로 온라인 대전 (방 만들기 → 코드로 참가 → 동기화)
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:5175/'
// 두 창이 동시에 돌아가야 하므로 백그라운드 창 속도 제한을 끔
const b = await chromium.launch({
  channel: 'msedge',
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
  ],
})
const errs = []
const open = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(`${name}: ${e.message}`))
  return page
}
const host = await open('host')
const guest = await open('guest')

// 방장: 온라인 → 방 만들기
await host.goto(URL, { waitUntil: 'domcontentloaded' })
await host.click('.seg[data-setting="mode"] button[data-value="online"]')
await host.click('#on-host')
await host.waitForFunction(() => /^[A-Z0-9]{5}$/.test(document.querySelector('#on-room-code').textContent), null, { timeout: 20000 })
const code = await host.textContent('#on-room-code')
console.log('room code:', code)
await host.screenshot({ path: 'shot-online-host-room.png' })

// 참가자: 링크로 들어옴 (?join=코드)
await guest.goto(`${URL}?join=${code}`, { waitUntil: 'domcontentloaded' })
try {
  await host.waitForFunction(() => document.querySelector('#online').classList.contains('connected'), null, { timeout: 25000 })
  await guest.waitForFunction(() => document.querySelector('#online').classList.contains('connected'), null, { timeout: 25000 })
} catch (e) {
  const st = (p) => p.evaluate(() => ({ status: document.querySelector('#on-status')?.textContent, cls: document.querySelector('#online')?.className, ready: document.readyState, net: window.__online?.status }))
  console.log('CONNECT FAILED host:', JSON.stringify(await st(host)), 'guest:', JSON.stringify(await st(guest)), 'errors:', JSON.stringify(errs))
  await b.close()
  process.exit(1)
}
await host.waitForTimeout(800)
console.log('host status:', await host.textContent('#on-status'), '| start:', await host.textContent('#start'))
console.log('guest status:', await guest.textContent('#on-status'), '| start:', await guest.textContent('#start'))

// 방장이 시작
await host.click('#start')
await guest.waitForFunction(() => document.body.classList.contains('playing'), null, { timeout: 5000 })
console.log('guest started:', true)

// 각 창의 게임 시간이 1초에 얼마나 흐르는지 (백그라운드 창이 느려지는지 확인)
const rate = async (p) => {
  const a = await p.evaluate(() => window.__match.time)
  await p.waitForTimeout(1000)
  return (await p.evaluate(() => window.__match.time)) - a
}
console.log('game-time per 1s → host', (await rate(host)).toFixed(2), 'guest', (await rate(guest)).toFixed(2))
await host.bringToFront()
console.log('after host bringToFront → host', (await rate(host)).toFixed(2), 'guest', (await rate(guest)).toFixed(2))

// 방장 서브 (F)
await host.keyboard.down('KeyF')
await host.waitForTimeout(120)
await host.keyboard.up('KeyF')
await host.waitForTimeout(400)
console.log('after serve → host phase', await host.evaluate(() => window.__match.phase), '/ guest phase', await guest.evaluate(() => window.__match.phase))

// 참가자가 오른쪽(D)으로 이동 → 방장 화면에서도 움직였는지
const before = await host.evaluate(() => window.__match.players[1].x)
await guest.keyboard.down('KeyD')
await guest.waitForTimeout(300)
console.log(
  'guest during D:',
  JSON.stringify(await guest.evaluate(() => ({ phase: window.__match.phase, ext: window.__match.external, remote: window.__match.remote, vx: window.__match.players[1].vx }))),
)
await guest.waitForTimeout(300)
await guest.keyboard.up('KeyD')
await guest.waitForTimeout(300)
const after = await host.evaluate(() => window.__match.players[1].x)
const guestOwn = await guest.evaluate(() => window.__match.players[1].x)
console.log(`guest moved: host sees x ${before.toFixed(2)} → ${after.toFixed(2)}, guest local x ${guestOwn.toFixed(2)}`)

// 몇 초 진행 후 양쪽 상태 비교
await host.waitForTimeout(6000)
const hs = await host.evaluate(() => ({ score: window.__match.players.map((p) => p.score), phase: window.__match.phase, s: window.__match.shuttle.p }))
const gs = await guest.evaluate(() => ({ score: window.__match.players.map((p) => p.score), phase: window.__match.phase, s: window.__match.shuttle.p }))
console.log('host :', JSON.stringify(hs))
console.log('guest:', JSON.stringify(gs))
await host.screenshot({ path: 'shot-online-host.png' })
await guest.screenshot({ path: 'shot-online-guest.png' })

// 참가자가 메뉴로 나가면 방장도 메뉴로
await guest.click('#btn-menu')
await host.waitForTimeout(800)
console.log('host back to menu:', await host.evaluate(() => !document.querySelector('#menu').classList.contains('hidden')))
console.log('errors:', JSON.stringify(errs))
await b.close()
