// =====================================================================
//  NIX FIX: Sunlight Sensitivity vs sunlight spells (1.7.7), every campaign, v13 and v14.
//
//  Chris's Premades 1 (1.5.52) has a generic "Sunlight Sensitivity" (macros/2014/monsterFeatures/generic):
//  disadvantage when the attacker stands in ANY bright light (tokenUtils.getLightLevel), asking a confirm unless
//  set to auto, and only once the Medkit / monster extension has tagged the item. Chris's Premades 2 (2.1.9) and
//  CAT (0.1.9) have none. Neither knows what sunlight is, and neither automates Daylight itself (no CPR Daylight).
//
//  Here, sunlight is the light of a spell whose text says it makes sunlight:
//    Daylight (60-ft sphere, 1 hour), Dawn (30-ft cylinder, concentration), Sunbeam (the 30-ft mote of sunlight
//    around the caster, concentration), plus any other spell in the world whose description says "sunlight" and that
//    lasts (Sunburst is instantaneous: nothing lingers). Where the light is:
//    - the spell's own area: its template (v13) or Region (v14), found the way the Daylight dispel macro finds it
//      (workflow.template / a Region whose flags name the spell); tagged flags.nix-module.sunlight;
//    - otherwise (the D&D Beyond Daylight item has no area template) a record on the caster: an effect
//      "<spell>: sunlight" with the spell's duration (ends with concentration), centred where the caster stood
//      (Daylight, Dawn) or on the caster (Sunbeam's mote).
//  Real sunlight (an outdoor scene by day): a Region the GM draws and names "Sunlight" or "Daylight" (any shape;
//  cover the whole map for a sunny scene). Same rules as a spell's sunlight.
//  A creature with a feature named "Sunlight Sensitivity" (or Vampire Weakness, 1.7.7: always every ability check;
//  its 20 radiant damage at the start of its turn is vampire-weakness.mjs):
//    - attack rolls: disadvantage while it is in sunlight, or, when the feature text says so, while its target is
//      (Midi's attack tracker in midi-qol.preAttackRollConfig, awaited by Midi v13 branch and 14.7.0 AttackActivity,
//      read back into config.disadvantage after the hook);
//    - checks: Wisdom (Perception) disadvantage while in sunlight (flags.midi-qol.disadvantage.skill.prc), or every
//      ability check when the feature text says "ability checks" (2024: flags.midi-qol.disadvantage.check.all), as an
//      effect the active GM keeps in step when tokens move or sunlight appears / ends. "That rely on sight" is the GM's call.
//  API: game.modules.get('nix-module').api.sunlight
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';
import {fx, MODES} from './court/engine.mjs';

export const FLAG = 'sunlight';
const EFFECT_FLAG = 'sunlightSensitive';
// Spells known to make sunlight, and how big their light is when Nix Fix has to place it itself.
export const KNOWN = Object.freeze({daylight: {radius: 60, anchor: 'point'}, dawn: {radius: 30, anchor: 'point'}, sunbeam: {radius: 30, anchor: 'caster'}, sunburst: {radius: 60, instant: true}});
const keyOf = name => String(name ?? '').toLowerCase().replace(/\(.*$/, '').replace(/[^a-z]/g, '');
const textOf = item => String(item?.system?.description?.value ?? '').replace(/<[^>]+>/g, ' ');
const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);

