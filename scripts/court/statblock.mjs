// =====================================================================
//  NIX FIX: Court of Ravenloft "Make stat block" (v13 and v14)
//  Foundry can't change an actor's type, so the boss "(Boss)" CHARACTER copies get an
//  NPC twin with the same name: abilities, HP, AC, saves, skills, senses, traits, spell
//  slots and every item (the Illrigger class item included: on a dnd5e 5.x NPC its levels,
//  scale values and spell progression still count). The character copy is not touched.
//
//  npcLegendary(actor) lays an NPC boss out like a 2024 stat block (the boss kits call it
//  too, so a re-apply keeps the layout):
//   - native Legendary Action / Legendary Resistance pips (system.resources.legact / legres)
//     instead of the "Legendary Actions" and "Legendary Resistance" item uses;
//   - each Legendary Action on its own item in the sheet's Legendary Actions section
//     (activation "legendary", cost = its number); Lair (toggle) in Lair Actions;
//   - legendary activities that live on another item (Dracula's Devour on Infernal
//     Conduit) get a button item in the Legendary Actions section that opens the real one;
//   - anything else that cost Legendary Action uses (Telekinetic Seal, Hellfire
//     Detonation) spends the native pips; Hellfire Detonation sits under Mythic Actions.
//  v14 (dnd5e 6.0.6, checked in its source): same NPC schema for legact / legres / lair and
//  hd.spent; Legendary / Mythic activations still auto-spend resources.legact unless an
//  activity has its own attribute target; the NPC sheet still groups features by their first
//  activity's activation type. Differences handled here: key deletion with _del
//  (ForcedDeletion), AC set with ac.override (no ac.calc 'flat' any more), speed read from
//  movement.speeds.walk. dnd5e.preUseActivity returning false still cancels (proxy buttons).
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {bossOf, syncLegendaryMax} from './boss.mjs';
import {isCat} from './engine.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const LEGACT = 'resources.legact.value';
const isLegendaryItem = i => !!i.flags?.[MODULE_ID]?.legendary;
const laItem = actor => actor.items.get(bossOf(actor)?.legendaryItem) ?? actor.items.find(isLegendaryItem);
const lrItem = actor => actor.items.find(i => i.flags?.[MODULE_ID]?.legendaryResistance);
const kindOf = a => a?.flags?.[MODULE_ID]?.boss ?? a?.flags?.[MODULE_ID]?.court ?? null;
const baseName = n => String(n ?? '').replace(/\s*\((legendary,\s*)?\d+\)\s*$/i, '').trim();
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Delete a key: "-=" on v13; Foundry 14's _del (ForcedDeletion) on v14.
const delKey = (upd, path) => {
    if (isCat() && typeof _del !== 'undefined') upd[path] = _del;
    else upd[path.replace(/\.([^.]+)$/, '.-=$1')] = null;
};
const costOf = (a, la) => Number(a.activation?.value) || Number((a.consumption?.targets ?? []).find(t => t.type === 'itemUses' && (!t.target || t.target === la?.id))?.value) || 1;

// "<li><b>Seal (1).</b> text</li>" in the Legendary Actions description -> "<p>text</p>"
function liText(html, name) {
    const m = String(html ?? '').match(new RegExp('<li>\\s*<b>\\s*' + reEsc(name) + '\\s*(\\([^)]*\\))?\\.?\\s*</b>\\s*([\\s\\S]*?)</li>', 'i'));
    return m ? '<p>' + m[2].trim() + '</p>' : '';
}

// Consumption: Legendary Action item uses -> the native pips (one entry, not two).
function nativeTargets(targets, la, {dropOwn = false} = {}) {
    const out = [];
    for (const t of targets ?? []) {
        const own = t.type === 'itemUses' && !t.target;
        const toLa = t.type === 'itemUses' && la && t.target === la.id;
        if (own && dropOwn) continue;
        if (toLa) out.push({...t, type: 'attribute', target: LEGACT});
        else out.push(t);
    }
    const seen = out.filter(t => t.type === 'attribute' && t.target === LEGACT);
    return seen.length > 1 ? out.filter(t => !(t.type === 'attribute' && t.target === LEGACT) || t === seen[0]) : out;
}

