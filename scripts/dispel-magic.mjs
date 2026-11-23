// =====================================================================
//  NIX FIX: Dispel Magic (2024 rules), every campaign, v13 (Chris's Premades 1) and v14 (CAT). 1.7.7.
//  For a Dispel Magic the "Dispel Magic" world installer marked (flags.nix-module.dispelMagic). Neither Chris's
//  Premades 1 (1.5.52), Chris's Premades 2 (2.1.9) nor CAT (0.1.9) ships a Dispel Magic automation; the installer
//  strips any premade one it finds so only this runs.
//   1. On cast (Midi RollComplete, on the client that cast it: the caster's player, the GM for NPCs) a pop-up lists
//      every magical spell effect within 120 ft of the caster, grouped:
//        - creatures and objects with ongoing spells on them (each with its spells and their levels; a spell's
//          summoned creature counts as that spell),
//        - area spell effects: templates (v13) / Regions (v14), Prismatic Wall, sunlight Nix Fix recorded.
//   2. The caster picks ONE: a creature / object -> every spell on it; an area -> that one spell.
//   3. Each spell: level <= Dispel Magic's cast level ends; higher needs an ability check with the caster's
//      spellcasting ability (the item's own ability, else the actor's), rolled through dnd5e (bonuses apply),
//      DC 10 + its level. One check per spell.
//   4. Ending: the source's concentration when the spell is concentration (its dependents go too), otherwise the
//      effect / template / Region / summoned token is deleted, on the active GM (socket) when a player cast it.
//      Prismatic Wall goes to Petra's wall code (scripts/court/petra-spells.mjs prismHit: Dispel Magic ends violet,
//      only once it is the last layer).
//   5. Chat: what ended, what failed its check, the rolls.
//  Pure rules: scripts/dispel-magic-core.mjs.
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';
import {cpr} from './court/engine.mjs';
import {addGmHandler, gm} from './court/lieutenants.mjs';
import {DISPEL_BASE_LEVEL, DISPEL_RANGE_FT, groupSpells, planDispel, spellEffectInfo} from './dispel-magic-core.mjs';

export const FLAG = 'dispelMagic';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
export const isDispelMagic = item => item?.type === 'spell' && !!item.flags?.[MODULE_ID]?.[FLAG];
const ftPerPx = () => (canvas?.dimensions?.distance ?? 5) / (canvas?.dimensions?.size ?? 100);
const centerOf = t => t?.center ?? null;
const pxDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * ftPerPx();
const tokDist = (a, b) => { const d = Number(cpr()?.tokenUtils?.getDistance?.(a, b)); return Number.isFinite(d) && d >= 0 ? d : pxDist(centerOf(a), centerOf(b)); };

// ---------------------------------------------------------------- origins
function resolve(uuid) { try { return uuid ? fromUuidSync(uuid, {strict: false}) : null; } catch { return null; } }
// The spell item behind an effect / template / Region / summoned actor, when it still exists.
function originItem(doc, {summon = false} = {}) {
    const f = doc?.flags ?? {};
    const uuids = summon ? [f.dnd5e?.summon?.origin] : [doc?.origin, f.dnd5e?.item, f.dnd5e?.origin, f['midi-qol']?.castData?.itemUuid, f['midi-qol']?.originUuid, f.cat?.castData?.itemUuid];
    for (const u of uuids) {
        let o = resolve(u);
        for (let i = 0; i < 3 && o?.documentName === 'ActiveEffect'; i++) o = o.parent ?? null;
        if (o?.documentName === 'Item') return o;
        if (o?.item?.documentName === 'Item') return o.item;
    }
    return null;
}
const sourceActorOf = item => item?.actor ?? (item?.parent?.documentName === 'Actor' ? item.parent : null);
// The caster's concentration on that spell (dnd5e: statuses concentrating, origin = the item).
function concentrationOn(item) {
    const a = sourceActorOf(item);
    if (!a || !item) return null;
    return a.effects.find(e => (e.statuses?.has?.('concentrating') || e.system?.type === 'concentrating')
        && (e.origin === item.uuid || e.flags?.dnd5e?.item?.id === item.id || e.flags?.dnd5e?.itemData?._id === item.id)) ?? null;
}

