// =====================================================================
//  NIX FIX: revert
//  While an automation is applied, every change the GM's client makes is
//  recorded: the fields it wrote (with their old values), the documents it
//  created, the documents it deleted (as they were before), and world
//  settings it changed. "Revert" puts exactly those back, so play since then
//  (HP, used slots, new items) is kept.
//
//  Only the last apply of each automation can be reverted. If a later apply
//  changed the same things, it is reverted too (newest first), otherwise the
//  older revert would wipe out its changes.
//
//  The recordings are JSON files in worlds/<world>/nix-fix-undo/ (kept out of
//  the world database so players don't download them on login); the world
//  setting `undo` only holds a small index.
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';

const TYPES = ['Actor', 'Item', 'ActiveEffect', 'Macro', 'Folder', 'JournalEntry', 'JournalEntryPage', 'RollTable', 'TableResult',
    'Scene', 'Region', 'RegionBehavior', 'Token', 'Tile', 'AmbientLight', 'AmbientSound', 'MeasuredTemplate', 'Drawing', 'Note', 'Wall'];

const clone = v => foundry.utils.deepClone(v);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const embeddedKeys = doc => Object.values(doc?.constructor?.metadata?.embedded ?? {})
    .filter(k => doc[k] instanceof foundry.utils.Collection);
const skipSetting = key => !key || key.startsWith(MODULE_ID + '.');
const related = (x, y) => x === y || x.startsWith(y + '.') || y.startsWith(x + '.');

// ---------------------------------------------------------------- pure helpers
// Paths an update changed, e.g. {flags: {cat: {embeddedMacros: [...]}}} -> ['flags.cat.embeddedMacros'].
// "-=key" (delete) and "==key" (replace) stop at that key; recursive:false replaces top-level keys whole.
export function changedPaths(changes, recursive = true, skip = []) {
    const out = [];
    const walk = (obj, pre) => {
        for (const [k, v] of Object.entries(obj ?? {})) {
            if (!pre && (k === '_id' || k === '_stats' || skip.includes(k))) continue;
            let forced = false;
            const path = k.split('.').map(s => (s.startsWith('-=') || s.startsWith('==')) ? (forced = true, s.slice(2)) : s).join('.');
            const p = pre ? pre + '.' + path : path;
            if (!forced && recursive && isObj(v) && Object.keys(v).length) walk(v, p);
            else out.push(p);
        }
    };
    walk(changes, '');
    return out;
}

const hasProp = (obj, path) => {
    let o = obj;
    for (const s of path.split('.')) {
        if (!isObj(o) && !Array.isArray(o)) return false;
        if (!Object.prototype.hasOwnProperty.call(o, s)) return false;
        o = o[s];
    }
    return true;
};

// For one document: the old values of the changed paths, from its source before the run.
// A path that didn't exist is widened to its highest missing ancestor (a whole new
// activity is one record, not one per field); paths under another recorded path are dropped.
export function recordPaths(src, paths) {
    const norm = paths.map(p => {
        const segs = p.split('.');
        for (let i = 1; i <= segs.length; i++) {
            const q = segs.slice(0, i).join('.');
            if (!hasProp(src, q)) return q;
        }
        return p;
    });
    const uniq = [...new Set(norm)].sort((a, b) => a.length - b.length);
    const kept = uniq.filter((p, i) => !uniq.slice(0, i).some(q => p.startsWith(q + '.')));
    return kept.map(p => hasProp(src, p) ? {path: p, old: clone(foundry.utils.getProperty(src, p))} : {path: p, absent: true});
}

// The update that puts recorded paths back on a document whose source is now `cur`.
export function restoreUpdate(cur, paths) {
    const upd = {};
    const addDeletions = (want, now) => {
        if (!isObj(now)) return;
        for (const k of Object.keys(now)) {
            if (!(k in want)) want['-=' + k] = null;
            else if (isObj(want[k]) && isObj(now[k])) addDeletions(want[k], now[k]);
        }
    };
    for (const p of paths) {
        if (p.absent) {
            if (!hasProp(cur, p.path)) continue;
            const i = p.path.lastIndexOf('.');
            foundry.utils.setProperty(upd, i < 0 ? '-=' + p.path : p.path.slice(0, i) + '.-=' + p.path.slice(i + 1), null);
        } else {
            const val = clone(p.old);
            if (isObj(val)) addDeletions(val, foundry.utils.getProperty(cur, p.path));
            foundry.utils.setProperty(upd, p.path, val);
        }
    }
    return upd;
}

