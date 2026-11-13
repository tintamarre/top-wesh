import './style.css';
import { buildLevel } from './level.js';
import { Sim } from './sim.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';
import { UPGRADES, upgradeCost, upgradeStats } from './upgrades.js';

const $ = (id) => document.getElementById(id);
const KEY = 'top-wesh-save-v1';

function load() {
  const def = { level: 1, coins: 0, up: { start: 0, power: 0, rate: 0 }, sound: true, shadows: !matchMedia('(pointer: coarse)').matches };
  try { return { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return def; }
}
const save = load();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* private mode */ } };

const renderer = new Renderer($('view'), $('labels'));
renderer.setShadows(save.shadows);
const audio = new Audio();
audio.on = save.sound;

let sim = null;
let mode = 'menu'; // menu | play | pause | end
let acc = 0;
let ended = false;
const DT = 1 / 60;

function newRun(n) {
  const level = buildLevel(n);
  sim = new Sim(level, upgradeStats(save.up));
  renderer.loadLevel(level, sim);
  renderer.bulletMat.color.set(0xffd34d);
  renderer.glowMat.color.set(0xffd34d);
  ended = false;
  acc = 0;
  $('hudLevel').textContent = `Level ${n}`;
  $('bossBar').classList.add('hidden');
}

function show(id) {
  for (const s of ['menu', 'help', 'pause', 'end']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', !(mode === 'play' || mode === 'pause'));
}

// ---------- Menu & shop ----------
function renderShop() {
  $('menuCoins').textContent = save.coins;
  $('playLevel').textContent = `Level ${save.level}`;
  const shop = $('shop');
  shop.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = save.up[u.id] ?? 0;
    const cost = upgradeCost(u.id, lvl);
    const b = document.createElement('button');
    b.className = 'card' + (cost > save.coins ? ' poor' : '');
    b.innerHTML = `<span class="ico">${u.icon}</span><span class="nm">${u.name}</span><span class="lv">Lv ${lvl + 1}</span><span class="ds">${u.desc}</span><span class="cost"><span class="coin"></span>${cost}</span>`;
    b.onclick = () => {
      audio.unlock();
      if (save.coins < cost) { b.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], 200); return; }
      save.coins -= cost;
      save.up[u.id] = lvl + 1;
      persist();
      audio.tone(660, 0.08, 'square', 0.1);
      audio.tone(990, 0.12, 'square', 0.1, 0, 0.07);
      renderShop();
      // Show the new squad size on the menu background
      if (u.id === 'start') sim.squad.count = upgradeStats(save.up).start;
    };
    shop.appendChild(b);
  }
  $('btnSound').textContent = save.sound ? '🔊 Sound' : '🔇 Muted';
  $('btnQuality').textContent = `Shadows: ${save.shadows ? 'on' : 'off'}`;
}

function toMenu() {
  mode = 'menu';
  newRun(save.level);
  renderShop();
  show('menu');
}

function play() {
  audio.unlock();
  if (sim.time > 0 || sim.state !== 'play') newRun(save.level);
  mode = 'play';
  show(null);
  $('hint').style.opacity = 1;
  hintTimer = 3;
}

let hintTimer = 0;

$('btnPlay').onclick = play;
$('btnHelp').onclick = () => { audio.unlock(); $('help').classList.remove('hidden'); };
$('help').querySelector('[data-close]').onclick = () => $('help').classList.add('hidden');
$('btnSound').onclick = () => { save.sound = audio.on = !save.sound; audio.unlock(); persist(); renderShop(); };
$('btnQuality').onclick = () => { save.shadows = !save.shadows; renderer.setShadows(save.shadows); persist(); renderShop(); };
$('btnPause').onclick = () => { if (mode === 'play') { mode = 'pause'; show('pause'); } };
$('pause').addEventListener('click', (e) => {
  const act = e.target.dataset?.act;
  if (act === 'resume') { mode = 'play'; show(null); }
  if (act === 'restart') { newRun(save.level); mode = 'play'; show(null); }
  if (act === 'menu') toMenu();
});
$('btnNext').onclick = () => { newRun(save.level); mode = 'play'; show(null); };
$('btnRetry').onclick = () => { newRun(save.level); mode = 'play'; show(null); };
$('btnMenu').onclick = toMenu;