async function ensure(actor, match, data) {
    const it = actor.items.find(match);
    if (it) { await it.update(data); return actor.items.get(it.id); }
    return (await actor.createEmbeddedDocuments('Item', [isCat() ? foundry.utils.expandObject(data) : data]))[0];
}

export async function npcLegendary(actor) {
    if (actor?.type !== 'npc') return [];
    const report = [];
    const b = bossOf(actor);
    const la = laItem(actor), lr = lrItem(actor);
    const laHtml = la?.system.description?.value ?? '';

    // 1. Counters: Legendary Resistance pips take over the item's uses.
    const res = {};
    if (lr?.system.uses?.max) {
        res['system.resources.legres.max'] = Number(lr.system.uses.max) || 0;
        res['system.resources.legres.spent'] = Math.min(Number(lr.system.uses.spent) || 0, res['system.resources.legres.max']);
    }
    if (!actor._source.system.resources?.legact?.max) res['system.resources.legact.max'] = Number(b?.legendaryBase ?? la?.system.uses?.max ?? 3) || 3;
    if (Object.keys(res).length) await actor.update(res);
    if (lr) await lr.update({'system.uses': {max: '', spent: 0, recovery: []}, 'system.identifier': 'legendary-resistance'});

    // 2. Each Legendary Action on its own item (Legendary Actions / Lair Actions sections).
    const moved = [];
    if (la) {
        const html = laHtml;
        let sort = (la.sort ?? 0) + 1;
        for (const a of la.system.activities) {
            const kind = kindOf(a);
            const data = a.toObject();
            const cost = costOf(a, la);
            const lair = kind === 'lair';
            const name = lair ? 'Lair (toggle this scene)' : baseName(a.name);
            data.activation = lair ? {type: 'lair', value: null, override: false, condition: ''} : {type: 'legendary', value: cost, override: false, condition: ''};
            data.consumption = {...(data.consumption ?? {}), targets: nativeTargets(data.consumption?.targets, la, {dropOwn: true}).filter(t => !(t.type === 'attribute' && t.target === LEGACT))};
            if (!lair) data.name = name;
            const desc = liText(html, name);
            const existing = actor.items.find(i => i.flags?.[MODULE_ID]?.legendaryAction === a.id);
            await ensure(actor, i => i.flags?.[MODULE_ID]?.legendaryAction === a.id, {
                name, type: 'feat', img: la.img, sort: sort++,
                'system.type': {value: 'monster', subtype: ''},
                ...(desc || !existing ? {'system.description.value': desc || (lair
                    ? '<p>Marks the scene you\'re on as ' + esc(actor.name) + '\'s lair (or unmarks it). In a lair scene the Legendary Actions go up to ' + (b?.legendaryLair ?? '') + '.</p>' : '')} : {}),
                ['system.activities.' + a.id]: data,
                ['flags.' + MODULE_ID + '.legendaryAction']: a.id
            });
            moved.push(lair ? name : name + ' (' + cost + ')');
        }
        const upd = {'system.uses': {max: '', spent: 0, recovery: []}, 'system.identifier': 'legendary-actions'};
        for (const a of la.system.activities) delKey(upd, 'system.activities.' + a.id);
        // The action list now lives on the action items; keep the rest of the text.
        if (/<ul>[\s\S]*?<\/ul>/i.test(html) && moved.length) upd['system.description.value'] = html.replace(/<ul>[\s\S]*?<\/ul>/i, '');
        await la.update(upd);
    }

    // 3. Everything else that spent Legendary Action uses spends the pips.
    const proxies = [];
    for (const item of actor.items) {
        if (item.id === la?.id || item.flags?.[MODULE_ID]?.legendaryAction) continue;
        const upd = {};
        for (const a of item.system.activities ?? []) {
            const t = a.consumption?.targets ?? [];
            const usesLa = la && t.some(x => x.type === 'itemUses' && x.target === la.id);
            const next = nativeTargets(t, la);
            if (JSON.stringify(next) !== JSON.stringify(t)) upd['system.activities.' + a.id + '.consumption.targets'] = next;
            if (kindOf(a) === 'detonate' || (item.flags?.[MODULE_ID]?.mythic && usesLa)) {
                if (a.activation?.type !== 'mythic') upd['system.activities.' + a.id + '.activation'] = {type: 'mythic', value: costOf(a, la), override: false, condition: ''};
            } else if (a.activation?.type === 'legendary' && next.some(x => x.type === 'attribute' && x.target === LEGACT)) proxies.push({item, a});
        }
        if (Object.keys(upd).length) await item.update(upd);
    }

    // 4. A button in the Legendary Actions section for legendary activities on other items.
    for (const {item, a} of proxies) {
        const key = 'proxy:' + item.id + '.' + a.id;
        const name = baseName(a.name);
        const cost = Number(a.activation?.value) || 1;
        const desc = liText(laHtml, name);
        const existing = actor.items.find(i => i.flags?.[MODULE_ID]?.legendaryAction === key);
        await ensure(actor, i => i.flags?.[MODULE_ID]?.legendaryAction === key, {
            name, type: 'feat', img: item.img, sort: (la?.sort ?? 0) + 50,
            'system.type': {value: 'monster', subtype: ''},
            ...(desc || !existing ? {'system.description.value': (desc || '') + '<p><i>Opens ' + esc(item.name) + ': ' + esc(a.name) + '.</i></p>'} : {}),
            'system.activities': {nixLegendProxy0: {_id: 'nixLegendProxy0', type: 'utility', name, activation: {type: 'legendary', value: cost, override: false, condition: ''},
                range: {units: 'self'}, consumption: {targets: []}, flags: {[MODULE_ID]: {legendaryProxy: {item: item.id, activity: a.id}}}}},
            ['flags.' + MODULE_ID + '.legendaryAction']: key
        });
        moved.push(name + ' (' + cost + ', on ' + item.name + ')');
    }

    await syncLegendaryMax(actor);
    const r = actor.system.resources;
    report.push('Stat block layout: ' + r.legact.max + ' Legendary Actions and ' + r.legres.max + ' Legendary Resistances as native pips. Legendary Actions section: '
        + (moved.length ? moved.join(', ') : 'nothing found') + '.');
    return report;
}
// (The boss kits rewrite the Legendary Actions description, list included, on every run,
// so the per-action text is there whenever npcLegendary runs after a kit.)

