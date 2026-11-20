import {
  ATTR_GROUPS, ATTRS, ATTR_KEYS, ATTR_MIN, ATTR_MAX, CAP_RULES, HEIGHT_MIN, HEIGHT_MAX, BUILD_BUDGET,
  BODY_TYPES, POSITIONS, POSITION_KEYS, COUNTRIES, COLLEGES, SKIN_TONES, HAIR_STYLES, HAIR_COLORS,
  FACIAL_HAIR, EYE_COLORS, TATTOO_SPOTS, JERSEY_COLORS, SHOE_COLORS, FIRST_NAMES, LAST_NAMES, NICKNAMES,
  BADGES, BADGE_TIER_STEPS, ANIMATIONS, ANIM_KEYS,
} from './data.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---------- physicals ----------
export const idealWeight = h => 165 + (h - HEIGHT_MIN) * 5.2;
export function weightRange(h) {
  const i = idealWeight(h);
  return [Math.max(150, Math.round(i - 30)), Math.min(330, Math.round(i + 45))];
}
export const wingRange = h => [h - 2, h + 9];

export function clampBody(body) {
  body.height = clamp(Math.round(body.height), HEIGHT_MIN, HEIGHT_MAX);
  const [wl, wh] = weightRange(body.height);
  body.weight = clamp(Math.round(body.weight), wl, wh);
  const [sl, sh] = wingRange(body.height);
  body.wingspan = clamp(Math.round(body.wingspan), sl, sh);
  if (!BODY_TYPES[body.bodyType]) body.bodyType = 'Athletic';
  return body;
}

export function computeCaps(body) {
  const hN = (body.height - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN);
  const wsN = clamp((body.wingspan - body.height - 3.5) / 5.5, -1, 1);
  const wtN = clamp((body.weight - idealWeight(body.height)) / 35, -1, 1.3);
  const bt = BODY_TYPES[body.bodyType]?.caps || {};
  const caps = {};
  for (const k of ATTR_KEYS) {
    const [s, t, wing, wt] = CAP_RULES[k];
    // guard skills hold up until ~6'6" then drop; big-man skills climb early then flatten
    const curve = s > t ? hN ** 1.7 : 1 - (1 - hN) ** 1.4;
    caps[k] = Math.round(clamp(s + (t - s) * curve + wing * wsN + wt * wtN + (bt[k] || 0), 40, ATTR_MAX));
  }
  return caps;
}

// ---------- point costs ----------
const tierCost = v => (v <= 60 ? 1 : v <= 70 ? 2 : v <= 80 ? 3 : v <= 90 ? 4 : 5);
export const COST = (() => {
  const c = new Array(ATTR_MAX + 1).fill(0);
  for (let v = ATTR_MIN + 1; v <= ATTR_MAX; v++) c[v] = c[v - 1] + tierCost(v);
  return c;
})();
export const totalCost = attrs => ATTR_KEYS.reduce((s, k) => s + COST[attrs[k]], 0);

// highest value `key` can reach given caps and the remaining budget
export function maxAffordable(build, key, caps) {
  const spentElsewhere = totalCost(build.attrs) - COST[build.attrs[key]];
  let v = caps[key];
  while (v > ATTR_MIN && spentElsewhere + COST[v] > BUILD_BUDGET) v--;
  return Math.max(v, Math.min(build.attrs[key], caps[key]));
}

// ---------- ratings ----------
export function overall(build) {
  const wts = POSITIONS[build.position].weights;
  let s = 0, ws = 0;
  for (const k of ATTR_KEYS) {
    const w = wts[k] * wts[k];
    s += build.attrs[k] * w;
    ws += w;
  }
  const wavg = s / ws;
  return Math.round(clamp(99 - (99 - wavg) * 0.86, 40, 99));
}

export function groupAverages(attrs) {
  const out = {};
  for (const g of ATTR_GROUPS) out[g.id] = Math.round(g.attrs.reduce((s, a) => s + attrs[a.key], 0) / g.attrs.length);
  return out;
}

