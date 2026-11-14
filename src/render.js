// Three.js view of the simulation. Simulation z (forward) maps to render −z, so the camera
// looks down −z and +x stays on the right of the screen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './level.js';
import { WEAPONS } from './sim.js';
import * as T from './textures.js';

const MAXP = 700; // drawn player soldiers (larger squads are sampled)
const MAXE = 4000;
const MAXB = 1600;
const MAXFX = 900;
const MAXSHOT = 160;
const MAXCOIN = 220;
// Big sister (pink hoodie), the gamer (black hoodie, green cap), big brother (yellow puffer jacket)
const HERO_LOOK = { medic: [0xff6fb5, 0xfafafa, 0x3a4a7a, 1.5], sniper: [0x23262e, 0x35d07f, 0x23262e, 1.5], tank: [0xf2b01e, 0xd8382f, 0x3a4a7a, 2.2] };

// How each kind of enemy is drawn: colours of the soldier model, size, how many at most on screen
const KINDS = {
  grunt: { body: 0xe0352b, head: 0x6b4a2b, legs: 0x3a3f4b, scale: 1.08, max: MAXE }, // supervisors
  runner: { body: 0xff9a1f, head: 0xffe04d, legs: 0x2f6bd6, scale: 0.8, max: 600, lean: 0.35, extra: 'propeller' }, // little brothers
  brute: { body: 0x9c1f18, head: 0x2a1512, legs: 0x9c1f18, scale: 1.9, max: 500, extra: 'whistle' }, // gym teachers
  shield: { body: 0xb32a22, head: 0xcfd3da, legs: 0x3a3f4b, scale: 1.4, max: 300, extra: 'binder' }, // librarians
  bomber: { body: 0x2b2f3a, head: 0x8a5a2b, legs: 0x15171d, scale: 1.2, max: 300, extra: 'test' }, // surprise tests
  shooter: { body: 0x8e44e8, head: 0x2a1750, legs: 0x2a1750, scale: 1.25, max: 200, extra: 'ruler' }, // maths teachers
};
const POWER = { rage: { hex: 0xff8a1a, icon: '🥤' }, shield: { hex: 0x35d0ff, icon: '🎧' }, bomb: { hex: 0x8e44e8, icon: '🔊' } };
const BOSS_COLOR = { crusher: 0x3f8fd6, blaster: 0x2fae5a, titan: 0x4a4466 };

// fogN / fogF: where the fog starts and ends. hemiI, sunI, lampI: light intensities (the lamp is the squad's own light).
const DAY = { fogN: 70, fogF: 190, hemiI: 1.25, sunI: 2.1, lampI: 0 };
const THEME = {
  desert: { ...DAY, sky: 0x9fc8ea, fog: 0xcfd9df, ground: '#d7c29a', dots: ['#c4ab7e', '#e6d4ad', '#b89c6c'], hemiG: 0xb59d74 },
  meadow: { ...DAY, sky: 0x8fd0ff, fog: 0xd3ecff, ground: '#86c45c', dots: ['#6fb04a', '#a3d977', '#5d9c40'], hemiG: 0x6f9c4a },
  bridge: { ...DAY, sky: 0x7fb6e6, fog: 0x9cc3e4, ground: null, water: 0x2f7fc4, hemiG: 0x4f7fa8 },
  night: { fogN: 20, fogF: 50, hemiI: 0.3, sunI: 0.25, lampI: 55, sky: 0x0a0f22, fog: 0x0a0f22, ground: '#4a4658', dots: ['#3a3748', '#5a566a', '#2f2c3c'], hemiG: 0x1c1e30 },
  snow: { ...DAY, sky: 0xcfe3f2, fog: 0xe4eef5, ground: '#eef3f7', dots: ['#d9e3ec', '#ffffff', '#c9d6e2'], hemiG: 0xc7d3de },
  city: { ...DAY, fogN: 60, fogF: 170, sky: 0xaec6de, fog: 0xc6d2de, ground: '#8b909c', dots: ['#7c818d', '#9a9fab', '#70757f'], hemiG: 0x7d8290 },
  lava: { fogN: 45, fogF: 130, hemiI: 0.9, sunI: 1.3, lampI: 0, sky: 0x2b1512, fog: 0x4a1f14, ground: null, lava: 0xd9480f, hemiG: 0xff6a2a },
};
for (const th of Object.values(THEME)) Object.assign(th, { cSky: new THREE.Color(th.sky), cFog: new THREE.Color(th.fog), cHemi: new THREE.Color(th.hemiG) });
const TRANSITION = 50; // length of road over which one scenery fades into the next

const col = (hex) => new THREE.Color(hex);

