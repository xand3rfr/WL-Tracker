import * as D from './data.js';
import * as B from './build.js';
import { PlayerStage, CLIP_LABELS, animPreviewParams } from './player3d.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const store = {
  get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const K_CURRENT = 'bl_current_v1', K_BUILDS = 'bl_builds_v1';

const ICONS = {
  identity: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 16.5c1-2 5-2 6 0M14 10h4M14 13h3"/>',
  body: '<circle cx="12" cy="4.5" r="2.2"/><path d="M8 9h8l-1 6h-2l-.5 6h-1L11 15H9z"/>',
  position: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 4v16M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>',
  attributes: '<path d="M5 20V11M10 20V5M15 20v-7M20 20V8"/>',
  badges: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  animations: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  builds: '<path d="M4 7l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>',
  compare: '<path d="M12 3v18M5 7h4M5 11h3M5 15h4M15 7h4M16 11h3M15 15h4"/>',
};
const TABS = [
  { id: 'identity', label: 'Identity' }, { id: 'body', label: 'Body' }, { id: 'position', label: 'Position' },
  { id: 'attributes', label: 'Ratings' }, { id: 'badges', label: 'Badges' }, { id: 'animations', label: 'Anims' },
  { id: 'builds', label: 'Builds' }, { id: 'compare', label: 'Compare' },
];

const state = {
  build: null, d: null, tab: 'identity', saved: [],
  badgeFilter: 'all', cmpA: 'current', cmpB: null, rival: null, lastOvr: null,
};
let stage = null;

// ---------- core ----------
function commit({ model = false, panel = false } = {}) {
  state.d = B.derive(state.build);
  refreshHUD();
  if (model) scheduleModel();
  if (panel) renderPanel();
  saveCurrentSoon();
}

let modelTimer = 0;
function scheduleModel() {
  clearTimeout(modelTimer);
  modelTimer = setTimeout(() => stage?.setBuild(state.build), 40);
}
let saveTimer = 0;
function saveCurrentSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(K_CURRENT, state.build), 300);
}

function setBuild(build, { toastMsg } = {}) {
  state.build = build;
  commit({ model: true, panel: true });
  $('#panel').scrollTop = 0;
  if (toastMsg) toast(toastMsg);
}

function ratingClass(v) { return v >= 90 ? 'r-elite' : v >= 80 ? 'r-good' : v >= 60 ? 'r-ok' : 'r-low'; }
const fullName = b => `${b.identity.first} ${b.identity.last}`.trim() || 'Unnamed Player';

function refreshHUD() {
  const { build: b, d } = state;
  $('#topOvr').textContent = d.ovr;
  $('#topArch').textContent = d.arch.name;
  const num = $('#stageOvr');
  num.textContent = d.ovr;
  if (state.lastOvr != null && state.lastOvr !== d.ovr) { num.classList.remove('bump'); void num.offsetWidth; num.classList.add('bump'); }
  state.lastOvr = d.ovr;
  $('#ovrRing').style.strokeDashoffset = String(326.7 * (1 - clamp((d.ovr - 40) / 59, 0, 1)));
  $('#stageArch').textContent = d.arch.name;
  $('#stageArchTags').innerHTML = d.arch.name === 'Raw Prospect' ? '' :
    `<span class="chip">${esc(B.CATEGORY_LABEL[d.arch.primary])}</span><span class="chip alt">${esc(B.CATEGORY_LABEL[d.arch.secondary])}</span>`;
  $('#cardNum').textContent = '#' + (b.identity.number || '0');
  $('#cardName').textContent = fullName(b);
  $('#cardNick').textContent = b.identity.nickname ? `"${b.identity.nickname}"` : '';
  $('#cardPhys').innerHTML = `<b>${esc(b.position)}</b> · ${D.fmtHeight(b.body.height)} · ${b.body.weight} lbs · WS ${D.fmtHeight(b.body.wingspan)}`;
  document.title = `${fullName(b)} (${d.ovr} OVR) · Blacktop Legends`;
}

// ---------- tabs ----------
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t => `
    <button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === state.tab}">
      <svg viewBox="0 0 24 24">${ICONS[t.id]}</svg><span>${t.label}</span>
    </button>`).join('');
}
function setTab(id) {
  state.tab = id;
  $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
  renderPanel();
  $('#panel').scrollTop = 0;
  if (window.matchMedia('(max-width: 860px)').matches) {
    const top = $('#tabs').getBoundingClientRect().top + window.scrollY - $('.topbar').offsetHeight;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  }
}

const RENDER = {};
function renderPanel() {
  const p = $('#panel');
  p.innerHTML = `<div class="panel-fade">${RENDER[state.tab]()}</div>`;
  AFTER[state.tab]?.(p);
}
const AFTER = {};

const head = (kicker, title, extra = '') => `<div class="panel-head"><h2 class="panel-title"><small>${kicker}</small>${title}</h2>${extra}</div>`;
const slider = ({ id, label, min, max, value, display, scale }) => `
  <div class="slider-field">
    <div class="slider-head"><span class="lbl">${label}</span><span class="slider-val" id="${id}-val">${display}</span></div>
    <input type="range" class="range" id="${id}" min="${min}" max="${max}" value="${value}" aria-label="${label}">
    ${scale ? `<div class="slider-scale"><span>${scale[0]}</span><span>${scale[1]}</span></div>` : ''}
  </div>`;
const setRangeFill = (el, capPct = 100) => {
  const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty('--pct', pct + '%');
  el.style.setProperty('--cap', capPct + '%');
};

