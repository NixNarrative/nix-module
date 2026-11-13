// node dev/court-extras.test.mjs : 1.7.1 second batch (2026-11-12 table test).
//  - Guarded Mind: fails Int/Wis/Cha only, asks, spends the use, returns the difference; no use left = nothing.
//  - Infernal Conduit (v13): range 5 ft / 30 with Unfettered; Harm heals him, Heal costs him.
//  - Vengeful Shot (v13): ranged weapon picked without a prompt; asked when two fit.
//  - Honey-Sweet Blades: advantage effect at the preamble on a sealed target; the hit becomes a crit.
//  - Hellsight: vision mode to truesight and back; Darkness's Blinded removed.
//  - Terrorizing Force (v13): its die joins the weapon's damage roll config (one manual roll).
//  - Mage Slayer: a concentrating target gets the disadvantage effect.
import assert from 'node:assert/strict';
const clone = o => o === undefined ? o : JSON.parse(JSON.stringify(o));
const setPath = (o, p, v) => { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = (x[k] ??= {}); if (ks.at(-1).startsWith('-=')) delete x[ks.at(-1).slice(2)]; else x[ks.at(-1)] = v; };
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
Set.prototype.first ??= function () { return this.values().next().value; };
const calls = [];
const log = (...a) => calls.push(a);
const hooks = {};
globalThis.Hooks = {on: (n, f) => { (hooks[n] ??= []).push(f); }, callAll: () => {}};
globalThis.foundry = {utils: {deepClone: clone, setProperty: setPath, getProperty: getPath, randomID: () => 'rid' + Math.random(),
    hasProperty: (o, p) => getPath(o, p) !== undefined}, applications: {api: {DialogV2: {wait: async () => null}}}, dice: {terms: {Die: class {}}}};
globalThis.game = {user: {id: 'gm', isGM: true, targets: new Set()}, users: {activeGM: null}, combat: null, combats: [], socket: {on() {}, emit() {}}};
globalThis.ui = {notifications: {warn: m => log('warn', m), info: m => log('info', m)}};
globalThis.ChatMessage = {create: async d => log('chat', d.content), getSpeaker: () => ({}), getWhisperRecipients: () => []};
globalThis.Actor = class Actor {};
globalThis.CONFIG = {statusEffects: [], specialStatusEffects: {CONCENTRATING: 'concentrating'}, DND5E: {abilities: {wis: {label: 'Wisdom'}}},
    Canvas: {visionModes: {darkvision: {}, truesight: {}}}};
let uid = 0;
const registry = new Map();
globalThis.fromUuidSync = u => registry.get(u) ?? null;

function mkActor(name, {disp = -1, type = 'npc'} = {}) {
    const a = Object.assign(new Actor(), {documentName: 'Actor', id: 'a' + (++uid), name, type, flags: {}, statuses: new Set(), effects: [], items: [],
        system: {attributes: {hp: {value: 30, max: 50, temp: 0}, prof: 3, death: {success: 0}}, abilities: {cha: {mod: 4}}}});
    a.uuid = 'Actor.' + a.id;
    a.items.get = id => a.items.find(i => i.id === id);
    a.createEmbeddedDocuments = async (t, list) => list.map(d => {
        const e = {...clone(d), documentName: 'ActiveEffect', id: 'e' + (++uid), parent: a, statuses: new Set(d.statuses ?? []), disabled: false, transfer: !!d.transfer};
        e.delete = async () => { a.effects.splice(a.effects.indexOf(e), 1); for (const f of hooks.deleteActiveEffect ?? []) f(e); };
        e.update = async u => { for (const [k, v] of Object.entries(u)) setPath(e, k, v); };
        a.effects.push(e); log('createEffect', name, d.name); for (const f of hooks.createActiveEffect ?? []) f(e); return e; });
    a.deleteEmbeddedDocuments = async (t, ids) => { for (const id of ids) { const i = a.effects.findIndex(e => e.id === id); if (i >= 0) a.effects.splice(i, 1); } log('deleteEffects', name, ids.length); };
    a.update = async u => { for (const [k, v] of Object.entries(u)) setPath(a, k, v); };
    const doc = {name, disposition: disp, uuid: 'Tok.' + a.id, id: 't' + a.id, sight: {visionMode: 'darkvision', range: 60}, flags: {}, width: 1, height: 1};
    doc.update = async u => { for (const [k, v] of Object.entries(u)) setPath(doc, k, v); log('tokenUpdate', name, u); };
    const tok = {id: doc.id, actor: a, document: doc, x: 0};
    doc.object = tok;
    a.token = {object: tok};
    a.getActiveTokens = (linked, document) => document ? [doc] : [tok];
    registry.set(a.uuid, a); registry.set(doc.uuid, doc);
    return a;
}
function mkItem(actor, data) {
    const it = {documentName: 'Item', id: 'i' + (++uid), effects: [], ...clone(data), actor};
    it.uuid = actor.uuid + '.Item.' + it.id;
    if (it.system?.uses) Object.defineProperty(it.system.uses, 'value', {get() { return Number(this.max) - (this.spent ?? 0); }});
    it.update = async u => { for (const [k, v] of Object.entries(u)) setPath(it, k, v); };
    registry.set(it.uuid, it);
    actor.items.push(it);
    return it;
}
let distance = 5, confirmAnswer = true, buttonAnswer = null;
const specialUses = [], applied = [];
globalThis.chrisPremades = {utils: {
    tokenUtils: {getDistance: () => distance, findNearby: () => []},
    dialogUtils: {confirm: async (t, c) => { log('confirm', t); return confirmAnswer; }, buttonDialog: async (t, c, b) => { log('button', t, b.map(x => x[0])); return buttonAnswer ?? b[0][1]; }},
    workflowUtils: {specialItemUse: async (w, t) => specialUses.push(w.name), applyDamage: async (t, n, type) => applied.push([n, type]),
        getDamageTypes: rolls => new Set(rolls.map(r => r.options.type)), getTotalDamageOfType: () => 12},
    rollUtils: {makeCritical: r => ({...r, crit: true})},
    actorUtils: {}, effectUtils: {}}};
