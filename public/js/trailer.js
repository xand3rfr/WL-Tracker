import * as THREE from '../vendor/three.module.min.js';
import { Game } from './game/sim.js';
import { CourtView } from './game/view.js';
import { Sfx } from './game/input.js';
import { presetBuilds } from './game/presets.js';
import { clone } from './build.js';

const CSS = `
.tr { position: fixed; inset: 0; z-index: 1000; background: #000; color: #fff; overflow: hidden; font-family: 'Barlow Condensed', 'Arial Narrow', Impact, sans-serif; cursor: default; }
.tr-stage { position: absolute; inset: 0; }
.tr-stage canvas { width: 100% !important; height: 100% !important; display: block; }
.tr-bars::before, .tr-bars::after { content: ''; position: absolute; left: 0; right: 0; height: 9vh; background: #000; z-index: 3; transition: height .8s; }
.tr-bars::before { top: 0; } .tr-bars::after { bottom: 0; }
.tr-grain { position: absolute; inset: -50%; z-index: 4; pointer-events: none; opacity: .07; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); animation: trGrain .6s steps(4) infinite; }
@keyframes trGrain { 25% { transform: translate(-3%, 2%); } 50% { transform: translate(2%, -3%); } 75% { transform: translate(-2%, -1%); } }
.tr-vig { position: absolute; inset: 0; z-index: 2; pointer-events: none; background: radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,.75)); }
.tr-fade { position: absolute; inset: 0; z-index: 6; background: #000; pointer-events: none; transition: opacity .7s; }
.tr-text { position: absolute; inset: 0; z-index: 5; display: grid; place-items: center; pointer-events: none; text-align: center; padding: 0 6vw; }
.tr-line { font-weight: 900; font-style: italic; text-transform: uppercase; line-height: .9; letter-spacing: .01em; text-shadow: 0 6px 40px rgba(0,0,0,.8); opacity: 0; transform: translateY(14px) skewX(-6deg); transition: opacity .5s, transform .7s cubic-bezier(.2,.8,.2,1); }
.tr-line.on { opacity: 1; transform: none; }
.tr-line small { display: block; font-size: 15px; letter-spacing: .5em; font-style: normal; color: #e11d2e; margin-bottom: .6em; }
.tr-sub { display: block; font-family: 'Barlow', system-ui, sans-serif; font-weight: 500; font-style: normal; font-size: clamp(16px, 1.7vw, 24px); letter-spacing: .08em; text-transform: none; color: #d6d6da; margin-top: .9em; }
.tr-big { font-size: clamp(54px, 10vw, 150px); }
.tr-mid { font-size: clamp(40px, 6.5vw, 96px); }
.tr-soon { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; padding-left: 9vw; pointer-events: none; }
.tr-card { max-width: 760px; opacity: 0; transform: translateX(-40px); transition: opacity .45s, transform .6s cubic-bezier(.2,.8,.2,1); }
.tr-card.on { opacity: 1; transform: none; }
.tr-card .k { font-weight: 800; letter-spacing: .5em; font-size: 15px; color: #e11d2e; text-transform: uppercase; }
.tr-card .t { font-weight: 900; font-style: italic; font-size: clamp(56px, 9vw, 132px); line-height: .85; text-transform: uppercase; margin: 8px 0 14px; }
.tr-card .d { font-family: 'Barlow', system-ui, sans-serif; font-size: clamp(15px, 1.6vw, 20px); color: #cfcfd4; max-width: 520px; line-height: 1.45; }
.tr-stamp { display: inline-block; margin-top: 22px; padding: 8px 16px; border: 2px solid #fff; font-weight: 900; letter-spacing: .32em; font-size: 16px; text-transform: uppercase; transform: rotate(-3deg); }
.tr-slash { position: absolute; z-index: 4; left: -10%; right: -10%; height: 16vh; top: 42vh; background: #e11d2e; transform: skewY(-8deg) scaleX(0); transform-origin: left; transition: transform .6s cubic-bezier(.7,0,.2,1); mix-blend-mode: screen; opacity: .85; }
.tr-slash.on { transform: skewY(-8deg) scaleX(1); }
.tr-logo { font-weight: 900; font-style: italic; font-size: clamp(80px, 16vw, 230px); line-height: .8; letter-spacing: -.02em; }
.tr-logo span { color: #e11d2e; }
.tr-press { position: absolute; left: 0; right: 0; bottom: 14vh; z-index: 7; text-align: center; font-weight: 800; letter-spacing: .4em; font-size: 15px; text-transform: uppercase; color: #fff; animation: trBlink 1.4s ease-in-out infinite; pointer-events: none; }
@keyframes trBlink { 50% { opacity: .25; } }
.tr-skip { position: absolute; right: 22px; bottom: calc(9vh + 16px); z-index: 8; display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,.5); color: #fff; border: 1px solid rgba(255,255,255,.35); padding: 9px 16px; font: inherit; font-weight: 800; letter-spacing: .2em; font-size: 13px; text-transform: uppercase; cursor: pointer; opacity: 0; transition: opacity .4s; }
.tr-skip.on { opacity: 1; }
.tr-skip:hover { border-color: #e11d2e; background: #e11d2e; }
.tr-title { position: absolute; inset: 0; z-index: 7; display: grid; place-items: center; text-align: center; background: radial-gradient(ellipse at center, rgba(70,6,14,.55), #000 70%); transition: opacity .6s; cursor: pointer; }
.tr-title .tr-logo { font-size: clamp(64px, 12vw, 170px); }
.tr-title .tag { font-weight: 800; letter-spacing: .5em; font-size: 14px; color: #e11d2e; margin-bottom: 18px; }
@media (prefers-reduced-motion: reduce) { .tr-grain { animation: none; } }
`;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));

