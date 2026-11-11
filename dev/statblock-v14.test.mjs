// node dev/statblock-v14.test.mjs : npcLegendary on the v14 engine (CAT present, no Chris's Premades 1):
// keys are deleted with Foundry 14's _del (ForcedDeletion), not "-="; created items get expanded data.
import assert from 'node:assert/strict';
const clone = o => o === undefined ? o : JSON.parse(JSON.stringify(o));
const DEL = {forcedDeletion: true};
globalThis._del = DEL;
let sawDash = false, sawDel = 0;
function setPath(obj, path, v) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = (o[parts[i]] ??= {});
    const last = parts.at(-1);
    if (last.startsWith('-=')) { sawDash = true; delete o[last.slice(2)]; return; }
    if (v === DEL) { sawDel++; delete o[last]; return; }
    o[last] = clone(v);
}
class Coll extends Map {
    find(f) { for (const v of this.values()) if (f(v)) return v; }
    filter(f) { return [...this.values()].filter(f); }
    some(f) { return [...this.values()].some(f); }
    map(f) { return [...this.values()].map(f); }
    [Symbol.iterator]() { return this.values(); }
    get contents() { return [...this.values()]; }
}
let n = 0;
const rid = () => 'id' + String(++n).padStart(14, '0');
let expandedCreate = true;
function makeItem(src, actor) {
    src._id ??= rid();
    if (Object.keys(src).some(k => k.includes('.'))) expandedCreate = false;
    const it = {get id() { return src._id; }, get name() { return src.name; }, get img() { return src.img; }, get sort() { return src.sort ?? 0; },
        get flags() { return src.flags ?? {}; }, actor, _src: src,
        get system() {
            const s = src.system ?? {};
            const acts = new Coll();
            for (const [k, a] of Object.entries(s.activities ?? {})) acts.set(k, {...clone(a), id: k, toObject: () => ({...clone(a), _id: k})});
            return {...s, activities: acts, uses: s.uses ? {...s.uses, value: Number(s.uses.max || 0) - (s.uses.spent ?? 0)} : undefined};
        },
        async update(u) { for (const [k, v] of Object.entries(u)) setPath(src, k, v); return it; }};
    return it;
}
const npc = {type: 'npc', name: 'Sydmore', flags: {}, items: new Coll(), _source: {system: {resources: {legact: {max: 0, spent: 0}, legres: {max: 0, spent: 0}}}}};
Object.defineProperty(npc, 'system', {get() { const r = npc._source.system.resources; return {resources: {legact: {...r.legact, value: r.legact.max - r.legact.spent}, legres: {...r.legres, value: r.legres.max - r.legres.spent}}}; }});
npc.update = async u => { for (const [k, v] of Object.entries(u)) setPath(k.startsWith('flags') ? npc : npc._source, k, v); return npc; };
npc.createEmbeddedDocuments = async (t, list) => list.map(d => { const it = makeItem(clone(d), npc); npc.items.set(it.id, it); return it; });
globalThis.game = {combat: null, user: {isGM: true}, users: {activeGM: null}, settings: {get: () => null}};
globalThis.canvas = {scene: {id: 's'}};
globalThis.ui = {notifications: {warn: () => {}, info: () => {}}};
globalThis.foundry = {utils: {deepClone: clone, setProperty: setPath, randomID: rid,
    expandObject: d => { const o = {}; for (const [k, v] of Object.entries(d)) setPath(o, k, v); return o; }}};
globalThis.Hooks = {on: () => {}};
globalThis.cat = {utils: {}};                // v14 engine
const {npcLegendary} = await import('../scripts/court/statblock.mjs');
const MOD = 'nix-module';
const act = (id, d) => ({_id: id, type: 'utility', ...d});
const [la] = await npc.createEmbeddedDocuments('Item', [{name: 'Legendary Actions', type: 'feat', img: 'la.webp', system: {
    description: {value: '<p>3 Legendary Actions.</p><ul><li><b>Seal (1).</b> A seal.</li><li><b>Foul Interchange (2).</b> Pass it on.</li></ul>'},
    uses: {max: '3', spent: 0}, activities: {
        nixLegendSeal000: act('nixLegendSeal000', {name: 'Seal (1)', activation: {type: 'special', value: 1}, consumption: {targets: [{type: 'itemUses', target: '', value: '1'}]}, flags: {[MOD]: {boss: 'seal'}}}),
        nixLegendFoul000: act('nixLegendFoul000', {name: 'Foul Interchange (2)', activation: {type: 'special', value: 2}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {court: 'interchange'}}})}},
    flags: {[MOD]: {legendary: true}}}]);
npc.flags[MOD] = {boss: {legendaryItem: la.id, legendaryBase: 3, legendaryLair: 3, lairScenes: []}};
await npc.createEmbeddedDocuments('Item', [{name: 'Legendary Resistance (Blood Price)', type: 'feat', system: {uses: {max: '3', spent: 0}}, flags: {[MOD]: {legendaryResistance: true}}}]);
const report = await npcLegendary(npc);
assert.ok(!sawDash, 'no "-=" key on v14');
assert.ok(sawDel >= 2, 'activities removed with _del');
assert.deepEqual(Object.keys(la._src.system.activities), []);
assert.ok(expandedCreate, 'created items get expanded data on v14');
const foul = npc.items.find(i => i.flags?.[MOD]?.legendaryAction === 'nixLegendFoul000');
assert.equal(foul.name, 'Foul Interchange');
assert.deepEqual([foul._src.system.activities.nixLegendFoul000.activation.type, foul._src.system.activities.nixLegendFoul000.activation.value], ['legendary', 2]);
assert.equal(npc._source.system.resources.legres.max, 3);
assert.equal(npc._source.system.resources.legact.max, 3);
console.log(report.join('\n'));
console.log('statblock v14 test: all checks passed');