// ---------- identity ----------
RENDER.identity = () => {
  const i = state.build.identity;
  return `${head('Step 1', 'Player Identity')}
  <div class="card">
    <div class="row">
      <div class="field"><label for="f-first">First Name</label><input class="input" id="f-first" maxlength="20" value="${esc(i.first)}" autocomplete="off"></div>
      <div class="field"><label for="f-last">Last Name</label><input class="input" id="f-last" maxlength="20" value="${esc(i.last)}" autocomplete="off"></div>
    </div>
    <div class="row">
      <div class="field"><label for="f-nick">Nickname</label><input class="input" id="f-nick" maxlength="24" value="${esc(i.nickname)}" placeholder="e.g. The Blur" autocomplete="off"></div>
      <div class="field"><label for="f-num">Jersey Number</label><input class="input" id="f-num" inputmode="numeric" maxlength="2" value="${esc(i.number)}" autocomplete="off"></div>
    </div>
  </div>
  <div class="card">
    ${slider({ id: 'f-age', label: 'Age', min: 19, max: 40, value: i.age, display: `${i.age}<small>yrs</small>`, scale: ['19', '40'] })}
  </div>
  <div class="card">
    <div class="field"><label for="f-country">Country</label>
      <select class="select" id="f-country">${D.COUNTRIES.map(c => `<option${c === i.country ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
    </div>
    <div class="field"><label for="f-college">College / Hometown</label>
      <input class="input" id="f-college" list="colleges" maxlength="40" value="${esc(i.college)}" placeholder="Pick or type your own" autocomplete="off">
      <datalist id="colleges">${D.COLLEGES.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    </div>
  </div>
  <p class="note">Your name and number show up on the jersey in the preview. Tip: hit <b>Random</b> up top to roll a complete player.</p>`;
};
AFTER.identity = p => {
  const i = state.build.identity;
  const bind = (id, key, model) => $('#' + id, p).addEventListener('input', e => { i[key] = e.target.value; commit({ model }); });
  bind('f-first', 'first'); bind('f-last', 'last', true); bind('f-nick', 'nickname'); bind('f-college', 'college');
  $('#f-num', p).addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 2);
    i.number = e.target.value || '0';
    commit({ model: true });
  });
  $('#f-country', p).addEventListener('change', e => { i.country = e.target.value; commit(); });
  const age = $('#f-age', p); setRangeFill(age);
  age.addEventListener('input', () => { i.age = +age.value; $('#f-age-val').innerHTML = `${i.age}<small>yrs</small>`; setRangeFill(age); commit(); });
};

// ---------- body ----------
const CAP_PREVIEW = ['ballHandle', 'threePoint', 'drivingDunk', 'speed', 'block', 'strength', 'standingDunk', 'perimeterDefense'];
const capPreviewHTML = () => `<div class="opts" id="capPreview">${CAP_PREVIEW.map(k => `<span class="chip alt">${esc(D.ATTR_LABEL[k])} <b style="color:var(--neon)">${state.d.caps[k]}</b></span>`).join('')}</div>`;
const swatches = (id, entries, cur, round = true) => `<div class="swatches" data-swatch="${id}">${entries.map(([name, hex]) =>
  `<button class="swatch${name === cur ? ' on' : ''}" style="background:${hex};${round ? '' : 'border-radius:8px'}" data-v="${esc(name)}" title="${esc(name)}" aria-label="${esc(name)}"></button>`).join('')}</div>`;
const optButtons = (id, list, cur, multi = false) => `<div class="opts" data-opt="${id}"${multi ? ' data-multi="1"' : ''}>${list.map(v =>
  `<button class="opt${(multi ? cur.includes(v) : v === cur) ? ' on' : ''}" data-v="${esc(v)}" aria-pressed="${multi ? cur.includes(v) : v === cur}">${esc(v)}</button>`).join('')}</div>`;

RENDER.body = () => {
  const { body, look } = state.build;
  const [wl, wh] = B.weightRange(body.height), [sl, sh] = B.wingRange(body.height);
  const cm = h => Math.round(h * 2.54);
  return `${head('Step 2', 'Body & Appearance')}
  <div class="card">
    <div class="card-title">Physical Profile</div>
    ${slider({ id: 'b-height', label: 'Height', min: D.HEIGHT_MIN, max: D.HEIGHT_MAX, value: body.height, display: `${D.fmtHeight(body.height)}<small>${cm(body.height)} cm</small>`, scale: [`5'7"`, `7'7"`] })}
    ${slider({ id: 'b-weight', label: 'Weight', min: wl, max: wh, value: body.weight, display: `${body.weight}<small>lbs</small>`, scale: [wl, wh] })}
    ${slider({ id: 'b-wing', label: 'Wingspan', min: sl, max: sh, value: body.wingspan, display: `${D.fmtHeight(body.wingspan)}<small>${body.wingspan - body.height >= 0 ? '+' : ''}${body.wingspan - body.height}"</small>`, scale: [D.fmtHeight(sl), D.fmtHeight(sh)] })}
    <div class="field" style="margin-top:6px"><span class="lbl">Body Type</span>${optButtons('bodyType', Object.keys(D.BODY_TYPES), body.bodyType)}</div>
  </div>
  <div class="card">
    <div class="card-title">Rating Caps At This Size</div>
    ${capPreviewHTML()}
    <p class="note" style="margin:10px 0 0">Height, weight, wingspan and body type set the max for every rating. Taller = better finishing &amp; defense inside, worse handles &amp; speed.</p>
  </div>
  <div class="card">
    <div class="card-title">Skin Tone</div>
    ${swatches('skin', D.SKIN_TONES.map(h => [h, h]), look.skin)}
  </div>
  <div class="card">
    <div class="card-title">Hair</div>
    ${optButtons('hair', D.HAIR_STYLES, look.hair)}
    <div class="lbl" style="margin:14px 0 8px">Hair Color</div>
    ${swatches('hairColor', Object.entries(D.HAIR_COLORS), look.hairColor)}
  </div>
  <div class="card">
    <div class="card-title">Facial Hair</div>
    ${optButtons('facialHair', D.FACIAL_HAIR, look.facialHair)}
  </div>
  <div class="card">
    <div class="card-title">Eye Color <span class="val" id="eyeLbl">${esc(look.eyeColor)}</span></div>
    ${swatches('eyeColor', Object.entries(D.EYE_COLORS), look.eyeColor)}
  </div>
  <div class="card">
    <div class="card-title">Tattoos <span class="val">${look.tattoos.length}</span></div>
    ${optButtons('tattoos', D.TATTOO_SPOTS, look.tattoos, true)}
  </div>
  <div class="card">
    <div class="card-title">Jersey <span class="val">${esc(look.jersey)}</span></div>
    ${swatches('jersey', Object.entries(D.JERSEY_COLORS), look.jersey, false)}
    <div class="lbl" style="margin:14px 0 8px">Shoes · ${esc(look.shoes)}</div>
    ${swatches('shoes', Object.entries(D.SHOE_COLORS), look.shoes, false)}
  </div>`;
};
AFTER.body = p => {
  const { body, look } = state.build;
  const h = $('#b-height', p), w = $('#b-weight', p), s = $('#b-wing', p);
  [h, w, s].forEach(el => setRangeFill(el));
  const syncPhys = () => {
    const [wl, wh] = B.weightRange(body.height), [sl, sh] = B.wingRange(body.height);
    w.min = wl; w.max = wh; w.value = body.weight;
    s.min = sl; s.max = sh; s.value = body.wingspan;
    w.nextElementSibling.innerHTML = `<span>${wl}</span><span>${wh}</span>`;
    s.nextElementSibling.innerHTML = `<span>${D.fmtHeight(sl)}</span><span>${D.fmtHeight(sh)}</span>`;
    $('#b-height-val').innerHTML = `${D.fmtHeight(body.height)}<small>${Math.round(body.height * 2.54)} cm</small>`;
    $('#b-weight-val').innerHTML = `${body.weight}<small>lbs</small>`;
    const diff = body.wingspan - body.height;
    $('#b-wing-val').innerHTML = `${D.fmtHeight(body.wingspan)}<small>${diff >= 0 ? '+' : ''}${diff}"</small>`;
    [h, w, s].forEach(el => setRangeFill(el));
    $('#capPreview').outerHTML = capPreviewHTML();
  };
  h.addEventListener('input', () => {
    const delta = +h.value - body.height;
    body.height = +h.value;
    body.weight += Math.round(delta * 5.2);
    body.wingspan += delta;
    commit({ model: true });
    syncPhys();
  });
  w.addEventListener('input', () => { body.weight = +w.value; commit({ model: true }); syncPhys(); });
  s.addEventListener('input', () => { body.wingspan = +s.value; commit({ model: true }); syncPhys(); });

  p.addEventListener('click', e => {
    const sw = e.target.closest('[data-swatch] .swatch');
    const op = e.target.closest('[data-opt] .opt');
    if (sw) {
      const key = sw.parentElement.dataset.swatch;
      look[key] = sw.dataset.v;
      $$('.swatch', sw.parentElement).forEach(x => x.classList.toggle('on', x === sw));
      if (key === 'eyeColor') { $('#eyeLbl').textContent = look.eyeColor; stage?.setView('face'); syncViewSeg(); }
      if (key === 'jersey' || key === 'shoes') renderPanelKeepScroll();
      commit({ model: true });
    } else if (op) {
      const group = op.parentElement, key = group.dataset.opt, v = op.dataset.v;
      if (group.dataset.multi) {
        const set = new Set(look.tattoos);
        set.has(v) ? set.delete(v) : set.add(v);
        look.tattoos = D.TATTOO_SPOTS.filter(t => set.has(t));
        op.classList.toggle('on'); op.setAttribute('aria-pressed', op.classList.contains('on'));
        group.previousElementSibling.querySelector('.val').textContent = look.tattoos.length;
      } else {
        if (key === 'bodyType') body.bodyType = v; else look[key] = v;
        $$('.opt', group).forEach(x => { x.classList.toggle('on', x === op); x.setAttribute('aria-pressed', x === op); });
        if (key === 'facialHair' || key === 'hair') { stage?.setView('upper'); syncViewSeg(); }
      }
      commit({ model: true });
      if (key === 'bodyType') syncPhys();
    }
  });
};
function renderPanelKeepScroll() {
  const p = $('#panel'), y = p.scrollTop, wy = window.scrollY;
  renderPanel();
  p.scrollTop = y; window.scrollTo(0, wy);
  $('.panel-fade', p)?.classList.remove('panel-fade');
}

// ---------- position ----------
RENDER.position = () => {
  const b = state.build, pos = D.POSITIONS[b.position];
  const ovrAt = k => B.overall({ ...b, position: k });
  const outOfRange = b.body.height < pos.range[0] || b.body.height > pos.range[1];
  const top = Object.entries(pos.weights).sort((x, y) => y[1] - x[1]).slice(0, 8);
  return `${head('Step 3', 'Position')}
  <div class="pos-grid">${D.POSITION_KEYS.map(k => `
    <button class="pos-btn${k === b.position ? ' on' : ''}" data-pos="${k}" aria-pressed="${k === b.position}">
      <b>${k}</b><span>${D.POSITIONS[k].name}</span><span style="color:var(--neon);font-weight:700">${ovrAt(k)} OVR</span>
    </button>`).join('')}</div>
  <div class="card">
    <div class="card-title">${pos.name} <span class="val">${D.fmtHeight(pos.range[0])} – ${D.fmtHeight(pos.range[1])}</span></div>
    <p class="note" style="margin:0">${pos.blurb}</p>
    ${outOfRange ? `<p class="note warn" style="margin:10px 0 0">Heads up: ${D.fmtHeight(b.body.height)} is unusual for a ${pos.short}. Typical is ${D.fmtHeight(pos.typical)}. You can still build it.</p>` : ''}
    <div class="key-list">${pos.keys.map(k => `<span class="chip">${esc(D.ATTR_LABEL[k])}</span>`).join('')}</div>
  </div>
  <div class="card">
    <div class="card-title">What Drives Your Overall</div>
    ${top.map(([k, w]) => `<div style="display:grid;grid-template-columns:1fr 140px 32px;gap:10px;align-items:center;margin-bottom:8px">
      <span style="font-weight:600;font-size:14px">${esc(D.ATTR_LABEL[k])}</span>
      <span class="cmp-bar"><i style="left:0;width:${(w / 3) * 100}%;background:var(--neon)"></i></span>
      <span style="font-family:var(--cond);font-weight:800;text-align:right">${b.attrs[k]}</span></div>`).join('')}
    <p class="note" style="margin:6px 0 0">Each button shows what your current ratings would be worth at that position.</p>
  </div>`;
};
AFTER.position = p => {
  p.addEventListener('click', e => {
    const btn = e.target.closest('[data-pos]');
    if (!btn) return;
    state.build.position = btn.dataset.pos;
    commit({ panel: true });
  });
};

// ---------- attributes ----------
RENDER.attributes = () => {
  const { build: b, d } = state;
  return `
  <div class="budget">
    <div class="budget-top">
      <span class="lbl">Build Points</span>
      <span class="budget-num" id="budgetNum">${d.budget - d.spent}<small> / ${d.budget} left</small></span>
    </div>
    <div class="budget-bar"><div class="budget-fill${d.spent >= d.budget ? ' full' : ''}" id="budgetFill" style="width:${(d.spent / d.budget) * 100}%"></div></div>
    <div class="budget-actions">
      <button class="btn sm" data-attr-action="auto">Auto-Spend</button>
      <button class="btn sm" data-attr-action="max-pos">Prioritize ${esc(b.position)}</button>
      <button class="btn sm danger" data-attr-action="min">Clear All</button>
    </div>
  </div>
  ${head('Step 4', 'Attributes', `<span class="chip" id="capNote">Caps from ${D.fmtHeight(b.body.height)}</span>`)}
  ${D.ATTR_GROUPS.map(g => `
    <div class="group">
      <div class="group-head"><span class="group-name">${g.label}</span><span class="group-avg" id="avg-${g.id}">${d.groups[g.id]}</span></div>
      ${g.attrs.map(a => {
        const v = b.attrs[a.key], cap = d.caps[a.key];
        return `<div class="attr${v >= cap ? ' capped' : ''}" data-key="${a.key}">
          <div class="attr-name">${a.label}<span class="attr-cap">MAX ${cap}</span></div>
          <div class="attr-ctrl">
            <button class="step" data-step="-1" aria-label="Decrease ${a.label}">−</button>
            <input type="range" class="range" min="${D.ATTR_MIN}" max="${D.ATTR_MAX}" value="${v}" aria-label="${a.label}">
            <button class="step" data-step="1" aria-label="Increase ${a.label}">+</button>
          </div>
          <div class="attr-val ${ratingClass(v)}">${v}</div>
        </div>`;
      }).join('')}
    </div>`).join('')}`;
};
function updateAttrRow(row) {
  const { build: b, d } = state;
  const k = row.dataset.key, v = b.attrs[k];
  const r = $('.range', row);
  r.value = v;
  setRangeFill(r, ((d.caps[k] - D.ATTR_MIN) / (D.ATTR_MAX - D.ATTR_MIN)) * 100);
  const val = $('.attr-val', row);
  val.textContent = v; val.className = 'attr-val ' + ratingClass(v);
  row.classList.toggle('capped', v >= d.caps[k]);
}
function updateAttrSummary() {
  const d = state.d;
  $('#budgetNum').innerHTML = `${d.budget - d.spent}<small> / ${d.budget} left</small>`;
  const f = $('#budgetFill'); f.style.width = (d.spent / d.budget) * 100 + '%'; f.classList.toggle('full', d.spent >= d.budget);
  for (const g of D.ATTR_GROUPS) $('#avg-' + g.id).textContent = d.groups[g.id];
}
function setAttr(key, want) {
  const b = state.build;
  const max = B.maxAffordable(b, key, state.d.caps);
  const v = clamp(Math.round(want), D.ATTR_MIN, max);
  const hitBudget = want > max && max < state.d.caps[key];
  if (v === b.attrs[key]) return { changed: false, hitBudget };
  b.attrs[key] = v;
  commit();
  return { changed: true, hitBudget };
}
let budgetToastAt = 0;
AFTER.attributes = p => {
  $$('.attr', p).forEach(updateAttrRow);
  p.addEventListener('input', e => {
    const r = e.target.closest('.attr .range');
    if (!r) return;
    const row = r.closest('.attr');
    const { hitBudget } = setAttr(row.dataset.key, +r.value);
    updateAttrRow(row); updateAttrSummary();
    if (hitBudget && Date.now() - budgetToastAt > 2500) { budgetToastAt = Date.now(); toast('Out of build points. Lower another rating first.'); }
  });
  let hold = 0, holdDelay = 0;
  const stepOnce = btn => {
    const row = btn.closest('.attr');
    const { hitBudget } = setAttr(row.dataset.key, state.build.attrs[row.dataset.key] + +btn.dataset.step);
    updateAttrRow(row); updateAttrSummary();
    if (hitBudget && Date.now() - budgetToastAt > 2500) { budgetToastAt = Date.now(); toast('Out of build points.'); }
  };
  const stopHold = () => { clearTimeout(holdDelay); clearInterval(hold); };
  p.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.step');
    if (!btn) return;
    e.preventDefault();
    stepOnce(btn);
    holdDelay = setTimeout(() => { hold = setInterval(() => stepOnce(btn), 55); }, 350);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => p.addEventListener(t, stopHold));
  p.addEventListener('keydown', e => { const btn = e.target.closest('.step'); if (btn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); stepOnce(btn); } });
  p.addEventListener('click', e => {
    const a = e.target.closest('[data-attr-action]');
    if (!a) return;
    const b = state.build, caps = state.d.caps, wts = D.POSITIONS[b.position].weights;
    if (a.dataset.attrAction === 'min') { for (const k of D.ATTR_KEYS) b.attrs[k] = D.ATTR_MIN; }
    if (a.dataset.attrAction === 'max-pos') { for (const k of D.ATTR_KEYS) b.attrs[k] = D.ATTR_MIN; }
    if (a.dataset.attrAction === 'auto' || a.dataset.attrAction === 'max-pos') {
      // greedy: spend leftover points on the best OVR value per point for this position
      for (let guard = 0; guard < 5000; guard++) {
        let best = null, bv = 0;
        const spent = B.totalCost(b.attrs);
        for (const k of D.ATTR_KEYS) {
          if (b.attrs[k] >= caps[k]) continue;
          const dc = B.COST[b.attrs[k] + 1] - B.COST[b.attrs[k]];
          if (spent + dc > D.BUILD_BUDGET) continue;
          const val = (wts[k] ** 2 + 0.15) / dc;
          if (val > bv) { bv = val; best = k; }
        }
        if (!best) break;
        b.attrs[best]++;
      }
    }
    commit({ panel: true });
    toast(a.dataset.attrAction === 'min' ? 'All ratings cleared to 25.' : 'Points spent for max overall.');
  });
};

