import * as THREE from '../vendor/three.module.min.js';
import { BODY_TYPES, HAIR_COLORS, EYE_COLORS, JERSEY_COLORS, SHOE_COLORS, ANIMATIONS } from './data.js';
import { idealWeight } from './build.js';

const TAU = Math.PI * 2;
const BALL_R = 0.12;

// ---------- small utils ----------
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mix(hexA, hexB, t) {
  return '#' + new THREE.Color(hexA).lerp(new THREE.Color(hexB), t).getHexString();
}
const isLight = hex => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6;
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeatX = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeatX !== 1) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = repeatX; }
  return t;
}
const ease = t => t * t * (3 - 2 * t);

// ---------- procedural ink ----------
function drawInk(ctx, x, y, w, h, seed, color) {
  const r = rng(seed);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round';
  const style = Math.floor(r() * 4);
  if (style === 0) { // tribal bands
    for (let i = 0; i < 5; i++) {
      ctx.lineWidth = 6 + r() * 10;
      ctx.beginPath();
      const yy = y + (i + 0.5) * h / 5;
      ctx.moveTo(x - 10, yy);
      for (let k = 0; k <= 6; k++) ctx.quadraticCurveTo(x + (k + 0.5) * w / 6, yy + (r() - 0.5) * h * 0.35, x + (k + 1) * w / 6, yy + (r() - 0.5) * 20);
      ctx.stroke();
    }
  } else if (style === 1) { // roses & clouds
    for (let i = 0; i < 9; i++) {
      const cx = x + r() * w, cy = y + r() * h, rad = 10 + r() * 26;
      ctx.lineWidth = 3;
      for (let k = rad; k > 2; k -= 5) { ctx.beginPath(); ctx.arc(cx + (r() - 0.5) * 3, cy, k, r() * 6, r() * 6 + 4.5); ctx.stroke(); }
    }
  } else if (style === 2) { // script
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const yy = y + 12 + i * (h / 8);
      ctx.beginPath(); ctx.moveTo(x + 8, yy);
      for (let xx = x + 8; xx < x + w - 8; xx += 6) ctx.lineTo(xx, yy + Math.sin(xx * 0.4 + r() * 3) * 5 * r());
      ctx.stroke();
    }
  } else { // stars & geometry
    for (let i = 0; i < 14; i++) {
      const cx = x + r() * w, cy = y + r() * h, rad = 6 + r() * 16;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2; const rr = k % 2 ? rad * 0.45 : rad; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      ctx.closePath(); r() > 0.5 ? ctx.fill() : (ctx.lineWidth = 2.5, ctx.stroke());
    }
  }
  ctx.restore();
}

function skinTexture(skin, inked, seed) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = skin; ctx.fillRect(0, 0, 256, 256);
  if (inked) drawInk(ctx, 0, 0, 256, 256, seed, mix(skin, '#0b0b12', 0.78));
  return tex(c);
}

function jerseyTexture({ color, trim, skin, number, name, chestInk, inkColor }) {
  const W = 1024, H = 512;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = skin; ctx.fillRect(0, 0, W, H);
  if (chestInk) { drawInk(ctx, W - 140, 0, 140, 120, 'chest-l', inkColor); drawInk(ctx, 0, 0, 140, 120, 'chest-r', inkColor); }
  // tank body: v-neck at u=0/1, scoop at back (u=.5), arm holes at u=.25/.75
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 150);
  ctx.lineTo(70, 30); ctx.lineTo(170, 18);
  ctx.quadraticCurveTo(W * 0.25, 175, W * 0.25 + 86, 18);
  ctx.lineTo(W * 0.5 - 90, 18); ctx.quadraticCurveTo(W * 0.5, 70, W * 0.5 + 90, 18);
  ctx.lineTo(W * 0.75 - 86, 18); ctx.quadraticCurveTo(W * 0.75, 175, W - 170, 18);
  ctx.lineTo(W - 70, 30); ctx.lineTo(W, 150);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = trim; ctx.lineWidth = 9; ctx.stroke();
  // side stripes
  ctx.fillStyle = trim;
  ctx.fillRect(W * 0.25 - 7, 170, 14, H); ctx.fillRect(W * 0.75 - 7, 170, 14, H);
  // numbers
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const drawNum = (txt, x, y, size) => {
    ctx.font = `900 ${size}px "Barlow Condensed", Impact, "Arial Narrow", sans-serif`;
    ctx.lineWidth = size * 0.1; ctx.strokeStyle = trim === '#111111' ? '#ffffff' : '#111111';
    ctx.strokeText(txt, x, y); ctx.fillStyle = trim; ctx.fillText(txt, x, y);
  };
  drawNum(number, 0, 290, 130); drawNum(number, W, 290, 130);
  drawNum(number, W * 0.5, 300, 210);
  ctx.font = '800 54px "Barlow Condensed", Impact, "Arial Narrow", sans-serif';
  ctx.fillStyle = trim;
  ctx.fillText(name.toUpperCase().slice(0, 14), W * 0.5, 150);
  return tex(c);
}

function shortsTexture(color, trim) {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = trim;
  ctx.fillRect(0, 0, 512, 22);
  ctx.fillRect(128 - 10, 0, 20, 256); ctx.fillRect(384 - 10, 0, 20, 256);
  return tex(c);
}