// Did two recordings touch the same things?
export function overlaps(a, b) {
    const docs = t => [...t.records.map(r => r[0]), ...t.created, ...t.deleted];
    for (const x of [...a.created, ...a.deleted]) if (docs(b).some(y => related(x, y))) return true;
    for (const x of [...b.created, ...b.deleted]) if (docs(a).some(y => related(x, y))) return true;
    for (const [u, ps] of a.records) {
        const o = b.records.find(r => r[0] === u);
        if (o && ps.some(p => o[1].some(q => related(p, q)))) return true;
    }
    return a.settings.some(k => b.settings.includes(k));
}

// ---------------------------------------------------------------- recording
export function startRecording() {
    const me = game.user.id;
    const base = new Map();      // uuid -> source before the run (first time we see it)
    const meta = new Map();      // uuid -> {documentName, parentUuid, name}
    const changed = new Map();   // uuid -> Set of paths
    let created = [];            // uuids, in order
    const deleted = [];          // {uuid, documentName, parentUuid, name, data}
    const settings = new Map();  // key -> old stored value (JSON string), or null if it didn't exist
    const hooks = [];
    const on = (name, fn) => hooks.push([name, Hooks.on(name, fn)]);
    const isCreated = uuid => created.some(c => related(uuid, c) && uuid.length >= c.length);
    const isDeleted = uuid => deleted.some(d => uuid === d.uuid || uuid.startsWith(d.uuid + '.'));

    // A document and its parents (not the Scene, unless it's the Scene itself).
    const chain = doc => {
        const out = [];
        for (let d = doc; d; d = d.parent) {
            if (d !== doc && d.documentName === 'Scene') break;
            out.push(d);
        }
        return out;
    };
    const ensureBase = doc => {
        for (const d of chain(doc)) {
            if (!d.id || base.has(d.uuid)) continue;
            const src = clone(d._source);
            if (d.documentName === 'Scene') for (const k of embeddedKeys(d)) delete src[k];
            base.set(d.uuid, src);
            meta.set(d.uuid, {documentName: d.documentName, parentUuid: d.parent?.uuid ?? null, name: d.name ?? d.label ?? d.documentName});
        }
    };

    for (const T of TYPES) {
        on('preCreate' + T, (doc, data, options, userId) => { if (userId === me) ensureBase(doc); });
        on('create' + T, (doc, options, userId) => { if (userId === me && !isCreated(doc.uuid)) created.push(doc.uuid); });
        on('preUpdate' + T, (doc, changes, options, userId) => { if (userId === me) ensureBase(doc); });
        on('update' + T, (doc, changes, options, userId) => {
            if (userId !== me || isCreated(doc.uuid)) return;
            const set = changed.get(doc.uuid) ?? new Set();
            for (const p of changedPaths(changes, options?.recursive !== false, embeddedKeys(doc))) set.add(p);
            changed.set(doc.uuid, set);
        });
        on('preDelete' + T, (doc, options, userId) => {
            if (userId !== me) return;
            if (isCreated(doc.uuid)) { created = created.filter(c => !related(c, doc.uuid) || c.length < doc.uuid.length); return; }
            ensureBase(doc);
            if (isDeleted(doc.uuid)) return;
            deleted.push({uuid: doc.uuid, ...meta.get(doc.uuid), data: clone(base.get(doc.uuid))});
        });
    }
    on('preCreateSetting', (doc, data, options, userId) => {
        const key = doc.key ?? data?.key;
        if (userId === me && !skipSetting(key) && !settings.has(key)) settings.set(key, null);
    });
    on('preUpdateSetting', (doc, changes, options, userId) => {
        if (userId === me && !skipSetting(doc.key) && !settings.has(doc.key)) settings.set(doc.key, doc._source.value);
    });

    return {
        async stop() {
            await new Promise(r => setTimeout(r, 300));   // let trailing updates land
            for (const [n, id] of hooks) Hooks.off(n, id);
            const records = [];
            for (const [uuid, set] of changed) {
                if (isCreated(uuid) || isDeleted(uuid) || !base.has(uuid)) continue;
                const paths = recordPaths(base.get(uuid), [...set]);
                if (paths.length) records.push({uuid, ...meta.get(uuid), paths});
            }
            return {records, created: [...created], deleted, settings: [...settings]};
        }
    };
}