// average of the best half of a category so one weak attribute doesn't hide a strength
function categoryScore(attrs, group) {
  const vals = group.attrs.map(a => attrs[a.key]).sort((x, y) => y - x);
  const n = Math.max(2, Math.ceil(vals.length * 0.5));
  const top = vals.slice(0, n);
  return top.reduce((s, v) => s + v, 0) / top.length;
}

const ARCH = {
  finishing: { shooting: 'Slashing Shot Creator', playmaking: 'Slashing Playmaker', defense: 'Two-Way Slasher', rebounding: 'Glass-Cleaning Finisher' },
  shooting: { finishing: 'Sharpshooting Slasher', playmaking: 'Sharpshooting Playmaker', defense: 'Two-Way Sharpshooter', rebounding: 'Stretch Glass Cleaner' },
  playmaking: { finishing: 'Downhill Playmaker', shooting: 'Playmaking Shot Creator', defense: 'Two-Way Playmaker', rebounding: 'Point Forward' },
  defense: { finishing: 'Two-Way Finisher', shooting: '3-and-D Wing', playmaking: 'Lockdown Floor General', rebounding: 'Defensive Anchor' },
  rebounding: { finishing: 'Paint Beast', shooting: 'Stretch Rebounder', playmaking: 'Point Forward', defense: 'Glass-Cleaning Lockdown' },
};
const BIG_ARCH = {
  'shooting|defense': 'Stretch Rim Protector', 'shooting|rebounding': 'Stretch Glass Cleaner', 'shooting|finishing': 'Stretch Post Scorer',
  'finishing|rebounding': 'Paint Beast', 'finishing|defense': 'Two-Way Post Scorer', 'playmaking|rebounding': 'Point Center',
  'playmaking|finishing': 'Post Playmaker', 'defense|shooting': 'Stretch Rim Protector',
};
export const CATEGORY_LABEL = { finishing: 'Finishing', shooting: 'Shooting', playmaking: 'Playmaking', defense: 'Defense', rebounding: 'Rebounding' };

export function archetype(build) {
  const groups = ATTR_GROUPS.filter(g => g.id !== 'physicals');
  const scores = Object.fromEntries(groups.map(g => [g.id, categoryScore(build.attrs, g)]));
  const order = Object.keys(scores).sort((x, y) => scores[y] - scores[x]);
  const [p, s] = order;
  const top = scores[p], low = scores[order[order.length - 1]];
  const isBig = build.position === 'PF' || build.position === 'C';
  const result = name => ({ name, primary: p, secondary: s, scores });

  if (top < 58) return result('Raw Prospect');
  const { finishing: f, shooting: sh, playmaking: pm } = scores;
  if (top - low < 6) return result(top >= 75 ? 'Two-Way 3-Level Threat' : 'Balanced All-Rounder');
  if (f >= 70 && sh >= 70 && pm >= 70 && Math.max(f, sh, pm) - Math.min(f, sh, pm) <= 7) {
    return result(pm >= f && pm >= sh ? 'Inside-Out Playmaker' : '3-Level Scoring Threat');
  }
  if ((p === 'finishing' && s === 'shooting') || (p === 'shooting' && s === 'finishing')) {
    if (Math.abs(f - sh) <= 5 && !isBig) return result('3-Level Scoring Threat');
  }
  if (isBig && BIG_ARCH[`${p}|${s}`]) return result(BIG_ARCH[`${p}|${s}`]);
  if (isBig && p === 'finishing' && build.attrs.postControl >= build.attrs.drivingLayup + 8) return result('Post Scorer');
  return result(ARCH[p][s]);
}

