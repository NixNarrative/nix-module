// 1.7.6: Juggernaut boss kit runtime (scripts/court/juggernaut.mjs): lightning absorption on Midi's damage item,
// Petrifying Gaze tally, aura effects, Toss size rule, Legendary Resistance prompt.
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
    assert.equal(J.auraOf(1).dc, 13); assert.equal(J.auraOf(1).ability, 'wis');
    assert.equal(J.auraOf(2).dc, 15); assert.equal(J.auraOf(3).ability, 'con');
    assert.equal(J.auraOf(4), null);
    const src = {uuid: 'Actor.jug'};
    const laugh = J.auraEffects(1, src);
    assert.deepEqual(laugh.map(e => e.statuses[0]), ['incapacitated', 'prone']);
    assert.deepEqual(laugh[0].flags.dae.specialDuration, ['turnEnd'], 'Incapacitated for its turn');
    assert.deepEqual(laugh[1].flags.dae.specialDuration, ['turnStart'], 'Prone until the start of its next turn');
    const enf = J.auraEffects(2, src)[0];
    assert.equal(enf.changes[0].key, 'flags.midi-qol.disadvantage.save.con', 'Midi 13.0.49+ key (no ".ability.")');
    const mist = J.auraEffects(3, src)[0];
    assert.equal(mist.flags['nix-module'].juggernautNoHeal, true);
    assert.equal(mist.origin, 'Actor.jug');
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
console.log('juggernaut tests: all passed');