// ---------------------------------------------------------------- pure helpers (tested)
// Is this item a spell that makes sunlight? Returns {radius, anchor, instant} or null.
export function sunlightSpell(item) {
    if (!item || item.type !== 'spell') return null;
    const k = KNOWN[keyOf(item.name)];
    if (k) return {...k, name: item.name};
    const t = textOf(item);
    if (!/\bsunlight\b/i.test(t.replace(/sunlight sensitivity/gi, ''))) return null;
    const units = item.system?.duration?.units;
    const instant = !units || units === 'inst';
    const r = Number(t.match(/(\d+)[- ]f(?:oo|ee)?t[- ](?:radius|emanation|sphere|cylinder)/i)?.[1]) || 30;
    return {radius: r, anchor: 'point', instant, name: item.name};
}
// What the creature's Sunlight Sensitivity text covers. Vampire Weakness (Monster Manual 2024, 1.7.7) counts too:
// "While in sunlight, it has Disadvantage on attack rolls and ability checks" (every check, whatever its text says).
export const isVampireWeakness = i => !!i?.flags?.[MODULE_ID]?.vampireWeakness || /^vampire weakness/i.test(String(i?.name ?? '').trim());
export function sensitivityOf(actor) {
    const list = Array.from(actor?.items ?? []);
    const ss = list.find(i => /sunlight sensitivity/i.test(i.name ?? '')), vw = list.find(isVampireWeakness);
    const item = ss ?? vw;
    if (!item) return null;
    const t = ss ? textOf(ss) : '';
    return {item, vampire: !!vw, targetToo: /target[^.]*\bsunlight|\bsunlight[^.]*\btarget/i.test(t), allChecks: !!vw || /ability checks/i.test(t)};
}
// A Region drawn by the GM for real sunlight (an outdoor scene by day): its name says Sunlight or Daylight.
export const isSunlightRegionName = name => /\b(sun ?light|day ?light)\b/i.test(String(name ?? ''));
// sources: [{x, y, radiusFt}] or [{test(point)}]; point {x, y} in px; ftPerPx: feet per pixel.
export function inSunlight(point, sources, ftPerPx) {
    if (!point) return false;
    for (const s of sources ?? []) {
        if (typeof s.test === 'function') { if (s.test(point)) return true; continue; }
        const d = Math.hypot(Number(s.x) - point.x, Number(s.y) - point.y) * ftPerPx;
        if (Number.isFinite(d) && d <= Number(s.radiusFt) + 1e-6) return true;
    }
    return false;
}
// The check effect a creature in sunlight carries.
export function checkEffect(sens, source) {
    return {name: 'In sunlight (' + (sens?.item?.name ?? 'Sunlight Sensitivity') + ')', img: 'icons/magic/light/explosion-star-glow-yellow.webp', origin: sens?.item?.uuid, transfer: false, disabled: false,
        duration: {seconds: 3600}, description: '<p>In sunlight' + (source ? ' (' + source + ')' : '') + ': disadvantage on '
            + (sens?.allChecks ? 'ability checks' : 'Wisdom (Perception) checks that rely on sight') + '. Attack rolls get disadvantage when they are made.</p>',
        changes: [{key: sens?.allChecks ? 'flags.midi-qol.disadvantage.check.all' : 'flags.midi-qol.disadvantage.skill.prc', mode: MODES.OVERRIDE, value: '1', priority: 20}],
        flags: {[MODULE_ID]: {[EFFECT_FLAG]: true}}};
}

// ---------------------------------------------------------------- where the sunlight is (canvas)
export const ftPerPx = () => (canvas?.dimensions?.distance ?? 5) / (canvas?.dimensions?.size ?? 100);
export const centerOf = tok => tok?.center ?? (tok?.document ? {x: tok.document.x + (tok.document.width * canvas.grid.size) / 2, y: tok.document.y + (tok.document.height * canvas.grid.size) / 2} : null);
function originItem(doc) {
    const o = doc?.flags?.dnd5e?.origin ?? doc?.flags?.['midi-qol']?.originUuid ?? doc?.flags?.cat?.originUuid ?? doc?.flags?.['chris-premades']?.originUuid;
    if (!o) return null;
    try { const d = fromUuidSync(o, {strict: false}); return d?.documentName === 'Item' ? d : (d?.item ?? d?.parent ?? null); } catch { return null; }
}
export const regionTest = r => point => { try { return r.object?.testPoint?.({...point, elevation: 0}) ?? r.testPoint?.({...point, elevation: 0}) ?? false; } catch { return false; } };
function regionBox(r) { const b = r.object?.bounds ?? r.bounds; return b ? {x: b.x + b.width / 2, y: b.y + b.height / 2, radiusFt: Math.max(b.width, b.height) / 2 * ftPerPx()} : null; }
export function sunlightSources(scene = canvas?.scene) {
    if (!scene) return [];
    const out = [];
    // Templates (v13) and Regions (v14) that are a sunlight spell's area.
    for (const t of scene.templates?.contents ?? []) {
        const tag = t.flags?.[MODULE_ID]?.[FLAG];
        const sp = tag ?? sunlightSpell(originItem(t)) ?? (KNOWN[keyOf(t.flags?.['chris-premades']?.template?.name)] ? {} : null);
        if (!sp || sp.instant) continue;
        const shape = t.object?.shape;
        out.push(shape && ['ray', 'rect', 'cone'].includes(t.t) ? {test: p => shape.contains(p.x - t.x, p.y - t.y), label: sp.name ?? 'sunlight'}
            : {x: t.x, y: t.y, radiusFt: Number(t.distance) || sp.radius || 30, label: sp.name ?? 'sunlight'});
    }
    for (const r of scene.regions?.contents ?? []) {
        const tag = r.flags?.[MODULE_ID]?.[FLAG];
        const sp = tag ?? sunlightSpell(originItem(r)) ?? (isSunlightRegionName(r.name) ? {name: r.name} : null);
        if (!sp || sp.instant) continue;
        const test = regionTest(r), box = regionBox(r);
        out.push({test: p => test(p) || (!r.object && !!box && inSunlight(p, [box], ftPerPx())), label: sp.name ?? 'sunlight'});
    }
    // Records on casters (no area of its own): a fixed point, or the caster's token (Sunbeam's mote).
    const holders = new Set([...(game.actors?.contents ?? []), ...scene.tokens.filter(t => !t.actorLink && t.actor).map(t => t.actor)]);
    for (const a of holders) for (const e of a.effects ?? []) {
        const rec = e.flags?.[MODULE_ID]?.[FLAG];
        if (!rec || e.disabled || (rec.sceneId && rec.sceneId !== scene.id)) continue;
        if (rec.anchor === 'caster') {
            const tok = a.getActiveTokens?.()?.find(t => t.document?.parent?.id === scene.id) ?? null;
            const c = centerOf(tok);
            if (c) out.push({x: c.x, y: c.y, radiusFt: Number(rec.radius) || 30, label: rec.name});
        } else if (Number.isFinite(Number(rec.x))) out.push({x: Number(rec.x), y: Number(rec.y), radiusFt: Number(rec.radius) || 60, label: rec.name});
    }
    return out;
}
export const tokenInSunlight = (tok, sources = sunlightSources()) => inSunlight(centerOf(tok), sources, ftPerPx());