// ---------- badges ----------
export function badgeMaxTier(badge, build) {
  const h = build.body.height;
  if (badge.maxH && h > badge.maxH) return -1;
  if (badge.minH && h < badge.minH) return -1;
  let tier = -1;
  for (let t = 0; t < BADGE_TIER_STEPS.length; t++) {
    const ok = badge.req.every(([k, base]) => build.attrs[k] >= Math.min(ATTR_MAX, base + BADGE_TIER_STEPS[t]));
    if (!ok) break;
    tier = t;
  }
  return tier;
}
export const badgeReqFor = (badge, tier) => badge.req.map(([k, base]) => [k, Math.min(ATTR_MAX, base + BADGE_TIER_STEPS[tier])]);
export const badgePointBudget = ovr => clamp(Math.round((ovr - 52) * 1.6), 6, 80);
export const badgeCost = tier => tier + 1;
export const badgeSpent = badges => Object.values(badges).reduce((s, t) => s + badgeCost(t), 0);

// drop badges that are no longer unlocked and trim the cheapest-value ones if over budget
export function normalizeBadges(build, ovr) {
  const out = {};
  for (const [id, t] of Object.entries(build.badges || {})) {
    const badge = BADGES.find(x => x.id === id);
    if (!badge) continue;
    const max = badgeMaxTier(badge, build);
    if (max >= 0) out[id] = Math.min(t, max);
  }
  const budget = badgePointBudget(ovr);
  const ids = Object.keys(out).sort((x, y) => out[x] - out[y]);
  while (badgeSpent(out) > budget && ids.length) {
    const id = ids[0];
    if (out[id] > 0) out[id]--; else { delete out[id]; ids.shift(); }
  }
  build.badges = out;
}

export function autoEquipBadges(build, ovr) {
  const budget = badgePointBudget(ovr);
  const wts = POSITIONS[build.position].weights;
  const cands = BADGES.map(bd => ({ bd, max: badgeMaxTier(bd, build), w: bd.req.reduce((s, [k]) => s + wts[k], 0) / bd.req.length }))
    .filter(c => c.max >= 0)
    .sort((x, y) => y.max - x.max || y.w - x.w);
  const out = {};
  let left = budget;
  for (const c of cands) {
    let t = c.max;
    while (t >= 0 && badgeCost(t) > left) t--;
    if (t < 0) continue;
    out[c.bd.id] = t;
    left -= badgeCost(t);
  }
  build.badges = out;
}

// ---------- animations ----------
export function animUnlocked(item, build) {
  const r = item.req || {};
  if (r.maxH && build.body.height > r.maxH) return false;
  if (r.minH && build.body.height < r.minH) return false;
  return Object.entries(r.attrs || {}).every(([k, v]) => build.attrs[k] >= v);
}
export function normalizeAnims(build) {
  for (const key of ANIM_KEYS) {
    const def = ANIMATIONS[key];
    if (def.multi) {
      const cur = Array.isArray(build.anims[key]) ? build.anims[key] : [];
      const ok = cur.filter(id => { const it = def.items.find(i => i.id === id); return it && animUnlocked(it, build); }).slice(0, def.multi);
      build.anims[key] = ok;
    } else {
      const it = def.items.find(i => i.id === build.anims[key]);
      if (!it || !animUnlocked(it, build)) build.anims[key] = def.items[0].id;
    }
  }
}

// ---------- whole-build helpers ----------
export function enforceCaps(build) {
  clampBody(build.body);
  const caps = computeCaps(build.body);
  for (const k of ATTR_KEYS) build.attrs[k] = clamp(Math.round(build.attrs[k] ?? ATTR_MIN), ATTR_MIN, caps[k]);
  // over budget (e.g. from a shared link) -> shave the most expensive points first
  let guard = 5000;
  while (totalCost(build.attrs) > BUILD_BUDGET && guard--) {
    const k = ATTR_KEYS.reduce((best, x) => (build.attrs[x] > build.attrs[best] ? x : best), ATTR_KEYS[0]);
    build.attrs[k]--;
  }
  return caps;
}

export function derive(build) {
  const caps = enforceCaps(build);
  const ovr = overall(build);
  normalizeBadges(build, ovr);
  normalizeAnims(build);
  return {
    caps, ovr,
    spent: totalCost(build.attrs),
    budget: BUILD_BUDGET,
    arch: archetype(build),
    groups: groupAverages(build.attrs),
    badgeBudget: badgePointBudget(ovr),
    badgeSpent: badgeSpent(build.badges),
  };
}

