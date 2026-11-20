import { overall, randomBuild, derive, clone } from '../build.js';
import { ATTR_KEYS, ANIMATIONS } from '../data.js';

export const COURT = {
  halfW: 7.62, len: 14.33,
  rim: { x: 0, y: 3.05, z: 1.575 }, rimR: 0.2286,
  threeR: 7.24, cornerX: 6.71, cornerZ: 4.27, boardZ: 1.22, checkZ: 9.6,
};
export const BALL_R = 0.12;
const G = 9.8;
const SHOT_CLOCK = 20;

// dur: seconds at average handles; speed: burst m/s; bite: ankle-break power; risk: steal multiplier mid-move
export const DRIBBLE_MOVES = {
  cross: { label: 'Crossover', dur: 0.34, speed: 5.2, bite: 0.08, risk: 1.35 },
  btb: { label: 'Behind the Back', dur: 0.4, speed: 4.6, bite: 0.02, risk: 0.6 },
  spin: { label: 'Spin Move', dur: 0.52, speed: 4.4, bite: 0.06, risk: 0.3 },
  step: { label: 'Step-Back', dur: 0.38, speed: 4.8, bite: 0.04, risk: 0.9 },
};

export const DIFFICULTY = {
  rookie: { label: 'Rookie', ovr: -9, aim: 1.7, react: 0.38, steal: 0.55, iq: 0.6 },
  pro: { label: 'Pro', ovr: -3, aim: 1.2, react: 0.26, steal: 0.8, iq: 0.8 },
  allstar: { label: 'All-Star', ovr: 2, aim: 0.95, react: 0.18, steal: 1, iq: 0.92 },
  hof: { label: 'Hall of Fame', ovr: 6, aim: 0.75, react: 0.12, steal: 1.2, iq: 1 },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const hyp = Math.hypot;
export const rimDist = (x, z) => hyp(x - COURT.rim.x, z - COURT.rim.z);
export function isThree(x, z) {
  return z <= COURT.cornerZ ? Math.abs(x) >= COURT.cornerX : rimDist(x, z) >= COURT.threeR;
}
const rt = (p, k) => (p.build.attrs[k] - 25) / 74;
const badge = (p, id) => p.build.badges?.[id] ?? -1;
const badgeBoost = (p, id, per = 0.05) => (badge(p, id) + 1) * per;

function animPreview(build, key) {
  const def = ANIMATIONS[key];
  if (def.multi) {
    const ids = build.anims[key] || [];
    const id = ids[Math.floor(Math.random() * ids.length)];
    return def.items.find(i => i.id === id)?.preview || { jump: 0.7, power: 0.8 };
  }
  return (def.items.find(i => i.id === build.anims[key]) || def.items[0]).preview;
}

// scale a random build's ratings until its overall lands on the target
export function buildAtOvr(target, opts = {}) {
  let best = null;
  for (let i = 0; i < 6; i++) {
    const b = randomBuild();
    if (opts.position && b.position !== opts.position && i < 5) continue;
    if (!best || Math.abs(overall(b) - target) < Math.abs(overall(best) - target) || overall(b) >= target) best = b;
    if (overall(best) >= target) break;
  }
  return scaleToOvr(best, target);
}

export function scaleToOvr(build, target) {
  const base = clone(build.attrs);
  let lo = 0, hi = 1;
  const setK = k => { for (const a of ATTR_KEYS) build.attrs[a] = Math.round(25 + (base[a] - 25) * k); };
  for (let it = 0; it < 16; it++) { const k = (lo + hi) / 2; setK(k); if (overall(build) < target) lo = k; else hi = k; }
  setK(hi);
  derive(build);
  return build;
}

const SPOTS = [
  [-5.6, 6.2], [5.6, 6.2], [-6.9, 1.3], [6.9, 1.3], [0, 8.6], [-2.6, 6.0], [2.6, 6.0], [-2.3, 2.6], [2.3, 2.6], [-4.2, 8.4], [4.2, 8.4],
];

function makePlayer(id, team, build, isUser) {
  return {
    id, team, build, isUser,
    name: `${build.identity.first} ${build.identity.last}`.trim(),
    h: build.body.height * 0.0254,
    x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, facing: Math.PI,
    want: { x: 0, z: 0, sprint: false, face: null },
    state: 'move', st: 0, cool: 0, stumble: 0, fallen: false, energy: 1,
    hand: 'R', dm: null, guarding: false, spaceT: 0, lastMove: null,
    shot: null, finish: null, passT: 0, reachT: 0,
    ai: { t: rand(0, 0.3), spot: null, spotT: 0, drive: false, hold: 0, jumpAt: null, cut: 0 },
    man: null, callT: 0, gait: 0,
    stats: { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0 },
  };
}

export class Game {
  // roster: [{ team, build, human: controller key or null }]; or the single-player shorthand
  constructor({ userBuild, mode = 3, target = 21, scoring = '23', difficulty = 'pro', teammates, opponents, roster, firstPoss }) {
    this.mode = mode; this.target = target; this.scoring = scoring;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.pro;
    this.score = [0, 0];
    this.events = [];
    this.time = 0;
    if (!roster) {
      const userOvr = overall(userBuild);
      const mates = teammates || Array.from({ length: mode - 1 }, () => buildAtOvr(clamp(userOvr - 3, 55, 92)));
      const opps = opponents || Array.from({ length: mode }, () => buildAtOvr(clamp(userOvr + this.diff.ovr, 50, 97)));
      roster = [{ team: 0, build: userBuild, human: 'local' }, ...mates.map(build => ({ team: 0, build })), ...opps.map(build => ({ team: 1, build }))];
    }
    this.players = roster.map((r, i) => { const p = makePlayer(i, r.team, r.build, !!r.human); p.ctrl = r.human || null; return p; });
    this.user = this.players.find(p => p.isUser) || this.players[0];
    this.humanTeams = [0, 1].map(t => this.players.some(p => p.team === t && p.isUser));
    this.ball = { state: 'held', holder: this.user, x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, flight: null, lastTouch: 0, fromShot: null, spin: 0 };
    this.assignDefense();
    this.lastPass = null;
    this.winner = null;
    this.setupCheck(firstPoss ?? (Math.random() < 0.5 ? 0 : 1), true);
  }

  // AI on a team with no humans plays at the chosen difficulty; AI teammates of humans play at a steady level
  aiTuned(p) { return !this.humanTeams[p.team]; }

  // a disconnected human hands their player to the AI
  releaseControl(ctrl) {
    for (const p of this.players) if (p.ctrl === ctrl) { p.isUser = false; p.ctrl = null; }
    this.humanTeams = [0, 1].map(t => this.players.some(p => p.team === t && p.isUser));
  }

  team(t) { return this.players.filter(p => p.team === t); }
  emit(type, data = {}) { this.events.push({ type, t: this.time, ...data }); }

  assignDefense() {
    for (const t of [0, 1]) {
      const def = this.team(t).sort((a, b) => a.h - b.h);
      const off = this.team(1 - t).sort((a, b) => a.h - b.h);
      def.forEach((p, i) => { p.man = off[i]; });
    }
  }

  setupCheck(team, first = false) {
    this.poss = team;
    this.phase = 'check'; this.phaseT = 0;
    this.shotClock = SHOT_CLOCK;
    this.needsClear = false;
    this.lastPass = null;
    const off = this.team(team), def = this.team(1 - team);
    const handler = off.find(p => p.isUser) || off.reduce((a, b) => (rt(b, 'ballHandle') > rt(a, 'ballHandle') ? b : a));
    const spots = this.mode === 2 ? [[4.9, 5.2]] : [[-5.3, 4.8], [5.3, 4.8]];
    let si = 0;
    for (const p of off) {
      const [x, z] = p === handler ? [0, COURT.checkZ] : spots[si++ % spots.length];
      Object.assign(p, { x, z, vx: 0, vz: 0, y: 0, vy: 0, state: 'move', st: 0, facing: Math.PI, shot: null, finish: null });
      p.ai.spot = null; p.ai.drive = false; p.ai.hold = 0;
    }
    for (const p of def) {
      const m = p.man;
      const dx = COURT.rim.x - m.x, dz = COURT.rim.z - m.z, d = hyp(dx, dz) || 1;
      Object.assign(p, { x: m.x + (dx / d) * 1.4, z: m.z + (dz / d) * 1.4, vx: 0, vz: 0, y: 0, vy: 0, state: 'move', st: 0, shot: null, finish: null });
      p.facing = Math.atan2(m.x - p.x, m.z - p.z);
    }
    this.giveBall(handler);
    if (!first) this.emit('check', { team });
  }

  giveBall(p) {
    const b = this.ball;
    b.state = 'held'; b.holder = p; b.flight = null; b.lastTouch = p.team; b.fromShot = null;
    p.ai.hold = 0;
  }

  // ---------- main step ----------
  step(dt, input) {
    this.time += dt;
    this.phaseT += dt;
    if (this.phase === 'over') { this.updatePlayers(dt, null); this.updateBall(dt); return; }
    if (this.phase === 'check') {
      for (const p of this.players) { p.want.x = 0; p.want.z = 0; }
      if (this.phaseT > 1.4) { this.phase = 'live'; this.emit('live'); }
      this.updateBall(dt);
      return;
    }
    if (this.phase === 'score') {
      for (const p of this.players) { p.want.x *= 0.9; p.want.z *= 0.9; p.want.sprint = false; }
      if (this.phaseT > 1.5) {
        if (this.winner != null) { this.phase = 'over'; this.emit('gameover', { winner: this.winner }); }
        else this.setupCheck(1 - this.scoredBy);
      }
      this.updatePlayers(dt, null);
      this.updateBall(dt);
      return;
    }
    // live
    if (this.ball.state === 'held' || (this.ball.state === 'air' && this.ball.flight.kind === 'pass')) {
      this.shotClock -= dt;
      if (this.shotClock <= 0) { this.turnover(this.poss, 'Shot Clock Violation'); return; }
    }
    // a single input object drives the local user; a map keys inputs by controller
    const inputs = input && 'mx' in input ? { [this.user.ctrl]: input } : input || {};
    for (const p of this.players) {
      if (p.isUser) this.handleUser(p, inputs[p.ctrl] || null);
      else this.ai(p, dt);
    }
    this.updatePlayers(dt);
    this.updateBall(dt);
    const h = this.ball.state === 'held' ? this.ball.holder : null;
    if (h && this.needsClear && h.team === this.poss && isThree(h.x, h.z)) { this.needsClear = false; this.emit('cleared', { team: h.team }); }
  }

  // ---------- user ----------
  handleUser(p, input) {
    if (!input) { p.want.x = 0; p.want.z = 0; p.want.sprint = false; return; }
    const free = p.state === 'move' && p.stumble <= 0;
    p.want.x = input.mx; p.want.z = input.mz; p.want.sprint = input.sprint; p.want.face = null;
    if (p.state === 'jumper' && !p.shot.released && (input.shootReleased || !input.shoot)) this.releaseJumper(p, null);
    const b = this.ball;
    const hasBall = b.state === 'held' && b.holder === p;
    p.guarding = !!input.guard && !hasBall;
    if (!free) return;
    if (hasBall) {
      if (input.move && DRIBBLE_MOVES[input.move] && p.cool <= 0) {
        this.startMove(p, input.move, input.mx, input.mz);
      } else if (input.shootPressed) {
        const d = rimDist(p.x, p.z);
        const toward = (input.mx * (COURT.rim.x - p.x) + input.mz * (COURT.rim.z - p.z)) / (d || 1);
        if (d < 1.6 || (d < 3.1 && toward > 0.3)) this.startFinish(p);
        else this.startJumper(p);
      } else if (input.passPressed) {
        this.passToward(p, input.mx, input.mz);
      }
    } else if (b.state === 'held' && b.holder.team === p.team) {
      if (input.passPressed) { b.holder.callFor = p; p.callT = 1.2; this.emit('call', { from: p.id }); }
      if (input.shootPressed) this.startJump(p);
    } else {
      if (input.shootPressed) this.startJump(p);
      if (input.passPressed) this.stealAttempt(p);
    }
  }

  // ---------- movement ----------
  speedOf(p) {
    const hasBall = this.ball.state === 'held' && this.ball.holder === p;
    const r = hasBall ? rt(p, 'speedWithBall') : rt(p, 'speed');
    const jog = 2.9 + 1.5 * r;
    const sprint = p.want.sprint && p.energy > 0.05 ? 1.38 : 1;
    const tired = p.energy < 0.25 ? 0.85 : 1;
    const stance = p.guarding ? 0.82 : 1;
    if (p.fallen && p.stumble > 0) return 0;
    return jog * sprint * tired * stance * (p.stumble > 0 ? 0.35 : 1);
  }

  // ---------- dribble moves ----------
  startMove(p, kind, mx = 0, mz = 0) {
    const def = DRIBBLE_MOVES[kind];
    const bh = rt(p, 'ballHandle'), swb = rt(p, 'speedWithBall');
    const style = animPreview(p.build, 'dribble').speed || 1;
    const quick = (0.82 + 0.32 * bh) * (0.9 + 0.12 * (style - 1));
    const f = Math.atan2(COURT.rim.x - p.x, COURT.rim.z - p.z);
    const fx = Math.sin(f), fz = Math.cos(f), lx = Math.cos(f), lz = -Math.sin(f);
    // which way to go: the stick's lateral push if any, otherwise toward the off hand
    const lateral = mx * lx + mz * lz;
    let side = Math.abs(lateral) > 0.3 ? Math.sign(lateral) : p.hand === 'R' ? 1 : -1;
    if (kind === 'step') side = 0;
    const sp = def.speed * (0.8 + 0.45 * swb);
    const dm = { k: kind, d: def.dur / quick, side, from: p.hand, checked: false, fx, fz, lx, lz, sp };
    if (kind === 'cross' || kind === 'btb') p.hand = side > 0 ? 'L' : 'R';
    p.state = 'dmove'; p.st = 0; p.dm = dm; p.facing = f;
    p.energy = Math.max(0, p.energy - 0.035 * (1 - badgeBoost(p, 'handles_for_days', 0.12)));
    dm.combo = p.lastMove && p.lastMove.k !== kind && this.time - p.lastMove.t < 1.0;
    p.lastMove = { k: kind, t: this.time };
    this.emit('dmove', { id: p.id, k: kind, combo: dm.combo });
  }

  updateMove(p, dt) {
    const dm = p.dm, k = clamp(p.st / dm.d, 0, 1);
    const burst = Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.6;
    let dx, dz;
    if (dm.k === 'step') { dx = -dm.fx; dz = -dm.fz; }
    else if (dm.k === 'spin') {
      // around the defender: sideways first, then downhill
      const a = k * Math.PI * 0.5;
      dx = dm.lx * dm.side * Math.cos(a) + dm.fx * Math.sin(a); dz = dm.lz * dm.side * Math.cos(a) + dm.fz * Math.sin(a);
    } else {
      const fwd = dm.k === 'btb' ? 0.45 : 0.25;
      dx = dm.lx * dm.side + dm.fx * fwd; dz = dm.lz * dm.side + dm.fz * fwd;
    }
    const m = hyp(dx, dz) || 1;
    p.vx = (dx / m) * dm.sp * burst; p.vz = (dz / m) * dm.sp * burst;
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.gait += hyp(p.vx, p.vz) * dt;
    if (!dm.checked && k >= 0.55) { dm.checked = true; this.shakeCheck(p, dm); }
    if (k >= 1) {
      p.state = 'move'; p.st = 0; p.dm = null; p.cool = 0.16;
      if (dm.k === 'step') p.spaceT = 0.8;
    }
  }

  shakeCheck(p, dm) {
    const bh = rt(p, 'ballHandle');
    for (const q of this.players) {
      if (q.team === p.team || q.stumble > 0 || q.y > 0.1) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz);
      if (d > 1.9 || (dx * dm.fx + dz * dm.fz) / (d || 1) < -0.3) continue;
      const resist = 0.5 * rt(q, 'perimeterDefense') + 0.25 * rt(q, 'agility') + (q.guarding ? 0.15 : 0) + badgeBoost(q, 'on_ball_menace', 0.03);
      const power = 0.22 + 0.62 * bh + DRIBBLE_MOVES[dm.k].bite + badgeBoost(p, 'ankle_assassin', 0.06) + (dm.combo ? 0.1 : 0) - (d > 1.3 ? 0.15 : 0);
      const r = power - resist + rand(-0.25, 0.25);
      if (r > 0.58) {
        q.stumble = 1.3; q.fallen = true; q.vx = q.vz = 0; q.state = 'move';
        this.emit('ankles', { id: q.id, by: p.id });
      } else if (r > 0.22) {
        q.stumble = 0.45;
        this.emit('shook', { id: q.id, by: p.id });
      }
    }
  }

  updatePlayers(dt) {
    for (const p of this.players) {
      p.st += dt;
      p.cool = Math.max(0, p.cool - dt);
      p.stumble = Math.max(0, p.stumble - dt);
      if (p.stumble <= 0) p.fallen = false;
      p.spaceT = Math.max(0, p.spaceT - dt);
      p.callT = Math.max(0, p.callT - dt);
      const sprinting = p.want.sprint && hyp(p.vx, p.vz) > 2;
      p.energy = clamp(p.energy + dt * (sprinting ? -0.11 * (1 - 0.55 * rt(p, 'stamina')) : 0.07), 0, 1);

      if (p.state === 'jumper') this.updateJumper(p, dt);
      else if (p.state === 'finish') this.updateFinish(p, dt);
      else if (p.state === 'dmove') {
        if (!(this.ball.state === 'held' && this.ball.holder === p)) { p.state = 'move'; p.st = 0; p.dm = null; }
        else this.updateMove(p, dt);
      }
      else if (p.state === 'jump') {
        p.vy -= G * dt; p.y += p.vy * dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 0.985; p.vz *= 0.985;
        if (p.y <= 0) { p.y = 0; p.vy = 0; p.state = 'move'; p.st = 0; }
        continue;
      } else if (p.state === 'pass' && p.st > 0.32) { p.state = 'move'; p.st = 0; }
      else if (p.state === 'reach' && p.st > 0.32) { p.state = 'move'; p.st = 0; }

      if (p.state === 'move' || p.state === 'pass' || p.state === 'reach') {
        let wx = p.want.x, wz = p.want.z;
        const m = hyp(wx, wz);
        if (m > 1) { wx /= m; wz /= m; }
        const sp = this.speedOf(p) * (p.state === 'move' ? 1 : 0.4);
        const tx = wx * sp, tz = wz * sp;
        const acc = (9 + 12 * rt(p, 'agility')) * dt;
        const dx = tx - p.vx, dz = tz - p.vz, dl = hyp(dx, dz);
        if (dl > acc) { p.vx += (dx / dl) * acc; p.vz += (dz / dl) * acc; } else { p.vx = tx; p.vz = tz; }
        p.x += p.vx * dt; p.z += p.vz * dt;
        p.gait += hyp(p.vx, p.vz) * dt;
        // facing
        let face = p.want.face;
        if (face == null) {
          const hasBall = this.ball.state === 'held' && this.ball.holder === p;
          if (hyp(p.vx, p.vz) > 0.6) face = Math.atan2(p.vx, p.vz);
          else if (hasBall) face = Math.atan2(COURT.rim.x - p.x, COURT.rim.z - p.z);
          else if (p.team !== this.poss && p.man) face = Math.atan2(p.man.x - p.x, p.man.z - p.z);
        }
        if (face != null) {
          let d = face - p.facing;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          p.facing += d * Math.min(1, dt * 12);
        }
      }
      p.x = clamp(p.x, -COURT.halfW + 0.25, COURT.halfW - 0.25);
      p.z = clamp(p.z, 0.3, COURT.len - 0.3);
    }
    // soft collisions; stronger, heavier players win
    for (let i = 0; i < this.players.length; i++) for (let j = i + 1; j < this.players.length; j++) {
      const a = this.players[i], b = this.players[j];
      if (a.y > 0.4 || b.y > 0.4) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = hyp(dx, dz), min = 0.62;
      if (d < min && d > 1e-4) {
        const ma = 0.6 + rt(a, 'strength') + a.h * 0.3, mb = 0.6 + rt(b, 'strength') + b.h * 0.3;
        const push = (min - d), nx = dx / d, nz = dz / d;
        a.x -= nx * push * (mb / (ma + mb)); a.z -= nz * push * (mb / (ma + mb));
        b.x += nx * push * (ma / (ma + mb)); b.z += nz * push * (ma / (ma + mb));
      }
    }
  }

  startJump(p) {
    if (p.state !== 'move' || p.y > 0) return;
    const j = 0.36 + 0.46 * rt(p, 'vertical') + badgeBoost(p, 'pogo_stick', 0.015);
    p.state = 'jump'; p.st = 0; p.vy = Math.sqrt(2 * G * j); p.y = 0.001;
    p.vx *= 0.6; p.vz *= 0.6;
    p.energy = Math.max(0, p.energy - 0.03);
  }
  reach(p) { return p.h * 1.32 + p.y; }

  // ---------- shooting ----------
  shotRating(p, d) {
    if (d < 3.2) return rt(p, 'closeShot');
    if (isThree(p.x, p.z)) return rt(p, 'threePoint');
    return rt(p, 'midRange');
  }
  contest(p) {
    let best = 0;
    const d0 = rimDist(p.x, p.z);
    const rx = (COURT.rim.x - p.x) / (d0 || 1), rz = (COURT.rim.z - p.z) / (d0 || 1);
    for (const q of this.players) {
      if (q.team === p.team) continue;
      const dx = q.x - p.x, dz = q.z - p.z, d = hyp(dx, dz);
      if (d > 2.7) continue;
      const front = d > 0.01 ? (dx * rx + dz * rz) / d : 1;
      const defR = d0 > 4 ? rt(q, 'perimeterDefense') : rt(q, 'interiorDefense');
      let c = clamp((2.5 - d) / 1.8, 0, 1) * (0.45 + 0.55 * clamp(front + 0.2, 0, 1)) * (0.55 + 0.45 * defR);
      c *= clamp(1 + (q.h - p.h) * 1.4, 0.7, 1.35);
      if (q.state === 'jump') c *= 1.3;
      if (q.guarding) c *= 1.2;
      if (q.stumble > 0) c *= q.fallen ? 0 : 0.4;
      c *= 1 + badgeBoost(q, 'challenger', 0.04);
      best = Math.max(best, c);
    }
    if (p.spaceT > 0) best *= 0.45;
    return clamp(best, 0, 1);
  }
  shotTiming(p) {
    const speed = animPreview(p.build, 'jumpShot').speed || 1;
    return 0.66 / speed;
  }
  shotWindow(p) {
    const d = rimDist(p.x, p.z);
    const r = this.shotRating(p, d);
    const three = isThree(p.x, p.z);
    let w = 0.02 + 0.06 * r;
    w *= 1 + (three ? badgeBoost(p, 'deadeye', 0.06) + badgeBoost(p, 'limitless_range', 0.02) : badgeBoost(p, 'set_shot_specialist', 0.04));
    w *= 1 - 0.5 * this.contest(p) * (1 - badgeBoost(p, 'deadeye', 0.07));
    if (p.energy < 0.25) w *= 0.8;
    return Math.max(0.012, w);
  }

  startJumper(p) {
    const Tm = this.shotTiming(p);
    p.state = 'jumper'; p.st = 0; p.vx *= 0.2; p.vz *= 0.2;
    p.facing = Math.atan2(COURT.rim.x - p.x, COURT.rim.z - p.z);
    p.shot = { Tm, ideal: Tm * 0.92, window: this.shotWindow(p), released: false, relT: 0, three: isThree(p.x, p.z), x: p.x, z: p.z, anim: animPreview(p.build, 'jumpShot') };
    this.emit('shotStart', { id: p.id });
  }

  updateJumper(p, dt) {
    const s = p.shot, Tm = s.Tm;
    p.vx *= 0.8; p.vz *= 0.8; p.x += p.vx * dt; p.z += p.vz * dt;
    const jh = 0.22 + 0.25 * rt(p, 'vertical');
    if (!s.released) {
      p.y = jh * Math.sin(Math.PI * 0.5 * clamp((p.st - Tm * 0.55) / (Tm * 0.42), 0, 1));
      if (!p.isUser && p.st >= s.aiRelease) this.releaseJumper(p, null);
      else if (p.st >= Tm * 1.25) this.releaseJumper(p, null);
    } else {
      const t = p.st - s.relT;
      p.y = Math.max(0, jh * Math.cos(Math.PI * 0.5 * clamp(t / 0.38, 0, 1)));
      if (t > 0.5) { p.state = 'move'; p.st = 0; p.y = 0; p.shot = null; }
    }
  }

  releaseJumper(p) {
    const s = p.shot;
    if (!s || s.released) return;
    s.released = true; s.relT = p.st;
    s.window = this.shotWindow(p);
    const e = p.st - s.ideal;
    const w = s.window;
    const contest = this.contest(p);
    const d = rimDist(p.x, p.z);
    const r = this.shotRating(p, d);
    let grade, pm;
    if (Math.abs(e) <= w / 2) { grade = 'Excellent'; pm = 0.97 - contest * 0.4 * (1 - badgeBoost(p, 'deadeye', 0.08)); }
    else if (Math.abs(e) <= w * 1.4) { grade = 'Good'; pm = 0.36 + 0.42 * r - contest * 0.32; }
    else if (Math.abs(e) <= 0.14) { grade = e < 0 ? 'Slightly Early' : 'Slightly Late'; pm = 0.1 + 0.26 * r - contest * 0.18; }
    else { grade = e < 0 ? 'Very Early' : 'Very Late'; pm = 0.035; }
    const deep = d - COURT.threeR;
    if (s.three && deep > 1.2 && badge(p, 'limitless_range') < 0) pm *= deep > 3 ? 0.35 : 0.7;
    if (badge(p, 'mini_marksman') >= 0 && contest > 0.3) pm += 0.03;
    pm = clamp(pm, 0.02, 0.985);
    const three = isThree(p.x, p.z);
    const pts = this.points(three);
    p.stats.fga++; if (three) p.stats.tpa++;
    s.grade = grade; s.meterAt = p.st / s.Tm; s.contest = contest;
    this.emit('release', { id: p.id, grade, user: p.isUser, contest, three, meter: s.meterAt, window: w / s.Tm, ideal: s.ideal / s.Tm });
    // block on release
    const blocker = this.findBlocker(p, 1.3, 0.03 + 0.06 * contest);
    if (blocker) { this.blocked(p, blocker); return; }
    const make = Math.random() < pm;
    const airball = !make && grade.startsWith('Very') && d > 5 && Math.random() < 0.55;
    this.launchShot(p, make, pts, airball, grade);
  }

  points(three) { return this.scoring === '23' ? (three ? 3 : 2) : (three ? 2 : 1); }

  startFinish(p) {
    const d = rimDist(p.x, p.z);
    const moving = hyp(p.vx, p.vz) > 1.6;
    const jumpH = 0.42 + 0.5 * rt(p, 'vertical');
    const reach = p.h * 1.33 + jumpH + 0.15;
    const dunkRating = moving ? p.build.attrs.drivingDunk : p.build.attrs.standingDunk;
    const canDunk = reach >= 3.25 && dunkRating >= (moving ? 58 : 66) && d < (moving ? 2.9 : 1.7);
    const kind = canDunk ? 'dunk' : 'layup';
    const anim = kind === 'dunk' ? animPreview(p.build, 'dunks') : animPreview(p.build, 'layup');
    const dur = kind === 'dunk' ? 1.0 : 0.85;
    const ang = Math.atan2(p.x - COURT.rim.x, p.z - COURT.rim.z);
    const tx = COURT.rim.x + Math.sin(ang) * 0.55, tz = COURT.rim.z + Math.max(0.25, Math.cos(ang) * 0.55);
    p.state = 'finish'; p.st = 0;
    p.finish = { kind, anim, dur, rel: dur * 0.6, released: false, x0: p.x, z0: p.z, tx, tz, jumpH: kind === 'dunk' ? Math.max(jumpH, 0.55) : jumpH * 0.8 };
    p.facing = Math.atan2(COURT.rim.x - p.x, COURT.rim.z - p.z);
    this.emit('finishStart', { id: p.id, kind });
  }

  updateFinish(p, dt) {
    const f = p.finish;
    const u = clamp(p.st / f.rel, 0, 1);
    const k = u * u * (3 - 2 * u);
    p.x = f.x0 + (f.tx - f.x0) * k; p.z = f.z0 + (f.tz - f.z0) * k;
    const air = clamp((p.st - f.rel * 0.35) / (f.dur - f.rel * 0.35), 0, 1);
    p.y = f.jumpH * Math.sin(Math.PI * air);
    if (!f.released && p.st >= f.rel) this.releaseFinish(p);
    if (p.st >= f.dur) { p.state = 'move'; p.st = 0; p.y = 0; p.finish = null; p.vx *= 0.3; p.vz *= 0.3; }
  }

  releaseFinish(p) {
    const f = p.finish;
    f.released = true;
    const c = this.contest(p);
    const dunk = f.kind === 'dunk';
    let pm;
    if (dunk) pm = 0.8 + 0.18 * rt(p, 'drivingDunk') - 0.38 * c * (1 - badgeBoost(p, 'posterizer', 0.08) - badgeBoost(p, 'rise_up', 0.05));
    else pm = 0.44 + 0.48 * rt(p, 'drivingLayup') - 0.45 * c * (1 - 0.4 * rt(p, 'strength') - badgeBoost(p, 'physical_finisher', 0.05))
      + badgeBoost(p, 'layup_mixmaster', 0.02) + badgeBoost(p, 'float_game', 0.015) + badgeBoost(p, 'paint_prodigy', 0.015);
    pm = clamp(pm, 0.05, 0.98);
    p.stats.fga++;
    const blocker = this.findBlocker(p, 1.7, dunk ? 0.05 + 0.1 * c : 0.1 + 0.18 * c);
    this.emit('release', { id: p.id, finish: f.kind, user: p.isUser, contest: c });
    if (blocker) { this.blocked(p, blocker); return; }
    this.launchShot(p, Math.random() < pm, this.points(false), false, f.kind === 'dunk' ? 'Dunk' : 'Layup', true);
  }

  findBlocker(shooter, range, base) {
    let best = null, bestP = 0;
    for (const q of this.players) {
      if (q.team === shooter.team || q.state === 'finish') continue;
      const d = hyp(q.x - shooter.x, q.z - shooter.z);
      if (d > range) continue;
      const airborne = q.state === 'jump' && q.y > 0.12;
      const reachAdv = (this.reach(q) - (shooter.h * 1.25 + shooter.y)) * 2;
      let pb = base * (0.15 + 0.6 * rt(q, 'block')) * (airborne ? 1.25 : 0.12) * clamp(1 + reachAdv, 0.3, 1.8);
      pb *= 1 + badgeBoost(q, 'high_flying_denier', 0.06) + badgeBoost(q, 'paint_patroller', 0.05);
      pb = clamp(pb, 0, 0.45);
      if (pb > bestP) { bestP = pb; best = q; }
    }
    return best && Math.random() < bestP ? best : null;
  }

  blocked(shooter, blocker) {
    const b = this.ball;
    blocker.stats.blk++;
    const ang = Math.atan2(shooter.x - blocker.x, shooter.z - blocker.z) + rand(-0.8, 0.8);
    Object.assign(b, { state: 'loose', holder: null, flight: null, x: shooter.x, y: shooter.h * 1.2 + shooter.y, z: shooter.z,
      vx: Math.sin(ang) * rand(1.2, 3), vy: rand(0.8, 2.2), vz: Math.cos(ang) * rand(1.2, 3), lastTouch: blocker.team, fromShot: { team: shooter.team } });
    this.emit('block', { id: blocker.id, shooter: shooter.id });
  }

  launchShot(p, make, pts, airball, grade, finish = false) {
    const b = this.ball;
    const fx = Math.sin(p.facing), fz = Math.cos(p.facing);
    const x0 = p.x + fx * 0.25, z0 = p.z + fz * 0.25, y0 = finish ? Math.min(3.0, p.h * 1.25 + p.y) : p.h * 1.12 + p.y + 0.15;
    let tx = COURT.rim.x, ty = COURT.rim.y + 0.06, tz = COURT.rim.z;
    if (!make) {
      const toShooter = Math.atan2(p.x - COURT.rim.x, p.z - COURT.rim.z);
      const side = grade.includes('Early') ? 0 : grade.includes('Late') ? Math.PI : rand(0, Math.PI * 2);
      const a = toShooter + side + rand(-0.9, 0.9);
      tx += Math.sin(a) * COURT.rimR * 1.05; tz += Math.cos(a) * COURT.rimR * 1.05;
      if (airball) { tx = COURT.rim.x + Math.sin(toShooter) * rand(0.5, 1.0); tz = COURT.rim.z + Math.cos(toShooter) * rand(0.5, 1.0); ty = 2.7; }
    }
    if (finish && p.finish?.kind === 'dunk' && make) ty = COURT.rim.y + 0.1;
    const dist = hyp(tx - x0, tz - z0);
    const T = finish ? 0.32 : 0.75 + dist * 0.055 * (p.shot?.anim?.arc || 1);
    const vx = (tx - x0) / T, vz = (tz - z0) / T, vy = (ty - y0 + 0.5 * G * T * T) / T;
    Object.assign(b, { state: 'air', holder: null, x: x0, y: y0, z: z0, vx, vy, vz, lastTouch: p.team,
      flight: { kind: 'shot', t: 0, T, make, pts, shooter: p, airball, three: pts === this.points(true) && !finish, finish, grade, needsClear: this.needsClear && p.team === this.poss } });
  }

  // ---------- passing / steals ----------
  passToward(p, dx, dz) {
    const mates = this.players.filter(q => q.team === p.team && q !== p);
    if (!mates.length) return;
    let best = mates[0], bs = -Infinity;
    const m = hyp(dx, dz);
    for (const q of mates) {
      const qx = q.x - p.x, qz = q.z - p.z, d = hyp(qx, qz) || 1;
      const align = m > 0.2 ? (qx * dx + qz * dz) / (d * m) : 0;
      const s = align * 2 + this.openness(q) * 0.5 - d * 0.05;
      if (s > bs) { bs = s; best = q; }
    }
    this.pass(p, best);
  }

  openness(q) {
    let d = 9;
    for (const o of this.players) if (o.team !== q.team) d = Math.min(d, hyp(o.x - q.x, o.z - q.z));
    return clamp((d - 0.8) / 2.5, 0, 1);
  }

  pass(p, to) {
    const b = this.ball;
    const speed = 9 + 5 * rt(p, 'passAccuracy') + (animPreview(p.build, 'passing').speed > 1.3 ? 2 : 0);
    const lead = clamp(hyp(to.x - p.x, to.z - p.z) / speed, 0.15, 1.2);
    const tx = to.x + to.vx * lead * 0.8, tz = to.z + to.vz * lead * 0.8;
    const x0 = p.x + Math.sin(p.facing) * 0.3, z0 = p.z + Math.cos(p.facing) * 0.3, y0 = 1.25;
    const dist = hyp(tx - x0, tz - z0);
    const T = Math.max(0.18, dist / speed);
    const ty = 1.2;
    p.state = 'pass'; p.st = 0;
    p.facing = Math.atan2(tx - p.x, tz - p.z);
    let receiver = to;
    // interception
    for (const q of this.players) {
      if (q.team === p.team) continue;
      const t = clamp(((q.x - x0) * (tx - x0) + (q.z - z0) * (tz - z0)) / (dist * dist || 1), 0.15, 0.9);
      const px = x0 + (tx - x0) * t, pz = z0 + (tz - z0) * t;
      const off = hyp(q.x - px, q.z - pz);
      if (off > 0.85) continue;
      const diff = q.isUser ? 1 : this.aiTuned(q) ? this.diff.steal : 0.8;
      const pi = (0.3 + 0.45 * rt(q, 'steal')) * (1 - 0.45 * rt(p, 'passAccuracy')) * (1 - off / 0.85) * diff * (1 + badgeBoost(q, 'interceptor', 0.08));
      if (Math.random() < pi) { receiver = q; break; }
    }
    const rx = receiver === to ? tx : receiver.x, rz = receiver === to ? tz : receiver.z;
    const T2 = receiver === to ? T : Math.max(0.15, hyp(rx - x0, rz - z0) / speed);
    Object.assign(b, { state: 'air', holder: null, x: x0, y: y0, z: z0,
      vx: (rx - x0) / T2, vz: (rz - z0) / T2, vy: (ty - y0 + 0.5 * G * T2 * T2) / T2, lastTouch: p.team,
      flight: { kind: 'pass', t: 0, T: T2, passer: p, receiver, intended: to } });
    this.lastPass = { passer: p, t: this.time };
    this.emit('pass', { from: p.id, to: to.id });
  }

  stealAttempt(p) {
    if (p.cool > 0 || p.state !== 'move') return;
    p.cool = 0.9; p.state = 'reach'; p.st = 0;
    const b = this.ball;
    if (b.state !== 'held' || b.holder.team === p.team) return;
    const h = b.holder;
    const d = hyp(h.x - p.x, h.z - p.z);
    if (d > 1.4) return;
    let ps = 0.1 + 0.3 * rt(p, 'steal') - 0.2 * rt(h, 'ballHandle');
    ps *= (1 + badgeBoost(p, 'glove', 0.1)) * (1 - badgeBoost(h, 'unpluckable', 0.08)) * (1 - badgeBoost(h, 'strong_handle', 0.03));
    if (h.state === 'jumper' || h.state === 'finish') ps *= 0.4;
    if (h.state === 'dmove') ps *= DRIBBLE_MOVES[h.dm.k].risk;
    if (p.guarding) ps *= 1.15;
    if (Math.random() < clamp(ps, 0.02, 0.5)) {
      p.stats.stl++; h.stats.to++;
      const ang = Math.atan2(p.x - h.x, p.z - h.z) + rand(-0.6, 0.6);
      Object.assign(b, { state: 'loose', holder: null, x: h.x, y: 0.9, z: h.z, vx: Math.sin(ang) * 2.4, vy: 1.2, vz: Math.cos(ang) * 2.4, lastTouch: p.team, fromShot: null });
      this.emit('steal', { id: p.id, from: h.id });
    } else if (Math.random() < 0.3) {
      p.stumble = 0.4;
      this.emit('whiff', { id: p.id });
    }
  }

  // ---------- ball ----------
  updateBall(dt) {
    const b = this.ball;
    if (b.state === 'held') {
      const h = b.holder;
      b.x = h.x + Math.sin(h.facing) * 0.3; b.z = h.z + Math.cos(h.facing) * 0.3; b.y = 1.0 + h.y;
      b.vx = b.vy = b.vz = 0;
      h.ai.hold += dt;
      return;
    }
    if (b.state === 'air') {
      const f = b.flight;
      f.t += dt;
      b.x += b.vx * dt; b.z += b.vz * dt; b.vy -= G * dt; b.y += b.vy * dt;
      if (f.kind === 'shot' && !f.finish && f.t < f.T * 0.2) {
        for (const q of this.players) {
          if (q.team === f.shooter.team || q.state !== 'jump') continue;
          const hd = hyp(q.x - b.x, q.z - b.z), vd = Math.abs(this.reach(q) - b.y);
          if (hd < 0.4 && vd < 0.35) {
            f.tried = f.tried || new Set();
            if (f.tried.has(q)) continue;
            f.tried.add(q);
            if (Math.random() < 0.05 + 0.18 * rt(q, 'block')) { this.blocked(f.shooter, q); return; }
          }
        }
      }
      if (f.t >= f.T) {
        if (f.kind === 'pass') {
          const r = f.receiver;
          if (hyp(r.x - b.x, r.z - b.z) < 1.6 && r.state !== 'finish') {
            if (r.team !== f.passer.team) { r.stats.stl++; f.passer.stats.to++; this.emit('steal', { id: r.id, from: f.passer.id, pick: true }); this.changePoss(r); }
            else this.giveBall(r);
          } else { b.state = 'loose'; b.vy = 0.5; b.fromShot = null; }
        } else this.resolveShot(f);
      }
      return;
    }
    if (b.state === 'loose' || b.state === 'dead') {
      b.vy -= G * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < BALL_R) {
        b.y = BALL_R;
        if (b.vy < -0.8) this.emit('bounce', { v: -b.vy });
        b.vy = -b.vy * 0.62; if (Math.abs(b.vy) < 0.5) b.vy = 0;
        b.vx *= 0.9; b.vz *= 0.9;
      }
      if (b.y <= BALL_R + 0.01 && b.vy === 0) { const k = Math.max(0, 1 - 1.8 * dt); b.vx *= k; b.vz *= k; }
      if (b.state === 'dead') return;
      // backboard
      if (b.z < COURT.boardZ + BALL_R && b.z > COURT.boardZ - 0.2 && b.y > 2.9 && b.y < 4.0 && Math.abs(b.x) < 0.92 && b.vz < 0) { b.vz = -b.vz * 0.5; b.z = COURT.boardZ + BALL_R; }
      if (Math.abs(b.x) > COURT.halfW || b.z > COURT.len || b.z < 0) {
        this.turnover(b.lastTouch, 'Out of Bounds');
        return;
      }
      // pickup
      let best = null, bs = -1;
      for (const p of this.players) {
        if (p.state === 'jumper' || p.state === 'finish' || p.stumble > 0) continue;
        const hd = hyp(p.x - b.x, p.z - b.z);
        const rr = 0.5 + 0.3 * (b.fromShot ? rt(p, b.fromShot.team === p.team ? 'offensiveRebound' : 'defensiveRebound') : rt(p, 'speed'));
        if (hd > rr || b.y > this.reach(p) + 0.1) continue;
        const s = (b.fromShot ? rt(p, b.fromShot.team === p.team ? 'offensiveRebound' : 'defensiveRebound') + badgeBoost(p, 'rebound_chaser', 0.05) + badgeBoost(p, 'boxout_beast', 0.05) : 0.5) + Math.random() * 0.4 - hd * 0.3;
        if (s > bs) { bs = s; best = p; }
      }
      if (best) {
        if (b.fromShot) { best.stats.reb++; this.emit('rebound', { id: best.id, off: b.fromShot.team === best.team }); }
        this.changePoss(best);
      }
    }
  }

  changePoss(p) {
    const changed = p.team !== this.poss;
    this.giveBall(p);
    if (changed) {
      this.poss = p.team;
      this.needsClear = !isThree(p.x, p.z);
      if (this.needsClear) this.emit('mustClear', { team: p.team });
    }
    this.shotClock = SHOT_CLOCK;
  }

  resolveShot(f) {
    const b = this.ball, p = f.shooter;
    if (f.make) {
      if (f.needsClear) {
        Object.assign(b, { state: 'dead', x: COURT.rim.x, y: COURT.rim.y - 0.1, z: COURT.rim.z, vx: 0, vy: -2.5, vz: 0 });
        this.emit('noClear', { team: p.team });
        p.stats.to++;
        this.scoredBy = p.team; this.phase = 'score'; this.phaseT = 0.3;
        return;
      }
      this.score[p.team] += f.pts;
      p.stats.pts += f.pts; p.stats.fgm++;
      if (f.three) p.stats.tpm++;
      const lp = this.lastPass;
      let assist = null;
      if (lp && lp.passer.team === p.team && lp.passer !== p && this.time - lp.t < 5) { lp.passer.stats.ast++; assist = lp.passer.id; }
      Object.assign(b, { state: 'dead', holder: null, x: COURT.rim.x, y: COURT.rim.y - 0.05, z: COURT.rim.z, vx: rand(-0.2, 0.2), vy: -2.6, vz: 0.15 });
      this.emit('make', { id: p.id, pts: f.pts, kind: f.finish ? (p.finish?.kind || 'layup') : f.three ? 'three' : 'jumper', grade: f.grade, assist, team: p.team });
      this.scoredBy = p.team;
      this.phase = 'score'; this.phaseT = 0;
      if (this.score[p.team] >= this.target) this.winner = p.team;
      return;
    }
    // miss
    const away = Math.atan2(b.x - COURT.rim.x, b.z - COURT.rim.z) + rand(-0.5, 0.5);
    const sp = f.airball ? 0.5 : rand(1.4, 3.4);
    Object.assign(b, { state: 'loose', vx: Math.sin(away) * sp, vz: Math.abs(Math.cos(away)) * sp * 0.9 + 0.5, vy: f.airball ? b.vy : rand(1.8, 4.2), lastTouch: p.team, fromShot: { team: p.team } });
    if (!f.airball) this.emit('rim', {});
    else this.emit('airball', { id: p.id });
    this.shotClock = SHOT_CLOCK;
  }

  turnover(team, reason) {
    const h = this.ball.state === 'held' ? this.ball.holder : null;
    if (h) h.stats.to++;
    this.emit('turnover', { team, reason });
    this.ball.state = 'dead'; this.ball.vy = Math.max(this.ball.vy, 0);
    this.scoredBy = team;
    this.phase = 'score'; this.phaseT = 0.6;
  }

  // ---------- AI ----------
  ai(p, dt) {
    const b = this.ball;
    p.ai.t -= dt;
    p.want.sprint = false; p.want.face = null;
    p.guarding = false;
    if (p.state === 'jumper' || p.state === 'finish' || p.state === 'jump' || p.state === 'dmove') return;
    const iq = this.aiTuned(p) ? this.diff.iq : 0.9;
    if (b.state === 'loose' || (b.state === 'air' && b.flight.kind === 'shot')) return this.aiChase(p);
    const offense = (b.state === 'held' ? b.holder.team : b.flight.passer.team) === p.team;
    if (offense) {
      if (b.state === 'held' && b.holder === p) return this.aiHandler(p, iq);
      return this.aiOffBall(p);
    }
    return this.aiDefend(p);
  }

  moveTo(p, x, z, sprint = false) {
    const dx = x - p.x, dz = z - p.z, d = hyp(dx, dz);
    if (d < 0.15) { p.want.x = 0; p.want.z = 0; return d; }
    const s = Math.min(1, d / 1.0);
    p.want.x = (dx / d) * s; p.want.z = (dz / d) * s; p.want.sprint = sprint && d > 2.5;
    return d;
  }

  aiChase(p) {
    const b = this.ball;
    let tx = b.x, tz = b.z;
    if (b.state === 'air') {
      // shot in the air: crash boards if close, otherwise hold position
      const d = rimDist(p.x, p.z);
      if (d > 5 && this.team(p.team).filter(q => rimDist(q.x, q.z) < d).length >= 1) {
        if (p.team !== b.flight.shooter.team && p.man) return this.aiDefend(p);
        return this.moveTo(p, p.x, p.z);
      }
      tx = COURT.rim.x + (p.x - COURT.rim.x) * 0.3; tz = COURT.rim.z + 1.0 + (p.z - COURT.rim.z) * 0.25;
    } else {
      const tGround = b.vy > 0 ? (b.vy + Math.sqrt(b.vy * b.vy + 2 * G * Math.max(0, b.y - 1))) / G : 0;
      tx = b.x + b.vx * tGround * 0.7; tz = b.z + b.vz * tGround * 0.7;
      const mine = this.players.filter(q => q.team === p.team).sort((a, c) => hyp(a.x - tx, a.z - tz) - hyp(c.x - tx, c.z - tz));
      if (mine.indexOf(p) > 0 && hyp(p.x - tx, p.z - tz) > 2.5) {
        // second player stays home a bit
        return this.moveTo(p, (p.x + tx) / 2, (p.z + tz) / 2);
      }
      if (hyp(p.x - b.x, p.z - b.z) < 1.2 && b.y > this.reach(p) && b.y < this.reach(p) + 0.8 && Math.random() < 0.08) this.startJump(p);
    }
    this.moveTo(p, tx, tz, true);
  }

  aiHandler(p, iq) {
    const ai = p.ai;
    const d = rimDist(p.x, p.z);
    const user = this.user;
    // teammate of the user: honor a call for the ball
    if (p.callFor && p.callFor.team === p.team && p.ai.hold > 0.25) {
      const target = p.callFor; p.callFor = null;
      if (this.laneOpen(p, target)) { this.pass(p, target); return; }
    }
    if (this.needsClear && this.poss === p.team) {
      const ang = Math.atan2(p.x - COURT.rim.x, p.z - COURT.rim.z);
      const r = COURT.threeR + 1.1;
      let tx = COURT.rim.x + Math.sin(ang) * r, tz = COURT.rim.z + Math.max(Math.cos(ang), 0.45) * r;
      tx = clamp(tx, -6.2, 6.2);
      this.moveTo(p, tx, tz, true);
      return;
    }
    if (ai.t > 0 && !ai.drive) return;
    // AI handlers break down a tight defender with a move of their own
    const tight = this.laneDefender(p, COURT.rim.x, COURT.rim.z, 0.9);
    if (tight && tight.d < 1.5 && p.cool <= 0 && Math.random() < 0.22 * rt(p, 'ballHandle') * iq) {
      const kinds = Object.keys(DRIBBLE_MOVES);
      this.startMove(p, kinds[Math.floor(Math.random() * kinds.length)]);
      ai.drive = Math.random() < 0.55; ai.t = 0.2;
      return;
    }
    if (p.spaceT > 0 && Math.random() < 0.45) { this.aiShoot(p); return; }
    if (ai.drive) {
      if (d < 2.7) { ai.drive = false; this.startFinish(p); return; }
      const blockedLane = this.laneDefender(p, COURT.rim.x, COURT.rim.z, 0.7);
      if (blockedLane && blockedLane.d < 1.1 && Math.random() < 0.6 * iq) {
        ai.drive = false;
        const kick = this.bestOpenMate(p);
        if (kick && this.openness(kick) > 0.45 && Math.random() < 0.7) { this.pass(p, kick); return; }
        if (d < 4.6 && Math.random() < 0.5) { this.aiShoot(p); return; }
      }
      this.moveTo(p, COURT.rim.x, COURT.rim.z + 0.4, true);
      return;
    }
    ai.t = rand(0.18, 0.35);
    const contest = this.contest(p);
    const r = this.shotRating(p, d);
    const three = isThree(p.x, p.z);
    const q = (0.28 + 0.6 * r) * (1 - 0.65 * contest) * (three ? 1.5 : 1) * (d > COURT.threeR + 1.5 ? 0.4 : 1);
    if (d < 2.4) { this.startFinish(p); return; }
    if (this.shotClock < 2.5) { this.aiShoot(p); return; }
    const mate = this.bestOpenMate(p);
    const mateQ = mate ? this.openness(mate) * (mate.isUser ? 1.25 : 1) : 0;
    if (q > 0.62 && ai.hold > 0.6 && Math.random() < 0.55 * iq + 0.15) { this.aiShoot(p); return; }
    const lane = !this.laneDefender(p, COURT.rim.x, COURT.rim.z, 0.9);
    const driver = Math.max(rt(p, 'drivingLayup'), rt(p, 'drivingDunk'));
    if (lane && d < 8.5 && driver > 0.45 && Math.random() < 0.45) { ai.drive = true; return; }
    if (mate && (mateQ > 0.55 || ai.hold > 3.2) && Math.random() < 0.5 && this.laneOpen(p, mate)) { this.pass(p, mate); return; }
    if (ai.hold > 5 && q > 0.35) { this.aiShoot(p); return; }
    // probe
    if (!ai.spot || ai.spotT < this.time || hyp(p.x - ai.spot[0], p.z - ai.spot[1]) < 0.5) {
      const ang = rand(-1.2, 1.2), rr = rand(4.5, 8.2);
      ai.spot = [clamp(Math.sin(ang) * rr, -6.5, 6.5), clamp(COURT.rim.z + Math.cos(ang) * rr, 2, 11)];
      ai.spotT = this.time + rand(1, 2.2);
    }
    this.moveTo(p, ai.spot[0], ai.spot[1]);
    void user;
  }

  aiShoot(p) {
    this.startJumper(p);
    const s = p.shot;
    const r = this.shotRating(p, rimDist(p.x, p.z));
    const sigma = (0.1 - 0.06 * r) * (this.aiTuned(p) ? this.diff.aim : 1.05);
    s.aiRelease = s.ideal + gauss() * sigma;
  }

  laneDefender(p, tx, tz, width) {
    const dx = tx - p.x, dz = tz - p.z, L = hyp(dx, dz) || 1;
    let hit = null;
    for (const q of this.players) {
      if (q.team === p.team) continue;
      const t = ((q.x - p.x) * dx + (q.z - p.z) * dz) / (L * L);
      if (t < 0 || t > 1) continue;
      const off = hyp(q.x - (p.x + dx * t), q.z - (p.z + dz * t));
      if (off < width) { const d = t * L; if (!hit || d < hit.d) hit = { q, d }; }
    }
    return hit;
  }
  laneOpen(p, to) { const h = this.laneDefender(p, to.x, to.z, 0.55); return !h || Math.random() < 0.25; }
  bestOpenMate(p) {
    let best = null, bs = -1;
    for (const q of this.players) {
      if (q.team !== p.team || q === p || q.state !== 'move') continue;
      const s = this.openness(q) + (q.isUser ? 0.2 : 0) - rimDist(q.x, q.z) * 0.02;
      if (s > bs) { bs = s; best = q; }
    }
    return best;
  }

  aiOffBall(p) {
    const ai = p.ai;
    const h = this.ball.state === 'held' ? this.ball.holder : null;
    if (this.needsClear && this.poss === p.team && h) {
      // spread out while the ball gets cleared
      if (!ai.spot || rimDist(ai.spot[0], ai.spot[1]) < COURT.threeR) ai.spot = SPOTS[[0, 1, 4][p.id % 3]];
    }
    const mates = this.players.filter(q => q.team === p.team && q !== p);
    if (!ai.spot || ai.spotT < this.time) {
      const big = p.h > 2.03;
      const choices = SPOTS.filter(([x, z]) => mates.every(m => hyp(m.x - x, m.z - z) > 3) && (big || rimDist(x, z) > 4 || Math.random() < 0.3));
      ai.spot = choices.length ? choices[Math.floor(Math.random() * choices.length)] : SPOTS[p.id % SPOTS.length];
      ai.spotT = this.time + rand(2.5, 5);
      // backdoor cut when the defender is ball-watching
      const def = this.players.find(q => q.man === p);
      if (def && h && hyp(def.x - p.x, def.z - p.z) > 2.2 && Math.random() < 0.35) { ai.spot = [rand(-0.8, 0.8), 2.2]; ai.spotT = this.time + 1.6; }
    }
    this.moveTo(p, ai.spot[0], ai.spot[1], rimDist(ai.spot[0], ai.spot[1]) < 3);
  }

  aiDefend(p) {
    const m = p.man;
    if (!m) return;
    const b = this.ball;
    const onBall = b.state === 'held' && b.holder === m;
    const rx = COURT.rim.x - m.x, rz = COURT.rim.z - m.z, rd = hyp(rx, rz) || 1;
    let tx, tz;
    if (onBall) {
      const gap = 0.95 + (1 - rt(p, 'perimeterDefense')) * 0.45 + (rimDist(m.x, m.z) > 8.5 ? 0.6 : 0);
      tx = m.x + (rx / rd) * gap; tz = m.z + (rz / rd) * gap;
      if (p.ai.t <= 0) {
        p.ai.t = 0.25;
        const d = hyp(m.x - p.x, m.z - p.z);
        const rate = 0.32 * rt(p, 'steal') * (this.aiTuned(p) ? this.diff.steal : 0.8);
        if (d < 1.3 && Math.random() < rate * 0.25) this.stealAttempt(p);
      }
    } else {
      const bx = b.x - m.x, bz = b.z - m.z, bd = hyp(bx, bz) || 1;
      const sag = 1.0 + (1 - rt(p, 'perimeterDefense')) * 0.5;
      tx = m.x + (rx / rd) * sag + (bx / bd) * 0.6; tz = m.z + (rz / rd) * sag + (bz / bd) * 0.6;
    }
    p.want.face = Math.atan2(m.x - p.x, m.z - p.z);
    p.guarding = onBall && hyp(m.x - p.x, m.z - p.z) < 2.2;
    this.moveTo(p, tx, tz, hyp(tx - p.x, tz - p.z) > 3);
    // contests and rim protection
    const shooter = this.players.find(q => q.team !== p.team && (q.state === 'jumper' && !q.shot.released || q.state === 'finish' && !q.finish.released));
    if (shooter) {
      const d = hyp(shooter.x - p.x, shooter.z - p.z);
      const react = (this.aiTuned(p) ? this.diff.react : 0.24) + 0.1 * (1 - rt(p, 'block'));
      if (shooter.state === 'jumper') {
        if (d < 2.4 && shooter.st > react && shooter.st > shooter.shot.Tm * 0.55 && p.state === 'move') {
          if (d > 1.0) this.moveTo(p, shooter.x, shooter.z, true);
          if (d < 1.5) this.startJump(p);
        }
      } else if (rimDist(p.x, p.z) < 3 && d < 2.2 && shooter.st > react + 0.15 && p.state === 'move') {
        this.startJump(p);
      }
    }
  }

  // ---------- network: the host streams snapshots, clients mirror them ----------
  snapshot() {
    const r = v => Math.round(v * 1000) / 1000;
    const b = this.ball;
    const snap = {
      T: r(this.time), ph: this.phase, pT: r(this.phaseT), sc: [...this.score], po: this.poss, cl: r(this.shotClock), nc: this.needsClear, w: this.winner,
      p: this.players.map(p => [
        r(p.x), r(p.z), r(p.y), r(p.vx), r(p.vz), r(p.facing), p.state, r(p.st), r(p.energy), r(p.gait), p.isUser ? 1 : 0,
        p.shot ? { Tm: r(p.shot.Tm), i: r(p.shot.ideal), w: r(p.shot.window), rl: p.shot.released, rt: r(p.shot.relT), g: p.shot.grade || null, a: p.shot.anim } : null,
        p.finish ? { k: p.finish.kind, d: p.finish.dur, r: p.finish.rel, rl: p.finish.released, a: p.finish.anim } : null,
        p.stats,
        p.hand, p.dm ? { k: p.dm.k, d: r(p.dm.d), s: p.dm.side, f: p.dm.from } : null, p.guarding ? 1 : 0, r(p.stumble), p.fallen ? 1 : 0,
      ]),
      b: [b.state, b.holder ? b.holder.id : -1, r(b.x), r(b.y), r(b.z), r(b.vx), r(b.vy), r(b.vz), b.flight?.kind || null],
      e: [],
    };
    return snap;
  }

  applySnapshot(s) {
    this.time = s.T; this.phase = s.ph; this.phaseT = s.pT; this.score = s.sc; this.poss = s.po; this.shotClock = s.cl; this.needsClear = s.nc; this.winner = s.w;
    s.p.forEach((a, i) => {
      const p = this.players[i];
      if (!p) return;
      const [x, z, y, vx, vz, f, state, st, energy, gait, human, shot, fin, stats, hand, dm, guarding, stumble, fallen] = a;
      p.hand = hand || 'R'; p.guarding = !!guarding; p.stumble = stumble || 0; p.fallen = !!fallen;
      p.dm = dm ? { k: dm.k, d: dm.d, side: dm.s, from: dm.f } : null;
      // small corrections blend, big ones snap
      const blend = hyp(p.x - x, p.z - z) < 0.8 ? 0.5 : 1;
      p.x += (x - p.x) * blend; p.z += (z - p.z) * blend;
      p.y = y; p.vx = vx; p.vz = vz; p.facing = f; p.energy = energy; p.gait = gait; p.stats = stats;
      p.isUser = !!human;
      if (p.state !== state || Math.abs(p.st - st) > 0.15) p.st = st;
      p.state = state;
      p.shot = shot ? { Tm: shot.Tm, ideal: shot.i, window: shot.w, released: shot.rl, relT: shot.rt, grade: shot.g, anim: shot.a } : null;
      p.finish = fin ? { kind: fin.k, dur: fin.d, rel: fin.r, released: fin.rl, anim: fin.a } : null;
    });
    const [state, hid, x, y, z, vx, vy, vz, fk] = s.b;
    const b = this.ball;
    Object.assign(b, { state, holder: hid >= 0 ? this.players[hid] : null, x, y, z, vx, vy, vz, flight: fk ? { kind: fk } : null });
    return s.e || [];
  }

  // dead-reckoning between snapshots on clients
  extrapolate(dt) {
    this.time += dt; this.phaseT += dt;
    if (this.phase === 'live' && this.ball.state === 'held') this.shotClock = Math.max(0, this.shotClock - dt);
    for (const p of this.players) {
      p.st += dt;
      p.stumble = Math.max(0, p.stumble - dt);
      if (p.state === 'move' || p.state === 'pass' || p.state === 'reach' || p.state === 'dmove') {
        p.x += p.vx * dt; p.z += p.vz * dt; p.gait += hyp(p.vx, p.vz) * dt;
      }
    }
    const b = this.ball;
    if (b.state === 'air' || b.state === 'loose' || b.state === 'dead') {
      b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y < BALL_R) { b.y = BALL_R; b.vy = -b.vy * 0.6; }
    }
  }
}