// ---------------------------------------------------------------- what is in range
function spellsOnActor(actor) {
    const out = [];
    for (const e of actor?.effects ?? []) {
        if (e.flags?.[MODULE_ID]?.sunlight) continue;          // a sunlight record is listed as an area
        const item = originItem(e);
        const info = spellEffectInfo(e, {kind: 'effect', item});
        if (!info.ok) continue;
        out.push({...info, originUuid: item?.uuid ?? e.origin ?? e.uuid, item, docs: [e.uuid]});
    }
    return groupSpells(out);
}
export function gatherTargets(casterToken, range = DISPEL_RANGE_FT) {
    const creatures = [], areas = [];
    if (!casterToken || !canvas?.scene) return {creatures, areas};
    const scene = canvas.scene;
    const seenActors = new Set();
    for (const t of canvas.tokens.placeables) {
        if (!t.actor) continue;
        const d = t === casterToken ? 0 : tokDist(casterToken, t);
        if (!(d <= range)) continue;
        const spells = [];
        if (!seenActors.has(t.actor.uuid)) { seenActors.add(t.actor.uuid); spells.push(...spellsOnActor(t.actor)); }
        // A spell's summoned creature counts as that spell (dnd5e flags.dnd5e.summon).
        const sItem = t.actor.flags?.dnd5e?.summon ? originItem(t.actor, {summon: true}) : null;
        const sInfo = sItem ? spellEffectInfo(t.actor, {kind: 'summon', item: sItem}) : {ok: false};
        if (sInfo.ok) spells.push({...sInfo, name: sInfo.name + ' (summoned)', originUuid: sItem.uuid, item: sItem, summonToken: t.document.uuid, docs: [t.document.uuid]});
        if (spells.length) creatures.push({key: 'tok:' + t.document.uuid, label: t.document.name, dist: Math.round(d), token: t, spells});
    }
    const casterC = centerOf(casterToken);
    const addArea = (doc, center, radiusFt, kind) => {
        if (!center) return;
        const d = Math.max(0, pxDist(casterC, center) - (Number(radiusFt) || 0));
        if (d > range) return;
        const nix = doc.flags?.[MODULE_ID] ?? {};
        const prism = nix.petraWall?.kind === 'prism';
        const item = originItem(doc);
        const info = prism ? {ok: true, name: nix.petraWall.name ?? 'Prismatic Wall', level: 9, concentration: false} : spellEffectInfo(doc, {kind: 'area', item});
        if (!info.ok) return;
        areas.push({key: kind + ':' + doc.uuid, label: info.name, dist: Math.round(d), prism, doc,
            spells: [{...info, originUuid: item?.uuid ?? doc.uuid, item, docs: [doc.uuid]}]});
    };
    for (const t of scene.templates?.contents ?? []) addArea(t, {x: t.x, y: t.y}, ['circle'].includes(t.t) ? t.distance : 0, 'tpl');
    for (const r of scene.regions?.contents ?? []) {
        const b = r.object?.bounds ?? r.bounds;
        if (b) addArea(r, {x: b.x + b.width / 2, y: b.y + b.height / 2}, Math.hypot(b.width, b.height) / 2 * ftPerPx(), 'region');
    }
    // Sunlight Nix Fix recorded on a caster (no area of its own: Daylight / Dawn / Sunbeam).
    const holders = new Set([...(game.actors?.contents ?? []), ...scene.tokens.filter(t => !t.actorLink && t.actor).map(t => t.actor)]);
    for (const a of holders) for (const e of a.effects ?? []) {
        const rec = e.flags?.[MODULE_ID]?.sunlight;
        if (!rec || e.disabled || (rec.sceneId && rec.sceneId !== scene.id)) continue;
        const tok = rec.anchor === 'caster' ? a.getActiveTokens?.()?.[0] : null;
        const c = tok ? centerOf(tok) : (Number.isFinite(Number(rec.x)) ? {x: Number(rec.x), y: Number(rec.y)} : null);
        if (!c) continue;
        const d = Math.max(0, pxDist(casterC, c) - (Number(rec.radius) || 0));
        if (d > range) continue;
        const item = originItem(e);
        areas.push({key: 'sun:' + e.uuid, label: (rec.name ?? e.name) + ' (sunlight)', dist: Math.round(d), doc: e,
            spells: [{ok: true, name: rec.name ?? e.name, level: Number(rec.level) || item?.system?.level || 3, concentration: !!item?.system?.properties?.has?.('concentration'), originUuid: item?.uuid ?? e.uuid, item, docs: [e.uuid]}]});
    }
    creatures.sort((x, y) => x.dist - y.dist);
    areas.sort((x, y) => x.dist - y.dist);
    return {creatures, areas};
}