export function defaultBuild() {
  const attrs = Object.fromEntries(ATTR_KEYS.map(k => [k, 50]));
  const b = {
    id: null, v: 1,
    identity: { first: 'Marcus', last: 'Reed', nickname: 'Blacktop', number: '0', age: 20, country: 'United States', college: 'Brooklyn, NY' },
    position: 'PG',
    body: { height: 75, weight: 190, wingspan: 79, bodyType: 'Athletic' },
    look: { skin: SKIN_TONES[5], hair: 'Low Fade', hairColor: 'Black', facialHair: 'Stubble', eyeColor: 'Brown', tattoos: [], jersey: 'Red', shoes: 'Triple Black' },
    attrs, badges: {},
    anims: Object.fromEntries(ANIM_KEYS.map(k => [k, ANIMATIONS[k].multi ? [] : ANIMATIONS[k].items[0].id])),
  };
  derive(b);
  return b;
}

const FOCI = {
  PG: [['playmaking', 'shooting'], ['playmaking', 'finishing'], ['shooting', 'defense'], ['playmaking', 'defense']],
  SG: [['shooting', 'finishing'], ['shooting', 'defense'], ['finishing', 'playmaking'], ['shooting', 'playmaking']],
  SF: [['finishing', 'shooting'], ['shooting', 'defense'], ['finishing', 'defense'], ['playmaking', 'rebounding']],
  PF: [['finishing', 'rebounding'], ['defense', 'rebounding'], ['shooting', 'rebounding'], ['finishing', 'defense']],
  C: [['defense', 'rebounding'], ['finishing', 'rebounding'], ['shooting', 'defense'], ['playmaking', 'rebounding']],
};

export function randomBuild() {
  const position = pick(POSITION_KEYS);
  const pos = POSITIONS[position];
  const height = randInt(pos.range[0], pos.range[1]);
  const [wl, wh] = weightRange(height);
  const [sl, sh] = wingRange(height);
  const b = defaultBuild();
  b.identity = {
    first: pick(FIRST_NAMES), last: pick(LAST_NAMES), nickname: pick(NICKNAMES),
    number: String(pick([0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 15, 20, 21, 22, 23, 24, 25, 30, 32, 33, 34, 35, 44, 55, 77])),
    age: randInt(19, 34), country: Math.random() < 0.55 ? 'United States' : pick(COUNTRIES), college: pick(COLLEGES),
  };
  b.position = position;
  b.body = { height, weight: randInt(wl + 5, Math.min(wh, wl + 50)), wingspan: randInt(Math.max(sl, height), sh), bodyType: pick(Object.keys(BODY_TYPES)) };
  b.look = {
    skin: pick(SKIN_TONES), hair: pick(HAIR_STYLES), hairColor: Math.random() < 0.75 ? pick(['Black', 'Dark Brown', 'Brown']) : pick(Object.keys(HAIR_COLORS)),
    facialHair: pick(FACIAL_HAIR), eyeColor: pick(Object.keys(EYE_COLORS)),
    tattoos: TATTOO_SPOTS.filter(() => Math.random() < 0.25), jersey: pick(Object.keys(JERSEY_COLORS)), shoes: pick(Object.keys(SHOE_COLORS)),
  };
  const caps = computeCaps(b.body);
  const focus = pick(FOCI[position]);
  const groupOf = Object.fromEntries(ATTRS.map(a => [a.key, a.group]));
  const weight = k => pos.weights[k] ** 2 * (groupOf[k] === focus[0] ? 3 : groupOf[k] === focus[1] ? 2 : 1) * (0.6 + Math.random() * 0.8);
  const w = Object.fromEntries(ATTR_KEYS.map(k => [k, weight(k)]));
  b.attrs = Object.fromEntries(ATTR_KEYS.map(k => [k, Math.min(caps[k], randInt(35, 50))]));
  let spent = totalCost(b.attrs);
  for (let guard = 0; guard < 20000; guard++) {
    const open = ATTR_KEYS.filter(k => b.attrs[k] < caps[k] && spent + COST[b.attrs[k] + 1] - COST[b.attrs[k]] <= BUILD_BUDGET);
    if (!open.length) break;
    const tot = open.reduce((s, k) => s + w[k], 0);
    let r = Math.random() * tot, k = open[0];
    for (const x of open) { r -= w[x]; if (r <= 0) { k = x; break; } }
    spent += COST[b.attrs[k] + 1] - COST[b.attrs[k]];
    b.attrs[k]++;
  }
  const d = derive(b);
  autoEquipBadges(b, d.ovr);
  for (const key of ANIM_KEYS) {
    const def = ANIMATIONS[key];
    const ok = def.items.filter(it => animUnlocked(it, b));
    if (def.multi) b.anims[key] = ok.sort(() => Math.random() - 0.5).slice(0, Math.min(def.multi, ok.length));
    else b.anims[key] = (Math.random() < 0.6 ? ok[ok.length - 1] : pick(ok)).id;
  }
  return b;
}

