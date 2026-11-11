// Offline check for the Court of Ravenloft v14 installers (copy of v14-offline-check.mjs):
// several actors selected at once (--select "Dracula,Lucian"), CAT stub, Nix Fix API with the
// Illrigger features, and a check of every flags.cat.macros reference (known macro, valid pass).
// usage: node v14-offline-check-court.mjs <installer.js> <export.json>... [--select a,b] [--runs 2] [--quiet] [--pre a.js,b.js]
// --dump <file>: the actors after the last run, as JSON.
// --pre: installers run once first, same selection (e.g. the Illrigger engine before Dracula's boss kit).
import fs from 'node:fs';
 
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = k => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const select = opt('--select', null), runs = Number(opt('--runs', 2)), quiet = flag('--quiet'), pre = (opt('--pre', '') || '').split(',').filter(Boolean), dump = opt('--dump', null);
const [installer, ...exportsList] = args;
 
// ---------------------------------------------------------------- utils
const clone = o => o === undefined ? undefined : structuredClone(o);
const getProperty = (o, p) => String(p).split('.').reduce((x, k) => x?.[k], o);
const setProperty = (o, p, v) => { const ks = String(p).split('.'); let x = o; for (const k of ks.slice(0, -1)) x = (x[k] ??= {}); x[ks.at(-1)] = v; };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Set) && !(v instanceof Map);
const mergeObject = (a, b) => { const o = isObj(a) ? clone(a) : {}; for (const [k, v] of Object.entries(b ?? {})) {
    if (k.includes('.')) { setProperty(o, k, v); continue; }
    o[k] = isObj(v) && isObj(o[k]) ? mergeObject(o[k], v) : clone(v); } return o; };
let idn = 0; const randomID = () => 'mock' + String(++idn).padStart(12, '0');
class Collection extends Map {
    get contents() { return [...this.values()]; }
    find(f) { return this.contents.find(f); } filter(f) { return this.contents.filter(f); } some(f) { return this.contents.some(f); }
    map(f) { return this.contents.map(f); } reduce(f, i) { return this.contents.reduce(f, i); } forEach(f) { this.contents.forEach(f); }
    getName(n) { return this.find(x => x.name === n); } every(f) { return this.contents.every(f); }
    [Symbol.iterator]() { return this.values(); }
    get length() { return this.size; }
}
const log = {updates: 0, chat: [], warnings: []};
 
// Apply an update object with dotted keys and -= deletions.
function applyUpdate(doc, data) {
    for (const [k, v] of Object.entries(flatten(data))) {
        const parts = k.split('.');
        const last = parts.at(-1);
        if (last.startsWith('-=')) { const parent = parts.length > 1 ? getProperty(doc, parts.slice(0, -1).join('.')) : doc; if (parent) delete parent[last.slice(2)]; continue; }
        setProperty(doc, k, clone(v));
    }
    log.updates++;
}
function flatten(o, pre = '', out = {}) {
    for (const [k, v] of Object.entries(o)) {
        const key = pre ? pre + '.' + k : k;
        if (isObj(v) && !k.startsWith('-=') && Object.keys(v).length) flatten(v, key, out);
        else out[key] = v;
    }
    return out;
}
 
function docMethods(doc, collectionGetter) {
    doc.update = async data => { applyUpdate(doc, data); return doc; };
    doc.setFlag = async (s, k, v) => { doc.flags ??= {}; doc.flags[s] ??= {}; setProperty(doc.flags[s], k, clone(v)); log.updates++; return doc; };
    doc.getFlag = (s, k) => getProperty(doc.flags?.[s], k);
    doc.unsetFlag = async (s, k) => { const ks = k.split('.'); const p = getProperty(doc.flags?.[s], ks.slice(0, -1).join('.')) ?? (ks.length === 1 ? doc.flags?.[s] : null); if (p) delete p[ks.at(-1)]; return doc; };
    doc.delete = async () => { collectionGetter()?.delete(doc.id); return doc; };
    doc.toObject = () => JSON.parse(JSON.stringify(doc, (k, v) => typeof v === 'function' || ['parent', 'actor', 'item'].includes(k) ? undefined : (v instanceof Set ? [...v] : v)));
}
 
