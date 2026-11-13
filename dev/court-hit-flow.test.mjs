// node dev/court-hit-flow.test.mjs : the Illrigger engine's hit flow on v13 (1.7.1).
//  - A weapon hit by an Illrigger on a sealed creature: no dialog before damage, ONE dialog after
//    (burn row + "Also place another seal" + boons).
//  - Boons spend the Interdict Boons use, never a Baleful Interdict seal.
//  - Deathstrike asks before damage only when usable; the after-damage row forces a burn.
//  - Damage from someone else: one dialog, no place option.
//  - Terrorizing Force (v13): +1d8 of its type on weapon attack hits, unarmed strikes included.
import assert from 'node:assert/strict';
const clone = o => o === undefined ? o : JSON.parse(JSON.stringify(o));
const setPath = (o, p, v) => { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = (x[k] ??= {}); x[ks.at(-1)] = v; };
const calls = [];
const log = (...a) => calls.push(a);
const hooks = {};
globalThis.Hooks = {on: (n, f) => { hooks[n] = f; }, callAll: () => {}};
globalThis.foundry = {utils: {deepClone: clone, setProperty: setPath, mergeObject: (a, b) => { for (const [k, v] of Object.entries(b)) setPath(a, k, v); return a; },
    hasProperty: (o, p) => p.split('.').reduce((x, k) => x?.[k], o) !== undefined}, applications: {api: {}}};
globalThis.game = {user: {id: 'gm', isGM: true}, users: {activeGM: null}, combat: null};
globalThis.ChatMessage = {create: async d => log('chat', d.content), getSpeaker: () => ({})};
globalThis.MidiQOL = {};
let uid = 0;
const registry = new Map();
globalThis.fromUuidSync = u => registry.get(u) ?? null;

// ---- dialogs: script the answers
const dialogs = [];
let answer = null;
globalThis.foundry.applications.api.DialogV2 = {wait: async cfg => {
    dialogs.push(cfg);
    const a = answer?.(cfg);
    if (a === undefined || a === null) return null;
    if (typeof a === 'string') return a;
    const btn = cfg.buttons.find(b => b.action === 'apply');
    const elements = {};
    for (const [k, v] of Object.entries(a)) elements[k] = typeof v === 'boolean' ? {checked: v} : {value: String(v)};
    return btn.callback(null, {form: {elements}});
}};

// ---- documents
function mkItem(actor, data) {
    const it = {documentName: 'Item', id: 'i' + (++uid), ...clone(data), actor, effects: data.effects ?? [],
        get uuid() { return actor.uuid + '.Item.' + this.id; }};
    it.system.uses &&= {...it.system.uses, get value() { return Number(this.max) - (this.spent ?? 0); }};
    it.update = async u => { for (const [k, v] of Object.entries(u)) setPath(it, k, v); log('itemUpdate', it.name, u); return it; };
    registry.set(it.uuid, it);
    return it;
}
function mkActor(name, {flags = {}, hp = 50} = {}) {
    const a = {documentName: 'Actor', id: 'a' + (++uid), name, flags, statuses: new Set(), effects: [], items: [],
        system: {attributes: {hp: {value: hp, max: hp, temp: 0}, prof: 5}, scale: {illrigger: {'baleful-interdict-damage': {number: 3, faces: 6}}}}};
    a.uuid = 'Actor.' + a.id;
    a.items.get = id => a.items.find(i => i.id === id);
    a.createEmbeddedDocuments = async (t, list) => list.map(d => { const e = {...clone(d), id: 'e' + (++uid), documentName: 'ActiveEffect'}; a.effects.push(e); log('createEffect', name, d.name); return e; });
    a.deleteEmbeddedDocuments = async (t, ids) => { a.effects = a.effects.filter(e => !ids.includes(e.id)); log('deleteEffects', name, ids.length); };
    a.update = async u => { for (const [k, v] of Object.entries(u)) setPath(a, k, v); };
    a.token = {object: {id: 't' + a.id, actor: a, document: {name, disposition: name === 'Hero' ? 1 : -1, uuid: 'Tok.' + a.id}}};
    registry.set(a.uuid, a);
    return a;
}
const seal = owner => ({documentName: 'ActiveEffect', name: 'Baleful Interdict: ' + owner.name, flags: {'nix-module': {seal: {owner: owner.uuid}}, 'chris-premades': {info: {identifier: 'balefulInterdictEffect'}}}, transfer: false});

