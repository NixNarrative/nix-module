import assert from 'node:assert/strict';
const clone = o => structuredClone(o);
const setProperty = (o, p, v) => { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = (x[k] ??= {}); x[ks.at(-1)] = v; };
globalThis.foundry = {utils: {deepClone: clone, setProperty, expandObject: o => o, getProperty: (o, p) => p.split('.').reduce((x, k) => x?.[k], o)}};
const calls = [];
globalThis.ui = {notifications: {info: m => calls.push(['info', m])}};
globalThis.game = {user: {id: 'gm', isGM: true}, users: {activeGM: null}, combat: null};
globalThis.ChatMessage = {create: async () => {}, getSpeaker: () => ({})};
globalThis.cat = {api: {registered: [], registerFnMacro(d) { this.registered.push(d); return true; }, registerSourceName() {}}, utils: {
  workflowUtils: {applyDamage: async (t, v, ty) => calls.push(['applyDamage', v, ty]), bonusDamage: async (wf, f, o) => calls.push(['bonusDamage', f, o.damageType]),
    isAttackType: (wf, t) => wf._types.includes(t), getDamageTypes: rolls => new Set(rolls.map(r => r.options.type)), preventZeroHP: d => { d.newHP = 1; calls.push(['preventZeroHP']); },
    syntheticActivityRoll: async () => calls.push(['synthAct'])},
  documentUtils: {update: async (d, u) => calls.push(['update', u])},
  tokenUtils: {getDistance: () => 10, canSee: () => true},
  actorUtils: {hasUsedReaction: () => false},
  dialogUtils: {confirm: async () => true, buttonDialog: async (t, c, buttons) => { calls.push(['buttons', buttons.map(b => b[0])]); return globalThis.__pick; }},
  rollUtils: {addToRoll: async (roll, f) => ({total: roll.total + (Number(f) || 5), options: roll.options})},
  queryUtils: {firstOwner: () => 'gm'}}};
