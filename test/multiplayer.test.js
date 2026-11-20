import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/js/game/sim.js';
import { randomBuild } from '../public/js/build.js';
import { presetBuilds } from '../public/js/game/presets.js';

const roster = () => [
  { team: 0, build: randomBuild(), human: 'a' }, { team: 0, build: randomBuild() }, { team: 0, build: randomBuild() },
  { team: 1, build: randomBuild(), human: 'b' }, { team: 1, build: randomBuild() }, { team: 1, build: randomBuild() },
];
const idle = { mx: 0, mz: 0, shoot: false, sprint: false, shootPressed: false, shootReleased: false, passPressed: false };

test('each human is driven by their own controller input', () => {
  const g = new Game({ mode: 3, target: 21, roster: roster(), firstPoss: 0 });
  while (g.phase !== 'live') g.step(1 / 60, {});
  const a = g.players[0], b = g.players[3];
  const ax = a.x, bx = b.x;
  for (let i = 0; i < 60; i++) g.step(1 / 60, { a: { ...idle, mx: 1 }, b: { ...idle, mx: -1 } });
  assert.ok(a.x > ax + 1, 'player a moved right');
  assert.ok(b.x < bx - 1, 'player b moved left');
});

test('the team with the ball checks it to a human when it has one', () => {
  const g = new Game({ mode: 3, target: 21, roster: roster(), firstPoss: 1 });
  assert.equal(g.ball.holder.ctrl, 'b');
});

test('a disconnected human is taken over by the AI', () => {
  const g = new Game({ mode: 3, target: 11, roster: roster(), firstPoss: 0 });
  g.releaseControl('b');
  assert.equal(g.players[3].isUser, false);
  assert.deepEqual(g.humanTeams, [true, false]);
  g.releaseControl('a');
  let t = 0;
  while (g.phase !== 'over' && t < 1500) { g.step(1 / 60, {}); g.events.length = 0; t += 1 / 60; }
  assert.equal(g.phase, 'over', 'all-AI game still finishes');
});

test('snapshots mirror the host game on a client', () => {
  const r = roster();
  const host = new Game({ mode: 3, target: 21, roster: r, firstPoss: 0 });
  const client = new Game({ mode: 3, target: 21, roster: r.map(x => ({ ...x, build: JSON.parse(JSON.stringify(x.build)) })), firstPoss: 0 });
  host.user.isUser = true;
  for (let i = 0; i < 60 * 8; i++) { host.step(1 / 60, { a: { ...idle, mx: 0.5, mz: -0.5 } }); host.events.length = 0; }
  const snap = JSON.parse(JSON.stringify(host.snapshot()));
  assert.ok(JSON.stringify(snap).length < 6000, 'snapshot stays small');
  for (let i = 0; i < 12; i++) client.applySnapshot(snap); // small corrections blend in over several snapshots
  for (const [i, p] of host.players.entries()) {
    const q = client.players[i];
    assert.ok(Math.abs(p.x - q.x) < 0.01 && Math.abs(p.z - q.z) < 0.01, `player ${i} position`);
    assert.equal(q.state, p.state);
  }
  assert.deepEqual(client.score, host.score);
  assert.equal(client.ball.state, host.ball.state);
  assert.equal(client.ball.holder?.id, host.ball.holder?.id);
  client.extrapolate(0.1);
  assert.ok(client.time > host.time);
});

test('presets are fixed data', () => {
  const a = presetBuilds();
  assert.equal(a.length, 8);
  assert.equal(new Set(a.map(b => b.id)).size, 8);
  assert.equal(JSON.stringify(a), JSON.stringify(presetBuilds()));
});
