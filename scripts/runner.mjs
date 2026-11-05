// =====================================================================
//  NIX FIX: runner
//  Loads an automation file from the module folder and applies it to the
//  right actor(s). The installers are the exact table-tested scripts; the
//  runner only hands each one "this character is selected" without anyone
//  having to select a token.
//
//  Two engines:
//    cpr1  Foundry v13 / Chris's Premades 1: the v13 files, CPR1 embedded macros.
//    cat   Foundry v14 / Chris's Premades 2 + CAT: the entry's `v14` file, CAT
//          embedded macros ({name, event, pass, macros: [{macro, priority}]}).
//          Entries without a v14 copy are reported as "not ported"; entries with
//          v14.retired as "retired" (Chris's Premades 2 does it).
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';
import {CHARACTERS, ENTRIES} from './registry.mjs';
import {detectEngine} from './compat.mjs';
 
const cache = new Map();
 
// Fast, dependency-free string hash (works on plain-http servers where crypto.subtle doesn't).
export function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
 
// ---------------------------------------------------------------- engines
// Retired on this engine (Chris's Premades 2 does it)?
export const isRetired = (entry, engine = detectEngine()) => engine.id === 'cat' && !!entry.v14?.retired;
// Is this entry available on this engine?
export const isPorted = (entry, engine = detectEngine()) => engine.id !== 'cat' || (!!entry.v14?.file && !entry.v14?.retired);
// Which file this entry runs on this engine.
export const fileFor = (entry, engine = detectEngine()) => engine.id === 'cat' ? entry.v14?.file : entry.file;
 
export async function loadCode(entry, engine = detectEngine()) {
    const file = fileFor(entry, engine);
    if (!file) throw new Error(entry.title + (isRetired(entry, engine) ? ' is retired on v14.' : ' is not ported to v14 yet.'));
    const key = entry.id + '@' + file;
    if (cache.has(key)) return cache.get(key);
    const version = game.modules.get(MODULE_ID).version;
    const url = foundry.utils.getRoute('modules/' + MODULE_ID + '/automations/' + file) + '?v=' + version;
    const res = await fetch(url, {cache: 'no-cache'});
    if (!res.ok) throw new Error('Could not load ' + file + ' (' + res.status + ')');
    const code = await res.text();
    const out = {code, hash: hash(code)};
    cache.set(key, out);
    return out;
}
 
// ---------------------------------------------------------------- bindings
export const getBindings = () => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'bindings') ?? {});
export const getApplied = () => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'applied') ?? {});
 
const DUPLICATE = /\((old|copy|updated|backup|test)[^)]*\)|\bcopy\b/i;
// Actors that could be this character, best match first.
export function candidates(charKey) {
    const ch = CHARACTERS[charKey];
    if (!ch) return [];
    const scored = [];
    for (const a of game.actors) {
        const i = ch.match.findIndex(r => r.test(a.name.trim()));
        if (i < 0) continue;
        let score = i * 10 + (DUPLICATE.test(a.name) ? 100 : 0) + (a.type === 'character' ? 0 : 5) + (a.hasPlayerOwner ? 0 : 3);
        if (a.name.trim().toLowerCase() === ch.name.toLowerCase()) score -= 5;
        scored.push({a, score});
    }
    return scored.sort((x, y) => x.score - y.score).map(x => x.a);
}
 
// The actor bound to a character in this world (saved choice, else the best clear match).
export function actorFor(charKey) {
    const saved = getBindings()[charKey];
    if (saved) {
        const a = fromUuidSync(saved);
        if (a) return {actor: a, how: 'chosen'};
    }
    const list = candidates(charKey);
    if (!list.length) return {actor: null, how: 'none'};
    const clean = list.filter(a => !DUPLICATE.test(a.name));
    if (clean.length === 1) return {actor: clean[0], how: 'auto'};
    return {actor: null, how: 'ambiguous', options: list};
}
 
export async function bind(charKey, actorUuid) {
    const b = getBindings();
    if (actorUuid) b[charKey] = actorUuid; else delete b[charKey];
    await game.settings.set(MODULE_ID, 'bindings', b);
}
 
// ---------------------------------------------------------------- running
// A stand-in for `canvas` in which canvas.tokens.controlled is the given tokens.
function canvasWith(controlled) {
    const real = globalThis.canvas;
    const realTokens = real?.tokens;
    const tokens = realTokens
        ? new Proxy(realTokens, {get(t, p) {
            if (p === 'controlled') return controlled;
            const v = Reflect.get(t, p, t);
            return typeof v === 'function' ? v.bind(t) : v;
        }})
        : {controlled, placeables: [], get: () => null};
    if (!real) return {tokens, ready: false, scene: null};
    return new Proxy(real, {get(t, p) {
        if (p === 'tokens') return tokens;
        const v = Reflect.get(t, p, t);
        return typeof v === 'function' ? v.bind(t) : v;
    }});
}
 