// ---------- badges ----------
const TIER_COLORS = ['var(--bronze)', 'var(--silver)', 'var(--gold)', 'var(--hof)', 'var(--legend)'];
const CAT_GLYPH = { finishing: 'F', shooting: 'S', playmaking: 'P', defense: 'D', rebounding: 'R', physicals: 'G' };
function badgeIcon(cat, tier) {
  const c = tier >= 0 ? TIER_COLORS[tier] : '#2d2d31';
  return `<svg class="badge-icon" viewBox="0 0 52 58" aria-hidden="true">
    <path d="M26 2l22 8v18c0 13-9 23-22 28C13 51 4 41 4 28V10z" fill="${c}" stroke="rgba(255,255,255,.25)" stroke-width="1.5"/>
    <path d="M26 8l16 6v14c0 10-7 18-16 22-9-4-16-12-16-22V14z" fill="rgba(0,0,0,.28)"/>
    <text x="26" y="36" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="900" font-size="22" fill="${tier >= 0 ? '#fff' : '#555'}">${CAT_GLYPH[cat]}</text>
  </svg>`;
}
RENDER.badges = () => {
  const { build: b, d } = state;
  const f = state.badgeFilter;
  const list = D.BADGES.map(bd => ({ bd, max: B.badgeMaxTier(bd, b), eq: b.badges[bd.id] }))
    .filter(x => f === 'all' || (f === 'equipped' ? x.eq != null : f === 'unlocked' ? x.max >= 0 : x.bd.cat === f))
    .sort((x, y) => (y.eq ?? -1) - (x.eq ?? -1) || y.max - x.max);
  const unlocked = D.BADGES.filter(bd => B.badgeMaxTier(bd, b) >= 0).length;
  const filters = [['all', 'All'], ['equipped', 'Equipped'], ['unlocked', 'Unlocked'], ...D.BADGE_CATEGORIES.map(c => [c.id, c.label])];
  return `${head('Step 5', 'Badges', `<span class="chip">${unlocked}/${D.BADGES.length} unlocked</span>`)}
  <div class="card">
    <div class="card-title">Badge Points <span class="val">${d.badgeSpent} / ${d.badgeBudget}</span></div>
    <div class="budget-bar"><div class="budget-fill${d.badgeSpent >= d.badgeBudget ? ' full' : ''}" style="width:${(d.badgeSpent / d.badgeBudget) * 100}%"></div></div>
    <p class="note" style="margin:10px 0 12px">Badges unlock from your ratings. Each tier costs a point (Bronze 1 → Legend 5). Higher overall = more badge points.</p>
    <div class="budget-actions" style="margin:0">
      <button class="btn sm" data-badge-action="auto">Auto-Equip Best</button>
      <button class="btn sm danger" data-badge-action="clear">Unequip All</button>
    </div>
  </div>
  <div class="filter-row">${filters.map(([id, l]) => `<button class="opt${f === id ? ' on' : ''}" data-filter="${id}">${l}</button>`).join('')}</div>
  <div class="badge-list">${list.length ? list.map(({ bd, max, eq }) => {
    const next = max < 4 ? B.badgeReqFor(bd, max + 1) : null;
    const reqTxt = next ? `${max < 0 ? 'Unlock' : 'Next: ' + D.BADGE_TIERS[max + 1]} — ${next.map(([k, v]) => `<b>${esc(D.ATTR_LABEL[k])} ${v}</b>`).join(', ')}${bd.maxH && b.body.height > bd.maxH ? ` · max height ${D.fmtHeight(bd.maxH)}` : ''}` : '<b style="color:var(--legend)">Maxed at Legend</b>';
    return `<div class="badge${max < 0 ? ' locked' : ''}${eq != null ? ' equipped' : ''}" data-badge="${bd.id}">
      ${badgeIcon(bd.cat, eq ?? -1)}
      <div>
        <div class="badge-name">${esc(bd.name)}</div>
        <div class="badge-desc">${esc(bd.desc)}</div>
        <div class="badge-req">${reqTxt}</div>
        <div class="tiers">${D.BADGE_TIERS.map((t, i) => `<button class="tier t${i}${eq === i ? ' on' : ''}" data-tier="${i}" ${i > max ? 'disabled' : ''} title="${t} (${i + 1} pt)">${t === 'Hall of Fame' ? 'HOF' : t}</button>`).join('')}</div>
      </div>
    </div>`;
  }).join('') : '<div class="empty"><b>No badges here</b>Raise your ratings to unlock more.</div>'}</div>`;
};
AFTER.badges = p => {
  p.addEventListener('click', e => {
    const fb = e.target.closest('[data-filter]');
    if (fb) { state.badgeFilter = fb.dataset.filter; renderPanelKeepScroll(); return; }
    const act = e.target.closest('[data-badge-action]');
    if (act) {
      if (act.dataset.badgeAction === 'auto') { B.autoEquipBadges(state.build, state.d.ovr); toast('Best badges equipped.'); }
      else { state.build.badges = {}; toast('All badges unequipped.'); }
      commit(); renderPanelKeepScroll(); return;
    }
    const tb = e.target.closest('.tier');
    if (!tb || tb.disabled) return;
    const id = tb.closest('[data-badge]').dataset.badge, tier = +tb.dataset.tier;
    const badges = state.build.badges;
    if (badges[id] === tier) delete badges[id];
    else {
      const cur = badges[id] != null ? B.badgeCost(badges[id]) : 0;
      if (state.d.badgeSpent - cur + B.badgeCost(tier) > state.d.badgeBudget) { toast('Not enough badge points. Unequip something or raise your overall.'); return; }
      badges[id] = tier;
    }
    commit(); renderPanelKeepScroll();
  });
};