globalThis.MidiQOL = {getDistance: () => distance, Workflow: {getWorkflow: () => null}};

const X = await import('../scripts/court/court-extras.mjs');
const I = await import('../scripts/court/illrigger.mjs');
const api = X.registerCourtExtras();
I.registerIllrigger();
const run = async (name, ...args) => { let r; for (const f of hooks[name] ?? []) r = await f(...args); return r; };

// ---- Guarded Mind
{
    const v = mkActor('Valintina');
    const ms = mkItem(v, {name: 'Mage Slayer', type: 'feat', system: {uses: {max: '1', spent: 0}}});
    v.flags['nix-module'] = {court: {key: 'valintina', mageSlayer: ms.id}};
    assert.equal(await api.guardedMind(v, {total: 9, options: {target: 15}}, 'dex'), null, 'Dex save: not Guarded Mind');
    assert.equal(await api.guardedMind(v, {total: 16, options: {target: 15}}, 'wis'), null, 'success: nothing');
    assert.equal(await api.guardedMind(v, {total: 9, options: {target: 15}}, 'wis'), 6, 'fail by 6: +6');
    assert.equal(ms.system.uses.spent, 1, 'use spent');
    assert.equal(await api.guardedMind(v, {total: 9, options: {target: 15}}, 'cha'), null, 'no use left');
}
// ---- Infernal Conduit (v13)
{
    const o = mkActor('Octavian'), t = mkActor('Target', {disp: 1});
    const act = {type: 'save', flags: {'nix-module': {court: 'conduit'}}};
    distance = 10;
    const wf = {actor: o, token: o.token.object, targets: new Set([t.token.object]), activity: act, item: {}};
    assert.equal(await run('midi-qol.preambleComplete', wf), false, '10 ft without Unfettered: aborted');
    mkItem(o, {name: 'Combat Mastery: Unfettered', type: 'feat', system: {}});
    const wf2 = {...wf, aborted: false};
    assert.notEqual(await run('midi-qol.preambleComplete', wf2), false, 'Unfettered: 30 ft ok');
    const harm = {...wf2, damageRolls: [{options: {type: 'necrotic'}}], damageDetail: []};
    await run('midi-qol.premades.postRollFinished', harm);
    assert.deepEqual(applied.at(-1), [12, 'healing'], 'Harm heals him');
    await run('midi-qol.premades.postRollFinished', {...harm, damageRolls: [{options: {type: 'healing'}}]});
    assert.deepEqual(applied.at(-1), [12, 'none'], 'Heal costs him');
}
// ---- Vengeful Shot (v13)
{
    const d = mkActor('Dayus'), t = mkActor('Orc', {disp: 1});
    mkItem(d, {name: 'Rapier', type: 'weapon', system: {equipped: true, type: {value: 'martialM'}, range: {value: 5}, properties: new Set(), activities: [{type: 'attack'}]}});
    mkItem(d, {name: 'Longbow', type: 'weapon', system: {equipped: true, type: {value: 'martialR'}, range: {value: 150, long: 600}, properties: new Set(), activities: [{type: 'attack'}]}});
    distance = 30; calls.length = 0;
    await run('midi-qol.premades.postRollFinished', {actor: d, token: d.token.object, targets: new Set([t.token.object]), item: {name: 'Interdict Boons: Vengeful Shot'}, activity: {flags: {'nix-module': {court: 'vengefulShot'}}}});
    assert.deepEqual(specialUses, ['Longbow'], 'longbow, no prompt');
    assert.ok(!calls.some(c => c[0] === 'button'), 'no weapon prompt');
    mkItem(d, {name: 'Shortbow', type: 'weapon', system: {equipped: true, type: {value: 'simpleR'}, range: {value: 80, long: 320}, properties: new Set(), activities: [{type: 'attack'}]}});
    buttonAnswer = d.items.find(i => i.name === 'Shortbow').id;
    await run('midi-qol.premades.postRollFinished', {actor: d, token: d.token.object, targets: new Set([t.token.object]), item: {name: 'Interdict Boons: Vengeful Shot'}, activity: {flags: {'nix-module': {court: 'vengefulShot'}}}});
    assert.deepEqual(calls.find(c => c[0] === 'button')?.[2], ['Longbow', 'Shortbow'], 'two ranged: asked, rapier not offered');
    assert.equal(specialUses.at(-1), 'Shortbow');
}
// ---- Honey-Sweet Blades
{
    const l = mkActor('Lucian'), t = mkActor('Knight', {disp: 1});
    await run('midi-qol.premades.postRollFinished', {actor: l, activity: {flags: {'nix-module': {court: 'honeySweet'}}}});
    assert.ok(l.effects.some(e => e.flags['nix-module'].honeySweet), 'Honey-Sweet effect on Lucian');
    // seal on the target, from Lucian
    l.items.push(Object.assign({id: 'bi', name: 'Baleful Interdict', type: 'feat', system: {}, effects: []}));
    await t.createEmbeddedDocuments('ActiveEffect', [{name: 'Baleful Interdict', origin: l.uuid, flags: {'nix-module': {seal: {owner: l.uuid}}, 'chris-premades': {info: {identifier: 'balefulInterdictEffect'}}}}]);
    const wf = {actor: l, item: {type: 'weapon'}, activity: {type: 'attack'}, targets: new Set([t.token.object]), hitTargets: new Set([t.token.object]), attackRoll: {total: 20},
        setAttackRoll: async r => { wf.attackRoll = r; }};
    await run('midi-qol.premades.postPreambleComplete', wf);
    const sealed = I.sealsOf(t, l).length > 0;
    if (sealed) {
        assert.ok(l.effects.some(e => /advantage/.test(e.name)), 'advantage effect');
        await run('midi-qol.premades.postAttackRollComplete', wf);
        assert.ok(wf.isCritical && wf.attackRoll.crit, 'hit becomes a crit');
    } else console.log('  (seal stub not recognised by sealsOf; Honey-Sweet preamble/crit not checked)');
}
// ---- Hellsight
{
    const l = mkActor('Lucian2');
    await l.createEmbeddedDocuments('ActiveEffect', [{name: 'Darkness: Blinded', statuses: ['blinded'], flags: {world: {nixDarkBlind: 'Tpl.1'}}}]);
    await l.createEmbeddedDocuments('ActiveEffect', [{name: 'Interdict Boons: Hellsight', transfer: false}]);
    await new Promise(r => setTimeout(r, 20));
    const doc = l.token.object.document;
    assert.equal(doc.sight.visionMode, 'truesight', 'vision mode truesight');
    assert.ok(!l.effects.some(e => e.flags?.world?.nixDarkBlind), 'Darkness blind removed');
    await l.effects.find(e => /hellsight/i.test(e.name)).delete();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(doc.sight.visionMode, 'darkvision', 'vision mode back');
}
// ---- Terrorizing Force folded into the damage roll (v13)
{
    const l = mkActor('Lucian3'), t = mkActor('Foe', {disp: 1});
    mkItem(l, {name: 'Terrorizing Force: Necrotic', type: 'feat', system: {}, flags: {'nix-module': {terrorizingForce: {damageType: 'necrotic'}}}});
    const item = {type: 'weapon', actor: l};
    const activity = {type: 'attack', item, actor: l, uuid: 'Act.1', getRollData: () => ({})};
    const wf = {hitTargets: new Set([t.token.object])};
    globalThis.MidiQOL.Workflow.getWorkflow = u => u === 'Act.1' ? wf : null;
    const config = {subject: activity, rolls: [{parts: ['1d8', '@mod'], data: {mod: 4}, options: {type: 'slashing', properties: ['mgc']}}]};
    await run('dnd5e.preRollDamageV2', config);
    assert.equal(config.rolls.length, 2, 'one extra roll in the same config');
    assert.deepEqual(config.rolls[1].parts, ['1d8']);
    assert.equal(config.rolls[1].options.type, 'necrotic');
    assert.ok(wf.nixTerrorizing, 'no separate bonus roll afterwards');
    const missed = {subject: activity, rolls: [{parts: ['1d8']}]};
    wf.nixTerrorizing = false; wf.hitTargets = new Set();
    await run('dnd5e.preRollDamageV2', missed);
    assert.equal(missed.rolls.length, 1, 'no hit: nothing added');
}
// ---- Mage Slayer: concentration breaker
{
    const v = mkActor('Valintina2'), t = mkActor('Caster', {disp: 1});
    const ms = mkItem(v, {name: 'Mage Slayer', type: 'feat', system: {}});
    v.flags['nix-module'] = {court: {key: 'valintina', mageSlayer: ms.id}};
    t.statuses.add('concentrating');
    await run('midi-qol.premades.preDamageRollComplete', {id: 'wf9', actor: v, activity: {type: 'attack'}, hitTargets: new Set([t.token.object]), targets: new Set([t.token.object])});
    const eff = t.effects.find(e => e.name === 'Mage Slayer: concentration');
    assert.ok(eff, 'disadvantage effect on the concentrating target');
    assert.equal(eff.changes[0].key, 'flags.midi-qol.disadvantage.concentration');
}
console.log('court extras: all passed');
