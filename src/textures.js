// Canvas-drawn textures: gate signs, number labels, hazard stripes, boss health bar, gun icon.
import * as THREE from 'three';

const FONT = '"Lilita One", "Arial Black", Impact, sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function texOf(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function outlinedText(g, text, x, y, size, fill = '#fff', stroke = 'rgba(0,0,0,.45)') {
  g.font = `${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.16;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

export const GATE_STYLES = {
  blue: { top: '#4f9bff', bottom: '#1f5fd6', edge: '#0f3d99', text: '#fff' },
  yellow: { top: '#ffe04d', bottom: '#f5b400', edge: '#a87400', text: '#fff' },
  red: { top: '#ff6b5e', bottom: '#d42f26', edge: '#8a1510', text: '#fff' },
  purple: { top: '#b98cff', bottom: '#7a3ff0', edge: '#4a1fa0', text: '#fff' },
};

export function gateText(g) {
  if (g.op === 'x') return '×' + g.v;
  return (g.v >= 0 ? '+' : '−') + Math.abs(Math.round(g.v));
}

export function gateStyle(g) {
  if (g.op === 'x') return 'purple';
  if (g.v < 0) return 'red';
  return g.yellow ? 'yellow' : 'blue';
}

// Front face of a gate sign. Drawn into an existing canvas when given (gates you can shoot up).
export function drawGate(text, style, c = canvas(256, 112)) {
  const g = c.getContext('2d');
  const s = GATE_STYLES[style];
  g.clearRect(0, 0, c.width, c.height);
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, s.top);
  grad.addColorStop(1, s.bottom);
  g.fillStyle = s.edge;
  roundRect(g, 0, 0, c.width, c.height, 18);
  g.fill();
  g.fillStyle = grad;
  roundRect(g, 7, 7, c.width - 14, c.height - 14, 13);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)';
  roundRect(g, 12, 10, c.width - 24, c.height * 0.35, 10);
  g.fill();
  outlinedText(g, text, c.width / 2, c.height / 2 + 4, text.length > 3 ? 64 : 76, s.text);
  return c;
}

const gateCache = new Map();
export function gateTexture(text, style) {
  const key = text + style;
  if (!gateCache.has(key)) gateCache.set(key, texOf(drawGate(text, style)));
  return gateCache.get(key);
}

export function dynamicGateTexture(text, style) {
  const c = drawGate(text, style);
  const t = texOf(c);
  return { tex: t, canvas: c, redraw(text, style) { drawGate(text, style, c); t.needsUpdate = true; } };
}

// A number label (block HP, jar count): white digits with a dark outline, on a transparent background.
export function numberLabel(w = 256, h = 128) {
  const c = canvas(w, h);
  const t = texOf(c);
  let last = null;
  return {
    tex: t,
    set(text, color = '#fff') {
      if (text === last) return;
      last = text;
      const g = c.getContext('2d');
      g.clearRect(0, 0, w, h);
      outlinedText(g, text, w / 2, h / 2 + 4, h * 0.72, color, 'rgba(20,24,40,.85)');
      t.needsUpdate = true;
    },
  };
}

export function hazardTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#1d1f24';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffc928';
  for (let i = -128; i < 256; i += 48) {
    g.beginPath();
    g.moveTo(i, 0); g.lineTo(i + 24, 0); g.lineTo(i + 24 + 128, 128); g.lineTo(i + 128, 128);
    g.fill();
  }
  const t = texOf(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function concreteTexture(base = '#c9ccd2', speck = 0.07) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * speck})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = texOf(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function groundTexture(base, dots) {
  const c = canvas(512, 512);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = dots[i % dots.length];
    g.globalAlpha = 0.25 + Math.random() * 0.35;
    const r = 1 + Math.random() * 5;
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 512, r * 1.6, r, 0, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  const t = texOf(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Simple rifle silhouette above barrels and inside ice crates
export function gunIconTexture() {
  const c = canvas(256, 128);
  const g = c.getContext('2d');
  g.translate(18, 22);
  g.lineJoin = 'round';
  g.fillStyle = '#2f6bff';
  g.strokeStyle = '#0b1f55';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(0, 30); g.lineTo(60, 26); g.lineTo(70, 14); g.lineTo(150, 14); g.lineTo(150, 6); g.lineTo(170, 6);
  g.lineTo(170, 14); g.lineTo(215, 14); g.lineTo(215, 30); g.lineTo(130, 34); g.lineTo(122, 70);
  g.lineTo(100, 70); g.lineTo(104, 40); g.lineTo(80, 40); g.lineTo(70, 64); g.lineTo(10, 70); g.closePath();
  g.stroke();
  g.fill();
  g.fillStyle = '#8fb6ff';
  g.fillRect(84, 18, 56, 8);
  return texOf(c);
}

export function bossBar() {
  const c = canvas(256, 64);
  const t = texOf(c);
  let last = -1;
  return {
    tex: t,
    set(hp, max) {
      const v = Math.ceil(hp);
      if (v === last) return;
      last = v;
      const g = c.getContext('2d');
      g.clearRect(0, 0, 256, 64);
      g.fillStyle = 'rgba(15,18,30,.85)';
      roundRect(g, 4, 30, 248, 26, 10);
      g.fill();
      g.fillStyle = '#ff3b30';
      roundRect(g, 9, 35, Math.max(0, 238 * (hp / max)), 16, 7);
      g.fill();
      outlinedText(g, String(v), 128, 18, 30, '#fff', 'rgba(15,18,30,.9)');
      t.needsUpdate = true;
    },
  };
}

// Name of the gun inside a barrel or a crate, on a pill in the colour of its bullets
const tagCache = new Map();
export function tagTexture(text, color) {
  if (tagCache.has(text)) return tagCache.get(text);
  const c = canvas(512, 128);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15,18,30,.82)';
  roundRect(g, 4, 8, 504, 112, 56);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = color;
  roundRect(g, 8, 12, 496, 104, 52);
  g.stroke();
  outlinedText(g, text, 256, 68, 62, '#fff', 'rgba(0,0,0,.6)');
  const t = texOf(c);
  tagCache.set(text, t);
  return t;
}

const emojiCache = new Map();
export function emojiTexture(ch) {
  if (emojiCache.has(ch)) return emojiCache.get(ch);
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15,18,30,.8)';
  g.beginPath();
  g.arc(64, 64, 60, 0, 7);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#fff';
  g.stroke();
  g.font = '72px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 64, 70);
  const t = texOf(c);
  emojiCache.set(ch, t);
  return t;
}