globalThis.Hooks = {on: () => {}};
const F = await import(new URL('../scripts/court/illrigger-features.mjs', import.meta.url));
const fn = (id, pass) => F.MACROS[id][Object.keys(F.MACROS[id])[0]].find(x => x.pass === pass).macro;
// registration
assert.equal(F.registerIllriggerFeatures(), true);
assert.equal(cat.api.registered.length, Object.keys(F.MACROS).length);
assert.ok(cat.api.registered.every(r => r.source === 'nix-module' && r.rules === 'all'));
assert.deepEqual(F.refFor('bloodPrice'), {save: [{source: 'nix-module', identifier: 'bloodPrice', rules: 'all'}]});
// terrorizing type
assert.equal(F.terrorizingType({name: 'Terrorizing Force: Cold', flags: {}}), 'cold');
assert.equal(F.terrorizingType({name: 'Terrorizing Force', flags: {'nix-module': {terrorizingForce: {damageType: 'poison'}}}}), 'poison');
assert.equal(F.terrorizingType({name: 'Terrorizing Force', flags: {}}), 'fire');
// terrorizing damage: weapon hit, Infernal Majesty doubles
const wf = {_types: ['weaponAttack'], hitTargets: {size: 1}, actor: {effects: [{flags: {cat: {identifier: 'infernalMajestyEffect'}}, disabled: false}]}};
await fn('terrorizingForce', 'actorDamageRollBonuses')({document: {name: 'Terrorizing Force: Necrotic', flags: {}}, workflow: wf});
assert.deepEqual(calls.pop(), ['bonusDamage', '2d8', 'necrotic']);
await fn('terrorizingForce', 'actorDamageRollBonuses')({document: {name: 'Terrorizing Force: Necrotic', flags: {}}, workflow: {...wf, _types: ['spellAttack']}});
assert.notEqual(calls.at(-1)?.[0], 'bonusDamage');
// Infernal Conduit: Harm heals him by the necrotic dealt; Heal hurts him
const me = {document: {}, actor: {}};
const tgt = {actor: {uuid: 'A2'}, document: {uuid: 'T2'}};
const mkwf = (type, ditem, hp = 50) => ({token: me, actor: {system: {attributes: {hp: {value: hp}}}}, targets: {first: () => tgt}, damageRolls: [{options: {type}}], damageList: [ditem]});
await fn('infernalConduit', 'activityRollFinished')({workflow: mkwf('necrotic', {actorUuid: 'A2', hpDamage: 17, tempDamage: 3})});
assert.deepEqual(calls.pop(), ['applyDamage', 20, 'healing']);
await fn('infernalConduit', 'activityRollFinished')({workflow: mkwf('healing', {actorUuid: 'A2', hpDamage: -12, tempDamage: 0}, 0)});
assert.deepEqual(calls.at(-2), ['applyDamage', 12, 'none']);
assert.deepEqual(calls.at(-1), ['update', {'system.attributes.death.success': 3}]);
// Blood Price: success, or a boss with the combined prompt -> nothing
const bp = fn('bloodPrice', 'actorBonus');
assert.equal(await bp({document: {name: 'Blood Price'}, actor: {items: []}, roll: {total: 20, options: {target: 15}}}), undefined);
assert.equal(await bp({document: {name: 'Blood Price'}, actor: {items: [{name: 'Legendary Resistance (Blood Price)', flags: {}}]}, roll: {total: 10, options: {target: 15}}}), undefined);
// You Die on My Command!: ally dropping to 0 -> prevented; enemy -> ignored
const owner = {token: {object: {id: 'D', document: {disposition: -1}}}, getActiveTokens: () => []};
const ydomc = {actor: owner, system: {activities: Object.assign([{}], {contents: [{}], size: 1})}, flags: {}};
ydomc.system.activities.contents = [{consumption: {targets: []}}];
const ally = {actor: {}, disposition: -1, id: 'A', name: 'Ally', object: {}};
const ditem = {oldHP: 10, newHP: 0};
await fn('youDieOnMyCommand', 'sceneDamageComplete')({document: ydomc, workflow: {}, ditem, targetToken: ally});
assert.equal(ditem.newHP, 1);
const ditem2 = {oldHP: 10, newHP: 0};
await fn('youDieOnMyCommand', 'sceneDamageComplete')({document: ydomc, workflow: {}, ditem: ditem2, targetToken: {...ally, disposition: 1}});
assert.equal(ditem2.newHP, 0);
// Place Seal range check cancels beyond range
const r = await fn('balefulInterdictPlaceSeal', 'activityPreambleComplete')({workflow: {actor: {flags: {'nix-module': {illrigger: {range: 5}}}}, token: me, targets: {first: () => tgt}}});
assert.equal(r, true);
// Blood Price + Legendary Resistance (boss kits): bleed table, one prompt, both choices
assert.deepEqual([null, 1, 2, 3, 4, 5, 7, 9].map(F.bleedDice), [0, 0, 1, 1, 2, 2, 3, 4]);
globalThis.Roll = class { constructor(f) { this.f = f; } async evaluate() { this.total = 11; return this; } };
globalThis.fromUuidSync = u => u === 'Spell4' ? {documentName: 'Item', type: 'spell', system: {level: 4}} : (u === 'Sword' ? {documentName: 'Item', type: 'weapon', system: {}} : null);
const lrItem = {name: 'Legendary Resistance (Blood Price)', flags: {'nix-module': {legendaryResistance: true}}, system: {uses: {value: 3, spent: 0}}};
const cls = {type: 'class', name: 'Illrigger', system: {levels: 20, hd: {spent: 0, denomination: 'd10'}}};
const bpItem = {name: 'Blood Price', flags: {}};
const boss = {name: 'Dracula', items: [lrItem, cls, bpItem], effects: [], applyDamage: async n => calls.push(['bleed', n])};
const bpl = fn('bloodPriceLegendary', 'actorBonus');
assert.equal(await bpl({document: lrItem, actor: boss, roll: {total: 20, options: {target: 19}}}), undefined);
globalThis.__pick = 'legend';
const won = await bpl({document: lrItem, actor: boss, token: null, roll: {total: 12, options: {target: 19}}, config: {midiOptions: {saveItemUuid: 'Spell4'}}});
assert.equal(won.total, 19);
const btns = calls.filter(c => c[0] === 'buttons').at(-1)[1];
assert.ok(btns[0].startsWith('Blood Price: spend a Hit Die, +1d10'));
assert.ok(btns[1].includes('level 4 spell: bleed 2d10'), btns[1]);
assert.deepEqual(calls.filter(c => c[0] === 'update').at(-1), ['update', {'system.uses.spent': 1}]);
await new Promise(r => setTimeout(r, 80));
assert.deepEqual(calls.filter(c => c[0] === 'bleed').at(-1), ['bleed', 11]);
// not a spell: no bleed offered
await bpl({document: lrItem, actor: boss, roll: {total: 12, options: {target: 19}}, config: {midiOptions: {saveItemUuid: 'Sword'}}});
assert.ok(calls.filter(c => c[0] === 'buttons').at(-1)[1][1].includes('no spell level: no bleed'));
// Hit Die
globalThis.__pick = 'price';
const hd = await bpl({document: lrItem, actor: boss, roll: {total: 12, options: {target: 19}}});
assert.equal(hd.total, 17);
assert.deepEqual(calls.filter(c => c[0] === 'update').at(-1), ['update', {'system.hd.spent': 1}]);
// no Blood Price item: Legendary Resistance only (and a stale 'price' answer does nothing)
calls.length = 0;
assert.equal(await bpl({document: lrItem, actor: {...boss, items: [lrItem, cls]}, roll: {total: 12, options: {target: 19}}}), undefined);
assert.equal(calls.find(c => c[0] === 'buttons')[1].length, 2);
// NPC stat block: native Legendary Resistance pips and the actor's Hit Dice (1.7.0)
calls.length = 0;
const npcLr = {name: 'Legendary Resistance (Blood Price)', flags: {'nix-module': {legendaryResistance: true}}, system: {uses: {max: '', value: 0, spent: 0}}};
const npcBoss = {name: 'Dracula', type: 'npc', items: [npcLr, cls, bpItem], effects: [], applyDamage: async n => calls.push(['bleed', n]),
    system: {resources: {legres: {max: 3, value: 2, spent: 1}}, attributes: {hd: {value: 20, spent: 0, denomination: 8}}}};
