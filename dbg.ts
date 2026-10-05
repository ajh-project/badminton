import { newMatch, startMatch, step, noControls } from './src/match'
const m = newMatch(); startMatch(m, { cpu: [true, true], auto: [false, false] })
const shots: Record<string, number> = {}
for (let i = 0; i < 120 * 600 && m.phase !== 'over'; i++) { step(m, 1 / 120, [noControls(), noControls()]); for (const e of m.events) if (e.kind === 'hit') shots[e.shot!] = (shots[e.shot!] ?? 0) + 1; m.events.length = 0 }
console.log('cpu match', m.players.map(p => p.score).join(':'), m.phase, Math.round(m.time) + 's', JSON.stringify(shots))
