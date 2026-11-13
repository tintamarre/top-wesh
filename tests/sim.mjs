// Headless balance test: bots play the levels with the pure simulation.
// - a smart bot (good gates, best lane) must win every level, buying upgrades with what it earns
// - a lazy bot (stays in the middle, takes no gate on purpose) must lose from some level on
import { buildLevel } from '../src/level.js';
import { Sim } from '../src/sim.js';
import { upgradeCost, upgradeStats, UPGRADES } from '../src/upgrades.js';

const DT = 1 / 60;
const verbose = process.argv.includes('-v');

function gateResult(g, n) { return g.op === 'x' ? n * g.v : n + g.v; }

function smartBot(sim, lanePref) {
  const q = sim.squad;
  // Next gate choice ahead
  const ahead = sim.gates.filter((g) => !g.used && g.group >= 0 && g.z > q.z && g.z - q.z < 22);
  if (ahead.length) {
    const z = Math.min(...ahead.map((g) => g.z));
    const row = ahead.filter((g) => g.z === z);
    row.sort((a, b) => gateResult(b, q.count) - gateResult(a, q.count));
    return row[0].x;
  }
  // Lane section ahead or current
  for (const s of sim.L.sections) {
    if (q.z + q.Rz > s.z0 - 14 && q.z - q.Rz < s.z1) {
      if (q.lane && q.lane.s === s) return q.targetX;
      const barrier = sim.blocks.find((b) => b.kind === 'barrier' && b.z > s.z0 && b.z < s.z1);
      const gatesX = sim.gates.find((g) => g.z > s.z0 && g.z < s.z1 && !g.yellow).x;
      if (lanePref === 'auto') {
        const W = sim.weaponInfo;
        const dps = q.count * W.rate * W.dmg * sim.dmgMul * sim.rateMul;
        return barrier.hp / Math.max(1, dps) < 4 ? barrier.x : gatesX;
      }
      return lanePref === 'gates' ? gatesX : lanePref === 'barrier' ? barrier.x : 0;
    }
  }
  // Shoot blocks with rewards: line up with the nearest one ahead
  const blk = sim.blocks.filter((b) => b.alive && b.kind !== 'barrier' && b.z > q.z && b.z - q.z < 16);
  if (blk.length) return blk[0].x;
  return sim.boss.active ? sim.boss.x : 0;
}

function play(n, stats, bot) {
  const sim = new Sim(buildLevel(n), stats);
  let t = 0;
  while (sim.state !== 'won' && sim.state !== 'lost' && t < 400) {
    sim.squad.targetX = bot(sim);
    sim.update(DT);
    t += DT;
  }
  return { state: t >= 400 ? 'timeout' : sim.state, t: t.toFixed(0), coins: sim.coins, peak: sim.peak, left: sim.squad.count, lost: sim.lostTotal, boss: Math.round(sim.boss.hp), weapon: sim.weaponInfo.name };
}

let fails = 0;
const levels = { start: 0, power: 0, rate: 0 };
let wallet = 0;
console.log('level  result   time  peak  left  lost  coins  weapon   upgrades');
const spend = () => {
  for (;;) {
    const id = UPGRADES.map((u) => u.id).sort((a, b) => upgradeCost(a, levels[a]) - upgradeCost(b, levels[b]))[0];
    const c = upgradeCost(id, levels[id]);
    if (c > wallet) break;
    wallet -= c;
    levels[id]++;
  }
};
for (let n = 1; n <= 15; n++) {
  // Like a player: retry a lost level (keeping the coins earned), at most 3 tries
  let best, r;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const stats = upgradeStats(levels);
    const runs = ['auto', 'gates', 'barrier', 'horde'].map((p) => ({ p, r: play(n, stats, (s) => smartBot(s, p)) }));
    best = runs.find((x) => x.r.state === 'won') ?? runs[0];
    r = best.r;
    if (verbose) for (const x of runs) console.log('   ', x.p.padEnd(8), JSON.stringify(x.r));
    console.log(String(n).padStart(5), ' ', r.state.padEnd(7), String(r.t).padStart(5), String(r.peak).padStart(5), String(r.left).padStart(5), String(r.lost).padStart(5), String(Math.floor(r.coins)).padStart(6), ' ', r.weapon.padEnd(8), best.p, JSON.stringify(levels));
    wallet += Math.floor(r.coins) + (r.state === 'won' ? 10 * n : 0);
    spend();
    if (r.state === 'won') break;
  }
  if (r.state !== 'won') { fails++; console.error(`  ✗ level ${n} cannot be won by the smart bot in 3 tries`); }
}

// Lazy bot: never steers. Must lose somewhere, or the game has no challenge.
let lazyLost = 0;
for (let n = 1; n <= 8; n++) if (play(n, upgradeStats({ start: 0, power: 0, rate: 0 }), () => 0).state !== 'won') lazyLost++;
console.log(`lazy bot lost ${lazyLost}/8 levels`);
if (lazyLost < 3) { fails++; console.error('  ✗ too easy: a bot that never steers wins almost everything'); }
// Level 1 must be winnable without upgrades by just following the gates
if (play(1, upgradeStats({ start: 0, power: 0, rate: 0 }), (s) => smartBot(s, 'gates')).state !== 'won') { fails++; console.error('  ✗ level 1 too hard'); }

if (fails) { console.error(`${fails} failure(s)`); process.exit(1); }
console.log('ok');
