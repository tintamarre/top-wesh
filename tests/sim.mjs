// Headless balance test: bots play the levels with the pure simulation.
// - a smart bot (good gates, best lane, steps around saws, spikes, iron balls and orbs) must win every level, buying upgrades with what it earns
// - a lazy bot (stays in the middle, takes no gate on purpose) must lose from some level on
import { buildLevel, buildBonus, ROUTES } from '../src/level.js';
import { Sim, wallHalf } from '../src/sim.js';
import { PERKS, starsFor } from '../src/perks.js';
import { upgradeCost, upgradeStats, UPGRADES } from '../src/upgrades.js';

const DT = 1 / 60;
const verbose = process.argv.includes('-v');

// Routes the bot likes best at a junction, unless a test asks for one
const ROUTE_ORDER = ['playground', 'detention', 'alley', 'bikes', 'staff', 'shop'];
let wantRoute = null;
const routes = new Set(); // every route taken by a bot

function gateResult(g, n, sim) {
  if (g.op === 'x') return n * g.v;
  if (g.op === 'route') {
    const id = sim.L.junctions[Math.floor(g.pick / 10)].ids[g.pick % 10];
    return id === wantRoute ? 99 : -ROUTE_ORDER.indexOf(id);
  }
  if (g.op === 'fx') return g.fx === 'elite' ? n * 1.2 : g.fx === 'scooter' ? n + 5 : n - 1;
  return n + g.v;
}

// Where the bot would like to be, before looking at what could hurt it there
function goalX(sim, lanePref) {
  const q = sim.squad;
  // Next gate choice ahead
  const ahead = sim.gates.filter((g) => !g.used && g.group >= 0 && g.z > q.z && g.z - q.z < 22);
  if (ahead.length) {
    const z = Math.min(...ahead.map((g) => g.z));
    const row = ahead.filter((g) => g.z === z);
    row.sort((a, b) => gateResult(b, q.count, sim) - gateResult(a, q.count, sim));
    return row[0].x;
  }
  // Lane section ahead or current
  for (const s of sim.L.sections) {
    if (q.z + q.Rz > s.z0 - 14 && q.z - q.Rz < s.z1) {
      if (q.lane && q.lane.s === s) return q.targetX;
      if (s.kind === 'fork') return lanePref === 'auto' || lanePref === 'gates' ? s.easyX : s.hardX;
      const barrier = sim.blocks.find((b) => b.kind === 'barrier' && b.z > s.z0 && b.z < s.z1);
      const gatesX = sim.gates.find((g) => g.z > s.z0 && g.z < s.z1 && !g.yellow).x;
      if (lanePref === 'auto') {
        const W = sim.weaponInfo;
        const dps = q.count * W.rate * W.dmg * W.pellets * sim.dmgMul * sim.rateMul;
        return barrier.hp / Math.max(1, dps) < 4 ? barrier.x : gatesX;
      }
      return lanePref === 'gates' ? gatesX : lanePref === 'barrier' ? barrier.x : 0;
    }
  }
  // Lone good gates (moving ones included)
  const lone = sim.gates.find((g) => !g.used && g.group < 0 && g.v > 1 && g.z > q.z && g.z - q.z < 12);
  if (lone) return lone.x;
  // Shoot blocks with rewards: line up with the nearest one ahead
  const blk = sim.blocks.filter((b) => b.alive && b.kind !== 'barrier' && b.z > q.z && b.z - q.z < 16);
  if (blk.length) return blk[0].x;
  return sim.boss.active ? sim.boss.x : 0;
}