function ballTexture() {
  const [c, ctx] = canvas(512, 256);
  ctx.fillStyle = '#d4651f'; ctx.fillRect(0, 0, 512, 256);
  const r = rng('ball');
  for (let i = 0; i < 9000; i++) { ctx.fillStyle = r() > 0.5 ? 'rgba(0,0,0,.08)' : 'rgba(255,200,150,.08)'; ctx.fillRect(r() * 512, r() * 256, 2, 2); }
  ctx.strokeStyle = '#1a0d05'; ctx.lineWidth = 5;
  for (const x of [0, 128, 256, 384, 512]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(512, 128); ctx.stroke();
  for (const cx of [64, 320]) { ctx.beginPath(); ctx.ellipse(cx, 128, 60, 128, 0, 0, TAU); ctx.stroke(); }
  return tex(c);
}

function floorTexture() {
  const [c, ctx] = canvas(1024, 1024);
  const r = rng('floor');
  const plank = 1024 / 16;
  for (let i = 0; i < 16; i++) {
    let y = 0;
    while (y < 1024) {
      const len = 180 + r() * 320;
      const l = 0.2 + r() * 0.06;
      ctx.fillStyle = `hsl(26, 45%, ${l * 100}%)`;
      ctx.fillRect(i * plank, y, plank - 2, len - 2);
      for (let k = 0; k < 14; k++) { ctx.fillStyle = 'rgba(60,30,10,.12)'; ctx.fillRect(i * plank + r() * plank, y + r() * len, 1, 30 + r() * 80); }
      y += len;
    }
  }
  return tex(c);
}

function backdropTexture() {
  const [c, ctx] = canvas(64, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#030202'); g.addColorStop(0.55, '#140507'); g.addColorStop(0.8, '#22080c'); g.addColorStop(1, '#050304');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 512);
  return tex(c);
}

function beamTexture() {
  const [c, ctx] = canvas(64, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(225,29,46,0)'); g.addColorStop(0.5, 'rgba(225,29,46,.35)'); g.addColorStop(1, 'rgba(225,29,46,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = h; ctx.fillRect(0, 0, 64, 256);
  return tex(c);
}

// ---------- character ----------
const JOINTS = ['hips', 'spine', 'neck', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'];

function buildCharacter(build, ballTex) {
  const { body, look, identity } = build;
  const H = body.height * 0.0254;
  const s = H / 1.9;
  const bt = BODY_TYPES[body.bodyType];
  const wf = Math.sqrt(body.weight / idealWeight(body.height));
  const tw = bt.torso * wf, lw = bt.limb * wf, sw = bt.shoulder * (0.9 + 0.1 * wf);

  const skin = look.skin;
  const hair = HAIR_COLORS[look.hairColor] || '#111';
  const jersey = JERSEY_COLORS[look.jersey] || '#c8102e';
  const trim = look.jersey === 'Black' ? '#e11d2e' : isLight(jersey) ? '#111111' : '#ffffff';
  const shoe = SHOE_COLORS[look.shoes] || '#111';
  const tats = new Set(look.tattoos || []);
  const ink = mix(skin, '#0b0b12', 0.78);

  const disposables = [];
  const M = (opts) => { const m = new THREE.MeshStandardMaterial(opts); disposables.push(m); if (opts.map) disposables.push(opts.map); return m; };
  const G = (g) => { disposables.push(g); return g; };
  const mesh = (geo, mat, parent, pos = [0, 0, 0]) => {
    const m = new THREE.Mesh(G(geo), mat);
    m.position.set(...pos); m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const group = (parent, pos = [0, 0, 0], name) => {
    const g = new THREE.Group(); g.position.set(...pos); g.rotation.order = 'YXZ';
    if (name) g.name = name;
    parent.add(g);
    return g;
  };

  const skinMat = M({ color: skin, roughness: 0.55, metalness: 0 });
  const skinInk = (on, seed) => (on ? M({ map: skinTexture(skin, true, seed), roughness: 0.55 }) : skinMat);
  const hairMat = M({ color: hair, roughness: 0.9 });
  const shortsMat = M({ map: shortsTexture(jersey, trim), roughness: 0.75 });
  const sockMat = M({ color: '#f4f4f4', roughness: 0.9 });
  const shoeMat = M({ color: shoe, roughness: 0.4 });
  const soleMat = M({ color: shoe === '#f2f2f2' ? '#d8d8d8' : '#f2f2f2', roughness: 0.6 });
  const jerseyMat = M({
    map: jerseyTexture({ color: jersey, trim, skin, number: String(identity.number || '0'), name: identity.last || '', chestInk: tats.has('Chest'), inkColor: ink }),
    roughness: 0.7,
  });

  // proportions (meters)
  const ankleY = 0.045 * H, kneeY = 0.285 * H, hipY = 0.52 * H, shoulderY = 0.825 * H;
  const headR = 0.112 * Math.pow(s, 0.35);
  const headCY = H - headR * 1.1;
  const shoulderHalf = 0.1 * H * sw;
  const armLen = (body.wingspan * 0.0254) / 2 - shoulderHalf;
  const upperLen = armLen * 0.42, foreLen = armLen * 0.36, handLen = armLen * 0.22;
  const hipX = 0.05 * H * Math.sqrt(tw);
  const thighLen = hipY - kneeY, shinLen = kneeY - ankleY;
  const ls = Math.pow(s, 0.7);
  const upperR = 0.051 * lw * ls, foreR = 0.041 * lw * ls, thighR = 0.078 * lw * ls, shinR = 0.056 * lw * ls;

  const root = new THREE.Group();
  const J = {};
  J.hips = group(root, [0, hipY, 0]);
  // pelvis / shorts top
  const pelvis = mesh(new THREE.CylinderGeometry(0.15 * s * tw, 0.158 * s * tw, 0.13 * H, 28), shortsMat, J.hips, [0, -0.035 * H, 0]);
  pelvis.scale.z = 0.72;

  J.spine = group(J.hips, [0, 0, 0]);
  const torsoH = shoulderY - hipY + 0.025 * H;
  const hipR = 0.15 * s * tw, waistR = 0.135 * s * tw + bt.belly * 0.06 * s, chestR = shoulderHalf * 0.92;
  const prof = [hipR * 0.98, waistR, waistR * 1.02 + bt.belly * 0.02, waistR * 1.08, chestR * 0.94, chestR, chestR * 1.01, chestR * 0.9, chestR * 0.5];
  const torsoGeo = new THREE.LatheGeometry(prof.map((r, i) => new THREE.Vector2(r, (i / (prof.length - 1)) * torsoH)), 40);
  const torso = mesh(torsoGeo, jerseyMat, J.spine, [0, -0.01 * H, 0]);
  torso.scale.z = 0.66 + bt.belly * 0.6;

  const chest = group(J.spine, [0, shoulderY - hipY, 0]);
  // neck + head
  J.neck = group(chest, [0, 0.01 * H, 0]);
  const neckLen = headCY - shoulderY - headR * 0.55;
  mesh(new THREE.CylinderGeometry(0.052 * s * Math.sqrt(tw), 0.06 * s * Math.sqrt(tw), neckLen + 0.04, 20), skinInk(tats.has('Neck'), 'neck'), J.neck, [0, (neckLen + 0.04) / 2 - 0.02, 0]);
  const head = group(J.neck, [0, headCY - shoulderY - 0.01 * H, 0]);
  buildHead(head, headR, { skin, skinMat, hair, hairMat, look, M, G, mesh });

  // arms
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const sh = group(chest, [sx * shoulderHalf, -0.03 * H, 0], 'shoulder' + side);
    J['shoulder' + side] = sh;
    mesh(new THREE.SphereGeometry(upperR * 1.3, 20, 14), skinInk(tats.has(side === 'L' ? 'Left Sleeve' : 'Right Sleeve'), 'delt' + side), sh, [-sx * upperR * 0.35, -upperR * 0.1, 0]).scale.set(1.15, 0.95, 0.95);
    const sleeve = tats.has(side === 'L' ? 'Left Sleeve' : 'Right Sleeve');
    const fore = sleeve || tats.has(side === 'L' ? 'Left Forearm' : 'Right Forearm');
    mesh(new THREE.CylinderGeometry(upperR * 1.08, upperR * 0.86, upperLen, 20), skinInk(sleeve, 'upper' + side), sh, [0, -upperLen / 2, 0]);
    const el = group(sh, [0, -upperLen, 0], 'elbow' + side); J['elbow' + side] = el;
    mesh(new THREE.SphereGeometry(upperR * 0.86, 16, 12), skinMat, el);
    mesh(new THREE.CylinderGeometry(foreR * 1.05, foreR * 0.78, foreLen, 18), skinInk(fore, 'fore' + side), el, [0, -foreLen / 2, 0]);
    const wr = group(el, [0, -foreLen, 0], 'wrist' + side); J['wrist' + side] = wr;
    const hand = mesh(new THREE.CapsuleGeometry(foreR * 0.85, handLen * 0.6, 6, 12), skinMat, wr, [0, -handLen * 0.48, 0]);
    hand.scale.set(1.25, 1, 0.6);
    const thumb = mesh(new THREE.CapsuleGeometry(foreR * 0.32, handLen * 0.3, 4, 8), skinMat, wr, [sx * foreR * 0.2, -handLen * 0.32, foreR * 0.55]);
    thumb.rotation.z = sx * 0.5;
    wr.userData.palm = new THREE.Vector3(0, -handLen * 0.5, 0);
  }

  // legs
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const hp = group(J.hips, [sx * hipX, 0, 0], 'hip' + side); J['hip' + side] = hp;
    const legInk = tats.has(side === 'L' ? 'Left Leg' : 'Right Leg');
    mesh(new THREE.CylinderGeometry(thighR * 1.05, thighR * 0.72, thighLen, 20), skinInk(legInk, 'thigh' + side), hp, [0, -thighLen / 2, 0]);
    const shortLeg = mesh(new THREE.CylinderGeometry(thighR * 1.32, thighR * 1.42, thighLen * 0.72, 22, 1, true), shortsMat, hp, [sx * 0.005, -thighLen * 0.33, 0]);
    shortLeg.material.side = THREE.DoubleSide;
    const kn = group(hp, [0, -thighLen, 0], 'knee' + side); J['knee' + side] = kn;
    mesh(new THREE.SphereGeometry(thighR * 0.74, 16, 12), skinMat, kn);
    mesh(new THREE.CylinderGeometry(shinR * 1.05, shinR * 0.68, shinLen, 18), skinInk(legInk, 'shin' + side), kn, [0, -shinLen / 2, 0]);
    mesh(new THREE.CylinderGeometry(shinR * 0.78, shinR * 0.72, shinLen * 0.34, 16), sockMat, kn, [0, -shinLen * 0.83, 0]);
    const an = group(kn, [0, -shinLen, 0], 'ankle' + side); J['ankle' + side] = an;
    const footL = 0.29 * s, footW = 0.105 * Math.sqrt(s), footH = 0.085 * s;
    const shoeM = mesh(new THREE.CapsuleGeometry(footW / 2, footL - footW, 6, 14), shoeMat, an, [0, -ankleY + footH * 0.62, footL * 0.28]);
    shoeM.rotation.x = Math.PI / 2; shoeM.scale.set(1, 1, footH / footW);
    const sole = mesh(new THREE.BoxGeometry(footW * 1.02, footH * 0.22, footL * 0.98), soleMat, an, [0, -ankleY + footH * 0.12, footL * 0.28]);
    sole.receiveShadow = true;
  }

  let ball = null;
  if (ballTex) {
    ball = new THREE.Mesh(G(new THREE.SphereGeometry(BALL_R, 36, 24)), M({ map: ballTex, roughness: 0.75 }));
    disposables.pop(); // ball texture is shared, never dispose
    ball.castShadow = true;
    root.add(ball);
  }

  const rest = {};
  for (const k of JOINTS) rest[k] = J[k].position.clone();
  return { root, J, ball, rest, H, dims: { hipY, handLen, shoulderY }, dispose: () => disposables.forEach(d => d.dispose()) };
}

function buildHead(head, R, { skin, skinMat, hair, hairMat, look, M, G, mesh }) {
  const scale = [0.9, 1.1, 1.0];
  const skull = mesh(new THREE.SphereGeometry(R, 36, 28), skinMat, head);
  skull.scale.set(...scale);
  const jaw = mesh(new THREE.SphereGeometry(R, 28, 20), skinMat, head, [0, -0.42 * R, 0.16 * R]);
  jaw.scale.set(0.7, 0.55, 0.74);
  // ears
  for (const sx of [1, -1]) mesh(new THREE.SphereGeometry(R * 0.2, 12, 10), skinMat, head, [sx * 0.88 * R, 0.02 * R, -0.02 * R]).scale.set(0.42, 1, 0.65);
  // eyes
  const white = M({ color: '#f3efe8', roughness: 0.25 });
  const iris = M({ color: EYE_COLORS[look.eyeColor] || '#4a2a10', roughness: 0.2 });
  const pupil = M({ color: '#050505', roughness: 0.1 });
  const brow = M({ color: mix(hair, '#000', 0.2), roughness: 0.9 });
  for (const sx of [1, -1]) {
    const e = mesh(new THREE.SphereGeometry(R * 0.115, 16, 12), white, head, [sx * 0.31 * R, 0.1 * R, 0.83 * R]);
    e.scale.set(1.15, 0.8, 0.7);
    mesh(new THREE.SphereGeometry(R * 0.062, 14, 10), iris, head, [sx * 0.31 * R, 0.1 * R, 0.905 * R]).scale.set(1, 1, 0.5);
    mesh(new THREE.SphereGeometry(R * 0.03, 10, 8), pupil, head, [sx * 0.31 * R, 0.1 * R, 0.93 * R]).scale.set(1, 1, 0.4);
    const b = mesh(new THREE.BoxGeometry(R * 0.28, R * 0.05, R * 0.08), brow, head, [sx * 0.31 * R, 0.27 * R, 0.9 * R]);
    b.rotation.z = sx * -0.12;
  }
  // nose & mouth
  const nose = mesh(new THREE.SphereGeometry(R * 0.13, 14, 10), skinMat, head, [0, -0.1 * R, 0.98 * R]);
  nose.scale.set(1.2, 0.95, 0.8);
  const bridge = mesh(new THREE.BoxGeometry(R * 0.1, R * 0.3, R * 0.1), skinMat, head, [0, 0.04 * R, 0.95 * R]);
  bridge.rotation.x = -0.2;
  const lips = M({ color: mix(skin, '#4a1010', 0.35), roughness: 0.4 });
  const mouth = mesh(new THREE.CapsuleGeometry(R * 0.04, R * 0.24, 4, 8), lips, head, [0, -0.36 * R, 0.89 * R]);
  mouth.rotation.z = Math.PI / 2;

  // hair
  const style = look.hair;
  const cap = (k, thetaLen, tilt = -0.3, mat = hairMat) => {
    const m = mesh(new THREE.SphereGeometry(R * k, 36, 18, 0, TAU, 0, thetaLen), mat, head);
    m.scale.set(...scale); m.rotation.x = tilt;
    return m;
  };
  const thinMat = M({ color: mix(hair, skin, 0.35), roughness: 1 });
  const r = rng(style);
  const onScalp = (minY, avoidFront = true) => {
    for (let tries = 0; tries < 50; tries++) {
      const v = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      if (v.y < minY) continue;
      if (avoidFront && v.z > 0.55 && v.y < 0.6) continue;
      return v;
    }
    return new THREE.Vector3(0, 1, 0);
  };
  const along = (m, dir) => { m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); };

  switch (style) {
    case 'Bald': break;
    case 'Buzz Cut': cap(1.02, Math.PI * 0.47, -0.32, thinMat); break;
    case 'Low Fade': cap(1.025, Math.PI * 0.47, -0.32, thinMat); cap(1.07, Math.PI * 0.3, -0.25); break;
    case 'Waves': { const m = cap(1.045, Math.PI * 0.46, -0.32); m.material = M({ color: hair, roughness: 0.35, metalness: 0.1 }); break; }
    case 'High Top': {
      cap(1.03, Math.PI * 0.47, -0.32, thinMat);
      const top = mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.86, R * 0.8, 28), hairMat, head, [0, 0.82 * R, -0.08 * R]);
      top.scale.z = 1.05;
      break;
    }
    case 'Afro': {
      cap(1.04, Math.PI * 0.48, -0.32);
      const geo = new THREE.IcosahedronGeometry(R, 4);
      const p = geo.attributes.position; const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(1 + (r() - 0.5) * 0.06); p.setXYZ(i, v.x, v.y, v.z); }
      geo.computeVertexNormals();
      const fro = mesh(geo, hairMat, head, [0, 0.6 * R, -0.3 * R]);
      fro.scale.set(1.32, 1.15, 1.22);
      break;
    }
    case 'Twists': {
      cap(1.04, Math.PI * 0.48, -0.32);
      for (let i = 0; i < 46; i++) {
        const d = onScalp(0.05);
        const t = mesh(new THREE.CylinderGeometry(R * 0.06, R * 0.075, R * 0.42, 6), hairMat, head, [d.x * R * 0.98, d.y * R * 1.1, d.z * R]);
        along(t, d.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize());
        t.translateY(R * 0.15);
      }
      break;
    }
    case 'Dreads': {
      cap(1.045, Math.PI * 0.5, -0.32);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU;
        const x = Math.sin(a), z = Math.cos(a);
        if (z > 0.45) continue;
        const len = R * (1.3 + r() * 0.5);
        const d = mesh(new THREE.CylinderGeometry(R * 0.065, R * 0.055, len, 6), hairMat, head, [x * R * 0.92, 0.1 * R, z * R * 0.95]);
        d.rotation.z = -x * 0.25; d.rotation.x = z * 0.25;
        d.translateY(-len / 2 + R * 0.2);
      }
      break;
    }
    case 'Cornrows': {
      cap(1.025, Math.PI * 0.5, -0.32);
      for (let i = -3; i <= 3; i++) {
        const x = i * 0.14 * R;
        const rr = Math.sqrt(Math.max(0.01, (R * 1.05) ** 2 - x * x));
        const t = mesh(new THREE.TorusGeometry(rr, R * 0.045, 6, 30, Math.PI * 0.95), hairMat, head, [x * 0.9, 0, 0]);
        t.rotation.y = Math.PI / 2; t.rotation.z = Math.PI * 0.14; t.scale.set(1, 1.1, 1);
      }
      break;
    }
    case 'Man Bun': {
      cap(1.05, Math.PI * 0.5, -0.32);
      mesh(new THREE.SphereGeometry(R * 0.38, 16, 12), hairMat, head, [0, 0.72 * R, -0.75 * R]);
      break;
    }
    case 'Mohawk': {
      cap(1.015, Math.PI * 0.47, -0.32, thinMat);
      for (let i = 0; i < 9; i++) {
        const a = -0.35 + (i / 8) * 1.9;
        const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(-a + 0.6) * 0.0 + Math.sin(a) * -1).normalize();
        const c = mesh(new THREE.ConeGeometry(R * 0.13, R * 0.55, 8), hairMat, head, [0, dir.y * R * 1.05, -dir.z * -R * 0.95]);
        along(c, new THREE.Vector3(0, dir.y, -dir.z * -1).normalize());
        c.translateY(R * 0.12);
      }
      break;
    }
    case 'Curly Top': {
      cap(1.025, Math.PI * 0.47, -0.32, thinMat);
      for (let i = 0; i < 60; i++) {
        const d = onScalp(0.42);
        mesh(new THREE.SphereGeometry(R * (0.14 + r() * 0.06), 8, 6), hairMat, head, [d.x * R * 0.95, d.y * R * 1.08, d.z * R * 0.98 - 0.05 * R]);
      }
      break;
    }
  }

  // facial hair
  const fh = look.facialHair;
  const shell = (k, t0, tl, mat) => {
    const m = mesh(new THREE.SphereGeometry(R * k, 30, 14, Math.PI * 0.08, Math.PI * 0.84, Math.PI * t0, Math.PI * tl), mat, head);
    m.scale.set(...scale);
    return m;
  };
  const jawShell = (k, mat) => {
    const m = mesh(new THREE.SphereGeometry(R * k, 26, 14, Math.PI * 0.05, Math.PI * 0.9, Math.PI * 0.42, Math.PI * 0.58), mat, head, [0, -0.42 * R, 0.16 * R]);
    m.scale.set(0.7, 0.55, 0.74);
    return m;
  };
  const stubble = M({ color: hair, roughness: 1, transparent: true, opacity: 0.45 });
  const stache = () => { const m = mesh(new THREE.CapsuleGeometry(R * 0.045, R * 0.26, 4, 8), hairMat, head, [0, -0.26 * R, 0.93 * R]); m.rotation.z = Math.PI / 2; };
  const chin = (sz = 1) => mesh(new THREE.SphereGeometry(R * 0.16 * sz, 12, 10), hairMat, head, [0, -0.66 * R, 0.68 * R]).scale.set(1, 1.15, 0.8);
  switch (fh) {
    case 'Stubble': jawShell(1.03, stubble); shell(1.01, 0.55, 0.3, stubble); break;
    case 'Mustache': stache(); break;
    case 'Goatee': stache(); chin(); break;
    case 'Chin Strap': { const m = jawShell(1.06, hairMat); m.geometry.dispose(); m.geometry = G(new THREE.SphereGeometry(R * 1.06, 26, 6, Math.PI * 0.03, Math.PI * 0.94, Math.PI * 0.72, Math.PI * 0.1)); chin(0.8); break; }
    case 'Full Beard': jawShell(1.08, hairMat); shell(1.03, 0.56, 0.3, hairMat); stache(); break;
    case 'Big Beard': jawShell(1.2, hairMat); shell(1.06, 0.55, 0.32, hairMat); stache(); chin(2.0); break;
  }
}

