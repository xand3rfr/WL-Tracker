import * as B from './build.js';
import * as D from './data.js';
import { Game, buildAtOvr, DIFFICULTY } from './game/sim.js';
import { CourtView } from './game/view.js';
import { Input, Sfx } from './game/input.js';
import { presetBuilds } from './game/presets.js';
import { Net, createRoom } from './game/net.js';
import { PlayerStage } from './player3d.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const STEP = 1 / 60;
const SNAP_EVERY = 0.05;
const fullName = b => `${b.identity.first} ${b.identity.last}`.trim() || 'Unnamed';
const ARROW_L = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
const ARROW_R = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';

const prefs = Object.assign({ sound: true, camera: 'broadcast', names: true }, store.get('bl_prefs', {}));
const setup = Object.assign({ mode: 3, target: 21, scoring: '23', difficulty: 'pro', pick: { kind: 'mine', id: 'current' } }, store.get('bl_play_v2', {}));
const savePrefs = () => store.set('bl_prefs', prefs);
const saveSetup = () => store.set('bl_play_v2', setup);

const sfx = new Sfx();
sfx.setMuted(!prefs.sound);
let input = null;
let menuStage = null;
let squads = null;

// ================= player choice =================
function myBuilds() {
  const list = [];
  const cur = store.get('bl_current_v1', null);
  list.push({ id: 'current', label: 'Current Build', build: cur ? B.sanitizeBuild(cur) : B.defaultBuild() });
  for (const s of store.get('bl_builds_v1', []) || []) {
    if (!s || typeof s !== 'object') continue;
    list.push({ id: s.id || B.uid(), label: 'Saved', build: B.sanitizeBuild(s) });
  }
  return list;
}
function presets() { return presetBuilds().map(b => ({ id: b.id, label: 'Preset', build: B.clone(b) })); }
function pickedBuild() {
  const pool = setup.pick.kind === 'preset' ? presets() : myBuilds();
  const hit = pool.find(x => x.id === setup.pick.id);
  if (hit) return hit.build;
  setup.pick = { kind: 'mine', id: 'current' };
  return myBuilds()[0].build;
}

function renderProfile() {
  const b = pickedBuild();
  $('#pfOvr').textContent = B.overall(b);
  $('#pfName').textContent = fullName(b);
  $('#pfMeta').textContent = `${b.position} · ${D.fmtHeight(b.body.height)} · ${B.archetype(b).name}`;
  menuStage?.setBuild(b);
}

function openPicker(onPick) {
  const dlg = $('#picker');
  let tab = setup.pick.kind === 'preset' ? 'preset' : 'mine';
  const render = () => {
    $$('.pk-tab', dlg).forEach(t => t.classList.toggle('on', t.dataset.pk === tab));
    const list = tab === 'preset' ? presets() : myBuilds();
    $('#pkGrid').innerHTML = list.map(x => {
      const b = x.build, on = setup.pick.kind === tab && setup.pick.id === x.id;
      return `<button class="pcard${on ? ' on' : ''}" data-id="${esc(x.id)}">
        <span class="pcard-num">${esc(b.identity.number)}</span>
        <span class="pcard-ovr">${B.overall(b)}<small>OVR</small></span>
        <span class="pcard-name">${esc(fullName(b))}</span>
        <span class="pcard-meta">${esc(b.position)} · ${D.fmtHeight(b.body.height)} · ${b.body.weight} lbs${x.id === 'current' ? ' · Current build' : ''}</span>
        <span class="pcard-arch">${esc(B.archetype(b).name)}</span>
      </button>`;
    }).join('') + (tab === 'mine' ? '<a class="pcard new" href="/"><b>+</b><span class="pcard-name">Create New</span><span class="pcard-meta">Opens the MyPLAYER builder</span></a>' : '');
  };
  dlg.onclick = e => {
    const t = e.target.closest('[data-pk]');
    if (t) { tab = t.dataset.pk; render(); return; }
    if (e.target.closest('[data-pk-close]') || e.target === dlg) { dlg.close(); return; }
    const c = e.target.closest('.pcard[data-id]');
    if (c) {
      setup.pick = { kind: tab, id: c.dataset.id };
      saveSetup(); dlg.close(); renderProfile(); onPick?.();
    }
  };
  render();
  dlg.showModal();
  $('.pcard', dlg)?.focus();
}

