// 캔버스 그리기: 하늘 → 코트 → 네트 → 선수 → 셔틀콕 → 효과

import { COURT_L, COURT_R, GROUND, H, HEAD_R, NET_TOP, NET_X, W, racketPose, type Game, type Player } from './game'

export const COLORS = [
  { main: '#ff7a6b', dark: '#d9534a', name: 'P1' },
  { main: '#4aa8ff', dark: '#2f7fd1', name: 'P2' },
]

const SKIN = '#ffd9b8'

export function render(ctx: CanvasRenderingContext2D, g: Game, cw: number, ch: number) {
  // 화면 전체 하늘
  const sky = ctx.createLinearGradient(0, 0, 0, ch)
  sky.addColorStop(0, '#8fd3ff')
  sky.addColorStop(0.65, '#d8f1ff')
  sky.addColorStop(1, '#fff4e0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, cw, ch)

  // 세계 좌표(1600×900)를 화면에 맞춤, 바닥은 화면 끝까지 이어지게
  const scale = Math.min(cw / W, ch / H)
  const ox = (cw - W * scale) / 2
  const oy = (ch - H * scale) / 2
  ctx.save()
  const shake = g.shake > 0 ? g.shake * 40 : 0
  ctx.translate(ox + (Math.random() - 0.5) * shake, oy + (Math.random() - 0.5) * shake)
  ctx.scale(scale, scale)

  drawBackdrop(ctx, g, ox / scale, oy / scale)
  drawCourt(ctx, ox / scale, oy / scale)
  for (const p of g.players) drawShadow(ctx, p.x, 70)
  if (g.shuttle.heldBy === null) drawShadow(ctx, g.shuttle.x, 18)
  drawNet(ctx)
  for (const p of g.players) drawPlayer(ctx, p, g)
  drawShuttle(ctx, g)
  drawFx(ctx, g)

  ctx.restore()
}

function drawBackdrop(ctx: CanvasRenderingContext2D, g: Game, padX: number, padY: number) {
  // 해
  ctx.fillStyle = 'rgba(255, 236, 160, 0.9)'
  ctx.beginPath()
  ctx.arc(1360, 140, 60, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 236, 160, 0.25)'
  ctx.beginPath()
  ctx.arc(1360, 140, 100, 0, Math.PI * 2)
  ctx.fill()

  // 구름 (천천히 흘러감)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  const clouds = [
    [180, 150, 1],
    [620, 90, 0.8],
    [1000, 200, 1.2],
    [1500, 110, 0.9],
  ]
  for (const [x, y, s] of clouds) {
    const cx = ((x + g.time * 12 * s + padX) % (W + 2 * padX + 300)) - padX - 150
    cloud(ctx, cx, y, s)
  }

  // 먼 언덕
  ctx.fillStyle = '#a8dca0'
  ctx.beginPath()
  ctx.moveTo(-padX, GROUND - 120)
  ctx.quadraticCurveTo(300, GROUND - 260, 700, GROUND - 140)
  ctx.quadraticCurveTo(1100, GROUND - 40, 1400, GROUND - 180)
  ctx.quadraticCurveTo(1600, GROUND - 250, W + padX, GROUND - 140)
  ctx.lineTo(W + padX, GROUND)
  ctx.lineTo(-padX, GROUND)
  ctx.fill()
  void padY
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath()
  ctx.arc(x, y, 34 * s, 0, Math.PI * 2)
  ctx.arc(x + 38 * s, y - 16 * s, 42 * s, 0, Math.PI * 2)
  ctx.arc(x + 82 * s, y, 32 * s, 0, Math.PI * 2)
  ctx.rect(x, y, 82 * s, 32 * s)
  ctx.fill()
}

function drawCourt(ctx: CanvasRenderingContext2D, padX: number, padY: number) {
  // 바닥 (화면 아래 끝까지)
  const floor = ctx.createLinearGradient(0, GROUND, 0, H + padY)
  floor.addColorStop(0, '#4fb36b')
  floor.addColorStop(1, '#3a9356')
  ctx.fillStyle = floor
  ctx.fillRect(-padX, GROUND, W + padX * 2, H - GROUND + padY)

  // 코트 (원근감 있게 살짝 사다리꼴)
  ctx.fillStyle = '#5cc27a'
  ctx.beginPath()
  ctx.moveTo(COURT_L, GROUND + 4)
  ctx.lineTo(COURT_R, GROUND + 4)
  ctx.lineTo(COURT_R + 30, GROUND + 70)
  ctx.lineTo(COURT_L - 30, GROUND + 70)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 5
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(NET_X, GROUND + 4)
  ctx.lineTo(NET_X, GROUND + 70)
  ctx.stroke()
}