export const hasChanges = u => !!u && !!(u.records.length || u.created.length || u.deleted.length || u.settings.length);

// ---------------------------------------------------------------- storage
export const undoIndex = () => clone(game.settings.get(MODULE_ID, 'undo') ?? {});
const dir = () => 'worlds/' + game.world.id + '/nix-fix-undo';
const FP = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

async function writeFile(name, obj) {
    const picker = FP();
    try { await picker.createDirectory('data', dir(), {}); } catch { /* already there */ }
    const file = new File([JSON.stringify(obj)], name, {type: 'application/json'});
    const res = await picker.upload('data', dir(), file, {}, {notify: false});
    if (!res || res.status === 'error' || !res.path) throw new Error(res?.message ?? 'upload refused');
    return res.path;
}

async function readUndo(rec) {
    if (rec.inline) return rec.inline;
    const res = await fetch(foundry.utils.getRoute(rec.path) + '?t=' + Date.now(), {cache: 'no-store'});
    if (!res.ok) throw new Error('could not read ' + rec.path + ' (' + res.status + ')');
    return res.json();
}

export async function saveUndo(entry, u, prevApplied, failed = false) {
    const at = Date.now();
    const version = game.modules.get(MODULE_ID).version;
    const payload = {entry: entry.id, title: entry.title, at, version, prevApplied: prevApplied ?? null, ...u};
    let path = null, inline = null;
    try { path = await writeFile(entry.id + '.json', payload); }
    catch (err) { console.warn(TITLE + ' | could not write the revert file, keeping it in the world settings', err); inline = payload; }
    const idx = undoIndex();
    idx[entry.id] = {at, title: entry.title, version, path, inline, failed,
        touched: {records: u.records.map(r => [r.uuid, r.paths.map(p => p.path)]), created: u.created,
            deleted: u.deleted.map(d => d.uuid), settings: u.settings.map(([k]) => k)},
        counts: {changed: u.records.length, added: u.created.length, removed: u.deleted.length, settings: u.settings.length}};
    await game.settings.set(MODULE_ID, 'undo', idx);
}

// ---------------------------------------------------------------- reverting
async function get(uuid) { try { return await fromUuid(uuid); } catch { return null; } }

async function applyUndo(u) {
    const notes = [];
    for (const uuid of [...u.created].reverse()) {
        const d = await get(uuid);
        if (d) { await d.delete(); notes.push('Removed ' + (d.name ?? d.documentName) + (d.parent?.name ? ' from ' + d.parent.name : '') + '.'); }
    }
    for (const d of u.deleted) {
        if (await get(d.uuid)) continue;
        const parent = d.parentUuid ? await get(d.parentUuid) : null;
        if (d.parentUuid && !parent) { notes.push('Could not bring back ' + d.name + ': what it belonged to is gone.'); continue; }
        await getDocumentClass(d.documentName).create(d.data, {parent, keepId: true});
        notes.push('Brought back ' + d.name + (parent?.name ? ' on ' + parent.name : '') + '.');
    }
    for (const r of u.records) {
        const doc = await get(r.uuid);
        if (!doc) { notes.push(r.name + ' no longer exists; skipped.'); continue; }
        const upd = restoreUpdate(doc._source, r.paths);
        if (Object.keys(upd).length) { await doc.update(upd); notes.push('Put back ' + (doc.name ?? r.name) + (doc.parent?.name ? ' (' + doc.parent.name + ')' : '') + '.'); }
    }
    const store = game.settings.storage.get('world');
    const settingDoc = key => (store?.getSetting?.(key)) ?? store?.find?.(s => s.key === key);
    for (const [key, old] of u.settings) {
        const doc = settingDoc(key);
        if (old === null) { if (doc) await doc.delete(); }
        else {
            const i = key.indexOf('.');
            try {
                if (game.settings.settings.has(key)) await game.settings.set(key.slice(0, i), key.slice(i + 1), JSON.parse(old));
                else if (doc) await doc.update({value: old});
            } catch { if (doc) await doc.update({value: old}); }
        }
        notes.push('Setting ' + key + ' put back.');
    }
    return notes;
}

