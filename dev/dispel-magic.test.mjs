// 1.7.7: Nix Fix's Dispel Magic (2024 rules). Pure rules (scripts/dispel-magic-core.mjs): level comparison, DC, what
// counts as a spell effect, the cast level; and the runtime (scripts/dispel-magic.mjs) gathering targets in range and
// resolving one pick against mocks.
// usage: node dev/dispel-magic.test.mjs
import assert from 'node:assert/strict';
const C = await import('../scripts/dispel-magic-core.mjs');

// ---- level comparison and DC
assert.equal(C.dispelDC(4), 14); assert.equal(C.dispelDC(9), 19);
assert.equal(C.endsAutomatically(3, 3), true, 'level 3 vs a 3rd-level Dispel: ends');
assert.equal(C.endsAutomatically(4, 3), false, 'level 4: check');
assert.equal(C.endsAutomatically(5, 5), true, 'upcast to 5: a 5th-level spell ends');
assert.equal(C.endsAutomatically(0, 3), true, 'cantrip effects end');
assert.equal(C.endsAutomatically(4), false, 'default level 3');
assert.deepEqual(C.planDispel([{name: 'Bless', level: 1}, {name: 'Polymorph', level: 4}], 3).map(s => [s.name, s.auto, s.dc]), [['Bless', true, null], ['Polymorph', false, 14]]);
assert.deepEqual(C.planDispel([{name: 'Polymorph', level: 4}], 4)[0].auto, true, 'upcast removes the check');

// ---- cast level
assert.equal(C.castLevelOf({flags: {'midi-qol': {castData: {castLevel: 5, baseLevel: 3}}}}), 5, 'Midi castData first');
assert.equal(C.castLevelOf({flags: {dnd5e: {spellLevel: 4}}}), 4, 'dnd5e template / concentration flag');
assert.equal(C.castLevelOf({flags: {dnd5e: {spellLevel: {value: 6, base: 3}}}}), 6, 'scaled spell item');
assert.equal(C.castLevelOf({flags: {dnd5e: {summon: {level: 4}}}}), 4, 'summon level');
assert.equal(C.castLevelOf({flags: {}, item: {system: {level: 2}}}), 2, 'base level of the spell');
assert.equal(C.castLevelOf({flags: {}, item: {flags: {dnd5e: {spellLevel: {value: 4}}}, system: {level: 2}}}), 4, 'upcast copy from a magic item / cast activity');
assert.equal(C.castLevelOf({flags: {}}), null);

// ---- what counts
const spell = (name, level, units = 'minute', conc = false) => ({type: 'spell', name, system: {level, duration: {units}, properties: new Set(conc ? ['concentration'] : [])}});
const eff = (extra = {}) => ({name: 'X', disabled: false, transfer: false, statuses: new Set(), flags: {}, ...extra});
let i = C.spellEffectInfo(eff(), {item: spell('Bless', 1, 'minute', true)});
assert.equal(i.ok, true); assert.equal(i.level, 1); assert.equal(i.concentration, true); assert.equal(i.name, 'Bless');
assert.equal(C.spellEffectInfo(eff({flags: {'midi-qol': {castData: {castLevel: 4}}}}), {item: spell('Bless', 1, 'minute', true)}).level, 4, 'upcast Bless');
assert.equal(C.spellEffectInfo(eff(), {item: {type: 'feat', name: 'Baleful Interdict'}}).ok, false, 'class feature');
assert.equal(C.spellEffectInfo(eff(), {item: {type: 'weapon', name: 'Flame Tongue'}}).ok, false, 'magic item');
assert.equal(C.spellEffectInfo(eff({transfer: true}), {item: spell('Mage Armor', 1)}).ok, false, 'passive item property');
assert.equal(C.spellEffectInfo(eff(), {item: spell('Cure Wounds', 1, 'inst')}).ok, false, 'instantaneous');
assert.equal(C.spellEffectInfo(eff({statuses: new Set(['concentrating'])}), {item: spell('Bless', 1)}).ok, false, 'the caster\'s concentration marker');
assert.equal(C.spellEffectInfo(eff({flags: {'nix-module': {juggernautAura: 2}}}), {item: null}).ok, false, 'boss aura');
assert.equal(C.spellEffectInfo(eff({flags: {'nix-module': {seal: {owner: 'x'}}}}), {item: null}).ok, false, 'Illrigger seal');
assert.equal(C.spellEffectInfo(eff(), {item: null}).ok, false, 'no spell origin at all');
assert.equal(C.spellEffectInfo(eff({flags: {'midi-qol': {castData: {castLevel: 2}}}, name: 'Hold Person'}), {item: null}).level, 2, 'spell from a vanished cast item still counts');
assert.equal(C.spellEffectInfo(eff({disabled: true}), {item: spell('Bless', 1)}).ok, false, 'disabled');
assert.equal(C.spellEffectInfo({flags: {dnd5e: {spellLevel: 2}}, name: 'Darkness'}, {kind: 'area', item: spell('Darkness', 2, 'minute', true)}).ok, true, 'area spell');
assert.equal(C.spellEffectInfo({flags: {dnd5e: {spellLevel: 3}}}, {kind: 'area', item: spell('Fireball', 3, 'inst')}).ok, false, 'leftover instantaneous template');
assert.deepEqual(C.groupSpells([{originUuid: 'I1', level: 2, docs: ['e1']}, {originUuid: 'I1', level: 2, docs: ['e2']}, {originUuid: 'I2', level: 1, docs: ['e3']}]).map(g => g.docs), [['e1', 'e2'], ['e3']]);