function drawNet(ctx: CanvasRenderingContext2D) {
  // 기둥
  ctx.fillStyle = '#e9edf2'
  ctx.fillRect(NET_X - 5, NET_TOP - 12, 10, GROUND - NET_TOP + 40)
  // 그물
  ctx.save()
  ctx.beginPath()
  ctx.rect(NET_X - 14, NET_TOP, 28, GROUND - NET_TOP - 60)
  ctx.clip()
  ctx.fillStyle = 'rgba(30, 40, 60, 0.15)'
  ctx.fillRect(NET_X - 14, NET_TOP, 28, GROUND - NET_TOP)
  ctx.strokeStyle = 'rgba(40, 50, 70, 0.55)'
  ctx.lineWidth = 1.5
  for (let y = NET_TOP; y < GROUND; y += 12) {
    ctx.beginPath()
    ctx.moveTo(NET_X - 14, y)
    ctx.lineTo(NET_X + 14, y)
    ctx.stroke()
  }
  for (let x = NET_X - 14; x <= NET_X + 14; x += 9) {
    ctx.beginPath()
    ctx.moveTo(x, NET_TOP)
    ctx.lineTo(x, GROUND)
    ctx.stroke()
  }
  ctx.restore()
  // 흰 띠
  ctx.fillStyle = '#fff'
  ctx.fillRect(NET_X - 16, NET_TOP - 6, 32, 12)
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, w: number) {
  ctx.fillStyle = 'rgba(0, 40, 10, 0.22)'
  ctx.beginPath()
  ctx.ellipse(x, GROUND + 6, w / 2, 9, 0, 0, Math.PI * 2)
  ctx.fill()
}