// ================= screens =================
let screen = 'main';
const ENTER = {};
function go(name) {
  screen = name;
  for (const s of $$('.scr')) s.hidden = s.id !== 'scr-' + name;
  const title = $('#scr-' + name).dataset.title;
  $('#crumbs').innerHTML = name === 'main' ? '<b>Main Menu</b>' : `Main Menu / <b>${esc(title)}</b>`;
  $('#shell').classList.toggle('dim', name !== 'main');
  $('#hintBack').hidden = name === 'main';
  ENTER[name]?.();
  requestAnimationFrame(() => $('#scr-' + name + ' .nav:not([disabled])')?.focus({ preventScroll: true }));
}
async function back() {
  if ($('#picker').open) { $('#picker').close(); return; }
  if (screen === 'lobby') {
    leaveRoom();
    go('online');
  } else if (screen !== 'main') go('main');
}

// ---------- option rows ----------
function optionRows(el, defs, locked = false) {
  el.innerHTML = defs.map(d => {
    const v = d.get?.(), cur = d.values ? d.values.find(x => x[0] === v) : null;
    const label = d.display ? d.display() : cur ? cur[1] : String(v);
    return `<div class="row-opt nav${locked || d.locked ? ' locked' : ''}${d.action ? ' row-player' : ''}" tabindex="0" data-key="${d.key}" role="group" aria-label="${esc(d.label)}">
      <span class="row-lbl">${esc(d.label)}</span>
      <span class="row-val">${d.action ? '' : `<button class="arr" data-dir="-1" tabindex="-1" aria-label="Previous">${ARROW_L}</button>`}<span>${esc(label)}</span>${d.action ? `<button class="arr" data-dir="1" tabindex="-1" aria-label="Choose">${ARROW_R}</button>` : `<button class="arr" data-dir="1" tabindex="-1" aria-label="Next">${ARROW_R}</button>`}</span>
    </div>`;
  }).join('');
  const step = (row, dir) => {
    const d = defs.find(x => x.key === row.dataset.key);
    if (!d || locked || d.locked) return;
    if (d.action) { d.action(); return; }
    const i = d.values.findIndex(x => x[0] === d.get());
    const next = d.values[(i + dir + d.values.length) % d.values.length][0];
    d.set(next);
    sfx.tone(520, 0.05, 'sine', 0.06);
    optionRows(el, defs, locked);
    $(`[data-key="${d.key}"]`, el)?.focus();
  };
  el.onclick = e => {
    const row = e.target.closest('.row-opt');
    if (!row) return;
    const arr = e.target.closest('.arr');
    step(row, arr ? +arr.dataset.dir : 1);
  };
  el.onkeydown = e => {
    const row = e.target.closest('.row-opt');
    if (!row) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); step(row, e.key === 'ArrowLeft' ? -1 : 1); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(row, 1); }
  };
}
const MODE_VALS = [[2, '2 v 2'], [3, '3 v 3']];
const TARGET_VALS = [[11, 'First to 11'], [21, 'First to 21']];
const SCORE_VALS = [['12', "1's & 2's"], ['23', "2's & 3's"]];
const DIFF_VALS = Object.entries(DIFFICULTY).map(([k, v]) => [k, v.label]);

// ---------- play now ----------
function makeSquads() {
  const me = pickedBuild(), ovr = B.overall(me), diff = DIFFICULTY[setup.difficulty];
  squads = {
    mates: Array.from({ length: setup.mode - 1 }, () => buildAtOvr(clamp(ovr - 3, 55, 92))),
    opps: Array.from({ length: setup.mode }, () => buildAtOvr(clamp(ovr + diff.ovr, 50, 97))),
  };
}
const avgOvr = list => Math.round(list.reduce((s, b) => s + B.overall(b), 0) / list.length);
const rosterRow = (b, you) => `<div class="rp${you ? ' you' : ''}"><b>${B.overall(b)}</b><div><div class="n">${esc(fullName(b))}${you ? ' (You)' : ''}</div>
  <div class="m">${esc(b.position)} · ${D.fmtHeight(b.body.height)} · ${esc(B.archetype(b).name)}</div></div></div>`;
