// Tiny Web Audio synth: no sound files.
export class Audio {
  constructor() {
    this.on = true;
    this.ctx = null;
    this.lastShot = 0;
    this.gateN = 0;
    this.gateT = 0;
  }

  unlock() {
    if (!this.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, dur, type = 'square', vol = 0.15, slide = 0, delay = 0) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hiss(dur, vol = 0.2, freq = 1500, q = 1, delay = 0) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur + 0.02);
  }

  handle(events) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    let kills = 0;
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (now - this.lastShot > 0.07) { this.lastShot = now; this.hiss(0.05, 0.05, 2400 + Math.random() * 800, 2); }
          break;
        case 'gate': {
          // Rising arpeggio when walking through a row of +1 gates
          if (now - this.gateT > 0.6) this.gateN = 0;
          this.gateT = now;
          const good = e.delta >= 0;
          const f = good ? 520 * 2 ** (Math.min(this.gateN++, 24) / 12) : 220;
          this.tone(f, 0.12, 'triangle', 0.18, good ? 0 : -80);
          if (e.gate.yellow || Math.abs(e.delta) > 5) this.tone(f * 1.5, 0.15, 'triangle', 0.12, 0, 0.06);
          break;
        }
        case 'gateUp':
          this.tone(880, 0.05, 'triangle', 0.08);
          break;
        case 'kill':
          if (kills++ < 2) this.hiss(0.06, 0.08, 700, 3);
          break;
        case 'lost':
          this.tone(160, 0.08, 'sawtooth', 0.05, -60);
          break;
        case 'break':
          this.hiss(0.35, 0.3, 500, 0.8);
          if (e.block.reward.type === 'weapon') { this.tone(660, 0.1, 'square', 0.1); this.tone(990, 0.18, 'square', 0.1, 0, 0.09); }
          else this.tone(520, 0.2, 'triangle', 0.15, 300);
          break;
        case 'windup':
          this.tone(110, 0.7, 'sawtooth', 0.06, 120);
          break;
        case 'smash':
          this.tone(70, 0.5, 'sine', 0.6, -40);
          this.hiss(0.5, 0.45, 220, 0.6);
          break;
        case 'bossWake':
          this.tone(98, 0.6, 'sawtooth', 0.1, -30);
          break;
        case 'bossDead':
          this.tone(60, 0.9, 'sine', 0.6, -30);
          this.hiss(0.8, 0.4, 300, 0.5);
          break;
        case 'victory':
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'square', 0.09, 0, 0.2 + i * 0.12));
          break;
        case 'defeat':
          [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'square', 0.08, 0, i * 0.18));
          break;
      }
    }
  }

  click() { this.tone(700, 0.05, 'triangle', 0.1); }
}
