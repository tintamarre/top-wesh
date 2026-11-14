// Game logic, independent of rendering, so the headless tests can play whole levels.
import { ROAD_HALF, mulberry32 } from './level.js';

// pellets + fan: several bullets per shot, spread in a fan. pierce: goes through enemies at full damage.
// splash: explodes on the first thing it touches. shape: x, y, z scale of the tracer. sound: voice of the gun (audio.js).
// level.js refers to the guns by their position in this list (WEAPON_TIERS): add new ones at the end.
const W0 = { range: 19, speed: 42, spread: 0.015, pellets: 1, fan: 0, pierce: false, splash: 0, shape: [1, 1, 1], sound: 'pop' };
export const WEAPONS = [
  { ...W0, name: 'Pistol', icon: '🔫', dmg: 1, rate: 0.6, color: 0xffd34d },
  { ...W0, name: 'SMG', icon: '🔫', shape: [1, 1, 0.8], dmg: 1, rate: 1.05, spread: 0.05, color: 0xffa634 },
  { ...W0, name: 'Shotgun', icon: '💥', shape: [1.5, 1.5, 0.45], sound: 'blast', dmg: 0.5, rate: 0.62, pellets: 4, fan: 0.3, range: 12, color: 0xffe9a0 },
  { ...W0, name: 'Rifle', icon: '🎯', shape: [1.1, 1.1, 1.7], sound: 'crack', dmg: 2.2, rate: 0.8, range: 27, speed: 60, spread: 0.005, color: 0x6ff2ff },
  { ...W0, name: 'Minigun', icon: '🌀', shape: [0.9, 0.9, 0.7], dmg: 1, rate: 2.5, spread: 0.09, color: 0x8dff5a },
  { ...W0, name: 'Flamer', icon: '🔥', shape: [5, 3.5, 0.5], sound: 'roar', dmg: 0.55, rate: 3.4, range: 10, speed: 22, spread: 0.26, pierce: true, color: 0xff7a1a },
  { ...W0, name: 'Rockets', icon: '🚀', shape: [3, 3, 0.75], sound: 'whoosh', dmg: 4.5, rate: 0.5, speed: 27, range: 24, spread: 0.03, splash: 1.7, color: 0xff4d3d },
  { ...W0, name: 'Laser', icon: '⚡', shape: [1.4, 1.4, 2.8], sound: 'zap', dmg: 3.6, rate: 1.3, range: 27, speed: 75, spread: 0, pierce: true, color: 0xff5cf0 },
];

export const RUN_SPEED = 7;
const MAX_EMITTERS = 80;
const ORB_SPEED = 9;
const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle
const TAU = Math.PI * 2;

// hp = hp[0] + hp[1] * (level − 1)
const ENEMY = {
  grunt: { speed: 4.4, r: 0.36, power: 1, coins: 0.15, hp: [1, 0.6], wake: 30 },
  runner: { speed: 8.2, r: 0.3, power: 1, coins: 0.2, hp: [0.6, 0.35], wake: 32, weave: true },
  brute: { speed: 3.2, r: 0.6, power: 4, coins: 2, hp: [16, 14], wake: 30 },
  shield: { speed: 3, r: 0.55, power: 2, coins: 1, hp: [9, 7], wake: 30, blocks: true },
  bomber: { speed: 5.4, r: 0.42, power: 1, coins: 1, hp: [3, 2], wake: 30, blast: 1.9 },
  shooter: { speed: 0, r: 0.42, power: 1, coins: 1.5, hp: [6, 5], wake: 30, fires: true },
  boulder: { speed: 10, r: 1, power: 8, coins: 0, hp: [1, 0], wake: 46, straight: true, inv: true },
};

export const BOSS_NAMES = { crusher: 'CRUSHER', blaster: 'BLASTER', titan: 'TITAN' };

