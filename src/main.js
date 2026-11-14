import './style.css';
import { buildLevel, buildBonus, bossType } from './level.js';
import { Sim, BOSS_NAMES } from './sim.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';
import { UPGRADES, upgradeCost, upgradeStats } from './upgrades.js';
import { PERKS, HEROES, offerPerks, starsFor } from './perks.js';

const $ = (id) => document.getElementById(id);
const KEY = 'top-wesh-save-v1';

// level: highest level unlocked. stars: best stars per level. perks: times each perk was picked.
// pending: perks offered for the level just cleared, until one is chosen.
function load() {
  const def = { level: 1, coins: 0, up: { start: 0, power: 0, rate: 0 }, stars: {}, perks: {}, heroes: {}, pending: null, sound: true, shadows: !matchMedia('(pointer: coarse)').matches };
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
let cur = save.level; // level to play next
let bonus = false; // the current run is a coin rush
let bonusNext = false; // a coin rush comes before the next level
let acc = 0;
let ended = false;
const DT = 1 / 60;
const STAR = (n, of = 3) => '★'.repeat(n) + '☆'.repeat(of - n);
const simOpts = () => ({ ...upgradeStats(save.up), perks: save.perks, heroes: save.heroes });

function newRun(n, isBonus = false) {
  bonus = isBonus;
  const level = isBonus ? buildBonus(n) : buildLevel(n);
  sim = new Sim(level, simOpts());
  renderer.loadLevel(level, sim);
  ended = false;
  acc = 0;
  $('hudLevel').textContent = isBonus ? 'Coin rush' : `Level ${n}`;
  $('hudBoss').textContent = isBonus ? '🏁' : '☠';
  $('bossBar').classList.add('hidden');
  $('bossName').textContent = BOSS_NAMES[level.boss.type];
}

function show(id) {
  for (const s of ['menu', 'help', 'levels', 'pause', 'end']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', !(mode === 'play' || mode === 'pause'));
  $('labels').classList.toggle('hidden', mode === 'menu');
}

// ---------- Menu & shop ----------
function card(html, poor, onBuy) {
  const b = document.createElement('button');
  b.className = 'card' + (poor ? ' poor' : '');
  b.innerHTML = html;
  b.onclick = () => { audio.unlock(); onBuy(b); };
  return b;
}
const shake = (b) => b.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], 200);
function bought() {
  persist();
  audio.tone(660, 0.08, 'square', 0.1);
  audio.tone(990, 0.12, 'square', 0.1, 0, 0.07);
  renderShop();
  // Show the new squad on the menu background
  sim.squad.count = upgradeStats(save.up).start;
  Object.assign(sim.heroes, save.heroes);
}

function renderShop() {
  $('menuCoins').textContent = save.coins;
  $('menuStars').textContent = Object.values(save.stars).reduce((a, b) => a + b, 0);
  $('playLevel').textContent = `Level ${cur}`;
  const shop = $('shop');
  shop.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = save.up[u.id] ?? 0;
    const cost = upgradeCost(u.id, lvl);
    shop.appendChild(card(`<span class="ico">${u.icon}</span><span class="nm">${u.name}</span><span class="lv">Lv ${lvl + 1}</span><span class="ds">${u.desc}</span><span class="cost"><span class="coin"></span>${cost}</span>`, cost > save.coins, (b) => {
      if (save.coins < cost) return shake(b);
      save.coins -= cost;
      save.up[u.id] = lvl + 1;
      bought();
    }));
  }
  const heroes = $('heroes');
  heroes.innerHTML = '';
  for (const h of HEROES) {
    const own = !!save.heroes[h.id];
    heroes.appendChild(card(`<span class="ico">${h.icon}</span><span class="nm">${h.name}</span><span class="ds">${h.desc}</span>${own ? '<span class="cost own">In the squad</span>' : `<span class="cost"><span class="coin"></span>${h.cost}</span>`}`, !own && h.cost > save.coins, (b) => {
      if (own) return;
      if (save.coins < h.cost) return shake(b);
      save.coins -= h.cost;
      save.heroes[h.id] = true;
      bought();
    }));
  }
  const mine = PERKS.filter((p) => save.perks[p.id]);
  $('menuPerks').innerHTML = mine.map((p) => `<span title="${p.name}: ${p.desc}">${p.icon}${save.perks[p.id] > 1 ? '×' + save.perks[p.id] : ''}</span>`).join('');
  $('menuPerks').classList.toggle('hidden', !mine.length);
  $('btnSound').textContent = save.sound ? '🔊 Sound' : '🔇 Muted';
  $('btnQuality').textContent = `Shadows: ${save.shadows ? 'on' : 'off'}`;
}

