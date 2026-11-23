// 1.7.6: Juggernaut boss kit runtime (scripts/court/juggernaut.mjs): lightning absorption on Midi's damage item,
// Petrifying Gaze tally, aura effects, Toss size rule, Legendary Resistance prompt.
// 1.7.7: no-save auras 2 / 3 (presence), aura switches and the roll mapping, Toss: Creature landing save, v14 LR.
// usage: node dev/juggernaut.test.mjs
import assert from 'node:assert/strict';
const getProperty = (o, p) => String(p).split('.').reduce((x, k) => x?.[k], o);
globalThis.foundry = {utils: {deepClone: o => structuredClone(o), setProperty: () => {}, getProperty, expandObject: o => o}};
globalThis.CONFIG = {DND5E: {}};
globalThis.CONST = {ACTIVE_EFFECT_MODES: {CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5}};
globalThis.game = {settings: {get: () => undefined}, user: {isGM: true, id: 'gm'}, users: {activeGM: null}};
globalThis.Hooks = {on: () => 1, once: () => 1, off: () => {}};
const chat = [];
globalThis.ChatMessage = {create: async d => { chat.push(d.content); return d; }, getSpeaker: () => ({})};
globalThis.ui = {notifications: {info: m => chat.push('[info] ' + m), warn: m => chat.push('[warn] ' + m)}};

const J = await import('../scripts/court/juggernaut.mjs');
const hp = (value, max = 270, temp = 0) => ({value, max, temp, damage: max - value});

// ---- lightning absorption (Midi v13 damage item)
{   // 20 lightning alone: heals 20
    const d = {damageDetail: [{type: 'lightning', value: 20}], rawDamageDetail: [{type: 'lightning', value: 20}], totalDamage: 20, hpDamage: 20};
    assert.equal(J.absorbLightning(d, hp(200)), 20);
    assert.equal(d.hpDamage, -20, 'negative hpDamage = healing (Midi)');
    assert.equal(d.newHP, 220);
    assert.equal(d.totalDamage, 0);
    assert.equal(d.damageDetail.find(x => x.type === 'lightning').value, 0);
    assert.deepEqual(d.damageDetail.find(x => x.type === 'healing').value, -20);
}
{   // 12 slashing + 10 lightning: takes 12, heals 10 -> net 2 damage
    const d = {damageDetail: [{type: 'slashing', value: 12}, {type: 'lightning', value: 10}], rawDamageDetail: [{type: 'slashing', value: 12}, {type: 'lightning', value: 10}], totalDamage: 22, hpDamage: 22};
    assert.equal(J.absorbLightning(d, hp(100)), 10);
    assert.equal(d.hpDamage, 2);
    assert.equal(d.newHP, 98);
}
{   // healing capped at max HP
    const d = {damageDetail: [{type: 'lightning', value: 30}], rawDamageDetail: [{type: 'lightning', value: 30}], totalDamage: 30};
    J.absorbLightning(d, hp(260));
    assert.equal(d.hpDamage, -10);
    assert.equal(d.newHP, 270);
}
{   // immunity left on him by an effect: dealt 0, rolled 18 -> heals 18 (never 0, never twice)
    const d = {damageDetail: [{type: 'lightning', value: 0}], rawDamageDetail: [{type: 'lightning', value: 18}], totalDamage: 0, hpDamage: 0};
    assert.equal(J.absorbLightning(d, hp(150)), 18);
    assert.equal(d.newHP, 168);
}
{   // a halved save (dealt 7 of 14 rolled): heals what was dealt
    const d = {damageDetail: [{type: 'lightning', value: 7}], rawDamageDetail: [{type: 'lightning', value: 14}], totalDamage: 7};
    assert.equal(J.absorbLightning(d, hp(150)), 7);
}
{   // Midi's own absorption already turned it into healing: left alone
    const d = {damageDetail: [{type: 'lightning', value: -9, active: {absorption: true}}], rawDamageDetail: [{type: 'lightning', value: 9}], totalDamage: 0, hpDamage: -9};
    assert.equal(J.absorbLightning(d, hp(150)), 0);
    assert.equal(d.hpDamage, -9);
    assert.equal(d.damageDetail.length, 1);
}
{   // no lightning: untouched
    const d = {damageDetail: [{type: 'fire', value: 9}], rawDamageDetail: [{type: 'fire', value: 9}], totalDamage: 9, hpDamage: 9};
    assert.equal(J.absorbLightning(d, hp(150)), 0);
    assert.equal(d.hpDamage, 9);
}
{   // temp HP absorb the rest of the damage first, as Midi does
    const d = {damageDetail: [{type: 'slashing', value: 15}, {type: 'lightning', value: 5}], rawDamageDetail: [], totalDamage: 20};
    J.absorbLightning(d, hp(100, 270, 8));
    assert.equal(d.newTempHP, 0);
    assert.equal(d.hpDamage, 2, '15 - 5 = 10, 8 of it on temp HP');
}
{   // v14 names (calculatedDamages / damages) are the lists edited when present
    const d = {calculatedDamages: [{type: 'lightning', value: 6}], damages: [{type: 'lightning', value: 6}], totalDamage: 6};
    assert.equal(J.absorbLightning(d, hp(100)), 6);
    assert.equal(d.calculatedDamages.at(-1).type, 'healing');
}