// ---------- animations ----------
const lockSvg = '<svg class="lock-ico" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
function reqText(item) {
  const r = item.req || {}, parts = Object.entries(r.attrs || {}).map(([k, v]) => `${D.ATTR_LABEL[k]} ${v}`);
  if (r.minH) parts.push(`${D.fmtHeight(r.minH)}+`);
  if (r.maxH) parts.push(`≤ ${D.fmtHeight(r.maxH)}`);
  return parts.join(' · ');
}
RENDER.animations = () => {
  const b = state.build;
  return `${head('Step 6', 'Animations')}
  <p class="note" style="margin:-4px 0 16px">Pick a package and it plays on your player. Locked packages show what ratings or height they need.</p>
  ${D.ANIM_KEYS.map(key => {
    const def = D.ANIMATIONS[key];
    const sel = def.multi ? b.anims[key] : [b.anims[key]];
    return `<div class="anim-section">
      <div class="card-title" style="margin-bottom:8px">${def.label}${def.multi ? ` <span class="val">${sel.length}/${def.multi}</span>` : ''}
        <button class="btn sm" data-preview="${key}" style="margin-left:auto">▶ Preview</button></div>
      <div class="anim-list">${def.items.map(it => {
        const ok = B.animUnlocked(it, b), on = sel.includes(it.id), req = reqText(it);
        return `<button class="anim${on ? ' on' : ''}${ok ? '' : ' locked'}" data-anim="${key}" data-id="${it.id}" aria-pressed="${on}" ${ok ? '' : 'aria-disabled="true"'}>
          <span><div class="anim-name">${esc(it.name)}</div><div class="anim-desc">${esc(it.desc)}</div>${req ? `<div class="anim-req" style="${ok ? 'color:var(--dim)' : ''}">${ok ? 'Req met: ' : 'Requires '}${esc(req)}</div>` : ''}</span>
          ${ok ? '<span class="anim-check"></span>' : lockSvg}
        </button>`;
      }).join('')}</div>
    </div>`;
  }).join('')}`;
};
AFTER.animations = p => {
  p.addEventListener('click', e => {
    const pv = e.target.closest('[data-preview]');
    if (pv) { previewAnim(pv.dataset.preview); return; }
    const btn = e.target.closest('[data-anim]');
    if (!btn) return;
    const key = btn.dataset.anim, id = btn.dataset.id, def = D.ANIMATIONS[key];
    const it = def.items.find(i => i.id === id);
    if (!B.animUnlocked(it, state.build)) { toast(`Locked — requires ${reqText(it)}`); return; }
    if (def.multi) {
      const cur = state.build.anims[key];
      if (cur.includes(id)) state.build.anims[key] = cur.filter(x => x !== id);
      else if (cur.length >= def.multi) { toast(`You can equip up to ${def.multi} dunk packages.`); return; }
      else state.build.anims[key] = [id, ...cur];
    } else state.build.anims[key] = id;
    commit(); renderPanelKeepScroll();
    if (!def.multi || state.build.anims[key].includes(id)) stage?.play(def.clip, it.preview);
    highlightClip(def.clip);
  });
};
function previewAnim(key) {
  const def = D.ANIMATIONS[key];
  if (def.multi && !state.build.anims[key].length) { stage?.play(def.clip, { jump: 0.6, power: 0.7 }); highlightClip(def.clip); return; }
  const { clip, params } = animPreviewParams(state.build, key);
  stage?.play(clip, params);
  highlightClip(clip);
}