function makeEffect(data, parent) {
    const e = clone(data);
    e.id = e._id ??= randomID();
    e.flags ??= {}; e.system ??= {}; e.system.changes ??= e.changes ?? []; delete e.changes;
    e.statuses = new Set(e.statuses ?? []);
    e.duration ??= {};
    Object.defineProperty(e, 'parent', {value: parent, enumerable: false});
    Object.defineProperty(e, 'changes', {get() { log.warnings.push('effect.changes read on ' + e.name); return e.system.changes; }, enumerable: false});
    e.uuid = (parent.uuid ?? 'X') + '.ActiveEffect.' + e.id;
    docMethods(e, () => parent.effects);
    return e;
}
function makeActivity(id, data, item) {
    const a = clone(data);
    a.id = a._id = id;
    a.flags ??= {};
    a.uses ??= {};
    a.consumption ??= {targets: []};
    Object.defineProperty(a, 'item', {value: item, enumerable: false});
    Object.defineProperty(a, 'parent', {value: item, enumerable: false});
    a.uuid = item.uuid + '.Activity.' + id;
    a.update = async upd => { applyUpdate(a, upd); return a; };
    a.use = async () => null;
    a.toObject = () => JSON.parse(JSON.stringify(a, (k, v) => typeof v === 'function' || ['item', 'parent'].includes(k) ? undefined : v));
    return a;
}
function wrapActivities(item) {
    const raw = item.system.activities ?? {};
    const col = new Collection();
    for (const [id, d] of Object.entries(raw)) col.set(id, makeActivity(id, d, item));
    item.system.activities = col;
}
function makeItem(data, actor) {
    const i = clone(data);
    i.id = i._id ??= randomID();
    i.flags ??= {};
    Object.defineProperty(i, 'parent', {value: actor, enumerable: false});
    Object.defineProperty(i, 'actor', {value: actor, enumerable: false});
    i.uuid = actor.uuid + '.Item.' + i.id;
    const effs = new Collection();
    for (const e of i.effects ?? []) { const ef = makeEffect(e, i); effs.set(ef.id, ef); }
    i.effects = effs;
    wrapActivities(i);
    docMethods(i, () => actor.items);
    const baseUpdate = i.update;
    i.update = async data => {
        // activities: handle system.activities.<id>.x and -=id against the collection
        const flat = flatten(data);
        const rest = {};
        for (const [k, v] of Object.entries(flat)) {
            const m = k.match(/^system\.activities\.(-=)?([^.]+)(?:\.(.*))?$/);
            if (!m) { rest[k] = v; continue; }
            if (m[1]) { i.system.activities.delete(m[2]); continue; }
            let a = i.system.activities.get(m[2]);
            if (!a) { a = makeActivity(m[2], {}, i); i.system.activities.set(m[2], a); }
            if (m[3]) setProperty(a, m[3], clone(v)); else Object.assign(a, clone(v));
        }
        return baseUpdate(rest);
    };
    i.createEmbeddedDocuments = async (type, list) => list.map(d => { const ef = makeEffect(d, i); effs.set(ef.id, ef); return ef; });
    i.deleteEmbeddedDocuments = async (type, ids) => ids.forEach(id => effs.delete(id));
    i.createActivity = async (type, data) => { const id = randomID(); i.system.activities.set(id, makeActivity(id, {type, ...clone(data)}, i)); };
    i.getRollData = () => ({});
    return i;
}
function makeActor(data) {
    const a = clone(data);
    a.id = a._id ??= randomID();
    a.uuid = 'Actor.' + a.id;
    a.flags ??= {};
    const items = new Collection();
    const effects = new Collection();
    const rawItems = a.items, rawEffects = a.effects;
    a.items = items; a.effects = effects;
    for (const d of rawItems ?? []) { const it = makeItem(d, a); items.set(it.id, it); }
    for (const d of rawEffects ?? []) { const ef = makeEffect(d, a); effects.set(ef.id, ef); }
    Object.defineProperty(a, 'appliedEffects', {get: () => effects.filter(e => !e.disabled)});
    a.statuses = new Set();
    a.classes = Object.fromEntries(items.filter(i => i.type === 'class').map(c => [c.system.identifier, c]));
    a.prototypeToken ??= {};
    a._source = {prototypeToken: clone(a.prototypeToken)};
    a.isToken = false;
    a.hasPlayerOwner = true;
    docMethods(a, () => null);
    a.createEmbeddedDocuments = async (type, list) => {
        if (type === 'Item') return list.map(d => { const it = makeItem(d, a); items.set(it.id, it); return it; });
        return list.map(d => { const ef = makeEffect(d, a); effects.set(ef.id, ef); return ef; });
    };
    a.deleteEmbeddedDocuments = async (type, ids) => ids.forEach(id => (type === 'Item' ? items : effects).delete(id));
    a.getRollData = () => ({});
    return a;
}
 
