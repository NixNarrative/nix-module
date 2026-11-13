// node dev/court-spells.test.mjs : 1.7.1 Court fixes from the 2026-11-12 table test.
//  - True Name (Nix's rule): natural 18-19 = 1 free seal, 20 = 2, with or without his own seal; not from his pool,
//    not his once-per-turn placement; also when no dialog opens.
//  - Seal owner matched across an unlinked token's synthetic actor (same base id).
//  - Vengeful Blade: weapon attack, +1d8 necrotic on the hit (level 7), condition; its next attack or spell: 2d8, ends.
//  - Hell's Lash: failed save tethers; start of its turn: GM asked, 2d4 fire; end of its turn: save ends it.
//  - Hellish Frenzy: ends at the start of its owner's next turn.
import assert from 'node:assert/strict';
const clone = o => o === undefined ? o : JSON.parse(JSON.stringify(o));
const setPath = (o, p, v) => { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = (x[k] ??= {}); x[ks.at(-1)] = v; };
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
Set.prototype.first ??= function () { return this.values().next().value; };
const calls = [];
const log = (...a) => calls.push(a);
const hooks = {};
globalThis.Hooks = {on: (n, f) => { (hooks[n] ??= []).push(f); }, callAll: () => {}};
globalThis.foundry = {utils: {deepClone: clone, setProperty: setPath, getProperty: getPath, randomID: () => 'rid' + Math.random(),
    mergeObject: (a, b) => { for (const [k, v] of Object.entries(b)) setPath(a, k, v); return a; },
    hasProperty: (o, p) => getPath(o, p) !== undefined}, applications: {api: {}}};
globalThis.game = {user: {id: 'gm', isGM: true, targets: new Set()}, users: {activeGM: null}, combat: null, socket: {on() {}, emit() {}}};
globalThis.ui = {notifications: {warn: m => log('warn', m), info: m => log('info', m)}};
globalThis.ChatMessage = {create: async d => log('chat', d.content), getSpeaker: () => ({}), getWhisperRecipients: () => []};
globalThis.MidiQOL = {};
globalThis.Actor = class Actor {};
globalThis.CONFIG = {statusEffects: []};
let uid = 0;
const registry = new Map();
globalThis.fromUuidSync = u => registry.get(u) ?? null;
const dialogs = [];
let answer = () => null;
globalThis.foundry.applications.api.DialogV2 = {wait: async cfg => {
    dialogs.push(cfg);
    const a = answer(cfg);
    if (a === undefined || a === null) return null;
    if (typeof a === 'string') return a;
    const btn = cfg.buttons.find(b => b.action === 'apply');
    const elements = {};
    for (const [k, v] of Object.entries(a)) elements[k] = typeof v === 'boolean' ? {checked: v} : {value: String(v)};
    return btn.callback(null, {form: {elements}});
}};

function mkItem(actor, data) {
    const it = {documentName: 'Item', id: 'i' + (++uid), ...clone(data), actor, effects: [],
        get uuid() { return actor.uuid + '.Item.' + this.id; }};
    if (it.system.uses) it.system.uses = {...it.system.uses, get value() { return Number(this.max) - (this.spent ?? 0); }};
    it.update = async u => { for (const [k, v] of Object.entries(u)) setPath(it, k, v); return it; };
    registry.set(it.uuid, it);
    actor.items.push(it);
    return it;
}
function mkEffect(actor, d) {
    const e = {...clone(d), id: 'e' + (++uid), documentName: 'ActiveEffect', parent: actor, statuses: new Set(d.statuses ?? [])};
    e.update = async u => { for (const [k, v] of Object.entries(u)) setPath(e, k, v); return e; };
    e.delete = async () => { const i = actor.effects.indexOf(e); if (i < 0) return; actor.effects.splice(i, 1); log('deleteEffect', actor.name, e.name); for (const f of hooks.deleteActiveEffect ?? []) await f(e); };
    actor.effects.push(e);
    return e;
}
function mkActor(name, {flags = {}, hp = 50, disp = -1, type = 'character', level = 7, id} = {}) {
    const a = Object.assign(new Actor(), {documentName: 'Actor', id: id ?? 'a' + (++uid), name, type, flags, statuses: new Set(), effects: [], items: [],
        system: {details: {level}, attributes: {hp: {value: hp, max: hp, temp: 0}, prof: 3, spell: {dc: 15}}, abilities: {cha: {mod: 4}},
            scale: {illrigger: {'baleful-interdict-damage': {number: 2, faces: 6}}}}});
    a.uuid = 'Actor.' + a.id + (id ? '.syn' + uid : '');
    a.items.get = iid => a.items.find(i => i.id === iid);
    a.effects.get = eid => a.effects.find(e => e.id === eid);
    a.createEmbeddedDocuments = async (t, list) => list.map(d => { const e = mkEffect(a, d); log('createEffect', name, d.name); for (const f of hooks.createActiveEffect ?? []) f(e); return e; });
    a.deleteEmbeddedDocuments = async (t, ids) => { for (const id of ids) { const i = a.effects.findIndex(e => e.id === id); if (i >= 0) a.effects.splice(i, 1); } log('deleteEffects', name, ids.length); };
    a.update = async u => { for (const [k, v] of Object.entries(u)) setPath(a, k, v); };
    const tok = {id: 't' + a.id + uid, actor: a, document: {name, disposition: disp, uuid: 'Tok.' + a.id + uid}};
    tok.document.object = tok;
    a.token = {object: tok};
    registry.set(a.uuid, a);
    registry.set(tok.document.uuid, tok.document);
    return a;
}
const tokens = [];
globalThis.canvas = {tokens: {get placeables() { return tokens; }}};

