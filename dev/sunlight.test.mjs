// 1.7.7: Sunlight Sensitivity vs sunlight spells (scripts/sunlight.mjs): which spells make sunlight, the in-sunlight
// check, what the feature text covers, and the check effect's Midi flag.
// usage: node dev/sunlight.test.mjs
import assert from 'node:assert/strict';
globalThis.foundry = {utils: {deepClone: o => structuredClone(o), setProperty: () => {}, getProperty: () => undefined, expandObject: o => o}};
globalThis.CONST = {ACTIVE_EFFECT_MODES: {CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5}};
globalThis.game = {user: {isGM: false, id: 'p1'}, users: {activeGM: null}, actors: {contents: []}};
globalThis.Hooks = {on: () => 1};
const S = await import('../scripts/sunlight.mjs');

// ---- which spells make sunlight
const spell = (name, desc, units = 'hour') => ({type: 'spell', name, system: {description: {value: desc}, duration: {units, value: 1}}});
assert.deepEqual(S.sunlightSpell(spell('Daylight', '')), {radius: 60, anchor: 'point', name: 'Daylight'});
assert.equal(S.sunlightSpell(spell('Dawn', '')).radius, 30);
assert.equal(S.sunlightSpell(spell('Sunbeam', '')).anchor, 'caster', 'Sunbeam: the mote of sunlight is on the caster');
assert.equal(S.sunlightSpell(spell('Sunburst', '')).instant, true, 'Sunburst lingers nowhere');
assert.equal(S.sunlightSpell(spell('Daylight (Shadow Fan)', '')).radius, 60, 'renamed copy still counts');
const homebrew = S.sunlightSpell(spell('Solar Lantern', '<p>A 20-foot radius of bright light. This light is sunlight.</p>', 'minute'));
assert.equal(homebrew.radius, 20); assert.equal(homebrew.instant, false);
assert.equal(S.sunlightSpell(spell('Flash', '<p>Brilliant sunlight flashes.</p>', 'inst')).instant, true);
assert.equal(S.sunlightSpell(spell('Light', '<p>Bright light in a 20-foot radius.</p>')), null);
assert.equal(S.sunlightSpell(spell('Ward', '<p>Creatures with Sunlight Sensitivity hate it.</p>')), null, 'mentioning the feature is not making sunlight');
assert.equal(S.sunlightSpell({type: 'feat', name: 'Daylight', system: {}}), null);

// ---- in sunlight (feet per pixel 0.05: 100 px = 5 ft)
const fpp = 0.05;
const daylight = {x: 1000, y: 1000, radiusFt: 60};          // 60 ft = 1200 px
assert.equal(S.inSunlight({x: 1000 + 1100, y: 1000}, [daylight], fpp), true, '55 ft from the centre: lit');
assert.equal(S.inSunlight({x: 1000 + 1200, y: 1000}, [daylight], fpp), true, 'exactly 60 ft: lit');
assert.equal(S.inSunlight({x: 1000 + 1300, y: 1000}, [daylight], fpp), false, '65 ft: not lit');
assert.equal(S.inSunlight({x: 0, y: 0}, [], fpp), false, 'no sunlight anywhere');
assert.equal(S.inSunlight({x: 5, y: 5}, [{test: p => p.x < 10}], fpp), true, 'a Region / template shape test');
assert.equal(S.inSunlight({x: 50, y: 5}, [daylight, {test: p => p.x < 10}], fpp), false);

// ---- feature text
const mk = text => ({items: [{name: 'Sunlight Sensitivity', uuid: 'I.ss', system: {description: {value: text}}}]});
let s = S.sensitivityOf(mk('<p>While in sunlight, the drow has disadvantage on attack rolls, as well as on Wisdom (Perception) checks that rely on sight.</p>'));
assert.equal(s.targetToo, false); assert.equal(s.allChecks, false);
s = S.sensitivityOf(mk('<p>While in sunlight, the drow has Disadvantage on ability checks and attack rolls.</p>'));
assert.equal(s.allChecks, true, '2024 text: every ability check');
s = S.sensitivityOf(mk('<p>Disadvantage on attack rolls while it, or the target of its attack, is in sunlight.</p>'));
assert.equal(s.targetToo, true, 'feature text names the target');
assert.equal(S.sensitivityOf({items: [{name: 'Pack Tactics', system: {}}]}), null);
assert.equal(S.checkEffect(S.sensitivityOf(mk('ability checks')), 'Daylight').changes[0].key, 'flags.midi-qol.disadvantage.check.all');
assert.equal(S.checkEffect(S.sensitivityOf(mk('Perception')), 'Daylight').changes[0].key, 'flags.midi-qol.disadvantage.skill.prc');

console.log('sunlight.test: all passed');
