// 1.7.5: Midi 14.7 / dnd5e 6.1 (CAT 0.1.9) renamed a damage item's lists: damageDetail -> calculatedDamages,
// rawDamageDetail -> damages. Dracula's Regeneration (boss.mjs) and Bloodrift (bloodrift.mjs) read them.
// usage: node dev/damage-lists.test.mjs
import assert from 'node:assert/strict';
globalThis.foundry = {utils: {deepClone: o => structuredClone(o), setProperty: () => {}, getProperty: () => undefined, expandObject: o => o}};
globalThis.CONFIG = {DND5E: {}};
globalThis.game = {settings: {get: () => undefined}, user: {isGM: true}};
globalThis.Hooks = {on: () => 1, once: () => 1, off: () => {}};

const {radiantTaken} = await import('../scripts/court/boss.mjs');
const {necroticOf} = await import('../scripts/court/bloodrift.mjs');

// Midi 14.7 (v14): calculatedDamages (after traits) and damages (as rolled)
const v14 = {
    calculatedDamages: [{type: 'radiant', value: 9}, {type: 'slashing', value: 4}, {type: 'necrotic', value: 0}],
    damages: [{type: 'radiant', value: 18}, {type: 'slashing', value: 4}, {type: 'necrotic', value: 11}],
    totalDamage: 13, hpDamage: 13
};
assert.equal(radiantTaken(v14), 9, 'v14: radiant after resistance is counted (was 0 before 1.7.5, so he always regenerated)');
assert.deepEqual(necroticOf(v14), {dealt: 0, raw: 11}, 'v14: necrotic rolled 11, dealt 0 (immune): immunity becomes resistance');

// Midi on v13: damageDetail / rawDamageDetail
const v13 = {damageDetail: [{type: 'radiant', value: 6}, {type: 'radiant', value: 2}], rawDamageDetail: [{type: 'necrotic', value: 7}]};
assert.equal(radiantTaken(v13), 8, 'v13 names still read');
assert.deepEqual(necroticOf(v13), {dealt: 0, raw: 7});

// Both present (a v14 item that also kept an old list): the new names win.
const both = {calculatedDamages: [{type: 'radiant', value: 3}], damageDetail: [{type: 'radiant', value: 99}],
    damages: [{type: 'necrotic', value: 5}], rawDamageDetail: [{type: 'necrotic', value: 99}]};
assert.equal(radiantTaken(both), 3);
assert.deepEqual(necroticOf(both), {dealt: 0, raw: 5});

// Nothing there
assert.equal(radiantTaken({}), 0);
assert.deepEqual(necroticOf({totalDamage: 5}), {dealt: 0, raw: 0});
console.log('damage-lists tests: all passed');
