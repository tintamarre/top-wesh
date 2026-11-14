// Procedural level generator. Pure data, no rendering: used by the game and the headless tests.
// The road runs along +z, x is across. A level is laid out on a road of half width ROAD_HALF, then
// stretched or squeezed to its own width (L.half), so every layout keeps its proportions.
// A level is an opening, then pairs of "danger" segments (waves, hazards) and "growth" segments
// (gates, jars, guns, power-ups) drawn from pools that open up with the level number, then the boss.

export const ROAD_HALF = 6;
export const THEMES = ['desert', 'meadow', 'bridge', 'night', 'snow', 'city', 'lava'];
const LANE_WALL = 0.16; // half thickness of a lane wall

// Guns offered at the first, second and third pick-up of a level (indexes into WEAPONS, sim.js)
export const WEAPON_TIERS = [[1, 2], [3, 4, 5], [6, 7]];

// Level at which each danger segment first appears
const DANGERS = { wave: 1, spikes: 1, saws: 2, runners: 2, boulders: 3, shields: 3, bombers: 4, snipers: 4, fork: 5, walls: 6 };
const GROWTHS = { pair: 1, jar: 1, mult: 2, moving: 2, power: 2, triple: 3 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const bossType = (n) => (n % 5 === 0 ? 'titan' : n % 2 === 0 ? 'blaster' : 'crusher');

export function buildLevel(n) {
  const rng = mulberry32(n * 9973 + 17);
  const k = n - 1;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const L = { n, theme: THEMES[k % THEMES.length], gates: [], blocks: [], enemies: [], hazards: [], coins: [], sections: [], boss: null, length: 0 };
  const coin = (x, z) => L.coins.push({ x, z, v: 1 + Math.floor(k / 3) });
  let gid = 0, group = 0, bgroup = 0;

  const gate = (x, z, w, op, v, opts = {}) => L.gates.push({ id: gid++, x, z, w, op, v, group: opts.group ?? -1, shootable: !!opts.shootable, yellow: !!opts.yellow, move: opts.move ?? null });
  const block = (kind, x, z, w, d, hp, reward, grp = -1) => L.blocks.push({ kind, x, z, w, d, hp: Math.round(hp), reward, group: grp });
  const foe = (kind, x, z) => L.enemies.push({ x, z, kind });
  const horde = (x0, x1, z0, rows, perRow, brutes = 0) => {
    const sp = (x1 - x0) / perRow;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < perRow; c++)
        foe('grunt', x0 + sp * (c + 0.5) + (rng() - 0.5) * 0.12, z0 + r * 0.55 + (rng() - 0.5) * 0.12);
    for (let b = 0; b < brutes; b++) foe('brute', x0 + (x1 - x0) * rng(), z0 - 1.5 - rng() * 2);
  };

  // Choice of two gates side by side: only one can be taken.
  const gatePair = (z, a, b) => {
    const g = group++;
    const [l, r] = rng() < 0.5 ? [b, a] : [a, b];
    gate(-3, z, 5.7, l[0], l[1], { group: g, shootable: l[2] });
    gate(3, z, 5.7, r[0], r[1], { group: g, shootable: r[2] });
  };

  // Signature section: three lanes. One lane of +1 gates, one with the horde, one behind a barrier with big gates.
  const lanes = (z0, len, hordeRows, barrierHp, bigGate) => {
    const z1 = z0 + len;
    const mirror = rng() < 0.5 ? -1 : 1;
    L.sections.push({ z0, z1, walls: [-2, 2], lanes: [[-ROAD_HALF, -2 - LANE_WALL], [-2 + LANE_WALL, 2 - LANE_WALL], [2 + LANE_WALL, ROAD_HALF]] });
    const left = -4 * mirror, right = 4 * mirror;
    for (let z = z0 + 2.5; z < z1 - 2; z += 1.75) gate(left, z, 3.7, '+', 1);
    block('barrier', right, z0 + 1.2, 3.7, 1.4, barrierHp, { type: 'coins', v: 5 + k });
    for (let z = z0 + 7; z < z1 - 3; z += 8) gate(right, z, 3.7, '+', bigGate, { yellow: true });
    horde(-1.8, 1.8, z0 + 6, hordeRows, 7, Math.min(4, Math.floor(k / 2)));
    return z1;
  };

  // One gun, or a choice of two (breaking one makes the other vanish)
  const weapon = (z, tier) => {
    const pool = WEAPON_TIERS[tier];
    const kind = tier === 0 ? 'barrel' : 'crate';
    const size = tier === 0 ? [1.6, 1.6] : [2, 1.8];
    const hp = [8 + 10 * k, 40 + 35 * k, 70 + 50 * k][tier];
    if (n === 1 || pool.length < 2) block(kind, pick([-3, 0, 3]), z, ...size, hp, { type: 'weapon', w: pick(pool) });
    else {
      const a = pick(pool);
      const b = pick(pool.filter((w) => w !== a));
      const g = bgroup++;
      block(kind, -3, z, ...size, hp, { type: 'weapon', w: a }, g);
      block(kind, 3, z, ...size, hp, { type: 'weapon', w: b }, g);
    }
    return z + 14;
  };

  // ---------- Danger segments ----------
  const D = {
    wave(z, f) {
      const rows = Math.max(1, Math.round(Math.min(24, 3 + 2 * k) * f));
      horde(-5.5, 5.5, z, rows, 14, Math.floor((k / 2) * f));
      return z + rows * 0.55 + 14;
    },
    // Fast, fragile soldiers that weave
    runners(z, f) {
      const c = Math.round(Math.min(70, 8 + 5 * k) * f);
      for (let i = 0; i < c; i++) foe('runner', (rng() - 0.5) * 10.5, z + rng() * 10);
      return z + 24;
    },
    // A wall of shields that stops bullets, a horde behind it
    shields(z, f) {
      for (let i = 0; i < 6; i++) foe('shield', -5 + i * 2, z);
      if (k >= 6 && f >= 1) for (let i = 0; i < 5; i++) foe('shield', -4 + i * 2, z + 1.2);
      const rows = Math.max(1, Math.round(Math.min(20, 3 + 2 * k) * f));
      horde(-5, 5, z + 2.4, rows, 12, 0);
      return z + rows * 0.55 + 16;
    },
    // Bombers run ahead of the horde: shoot them early and they blow up their friends
    bombers(z, f) {
      const rows = Math.max(1, Math.round(Math.min(18, 2 + 2 * k) * f));
      horde(-5, 5, z + 1, rows, 12, 0);
      const c = Math.round((3 + Math.min(7, k)) * f);
      for (let i = 0; i < c; i++) foe('bomber', (rng() - 0.5) * 10, z + rng() * rows * 0.55);
      return z + rows * 0.55 + 15;
    },
    // Marksmen who stand and fire slow shots you can sidestep
    snipers(z, f) {
      const c = Math.max(2, Math.round((3 + Math.min(4, Math.floor(k / 2))) * f));
      for (let i = 0; i < c; i++) foe('shooter', -5 + (10 * (i + 0.5)) / c + (rng() - 0.5) * 0.8, z + 6 + rng() * 3);
      horde(-5, 5, z, Math.max(1, Math.round((1 + Math.floor(k / 2)) * f)), 10, 0);
      return z + 22;
    },
    // Saw blades sweeping across the road
    saws(z) {
      const c = 2 + Math.min(3, Math.floor(k / 2));
      // Each blade sweeps one half of the road, so there is always a side to go to, whatever the squad size
      let side = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < c; i++) {
        L.hazards.push({ kind: 'saw', x0: side * 2.9, z: z + i * 7, amp: 2.3, period: Math.max(1.3, 2.2 - 0.07 * k), phase: i * 2.1 + rng() * 0.6, r: 0.95 });
        if (rng() < 0.7) side = -side;
      }
      gate(pick([-3.6, 3.6]), z + c * 7 - 3.5, 4, '+', 5 + 3 * k, { yellow: true });
      for (let i = 0; i < c * 3; i++) coin(4.2 * Math.sin(i * 0.9), z + 2 + i * 2.2);
      return z + c * 7 + 6;
    },
    // Spike strips to slalom around
    spikes(z) {
      const c = 3 + Math.min(3, Math.floor(k / 2));
      let side = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < c; i++) {
        const zz = z + i * 8;
        const r = rng();
        if (k >= 2 && r < 0.2) L.hazards.push({ kind: 'spikes', x: 0, z: zz, w: 6, d: 1.1 });
        else if (k >= 2 && r < 0.4) for (const s of [-1, 1]) L.hazards.push({ kind: 'spikes', x: s * 4.3, z: zz, w: 3.4, d: 1.1 });
        else { L.hazards.push({ kind: 'spikes', x: side * 2.6, z: zz, w: 6.8, d: 1.1 }); side = -side; }
      }
      return z + c * 8 + 4;
    },
    // Spiked iron balls rolling down the road: bullets bounce off, step aside.
    // They only show up when they start rolling, well before their resting place.
    boulders(z) {
      const c = 4 + Math.min(6, k);
      let last = 9;
      for (let i = 0; i < c; i++) {
        let x;
        do x = pick([-4.5, -1.5, 1.5, 4.5]); while (x === last);
        last = x;
        foe('boulder', x, z + 26 + i * 7.5);
        coin(-x, z + 3 + i * 7.5);
      }
      return z + c * 7.5 + 10;
    },

    // The road forks: an easy side with small rewards, a guarded side with big ones
    fork(z, f) {
      const len = 40, z1 = z + len;
      const m = rng() < 0.5 ? -1 : 1;
      L.sections.push({ kind: 'fork', z0: z, z1, walls: [0], lanes: [[-ROAD_HALF, -LANE_WALL], [LANE_WALL, ROAD_HALF]], easyX: -3 * m, hardX: 3 * m });
      const side = (s, a, b) => (s > 0 ? [a, b] : [-b, -a]);
      // Easy side
      horde(...side(-m, 0.6, 5.6), z + 10, Math.max(1, Math.round((1 + k / 2) * f)), 8, 0);
      gate(-3 * m, z + 22, 5.2, '+', 4 + 2 * k);
      gate(-3 * m, z + 32, 5.2, '+', 4 + 2 * k);
      // Hard side: shields, brutes, a horde, then the loot
      for (let i = 0; i < 3; i++) foe('shield', m * (1.3 + i * 1.7), z + 8);
      for (let i = 0; i < Math.min(6, 2 + Math.floor(k / 2)); i++) foe('brute', m * (1 + rng() * 4.4), z + 11 + rng() * 3);
      horde(...side(m, 0.6, 5.6), z + 15, Math.max(2, Math.round((4 + 2 * k) * f)), 8, 0);
      for (let i = 0; i < 8; i++) coin(m * (1.6 + (i % 2) * 2.8), z + 6 + i * 2.6);
      block('jar', m * 1.8, z + 31, 2.2, 2.2, 30 + 30 * k, { type: 'add', v: 24 + 10 * k });
      gate(m * 4.2, z + 33, 3.2, '+', 30 + 14 * k, { yellow: true });
      return z1 + 12;
    },
    // Walls sliding in from both sides, leaving a gap that moves from one pair to the next
    walls(z) {
      const c = 3 + Math.min(3, Math.floor(k / 3));
      let last = 9;
      for (let i = 0; i < c; i++) {
        let x;
        do x = pick([-3, 0, 3]); while (x === last);
        last = x;
        L.hazards.push({ kind: 'walls', c: x, z: z + i * 9, d: 1.5, min: Math.max(2.75, 3.2 - 0.05 * k), period: Math.max(2, 3.2 - 0.08 * k), phase: rng() * 6.28 });
        for (let j = 0; j < 3; j++) coin(x, z + i * 9 - 1.5 + j * 1.5);
      }
      return z + c * 9 + 4;
    },
  };

  // ---------- Growth segments ----------
  let mults = 0;
  const maxMults = n >= 6 ? 2 : 1;
  const G = {
    pair(z, m) {
      gatePair(z, ['+', Math.round((12 + 5 * k) * m), false], ['-', -Math.round((6 + 3 * k) * m), true]);
      return z + 16;
    },
    mult(z, m) {
      mults++;
      gatePair(z, ['x', 2], ['+', Math.round((18 + 8 * k) * m), false]);
      return z + 16;
    },
    triple(z, m) {
      const g = group++;
      const mid = mults < maxMults ? (mults++, ['x', 2]) : ['+', Math.round((16 + 6 * k) * m)];
      const opts = [['+', Math.round((8 + 4 * k) * m)], mid, ['-', -Math.round((8 + 3 * k) * m), true]];
      for (let i = 2; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      opts.forEach((o, i) => gate(-4 + i * 4, z, 3.8, o[0], o[1], { group: g, shootable: o[2] }));
      return z + 16;
    },
    // A big yellow gate sliding from side to side
    moving(z, m) {
      gate(0, z, 3.8, '+', Math.round((14 + 6 * k) * m), { yellow: true, move: { amp: 3.9, period: Math.max(2.2, 3.4 - 0.08 * k), phase: rng() * 6.28 } });
      return z + 14;
    },
    jar(z, m) {
      const side = rng() < 0.5 ? -1 : 1;
      block('jar', 3 * side, z, 2.2, 2.2, (12 + 14 * k) * m, { type: 'add', v: Math.round((10 + 4 * k) * m) });
      gate(-3.4 * side, z + 2, 4, '+', 4 + 2 * k);
      return z + 14;
    },
    power(z) {
      block('power', pick([-3, 0, 3]), z, 1.8, 1.8, 16 + 18 * k, { type: pick(['rage', 'shield', 'bomb']) });
      return z + 13;
    },
  };

  const unlocked = (table) => Object.keys(table).filter((id) => table[id] <= n);
  const fresh = (table) => Object.keys(table).filter((id) => table[id] === n);

  let z = 14;
  // Opening choice, then a first gun and a jar of prisoners
  gatePair(z, ['+', 14 + 3 * k], ['x', 2]);
  z += 15;
  {
    const z0 = z, i0 = L.blocks.length;
    z = weapon(z, 0);
    const bx = L.blocks[i0].x;
    if (L.blocks.length === i0 + 1) block('jar', bx > 0 ? -3 : 3, z0 + 3, 2.2, 2.2, 12 + 14 * k, { type: 'add', v: 10 + 4 * k });
    else block('jar', 0, z0 + 5, 2.2, 2.2, 12 + 14 * k, { type: 'add', v: 10 + 4 * k });
  }
  z += 2;

  // Middle: danger then growth, with the lanes and the better guns at fixed points
  const N = 3 + Math.min(4, Math.floor(k / 2));
  const dq = fresh(DANGERS).filter((d) => d !== 'wave');
  const gq = fresh(GROWTHS).filter((g) => g !== 'pair');
  let lastD = '', lastG = '';
  for (let i = 0; i < N; i++) {
    const m = 1 + i * 0.3;
    let d = dq.shift();
    if (!d) do d = pick(unlocked(DANGERS)); while (d === lastD);
    lastD = d;
    z = D[d](z, Math.min(1, 0.3 + 0.35 * i));
    if (i === Math.floor(N / 2)) z = weapon(z, 1);
    let g = gq.shift();
    if (!g) do g = pick(unlocked(GROWTHS)); while (g === lastG || (g === 'mult' && mults >= maxMults));
    lastG = g;
    z = G[g](z, m);
    if (i === 0) z = lanes(z, 62, 20 + 5 * k, 90 + 110 * k, pick([8, 10, 12]) + 4 * k) + 14;
    if (n >= 3 && i === N - 2) z = lanes(z, 54, 22 + 6 * k, 200 + 150 * k, 15 + 6 * k) + 14;
    // Late levels offer the top guns twice: switch, or take the same one again for a star
    if (n >= 6 && i === N - 2) z = weapon(z, 2);
  }
  if (n >= 4) z = weapon(z, 2);

  // Big wave, then the boss and its guards
  horde(-5.5, 5.5, z, 9 + 3 * k, 14, 1 + Math.floor(k / 2));
  z += 22;
  horde(-4, 4, z, 4 + 2 * k, 10, 0);
  z += 16;
  const type = bossType(n);
  const big = type === 'titan';
  L.boss = { x: 0, z, hp: Math.round(500 * (1 + k) ** 1.7 * (big ? 1.4 : 1)), big, type };
  L.length = z + 12;

  // Scenery changes along the way: two or three stretches, each with its own theme
  const nz = L.length > 430 ? 3 : 2;
  L.zones = [];
  let th = L.theme;
  for (let i = 0; i < nz; i++) {
    L.zones.push({ z0: (L.length * i) / nz, z1: (L.length * (i + 1)) / nz, theme: th });
    const prev = th;
    do th = pick(THEMES); while (th === prev);
  }

  // Road width from level 3 on: wide, normal, narrow, normal, and round again
  L.half = n < 3 ? ROAD_HALF : [7.5, ROAD_HALF, 5, ROAD_HALF][(n - 3) % 4];
  const f = L.half / ROAD_HALF;
  if (f !== 1) {
    for (const g of L.gates) { g.x *= f; g.w *= f; if (g.move) g.move.amp *= f; }
    for (const b of L.blocks) { b.x *= f; if (b.kind === 'barrier') b.w *= f; }
    for (const e of L.enemies) e.x *= f;
    for (const c of L.coins) c.x *= f;
    for (const h of L.hazards) {
      if (h.kind === 'saw') { h.x0 *= f; h.amp *= f; }
      else if (h.kind === 'walls') { h.c *= f; h.min *= f; }
      else { h.x *= f; h.w *= f; }
    }
    for (const s of L.sections) {
      s.walls = s.walls.map((w) => w * f);
      s.lanes = s.lanes.map(([a, b]) => [a * f, b * f]);
      if (s.kind === 'fork') { s.easyX *= f; s.hardX *= f; }
    }
  }
  return L;
}