function endLevel() {
  ended = true;
  const won = sim.state === 'won';
  const n = sim.L.n;
  const earned = Math.floor(sim.coins) + (won ? 10 * n + Math.floor(sim.squad.count / 10) : 0);
  save.coins += earned;
  if (won) save.level = n + 1;
  persist();
  mode = 'end';
  $('endTitle').textContent = won ? 'VICTORY!' : 'DEFEATED';
  $('endTitle').classList.toggle('fail', !won);
  $('endStats').innerHTML = won
    ? `Level ${n} cleared<br>${sim.squad.count} soldiers left · best squad ${sim.peak}<br>${sim.kills} enemies down`
    : `Level ${n}<br>Best squad ${sim.peak} · ${sim.kills} enemies down<br>Upgrade your squad and try again!`;
  $('endCoins').textContent = earned;
  $('btnNext').classList.toggle('hidden', !won);
  $('btnRetry').classList.toggle('hidden', won);
  show('end');
}

// ---------- Input ----------
let drag = null;
const keys = new Set();
const isUI = (t) => t.closest('button, a, .panel, .shop');
window.addEventListener('pointerdown', (e) => {
  if (isUI(e.target) || mode !== 'play') return;
  audio.unlock();
  drag = { id: e.pointerId, x: e.clientX, tx: sim.squad.targetX };
});
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || mode !== 'play') return;
  const span = Math.min(window.innerWidth, 720);
  sim.squad.targetX = Math.max(-6, Math.min(6, drag.tx + ((e.clientX - drag.x) / span) * 15));
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') { mode = 'pause'; show('pause'); } else if (mode === 'pause') { mode = 'play'; show(null); }
  }
  if ((e.code === 'Enter' || e.code === 'Space') && mode === 'menu' && $('help').classList.contains('hidden')) play();
  if ((e.code === 'Enter' || e.code === 'Space') && mode === 'end') (sim.state === 'won' ? $('btnNext') : $('btnRetry')).click();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (mode === 'play') { mode = 'pause'; show('pause'); } });
window.addEventListener('resize', () => renderer.resize());

function keyboard(dt) {
  let d = 0;
  if (keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('KeyQ')) d -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) d += 1;
  if (d) {
    const q = sim.squad;
    // Start from where the squad is, so releasing the key stops it
    if (Math.abs(q.targetX - q.x) > 1) q.targetX = q.x;
    q.targetX = Math.max(-6, Math.min(6, q.targetX + d * 11 * dt));
  }
}

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (mode === 'play') {
    keyboard(dt);
    acc += dt;
    while (acc >= DT) { sim.update(DT); acc -= DT; }
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('hint').style.opacity = 0; }
    hud();
    if ((sim.state === 'won' || sim.state === 'lost') && !ended) endLevel();
  }
  const ev = sim.events.splice(0);
  renderer.handle(ev);
  audio.handle(ev);
  renderer.frame(sim, mode === 'pause' ? 0 : dt);
  requestAnimationFrame(loop);
}

function hud() {
  $('hudCoins').textContent = save.coins + Math.floor(sim.coins);
  $('hudProg').style.width = `${Math.min(100, (sim.squad.z / sim.boss.z) * 100)}%`;
  $('hudWeapon').textContent = '🔫 ' + sim.weaponInfo.name;
  const B = sim.boss;
  const showBoss = B.active && B.alive;
  $('bossBar').classList.toggle('hidden', !showBoss);
  if (showBoss) $('bossFill').style.width = `${(B.hp / B.maxHp) * 100}%`;
}

// Debug / test hooks
window.__game = { get sim() { return sim; }, renderer, save, newRun, play };

toMenu();
requestAnimationFrame(loop);