// ---- Chris's Premades 1 (v13)
let weaponWorkflow = null;
globalThis.chrisPremades = {utils: {
    workflowUtils: {
        isAttackType: (wf, t) => ({weaponAttack: wf.item?.type === 'weapon', meleeWeaponAttack: wf.item?.type === 'weapon', meleeAttack: true})[t] ?? false,
        syntheticItemDataRoll: async (data, owner, targets) => {
            const act = Object.values(data.system.activities)[0];
            if (act.type === 'save') { log('save', data.name, act.save.dc.formula); return {failedSaves: new Set(saveFails ? targets : [])}; }
            log('damageRoll', data.name, act.damage.parts[0].custom.formula, act.damage.parts[0].types[0]); return {damageTotal: 7};
        },
        syntheticItemRoll: async (item, targets) => { log('itemRoll', item.name); if (weaponWorkflow) await weaponWorkflow(item, targets); },
        bonusDamage: async (wf, f, o) => log('bonusDamage', f, o.damageType),
        applyDamage: async () => {}
    },
    dialogUtils: {buttonDialog: async (title, content, buttons) => { log('ask', title); return askAnswer(title, buttons); }, confirm: async () => true},
    tokenUtils: {getDistance: () => 5},
    effectUtils: {getConcentrationEffect: () => null},
    actorUtils: {hasUsedReaction: () => false, setReactionUsed: async () => log('reaction'), typeOrRace: () => 'humanoid'},
    rollUtils: {makeCritical: r => r}
}};
let saveFails = true;
let askAnswer = () => null;

const E = await import(new URL('../scripts/court/illrigger.mjs', import.meta.url));
E.registerIllrigger();
const S = await import(new URL('../scripts/court/illrigger-spells.mjs', import.meta.url));
S.registerIllriggerSpells();
const H = (n, i = 0) => Object.entries(hooks).filter(([k]) => k.includes(n)).flatMap(([, v]) => v)[i];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = async (n, ...args) => { for (const f of hooks[n] ?? []) await f(...args); };