function renderSetup() {
  optionRows($('#setupRows'), [
    { key: 'player', label: 'Your Player', display: () => fullName(pickedBuild()), action: () => openPicker(() => { makeSquads(); renderSetup(); }) },
    { key: 'mode', label: 'Mode', values: MODE_VALS, get: () => setup.mode, set: v => { setup.mode = v; makeSquads(); saveSetup(); renderMatchup(); } },
    { key: 'target', label: 'Game To', values: TARGET_VALS, get: () => setup.target, set: v => { setup.target = v; saveSetup(); } },
    { key: 'scoring', label: 'Scoring', values: SCORE_VALS, get: () => setup.scoring, set: v => { setup.scoring = v; saveSetup(); } },
    { key: 'difficulty', label: 'Difficulty', values: DIFF_VALS, get: () => setup.difficulty, set: v => { setup.difficulty = v; makeSquads(); saveSetup(); renderMatchup(); } },
  ]);
  renderMatchup();
}
function renderMatchup() {
  const me = pickedBuild();
  const mine = [me, ...squads.mates];
  $('#matchup').innerHTML = `
    <div class="mteam" style="--c:var(--neon)"><div class="mteam-head"><span class="mteam-name">Your Squad</span><span class="mteam-ovr">${avgOvr(mine)}</span></div>
      <div class="roster">${mine.map((b, i) => rosterRow(b, i === 0)).join('')}</div></div>
    <div class="vs-col">VS</div>
    <div class="mteam" style="--c:#3ab0ff"><div class="mteam-head"><span class="mteam-name">CPU</span><span class="mteam-ovr">${avgOvr(squads.opps)}</span></div>
      <div class="roster">${squads.opps.map(b => rosterRow(b, false)).join('')}</div></div>`;
}
ENTER.setup = () => { if (!squads || squads.mates.length !== setup.mode - 1) makeSquads(); renderSetup(); };

// ---------- settings ----------
ENTER.settings = () => {
  optionRows($('#settingsRows'), [
    { key: 'sound', label: 'Sound', values: [[true, 'On'], [false, 'Off']], get: () => prefs.sound, set: v => { prefs.sound = v; sfx.setMuted(!v); savePrefs(); } },
    { key: 'camera', label: 'Camera', values: [['broadcast', 'Broadcast'], ['close', 'Close']], get: () => prefs.camera, set: v => { prefs.camera = v; savePrefs(); } },
    { key: 'names', label: 'Player Names', values: [[true, 'On'], [false, 'Off']], get: () => prefs.names, set: v => { prefs.names = v; savePrefs(); } },
  ]);
};

// ================= online =================
let net = null;
let lobby = null;
let ready = false;

async function joinRoom(code, creating = false) {
  leaveRoom();
  net = new Net();
  const b = pickedBuild();
  const btn = creating ? $('#createBtn') : $('#joinBtn');
  btn.disabled = true;
  try {
    await net.connect(code, { name: fullName(b), build: b });
  } catch (err) {
    toast(err.message);
    net = null;
    return;
  } finally { btn.disabled = false; }
  ready = false;
  net.on('lobby', m => { lobby = m; if (screen === 'lobby') renderLobby(); })
    .on('error', m => toast(m.msg))
    .on('start', m => startOnline(m.cfg))
    .on('st', m => onSnapshot(m.s))
    .on('in', m => onRemoteInput(m.from, m.i))
    .on('left', m => { if (G?.game) { G.game.releaseControl(m.id); toast('A player left. The AI took over.'); } })
    .on('toLobby', () => { stopGame(); showMenus(); go('lobby'); })
    .on('hostLeft', () => { stopGame(); showMenus(); toast('The host left, so the game ended.'); go('lobby'); })
    .on('disconnect', () => { stopGame(); showMenus(); net = null; lobby = null; toast('Disconnected from the room.'); go('online'); });
  history.replaceState(null, '', `${location.pathname}?room=${net.code}`);
  go('lobby');
}
function leaveRoom() {
  if (net) net.close();
  net = null; lobby = null; ready = false;
  if (location.search) history.replaceState(null, '', location.pathname);
}