// What the installer sees as "the selected token" for an actor: the real token on
// the current scene if there is one, otherwise a minimal stand-in carrying the actor.
function tokenFor(actor) {
    const placed = globalThis.canvas?.tokens?.placeables?.find(t => t.actor?.id === actor.id && (t.document.actorLink || t.actor === actor));
    return placed ?? {actor, document: actor.prototypeToken, name: actor.name, id: null, isStandIn: true};
}
 
async function execute(code, actors) {
    const AsyncFn = foundry.utils.AsyncFunction ?? Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFn('canvas', code);
    return fn(canvasWith(actors.map(tokenFor)));
}
 
// ---- Embedded macros the module writes itself (instead of pasting in the Medkit)
const baseName = n => n.toLowerCase().replace(/^metamagic\s*[:\-–]\s*/, '').trim();
const has = (code, marker) => !!marker && String(code ?? '').includes(marker);
 
async function installEmbedded(entry, actor, code, engine) {
    const t = entry.target;
    const items = actor.items.filter(i => t.item.test(baseName(i.name)) || t.item.test(i.name.trim()));
    if (!items.length) return {ok: false, msg: actor.name + ': no item matching ' + t.item + '.'};
    const notes = [];
    let done = 0;
    for (const item of items) {
        const r = engine.id === 'cat'
            ? await writeCat(entry, item, code)
            : await writeCpr1(entry, item, code);
        notes.push(...r.notes);
        if (r.ok) done++;
    }
    if (done) await ChatMessage.create({whisper: [game.user.id],
        content: '<b>' + TITLE + ': ' + entry.title + ' on ' + actor.name + (engine.id === 'cat' ? ' (v14)' : '') + '</b><ul><li>' + notes.join('</li><li>') + '</li></ul>'});
    return {ok: done > 0, msg: notes.join(' ')};
}
 
// v13: flags.chris-premades.embeddedMacros (item) / embeddedActivityMacros[activityId].
async function writeCpr1(entry, item, code) {
    const t = entry.target;
    const notes = [];
    const strip = list => (list ?? []).filter(m => m.name !== t.name && !has(m.macro, t.marker));
    const entryData = {name: t.name, type: t.type, pass: t.pass, priority: t.priority, macro: code};
    if (t.activity) {
        const act = item.system.activities?.find(a => t.activity.test(a.name ?? ''));
        if (!act) return {ok: false, notes: [item.name + ': no activity matching ' + t.activity + ' (add it on the Activities tab, then apply again).']};
        const all = item.flags?.['chris-premades']?.embeddedActivityMacros ?? {};
        await item.setFlag('chris-premades', 'embeddedActivityMacros.' + act.id, strip(all[act.id]).concat([entryData]));
        const itemLevel = item.flags?.['chris-premades']?.embeddedMacros ?? [];
        if (strip(itemLevel).length !== itemLevel.length) await item.setFlag('chris-premades', 'embeddedMacros', strip(itemLevel));
        notes.push(item.name + ' > ' + act.name + ': installed.');
    } else {
        const list = item.flags?.['chris-premades']?.embeddedMacros ?? [];
        await item.setFlag('chris-premades', 'embeddedMacros', strip(list).concat([entryData]));
        notes.push(item.name + ': installed.');
        if (t.needsActivity && !item.system.activities?.some(a => t.needsActivity.test(a.name ?? ''))) {
            notes.push(item.name + ': needs a Utility activity matching ' + t.needsActivity + ' (Uses 1, Dawn) to track its daily use.');
        }
    }
    return {ok: true, notes};
}
 
// v14: item.flags.cat.embeddedMacros, or activity.flags.cat.embeddedMacros for activity
// targets (V14-MAPPING sections 1 and 8). Stored shape {name, event, pass, macros: [...]}.
// Also removes the inert v13 copy (flags.chris-premades) of the same macro.
async function writeCat(entry, item, code) {
    const t = {...entry.target, ...(entry.v14?.target ?? {})};
    if (!t.event || !t.pass) return {ok: false, notes: [entry.title + ': no v14 event/pass in the registry.']};
    const notes = [];
    const catEntry = {name: t.name, event: t.event, pass: t.pass, macros: [{macro: code, priority: t.priority ?? 50}]};
    const stripCat = list => foundry.utils.deepClone(list ?? []).filter(m => m.name !== t.name
        && !(m.macros ?? []).some(x => has(x.macro, t.marker)) && !has(m.macro, t.marker));
    const stripOld = list => (list ?? []).filter(m => m.name !== t.name && !has(m.macro, t.marker));
    const oldItem = item.flags?.['chris-premades']?.embeddedMacros ?? [];
    const updates = {};
 
    if (t.activity) {
        const act = item.system.activities?.find(a => t.activity.test(a.name ?? ''));
        if (!act) return {ok: false, notes: [item.name + ': no activity matching ' + t.activity + ' (add it on the Activities tab, then apply again).']};
        await act.update({'flags.cat.embeddedMacros': stripCat(act.flags?.cat?.embeddedMacros).concat([catEntry])});
        // Copies at item level by mistake, and the v13 activity copy.
        const itemCat = item.flags?.cat?.embeddedMacros ?? [];
        if (stripCat(itemCat).length !== itemCat.length) updates['flags.cat.embeddedMacros'] = stripCat(itemCat);
        const oldAct = item.flags?.['chris-premades']?.embeddedActivityMacros?.[act.id];
        if (oldAct && stripOld(oldAct).length !== oldAct.length) updates['flags.chris-premades.embeddedActivityMacros.' + act.id] = stripOld(oldAct);
        notes.push(item.name + ' > ' + act.name + ': installed (' + t.event + ' / ' + t.pass + ').');
    } else {
        updates['flags.cat.embeddedMacros'] = stripCat(item.flags?.cat?.embeddedMacros).concat([catEntry]);
        notes.push(item.name + ': installed (' + t.event + ' / ' + t.pass + ').');
        if (t.needsActivity && !item.system.activities?.some(a => t.needsActivity.test(a.name ?? ''))) {
            notes.push(item.name + ': needs a Utility activity matching ' + t.needsActivity + ' (Uses 1, Dawn) to track its daily use.');
        }
    }
    if (stripOld(oldItem).length !== oldItem.length) {
        updates['flags.chris-premades.embeddedMacros'] = stripOld(oldItem);
        notes.push(item.name + ': removed the v13 copy (it never runs on v14).');
    }
    if (Object.keys(updates).length) await item.update(updates);
    return {ok: true, notes};
}
 
