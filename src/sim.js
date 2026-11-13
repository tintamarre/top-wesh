// Game logic, independent of rendering, so the headless tests can play whole levels.
import { ROAD_HALF, mulberry32 } from './level.js';

export const WEAPONS = [
  { name: 'Pistol', dmg: 1, rate: 0.6, color: 0xffd34d },
  { name: 'SMG', dmg: 1, rate: 1.0, color: 0xffa634 },
  { name: 'Rifle', dmg: 2, rate: 0.8, color: 0x6ff2ff },
  { name: 'Minigun', dmg: 2, rate: 1.4, color: 0x8dff5a },
  { name: 'Laser', dmg: 4, rate: 1.3, color: 0xff5cf0 },
];

export const RUN_SPEED = 7;
export const BULLET_SPEED = 42;
const BULLET_RANGE = 19;
const MAX_EMITTERS = 80;
const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle
const ENEMY = {
  grunt: { speed: 4.4, r: 0.36, power: 1, coins: 0.15 },
  brute: { speed: 3.2, r: 0.6, power: 4, coins: 2 },
};

// Spacing of the sunflower formation, tighter for very large squads so they still fit the road.
export const spacing = (n) => (n <= 450 ? 0.25 : 0.25 * Math.sqrt(450 / n));
export const radius = (n) => spacing(n) * Math.sqrt(Math.max(1, n)) + 0.22;

// Slot i of the formation, relative to the squad centre, before the lane squeeze.
export function slot(i, n, out) {
  const r = spacing(n) * Math.sqrt(i + 0.5);
  const a = i * GA;
  out.x = r * Math.cos(a);
  out.z = r * Math.sin(a);
  return out;
}

export class Sim {
  constructor(level, opts = {}) {
    this.L = level;
    const k = level.n - 1;
    this.k = k;
    this.rng = mulberry32(level.n * 31 + 7 + (opts.seed ?? 0));
    this.dmgMul = opts.dmgMul ?? 1;
    this.rateMul = opts.rateMul ?? 1;
    this.squad = { x: 0, z: 0, prevZ: 0, count: opts.start ?? 1, targetX: 0, speed: 0, scale: 1, lane: null, R: 0.5, Rx: 0.5, Rz: 0.5, engaged: false };
    this.weapon = 0;
    // A gate you can shoot climbs one step per hit, up to the opposite of where it started
    this.gates = level.gates.map((g) => ({ ...g, used: false, acc: 0, step: 2 + k * 0.6, max: Math.max(5, Math.abs(g.v)) }));
    this.blocks = level.blocks.map((b) => ({ ...b, maxHp: b.hp, alive: true }));
    const gruntHp = 1 + 0.6 * k;
    this.enemies = level.enemies.map((e) => {
      const hp = e.kind === 'brute' ? 16 + 14 * k : gruntHp;
      return { ...e, hp, maxHp: hp, alive: true, active: false, ...ENEMY[e.kind], phase: this.rng() * 6.28 };
    });
    const B = level.boss;
    this.boss = { x: B.x, z: B.z, hp: B.hp, maxHp: B.hp, big: B.big, alive: true, active: false, state: 'idle', t: 0, cool: 1.5, power: Math.round(8 + 4 * k + (B.big ? 10 : 0)), smashR: B.big ? 2.6 : 2.2 };
    this.bullets = [];
    this.events = [];
    this.time = 0;
    this.state = 'play';
    this.endT = 0;
    this.coins = 0;
    this.kills = 0;
    this.lostTotal = 0;
    this.shotAcc = 0;
    this.peak = this.squad.count;
    this._buckets = new Map();
    this._tmp = { x: 0, z: 0 };
  }

  emit(e) { this.events.push(e); }

  get weaponInfo() { return WEAPONS[this.weapon]; }

  sectionAt(z) {
    for (const s of this.L.sections) if (z >= s.z0 && z <= s.z1) return s;
    return null;
  }

