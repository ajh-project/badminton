// 앱 아이콘 PNG 만들기 (홈 화면에 추가용): 하늘색 그라데이션 + 코트 + 셔틀콕
import { chromium } from 'playwright-core'

const html = (size) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;position:relative;overflow:hidden;
  background:linear-gradient(160deg,#7cc8ff 0%,#3d9bff 55%,#2f7fd1 100%)">
  <div style="position:absolute;left:0;right:0;bottom:0;height:34%;background:#3f9e6a"></div>
  <div style="position:absolute;left:12%;right:12%;bottom:16%;height:3%;background:#fff;border-radius:2px"></div>
  <div style="position:absolute;left:49%;width:2%;bottom:16%;height:30%;background:#e8ecf2"></div>
  <div style="position:absolute;left:0;right:0;top:12%;text-align:center;font-size:${size * 0.5}px;line-height:1">🏸</div>
</div></body></html>`

const b = await chromium.launch({ channel: 'msedge' })
for (const size of [180, 192, 512]) {
  const page = await b.newPage({ viewport: { width: size, height: size } })
  await page.setContent(html(size))
  await page.screenshot({ path: `public/icon-${size}.png` })
  await page.close()
}
await b.close()
console.log('icons done')