// ---------------------------------------------------------------- globals
const actors = new Collection();
for (const f of exportsList) { const ac = makeActor(JSON.parse(fs.readFileSync(f, 'utf8'))); actors.set(ac.id, ac); }
const selectedActors = select ? select.split(',').map(s => { const a = actors.find(a => a.name.toLowerCase().startsWith(s.trim().toLowerCase())); if (!a) throw new Error('no actor ' + s); return a; }) : [];
const settings = {};
const g = globalThis;
g.foundry = {utils: {deepClone: clone, getProperty, setProperty, mergeObject, isEmpty: o => !o || !Object.keys(o).length, randomID,
    escapeHTML: s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])), AsyncFunction: Object.getPrototypeOf(async function () {}).constructor},
    applications: {api: {DialogV2: {prompt: async () => null, wait: async () => null, confirm: async () => false}}}};
g.game = {actors, scenes: new Collection(), user: {id: 'gm', isGM: true, character: null}, users: new Collection(),
    settings: {get: (n, k) => settings[n + '.' + k], set: async (n, k, v) => { settings[n + '.' + k] = v; }, settings: new Map()},
    modules: new Collection([['chris-premades', {id: 'chris-premades', active: true, version: '2.1.6', title: 'CPR'}], ['cat', {id: 'cat', active: true, version: '0.1.6', title: 'CAT'}]]),
    i18n: {localize: s => s, format: s => s}, system: {id: 'dnd5e', version: '6.0.6'}, release: {generation: 14}, combat: null, packs: new Collection()};
g.CONST = {ACTIVE_EFFECT_CHANGE_TYPES: {ADD: 'add', OVERRIDE: 'override', UPGRADE: 'upgrade', CUSTOM: 'custom'}};
g.CONFIG = {Canvas: {darknessAnimations: {}}, DND5E: {senses: {devilsSight: 'Devil\'s Sight'}}, Dice: {fulfillment: {methods: {}}}};
g.ChatMessage = {create: async d => { log.chat.push(d.content); return d; }, getSpeaker: () => ({}), getWhisperRecipients: () => []};
g.ui = {notifications: {info: m => log.chat.push('[info] ' + m), warn: m => log.chat.push('[warn] ' + m), error: m => log.chat.push('[error] ' + m)}};
g.Hooks = {on: () => 1, once: () => 1, off: () => {}, callAll: () => {}};
g.fromUuidSync = u => null; g.fromUuid = async u => null;
g.MidiQOL = {};
// World actors created by an installer (summon templates) join the mock world.
g.Actor = {create: async d => { const a = makeActor(d); actors.set(a.id, a); return a; }};
g.Folder = {create: async d => ({id: randomID(), ...d})};
game.folders = new Collection();
g.Roll = class { constructor(f) { this.formula = f; } async evaluate({maximize} = {}) { const m = String(this.formula).match(/(\d+)d(\d+)\s*(?:\+\s*(\d+))?/); this.total = m ? (maximize ? +m[1] * +m[2] : +m[1]) + (+m[3] || 0) : Number(this.formula) || 0; return this; } };
const tokenFor = a => ({actor: a, document: {...a.prototypeToken, actor: a, name: a.name, uuid: 'Scene.x.Token.' + a.id, detectionModes: a.prototypeToken.detectionModes ?? []}, name: a.name, id: 'tok' + a.id});
const canvasMock = {tokens: {controlled: selectedActors.map(tokenFor), placeables: [], get: () => null}, scene: null, ready: false};
 