globalThis.__pick = 'legend';
const nwon = await bpl({document: npcLr, actor: npcBoss, roll: {total: 12, options: {target: 19}}, config: {midiOptions: {saveItemUuid: 'Spell4'}}});
assert.equal(nwon.total, 19);
assert.ok(calls.find(c => c[0] === 'buttons')[1][1].startsWith('Legendary Resistance (2 left)'));
assert.deepEqual(calls.filter(c => c[0] === 'update').at(-1), ['update', {'system.resources.legres.spent': 2}]);
globalThis.__pick = 'price';
const nhd = await bpl({document: npcLr, actor: npcBoss, roll: {total: 12, options: {target: 19}}});
assert.equal(nhd.total, 17);
assert.ok(calls.filter(c => c[0] === 'buttons').at(-1)[1][0].startsWith('Blood Price: spend a Hit Die, +1d10'), 'class die');
assert.deepEqual(calls.filter(c => c[0] === 'update').at(-1), ['update', {'system.attributes.hd.spent': 1}]);
// NPC with no Hit Dice left and no pips: no prompt
calls.length = 0;
assert.equal(await bpl({document: npcLr, actor: {...npcBoss, system: {resources: {legres: {max: 3, value: 0, spent: 3}}, attributes: {hd: {value: 0, spent: 20}}}},
    roll: {total: 12, options: {target: 19}}}), undefined);
assert.equal(calls.filter(c => c[0] === 'buttons').length, 0);
console.log('feature tests: all passed');
