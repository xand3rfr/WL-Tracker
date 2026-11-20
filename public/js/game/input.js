const KEYMAP = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], shoot: ['Space', 'KeyJ'], pass: ['KeyE', 'KeyK'], pause: ['Escape', 'KeyP'],
};
const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(touchRoot) {
    this.keys = new Set();
    this.latch = { shootDown: false, shootUp: false, pass: false, pause: false };
    this.touch = { x: 0, y: 0, shoot: false, sprint: false };
    this.enabled = true;
    this._down = e => {
      if (!this.enabled || e.repeat && !BLOCK_DEFAULT.has(e.code)) return;
      if (BLOCK_DEFAULT.has(e.code) && !e.target.closest?.('input,select,textarea')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (KEYMAP.shoot.includes(e.code)) this.latch.shootDown = true;
      if (KEYMAP.pass.includes(e.code)) this.latch.pass = true;
      if (KEYMAP.pause.includes(e.code)) this.latch.pause = true;
    };
    this._up = e => {
      this.keys.delete(e.code);
      if (KEYMAP.shoot.includes(e.code)) this.latch.shootUp = true;
    };
    this._blur = () => { this.keys.clear(); this.touch.shoot = false; this.touch.x = this.touch.y = 0; };
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('blur', this._blur);
    if (touchRoot) this.bindTouch(touchRoot);
  }

  bindTouch(root) {
    const stick = root.querySelector('[data-stick]'), knob = root.querySelector('[data-knob]');
    let sid = null, cx = 0, cy = 0;
    const R = 52;
    const moveStick = e => {
      const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      this.touch.x = (dx * k) / R; this.touch.y = (dy * k) / R;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      this.touch.sprint = d > R * 1.15;
    };
    stick.addEventListener('pointerdown', e => {
      e.preventDefault(); sid = e.pointerId; stick.setPointerCapture(sid);
      const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      moveStick(e);
    });
    stick.addEventListener('pointermove', e => { if (e.pointerId === sid) moveStick(e); });
    const end = e => { if (e.pointerId !== sid) return; sid = null; this.touch.x = this.touch.y = 0; this.touch.sprint = false; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);

    const btn = (sel, down, up) => {
      const el = root.querySelector(sel);
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('down'); down(); });
      const u = () => { el.classList.remove('down'); up?.(); };
      el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u);
    };
    btn('[data-btn=shoot]', () => { this.touch.shoot = true; this.latch.shootDown = true; }, () => { this.touch.shoot = false; this.latch.shootUp = true; });
    btn('[data-btn=pass]', () => { this.latch.pass = true; });
    btn('[data-btn=sprint]', () => { this.touch.sprintBtn = true; }, () => { this.touch.sprintBtn = false; });
  }

  has(name) { return KEYMAP[name].some(k => this.keys.has(k)); }

  read() {
    let mx = (this.has('right') ? 1 : 0) - (this.has('left') ? 1 : 0);
    let mz = (this.has('down') ? 1 : 0) - (this.has('up') ? 1 : 0);
    if (this.touch.x || this.touch.y) { mx = this.touch.x; mz = this.touch.y; }
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const shoot = this.has('shoot') || this.touch.shoot;
    const out = {
      mx, mz, shoot,
      sprint: this.has('sprint') || this.touch.sprint || !!this.touch.sprintBtn,
      shootPressed: this.latch.shootDown, shootReleased: this.latch.shootUp && !shoot,
      passPressed: this.latch.pass, pausePressed: this.latch.pause,
    };
    this.latch = { shootDown: false, shootUp: false, pass: false, pause: false };
    return out;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }
}

// tiny synthesized sound effects, no audio files needed
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
    return this.ctx;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; }
  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0) {
    const c = this.ensure(); if (!c || this.muted) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.2, freq = 3000, q = 1) {
    const c = this.ensure(); if (!c || this.muted) return;
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
  }
  dribble() { this.tone(95, 0.09, 'sine', 0.35, -40); this.noise(0.04, 0.08, 500); }
  swish() { this.noise(0.28, 0.35, 5200, 0.7); }
  rim() { this.tone(520, 0.25, 'square', 0.08, -120); this.tone(780, 0.18, 'triangle', 0.08); }
  block() { this.tone(140, 0.15, 'square', 0.15, -60); this.noise(0.1, 0.2, 900); }
  green() { this.tone(880, 0.09, 'sine', 0.18); setTimeout(() => this.tone(1320, 0.14, 'sine', 0.16), 70); }
  whistle() { this.tone(2100, 0.35, 'sine', 0.12, 80); }
  cheer() { this.noise(1.1, 0.12, 1200, 0.4); }
  steal() { this.noise(0.12, 0.25, 2200, 1.5); }
}