g.cat = {utils: {}, api: {}};
Math.clamp ??= (n, lo, hi) => Math.min(Math.max(n, lo), hi);
g.Sequencer = {Database: {entryExists: () => false}};
const F = await import(new URL('../scripts/court/illrigger-features.mjs', import.meta.url));
const BR = await import(new URL('../scripts/court/bloodrift.mjs', import.meta.url));
const BOSS = await import(new URL('../scripts/court/boss.mjs', import.meta.url));
const PS = await import(new URL('../scripts/court/petra-spells.mjs', import.meta.url));
// Runtime APIs the installers check for (registering them needs a canvas; the installers only test they exist).
game.modules.set('nix-module', {id: 'nix-module', active: true, api: {illriggerFeatures: F, bloodrift: BR.registerBloodrift(), boss: BOSS.registerBoss(),
    petraSpells: {LAYERS: PS.LAYERS, cpr2Owns: PS.cpr2Owns}, court: {stub: true}, statBlock: {stub: true}}});
// ---------------------------------------------------------------- run
const code = fs.readFileSync(installer, 'utf8');
const AsyncFn = g.foundry.utils.AsyncFunction;
try { new AsyncFn('canvas', code); } catch (e) { console.log('INSTALLER SYNTAX ERROR', e.message); process.exit(1); }
for (const p of pre) { log.chat = []; await new AsyncFn('canvas', fs.readFileSync(p, 'utf8'))(canvasMock); if (!quiet) console.log('pre-ran', p); }
const counts = [];
for (let r = 0; r < runs; r++) {
    log.chat = [];
    await new AsyncFn('canvas', code)(canvasMock);
    counts.push(countMacros());
}
function* docs() {
    for (const a of actors) {
        yield [a.name, a];
        for (const e of a.effects) yield [a.name + ' > ' + e.name, e];
        for (const i of a.items) {
            yield [a.name + ' > ' + i.name, i];
            for (const e of i.effects) yield [a.name + ' > ' + i.name + ' > fx ' + e.name, e];
            for (const ac of i.system.activities) yield [a.name + ' > ' + i.name + ' > act ' + (ac.name || ac.type), ac];
        }
    }
}
function countMacros() { let n = 0; for (const [, d] of docs()) { n += (d.flags?.cat?.embeddedMacros ?? []).length; for (const l of Object.values(d.flags?.cat?.macros ?? {})) n += l.length; } return n; }
 
const SCOPE = ['actor', 'token', 'item', 'scene', 'document', 'workflow', 'ditem', 'targetToken', 'config', 'options', 'roll', 'rolls', 'saveId', 'skillId', 'checkId', 'toolId',
    'result', 'dialog', 'message', 'activity', 'region', 'event', 'combat', 'data', 'updates',
    'activityUtils', 'actorUtils', 'animationUtils', 'automationUtils', 'combatUtils', 'compendiumUtils', 'crosshairUtils', 'dataUtils', 'dialogUtils', 'documentUtils',
    'effectUtils', 'folderUtils', 'genericUtils', 'itemUtils', 'queryUtils', 'regionUtils', 'rollUtils', 'summonUtils', 'tokenUtils', 'uiUtils', 'workflowUtils',
    'constants', 'D20Bonus', 'DamageBonus'];