// ---------- animation ----------
const sym = (name, [x, y, z]) => ({ [name + 'L']: [x, y, z], [name + 'R']: [x, -y, -z] });
const P = (...parts) => Object.assign({}, ...parts);

const STAND = P(sym('shoulder', [0.05, 0, 0.12]), sym('elbow', [-0.15, 0, 0]));
const HOLD = P(sym('shoulder', [-0.32, 0, 0.12]), sym('elbow', [-1.3, -0.55, 0]), sym('wrist', [0, 0, 0]));
const ATHLETIC = P(HOLD, { spine: [0.18, 0, 0], hips: [0, 0, 0], ...sym('hip', [-0.4, 0, 0.05]), ...sym('knee', [0.7, 0, 0]), ...sym('ankle', [-0.3, 0, 0]), root: [0, -0.07, 0] });

function idleClip() {
  return { dur: 3.2, loop: true, keys: [
    { t: 0, pose: P(HOLD, { spine: [0.02, 0, 0] }), ball: 'both' },
    { t: 0.5, pose: P(HOLD, { spine: [0.05, 0, 0], neck: [-0.03, 0.08, 0], ...sym('elbow', [-1.35, -0.55, 0]) }), ball: 'both' },
    { t: 1, pose: P(HOLD, { spine: [0.02, 0, 0] }), ball: 'both' },
  ] };
}