// ======================================================= True Name
const zad = mkActor('Zadimus', {flags: {'nix-module': {illrigger: {range: 30, classId: 'illrigger', damageScale: 'baleful-interdict-damage'}}}});
const bi = mkItem(zad, {name: 'Baleful Interdict', type: 'feat', system: {uses: {max: '3', spent: 0}}, flags: {'chris-premades': {info: {identifier: 'balefulInterdict'}}}});
const rapier = mkItem(zad, {name: 'True Name Rapier, +1', type: 'weapon', system: {attuned: true}});
zad.flags['nix-module'].illrigger.trueNameItem = rapier.id;
const hero = mkActor('Hero', {disp: 1});
tokens.push(zad.token.object, hero.token.object);
const onAttack = H('postAttackRollComplete'), onUpdate = hooks.updateActor[0];
const hit = async d20 => {
    await onAttack({id: 'w' + d20, actor: zad, item: rapier, activity: {type: 'attack'}, hitTargets: new Set([hero.token.object]), d20AttackRoll: d20, workflowOptions: {}});
    hero.system.attributes.hp.value -= 5;
    onUpdate(hero, {system: {attributes: {hp: {}}}}, {dnd5e: {hp: {value: hero.system.attributes.hp.value + 5, temp: 0}}});
    await sleep(450);
};
// Natural 19, he doesn't tick "Place a seal": 1 free seal anyway, pool untouched.
answer = cfg => { assert.match(cfg.content, /natural 19, 1 free seal/); assert.match(cfg.content, /Place a seal/); return {'r0.place': false}; };
await hit(19);
assert.equal(E.sealsOf(hero, zad).length, 1, 'nat 19: 1 free seal');
assert.equal(bi.system.uses.spent, 0, 'free: not from his pool');
// Natural 20, he places his own too: 1 paid + 2 free.
answer = cfg => ({'r0.n': 0, 'r0.place': true});
await hit(20);
assert.equal(E.sealsOf(hero, zad).length, 4, 'nat 20 + his own seal: 1 + 1 + 2');
assert.equal(bi.system.uses.spent, 1, 'only his own seal came from the pool');
// Natural 17: nothing extra.
answer = cfg => ({'r0.n': 0, 'r0.place': false});
await hit(17);
assert.equal(E.sealsOf(hero, zad).length, 4);
// Not attuned: nothing.
rapier.system.attuned = false;
await hit(20);
assert.equal(E.sealsOf(hero, zad).length, 4, 'unattuned True Name: no free seals');
rapier.system.attuned = true;
// Empty pool and no seals on a new target: no dialog at all, the free seals still land.
const hero2 = mkActor('Hero2', {disp: 1});
tokens.push(hero2.token.object);
bi.system.uses.spent = 3;
dialogs.length = 0;
await onAttack({id: 'wx', actor: zad, item: rapier, activity: {type: 'attack'}, hitTargets: new Set([hero2.token.object]), d20AttackRoll: 18, workflowOptions: {}});
onUpdate(hero2, {system: {attributes: {hp: {}}}}, {dnd5e: {hp: {value: 55, temp: 0}}});
await sleep(450);
assert.equal(dialogs.length, 0, 'no dialog (nothing to burn, can\'t place)');
assert.equal(E.sealsOf(hero2, zad).length, 1, 'True Name seal without a dialog');
assert.equal(E.trueNameSeals(zad, {itemId: rapier.id, d20: 20}), 2);
assert.equal(E.trueNameSeals(zad, {itemId: 'other', d20: 20}), 0);

// ======================================================= seal owner across an unlinked token
const synth = Object.assign(new Actor(), {documentName: 'Actor', id: zad.id, uuid: 'Scene.s.Token.t.Actor.' + zad.id, name: 'Zadimus', items: zad.items, flags: zad.flags});
assert.ok(E.sameActor(synth, zad), 'synthetic token actor = its base actor');
assert.equal(E.sealsOf(hero, synth).length, 4, 'his seals found from the token actor');

