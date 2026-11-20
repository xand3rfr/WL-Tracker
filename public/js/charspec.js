// Anatomy for one player: turns joint positions (bind pose) and body settings into mesh regions.
import { roundCone, ellipsoid, roundBox, halfSpace, add, sub, mul, dot, norm, cross, len, lerp3, frame, meshRegion } from './charmesh.js';

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];
const B = Object.fromEntries(BONES.map((b, i) => [b, i]));

function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed) { let s = seed || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296; }
const hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const Y = v => [0, v, 0];

// P: joint world positions in the bind pose; o: body/style options
export function characterRegions(P, o) {
  const s = o.H / 1.9, { tw, lw, sw, muscle: m, fat } = o;
  const q = o.detail || 1;
  const skin = hex(o.skin), sock = hex('#f2f2f2'), accent = hex(o.accent), shoe = hex(o.shoe);
  const sole = hex(o.shoe === '#f2f2f2' ? '#2a2a2a' : '#f0f0f0');
  const hair = hex(o.hair);
  const rnd = seeded(hash(o.seed));
  const face = { jaw: 0.9 + rnd() * 0.2, nose: 0.85 + rnd() * 0.35, lip: 0.85 + rnd() * 0.35, brow: rnd() * 0.04, cheek: 0.9 + rnd() * 0.2 };
  const regions = [];
  const fwd = [0, 0, 1];

  // ----- torso pieces, reused for the jersey -----
  const torso = [];
  torso.push(ellipsoid(add(P.hips, [0, 0, -0.005 * s]), [0.165 * s * tw, 0.115 * s, 0.12 * s * tw], null, { bone: B.hips, k: 0.05 * s, tag: 'pelvis' }));
  torso.push(roundCone(add(P.hips, Y(0.06 * s)), sub(P.chest, Y(0.17 * s)), (0.13 + fat * 0.035) * s * tw, 0.14 * s * tw, { bone: B.spine, k: 0.06 * s, tag: 'abs' }));
  if (fat > 0.05) torso.push(ellipsoid(add(P.hips, [0, 0.12 * s, (0.05 + fat * 0.04) * s]), [0.14 * s * fat + 0.05 * s, 0.12 * s, (0.08 + 0.05 * fat) * s], null, { bone: B.spine, k: 0.06 * s, tag: 'belly' }));
  torso.push(ellipsoid(add(P.chest, [0, -0.11 * s, -0.005 * s]), [0.165 * s * tw * sw, 0.17 * s, 0.125 * s * tw], null, { bone: B.chest, k: 0.05 * s, tag: 'ribs' }));
  for (const sx of [1, -1]) {
    torso.push(ellipsoid(add(P.chest, [sx * 0.075 * s * sw, -0.07 * s, 0.075 * s * tw]), [0.085 * s, 0.062 * s, 0.05 * s].map(v => v * (0.8 + 0.45 * m)), null, { bone: B.chest, k: 0.03 * s, tag: 'pec' }));
    torso.push(ellipsoid(add(P.chest, [sx * 0.12 * s * sw, -0.15 * s, -0.035 * s]), [0.06 * s * (0.8 + 0.5 * m), 0.13 * s, 0.07 * s], null, { bone: B.chest, k: 0.04 * s, tag: 'lat' }));
    const sh = P['shoulder' + (sx > 0 ? 'L' : 'R')];
    torso.push(roundCone(add(P.neck, [0, -0.02 * s, -0.02 * s]), add(sh, [-sx * 0.02 * s, 0.015 * s, -0.01 * s]), 0.055 * s * (0.8 + 0.4 * m), 0.045 * s, { bone: B.chest, k: 0.04 * s, tag: 'trap' }));
  }
  const body = [...torso];
  for (const sx of [1, -1]) body.push(ellipsoid(add(P.hips, [sx * 0.068 * s, -0.045 * s, -0.075 * s]), [0.085, 0.1, 0.075].map(v => v * s * (0.9 + 0.2 * m)), null, { bone: B.hips, k: 0.04 * s, tag: 'glute' }));
  body.push(roundCone(sub(P.neck, Y(0.03 * s)), sub(P.head, [0, o.headR * 0.55, 0.1 * o.headR]), 0.062 * s * Math.sqrt(tw), 0.056 * s, { bone: B.neck, k: 0.04 * s, tag: 'neck' }));

  // ----- arms -----
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const S = P['shoulder' + side], E = P['elbow' + side], W = P['wrist' + side];
    const fu = frame(sub(E, S), fwd), ff = frame(sub(W, E), fwd);
    const uL = len(sub(E, S)), fL = len(sub(W, E));
    const ur = 0.051 * lw * s ** 0.7, fr = 0.041 * lw * s ** 0.7, mm = 0.85 + 0.4 * m;
    const tagU = 'upper' + side, tagF = 'fore' + side;
    body.push(ellipsoid(add(S, [sx * 0.012 * s, 0.006 * s, 0]), [0.072 * s * mm * lw ** 0.5, 0.085 * s * mm, 0.07 * s * mm * lw ** 0.5], fu, { bone: B['shoulder' + side], k: 0.035 * s, tag: tagU }));
    body.push(roundCone(S, E, ur, ur * 0.78, { bone: B['shoulder' + side], k: 0.03 * s, tag: tagU }));
    body.push(ellipsoid(add(lerp3(S, E, 0.48), mul(fu.z, ur * 0.38)), [ur * 0.62 * mm, uL * 0.3, ur * 0.6 * mm], fu, { bone: B['shoulder' + side], k: 0.025 * s, tag: tagU }));
    body.push(ellipsoid(add(lerp3(S, E, 0.4), mul(fu.z, -ur * 0.36)), [ur * 0.66 * mm, uL * 0.32, ur * 0.6 * mm], fu, { bone: B['shoulder' + side], k: 0.025 * s, tag: tagU }));
    body.push(ellipsoid(add(E, mul(fu.z, -ur * 0.55)), [ur * 0.45, ur * 0.45, ur * 0.4], fu, { bone: B['elbow' + side], k: 0.02 * s, tag: tagF, wt: 0.6 }));
    body.push(roundCone(E, W, fr, fr * 0.64, { bone: B['elbow' + side], k: 0.03 * s, tag: tagF }));
    body.push(ellipsoid(add(lerp3(E, W, 0.24), mul(ff.x, sx * fr * 0.2)), [fr * 0.98 * mm, fL * 0.28, fr * 0.82 * mm], ff, { bone: B['elbow' + side], k: 0.025 * s, tag: tagF }));
  }

  // ----- legs -----
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const Hj = P['hip' + side], K = P['knee' + side], A = P['ankle' + side];
    const ft = frame(sub(K, Hj), fwd), fs = frame(sub(A, K), fwd);
    const tL = len(sub(K, Hj)), sL = len(sub(A, K));
    const tr = 0.078 * lw * s ** 0.7, sr = 0.056 * lw * s ** 0.7, mm = 0.85 + 0.35 * m;
    const tagT = 'thigh' + side, tagS = 'shin' + side;
    body.push(roundCone(Hj, K, tr, tr * 0.6, { bone: B['hip' + side], k: 0.04 * s, tag: tagT }));
    body.push(ellipsoid(add(lerp3(Hj, K, 0.55), mul(ft.z, tr * 0.36)), [tr * 0.8 * mm, tL * 0.3, tr * 0.66 * mm], ft, { bone: B['hip' + side], k: 0.03 * s, tag: tagT }));
    body.push(ellipsoid(add(lerp3(Hj, K, 0.45), mul(ft.z, -tr * 0.36)), [tr * 0.76 * mm, tL * 0.3, tr * 0.6 * mm], ft, { bone: B['hip' + side], k: 0.03 * s, tag: tagT }));
    body.push(ellipsoid(add(lerp3(Hj, K, 0.3), mul(ft.x, -sx * tr * 0.32)), [tr * 0.6, tL * 0.24, tr * 0.6], ft, { bone: B['hip' + side], k: 0.03 * s, tag: tagT }));
    body.push(ellipsoid(add(K, mul(ft.z, tr * 0.36)), [tr * 0.32, tr * 0.36, tr * 0.22], ft, { bone: B['knee' + side], k: 0.02 * s, tag: tagS, wt: 0.7 }));
    body.push(roundCone(K, A, sr, sr * 0.5, { bone: B['knee' + side], k: 0.03 * s, tag: tagS }));
    body.push(ellipsoid(add(lerp3(K, A, 0.28), mul(fs.z, -sr * 0.42)), [sr * 0.86 * mm, sL * 0.3, sr * 0.8 * mm], fs, { bone: B['knee' + side], k: 0.03 * s, tag: tagS }));
    body.push(roundCone(A, add(A, [0, -0.03 * s, 0.02 * s]), sr * 0.5, sr * 0.45, { bone: B['ankle' + side], k: 0.02 * s, tag: 'ankle' + side }));
  }

  const legInfo = side => ({ K: P['knee' + side], A: P['ankle' + side] });
  const inkSpots = o.tattoos || new Set();
  regions.push({
    name: 'body', prims: body, h: 0.016 * s * q,
    colorAt(p, dom) {
      const tag = dom?.tag || '';
      if (tag.startsWith('shin') || tag.startsWith('ankle')) {
        const { K, A } = legInfo(tag.endsWith('L') ? 'L' : 'R');
        const t = dot(sub(p, A), norm(sub(K, A))) / len(sub(K, A));
        if (t < 0.4) return t > 0.33 && t < 0.36 ? accent : sock;
      }
      return skin;
    },
    inkAt(p) {
      const tags = [];
      for (const pr of body) if (pr.tag && pr.t !== 3) { const dx = Math.max(pr.bb[0] - p[0], p[0] - pr.bb[3], 0), dy = Math.max(pr.bb[1] - p[1], p[1] - pr.bb[4], 0), dz = Math.max(pr.bb[2] - p[2], p[2] - pr.bb[5], 0); if (dx + dy + dz < 0.01) tags.push(pr.tag); }
      const has = t => tags.includes(t);
      if ((inkSpots.has('Left Sleeve') && (has('upperL') || has('foreL'))) || (inkSpots.has('Right Sleeve') && (has('upperR') || has('foreR')))) return 1;
      if ((inkSpots.has('Left Forearm') && has('foreL')) || (inkSpots.has('Right Forearm') && has('foreR'))) return 1;
      if ((inkSpots.has('Left Leg') && (has('thighL') || has('shinL'))) || (inkSpots.has('Right Leg') && (has('thighR') || has('shinR')))) return 1;
      if (inkSpots.has('Neck') && has('neck')) return 1;
      if (inkSpots.has('Chest') && (has('pec') || has('trap')) && p[2] > P.chest[2]) return 1;
      return 0;
    },
  });

  // ----- head -----
  const R = o.headR, hc = P.head;
  const at = (x, y, z) => add(hc, [x * R, y * R, z * R]);
  const head = [];
  head.push(ellipsoid(at(0, 0.1, -0.06), [0.86 * R, 0.98 * R, 1.0 * R], null, { bone: B.head, k: 0.06 * R, tag: 'skull' }));
  head.push(ellipsoid(at(0, 0.32, 0.42), [0.68 * R, 0.42 * R, 0.5 * R], null, { bone: B.head, k: 0.1 * R, tag: 'forehead' }));
  head.push(ellipsoid(at(0, -0.2, 0.32), [0.66 * R * face.jaw, 0.6 * R, 0.62 * R], null, { bone: B.head, k: 0.12 * R, tag: 'face' }));
  for (const sx of [1, -1]) {
    head.push(roundCone(at(sx * 0.5 * face.jaw, -0.36, -0.02), at(0, -0.74, 0.62), 0.2 * R, 0.17 * R, { bone: B.head, k: 0.1 * R, tag: 'jaw' }));
    head.push(ellipsoid(at(sx * 0.44 * face.cheek, -0.02, 0.55), [0.22 * R, 0.14 * R, 0.2 * R], null, { bone: B.head, k: 0.08 * R, tag: 'cheek' }));
    head.push(ellipsoid(at(sx * 0.87, 0, -0.04), [0.08 * R, 0.2 * R, 0.13 * R], null, { bone: B.head, k: 0.04 * R, tag: 'ear' }));
  }
  head.push(ellipsoid(at(0, -0.76, 0.66), [0.2 * R, 0.15 * R, 0.16 * R], null, { bone: B.head, k: 0.06 * R, tag: 'chin' }));
  head.push(ellipsoid(at(0, 0.27 + face.brow, 0.8), [0.6 * R, 0.11 * R, 0.15 * R], null, { bone: B.head, k: 0.08 * R, tag: 'brow' }));
  head.push(roundCone(at(0, 0.2, 0.86), at(0, -0.14, 1.04), 0.07 * R * face.nose, 0.095 * R * face.nose, { bone: B.head, k: 0.05 * R, tag: 'nose' }));
  head.push(ellipsoid(at(0, -0.17, 1.02), [0.11 * R * face.nose, 0.08 * R, 0.09 * R], null, { bone: B.head, k: 0.04 * R, tag: 'nose' }));
  for (const sx of [1, -1]) head.push(ellipsoid(at(sx * 0.1 * face.nose, -0.2, 0.94), [0.075 * R, 0.06 * R, 0.07 * R], null, { bone: B.head, k: 0.03 * R, tag: 'nose' }));
  head.push(ellipsoid(at(0, -0.36, 0.95), [0.24 * R, 0.065 * R * face.lip, 0.085 * R], null, { bone: B.head, k: 0.04 * R, tag: 'lip' }));
  head.push(ellipsoid(at(0, -0.47, 0.93), [0.21 * R, 0.07 * R * face.lip, 0.085 * R], null, { bone: B.head, k: 0.04 * R, tag: 'lip' }));
  head.push(roundCone(at(0, -0.55, -0.12), at(0, -1.45, -0.1), 0.47 * R, 0.5 * R, { bone: B.neck, k: 0.08 * R, tag: 'neck' }));
  // facial hair with real volume where it should stick out
  const fh = o.facialHair || 'None';
  const beardTag = { bone: B.head, tag: 'beard' };
  if (['Mustache', 'Goatee', 'Full Beard', 'Big Beard'].includes(fh)) head.push(ellipsoid(at(0, -0.29, 0.97), [0.24 * R, 0.045 * R, 0.06 * R], null, { ...beardTag, k: 0.03 * R }));
  if (fh === 'Goatee') head.push(ellipsoid(at(0, -0.72, 0.72), [0.17 * R, 0.17 * R, 0.13 * R], null, { ...beardTag, k: 0.05 * R }));
  if (fh === 'Full Beard' || fh === 'Big Beard') {
    const puff = fh === 'Big Beard' ? 0.13 : 0.05;
    for (const sx of [1, -1]) head.push(roundCone(at(sx * 0.52 * face.jaw, -0.3, -0.04), at(0, -0.76 - puff * 1.5, 0.64), (0.2 + puff) * R, (0.17 + puff) * R, { ...beardTag, k: 0.1 * R }));
    if (fh === 'Big Beard') head.push(ellipsoid(at(0, -1.0, 0.55), [0.36 * R, 0.32 * R, 0.3 * R], null, { ...beardTag, k: 0.12 * R }));
  }
  // carve the eye sockets, the mouth line and the ear bowls
  for (const sx of [1, -1]) {
    head.push(ellipsoid(at(sx * 0.31, 0.1, 0.86), [0.16 * R, 0.13 * R, 0.16 * R], null, { op: 's', k: 0.06 * R }));
    head.push(ellipsoid(at(sx * 0.93, 0.02, -0.02), [0.04 * R, 0.12 * R, 0.08 * R], null, { op: 's', k: 0.02 * R }));
  }
  head.push(ellipsoid(at(0, -0.415, 1.0), [0.23 * R, 0.012 * R, 0.07 * R], null, { op: 's', k: 0.015 * R }));
  head.push(halfSpace([0, -1, 0], at(0, -1.25, 0)));
  const lipCol = mixc(skin, hex('#5a1a1a'), 0.35), browCol = mixc(hair, skin, 0.15), beardCol = mixc(hair, skin, 0.08);
  regions.push({
    name: 'head', prims: head, h: 0.0055 * s * q, weightSoftness: 0.01,
    colorAt(p, dom) {
      const lx = (p[0] - hc[0]) / R, ly = (p[1] - hc[1]) / R, lz = (p[2] - hc[2]) / R;
      if (dom?.tag === 'lip') return lipCol;
      if (dom?.tag === 'beard') return beardCol;
      // stubble, chin straps and beard shadows are painted onto the jaw
      const inBeard = ly < -0.14 && lz > -0.15 && !(lz > 0.82 && ly > -0.56 && ly < -0.24 && Math.abs(lx) < 0.26);
      const sideburn = Math.abs(lx) > 0.62 && ly < 0.18 && lz > -0.2 && lz < 0.3;
      if (fh === 'Stubble' && (inBeard || sideburn)) return mixc(skin, hair, 0.38);
      if (fh === 'Chin Strap' && (sideburn || (inBeard && (ly < -0.62 || Math.abs(lx) > 0.5)))) return beardCol;
      if ((fh === 'Full Beard' || fh === 'Big Beard') && (inBeard || sideburn)) return beardCol;
      if (fh === 'Goatee' && inBeard && Math.abs(lx) < 0.24 && ly < -0.5) return beardCol;
      const by = 0.27 + face.brow;
      if (lz > 0.6 && ly > by - 0.05 && ly < by + 0.06 && Math.abs(lx) > 0.12 && Math.abs(lx) < 0.5 - (ly - by) * 2) return browCol;
      return skin;
    },
    inkAt() { return 0; },
  });

  // ----- hands -----
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const W = P['wrist' + side], E = P['elbow' + side];
    const a = norm(sub(W, E));
    const f = frame(a, fwd);
    const t = f.z, nrm = mul(f.x, -sx); // thumb forward, palm toward the body
    const hs = s * lw ** 0.3;
    const hand = [];
    const pt = (u, v, w) => add(W, add(mul(a, u * hs), add(mul(t, v * hs), mul(nrm, w * hs))));
    hand.push(roundCone(pt(-0.035, 0, 0), pt(0.01, 0, 0), 0.027 * hs, 0.026 * hs, { bone: B['wrist' + side], k: 0.012 * s, tag: 'wrist' }));
    hand.push(ellipsoid(pt(0.05, 0, 0), [0.019 * hs, 0.05 * hs, 0.045 * hs], { x: nrm, y: a, z: t }, { bone: B['wrist' + side], k: 0.014 * s, tag: 'palm' }));
    const fingers = [[0.03, [0.045, 0.028, 0.022]], [0.01, [0.05, 0.032, 0.024]], [-0.01, [0.047, 0.03, 0.022]], [-0.029, [0.036, 0.022, 0.018]]];
    for (const [off, segs] of fingers) {
      let p0 = pt(0.092, off, 0.004), dir = norm(add(a, mul(nrm, 0.12)));
      let r = 0.0095 * hs;
      segs.forEach((L, i) => {
        const p1 = add(p0, mul(dir, L * hs));
        hand.push(roundCone(p0, p1, r, r * 0.9, { bone: B['wrist' + side], k: 0.004 * s, tag: i === 2 ? 'tip' : 'finger' }));
        p0 = p1; r *= 0.9; dir = norm(add(dir, mul(nrm, 0.35)));
      });
    }
    let tp0 = pt(0.02, 0.035, 0.012), tdir = norm(add(add(mul(a, 0.7), mul(t, 0.6)), mul(nrm, 0.2)));
    for (const [i, L] of [0.042, 0.03].entries()) {
      const tp1 = add(tp0, mul(tdir, L * hs));
      hand.push(roundCone(tp0, tp1, 0.012 * hs * (1 - i * 0.12), 0.0105 * hs * (1 - i * 0.12), { bone: B['wrist' + side], k: 0.006 * s, tag: i ? 'tip' : 'finger' }));
      tp0 = tp1; tdir = norm(add(tdir, mul(a, 0.4)));
    }
    const palmCol = mixc(skin, hex('#e8b89a'), 0.45), nail = mixc(skin, hex('#f3dcd0'), 0.55);
    regions.push({
      name: 'hand' + side, prims: hand, h: 0.0038 * s * q, weightSoftness: 0.01, defaultBone: B['wrist' + side],
      colorAt(p, dom) {
        const toPalm = dot(sub(p, W), nrm);
        if (dom?.tag === 'tip' && toPalm < -0.004 * hs) return nail;
        return toPalm > 0.006 * hs ? palmCol : skin;
      },
      inkAt() { return 0; },
    });
  }

  // ----- sneakers -----
  for (const side of ['L', 'R']) {
    const A = P['ankle' + side], bone = B['ankle' + side];
    const shoeP = [];
    const ax = A[0], az = A[2];
    shoeP.push(roundBox([ax, 0.017 * s, az + 0.065 * s], [0.056 * s, 0.017 * s, 0.155 * s], 0.012 * s, null, { bone, k: 0.008 * s, tag: 'sole' }));
    shoeP.push(ellipsoid([ax, 0.06 * s, az - 0.045 * s], [0.047 * s, 0.05 * s, 0.062 * s], null, { bone, k: 0.03 * s, tag: 'upper' }));
    shoeP.push(ellipsoid([ax, 0.052 * s, az + 0.06 * s], [0.051 * s, 0.045 * s, 0.09 * s], null, { bone, k: 0.03 * s, tag: 'upper' }));
    shoeP.push(ellipsoid([ax, 0.036 * s, az + 0.15 * s], [0.046 * s, 0.032 * s, 0.065 * s], null, { bone, k: 0.03 * s, tag: 'toe' }));
    shoeP.push(roundCone([ax, A[1] - 0.012 * s, az - 0.008 * s], [ax, A[1] + 0.055 * s, az - 0.012 * s], 0.053 * s, 0.05 * s, { bone, k: 0.025 * s, tag: 'collar' }));
    shoeP.push(ellipsoid([ax, 0.085 * s, az + 0.05 * s], [0.034 * s, 0.03 * s, 0.055 * s], null, { bone, k: 0.02 * s, tag: 'tongue' }));
    shoeP.push(roundCone([ax, A[1] + 0.06 * s, az - 0.01 * s], [ax, A[1] + 0.06 * s, az - 0.01 * s], 0.038 * s, 0.038 * s, { op: 's', k: 0.01 * s }));
    const lace = mixc(shoe, [0.95, 0.95, 0.95], 0.6);
    regions.push({
      name: 'shoe' + side, prims: shoeP, h: 0.006 * s * q, defaultBone: bone,
      colorAt(p) {
        const lx = p[0] - ax, lz = p[2] - az, y = p[1];
        if (y < 0.034 * s) return y < 0.012 * s ? mixc(sole, [0.2, 0.2, 0.2], 0.3) : sole;
        const stripeY = 0.052 * s - (lz - 0.02 * s) * 0.18;
        if (Math.abs(lx) > 0.036 * s && Math.abs(y - stripeY) < 0.0075 * s && lz > -0.07 * s && lz < 0.13 * s) return accent;
        if (Math.abs(lx) < 0.022 * s && y > 0.07 * s && lz > 0.0 && lz < 0.11 * s && Math.floor((lz / s) / 0.018) % 2 === 0) return lace;
        return shoe;
      },
      inkAt() { return 0; },
    });
  }

  // ----- jersey: the torso, inflated, with arm holes and a v-neck cut away -----
  const yTop = P.neck[1] + 0.03 * s, yBot = P.hips[1] - 0.035 * s;
  const jersey = torso.map(p => ({ ...p, k: p.k + 0.02 * s }));
  for (const side of ['L', 'R']) {
    const S = P['shoulder' + side];
    jersey.push(ellipsoid(add(S, [0, -0.03 * s, 0]), [0.085 * s, 0.13 * s, 0.11 * s], null, { op: 's', k: 0.02 * s }));
  }
  jersey.push(roundCone(sub(P.neck, Y(0.05 * s)), P.head, 0.075 * s, 0.075 * s, { op: 's', k: 0.015 * s }));
  jersey.push(ellipsoid(add(P.neck, [0, -0.025 * s, 0.065 * s]), [0.05 * s, 0.075 * s, 0.07 * s], null, { op: 's', k: 0.012 * s }));
  jersey.push(halfSpace([0, -1, 0], [0, yBot, 0]));
  const cyl = p => { const u = Math.atan2(p[0], p[2]) / (Math.PI * 2); return u < 0 ? u + 1 : u; };
  regions.push({
    name: 'jersey', prims: jersey, h: 0.012 * s * q, offset: 0.012 * s, weightSoftness: 0.03,
    colorAt() { return [1, 1, 1]; }, uvAt: p => [cyl(p), (p[1] - yBot) / (yTop - yBot)], inkAt() { return 0; },
  });

  // ----- shorts: loose around the hips and upper thighs -----
  const yWaist = P.hips[1] + 0.07 * s;
  const yHem = (P.hipL[1] + P.kneeL[1]) / 2 - 0.02 * s;
  const shorts = [ellipsoid(add(P.hips, [0, 0, -0.005 * s]), [0.168 * s * tw, 0.12 * s, 0.125 * s * tw], null, { bone: B.hips, k: 0.04 * s, tag: 'pelvis' })];
  for (const sx of [1, -1]) shorts.push(ellipsoid(add(P.hips, [sx * 0.068 * s, -0.045 * s, -0.075 * s]), [0.09, 0.105, 0.08].map(v => v * s * (0.9 + 0.2 * m)), null, { bone: B.hips, k: 0.04 * s, tag: 'pelvis' }));
  for (const side of ['L', 'R']) {
    const Hj = P['hip' + side], K = P['knee' + side];
    const tr = 0.078 * lw * s ** 0.7;
    shorts.push(roundCone(Hj, lerp3(Hj, K, 0.75), tr * 1.12, tr * 1.16, { bone: B['hip' + side], k: 0.02 * s, tag: 'leg' + side }));
  }
  // open the gap between the legs below the crotch
  shorts.push(roundCone(add(P.hips, [0, -0.13 * s, 0]), add(P.hips, [0, -0.5 * s, 0]), 0.03 * s, 0.07 * s, { op: 's', k: 0.02 * s }));
  shorts.push(halfSpace([0, 1, 0], [0, yWaist, 0]));
  shorts.push(halfSpace([0, -1, 0], [0, yHem, 0]));
  regions.push({
    name: 'shorts', prims: shorts, h: 0.013 * s * q, offset: 0.016 * s, weightSoftness: 0.04,
    colorAt(p) { return p[1] < yHem + 0.012 * s ? [0.55, 0.55, 0.55] : [1, 1, 1]; }, uvAt: p => [cyl(p), (p[1] - yHem) / (yWaist - yHem)], inkAt() { return 0; },
  });

  for (const r of regions) {
    const us = r.prims.filter(p => p.op === 'u');
    r.bb = [0, 1, 2].map(i => Math.min(...us.map(p => p.bb[i])) - 0.04).concat([0, 1, 2].map(i => Math.max(...us.map(p => p.bb[i + 3])) + 0.04));
    if (r.offset) r.bb = r.bb.map((v, i) => v + (i < 3 ? -r.offset : r.offset));
  }
  return { regions, face };
}

export function meshCharacter(P, o) {
  const { regions, face } = characterRegions(P, o);
  const meshes = {};
  for (const r of regions) meshes[r.name] = meshRegion(r);
  return { meshes, face };
}

export { cross };
