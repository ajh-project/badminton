// 배경: 하늘, 공원, 코트(실제 규격 선), 네트, 셔틀콕

import * as THREE from 'three'
import { COURT } from './physics'

export function buildWorld(scene: THREE.Scene) {
  // 하늘 (위는 파랗고 아래는 밝게)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'varying vec3 vPos; void main(){ float h = normalize(vPos).y; vec3 top = vec3(0.36,0.66,0.95); vec3 mid = vec3(0.75,0.89,1.0); vec3 low = vec3(1.0,0.96,0.88); vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : low; gl_FragColor = vec4(c, 1.0); }',
    }),
  )
  scene.add(sky)
  scene.fog = new THREE.Fog('#dff1ff', 40, 110)

  // 빛
  scene.add(new THREE.HemisphereLight('#ffffff', '#6aa86a', 1.4))
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2)
  sun.position.set(-8, 16, -6)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const sc = sun.shadow.camera
  sc.left = -10
  sc.right = 10
  sc.top = 10
  sc.bottom = -10
  sc.near = 1
  sc.far = 40
  sun.shadow.bias = -0.0005
  scene.add(sun)

  // 잔디
  const grass = new THREE.Mesh(new THREE.CircleGeometry(100, 48), new THREE.MeshStandardMaterial({ color: '#7cc576', roughness: 1 }))
  grass.rotation.x = -Math.PI / 2
  grass.receiveShadow = true
  scene.add(grass)

  // 코트 바닥 (바깥 여유 포함)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.halfWDoubles * 2 + 2.4, COURT.halfLen * 2 + 3),
    new THREE.MeshStandardMaterial({ color: '#3f9e6a', roughness: 0.9 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.002
  floor.receiveShadow = true
  scene.add(floor)

  // 코트 선 (실제 배드민턴 규격)
  const lineMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 })
  const W = 0.04
  const line = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 === x2 ? W : len + W, z1 === z2 ? W : len + W), lineMat)
    m.rotation.x = -Math.PI / 2
    m.position.set((x1 + x2) / 2, 0.004, (z1 + z2) / 2)
    m.receiveShadow = true
    scene.add(m)
  }
  const { halfLen: L, halfW: S, halfWDoubles: D, shortService: SS, longServiceDoubles: LS } = COURT
  for (const x of [-D, -S, S, D]) line(x, -L, x, L) // 사이드라인 (복식, 단식)
  for (const z of [-L, L, -SS, SS, -LS, LS]) line(-D, z, D, z) // 베이스라인, 서비스 라인
  line(0, SS, 0, L) // 센터 라인
  line(0, -SS, 0, -L)

  buildNet(scene)
  buildPark(scene)
}

function buildNet(scene: THREE.Scene) {
  const D = COURT.halfWDoubles
  const post = new THREE.MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.4, metalness: 0.2 })
  for (const x of [-D - 0.05, D + 0.05]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, COURT.postH, 12), post)
    p.position.set(x, COURT.postH / 2, 0)
    p.castShadow = true
    scene.add(p)
  }
  // 그물 텍스처
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  g.strokeStyle = 'rgba(25, 30, 40, 0.85)'
  g.lineWidth = 3
  g.strokeRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(D * 2 / 0.06, 0.76 / 0.06)
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(D * 2, 0.76),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 }),
  )
  net.position.set(0, COURT.netH - 0.38, 0)
  net.castShadow = true
  scene.add(net)
  const tape = new THREE.Mesh(new THREE.BoxGeometry(D * 2, 0.06, 0.012), new THREE.MeshStandardMaterial({ color: '#ffffff' }))
  tape.position.set(0, COURT.netH - 0.03, 0)
  scene.add(tape)
}

function buildPark(scene: THREE.Scene) {
  const trunk = new THREE.MeshStandardMaterial({ color: '#8a5a3b' })
  const leaves = ['#5fb35a', '#4fa65a', '#76c36a'].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true }))
  const rng = mulberry(7)
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI * 2
    const r = 14 + rng() * 26
    const x = Math.cos(a) * r * 0.8
    const z = Math.sin(a) * r
    if (Math.abs(x) < 9 && Math.abs(z) < 12) continue
    const t = new THREE.Group()
    const h = 1.2 + rng() * 1.2
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h, 8), trunk)
    tr.position.y = h / 2
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + rng() * 0.9, 0), leaves[i % 3])
    crown.position.y = h + 0.7
    tr.castShadow = crown.castShadow = true
    t.add(tr, crown)
    t.position.set(x, 0, z)
    scene.add(t)
  }
  // 구름
  const cloudM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.35 })
  for (let i = 0; i < 9; i++) {
    const cl = new THREE.Group()
    for (let j = 0; j < 4; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2 + rng() * 1.5, 12, 10), cloudM)
      s.position.set(j * 2.4, rng(), rng() * 0.8)
      cl.add(s)
    }
    const a = rng() * Math.PI * 2
    cl.position.set(Math.cos(a) * 70, 22 + rng() * 14, Math.sin(a) * 70)
    cl.lookAt(0, cl.position.y, 0)
    scene.add(cl)
  }
}

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 셔틀콕: 코르크가 날아가는 방향을 향함. 잘 보이게 실제보다 2배 크게 */
export class ShuttleView {
  group = new THREE.Group()
  private shadow: THREE.Mesh
  private trail: THREE.Line
  private trailPts: THREE.Vector3[] = []

  constructor(scene: THREE.Scene) {
    const S = 2
    const cork = new THREE.Mesh(
      new THREE.SphereGeometry(0.014 * S, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#fff6ea', roughness: 0.5 }),
    )
    cork.rotation.x = Math.PI / 2 // 반구가 +z를 향하게
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * S, 0.014 * S, 0.008 * S, 16), new THREE.MeshStandardMaterial({ color: '#ff4d4d' }))
    band.rotation.x = Math.PI / 2
    band.position.z = -0.004 * S
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014 * S, 0.034 * S, 0.07 * S, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    )
    skirt.rotation.x = Math.PI / 2 // 좁은 쪽이 코르크(앞), 넓은 쪽이 뒤
    skirt.position.z = -0.042 * S
    for (const m of [cork, band, skirt]) m.castShadow = true
    this.group.add(cork, band, skirt)
    scene.add(this.group)

    // 바닥 그림자 (원근감을 잡는 데 중요)
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.09, 20),
      new THREE.MeshBasicMaterial({ color: '#0b2a14', transparent: true, opacity: 0.35, depthWrite: false }),
    )
    this.shadow.rotation.x = -Math.PI / 2
    scene.add(this.shadow)

    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }))
    scene.add(this.trail)
  }

  update(p: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, flying: boolean) {
    this.group.position.set(p.x, p.y, p.z)
    const sp = Math.hypot(v.x, v.y, v.z)
    if (flying && sp > 0.5) this.group.lookAt(p.x + v.x, p.y + v.y, p.z + v.z)
    else this.group.rotation.set(Math.PI / 2, 0, 0) // 들고 있을 땐 코르크가 아래로
    this.shadow.position.set(p.x, 0.006, p.z)
    const k = Math.max(0.4, 1 - p.y / 8)
    this.shadow.scale.setScalar(k)

    if (flying) {
      this.trailPts.push(new THREE.Vector3(p.x, p.y, p.z))
      if (this.trailPts.length > 18) this.trailPts.shift()
    } else this.trailPts = []
    this.trail.geometry.setFromPoints(this.trailPts)
  }
}
