// node dev/statblock-captain.test.mjs : a captain's NPC stat block (Father Octavian, Zadimus; 1.7.1)
// gets no Legendary Actions or Legendary Resistance (mock setup copied from statblock.test.mjs).
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

// A captain NPC as Make stat block leaves it: court flag, no boss flags, no Legendary items.
const z = makeNpc('Zadimus');
z.flags = {[MOD]: {court: {key: 'zadimus', captain: true}, illrigger: {range: 30}}};
await z.createEmbeddedDocuments('Item', [{name: 'Baleful Interdict', type: 'feat', system: {uses: {max: '5', spent: 0}, activities: {a1: {type: 'utility', name: 'Place Seal', activation: {type: 'bonus'}}}}}]);
const out = await npcLegendary(z);
assert.equal(z._source.system.resources.legact.max, 0, 'no Legendary Action pips');
assert.equal(z._source.system.resources.legres.max, 0, 'no Legendary Resistance pips');
assert.match(out[0], /no Legendary Actions or Legendary Resistance \(captain\)/);
assert.equal(z.items.size, 1, 'no items added');
// Stray pips (e.g. 1.7.0 gave every NPC 3) are cleared.
z._source.system.resources.legact.max = 3;
await npcLegendary(z);
assert.equal(z._source.system.resources.legact.max, 0);
console.log('statblock-captain: ok');
