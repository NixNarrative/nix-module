// Petra's spells: geometry on v13 templates and v14 Regions gives the same walls; Chris's
// Premades 2 step-aside; Sorcerous Burst plan. node dev/petra-spells.test.mjs
import assert from 'node:assert/strict';
globalThis.foundry = {utils: {}};
const M = await import(new URL('../scripts/court/petra-spells.mjs', import.meta.url));
const grid = {size: 100, distance: 5};   // 20 px per ft
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, msg + ': ' + a + ' vs ' + b);

// A 60 ft wall from (100, 100) pointing east: template (v13) and Region line shape (v14).
const tpl = M.shapeOf({t: 'ray', x: 100, y: 100, direction: 0, distance: 60}, grid);
const reg = M.regionShape({type: 'line', x: 100, y: 100, rotation: 0, length: 60 * 20, width: 20});
assert.equal(reg.type, 'line');
near(reg.b.x, tpl.b.x, 'line end x'); near(reg.b.y, tpl.b.y, 'line end y');
// Rotated 90 degrees (south).
const reg90 = M.regionShape({type: 'line', x: 0, y: 0, rotation: 90, length: 200});
near(reg90.b.x, 0, 'south x'); near(reg90.b.y, 200, 'south y');
// Ring (cylinder -> circle), radius 10 ft.
const c1 = M.shapeOf({t: 'circle', x: 500, y: 500, distance: 10}, grid);
const c2 = M.regionShape({type: 'circle', x: 500, y: 500, radius: 200});
assert.deepEqual(c2, c1);
// Same results through the rule helpers.
const p = {x: 400, y: 150};
assert.equal(M.sideOf(p, reg), M.sideOf(p, tpl));
near(M.distTo(p, reg), M.distTo(p, tpl), 'distance');
assert.equal(M.crosses({x: 300, y: 50}, {x: 300, y: 150}, reg), true, 'walk through the wall');
assert.equal(M.crosses({x: 300, y: 50}, {x: 300, y: 90}, reg), false, 'stop short');
assert.equal(M.inDeathZone({x: 300, y: 110}, 50, reg, 1, 10 * 20), true, 'inside');
assert.equal(M.inDeathZone({x: 300, y: 250}, 50, reg, M.sideOf({x: 300, y: 250}, reg), 10 * 20), true, 'damaging side within reach');
assert.equal(M.inDeathZone({x: 300, y: 250}, 50, reg, -M.sideOf({x: 300, y: 250}, reg), 10 * 20), false, 'other side');
assert.equal(M.regionShape(null), null);
assert.equal(M.regionShape({type: 'emanation', base: {x: 10, y: 20}, radius: 30}).c.x, 10);

// Chris's Premades 2 owns the spell again (Medkit re-apply): ours steps aside.
assert.equal(M.cpr2Owns({flags: {cat: {macros: {roll: [{source: 'chris-premades', identifier: 'wall-of-death'}]}}}}), true);
assert.equal(M.cpr2Owns({flags: {cat: {macros: {roll: [{source: 'chris-premades', identifier: 'prismatic-wall'}]}}}}), true);
assert.equal(M.cpr2Owns({flags: {cat: {macros: {item: [{source: 'midi-qol', identifier: 'automation-notes'}]}}}}), false);
assert.equal(M.cpr2Owns({flags: {}}), false);

// Sorcerous Burst: two 8s, cap 3.
let seq = [8, 2, 5];
assert.deepEqual(M.burstPlan([8, 8], 3, () => seq.shift()), [8, 2, 5]);
assert.deepEqual(M.burstPlan([1, 2], 3, () => 8), []);
console.log('petra-spells tests: all passed');
