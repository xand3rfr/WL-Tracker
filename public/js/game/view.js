import * as THREE from '../../vendor/three.module.min.js';
import { buildCharacter, makeClip, samplePose, applyPose, anchorLocal, ballTexture, JOINTS, STAND, HOLD, sym, P, BALL_R } from '../player3d.js';
import { COURT } from './sim.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// ---------- court ----------
const S = 2048, SPAN = 20, Z0 = -3;
const px = (x, z) => [((x + 10) / SPAN) * S, ((z - Z0) / SPAN) * S];
const m = v => (v / SPAN) * S;

function courtTexture() {
  const [c, ctx] = canvas(S, S);
  ctx.fillStyle = '#232527'; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  const [x0, z0] = px(-COURT.halfW, 0), [x1, z1] = px(COURT.halfW, COURT.len);
  ctx.fillStyle = 'rgba(14,30,20,.92)'; ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
  // key
  const [kx0, kz0] = px(-2.44, 0), [kx1, kz1] = px(2.44, 5.8);
  ctx.fillStyle = 'rgba(31,140,20,.55)'; ctx.fillRect(kx0, kz0, kx1 - kx0, kz1 - kz0);
  ctx.strokeStyle = '#eef2ee'; ctx.lineWidth = m(0.06); ctx.lineCap = 'butt';
  ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
  ctx.strokeRect(kx0, kz0, kx1 - kx0, kz1 - kz0);
  const [rx, rz] = px(COURT.rim.x, COURT.rim.z);
  // three point line
  ctx.beginPath();
  const [cx0, cz0] = px(-COURT.cornerX, 0), [, czc] = px(0, COURT.cornerZ);
  ctx.moveTo(cx0, cz0); ctx.lineTo(cx0, czc);
  const a0 = Math.atan2(COURT.cornerZ - COURT.rim.z, -COURT.cornerX), a1 = Math.atan2(COURT.cornerZ - COURT.rim.z, COURT.cornerX);
  ctx.arc(rx, rz, m(COURT.threeR), a0, a1, true);
  const [cx1] = px(COURT.cornerX, 0); ctx.lineTo(cx1, cz0);
  ctx.strokeStyle = '#39ff14'; ctx.lineWidth = m(0.07); ctx.stroke();
  ctx.strokeStyle = '#eef2ee'; ctx.lineWidth = m(0.06);
  // free throw circle + restricted arc + half court circle
  const [, ftz] = px(0, 5.8);
  ctx.beginPath(); ctx.arc(rx, ftz, m(1.83), 0, Math.PI); ctx.stroke();
  ctx.setLineDash([m(0.35), m(0.3)]); ctx.beginPath(); ctx.arc(rx, ftz, m(1.83), Math.PI, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(rx, rz, m(1.22), 0, Math.PI); ctx.stroke();
  const [, hz] = px(0, COURT.len);
  ctx.beginPath(); ctx.arc(rx, hz, m(1.83), Math.PI, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(57,255,20,.18)'; ctx.beginPath(); ctx.arc(rx, hz, m(1.8), Math.PI, TAU); ctx.fill();
  // hash marks
  for (const z of [2.13, 2.97, 3.84, 4.7]) for (const sx of [-1, 1]) { const [hx, hz2] = px(sx * 2.44, z); ctx.fillStyle = '#eef2ee'; ctx.fillRect(hx - (sx > 0 ? 0 : m(0.2)), hz2, m(0.2), m(0.06)); }
  // wordmark
  ctx.save();
  const [lx, lz] = px(0, 11.2);
  ctx.translate(lx, lz);
  ctx.font = `italic 900 ${m(0.7)}px "Barlow Condensed", Impact, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(57,255,20,.22)';
  ctx.fillText('BLACKTOP LEGENDS', 0, 0);
  ctx.restore();
  return tex(c);
}

function boardTexture() {
  const [c, ctx] = canvas(512, 300);
  ctx.clearRect(0, 0, 512, 300);
  ctx.fillStyle = 'rgba(220,235,240,.18)'; ctx.fillRect(0, 0, 512, 300);
  ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, 498, 286);
  ctx.lineWidth = 9; ctx.strokeRect(256 - 82, 300 - 60 - 126, 164, 126);
  return tex(c);
}

function fenceTexture() {
  const [c, ctx] = canvas(128, 128);
  ctx.strokeStyle = 'rgba(170,180,175,.55)'; ctx.lineWidth = 3;
  for (let i = -128; i <= 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, 128); ctx.lineTo(i + 128, 0); ctx.stroke();
  }
  const t = tex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function windowsTexture(seed) {
  const [c, ctx] = canvas(128, 256);
  ctx.fillStyle = '#07090d'; ctx.fillRect(0, 0, 128, 256);
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let y = 8; y < 256; y += 14) for (let x = 6; x < 128; x += 12) {
    if (r() < 0.35) { ctx.fillStyle = r() < 0.15 ? '#9cff7a' : r() < 0.5 ? '#ffd28a' : '#c9d6ff'; ctx.globalAlpha = 0.5 + r() * 0.5; ctx.fillRect(x, y, 6, 8); }
  }
  ctx.globalAlpha = 1;
  return tex(c);
}

function buildCourt(scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, Z0 + SPAN / 2); floor.receiveShadow = true;
  scene.add(floor);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: '#141516', roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.01; scene.add(outer);

  const dark = new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.6, metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.95, 16), dark);
  pole.position.set(0, 1.975, -0.7); pole.castShadow = true; scene.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.85), dark);
  arm.position.set(0, 3.55, 0.22); arm.castShadow = true; scene.add(arm);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.9, 16), new THREE.MeshStandardMaterial({ color: '#0f5c12', roughness: 0.8 }));
  pad.position.set(0, 0.95, -0.7); scene.add(pad);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.83, 1.07, 0.03), new THREE.MeshStandardMaterial({ map: boardTexture(), transparent: true, roughness: 0.1, metalness: 0.1 }));
  board.position.set(0, 2.9 + 0.535, COURT.boardZ - 0.015); scene.add(board);
  const rimMat = new THREE.MeshStandardMaterial({ color: '#ff5a1f', roughness: 0.35, metalness: 0.6, emissive: '#401000' });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(COURT.rimR + 0.01, 0.011, 8, 40), rimMat);
  rim.rotation.x = Math.PI / 2; rim.position.set(COURT.rim.x, COURT.rim.y, COURT.rim.z); scene.add(rim);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.15), rimMat);
  brace.position.set(0, COURT.rim.y, COURT.boardZ + 0.08); scene.add(brace);
  const net = new THREE.Mesh(new THREE.CylinderGeometry(COURT.rimR, 0.13, 0.42, 14, 4, true), new THREE.MeshBasicMaterial({ color: '#f4f4f4', wireframe: true, transparent: true, opacity: 0.85 }));
  net.position.set(COURT.rim.x, COURT.rim.y - 0.21, COURT.rim.z); scene.add(net);

  // fence
  const fmat = new THREE.MeshBasicMaterial({ map: fenceTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const addFence = (w, x, z, ry) => {
    const t = fmat.map.clone(); t.needsUpdate = true; t.repeat.set(w / 1.2, 4 / 1.2);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    f.position.set(x, 2, z); f.rotation.y = ry; scene.add(f);
  };
  addFence(19, 0, -2.6, 0); addFence(21, -9.5, 7.9, Math.PI / 2); addFence(21, 9.5, 7.9, Math.PI / 2);
  for (const [x, z] of [[-9.5, -2.6], [9.5, -2.6], [-9.5, 4], [9.5, 4], [-9.5, 11], [9.5, 11], [-9.5, 18.4], [9.5, 18.4], [-4.7, -2.6], [4.7, -2.6]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.1, 8), dark); post.position.set(x, 2.05, z); scene.add(post);
  }
  // light poles
  const headMat = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
  for (const [x, z] of [[-10.5, 0.5], [10.5, 0.5], [-10.5, 13], [10.5, 13]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 8.5, 10), dark); p.position.set(x, 4.25, z); scene.add(p);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 0.6), headMat); head.position.set(x * 0.93, 8.5, z); head.lookAt(0, 0, 6); scene.add(head);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff6d0', transparent: true, opacity: 0.12, depthWrite: false }));
    glow.position.copy(head.position); scene.add(glow);
  }
  // skyline
  for (let i = 0; i < 26; i++) {
    const w = 4 + Math.random() * 7, h = 10 + Math.random() * 30, d = 6;
    const a = -Math.PI * 0.62 + (i / 25) * Math.PI * 1.24;
    const r = 38 + Math.random() * 14;
    const t = windowsTexture(i * 77 + 3); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 8, h / 16);
    const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ map: t, fog: true }));
    bld.position.set(Math.sin(a) * r, h / 2 - 1, 6 - Math.cos(a) * r);
    bld.lookAt(0, h / 2 - 1, 6);
    scene.add(bld);
  }
  return { net, rim };
}

// ---------- poses ----------
const DEF_STANCE = P({ root: [0, -0.12, 0], spine: [0.28, 0, 0], ...sym('hip', [-0.55, 0, 0.18]), ...sym('knee', [0.95, 0, 0]), ...sym('ankle', [-0.4, 0, 0]),
  ...sym('shoulder', [-0.45, 0, 0.95]), ...sym('elbow', [-0.55, 0, 0]) });
const JUMP_UP = P({ ...sym('shoulder', [-3.0, 0, 0.18]), ...sym('elbow', [-0.2, 0, 0]), ...sym('hip', [-0.25, 0, 0.05]), ...sym('knee', [0.5, 0, 0]), ...sym('ankle', [0.45, 0, 0]), neck: [-0.35, 0, 0] });
const REACH = P({ spine: [0.4, 0, 0], shoulderR: [-1.45, 0.2, -0.15], elbowR: [-0.15, 0, 0], shoulderL: [-0.4, 0, 0.5], elbowL: [-0.6, 0, 0], ...sym('hip', [-0.5, 0, 0.1]), ...sym('knee', [0.7, 0, 0]), root: [0, -0.08, 0] });

function locomotion(p, base, hasBall, defense, time) {
  const speed = Math.hypot(p.vx, p.vz);
  const k = clamp(speed / 4.6, 0, 1);
  const stride = 1.25 * (p.h / 1.95) * (defense ? 0.7 : 1);
  const ph = (p.gait / stride) * Math.PI;
  const s = Math.sin(ph), c = Math.cos(ph);
  const pose = defense ? P(DEF_STANCE) : hasBall ? P(STAND) : P(STAND);
  const amp = defense ? 0.35 : 0.85;
  pose.hipL = [(pose.hipL?.[0] || 0) - amp * k * s, 0, pose.hipL?.[2] || 0.03];
  pose.hipR = [(pose.hipR?.[0] || 0) + amp * k * s, 0, pose.hipR?.[2] || -0.03];
  pose.kneeL = [(pose.kneeL?.[0] || 0.05) + k * (0.35 + 0.75 * Math.max(0, c)), 0, 0];
  pose.kneeR = [(pose.kneeR?.[0] || 0.05) + k * (0.35 + 0.75 * Math.max(0, -c)), 0, 0];
  pose.root = [0, (pose.root?.[1] || 0) - 0.03 * k + 0.035 * k * Math.abs(s), 0];
  pose.spine = [(pose.spine?.[0] || 0.03) + 0.16 * k, 0, 0];
  if (!defense) {
    pose.shoulderL = [0.55 * k * s + 0.05, 0, 0.12]; pose.shoulderR = [-0.55 * k * s + 0.05, 0, -0.12];
    pose.elbowL = [-0.25 - 0.6 * k, 0, 0]; pose.elbowR = [-0.25 - 0.6 * k, 0, 0];
  } else {
    pose.shoulderL = [-0.45, 0, 0.95 + 0.08 * Math.sin(time * 5)]; pose.shoulderR = [-0.45, 0, -0.95 - 0.08 * Math.sin(time * 5 + 1)];
  }
  if (hasBall) {
    const dk = 0.5 + 0.5 * k;
    pose.spine = [pose.spine[0] + 0.1, 0, 0];
    pose.shoulderR = [-0.35 - 0.2 * dk, 0, -0.32];
    pose.elbowR = [-0.55 - 0.2 * Math.sin(time * TAU * (2.2 + speed * 0.3)), 0, 0];
    pose.wristR = [-0.2, 0, 0];
    pose.shoulderL = [-0.55, 0, 0.32]; pose.elbowL = [-1.15, -0.2, 0];
  }
  return pose;
}

export class CourtView {
  constructor(container, game) {
    this.container = container;
    this.game = game;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#060810');
    scene.fog = new THREE.Fog('#060810', 26, 70);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xb9c8ff, 0x1a1a1a, 0.9));
    const key = new THREE.DirectionalLight(0xfff4dd, 2.3);
    key.position.set(6, 14, 10); key.target.position.set(0, 0, 6); scene.add(key.target);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 12, bottom: -12, near: 1, far: 40 });
    key.shadow.bias = -0.0004;
    scene.add(key);
    const rimL = new THREE.DirectionalLight(0x39ff14, 0.7); rimL.position.set(-8, 5, -6); scene.add(rimL);
    const fill = new THREE.DirectionalLight(0xaab8ff, 0.5); fill.position.set(-6, 6, 14); scene.add(fill);

    this.court = buildCourt(scene);
    this.ballTex = ballTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ map: this.ballTex, roughness: 0.7 }));
    this.ball.castShadow = true; scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; scene.add(this.ballShadow);

    this.chars = new Map();
    for (const p of game.players) this.addPlayer(p);
    this.camPos = new THREE.Vector3(0, 8, 21); this.camLook = new THREE.Vector3(0, 1.3, 6);
    this.netKick = 0;
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(container);
    this.resize();
  }

  addPlayer(p) {
    const g = this.game;
    const userJersey = g.user.build.look.jersey;
    const oppJersey = ({ Black: 'White', White: 'Black', Volt: 'Purple', Red: 'Royal', Royal: 'Red', Navy: 'Gold', Purple: 'Volt', Gold: 'Navy', Teal: 'Orange', Orange: 'Teal' })[userJersey] || 'White';
    const build = JSON.parse(JSON.stringify(p.build));
    build.look.jersey = p.team === 0 ? userJersey : oppJersey;
    const c = buildCharacter(build, null);
    this.scene.add(c.root);
    const ringColor = p.isUser ? 0x39ff14 : p.team === 0 ? 0x5ad1ff : 0xff4d5e;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: p.isUser ? 0.95 : 0.6, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; this.scene.add(ring);
    let arrow = null;
    if (p.isUser) {
      arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 4), new THREE.MeshBasicMaterial({ color: 0x39ff14 }));
      arrow.rotation.x = Math.PI; this.scene.add(arrow);
    }
    this.chars.set(p.id, { c, ring, arrow, pose: null });
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  playerPose(p, ch, time) {
    const g = this.game, b = g.ball;
    const hasBall = b.state === 'held' && b.holder === p;
    const defense = g.phase === 'live' && p.team !== g.poss && b.state !== 'loose' && !(b.state === 'air' && b.flight.kind === 'shot');
    let pose, anchor = null;
    if (p.state === 'jumper' && p.shot) {
      const s = p.shot;
      ch.shotClip = ch.shotClip || makeClip('jumpShot', s.anim || {}, p.h);
      const u = s.released ? 0.48 + 0.42 * clamp((p.st - s.relT) / 0.5, 0, 1) : 0.16 + 0.24 * clamp(p.st / s.ideal, 0, 1);
      pose = samplePose(ch.shotClip, u);
      anchor = s.released ? null : u < 0.28 ? 'both' : 'set';
    } else if (p.state === 'finish' && p.finish) {
      const f = p.finish;
      ch.finClip = ch.finClip || makeClip(f.kind === 'dunk' ? 'dunk' : 'layup', f.anim || {}, p.h);
      const k = clamp(p.st / f.dur, 0, 1);
      const relK = f.rel / f.dur;
      const [a, rel, z] = f.kind === 'dunk' ? [0.26, 0.64, 0.86] : [0.36, 0.52, 0.8];
      const u = k < relK ? a + (rel - a) * (k / relK) : rel + (z - rel) * ((k - relK) / (1 - relK));
      pose = samplePose(ch.finClip, u);
      anchor = f.released ? null : f.kind === 'dunk' ? (f.anim?.twoHand ? 'over' : u > 0.3 ? 'R' : 'both') : u > 0.45 ? 'tipR' : 'both';
    } else {
      ch.shotClip = null; ch.finClip = null;
      if (p.state === 'jump') pose = P(JUMP_UP);
      else if (p.state === 'reach') pose = P(REACH);
      else if (p.state === 'pass') {
        ch.passClip = ch.passClip || makeClip('pass', {}, p.h);
        pose = samplePose(ch.passClip, 0.25 + 0.4 * clamp(p.st / 0.32, 0, 1));
      } else if (hasBall && (g.phase === 'check' || Math.hypot(p.vx, p.vz) < 0.3 && g.phase !== 'live')) { pose = P(HOLD); anchor = 'both'; }
      else { pose = locomotion(p, null, hasBall, defense, time); if (hasBall) anchor = 'dribble'; }
    }
    if (p.state !== 'pass') ch.passClip = null;
    // jumps come from the sim, keep only crouches from the clip
    pose.root = [0, Math.min(0, pose.root?.[1] || 0), 0];
    return { pose, anchor };
  }

  update(dt, time) {
    const g = this.game;
    const blend = 1 - Math.exp(-dt * 16);
    for (const p of g.players) {
      const ch = this.chars.get(p.id);
      const { pose, anchor } = this.playerPose(p, ch, time);
      ch.pose = ch.pose ? blendPoseSafe(ch.pose, pose, blend) : pose;
      const { c, ring, arrow } = ch;
      c.root.position.set(p.x, p.y, p.z);
      c.root.rotation.y = p.facing;
      applyPose(c, ch.pose);
      c.root.updateMatrixWorld(true);
      ch.anchor = anchor;
      ring.position.x = p.x; ring.position.z = p.z;
      if (arrow) { arrow.position.set(p.x, p.h + p.y + 0.3 + Math.sin(time * 4) * 0.04, p.z); }
    }
    // ball
    const b = g.ball;
    const bm = this.ball;
    if (b.state === 'held') {
      const ch = this.chars.get(b.holder.id);
      let local;
      if (ch.anchor === 'dribble') {
        const p = b.holder;
        const freq = 2.0 + Math.hypot(p.vx, p.vz) * 0.25;
        const ph = (time * freq) % 1;
        const hand = anchorLocal(ch.c, 'R');
        const floor = new THREE.Vector3(hand.x - 0.05, BALL_R, hand.z + 0.25 + Math.hypot(p.vx, p.vz) * 0.08);
        const t = ph < 0.5 ? ph * 2 : 2 - ph * 2;
        local = hand.clone().lerp(floor, t * t * (3 - 2 * t) * 0.6 + t * 0.4);
        if (ch.lastPh != null && ph < ch.lastPh) this.onDribble?.();
        ch.lastPh = ph;
      } else local = anchorLocal(ch.c, ch.anchor || 'both');
      const w = ch.c.root.localToWorld(local);
      bm.position.lerp(w, bm.userData.snap ? 1 : 0.6);
      bm.userData.snap = true;
      bm.rotation.x += dt * 4;
    } else {
      bm.position.set(b.x, b.y, b.z);
      bm.userData.snap = false;
      bm.rotation.x += dt * (b.state === 'air' ? 10 : 3);
    }
    this.ballShadow.position.set(bm.position.x, 0.01, bm.position.z);
    this.ballShadow.material.opacity = clamp(0.4 - bm.position.y * 0.08, 0.05, 0.4);

    // net
    if (this.netKick > 0) {
      this.netKick = Math.max(0, this.netKick - dt * 2.2);
      const s = 1 + Math.sin(this.netKick * 22) * 0.18 * this.netKick;
      this.court.net.scale.set(1 / s, s, 1 / s);
    }

    // camera follows the ball a little; pull back on narrow screens
    const asp = this.camera.aspect;
    const narrow = asp < 1;
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const wantW = narrow ? 9.5 : 15;
    const hHalf = Math.atan(Math.tan(vf / 2) * asp);
    const dist = clamp((wantW / 2) / Math.tan(hHalf), 9, 22);
    const bx = clamp(bm.position.x, -6, 6), bz = clamp(bm.position.z, 1, 12);
    const follow = narrow ? 0.75 : 0.35;
    const targetPos = new THREE.Vector3(bx * follow, 3.2 + dist * 0.42, 5.5 + bz * 0.25 + dist * 0.82);
    const targetLook = new THREE.Vector3(bx * follow * 0.9, 1.0, 4.4 + bz * 0.3);
    this.camPos.lerp(targetPos, 1 - Math.exp(-dt * 3));
    this.camLook.lerp(targetLook, 1 - Math.exp(-dt * 3));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.renderer.render(this.scene, this.camera);
  }

  // screen position of a world point (for HUD overlays)
  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, visible: v.z < 1 };
  }

  dispose() {
    this._ro.disconnect();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function blendPoseSafe(a, b, t) {
  const out = {};
  for (const k of [...JOINTS, 'root']) {
    const y = b[k] || STAND[k] || [0, 0, 0];
    const x = a[k] || y;
    const v = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      let d = y[i] - x[i];
      // windmill dunks swing past ±π; take the short way back afterwards
      if (Math.abs(d) > Math.PI && k !== 'root') d = Math.atan2(Math.sin(d), Math.cos(d));
      v[i] = x[i] + d * t;
    }
    out[k] = v;
  }
  return out;
}