// ---- runtime against mocks
globalThis.foundry = {utils: {deepClone: o => structuredClone(o), setProperty: () => {}, getProperty: () => undefined, expandObject: o => o, randomID: () => 'r' + Math.random()},
    applications: {api: {DialogV2: {wait: async ({content}) => { globalThis.__dialog = content; return globalThis.__pick; }}}}};
globalThis.CONST = {ACTIVE_EFFECT_MODES: {OVERRIDE: 5}};
const chat = [];
globalThis.ChatMessage = {create: async d => { chat.push(d.content); return d; }, getSpeaker: () => ({}), getWhisperRecipients: () => []};
globalThis.ui = {notifications: {warn: m => chat.push('[warn] ' + m), info: () => {}}};
globalThis.Hooks = {on: () => 1};
const deleted = [];
const docs = new Map();
globalThis.fromUuidSync = u => docs.get(u) ?? null;
globalThis.fromUuid = async u => docs.get(u) ?? null;
globalThis.game = {user: {isGM: true, id: 'gm'}, users: {activeGM: null}, actors: {contents: []}, socket: {emit: () => {}}};
globalThis.MidiQOL = {};
const reg = (uuid, d) => { d.uuid = uuid; d.delete = async () => deleted.push(uuid); docs.set(uuid, d); return d; };
// a caster (Vina) with Bless (conc) on an ally and Polymorph (4, conc) on an ogre; a Darkness template; Fireball leftover.
const vina = {uuid: 'Actor.vina', name: 'Vina', effects: [], items: [], system: {attributes: {spellcasting: 'wis'}, abilities: {wis: {mod: 4}}}};
const bless = reg('Actor.vina.Item.bless', {...spell('Bless', 1, 'minute', true), documentName: 'Item', id: 'bless', actor: vina});
const poly = reg('Actor.vina.Item.poly', {...spell('Polymorph', 4, 'hour', true), documentName: 'Item', id: 'poly', actor: vina});
const dark = reg('Actor.vina.Item.dark', {...spell('Darkness', 2, 'minute', true), documentName: 'Item', id: 'dark', actor: vina});
const fireball = reg('Actor.vina.Item.fb', {...spell('Fireball', 3, 'inst'), documentName: 'Item', id: 'fb', actor: vina});
const conc = (item, id) => reg('Actor.vina.ActiveEffect.' + id, {name: 'Concentrating', origin: item.uuid, statuses: new Set(['concentrating']), flags: {}, disabled: false});
vina.effects.push(conc(bless, 'c1'), conc(poly, 'c2'), conc(dark, 'c3'));
const mkEff = (id, item, extra = {}) => reg('Actor.x.ActiveEffect.' + id, {name: item.name, origin: item.uuid, statuses: new Set(), flags: {}, disabled: false, transfer: false, ...extra});
const ally = {uuid: 'Actor.ally', name: 'Akira', effects: [mkEff('b1', bless), mkEff('ring', {name: 'Ring of Protection', uuid: 'Actor.ally.Item.ring'}, {transfer: true})], flags: {}};
const ogre = {uuid: 'Actor.ogre', name: 'Ogre', effects: [mkEff('p1', poly), mkEff('seal', {uuid: 'Actor.d.Item.bi'}, {flags: {'nix-module': {seal: {owner: 'd'}}}})], flags: {}};
const tok = (id, actor, x) => ({id, actor, center: {x, y: 0}, document: {uuid: 'Scene.s.Token.' + id, name: actor.name}});
const tV = tok('v', vina, 0), tA = tok('a', ally, 400), tO = tok('o', ogre, 2000), tFar = tok('f', {uuid: 'Actor.far', name: 'Far', effects: [mkEff('b9', bless)], flags: {}}, 3000);
// 100 px = 5 ft: ally 20 ft, ogre 100 ft, far 150 ft
const tpl = reg('Scene.s.MeasuredTemplate.t1', {t: 'circle', x: 2400, y: 0, distance: 15, flags: {dnd5e: {item: dark.uuid, spellLevel: 2}}});
const tplFb = reg('Scene.s.MeasuredTemplate.t2', {t: 'circle', x: 200, y: 0, distance: 20, flags: {dnd5e: {item: fireball.uuid, spellLevel: 3}}});
globalThis.canvas = {dimensions: {distance: 5, size: 100}, tokens: {placeables: [tV, tA, tO, tFar]},
    scene: {id: 's', templates: {contents: [tpl, tplFb]}, regions: {contents: []}, tokens: {filter: () => []}}};
