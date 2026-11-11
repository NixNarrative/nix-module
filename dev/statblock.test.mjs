// node dev/statblock.test.mjs : offline check of npcLegendary (stat block layout) and the
// Blood Price prompt's NPC branch, on a mock Dracula NPC built from the boss kit's own data.
import assert from 'node:assert/strict';
const clone = o => o === undefined ? o : JSON.parse(JSON.stringify(o));
function setPath(obj, path, v) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = (o[parts[i]] ??= {});
    const last = parts[parts.length - 1];
    if (last.startsWith('-=')) delete o[last.slice(2)];
    else if (v && typeof v === 'object' && !Array.isArray(v) && o[last] && typeof o[last] === 'object' && !Array.isArray(o[last])) mergeInto(o[last], v);
    else o[last] = clone(v);
}
function mergeInto(t, src) { for (const [k, v] of Object.entries(src)) setPath(t, k, v); }
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
let nextId = 0;
const rid = () => 'id' + String(++nextId).padStart(14, '0');
class Coll extends Map {
    find(f) { for (const v of this.values()) if (f(v)) return v; }
    filter(f) { return [...this.values()].filter(f); }
    some(f) { return [...this.values()].some(f); }
    map(f) { return [...this.values()].map(f); }
    [Symbol.iterator]() { return this.values(); }
    get contents() { return [...this.values()]; }
    get size() { return super.size; }
}
const expand = d => { const o = {}; for (const [k, v] of Object.entries(clone(d))) setPath(o, k, v); return o; };   // Foundry expands dotted keys on create
function makeItem(data, actor) {
    const src = expand(data);
    src._id ??= rid();
    const it = {
        get id() { return src._id; }, get name() { return src.name; }, get img() { return src.img; }, get type() { return src.type; },
        get sort() { return src.sort ?? 0; }, get flags() { return src.flags ?? {}; }, actor, _src: src,
        get system() {
            const s = src.system ?? {};
            const acts = new Coll();
            for (const [k, a] of Object.entries(s.activities ?? {})) acts.set(k, {...clone(a), id: k, toObject: () => ({...clone(a), _id: k}),
                actor, use: async () => { actor.used.push(k); }});
            const uses = s.uses ? {...s.uses, value: s.uses.max ? Number(s.uses.max) - (s.uses.spent ?? 0) : 0} : undefined;
            return {...s, activities: acts, uses};
        },
        async update(u) { for (const [k, v] of Object.entries(u)) setPath(src, k, v); return it; }
    };
    return it;
}
function makeNpc(name) {
    const a = {type: 'npc', name, id: 'npc0000000000001', used: [], flags: {}, items: new Coll(),
        _source: {system: {resources: {legact: {max: 0, spent: 0}, legres: {max: 0, spent: 0}}, attributes: {hd: {spent: 2}}}}};
    Object.defineProperty(a, 'system', {get() {
        const r = a._source.system.resources;
        return {resources: {legact: {...r.legact, value: r.legact.max - r.legact.spent}, legres: {...r.legres, value: r.legres.max - r.legres.spent}},
            attributes: {hd: {spent: a._source.system.attributes.hd.spent, max: 20, value: 20 - a._source.system.attributes.hd.spent}}};
    }});
    a.update = async u => { for (const [k, v] of Object.entries(u)) { if (k === 'flags' || k.startsWith('flags.')) setPath(a, k, v); else setPath(a._source, k, v); } return a; };
    a.createEmbeddedDocuments = async (t, list) => list.map(d => { const it = makeItem(d, a); a.items.set(it.id, it); return it; });
    return a;
}
globalThis.game = {combat: null, user: {isGM: true}, users: {activeGM: null}, settings: {get: () => null}};
globalThis.canvas = {scene: {id: 'scene1'}};
globalThis.ui = {notifications: {warn: m => { throw new Error('warn: ' + m); }, info: () => {}}};
globalThis.foundry = {utils: {deepClone: clone, getProperty: getPath, setProperty: setPath, randomID: rid}};
globalThis.Hooks = {on: () => {}};
const {npcLegendary} = await import('../scripts/court/statblock.mjs');
const MOD = 'nix-module';

