import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../public/js/build.js';
import { ATTR_KEYS, BUILD_BUDGET, POSITION_KEYS, BADGES, ANIMATIONS, ANIM_KEYS } from '../public/js/data.js';

test('default build is valid and within budget', () => {
  const b = B.defaultBuild();
  const d = B.derive(b);
  assert.ok(d.spent <= BUILD_BUDGET);
  assert.ok(d.ovr >= 40 && d.ovr <= 99);
  for (const k of ATTR_KEYS) assert.ok(b.attrs[k] <= d.caps[k]);
});

test('taller players lose handle caps and gain block caps', () => {
  const short = B.computeCaps(B.clampBody({ height: 72, weight: 185, wingspan: 76, bodyType: 'Athletic' }));
  const tall = B.computeCaps(B.clampBody({ height: 86, weight: 260, wingspan: 90, bodyType: 'Athletic' }));
  assert.ok(short.ballHandle > tall.ballHandle);
  assert.ok(short.speed > tall.speed);
  assert.ok(tall.block > short.block);
  assert.ok(tall.standingDunk > short.standingDunk);
});

test('growing taller clamps ratings to the new caps', () => {
  const b = B.defaultBuild();
  b.attrs.ballHandle = 95;
  b.body.height = 91;
  const d = B.derive(b);
  assert.equal(b.attrs.ballHandle, d.caps.ballHandle);
  assert.ok(d.caps.ballHandle < 95);
});

test('random builds respect caps, budget, badge points and animation requirements', () => {
  for (let i = 0; i < 150; i++) {
    const b = B.randomBuild();
    const d = B.derive(b);
    assert.ok(d.spent <= BUILD_BUDGET, 'over budget');
    assert.ok(POSITION_KEYS.includes(b.position));
    for (const k of ATTR_KEYS) assert.ok(b.attrs[k] >= 25 && b.attrs[k] <= d.caps[k]);
    assert.ok(d.badgeSpent <= d.badgeBudget, 'badge points over budget');
    for (const [id, t] of Object.entries(b.badges)) assert.ok(t <= B.badgeMaxTier(BADGES.find(x => x.id === id), b));
    for (const key of ANIM_KEYS) {
      const def = ANIMATIONS[key];
      const ids = def.multi ? b.anims[key] : [b.anims[key]];
      for (const id of ids) assert.ok(B.animUnlocked(def.items.find(x => x.id === id), b));
    }
    assert.ok(d.arch.name.length > 0);
  }
});

test('maxAffordable never lets a slider exceed the budget', () => {
  const b = B.defaultBuild();
  const caps = B.computeCaps(b.body);
  for (const k of ATTR_KEYS) b.attrs[k] = caps[k];
  B.enforceCaps(b);
  assert.ok(B.totalCost(b.attrs) <= BUILD_BUDGET);
  const k = ATTR_KEYS.find(x => b.attrs[x] < caps[x]);
  if (k) {
    const m = B.maxAffordable(b, k, caps);
    const trial = { ...b.attrs, [k]: m };
    assert.ok(B.totalCost(trial) <= BUILD_BUDGET);
  }
});

test('share codes round-trip', () => {
  const b = B.randomBuild();
  b.identity.first = 'Zoë';
  const back = B.decodeBuild(B.encodeBuild(b));
  assert.deepEqual(back.attrs, b.attrs);
  assert.deepEqual(back.body, b.body);
  assert.equal(back.identity.first, 'Zoë');
  assert.equal(back.position, b.position);
});

test('sanitize rejects junk and over-budget input', () => {
  const b = B.sanitizeBuild({
    identity: { first: '<img src=x onerror=alert(1)>'.repeat(5), number: 'abc123' },
    position: 'QB', body: { height: 200, weight: -5, wingspan: 'x' },
    look: { skin: 'red;background:url(x)', hair: 'Spikes', tattoos: ['Face', 'Chest'] },
    attrs: Object.fromEntries(ATTR_KEYS.map(k => [k, 99])),
    badges: { deadeye: 9, fake: 2 },
  });
  assert.equal(b.position, 'PG');
  assert.ok(b.identity.first.length <= 20);
  assert.equal(b.identity.number, '12');
  assert.equal(b.body.height, 91);
  assert.match(b.look.skin, /^#[0-9a-f]{6}$/i);
  assert.deepEqual(b.look.tattoos, ['Chest']);
  assert.ok(B.totalCost(b.attrs) <= BUILD_BUDGET);
  assert.equal(b.badges.fake, undefined);
  assert.ok(!(b.badges.deadeye > 4));
});

test('overall rewards position-relevant ratings', () => {
  const b = B.defaultBuild();
  const guard = { ...b, position: 'PG', attrs: { ...b.attrs, ballHandle: 90, passAccuracy: 90 } };
  const big = { ...guard, position: 'C' };
  assert.ok(B.overall(guard) > B.overall(big));
});