// Apply one entry. Returns {ok, msg}. Records what was applied so updates can be spotted.
export async function runEntry(entry, {silent = false} = {}) {
    if (typeof entry === 'string') entry = ENTRIES.find(e => e.id === entry);
    if (!entry) return {ok: false, msg: 'Unknown automation.'};
    if (!game.user.isGM) return {ok: false, msg: 'Only the GM can apply automations.'};
    const engine = detectEngine();
    if (!engine.ok && entry.kind !== 'tool') {
        if (!silent) ui.notifications.error(TITLE + ': ' + engine.why, {permanent: true});
        return {ok: false, msg: engine.why};
    }
    if (isRetired(entry, engine)) return {ok: false, msg: entry.title + ' is retired on v14: ' + entry.v14.retired};
    if (!isPorted(entry, engine)) return {ok: false, msg: entry.title + ' is not ported to v14 yet, so it was not applied.'};
    let code, h;
    try { ({code, hash: h} = await loadCode(entry, engine)); }
    catch (err) { return {ok: false, msg: err.message}; }
 
    // Who it runs on.
    const actors = [];
    for (const key of entry.actors ?? []) {
        const {actor, how} = actorFor(key);
        if (actor) actors.push(actor);
        else if (!entry.allAtOnce) return {ok: false, msg: 'Pick the actor for ' + (CHARACTERS[key]?.name ?? key) + ' first (' + how + ').'};
    }
    if (entry.actors?.length && !actors.length) return {ok: false, msg: 'None of its characters are in this world.'};
 
    let extra = '';
    try {
        if (entry.kind === 'embedded') {
            const r = await installEmbedded(entry, actors[0], code, engine);
            if (!r.ok) return r;
            extra = ' ' + r.msg;
        } else if (entry.allAtOnce || !entry.actors?.length) {
            await execute(code, actors);
        } else {
            for (const actor of actors) await execute(code, [actor]);
        }
    } catch (err) {
        console.error(TITLE + ' | ' + entry.id + ' failed', err);
        return {ok: false, msg: entry.title + ' failed: ' + err.message};
    }
    if (entry.kind !== 'tool') {
        const applied = getApplied();
        applied[entry.id] = {hash: h, version: game.modules.get(MODULE_ID).version, at: Date.now(), engine: engine.id,
            actors: actors.map(a => a.uuid), generation: game.release?.generation};
        await game.settings.set(MODULE_ID, 'applied', applied);
    }
    return {ok: true, msg: entry.title + ' applied' + (actors.length ? ' to ' + actors.map(a => a.name).join(', ') : '') + '.' + extra};
}
 
// Status of an entry in this world.
export async function statusOf(entry) {
    const engine = detectEngine();
    if (isRetired(entry, engine)) return {state: 'retired', why: entry.v14.retired};
    if (!isPorted(entry, engine)) return {state: 'not-ported'};
    const rec = getApplied()[entry.id];
    let current;
    try { current = (await loadCode(entry, engine)).hash; } catch { return {state: 'missing-file'}; }
    if (!rec) return {state: 'never'};
    // A world copied from v13 carries v13 records: those must be re-applied with the v14 files.
    if ((rec.engine ?? 'cpr1') !== engine.id) return {state: 'outdated', rec, why: 'last applied with the ' + ((rec.engine ?? 'cpr1') === 'cat' ? 'v14' : 'v13') + ' engine'};
    if (rec.hash !== current) return {state: 'outdated', rec};
    const actorsChanged = (entry.actors ?? []).some(k => {
        const a = actorFor(k).actor;
        return a && !rec.actors?.includes(a.uuid);
    });
    if (actorsChanged) return {state: 'outdated', rec, why: 'a different actor is bound now'};
    return {state: 'current', rec};
}
 