// Spacing of the sunflower formation, tighter for very large squads so there is always room to sidestep.
const SP = 0.21, FULL = 380;
export const spacing = (n) => (n <= FULL ? SP : SP * Math.sqrt(FULL / n));
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
    this.stars = 0; // picking the gun you already hold makes it stronger (late levels offer the top guns twice)
    this.rageT = 0; // double fire rate
    this.shieldT = 0; // no losses
    // A gate you can shoot climbs one step per hit, up to the opposite of where it started
    this.gates = level.gates.map((g) => ({ ...g, x0: g.x, used: false, acc: 0, step: 2 + k * 0.6, max: Math.max(5, Math.abs(g.v)) }));
    this.blocks = level.blocks.map((b) => ({ ...b, maxHp: b.hp, alive: true }));
    this.enemies = level.enemies.map((e) => this.makeEnemy(e));
    this.hazards = level.hazards.map((h) => ({ ...h, x: h.x ?? h.x0, cool: 0 }));
    this.shots = []; // enemy projectiles
    const B = level.boss;
    this.boss = {
      x: B.x, z: B.z, hp: B.hp, maxHp: B.hp, big: B.big, type: B.type ?? 'crusher', alive: true, active: false, enraged: false,
      state: 'idle', t: 0, cool: 1.5, summonT: 5, keep: B.type === 'blaster' ? 6 : 2.4,
      power: Math.round(8 + 4 * k + (B.big ? 10 : 0)), orbPower: 2 + Math.floor(k * 0.6), smashR: B.big ? 2.6 : 2.2,
    };
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
    this._p = { x: 0, z: 0 };
  }

  makeEnemy(e, active = false) {
    const T = ENEMY[e.kind];
    const hp = T.hp[0] + T.hp[1] * this.k;
    const o = { ...e, ...T, hp, maxHp: hp, alive: true, active, phase: this.rng() * 6.28, cool: 0.8 + this.rng() * 1.6, t: 0 };
    if (e.kind === 'boulder') o.power = 6 + 2 * this.k;
    return o;
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

  // Soldiers inside a rectangle (hw, hd: half sizes) or, with hd < 0, a circle of radius hw
  countInside(cx, cz, hw, hd = -1) {
    const q = this.squad, p = this._p;
    let n = 0;
    if (Math.abs(cx - q.x) > q.Rx + hw + 0.3 || Math.abs(cz - q.z) > q.Rz + Math.max(hw, hd) + 0.3) return 0;
    for (let i = 0; i < q.count; i++) {
      this.soldierPos(i, p);
      if (hd < 0) { if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < hw * hw) n++; }
      else if (Math.abs(p.x - cx) < hw && Math.abs(p.z - cz) < hd) n++;
    }
    return n;
  }

  // The squad loses n soldiers, unless the shield is up
  lose(n, x, z, why = 'enemy') {
    const q = this.squad;
    if (n <= 0 || q.count <= 0) return 0;
    if (this.shieldT > 0) { this.emit({ type: 'blocked', x, z }); return 0; }
    const lost = Math.min(q.count, Math.round(n));
    q.count -= lost;
    this.lostTotal += lost;
    this.emit({ type: 'lost', n: lost, x, z, why });
    return lost;
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
    if (this.rageT > 0) this.rageT -= dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    this.updateSquad(dt);
    this.updateGates();
    this.shoot(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updateHazards(dt);
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
      if (!e.alive || !e.active || e.straight) continue;
      const ahead = e.z - front;
      // Marksmen never walk in: only stop for the ones the squad can actually hit
      const side = e.fires ? q.Rx + 0.8 : q.Rx + 3;
      if (ahead > -1 && ahead < 6 && Math.abs(e.x - q.x) < side && this.regionOf(e.x, e.z) === reg) { engaged = true; break; }
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
      if (g.move) g.x = g.x0 + g.move.amp * Math.sin((this.time * TAU) / g.move.period + g.move.phase);
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
    const rate = W.rate * this.rateMul * (this.rageT > 0 ? 2 : 1);
    const dmg = (W.dmg * this.dmgMul * (1 + 0.25 * this.stars) * q.count) / emitters;
    this.shotAcc += emitters * rate * dt;
    let fired = 0;
    // Soldiers aim at the closest enemies ahead (a little auto-aim, like the arcade originals)
    const threats = this._threats || (this._threats = []);
    threats.length = 0;
    if (this.shotAcc >= 1) {
      const reg = this.squadRegion();
      const front = q.z + q.Rz;
      const reach = Math.min(15, W.range - 2);
      for (const e of this.enemies) {
        if (!e.alive || !e.active || e.inv) continue;
        const ahead = e.z - front;
        if (ahead < -0.5 || ahead > reach) continue;
        if (Math.abs(e.x - q.x) > 7 || this.regionOf(e.x, e.z) !== reg) continue;
        threats.push(e);
      }
      if (threats.length > 14) { threats.sort((a, b) => a.z - b.z); threats.length = 14; }
    }
    while (this.shotAcc >= 1) {
      this.shotAcc -= 1;
      const p = this.soldierPos(Math.floor(this.rng() * q.count));
      let aim = 0;
      if (threats.length) {
        const e = threats[Math.floor(this.rng() * threats.length)];
        aim = Math.max(-0.45, Math.min(0.45, (e.x - p.x) / Math.max(1.5, e.z - p.z)));
      }
      for (let j = 0; j < W.pellets; j++) {
        const fan = W.pellets > 1 ? W.fan * ((j / (W.pellets - 1)) * 2 - 1) : 0;
        const slope = aim + fan + (this.rng() - 0.5) * 2 * W.spread;
        this.bullets.push({ x: p.x, z: p.z + 0.35, slope, end: p.z + W.range * (0.85 + this.rng() * 0.15), dmg, alive: true, w: this.weapon, speed: W.speed, pierce: W.pierce, splash: W.splash, hitZ: -Infinity });
      }
      fired++;
    }
    if (fired) this.emit({ type: 'shot', n: fired, w: this.weapon });
  }

  updateBullets(dt) {
    // Bucket the enemies by integer z
    const bk = this._buckets;
    bk.clear();
    for (const e of this.enemies) {
      if (!e.alive || (e.straight && !e.active)) continue;
      const key = Math.floor(e.z);
      let a = bk.get(key);
      if (!a) bk.set(key, (a = []));
      a.push(e);
    }
    const B = this.boss;
    const hits = [];
    for (const b of this.bullets) {
      if (!b.alive) continue;
      const z0 = b.z, z1 = b.z + b.speed * dt;
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
      const zEnd = Math.min(z1, stopZ);
      for (let key = Math.floor(z0 - 0.6); key <= Math.floor(zEnd); key++) {
        const a = bk.get(key);
        if (!a) continue;
        for (const e of a) if (e.alive && e.z >= z0 - 0.6 && e.z <= zEnd && Math.abs(e.x - (x0 + b.slope * (e.z - z0))) < e.r) hits.push(e);
      }
      if (hits.length > 1) hits.sort((p, q) => p.z - q.z);
      for (const e of hits) {
        if (!e.alive) continue;
        if (b.splash) { this.explode(e.x, e.z, b.splash, b.dmg); b.alive = false; break; }
        if (e.inv) {
          if (b.pierce) continue;
          b.alive = false;
          this.emit({ type: 'clang', x: e.x, z: e.z - e.r });
          break;
        }
        if (b.pierce) {
          // Enemies are met in z order, so anything at or behind the last one hit has already been burnt
          if (e.z <= b.hitZ) continue;
          b.hitZ = e.z;
          this.damageEnemy(e, b.dmg);
          continue;
        }
        const d = Math.min(b.dmg, e.hp);
        this.damageEnemy(e, d);
        b.dmg -= d;
        if (e.blocks || b.dmg <= 1e-6) { b.alive = false; break; }
      }
      if (!b.alive) continue;
      if (stop && z1 >= stopZ) {
        b.alive = false;
        if (b.splash) this.explode(b.x, stopZ, b.splash, b.dmg);
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

  damageEnemy(e, d) {
    e.hp -= d;
    if (e.hp <= 1e-6) this.killEnemy(e, true);
    else this.emit({ type: 'hit', x: e.x, z: e.z });
  }

  // Area damage to enemies (rockets, bombers shot down)
  explode(x, z, r, dmg) {
    this.emit({ type: 'boom', x, z, r });
    const r2 = r * r;
    for (const e of this.enemies) {
      if (!e.alive || e.inv) continue;
      const dz = e.z - z;
      if (dz > r || dz < -r) continue;
      if ((e.x - x) ** 2 + dz * dz < r2) this.damageEnemy(e, dmg);
    }
  }

  killEnemy(e, byBullet) {
    if (!e.alive) return;
    e.alive = false;
    if (byBullet) { this.coins += e.coins; this.kills++; }
    this.emit({ type: 'kill', x: e.x, z: e.z, kind: e.kind, byBullet });
    if (e.blast && byBullet) this.explode(e.x, e.z, e.blast + 0.4, 6 + 5 * this.k);
  }

  hitBlock(o, d) {
    o.hp -= d;
    this.emit({ type: 'blockHit', block: o });
    if (o.hp > 0) return;
    o.alive = false;
    o.hp = 0;
    const r = o.reward;
    let text = '';
    if (r.type === 'weapon') {
      if (r.w === this.weapon) this.stars++;
      else { this.weapon = r.w; this.stars = 0; }
      text = WEAPONS[this.weapon].name.toUpperCase() + (this.stars ? ' ' + '★'.repeat(Math.min(3, this.stars)) : '') + '!';
    } else if (r.type === 'add') {
      this.squad.count += r.v;
      text = '+' + r.v;
    } else if (r.type === 'coins') {
      this.coins += r.v;
      text = '+' + r.v + ' ¢';
    } else if (r.type === 'rage') {
      this.rageT = 8;
      text = 'RAGE! ×2 FIRE';
    } else if (r.type === 'shield') {
      this.shieldT = 7;
      text = 'SHIELD!';
    } else if (r.type === 'bomb') {
      text = 'AIRSTRIKE!';
      this.airstrike();
    }
    this.emit({ type: 'break', block: o, text });
    if (o.group >= 0) for (const p of this.blocks) if (p.alive && p.group === o.group) { p.alive = false; this.emit({ type: 'blockGone', block: p }); }
  }

  // Wipes the enemies around and ahead, and dents the boss
  airstrike() {
    const q = this.squad;
    this.emit({ type: 'nuke', x: q.x, z: q.z + 10 });
    for (const e of this.enemies) {
      if (!e.alive || !e.active) continue;
      if (e.z > q.z - 8 && e.z < q.z + 32) { e.blast = 0; this.killEnemy(e, true); }
    }
    for (const s of this.shots) s.alive = false;
    const B = this.boss;
    if (B.alive && B.active) this.hitBoss(B.maxHp * 0.12);
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
      for (const s of this.shots) s.alive = false;
      this.emit({ type: 'bossDead', x: B.x, z: B.z });
      this.finish('won');
    }
  }

  updateEnemies(dt) {
    const q = this.squad;
    const reg = this.squadRegion();
    const sx = q.x, sz = q.z;
    const ex2 = q.Rx + 0.25, ez2 = q.Rz + 0.25;
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      if (!e.active) {
        if (e.z - sz < e.wake) { e.active = true; if (e.straight) this.emit({ type: 'rumble', x: e.x, z: e.z }); }
        else continue;
      }
      e.t += dt;
      const dz = sz - e.z;
      if (dz > 18) { e.alive = false; continue; } // left far behind: they give up
      if (e.straight) {
        e.z -= e.speed * dt;
        // Iron balls break on lane walls and on anything solid standing on the road
        if (this.sectionAt(e.z) || this.blocks.some((b) => b.alive && Math.abs(b.x - e.x) < b.w / 2 + e.r && Math.abs(b.z - e.z) < b.d / 2 + e.r)) { this.killEnemy(e, false); continue; }
      }
      else if (e.fires) {
        e.cool -= dt;
        if (e.cool <= 0 && dz < -2.5 && dz > -22) {
          e.cool = Math.max(1.3, 2.5 - this.k * 0.06);
          this.fireOrb(e.x, e.z - 0.4, sx, sz, 0.38, 2 + Math.floor(this.k / 2));
          this.emit({ type: 'eshot', x: e.x, z: e.z });
        }
      } else {
        const vz = dz < 0 ? -e.speed : e.speed * 0.9;
        const tx = Math.max(sx - q.Rx * 0.85, Math.min(sx + q.Rx * 0.85, e.x));
        let vx = Math.max(-2.2, Math.min(2.2, (tx - e.x) * 1.4));
        if (Math.abs(dz) > 16) vx *= 0.3;
        if (e.weave) vx += Math.sin(this.time * 6 + e.phase) * 3.5;
        e.x += vx * dt;
        e.z += vz * dt;
        const s = this.sectionAt(e.z);
        if (s) {
          const [a, b] = s.lanes[this.laneIndex(s, e.x)];
          e.x = Math.max(a + 0.2, Math.min(b - 0.2, e.x));
        } else e.x = Math.max(-ROAD_HALF + 0.2, Math.min(ROAD_HALF - 0.2, e.x));
      }
      // Contact with the squad: one for one, more for the big ones
      const nx = (e.x - sx) / (ex2 + e.r * 0.5), nz = (e.z - sz) / (ez2 + e.r * 0.5);
      if (nx * nx + nz * nz < 1 && (e.straight || this.regionOf(e.x, e.z) === reg)) {
        if (e.blast) {
          const inside = this.countInside(e.x, e.z, e.blast);
          this.emit({ type: 'boom', x: e.x, z: e.z, r: e.blast });
          this.lose(Math.max(2, Math.min(inside, 6 + 3 * this.k)), e.x, e.z, 'bomb');
        } else if (e.straight) this.lose(Math.min(e.power, Math.max(1, this.countInside(e.x, e.z, e.r + 0.3))), e.x, e.z, e.kind);
        else this.lose(e.power, e.x, e.z, e.kind);
        this.killEnemy(e, false);
        if (q.count <= 0) return;
      }
    }
  }

  // A slow enemy projectile from (x, z) towards (tx, tz)
  fireOrb(x, z, tx, tz, r, power) {
    const dx = tx - x, dz = tz - z, len = Math.hypot(dx, dz) || 1;
    this.shots.push({ x, z, vx: (dx / len) * ORB_SPEED, vz: (dz / len) * ORB_SPEED, r, power, alive: true });
  }

  updateShots(dt) {
    const q = this.squad;
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      if (s.z < q.z - 12 || Math.abs(s.x) > ROAD_HALF + 1) { s.alive = false; continue; }
      const nx = (s.x - q.x) / (q.Rx + s.r), nz = (s.z - q.z) / (q.Rz + s.r);
      if (nx * nx + nz * nz < 1) {
        s.alive = false;
        this.lose(s.power, s.x, s.z, 'orb');
        this.emit({ type: 'orbHit', x: s.x, z: s.z });
      }
    }
    let j = 0;
    for (const s of this.shots) if (s.alive) this.shots[j++] = s;
    this.shots.length = j;
  }

  // Saws and spikes take the soldiers they touch, a few at a time, and at most an eighth of the squad per pass
  updateHazards(dt) {
    const q = this.squad;
    for (const h of this.hazards) {
      if (h.kind === 'saw') h.x = h.x0 + h.amp * Math.sin((this.time * TAU) / h.period + h.phase);
      if (h.cool > 0) { h.cool -= dt; continue; }
      if (Math.abs(h.z - q.z) > q.Rz + 2) continue;
      const n = h.kind === 'saw' ? this.countInside(h.x, h.z, h.r) : this.countInside(h.x, h.z, h.w / 2, h.d / 2);
      if (!n) continue;
      if (h.budget === undefined) { h.budget = Math.max(3, Math.ceil(q.count * 0.125)); h.bite = Math.max(1, Math.ceil(h.budget / 5)); }
      h.cool = 0.15;
      const x = h.kind === 'saw' ? h.x : q.x;
      if (h.budget <= 0) continue; // it has taken its share: the rest of the squad squeezes past
      this.emit({ type: 'hazard', kind: h.kind, x, z: h.z });
      h.budget -= this.lose(Math.min(n, h.bite, h.budget), x, h.z, h.kind);
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
    if (!B.enraged && B.hp < B.maxHp * 0.45) { B.enraged = true; this.emit({ type: 'enrage', x: B.x, z: B.z }); }
    const haste = B.enraged ? 0.65 : 1;
    B.cool -= dt;
    // From level 3 the boss calls for help
    if (this.L.n >= 3) {
      B.summonT -= dt;
      if (B.summonT <= 0) {
        B.summonT = 7 * haste;
        this.enemies = this.enemies.filter((e) => e.alive); // long fights would otherwise pile up the dead
        const c = Math.min(14, 3 + Math.floor(this.k / 2));
        for (let i = 0; i < c; i++) {
          const x = Math.max(-5.6, Math.min(5.6, B.x + (i % 2 ? 1 : -1) * (2.2 + this.rng() * 2.6)));
          this.enemies.push(this.makeEnemy({ kind: this.k >= 5 && i % 3 === 0 ? 'runner' : 'grunt', x, z: B.z + 0.4 + this.rng() * 2 }, true));
        }
        this.emit({ type: 'summon', x: B.x, z: B.z });
      }
    }
    if (B.state === 'idle' || B.state === 'walk') {
      if (gap > B.keep) {
        B.state = 'walk';
        B.z -= (B.big ? 1.3 : 1.6) * dt;
        B.x += Math.max(-1.2 * dt, Math.min(1.2 * dt, q.x - B.x));
      } else B.state = 'idle';
      if (B.cool <= 0) {
        if (B.type !== 'blaster' && gap < 3.4) { B.state = 'windup'; B.t = 0.85; this.emit({ type: 'windup' }); }
        else if (B.type !== 'crusher' && gap >= 3.4 && gap < 18) { B.state = 'aim'; B.t = 0.7; this.emit({ type: 'aim' }); }
      }
    } else if (B.state === 'windup') {
      B.t -= dt;
      if (B.t <= 0) {
        B.state = 'smash';
        B.t = 0.45;
        const px = B.x, pz = B.z - 2.4;
        const inside = this.countInside(px, pz, B.smashR);
        const lost = this.lose(Math.min(inside, B.power), px, pz, 'smash');
        this.emit({ type: 'smash', x: px, z: pz, r: B.smashR, n: lost });
      }
    } else if (B.state === 'smash') {
      B.t -= dt;
      if (B.t <= 0) { B.state = 'idle'; B.cool = (B.big ? 1.6 : 1.9) * haste; }
    } else if (B.state === 'aim') {
      B.t -= dt;
      if (B.t <= 0) {
        // A fan of slow orbs with gaps between them
        B.state = 'recoil';
        B.t = 0.35;
        const N = B.big ? 7 : 5;
        const oz = B.z - 1.2;
        for (let i = 0; i < N; i++) {
          this.fireOrb(B.x, oz, q.x + (i - (N - 1) / 2) * 2.5, q.z, 0.42, B.orbPower);
        }
        this.emit({ type: 'volley', x: B.x, z: oz });
      }
    } else if (B.state === 'recoil') {
      B.t -= dt;
      if (B.t <= 0) { B.state = 'idle'; B.cool = 2.2 * haste; }
    }
  }
}