// ---- Petrifying Gaze tally
{
    let s = {ok: 0, fail: 0};
    s = J.petrifyStep(s, true); assert.equal(s.result, 'ongoing');
    s = J.petrifyStep(s, false); s = J.petrifyStep(s, true); assert.equal(s.result, 'ongoing');
    s = J.petrifyStep(s, true); assert.equal(s.result, 'petrified');
    let t = {ok: 2, fail: 2};
    assert.equal(J.petrifyStep(t, false).result, 'free');
}

// ---- aura effects
{
    assert.equal(J.auraOf(1).dc, 13); assert.equal(J.auraOf(1).ability, 'wis'); assert.equal(J.auraOf(1).save, true);
    // 1.7.7: auras 2 and 3 have no save
    assert.equal(J.auraOf(2).save, false); assert.equal(J.auraOf(3).save, false);
    assert.equal(J.auraOf(2).dc, undefined); assert.match(J.auraOf(2).text, /^No save/); assert.match(J.auraOf(3).text, /leaves the aura/);
    assert.equal(J.auraOf(4), null);
    const src = {uuid: 'Actor.jug', name: 'Juggernaut'};
    const laugh = J.auraEffects(1, src);
    assert.deepEqual(laugh.map(e => e.statuses[0]), ['incapacitated', 'prone']);
    assert.deepEqual(laugh[0].flags.dae.specialDuration, ['turnEnd'], 'Incapacitated for its turn');
    assert.deepEqual(laugh[1].flags.dae.specialDuration, ['turnStart'], 'Prone until the start of its next turn');
    assert.deepEqual(J.auraEffects(2, src), [], 'no failed-save effect for aura 2');
    assert.deepEqual(J.auraEffects(3, src), [], 'no failed-save effect for aura 3');
    // presence effects (on while within 30 ft)
    const enf = J.presenceEffect('enfeeble', src);
    assert.equal(enf.changes[0].key, 'flags.midi-qol.disadvantage.save.con', 'Midi 13.0.49+ key (no ".ability.")');
    assert.equal(enf.flags['nix-module'].juggernautPresence, 'enfeeble');
    assert.equal(enf.flags.dae, undefined, 'no turn-based expiry: it comes off when the creature leaves');
    const mist = J.presenceEffect('mist', src);
    assert.equal(mist.flags['nix-module'].juggernautNoHeal, true);
    assert.equal(mist.flags['nix-module'].juggernautPresence, 'mist');
    assert.equal(mist.origin, 'Actor.jug');
    assert.equal(J.presenceEffect('laughter', src), null, 'Laughter is a save, not a presence effect');
}

