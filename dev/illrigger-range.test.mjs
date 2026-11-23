// 1.7.7: Illrigger seal range with Combat Mastery: Unfettered (scripts/court/illrigger-range.mjs) and the engine's
// own reach check (scripts/court/illrigger.mjs inReach / canPlace) on a 50 ft and a 65 ft target.
// usage: node dev/illrigger-range.test.mjs
import assert from 'node:assert/strict';
const getProperty = (o, p) => String(p).split('.').reduce((x, k) => x?.[k], o);
globalThis.foundry = {utils: {deepClone: o => structuredClone(o), setProperty: () => {}, getProperty, expandObject: o => o}};
globalThis.CONST = {ACTIVE_EFFECT_MODES: {CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5}};
globalThis.game = {user: {isGM: true, id: 'gm'}, users: {activeGM: null}, combat: null};
globalThis.Hooks = {on: () => 1, once: () => 1, callAll: () => {}};
globalThis.ui = {notifications: {info: () => {}, warn: () => {}}};
let feet = 0;
globalThis.chrisPremades = {utils: {tokenUtils: {getDistance: () => feet}, workflowUtils: {}}};

const R = await import('../scripts/court/illrigger-range.mjs');
const I = await import('../scripts/court/illrigger.mjs');

const items = list => Object.assign(list, {get: id => list.find(i => i.id === id)});
const bi = {id: 'bi', name: 'Baleful Interdict', flags: {'chris-premades': {info: {identifier: 'balefulInterdict'}}}, system: {uses: {max: 6, value: 6, spent: 0}}};
const unf = {id: 'cm', name: 'Combat Mastery: Unfettered', flags: {}, system: {identifier: 'combat-mastery'}};
const mk = (name, list, range) => {
    const a = {name, uuid: 'Actor.' + name, items: items(list), statuses: new Set(), system: {attributes: {hp: {value: 50}}},
        flags: {'nix-module': {illrigger: range === undefined ? {version: 1} : {version: 1, range}}}};
    a.getActiveTokens = () => [{id: 'tok-' + name, document: {}}];
    return a;
};
const target = {actor: {uuid: 'Actor.target', statuses: new Set(), system: {attributes: {hp: {value: 30}}}}, document: {name: 'Hero'}};

// ---- pure helper
const dayus = mk('Dayus', [bi, unf], 30);         // engine recorded 30 before he had Unfettered: the sheet wins
const plain = mk('Sydmore', [bi], 30);
const captain = mk('Captain', [bi], 45);            // an explicit config range still counts
const capUnf = mk('CaptainU', [bi, unf], 90);       // ...and Unfettered never lowers it
assert.equal(R.hasUnfettered(dayus), true);
assert.equal(R.hasUnfettered(plain), false);
assert.equal(R.sealRange(dayus), 60);
assert.equal(R.sealRange(plain), 30);
assert.equal(R.sealRange(mk('NoCfg', [bi])), 30);
assert.equal(R.sealRange(captain), 45);
assert.equal(R.sealRange(capUnf), 90);
assert.equal(R.conduitRange(dayus), 30);
assert.equal(R.conduitRange(plain), 5);
assert.equal(R.sealInRange(dayus, 50), true, 'Unfettered: 50 ft placeable');
assert.equal(R.sealInRange(dayus, 65), false, 'Unfettered: 65 ft not');
assert.equal(R.sealInRange(plain, 50), false, 'no Unfettered: 50 ft not');
assert.equal(R.sealInRange(plain, 30), true);
// identifier only (Chris's Premades 1 item renamed)
assert.equal(R.hasUnfettered(mk('Renamed', [bi, {id: 'x', name: 'Mastery', flags: {'chris-premades': {info: {identifier: 'combatMasteryUnfettered'}}}, system: {}}])), true);
// "Fettered" never matches
assert.equal(R.hasUnfettered(mk('F', [bi, {id: 'y', name: 'Fettered Soul', flags: {}, system: {}}])), false);

// ---- the engine's reach check (hit offer, Bonus Action seal, burn dialog, Deathstrike all go through inReach / canPlace)
feet = 50;
assert.equal(I.inReach(dayus, target), true, 'Dayus with Unfettered, target at 50 ft: in reach');
assert.equal(I.canPlace(dayus, target, {ignoreTurn: true}), true, 'a seal can be placed at 50 ft');
assert.equal(I.canPlace(plain, target, {ignoreTurn: true}), false, 'without Unfettered: not at 50 ft');
feet = 65;
assert.equal(I.inReach(dayus, target), false, 'target at 65 ft: out of reach');
assert.equal(I.canPlace(dayus, target, {ignoreTurn: true}), false, 'no seal at 65 ft');
feet = 30;
assert.equal(I.canPlace(plain, target, {ignoreTurn: true}), true);

console.log('illrigger-range.test: all passed');