// Coin rush between two levels: no enemies, no boss, a trail of coins weaving around saws and spikes.
export function buildBonus(n) {
  const rng = mulberry32(n * 4409 + 5);
  const k = n - 1;
  const L = { n, bonus: true, theme: THEMES[k % THEMES.length], gates: [], blocks: [], enemies: [], hazards: [], coins: [], sections: [], boss: null, length: 0 };
  const v = 1 + Math.floor(k / 3);
  const amp = 4.3, wl = 9 + rng() * 3, ph = rng() * 6.28;
  const path = (z) => amp * Math.sin(z / wl + ph);
  const end = 215;
  for (let z = 12; z < end; z += 2.2) L.coins.push({ x: path(z), z, v });
  // Hazards sit off the trail, where a lazy line would cut the corner
  for (let z = 30; z < end - 10; z += 13 + rng() * 6) {
    const x = path(z);
    if (Math.abs(x) < 2) continue; // the trail is crossing the road: no room for a trap beside it
    const o = x > 0 ? -1 : 1; // traps on the half of the road the trail is not on
    if (rng() < 0.5) L.hazards.push({ kind: 'spikes', x: o * 3, z, w: 5.8, d: 1.1 });
    else L.hazards.push({ kind: 'saw', x0: o * 2.6, z, amp: 2.4, period: 2.2, phase: rng() * 6.28, r: 0.95 });
    // A handful of extra coins behind the hazard for the brave
    for (let i = 0; i < 4; i++) L.coins.push({ x: o * (2.5 + (i % 2) * 1.6), z: z + 2.5 + Math.floor(i / 2) * 1.6, v: v * 2 });
  }
  let gid = 0;
  for (let z = 50; z < end; z += 55) L.gates.push({ id: gid++, x: path(z), z, w: 3.6, op: '+', v: 10 + 4 * k, group: -1, shootable: false, yellow: true, move: null });
  L.half = ROAD_HALF;
  L.zones = [{ z0: 0, z1: end + 20, theme: L.theme }];
  L.finish = end + 8;
  L.length = end + 20;
  L.boss = { x: 0, z: L.finish, hp: 1, big: false, type: 'none' };
  return L;
}