// ---- who is in the no-save aura (desiredPresence) and what changes (presenceDiff)
{
    const feet = {'J>a': 25, 'J>b': 35, 'J>c': 30, 'J>J': 0, 'K>a': 10};
    const dist = (j, t) => feet[j + '>' + t];
    const toks = [{id: 'a', sceneId: 's'}, {id: 'b', sceneId: 's'}, {id: 'c', sceneId: 's'}, {id: 'J', sceneId: 's', isJuggernaut: true}];
    let want = J.desiredPresence([{tokenId: 'J', sceneId: 's', aura: 2, radius: 30, alive: true}], toks, dist);
    assert.deepEqual([...want.get('a')], ['enfeeble'], 'within 30 ft');
    assert.deepEqual([...want.get('b')], [], 'outside');
    assert.deepEqual([...want.get('c')], ['enfeeble'], 'exactly 30 ft counts');
    assert.deepEqual([...want.get('J')], [], 'never on the Juggernaut');
    want = J.desiredPresence([{tokenId: 'J', sceneId: 's', aura: 3, radius: 30, alive: false}], toks, dist);
    assert.deepEqual([...want.get('a')], [], 'dead Juggernaut: nothing');
    want = J.desiredPresence([{tokenId: 'J', sceneId: 's', aura: 1, radius: 30, alive: true}], toks, dist);
    assert.deepEqual([...want.get('a')], [], 'Laughter is not a presence aura');
    want = J.desiredPresence([{tokenId: 'J', sceneId: 's', aura: 0, radius: 30, alive: true}], toks, dist);
    assert.deepEqual([...want.get('a')], [], 'no aura (switched off / combat over)');
    want = J.desiredPresence([{tokenId: 'J', sceneId: 's', aura: 2, alive: true}, {tokenId: 'K', sceneId: 's', aura: 2, alive: true}], [{id: 'a', sceneId: 's'}], dist);
    assert.deepEqual([...want.get('a')], ['enfeeble'], 'two sources of the same aura: one key, no stacking');
    // diff: add once, no duplicates, remove when it leaves
    assert.deepEqual(J.presenceDiff([], new Set(['mist'])), {remove: [], add: ['mist']});
    assert.deepEqual(J.presenceDiff([{id: 'e1', key: 'mist'}], new Set(['mist'])), {remove: [], add: []}, 'already there: nothing');
    assert.deepEqual(J.presenceDiff([{id: 'e1', key: 'mist'}, {id: 'e2', key: 'mist'}], new Set(['mist'])), {remove: ['e2'], add: []}, 'duplicate removed');
    assert.deepEqual(J.presenceDiff([{id: 'e1', key: 'mist'}], new Set()), {remove: ['e1'], add: []}, 'left the aura');
    assert.deepEqual(J.presenceDiff([{id: 'e1', key: 'enfeeble'}], new Set(['mist'])), {remove: ['e1'], add: ['mist']}, 'aura changed');
}

// ---- Aura switches: the roll uses only the auras still switched on
{
    assert.deepEqual(J.enabledAuras({}), [1, 2, 3]);
    assert.deepEqual(J.enabledAuras({disabledAuras: [2]}), [1, 3]);
    assert.deepEqual(J.enabledAuras({disabledAuras: [1, 2, 3, 7]}), []);
    let p = J.auraRollPlan([1, 2, 3]);
    assert.equal(p.mode, 'roll'); assert.equal(p.formula, '1d3');
    assert.deepEqual([1, 2, 3].map(r => J.auraForRoll(p, r)), [1, 2, 3], '3 on: 1d3 as before');
    p = J.auraRollPlan([3, 1]);
    assert.equal(p.formula, '1d2', '2 on: 1d2');
    assert.deepEqual([J.auraForRoll(p, 1), J.auraForRoll(p, 2)], [1, 3], '1 = Laughter, 2 = Decaying Mist');
    assert.equal(J.mappingText(p), '1 = Tasha\'s Hideous Laughter, 2 = Decaying Mist');
    p = J.auraRollPlan([2]);
    assert.equal(p.mode, 'auto'); assert.equal(p.aura, 2, '1 on: active without a roll');
    p = J.auraRollPlan([]);
    assert.equal(p.mode, 'none', '0 on: no roll, no aura');
}