// ======================================================= Vengeful Blade
assert.deepEqual(S.vbDice(7), [1, 2]);
assert.deepEqual(S.vbDice(15), [2, 3]);
assert.deepEqual(S.vbDice(4), [0, 1]);
assert.equal(S.cantripLevel(zad), 7);
assert.equal(S.lashDice(1), 2);
assert.equal(S.lashDice(3), 4);
const onFinished = (wf) => all('midi-qol.premades.postRollFinished', wf);
const onDamage = (wf) => all('midi-qol.premades.preDamageRollComplete', wf);
const onAttackAll = (wf) => all('midi-qol.premades.postAttackRollComplete', wf);
const vb = mkItem(zad, {name: 'Vengeful Blade', type: 'spell', img: 'vb.webp', system: {level: 0, activities: []}});
rapier.system.equipped = true;
rapier.system.activities = [{type: 'attack', attack: {type: {value: 'melee'}}}];
weaponWorkflow = async (item, targets) => {
    const wf = {id: 'vbw', actor: zad, item, activity: {type: 'attack'}, hitTargets: new Set(targets), targets: new Set(targets), d20AttackRoll: 10, workflowOptions: {}};
    await onDamage(wf);
    await onFinished(wf);
};
calls.length = 0;
await onFinished({actor: zad, item: vb, activity: {flags: {'nix-module': {court: 'vengefulBlade'}}}, targets: new Set([hero.token.object])});
await sleep(450);
assert.ok(calls.some(c => c[0] === 'itemRoll' && c[1] === rapier.name), 'the weapon attack is made');
assert.deepEqual(calls.find(c => c[0] === 'bonusDamage'), ['bonusDamage', '1d8', 'necrotic'], '+1d8 necrotic on the hit (level 7)');
const aura = hero.effects.find(e => e.flags?.['nix-module']?.vengefulBlade);
assert.ok(aura, 'Vengeful Blade condition on the target');
assert.equal(aura.flags['nix-module'].vengefulBlade.dice, 2);
// RAW: its first attack (any turn) costs it 2d8 necrotic and the aura ends.
const onPre = (wf) => all('midi-qol.premades.postPreambleComplete', wf);
calls.length = 0;
await onPre({id: 'h1', actor: hero, item: {name: 'Sword', type: 'weapon'}, activity: {type: 'attack'}});
assert.deepEqual(calls.find(c => c[0] === 'damageRoll'), ['damageRoll', 'Vengeful Blade', '2d8', 'necrotic'], 'first attack: 2d8 necrotic');
assert.ok(!hero.effects.includes(aura), 'aura ends');
// Casting a spell sets it off too (a save spell, no attack).
await onFinished({actor: zad, item: vb, activity: {flags: {'nix-module': {court: 'vengefulBlade'}}}, targets: new Set([hero.token.object])});
await sleep(450);
const aura2 = hero.effects.find(e => e.flags?.['nix-module']?.vengefulBlade);
assert.ok(aura2, 'aura again');
calls.length = 0;
await onPre({id: 'h2', actor: hero, item: {name: 'Bane', type: 'spell'}, activity: {type: 'save'}});
assert.ok(calls.some(c => c[0] === 'damageRoll' && c[2] === '2d8'), 'a spell: 2d8 necrotic');
assert.ok(!hero.effects.includes(aura2));

// ======================================================= Hell's Lash
const lash = mkItem(zad, {name: 'Hell\'s Lash', type: 'spell', img: 'lash.webp', system: {level: 1}});
calls.length = 0;
await onFinished({actor: zad, item: lash, activity: {flags: {'nix-module': {court: 'hellsLash'}}, save: {dc: {value: 15}}}, castData: {castLevel: 1},
    targets: new Set([hero.token.object]), failedSaves: new Set([hero.token.object])});
const tether = hero.effects.find(e => e.flags?.['nix-module']?.hellsLash);
assert.ok(tether, 'failed save: tethered');
// Start of the hero's turn: asked, deals 2d4 fire.
askAnswer = (title, buttons) => /Hell's Lash/.test(title) && buttons.some(b => b[1] === 'deal') ? 'deal' : (buttons.find(b => b[1] === 'no')?.[1] ?? null);
game.combat = {id: 'c', started: true, round: 3, turn: 1, combatant: {actor: hero, tokenId: hero.token.object.id}, combatants: {get: () => null}, previous: {}};
calls.length = 0;
await all('updateCombat', game.combat, {turn: 1});
assert.deepEqual(calls.find(c => c[0] === 'damageRoll'), ['damageRoll', 'Hell\'s Lash', '2d4', 'fire']);
// End of the hero's turn (next combatant): he burns no seal ('no'), the save succeeds -> the lash ends.
saveFails = false;
askAnswer = () => 'no';
game.combat = {id: 'c', started: true, round: 3, turn: 2, combatant: {actor: zad, tokenId: zad.token.object.id}, combatants: {get: id => id === 'H' ? {actor: hero} : null}, previous: {combatantId: 'H'}};
calls.length = 0;
await all('updateCombat', game.combat, {turn: 2});
assert.ok(calls.some(c => c[0] === 'save' && c[2] === '15'), 'Con save DC 15');
assert.ok(!hero.effects.includes(tether), 'saved: the lash ends');