// ---------- persistence / share ----------
const str = (v, max, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

export function sanitizeBuild(raw) {
  const d = defaultBuild();
  if (!raw || typeof raw !== 'object') return d;
  const i = raw.identity || {};
  const b = {
    id: typeof raw.id === 'string' ? raw.id.slice(0, 32) : null, v: 1,
    identity: {
      first: str(i.first, 20, d.identity.first), last: str(i.last, 20, d.identity.last), nickname: str(i.nickname, 24),
      number: String(i.number ?? '').replace(/\D/g, '').slice(0, 2) || '0', age: clamp(parseInt(i.age, 10) || 20, 19, 40),
      country: oneOf(i.country, COUNTRIES, d.identity.country), college: str(i.college, 40),
    },
    position: oneOf(raw.position, POSITION_KEYS, 'PG'),
    body: { height: +raw.body?.height || 75, weight: +raw.body?.weight || 190, wingspan: +raw.body?.wingspan || 79, bodyType: raw.body?.bodyType },
    look: {
      skin: /^#[0-9a-f]{6}$/i.test(raw.look?.skin) ? raw.look.skin : d.look.skin,
      hair: oneOf(raw.look?.hair, HAIR_STYLES, d.look.hair), hairColor: oneOf(raw.look?.hairColor, Object.keys(HAIR_COLORS), 'Black'),
      facialHair: oneOf(raw.look?.facialHair, FACIAL_HAIR, 'None'), eyeColor: oneOf(raw.look?.eyeColor, Object.keys(EYE_COLORS), 'Brown'),
      tattoos: Array.isArray(raw.look?.tattoos) ? raw.look.tattoos.filter(t => TATTOO_SPOTS.includes(t)) : [],
      jersey: oneOf(raw.look?.jersey, Object.keys(JERSEY_COLORS), 'Red'), shoes: oneOf(raw.look?.shoes, Object.keys(SHOE_COLORS), 'Triple Black'),
    },
    attrs: Object.fromEntries(ATTR_KEYS.map(k => [k, parseInt(raw.attrs?.[k], 10) || ATTR_MIN])),
    badges: Object.fromEntries(Object.entries(raw.badges || {}).filter(([id, t]) => BADGES.some(x => x.id === id) && Number.isInteger(t) && t >= 0 && t <= 4)),
    anims: { ...d.anims, ...(raw.anims && typeof raw.anims === 'object' ? raw.anims : {}) },
    savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : undefined,
  };
  derive(b);
  return b;
}

export function encodeBuild(build) {
  const { id, savedAt, ...rest } = build;
  const bytes = new TextEncoder().encode(JSON.stringify(rest));
  let bin = '';
  bytes.forEach(x => { bin += String.fromCharCode(x); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBuild(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return sanitizeBuild(JSON.parse(new TextDecoder().decode(bytes)));
}

export const clone = o => JSON.parse(JSON.stringify(o));
