// node dev/brawl.test.mjs : Brawler feats, one popup per hit (scripts/court/brawl.mjs, 1.7.1).
import assert from 'node:assert/strict';
const hooks = {}, calls = [];
const log = (...a) => calls.push(a);
globalThis.Hooks = {on: (n, f) => { (hooks[n] ??= []).push(f); }};
globalThis.CONST = {ACTIVE_EFFECT_MODES: {CUSTOM: 0}};
globalThis.game = {user: {id: 'gm', isGM: true}, users: {activeGM: null}, combat: {started: true, round: 1, turn: 0}};
globalThis.ChatMessage = {create: async d => log('chat', d.content), getSpeaker: () => ({})};
let answer = null;
globalThis.foundry = {applications: {api: {DialogV2: {wait: async cfg => { log('dialog', cfg.content); const v = answer; return cfg.buttons[0].callback(null, {form: {elements: {brawl: {value: v}}}}); }}}}};
const flags = {};
const mkFeat = (name, key) => ({type: 'feat', name, img: '', uuid: 'F.' + key, flags: {'chris-premades': {}},
    setFlag: async function (scope, k, v) { this.flags[scope][k.split('.')[0]] = {turn: v}; }});
globalThis.chrisPremades = {utils: {
    combatUtils: {perTurnCheck: (item, key) => item.flags['chris-premades'][key]?.turn !== '1-0', setTurnCheck: (item, key) => item.setFlag('chris-premades', key + '.turn', '1-0')},
    actorUtils: {getSize: a => ['tiny', 'sm', 'med', 'lg'].indexOf(a.system.traits.size)},
    workflowUtils: {getActionType: wf => wf.activity.actionType, syntheticActivityRoll: async (a, t) => log('grappleRoll', a.name)},
    tokenUtils: {pushToken: async (s, t, d) => log('push', t.document.name, d)},
    activityUtils: {getActivityByIdentifier: () => null}
}};
const B = await import(new URL('../scripts/court/brawl.mjs', import.meta.url));
const api = B.registerBrawl();
const syd = {uuid: 'Actor.syd', name: 'Sydmore', system: {traits: {size: 'med'}}, flags: {'nix-module': {brawl: true}}, effects: [],
    items: [mkFeat('Tavern Brawler: Strength Score', 'tb'), mkFeat('Crusher', 'cr'), mkFeat('Grappler', 'gr')]};
const quezActor = {uuid: 'Actor.quez', name: 'Quez', system: {traits: {size: 'med'}}, effects: [], createEmbeddedDocuments: async (t, d) => log('effect', d[0].name)};
const quez = {id: 'tq', actor: quezActor, document: {name: 'Quez'}};
const fist = {name: 'Unarmed Strike', type: 'weapon', flags: {'chris-premades': {info: {identifier: 'unarmedStrike'}}},
    system: {type: {value: 'simpleM'}, activities: [{name: 'Grapple'}]}};
const wf = (id, crit = false) => ({id, actor: syd, item: fist, token: {id: 'ts'}, isCritical: crit, activity: {type: 'attack', actionType: 'mwak'},
    hitTargets: {size: 1, first: () => quez}, damageRolls: [{options: {type: 'bludgeoning'}}, {options: {type: 'poison'}}]});
const run = async (n, w) => { for (const f of hooks[n] ?? []) await f(w); };
const DMG = 'midi-qol.premades.preDamageRollComplete', FIN = 'midi-qol.premades.postRollFinished';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Hit 1: all three offered; the Illrigger window takes it (one window), Tavern Brawler push.
await run(DMG, wf('w1'));
let s = B.take('Actor.quez', 'brawl0');
assert.ok(s, 'pending hit taken by the Baleful Interdict window');
assert.deepEqual(s.p.options, ['tb', 'crusher', 'grapple']);
assert.match(s.html, /type="radio" name="brawl0"/);
s.read({elements: {brawl0: {value: 'tb'}}});
assert.equal(await s.apply(), true);
assert.deepEqual(calls.find(c => c[0] === 'push'), ['push', 'Quez', 5]);
assert.equal(B.take('Actor.quez'), null, 'taken once');

// Hit 2, same turn: Tavern Brawler used, Crusher and Grapple left; no other window -> its own window after the workflow.
calls.length = 0;
await run(DMG, wf('w2'));
answer = 'grapple';
await run(FIN, wf('w2'));
await sleep(1400);
const dlg = calls.find(c => c[0] === 'dialog');
assert.ok(dlg && !/Tavern Brawler/.test(dlg[1]) && /Crusher/.test(dlg[1]) && /Grapple/.test(dlg[1]), 'own window, TB gone');
assert.ok(calls.some(c => c[0] === 'grappleRoll'), 'grapple activity rolled');
assert.ok(!calls.some(c => c[0] === 'push'), 'grapple excludes the push');

// Hit 3: only Crusher left (Grappler used too).
calls.length = 0;
await run(DMG, wf('w3'));
s = B.take('Actor.quez');
assert.deepEqual(s.p.options, ['crusher']);
// Hit 4 on a critical: Crusher's advantage effect lands without a prompt.
calls.length = 0;
await run(DMG, wf('w4', true));
assert.ok(calls.some(c => c[0] === 'effect' && c[1] === 'Crusher'), 'crit advantage effect');
// Not marked: nothing.
const other = {...syd, uuid: 'Actor.o', flags: {}};
await run(DMG, {...wf('w5'), actor: other});
assert.equal(B.take('Actor.quez')?.p.wfId, 'w4');
console.log('brawl tests: all passed');
