// node dev/brawl-v14.test.mjs : Brawler feats, one popup per hit on v14 (CAT, Chris's Premades 2.1.9), 1.7.8.
import assert from 'node:assert/strict';
const hooks = {}, calls = [];
const log = (...a) => calls.push(a);
globalThis.Hooks = {on: (n, f) => { (hooks[n] ??= []).push(f); }};
globalThis.game = {user: {id: 'gm', isGM: true}, users: {activeGM: null}, combat: {started: true, round: 2, turn: 1}};
globalThis.ChatMessage = {create: async d => log('chat', d.content), getSpeaker: () => ({})};
let answer = null;
globalThis.foundry = {utils: {deepClone: x => structuredClone(x), expandObject: x => x, setProperty: (o, k, v) => { const p = k.split('.'); let c = o; while (p.length > 1) { const x = p.shift(); c = c[x] ??= {}; } c[p[0]] = v; }},
    applications: {api: {DialogV2: {wait: async cfg => { log('dialog', cfg.content); return cfg.buttons[0].callback(null, {form: {elements: {brawl: {value: answer}}}}); }}}}};
// CAT only (no chrisPremades.utils): the engine adapter routes to cat.utils.
globalThis.cat = {utils: {
    workflowUtils: {getDamageTypes: rolls => new Set(rolls.map(r => r.options.type)), isAttackType: (wf, t) => t === 'meleeWeaponAttack' && wf.activity.melee,
        syntheticActivityRoll: async (a, t, o) => log('roll', a.name, t[0].name, o.workflowOptions?.targetConfirmation ?? o.options?.workflowOptions?.targetConfirmation, o.consumeResources)},
    tokenUtils: {slideToken: async (t, o) => log('slide', t.name, o.distance), displaceToken: async (t, o) => { log('displace', t.name, o.range); return true; }},
    actorUtils: {getSize: a => ['tiny', 'sm', 'med', 'lg', 'huge'].indexOf(a.system.traits.size)},
    itemUtils: {getActivityByIdentifier: (item, id) => item?.system?.activities?.find?.(a => a.identifier === id)}
}};
const mkFeat = (name, acts = []) => ({type: 'feat', name, img: '', uuid: 'F.' + name, flags: {}, system: {activities: acts},
    setFlag: async function (scope, k, v) { const [a, b] = k.split('.'); ((this.flags[scope] ??= {})[a] ??= {})[b] = v; }});
const B = await import(new URL('../scripts/court/brawl.mjs', import.meta.url));
B.registerBrawl();
const crusher = mkFeat('Crusher', [{name: 'Crusher: Critical', identifier: 'crusher-critical'}]);
const grappler = mkFeat('Grappler', [{name: 'Punch and Grab', identifier: 'punch-and-grab'}]);
const syd = {uuid: 'Actor.syd', name: 'Sydmore', system: {traits: {size: 'med'}}, flags: {'nix-module': {brawl: true}}, effects: [],
    items: [mkFeat('Tavern Brawler'), crusher, grappler]};
const vina = {uuid: 'Actor.vina', name: 'Vina', system: {traits: {size: 'med'}}, effects: [], createEmbeddedDocuments: async (t, d) => log('effect', d[0].name)};
const tVina = {id: 'tv', name: 'Vina', actor: vina, document: {name: 'Vina', documentName: 'Token'}};
tVina.document.object = tVina;
const fist = {name: 'Unarmed Strike', type: 'weapon', flags: {}, system: {type: {value: 'unarmed'}, activities: [{name: 'Grapple'}]}};
const sydTok = {id: 'ts', document: {name: 'Sydmore', documentName: 'Token'}};
const wf = (id, crit = false) => ({id, actor: syd, item: fist, token: sydTok, isCritical: crit, activity: {type: 'attack', melee: true},
    hitTargets: {size: 1, first: () => tVina}, damageRolls: [{options: {type: 'bludgeoning'}}, {options: {type: 'poison'}}]});
const run = async (n, w) => { for (const f of hooks[n] ?? []) await f(w); };
const DMG = 'midi-qol.premades.preDamageRollComplete', FIN = 'midi-qol.premades.postRollFinished';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Hit 1 (crit): CPR2's Crusher: Critical activity rolled at the target; all three offered; Crusher's move = displaceToken.
await run(DMG, wf('w1', true));
assert.ok(calls.some(c => c[0] === 'roll' && c[1] === 'Crusher: Critical' && c[2] === 'Vina'), 'crit uses CPR2 activity');
const crit = calls.find(c => c[0] === 'roll');
assert.equal(crit[3], 'none', 'no Target Confirmation'); assert.equal(crit[4], false, 'spends nothing');
assert.ok(!calls.some(c => c[0] === 'effect'), 'no Nix Fix effect when the activity exists');
let s = B.take('Actor.vina', 'brawl0');
assert.deepEqual(s.p.options, ['tb', 'crusher', 'grapple']);
s.read({elements: {brawl0: {value: 'crusher'}}});
assert.equal(await s.apply(), true);
assert.deepEqual(calls.find(c => c[0] === 'displace'), ['displace', 'Vina', 5]);
assert.equal(crusher.flags['nix-module'].brawlTurn.crusher, '2-1', 'turn kept on the feat');

// Hit 2, same turn: Crusher gone; grapple = Grappler's Punch and Grab.
calls.length = 0;
await run(DMG, wf('w2'));
answer = 'grapple';
await run(FIN, wf('w2'));
await sleep(1400);
const dlg = calls.find(c => c[0] === 'dialog');
assert.ok(dlg && /Tavern Brawler/.test(dlg[1]) && !/Crusher/.test(dlg[1]), 'own window, Crusher used');
assert.ok(calls.some(c => c[0] === 'roll' && c[1] === 'Punch and Grab'), 'Punch and Grab rolled');

// Hit 3: Tavern Brawler push = slide 5 ft.
calls.length = 0;
await run(DMG, wf('w3'));
s = B.take('Actor.vina');
assert.deepEqual(s.p.options, ['tb']);
s.read({elements: {brawl: {value: 'tb'}}});
await s.apply();
assert.deepEqual(calls.find(c => c[0] === 'slide'), ['slide', 'Vina', 5]);

// Next turn: everything back; without CPR2's Grappler activity the Unarmed Strike's Grapple is used; crit without
// CPR2's activity falls back to Nix Fix's effect (v14 form).
game.combat.turn = 2; calls.length = 0;
grappler.system.activities = []; crusher.system.activities = [];
await run(DMG, wf('w4', true));
assert.ok(calls.some(c => c[0] === 'effect' && c[1] === 'Crusher'), 'fallback crit effect');
s = B.take('Actor.vina');
assert.deepEqual(s.p.options, ['tb', 'crusher', 'grapple']);
assert.equal(B.grappleActivity(fist, grappler).name, 'Grapple');

// Not bludgeoning, too big, not marked: nothing.
calls.length = 0; game.combat.turn = 3;
vina.system.traits.size = 'huge';
await run(DMG, wf('w5'));
assert.deepEqual(B.take('Actor.vina').p.options, ['tb', 'grapple'], 'Huge target: no Crusher');
vina.system.traits.size = 'med'; syd.flags['nix-module'].brawl = false;
await run(DMG, wf('w6'));
assert.equal(B.take('Actor.vina'), null, 'unmarked actor ignored');
console.log('brawl v14 tests: all passed');