// ---------- builds ----------
const fmtDate = t => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
RENDER.builds = () => {
  const cur = state.build;
  const list = [...state.saved].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return `${head('Saved', 'My Builds', `<span class="chip">${list.length} saved</span>`)}
  <div class="card">
    <div class="card-title">Current Build</div>
    <p class="note" style="margin:0 0 12px">${cur.id && state.saved.some(s => s.id === cur.id) ? 'Editing a saved build. <b>Save</b> overwrites it; <b>Save as New</b> makes a copy.' : 'This build isn’t saved yet.'}</p>
    <div class="budget-actions" style="margin:0">
      <button class="btn sm primary" data-b-action="save">Save</button>
      <button class="btn sm" data-b-action="saveNew">Save as New</button>
      <button class="btn sm" data-b-action="share">Copy Share Link</button>
    </div>
  </div>
  <div class="card">
    <div class="card-title">Import a Build</div>
    <div style="display:flex;gap:8px"><input class="input" id="importCode" placeholder="Paste a share link" autocomplete="off"><button class="btn sm" data-b-action="import" style="height:44px">Load</button></div>
  </div>
  <div class="build-list">${list.length ? list.map(s => {
    const d = B.derive(B.clone(s));
    return `<div class="build${s.id === cur.id ? ' current' : ''}" data-id="${esc(s.id)}">
      <div class="build-ovr"><b>${d.ovr}</b><span>OVR</span></div>
      <div><div class="build-name">${esc(fullName(s))}</div>
        <div class="build-meta">${esc(s.position)} · ${D.fmtHeight(s.body.height)} · ${esc(d.arch.name)}</div>
        <div class="build-meta">Saved ${esc(fmtDate(s.savedAt))}</div></div>
      <div class="build-actions">
        <button class="btn sm primary" data-b-action="load">Load</button>
        <button class="btn sm" data-b-action="dup">Duplicate</button>
        <button class="btn sm" data-b-action="cmp">Compare</button>
        <button class="btn sm" data-b-action="shareSaved">Share</button>
        <button class="btn sm danger" data-b-action="del">Delete</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty"><b>No saved builds yet</b>Hit Save to keep this player. Saved builds live in this browser.</div>'}</div>`;
};
AFTER.builds = p => {
  p.addEventListener('click', async e => {
    const btn = e.target.closest('[data-b-action]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id;
    const saved = state.saved.find(s => s.id === id);
    switch (btn.dataset.bAction) {
      case 'save': saveBuild(false); break;
      case 'saveNew': saveBuild(true); break;
      case 'share': shareBuild(state.build); break;
      case 'shareSaved': shareBuild(saved); break;
      case 'import': importFrom($('#importCode').value); break;
      case 'load': setBuild(B.sanitizeBuild(B.clone(saved)), { toastMsg: `Loaded ${fullName(saved)}` }); state.tab = 'builds'; renderPanel(); break;
      case 'dup': {
        const copy = B.clone(saved); copy.id = B.uid(); copy.savedAt = Date.now(); copy.identity.last = (copy.identity.last + ' II').slice(0, 20);
        state.saved.push(copy); persistSaved(); renderPanel(); toast('Build duplicated.'); break;
      }
      case 'cmp': state.cmpA = 'current'; state.cmpB = id; setTab('compare'); break;
      case 'del':
        if (await confirmModal('Delete build?', `${fullName(saved)} will be removed from this browser.`, 'Delete')) {
          state.saved = state.saved.filter(s => s.id !== id);
          if (state.cmpB === id) state.cmpB = null;
          if (state.cmpA === id) state.cmpA = 'current';
          persistSaved(); renderPanel(); toast('Build deleted.');
        }
        break;
    }
  });
};
function persistSaved() {
  if (!store.set(K_BUILDS, state.saved)) toast('Could not save: browser storage is unavailable.');
}
function saveBuild(asNew) {
  const b = state.build;
  const existing = !asNew && b.id && state.saved.findIndex(s => s.id === b.id);
  if (asNew || !b.id || existing === -1 || existing === false) b.id = B.uid();
  b.savedAt = Date.now();
  const copy = B.clone(b);
  const idx = state.saved.findIndex(s => s.id === b.id);
  if (idx >= 0) state.saved[idx] = copy; else state.saved.push(copy);
  if (state.saved.length > 60) state.saved.sort((x, y) => (y.savedAt || 0) - (x.savedAt || 0)).length = 60;
  persistSaved();
  saveCurrentSoon();
  toast(idx >= 0 ? `Updated ${fullName(b)}` : `Saved ${fullName(b)}`);
  if (state.tab === 'builds' || state.tab === 'compare') renderPanel();
}
function shareUrl(build) {
  return `${location.origin}${location.pathname}#b=${B.encodeBuild(build)}`;
}
async function shareBuild(build) {
  const url = shareUrl(build);
  try {
    await navigator.clipboard.writeText(url);
    toast('Share link copied to clipboard.');
  } catch {
    const m = $('#modal');
    m.innerHTML = `<h3>Share Build</h3><p>Copy this link and send it to anyone:</p><input class="input" readonly style="margin-bottom:14px"><div class="modal-actions"><button class="btn primary" value="ok">Done</button></div>`;
    const inp = $('input', m); inp.value = url;
    m.onclick = null; m.oncancel = null;
    $('button', m).onclick = () => m.close();
    m.showModal(); inp.select();
  }
}
function importFrom(text) {
  const m = String(text || '').match(/#b=([A-Za-z0-9_-]+)/) || String(text || '').trim().match(/^([A-Za-z0-9_-]{20,})$/);
  if (!m) { toast('That doesn’t look like a share link.'); return; }
  try {
    const b = B.decodeBuild(m[1]);
    b.id = null;
    setBuild(b, { toastMsg: `Imported ${fullName(b)}` });
  } catch { toast('Could not read that build link.'); }
}

// ---------- compare ----------
const CMP_COLORS = { a: '#e11d2e', b: '#3ab0ff' };
function cmpOptions() {
  const opts = [{ id: 'current', label: `Current: ${fullName(state.build)}`, build: state.build }];
  for (const s of [...state.saved].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))) opts.push({ id: s.id, label: `${fullName(s)} (${s.position})`, build: s });
  if (state.rival) opts.push({ id: 'rival', label: `Rival: ${fullName(state.rival)}`, build: state.rival });
  return opts;
}
function radarSVG(a, b) {
  const cats = D.ATTR_GROUPS.map(g => g.id), N = cats.length, R = 110, cx = 150, cy = 140;
  const pt = (i, v) => { const ang = -Math.PI / 2 + (i / N) * Math.PI * 2, r = ((v - 25) / 74) * R; return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]; };
  const poly = (g, col) => `<polygon points="${cats.map((c, i) => pt(i, g[c]).join(',')).join(' ')}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/>`;
  const rings = [50, 75, 99].map(v => `<polygon points="${cats.map((c, i) => pt(i, v).join(',')).join(' ')}" fill="none" stroke="#2d2d31" stroke-width="1"/>`).join('');
  const spokes = cats.map((c, i) => { const [x, y] = pt(i, 99); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#2d2d31"/>`; }).join('');
  const labels = cats.map((c, i) => { const [x, y] = pt(i, 116); return `<text x="${x}" y="${y}" fill="#9a9aa0" font-size="11" font-family="Barlow Condensed" font-weight="700" letter-spacing="1" text-anchor="middle" dominant-baseline="middle">${D.ATTR_GROUPS[i].label.toUpperCase()}</text>`; }).join('');
  return `<svg class="radar" viewBox="0 0 300 280" role="img" aria-label="Category comparison radar">${rings}${spokes}${poly(a, CMP_COLORS.a)}${poly(b, CMP_COLORS.b)}${labels}</svg>`;
}
RENDER.compare = () => {
  const opts = cmpOptions();
  if (opts.length < 2) {
    return `${head('Head to Head', 'Compare Builds')}
    <div class="empty"><b>Need a second build</b>Save a few builds, or compare against a random rival.<br><br>
      <button class="btn primary" data-cmp-action="rival">Generate Rival</button></div>`;
  }
  if (!opts.some(o => o.id === state.cmpA)) state.cmpA = 'current';
  if (!state.cmpB || !opts.some(o => o.id === state.cmpB) || state.cmpB === state.cmpA) {
    const notSelf = o => o.id !== state.cmpA && !(state.cmpA === 'current' && o.id === state.build.id);
    state.cmpB = (opts.find(notSelf) || opts.find(o => o.id !== state.cmpA)).id;
  }
  const A = opts.find(o => o.id === state.cmpA), Bo = opts.find(o => o.id === state.cmpB);
  const a = B.clone(A.build), b = B.clone(Bo.build);
  const da = B.derive(a), db = B.derive(b);
  const sel = (name, cur) => `<select class="select" data-cmp="${name}">${opts.map(o => `<option value="${esc(o.id)}"${o.id === cur ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  const headCard = (x, dx, col) => `<div class="cmp-head" style="--a:${col}"><div class="o">${dx.ovr}</div><div class="n">${esc(fullName(x))}</div>
    <div class="m">${esc(x.position)} · ${D.fmtHeight(x.body.height)} · ${x.body.weight} lbs · WS ${D.fmtHeight(x.body.wingspan)}</div>
    <div class="m" style="color:var(--text)">${esc(dx.arch.name)}</div><div class="m">${Object.keys(x.badges).length} badges equipped</div></div>`;
  const cell = (v, o) => `<td class="n ${v > o ? 'win' : v < o ? 'lose' : ''}">${v}</td>`;
  return `${head('Head to Head', 'Compare Builds')}
  <div class="cmp-pick">${sel('a', state.cmpA)}<span class="vs">VS</span>${sel('b', state.cmpB)}</div>
  <div class="cmp-heads">${headCard(a, da, CMP_COLORS.a)}${headCard(b, db, CMP_COLORS.b)}</div>
  <div class="card">${radarSVG(da.groups, db.groups)}
    <div style="display:flex;gap:16px;justify-content:center;font-size:13px;color:var(--muted)">
      <span><b style="color:${CMP_COLORS.a}">■</b> ${esc(fullName(a))}</span><span><b style="color:${CMP_COLORS.b}">■</b> ${esc(fullName(b))}</span></div></div>
  <div class="card" style="padding:4px 12px 12px">
    <table class="cmp-table">${D.ATTR_GROUPS.map(g => `
      <tr><th colspan="2">${g.label}</th><th></th></tr>
      ${g.attrs.map(at => {
        const va = a.attrs[at.key], vb = b.attrs[at.key];
        return `<tr>${cell(va, vb)}<td><div style="font-size:13px;margin-bottom:4px">${at.label}</div>
          <div class="cmp-bar"><i style="left:0;width:${(va / 99) * 100}%;background:${CMP_COLORS.a}"></i></div>
          <div class="cmp-bar" style="margin-top:3px"><i style="left:0;width:${(vb / 99) * 100}%;background:${CMP_COLORS.b}"></i></div></td>${cell(vb, va)}</tr>`;
      }).join('')}`).join('')}
    </table>
  </div>
  <div class="budget-actions"><button class="btn sm" data-cmp-action="rival">New Random Rival</button><button class="btn sm" data-cmp-action="swap">Swap Sides</button></div>`;
};
AFTER.compare = p => {
  p.addEventListener('change', e => {
    const s = e.target.closest('[data-cmp]');
    if (!s) return;
    if (s.dataset.cmp === 'a') state.cmpA = s.value; else state.cmpB = s.value;
    if (state.cmpA === state.cmpB) { const other = cmpOptions().find(o => o.id !== s.value); if (s.dataset.cmp === 'a') state.cmpB = other.id; else state.cmpA = other.id; }
    renderPanelKeepScroll();
  });
  p.addEventListener('click', e => {
    const a = e.target.closest('[data-cmp-action]');
    if (!a) return;
    if (a.dataset.cmpAction === 'rival') { state.rival = B.randomBuild(); state.cmpB = 'rival'; if (state.cmpA === 'rival') state.cmpA = 'current'; }
    if (a.dataset.cmpAction === 'swap') [state.cmpA, state.cmpB] = [state.cmpB, state.cmpA];
    renderPanelKeepScroll();
  });
};

// ---------- toast / modal ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function confirmModal(title, text, okLabel = 'OK') {
  const m = $('#modal');
  m.innerHTML = `<h3></h3><p></p><div class="modal-actions"><button class="btn" data-v="0">Cancel</button><button class="btn primary" data-v="1"></button></div>`;
  $('h3', m).textContent = title; $('p', m).textContent = text; $('[data-v="1"]', m).textContent = okLabel;
  return new Promise(res => {
    const done = v => { m.close(); res(v); };
    m.onclick = e => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); else if (e.target === m) done(false); };
    m.oncancel = () => res(false);
    m.showModal();
    $('[data-v="1"]', m).focus();
  });
}