// ---- Dracula NPC as the boss kit leaves it (same ids and shapes as install-dracula-boss.js)
const npc = makeNpc('Dracula (Boss)');
const act = (id, type, d) => ({_id: id, type, ...d});
const [la] = await npc.createEmbeddedDocuments('Item', [{name: 'Legendary Actions', type: 'feat', img: 'la.webp', sort: 100,
    system: {description: {value: '<p>Dracula can take 4 Legendary Actions.</p><ul><li><b>Seal (1).</b> A seal within 30 ft.</li><li><b>Strike (2).</b> One attack.</li>'
        + '<li><b>By the Throat (2).</b> A seal, then By the Throat.</li><li><b>Devour (2).</b> His bite.</li></ul><p><b>Regeneration.</b> 20 HP.</p>'},
        uses: {max: '4', spent: 1, recovery: [{period: 'turnStart', type: 'recoverAll'}]},
        activities: {
            nixLegendSeal000: act('nixLegendSeal000', 'utility', {name: 'Seal (1)', activation: {type: 'special', value: 1}, consumption: {targets: [{type: 'itemUses', target: '', value: '1'}]}, flags: {[MOD]: {boss: 'seal'}}}),
            nixLegendStrike0: act('nixLegendStrike0', 'utility', {name: 'Strike (2)', activation: {type: 'special', value: 2}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {boss: 'strike'}}}),
            nixLegendThroat0: act('nixLegendThroat0', 'utility', {name: 'By the Throat (2)', activation: {type: 'special', value: 2}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {boss: 'throat'}}}),
            nixLegendLair000: act('nixLegendLair000', 'utility', {name: 'Lair (toggle this scene)', activation: {type: 'special', value: null}, consumption: {targets: []}, flags: {[MOD]: {boss: 'lair'}}})
        }}, flags: {[MOD]: {legendary: true}}}]);
npc.flags[MOD] = {boss: {legendaryItem: la.id, legendaryBase: 4, legendaryLair: 5, lairScenes: []}};
const [lr] = await npc.createEmbeddedDocuments('Item', [{name: 'Legendary Resistance (Blood Price)', type: 'feat', system: {uses: {max: '3', spent: 1, recovery: []}}, flags: {[MOD]: {legendaryResistance: true}}}]);
const [myth] = await npc.createEmbeddedDocuments('Item', [{name: 'Infernal Ascension (Mythic)', type: 'feat', system: {activities: {
    nixMythicDeton00: act('nixMythicDeton00', 'utility', {name: 'Hellfire Detonation (2)', activation: {type: 'special', value: 2}, consumption: {targets: [{type: 'itemUses', target: la.id, value: '2'}]}, flags: {[MOD]: {boss: 'detonate'}}})}},
    flags: {[MOD]: {mythic: true}}}]);
const [conduit] = await npc.createEmbeddedDocuments('Item', [{name: 'Infernal Conduit', type: 'feat', img: 'conduit.webp', system: {uses: {max: '10', spent: 0}, activities: {
    harm0000000000000: act('harm0000000000000', 'save', {name: 'Devour (Vampire Bite)', activation: {type: 'bonus', value: 1}, consumption: {targets: [{type: 'itemUses', target: '', value: '@scaling'}]}}),
    nixDevourLegend0: act('nixDevourLegend0', 'save', {name: 'Devour (Legendary, 2)', activation: {type: 'legendary', value: 2},
        consumption: {targets: [{type: 'itemUses', target: '', value: '@scaling'}, {type: 'itemUses', target: la.id, value: '2'}]}, flags: {[MOD]: {boss: 'devourLegend'}}})}}}]);
const [tk] = await npc.createEmbeddedDocuments('Item', [{name: 'Dispater\'s Interdiction: Telekinetic Seal', type: 'feat', system: {activities: {
    push000000000000: act('push000000000000', 'save', {name: 'Push', activation: {type: 'reaction', value: 1}, consumption: {targets: [{type: 'itemUses', target: la.id, value: '1'}]}})}}}]);