const isHost = () => lobby && net && lobby.host === net.id;
function renderLobby() {
  if (!lobby) { $('#roomCode').textContent = net?.code || '----'; return; }
  $('#roomCode').textContent = lobby.code;
  const cap = lobby.settings.mode;
  const host = isHost();
  for (const team of [0, 1]) {
    const ps = lobby.players.filter(p => p.team === team);
    const slots = [];
    for (let i = 0; i < cap; i++) {
      const p = ps[i];
      if (!p) { slots.push('<div class="slot ai"><div class="slot-ovr">AI</div><div><div class="slot-name">Open Slot</div><div class="slot-meta">Filled by AI if nobody joins</div></div><div></div></div>'); continue; }
      const b = B.sanitizeBuild(p.build);
      const me = p.id === net.id;
      slots.push(`<div class="slot${me ? ' me' : ''}"><div class="slot-ovr">${B.overall(b)}</div>
        <div><div class="slot-name">${esc(p.name)}</div><div class="slot-meta">${esc(b.position)} · ${D.fmtHeight(b.body.height)} · ${esc(B.archetype(b).name)}</div></div>
        <div class="slot-tags">${me ? '<span class="tag you">You</span>' : ''}${p.id === lobby.host ? '<span class="tag host">Host</span>' : p.ready ? '<span class="tag ready">Ready</span>' : '<span class="tag">Not Ready</span>'}</div></div>`);
    }
    $(team === 0 ? '#slotsHome' : '#slotsAway').innerHTML = slots.join('');
    const ovrs = ps.map(p => B.overall(B.sanitizeBuild(p.build)));
    $(team === 0 ? '#homeOvr' : '#awayOvr').textContent = ovrs.length ? `${ps.length}/${cap}` : `0/${cap}`;
  }
  const s = lobby.settings;
  optionRows($('#lobbyRows'), [
    { key: 'mode', label: 'Mode', values: MODE_VALS, get: () => s.mode, set: v => net.send({ t: 'settings', settings: { ...s, mode: v } }) },
    { key: 'target', label: 'Game To', values: TARGET_VALS, get: () => s.target, set: v => net.send({ t: 'settings', settings: { ...s, target: v } }) },
    { key: 'scoring', label: 'Scoring', values: SCORE_VALS, get: () => s.scoring, set: v => net.send({ t: 'settings', settings: { ...s, scoring: v } }) },
    { key: 'difficulty', label: 'AI Difficulty', values: DIFF_VALS, get: () => s.difficulty, set: v => net.send({ t: 'settings', settings: { ...s, difficulty: v } }) },
  ], !host);
  const meP = lobby.players.find(p => p.id === net.id);
  ready = !!meP?.ready;
  $('#readyBtn').hidden = host;
  $('#readyBtn').classList.toggle('on', ready);
  $('#readyBtn span').textContent = ready ? 'Ready ✓' : 'Ready Up';
  $('#lobbyStartBtn').hidden = !host;
  const waiting = lobby.players.filter(p => p.id !== lobby.host && !p.ready).length;
  $('#lobbyStartBtn').disabled = waiting > 0;
  $('#sideBtn span').textContent = meP?.team === 0 ? 'Switch to Away' : 'Switch to Home';
  $('#lobbyNote').textContent = host
    ? (waiting ? `Waiting on ${waiting} player${waiting > 1 ? 's' : ''} to ready up.` : 'Everyone is ready. You host the game, so keep this tab open until it ends.')
    : 'Waiting for the host to start. Only the host can change game settings.';
}
ENTER.lobby = renderLobby;

function startHostGame() {
  if (!isHost()) return;
  const s = lobby.settings;
  const humans = lobby.players.map(p => ({ ...p, build: B.sanitizeBuild(p.build) }));
  const avg = humans.reduce((t, p) => t + B.overall(p.build), 0) / humans.length;
  const diff = DIFFICULTY[s.difficulty];
  const roster = [];
  for (const team of [0, 1]) {
    const hs = humans.filter(p => p.team === team);
    for (const p of hs) roster.push({ team, build: p.build, human: p.id, name: p.name });
    for (let i = hs.length; i < s.mode; i++) roster.push({ team, build: buildAtOvr(clamp(Math.round(avg + (hs.length ? -3 : diff.ovr)), 50, 95)), human: null });
  }
  net.send({ t: 'start', cfg: { ...s, roster, firstPoss: Math.random() < 0.5 ? 0 : 1 } });
}

// ================= game runtime =================
let G = null; // { game, view, localId, online, host, ... }
let last = 0, acc = 0, pending = null, gradeUntil = 0, meterUntil = 0;
const remote = {};

function showMenus() { $('#game').hidden = true; $('#shell').hidden = false; menuStage?.resume(); }
function showGame() { $('#shell').hidden = true; $('#game').hidden = false; menuStage?.pause(); }