  laneIndex(s, x) {
    let best = 0, bd = 1e9;
    s.lanes.forEach(([a, b], i) => {
      const d = x < a ? a - x : x > b ? x - b : 0;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  // Lane id of a point: -1 outside any section, else section index * 10 + lane
  regionOf(x, z) {
    const secs = this.L.sections;
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i];
      if (z >= s.z0 && z <= s.z1) return i * 10 + this.laneIndex(s, x);
    }
    return -1;
  }

  squadRegion() {
    const q = this.squad;
    if (!q.lane) return -1;
    return this.L.sections.indexOf(q.lane.s) * 10 + q.lane.i;
  }

  // World position of soldier i
  soldierPos(i, out = this._tmp) {
    const q = this.squad;
    slot(i, q.count, out);
    out.x = q.x + out.x * q.scale;
    out.z = q.z + out.z / q.scale;
    return out;
  }

  update(dt) {
    if (this.state === 'won' || this.state === 'lost') return;
    this.time += dt;
    if (this.state === 'ending') {
      this.endT -= dt;
      this.updateBullets(dt);
      if (this.endT <= 0) this.state = this.endState;
      return;
    }
    this.updateSquad(dt);
    this.updateGates();
    this.shoot(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.peak = Math.max(this.peak, this.squad.count);
    if (this.squad.count <= 0) this.finish('lost');
  }

  finish(s) {
    if (this.state !== 'play') return;
    this.state = 'ending';
    this.endState = s;
    this.endT = s === 'won' ? 1.6 : 1.2;
    this.emit({ type: s === 'won' ? 'victory' : 'defeat' });
  }

  updateSquad(dt) {
    const q = this.squad;
    const R = radius(q.count);
    q.R = R;
    // Lanes: squeeze the formation to the lane width
    let bounds = [-ROAD_HALF, ROAD_HALF];
    if (q.lane && q.z - q.Rz > q.lane.s.z1) q.lane = null;
    if (!q.lane) {
      for (const s of this.L.sections)
        if (q.z + q.Rz >= s.z0 - 0.3 && q.z - q.Rz < s.z1) { q.lane = { s, i: this.laneIndex(s, q.x) }; break; }
    }
    if (q.lane) bounds = q.lane.s.lanes[q.lane.i];
    const half = (bounds[1] - bounds[0]) / 2 - 0.12;
    const want = Math.max(0.28, Math.min(1, half / R));
    q.scale += (want - q.scale) * Math.min(1, dt * 6);
    q.Rx = R * q.scale;
    q.Rz = R / q.scale;
    // Steering
    const lo = bounds[0] + Math.min(q.Rx, half), hi = bounds[1] - Math.min(q.Rx, half);
    const tx = Math.max(lo, Math.min(hi, q.targetX));
    const maxStep = 16 * dt;
    q.x += Math.max(-maxStep, Math.min(maxStep, tx - q.x));
    if (q.x < lo || q.x > hi) q.x += (Math.max(lo, Math.min(hi, q.x)) - q.x) * Math.min(1, dt * 14);

    // Forward: stop to fight enemies ahead or when something blocks the way
    let front = q.z + q.Rz;
    let limit = Infinity;
    for (const b of this.blocks) {
      if (!b.alive || b.z < q.z) continue;
      if (Math.abs(b.x - q.x) < b.w / 2 + q.Rx * 0.7) limit = Math.min(limit, b.z - b.d / 2 - 0.05);
    }
    const B = this.boss;
    if (B.alive) limit = Math.min(limit, B.z - 1.5);
    let engaged = false;
    const reg = this.squadRegion();
    for (const e of this.enemies) {
      if (!e.alive || !e.active) continue;
      const ahead = e.z - front;
      if (ahead > -1 && ahead < 6 && Math.abs(e.x - q.x) < q.Rx + 3 && this.regionOf(e.x, e.z) === reg) { engaged = true; break; }
    }
    if (B.alive && B.z - front < 13) engaged = true;
    q.engaged = engaged;
    const wantSpeed = engaged ? 0 : RUN_SPEED;
    q.speed += (wantSpeed - q.speed) * Math.min(1, dt * 5);
    q.prevZ = q.z;
    let nz = q.z + q.speed * dt;
    if (nz + q.Rz > limit) { nz = Math.max(q.z, limit - q.Rz); q.speed = 0; q.blocked = true; } else q.blocked = false;
    q.z = nz;
  }

  updateGates() {
    const q = this.squad;
    for (const g of this.gates) {
      if (g.used) continue;
      if (q.prevZ < g.z && q.z >= g.z && Math.abs(q.x - g.x) < g.w / 2) {
        const before = q.count;
        if (g.op === 'x') q.count = Math.floor(q.count * g.v);
        else q.count = Math.max(0, q.count + Math.round(g.v));
        g.used = true;
        if (g.group >= 0) for (const o of this.gates) if (o.group === g.group && o !== g) { o.used = true; o.skipped = true; }
        this.emit({ type: 'gate', gate: g, delta: q.count - before, x: g.x, z: g.z });
      }
    }
  }

  shoot(dt) {
    const q = this.squad;
    if (q.count <= 0) return;
    const W = WEAPONS[this.weapon];
    const emitters = Math.min(q.count, MAX_EMITTERS);
    const rate = W.rate * this.rateMul;
    const dmg = (W.dmg * this.dmgMul * q.count) / emitters;
    this.shotAcc += emitters * rate * dt;
    let fired = 0;
    // Soldiers aim at the closest enemies ahead (a little auto-aim, like the arcade originals)
    const threats = this._threats || (this._threats = []);
    threats.length = 0;
    if (this.shotAcc >= 1) {
      const reg = this.squadRegion();
      const front = q.z + q.Rz;
      for (const e of this.enemies) {
        if (!e.alive || !e.active) continue;
        const ahead = e.z - front;
        if (ahead < -0.5 || ahead > 15) continue;
        if (Math.abs(e.x - q.x) > 7 || this.regionOf(e.x, e.z) !== reg) continue;
        threats.push(e);
      }
      if (threats.length > 14) { threats.sort((a, b) => a.z - b.z); threats.length = 14; }
    }
    while (this.shotAcc >= 1) {
      this.shotAcc -= 1;
      const p = this.soldierPos(Math.floor(this.rng() * q.count));
      let slope = (this.rng() - 0.5) * 0.03;
      if (threats.length) {
        const e = threats[Math.floor(this.rng() * threats.length)];
        slope = Math.max(-0.45, Math.min(0.45, (e.x - p.x) / Math.max(1.5, e.z - p.z)));
      }
      this.bullets.push({ x: p.x, z: p.z + 0.35, slope, end: p.z + BULLET_RANGE, dmg, alive: true });
      fired++;
    }
    if (fired) this.emit({ type: 'shot', n: fired });
  }

  updateBullets(dt) {
    // Bucket the enemies by integer z
    const bk = this._buckets;
    bk.clear();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const key = Math.floor(e.z);
      let a = bk.get(key);
      if (!a) bk.set(key, (a = []));
      a.push(e);
    }
    const B = this.boss;
    const hits = [];
    for (const b of this.bullets) {
      if (!b.alive) continue;
      const z0 = b.z, z1 = b.z + BULLET_SPEED * dt;
      const x0 = b.x;
      b.x += b.slope * (z1 - z0);
      hits.length = 0;
      // Solid things stop the bullet
      let stopZ = Infinity, stop = null;
      for (const o of this.blocks) {
        if (!o.alive || Math.abs(o.x - b.x) > o.w / 2) continue;
        const f = o.z - o.d / 2;
        if (z1 >= f && z0 <= o.z + o.d / 2 && f < stopZ) { stopZ = Math.max(z0, f); stop = o; }
      }
      for (const g of this.gates) {
        if (g.used || !g.shootable || Math.abs(g.x - b.x) > g.w / 2) continue;
        if (g.z > z0 && g.z <= z1 && g.z < stopZ) { stopZ = g.z; stop = g; }
      }
      if (B.alive && B.active && Math.abs(B.x - b.x) < (B.big ? 2 : 1.6)) {
        const f = B.z - 0.9;
        if (z1 >= f && z0 <= B.z + 0.9 && f < stopZ) { stopZ = Math.max(z0, f); stop = B; }
      }
      // Enemies before that: the bullet goes through as long as it has damage left
      for (let key = Math.floor(z0 - 0.6); key <= Math.floor(Math.min(z1, stopZ)); key++) {
        const a = bk.get(key);
        if (!a) continue;
        for (const e of a) if (e.alive && e.z >= z0 - 0.6 && e.z <= z1 && Math.abs(e.x - (x0 + b.slope * (e.z - z0))) < e.r) hits.push(e);
      }
      if (hits.length > 1) hits.sort((p, q) => p.z - q.z);
      for (const e of hits) {
        if (!e.alive) continue;
        const d = Math.min(b.dmg, e.hp);
        e.hp -= d;
        b.dmg -= d;
        if (e.hp <= 1e-6) this.killEnemy(e, true);
        else this.emit({ type: 'hit', x: e.x, z: e.z });
        if (b.dmg <= 1e-6) { b.alive = false; break; }
      }
      if (!b.alive) continue;
      if (stop && z1 >= stopZ) {
        b.alive = false;
        if (stop === B) this.hitBoss(b.dmg);
        else if (stop.kind) this.hitBlock(stop, b.dmg);
        else this.hitGate(stop, b.dmg);
        continue;
      }
      b.z = z1;
      if (b.z > b.end) b.alive = false;
    }
    let j = 0;
    for (const b of this.bullets) if (b.alive) this.bullets[j++] = b;
    this.bullets.length = j;
  }

  killEnemy(e, byBullet) {
    e.alive = false;
    if (byBullet) { this.coins += e.coins; this.kills++; }
    this.emit({ type: 'kill', x: e.x, z: e.z, kind: e.kind, byBullet });
  }

  hitBlock(o, d) {
    o.hp -= d;
    this.emit({ type: 'blockHit', block: o });
    if (o.hp <= 0) {
      o.alive = false;
      o.hp = 0;
      const r = o.reward;
      let text = '';
      if (r.type === 'weapon') {
        if (this.weapon < WEAPONS.length - 1) this.weapon++;
        text = WEAPONS[this.weapon].name.toUpperCase() + '!';
      } else if (r.type === 'add') {
        this.squad.count += r.v;
        text = '+' + r.v;
      } else if (r.type === 'coins') {
        this.coins += r.v;
        text = '+' + r.v + ' ¢';
      }
      this.emit({ type: 'break', block: o, text });
    }
  }

  hitGate(g, d) {
    g.acc += d;
    let changed = false;
    while (g.acc >= g.step) {
      g.acc -= g.step;
      if (g.op === 'x' || g.v >= g.max) { g.acc = 0; break; }
      g.v += 1;
      changed = true;
    }
    if (changed) this.emit({ type: 'gateUp', gate: g });
  }

  hitBoss(d) {
    const B = this.boss;
    B.hp -= d;
    if (B.hp <= 0 && B.alive) {
      B.hp = 0;
      B.alive = false;
      B.state = 'dead';
      this.coins += 20 + 10 * this.k;
      this.emit({ type: 'bossDead', x: B.x, z: B.z });
      this.finish('won');
    }
  }

  updateEnemies(dt) {
    const q = this.squad;
    const reg = this.squadRegion();
    const sx = q.x, sz = q.z;
    const ex2 = q.Rx + 0.25, ez2 = q.Rz + 0.25;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!e.active) {
        if (e.z - sz < 30) e.active = true;
        else continue;
      }
      const dz = sz - e.z;
      if (dz > 18) { e.alive = false; continue; } // left far behind: they give up
      let vz = dz < 0 ? -e.speed : e.speed * 0.9;
      const tx = Math.max(sx - q.Rx * 0.85, Math.min(sx + q.Rx * 0.85, e.x));
      let vx = Math.max(-2.2, Math.min(2.2, (tx - e.x) * 1.4));
      if (Math.abs(dz) > 16) vx *= 0.3;
      e.x += vx * dt;
      e.z += vz * dt;
      const s = this.sectionAt(e.z);
      if (s) {
        const [a, b] = s.lanes[this.laneIndex(s, e.x)];
        e.x = Math.max(a + 0.2, Math.min(b - 0.2, e.x));
      } else e.x = Math.max(-ROAD_HALF + 0.2, Math.min(ROAD_HALF - 0.2, e.x));
      // Contact with the squad: one for one
      const nx = (e.x - sx) / (ex2 + e.r * 0.5), nz = (e.z - sz) / (ez2 + e.r * 0.5);
      if (nx * nx + nz * nz < 1 && this.regionOf(e.x, e.z) === reg) {
        const lost = Math.min(q.count, e.power);
        q.count -= lost;
        this.lostTotal += lost;
        this.killEnemy(e, false);
        this.emit({ type: 'lost', n: lost, x: e.x, z: e.z });
        if (q.count <= 0) return;
      }
    }
  }

  updateBoss(dt) {
    const B = this.boss, q = this.squad;
    if (!B.alive) return;
    if (!B.active) {
      if (B.z - q.z < 32) { B.active = true; this.emit({ type: 'bossWake' }); }
      return;
    }
    const front = q.z + q.Rz;
    const gap = B.z - front;
    B.cool -= dt;
    if (B.state === 'idle' || B.state === 'walk') {
      if (gap > 2.4) {
        B.state = 'walk';
        B.z -= (B.big ? 1.3 : 1.6) * dt;
        B.x += Math.max(-1.2 * dt, Math.min(1.2 * dt, q.x - B.x));
      } else B.state = 'idle';
      if (gap < 3.4 && B.cool <= 0) { B.state = 'windup'; B.t = 0.85; this.emit({ type: 'windup' }); }
    } else if (B.state === 'windup') {
      B.t -= dt;
      if (B.t <= 0) {
        B.state = 'smash';
        B.t = 0.45;
        const px = B.x, pz = B.z - 2.4;
        const r2 = B.smashR * B.smashR;
        let inside = 0;
        const p = { x: 0, z: 0 };
        for (let i = 0; i < q.count; i++) {
          this.soldierPos(i, p);
          if ((p.x - px) ** 2 + (p.z - pz) ** 2 < r2) inside++;
        }
        const lost = Math.min(inside, B.power);
        q.count -= lost;
        this.lostTotal += lost;
        this.emit({ type: 'smash', x: px, z: pz, r: B.smashR, n: lost });
      }
    } else if (B.state === 'smash') {
      B.t -= dt;
      if (B.t <= 0) { B.state = 'idle'; B.cool = B.big ? 1.6 : 1.9; }
    }
  }
}
