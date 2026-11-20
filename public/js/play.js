import * as B from './build.js';
import * as D from './data.js';
import { Game, buildAtOvr, DIFFICULTY } from './game/sim.js';
import { CourtView } from './game/view.js';
import { Input, Sfx } from './game/input.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const STEP = 1 / 60;
const fullName = b => `${b.identity.first} ${b.identity.last}`.trim() || 'Unnamed';

const settings = Object.assign({ mode: 3, target: 21, scoring: '23', difficulty: 'pro', buildId: 'current' }, store.get('bl_play_v1', {}));
let builds = [];
let squads = null;
let game = null, view = null, input = null, running = false, paused = false;
const sfx = new Sfx();
sfx.setMuted(!!store.get('bl_muted', false));

// ---------- menu ----------
function loadBuilds() {
  const list = [];
  const cur = store.get('bl_current_v1', null);
  list.push({ id: 'current', label: 'Current build', build: cur ? B.sanitizeBuild(cur) : B.defaultBuild() });
  for (const s of store.get('bl_builds_v1', []) || []) {
    if (!s || typeof s !== 'object') continue;
    const b = B.sanitizeBuild(s);
    list.push({ id: s.id || B.uid(), label: `${fullName(b)} · ${b.position}`, build: b });
  }
  builds = list;
  if (!builds.some(x => x.id === settings.buildId)) settings.buildId = 'current';
}
const myBuild = () => builds.find(x => x.id === settings.buildId).build;

function makeSquads() {
  const me = myBuild(), ovr = B.overall(me), diff = DIFFICULTY[settings.difficulty];
  squads = {
    mates: Array.from({ length: settings.mode - 1 }, () => buildAtOvr(clamp(ovr - 3, 55, 92))),
    opps: Array.from({ length: settings.mode }, () => buildAtOvr(clamp(ovr + diff.ovr, 50, 97))),
  };
}

function rosterRow(b, you) {
  return `<div class="rp${you ? ' you' : ''}"><b>${B.overall(b)}</b><div><div class="n">${esc(fullName(b))}${you ? ' (You)' : ''}</div>
    <div class="m">${esc(b.position)} · ${D.fmtHeight(b.body.height)} · ${esc(B.archetype(b).name)}</div></div></div>`;
}
function avgOvr(list) { return Math.round(list.reduce((s, b) => s + B.overall(b), 0) / list.length); }

function renderMenu() {
  const sel = $('#pickBuild');
  sel.innerHTML = builds.map(x => `<option value="${esc(x.id)}"${x.id === settings.buildId ? ' selected' : ''}>${esc(x.label)}</option>`).join('');
  const me = myBuild(), d = B.derive(B.clone(me));
  $('#meCard').innerHTML = `<div class="build-ovr"><b>${d.ovr}</b><span>OVR</span></div>
    <div><div class="build-name">${esc(fullName(me))}</div><div class="build-meta">${esc(me.position)} · ${D.fmtHeight(me.body.height)} · ${me.body.weight} lbs</div>
    <div class="build-meta" style="color:var(--text)">${esc(d.arch.name)} · ${Object.keys(me.badges).length} badges</div></div>`;
  for (const g of $$('[data-set]')) for (const o of $$('.opt', g)) o.classList.toggle('on', o.dataset.v === String(settings[g.dataset.set]));
  const mine = [me, ...squads.mates];
  $('#teams').innerHTML = `
    <div class="team-card" style="--c:var(--neon)"><div class="team-head"><span class="team-name">Your Squad</span><span class="team-ovr">${avgOvr(mine)} AVG</span></div>
      <div class="roster">${mine.map((b, i) => rosterRow(b, i === 0)).join('')}</div></div>
    <div class="team-card" style="--c:#ff4d5e"><div class="team-head"><span class="team-name">Opponents</span><span class="team-ovr">${avgOvr(squads.opps)} AVG</span></div>
      <div class="roster">${squads.opps.map(b => rosterRow(b, false)).join('')}</div></div>`;
  store.set('bl_play_v1', settings);
}