function runGame({ game, localId, online, host, jerseys }) {
  stopGame();
  showGame();
  $('#over').hidden = true; $('#pause').hidden = true;
  let view;
  try {
    view = new CourtView($('#court'), game, { localId, jerseys, camera: prefs.camera });
  } catch (err) {
    console.error(err);
    toast('This game needs WebGL, which is not available in this browser.');
    showMenus();
    return;
  }
  G = { game, view, localId, online, host, me: game.players[localId], snapT: 0, sendT: 0, outbox: [], lastSent: null, paused: false };
  let lastDrib = 0;
  view.onDribble = () => { const t = performance.now(); if (t - lastDrib > 180) { lastDrib = t; sfx.dribble(); } };
  if (!input) input = new Input($('#touch'));
  input.enabled = true;
  const me = G.me;
  $('#hudName').textContent = fullName(me.build);
  $('#sTo').textContent = `To ${game.target}`;
  $('#sbHome').textContent = online ? 'Home' : 'You';
  $('#sbAway').textContent = online ? 'Away' : 'CPU';
  $$('.sb-team').forEach(el => el.classList.toggle('mine', el.classList.contains(me.team === 0 ? 'home' : 'away')));
  $('#netTag').hidden = !online;
  $('#netTag').innerHTML = online ? `Room <b>${esc(net?.code || '')}</b>${host ? ' · Host' : ''}` : '';
  $('#ovRestart').hidden = online;
  $('#pauseNote').textContent = online ? 'Online games keep running while this menu is open.' : '';
  $('#tags').innerHTML = '';
  for (const k of Object.keys(remote)) delete remote[k];
  window.__game = game;
  if (online && host) ensureTicker();
  last = performance.now(); acc = 0; pending = null;
  banner(game.poss === me.team ? 'Your Ball' : 'Their Ball', 'Check');
  requestAnimationFrame(frame);
}
function stopGame() {
  if (G) { G.view.dispose(); G = null; }
}

function startLocal() {
  sfx.ensure();
  const game = new Game({
    userBuild: B.clone(pickedBuild()), mode: setup.mode, target: setup.target, scoring: setup.scoring, difficulty: setup.difficulty,
    teammates: squads.mates.map(B.clone), opponents: squads.opps.map(B.clone),
  });
  runGame({ game, localId: 0, online: false, host: true });
}

function startOnline(cfg) {
  sfx.ensure();
  const roster = cfg.roster.map(r => ({ team: r.team ? 1 : 0, build: B.sanitizeBuild(r.build), human: r.human || null }));
  const game = new Game({ mode: cfg.mode, target: cfg.target, scoring: cfg.scoring, difficulty: cfg.difficulty, roster, firstPoss: cfg.firstPoss });
  const localId = Math.max(0, roster.findIndex(r => r.human === net.id));
  game.user = game.players[localId];
  runGame({ game, localId, online: true, host: isHost(), jerseys: ['Red', 'Royal'] });
}

function onRemoteInput(from, i) {
  if (!G?.host || !i) return;
  const prev = remote[from] || {};
  remote[from] = {
    mx: clamp(+i.mx || 0, -1, 1), mz: clamp(+i.mz || 0, -1, 1), sprint: !!i.sprint, shoot: !!i.shoot,
    shootPressed: !!(prev.shootPressed || i.sp), shootReleased: !!(prev.shootReleased || i.sr), passPressed: !!(prev.passPressed || i.pp),
  };
}
function onSnapshot(s) {
  if (!G || G.host) return;
  const events = G.game.applySnapshot(s);
  handleEvents(events);
}

function frame(now) {
  if (!G) return;
  const dt = tick(now);
  G.view.update(G.paused && !G.online ? 0 : dt, now / 1000);
  hud(now);
  requestAnimationFrame(frame);
}

// background tabs stop requestAnimationFrame; a worker timer keeps an online host's game running
let ticker = null;
function ensureTicker() {
  if (ticker) return;
  try {
    ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)'], { type: 'text/javascript' })));
    ticker.onmessage = () => { if (document.hidden && G?.online && G.host) tick(performance.now()); };
  } catch { ticker = null; }
}