function jumpShotClip(p, H) {
  const set = p.set || 1, arc = p.arc || 1;
  const setPose = P({ root: [0, 0.03, 0], spine: [-0.05, 0, 0], ...sym('hip', [-0.1, 0, 0.04]), ...sym('knee', [0.15, 0, 0]),
    shoulderR: [-2.2 - 0.35 * set, 0.15, -0.1], elbowR: [-1.9, 0, 0], wristR: [0.6, 0, 0],
    shoulderL: [-2.1 - 0.3 * set, -0.35, 0.15], elbowL: [-1.4, 0.3, 0], neck: [-0.15, 0, 0] });
  const release = P({ root: [0, 0.22 * (p.jump || 1), p.fade ? -0.25 : 0], spine: [p.fade ? -0.25 : -0.08, 0, p.side ? 0.15 : 0], ...sym('hip', [-0.05, 0, 0.03]), ...sym('knee', [0.1, 0, 0]), ...sym('ankle', [0.55, 0, 0]),
    shoulderR: [-2.95, 0.05, p.side ? -0.4 : -0.05], elbowR: [-0.15, 0, 0], wristR: [-1.1, 0, 0],
    shoulderL: [-2.2, -0.2, 0.5], elbowL: [-1.1, 0.4, 0], wristL: [0.3, 0, 0], neck: [-0.25, 0, 0] });
  const flightTo = { p: [0, H * 1.8, 4.5] };
  return { dur: 2.0 / (p.speed || 1), top: 1.45, keys: [
    { t: 0, pose: HOLD, ball: 'both' },
    { t: 0.16, pose: ATHLETIC, ball: 'both' },
    { t: 0.3, pose: P(setPose, { root: [0, -0.02, 0], ...sym('knee', [0.5, 0, 0]), ...sym('hip', [-0.3, 0, 0.04]) }), ball: 'set' },
    { t: 0.4, pose: setPose, ball: 'set' },
    { t: 0.48, pose: release, ball: 'tipR' },
    { t: 0.75, pose: P(release, { root: [0, 0.08, release.root[2]] }), ball: flightTo, arc: 0.8 * arc, from: 'tipR' },
    { t: 0.76, pose: P(release, { root: [0, 0.06, release.root[2]] }), ball: 'hide' },
    { t: 0.86, pose: P(STAND, { ...sym('knee', [0.4, 0, 0]), ...sym('hip', [-0.25, 0, 0]), root: [0, -0.04, release.root[2]], shoulderR: [-2.4, 0, -0.1], elbowR: [-0.4, 0, 0], wristR: [-1.0, 0, 0] }), ball: 'hide' },
    { t: 1, pose: HOLD, ball: 'both' },
  ] };
}