// ---- rollAura / setAuraEnabled against a mock actor
{
    const chat2 = [];
    const mkActor = cfg => {
        const a = {name: 'Juggernaut', uuid: 'Actor.jug', flags: {'nix-module': {juggernaut: {version: 1, radius: 30, ...cfg}}}, effects: [], system: {attributes: {hp: {value: 100}}}};
        a.effects.get = id => a.effects.find(e => e.id === id);
        a.update = async upd => { for (const [k, v] of Object.entries(upd)) { const ks = k.split('.'); let x = a; for (const p of ks.slice(0, -1)) x = (x[p] ??= {}); x[ks.at(-1)] = v; } };
        a.createEmbeddedDocuments = async (t, list) => list.map((d, i) => { const e = {...d, id: 'e' + a.effects.length + i}; a.effects.push(e); return e; });
        a.deleteEmbeddedDocuments = async (t, ids) => { for (const id of ids) a.effects.splice(a.effects.findIndex(e => e.id === id), 1); };
        a.getActiveTokens = () => [];
        return a;
    };
    let nextRoll = 1;
    globalThis.Roll = class { constructor(f) { this.formula = f; } async evaluate() { this.total = nextRoll; return this; } async toMessage(d) { chat2.push(d.flavor); } };
    globalThis.ChatMessage = {create: async d => { chat2.push(d.content); return d; }, getSpeaker: () => ({})};
    globalThis.game.users = {activeGM: null, filter: f => [{id: 'gm', isGM: true}].filter(f)};
    // aura 2's device destroyed, so 1 and 3 are on: 1d2, a 2 picks Decaying Mist
    let jug = mkActor({disabledAuras: [2], aura: 0});
    nextRoll = 2;
    assert.equal(await J.rollAura(jug, 'start of his turn'), 3);
    assert.match(chat2.at(-1), /1d2 \(2 auras still working: 1 = Tasha's Hideous Laughter, 2 = Decaying Mist\): 2 = <b>Decaying Mist<\/b>/);
    assert.equal(jug.flags['nix-module'].juggernaut.aura, 3);
    assert.equal(jug.effects.filter(e => e.flags['nix-module'].juggernautAura).length, 1);
    // same aura again: it stays, no second effect
    assert.equal(await J.rollAura(jug, 'start of his turn'), 3);
    assert.match(chat2.at(-1), /same aura: it stays/);
    assert.equal(jug.effects.filter(e => e.flags['nix-module'].juggernautAura).length, 1, 'no duplicate aura effect');
    // switching the active aura off ends it at once
    assert.equal(await J.setAuraEnabled(jug, 3, false), true);
    assert.deepEqual(jug.flags['nix-module'].juggernaut.disabledAuras, [2, 3]);
    assert.equal(jug.flags['nix-module'].juggernaut.aura, 0, 'no aura until his next roll');
    assert.equal(jug.effects.filter(e => e.flags['nix-module'].juggernautAura).length, 0, 'aura effect gone');
    assert.ok(chat2.some(c => /It was the active aura: it ends now/.test(c)));
    // 1 on: automatic, no roll
    assert.equal(await J.rollAura(jug, 'start of his turn'), 1);
    assert.match(chat2.at(-1), /only <b>Tasha's Hideous Laughter<\/b> is still working, so it is active \(no roll\)/);
    // switching an inactive aura off leaves the active one alone
    jug = mkActor({aura: 1});
    await J.setAura(jug, 1);
    await J.setAuraEnabled(jug, 2, false);
    assert.equal(jug.flags['nix-module'].juggernaut.aura, 1);
    assert.equal(jug.effects.filter(e => e.flags['nix-module'].juggernautAura).length, 1);
    // 0 on: no roll, no aura
    await J.setAuraEnabled(jug, 1, false); await J.setAuraEnabled(jug, 3, false);
    assert.equal(await J.rollAura(jug, 'start of his turn'), 0);
    assert.match(chat2.at(-1), /all auras destroyed: no aura/);
    // back on: persists on the flag
    await J.setAuraEnabled(jug, 2, true);
    assert.deepEqual(jug.flags['nix-module'].juggernaut.disabledAuras, [1, 3]);
    globalThis.ChatMessage = {create: async d => { chat.push(d.content); return d; }, getSpeaker: () => ({})};
}

// ---- Toss: Creature lands, then a DC 15 Dex save for 2d8 (half on a success)
{
    const rolls = [];
    globalThis.chrisPremades = {utils: {workflowUtils: {syntheticItemDataRoll: async (data, actor, toks) => { rolls.push(data); return {failedSaves: new Set()}; }}},
        Teleport: {target: async () => rolls.push('teleport')}};
    const statuses = new Set(['prone']);
    const tok = {name: 'Hero', document: {uuid: 'T1'}, actor: {statuses, toggleStatusEffect: async s => statuses.add(s)}};
    await J.tossLanding({name: 'Juggernaut', flags: {'nix-module': {juggernaut: {version: 1}}}}, tok);
    assert.equal(rolls[0], 'teleport', 'the GM picks the landing spot first');
    const act = Object.values(rolls[1].system.activities)[0];
    assert.equal(act.type, 'save'); assert.deepEqual(act.save.ability, ['dex']); assert.equal(act.save.dc.formula, '15');
    assert.equal(act.damage.onSave, 'half');
    assert.equal(act.damage.parts[0].number, 2); assert.equal(act.damage.parts[0].denomination, 8); assert.deepEqual(act.damage.parts[0].types, ['bludgeoning']);
    assert.ok(statuses.has('prone'), 'Prone either way');
    assert.equal(J.DEFAULTS.tossDc, 15);
}

// ---- Toss: Large or smaller
assert.equal(J.tossable({system: {traits: {size: 'lg'}}}), true);
assert.equal(J.tossable({system: {traits: {size: 'huge'}}}), false);
assert.equal(J.tossable({system: {traits: {size: 'tiny'}}}), true);

// ---- Legendary Resistance prompt (native pips)
{
    const updates = [];
    globalThis.chrisPremades = {utils: {
        dialogUtils: {buttonDialog: async (t, c, buttons) => (assert.match(buttons[0][0], /3 left/), 'yes')},
        socketUtils: {gmID: () => 'gm'},
        genericUtils: {update: async (doc, u) => updates.push(u)},
        workflowUtils: {}
    }};
    globalThis.Roll = class { constructor(f) { this.formula = f; } async evaluate() { this.total = Number(this.formula); return this; } };
    globalThis.MidiQOL = {addRollTo: (r, f) => ({total: r.total + f.total})};
    const actor = {type: 'npc', name: 'Juggernaut', flags: {'nix-module': {juggernaut: {version: 1}}}, items: {find: () => null},
        system: {resources: {legres: {value: 3, max: 3, spent: 0}}}};
    const r = await J.legendaryResistance({actor, roll: {total: 9, options: {target: 17}}});
    assert.equal(r.total, 17, 'the save now meets the DC');
    assert.deepEqual(updates, [{'system.resources.legres.spent': 1}]);
    // passed save, or no pips left: nothing asked
    assert.equal(await J.legendaryResistance({actor, roll: {total: 18, options: {target: 17}}}), undefined);
    actor.system.resources.legres.value = 0;
    assert.equal(await J.legendaryResistance({actor, roll: {total: 2, options: {target: 17}}}), undefined);
    // not the Juggernaut: nothing
    assert.equal(await J.legendaryResistance({actor: {type: 'npc', flags: {}, items: {find: () => null}, system: {}}, roll: {total: 2, options: {target: 17}}}), undefined);
}
// ---- Legendary Resistance on v14 (CAT save macro: {actor, roll, config}; the roll is raised through CAT's addToRoll)
{
    delete globalThis.chrisPremades;
    const updates = [];
    globalThis.cat = {utils: {dialogUtils: {buttonDialog: async () => 'yes'}, queryUtils: {gmID: () => 'gm', firstOwner: () => 'gm'},
        documentUtils: {update: async (d, u) => updates.push(u)}, rollUtils: {addToRoll: async (roll, f) => ({total: roll.total + Number(f), via: 'cat'})},
        workflowUtils: {}, tokenUtils: {}, actorUtils: {}, effectUtils: {}}};
    const actor = {type: 'npc', name: 'Juggernaut', flags: {'nix-module': {juggernaut: {version: 1}}}, items: {find: () => null}, system: {resources: {legres: {value: 2, max: 3, spent: 1}}}};
    const r = await J.legendaryResistance({actor, roll: {total: 10, options: {}}, config: {target: 15}});
    assert.deepEqual(r, {total: 15, via: 'cat'});
    assert.deepEqual(updates, [{'system.resources.legres.spent': 2}]);
    delete globalThis.cat;
}
console.log('juggernaut tests: all passed');
