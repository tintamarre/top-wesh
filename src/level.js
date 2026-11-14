// Procedural level generator. Pure data, no rendering: used by the game and the headless tests.
// The road runs along +z, x is across (−ROAD_HALF … +ROAD_HALF).
// A level is an opening, then pairs of "danger" segments (waves, hazards) and "growth" segments
// (gates, jars, guns, power-ups) drawn from pools that open up with the level number, then the boss.

export const ROAD_HALF = 6;
export const THEMES = ['desert', 'bridge', 'snow'];
const LANE_WALL = 0.16; // half thickness of a lane wall

// Guns offered at the first, second and third pick-up of a level (indexes into WEAPONS, sim.js)
export const WEAPON_TIERS = [[1, 2], [3, 4, 5], [6, 7]];

// Level at which each danger segment first appears
const DANGERS = { wave: 1, spikes: 1, saws: 2, runners: 2, boulders: 3, shields: 3, bombers: 4, snipers: 4 };
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
  const L = { n, theme: THEMES[k % THEMES.length], gates: [], blocks: [], enemies: [], hazards: [], sections: [], boss: null, length: 0 };
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
      for (let i = 0; i < c; i++)
        L.hazards.push({ kind: 'saw', x0: 0, z: z + i * 7, amp: 4.6, period: Math.max(1.7, 2.9 - 0.1 * k), phase: i * 2.1 + rng() * 0.6, r: 0.95 });
      gate(pick([-3.6, 3.6]), z + c * 7 - 3.5, 4, '+', 5 + 3 * k, { yellow: true });
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
        foe('boulder', x, z + 26 + i * 5.5);
      }
      return z + c * 5.5 + 10;
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
  return L;
}