// ---- Chris's Premades 1 (v13)
globalThis.chrisPremades = {utils: {
    workflowUtils: {
        isAttackType: (wf, t) => ({weaponAttack: wf.item?.type === 'weapon', meleeWeaponAttack: wf.item?.type === 'weapon'})[t] ?? false,
        syntheticItemDataRoll: async (data, owner, targets) => { log('burnRoll', data.system.activities.nixBurnActivity0.damage.parts[0].custom.formula); return {damageTotal: 10}; },
        syntheticItemRoll: async (item, targets, opts) => log('boonRoll', item.name, opts),
        bonusDamage: async (wf, f, o) => log('bonusDamage', f, o.damageType),
        applyDamage: async () => {}
    },
    tokenUtils: {getDistance: () => 10},
    actorUtils: {hasUsedReaction: () => false, setReactionUsed: async () => log('reaction'), typeOrRace: () => 'humanoid'},
    rollUtils: {makeCritical: r => r}
}};

const E = await import(new URL('../scripts/court/illrigger.mjs', import.meta.url));
E.registerIllrigger();
const H = n => Object.entries(hooks).find(([k]) => k.includes(n))[1];
const onAttack = H('postAttackRollComplete'), onDamage = H('preDamageRollComplete'), onUpdate = hooks.updateActor;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Sydmore-like Illrigger with Styx's Apathy; a hero with one of his seals.
const syd = mkActor('Sydmore', {flags: {'nix-module': {illrigger: {range: 30, classId: 'illrigger', damageScale: 'baleful-interdict-damage'}}}});
const bi = mkItem(syd, {name: 'Baleful Interdict', type: 'feat', system: {uses: {max: '6', spent: 0}}, flags: {'chris-premades': {info: {identifier: 'balefulInterdict'}}}});
const pool = mkItem(syd, {name: 'Interdict Boons', type: 'feat', system: {uses: {max: '1', spent: 0}}});
const styx = mkItem(syd, {name: 'Interdict Boons: Styx\'s Apathy', type: 'feat', system: {}});
const fist = mkItem(syd, {name: 'Unarmed Strike', type: 'weapon', system: {}});
const tf = mkItem(syd, {name: 'Terrorizing Force: Poison', type: 'feat', system: {}, flags: {'nix-module': {terrorizingForce: {damageType: 'poison'}}}});
syd.items.push(bi, pool, styx, fist, tf);
const hero = mkActor('Hero');
hero.effects.push({...seal(syd), id: 'seal1'});
const heroTok = hero.token.object;

// 1. Sydmore hits the sealed hero: nothing before the damage.
const wf = {id: 'wf1', actor: syd, item: fist, activity: {type: 'attack'}, hitTargets: new Set([heroTok]), d20AttackRoll: 12, workflowOptions: {}};
await onAttack(wf);
assert.equal(dialogs.length, 0, 'no dialog before the damage');
// Terrorizing Force on the unarmed strike.
await onDamage(wf);
assert.deepEqual(calls.find(c => c[0] === 'bonusDamage'), ['bonusDamage', '1d8', 'poison']);
// Damage lands: one dialog with burn + also place + Styx.
answer = cfg => { assert.match(cfg.content, /Also place another seal/); assert.match(cfg.content, /Styx/); return {'r0.n': 1, 'r0.type': 'necrotic', 'r0.place': true, 'r0.styx': true}; };
hero.system.attributes.hp.value = 40;
onUpdate(hero, {system: {attributes: {hp: {value: 40}}}}, {dnd5e: {hp: {value: 50, temp: 0}}});
await sleep(500);
assert.equal(dialogs.length, 1, 'exactly one dialog for the hit');
assert.match(calls.find(c => c[0] === 'burnRoll')[1], /^3d6/);
const boon = calls.find(c => c[0] === 'boonRoll');
assert.equal(boon[2].consumeResources, false, 'boon item consumes no seal');
assert.equal(pool.system.uses.spent, 1, 'Interdict Boons use spent');
assert.equal(bi.system.uses.spent, 1, 'only the new seal came from the pool (not the boon)');
assert.equal(hero.effects.length, 1, 'burned 1, placed 1');
// The burn's own damage (rolled by the mock without touching HP) lands: in flight, no dialog.
onUpdate(hero, {system: {attributes: {hp: {value: 40}}}}, {dnd5e: {hp: {value: 50, temp: 0}}});
await sleep(500);
assert.equal(dialogs.length, 1, 'the burn damage opens nothing');
calls.length = 0; dialogs.length = 0;