// How much of the squad would be hurt at x: spikes and saws just ahead, boulders and shots coming
function danger(sim, x, balls) {
  const q = sim.squad;
  const overlap = (a0, a1) => Math.max(0, Math.min(x + q.Rx, a1) - Math.max(x - q.Rx, a0));
  let d = 0;
  for (const h of sim.hazards) {
    const dz = h.z - q.z;
    if (dz < -q.Rz - 1 || dz > q.Rz + 7) continue;
    if (h.kind === 'spikes') d += overlap(h.x - h.w / 2, h.x + h.w / 2);
    else if (h.kind === 'walls') {
      const half = wallHalf(h, sim.time + Math.max(0, dz - q.Rz) / 7);
      d += overlap(-9, h.c - half) + overlap(h.c + half, 9);
    } else {
      const t = Math.max(0, dz - q.Rz) / 7;
      const hx = h.x0 + h.amp * Math.sin(((sim.time + t) * Math.PI * 2) / h.period + h.phase);
      d += overlap(hx - h.r - 0.6, hx + h.r + 0.6);
    }
  }
  for (const e of balls) d += 2 * overlap(e.x - 1.1, e.x + 1.1);
  for (const s of sim.shots) {
    const t = (s.z - q.z) / (7 - s.vz);
    if (t < 0 || t > 1.5) continue;
    const sx = s.x + s.vx * t;
    d += overlap(sx - 0.6, sx + 0.6);
  }
  return d;
}

function smartBot(sim, lanePref) {
  const q = sim.squad;
  const goal = goalX(sim, lanePref);
  if (q.lane) return goal;
  const balls = sim.enemies.filter((e) => e.straight && e.alive && e.active && e.z > q.z - q.Rz && e.z - q.z < 20);
  if (!balls.length && !sim.shots.length && !sim.hazards.some((h) => Math.abs(h.z - q.z) < q.Rz + 8)) return goal;
  let best = goal, bestCost = Infinity;
  for (let x = -sim.half + 0.5; x <= sim.half - 0.5; x += 0.5) {
    const cost = danger(sim, x, balls) * 4 + Math.abs(x - goal) * 0.6 + Math.abs(x - q.x) * 0.1;
    if (cost < bestCost) { bestCost = cost; best = x; }
  }
  return danger(sim, goal, balls) * 4 <= bestCost - Math.abs(best - goal) * 0.6 ? goal : best;
}

// When the smart bot shouts: a boss about to strike, the Mum at its heels, chalk or homework about to land
function wantShout(sim) {
  const q = sim.squad, B = sim.boss;
  if (sim.shoutT > 0) return false;
  if (B.active && B.alive && (B.state === 'windup' || B.state === 'aim') && B.t < 0.3 && B.z - q.front < 7) return true;
  if (sim.mumGap < 2) return true;
  if (sim.shots.filter((s) => !s.back && s.z > q.z && s.z - q.front < 3 && Math.abs(s.x - q.x) < q.Rx + 1).length >= 2) return true;
  return sim.enemies.some((e) => e.straight && e.alive && e.active && e.z > q.z && e.z - q.front < 3 && Math.abs(e.x - q.x) < q.Rx + 1);
}

function play(n, stats, bot, level = buildLevel(n), shouts = true) {
  const sim = new Sim(level, stats);
  let t = 0;
  const why = {};
  while (sim.state !== 'won' && sim.state !== 'lost' && t < 400) {
    sim.squad.targetX = bot(sim);
    if (shouts && wantShout(sim)) sim.shout();
    sim.update(DT);
    t += DT;
    for (const e of sim.events) {
      if (e.type === 'lost') why[e.why] = (why[e.why] ?? 0) + e.n;
      else if (e.type === 'route') routes.add(sim.L.junctions[Math.floor(e.key / 10)].ids[e.key % 10]);
    }
    sim.events.length = 0;
  }
  return { mum: sim.mum.took, state: t >= 400 ? 'timeout' : sim.state, t: t.toFixed(0), coins: sim.coins, peak: sim.peak, left: sim.squad.count, lost: sim.lostTotal, boss: Math.round(sim.boss.hp), weapon: sim.weaponInfo.name, stars: starsFor(sim.squad.count, sim.lostTotal), z: Math.round(sim.squad.z), why };
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
    // Lane preferences are tried in turn, until one wins
    const runs = [];
    for (const p of ['auto', 'gates', 'barrier', 'horde']) {
      runs.push({ p, r: play(n, stats, (s) => smartBot(s, p)) });
      if (runs.at(-1).r.state === 'won') break;
    }
    best = runs.find((x) => x.r.state === 'won') ?? runs[0];
    r = best.r;
    if (verbose) for (const x of runs) console.log('   ', x.p.padEnd(8), JSON.stringify(x.r));
    console.log(String(n).padStart(5), ' ', r.state.padEnd(7), String(r.t).padStart(5), String(r.peak).padStart(5), String(r.left).padStart(5), String(r.lost).padStart(5), String(Math.floor(r.coins)).padStart(6), ' ', r.weapon.padEnd(8), '★'.repeat(r.stars).padEnd(3), best.p, JSON.stringify(levels));
    wallet += Math.floor(r.coins) + (r.state === 'won' ? 10 * n : 0);
    spend();
    if (r.state === 'won') break;
  }
  if (r.state !== 'won') { fails++; console.error(`  ✗ level ${n} cannot be won by the smart bot in 3 tries`); }
}