// ---------- stage controls ----------
function syncViewSeg() { $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === stage?.view)); }
function highlightClip(clip) {
  $$('#animBar button').forEach(b => b.classList.toggle('on', b.dataset.clip === clip));
}
function buildAnimBar() {
  const bar = $('#animBar');
  const map = { jumpShot: 'jumpShot', freeThrow: 'freeThrow', dribble: 'dribble', sizeUp: 'sizeUp', layup: 'layup', dunk: 'dunks', pass: 'passing' };
  bar.innerHTML = Object.entries(CLIP_LABELS).map(([clip, label]) => `<button data-clip="${clip}" data-key="${map[clip]}">${label}</button>`).join('');
  let dunkIdx = 0;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const key = btn.dataset.key, def = D.ANIMATIONS[key];
    if (def.multi && state.build.anims[key].length > 1) {
      const ids = state.build.anims[key];
      const it = def.items.find(i => i.id === ids[dunkIdx++ % ids.length]);
      stage?.play(def.clip, it.preview);
      highlightClip(def.clip);
    } else previewAnim(key);
  });
  if (stage) stage.onClipEnd = () => highlightClip(null);
}

// ---------- boot ----------
function initStage() {
  try {
    stage = new PlayerStage($('#stageCanvas'));
    window.__stage = stage;
  } catch (err) {
    console.error(err);
    $('#stageCanvas').innerHTML = '<div class="stage-error">3D preview needs WebGL, which isn’t available in this browser.<br>Everything else still works.</div>';
  }
  $('#viewSeg').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b || !stage) return; stage.setView(b.dataset.view); syncViewSeg(); });
  $('#rotateBtn').addEventListener('click', e => {
    const btn = e.currentTarget; const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on)); stage?.setAutoRotate(on);
  });
}