const BANNED = [/\btrigger\.(entity|actor|token|config|options|roll|data|saveId|skillId)/, /\bsocketUtils\./, /genericUtils\.(remove|update|setFlag|deleteEmbeddedDocuments)\b/,
    /effectUtils\.createEffect\(/, /combatUtils\.inCombat/, /\bDialogApp\b/, /preventDeath/, /ACTIVE_EFFECT_MODES/, /rollUtils\.remoteRoll/, /activityUtils\.getActivityByIdentifier/,
    /templateUtils\./, /\bchrisPremades\./, /effectUtils\.addDependent/, /dialogUtils\.selectDocumentsDialog/, /tokenUtils\.pushToken/, /workflowUtils\.replaceDamage/, /\bSummons\./];
let bad = 0, total = 0;
const seen = new Set();
for (const [where, d] of docs()) {
    for (const m of d.flags?.cat?.embeddedMacros ?? []) {
        const label = where + ' :: ' + m.name + ' [' + m.event + '/' + m.pass + ']';
        if (!m.name || !m.event || !m.pass || !Array.isArray(m.macros)) { console.log('BAD SHAPE', label); bad++; continue; }
        for (const x of m.macros) {
            total++;
            try { new AsyncFn(...SCOPE, x.macro); } catch (e) { console.log('COMPILE FAIL', label, e.message); bad++; }
            for (const b of BANNED) if (b.test(x.macro)) { console.log('V13 HELPER', label, b); bad++; }
            if (!/^\s*(\/\/[^\n]*\n\s*)*return await \(/.test(x.macro) && !/\nreturn await \(/.test(x.macro)) { console.log('NOT WRAPPED', label); bad++; }
            if (!quiet && !seen.has(label)) { seen.add(label); console.log('  ok', label, 'p' + x.priority); }
        }
    }
    const old = d.flags?.['chris-premades']?.embeddedMacros;
    if (old?.length && !quiet) console.log('  (old CPR1 macros left)', where, old.map(m => m.name).join(', '));
    const oldAct = d.flags?.['chris-premades']?.embeddedActivityMacros;
    if (oldAct && !quiet) for (const [id, l] of Object.entries(oldAct)) if (l?.length) console.log('  (old CPR1 activity macros left)', where, id, l.map(m => m.name).join(', '));
}
for (const b of BANNED) if (b.test(code.replace(/\/\/[^\n]*/g, ''))) console.log('V13 HELPER in installer body', b);
console.log('\nmacros per run:', counts.join(' -> '), counts.every(c => c === counts[0]) ? '(stable)' : '(CHANGED: stacking?)');
console.log('compiled', total, 'macros,', bad, 'problems;', log.warnings.length ? [...new Set(log.warnings)].slice(0, 5).join('; ') : 'no v13 effect.changes reads');
console.log('\nCHAT (last run):');
for (const c of log.chat) console.log(' ', String(c).replace(/<li>/g, '\n   - ').replace(/<br\s*\/?>/g, '\n   ').replace(/<[^>]+>/g, '').slice(0, 3000));
 
// ---- function-macro references
const PREFIX = {roll: ['activity', 'item', 'actor', 'target', 'scene', 'nearby'], save: ['actor', 'scene', 'nearby'], combat: ['actor', 'scene', 'nearby']};
const ROLLPASS = ['preTargeting','preItemRoll','targeting','preambleComplete','attackRollConfig','attackRoll','attackRollBonuses','attackRollMissedBonuses','optionalBonusAttack','attackRollComplete','savesComplete','damageRoll','optionalBonusDamage','damageRollBonuses','damageRollComplete','damage','damageBonuses','damageFlatReductions','damagePercentReductions','damageComplete','rollFinished','onHit','cleanup'];
const SAVEPASS = ['situational','context','bonus','optionalBonus','post','targetSituational'];
const COMBATPASS = ['preInitiative','turnEnd','everyTurn','turnStart','combatStart','combatEnd'];
const PASSES = {roll: ROLLPASS, save: SAVEPASS, combat: COMBATPASS};
let refBad = 0, refs = 0;
for (const [id, m] of Object.entries(F.MACROS)) for (const [type, list] of Object.entries(m)) for (const x of list) {
    const pre = PREFIX[type].find(p => x.pass.startsWith(p));
    const rest = pre ? x.pass.slice(pre.length) : null;
    if (!pre || !PASSES[type].includes(rest[0].toLowerCase() + rest.slice(1))) { console.log('BAD PASS', id, type, x.pass); refBad++; }
    if (typeof x.macro !== 'function') { console.log('NO FN', id, x.pass); refBad++; }
}
for (const [where, d] of docs()) for (const [type, list] of Object.entries(d.flags?.cat?.macros ?? {})) for (const r of list) {
    if (r.source !== 'nix-module') continue;
    refs++;
    const m = F.MACROS[r.identifier];
    if (!m?.[type]) { console.log('REF TO UNKNOWN', where, type, r.identifier); refBad++; continue; }
    const isAct = where.includes(' > act ');
    const isEff = / > fx |^[^>]+ > [^>]+$/.test(where) && d.documentName !== 'Item' && !d.system?.activities;
    for (const x of m[type]) if (x.pass.startsWith('activity') && !isAct) { console.log('ACTIVITY PASS ON NON-ACTIVITY', where, r.identifier); refBad++; }
    if (!quiet) console.log('  ref', where, '->', type, r.identifier);
}
console.log('\nfunction-macro refs:', refs, '| problems:', refBad);
if (dump) fs.writeFileSync(dump, JSON.stringify(actors.contents.map(a => ({...a, items: a.items.contents.map(i => ({...i, effects: i.effects.contents, system: {...i.system, activities: Object.fromEntries(i.system.activities.contents.map(x => [x.id, x]))}})), effects: a.effects.contents})), (k, v) => v instanceof Set ? [...v] : v, 1));