// Level map: every level unlocked so far with its best stars, and the next few locked ones
function renderLevels() {
  const grid = $('levelGrid');
  grid.innerHTML = '';
  const last = Math.ceil((save.level + 1) / 5) * 5;
  const icon = { crusher: '', blaster: '🔫', titan: '👑' };
  for (let n = 1; n <= last; n++) {
    const b = document.createElement('button');
    const open = n <= save.level;
    b.className = 'lvl' + (open ? '' : ' locked') + (n === cur ? ' cur' : '');
    b.innerHTML = `<b>${open ? n : '🔒'}</b><i>${open ? STAR(save.stars[n] ?? 0) : ''}</i><u>${icon[bossType(n)]}</u>`;
    if (open) b.onclick = () => { audio.unlock(); cur = n; bonusNext = false; newRun(n); mode = 'play'; startPlay(); };
    grid.appendChild(b);
  }
  $('levelsTotal').textContent = `${Object.values(save.stars).reduce((a, b) => a + b, 0)} / ${save.level > 1 ? (save.level - 1) * 3 : 0} ★`;
}

function toMenu() {
  mode = 'menu';
  bonusNext = false;
  cur = Math.min(cur, save.level);
  newRun(cur);
  renderShop();
  show('menu');
  if (save.pending) showPerks();
}

function startPlay() {
  mode = 'play';
  show(null);
  $('hint').style.opacity = 1;
  hintTimer = 3;
}

function play() {
  audio.unlock();
  if (sim.time > 0 || sim.state !== 'play' || bonus) newRun(cur);
  startPlay();
}

// What the Next button does: the coin rush first when one is due
function next() {
  if (bonusNext) { bonusNext = false; newRun(cur - 1, true); } else newRun(cur);
  startPlay();
}

let hintTimer = 0;

$('btnPlay').onclick = play;
$('btnHelp').onclick = () => { audio.unlock(); $('help').classList.remove('hidden'); };
$('help').querySelector('[data-close]').onclick = () => $('help').classList.add('hidden');
$('btnLevels').onclick = () => { audio.unlock(); renderLevels(); $('levels').classList.remove('hidden'); };
$('levels').querySelector('[data-close]').onclick = () => $('levels').classList.add('hidden');
$('btnSound').onclick = () => { save.sound = audio.on = !save.sound; audio.unlock(); persist(); renderShop(); };
$('btnQuality').onclick = () => { save.shadows = !save.shadows; renderer.setShadows(save.shadows); persist(); renderShop(); };
$('btnPause').onclick = () => { if (mode === 'play') { mode = 'pause'; show('pause'); } };
$('pause').addEventListener('click', (e) => {
  const act = e.target.dataset?.act;
  if (act === 'resume') { mode = 'play'; show(null); }
  if (act === 'restart') { newRun(sim.L.n, bonus); mode = 'play'; show(null); }
  if (act === 'menu') toMenu();
});
$('btnNext').onclick = next;
$('btnRetry').onclick = () => { newRun(sim.L.n); startPlay(); };
$('btnMenu').onclick = toMenu;

// ---------- Perk choice ----------
function showPerks() {
  const box = $('perkList');
  box.innerHTML = '';
  for (const id of save.pending) {
    const p = PERKS.find((x) => x.id === id);
    if (!p) continue;
    const have = save.perks[id] ?? 0;
    const b = document.createElement('button');
    b.className = 'perk';
    b.innerHTML = `<span class="ico">${p.icon}</span><span><b>${p.name}</b> <small>${have + 1} / ${p.max}</small><br>${p.desc}</span>`;
    b.onclick = () => {
      save.perks[id] = have + 1;
      save.pending = null;
      persist();
      audio.tone(520, 0.1, 'triangle', 0.15);
      audio.tone(780, 0.2, 'triangle', 0.15, 0, 0.09);
      $('perks').classList.add('hidden');
      if (mode === 'menu') { renderShop(); newRun(cur); }
    };
    box.appendChild(b);
  }
  if (!box.children.length) { save.pending = null; persist(); return; }
  $('perks').classList.remove('hidden');
}