// A proxy button opens the real activity (which spends the pips itself).
function onPreUse(activity) {
    const p = activity?.flags?.[MODULE_ID]?.legendaryProxy;
    if (!p) return;
    const src = activity.actor?.items.get(p.item)?.system.activities?.get(p.activity);
    if (!src) ui.notifications.warn(activity.name + ': the activity it opens is gone. Re-apply the boss kit.');
    else setTimeout(() => src.use().catch(err => console.error(TITLE + ' | legendary proxy', err)), 0);
    return false;
}

// =====================================================================
//  Make stat block
// =====================================================================
const deep = o => foundry.utils.deepClone(o);
const swapActorId = (data, from, to) => JSON.parse(JSON.stringify(data).split('Actor.' + from).join('Actor.' + to));
export const statBlocksOf = src => game.actors.filter(a => a.type === 'npc' && a.flags?.[MODULE_ID]?.statBlock?.source === src.uuid);

function systemFrom(src, cr) {
    const s = deep(src._source.system);
    const p = src.system;
    const lr = lrItem(src);
    const b = bossOf(src);
    const attributes = deep(s.attributes ?? {});
    delete attributes.hd; delete attributes.inspiration;
    attributes.hp = {value: p.attributes.hp.value, max: p.attributes.hp.max, temp: s.attributes?.hp?.temp ?? null, tempmax: s.attributes?.hp?.tempmax ?? null, formula: ''};
    attributes.hd = {spent: src.items.filter(i => i.type === 'class').reduce((n, c) => n + (Number(c.system.hd?.spent) || 0), 0)};
    return {
        abilities: s.abilities, skills: s.skills, tools: s.tools, bonuses: s.bonuses, spells: s.spells, currency: s.currency, traits: s.traits,
        attributes,
        details: {...deep(s.details ?? {}), cr},
        resources: {
            legact: {max: Number(b?.legendaryBase ?? la0(src)) || 0, spent: 0},
            legres: {max: Number(lr?.system.uses?.max) || 0, spent: Number(lr?.system.uses?.spent) || 0},
            lair: {value: false, inside: false}
        },
        source: {rules: '2024'}
    };
}
const la0 = src => Number(laItem(src)?.system.uses?.max) || 0;