// 2. Someone else's damage on the sealed hero: one dialog, no place option.
answer = cfg => { assert.doesNotMatch(cfg.content, /place/i); return null; };
hero.system.attributes.hp.value = 30;
onUpdate(hero, {system: {attributes: {hp: {value: 30}}}}, {dnd5e: {hp: {value: 40, temp: 0}}});
await sleep(500);
assert.equal(dialogs.length, 1);

// 3. Terrorizing Force: not on a save activity, not without a hit.
calls.length = 0;
await onDamage({...wf, id: 'wf2', activity: {type: 'save'}});
await onDamage({...wf, id: 'wf3', hitTargets: new Set()});
assert.equal(calls.filter(c => c[0] === 'bonusDamage').length, 0);

// 4. Deathstrike: asks before the damage only when he has it; the row then forces a burn.
const ds = mkItem(syd, {name: 'Deathstrike', type: 'feat', system: {uses: {max: '1', spent: 0}}});
syd.items.push(ds);
syd.flags['nix-module'].illrigger.deathstrike = ds.id;
dialogs.length = 0; calls.length = 0;
answer = cfg => /Deathstrike/.test(cfg.window.title) ? 't0' : {'r0.n': 0, 'r0.type': 'fire'};
const wf4 = {...wf, id: 'wf4', isCritical: false, attackRoll: {}, setAttackRoll: async () => log('crit')};
await onAttack(wf4);
assert.equal(dialogs.length, 1, 'Deathstrike asks at the hit');
assert.ok(calls.some(c => c[0] === 'crit'));
hero.system.attributes.hp.value = 10;
onUpdate(hero, {system: {attributes: {hp: {value: 10}}}}, {dnd5e: {hp: {value: 30, temp: 0}}});
await sleep(500);
assert.equal(dialogs.length, 2, 'one more dialog, after the damage');
assert.match(dialogs[1].content, /Deathstrike: burn at least 1/);
assert.match(calls.find(c => c[0] === 'burnRoll')[1], /^6d6/, 'picked 0 but Deathstrike burns 1 with doubled dice');
// ---- 1.7.1: a Bonus Action seal (Chris's Premades' Place Seal activity) has the ACTOR as its origin,
// no Nix Fix flag and no identifier. It must count as his seal and be normalised on create.
{
    const villain = mkActor('Villain');
    const ba = {id: 'eBA', documentName: 'ActiveEffect', name: 'Baleful Interdict', origin: syd.uuid, flags: {}, transfer: false, duration: {rounds: 10}};
    ba.update = async u => { for (const [k, v] of Object.entries(u)) setPath(ba, k, v); log('effectUpdate', u); };
    villain.effects.push(ba);
    assert.ok(E.isSeal(ba), 'actor-origin Baleful Interdict effect is a seal');
    assert.equal(E.sealsOn(villain).get(syd.uuid)?.effects.length, 1, 'counted for its owner (burn row)');
    const act = {id: 'eAct', documentName: 'ActiveEffect', name: 'Baleful Interdict', origin: bi.uuid + '.Activity.x', flags: {}, transfer: false};
    registry.set(bi.uuid + '.Activity.x', {documentName: 'Activity', item: bi});
    assert.ok(E.isSeal(act), 'activity-origin seal');
    assert.equal(E.sealsOn({effects: [act]}).get(syd.uuid)?.effects.length, 1);
    assert.ok(!E.isSeal({documentName: 'ActiveEffect', name: 'Bless', origin: syd.uuid, flags: {}}), 'other effects from him are not seals');
    const hookCreate = hooks.createActiveEffect;
    calls.length = 0;
    await hookCreate(ba, {}, 'gm');
    const u = calls.find(c => c[0] === 'effectUpdate')?.[1] ?? {};
    assert.equal(u.name, 'Baleful Interdict: Sydmore', 'renamed like a hit seal');
    assert.equal(u.origin, bi.uuid, 'origin = his Baleful Interdict item');
    assert.equal(u['flags.chris-premades.info.identifier'], 'balefulInterdictEffect');
    assert.ok(!('duration' in u), 'already Temporary: duration kept');
    const d = E.sealDuration();
    assert.equal(d.rounds, 10, 'engine seals last 1 minute');
}
console.log('court hit flow: all passed');