function initMenu() {
  loadBuilds();
  makeSquads();
  renderMenu();
  $('#pickBuild').addEventListener('change', e => { settings.buildId = e.target.value; makeSquads(); renderMenu(); });
  $('.menu-body').addEventListener('click', e => {
    const o = e.target.closest('[data-set] .opt');
    if (!o) return;
    const key = o.parentElement.dataset.set;
    settings[key] = key === 'mode' || key === 'target' ? +o.dataset.v : o.dataset.v;
    if (key === 'mode' || key === 'difficulty') makeSquads();
    renderMenu();
  });
  $('#rerollBtn').addEventListener('click', () => { makeSquads(); renderMenu(); });
  $('#startBtn').addEventListener('click', () => { sfx.ensure(); startGame(); });
}

// ---------- game ----------
function startGame() {
  stopGame();
  $('#menu').hidden = true; $('#game').hidden = false;
  $('#over').hidden = true; $('#pause').hidden = true;
  game = new Game({
    userBuild: B.clone(myBuild()), mode: settings.mode, target: settings.target, scoring: settings.scoring, difficulty: settings.difficulty,
    teammates: squads.mates.map(B.clone), opponents: squads.opps.map(B.clone),
  });
  try {
    view = new CourtView($('#court'), game);
  } catch (err) {
    console.error(err);
    toast('This game needs WebGL, which is not available in this browser.');
    return showMenu();
  }
  let lastDrib = 0;
  view.onDribble = () => { const t = performance.now(); if (t - lastDrib > 180) { lastDrib = t; sfx.dribble(); } };
  if (!input) input = new Input($('#touch'));
  input.enabled = true;
  $('#hudName').textContent = fullName(game.user.build);
  $('#sTo').textContent = `To ${settings.target}`;
  $('#sMe').textContent = '0'; $('#sThem').textContent = '0';
  window.__game = game;
  running = true; paused = false;
  last = performance.now(); acc = 0; pending = null;
  banner(game.poss === 0 ? 'Your Ball' : 'Their Ball', 'Check');
  requestAnimationFrame(frame);
}
function stopGame() {
  running = false;
  if (view) { view.dispose(); view = null; }
  game = null;
}
function showMenu() {
  stopGame();
  $('#game').hidden = true; $('#menu').hidden = false;
  loadBuilds(); renderMenu();
}

let last = 0, acc = 0, pending = null, gradeUntil = 0, meterUntil = 0;
function frame(now) {
  if (!running) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const inp = input.read();
  if (inp.pausePressed && game.phase !== 'over') setPaused(!paused);
  if (!paused) {
    // edge-triggered buttons survive frames where no sim step runs
    pending = pending ? { ...inp, shootPressed: pending.shootPressed || inp.shootPressed, passPressed: pending.passPressed || inp.passPressed, shootReleased: pending.shootReleased || inp.shootReleased } : inp;
    acc += dt;
    while (acc >= STEP) {
      game.step(STEP, pending);
      pending = { ...pending, shootPressed: false, passPressed: false, shootReleased: false };
      acc -= STEP;
    }
    handleEvents();
  }
  view.update(paused ? 0 : dt, now / 1000);
  hud(now);
  requestAnimationFrame(frame);
}

function setPaused(p) {
  paused = p;
  $('#pause').hidden = !p;
}

// ---------- events → feedback ----------
let bannerTimer = 0;
function banner(text, sub = '', bad = false) {
  const el = $('#banner');
  el.innerHTML = `${sub ? `<small>${esc(sub)}</small>` : ''}${esc(text)}`;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1300);
}
function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
const pname = id => game.players[id].name.split(' ').slice(-1)[0];

