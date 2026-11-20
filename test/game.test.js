import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, COURT, isThree, buildAtOvr } from '../public/js/game/sim.js';
import { randomBuild, overall, totalCost } from '../public/js/build.js';
import { BUILD_BUDGET } from '../public/js/data.js';

function playOut(game, maxSecs = 1500) {
  game.user.isUser = false; // let the AI drive the user's player too
  let t = 0;
  while (game.phase !== 'over' && t < maxSecs) { game.step(1 / 60, null); game.events.length = 0; t += 1 / 60; }
  return t;
}

test('three-point line geometry', () => {
  assert.equal(isThree(0, 6), false);
  assert.equal(isThree(0, COURT.rim.z + 7.5), true);
  assert.equal(isThree(6.9, 1), true);
  assert.equal(isThree(6.5, 1), false);
});

test('buildAtOvr lands near the requested overall and stays legal', () => {
  for (const target of [55, 65, 75, 85]) {
    const b = buildAtOvr(target);
    assert.ok(Math.abs(overall(b) - target) <= 2, `wanted ${target}, got ${overall(b)}`);
    assert.ok(totalCost(b.attrs) <= BUILD_BUDGET);
  }
});

test('AI-vs-AI games finish with a winner at the target score', () => {
  for (const [mode, target, scoring] of [[2, 11, '12'], [3, 21, '23'], [3, 11, '23']]) {
    const g = new Game({ userBuild: randomBuild(), mode, target, scoring, difficulty: 'pro' });
    assert.equal(g.players.length, mode * 2);
    playOut(g);
    assert.equal(g.phase, 'over', `${mode}v${mode} to ${target} did not finish`);
    assert.ok(g.score[g.winner] >= target);
    const pts = g.players.reduce((s, p) => s + (p.team === g.winner ? p.stats.pts : 0), 0);
    assert.equal(pts, g.score[g.winner]);
  }
});

test('players and a held ball stay on the court', () => {
  const g = new Game({ userBuild: randomBuild(), mode: 3, target: 21 });
  g.user.isUser = false;
  for (let i = 0; i < 60 * 90; i++) {
    g.step(1 / 60, null); g.events.length = 0;
    for (const p of g.players) {
      assert.ok(Math.abs(p.x) <= COURT.halfW && p.z >= 0 && p.z <= COURT.len, 'player left the court');
      assert.ok(p.y >= 0);
    }
    if (g.phase === 'over') break;
  }
});

test('user shot timing: a perfect release grades Excellent, a tap grades Very Early', () => {
  const g = new Game({ userBuild: randomBuild(), mode: 2, target: 11 });
  g.setupCheck(0);
  g.phase = 'live';
  const noop = { mx: 0, mz: 0, shoot: false, sprint: false, shootPressed: false, shootReleased: false, passPressed: false };
  for (const p of g.players) if (!p.isUser) { p.x = 7; p.z = 13; }
  g.step(1 / 60, { ...noop, shoot: true, shootPressed: true });
  assert.equal(g.user.state, 'jumper');
  while (g.user.st + 1 / 60 < g.user.shot.ideal) g.step(1 / 60, { ...noop, shoot: true });
  const grades = [];
  g.events.length = 0;
  g.step(1 / 60, { ...noop, shoot: false, shootReleased: true });
  for (const e of g.events) if (e.type === 'release') grades.push(e.grade);
  assert.deepEqual(grades, ['Excellent']);

  g.setupCheck(0); g.phase = 'live'; g.events.length = 0;
  g.step(1 / 60, { ...noop, shoot: true, shootPressed: true });
  g.step(1 / 60, { ...noop, shoot: false, shootReleased: true });
  assert.equal(g.events.find(e => e.type === 'release').grade, 'Very Early');
});