const report = await npcLegendary(npc);
console.log(report.join('\n'));
const R = npc._source.system.resources;
assert.equal(R.legact.max, 4, 'legact max = legendaryBase');
assert.equal(R.legres.max, 3); assert.equal(R.legres.spent, 1, 'LR spent carried over');
assert.equal(lr._src.system.uses.max, ''); assert.equal(lr._src.system.identifier, 'legendary-resistance');
assert.deepEqual(Object.keys(la._src.system.activities), [], 'LA item keeps no activities');
assert.equal(la._src.system.identifier, 'legendary-actions');
assert.ok(!/<ul>/.test(la._src.system.description.value) && /Regeneration/.test(la._src.system.description.value), 'action list removed, rest kept');
const actionItem = kind => npc.items.find(i => i.flags[MOD]?.legendaryAction === kind);
for (const [id, name, cost] of [['nixLegendSeal000', 'Seal', 1], ['nixLegendStrike0', 'Strike', 2], ['nixLegendThroat0', 'By the Throat', 2]]) {
    const it = actionItem(id);
    assert.ok(it, name + ' item'); assert.equal(it.name, name);
    const a = it._src.system.activities[id];
    assert.deepEqual([a.activation.type, a.activation.value], ['legendary', cost], name + ' activation');
    assert.deepEqual(a.consumption.targets, [], name + ': native pips only');
    assert.equal(a.flags[MOD].boss, la._src.system.activities[id]?.flags?.[MOD]?.boss ?? a.flags[MOD].boss);
    assert.ok(it._src.system.description.value.length > 7, name + ' description');
}
const lairIt = actionItem('nixLegendLair000');
assert.equal(lairIt._src.system.activities.nixLegendLair000.activation.type, 'lair');
const det = myth._src.system.activities.nixMythicDeton00;
assert.equal(det.activation.type, 'mythic'); assert.deepEqual(det.consumption.targets, [{type: 'attribute', target: 'resources.legact.value', value: '2'}]);
const dv = conduit._src.system.activities.nixDevourLegend0;
assert.deepEqual(dv.consumption.targets, [{type: 'itemUses', target: '', value: '@scaling'}, {type: 'attribute', target: 'resources.legact.value', value: '2'}]);
assert.deepEqual(conduit._src.system.activities.harm0000000000000.consumption.targets, [{type: 'itemUses', target: '', value: '@scaling'}], 'bonus Devour untouched');
assert.deepEqual(tk._src.system.activities.push000000000000.consumption.targets, [{type: 'attribute', target: 'resources.legact.value', value: '1'}]);
const proxy = actionItem('proxy:' + conduit.id + '.nixDevourLegend0');
assert.ok(proxy, 'Devour button'); assert.equal(proxy.name, 'Devour');
assert.deepEqual(proxy._src.system.activities.nixLegendProxy0.flags[MOD].legendaryProxy, {item: conduit.id, activity: 'nixDevourLegend0'});
assert.match(proxy._src.system.description.value, /His bite/);

// ---- Re-apply: the kit puts its version back (activities, uses, itemUses on Telekinetic Seal), then the layout again.
const before = npc.items.size;
await la.update({'system.description.value': '<p>Dracula can take 4 Legendary Actions.</p><ul><li><b>Seal (1).</b> A seal within 30 ft.</li><li><b>Devour (2).</b> His bite.</li></ul>',
    'system.uses': {max: '4', spent: 0, recovery: [{period: 'turnStart', type: 'recoverAll'}]},
    'system.activities': {nixLegendSeal000: act('nixLegendSeal000', 'utility', {name: 'Seal (1)', activation: {type: 'special', value: 1}, consumption: {targets: [{type: 'itemUses', target: '', value: '1'}]}, flags: {[MOD]: {boss: 'seal'}}})}});
await tk.update({'system.activities.push000000000000.consumption.targets': [{type: 'attribute', target: 'resources.legact.value', value: '1'}, {type: 'itemUses', target: la.id, value: '1'}]});
await lr.update({'system.uses': {max: '3', spent: 0, recovery: []}});
await npcLegendary(npc);
assert.equal(npc.items.size, before, 'no duplicate items on re-apply');
assert.deepEqual(tk._src.system.activities.push000000000000.consumption.targets, [{type: 'attribute', target: 'resources.legact.value', value: '1'}], 'one pip target, not two');
assert.deepEqual(Object.keys(la._src.system.activities), []);

// ---- Lair: 5 pips in a lair scene.
npc.flags[MOD].boss.lairScenes = ['scene1'];
const {syncLegendaryMax, isNpcBoss} = await import('../scripts/court/boss.mjs');
assert.ok(isNpcBoss(npc));
await syncLegendaryMax(npc, {id: 'scene1'});
assert.equal(npc._source.system.resources.legact.max, 5);
await syncLegendaryMax(npc, {id: 'other'});
assert.equal(npc._source.system.resources.legact.max, 4);