function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, g: Game) {
  const c = COLORS[p.side]
  const { x, y, dir } = p
  const running = Math.abs(p.vx) > 1 && y >= GROUND - 1
  const step = running ? Math.sin(g.time * 18) * 14 : 0
  const air = y < GROUND - 1

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 다리
  ctx.strokeStyle = '#3b3f4a'
  ctx.lineWidth = 13
  ctx.beginPath()
  ctx.moveTo(x - 9, y - 50)
  ctx.lineTo(x - 12 + step, y - (air ? 12 : 4))
  ctx.moveTo(x + 9, y - 50)
  ctx.lineTo(x + 12 - step, y - (air ? 18 : 4))
  ctx.stroke()
  // 신발
  ctx.fillStyle = '#fff'
  for (const fx of [x - 12 + step, x + 12 - step]) {
    ctx.beginPath()
    ctx.ellipse(fx + dir * 5, y - (air ? 12 : 3), 13, 6, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 몸통
  ctx.fillStyle = c.main
  roundRect(ctx, x - 24, y - 118, 48, 72, 18)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = 'bold 22px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(String(p.side + 1), x, y - 74)

  // 뒷팔
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 11
  ctx.beginPath()
  ctx.moveTo(x - dir * 14, y - 104)
  ctx.lineTo(x - dir * 26, y - 72)
  ctx.stroke()

  // 머리
  ctx.fillStyle = SKIN
  ctx.beginPath()
  ctx.arc(x, y - 148, 30, 0, Math.PI * 2)
  ctx.fill()
  // 머리띠
  ctx.fillStyle = c.dark
  ctx.beginPath()
  ctx.arc(x, y - 152, 31, Math.PI * 1.05, Math.PI * 1.95)
  ctx.lineTo(x + 31, y - 146)
  ctx.lineTo(x - 31, y - 146)
  ctx.fill()
  // 눈
  ctx.fillStyle = '#23262e'
  ctx.beginPath()
  ctx.arc(x + dir * 12, y - 140, 4, 0, Math.PI * 2)
  ctx.arc(x + dir * 24, y - 140, 4, 0, Math.PI * 2)
  ctx.fill()
  // 볼터치
  ctx.fillStyle = 'rgba(255, 120, 120, 0.35)'
  ctx.beginPath()
  ctx.arc(x + dir * 18, y - 128, 6, 0, Math.PI * 2)
  ctx.fill()

  // 라켓 팔
  const r = racketPose(p)
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 11
  ctx.beginPath()
  ctx.moveTo(r.sx, r.sy)
  ctx.lineTo(r.hx, r.hy)
  ctx.stroke()
  // 손잡이
  ctx.strokeStyle = '#2c2f38'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(r.hx, r.hy)
  ctx.lineTo(r.hx + Math.cos(r.a) * (62 - HEAD_R), r.hy + Math.sin(r.a) * (62 - HEAD_R))
  ctx.stroke()
  // 헤드
  ctx.save()
  ctx.translate(r.rx, r.ry)
  ctx.rotate(r.a)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.strokeStyle = c.dark
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.ellipse(0, 0, HEAD_R, HEAD_R * 0.78, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(60,60,70,0.4)'
  ctx.lineWidth = 1
  for (let i = -16; i <= 16; i += 8) {
    ctx.beginPath()
    ctx.moveTo(i, -18)
    ctx.lineTo(i, 18)
    ctx.moveTo(-22, i * 0.8)
    ctx.lineTo(22, i * 0.8)
    ctx.stroke()
  }
  ctx.restore()

  // 스윙 잔상
  if (p.swing > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 8
    ctx.beginPath()
    const start = dir === 1 ? r.a - 0.9 : r.a + 0.9
    ctx.arc(r.sx, r.sy, 34 + 62, Math.min(start, r.a), Math.max(start, r.a))
    ctx.stroke()
  }
}

function drawShuttle(ctx: CanvasRenderingContext2D, g: Game) {
  const s = g.shuttle

  // 꼬리 잔상
  s.trail.forEach((t, i) => {
    ctx.fillStyle = `rgba(255,255,255,${(i / s.trail.length) * 0.5})`
    ctx.beginPath()
    ctx.arc(t.x, t.y, 3 + (i / s.trail.length) * 5, 0, Math.PI * 2)
    ctx.fill()
  })

  // 코르크가 날아가는 방향을 향하게
  const ang = s.heldBy === null && Math.hypot(s.vx, s.vy) > 30 ? Math.atan2(s.vy, s.vx) : Math.PI / 2
  ctx.save()
  ctx.translate(s.x, s.y)
  ctx.rotate(ang)
  // 깃털
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#c9d2dc'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-2, -7)
  ctx.lineTo(-28, -15)
  ctx.lineTo(-28, 15)
  ctx.lineTo(-2, 7)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  for (const yy of [-8, 0, 8]) {
    ctx.moveTo(-3, yy * 0.5)
    ctx.lineTo(-27, yy * 1.6)
  }
  ctx.stroke()
  // 코르크
  ctx.fillStyle = '#fff6ea'
  ctx.beginPath()
  ctx.arc(2, 0, 8, -Math.PI / 2, Math.PI / 2)
  ctx.fill()
  ctx.fillStyle = '#ff5a5a'
  ctx.fillRect(-3, -7, 4, 14)
  ctx.restore()
}

function drawFx(ctx: CanvasRenderingContext2D, g: Game) {
  for (const f of g.fx) {
    const k = f.t / f.life // 1 → 0
    if (f.kind === 'burst') {
      ctx.strokeStyle = f.color ?? '#fff'
      ctx.globalAlpha = k
      ctx.lineWidth = 4
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const r1 = 14 + (1 - k) * 30
        const r2 = r1 + 14
        ctx.beginPath()
        ctx.moveTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1)
        ctx.lineTo(f.x + Math.cos(a) * r2, f.y + Math.sin(a) * r2)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    } else if (f.kind === 'text') {
      ctx.globalAlpha = Math.min(1, k * 2)
      ctx.font = '900 44px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 8
      ctx.strokeStyle = 'rgba(20, 30, 50, 0.75)'
      const yy = f.y - (1 - k) * 40
      ctx.strokeText(f.text ?? '', f.x, yy)
      ctx.fillStyle = f.color ?? '#fff'
      ctx.fillText(f.text ?? '', f.x, yy)
      ctx.globalAlpha = 1
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
