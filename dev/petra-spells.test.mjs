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

// 1.7.5: Wall of Death keeps its area right after the cast (Midi's instantaneous-template removal), not later or ours
assert.equal(M.keepWallArea({state: {kind: 'death'}, ageMs: 5000, effectUp: true, ours: false}), true, 'Midi removal 5 s after the cast: kept');
assert.equal(M.keepWallArea({state: {kind: 'death'}, ageMs: 5000, effectUp: true, ours: true}), false, 'our own end: allowed');
assert.equal(M.keepWallArea({state: {kind: 'death'}, ageMs: 5000, effectUp: false, ours: false}), false, 'concentration already gone: allowed');
assert.equal(M.keepWallArea({state: {kind: 'death'}, ageMs: 60000, effectUp: true, ours: false}), false, 'a GM deleting it later: allowed');
assert.equal(M.keepWallArea({state: null, ageMs: 0, effectUp: true, ours: false}), false, 'not one of ours');
// 1.7.5: Wall of Death temp HP reaction
assert.equal(M.deathReactionAllowed({dealt: 14, inCombat: true, reactionUsed: false}), true);
assert.equal(M.deathReactionAllowed({dealt: 14, inCombat: true, reactionUsed: true}), false, 'reaction spent this round');
assert.equal(M.deathReactionAllowed({dealt: 14, inCombat: false, reactionUsed: true}), true, 'out of combat: no reaction tracking');
assert.equal(M.deathReactionAllowed({dealt: 0, inCombat: false, reactionUsed: false}), false, 'no damage dealt');
assert.equal(M.deathReactionAllowed({dealt: 9, inCombat: false, reactionUsed: false, incapacitated: true}), false);