// a tiny drum machine so the trailer has a pulse
class Beat {
  constructor(sfx) { this.sfx = sfx; this.on = false; }
  start(bpm = 88) {
    const c = this.sfx.ensure(); if (!c) return;
    this.on = true; this.ctx = c; this.out = c.createGain(); this.out.gain.value = 0.55; this.out.connect(this.sfx.master);
    this.spb = 60 / bpm; this.next = c.currentTime + 0.05; this.step = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stop() { this.on = false; clearInterval(this.timer); if (this.out) this.out.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8); }
  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.45);
  }
  noise(t, dur, f, vol, type = 'highpass') {
    const c = this.ctx, len = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; fl.type = type; fl.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.out); s.start(t);
  }
  bass(t, f) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 220;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + this.spb * 0.9);
    o.connect(lp); lp.connect(g); g.connect(this.out); o.start(t); o.stop(t + this.spb);
  }
  schedule() {
    if (!this.on) return;
    while (this.next < this.ctx.currentTime + 0.12) {
      const s = this.step % 16, t = this.next;
      if (s === 0 || s === 7 || s === 10) this.kick(t);
      if (s === 4 || s === 12) this.noise(t, 0.18, 1800, 0.5, 'bandpass');
      if (s % 2 === 0) this.noise(t, 0.04, 7000, s % 4 === 2 ? 0.2 : 0.1);
      if (s === 0 || s === 8) this.bass(t, [55, 55, 49, 41.2][(this.step >> 4) % 4]);
      this.next += this.spb / 4; this.step++;
    }
  }
}