function freeThrowClip(p, H) {
  const n = p.dribbles || 2;
  const keys = [{ t: 0, pose: HOLD, ball: 'both' }];
  const dribPose = P(ATHLETIC, { root: [0, -0.04, 0], shoulderR: [-0.35, 0, -0.18], elbowR: [-0.7, 0, 0], wristR: [-0.3, 0, 0], shoulderL: [-0.1, 0, 0.25], elbowL: [-0.5, 0, 0] });
  const span = 0.42;
  for (let i = 0; i < n; i++) {
    const t0 = 0.05 + (i / n) * span;
    keys.push({ t: t0, pose: dribPose, ball: 'R' });
    keys.push({ t: t0 + span / n / 2, pose: P(dribPose, { wristR: [0.5, 0, 0] }), ball: { p: [-0.18, BALL_R, 0.32] } });
  }
  const up = p.underhand;
  const set = up
    ? P(ATHLETIC, { ...sym('shoulder', [0.2, 0, 0.05]), ...sym('elbow', [-0.3, -0.3, 0]), root: [0, -0.1, 0] })
    : P(HOLD, { shoulderR: [-2.4, 0.15, -0.1], elbowR: [-1.9, 0, 0], wristR: [0.6, 0, 0], shoulderL: [-2.2, -0.35, 0.15], elbowL: [-1.4, 0.3, 0], ...sym('knee', [0.35, 0, 0]), ...sym('hip', [-0.2, 0, 0]), root: [0, -0.03, 0] });
  const rel = up
    ? P(STAND, { ...sym('shoulder', [-1.9, 0, 0.05]), ...sym('elbow', [-0.1, -0.2, 0]), root: [0, 0.03, 0], ...sym('ankle', [0.3, 0, 0]) })
    : P(STAND, { shoulderR: [-2.95, 0, -0.05], elbowR: [-0.12, 0, 0], wristR: [-1.1, 0, 0], shoulderL: [-2.4, -0.3, 0.2], elbowL: [-0.6, 0.2, 0], root: [0, 0.03, 0], ...sym('ankle', [0.3, 0, 0]) });
  keys.push({ t: 0.5, pose: HOLD, ball: 'both' });
  if (p.spin) keys.push({ t: 0.58, pose: P(HOLD, { wristL: [0, 0, 0.5], wristR: [0, 0, -0.5] }), ball: 'both', spin: 1 });
  keys.push({ t: 0.66, pose: set, ball: up ? 'both' : 'set' });
  keys.push({ t: 0.74, pose: rel, ball: up ? 'both' : 'tipR' });
  keys.push({ t: 0.9, pose: rel, ball: { p: [0, H * 1.7, 4.5] }, arc: 0.8, from: up ? 'both' : 'tipR' });
  keys.push({ t: 0.91, pose: rel, ball: 'hide' });
  keys.push({ t: 1, pose: HOLD, ball: 'both' });
  return { dur: (2.6 + n * 0.35) / (p.speed || 1), keys };
}

function dribbleClip(p, opts = {}) {
  const moves = opts.moves || 4;
  const low = p.low ?? 0.5;
  const crouch = 0.4 + (0.5 - low) * 0.8;
  const base = P({ root: [0, -0.06 - crouch * 0.08, 0], spine: [0.22 + crouch * 0.12, 0, 0], ...sym('hip', [-0.45 - crouch * 0.3, 0, 0.08]), ...sym('knee', [0.8 + crouch * 0.5, 0, 0]), ...sym('ankle', [-0.35 - crouch * 0.2, 0, 0]) });
  const handR = P({ shoulderR: [-0.3, 0, -0.32], elbowR: [-0.6, 0, 0], wristR: [-0.2, 0, 0], shoulderL: [-0.45, 0, 0.3], elbowL: [-1.25, -0.2, 0], wristL: [0.2, 0, 0] });
  const handL = P({ shoulderL: [-0.3, 0, 0.32], elbowL: [-0.6, 0, 0], wristL: [-0.2, 0, 0], shoulderR: [-0.45, 0, -0.3], elbowR: [-1.25, 0.2, 0], wristR: [0.2, 0, 0] });
  const floorX = 0.32, floorZ = 0.32;
  const keys = [{ t: 0, pose: HOLD, ball: 'both' }];
  let side = 'R';
  const n = moves * 2 + 2;
  const step = 0.86 / n;
  let t = 0.08;
  for (let i = 0; i < n; i++) {
    const cross = (opts.cross || p.cross) && i % 2 === 1;
    const legs = opts.legs && i % 3 === 2;
    const pose = side === 'R' ? handR : handL;
    const sway = side === 'R' ? -0.08 : 0.08;
    keys.push({ t, pose: P(base, pose, { hips: [0, 0, sway], root: [sway * 0.6, base.root[1], 0] }), ball: side });
    let target;
    if (legs) target = { p: [0, BALL_R, 0.0] };
    else if (cross) target = { p: [0, BALL_R, floorZ + 0.05] };
    else target = { p: [(side === 'R' ? -1 : 1) * floorX, BALL_R, floorZ] };
    const wristKey = side === 'R' ? 'wristR' : 'wristL';
    keys.push({ t: t + step * 0.5, pose: P(base, pose, { [wristKey]: [0.5, 0, 0], hips: [0, 0, sway * 0.5], root: [sway * 0.3, base.root[1] - 0.02, 0], ...(legs ? sym('hip', [-0.5, 0, 0.3]) : {}) }), ball: target });
    if (cross || legs) side = side === 'R' ? 'L' : 'R';
    t += step;
  }
  keys.push({ t: 0.96, pose: P(base, HOLD), ball: 'both' });
  keys.push({ t: 1, pose: HOLD, ball: 'both' });
  return { dur: (0.5 * n) / (p.speed || 1) + 0.5, keys };
}