// The automations a revert of `entryId` takes with it: itself, plus later applies that touched the same things.
export function revertChain(entryId) {
    const idx = undoIndex();
    const first = idx[entryId];
    if (!first) return [];
    const chain = [entryId];
    const later = Object.entries(idx).filter(([id, r]) => id !== entryId && r.at > first.at).sort((a, b) => a[1].at - b[1].at);
    for (const [id, r] of later) if (chain.some(c => overlaps(idx[c].touched, r.touched))) chain.push(id);
    return chain;
}

export async function revertEntry(entryId, {confirm = true} = {}) {
    if (!game.user.isGM) return {ok: false, msg: 'Only the GM can revert.'};
    const idx = undoIndex();
    const rec = idx[entryId];
    if (!rec) return {ok: false, msg: 'Nothing to revert.'};
    const chain = revertChain(entryId).sort((a, b) => idx[b].at - idx[a].at);   // newest first
    if (confirm) {
        const c = rec.counts ?? {};
        const what = [c.changed && c.changed + ' changed', c.added && c.added + ' added', c.removed && c.removed + ' deleted', c.settings && c.settings + ' setting(s)']
            .filter(Boolean).join(', ') || 'no changes recorded';
        const others = chain.filter(id => id !== entryId);
        const ok = await foundry.applications.api.DialogV2.confirm({
            window: {title: TITLE + ': revert ' + rec.title},
            content: '<p>Undo <b>' + esc(rec.title) + '</b> as applied on ' + esc(new Date(rec.at).toLocaleString()) + ' (' + esc(what) + ').</p>'
                + '<p>Only what it changed is put back. Everything else, including play since then, stays.</p>'
                + (others.length ? '<p>These were applied later and changed the same things, so they are reverted too:</p><ul>'
                    + others.map(id => '<li>' + esc(idx[id].title) + '</li>').join('') + '</ul>' : '')
                + (rec.failed ? '<p class="nix-small">This apply failed partway; this undoes the part that ran.</p>' : ''),
            rejectClose: false
        });
        if (!ok) return {ok: false, msg: 'Cancelled.', cancelled: true};
    }
    const applied = clone(game.settings.get(MODULE_ID, 'applied') ?? {});
    const lines = [];
    let failed = null;
    for (const id of chain) {
        try {
            const u = await readUndo(idx[id]);
            const notes = await applyUndo(u);
            if (u.prevApplied) applied[id] = u.prevApplied; else delete applied[id];
            delete idx[id];
            lines.push('<li><b>' + esc(u.title) + '</b> reverted.' + (notes.length ? '<br><small>' + notes.map(esc).join('<br>') + '</small>' : '') + '</li>');
        } catch (err) {
            console.error(TITLE + ' | revert of ' + id + ' failed', err);
            failed = idx[id].title + ': ' + err.message;
            lines.push('<li>❌ <b>' + esc(idx[id].title) + '</b> could not be reverted: ' + esc(err.message) + '</li>');
            break;
        }
    }
    await game.settings.set(MODULE_ID, 'applied', applied);
    await game.settings.set(MODULE_ID, 'undo', idx);
    await ChatMessage.create({whisper: [game.user.id], content: '<b>' + TITLE + ': revert</b><ul>' + lines.join('') + '</ul>'});
    if (failed) return {ok: false, msg: 'Revert stopped: ' + failed};
    return {ok: true, msg: rec.title + ' reverted' + (chain.length > 1 ? ' (with ' + (chain.length - 1) + ' later apply/applies that touched the same things)' : '') + '.'};
}
