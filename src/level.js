// Procedural level generator. Pure data, no rendering: used by the game and the headless tests.
// The road runs along +z, x is across (−ROAD_HALF … +ROAD_HALF).

export const ROAD_HALF = 6;
export const THEMES = ['desert', 'bridge', 'snow'];
const LANE_WALL = 0.16; // half thickness of a lane wall

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildLevel(n) {
  const rng = mulberry32(n * 9973 + 17);
  const k = n - 1;
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const L = { n, theme: THEMES[k % THEMES.length], gates: [], blocks: [], enemies: [], sections: [], boss: null, length: 0 };
  let gid = 0, group = 0;

  const gate = (x, z, w, op, v, opts = {}) => L.gates.push({ id: gid++, x, z, w, op, v, group: opts.group ?? -1, shootable: !!opts.shootable, yellow: !!opts.yellow });
  const block = (kind, x, z, w, d, hp, reward) => L.blocks.push({ kind, x, z, w, d, hp: Math.round(hp), reward });
  const horde = (x0, x1, z0, rows, perRow, brutes = 0) => {
    const sp = (x1 - x0) / perRow;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < perRow; c++)
        L.enemies.push({ x: x0 + sp * (c + 0.5) + (rng() - 0.5) * 0.12, z: z0 + r * 0.55 + (rng() - 0.5) * 0.12, kind: 'grunt' });
    for (let b = 0; b < brutes; b++) L.enemies.push({ x: x0 + (x1 - x0) * rng(), z: z0 - 1.5 - rng() * 2, kind: 'brute' });
  };

  // Choice of two gates side by side: only one can be taken.
  const gatePair = (z, a, b) => {
    const g = group++;
    const swap = rng() < 0.5;
    const [l, r] = swap ? [b, a] : [a, b];
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

  let z = 14;
  // 1. Opening choice
  gatePair(z, ['+', 14 + 3 * k], ['x', 2]);
  z += 15;
  // 2. Barrel with a gun, a jar with prisoners
  {
    const side = rng() < 0.5 ? -1 : 1;
    block('barrel', 2.8 * side, z, 1.6, 1.6, 8 + 10 * k, { type: 'weapon' });
    block('jar', -3 * side, z + 3, 2.2, 2.2, 12 + 14 * k, { type: 'add', v: 10 + 4 * k });
  }
  z += 16;
  // 3. First small wave
  horde(-4, 4, z, 1 + Math.floor(k / 2), 8, 0);
  z += 18;
  // 4. A good gate and a bad one you can shoot up
  gatePair(z, ['+', 15 + 5 * k, false], ['-', -(6 + 3 * k), true]);
  z += 12;
  // 5. Lanes
  z = lanes(z, 62, 20 + 5 * k, 90 + 110 * k, pick([8, 10, 12]) + 4 * k) + 14;
  // 6. Ice crate with a better gun, and a multiplier choice
  block('crate', pick([-3, 0, 3]), z, 2, 1.8, 40 + 35 * k, { type: 'weapon' });
  z += 12;
  gatePair(z, n >= 4 ? ['x', 2] : ['-', -(8 + 2 * k), true], ['+', 20 + 8 * k, false]);
  z += 16;
  // 7. Big wave
  horde(-5.5, 5.5, z, 9 + 3 * k, 14, 1 + Math.floor(k / 2));
  z += 22;
  // 8. From level 3, a second lanes section
  if (n >= 3) {
    z = lanes(z, 54, 22 + 6 * k, 200 + 150 * k, 15 + 6 * k) + 14;
    gatePair(z, ['-', -(10 + 4 * k), true], ['+', 20 + 6 * k, false]);
    z += 16;
  }
  if (n >= 5) {
    block('barrel', -3, z, 1.6, 1.6, 30 + 20 * k, { type: 'weapon' });
    block('jar', 3, z, 2.2, 2.2, 60 + 30 * k, { type: 'add', v: 25 + 8 * k });
    z += 14;
    horde(-5.5, 5.5, z, 10 + 3 * k, 14, 2 + Math.floor(k / 2));
    z += 22;
  }
  // 9. Boss and its guards
  horde(-4, 4, z, 4 + 2 * k, 10, 0);
  z += 16;
  const big = n % 5 === 0;
  L.boss = { x: 0, z, hp: Math.round(500 * (1 + k) ** 1.7 * (big ? 1.4 : 1)), big };
  L.length = z + 12;
  return L;
}