// ---------------------------------------------------------------- the pick
async function pickTarget(item, level, {creatures, areas}) {
    const row = (g, i, e) => '<label style="display:flex;gap:.5em;align-items:flex-start;margin:.25em 0"><input type="radio" name="pick" value="' + g + ':' + i + '"' + (g === 'c' && i === 0 && creatures.length ? ' checked' : (g === 'a' && i === 0 && !creatures.length ? ' checked' : '')) + '>'
        + '<span><b>' + esc(e.label) + '</b> <small>(' + e.dist + ' ft)</small><br><small>' + e.spells.map(s => esc(s.name) + ' (level ' + s.level + (s.level <= level ? '' : ', check DC ' + (10 + s.level)) + ')').join(', ') + '</small></span></label>';
    const content = '<p>' + esc(item.name) + ' at level ' + level + ': spells of level ' + level + ' or lower end; higher ones need a spellcasting check (DC 10 + their level).</p>'
        + (creatures.length ? '<h4>Creatures and objects (every spell on it)</h4>' + creatures.map((e, i) => row('c', i, e)).join('') : '')
        + (areas.length ? '<h4>Area spell effects (that one spell)</h4>' + areas.map((e, i) => row('a', i, e)).join('') : '');
    const r = await foundry.applications.api.DialogV2.wait({window: {title: item.name + ': choose one target'}, position: {width: 480}, content, rejectClose: false,
        buttons: [{action: 'ok', label: 'Dispel', icon: 'fa-solid fa-wand-magic-sparkles', default: true, callback: (ev, button) => button.form?.elements?.pick?.value ?? null},
            {action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark'}]});
    if (typeof r !== 'string' || !/^[ca]:\d+$/.test(r)) return null;
    const [g, i] = r.split(':');
    return (g === 'c' ? creatures : areas)[Number(i)] ?? null;
}

// ---------------------------------------------------------------- the checks and the ending
const abilityOf = (item, actor) => item?.system?.ability || item?.system?.availableAbilities?.first?.() || actor?.system?.attributes?.spellcasting
    || ['int', 'wis', 'cha'].sort((a, b) => (actor?.system?.abilities?.[b]?.mod ?? 0) - (actor?.system?.abilities?.[a]?.mod ?? 0))[0];
async function rollCheck(actor, ability, dc, spellName) {
    try {
        const res = await actor.rollAbilityCheck?.({ability, target: dc}, {configure: false}, {data: {flavor: 'Dispel Magic vs ' + spellName + ' (DC ' + dc + ')'}})
            ?? await actor.rollAbilityTest?.(ability, {targetValue: dc, fastForward: true});
        const roll = Array.isArray(res) ? res[0] : res;
        return roll ? {total: Number(roll.total), ok: Number(roll.total) >= dc} : null;
    } catch (err) { console.error(TITLE + ' | Dispel Magic check', err); return null; }
}
// What to delete for one spell: its caster's concentration if it is a concentration spell, else its own documents.
function endPlan(spell) {
    if (spell.concentration && spell.item) {
        const c = concentrationOn(spell.item);
        if (c) return [c.uuid];
    }
    return spell.docs ?? [];
}
async function endOnGM({uuids}) {
    let n = 0;
    for (const u of uuids ?? []) {
        let d = resolve(u);
        if (!d) { try { d = await fromUuid(u); } catch { d = null; } }
        if (!d) continue;
        // Petra's walls refuse deletion for 15 s after the cast unless the end is ours (petra-spells.mjs keepWallArea).
        try { await d.delete(d.flags?.[MODULE_ID]?.petraWall ? {nixWallEnd: true} : {}); n++; } catch (err) { console.warn(TITLE + ' | Dispel Magic end ' + u, err); }
    }
    return n;
}
const endDocs = uuids => (game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id)) ? endOnGM({uuids}) : gm('dispelEnd', {uuids});

export async function dispel(workflow) {
    const item = workflow.item, actor = workflow.actor;
    const level = Number(workflow.castData?.castLevel ?? item?.flags?.dnd5e?.spellLevel?.value ?? item?.system?.level ?? DISPEL_BASE_LEVEL) || DISPEL_BASE_LEVEL;
    const me = workflow.token ?? actor?.getActiveTokens?.()?.[0];
    if (!me) return ui.notifications.warn(item.name + ': the caster needs a token on the scene.');
    const found = gatherTargets(me);
    if (!found.creatures.length && !found.areas.length) {
        return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + esc(item.name) + ':</b> no ongoing spell within ' + DISPEL_RANGE_FT + ' ft.'});
    }
    const target = await pickTarget(item, level, found);
    if (!target) return;
    // Prismatic Wall: Petra's wall code decides (Dispel Magic ends violet, once it is the last layer).
    if (target.prism) {
        const res = await gm('prismHit', {tpl: target.doc.uuid, names: [target.label], damage: {}, spell: 'Dispel Magic', hit: true, attack: false, total: null, by: actor.name, what: item.name});
        if (res === null) ui.notifications.warn(item.name + ': Petra\'s Prismatic Wall code isn\'t running (Court runtime).');
        return;
    }
    const ability = abilityOf(item, actor);
    const lines = [], ended = [], held = [];
    for (const s of planDispel(target.spells, level)) {
        if (s.auto) { await endDocs(endPlan(s)); ended.push(s.name + ' (level ' + s.level + ')'); lines.push(esc(s.name) + ' (level ' + s.level + '): ends.'); continue; }
        const r = await rollCheck(actor, ability, s.dc, s.name);
        if (r?.ok) { await endDocs(endPlan(s)); ended.push(s.name + ' (level ' + s.level + ')'); lines.push(esc(s.name) + ' (level ' + s.level + '): check ' + r.total + ' vs DC ' + s.dc + ', ends.'); }
        else { held.push(s.name + ' (level ' + s.level + ')'); lines.push(esc(s.name) + ' (level ' + s.level + '): check ' + (r ? r.total : 'not rolled') + ' vs DC ' + s.dc + ', holds.'); }
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + esc(item.name) + '</b> (level ' + level + ', ' + String(ability).toUpperCase() + ') on <b>'
        + esc(target.label) + '</b>:<ul><li>' + lines.join('</li><li>') + '</li></ul>'
        + (ended.length ? 'Ended: ' + esc(ended.join(', ')) + '.' : 'Nothing ended.') + (held.length ? ' Still up: ' + esc(held.join(', ')) + '.' : '')});
    return {ended, held};
}

async function onRollComplete(workflow) {
    try {
        if (!isDispelMagic(workflow?.item) || workflow.nixDispelDone || workflow.aborted || workflow.nixCounterspelled) return;
        workflow.nixDispelDone = true;
        await dispel(workflow);
    } catch (err) { console.error(TITLE + ' | Dispel Magic', err); }
}

let registered = false;
export function registerDispelMagic() {
    if (registered || !globalThis.MidiQOL) return null;
    registered = true;
    Hooks.on('midi-qol.RollComplete', onRollComplete);
    addGmHandler('dispelEnd', endOnGM);
    return {isDispelMagic, gatherTargets, dispel};
}
