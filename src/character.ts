// 캐릭터 3D 모델: 성별(머리·옷), 얼굴(기본 얼굴 또는 사진), 라켓, 걷기·점프·스윙 동작

import * as THREE from 'three'
import type { Player } from './match'

export type Gender = 'm' | 'f'

export interface Look {
  gender: Gender
  shirt: string
  face: HTMLCanvasElement | null // 사진으로 만든 얼굴 (없으면 기본 얼굴)
}

const SKIN = '#ffd6b5'
const HEAD_R = 0.165

const mat = (color: string, rough = 0.75) => new THREE.MeshStandardMaterial({ color, roughness: rough })

function capsule(r: number, len: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), m)
  mesh.castShadow = true
  return mesh
}

/** 사진 없을 때 기본 얼굴 */
function defaultFace(gender: Gender): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = SKIN
  g.fillRect(0, 0, 256, 256)
  // 눈
  g.fillStyle = '#2a2a33'
  for (const x of [92, 164]) {
    g.beginPath()
    g.ellipse(x, 118, 11, 15, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(x + 4, 112, 4, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#2a2a33'
  }
  // 눈썹
  g.strokeStyle = '#5a3b2a'
  g.lineWidth = 6
  g.lineCap = 'round'
  for (const x of [92, 164]) {
    g.beginPath()
    g.moveTo(x - 14, 90)
    g.lineTo(x + 14, gender === 'f' ? 88 : 92)
    g.stroke()
  }
  // 볼
  g.fillStyle = 'rgba(255, 120, 120, 0.35)'
  for (const x of [72, 184]) {
    g.beginPath()
    g.ellipse(x, 150, 16, 10, 0, 0, Math.PI * 2)
    g.fill()
  }
  // 입
  g.strokeStyle = '#b4544a'
  g.lineWidth = 6
  g.beginPath()
  g.arc(128, 150, 20, 0.15 * Math.PI, 0.85 * Math.PI)
  g.stroke()
  return c
}

/** 업로드한 사진 → 얼굴 텍스처 (가운데를 잘라 가장자리를 피부색으로 부드럽게) */
export async function photoToFace(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = SKIN
  g.fillRect(0, 0, 256, 256)
  // 가운데를 좁게 잘라 얼굴이 꽉 차게 (사람 사진은 얼굴이 보통 위쪽이라 살짝 위를 자름)
  const side = Math.min(bmp.width, bmp.height) * 0.72
  const sx = (bmp.width - side) / 2
  const sy = Math.max(0, (bmp.height - side) * 0.38)
  g.save()
  g.beginPath()
  g.ellipse(128, 128, 112, 124, 0, 0, Math.PI * 2)
  g.clip()
  g.drawImage(bmp, sx, sy, side, side, 0, 0, 256, 256)
  g.restore()
  // 가장자리를 피부색으로 페이드
  const fade = g.createRadialGradient(128, 128, 84, 128, 128, 128)
  fade.addColorStop(0, 'rgba(255,214,181,0)')
  fade.addColorStop(1, SKIN)
  g.fillStyle = fade
  g.fillRect(0, 0, 256, 256)
  return c
}

export class Character {
  root = new THREE.Group()
  private body = new THREE.Group()
  private legL = new THREE.Group()
  private legR = new THREE.Group()
  private armL = new THREE.Group()
  private armR = new THREE.Group() // 라켓 든 팔
  private racketArm: THREE.Object3D[] = [] // 1인칭에서 숨길 팔 (라켓은 남김)
  private torso = new THREE.Group()
  head = new THREE.Group()
  private faceTex: THREE.CanvasTexture
  private walkPhase = 0

  constructor(look: Look) {
    const shirt = mat(look.shirt)
    const skin = mat(SKIN, 0.6)
    const dark = mat('#2f3440')
    const hairM = mat(look.gender === 'f' ? '#3b2418' : '#2a1d16', 0.9)

    this.root.add(this.body)

    // 다리 (엉덩이에서 아래로)
    for (const [leg, x] of [
      [this.legL, 0.09],
      [this.legR, -0.09],
    ] as const) {
      leg.position.set(x, 0.86, 0)
      const thigh = capsule(0.07, 0.62, skin)
      thigh.position.y = -0.38
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26), mat('#ffffff', 0.5))
      shoe.position.set(0, -0.8, 0.05)
      shoe.castShadow = true
      leg.add(thigh, shoe)
      this.body.add(leg)
    }

    // 하의
    const bottom =
      look.gender === 'f'
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, 0.3, 20), dark)
        : new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.24, 20), dark)
    bottom.position.y = look.gender === 'f' ? 0.83 : 0.86
    bottom.castShadow = true
    this.body.add(bottom)

    // 몸통
    this.torso.position.y = 0.98
    const chest = capsule(look.gender === 'f' ? 0.17 : 0.19, 0.32, shirt)
    chest.position.y = 0.2
    chest.scale.set(1, 1, 0.75)
    const neck = capsule(0.055, 0.06, skin)
    neck.position.y = 0.52
    this.torso.add(chest, neck)
    this.body.add(this.torso)

    // 팔 (어깨에서 아래로)
    for (const [arm, x] of [
      [this.armL, 0.26],
      [this.armR, -0.26],
    ] as const) {
      arm.position.set(x, 0.4, 0)
      const sleeve = capsule(0.065, 0.12, shirt)
      sleeve.position.y = -0.08
      const fore = capsule(0.052, 0.36, skin)
      fore.position.y = -0.32
      arm.add(sleeve, fore)
      this.torso.add(arm)
      if (arm === this.armR) this.racketArm.push(sleeve, fore)
    }
    this.armR.add(this.makeRacket(look.shirt))

    // 머리
    this.head.position.y = 0.66
    const skull = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 32, 24), skin)
    skull.castShadow = true
    this.head.add(skull)

    // 얼굴: 머리 앞쪽 구면 조각에 텍스처
    this.faceTex = new THREE.CanvasTexture(look.face ?? defaultFace(look.gender))
    this.faceTex.colorSpace = THREE.SRGBColorSpace
    const facePatch = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R * 1.008, 32, 24, Math.PI / 2 - 1.1, 2.2, 0.5, 1.75),
      new THREE.MeshStandardMaterial({ map: this.faceTex, roughness: 0.6 }),
    )
    this.head.add(facePatch)

    // 머리카락
    const cap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.07, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.38), hairM)
    cap.rotation.x = -0.25 // 앞머리는 이마 위, 뒤는 더 덮음
    cap.castShadow = true
    this.head.add(cap)
    const back = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R * 1.06, 24, 16, Math.PI * 1.1, Math.PI * 0.8, 0.3, Math.PI * 0.45),
      hairM,
    )
    this.head.add(back)
    if (look.gender === 'f') {
      // 긴 뒷머리 + 포니테일
      const longHair = new THREE.Mesh(
        new THREE.SphereGeometry(HEAD_R * 1.09, 24, 16, Math.PI * 1.05, Math.PI * 0.9, 0.4, Math.PI * 0.6),
        hairM,
      )
      longHair.scale.set(1, 1.5, 1)
      longHair.position.y = -0.06
      const tail = capsule(0.06, 0.2, hairM)
      tail.position.set(0, 0.02, -0.21)
      tail.rotation.x = 0.5
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 16), mat(look.shirt))
      band.position.set(0, 0.1, -0.17)
      band.rotation.x = 1.1
      this.head.add(longHair, tail, band)
    } else {
      // 짧은 옆머리
      for (const x of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), hairM)
        side.scale.set(0.5, 1.1, 1)
        side.position.set(x * HEAD_R * 0.95, 0.03, -0.03)
        this.head.add(side)
      }
    }
    this.torso.add(this.head)
  }

  private makeRacket(color: string) {
    const r = new THREE.Group()
    r.position.y = -0.52 // 손
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 8), mat('#23262e'))
    handle.position.y = -0.1
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), mat('#c9ced6', 0.3))
    shaft.position.y = -0.33
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.011, 8, 32), mat(color, 0.4))
    frame.scale.set(0.82, 1.1, 1)
    frame.position.y = -0.56
    const strings = new THREE.Mesh(
      new THREE.CircleGeometry(0.105, 24),
      new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    )
    strings.scale.set(0.82, 1.1, 1)
    strings.position.y = -0.56
    for (const m of [handle, shaft, frame]) m.castShadow = true
    r.add(handle, shaft, frame, strings)
    return r
  }

  setFace(canvas: HTMLCanvasElement) {
    this.faceTex.image = canvas
    this.faceTex.needsUpdate = true
  }

  /** 1인칭 시점: 내 머리와 라켓 든 팔은 숨기고 라켓만 보이게 (화면을 가리지 않게) */
  setFirstPerson(on: boolean) {
    this.head.visible = !on
    for (const o of this.racketArm) o.visible = !on
  }

  update(p: Player, dt: number, swingTime: number) {
    this.root.position.set(p.x, p.y, p.z)
    this.root.rotation.y = p.facing === 1 ? 0 : Math.PI

    // 걷기
    const speed = Math.hypot(p.vx, p.vz)
    const moving = speed > 0.3 && p.y === 0
    this.walkPhase += dt * (moving ? 6 + speed * 1.6 : 0)
    const swingLeg = moving ? Math.sin(this.walkPhase) * Math.min(0.7, speed * 0.16) : 0
    this.legL.rotation.x = p.y > 0 ? -0.5 : swingLeg
    this.legR.rotation.x = p.y > 0 ? 0.3 : -swingLeg
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.03 : 0
    this.armL.rotation.x = p.y > 0 ? -2.4 : -swingLeg * 0.6 - 0.2
    this.armL.rotation.z = 0.15

    // 스윙: 팔이 어깨 기준으로 회전 (아래로 뻗은 팔 기준, -π면 위로)
    const prog = p.swing > 0 ? 1 - p.swing / swingTime : -1
    let armX: number
    let twist = 0
    if (prog >= 0) {
      const e = prog < 0.5 ? prog * 2 : 1 // 앞쪽 절반에 빠르게 휘두름
      const ease = 1 - (1 - e) ** 3
      if (p.swingOver) {
        armX = -3.7 + ease * 3.0 // 머리 뒤에서 앞 아래로
      } else {
        armX = 0.7 - ease * 2.4 // 아래 뒤에서 앞 위로
      }
      twist = Math.sin(prog * Math.PI) * 0.5
    } else {
      armX = -2.3 // 준비 자세: 라켓을 위로
    }
    this.armR.rotation.x += (armX - this.armR.rotation.x) * Math.min(1, dt * (prog >= 0 ? 40 : 10))
    this.armR.rotation.z = -0.2
    this.torso.rotation.y = -twist
  }
}
