import * as THREE from '../../vendor/three.module.min.js';
import { EffectComposer } from '../../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from '../../vendor/jsm/postprocessing/GTAOPass.js';
import { buildCharacter, DETAIL, makeClip, samplePose, applyPose, anchorLocal, ballTexture, ballSurface, JOINTS, STAND, HOLD, sym, P, BALL_R } from '../player3d.js';
import { COURT } from './sim.js';
import { tex as T, nightEnvironment } from './assets.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

export const QUALITY = {
  low: { pixelRatio: 1, shadowMap: 1024, post: false, ao: false, msaa: 0 },
  medium: { pixelRatio: 1.5, shadowMap: 2048, post: true, ao: false, msaa: 4 },
  high: { pixelRatio: 2, shadowMap: 2048, post: true, ao: true, msaa: 4 },
};

// ---------- court paint (lines + acrylic over the asphalt) ----------
const S = 2048, SPAN = 20, Z0 = -3;
const px = (x, z) => [((x + 10) / SPAN) * S, ((z - Z0) / SPAN) * S];
const m = v => (v / SPAN) * S;

function paintTexture() {
  const [c, ctx] = canvas(S, S);
  ctx.clearRect(0, 0, S, S);
  const [x0, z0] = px(-COURT.halfW, 0), [x1, z1] = px(COURT.halfW, COURT.len);
  ctx.fillStyle = 'rgba(26,23,28,.9)'; ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
  const [kx0, kz0] = px(-2.44, 0), [kx1, kz1] = px(2.44, 5.8);
  ctx.fillStyle = 'rgba(150,16,30,.9)'; ctx.fillRect(kx0, kz0, kx1 - kx0, kz1 - kz0);
  const [rx, rz] = px(COURT.rim.x, COURT.rim.z);
  const [, hz] = px(0, COURT.len);
  ctx.fillStyle = 'rgba(150,16,30,.75)'; ctx.beginPath(); ctx.arc(rx, hz, m(1.8), Math.PI, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(238,236,230,.95)'; ctx.lineWidth = m(0.05); ctx.lineCap = 'butt';
  ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
  ctx.strokeRect(kx0, kz0, kx1 - kx0, kz1 - kz0);
  ctx.beginPath();
  const [cx0, cz0] = px(-COURT.cornerX, 0), [, czc] = px(0, COURT.cornerZ);
  ctx.moveTo(cx0, cz0); ctx.lineTo(cx0, czc);
  const a0 = Math.atan2(COURT.cornerZ - COURT.rim.z, -COURT.cornerX), a1 = Math.atan2(COURT.cornerZ - COURT.rim.z, COURT.cornerX);
  ctx.arc(rx, rz, m(COURT.threeR), a0, a1, true);
  const [cx1] = px(COURT.cornerX, 0); ctx.lineTo(cx1, cz0);
  ctx.stroke();
  const [, ftz] = px(0, 5.8);
  ctx.beginPath(); ctx.arc(rx, ftz, m(1.83), 0, Math.PI); ctx.stroke();
  ctx.setLineDash([m(0.35), m(0.3)]); ctx.beginPath(); ctx.arc(rx, ftz, m(1.83), Math.PI, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(rx, rz, m(1.22), 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(rx, hz, m(1.83), Math.PI, TAU); ctx.stroke();
  for (const z of [2.13, 2.97, 3.84, 4.7]) for (const sx of [-1, 1]) { const [hx, hz2] = px(sx * 2.44, z); ctx.fillStyle = 'rgba(238,236,230,.95)'; ctx.fillRect(hx - (sx > 0 ? 0 : m(0.2)), hz2, m(0.2), m(0.05)); }
  // stenciled court number
  ctx.save();
  const [lx, lz] = px(0, 11.4);
  ctx.translate(lx, lz);
  ctx.font = `italic 900 ${m(0.62)}px "Barlow Condensed", Impact, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(238,236,230,.55)';
  ctx.fillText('COURT 7', 0, 0);
  ctx.restore();
  // years of sneakers and weather: scuffs, wear and chipped paint
  ctx.globalCompositeOperation = 'destination-out';
  const r = rng(7);
  for (let i = 0; i < 26000; i++) { ctx.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.35})`; ctx.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3); }
  for (let i = 0; i < 260; i++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), rad = m(0.05 + r() * 0.35);
    const g = ctx.createRadialGradient(x, z, 0, x, z, rad);
    g.addColorStop(0, `rgba(0,0,0,${0.25 + r() * 0.5})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, z, rad, 0, TAU); ctx.fill();
  }
  // heavy traffic wears the paint around the key and the top of the arc
  for (const [cx, cz, rr] of [[0, 5.8, 2.6], [0, 9.2, 2.2], [0, 2.4, 2]]) {
    const [gx, gz] = px(cx, cz);
    const g = ctx.createRadialGradient(gx, gz, 0, gx, gz, m(rr));
    g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(gx - m(rr), gz - m(rr), m(rr * 2), m(rr * 2));
  }
  ctx.globalCompositeOperation = 'source-over';
  return tex(c);
}

function boardTexture() {
  const [c, ctx] = canvas(512, 300);
  ctx.clearRect(0, 0, 512, 300);
  ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, 500, 288);
  ctx.lineWidth = 9; ctx.strokeRect(256 - 82, 300 - 58 - 126, 164, 126);
  return tex(c);
}

function netTexture() {
  const [c, ctx] = canvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let i = -256; i <= 512; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 256, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, 256); ctx.lineTo(i + 256, 0); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

function signTexture(text, color) {
  const [c, ctx] = canvas(1024, 256);
  ctx.clearRect(0, 0, 1024, 256);
  ctx.font = 'italic 900 170px "Barlow Condensed", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color; ctx.lineWidth = 14; ctx.strokeText(text, 512, 132);
  ctx.fillStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(text, 512, 132);
  return tex(c);
}

function skyTexture() {
  const [c, ctx] = canvas(64, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#010104'); g.addColorStop(0.5, '#060812'); g.addColorStop(0.72, '#1a1020'); g.addColorStop(0.82, '#2a1218'); g.addColorStop(1, '#0b0a0d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 512);
  return tex(c);
}

function windowsTexture(seed) {
  const [c, ctx] = canvas(128, 256);
  ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, 128, 256);
  const r = rng(seed);
  for (let y = 10; y < 256; y += 22) for (let x = 8; x < 128; x += 20) {
    if (r() < 0.22) { ctx.fillStyle = r() < 0.12 ? '#ff6b78' : r() < 0.55 ? '#ffcf86' : '#bfd0ff'; ctx.globalAlpha = 0.35 + r() * 0.5; ctx.fillRect(x, y, 9, 12); }
  }
  ctx.globalAlpha = 1;
  return tex(c);
}

function shotClockTexture() {
  const [c, ctx] = canvas(128, 64);
  const t = tex(c);
  t.draw = v => {
    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 128, 64);
    ctx.font = 'bold 54px "Barlow Condensed", Impact, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = v <= 5 ? '#ff2a2a' : '#ff8a1f'; ctx.fillText(String(v), 64, 34);
    t.needsUpdate = true;
  };
  t.draw(20);
  return t;
}

function buildCourt(scene, quality) {
  const out = { lamps: [], spots: [] };
  const metal = new THREE.MeshStandardMaterial({ color: '#3a3d42', map: T('metal_color.jpg', { repeat: 2, srgb: true }), normalMap: T('metal_normal.jpg', { repeat: 2 }), roughnessMap: T('metal_rough.jpg', { repeat: 2 }), metalness: 0.85, roughness: 0.55 });
  const paintedMetal = new THREE.MeshPhysicalMaterial({ color: '#1c1d20', roughness: 0.42, metalness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.4, normalMap: T('metal_normal.jpg', { repeat: 3 }) });

  // asphalt lot with the painted court on top
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), new THREE.MeshStandardMaterial({
    color: '#77777a', map: T('asphalt_color.jpg', { repeat: 22, srgb: true }), normalMap: T('asphalt_normal.jpg', { repeat: 22 }), roughnessMap: T('asphalt_rough.jpg', { repeat: 22 }), roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2),
  }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 7); ground.receiveShadow = true; scene.add(ground);
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), new THREE.MeshStandardMaterial({
    map: paintTexture(), transparent: true, depthWrite: false, roughness: 0.75, metalness: 0,
    normalMap: T('asphalt_normal.jpg', { repeat: SPAN / (70 / 22) }), normalScale: new THREE.Vector2(0.9, 0.9), polygonOffset: true, polygonOffsetFactor: -2,
  }));
  paint.rotation.x = -Math.PI / 2; paint.position.set(0, 0.003, Z0 + SPAN / 2); paint.receiveShadow = true; scene.add(paint);
  // sidewalk around the fence
  const concrete = new THREE.MeshStandardMaterial({ color: '#8a8a8c', map: T('concrete_color.jpg', { repeat: [8, 1], srgb: true }), normalMap: T('concrete_normal.jpg', { repeat: [8, 1] }), roughness: 0.95 });
  for (const [w, d, x, z] of [[26, 2.4, 0, -4], [2.4, 26, -11, 7.5], [2.4, 26, 11, 7.5]]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), concrete);
    slab.position.set(x, 0.06, z); slab.receiveShadow = true; scene.add(slab);
  }

  // hoop
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.95, 0.2), paintedMetal);
  pole.position.set(0, 1.975, -0.75); pole.castShadow = true; scene.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.9), paintedMetal);
  arm.position.set(0, 3.62, 0.2); arm.castShadow = true; scene.add(arm);
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), paintedMetal);
  strut.position.set(0, 3.1, 0.12); strut.rotation.x = -0.6; strut.castShadow = true; scene.add(strut);
  const padMat = new THREE.MeshPhysicalMaterial({ color: '#8e0f1c', roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ff5a6a'), normalMap: T('leather_normal.jpg', { repeat: [2, 4] }) });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.9, 0.34), padMat);
  pad.position.set(0, 0.95, -0.75); pad.castShadow = true; scene.add(pad);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.7), paintedMetal); base.position.set(0, 0.04, -0.75); scene.add(base);
  const glass = new THREE.MeshPhysicalMaterial({ color: '#e8f2f6', transparent: true, opacity: 0.18, roughness: 0.04, metalness: 0, clearcoat: 1, envMapIntensity: 2.2, depthWrite: false });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.83, 1.07, 0.025), glass);
  board.position.set(0, 2.9 + 0.535, COURT.boardZ - 0.015); scene.add(board);
  const boardLines = new THREE.Mesh(new THREE.PlaneGeometry(1.83, 1.07), new THREE.MeshBasicMaterial({ map: boardTexture(), transparent: true, depthWrite: false }));
  boardLines.position.set(0, 2.9 + 0.535, COURT.boardZ + 0.001); scene.add(boardLines);
  const frameMat = new THREE.MeshStandardMaterial({ color: '#18191b', metalness: 0.7, roughness: 0.35 });
  for (const [w, h, x, y] of [[1.87, 0.03, 0, 3.97], [1.87, 0.03, 0, 2.9], [0.03, 1.1, -0.93, 3.435], [0.03, 1.1, 0.93, 3.435]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat); f.position.set(x, y, COURT.boardZ - 0.015); scene.add(f);
  }
  const boardPad = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.06, 0.07), padMat); boardPad.position.set(0, 2.88, COURT.boardZ - 0.01); scene.add(boardPad);
  // shot clock on top of the backboard
  const clockTex = shotClockTexture();
  const clockBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.16), frameMat); clockBox.position.set(0, 4.13, COURT.boardZ - 0.05); scene.add(clockBox);
  const clockFace = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.19), new THREE.MeshStandardMaterial({ map: clockTex, emissiveMap: clockTex, emissive: '#ffffff', emissiveIntensity: 2.4, roughness: 0.3 }));
  clockFace.position.set(0, 4.13, COURT.boardZ + 0.032); scene.add(clockFace);
  out.clock = clockTex;
  // rim + net
  const rimMat = new THREE.MeshPhysicalMaterial({ color: '#e04a14', roughness: 0.42, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(COURT.rimR + 0.01, 0.0105, 10, 48), rimMat);
  rim.rotation.x = Math.PI / 2; rim.position.set(COURT.rim.x, COURT.rim.y, COURT.rim.z); rim.castShadow = true; scene.add(rim);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.025, 0.16), rimMat);
  brace.position.set(0, COURT.rim.y - 0.005, COURT.boardZ + 0.08); scene.add(brace);
  const netTex = netTexture();
  const netGeo = new THREE.CylinderGeometry(COURT.rimR, 0.13, 0.44, 32, 8, true);
  const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ color: '#f1f0ec', alphaMap: netTex, alphaTest: 0.45, transparent: false, side: THREE.DoubleSide, roughness: 0.9 }));
  net.position.set(COURT.rim.x, COURT.rim.y - 0.22, COURT.rim.z); net.castShadow = true; scene.add(net);
  net.userData.base = Float32Array.from(netGeo.attributes.position.array);
  out.net = net; out.rim = rim;

  // chain-link fence with top rails and posts
  const fenceMat = new THREE.MeshStandardMaterial({
    color: '#b9bcc0', map: T('fence_color.jpg', { repeat: [12, 3], srgb: true, rotation: Math.PI / 4 }), alphaMap: T('fence_alpha.jpg', { repeat: [12, 3], rotation: Math.PI / 4 }),
    normalMap: T('fence_normal.jpg', { repeat: [12, 3], rotation: Math.PI / 4 }), alphaTest: 0.5, metalness: 0.75, roughness: 0.45, side: THREE.DoubleSide,
  });
  const H = 3.6;
  const fence = (w, x, z, ry) => {
    const mat = fenceMat.clone();
    const rep = [Math.round(w / 0.9), Math.round(H / 0.9)], rot = Math.PI / 4;
    mat.map = T('fence_color.jpg', { repeat: rep, srgb: true, rotation: rot }); mat.alphaMap = T('fence_alpha.jpg', { repeat: rep, rotation: rot }); mat.normalMap = T('fence_normal.jpg', { repeat: rep, rotation: rot });
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mat);
    f.position.set(x, H / 2 + 0.05, z); f.rotation.y = ry; f.castShadow = true; scene.add(f);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, w, 8), metal);
    rail.rotation.z = Math.PI / 2; rail.position.set(x, H + 0.05, z); rail.rotation.y = ry; scene.add(rail);
  };
  fence(19, 0, -2.6, 0); fence(21, -9.5, 7.9, Math.PI / 2); fence(21, 9.5, 7.9, Math.PI / 2);
  for (const [x, z] of [[-9.5, -2.6], [9.5, -2.6], [-9.5, 2.6], [9.5, 2.6], [-9.5, 7.9], [9.5, 7.9], [-9.5, 13.2], [9.5, 13.2], [-9.5, 18.4], [9.5, 18.4], [-4.75, -2.6], [4.75, -2.6], [0, -2.6]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, H + 0.15, 10), metal); post.position.set(x, (H + 0.15) / 2, z); post.castShadow = true; scene.add(post);
  }

  // benches on the sideline
  const wood = new THREE.MeshStandardMaterial({ color: '#5b3a26', roughness: 0.8, normalMap: T('concrete_normal.jpg', { repeat: [4, 1] }) });
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 2.4), wood); seat.position.y = 0.46; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 2.4), wood); back.position.set(sx * 0.2, 0.75, 0); g.add(back);
    for (const z of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.05), paintedMetal); leg.position.set(0, 0.23, z); g.add(leg); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(sx * 8.7, 0, 9.5); scene.add(g);
  }

  // neon sign on the back fence
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: signTexture('BLACKTOP', '#ff2440'), transparent: true, depthWrite: false, color: new THREE.Color(3, 3, 3) }));
  neon.position.set(-5.6, 2.7, -2.5); scene.add(neon);
  const neonGlow = new THREE.PointLight('#ff2440', 3, 6, 2); neonGlow.position.set(-5.6, 2.7, -2.1); scene.add(neonGlow);
  out.neon = [neon, neonGlow];

  // floodlights: real spot lights, glowing heads and a faint beam
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe9c4', transparent: true, opacity: 0.012, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  for (const [x, z] of [[-10.8, 1], [10.8, 1], [-10.8, 13], [10.8, 13]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 9, 12), metal); p.position.set(x, 4.5, z); p.castShadow = true; scene.add(p);
    const headPos = new THREE.Vector3(x * 0.95, 9, z);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.7), paintedMetal); housing.position.copy(headPos); housing.lookAt(0, 0, 7); scene.add(housing);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.55), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7.4, 6.4) }));
    lens.position.copy(headPos); lens.lookAt(0, 0, 7); lens.translateZ(0.16); scene.add(lens);
    const spot = new THREE.SpotLight('#ffe8c8', 55, 34, 0.62, 0.6, 1.8);
    spot.position.copy(headPos); spot.target.position.set(x * 0.15, 0, z * 0.6 + 2.6); scene.add(spot, spot.target);
    const beamLen = headPos.distanceTo(spot.target.position);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(0.5) * beamLen, beamLen, 24, 1, true), beamMat);
    beam.position.copy(headPos).lerp(spot.target.position, 0.5);
    beam.lookAt(spot.target.position); beam.rotateX(-Math.PI / 2);
    beam.visible = !!quality.ao;
    scene.add(beam);
    out.lamps.push({ lens, spot, beam, on: 1 });
  }

  // night sky, stars and the skyline
  const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.set(0, 0, 7); scene.add(sky);
  const r = rng(11), starPos = [];
  for (let i = 0; i < 900; i++) {
    const a = r() * TAU, el = 0.12 + r() * 1.3, R = 130;
    starPos.push(Math.cos(el) * Math.sin(a) * R, Math.sin(el) * R, 7 + Math.cos(el) * Math.cos(a) * R);
  }
  const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: '#cfd8ff', size: 0.45, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.8 }));
  scene.add(stars);
  for (let i = 0; i < 34; i++) {
    const w = 8 + r() * 14, h = 18 + r() * 60, d = 10;
    const a = -Math.PI * 0.7 + (i / 33) * Math.PI * 1.4;
    const rr = 85 + r() * 30;
    const t = windowsTexture(i * 131 + 7); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 14)));
    const bld = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.75, 0.75, 0.8) }));
    bld.position.set(Math.sin(a) * rr, h / 2 - 1, 7 - Math.cos(a) * rr);
    bld.lookAt(0, h / 2 - 1, 7);
    scene.add(bld);
    if (r() < 0.35) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.3) }));
      beacon.position.set(bld.position.x, h - 0.5, bld.position.z); scene.add(beacon);
    }
  }
  return out;
}

// ---------- poses ----------
const DEF_STANCE = P({ root: [0, -0.12, 0], spine: [0.28, 0, 0], ...sym('hip', [-0.55, 0, 0.18]), ...sym('knee', [0.95, 0, 0]), ...sym('ankle', [-0.4, 0, 0]),
  ...sym('shoulder', [-0.45, 0, 0.95]), ...sym('elbow', [-0.55, 0, 0]) });
const JUMP_UP = P({ ...sym('shoulder', [-3.0, 0, 0.18]), ...sym('elbow', [-0.2, 0, 0]), ...sym('hip', [-0.25, 0, 0.05]), ...sym('knee', [0.5, 0, 0]), ...sym('ankle', [0.45, 0, 0]), neck: [-0.35, 0, 0] });
const REACH = P({ spine: [0.4, 0, 0], shoulderR: [-1.45, 0.2, -0.15], elbowR: [-0.15, 0, 0], shoulderL: [-0.4, 0, 0.5], elbowL: [-0.6, 0, 0], ...sym('hip', [-0.5, 0, 0.1]), ...sym('knee', [0.7, 0, 0]), root: [0, -0.08, 0] });

const GUARD = P({ root: [0, -0.2, 0], spine: [0.36, 0, 0], ...sym('hip', [-0.75, 0, 0.26]), ...sym('knee', [1.25, 0, 0]), ...sym('ankle', [-0.5, 0, 0]),
  ...sym('shoulder', [-0.8, 0, 1.15]), ...sym('elbow', [-0.35, 0, 0]) });
const FALLEN = P({ root: [0, -0.62, 0], spine: [-0.75, 0, 0.2], neck: [0.3, 0, 0], ...sym('hip', [-1.35, 0, 0.3]), ...sym('knee', [0.45, 0, 0]),
  ...sym('shoulder', [-1.2, 0, 0.9]), ...sym('elbow', [-0.3, 0, 0]) });
const SHOOK = P(DEF_STANCE, { root: [0, -0.05, 0], spine: [0.1, 0, 0.35], shoulderL: [-1.6, 0, 1.4], shoulderR: [-0.3, 0, -0.4], hipL: [-0.2, 0, 0.45], kneeL: [0.4, 0, 0] });
const DRIB_BASE = P({ root: [0, -0.15, 0], spine: [0.4, 0, 0], ...sym('hip', [-0.6, 0, 0.22]), ...sym('knee', [1.05, 0, 0]), ...sym('ankle', [-0.45, 0, 0]) });
const ease = t => t * t * (3 - 2 * t);

function mirrorArms(pose) {
  for (const j of ['shoulder', 'elbow', 'wrist']) {
    const l = pose[j + 'L'], r = pose[j + 'R'];
    pose[j + 'L'] = r ? [r[0], -r[1], -r[2]] : undefined;
    pose[j + 'R'] = l ? [l[0], -l[1], -l[2]] : undefined;
  }
  return pose;
}

// body language for each dribble move; k runs 0..1 through the move
function dribbleMovePose(p, k) {
  const dm = p.dm, side = dm.side || 0, arc = Math.sin(Math.PI * k);
  const pose = P(DRIB_BASE);
  pose.spine = [0.4 - (dm.k === 'step' ? 0.45 * arc : 0), dm.k === 'btb' ? -0.4 * arc * (dm.from === 'R' ? 1 : -1) : 0, -side * 0.3 * arc];
  // push off the outside leg toward the new direction
  if (side > 0) { pose.hipR = [-0.4, 0, -0.55 * arc]; pose.kneeR = [0.5, 0, 0]; }
  if (side < 0) { pose.hipL = [-0.4, 0, 0.55 * arc]; pose.kneeL = [0.5, 0, 0]; }
  if (dm.k === 'step') { pose.hipL = [-0.9 * arc, 0, 0.2]; pose.hipR = [-0.2, 0, -0.2]; pose.kneeL = [1.2, 0, 0]; }
  const fromR = dm.from === 'R';
  const low = P({ shoulderR: [-0.5, 0, -0.38], elbowR: [-0.75, 0, 0], wristR: [-0.3, 0, 0], shoulderL: [-0.5, 0, 0.38], elbowL: [-0.75, 0, 0], wristL: [-0.3, 0, 0] });
  Object.assign(pose, low);
  if (dm.k === 'btb') {
    const s = fromR ? 'R' : 'L', sx = fromR ? -1 : 1;
    pose['shoulder' + s] = [0.7 * arc - 0.2, 0, sx * 0.55]; pose['elbow' + s] = [-0.9 - 0.6 * arc, sx * 0.6 * arc, 0];
  }
  if (dm.k === 'spin') {
    pose.shoulderR = [-0.55, 0, -0.18]; pose.elbowR = [-1.45, 0, 0]; pose.shoulderL = [-0.55, 0, 0.18]; pose.elbowL = [-1.45, 0, 0];
    pose.spine = [0.3, 0, 0];
  }
  if (dm.k === 'cross') {
    const s = fromR ? 'R' : 'L', sx = fromR ? -1 : 1;
    pose['shoulder' + s] = [-0.6, 0, sx * (0.38 - 0.5 * arc)]; pose['elbow' + s] = [-0.7 - 0.3 * arc, 0, 0];
  }
  return pose;
}

function locomotion(p, base, hasBall, defense, time) {
  const speed = Math.hypot(p.vx, p.vz);
  const k = clamp(speed / 4.6, 0, 1);
  const sprint = clamp((speed - 3.8) / 2.2, 0, 1);
  const guard = defense && p.guarding;
  const stride = 1.25 * (p.h / 1.95) * (defense ? 0.7 : 1 + 0.25 * sprint);
  const ph = (p.gait / stride) * Math.PI;
  const s = Math.sin(ph), c = Math.cos(ph);
  const pose = defense ? P(guard ? GUARD : DEF_STANCE) : P(STAND);
  const amp = defense ? 0.35 : 0.8 + 0.25 * sprint;
  pose.hipL = [(pose.hipL?.[0] || 0) - amp * k * s, 0, pose.hipL?.[2] || 0.03];
  pose.hipR = [(pose.hipR?.[0] || 0) + amp * k * s, 0, pose.hipR?.[2] || -0.03];
  // knee folds on the recovery swing and stays soft on contact
  pose.kneeL = [(pose.kneeL?.[0] || 0.06) + k * (0.25 + (0.9 + 0.5 * sprint) * Math.max(0, c)), 0, 0];
  pose.kneeR = [(pose.kneeR?.[0] || 0.06) + k * (0.25 + (0.9 + 0.5 * sprint) * Math.max(0, -c)), 0, 0];
  // toe-off as each leg trails behind
  pose.ankleL = [(pose.ankleL?.[0] || 0) + 0.4 * k * Math.max(0, -s), 0, 0];
  pose.ankleR = [(pose.ankleR?.[0] || 0) + 0.4 * k * Math.max(0, s), 0, 0];
  pose.root = [0, (pose.root?.[1] || 0) - 0.035 * k + 0.05 * k * Math.abs(s), 0];
  // pelvis twists with the legs, the chest counters it
  pose.hips = [0, (defense ? 0.06 : 0.16) * k * s, 0.04 * k * c];
  pose.spine = [(pose.spine?.[0] || 0.03) + 0.14 * k + 0.08 * sprint, -(defense ? 0.04 : 0.2) * k * s, 0];
  pose.neck = [-0.08 * k - 0.05 * sprint, 0.1 * k * s, 0];
  if (!defense) {
    const swing = (0.5 + 0.35 * sprint) * k;
    pose.shoulderL = [swing * s + 0.05, 0, 0.12 + 0.06 * k]; pose.shoulderR = [-swing * s + 0.05, 0, -0.12 - 0.06 * k];
    pose.elbowL = [-0.3 - 0.75 * k - 0.4 * sprint - 0.2 * Math.max(0, s), 0, 0]; pose.elbowR = [-0.3 - 0.75 * k - 0.4 * sprint - 0.2 * Math.max(0, -s), 0, 0];
    if (k < 0.08) {
      // standing: breathe and shift weight instead of freezing
      const br = Math.sin(time * 1.7 + p.id), sw = Math.sin(time * 0.6 + p.id * 2);
      pose.spine[0] += 0.015 * br; pose.hips = [0, 0, 0.035 * sw];
      pose.hipL[2] += 0.02 * sw; pose.hipR[2] += 0.02 * sw;
      pose.kneeL[0] += 0.08 * Math.max(0, sw); pose.kneeR[0] += 0.08 * Math.max(0, -sw);
      pose.neck = [0.04 * br, 0.15 * Math.sin(time * 0.35 + p.id), 0];
    }
  } else {
    const ax = guard ? -0.8 : -0.45, az = guard ? 1.15 : 0.95;
    pose.shoulderL = [ax, 0, az + 0.08 * Math.sin(time * 5)]; pose.shoulderR = [ax, 0, -az - 0.08 * Math.sin(time * 5 + 1)];
  }
  if (hasBall) {
    const dk = 0.5 + 0.5 * k;
    pose.spine = [pose.spine[0] + 0.1, pose.spine[1] * 0.5, 0];
    pose.shoulderR = [-0.35 - 0.2 * dk, 0, -0.32];
    pose.elbowR = [-0.55 - 0.2 * Math.sin(time * TAU * (2.2 + speed * 0.3)), 0, 0];
    pose.wristR = [-0.2, 0, 0];
    pose.shoulderL = [-0.55 + 0.25 * k * s, 0, 0.32]; pose.elbowL = [-1.15, -0.2, 0];
    if (p.hand === 'L') mirrorArms(pose);
  }
  return pose;
}

export class CourtView {
  // opts.localId: the player this screen controls; opts.jerseys: [home, away]; opts.camera: 'broadcast' | 'close'
  constructor(container, game, opts = {}) {
    this.container = container;
    this.game = game;
    this.localId = opts.localId ?? game.user.id;
    this.local = game.players[this.localId];
    this.jerseys = opts.jerseys;
    this.camMode = opts.camera || 'broadcast';
    this.camOverride = null;
    this.shakeAmt = 0; this.fovKick = 0;
    this.basePR = Math.min(window.devicePixelRatio || 1, (QUALITY[opts.quality] || QUALITY.medium).pixelRatio); this.curPR = this.basePR; this.ft = []; this.prT = 0;
    const q = this.q = QUALITY[opts.quality] || QUALITY.medium;
    this.detail = DETAIL[opts.quality] || DETAIL.medium;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !q.post, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true; r.shadowMap.type = q.post ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#05060b');
    scene.fog = new THREE.FogExp2('#07070c', 0.0075);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    scene.add(new THREE.HemisphereLight(0x8fa2d6, 0x1a1414, 0.18));
    nightEnvironment(r).then(env => { if (env && this.scene) { scene.environment = env; scene.environmentIntensity = 0.45; } });
    // the floodlights' combined key light carries the shadows
    const key = new THREE.DirectionalLight(0xffe7c6, 1.15);
    key.position.set(7, 15, 12); key.target.position.set(0, 0, 6); scene.add(key.target);
    key.castShadow = true; key.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 12, bottom: -12, near: 1, far: 45 });
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
    scene.add(key);
    const rimL = new THREE.DirectionalLight(0xe11d2e, 0.55); rimL.position.set(-8, 5, -6); scene.add(rimL);
    const fill = new THREE.DirectionalLight(0x9fb4ff, 0.3); fill.position.set(-6, 6, 16); scene.add(fill);

    this.court = buildCourt(scene, q);
    this.ballTex = ballTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 28), new THREE.MeshStandardMaterial({ map: this.ballTex, ...ballSurface() }));
    this.ball.castShadow = true; scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; scene.add(this.ballShadow);

    if (q.post) {
      const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q.msaa });
      const comp = this.composer = new EffectComposer(r, rt);
      comp.addPass(new RenderPass(scene, this.camera));
      if (q.ao) { const ao = new GTAOPass(scene, this.camera, 1, 1); ao.blendIntensity = 0.85; comp.addPass(ao); this.ao = ao; }
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 1.0);
      comp.addPass(this.bloom);
      comp.addPass(new OutputPass());
    }
    this.chars = new Map();
    for (const p of game.players) this.addPlayer(p);
    this.camPos = new THREE.Vector3(0, 8, 21); this.camLook = new THREE.Vector3(0, 1.3, 6);
    this.netKick = 0;
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(container);
    this.resize();
  }

  addPlayer(p) {
    const homeJersey = this.jerseys?.[0] || this.local.build.look.jersey;
    const awayJersey = this.jerseys?.[1] || ({ Black: 'White', White: 'Black', Volt: 'Purple', Red: 'Royal', Royal: 'Red', Navy: 'Gold', Purple: 'Volt', Gold: 'Navy', Teal: 'Orange', Orange: 'Teal' })[homeJersey] || 'White';
    const build = JSON.parse(JSON.stringify(p.build));
    build.look.jersey = p.team === 0 ? homeJersey : awayJersey;
    const c = buildCharacter(build, null, { detail: this.detail, lite: this.q === QUALITY.low });
    this.scene.add(c.root);
    const me = p.id === this.localId;
    const ringColor = me ? 0xe11d2e : p.team === this.local.team ? 0xf2f2f2 : 0x3ab0ff;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: me ? 0.95 : p.isUser ? 0.85 : 0.5, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; this.scene.add(ring);
    let arrow = null;
    if (me) {
      arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 4), new THREE.MeshBasicMaterial({ color: 0xe11d2e }));
      arrow.rotation.x = Math.PI; this.scene.add(arrow);
    }
    this.chars.set(p.id, { c, ring, arrow, pose: null });
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
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
      if (p.state === 'dmove' && p.dm && hasBall) { pose = dribbleMovePose(p, clamp(p.st / p.dm.d, 0, 1)); anchor = 'dmove'; }
      else if (p.stumble > 0 && p.fallen) pose = P(FALLEN);
      else if (p.stumble > 0 && p.state === 'move' && !hasBall) pose = P(SHOOK);
      else if (p.state === 'jump') pose = P(JUMP_UP);
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
      if (p.state === 'dmove' && p.dm) {
        const k = clamp(p.st / p.dm.d, 0, 1);
        if (p.dm.k === 'spin') c.root.rotation.y += (p.dm.side || 1) * TAU * ease(k);
        if (p.dm.k === 'step') c.root.position.y += 0.12 * Math.sin(Math.PI * k);
      }
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
        const hand = anchorLocal(ch.c, p.hand === 'L' ? 'L' : 'R');
        const floor = new THREE.Vector3(hand.x * 0.9, BALL_R, hand.z + 0.25 + Math.hypot(p.vx, p.vz) * 0.08);
        const t = ph < 0.5 ? ph * 2 : 2 - ph * 2;
        local = hand.clone().lerp(floor, t * t * (3 - 2 * t) * 0.6 + t * 0.4);
        if (ch.lastPh != null && ph < ch.lastPh) this.onDribble?.();
        ch.lastPh = ph;
      } else if (ch.anchor === 'dmove') {
        const p = b.holder, dm = p.dm, k = clamp(p.st / dm.d, 0, 1);
        const from = anchorLocal(ch.c, dm.from === 'L' ? 'L' : 'R'), to = anchorLocal(ch.c, p.hand === 'L' ? 'L' : 'R');
        const lerp3 = (a, c2, t) => a.clone().lerp(c2, ease(clamp(t, 0, 1)));
        if (dm.k === 'cross') {
          const mid = new THREE.Vector3(0, BALL_R, 0.42);
          local = k < 0.5 ? lerp3(from, mid, k * 2) : lerp3(mid, to, k * 2 - 1);
        } else if (dm.k === 'btb') {
          const behind = new THREE.Vector3(0, 0.55, -0.32), bounce = new THREE.Vector3(to.x, BALL_R, 0.2);
          local = k < 0.45 ? lerp3(from, behind, k / 0.45) : k < 0.75 ? lerp3(behind, bounce, (k - 0.45) / 0.3) : lerp3(bounce, to, (k - 0.75) / 0.25);
        } else if (dm.k === 'step') {
          const floor = new THREE.Vector3(from.x, BALL_R, 0.25);
          local = k < 0.5 ? lerp3(from, floor, k * 2) : lerp3(floor, from, k * 2 - 1);
        } else local = from;
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
    // net: a breeze at rest, a whip and ripple when the ball goes through
    this.netKick = Math.max(0, this.netKick - dt * 1.6);
    this._netT = (this._netT || 0) + dt;
    {
      const net = this.court.net, pos = net.geometry.attributes.position, base = net.userData.base, k = this.netKick;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const t = clamp((0.22 - y) / 0.44, 0, 1);
        const wave = Math.sin(this._netT * 2.2 + x * 9) * 0.006 * t + Math.sin(k * 26 - t * 4) * 0.05 * t * k;
        const rr = Math.hypot(x, z) || 1;
        pos.setXYZ(i, x + (x / rr) * wave, y + k * 0.1 * t * Math.max(0, Math.sin(k * 9)), z + (z / rr) * wave);
      }
      pos.needsUpdate = true;
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
    const close = this.camMode === 'close' ? 0.72 : 1;
    const targetPos = new THREE.Vector3(bx * follow, 2.6 + dist * 0.42 * close, 5.5 + bz * 0.3 + dist * 0.82 * close);
    const targetLook = new THREE.Vector3(bx * follow * 0.9, 1.0, 4.4 + bz * 0.3);
    this.camPos.lerp(targetPos, 1 - Math.exp(-dt * 3));
    this.camLook.lerp(targetLook, 1 - Math.exp(-dt * 3));
    if (this.camOverride) {
      const o = this.camOverride;
      this.camera.position.copy(o.pos); this.camera.lookAt(o.look);
      if (o.fov && this.camera.fov !== o.fov) { this.camera.fov = o.fov; this.camera.updateProjectionMatrix(); }
    } else {
      if (this.camera.fov !== 42) { this.camera.fov = 42; this.camera.updateProjectionMatrix(); }
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
    }
    const sc = Math.max(0, Math.ceil(this.game.shotClock ?? 20));
    if (sc !== this._clockShown) { this._clockShown = sc; this.court.clock.draw(sc); }
    // impact feel: decaying shake and a quick FOV punch
    if (this.shakeAmt > 0.001) {
      const t = performance.now() / 1000, m = this.shakeAmt;
      this.camera.position.x += Math.sin(t * 61) * m * 0.12; this.camera.position.y += Math.sin(t * 73 + 1) * m * 0.09;
      this.camera.rotation.z += Math.sin(t * 47) * m * 0.012;
      this.shakeAmt *= Math.exp(-dt * 9);
    }
    if (this.fovKick > 0.01 && !this.camOverride) { this.camera.fov += this.fovKick; this.camera.updateProjectionMatrix(); this.fovKick *= Math.exp(-dt * 7); }
    this.adaptResolution(dt);
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }

  // screen position of a world point (for HUD overlays)
  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, visible: v.z < 1 };
  }

  dispose() {
    this._ro.disconnect();
    this.scene.traverse(o => {
      o.geometry?.dispose();
      for (const mat of [].concat(o.material || [])) {
        for (const v of Object.values(mat)) if (v?.isCanvasTexture) v.dispose();
        mat.dispose();
      }
    });
    this.composer?.dispose?.();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.scene = null;
  }

  shake(amount = 1, fov = 0) { this.shakeAmt = Math.max(this.shakeAmt, amount); this.fovKick = Math.max(this.fovKick, fov); }

  // keep the frame rate up: shed pixels when frames run long, take them back when there's headroom
  adaptResolution(dt) {
    if (!(dt > 0)) return;
    this.ft.push(dt); if (this.ft.length > 45) this.ft.shift();
    this.prT += dt;
    if (this.prT < 1.5 || this.ft.length < 30) return;
    const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length;
    let pr = this.curPR;
    if (avg > 1 / 40) pr = Math.max(0.6, pr - 0.15);
    else if (avg < 1 / 58 && pr < this.basePR) pr = Math.min(this.basePR, pr + 0.1);
    if (pr !== this.curPR) { this.curPR = pr; this.renderer.setPixelRatio(pr); this.resize(); this.prT = 0; this.ft.length = 0; }
  }

  // trailer helper: dim or light each floodlight (0..1)
  setLamps(levels) {
    this.court.lamps.forEach((l, i) => {
      const v = levels[i] ?? levels;
      l.on = v; l.spot.intensity = 55 * v; l.lens.material.color.setRGB(8 * v + 0.05, 7.4 * v + 0.05, 6.4 * v + 0.05); l.beam.visible = v > 0.05 && !!this.q.ao;
    });
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