// After creation: line the NPC up with the character's numbers.
async function lineUp(npc, src) {
    const notes = [];
    const want = src.system.attributes.hp.max, got = npc.system.attributes.hp.max;
    if (want !== got) {
        // An NPC adds the class's Hit Point advancement on top of its stored max.
        const stored = Math.max(0, (Number(npc._source.system.attributes.hp.max) || 0) + (want - got));
        await npc.update({'system.attributes.hp.max': stored});
    }
    await npc.update({'system.attributes.hp.value': Math.min(src.system.attributes.hp.value, npc.system.attributes.hp.max)});
    if (npc.system.attributes.hp.max !== want) notes.push('<b>HP max</b> came out ' + npc.system.attributes.hp.max + ' (character ' + want + '): set it on the sheet.');
    const acWant = src.system.attributes.ac.value;
    if (npc.system.attributes.ac.value !== acWant) {
        await npc.update(isCat() ? {'system.attributes.ac.override': acWant} : {'system.attributes.ac': {calc: 'flat', flat: acWant}});
        notes.push('AC: the character\'s formula gave ' + npc.system.attributes.ac.value + ' here, so it is set ' + (isCat() ? 'as an override' : 'flat') + ' to ' + acWant + '.');
    }
    // Read-only comparison of what players will notice.
    const diff = [];
    const cmp = (label, a, c) => { if (a !== c) diff.push(label + ' ' + c + ' (character ' + a + ')'); };
    cmp('Proficiency', src.system.attributes.prof, npc.system.attributes.prof);
    for (const [k, ab] of Object.entries(src.system.abilities ?? {})) cmp(k.toUpperCase() + ' save', ab.save?.value ?? ab.save, npc.system.abilities[k]?.save?.value ?? npc.system.abilities[k]?.save);
    for (const [k, sk] of Object.entries(src.system.skills ?? {})) cmp(k, sk.total, npc.system.skills[k]?.total);
    cmp('Initiative', src.system.attributes.init?.total, npc.system.attributes.init?.total);
    cmp('Spell DC', src.system.attributes.spell?.dc ?? src.system.attributes.spelldc, npc.system.attributes.spell?.dc ?? npc.system.attributes.spelldc);
    const walk = a => a.system.attributes.movement?.speeds?.walk ?? a.system.attributes.movement?.walk;
    cmp('Walk', walk(src), walk(npc));
    if (diff.length) notes.push('<b>Differs from the character:</b> ' + esc(diff.join('; ')) + '.');
    else notes.push('Proficiency, saves, skills, initiative, spell DC and speed match the character.');
    // Item 3 of the plan: does the class item still work on an NPC?
    const cls = Object.entries(src.classes ?? {}).map(([id, c]) => {
        const n = npc.classes?.[id];
        const scaleKeys = Object.keys(src.system.scale?.[id] ?? {});
        const missing = scaleKeys.filter(k => npc.system.scale?.[id]?.[k] === undefined || String(npc.system.scale[id][k]) !== String(src.system.scale[id][k]));
        return esc(c.name) + ' ' + (n?.system.levels ?? 0) + '/' + c.system.levels + (scaleKeys.length ? ', scale ' + (scaleKeys.length - missing.length) + '/' + scaleKeys.length : '')
            + (missing.length ? ' (<b>differs:</b> ' + esc(missing.join(', ')) + ')' : '');
    });
    if (cls.length) notes.push('Class items on the NPC: ' + cls.join('; ') + '. Hit Dice: ' + npc.system.attributes.hd.value + '/' + npc.system.attributes.hd.max + ' (on the actor; Blood Price spends these).');
    return notes;
}