// ---------------------------------------------------------------- a sunlight spell is cast: remember where
const wait = ms => new Promise(r => setTimeout(r, ms));
async function onRollFinished(workflow) {
    try {
        const item = workflow?.item;
        const sp = sunlightSpell(item);
        if (!sp || sp.instant || !workflow.actor) return;
        if (/\b(move|end turn|new)\b/i.test(workflow.activity?.name ?? '')) return;   // Dawn: Move / End Turn, Sunbeam: Create New Sunbeam (the light is already there)
        const level = Number(workflow.castData?.castLevel ?? item.system?.level ?? 0);
        const tag = {name: item.name, level, radius: sp.radius, caster: workflow.actor.uuid};
        // 1. The spell's own area (Sunbeam's line is not its sunlight: its mote is on the caster).
        if (sp.anchor !== 'caster') {
            const tpl = workflow.template ?? null;
            if (tpl?.update && tpl.isOwner) { await tpl.update({['flags.' + MODULE_ID + '.' + FLAG]: tag}); return refresh(); }
            if (canvas?.scene?.regions) {
                await wait(300);
                const r = canvas.scene.regions.contents.filter(x => !x.flags?.[MODULE_ID]?.[FLAG] && JSON.stringify(x.flags ?? {}).includes(item.uuid)).at(-1);
                if (r?.isOwner) { await r.update({['flags.' + MODULE_ID + '.' + FLAG]: tag}); return refresh(); }
            }
        }
        // 2. No area: a record on the caster, for the spell's duration (ends with concentration).
        const tok = workflow.token ?? workflow.actor.getActiveTokens?.()?.[0];
        const c = centerOf(tok);
        if (!c && sp.anchor !== 'caster') return;
        const d = item.system?.duration ?? {};
        const mult = {minute: 60, hour: 3600, day: 86400, round: 6, turn: 6}[d.units];
        const seconds = mult ? mult * (Number(d.value) || 1) : 3600;
        const old = workflow.actor.effects.filter(e => e.flags?.[MODULE_ID]?.[FLAG]?.name === item.name).map(e => e.id);
        if (old.length) await workflow.actor.deleteEmbeddedDocuments('ActiveEffect', old);
        const [eff] = await workflow.actor.createEmbeddedDocuments('ActiveEffect', [fx({name: item.name + ': sunlight', img: item.img, origin: item.uuid, transfer: false, disabled: false,
            duration: {seconds}, description: '<p>' + item.name + ': sunlight, ' + sp.radius + '-ft radius ' + (sp.anchor === 'caster' ? 'around ' + workflow.actor.name : 'where it was cast')
                + '. Creatures with Sunlight Sensitivity in it have disadvantage (Nix Fix). Delete this effect when the light ends early.</p>',
            flags: {[MODULE_ID]: {[FLAG]: {...tag, anchor: sp.anchor, sceneId: canvas?.scene?.id ?? null, x: c?.x ?? null, y: c?.y ?? null}}}})]);
        const conc = item.system?.properties?.has?.('concentration') && (workflow.actor.concentration?.effects ?? new Set());
        const ce = conc ? Array.from(conc).find(e => e.flags?.dnd5e?.item?.id === item.id || e.origin === item.uuid) ?? Array.from(conc).at(-1) : null;
        if (ce && eff && typeof ce.addDependent === 'function') await ce.addDependent(eff).catch(() => {});
        refresh();
    } catch (err) { console.error(TITLE + ' | sunlight record', err); }
}