function layupClip(p, H) {
  const reach = p.reach || 1;
  const run = (z, lead) => P(HOLD, { root: [0, -0.03, z], spine: [0.15, 0, 0], ['hip' + lead]: [-0.8, 0, 0.05], ['knee' + lead]: [0.9, 0, 0], ['hip' + (lead === 'L' ? 'R' : 'L')]: [0.35, 0, 0.05], ['knee' + (lead === 'L' ? 'R' : 'L')]: [0.6, 0, 0] });
  const jumpY = (p.twoFoot ? 0.38 : 0.5) * reach;
  const top = P({ root: [p.reverse ? 0.25 : 0, jumpY, 0.15], spine: [p.floater ? 0.05 : -0.1, p.reverse ? 0.6 : 0, 0], neck: [-0.4, 0, 0],
    shoulderR: [-2.95 * (p.floater ? 0.85 : 1), 0, -0.1], elbowR: [-0.1, 0, 0], wristR: [-0.6, 0, 0],
    shoulderL: [-1.3, 0, 0.4], elbowL: [-0.6, 0, 0],
    hipR: p.twoFoot ? [-0.4, 0, 0.05] : [-1.5, 0, 0.05], kneeR: p.twoFoot ? [0.9, 0, 0] : [1.7, 0, 0], hipL: [0.05, 0, 0.05], kneeL: [0.35, 0, 0], ...sym('ankle', [0.5, 0, 0]) });
  return { dur: 2.2 / (p.speed || 1), top: 1.55, keys: [
    { t: 0, pose: P(HOLD, { root: [0, 0, -1.2] }), ball: 'both' },
    { t: 0.12, pose: run(-0.9, 'L'), ball: 'both' },
    { t: 0.24, pose: run(-0.5, 'R'), ball: 'both' },
    { t: 0.36, pose: P(run(-0.15, 'L'), { root: [0, -0.1, -0.15], ...sym('knee', [1.0, 0, 0]) }), ball: 'both' },
    { t: 0.52, pose: top, ball: 'tipR' },
    { t: 0.62, pose: P(top, { root: [top.root[0], jumpY * 0.9, 0.2], wristR: [-1.2, 0, 0] }), ball: { p: [0, H * 1.25, 0.7] }, from: 'tipR', arc: 0.4 },
    { t: 0.64, pose: P(top, { root: [top.root[0], jumpY * 0.85, 0.2] }), ball: 'hide' },
    { t: 0.8, pose: P(STAND, { root: [0, -0.08, 0.25], ...sym('knee', [0.6, 0, 0]), ...sym('hip', [-0.4, 0, 0]) }), ball: 'hide' },
    { t: 1, pose: P(HOLD, { root: [0, 0, 0] }), ball: 'both' },
  ] };
}

function dunkClip(p, H) {
  const jump = (p.jump || 1) * 0.72;
  const twoHand = p.twoHand;
  const air = P({ root: [0, jump, 0.1], spine: [-0.15, 0, 0], neck: [-0.3, 0, 0],
    ...sym('hip', [-0.9, 0, 0.12]), ...sym('knee', [1.5, 0, 0]), ...sym('ankle', [0.4, 0, 0]),
    shoulderR: [-3.0, 0, -0.1], elbowR: [-0.5, 0, 0], shoulderL: twoHand ? [-3.0, 0, 0.1] : [-1.0, 0, 0.6], elbowL: twoHand ? [-0.5, 0, 0] : [-0.4, 0, 0] });
  const keys = [
    { t: 0, pose: P(HOLD, { root: [0, 0, -1.3] }), ball: 'both' },
    { t: 0.14, pose: P(HOLD, { root: [0, -0.04, -0.8], spine: [0.2, 0, 0], hipL: [-0.9, 0, 0.05], kneeL: [1.0, 0, 0], hipR: [0.4, 0, 0], kneeR: [0.6, 0, 0] }), ball: 'both' },
    { t: 0.26, pose: P(ATHLETIC, { root: [0, -0.2, -0.3], spine: [0.45, 0, 0], ...sym('knee', [1.5, 0, 0]), ...sym('hip', [-1.0, 0, 0.08]), ...sym('shoulder', [0.6, 0, 0.15]), ...sym('elbow', [-0.6, -0.3, 0]) }), ball: 'both' },
  ];
  if (p.windmill) {
    keys.push({ t: 0.38, pose: P(air, { root: [0, jump * 0.75, 0], shoulderR: [-1.0, 0, -0.5], elbowR: [-0.1, 0, 0] }), ball: 'R' });
    keys.push({ t: 0.46, pose: P(air, { root: [0, jump * 0.95, 0.05], shoulderR: [0.2, 0, -0.5], elbowR: [-0.1, 0, 0] }), ball: 'R' });
    keys.push({ t: 0.54, pose: P(air, { shoulderR: [1.9, 0, -0.35], elbowR: [-0.1, 0, 0] }), ball: 'R' });
    keys.push({ t: 0.6, pose: P(air, { shoulderR: [3.3, 0, -0.1], elbowR: [-0.3, 0, 0] }), ball: 'R' });
  } else if (p.cock) {
    keys.push({ t: 0.42, pose: P(air, { root: [0, jump * 0.85, 0], shoulderR: [-2.9, 0, -0.1], elbowR: [-2.0, 0, 0] }), ball: 'R' });
    keys.push({ t: 0.58, pose: P(air, { shoulderR: [-3.1, 0, -0.1], elbowR: [-2.3, 0, 0], spine: [-0.3, 0, 0] }), ball: 'R' });
  } else {
    keys.push({ t: 0.44, pose: P(air, { root: [0, jump * 0.85, 0.05] }), ball: twoHand ? 'over' : 'R' });
    keys.push({ t: 0.56, pose: air, ball: twoHand ? 'over' : 'R' });
  }
  const slamShoulder = p.windmill ? 4.6 : -1.7;
  const slam = P(air, { root: [0, jump * 0.9, 0.18], spine: [0.25, 0, 0], shoulderR: [slamShoulder, 0, -0.15], elbowR: [-0.3, 0, 0], ...(twoHand ? { shoulderL: [-1.7, 0, 0.15], elbowL: [-0.3, 0, 0] } : {}) });
  keys.push({ t: 0.64, pose: slam, ball: { p: [0, H * 0.95 + jump, 0.55] }, from: twoHand ? 'over' : 'R' });
  keys.push({ t: 0.74, pose: P(slam, { root: [0, jump * 0.6, 0.2] }), ball: { p: [0, BALL_R, 0.6] } });
  keys.push({ t: 0.8, pose: P(ATHLETIC, { root: [0, -0.16, 0.2], spine: [0.35, 0, 0], ...sym('knee', [1.3, 0, 0]), ...sym('hip', [-0.8, 0, 0.1]), shoulderR: [p.windmill ? 2 * Math.PI - 0.3 : -0.3, 0, -0.3], elbowR: [-0.3, 0, 0], shoulderL: [-0.3, 0, 0.3], elbowL: [-0.3, 0, 0] }), ball: { p: [0.1, H * 0.3, 0.75] }, arc: 0.15 });
  keys.push({ t: 0.86, pose: P(STAND, { root: [0, -0.05, 0.15], ...sym('knee', [0.5, 0, 0]), ...sym('hip', [-0.3, 0, 0]), shoulderR: [p.windmill ? 2 * Math.PI : 0, 0, -0.2] }), ball: { p: [0.15, BALL_R, 0.85] } });
  keys.push({ t: 1, pose: P(HOLD, { shoulderR: [p.windmill ? 2 * Math.PI - 0.32 : -0.32, 0, -0.12] }), ball: 'both' });
  return { dur: 2.6 / (0.85 + 0.15 * (p.power || 1)), top: 1.18 + jump / H, keys };
}