// ---- Proxy button opens the real activity and cancels itself.
let preUse;
globalThis.Hooks = {on: (n, f) => { if (n === 'dnd5e.preUseActivity') preUse = f; }};
const {registerStatBlock} = await import('../scripts/court/statblock.mjs');
registerStatBlock();
const pAct = proxy.system.activities.get('nixLegendProxy0');
pAct.actor = npc;
assert.equal(preUse(pAct), false);
await new Promise(r => setTimeout(r, 5));
assert.deepEqual(npc.used, ['nixDevourLegend0']);

// ---- Blood Price NPC branch: run the kit's macro text with mocks.
import fs from 'node:fs';
const kit = fs.readFileSync(new URL('../automations/court-of-ravenloft/dracula/install-dracula-boss.js', import.meta.url), 'utf8');
const bpCode = kit.slice(kit.indexOf('const BLOOD_PRICE = `') + 21, kit.indexOf('\n`;', kit.indexOf('const BLOOD_PRICE = `')));
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
async function runBP(actor, pickFn) {
    const updates = [];
    let shown;
    const ctx = {
        trigger: {roll: {total: 10, options: {target: 18}, data: {}}, actor, config: {}, options: {}},
        socketUtils: {firstOwner: () => 'gm'}, actorUtils: {getFirstToken: () => null}, effectUtils: {getEffectByIdentifier: () => null},
        tokenUtils: {}, workflowUtils: {}, dialogUtils: {buttonDialog: async (t, c, b) => { shown = b; return pickFn(b); }},
        genericUtils: {update: async (doc, u) => { updates.push([doc === actor ? 'actor' : doc.name, u]); await doc.update(u); }},
        MidiQOL: {Workflow: {getWorkflow: () => null}, addRollTo: (r, x) => ({total: r.total + x.total})},
        Roll: class { constructor(f) { this.f = f; } async evaluate() { this.total = /d/.test(this.f) ? 5 : Number(this.f); return this; } },
        ChatMessage: {create: async () => {}, getSpeaker: () => ({})}, fromUuidSync: () => null, setTimeout: () => {}
    };
    const fn = new AsyncFn(...Object.keys(ctx), bpCode);
    const out = await fn(...Object.values(ctx));
    return {out, updates, shown};
}
const [cls] = await npc.createEmbeddedDocuments('Item', [{name: 'Illrigger', type: 'class', system: {levels: 20, hd: {denomination: 'd10', spent: 20}}}]);
let r = await runBP(npc, b => b.find(x => x[1] === 'price')[1]);
assert.match(r.shown[0][0], /\+1d10 \(18 left\)/, 'NPC Hit Dice from the actor, die from the class');
assert.deepEqual(r.updates, [['actor', {'system.attributes.hd.spent': 3}]]);
assert.equal(r.out.total, 15);
r = await runBP(npc, b => b.find(x => /^legend/.test(x[1]))[1]);
assert.match(r.shown[1][0], /Legendary Resistance \(3 left\)/);
assert.deepEqual(r.updates, [['actor', {'system.resources.legres.spent': 1}]]);
assert.equal(r.out.total, 18);
// Character path unchanged: class item Hit Dice and item uses.
const pc = makeNpc('Dracula (character)'); pc.type = 'character';
const [pcls] = await pc.createEmbeddedDocuments('Item', [{name: 'Illrigger', type: 'class', system: {levels: 20, hd: {denomination: 'd10', spent: 4}}}]);
const [plr] = await pc.createEmbeddedDocuments('Item', [{name: 'LR', type: 'feat', system: {uses: {max: '3', spent: 0}}, flags: {[MOD]: {legendaryResistance: true}}}]);
r = await runBP(pc, b => b.find(x => x[1] === 'price')[1]);
assert.equal(r.shown[0][0], 'Blood Price: spend a Hit Die, +1d10');
assert.deepEqual(r.updates, [['Illrigger', {'system.hd.spent': 5}]]);
r = await runBP(pc, b => b.find(x => /^legend/.test(x[1]))[1]);
assert.deepEqual(r.updates, [['LR', {'system.uses.spent': 1}]]);
console.log('statblock.test: all checks passed');
