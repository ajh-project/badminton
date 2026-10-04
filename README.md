# 🏸 배드민턴 3D

**https://ajh-project.github.io/badminton/** · 2D 클래식: [classic.html](https://ajh-project.github.io/badminton/classic.html)

내 얼굴로 하는 3D 배드민턴. 둘이서(한 화면) 또는 컴퓨터와. 11점 먼저 내면 승리!

- **캐릭터**: 남자/여자, 옷 색, **얼굴 사진** (사진은 기기 안에서만 쓰이고 업로드되지 않음)
- **시점**: 🎮 3인칭 · 👀 1인칭 · 📺 중계 (게임 중 `V`로 전환). 둘이서 1·3인칭이면 화면 좌우 분할
- **샷**: 그냥 스윙 = 클리어, 앞으로 누르며 = 드라이브, 뒤로 누르며 = 드롭, 점프하며 높은 셔틀 = 스매시
- **자동 스윙(쉬움)**: 이동만 하면 셔틀이 오면 알아서 휘두름
- 셔틀콕은 실제처럼 공기 저항을 받아 날아감 (종단속도 기준 물리)

| | 컴퓨터랑 | 둘이서 P1 | 둘이서 P2 |
|---|---|---|---|
| 이동 | WASD / 방향키 | WASD | 방향키 |
| 스윙 | Space · F · 클릭 | F | Enter |
| 점프 | G · Shift | G | 오른쪽 Shift |

폰은 가로로 돌리면 조이스틱 + 스윙/점프 버튼이 나와요. `?demo`를 붙이면 컴퓨터끼리 대결 (`&view=first|third|tv`).

```bash
npm install
npm run dev
npm run deploy
```

Three.js · TypeScript · Vite
