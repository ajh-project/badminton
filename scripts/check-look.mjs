// 개발용 확인: 1인칭 시야가 셔틀을 얼마나 화면 안에 담는지 (자동 추적) + 직접 조작 시야 회전
import { chromium } from 'playwright-core'

const URL = process.argv[2] ?? 'http://localhost:5175/'
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 640, height: 360 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`${URL}?demo&view=first`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__match && window.__match.phase !== 'menu', null, { timeout: 30000 })

// 자동 추적: P1 앞쪽에 셔틀이 있을 때 화면 안에 보이는 비율
const stats = await page.evaluate(async () => {
  const m = window.__match
  const cam = window.__cams[0]
  let ahead = 0
  let seen = 0
  let shots = 0
  const t0 = performance.now()
  while (performance.now() - t0 < 20000) {
    await new Promise((r) => setTimeout(r, 50))
    const s = m.shuttle
    const p = m.players[0]
    if (!s.inPlay || (s.p.z - p.z) * p.facing < 0.6) continue
    ahead++
    const v = new cam.position.constructor(s.p.x, s.p.y, s.p.z).project(cam)
    if (Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1) seen++
    if (Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1 && s.p.y > 3) shots++
  }
  return { ahead, seen, highSeen: shots }
})
console.log(`auto-track: shuttle in front ${stats.ahead} samples, on screen ${stats.seen} (${((100 * stats.seen) / Math.max(1, stats.ahead)).toFixed(0)}%), high balls (>3m) seen ${stats.highSeen}`)
await page.screenshot({ path: 'shot-look-auto.png' })

// 직접 조작: 시야를 오른쪽으로 0.8rad 돌리면 카메라가 따라 도는지
const turn = await page.evaluate(async () => {
  window.__settings.look = 'manual'
  const cam = window.__cams[0]
  const dir = () => {
    const d = new cam.position.constructor()
    cam.getWorldDirection(d)
    return Math.atan2(d.x, d.z)
  }
  window.__look.yaw = 0
  window.__look.pitch = 0
  await new Promise((r) => setTimeout(r, 1500))
  const before = dir()
  window.__look.yaw = -0.8 // 오른쪽 (P1 기준 오른쪽 = -x)
  await new Promise((r) => setTimeout(r, 1500))
  const after = dir()
  return { before, after }
})
console.log(`manual: yaw ${turn.before.toFixed(2)} → ${turn.after.toFixed(2)} (≈ -0.8 기대)`)
await page.screenshot({ path: 'shot-look-manual.png' })
console.log('errors:', JSON.stringify(errs))
await b.close()