// 1.7.5: Sorcerous Burst formula strip in both "Petra: spells" installers ("1d8x@mod=8" rolled as 4d86 on v13).
{
    const fsx = await import('node:fs');
    for (const rel of ['../automations/court-of-ravenloft/petra/install-petra-spells.js', '../automations/court-of-ravenloft/petra/v14/install-petra-spells.js']) {
        const src = fsx.readFileSync(new URL(rel, import.meta.url), 'utf8');
        const grab = name => eval(src.match(new RegExp('const ' + name + ' = (/[^\\n]+/ig);'))[1]);
        const NATIVE = grab('NATIVE'), DAMAGED = grab('DAMAGED');
        const fix = f => f.replace(NATIVE, '$1').replace(DAMAGED, '$1');
        assert.equal(fix('1d8x@mod=8'), '1d8', rel + ': native explode stripped');
        assert.equal(fix('1d8@mod=8'), '1d8', rel + ': damaged formula repaired');
        assert.equal(fix('1d8x8'), '1d8'); assert.equal(fix('1d8xo=8 + @mod'), '1d8 + @mod');
        assert.equal(fix('2d8 + 3'), '2d8 + 3', rel + ': plain formula untouched');
    }
}
console.log('petra-spells tests: all passed');
// 1.7.5: Book of Vile Darkness, Dark Speech skips evil creatures
assert.equal(M.isEvil({system: {details: {alignment: 'Neutral Evil'}}}), true);
assert.equal(M.isEvil({system: {details: {alignment: 'Chaotic Good'}}}), false);
assert.equal(M.isEvil({system: {details: {alignment: ''}}}), false);
assert.equal(M.isEvil({system: {details: {alignment: 'Lawful evil'}}}), true);
console.log('petra-spells (1.7.5 additions): passed');
// 1.7.5: Prismatic Wall parts 1 and 3 (Nix 2026-11-20: auto-redirect, AC 10, orange 25+ thunder, green 25+ lightning)
assert.equal(M.PRISM_AC, 10);
assert.equal(M.prismAttackHits({total: 10}), true, 'meets AC 10');
assert.equal(M.prismAttackHits({total: 9}), false, 'below AC 10');
assert.equal(M.prismAttackHits({total: 25, fumble: true}), false, 'natural 1 misses');
assert.equal(M.prismAttackHits({total: 3, critical: true}), true, 'critical hits');
assert.equal(M.layerBreaks('red', {damage: {cold: 20}}), true);
assert.equal(M.layerBreaks('red', {damage: {cold: 19, fire: 40}}), false);
assert.equal(M.layerBreaks('orange', {damage: {thunder: 30}}), true, 'orange: thunder');
assert.equal(M.layerBreaks('orange', {damage: {thunder: 29}}), false);
assert.equal(M.layerBreaks('yellow', {damage: {force: 39}}), false);
assert.equal(M.layerBreaks('yellow', {damage: {force: 40}}), true);
assert.equal(M.layerBreaks('green', {damage: {lightning: 50}}), true, 'green: lightning');
assert.equal(M.layerBreaks('green', {spell: 'Passwall'}), false, 'green: Passwall no longer');
assert.equal(M.layerBreaks('blue', {damage: {fire: 60}}), true);
assert.equal(M.layerBreaks('indigo', {spell: 'Daylight'}), true);
assert.equal(M.layerBreaks('indigo', {damage: {radiant: 99}}), false);
assert.equal(M.layerBreaks('violet', {spell: 'Dispel Magic'}), true);
assert.equal(M.layerBreaks('violet', {spell: 'Fire Bolt'}), false);
// Teleport detection: Chris's Premades 1 (isPaste), CAT (displace), Foundry teleport actions; walking is not one.
assert.equal(M.isTeleportMove({isPaste: true}, 'a', {}), true);
assert.equal(M.isTeleportMove({movement: {a: {waypoints: [{action: 'displace'}]}}}, 'a', {}), true);
assert.equal(M.isTeleportMove({movement: {a: {waypoints: [{action: 'jaunt'}]}}}, 'a', {jaunt: {teleport: true}}), true);
assert.equal(M.isTeleportMove({movement: {a: {waypoints: [{action: 'walk'}]}}}, 'a', {walk: {}}), false);
assert.equal(M.isTeleportMove({}, 'a', {}), false);
// Stop short: wall along y = 100 (x 100..1300); jump from y 50 to y 300 stops before y 100, backed off 30 px.
const stop = M.stopShort({x: 300, y: 50}, {x: 300, y: 300}, reg, 30);
assert.ok(stop && stop.y < 100 - 29 && stop.y > 100 - 31, 'stops 30 px short: ' + JSON.stringify(stop));
assert.equal(M.stopShort({x: 300, y: 50}, {x: 300, y: 90}, reg, 30), null, 'no crossing: no stop');
// Globe: jumping in from outside stops outside.
const gin = M.stopShort({x: 900, y: 500}, {x: 500, y: 500}, c2, 10);
assert.ok(gin && Math.hypot(gin.x - 500, gin.y - 500) > 200, 'stops outside the globe');
console.log('petra-spells (Prismatic Wall parts 1 and 3): passed');
// 1.7.5 (Nix 2026-11-20): layers wear down over several hits of their damage type.
let h = M.layerHit('red', {damage: {cold: 10}});
assert.deepEqual([h.broken, h.dealt, h.taken, h.left], [false, 10, 10, 10], 'first cold hit: 10 / 20');
h = M.layerHit('red', {damage: {cold: 5, fire: 50}, taken: 10});
assert.deepEqual([h.broken, h.taken, h.left], [false, 15, 5], 'second hit: only cold counts');
h = M.layerHit('red', {damage: {cold: 5}, taken: 15});
assert.equal(h.broken, true, 'third hit reaches 20: destroyed');
h = M.layerHit('red', {damage: {fire: 40}, taken: 15});
assert.deepEqual([h.broken, h.dealt, h.taken], [false, 0, 15], 'wrong type: no wear');
assert.equal(M.layerHit('yellow', {damage: {force: 20}, taken: 20}).broken, true, 'yellow 20 + 20 force');
assert.equal(M.layerHit('indigo', {spell: 'Daylight'}).left, null, 'spell layers have no pool');
console.log('petra-spells (layer damage pools): passed');
// Nix 2026-11-20 (second pass): HP red 20, +10 per layer; melee reach; globe 70 ft across, -10 per fallen layer.
assert.deepEqual(M.LAYERS.slice(0, 5).map(l => l.breakMin), [20, 30, 40, 50, 60]);
assert.equal(M.LAYERS[5].breakMin, undefined, 'indigo: spell only');
assert.equal(M.LAYERS[6].breakMin, undefined, 'violet: spell only');
assert.deepEqual([M.layerHit('blue', {damage: {fire: 59}}).left, M.layerHit('blue', {damage: {fire: 30}, taken: 30}).broken], [1, true]);
assert.deepEqual(M.MELEE_TYPES, ['mwak', 'msak']);
assert.equal(M.reachNeeded({x: 0, y: 0}, [{x: 0, y: 400}, {x: 300, y: 0}], 20), 20, 'farthest across-wall target, ft');
assert.equal(M.reachNeeded({x: 0, y: 0}, [], 20), 0, 'none across: nothing added');
assert.deepEqual([7, 6, 5, 4, 3, 2, 1].map(M.globeRadiusFt), [35, 30, 25, 20, 15, 10, 5], 'diameter 70 down to 10');
assert.deepEqual(M.globeResize({t: 'circle', distance: 12}, 35, 20), {distance: 35}, 'v13 template');
assert.deepEqual(M.globeResize({toObject: () => ({shapes: [{type: 'circle', x: 1, y: 2, radius: 100}]})}, 30, 20), {shapes: [{type: 'circle', x: 1, y: 2, radius: 600}]}, 'v14 Region circle');
assert.deepEqual(M.globeResize({shapes: [{type: 'ellipse', radiusX: 5, radiusY: 9}]}, 5, 20).shapes[0], {type: 'ellipse', radiusX: 100, radiusY: 100});
console.log('petra-spells (HP 20-60, melee reach, globe size): passed');
