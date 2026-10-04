// 셔틀콕 물리 (단위: 미터, 초)
// 좌표: x = 코트 좌우, y = 높이, z = 코트 길이 방향 (P1은 z<0, P2는 z>0, 네트는 z=0)

export const G = 9.81
/** 공기 저항 계수. 실제 셔틀콕 종단속도(~6.8m/s) 기준 0.21, 게임 느낌을 위해 살짝 낮춤 */
export const DRAG = 0.18

export const COURT = {
  halfLen: 6.7, // 베이스라인
  halfW: 2.59, // 단식 사이드라인 (인/아웃 기준)
  halfWDoubles: 3.05,
  shortService: 1.98,
  longServiceDoubles: 5.94,
  netH: 1.55,
  postH: 1.55,
}

export interface V3 {
  x: number
  y: number
  z: number
}

export function stepShuttle(p: V3, v: V3, dt: number) {
  const s = Math.hypot(v.x, v.y, v.z)
  v.x -= DRAG * s * v.x * dt
  v.y -= (G + DRAG * s * v.y) * dt
  v.z -= DRAG * s * v.z * dt
  p.x += v.x * dt
  p.y += v.y * dt
  p.z += v.z * dt
}

export interface FlightInfo {
  land: V3 // y=0 에 닿는 지점
  t: number
  netY: number | null // 네트(z=0)를 지날 때 높이
}

/** 지금 상태에서 바닥에 닿을 때까지 미리 계산 */
export function simulate(p0: V3, v0: V3, dt = 1 / 120, maxT = 8): FlightInfo {
  const p = { ...p0 }
  const v = { ...v0 }
  let t = 0
  let netY: number | null = null
  while (p.y > 0 && t < maxT) {
    const pz = p.z
    stepShuttle(p, v, dt)
    t += dt
    if (netY === null && pz * p.z <= 0 && pz !== p.z) netY = p.y
  }
  return { land: { ...p }, t, netY }
}

/** 셔틀이 내려오면서 height 높이를 지나는 지점과 시간 (못 지나면 null) */
export function predictAt(p0: V3, v0: V3, height: number, dt = 1 / 120, maxT = 6) {
  const p = { ...p0 }
  const v = { ...v0 }
  let t = 0
  while (t < maxT && p.y > 0) {
    stepShuttle(p, v, dt)
    t += dt
    if (v.y < 0 && p.y <= height) return { x: p.x, y: p.y, z: p.z, t }
  }
  return null
}

const rad = (d: number) => (d * Math.PI) / 180

function launch(from: V3, target: { x: number; z: number }, elevDeg: number, speed: number): V3 {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const d = Math.hypot(dx, dz) || 1
  const e = rad(elevDeg)
  return {
    x: (dx / d) * Math.cos(e) * speed,
    y: Math.sin(e) * speed,
    z: (dz / d) * Math.cos(e) * speed,
  }
}

const horiz = (from: V3, p: { x: number; z: number }) => Math.hypot(p.x - from.x, p.z - from.z)

/** 정해진 각도로 쳐서 target에 떨어지도록 속도를 찾음 (이분 탐색) */
export function solveSpeed(from: V3, target: { x: number; z: number }, elevDeg: number): V3 {
  const want = horiz(from, target)
  let lo = 1
  let hi = 90
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2
    const r = simulate(from, launch(from, target, elevDeg, mid), 1 / 90)
    if (horiz(from, r.land) < want) lo = mid
    else hi = mid
  }
  return launch(from, target, elevDeg, (lo + hi) / 2)
}

/** 정해진 속도로 쳐서 target에 떨어지도록 각도를 찾음 (스매시용) */
export function solveAngle(from: V3, target: { x: number; z: number }, speed: number): V3 {
  const want = horiz(from, target)
  let lo = -45
  let hi = 20
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const r = simulate(from, launch(from, target, mid, speed), 1 / 90)
    if (horiz(from, r.land) < want) lo = mid
    else hi = mid
  }
  return launch(from, target, (lo + hi) / 2, speed)
}

/** 네트를 넘을 때까지 각도를 올려가며 속도 계산 */
export function solveClearingNet(from: V3, target: { x: number; z: number }, elevDeg: number, margin = 0.12): V3 {
  let e = elevDeg
  let v = solveSpeed(from, target, e)
  for (let i = 0; i < 12; i++) {
    const r = simulate(from, v, 1 / 90)
    if (r.netY === null || r.netY > COURT.netH + margin) return v
    e += 5
    v = solveSpeed(from, target, e)
  }
  return v
}