const D = await import('../scripts/dispel-magic.mjs');
assert.ok(D.registerDispelMagic());
const found = D.gatherTargets(tV);
assert.deepEqual(found.creatures.map(c => c.label), ['Akira', 'Ogre'], 'in range only (Far at 150 ft is out); the caster has only concentration markers');
assert.deepEqual(found.creatures[0].spells.map(s => s.name), ['Bless'], 'Ring of Protection (item property) not listed');
assert.deepEqual(found.creatures[1].spells.map(s => s.name), ['Polymorph'], 'Illrigger seal not listed');
assert.deepEqual(found.areas.map(a => a.label), ['Darkness'], 'Darkness listed (105 ft to its centre, 15 ft radius); the Fireball leftover is instantaneous');
assert.equal(D.isDispelMagic({type: 'spell', flags: {'nix-module': {dispelMagic: {version: 1}}}}), true);
assert.equal(D.isDispelMagic({type: 'spell', name: 'Dispel Magic', flags: {}}), false, 'only installed copies');

// pick the ogre: Polymorph (4) vs a 3rd-level Dispel: check DC 14 with Wisdom; a 15 succeeds -> ends Vina's concentration on it
const caster = {...vina, rollAbilityCheck: async ({ability, target}) => { chat.push('[check ' + ability + ' DC ' + target + ']'); return [{total: 15}]; }};
globalThis.__pick = 'c:1';
let r = await D.dispel({item: {name: 'Dispel Magic', type: 'spell', system: {level: 3}, flags: {}}, actor: caster, token: tV, castData: {castLevel: 3}});
assert.deepEqual(r.ended, ['Polymorph (level 4)']);
assert.ok(chat.includes('[check wis DC 14]'), 'one check, spellcasting ability, DC 10 + 4');
assert.deepEqual(deleted, ['Actor.vina.ActiveEffect.c2'], 'concentration spell: the caster\'s concentration ends (its dependents go with it)');
assert.match(globalThis.__dialog, /Creatures and objects/); assert.match(globalThis.__dialog, /Area spell effects/); assert.match(globalThis.__dialog, /check DC 14/);
// failed check: holds
deleted.length = 0;
caster.rollAbilityCheck = async () => [{total: 9}];
r = await D.dispel({item: {name: 'Dispel Magic', type: 'spell', system: {level: 3}, flags: {}}, actor: caster, token: tV, castData: {castLevel: 3}});
assert.deepEqual(r.held, ['Polymorph (level 4)']); assert.deepEqual(deleted, []);
assert.match(chat.at(-1), /check 9 vs DC 14, holds/);
// upcast to 4: no check
caster.rollAbilityCheck = async () => { throw new Error('no check expected'); };
r = await D.dispel({item: {name: 'Dispel Magic', type: 'spell', system: {level: 3}, flags: {}}, actor: caster, token: tV, castData: {castLevel: 4}});
assert.deepEqual(r.ended, ['Polymorph (level 4)']);
// the area: only that spell (Darkness, conc) ends
deleted.length = 0;
globalThis.__pick = 'a:0';
r = await D.dispel({item: {name: 'Dispel Magic', type: 'spell', system: {level: 3}, flags: {}}, actor: caster, token: tV, castData: {castLevel: 3}});
assert.deepEqual(r.ended, ['Darkness (level 2)']); assert.deepEqual(deleted, ['Actor.vina.ActiveEffect.c3']);
// a non-concentration spell effect is deleted itself
const sanct = reg('Actor.vina.Item.sanct', {...spell('Sanctuary', 1, 'minute', false), documentName: 'Item', id: 'sanct', actor: vina});
ally.effects.push(mkEff('s1', sanct));
deleted.length = 0;
globalThis.__pick = 'c:0';
r = await D.dispel({item: {name: 'Dispel Magic', type: 'spell', system: {level: 3}, flags: {}}, actor: caster, token: tV, castData: {castLevel: 3}});
assert.deepEqual(r.ended.sort(), ['Bless (level 1)', 'Sanctuary (level 1)'], 'a creature: every spell on it');
assert.deepEqual(deleted.sort(), ['Actor.vina.ActiveEffect.c1', 'Actor.x.ActiveEffect.s1']);
// cancel: nothing
globalThis.__pick = null;
assert.equal(await D.dispel({item: {name: 'Dispel Magic', type: 'spell', system: {level: 3}, flags: {}}, actor: caster, token: tV, castData: {castLevel: 3}}), undefined);

console.log('dispel-magic.test: all passed');