function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const inp = input.read();
  if (inp.pausePressed && G.game.phase !== 'over') setPaused(!G.paused);
  const g = G.game;
  const localKey = g.players[G.localId].ctrl;
  if (G.host) {
    if (!G.paused || G.online) {
      const mine = G.paused ? { mx: 0, mz: 0, shoot: false, sprint: false } : inp;
      pending = pending ? { ...mine, shootPressed: pending.shootPressed || mine.shootPressed, passPressed: pending.passPressed || mine.passPressed, shootReleased: pending.shootReleased || mine.shootReleased } : mine;
      acc += dt;
      while (acc >= STEP) {
        const inputs = { [localKey]: pending, ...remote };
        g.step(STEP, inputs);
        pending = { ...pending, shootPressed: false, passPressed: false, shootReleased: false };
        for (const k of Object.keys(remote)) remote[k] = { ...remote[k], shootPressed: false, passPressed: false, shootReleased: false };
        acc -= STEP;
      }
      const evs = g.events.splice(0);
      if (G.online) G.outbox.push(...evs);
      handleEvents(evs);
      if (G.online) {
        G.snapT += dt;
        if (G.snapT >= SNAP_EVERY) {
          G.snapT = 0;
          const snap = g.snapshot(); snap.e = G.outbox.splice(0);
          net?.send({ t: 'st', s: snap });
        }
      }
    }
  } else {
    g.extrapolate(dt);
    const pkt = { mx: +inp.mx.toFixed(2), mz: +inp.mz.toFixed(2), sprint: inp.sprint, shoot: inp.shoot, sp: inp.shootPressed, sr: inp.shootReleased, pp: inp.passPressed };
    G.sendT += dt;
    const ls = G.lastSent;
    const changed = !ls || pkt.sp || pkt.sr || pkt.pp || ls.mx !== pkt.mx || ls.mz !== pkt.mz || ls.sprint !== pkt.sprint || ls.shoot !== pkt.shoot;
    if (changed || G.sendT > 0.1) { net?.send({ t: 'in', i: pkt }); G.lastSent = pkt; G.sendT = 0; }
  }
  return dt;
}

function setPaused(p) {
  if (!G) return;
  G.paused = p;
  $('#pause').hidden = !p;
}

// ---------- feedback ----------
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

