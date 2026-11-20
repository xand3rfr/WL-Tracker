const KEYMAP = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'], shoot: ['KeyE', 'KeyJ'], pass: ['KeyF', 'KeyK'], guard: ['KeyG'], pause: ['Escape', 'KeyP'],
};
const MOVE_KEYS = { KeyZ: 'cross', KeyX: 'btb', KeyC: 'spin', KeyV: 'step' };
const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(touchRoot) {
    this.keys = new Set();
    this.latch = { shootDown: false, shootUp: false, pass: false, pause: false, move: null };
    this.touch = { x: 0, y: 0, shoot: false, sprint: false, guard: false };
    this.enabled = true;
    this._down = e => {
      if (!this.enabled || e.repeat && !BLOCK_DEFAULT.has(e.code)) return;
      if (BLOCK_DEFAULT.has(e.code) && !e.target.closest?.('input,select,textarea')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (KEYMAP.shoot.includes(e.code)) this.latch.shootDown = true;
      if (KEYMAP.pass.includes(e.code)) this.latch.pass = true;
      if (KEYMAP.pause.includes(e.code)) this.latch.pause = true;
      if (MOVE_KEYS[e.code]) this.latch.move = MOVE_KEYS[e.code];
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
    btn('[data-btn=guard]', () => { this.touch.guard = true; }, () => { this.touch.guard = false; });
    for (const kind of Object.values(MOVE_KEYS)) btn(`[data-move=${kind}]`, () => { this.latch.move = kind; });
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
      move: this.latch.move, guard: this.has('guard') || this.touch.guard,
    };
    this.latch = { shootDown: false, shootUp: false, pass: false, pause: false, move: null };
    return out;
  }

  dispose() {
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('blur', this._blur);
  }
}

// recorded CC0 samples (public/assets/sfx) with synthesized fallbacks until they load
const SAMPLE_FILES = {
  bounce: ['bounce1', 'bounce2', 'bounce3'], rim: ['rim1', 'rim2'], board: ['board'], dunk: ['dunk'],
  swish: ['swish1', 'swish2'], squeak: ['squeak'], cheer: ['cheer'], ooh: ['ooh'], crowd: ['crowd_loop'],
};
const raw = {};
let prefetched = null;
function prefetch() {
  if (prefetched) return prefetched;
  prefetched = Promise.all(Object.entries(SAMPLE_FILES).flatMap(([k, files]) => files.map(f =>
    fetch(`/assets/sfx/${f}.mp3`).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => { if (b) (raw[k] ||= []).push(b); }).catch(() => {}))));
  return prefetched;
}

export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.buf = {}; this.ambience = null; this.volume = 0.6; prefetch(); }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
    // light compression glues the crowd and impacts together
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    prefetch().then(() => Promise.all(Object.entries(raw).map(([k, list]) => Promise.all(list.map(b =>
      this.ctx.decodeAudioData(b.slice(0)).then(d => { (this.buf[k] ||= []).push(d); }).catch(() => {}))))));
    return this.ctx;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }
  sample(name, { vol = 1, rate = 1, jitter = 0.06, loop = false } = {}) {
    const c = this.ensure();
    const list = this.buf[name];
    if (!c || this.muted || !list?.length) return null;
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = list[Math.floor(Math.random() * list.length)];
    s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    s.loop = loop; g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
    return { s, g };
  }
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
  // a pea whistle: bright tone with a fast warble
  whistle() {
    const c = this.ensure(); if (!c || this.muted) return;
    const t = c.currentTime, o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = 2750; lfo.frequency.value = 34; lg.gain.value = 140;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.13, t + 0.02); g.gain.setValueAtTime(0.13, t + 0.32); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45);
  }
  dribble(v = 1) { if (!this.sample('bounce', { vol: 0.55 * v, jitter: 0.08 })) { this.tone(95, 0.09, 'sine', 0.35 * v, -40); this.noise(0.04, 0.08, 500); } }
  swish() { if (!this.sample('swish', { vol: 0.7, rate: 0.9 })) this.noise(0.28, 0.35, 5200, 0.7); }
  rim() { if (!this.sample('rim', { vol: 0.5 })) { this.tone(520, 0.25, 'square', 0.08, -120); this.tone(780, 0.18, 'triangle', 0.08); } }
  backboard() { if (!this.sample('board', { vol: 0.45 })) this.rim(); }
  dunk() { if (!this.sample('dunk', { vol: 0.55, rate: 0.9 })) this.rim(); }
  block() { if (!this.sample('board', { vol: 0.5, rate: 0.8 })) { this.tone(140, 0.15, 'square', 0.15, -60); this.noise(0.1, 0.2, 900); } }
  green() { this.tone(1046, 0.08, 'sine', 0.12); setTimeout(() => this.tone(1568, 0.16, 'sine', 0.1), 60); }
  cheer() { if (!this.sample('cheer', { vol: 0.55, jitter: 0.03 })) this.noise(1.1, 0.12, 1200, 0.4); }
  steal() { this.noise(0.12, 0.25, 2200, 1.5); this.squeak(); }
  squeak() { if (!this.sample('squeak', { vol: 0.35, jitter: 0.15 })) this.tone(1900 + Math.random() * 500, 0.07, 'triangle', 0.06, 400); }
  ooh() { if (!this.sample('ooh', { vol: 0.6, jitter: 0.04 })) { this.noise(1.4, 0.16, 700, 0.5); this.tone(220, 0.6, 'sine', 0.05, -60); } }
  ui() { this.tone(660, 0.05, 'sine', 0.06); }
  startAmbience(vol = 0.18) {
    if (this.ambience || this.muted) return;
    const a = this.sample('crowd', { vol: 0, loop: true, jitter: 0 });
    if (!a) { setTimeout(() => this.startAmbience(vol), 500); return; }
    a.g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 1.5);
    this.ambience = a;
  }
  stopAmbience() {
    if (!this.ambience) return;
    const { s, g } = this.ambience; this.ambience = null;
    try { g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6); s.stop(this.ctx.currentTime + 0.7); } catch { /* already stopped */ }
  }
}