// plays the intro; resolves when it ends or is skipped
export function playTrailer({ quality = 'medium', requireStart = true } = {}) {
  return new Promise(resolve => {
    if (!document.getElementById('tr-css')) { const st = document.createElement('style'); st.id = 'tr-css'; st.textContent = CSS; document.head.appendChild(st); }
    const root = document.createElement('div');
    root.className = 'tr tr-bars';
    root.innerHTML = `<div class="tr-stage"></div><div class="tr-vig"></div><div class="tr-grain"></div>
      <div class="tr-slash"></div><div class="tr-text"></div><div class="tr-soon"></div><div class="tr-fade"></div>
      <button class="tr-skip" type="button">Skip <span>▸▸</span></button>
      ${requireStart ? `<div class="tr-title"><div><div class="tag">Blacktop Legends</div><div class="tr-logo">My<span>PLAYER</span></div></div><div class="tr-press">Press any key</div></div>` : ''}`;
    document.body.appendChild(root);
    const $ = s => root.querySelector(s);
    const sfx = new Sfx();
    const beat = new Beat(sfx);

    // a star preset with springs in his legs, so the dunk lands
    const star = clone(presetBuilds()[1]);
    Object.assign(star.attrs, { vertical: 92, drivingDunk: 93, ballHandle: 95, speedWithBall: 90 });
    star.anims.dunks = ['windmill']; star.anims.dribble = 'lightning';
    const def = clone(presetBuilds()[2]);
    const roster = [
      { team: 0, build: star, human: 'star' }, { team: 0, build: clone(presetBuilds()[3]), human: 'm1' },
      { team: 1, build: def, human: 'd1' }, { team: 1, build: clone(presetBuilds()[4]), human: 'd2' },
    ];
    let game, view;
    try {
      game = new Game({ mode: 2, target: 999, roster, firstPoss: 0 });
      view = new CourtView($('.tr-stage'), game, { localId: 0, jerseys: ['Red', 'Black'], quality });
    } catch { finish(); return; }
    // the arrow and rings are gameplay HUD; hide them for the film
    view.chars.forEach(ch => { ch.ring.visible = false; if (ch.arrow) ch.arrow.visible = false; });
    game.phase = 'live';
    const [S, M, D1, D2] = game.players;
    const place = (p, x, z, f) => Object.assign(p, { x, z, vx: 0, vz: 0, facing: f, state: 'move', st: 0 });
    place(S, 0.4, 9.4, Math.PI); place(D1, 0.3, 7.8, 0); place(M, -6.4, 3, Math.PI); place(D2, -5.8, 2.2, 0);
    game.giveBall(S);
    view.setLamps(0);

    let t = 0, last = 0, running = false, done = false, raf = 0, scale = 1;
    const fired = new Set();
    const once = (key, at, fn) => { if (t >= at && !fired.has(key)) { fired.add(key); fn(); } };
    const text = html => { $('.tr-text').innerHTML = html ? `<div class="tr-line">${html}</div>` : ''; requestAnimationFrame(() => $('.tr-text .tr-line')?.classList.add('on')); };
    const card = (k, title, desc) => { $('.tr-soon').innerHTML = `<div class="tr-card"><div class="k">${k}</div><div class="t">${title}</div><div class="d">${desc}</div><div class="tr-stamp">Coming Soon</div></div>`; requestAnimationFrame(() => $('.tr-soon .tr-card')?.classList.add('on')); };
    const clunk = () => { sfx.tone(70, 0.35, 'sine', 0.5, -20); sfx.noise(0.12, 0.25, 600); sfx.sample('board', { vol: 0.25, rate: 0.6 }); };
    const whoosh = () => sfx.noise(0.5, 0.18, 1500, 0.6);
    const lamps = [0, 0, 0, 0];
    const dribbleBias = () => Math.sin(t * 2.4) * 0.35;

    function inputs() {
      const idle = { mx: 0, mz: 0, shoot: false, sprint: false };
      const s = { ...idle };
      if (t < 9.6) { s.mx = t > 5.5 ? dribbleBias() : 0; }
      for (const [at, kind] of [[6.6, 'cross'], [7.6, 'btb'], [8.6, 'spin']]) if (t >= at && !fired.has('mv' + at)) { fired.add('mv' + at); s.move = kind; }
      if (t >= 9.6 && t < 13) {
        const dx = 0 - S.x, dz = 1.9 - S.z, d = Math.hypot(dx, dz) || 1;
        s.mx = dx / d; s.mz = dz / d; s.sprint = true;
        if (Math.hypot(S.x, S.z - 1.575) < 2.7 && !fired.has('dunk')) { fired.add('dunk'); s.shootPressed = true; s.shoot = true; }
      }
      const d1 = { ...idle, guard: t < 9.4 };
      if (t > 5 && t < 9.4) { d1.mx = (S.x - D1.x) * 1.5; d1.mz = (S.z - 1.5 - D1.z) * 1.5; }
      return { star: s, d1, m1: idle, d2: idle };
    }

    function camera() {
      const b = view.ball.position;
      if (t < 5) { // low over the asphalt toward the hoop
        const k = ease(clamp01(t / 5));
        return { pos: V(lerp(-3, 1.2, k), lerp(0.35, 1.4, k), lerp(16, 11.5, k)), look: V(0, lerp(1.2, 2.6, k), 1.5), fov: 38 };
      }
      if (t < 9.8) { // slow orbit around the ball handler
        const a = 0.6 + (t - 5) * 0.16;
        return { pos: V(S.x + Math.sin(a) * 3.4, 1.45, S.z + Math.cos(a) * 3.4), look: V(S.x, 1.05, S.z - 0.3), fov: 40 };
      }
      if (t < 13.8 || S.state === 'finish') { // baseline angle at rim height as he takes off
        return { pos: V(3.1, 2.1, 3.2), look: V(lerp(S.x, 0, 0.5), lerp(1.6, 2.9, clamp01(S.y / 0.9)), lerp(S.z, 1.6, 0.5)), fov: 44 };
      }
      if (t < 15.5) { const a = (t - 13.8) * 0.3; return { pos: V(S.x + Math.sin(a) * 4.5, 1.7, S.z + 3.2 + Math.cos(a)), look: V(S.x, 1.3, S.z), fov: 40 }; }
      if (t < 18.5) { const k = (t - 15.5) / 3; return { pos: V(lerp(-14, -4, k), lerp(14, 9, k), lerp(30, 24, k)), look: V(0, 8, -40), fov: 44 }; }
      if (t < 21.5) { const k = (t - 18.5) / 3; return { pos: V(lerp(9, 6, k), 7.5, lerp(16, 12, k)), look: V(0, 0.5, 6), fov: 42 }; }
      if (t < 24.5) { const k = (t - 21.5) / 3; return { pos: V(lerp(-1.5, 1.5, k), 3.1, 3.4), look: V(0, 3.4, 1.2), fov: 48 }; }
      const k = clamp01((t - 24.5) / 6);
      return { pos: V(Math.sin(k * 0.8) * 9, lerp(4, 6.5, k), 7 + Math.cos(k * 0.8) * 13), look: V(0, 1.5, 5), fov: 42 };
    }

    function direct() {
      once('beat', 0.2, () => beat.start(88));
      once('t1', 0.8, () => text('<span class="tr-mid">Every legend</span>'));
      [2.0, 2.6, 3.2, 3.8].forEach((at, i) => once('lamp' + i, at, () => { lamps[i] = 1; view.setLamps(lamps); clunk(); }));
      once('t2', 2.6, () => text('<span class="tr-big">starts on<br>the blacktop</span>'));
      once('t3', 5.2, () => { text(''); sfx.startAmbience(0.22); });
      once('t4', 6.2, () => text('<small>Build your</small><span class="tr-big">MyPLAYER</span><span class="tr-sub">Your size. Your skills. Your game.</span>'));
      once('ankles', 9.25, () => { D1.stumble = 2.5; D1.fallen = true; D1.vx = D1.vz = 0; sfx.ooh(); text('<span class="tr-mid">Break ankles</span>'); });
      once('t5', 10.6, () => text(''));
      once('t6', 14.3, () => text('<span class="tr-big">Own the court</span>'));
      once('city', 15.5, () => { text(''); whoosh(); card('Open world', 'The City', 'Courts on every block, crews to run with and rep to earn. One city, all online.'); });
      once('proam', 18.5, () => { whoosh(); card('Full court', 'Pro-Am 5v5', 'Five on five with your squad. Real positions, real rotations, real stakes.'); });
      once('ranked', 21.5, () => { whoosh(); card('Competitive', 'Ranked Seasons', 'Climb the ladder each season. Earn your badge, keep your spot.'); });
      once('logo', 24.5, () => { $('.tr-soon').innerHTML = ''; $('.tr-slash').classList.add('on'); sfx.tone(55, 1.4, 'sine', 0.5, -15); text('<div class="tr-logo">My<span>PLAYER</span></div><span class="tr-sub">Create your legend.</span>'); });
      once('end', 29.5, () => finish());
      // slow motion through the dunk
      const f = S.finish;
      scale = S.state === 'finish' && f && S.st > f.dur * 0.25 && S.st < f.dur * 0.85 ? 0.32 : 1;
      if (game.ball.state === 'air' && game.ball.flight?.kind === 'shot') game.ball.flight.make = true;
      // hold the celebration instead of resetting for the next possession
      if (game.phase === 'score') game.phaseT = Math.min(game.phaseT, 0.2);
    }

    function frame(now) {
      if (done) return;
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000 || 0)); last = now;
      if (running) {
        t += dt;
        window.__trT = t;
        direct();
        const steps = Math.max(1, Math.round(dt * 60));
        for (let i = 0; i < steps; i++) game.step((dt / steps) * scale, inputs());
        for (const e of game.events.splice(0)) {
          (window.__trEv ||= []).push(e.type + '@' + t.toFixed(1));
          if (e.type === 'make') { sfx.dunk(); sfx.cheer(); view.netKick = 1; }
          if (e.type === 'dmove') sfx.squeak();
          if (e.type === 'finishStart') sfx.squeak();
        }
        // keep the extras out of the way
        for (const p of [M, D2]) { p.x = p.team ? 6.5 : -6.8; p.z = 3; p.vx = p.vz = 0; }
      }
      view.camOverride = camera();
      view.update(dt * (running ? scale : 0.3), now / 1000);
      raf = requestAnimationFrame(frame);
    }

    function begin() {
      if (running || done) return;
      sfx.ensure();
      running = true;
      const title = $('.tr-title');
      if (title) { title.style.opacity = 0; setTimeout(() => title.remove(), 650); }
      setTimeout(() => $('.tr-skip')?.classList.add('on'), 900);
    }

    function finish() {
      if (done) return;
      done = true;
      $('.tr-fade').style.opacity = 1;
      beat.stop(); sfx.stopAmbience();
      setTimeout(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey, true);
        try { view?.dispose(); } catch { /* already gone */ }
        root.remove();
        resolve();
      }, 750);
    }

    function onKey(e) {
      e.preventDefault(); e.stopPropagation();
      if (!running) begin();
      else if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish();
    }
    window.addEventListener('keydown', onKey, true);
    root.addEventListener('pointerdown', e => { if (e.target.closest('.tr-skip')) { finish(); return; } if (!running) begin(); });
    requestAnimationFrame(() => { $('.tr-fade').style.opacity = 0; });
    if (!requireStart) begin();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  });
}