function handleEvents() {
  const g = game;
  for (const e of g.events) {
    const mine = t => t === 0;
    switch (e.type) {
      case 'make': {
        sfx.swish(); view.netKick = 1;
        const kind = e.kind === 'dunk' ? 'Slam!' : e.kind === 'three' ? 'Splash!' : e.kind === 'layup' ? 'And Finish' : 'Bucket';
        banner(`${kind} +${e.pts}`, pname(e.id) + (e.assist != null ? ` · ast ${pname(e.assist)}` : ''), !mine(e.team));
        if (mine(e.team)) { bump('#sMe'); sfx.cheer(); } else bump('#sThem');
        break;
      }
      case 'release':
        if (e.user && e.grade) {
          showGrade(e.grade);
          if (e.grade === 'Excellent') sfx.green();
        }
        break;
      case 'block': sfx.block(); banner(game.players[e.id].team === 0 ? 'Rejected!' : 'Blocked', pname(e.id), game.players[e.id].team !== 0); break;
      case 'steal': sfx.steal(); banner(game.players[e.id].team === 0 ? 'Steal!' : 'Stolen', pname(e.id), game.players[e.id].team !== 0); break;
      case 'turnover': sfx.whistle(); banner(e.reason, 'Turnover', mine(e.team)); break;
      case 'noClear': sfx.whistle(); banner("Didn't Clear", 'No basket', mine(e.team)); break;
      case 'airball': banner('Airball', pname(e.id), game.players[e.id].team === 0); break;
      case 'rim': sfx.rim(); break;
      case 'bounce': if (e.v > 2) sfx.dribble(); break;
      case 'check': setTimeout(() => game && banner(e.team === 0 ? 'Your Ball' : 'Their Ball', 'Check'), 50); break;
      case 'gameover': setTimeout(showOver, 900); break;
    }
  }
  g.events.length = 0;
}

function showGrade(grade) {
  const el = $('#grade');
  el.textContent = grade;
  el.className = 'grade show ' + (grade === 'Excellent' ? 'g-Excellent' : grade === 'Good' ? 'g-Good' : grade.startsWith('Slightly') ? 'g-bad' : 'g-worse');
  gradeUntil = performance.now() + 1100;
  meterUntil = performance.now() + 700;
  const m = $('#meter');
  m.classList.toggle('hit', grade === 'Excellent');
  m.classList.toggle('miss', grade !== 'Excellent' && grade !== 'Good');
}

// ---------- HUD ----------
function hud(now) {
  const g = game;
  $('#sMe').textContent = g.score[0];
  $('#sThem').textContent = g.score[1];
  const clock = $('#sClock');
  clock.textContent = Math.max(0, Math.ceil(g.shotClock));
  clock.classList.toggle('low', g.shotClock < 5);
  $('#sPoss').classList.toggle('them', g.poss === 1);
  $('#clearTag').classList.toggle('show', g.phase === 'live' && g.needsClear && g.poss === 0);
  const u = g.user;
  const e = $('#energy'); e.style.width = u.energy * 100 + '%'; e.classList.toggle('low', u.energy < 0.25);

  const m = $('#meter');
  const showMeter = (u.state === 'jumper' && u.shot) || now < meterUntil;
  if (showMeter) {
    const s = u.shot;
    const pos = view.toScreen(u.x, u.h + u.y + 0.35, u.z);
    m.style.left = pos.x + 36 + 'px'; m.style.top = pos.y + 60 + 'px';
    m.classList.add('show');
    if (s) {
      const scale = s.Tm * 1.1;
      const fillT = s.released ? s.relT : u.st;
      $('#meterFill').style.height = clamp(fillT / scale, 0, 1) * 100 + '%';
      const w = s.released ? s.window : g.shotWindow(u);
      const gb = $('#meterGreen');
      gb.style.bottom = clamp((s.ideal - w / 2) / scale, 0, 1) * 100 + '%';
      gb.style.height = Math.max(3, (w / scale) * 100) + '%';
      if (!s.released) m.classList.remove('hit', 'miss');
    }
    const gr = $('#grade');
    gr.style.left = pos.x + 'px'; gr.style.top = pos.y - 10 + 'px';
  } else m.classList.remove('show');
  if (now > gradeUntil) $('#grade').classList.remove('show');

  // context-sensitive touch labels
  const b = g.ball;
  const hasBall = b.state === 'held' && b.holder === u;
  const offense = g.poss === 0;
  $('#tShoot').textContent = hasBall ? 'Shoot' : offense ? 'Jump' : 'Block';
  $('#tPass').textContent = hasBall ? 'Pass' : offense ? 'Call' : 'Steal';
}