// ---------------------------------------------------------------- attack rolls
async function onPreAttackConfig(workflow) {
    try {
        const sens = sensitivityOf(workflow?.actor);
        if (!sens) return;
        const tracker = workflow.attackRollModifierTracker ?? workflow.tracker;
        if (!tracker?.disadvantage?.add) return;
        const sources = sunlightSources();
        if (!sources.length) return;
        const me = workflow.token ?? workflow.actor.getActiveTokens?.()?.[0];
        let why = tokenInSunlight(me, sources) ? 'in sunlight' : null;
        if (!why && sens.targetToo && Array.from(workflow.targets ?? []).some(t => tokenInSunlight(t, sources))) why = 'target in sunlight';
        if (!why) return;
        tracker.disadvantage.add('nixSunlightSensitivity', 'Sunlight Sensitivity (' + why + ')');
        workflow.advReminderAttackAdvAttribution?.add?.('DIS:Sunlight Sensitivity');
    } catch (err) { console.error(TITLE + ' | Sunlight Sensitivity attack', err); }
}

// ---------------------------------------------------------------- checks: keep the effect in step (active GM)
let timer = null, chain = Promise.resolve();
export function refresh(delay = 200) {
    if (!isActiveGM()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { chain = chain.then(sync).catch(err => console.error(TITLE + ' | sunlight sync', err)); }, delay);
}
async function sync() {
    if (!isActiveGM() || !canvas?.scene) return;
    const sources = sunlightSources();
    const done = new Set();
    for (const t of canvas.tokens.placeables) {
        const a = t.actor;
        if (!a || done.has(a.uuid)) continue;
        done.add(a.uuid);
        const have = a.effects.filter(e => e.flags?.[MODULE_ID]?.[EFFECT_FLAG]);
        const sens = sensitivityOf(a);
        const lit = !!sens && sources.length > 0 && tokenInSunlight(t, sources);
        if (lit && !have.length) await a.createEmbeddedDocuments('ActiveEffect', [fx(checkEffect(sens, sources.find(s => inSunlight(centerOf(t), [s], ftPerPx()))?.label))]);
        else if (!lit && have.length) await a.deleteEmbeddedDocuments('ActiveEffect', have.map(e => e.id));
        else if (have.length > 1) await a.deleteEmbeddedDocuments('ActiveEffect', have.slice(1).map(e => e.id));
    }
}
const moved = (doc, changed) => { if (['x', 'y', 'elevation', 'width', 'height'].some(k => k in (changed ?? {}))) refresh(300); };
const touched = (doc, changed) => { if (doc?.flags?.[MODULE_ID]?.[FLAG] || sunlightSpell(originItem(doc)) || (doc?.documentName === 'Region' && (isSunlightRegionName(doc.name) || 'name' in (changed ?? {})))) refresh(300); };
const effectTouched = e => { if (e?.flags?.[MODULE_ID]?.[FLAG]) refresh(300); };

let registered = false;
export function registerSunlight() {
    if (registered || !globalThis.MidiQOL) return null;
    registered = true;
    Hooks.on('midi-qol.preAttackRollConfig', onPreAttackConfig);
    Hooks.on('midi-qol.RollComplete', onRollFinished);
    Hooks.on('updateToken', moved);
    for (const h of ['createMeasuredTemplate', 'updateMeasuredTemplate', 'deleteMeasuredTemplate', 'createRegion', 'updateRegion', 'deleteRegion']) Hooks.on(h, touched);
    for (const h of ['createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) Hooks.on(h, effectTouched);
    Hooks.on('createToken', () => refresh(300));
    Hooks.on('canvasReady', () => refresh(800));
    refresh(1500);
    return {KNOWN, sunlightSpell, sensitivityOf, inSunlight, sunlightSources, tokenInSunlight, refresh};
}