function boot() {
  state.saved = (store.get(K_BUILDS, []) || []).filter(x => x && typeof x === 'object').map(x => { const s = B.sanitizeBuild(x); s.id = x.id || B.uid(); s.savedAt = x.savedAt; return s; });
  let build = null, sharedMsg = null;
  const m = location.hash.match(/#b=([A-Za-z0-9_-]+)/);
  if (m) {
    try { build = B.decodeBuild(m[1]); build.id = null; sharedMsg = `Loaded shared build: ${fullName(build)}`; }
    catch { sharedMsg = 'That share link is broken. Starting fresh.'; }
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (!build) { const cur = store.get(K_CURRENT, null); build = cur ? B.sanitizeBuild(cur) : B.defaultBuild(); if (cur?.id) build.id = cur.id; }
  state.build = build;
  state.d = B.derive(build);

  renderTabs();
  $('#tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) setTab(t.dataset.tab); });
  initStage();
  buildAnimBar();
  refreshHUD();
  renderPanel();
  stage?.setBuild(build);

  document.addEventListener('click', async e => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'random': {
        setBuild(B.randomBuild(), { toastMsg: 'Random player generated.' });
        const clips = ['dunk', 'jumpShot', 'sizeUp', 'layup'];
        const c = clips[Math.floor(Math.random() * clips.length)];
        setTimeout(() => {
          const key = { dunk: 'dunks', jumpShot: 'jumpShot', sizeUp: 'sizeUp', layup: 'layup' }[c];
          previewAnim(key);
        }, 150);
        break;
      }
      case 'reset':
        if (await confirmModal('Reset build?', 'This clears the current player back to a fresh rookie. Saved builds are not affected.', 'Reset')) setBuild(B.defaultBuild(), { toastMsg: 'Build reset.' });
        break;
      case 'save': saveBuild(false); break;
      case 'share': shareBuild(state.build); break;
      case 'play': clearTimeout(saveTimer); store.set(K_CURRENT, state.build); break;
    }
  });
  if (sharedMsg) toast(sharedMsg);
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#b=')) return;
    importFrom(location.hash);
    history.replaceState(null, '', location.pathname + location.search);
  });
}

boot();

// first visit (or ?intro): the trailer plays before character creation
(async () => {
  let seen = false;
  try { seen = localStorage.getItem('bl_intro_seen') === '1'; } catch { /* storage unavailable */ }
  if ((seen || location.hash.startsWith('#b=')) && !new URLSearchParams(location.search).has('intro')) return;
  const { playTrailer } = await import('./trailer.js');
  stage?.pause();
  await playTrailer({ quality: window.matchMedia('(pointer: coarse)').matches ? 'low' : 'medium' });
  try { localStorage.setItem('bl_intro_seen', '1'); } catch { /* storage unavailable */ }
  stage?.resume();
})();