// ---------- end of game ----------
function letterGrade(p, target) {
  const s = p.stats;
  const v = s.pts + 1.1 * s.reb + 1.5 * s.ast + 2 * s.stl + 2 * s.blk - 1.5 * s.to - 0.6 * (s.fga - s.fgm);
  const k = v / (target * 0.5);
  return k >= 1.4 ? 'A+' : k >= 1.15 ? 'A' : k >= 0.95 ? 'A-' : k >= 0.8 ? 'B+' : k >= 0.65 ? 'B' : k >= 0.5 ? 'B-' : k >= 0.4 ? 'C+' : k >= 0.3 ? 'C' : k >= 0.2 ? 'C-' : 'D';
}
function showOver() {
  if (!game) return;
  const g = game, won = g.winner === 0;
  sfx[won ? 'cheer' : 'whistle']();
  $('#ovKicker').textContent = `${g.mode}v${g.mode} · ${DIFFICULTY[settings.difficulty].label}`;
  const t = $('#ovTitle'); t.textContent = won ? 'You Win' : 'You Lose'; t.className = 'ov-title ' + (won ? 'win' : 'loss');
  $('#ovScore').innerHTML = `<span style="color:var(--neon)">${g.score[0]}</span> – <span style="color:#ff4d5e">${g.score[1]}</span>`;
  const row = (p, sep) => {
    const s = p.stats;
    return `<tr class="${p.isUser ? 'you' : ''}${sep ? ' sep' : ''}"><td>${esc(p.name)}</td><td>${s.pts}</td><td>${s.reb}</td><td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.fgm}-${s.fga}</td><td>${s.tpm}-${s.tpa}</td><td>${s.to}</td></tr>`;
  };
  const mine = g.team(0), theirs = g.team(1);
  $('#ovBox').innerHTML = `<table><thead><tr><th>Player</th><th>Pts</th><th>Reb</th><th>Ast</th><th>Stl</th><th>Blk</th><th>FG</th><th>3P</th><th>TO</th></tr></thead>
    <tbody>${mine.map((p, i) => row(p, i === mine.length - 1)).join('')}${theirs.map(p => row(p, false)).join('')}</tbody></table>
    <div class="grade-big">Your Grade <b>${letterGrade(g.user, g.target)}</b></div>`;
  $('#over').hidden = false;
  input.enabled = true;
}

// ---------- misc ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function boot() {
  initMenu();
  $('#pauseBtn').addEventListener('click', () => setPaused(!paused));
  $('#muteBtn').setAttribute('aria-pressed', String(sfx.muted));
  $('#muteBtn').addEventListener('click', e => {
    sfx.setMuted(!sfx.muted); store.set('bl_muted', sfx.muted);
    e.currentTarget.setAttribute('aria-pressed', String(sfx.muted));
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-ov]');
    if (!a) return;
    switch (a.dataset.ov) {
      case 'resume': setPaused(false); break;
      case 'restart': case 'again': startGame(); break;
      case 'menu': showMenu(); break;
    }
  });
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touchmode');
  window.addEventListener('touchstart', () => document.body.classList.add('touchmode'), { once: true, passive: true });
  window.addEventListener('keydown', e => { if (!e.key.startsWith('Arrow') && e.key.length !== 1) return; if (!coarse) document.body.classList.remove('touchmode'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running && game?.phase !== 'over') setPaused(true); });
}

boot();