function endLevel() {
  ended = true;
  const won = sim.state === 'won';
  const n = sim.L.n;
  const mul = 1 + 0.2 * (save.perks.coins ?? 0);
  let earned, stars = 0, starBonus = 0;
  if (bonus) {
    earned = Math.round(sim.coins * mul);
    $('endTitle').textContent = won ? 'COIN RUSH!' : 'RUSH OVER';
    $('endStats').innerHTML = `${sim.pickups.filter((c) => !c.alive).length} of ${sim.pickups.length} coins picked up<br>Level ${cur} is next`;
  } else {
    if (won) {
      stars = starsFor(sim.squad.count, sim.lostTotal);
      const prev = save.stars[n] ?? 0;
      if (stars > prev) { starBonus = (stars - prev) * 5 * n; save.stars[n] = stars; }
      // A perk for the first clear of a level, a coin rush after every third level
      if (n >= save.level) { const offer = offerPerks(save.perks); if (offer.length) save.pending = offer; }
      save.level = Math.max(save.level, n + 1);
      cur = n + 1;
      bonusNext = n % 3 === 0;
    }
    earned = Math.round((Math.floor(sim.coins) + (won ? 10 * n + Math.floor(sim.squad.count / 10) : 0) + starBonus) * mul);
    $('endTitle').textContent = won ? 'VICTORY!' : 'DEFEATED';
    $('endStats').innerHTML = won
      ? `Level ${n} cleared<br>${sim.squad.count} soldiers left · ${sim.lostTotal} lost<br>${sim.kills} enemies down with the ${sim.weaponInfo.name}${starBonus ? `<br>New stars: +${starBonus} coins` : ''}${stars < 3 ? '<br><small>Keep 80% of your soldiers for ★★★</small>' : ''}`
      : `Level ${n}<br>Best squad ${sim.peak} · ${sim.kills} enemies down<br>Upgrade your squad and try again!`;
  }
  const good = won || bonus;
  save.coins += earned;
  persist();
  mode = 'end';
  $('endTitle').classList.toggle('fail', !good);
  $('endStars').textContent = stars ? STAR(stars) : '';
  $('endStars').classList.toggle('hidden', !stars);
  $('endCoins').textContent = earned;
  $('btnNext').classList.toggle('hidden', !good);
  $('btnNext').textContent = bonusNext ? 'Coin rush!' : 'Next level';
  $('btnRetry').classList.toggle('hidden', good);
  show('end');
  if (save.pending) setTimeout(showPerks, 700);
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
  sim.squad.targetX = Math.max(-sim.half, Math.min(sim.half, drag.tx + ((e.clientX - drag.x) / span) * 2.5 * sim.half));
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'play') { mode = 'pause'; show('pause'); } else if (mode === 'pause') { mode = 'play'; show(null); }
  }
  const go = (e.code === 'Enter' || e.code === 'Space') && ['help', 'levels', 'perks'].every((id) => $(id).classList.contains('hidden'));
  if (go && mode === 'menu') play();
  else if (go && mode === 'end') ($('btnNext').classList.contains('hidden') ? $('btnRetry') : $('btnNext')).click();
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
    q.targetX = Math.max(-sim.half, Math.min(sim.half, q.targetX + d * 11 * dt));
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

let lastChip = '';
function hud() {
  $('hudCoins').textContent = save.coins + Math.floor(sim.coins);
  $('hudProg').style.width = `${Math.min(100, (sim.squad.z / sim.boss.z) * 100)}%`;
  const W = sim.weaponInfo;
  let chip = `${W.icon} ${W.name}${'★'.repeat(Math.min(3, sim.stars))}`;
  if (sim.rageT > 0) chip += `  ·  ⚡ ${Math.ceil(sim.rageT)}s`;
  if (sim.shieldT > 0) chip += `  ·  🛡️ ${Math.ceil(sim.shieldT)}s`;
  if (chip !== lastChip) $('hudWeapon').textContent = lastChip = chip;
  $('bossBar').classList.toggle('enraged', sim.boss.enraged);
  const B = sim.boss;
  const showBoss = B.active && B.alive;
  $('bossBar').classList.toggle('hidden', !showBoss);
  if (showBoss) $('bossFill').style.width = `${(B.hp / B.maxHp) * 100}%`;
}

// Debug / test hooks
window.__game = { get sim() { return sim; }, renderer, save, newRun, play, toMenu };

toMenu();
requestAnimationFrame(loop);