function paint(geo, hex) {
  const c = col(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// One merged low-poly character, facing +z, feet at y=0.
// Teens (the squad): hoodie, cap worn backwards, backpack, a toy blaster in the hand.
// Grown-ups (everyone else): jacket, hair, glasses, tie, a clipboard, or what `extra` gives them.
function figure({ body, head, legs, teen = false, extra }) {
  const parts = [];
  const add = (g, hex, x, y, z) => { g.translate(x, y, z); parts.push(paint(g, hex)); };
  add(new THREE.BoxGeometry(0.09, 0.2, 0.1), legs, -0.065, 0.1, 0);
  add(new THREE.BoxGeometry(0.09, 0.2, 0.1), legs, 0.065, 0.1, 0);
  add(new THREE.CylinderGeometry(0.13, 0.15, 0.27, 8), body, 0, 0.33, 0);
  add(new THREE.SphereGeometry(0.115, 8, 6), 0xf2c29b, 0, 0.56, 0);
  add(new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), head, 0, 0.585, 0);
  if (teen) {
    add(new THREE.BoxGeometry(0.2, 0.025, 0.14), head, 0, 0.6, -0.17); // cap visor, at the back
    add(new THREE.BoxGeometry(0.18, 0.2, 0.08), legs, 0, 0.34, -0.16); // backpack
    add(new THREE.BoxGeometry(0.05, 0.07, 0.22), 0x35d07f, 0.1, 0.36, 0.14); // toy blaster
    add(new THREE.BoxGeometry(0.05, 0.1, 0.05), 0xff8a1a, 0.1, 0.3, 0.08);
  } else {
    add(new THREE.BoxGeometry(0.2, 0.035, 0.03), 0x15171d, 0, 0.57, 0.105); // glasses
    add(new THREE.BoxGeometry(0.05, 0.2, 0.02), 0xfafafa, 0, 0.36, 0.14); // shirt and tie
    add(new THREE.BoxGeometry(0.03, 0.16, 0.025), 0x2b2f3a, 0, 0.35, 0.15);
    if (!extra) add(new THREE.BoxGeometry(0.16, 0.2, 0.02), 0xf5f1e3, 0.09, 0.34, 0.17); // clipboard
  }
  if (extra === 'binder') {
    // A huge ring binder held in front
    add(new THREE.BoxGeometry(0.5, 0.56, 0.06), 0x2f6bd6, 0, 0.34, 0.27);
    add(new THREE.BoxGeometry(0.44, 0.5, 0.07), 0xfafafa, 0.02, 0.34, 0.27);
    add(new THREE.BoxGeometry(0.5, 0.56, 0.02), 0x2f6bd6, 0, 0.34, 0.31);
  } else if (extra === 'test') {
    // A pile of surprise tests carried overhead
    add(new THREE.BoxGeometry(0.34, 0.14, 0.26), 0xfafafa, 0, 0.78, 0);
    add(new THREE.BoxGeometry(0.1, 0.02, 0.1), 0xe0352b, 0.08, 0.86, 0.04);
  } else if (extra === 'ruler') add(new THREE.BoxGeometry(0.04, 0.03, 0.55), 0xffd23a, 0.1, 0.4, 0.28);
  else if (extra === 'whistle') {
    add(new THREE.BoxGeometry(0.28, 0.04, 0.02), 0xfafafa, 0, 0.3, 0.145); // tracksuit stripe
    add(new THREE.BoxGeometry(0.06, 0.05, 0.05), 0xffd23a, 0, 0.46, 0.13);
  } else if (extra === 'propeller') add(new THREE.BoxGeometry(0.26, 0.02, 0.05), 0x35d07f, 0, 0.73, 0);
  return mergeGeometries(parts);
}

export class Renderer {
  constructor(canvas, labelLayer) {
    this.canvas = canvas;
    this.labels = labelLayer;
    const r = (this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);
    this.camPos = new THREE.Vector3(0, 15, 12);
    this.camLook = new THREE.Vector3(0, 0, -9);
    this.shake = 0;
    this.time = 0;

    this.hemi = new THREE.HemisphereLight(0xeaf4ff, 0xb59d74, 1.25);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1dc, 2.1));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 30, bottom: -30, near: 1, far: 80 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);

    this.mats = {
      vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
      concrete: new THREE.MeshLambertMaterial({ map: T.concreteTexture('#c3c6cc') }),
      road: new THREE.MeshLambertMaterial({ map: T.concreteTexture('#c8cbd1', 0.05) }),
      curb: new THREE.MeshLambertMaterial({ color: 0x6b7080 }),
      hazard: new THREE.MeshLambertMaterial({ map: T.hazardTexture() }),
      dark: new THREE.MeshLambertMaterial({ color: 0x3a3f4b }),
      metal: new THREE.MeshLambertMaterial({ color: 0x8a909c }),
      white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      skin: new THREE.MeshLambertMaterial({ color: 0xf0b48c }),
      red: new THREE.MeshLambertMaterial({ color: 0xd8382f }),
      wood: new THREE.MeshLambertMaterial({ color: 0xb4762f }),
      woodDark: new THREE.MeshLambertMaterial({ color: 0x7a4a1c }),
      ice: new THREE.MeshPhongMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.55, shininess: 120, specular: 0xffffff }),
      glass: new THREE.MeshPhongMaterial({ color: 0x6fc4ff, transparent: true, opacity: 0.45, shininess: 140, specular: 0xffffff, depthWrite: false }),
    };
    this.gunTex = T.gunIconTexture();

    // Instanced crowds
    const vc = this.mats.vc;
    this.players = new THREE.InstancedMesh(figure({ body: 0x2f7bf5, head: 0x8fd6ff, legs: 0x1d3f8a, teen: true }), vc, MAXP);
    this.kinds = {};
    for (const [id, K] of Object.entries(KINDS)) this.kinds[id] = { ...K, n: 0, mesh: new THREE.InstancedMesh(figure(K), vc, K.max) };
    // The giant ball of crumpled homework
    {
      const g = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
      const pos = g.attributes.position;
      const crumple = (x, y, z) => 0.86 + 0.24 * Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453 % 1);
      for (let i = 0; i < pos.count; i++) { const k = crumple(pos.getX(i), pos.getY(i), pos.getZ(i)); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k); }
      g.computeVertexNormals();
      // Lines of handwriting: some faces are bluish
      const c = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i += 3) { const ink = (i / 3) % 5 === 0; for (let j = 0; j < 3; j++) c.set(ink ? [0.62, 0.7, 0.9] : [0.97, 0.96, 0.92], (i + j) * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      this.kinds.boulder = { scale: 1, max: 80, n: 0, mesh: new THREE.InstancedMesh(g, vc, 80) };
    }
    for (const m of [this.players, ...Object.values(this.kinds).map((K) => K.mesh)]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
      this.scene.add(m);
    }
    // Enemy projectiles
    this.orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }), MAXSHOT); // chalk
    this.orbGlow = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a3d, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), MAXSHOT);
    for (const m of [this.orbs, this.orbGlow]) { m.frustumCulled = false; m.count = 0; this.scene.add(m); }
    // Coins to pick up, and the lamp of the night levels
    this.coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 14).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0xb07a00, emissiveIntensity: 0.6 }), MAXCOIN);
    this.coins.frustumCulled = false;
    this.coins.count = 0;
    this.scene.add(this.coins);
    this.lamp = new THREE.PointLight(0xffe6bf, 0, 40, 1.2);
    this.scene.add(this.lamp);
    // Heroes walking with the squad
    this.heroes = {};
    for (const [id, [body, head, legs, scale]] of Object.entries(HERO_LOOK)) {
      const m = new THREE.Mesh(figure({ body, head, legs, teen: true }), vc);
      m.scale.setScalar(scale);
      m.castShadow = true;
      m.visible = false;
      this.scene.add(m);
      this.heroes[id] = m;
    }
    // Shield bubble around the squad
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x55dcff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    this.bubble.visible = false;
    this.bubble.renderOrder = 5;
    this.scene.add(this.bubble);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
    this.bullets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1.1), this.bulletMat, MAXB);
    this.bullets.frustumCulled = false;
    this.bullets.count = 0;
    this.scene.add(this.bullets);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 1.4), this.glowMat, MAXB);
    this.glow.frustumCulled = false;
    this.glow.count = 0;
    this.scene.add(this.glow);

    // Particles
    this.fxMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXFX);
    this.fxMesh.frustumCulled = false;
    this.fxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fxMesh.setColorAt(0, col(0xffffff));
    this.fxMesh.count = 0;
    this.scene.add(this.fxMesh);
    this.fx = [];
    this.rings = [];

    this.pCur = new Float32Array(MAXP * 2);
    this.pSpawn = new Float32Array(MAXP);
    this.pShown = 0;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
    this.tmpC = new THREE.Color();
    this.p = { x: 0, z: 0 };

    // DOM labels
    this.countEl = document.createElement('div');
    this.countEl.className = 'squad-count';
    labelLayer.appendChild(this.countEl);
    this.floats = [];

    this.levelGroup = null;
    this.resize();
  }

  setShadows(on) {
    this.gl.shadowMap.enabled = on;
    this.sun.castShadow = on;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Keep the road width visible on narrow portrait screens
    const base = Math.tan(THREE.MathUtils.degToRad(26));
    const need = aspect < 0.95 ? (base * 0.95) / aspect : base;
    this.camera.fov = Math.min(84, THREE.MathUtils.radToDeg(2 * Math.atan(need)));
    this.portrait = aspect < 0.95;
    this.camera.updateProjectionMatrix();
  }

  // ---------- Level building ----------
  loadLevel(level, sim) {
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    }
    for (const f of this.floats) f.el.remove();
    this.floats = [];
    this.fx = [];
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.rings = [];
    const G = (this.levelGroup = new THREE.Group());
    this.scene.add(G);
    this.level = level;
    this.sim = sim;
    const H = (this.half = level.half ?? 6);
    this.zones = level.zones ?? [{ z0: 0, z1: level.length, theme: level.theme }];
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog(0, 70, 190);
    this.applyTheme(sim.squad.z);
    const len = level.length + 60;

    // Road
    const road = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 0.4, 0.6, len), this.mats.road);
    road.material.map.repeat.set(2, len / 6);
    road.position.set(0, -0.3, -(len / 2 - 25));
    road.receiveShadow = true;
    G.add(road);
    for (const sx of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, len), this.mats.curb);
      curb.position.set(sx * (H + 0.42), 0.0, road.position.z);
      curb.receiveShadow = curb.castShadow = true;
      G.add(curb);
    }
    // Dashed lines outside the lane sections
    const dashGeo = new THREE.BoxGeometry(0.16, 0.02, 2.2);
    const dashes = [];
    for (let z = -20; z < level.length + 30; z += 6) {
      if (level.sections.some((s) => z > s.z0 - 2 && z < s.z1 + 2)) continue;
      for (const x of [-H / 3, H / 3]) dashes.push([x, z]);
    }
    const dashMesh = new THREE.InstancedMesh(dashGeo, this.mats.white, dashes.length);
    dashes.forEach(([x, z], i) => dashMesh.setMatrixAt(i, this.m4.makeTranslation(x, 0.011, -z)));
    G.add(dashMesh);

    this.buildScenery(G, level, len);
    this.buildSections(G, level);
    this.gateMeshes = new Map();
    for (const g of sim.gates) this.buildGate(G, g);
    this.blockMeshes = new Map();
    for (const b of sim.blocks) this.buildBlock(G, b);
    this.buildHazards(G, sim.hazards);
    this.boss = null;
    if (sim.boss.type !== 'none') this.buildBoss(G, sim.boss);
    else {
      // Finish line of a bonus run
      const line = new THREE.Mesh(new THREE.BoxGeometry(H * 2, 0.03, 1.6), this.mats.hazard);
      line.position.set(0, 0.016, -level.finish);
      G.add(line);
    }
    this.bulletMat.color.set(WEAPONS[sim.weapon].color);
    this.glowMat.color.set(WEAPONS[sim.weapon].color);

    this.pShown = 0;
    const q = sim.squad;
    this.camPos.set(q.x * 0.4, 15, -q.z + 12);
    this.camLook.set(q.x * 0.3, 0, -q.z - 9);
  }

  // Sky, fog and lights for a position on the road: the theme of its stretch, faded into the next one
  applyTheme(z) {
    const zs = this.zones;
    let i = 0;
    while (i < zs.length - 1 && z > zs[i].z1 - TRANSITION / 2) i++;
    const b = THEME[zs[i].theme], a = i > 0 ? THEME[zs[i - 1].theme] : b;
    let u = i > 0 ? Math.min(1, Math.max(0, (z - (zs[i].z0 - TRANSITION / 2)) / TRANSITION)) : 1;
    u = u * u * (3 - 2 * u);
    const mix = (k) => a[k] + (b[k] - a[k]) * u;
    this.scene.background.lerpColors(a.cSky, b.cSky, u);
    this.scene.fog.color.lerpColors(a.cFog, b.cFog, u);
    this.scene.fog.near = mix('fogN');
    this.scene.fog.far = mix('fogF');
    this.hemi.groundColor.lerpColors(a.cHemi, b.cHemi, u);
    this.hemi.intensity = mix('hemiI');
    this.sun.intensity = mix('sunI');
    this.lamp.intensity = mix('lampI');
  }

  buildScenery(G, level, len) {
    const rng = mulberry32(level.n * 77 + 3);
    this.pulse = [];
    const zs = this.zones;
    zs.forEach((zn, i) => this.buildZone(G, zn.theme, i === 0 ? -70 : zn.z0, i === zs.length - 1 ? len + 60 : zn.z1, rng));
  }

  // Scenery of one stretch of road, from z = a to z = b
  buildZone(G, name, a, b, rng) {
    const th = THEME[name];
    const H = this.half, L = b - a, mid = -(a + b) / 2;
    const m4 = this.m4, v = this.v, q = this.q, sc = this.s, e = this.e;
    const instanced = (geo, mat, items, shadow = true) => {
      // items: [x, y, z, sx, sy, sz, ry]
      if (!items.length) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        e.set(0, it[6] ?? 0, 0);
        mesh.setMatrixAt(i, m4.compose(v.set(it[0], it[1], -it[2]), q.setFromEuler(e), sc.set(it[3], it[4], it[5])));
      });
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      G.add(mesh);
      return mesh;
    };
    const flat = (w, y, mat) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, L), mat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(0, y, mid);
      G.add(p);
      return p;
    };
    const side = () => (rng() < 0.5 ? -1 : 1);
    if (th.ground) {
      const tex = T.groundTexture(th.ground, th.dots);
      tex.repeat.set(12, L / 20);
      flat(260, -0.62, new THREE.MeshLambertMaterial({ map: tex })).receiveShadow = true;
    }
    if (name === 'desert' || name === 'night') {
      // Ruined buildings and watchtowers
      const boxes = [];
      for (let z = a; z < b; z += 7 + rng() * 9) {
        for (const sd of [-1, 1]) {
          if (rng() < 0.35) continue;
          const x = sd * (H + 5 + rng() * 26);
          const w = 2 + rng() * 5, d = 2 + rng() * 5, h = 1 + rng() * 6;
          boxes.push([x, h / 2 - 0.6, z, w, h, d, rng() * 0.3]);
          if (rng() < 0.5) { const h2 = 0.4 + rng() * 0.6; boxes.push([x + (rng() - 0.5) * w, h2 / 2 - 0.6, z + d * 0.6, 0.6 + rng(), h2, 0.6 + rng(), rng() * 3]); }
        }
      }
      instanced(new THREE.BoxGeometry(1, 1, 1), this.mats.concrete, boxes);
      for (let z = a + 30; z < b; z += 70 + rng() * 40) this.watchtower(G, side() * (H + 6 + rng() * 6), z);
    } else if (name === 'bridge' || name === 'lava') {
      // The road on a deck, over water or over lava
      const lava = name === 'lava';
      const mat = lava ? new THREE.MeshBasicMaterial({ color: th.lava, fog: false }) : new THREE.MeshPhongMaterial({ color: th.water, shininess: 80, specular: 0x88bbff });
      flat(500, lava ? -2.2 : -6, mat);
      this.pulse.push({ mat, hex: lava ? th.lava : th.water, amp: lava ? 0.06 : 0.015, speed: lava ? 2.2 : 0.8 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(H * 2 + 3, lava ? 2.6 : 1.4, L), this.mats.dark);
      deck.position.set(0, lava ? -1.9 : -1.3, mid);
      G.add(deck);
      if (lava) {
        // Black rock spires and glowing boulders in the lava
        const rocks = [], embers = [];
        for (let z = a; z < b; z += 3 + rng() * 5) {
          const s = 1 + rng() * 3.5;
          rocks.push([side() * (H + 4 + rng() * 34), -2.2 + s * 1.2, z, s, s * (1.5 + rng() * 2), s, rng() * 3]);
          if (rng() < 0.5) embers.push([side() * (H + 3 + rng() * 30), -2, z + rng() * 3, 0.5 + rng(), 0.3, 0.5 + rng(), 0]);
        }
        instanced(new THREE.ConeGeometry(1, 2, 6), new THREE.MeshLambertMaterial({ color: 0x2a2226, flatShading: true }), rocks);
        instanced(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23a }), embers, false);
      } else {
        const railMat = new THREE.MeshLambertMaterial({ color: 0xd2332b });
        const one = new THREE.BoxGeometry(1, 1, 1);
        const rails = [], posts = [], towers = [];
        for (const sx of [-1, 1]) {
          for (const y of [0.55, 1.05]) rails.push([sx * (H + 0.75), y, (a + b) / 2, 0.12, 0.12, L]);
          for (let z = a; z < b; z += 2.5) posts.push([sx * (H + 0.75), 0.55, z, 0.14, 1.15, 0.14]);
        }
        for (let z = a + 20; z < b - 10; z += 90) {
          for (const sx of [-1, 1]) {
            towers.push([sx * (H + 2), 12, z, 1.2, 26, 1.2]);
            for (const dz of [-45, 45]) {
              const p0 = new THREE.Vector3(sx * (H + 2), 24.5, -z), p1 = new THREE.Vector3(sx * (H + 1), 0.8, -(z + dz));
              const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, p0.distanceTo(p1), 5), railMat);
              cable.position.copy(p0).add(p1).multiplyScalar(0.5);
              cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
              G.add(cable);
            }
          }
          towers.push([0, 24, z, H * 2 + 5, 1, 1]);
        }
        instanced(one, railMat, rails, false);
        instanced(one, railMat, posts, false);
        instanced(one, railMat, towers);
      }
    } else if (name === 'snow') {
      // Pine trees
      const trees = [];
      for (let z = a; z < b; z += 2.5 + rng() * 3)
        for (const sd of [-1, 1]) if (rng() < 0.7) { const s = 0.8 + rng() * 1.2; trees.push([sd * (H + 3 + rng() * 30), -0.6, z, s, s, s]); }
      const pine = mergeGeometries([
        paint(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6).translate(0, 0.4, 0), 0x6b4a2b),
        paint(new THREE.ConeGeometry(1.1, 1.8, 7).translate(0, 1.4, 0), 0x2f6b47),
        paint(new THREE.ConeGeometry(0.85, 1.5, 7).translate(0, 2.2, 0), 0x3b7d55),
        paint(new THREE.ConeGeometry(0.55, 1.1, 7).translate(0, 2.9, 0), 0xf4f8fb),
      ]);
      instanced(pine, this.mats.vc, trees);
    } else if (name === 'meadow') {
      // Round trees, bushes, rocks and a wooden fence along the road
      const trees = [], bushes = [], rocks = [], fence = [];
      for (let z = a; z < b; z += 3 + rng() * 4) {
        for (const sd of [-1, 1]) {
          if (rng() < 0.6) { const s = 0.9 + rng() * 1.3; trees.push([sd * (H + 4 + rng() * 30), -0.6, z, s, s, s, rng() * 6]); }
          if (rng() < 0.5) { const s = 0.5 + rng() * 0.8; bushes.push([sd * (H + 2 + rng() * 26), -0.5, z + rng() * 3, s * 1.4, s, s * 1.4]); }
          if (rng() < 0.25) { const s = 0.4 + rng() * 0.9; rocks.push([sd * (H + 2 + rng() * 28), -0.45, z + rng() * 3, s, s * 0.7, s, rng() * 6]); }
        }
      }
      for (let z = a; z < b; z += 3) for (const sd of [-1, 1]) fence.push([sd * (H + 1.4), -0.15, z, 1, 1, 1]);
      const tree = mergeGeometries([
        paint(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6).translate(0, 0.8, 0), 0x7a5230),
        paint(new THREE.IcosahedronGeometry(1.25, 1).translate(0, 2.5, 0), 0x3f9a4a),
        paint(new THREE.IcosahedronGeometry(0.85, 1).translate(0.7, 2.0, 0.3), 0x4fb05a),
      ].map((g) => (g.index ? g.toNonIndexed() : g)));
      instanced(tree, this.mats.vc, trees);
      instanced(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0x4a9c48, flatShading: true }), bushes);
      instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x9aa0a8, flatShading: true }), rocks);
      const post = mergeGeometries([
        new THREE.BoxGeometry(0.16, 0.9, 0.16).translate(0, 0.0, 0),
        new THREE.BoxGeometry(0.08, 0.1, 3).translate(0, 0.25, 0),
        new THREE.BoxGeometry(0.08, 0.1, 3).translate(0, -0.05, 0),
      ]);
      instanced(post, this.mats.wood, fence);
    } else if (name === 'city') {
      // Blocks of buildings with lit windows, lamp posts along the road
      const towers = [], lamps = [];
      for (let z = a; z < b; z += 6 + rng() * 5) {
        for (const sd of [-1, 1]) {
          for (let row = 0; row < 3; row++) {
            if (rng() < 0.2) continue;
            const w = 4 + rng() * 4, d = 4 + rng() * 3, h = 5 + rng() * 14 + row * 5;
            towers.push([sd * (H + 6 + row * 11 + rng() * 3), h / 2 - 0.6, z, w, h, d, 0]);
          }
        }
      }
      for (let z = a; z < b; z += 14) for (const sd of [-1, 1]) lamps.push([sd * (H + 1.3), 0, z, 1, 1, 1]);
      const tex = T.windowTexture();
      const bm = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ map: tex }), towers);
      const tints = [0xd9dee8, 0xc9b8a8, 0xa9c0d8, 0xe8d9b8, 0xb8c4b0];
      if (bm) towers.forEach((_, i) => bm.setColorAt(i, this.tmpC.setHex(tints[i % tints.length])));
      const lamp = mergeGeometries([
        paint(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6).translate(0, 1.8, 0), 0x3a3f4b),
        paint(new THREE.BoxGeometry(0.7, 0.12, 0.25).translate(0, 3.6, 0), 0x3a3f4b),
        paint(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 3.45, 0), 0xfff2b0),
      ]);
      instanced(lamp, this.mats.vc, lamps);
    }
  }

  watchtower(G, x, z) {
    const g = new THREE.Group();
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7, 0.2), this.mats.metal);
      leg.position.set(dx, 3.5, dz);
      g.add(leg);
    }
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), this.mats.concrete);
    cab.position.y = 7.6;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1, 4), this.mats.dark);
    roof.position.y = 8.9;
    roof.rotation.y = Math.PI / 4;
    g.add(cab, roof);
    g.position.set(x, -0.6, -z);
    g.traverse((o) => (o.castShadow = true));
    G.add(g);
  }

  buildSections(G, level) {
    for (const s of level.sections) {
      const len = s.z1 - s.z0;
      for (const wx of s.walls) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.8, len), this.mats.dark);
        wall.position.set(wx, 0.4, -(s.z0 + len / 2));
        wall.castShadow = wall.receiveShadow = true;
        G.add(wall);
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, len), new THREE.MeshLambertMaterial({ color: 0xffc928 }));
        top.position.set(wx, 0.84, wall.position.z);
        G.add(top);
        // Striped pillars at the entry
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.8), this.mats.hazard);
        pillar.position.set(wx, 0.75, -s.z0 + 0.2);
        pillar.castShadow = true;
        G.add(pillar);
      }
    }
  }

  buildHazards(G, hazards) {
    this.saws = [];
    this.walls = [];
    const m = this.mats;
    const spikes = [];
    for (const h of hazards) {
      if (h.kind === 'saw') {
        const track = new THREE.Mesh(new THREE.BoxGeometry(h.amp * 2 + h.r * 2, 0.03, 0.22), m.dark);
        track.position.set(h.x0, 0.016, -h.z);
        G.add(track);
        // A giant fidget spinner
        const grp = new THREE.Group();
        const teal = new THREE.MeshLambertMaterial({ color: 0x19c3c9 });
        grp.add(new THREE.Mesh(new THREE.CylinderGeometry(h.r * 0.42, h.r * 0.42, 0.12, 16), teal));
        grp.add(new THREE.Mesh(new THREE.CylinderGeometry(h.r * 0.2, h.r * 0.2, 0.2, 12), m.white));
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const lobe = new THREE.Mesh(new THREE.CylinderGeometry(h.r * 0.4, h.r * 0.4, 0.12, 16), teal);
          lobe.position.set(Math.cos(a) * h.r * 0.6, 0, Math.sin(a) * h.r * 0.6);
          const bearing = new THREE.Mesh(new THREE.CylinderGeometry(h.r * 0.22, h.r * 0.22, 0.16, 12), m.metal);
          bearing.position.copy(lobe.position);
          grp.add(lobe, bearing);
        }
        grp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        grp.position.set(h.x, 0.3, -h.z);
        G.add(grp);
        this.saws.push({ h, grp });
      } else if (h.kind === 'walls') {
        const track = new THREE.Mesh(new THREE.BoxGeometry(this.half * 2, 0.03, h.d + 0.3), m.dark);
        track.position.set(0, 0.016, -h.z);
        G.add(track);
        const pair = [-1, 1].map((sx) => {
          const g = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(12, 1.5, h.d), m.concrete);
          body.position.set(sx * 6, 0.75, 0);
          const face = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, h.d + 0.1), m.hazard);
          face.position.set(sx * 0.1, 0.8, 0);
          g.add(body, face);
          g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          g.position.z = -h.z;
          G.add(g);
          return g;
        });
        this.walls.push({ h, pair });
      } else {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(h.w, 0.06, h.d), m.dark);
        plate.position.set(h.x, 0.03, -h.z);
        plate.receiveShadow = true;
        G.add(plate);
        for (const sz of [-1, 1]) {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(h.w, 0.07, 0.1), m.red);
          edge.position.set(h.x, 0.035, -h.z + sz * (h.d / 2));
          G.add(edge);
        }
        const nx = Math.max(2, Math.round(h.w / 0.42));
        for (let i = 0; i < nx; i++) for (let j = 0; j < 3; j++) spikes.push([h.x - h.w / 2 + (h.w * (i + 0.5)) / nx, h.z - h.d / 2 + (h.d * (j + 0.5)) / 3]);
      }
    }
    if (spikes.length) {
      // Toy bricks left on the floor: everybody knows what stepping on one feels like
      const brick = mergeGeometries([new THREE.BoxGeometry(0.3, 0.2, 0.3).translate(0, 0.1, 0), new THREE.CylinderGeometry(0.08, 0.08, 0.07, 8).translate(0, 0.23, 0)]);
      const sm = new THREE.InstancedMesh(brick, m.white, spikes.length);
      const hues = [0xe0352b, 0xffc928, 0x2f7bf5, 0x35b46a];
      spikes.forEach(([x, z], i) => {
        this.e.set(0, (i * 1.7) % 3, 0);
        sm.setMatrixAt(i, this.m4.compose(this.v.set(x + Math.sin(i * 7.1) * 0.08, 0.06, -z + Math.cos(i * 3.3) * 0.08), this.q.setFromEuler(this.e), this.s.set(1, 1, 1)));
        sm.setColorAt(i, this.tmpC.setHex(hues[(i * 7) % 4]));
      });
      sm.castShadow = true;
      G.add(sm);
    }
  }

  buildGate(G, g) {
    const grp = new THREE.Group();
    const style = T.gateStyle(g);
    let face;
    if (g.shootable) {
      grp.userData.dyn = T.dynamicGateTexture(T.gateText(g), style);
      face = grp.userData.dyn.tex;
    } else face = T.gateTexture(T.gateText(g), style);
    const st = T.GATE_STYLES[style];
    const side = new THREE.MeshLambertMaterial({ color: st.edge });
    const front = new THREE.MeshLambertMaterial({ map: face });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(g.w - 0.25, (g.w - 0.25) * 0.42, 0.14), [side, side, side, side, front, side]);
    panel.position.y = 0.95;
    panel.rotation.x = -0.55;
    panel.castShadow = true;
    grp.add(panel);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), this.mats.dark);
      post.position.set(sx * (g.w / 2 - 0.25), 0.45, 0.1);
      grp.add(post);
    }
    grp.position.set(g.x, 0, -g.z);
    grp.userData.panel = panel;
    grp.userData.style = style;
    G.add(grp);
    this.gateMeshes.set(g.id, grp);
  }

  buildBlock(G, b) {
    const grp = new THREE.Group();
    const label = T.numberLabel();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.tex, depthTest: false }));
    sprite.renderOrder = 10;
    let body;
    if (b.kind === 'barrier') {
      const conc = this.mats.concrete;
      body = new THREE.Mesh(new THREE.BoxGeometry(b.w, 1.3, b.d), [conc, conc, conc, conc, this.mats.hazard, conc]);
      body.position.y = 0.65;
      sprite.position.set(0, 2.1, 0.4);
      sprite.scale.set(3.2, 1.6, 1);
    } else if (b.kind === 'barrel') {
      body = new THREE.Group();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.4, 16), this.mats.wood);
      c.position.y = 0.7;
      body.add(c);
      for (const y of [0.25, 1.15]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.05, 6, 20), this.mats.woodDark);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        body.add(ring);
      }
      sprite.position.set(0, 1.1, 1);
      sprite.scale.set(2.2, 1.1, 1);
    } else if (b.kind === 'crate') {
      body = new THREE.Group();
      const ice = new THREE.Mesh(new THREE.BoxGeometry(b.w, 1.4, b.d), this.mats.ice);
      ice.position.y = 0.7;
      const gun = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshBasicMaterial({ map: this.gunTex, transparent: true }));
      gun.position.set(0, 0.75, 0);
      gun.rotation.x = -0.6;
      body.add(gun, ice);
      sprite.position.set(0, 0.4, b.d / 2 + 0.4);
      sprite.scale.set(2, 1, 1);
    } else if (b.kind === 'power') {
      const P = POWER[b.reward.type];
      body = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 1.25), new THREE.MeshLambertMaterial({ color: P.hex, emissive: P.hex, emissiveIntensity: 0.35 }));
      box.position.y = 1.15;
      box.rotation.set(0.6, 0.6, 0);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.16, 16), this.mats.dark);
      base.position.y = 0.08;
      body.add(box, base);
      grp.userData.spin = box;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.emojiTexture(P.icon), depthTest: false }));
      icon.renderOrder = 10;
      icon.position.y = 2.6;
      icon.scale.set(1.3, 1.3, 1);
      grp.userData.icon = icon;
      grp.userData.iconY = 2.6;
      grp.add(icon);
      sprite.position.set(0, 0.45, 1);
      sprite.scale.set(1.8, 0.9, 1);
    } else {
      // Jar with a prisoner inside
      body = new THREE.Group();
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.3, 22), this.mats.glass);
      jar.position.y = 1.15;
      jar.renderOrder = 2;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.3, 18), this.mats.glass);
      neck.position.y = 2.42;
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.35, 14), this.mats.woodDark);
      cork.position.y = 2.7;
      const man = new THREE.Mesh(this.players.geometry, this.mats.vc);
      man.userData.shared = true;
      man.scale.setScalar(2.6);
      man.position.y = 0.05;
      man.rotation.y = Math.PI;
      body.add(man, jar, neck, cork);
      sprite.position.set(0, 1.2, 1.4);
      sprite.scale.set(2.6, 1.3, 1);
    }
    if (b.reward.type === 'weapon') {
      const W = WEAPONS[b.reward.w];
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.tagTexture(W.icon + ' ' + W.name, '#' + W.color.toString(16).padStart(6, '0')), depthTest: false }));
      tag.renderOrder = 10;
      tag.position.y = 2.8;
      tag.scale.set(4.2, 1.05, 1);
      grp.userData.icon = tag;
      grp.userData.iconY = 2.8;
      grp.add(tag);
    }
    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    grp.add(body, sprite);
    grp.position.set(b.x, 0, -b.z);
    grp.userData = { ...grp.userData, label, body, t: 0 };
    label.set(String(Math.ceil(b.hp)));
    G.add(grp);
    this.blockMeshes.set(b, grp);
  }

  buildBoss(G, B) {
    const g = new THREE.Group();
    const m = this.mats;
    const box = (w, h, d, mat, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    const sph = (r, mat, x, y, z) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    // A giant grown-up: the Dad in a polo shirt, the Teacher in a cardigan, the Principal in a suit
    const orange = new THREE.MeshLambertMaterial({ color: BOSS_COLOR[B.type] ?? 0x3f8fd6 });
    const steel = m.skin;
    const jeans = new THREE.MeshLambertMaterial({ color: B.type === 'titan' ? 0x2b2838 : 0x34496b });
    const visor = new THREE.MeshBasicMaterial({ color: 0xff2a1f });
    const legs = [box(0.6, 1.1, 0.75, jeans, -0.55, 0.55, 0), box(0.6, 1.1, 0.75, jeans, 0.55, 0.55, 0)];
    box(0.8, 0.25, 1.0, m.dark, -0.55, 0.12, 0.1);
    box(0.8, 0.25, 1.0, m.dark, 0.55, 0.12, 0.1);
    box(1.7, 0.4, 1.1, jeans, 0, 1.25, 0); // hips
    box(2.4, 1.5, 1.5, orange, 0, 2.15, 0); // body
    box(0.7, 1.1, 0.12, m.white, 0, 2.25, 0.72); // shirt
    box(0.26, 0.95, 0.06, m.red, 0, 2.2, 0.8); // tie
    box(1.0, 0.7, 0.9, m.skin, 0, 3.2, 0.1); // head
    box(1.04, 0.2, 0.94, m.dark, 0, 3.62, 0.08); // hair
    for (const sx of [-1, 1]) box(0.36, 0.22, 0.06, m.dark, sx * 0.24, 3.28, 0.57); // glasses
    box(0.12, 0.05, 0.06, m.dark, 0, 3.3, 0.57);
    if (B.type === 'crusher') box(0.56, 0.12, 0.06, m.dark, 0, 3.02, 0.57); // moustache
    if (B.type !== 'crusher') {
      // Megaphones on the shoulders
      for (const sx of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.14, 0.9, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        horn.rotation.x = Math.PI / 2;
        horn.position.set(sx * 0.95, 3.3, 0.75);
        horn.castShadow = true;
        g.add(horn);
        box(0.3, 0.3, 0.5, m.red, sx * 0.95, 3.3, 0.15);
      }
    }
    const arms = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 1.5, 2.6, 0);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8), orange);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8), steel);
      arm.position.y = -0.7;
      const fist = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 0.85), m.skin);
      fist.position.y = -1.5;
      // The dreaded flip-flop, in the right hand of those who smash
      const flip = sx > 0 && B.type !== 'blaster';
      const knuckles = new THREE.Mesh(flip ? new THREE.BoxGeometry(0.75, 0.14, 2) : new THREE.BoxGeometry(0.2, 0.1, 0.2), flip ? new THREE.MeshLambertMaterial({ color: 0x19c3c9 }) : m.skin);
      knuckles.position.set(0, flip ? -1.95 : -1.6, flip ? 0.5 : 0);
      pivot.add(shoulder, arm, fist, knuckles);
      pivot.traverse((o) => (o.castShadow = true));
      g.add(pivot);
      arms.push(pivot);
    }
    const bar = T.bossBar();
    const barSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bar.tex, depthTest: false }));
    barSprite.renderOrder = 11;
    barSprite.position.y = 4.6;
    barSprite.scale.set(3.4, 0.85, 1);
    g.add(barSprite);
    const s = B.big ? 1.45 : 1.15;
    g.scale.setScalar(s);
    g.position.set(B.x, 0, -B.z);
    G.add(g);
    this.boss = { g, arms, legs, bar, barSprite, s, fall: 0, mat: orange };
    bar.set(B.hp, B.maxHp);
  }

  // ---------- Effects ----------
  burst(x, y, z, hex, n, speed = 3, size = 1, life = 0.6) {
    for (let i = 0; i < n; i++) {
      if (this.fx.length >= MAXFX) this.fx.shift();
      const a = Math.random() * Math.PI * 2, u = Math.random();
      this.fx.push({
        x, y, z,
        vx: Math.cos(a) * speed * (0.4 + u), vy: speed * (0.6 + Math.random()), vz: Math.sin(a) * speed * (0.4 + u),
        life, max: life, size: size * (0.6 + Math.random() * 0.8), c: hex,
      });
    }
  }

  ring(x, z, r, hex = 0xffffff) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, -z);
    this.scene.add(mesh);
    this.rings.push({ mesh, t: 0, r });
  }

  float(text, x, y, z, cls = '') {
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    this.labels.appendChild(el);
    this.floats.push({ el, x, y, z, t: 0 });
  }

  handle(events) {
    const sim = this.sim;
    let kills = 0, lost = 0, lostN = 0, sparks = 0, booms = 0;
    for (const e of events) {
      switch (e.type) {
        case 'gate': {
          const grp = this.gateMeshes.get(e.gate.id);
          if (grp) grp.userData.pop = 0.001;
          for (const o of sim.gates) if (o.skipped && !o._faded) { o._faded = true; const m = this.gateMeshes.get(o.id); if (m) m.userData.fade = 0.001; }
          const txt = e.delta >= 0 ? '+' + e.delta : '−' + -e.delta;
          this.float(txt, sim.squad.x, 1.6, e.z, e.delta >= 0 ? 'good' : 'bad');
          this.burst(e.x, 0.9, e.z, e.delta >= 0 ? (e.gate.yellow ? 0xffd23a : 0x4f9bff) : 0xff4b3e, 8, 3, 1.2, 0.5);
          break;
        }
        case 'gateUp': {
          const grp = this.gateMeshes.get(e.gate.id);
          if (grp?.userData.dyn) {
            const st = T.gateStyle(e.gate);
            grp.userData.dyn.redraw(T.gateText(e.gate), st);
            grp.userData.panel.material[0].color.set(T.GATE_STYLES[st].edge);
            grp.userData.bump = 0.15;
          }
          break;
        }
        case 'kill': {
          if (kills++ > 40) break;
          const K = KINDS[e.kind];
          if (!K) { this.burst(e.x, 1, e.z, 0xfafafa, 16, 5, 1.3, 0.7); break; }
          const bigOne = K.scale > 1.15;
          this.burst(e.x, 0.4, e.z, K.body, bigOne ? 9 : 3, 2.5, bigOne ? 1.5 : 0.8, 0.45);
          break;
        }
        case 'lost':
          if (lost++ < 30) this.burst(e.x, 0.4, e.z, 0x4f9bff, Math.min(10, 3 + e.n), 2.5, 0.9, 0.5);
          lostN += e.n;
          break;
        case 'coin':
          if (sparks++ < 8) this.burst(e.x, 0.7, e.z, 0xffd23a, 3, 3, 0.6, 0.3);
          break;
        case 'heal':
          this.float('+' + e.n + ' ✚', e.x, 2, e.z, 'heal');
          this.burst(e.x, 0.6, e.z, 0x4fe08a, 14, 3.5, 0.9, 0.6);
          break;
        case 'tankBlock':
          this.float('NOPE! ' + e.n, sim.squad.x, 2.4, sim.squad.z + sim.squad.Rz, 'heal');
          this.burst(e.x, 0.8, e.z, 0xf2b01e, 14, 4, 1.1, 0.5);
          break;
        case 'snipe': {
          // A dotted white tracer from the sniper to the target
          const q = sim.squad, x0 = q.x - q.Rx * 0.7 - 0.5, z0 = q.z - q.Rz * 0.7;
          for (let i = 1; i <= 10 && this.fx.length < MAXFX; i++) this.fx.push({ x: x0 + ((e.x - x0) * i) / 10, y: 0.7, z: z0 + ((e.z - z0) * i) / 10, vx: 0, vy: 1.2, vz: 0, life: 0.16, max: 0.16, size: 0.7, c: 0xffffff });
          this.burst(e.x, 0.6, e.z, 0xffffff, 5, 3, 0.8, 0.3);
          break;
        }
        case 'blocked':
          if (sparks++ < 6) this.burst(e.x, 0.6, e.z, 0x8fe8ff, 4, 3, 0.8, 0.35);
          break;
        case 'hazard':
          if (sparks++ < 6) this.burst(e.x, 0.3, e.z, 0xffe04d, 5, 4, 0.7, 0.3);
          this.shake = Math.max(this.shake, 0.12);
          break;
        case 'clang':
          if (sparks++ < 4) this.burst(e.x, 0.6, e.z, 0xfff3c0, 2, 3, 0.5, 0.2);
          break;
        case 'boom':
          if (booms++ < 8) {
            this.ring(e.x, e.z, e.r * 1.2, 0xffb347);
            this.burst(e.x, 0.5, e.z, 0xff8a1a, 9, 5, 1.4, 0.5);
            this.burst(e.x, 0.5, e.z, 0x3a3f4b, 4, 3, 1.6, 0.7);
          }
          this.shake = Math.max(this.shake, 0.18);
          break;
        case 'orbHit':
          this.burst(e.x, 0.5, e.z, 0xff3b2f, 8, 4, 1, 0.4);
          this.shake = Math.max(this.shake, 0.2);
          break;
        case 'volley':
          this.burst(e.x, 3.2, e.z, 0xff7a3d, 14, 4, 1, 0.4);
          break;
        case 'summon':
          this.float('BACKUP!', e.x, 2.5, e.z - 3, 'bad small');
          break;
        case 'enrage':
          this.float("THAT'S IT!!", e.x, 5.5, e.z, 'bad');
          this.burst(e.x, 2.5, e.z, 0xff2a1f, 30, 7, 1.5, 0.8);
          this.shake = 0.5;
          break;
        case 'nuke':
          this.ring(e.x, e.z, 34, 0xffffff);
          this.ring(e.x, e.z, 22, 0xffb347);
          for (let i = 0; i < 8; i++) this.burst(e.x + (Math.random() - 0.5) * 11, 0.5, e.z + (Math.random() - 0.5) * 24, 0xff8a1a, 10, 6, 1.8, 0.8);
          this.shake = 0.9;
          break;
        case 'blockGone': {
          const grp = this.blockMeshes.get(e.block);
          if (grp) grp.visible = false;
          this.burst(e.block.x, 0.8, e.block.z, 0xcfd3da, 10, 3, 1, 0.5);
          break;
        }
        case 'blockHit': {
          const grp = this.blockMeshes.get(e.block);
          if (grp) grp.userData.t = 0.08;
          break;
        }
        case 'break': {
          const b = e.block, grp = this.blockMeshes.get(b);
          if (grp) grp.visible = false;
          const hex = b.kind === 'barrel' ? 0xb4762f : b.kind === 'crate' ? 0x9fe6ff : b.kind === 'jar' ? 0x6fc4ff : b.kind === 'power' ? POWER[b.reward.type].hex : 0xb8bbc2;
          this.burst(b.x, 0.8, b.z, hex, 30, 5, 1.6, 0.9);
          if (e.text) this.float(e.text, b.x, 2.2, b.z, b.reward.type === 'weapon' || b.kind === 'power' ? 'weapon' : 'good');
          if (b.reward.type === 'weapon') {
            this.bulletMat.color.set(WEAPONS[sim.weapon].color);
            this.glowMat.color.set(WEAPONS[sim.weapon].color);
          }
          this.shake = Math.max(this.shake, 0.25);
          break;
        }
        case 'smash':
          this.ring(e.x, e.z, e.r * 1.3, 0xffffff);
          this.burst(e.x, 0.2, e.z, 0xcfc6b5, 26, 6, 1.8, 0.8);
          this.shake = 0.7;
          break;
        case 'bossDead':
          this.burst(e.x, 2, e.z, 0xd8382f, 50, 7, 2, 1.2);
          this.burst(e.x, 2, e.z, 0xffd23a, 30, 8, 1.2, 1.2);
          this.shake = 0.8;
          break;
      }
    }
    // One red number for everything lost this frame
    if (lostN >= 2 && sim.squad.count > 0) this.float('−' + lostN, sim.squad.x + (Math.random() - 0.5) * 1.5, 1.4, sim.squad.z - 0.5, 'bad small');
  }

  // ---------- Per frame ----------
  frame(sim, dt) {
    this.time += dt;
    const t = this.time;
    const q = sim.squad;
    const m4 = this.m4, quat = this.q, v = this.v, s = this.s, e = this.e;

    // Players
    const shown = Math.min(q.count, MAXP);
    const step = q.count > MAXP ? q.count / MAXP : 1;
    const moving = q.speed > 0.5;
    const pc = this.pCur;
    for (let j = 0; j < shown; j++) {
      const p = sim.soldierPos(Math.floor(j * step), this.p);
      if (j >= this.pShown) { pc[j * 2] = p.x; pc[j * 2 + 1] = p.z; this.pSpawn[j] = 0.25; }
      else if (Math.abs(p.z - pc[j * 2 + 1]) > 8) { pc[j * 2] = p.x; pc[j * 2 + 1] = p.z; }
      else {
        const k = Math.min(1, dt * 9);
        pc[j * 2] += (p.x - pc[j * 2]) * k;
        pc[j * 2 + 1] += (p.z - pc[j * 2 + 1]) * k;
      }
      let sc = 1;
      if (this.pSpawn[j] > 0) { this.pSpawn[j] -= dt; sc = 1 + this.pSpawn[j] * 3; }
      const bob = moving ? Math.abs(Math.sin(t * 15 + j * 1.3)) * 0.1 : 0;
      e.set(moving ? Math.sin(t * 15 + j) * 0.08 : 0, Math.PI + (q.engaged ? 0 : Math.sin(t * 7 + j) * 0.06), 0);
      m4.compose(v.set(pc[j * 2], bob, -pc[j * 2 + 1]), quat.setFromEuler(e), s.set(sc, sc, sc));
      this.players.setMatrixAt(j, m4);
    }
    this.pShown = shown;
    this.players.count = shown;
    this.players.instanceMatrix.needsUpdate = true;

    // Enemies, one instanced mesh per kind
    const kinds = this.kinds;
    for (const id in kinds) kinds[id].n = 0;
    for (const en of sim.enemies) {
      if (!en.alive) continue;
      const K = kinds[en.kind];
      if (K.n >= K.max || Math.abs(en.z - q.z) > 120) continue;
      if (en.straight) {
        // Iron balls drop in when they start rolling
        if (!en.active) continue;
        const drop = Math.max(0, 0.35 - en.t) * 30;
        e.set(en.t * en.speed, 0, 0);
        m4.compose(v.set(en.x, 1 + drop, -en.z), quat.setFromEuler(e), s.set(1, 1, 1));
      } else {
        const sc = K.scale;
        const run = en.active && en.speed > 0;
        const bob = run ? Math.abs(Math.sin(t * 13 + en.phase)) * 0.09 : 0;
        e.set(run ? K.lean ?? 0.12 : 0, en.z < q.z ? Math.PI : 0, run ? Math.sin(t * 13 + en.phase) * 0.06 : 0);
        m4.compose(v.set(en.x, bob, -en.z), quat.setFromEuler(e), s.set(sc, sc, sc));
      }
      K.mesh.setMatrixAt(K.n++, m4);
    }
    for (const id in kinds) { kinds[id].mesh.count = kinds[id].n; kinds[id].mesh.instanceMatrix.needsUpdate = true; }

    // Enemy shots
    const ns = Math.min(sim.shots.length, MAXSHOT);
    for (let i = 0; i < ns; i++) {
      const o = sim.shots[i];
      const sc = o.r * (1 + Math.sin(t * 20 + i) * 0.12);
      m4.compose(v.set(o.x, 0.55, -o.z), quat.identity(), s.set(sc, sc, sc));
      this.orbs.setMatrixAt(i, m4);
      this.orbGlow.setMatrixAt(i, m4);
    }
    this.orbs.count = this.orbGlow.count = ns;
    this.orbs.instanceMatrix.needsUpdate = this.orbGlow.instanceMatrix.needsUpdate = true;

    // Saws and moving gates
    for (const sw of this.saws) { sw.grp.position.x = sw.h.x; sw.grp.rotation.y = -t * 11; }
    for (const w of this.walls) { w.pair[0].position.x = w.h.c - w.h.half; w.pair[1].position.x = w.h.c + w.h.half; }

    // Coins
    let nc = 0;
    for (const c of sim.pickups) {
      if (!c.alive || nc >= MAXCOIN || c.z < q.z - 12 || c.z > q.z + 75) continue;
      e.set(0, t * 4 + c.z, 0);
      const cs = c.v > 1 ? 1.25 : 1;
      m4.compose(v.set(c.x, 0.55 + Math.sin(t * 3 + c.z) * 0.08, -c.z), quat.setFromEuler(e), s.set(cs, cs, cs));
      this.coins.setMatrixAt(nc++, m4);
    }
    this.coins.count = nc;
    this.coins.instanceMatrix.needsUpdate = true;

    // Heroes: tank in front, medic and sniper at the back corners
    const hp = { tank: [0, q.Rz + 0.7], medic: [q.Rx * 0.7 + 0.5, -q.Rz * 0.7 - 0.4], sniper: [-q.Rx * 0.7 - 0.5, -q.Rz * 0.7 - 0.4] };
    for (const id in this.heroes) {
      const m = this.heroes[id];
      m.visible = !!sim.heroes[id] && q.count > 0;
      if (!m.visible) continue;
      m.position.set(q.x + hp[id][0], moving ? Math.abs(Math.sin(t * 12 + hp[id][0])) * 0.12 : 0, -(q.z + hp[id][1]));
      m.rotation.y = Math.PI;
    }
    this.lamp.position.set(q.x, 7, -(q.z + 5));

    // Shield bubble
    const shielded = sim.shieldT > 0 && q.count > 0;
    this.bubble.visible = shielded && (sim.shieldT > 1.5 || Math.sin(t * 24) > 0);
    if (shielded) { this.bubble.position.set(q.x, 0, -q.z); this.bubble.scale.set(q.Rx + 0.7, 1.5 + q.R * 0.25, q.Rz + 0.7); }

    // Bullets
    const bl = sim.bullets;
    const nb = Math.min(bl.length, MAXB);
    for (let i = 0; i < nb; i++) {
      const b = bl[i];
      e.set(0, Math.atan2(-b.slope, 1), 0);
      quat.setFromEuler(e);
      const sh = WEAPONS[b.w].shape;
      m4.compose(v.set(b.x, 0.42, -b.z), quat, s.set(sh[0], sh[1], sh[2]));
      this.bullets.setMatrixAt(i, m4);
      this.glow.setMatrixAt(i, m4);
    }
    this.bullets.count = this.glow.count = nb;
    this.bullets.instanceMatrix.needsUpdate = this.glow.instanceMatrix.needsUpdate = true;

    // Gates: pop, fade, bump
    for (const g of sim.gates) if (g.move && !g.used) this.gateMeshes.get(g.id).position.x = g.x;
    for (const [, grp] of this.gateMeshes) {
      const u = grp.userData;
      if (u.pop) {
        u.pop += dt;
        const k = u.pop / 0.35;
        grp.scale.setScalar(Math.max(0.001, 1 + k * 0.5 - k * k * 1.5));
        grp.position.y = k * 1.5;
        if (k >= 1) { grp.visible = false; u.pop = 0; }
      } else if (u.fade) {
        u.fade += dt;
        grp.position.y = -u.fade * 3;
        if (u.fade > 0.5) { grp.visible = false; u.fade = 0; }
      } else if (u.bump > 0) {
        u.bump -= dt;
        grp.scale.setScalar(1 + u.bump);
      }
    }

    // Blocks: hit shake and labels
    for (const [b, grp] of this.blockMeshes) {
      if (!b.alive) { grp.visible = false; continue; }
      const u = grp.userData;
      u.label.set(String(Math.ceil(b.hp)));
      if (u.t > 0) {
        u.t -= dt;
        u.body.position.x = Math.sin(t * 90) * 0.05;
        u.body.scale.setScalar(1.03);
      } else { u.body.position.x = 0; u.body.scale.setScalar(1); }
      if (u.icon) u.icon.position.y = u.iconY + Math.sin(t * 3 + b.x) * 0.12;
      if (u.spin) { u.spin.rotation.y = t * 1.8; u.spin.position.y = 1.15 + Math.sin(t * 3) * 0.1; }
    }

    this.updateBoss(sim, dt);

    // Particles
    const fx = this.fx;
    let k = 0;
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      const sc = p.size * Math.min(1, (p.life / p.max) * 2);
      m4.compose(v.set(p.x, p.y, -p.z), quat.identity(), s.set(sc, sc, sc));
      this.fxMesh.setMatrixAt(k, m4);
      this.fxMesh.setColorAt(k, this.tmpC.setHex(p.c));
      fx[k++] = p;
    }
    fx.length = k;
    this.fxMesh.count = k;
    this.fxMesh.instanceMatrix.needsUpdate = true;
    if (this.fxMesh.instanceColor) this.fxMesh.instanceColor.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k2 = r.t / 0.5;
      r.mesh.scale.setScalar(0.3 + k2 * r.r);
      r.mesh.material.opacity = 0.8 * (1 - k2);
      if (k2 >= 1) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); this.rings.splice(i, 1); }
    }

    for (const p of this.pulse) p.mat.color.setHex(p.hex).offsetHSL(0, 0, Math.sin(t * p.speed) * p.amp);
    this.applyTheme(q.z);

    // Camera follows the squad, pulls back for big squads and bosses
    // A long column needs more room than a round squad, and so does a wide road
    const pull = Math.min(6, Math.max(q.R, q.Rz * 0.75) * 0.5) + (sim.boss.active && sim.boss.alive ? 2 : 0) + (this.portrait ? 1.5 : 0) + Math.max(0, this.half - 6) * 1.6;
    const cx = q.x * 0.45, cz = -q.z;
    v.set(cx, 11 + pull, cz + 8.5 + pull * 0.6);
    const snap = this.camPos.distanceTo(v) > 25;
    if (snap) this.camPos.copy(v);
    this.camPos.lerp(v, Math.min(1, dt * 4));
    v.set(q.x * 0.3, 0, cz - 8);
    if (snap) this.camLook.copy(v);
    this.camLook.lerp(v, Math.min(1, dt * 5));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const a = this.shake * 0.6;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.camLook);
    this.sun.position.set(q.x + 10, 24, cz + 8);
    this.sun.target.position.set(q.x, 0, cz - 8);

    this.gl.render(this.scene, this.camera);
    this.updateLabels(sim, dt);
  }

  updateBoss(sim, dt) {
    const B = sim.boss, b = this.boss;
    if (!b) return;
    const t = this.time;
    if (!B.alive) {
      // Topple backwards and sink
      b.fall = Math.min(1, b.fall + dt * 1.6);
      b.g.rotation.x = -b.fall * 1.45;
      b.g.position.y = -Math.max(0, b.fall - 0.7) * 3;
      b.barSprite.visible = false;
      return;
    }
    b.g.position.set(B.x, 0, -B.z);
    b.bar.set(B.hp, B.maxHp);
    b.barSprite.visible = B.active;
    let a0 = Math.sin(t * 2) * 0.1, a1 = -a0;
    if (B.state === 'walk') {
      a0 = Math.sin(t * 6) * 0.35; a1 = -a0;
      b.legs[0].position.y = 0.55 + Math.max(0, Math.sin(t * 6)) * 0.2;
      b.legs[1].position.y = 0.55 + Math.max(0, -Math.sin(t * 6)) * 0.2;
      b.g.position.y = Math.abs(Math.sin(t * 6)) * 0.12;
    }
    // Negative x rotation swings the arms up through the front (toward the camera)
    if (B.state === 'windup') {
      const k = 1 - B.t / 0.85;
      a0 = a1 = -2.9 * Math.min(1, k * 1.6);
      b.g.rotation.x = -0.15 * k;
    } else if (B.state === 'smash') {
      const k = Math.min(1, (0.45 - B.t) / 0.12);
      a0 = a1 = -2.9 + 1.6 * k;
      b.g.rotation.x = 0.25 * k;
    } else if (B.state === 'aim') {
      const k = 1 - B.t / 0.7;
      a0 = a1 = -1.5 * Math.min(1, k * 2);
      b.g.rotation.x = -0.12 * k;
    } else if (B.state === 'recoil') {
      a0 = a1 = -1.5;
      b.g.rotation.x = -0.25 * (B.t / 0.35);
    } else b.g.rotation.x *= 0.9;
    b.mat.emissive.setHex(B.enraged ? 0xff2200 : 0x000000);
    b.mat.emissiveIntensity = B.enraged ? 0.25 + Math.sin(t * 9) * 0.15 : 0;
    b.arms[0].rotation.x = a0;
    b.arms[1].rotation.x = a1;
  }

  project(x, y, z) {
    const v = this.v.set(x, y, -z).project(this.camera);
    return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight, v.z < 1];
  }

  updateLabels(sim, dt) {
    const q = sim.squad;
    const [x, y, ok] = this.project(q.x, 1.2, q.z + q.Rz * 0.3);
    this.countEl.style.transform = `translate(${x}px, ${y - 30}px) translate(-50%, -100%)`;
    this.countEl.style.display = ok && q.count > 0 ? '' : 'none';
    this.countEl.textContent = q.count;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      const [fx, fy] = this.project(f.x, f.y + f.t * 1.6, f.z);
      f.el.style.transform = `translate(${fx}px, ${fy}px) translate(-50%, -50%) scale(${Math.min(1.25, 0.6 + f.t * 4)})`;
      f.el.style.opacity = String(Math.min(1, 2.4 - f.t * 2));
      if (f.t > 1.2) { f.el.remove(); this.floats.splice(i, 1); }
    }
  }

  // Menu background: a slow view of the level start
  idle(sim, dt) { this.frame(sim, dt); }
}
