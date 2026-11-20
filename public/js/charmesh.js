// Sculpted character meshes: signed distance fields of blended primitives, meshed with
// naive surface nets and skinned by primitive proximity. Pure JS so it can run anywhere.

const sqrt = Math.sqrt, abs = Math.abs, max = Math.max, min = Math.min, exp = Math.exp;

// ---------- vector helpers ----------
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => sqrt(dot(a, a));
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// orthonormal frame with `y` along the given axis and `z` as close to `fwd` as possible
export function frame(axis, fwd = [0, 0, 1]) {
  const y = norm(axis);
  let z = sub(fwd, mul(y, dot(fwd, y)));
  if (len(z) < 1e-4) z = sub([1, 0, 0], mul(y, y[0]));
  z = norm(z);
  const x = cross(y, z);
  return { x, y, z };
}

// ---------- primitives ----------
// every primitive: { t: type, op: 'u'|'s'|'i', k: blend, bone, tag, ...params, bb: [minx,miny,minz,maxx,maxy,maxz] }
export function roundCone(a, b, r1, r2, o = {}) {
  const ba = sub(b, a), l2 = dot(ba, ba), rr = r1 - r2;
  const p = { t: 0, ax: a[0], ay: a[1], az: a[2], bax: ba[0], bay: ba[1], baz: ba[2], l2, rr, a2: l2 - rr * rr, il2: 1 / l2, r1, r2, op: 'u', k: 0.02, ...o };
  const r = max(r1, r2);
  p.bb = [min(a[0], b[0]) - r, min(a[1], b[1]) - r, min(a[2], b[2]) - r, max(a[0], b[0]) + r, max(a[1], b[1]) + r, max(a[2], b[2]) + r];
  return p;
}
export function ellipsoid(c, radii, basis = null, o = {}) {
  const f = basis || { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const p = { t: 1, cx: c[0], cy: c[1], cz: c[2], ux: f.x, uy: f.y, uz: f.z, rx: radii[0], ry: radii[1], rz: radii[2], op: 'u', k: 0.02, ...o };
  const r = max(radii[0], radii[1], radii[2]);
  p.bb = [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r];
  return p;
}
export function roundBox(c, half, rb, basis = null, o = {}) {
  const f = basis || { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  const p = { t: 2, cx: c[0], cy: c[1], cz: c[2], ux: f.x, uy: f.y, uz: f.z, hx: half[0] - rb, hy: half[1] - rb, hz: half[2] - rb, rb, op: 'u', k: 0.01, ...o };
  const r = sqrt(half[0] ** 2 + half[1] ** 2 + half[2] ** 2);
  p.bb = [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r];
  return p;
}
// keeps the side where dot(n, p) - d < 0
export function halfSpace(n, point, o = {}) {
  const nn = norm(n);
  return { t: 3, nx: nn[0], ny: nn[1], nz: nn[2], d: dot(nn, point), op: 'i', k: 0, bb: [-1e9, -1e9, -1e9, 1e9, 1e9, 1e9], ...o };
}

function primDist(p, x, y, z) {
  switch (p.t) {
    case 0: { // iq's round cone
      const pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
      const yy = pax * p.bax + pay * p.bay + paz * p.baz;
      const zz = yy - p.l2;
      const qx = pax * p.l2 - p.bax * yy, qy = pay * p.l2 - p.bay * yy, qz = paz * p.l2 - p.baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * p.l2, z2 = zz * zz * p.l2;
      const k = Math.sign(p.rr) * p.rr * p.rr * x2;
      if (Math.sign(zz) * p.a2 * z2 > k) return sqrt(x2 + z2) * p.il2 - p.r2;
      if (Math.sign(yy) * p.a2 * y2 < k) return sqrt(x2 + y2) * p.il2 - p.r1;
      return (sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.r1;
    }
    case 1: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      const lx = (dx * p.ux[0] + dy * p.ux[1] + dz * p.ux[2]) / p.rx;
      const ly = (dx * p.uy[0] + dy * p.uy[1] + dz * p.uy[2]) / p.ry;
      const lz = (dx * p.uz[0] + dy * p.uz[1] + dz * p.uz[2]) / p.rz;
      const k0 = sqrt(lx * lx + ly * ly + lz * lz);
      const k1 = sqrt((lx / p.rx) ** 2 + (ly / p.ry) ** 2 + (lz / p.rz) ** 2);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -min(p.rx, p.ry, p.rz);
    }
    case 2: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      const qx = abs(dx * p.ux[0] + dy * p.ux[1] + dz * p.ux[2]) - p.hx;
      const qy = abs(dx * p.uy[0] + dy * p.uy[1] + dz * p.uy[2]) - p.hy;
      const qz = abs(dx * p.uz[0] + dy * p.uz[1] + dz * p.uz[2]) - p.hz;
      const ox = max(qx, 0), oy = max(qy, 0), oz = max(qz, 0);
      return sqrt(ox * ox + oy * oy + oz * oz) + min(max(qx, qy, qz), 0) - p.rb;
    }
    case 3: return x * p.nx + y * p.ny + z * p.nz - p.d;
  }
  return 1e9;
}

const smin = (a, b, k) => { if (k <= 0) return min(a, b); const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

function evalList(list, x, y, z) {
  let d = 1e9;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const pd = primDist(p, x, y, z);
    if (p.op === 'u') d = smin(d, pd, p.k);
    else if (p.op === 's') d = smax(d, -pd, p.k);
    else d = p.k > 0 ? smax(d, pd, p.k) : max(d, pd);
  }
  return d;
}

// ---------- surface nets over a region ----------
// region: { prims, bb: [minx,miny,minz,maxx,maxy,maxz], h: voxel size, offset: dilation (m) }
export function meshRegion(region) {
  const { prims, h } = region;
  const offset = region.offset || 0;
  const [x0, y0, z0, x1, y1, z1] = region.bb;
  const nx = Math.ceil((x1 - x0) / h) + 2, ny = Math.ceil((y1 - y0) / h) + 2, nz = Math.ceil((z1 - z0) / h) + 2;
  const ox = x0 - h, oy = y0 - h, oz = z0 - h;
  const field = new Float32Array(nx * ny * nz);
  // evaluate block by block with only the primitives that can matter there
  const B = 6;
  const pad = h * 2 + 0.06;
  for (let bk = 0; bk < nz; bk += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const bx0 = ox + bi * h, by0 = oy + bj * h, bz0 = oz + bk * h;
    const bx1 = bx0 + B * h, by1 = by0 + B * h, bz1 = bz0 + B * h;
    const local = prims.filter(p => p.op !== 'u' ? p.t === 3 || (p.bb[0] - pad < bx1 && p.bb[3] + pad > bx0 && p.bb[1] - pad < by1 && p.bb[4] + pad > by0 && p.bb[2] - pad < bz1 && p.bb[5] + pad > bz0)
      : (p.bb[0] - pad - p.k < bx1 && p.bb[3] + pad + p.k > bx0 && p.bb[1] - pad - p.k < by1 && p.bb[4] + pad + p.k > by0 && p.bb[2] - pad - p.k < bz1 && p.bb[5] + pad + p.k > bz0));
    const hasUnion = local.some(p => p.op === 'u');
    for (let k = bk; k < min(bk + B, nz); k++) for (let j = bj; j < min(bj + B, ny); j++) for (let i = bi; i < min(bi + B, nx); i++) {
      const idx = i + nx * (j + ny * k);
      field[idx] = hasUnion ? evalList(local, ox + i * h, oy + j * h, oz + k * h) - offset : h * 4;
    }
  }
  // vertices: one per cell that straddles the surface
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const corner = new Float32Array(8);
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) {
      const v = field[(i + C[c][0]) + nx * ((j + C[c][1]) + ny * (k + C[c][2]))];
      corner[c] = v;
      if (v < 0) mask |= 1 << c;
    }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      const va = corner[a], vb = corner[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    cellVert[i + (nx - 1) * (j + (ny - 1) * k)] = pos.length / 3;
    pos.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
  }
  // faces: a quad around every grid edge with a sign change
  const idxs = [];
  const cv = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1 ? -1 : cellVert[i + (nx - 1) * (j + (ny - 1) * k)]);
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idxs.push(a, b, c, a, c, d); else idxs.push(a, c, b, a, d, c);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v0 = field[i + nx * (j + ny * k)];
    if (i < nx - 1) {
      const v1 = field[i + 1 + nx * (j + ny * k)];
      if ((v0 < 0) !== (v1 < 0)) quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k), v0 < 0);
    }
    if (j < ny - 1) {
      const v1 = field[i + nx * (j + 1 + ny * k)];
      if ((v0 < 0) !== (v1 < 0)) quad(cv(i - 1, j, k - 1), cv(i - 1, j, k), cv(i, j, k), cv(i, j, k - 1), v0 < 0);
    }
    if (k < nz - 1) {
      const v1 = field[i + nx * (j + ny * (k + 1))];
      if ((v0 < 0) !== (v1 < 0)) quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k), v0 < 0);
    }
  }
  return finalize(region, new Float32Array(pos), idxs);
}