export async function makeStatBlock(src, {cr, rebuild = null} = {}) {
    if (!game.user.isGM) throw new Error('Only the GM can make a stat block.');
    if (src?.type !== 'character') throw new Error('Pick a character actor (a "(Boss)" copy).');
    const crNum = Number(cr);
    if (!Number.isFinite(crNum) || crNum < 0) throw new Error('CR must be a number (0.125, 0.25, 0.5 or 0-30).');
    const s = src.toObject();
    const report = [];
    let npc;
    if (rebuild) {
        npc = rebuild;
        const items = swapActorId(s.items, src.id, npc.id), effects = swapActorId(s.effects, src.id, npc.id);
        const flags = swapActorId(s.flags ?? {}, src.id, npc.id);
        if (npc.items.size) await npc.deleteEmbeddedDocuments('Item', npc.items.map(i => i.id));
        if (npc.effects.size) await npc.deleteEmbeddedDocuments('ActiveEffect', npc.effects.map(e => e.id));
        await npc.update({system: systemFrom(src, crNum), flags: {...flags, [MODULE_ID]: {...(flags[MODULE_ID] ?? {}), statBlock: {source: src.uuid, at: Date.now()}}}}, {diff: false, recursive: true});
        await npc.createEmbeddedDocuments('Item', items, {keepId: true});
        if (effects.length) await npc.createEmbeddedDocuments('ActiveEffect', effects, {keepId: true});
        report.push('Rebuilt ' + esc(npc.name) + ' (NPC) from the character: stats, items and effects replaced. Its tokens, folder and ownership are kept.');
    } else {
        const id = foundry.utils.randomID();
        const flags = swapActorId(s.flags ?? {}, src.id, id);
        flags[MODULE_ID] = {...(flags[MODULE_ID] ?? {}), statBlock: {source: src.uuid, at: Date.now()}};
        const data = {
            _id: id, name: src.name, type: 'npc', img: src.img, folder: src.folder?.id ?? null, ownership: s.ownership,
            prototypeToken: swapActorId(s.prototypeToken, src.id, id), flags, system: systemFrom(src, crNum),
            items: swapActorId(s.items, src.id, id), effects: swapActorId(s.effects, src.id, id)
        };
        npc = await Actor.implementation.create(data, {keepId: true, keepEmbeddedIds: true});
        report.push('New NPC actor ' + esc(npc.name) + ' (CR ' + crNum + ') in the same folder. The character copy is untouched.');
    }
    report.push(...await lineUp(npc, src));
    try { report.push(...await npcLegendary(npc)); }
    catch (err) { console.error(TITLE + ' | stat block layout', err); report.push('<b>Legendary layout failed</b> (' + esc(err.message) + '): re-apply the boss kit after binding.'); }
    report.push('Next: in the ' + TITLE + ' window bind this NPC (listed as "' + esc(npc.name) + ' (NPC)") in the boss slot, then re-apply the Illrigger engine, the fixes and the boss kit.');
    await ChatMessage.create({whisper: [game.user.id], content: '<b>' + TITLE + ': stat block for ' + esc(src.name) + '</b><ul><li>' + report.join('</li><li>') + '</li></ul>'});
    return {npc, report};
}

export function registerStatBlock() {
    Hooks.on('dnd5e.preUseActivity', onPreUse);
    return {makeStatBlock, npcLegendary, statBlocksOf};
}