// Lazy bot: never steers. Must lose somewhere, or the game has no challenge.
let lazyLost = 0;
for (let n = 1; n <= 8; n++) if (play(n, upgradeStats({ start: 0, power: 0, rate: 0 }), () => 0, undefined, false).state !== 'won') lazyLost++;
console.log(`lazy bot lost ${lazyLost}/8 levels`);
if (lazyLost < 3) { fails++; console.error('  ✗ too easy: a bot that never steers wins almost everything'); }
// Level 1 must be winnable without upgrades by just following the gates
if (play(1, upgradeStats({ start: 0, power: 0, rate: 0 }), (s) => smartBot(s, 'gates')).state !== 'won') { fails++; console.error('  ✗ level 1 too hard'); }

// Everything switched on at once must still play through
{
  const perks = Object.fromEntries(PERKS.map((p) => [p.id, p.max]));
  const base = upgradeStats({ start: 3, power: 2, rate: 2 });
  for (const n of [4, 6]) {
    const plain = play(n, base, (s) => smartBot(s, 'auto'));
    const full = play(n, { ...base, perks, heroes: { medic: true, sniper: true, tank: true } }, (s) => smartBot(s, 'auto'));
    console.log(`level ${n} with every perk and hero: ${full.state}, ${full.left} left (${plain.state}, ${plain.left} without)`);
    if (full.state !== 'won') { fails++; console.error('  ✗ lost with every perk and hero'); }
  }
}
// Every kind of route must play through, with coins in the pocket for the shop
{
  const stats = { ...upgradeStats({ start: 8, power: 6, rate: 6 }), wallet: 500 };
  const seen = new Set();
  for (const id of Object.keys(ROUTES)) {
    for (const n of [3, 5, 8, 11]) {
      if (!buildLevel(n).junctions.some((j) => j.ids.includes(id))) continue;
      routes.clear();
      wantRoute = id;
      const r = play(n, stats, (s) => smartBot(s, 'auto'));
      wantRoute = null;
      if (!routes.has(id)) continue;
      seen.add(id);
      console.log(`route ${id.padEnd(10)} level ${n}: ${r.state}, ${r.left} left, ${r.lost} lost (took ${[...routes].join(", ")})`);
      if (r.state === 'timeout') { fails++; console.error(`  ✗ the ${id} route never ends`); }
      break;
    }
  }
  if (seen.size < Object.keys(ROUTES).length) { fails++; console.error(`  ✗ routes never offered: ${Object.keys(ROUTES).filter((id) => !seen.has(id))}`); }
}
// Bonus coin rush: following the trail reaches the finish line with most of the coins
for (const n of [3, 9]) {
  const L = buildBonus(n);
  const total = L.coins.reduce((a, c) => a + c.v, 0);
  const r = play(n, upgradeStats({ start: 2, power: 0, rate: 0 }), (s) => (s.pickups.find((c) => c.alive && c.z > s.squad.z && c.v === L.coins[0].v) ?? { x: 0 }).x, L);
  console.log(`bonus after level ${n}: ${r.state}, ${Math.floor(r.coins)}/${total} coins`);
  if (r.state !== 'won' || r.coins < total * 0.4) { fails++; console.error('  ✗ bonus level broken'); }
}

if (fails) { console.error(`${fails} failure(s)`); process.exit(1); }
console.log('ok');