// normals from the field gradient, skin weights from primitive proximity, colors from tags
function finalize(region, pos, idxs) {
  const { prims } = region;
  const offset = region.offset || 0;
  const unions = prims.filter(p => p.op === 'u' && p.bone != null);
  const n = pos.length / 3;
  const normal = new Float32Array(n * 3), skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
  const color = new Float32Array(n * 3);
  const e = region.h * 0.5;
  const near = (x, y, z) => prims.filter(p => p.t === 3 || (x > p.bb[0] - 0.08 && x < p.bb[3] + 0.08 && y > p.bb[1] - 0.08 && y < p.bb[4] + 0.08 && z > p.bb[2] - 0.08 && z < p.bb[5] + 0.08));
  const soft = region.weightSoftness || 0.018;
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const L = near(x, y, z);
    const gx = evalList(L, x + e, y, z) - evalList(L, x - e, y, z);
    const gy = evalList(L, x, y + e, z) - evalList(L, x, y - e, z);
    const gz = evalList(L, x, y, z + e) - evalList(L, x, y, z - e);
    const gl = sqrt(gx * gx + gy * gy + gz * gz) || 1;
    normal[v * 3] = gx / gl; normal[v * 3 + 1] = gy / gl; normal[v * 3 + 2] = gz / gl;
    // bone weights: each union primitive pulls toward its bone by how close it is
    const acc = new Map();
    let dmin = 1e9, dom = null;
    const ds = [];
    for (const p of unions) {
      if (x < p.bb[0] - 0.1 || x > p.bb[3] + 0.1 || y < p.bb[1] - 0.1 || y > p.bb[4] + 0.1 || z < p.bb[2] - 0.1 || z > p.bb[5] + 0.1) continue;
      const d = primDist(p, x, y, z) - offset;
      ds.push([p, d]);
      if (d < dmin) { dmin = d; dom = p; }
    }
    for (const [p, d] of ds) {
      const w = exp(-(d - dmin) / soft) * (p.wt ?? 1);
      if (w < 1e-3) continue;
      acc.set(p.bone, (acc.get(p.bone) || 0) + w);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((s, t) => s + t[1], 0) || 1;
    for (let i = 0; i < 4; i++) {
      skinIndex[v * 4 + i] = top[i] ? top[i][0] : 0;
      skinWeight[v * 4 + i] = top[i] ? top[i][1] / tot : 0;
    }
    if (!top.length) { skinIndex[v * 4] = region.defaultBone || 0; skinWeight[v * 4] = 1; }
    const c = region.colorAt ? region.colorAt([x, y, z], dom) : [1, 1, 1];
    color[v * 3] = c[0]; color[v * 3 + 1] = c[1]; color[v * 3 + 2] = c[2];
  }
  const ink = new Float32Array(n);
  if (region.inkAt) for (let v = 0; v < n; v++) ink[v] = region.inkAt([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
  let out = { position: pos, normal, skinIndex, skinWeight, color, ink, uv: null, index: idxs };
  if (region.uvAt) {
    const uv = new Float32Array(n * 2);
    for (let v = 0; v < n; v++) { const t = region.uvAt([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]); uv[v * 2] = t[0]; uv[v * 2 + 1] = t[1]; }
    out.uv = uv;
    out = fixSeams(out);
  }
  const count = out.position.length / 3;
  out.index = count > 65535 ? new Uint32Array(out.index) : new Uint16Array(out.index);
  return out;
}

// cylindrical UVs wrap from u=1 back to 0; split triangles that straddle the seam
function fixSeams(m) {
  const extra = [];
  const dup = new Map();
  const n0 = m.position.length / 3;
  const idx = m.index;
  for (let t = 0; t < idx.length; t += 3) {
    const us = [m.uv[idx[t] * 2], m.uv[idx[t + 1] * 2], m.uv[idx[t + 2] * 2]];
    if (Math.max(...us) - Math.min(...us) < 0.5) continue;
    for (let c = 0; c < 3; c++) {
      if (us[c] >= 0.5) continue;
      const v = idx[t + c];
      if (!dup.has(v)) { dup.set(v, n0 + extra.length); extra.push(v); }
      idx[t + c] = dup.get(v);
    }
  }
  if (!extra.length) return m;
  const grow = (arr, size) => { const o = new arr.constructor(arr.length + extra.length * size); o.set(arr); extra.forEach((v, i) => { for (let k = 0; k < size; k++) o[(n0 + i) * size + k] = arr[v * size + k]; }); return o; };
  const out = { ...m, position: grow(m.position, 3), normal: grow(m.normal, 3), skinIndex: grow(m.skinIndex, 4), skinWeight: grow(m.skinWeight, 4), color: grow(m.color, 3), ink: grow(m.ink, 1), uv: grow(m.uv, 2), index: idx };
  extra.forEach((v, i) => { out.uv[(n0 + i) * 2] += 1; });
  return out;
}
