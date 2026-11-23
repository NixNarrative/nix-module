// 1.7.7: Vampire Weakness (scripts/vampire-weakness.mjs + sunlight.mjs): which turn edge deals what, running water
// Regions, combat moving forward, Vampire Weakness counting as every-check Sunlight Sensitivity, and the damage call.
// usage: node dev/vampire-weakness.test.mjs
import assert from 'node:assert/strict';
globalThis.foundry = {utils: {deepClone: o => structuredClone(o), setProperty: () => {}, getProperty: () => undefined, expandObject: o => o}};
globalThis.CONST = {ACTIVE_EFFECT_MODES: {CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5}};
globalThis.game = {user: {isGM: true, id: 'gm'}, users: {activeGM: null}, actors: {contents: []}};
globalThis.Hooks = {on: () => 1};
const chat = [];
globalThis.ChatMessage = {create: async d => chat.push(d), getSpeaker: () => ({})};
const S = await import('../scripts/sunlight.mjs');
const V = await import('../scripts/vampire-weakness.mjs');

// ---- which edge deals what
assert.deepEqual(V.turnDamage('start', {sun: true}), {value: 20, type: 'radiant', why: 'starts its turn in sunlight'});
assert.equal(V.turnDamage('end', {sun: true}), null, 'sunlight hurts at the START of its turn only');
assert.equal(V.turnDamage('end', {water: true}).type, 'acid');
assert.equal(V.turnDamage('end', {water: true}).value, 20);
assert.equal(V.turnDamage('start', {water: true}), null, 'running water hurts at the END of its turn only');
assert.equal(V.turnDamage('start', {}), null);

// ---- running water Regions
assert.equal(V.isRunningWater({name: 'Running Water'}), true);
assert.equal(V.isRunningWater({name: 'River (running water)'}), true);
assert.equal(V.isRunningWater({name: 'Pond'}), false, 'still water is not running water');
assert.equal(V.isRunningWater({name: 'Ford', flags: {'nix-module': {runningWater: true}}}), true, 'flagged by name-free tag');

// ---- combat moving forward (not the GM stepping back)
assert.equal(V.movedForward({round: 1, turn: 0}, {round: 1, turn: 1}), true);
assert.equal(V.movedForward({round: 1, turn: 4}, {round: 2, turn: 0}), true, 'new round');
assert.equal(V.movedForward({round: 2, turn: 1}, {round: 2, turn: 0}), false, 'previous turn');
assert.equal(V.movedForward({round: 2, turn: 0}, {round: 1, turn: 3}), false, 'previous round');
assert.equal(V.movedForward(null, {round: 1, turn: 0}), false);

// ---- Vampire Weakness as Sunlight Sensitivity: every check, never the target
const vwItem = {name: 'Vampire Weakness', uuid: 'I.vw', flags: {'nix-module': {vampireWeakness: {version: 1}}}, system: {description: {value: '<p>Sunlight. ... the target ...</p>'}}};
let s = S.sensitivityOf({items: [vwItem]});
assert.equal(s.vampire, true); assert.equal(s.allChecks, true); assert.equal(s.targetToo, false);
assert.equal(S.checkEffect(s, 'Daylight').changes[0].key, 'flags.midi-qol.disadvantage.check.all');
assert.equal(S.checkEffect(s, 'Daylight').name, 'In sunlight (Vampire Weakness)');
s = S.sensitivityOf({items: [{name: 'Vampire Weakness', system: {}}]});
assert.equal(s?.allChecks, true, 'by name, before the installer marked it');
s = S.sensitivityOf({items: [{name: 'Sunlight Sensitivity', system: {description: {value: 'Wisdom (Perception) checks'}}}, vwItem]});
assert.equal(s.allChecks, true, 'both on one sheet: Vampire Weakness still covers every check');
assert.equal(S.sensitivityOf({items: [{name: 'Vampiric Bite', system: {}}]}), null, 'Vampiric Bite is not the weakness');
assert.equal(V.weaknessOf({items: [{name: 'Vampiric Bite'}, vwItem]}), vwItem);
assert.equal(V.weaknessOf({items: [{name: 'Vampiric Bite'}]}), null);

// ---- real sunlight Regions
assert.equal(S.isSunlightRegionName('Sunlight'), true);
assert.equal(S.isSunlightRegionName('Daylight (outside)'), true);
assert.equal(S.isSunlightRegionName('Moonlight'), false);
assert.equal(S.isSunlightRegionName('Sunless Citadel'), false);

// ---- damage: dnd5e applyDamage with the type, a chat line, nothing at 0 HP
const mkActor = hp => {
    const a = {name: 'Dracula', calls: [], system: {attributes: {hp: {value: hp, temp: 0}}}};
    a.applyDamage = async d => { a.calls.push(d); a.system.attributes.hp.value = Math.max(0, a.system.attributes.hp.value - d[0].value / 2); };   // resistant
    return a;
};
let a = mkActor(100);
assert.equal(await V.hurt(a, {name: 'Dracula'}, V.DAMAGE.sun, vwItem), true);
assert.equal(a.calls[0][0].type, 'radiant'); assert.equal(a.calls[0][0].value, 20);
assert.match(chat.at(-1).content, /takes 10 radiant damage \(20 before resistance\)/);
a = mkActor(0);
assert.equal(await V.hurt(a, null, V.DAMAGE.water, vwItem), false, 'already at 0 HP');
assert.equal(a.calls.length, 0);
assert.equal(await V.hurt(mkActor(50), null, null, vwItem), false, 'no damage due');

console.log('vampire-weakness.test: all passed');