function passClip(p, H) {
  const keys = [{ t: 0, pose: HOLD, ball: 'both' }];
  const step = P({ ...sym('hip', [-0.1, 0, 0.05]), hipL: [-0.65, 0, 0.05], kneeL: [0.6, 0, 0], hipR: [0.25, 0, 0], kneeR: [0.3, 0, 0], root: [0, -0.05, 0.12], spine: [0.15, 0, 0] });
  let windup, release, from = 'both';
  if (p.overhead || p.lob) {
    windup = P(step, { ...sym('shoulder', [-2.9, 0, 0.12]), ...sym('elbow', [-1.6, -0.3, 0]), spine: [-0.1, 0, 0] });
    release = P(step, { ...sym('shoulder', [-2.0, 0, 0.12]), ...sym('elbow', [-0.1, -0.2, 0]), ...sym('wrist', [-0.6, 0, 0]) });
    from = 'over';
  } else if (p.flashy) {
    windup = P(step, { shoulderR: [0.3, 0, -0.35], elbowR: [-0.6, 0, 0], shoulderL: [0, 0, 0.2], spine: [0.15, 0.3, 0] });
    release = P(step, { shoulderR: [0.6, 0.9, -0.2], elbowR: [-1.4, 0, 0], wristR: [-0.5, 0, 0], spine: [0.15, -0.2, 0] });
    from = 'R';
  } else {
    windup = P(step, HOLD, { ...sym('elbow', [-1.9, -0.6, 0]), ...sym('shoulder', [-0.6, 0, 0.3]) });
    release = P(step, { ...sym('shoulder', [-1.45, 0, 0.05]), ...sym('elbow', [-0.05, -0.15, 0]), ...sym('wrist', [-0.9, 0, 0]) });
  }
  if (p.noLook) { windup.neck = [0, 0.9, 0]; release.neck = [0, 0.9, 0]; }
  keys.push({ t: 0.25, pose: windup, ball: from });
  keys.push({ t: 0.42, pose: release, ball: from === 'R' ? 'R' : from });
  keys.push({ t: 0.66, pose: release, ball: { p: [p.flashy ? 1.8 : 0, p.lob ? H * 1.1 : H * 0.6, 4.6] }, from: from === 'R' ? 'R' : from, arc: p.lob ? 1.6 : 0.15 });
  keys.push({ t: 0.67, pose: release, ball: 'hide' });
  keys.push({ t: 0.85, pose: STAND, ball: 'hide' });
  keys.push({ t: 1, pose: HOLD, ball: 'both' });
  return { dur: 1.8 / (p.speed || 1), keys };
}

export const CLIP_LABELS = { jumpShot: 'Jumper', freeThrow: 'Free Throw', dribble: 'Dribble', sizeUp: 'Size-Up', layup: 'Layup', dunk: 'Dunk', pass: 'Pass' };

function makeClip(kind, p, H) {
  switch (kind) {
    case 'jumpShot': return jumpShotClip(p, H);
    case 'freeThrow': return freeThrowClip(p, H);
    case 'dribble': return dribbleClip(p, { moves: 3 });
    case 'sizeUp': return dribbleClip({ ...p, low: 0.35, cross: true }, { moves: p.moves || 3, cross: true, legs: p.legs });
    case 'layup': return layupClip(p, H);
    case 'dunk': return dunkClip(p, H);
    case 'pass': return passClip(p, H);
    default: return idleClip();
  }
}

// ---------- stage ----------
export class PlayerStage {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#070707');
    scene.fog = new THREE.Fog('#070707', 9, 26);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);

    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x0b0b0b, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 6, 4.5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 0.5, far: 20 });
    key.shadow.bias = -0.0005;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe11d2e, 2.4); rim.position.set(-3.5, 3, -4); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff5a6a, 1.0); rim2.position.set(3.5, 2.5, -3.5); scene.add(rim2);
    const fill = new THREE.DirectionalLight(0xb8c8ff, 0.6); fill.position.set(-3, 2, 3); scene.add(fill);

    const floorTex = floorTexture(); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(4, 4);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, 0.04, 64), new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.5, metalness: 0.4 }));
    pad.position.y = 0.02; pad.receiveShadow = true; scene.add(pad);
    this.floorY = 0.04;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe11d2e });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.012, 8, 96), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.042; scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.006, 6, 96), new THREE.MeshBasicMaterial({ color: 0xe11d2e, transparent: true, opacity: 0.35 }));
    ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.01; scene.add(ring2);
    this.ring = ring;

    const back = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 14, 48, 1, true), new THREE.MeshBasicMaterial({ map: backdropTexture(), side: THREE.BackSide, fog: false }));
    back.position.y = 6; scene.add(back);
    const beamTex = beamTexture();
    for (let i = 0; i < 7; i++) {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 14), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const a = Math.PI + (i - 3) * 0.32;
      beam.position.set(Math.sin(a) * 9, 5, Math.cos(a) * 9);
      beam.lookAt(0, 5, 0); beam.rotation.z = (i - 3) * 0.06;
      scene.add(beam);
    }

    this.ballTex = ballTexture();
    this.turntable = new THREE.Group(); this.turntable.position.y = this.floorY; scene.add(this.turntable);
    this.yaw = 0.35; this.yawVel = 0; this.autoRotate = false;
    this.zoom = 1; this.view = 'full';
    this.camTarget = new THREE.Vector3(0, 1, 0); this.camDist = 6;
    this.clip = idleClip(); this.clipTime = 0; this.blendFrom = null;
    this.onClipEnd = null;

    this._bindInput();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  setBuild(build) {
    const keepYaw = this.yaw;
    if (this.char) { this.turntable.remove(this.char.root); this.char.dispose(); }
    this.char = buildCharacter(build, this.ballTex);
    this.turntable.add(this.char.root);
    this.yaw = keepYaw;
    this._applyClip(0);
  }

  play(kind, params = {}) {
    if (!this.char) return;
    this.blendFrom = this._snapshot();
    this.clip = makeClip(kind, params, this.char.H);
    this.clipKind = kind;
    this.clipTime = 0;
  }
  stop() { this.blendFrom = this._snapshot(); this.clip = idleClip(); this.clipKind = null; this.clipTime = 0; }

  setView(view) { this.view = view; }
  pause() { this.renderer.setAnimationLoop(null); }
  resume() { this.clock.getDelta(); this.renderer.setAnimationLoop(() => this._tick()); }
  setAutoRotate(on) { this.autoRotate = on; }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  _bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'pan-y';
    const pointers = new Map();
    let lastX = 0, pinch0 = 0, zoom0 = 1;
    el.addEventListener('pointerdown', e => {
      pointers.set(e.pointerId, e); el.setPointerCapture(e.pointerId);
      lastX = e.clientX; this.yawVel = 0; this.dragging = true;
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); zoom0 = this.zoom; }
    });
    el.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch0) this.zoom = THREE.MathUtils.clamp(zoom0 * pinch0 / d, 0.45, 1.6);
        return;
      }
      const dx = e.clientX - lastX; lastX = e.clientX;
      this.yaw += dx * 0.012; this.yawVel = dx * 0.012;
    });
    const up = e => { pointers.delete(e.pointerId); if (!pointers.size) this.dragging = false; pinch0 = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.45, 1.6); }, { passive: false });
  }

  _snapshot() {
    if (!this.char) return null;
    const snap = {};
    for (const k of JOINTS) { const j = this.char.J[k]; snap[k] = [wrap(j.rotation.x), wrap(j.rotation.y), wrap(j.rotation.z)]; }
    const off = this.char.J.hips.position.clone().sub(this.char.rest.hips);
    snap.root = [off.x, off.y, off.z];
    snap.ballPos = this.char.ball.position.clone();
    return snap;
  }

  _evalPose(pose, k) {
    const v = pose[k];
    if (v) return v;
    if (k === 'root') return [0, 0, 0];
    return STAND[k] || [0, 0, 0];
  }

  _anchor(a) { return anchorLocal(this.char, a); }

  _applyClip(dt) {
    const c = this.char; if (!c) return;
    const clip = this.clip;
    this.clipTime += dt;
    let u = this.clipTime / clip.dur;
    if (u >= 1) {
      if (clip.loop) { this.clipTime %= clip.dur; u = this.clipTime / clip.dur; }
      else {
        this.blendFrom = this._snapshot(); this.clip = idleClip(); this.clipTime = 0; u = 0; this.clipKind = null;
        this.onClipEnd?.();
      }
    }
    const keys = this.clip.keys;
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].t) i++;
    const A = keys[i], B = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(1e-6, B.t - A.t);
    const f = ease(THREE.MathUtils.clamp((u - A.t) / span, 0, 1));
    const blendT = this.blendFrom ? THREE.MathUtils.clamp(this.clipTime / 0.25, 0, 1) : 1;
    const bl = ease(blendT);

    for (const k of [...JOINTS, 'root']) {
      const a = this._evalPose(A.pose, k), b = this._evalPose(B.pose, k);
      let x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
      if (k === 'root') {
        if (this.blendFrom && bl < 1) { const s = this.blendFrom.root; x = s[0] + (x - s[0]) * bl; y = s[1] + (y - s[1]) * bl; z = s[2] + (z - s[2]) * bl; }
        c.J.hips.position.copy(c.rest.hips).add(new THREE.Vector3(x, y, z));
        continue;
      }
      if (this.blendFrom && bl < 1) { const s = this.blendFrom[k]; x = s[0] + (x - s[0]) * bl; y = s[1] + (y - s[1]) * bl; z = s[2] + (z - s[2]) * bl; }
      c.J[k].rotation.set(x, y, z);
    }
    if (!clip.loop || clip === this.clip) {
      // idle breathing
      if (this.clip.loop) c.J.spine.scale.setScalar(1 + Math.sin(performance.now() / 600) * 0.004);
    }
    c.root.updateMatrixWorld(true);

    // ball
    const hideA = A.ball === 'hide', hideB = B.ball === 'hide';
    if (hideA && (hideB || f < 0.999)) { c.ball.visible = false; }
    else {
      c.ball.visible = true;
      const pa = this._anchor(B.from && !hideA ? B.from : A.ball === 'hide' ? B.ball : A.ball);
      const pb = this._anchor(B.ball === 'hide' ? A.ball : B.ball);
      if (pa && pb) {
        const p = pa.lerp(pb, B.ball && B.ball.p && B.arc ? THREE.MathUtils.clamp((u - A.t) / span, 0, 1) : f);
        if (B.arc) p.y += Math.sin(Math.PI * THREE.MathUtils.clamp((u - A.t) / span, 0, 1)) * B.arc;
        if (this.blendFrom && bl < 1 && this.blendFrom.ballPos) p.lerp(this.blendFrom.ballPos, 1 - bl);
        c.ball.position.copy(p);
      }
      c.ball.rotation.x += dt * (A.ball && A.ball.p ? 8 : 1.5);
    }
    if (blendT >= 1) this.blendFrom = null;
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.dragging) {
      this.yaw += this.yawVel; this.yawVel *= 0.92;
      if (this.autoRotate) this.yaw += dt * 0.5;
    }
    this.turntable.rotation.y = this.yaw;
    if (this.frozen == null) this._applyClip(dt);
    this.ring.material.color.setHSL(0.986, 0.85, 0.48 + Math.sin(performance.now() / 500) * 0.06);

    if (this.char) {
      const H = this.char.H;
      const top = Math.max(1.12, this.clip.top || 1.12);
      let target, fit;
      if (this.view === 'face') { target = new THREE.Vector3(0, H * 0.93, 0); fit = H * 0.3; }
      else if (this.view === 'upper') { target = new THREE.Vector3(0, H * 0.74, 0); fit = H * 0.62; }
      else { target = new THREE.Vector3(0, H * top * 0.5, 0); fit = H * top * 1.08; }
      const vfov = THREE.MathUtils.degToRad(this.camera.fov);
      const aspectFit = Math.min(1, this.camera.aspect / 0.62);
      const dist = (fit / 2) / Math.tan(vfov / 2) / aspectFit * this.zoom;
      this.camTarget.lerp(target, 0.08);
      this.camDist += (dist - this.camDist) * 0.08;
      this.camera.position.set(0, this.camTarget.y + this.camDist * 0.06, this.camDist);
      this.camera.lookAt(this.camTarget);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // test hook: pause at a fraction of a clip
  freeze(kind, u, params = {}) {
    this.clip = kind === 'idle' ? idleClip() : makeClip(kind, params, this.char.H);
    this.blendFrom = null;
    this.clipTime = 0; this.frozen = null;
    this._applyClip(u * this.clip.dur);
    this.frozen = u;
  }
  unfreeze() { this.frozen = null; }
}