function handleEvents(events) {
  if (!G) return;
  const g = G.game, myTeam = G.me.team;
  const pname = id => (g.players[id]?.name || '').split(' ').slice(-1)[0];
  const mine = t => t === myTeam;
  for (const e of events) {
    switch (e.type) {
      case 'make': {
        sfx.swish(); G.view.netKick = 1;
        const kind = e.kind === 'dunk' ? 'Slam!' : e.kind === 'three' ? 'Splash!' : e.kind === 'layup' ? 'And Finish' : 'Bucket';
        banner(`${kind} +${e.pts}`, pname(e.id) + (e.assist != null ? ` · ast ${pname(e.assist)}` : ''), !mine(e.team));
        bump(e.team === 0 ? '#sMe' : '#sThem');
        if (mine(e.team)) sfx.cheer();
        break;
      }
      case 'release':
        if (e.id === G.localId && e.grade) { showGrade(e.grade); if (e.grade === 'Excellent') sfx.green(); }
        break;
      case 'block': sfx.block(); banner(mine(g.players[e.id].team) ? 'Rejected!' : 'Blocked', pname(e.id), !mine(g.players[e.id].team)); break;
      case 'steal': sfx.steal(); banner(mine(g.players[e.id].team) ? 'Steal!' : 'Stolen', pname(e.id), !mine(g.players[e.id].team)); break;
      case 'turnover': sfx.whistle(); banner(e.reason, 'Turnover', mine(e.team)); break;
      case 'noClear': sfx.whistle(); banner("Didn't Clear", 'No basket', mine(e.team)); break;
      case 'airball': banner('Airball', pname(e.id), mine(g.players[e.id].team)); break;
      case 'rim': sfx.rim(); break;
      case 'bounce': if (e.v > 2) sfx.dribble(); break;
      case 'check': setTimeout(() => G && banner(e.team === myTeam ? 'Your Ball' : 'Their Ball', 'Check'), 50); break;
      case 'gameover': setTimeout(showOver, 900); break;
    }
  }
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

function hud(now) {
  const g = G.game, u = G.me;
  $('#sMe').textContent = g.score[0];
  $('#sThem').textContent = g.score[1];
  const clock = $('#sClock');
  clock.textContent = Math.max(0, Math.ceil(g.shotClock));
  clock.classList.toggle('low', g.shotClock < 5);
  $('#sPoss').classList.toggle('away', g.poss === 1);
  $('#clearTag').classList.toggle('show', g.phase === 'live' && g.needsClear && g.poss === u.team);
  const e = $('#energy'); e.style.width = u.energy * 100 + '%'; e.classList.toggle('low', u.energy < 0.25);

  const m = $('#meter');
  const showMeter = (u.state === 'jumper' && u.shot) || now < meterUntil;
  if (showMeter) {
    const s = u.shot;
    const pos = G.view.toScreen(u.x, u.h + u.y + 0.35, u.z);
    m.style.left = pos.x + 36 + 'px'; m.style.top = pos.y + 60 + 'px';
    m.classList.add('show');
    if (s) {
      const scale = s.Tm * 1.1;
      const fillT = s.released ? s.relT : u.st;
      $('#meterFill').style.height = clamp(fillT / scale, 0, 1) * 100 + '%';
      const w = s.released || !G.host ? s.window : g.shotWindow(u);
      const gb = $('#meterGreen');
      gb.style.bottom = clamp((s.ideal - w / 2) / scale, 0, 1) * 100 + '%';
      gb.style.height = Math.max(3, (w / scale) * 100) + '%';
      if (!s.released) m.classList.remove('hit', 'miss');
    }
    const gr = $('#grade');
    gr.style.left = pos.x + 'px'; gr.style.top = pos.y - 10 + 'px';
  } else m.classList.remove('show');
  if (now > gradeUntil) $('#grade').classList.remove('show');

  // name tags over other human players
  const tags = $('#tags');
  if (prefs.names && G.online) {
    const humans = g.players.filter(p => p.isUser && p.id !== G.localId);
    if (tags.childElementCount !== humans.length) tags.innerHTML = humans.map(p => `<span class="ntag" data-id="${p.id}">${esc(p.name)}</span>`).join('');
    for (const el of tags.children) {
      const p = g.players[+el.dataset.id];
      if (!p) continue;
      const pos = G.view.toScreen(p.x, p.h + p.y + 0.45, p.z);
      el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
      el.style.setProperty('--c', p.team === u.team ? '#fff' : '#3ab0ff');
    }
  } else if (tags.childElementCount) tags.innerHTML = '';

  const b = g.ball;
  const hasBall = b.state === 'held' && b.holder === u;
  const offense = g.poss === u.team;
  $('#tShoot').textContent = hasBall ? 'Shoot' : offense ? 'Jump' : 'Block';
  $('#tPass').textContent = hasBall ? 'Pass' : offense ? 'Call' : 'Steal';
}

function letterGrade(p, target) {
  const s = p.stats;
  const v = s.pts + 1.1 * s.reb + 1.5 * s.ast + 2 * s.stl + 2 * s.blk - 1.5 * s.to - 0.6 * (s.fga - s.fgm);
  const k = v / (target * 0.5);
  return k >= 1.4 ? 'A+' : k >= 1.15 ? 'A' : k >= 0.95 ? 'A-' : k >= 0.8 ? 'B+' : k >= 0.65 ? 'B' : k >= 0.5 ? 'B-' : k >= 0.4 ? 'C+' : k >= 0.3 ? 'C' : k >= 0.2 ? 'C-' : 'D';
}
function showOver() {
  if (!G) return;
  const g = G.game, me = G.me, won = g.winner === me.team;
  sfx[won ? 'cheer' : 'whistle']();
  $('#ovKicker').textContent = `${g.mode}v${g.mode} · ${G.online ? 'Online' : DIFFICULTY[setup.difficulty].label}`;
  const t = $('#ovTitle'); t.textContent = won ? 'You Win' : 'You Lose'; t.className = 'ov-title ' + (won ? 'win' : 'loss');
  $('#ovScore').innerHTML = `<span style="color:var(--neon)">${g.score[0]}</span> – <span style="color:#3ab0ff">${g.score[1]}</span>`;
  const row = (p, sep) => {
    const s = p.stats;
    return `<tr class="${p.id === G.localId ? 'you' : ''}${p.isUser ? ' human' : ''}${sep ? ' sep' : ''}"><td>${esc(p.name)}</td><td>${s.pts}</td><td>${s.reb}</td><td>${s.ast}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.fgm}-${s.fga}</td><td>${s.tpm}-${s.tpa}</td><td>${s.to}</td></tr>`;
  };
  const home = g.team(0), away = g.team(1);
  $('#ovBox').innerHTML = `<table><thead><tr><th>Player</th><th>Pts</th><th>Reb</th><th>Ast</th><th>Stl</th><th>Blk</th><th>FG</th><th>3P</th><th>TO</th></tr></thead>
    <tbody>${home.map((p, i) => row(p, i === home.length - 1)).join('')}${away.map(p => row(p, false)).join('')}</tbody></table>
    <div class="grade-big">Your Grade <b>${letterGrade(me, g.target)}</b></div>`;
  $('#ovActions').innerHTML = G.online
    ? (G.host ? '<button class="btn primary" data-ov="lobby">Back to Lobby</button><button class="btn" data-ov="quit">Leave Room</button>'
      : '<button class="btn" disabled>Waiting for host…</button><button class="btn" data-ov="quit">Leave Room</button>')
    : '<button class="btn primary" data-ov="again">Run It Back</button><button class="btn" data-ov="setup">New Game</button><button class="btn" data-ov="main">Main Menu</button>';
  $('#over').hidden = false;
}

// ---------- misc ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function menuKeys(e) {
  if (!$('#game').hidden) return;
  if ($('#picker').open && e.key !== 'Escape') return;
  const inField = e.target.matches?.('input, select, textarea');
  if (e.key === 'Escape') { e.preventDefault(); back(); return; }
  if (inField) return;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const items = $$(`#scr-${screen} .nav`).filter(el => !el.hidden && !el.disabled && el.offsetParent);
  if (!items.length) return;
  e.preventDefault();
  const i = items.indexOf(document.activeElement);
  const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
  const next = items[i < 0 ? 0 : clamp(i + dir, 0, items.length - 1)];
  next.focus();
  if (i !== items.indexOf(next)) sfx.tone(440, 0.04, 'sine', 0.05);
}