// ======================================================= Hellish Frenzy
game.combat = {id: 'c', started: true, round: 4, turn: 0, combatant: {actor: zad, tokenId: zad.token.object.id}, combatants: {get: () => null}, previous: {}};
const fr = mkEffect(zad, {name: 'Hellish Frenzy', origin: rapier.uuid, flags: {}});
await all('createActiveEffect', fr);
assert.ok(fr.flags['nix-module'].frenzy, 'tagged');
assert.ok(fr.flags.dae.specialDuration.includes('turnStart'));
await all('updateCombat', game.combat, {turn: 0});
assert.ok(zad.effects.includes(fr), 'not on the turn it was made');
game.combat = {...game.combat, round: 5, turn: 0};
await all('updateCombat', game.combat, {round: 5});
assert.ok(!zad.effects.includes(fr), 'gone at the start of his next turn');

// ======================================================= Valintina: Enervating Spell, Submit
const L = await import(new URL('../scripts/court/lieutenants.mjs', import.meta.url));
L.registerLieutenants();
game.combat = null;
const val = mkActor('Valintina', {flags: {'nix-module': {illrigger: {range: 30, classId: 'illrigger'}, court: {key: 'valintina', submit: true}}}});
const vbi = mkItem(val, {name: 'Baleful Interdict', type: 'feat', system: {uses: {max: '6', spent: 0}}, flags: {'chris-premades': {info: {identifier: 'balefulInterdict'}}}});
tokens.push(val.token.object);
const mote = mkItem(val, {name: 'Mote of Hell', type: 'spell', system: {level: 3, sourceItem: 'class:illrigger'}});
const cantrip = mkItem(val, {name: 'Toll the Dead', type: 'spell', system: {level: 0, sourceItem: 'class:illrigger'}});
mkEffect(val, {name: 'Enervating Spell (ready)', flags: {'nix-module': {enervating: true}}});
const victim = mkActor('Victim', {disp: 1});
tokens.push(victim.token.object);
calls.length = 0;
// A cantrip: skipped, still armed, the GM is told why.
await onDamage({id: 'c1', actor: val, item: cantrip, activity: {type: 'save', damage: {parts: [{types: ['necrotic']}]}}, castData: {castLevel: 0},
    targets: new Set([victim.token.object]), damageRolls: [{options: {type: 'necrotic'}}]});
assert.ok(calls.some(c => c[0] === 'chat' && /a cantrip/.test(c[1])), 'cantrip: says why');
assert.ok(val.effects.some(e => e.flags?.['nix-module']?.enervating), 'still armed');
// Mote of Hell: a seal, vulnerability on the target until its damage lands (not at the end of the workflow).
const wfM = {id: 'm1', actor: val, item: mote, activity: {type: 'save', damage: {parts: [{types: ['fire']}]}}, castData: {castLevel: 3},
    targets: new Set([victim.token.object]), damageRolls: [{options: {type: 'fire'}}]};
await onDamage(wfM);
const vul = victim.effects.find(e => e.name === 'Enervating Spell');
assert.ok(vul && vul.changes.some(c => c.key === 'system.traits.dv.value' && c.value === 'fire'), 'vulnerable to fire');
assert.equal(vbi.system.uses.spent, 1, 'one seal spent');
assert.ok(!val.effects.some(e => e.flags?.['nix-module']?.enervating), 'disarmed');
await onFinished(wfM);
assert.ok(victim.effects.includes(vul), 'kept after the workflow (damage may be applied from the card)');
victim.system.attributes.hp.value = 30;
for (const f of hooks.updateActor) f(victim, {system: {attributes: {hp: {}}}}, {dnd5e: {hp: {value: 50, temp: 0}}});
await sleep(500);
assert.ok(!victim.effects.includes(vul), 'removed once the damage landed');
assert.ok(!val.effects.some(e => e.name === 'Enervating Spell (casting)'), 'her ignore-resistance goes too');
// Submit: a save spell at a creature with 2 of her seals is offered (owner matched through sameActor).
const sealOf = owner => ({name: 'Baleful Interdict: ' + owner.name, flags: {'nix-module': {seal: {owner: owner.uuid}}, 'chris-premades': {info: {identifier: 'balefulInterdictEffect'}}}, transfer: false});
mkEffect(victim, sealOf(val)); mkEffect(victim, sealOf(val));
dialogs.length = 0;
answer = cfg => /Submit/.test(cfg.window.title) ? null : null;
await all('midi-qol.premades.postPreambleComplete', {id: 's1', actor: val, item: mote, token: val.token.object, activity: {type: 'save'}, targets: new Set([victim.token.object])});
assert.ok(dialogs.some(d => /Submit/.test(d.window.title)), 'Submit offered');

console.log('court spells: all passed');