function wrap(a) {
  a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a;
}

// ball position (in the character root's local space) for a named anchor
export function anchorLocal(c, a) {
  const J = c.J;
  const palm = side => J['wrist' + side].localToWorld(J['wrist' + side].userData.palm.clone());
  const toLocal = v => c.root.worldToLocal(v);
  if (a === 'R' || a === 'L') {
    const p = toLocal(palm(a));
    p.y -= BALL_R * 0.95;
    return p;
  }
  if (a === 'tipR') {
    const p = toLocal(palm('R'));
    p.y += BALL_R * 0.9; p.z += 0.03;
    return p;
  }
  if (a === 'both' || a === 'set' || a === 'over') {
    const p = toLocal(palm('L')).add(toLocal(palm('R'))).multiplyScalar(0.5);
    if (a === 'both') p.z += BALL_R * 0.55;
    if (a === 'set' || a === 'over') p.y += BALL_R * 0.55;
    return p;
  }
  if (a && a.p) return new THREE.Vector3(a.p[0], a.p[1], a.p[2]);
  return null;
}

// interpolated joint rotations + root offset of a clip at normalized time u
export function samplePose(clip, u) {
  const keys = clip.keys;
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].t) i++;
  const A = keys[i], B = keys[Math.min(i + 1, keys.length - 1)];
  const f = ease(THREE.MathUtils.clamp((u - A.t) / Math.max(1e-6, B.t - A.t), 0, 1));
  const out = {};
  for (const k of [...JOINTS, 'root']) {
    const a = A.pose[k] || (k === 'root' ? [0, 0, 0] : STAND[k] || [0, 0, 0]);
    const b = B.pose[k] || (k === 'root' ? [0, 0, 0] : STAND[k] || [0, 0, 0]);
    out[k] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }
  return out;
}

export function blendPose(a, b, t) {
  const out = {};
  for (const k of [...JOINTS, 'root']) {
    const x = a[k] || [0, 0, 0], y = b[k] || [0, 0, 0];
    out[k] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  }
  return out;
}

export function applyPose(c, pose, rootY = true) {
  for (const k of JOINTS) { const v = pose[k] || STAND[k] || [0, 0, 0]; c.J[k].rotation.set(v[0], v[1], v[2]); }
  const r = pose.root || [0, 0, 0];
  c.J.hips.position.set(c.rest.hips.x + r[0], c.rest.hips.y + (rootY ? r[1] : 0), c.rest.hips.z + r[2]);
}

export { buildCharacter, makeClip, ballTexture, JOINTS, STAND, HOLD, ATHLETIC, sym, P, BALL_R, wrap };

export function animPreviewParams(build, key) {
  const def = ANIMATIONS[key];
  if (def.multi) {
    const id = build.anims[key][0];
    const it = def.items.find(i => i.id === id) || def.items[0];
    return { clip: def.clip, params: it.preview };
  }
  const it = def.items.find(i => i.id === build.anims[key]) || def.items[0];
  return { clip: def.clip, params: it.preview };
}