function boot() {
  try {
    menuStage = new PlayerStage($('#menuStage'));
    menuStage.setAutoRotate(true);
    menuStage.yaw = -0.35;
    $('#menuStage').classList.add('on');
  } catch { menuStage = null; }
  renderProfile();
  go('main');

  $('#profileBtn').addEventListener('click', () => openPicker(() => {
    if (screen === 'setup') { makeSquads(); renderSetup(); }
    if (screen === 'lobby' && net) { const b = pickedBuild(); net.send({ t: 'build', name: fullName(b), build: b }); }
  }));
  $('#scr-main').addEventListener('click', e => {
    const t = e.target.closest('[data-go]');
    if (!t || t.dataset.go === 'builder') return;
    sfx.ensure(); sfx.tone(660, 0.06, 'sine', 0.08);
    go(t.dataset.go);
  });
  $('#rerollBtn').addEventListener('click', () => { makeSquads(); renderMatchup(); });
  $('#startBtn').addEventListener('click', startLocal);
  $('#createBtn').addEventListener('click', async () => {
    $('#createBtn').disabled = true;
    try { const code = await createRoom(); await joinRoom(code, true); }
    catch (err) { toast(err.message.includes('fetch') ? 'Online play needs the Cloudflare Worker (npm run dev).' : err.message); }
    finally { $('#createBtn').disabled = false; }
  });
  const codeIn = $('#codeInput');
  codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
  codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
  $('#joinBtn').addEventListener('click', () => {
    if (codeIn.value.length !== 4) { toast('Room codes are 4 characters.'); codeIn.focus(); return; }
    joinRoom(codeIn.value);
  });
  $('#inviteBtn').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}?room=${net?.code}`;
    try { await navigator.clipboard.writeText(url); toast('Invite link copied.'); } catch { toast(url); }
  });
  $('#sideBtn').addEventListener('click', () => { const me = lobby?.players.find(p => p.id === net.id); if (me) net.send({ t: 'side', team: me.team ? 0 : 1 }); });
  $('#pickBtn').addEventListener('click', () => openPicker(() => { const b = pickedBuild(); net?.send({ t: 'build', name: fullName(b), build: b }); }));
  $('#readyBtn').addEventListener('click', () => net?.send({ t: 'ready', v: !ready }));
  $('#lobbyStartBtn').addEventListener('click', startHostGame);

  $('#pauseBtn').addEventListener('click', () => setPaused(!G?.paused));
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-ov]');
    if (!a) return;
    switch (a.dataset.ov) {
      case 'resume': setPaused(false); break;
      case 'restart': case 'again': startLocal(); break;
      case 'setup': stopGame(); showMenus(); go('setup'); break;
      case 'main': stopGame(); showMenus(); go('main'); break;
      case 'lobby': net?.send({ t: 'lobby' }); break;
      case 'quit':
        stopGame(); showMenus();
        if (net) { leaveRoom(); go('online'); } else go('main');
        break;
    }
  });
  document.addEventListener('keydown', menuKeys);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touchmode');
  window.addEventListener('touchstart', () => document.body.classList.add('touchmode'), { once: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.online && G.game.phase !== 'over') setPaused(true); });

  const room = new URLSearchParams(location.search).get('room');
  if (room && /^[A-Za-z0-9]{4}$/.test(room)) { go('online'); codeIn.value = room.toUpperCase(); joinRoom(room.toUpperCase()); }
}

boot();
