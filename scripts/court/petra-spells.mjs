// =====================================================================
//  NIX FIX: Petra's spells (Court of Ravenloft). v13 (Midi QOL / Chris's Premades 1) and
//  v14 (CAT): helpers go through engine.mjs. v13 walls live on MeasuredTemplates; on v14
//  dnd5e places Regions instead (a wall is a Region "line" shape: origin, rotation, length),
//  and the wall state lives on the Region the same way. Same rules on both.
//  Acts only on spells the "Petra: spells" installer marked (flags.nix-module.petraSpell).
//  v14: steps aside on a spell that carries Chris's Premades 2's own automation again
//  (re-applied in the Medkit to try theirs), so the two never both run.
//
//  Wall of Death (MCDM homebrew): the spell's own save activity does the first save.
//    The wall remembers its damaging side; a creature that ends its turn inside the
//    wall or within 10 ft of that side, or enters the wall for the first time on a
//    turn, takes the spell's damage (save or not, as the spell text says). Ring walls:
//    inside or outside. Ends with concentration.
//  Negative Energy Flood: undead targets make no save and gain half the damage roll
//    as temporary HP; a creature it kills rises as a Zombie at the start of the
//    caster's next turn (GM confirms).
//  Finger of Death: a Humanoid it kills rises as a Zombie under the caster's command.
//  Sorcerous Burst: 8s on the d8s explode, up to the spellcasting modifier in extra d8s.
//  Prismatic Wall: wall or globe, see-through, bright/dim light.
//    Creatures the caster designates (her side when cast) are unharmed. Others:
//    Con save or Blinded 1 minute when it appears within 20 ft, on coming within 20 ft
//    or starting a turn there; walking through runs every intact layer in order (Dex
//    save each): damage layers, Indigo restraint (3 successes / 3 failures -> Petrified),
//    Violet blindness and plane shift. Attacks (melee too, even out of reach) and spells
//    aimed across the wall hit the outermost layer instead (AC 10; damage layers have HP
//    20-60 worn down by their type), teleports stop at the wall and meet the outermost
//    layer. The globe is 70 ft across, 10 ft less per fallen layer. "Destroy a layer / end".
//  Turn and movement checks run on the active GM; the cast-time parts on the caster's client.
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {isActiveGM} from './illrigger.mjs';
import {addGmHandler, gm} from './lieutenants.mjs';
import {cpr, creatureTypeOf, fxAll, HOOKS, isCat} from './engine.mjs';

export const FLAG = 'petraSpell';
const WALL = 'petraWall';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
// Chris's Premades 2 automates Wall of Death / Prismatic Wall itself on v14 (flags.cat.macros).
// Re-applied there to try theirs, ours stays out of it.
export const cpr2Owns = item => Object.values(item?.flags?.cat?.macros ?? {}).flat()
    .some(m => m?.source === 'chris-premades' && /wall-of-death|prismatic-wall/.test(m?.identifier ?? ''));
const cfgOf = item => cpr2Owns(item) ? null : (item?.flags?.[MODULE_ID]?.[FLAG] ?? null);
const kindOf = item => cfgOf(item)?.kind ?? null;
const actKind = act => act?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const inCombat = () => !!game.combat?.started;
const turnKey = () => inCombat() ? game.combat.id + ':' + game.combat.round + ':' + game.combat.turn : 'none:' + Math.floor(Date.now() / 6000);
const typeOf = actor => creatureTypeOf(actor);
const chat = (actor, html) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: html});
const gmWhisper = html => ChatMessage.create({whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content: html});
const gmId = () => game.users.activeGM?.id ?? game.user.id;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- geometry (pure, px; exported for tests)
export function shapeOf(t, grid) {
    const pxft = grid.size / grid.distance;
    if (t.t === 'circle') return {type: 'circle', c: {x: t.x, y: t.y}, r: Number(t.distance) * pxft};
    const th = Number(t.direction ?? 0) * Math.PI / 180, len = Number(t.distance) * pxft;
    return {type: 'line', a: {x: t.x, y: t.y}, b: {x: t.x + Math.cos(th) * len, y: t.y + Math.sin(th) * len}};
}
function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    return Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy));
}
export const distTo = (p, s) => s.type === 'circle' ? Math.abs(Math.hypot(p.x - s.c.x, p.y - s.c.y) - s.r) : segDist(p, s.a, s.b);
// +1 / -1. Line: sign of the cross product. Circle: outside +1, inside -1.
export const sideOf = (p, s) => s.type === 'circle'
    ? (Math.hypot(p.x - s.c.x, p.y - s.c.y) < s.r ? -1 : 1)
    : (((s.b.x - s.a.x) * (p.y - s.a.y) - (s.b.y - s.a.y) * (p.x - s.a.x)) >= 0 ? 1 : -1);
const orient = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
export function segCross(p, q, a, b) {
    const o1 = orient(p, q, a), o2 = orient(p, q, b), o3 = orient(a, b, p), o4 = orient(a, b, q);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
// Did a move from p to q go through the wall?
export function crosses(p, q, s) {
    if (s.type === 'line') return segCross(p, q, s.a, s.b);
    const dp = Math.hypot(p.x - s.c.x, p.y - s.c.y) - s.r, dq = Math.hypot(q.x - s.c.x, q.y - s.c.y) - s.r;
    return (dp < 0) !== (dq < 0);
}
export function sideLabels(s) {
    if (s.type === 'circle') return {'1': 'outside', '-1': 'inside'};
    const n = {x: -(s.b.y - s.a.y), y: s.b.x - s.a.x};   // points to side +1 (y grows downward)
    const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    const i = Math.round(((Math.atan2(n.y, n.x) * 180 / Math.PI) + 360) % 360 / 45) % 8;
    return {'1': names[i], '-1': names[(i + 4) % 8]};
}
// Wall of Death's harm zone: inside the wall, or within `reach` px on the damaging side.
export function inDeathZone(p, rad, s, side, reach) {
    const d = distTo(p, s);
    if (d <= rad) return true;
    if (d > rad + reach) return false;
    return sideOf(p, s) === side;
}
// v14 Region shape (px): line = origin + rotation (degrees) + length; circle / ring / emanation = centre + radius.
export function regionShape(sh) {
    if (!sh) return null;
    if (sh.type === 'line' || sh.type === 'cone') {
        const th = Number(sh.rotation ?? 0) * Math.PI / 180, len = Number(sh.type === 'line' ? sh.length : sh.radius) || 0;
        const a = {x: Number(sh.x), y: Number(sh.y)};
        return {type: 'line', a, b: {x: a.x + Math.cos(th) * len, y: a.y + Math.sin(th) * len}};
    }
    if (sh.type === 'emanation') return regionShape({...sh, type: 'circle', x: sh.base?.x ?? sh.x, y: sh.base?.y ?? sh.y});
    if (sh.type === 'rectangle') {
        const w = Number(sh.width) || 0, h = Number(sh.height) || 0;
        return {type: 'circle', c: {x: Number(sh.x) + w / 2, y: Number(sh.y) + h / 2}, r: Math.max(w, h) / 2};
    }
    return {type: 'circle', c: {x: Number(sh.x), y: Number(sh.y)}, r: Number(sh.radius) || 0};
}
export const midpoint = s => s.type === 'circle' ? {...s.c} : {x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2};

// ---------------------------------------------------------------- canvas helpers
const pxft = () => canvas.dimensions.size / canvas.dimensions.distance;
const gridOf = () => ({size: canvas.dimensions.size, distance: canvas.dimensions.distance});
const centerOf = doc => ({x: doc.x + (doc.width ?? 1) * canvas.dimensions.size / 2, y: doc.y + (doc.height ?? 1) * canvas.dimensions.size / 2});
const radiusOf = doc => Math.max(doc.width ?? 1, doc.height ?? 1) * canvas.dimensions.size / 2;
const wallState = tpl => tpl?.flags?.[MODULE_ID]?.[WALL] ?? null;
// The documents a wall can live on: MeasuredTemplates (v13) or Regions (v14).
const areas = scene => (isCat() ? scene?.regions : scene?.templates) ?? [];
const areaAlive = doc => !!doc && !!areas(doc.parent)?.get?.(doc.id);
const walls = (kind, scene = canvas.scene) => Array.from(areas(scene)).filter(t => wallState(t)?.kind === kind);
// A wall's geometry in px, from a template or a Region.
const geom = doc => Array.isArray(doc?.shapes) || doc?.shapes?.length !== undefined
    ? regionShape(doc.shapes[0] ?? doc.shapes.contents?.[0]) : shapeOf(doc, gridOf());
const casterOf = st => { try { return fromUuidSync(st.caster); } catch { return null; } };
const tokenOfActor = actor => actor?.token?.object ?? actor?.getActiveTokens?.()[0] ?? null;
const alive = doc => (doc?.actor?.system?.attributes?.hp?.value ?? 1) > 0;

// v14: the Region dnd5e placed for this activity (dnd5e.postCreateMeasuredTemplate hands it over).
const placed = new Map();   // activity uuid -> RegionDocument
function onRegionsPlaced(activity, created) {
    const r = Array.from(created ?? []).at(-1);
    if (activity?.uuid && r) placed.set(activity.uuid, r);
}
async function regionOf(wf) {
    const uuid = wf.activity?.uuid;
    for (let i = 0; i < 15; i++) {
        let r = wf.template?.document ?? wf.template;
        if (!r?.shapes && wf.templateUuids?.length) r = fromUuidSync(wf.templateUuids.at(-1));
        if (!r?.shapes && uuid) r = placed.get(uuid) ?? Array.from(canvas.scene?.regions ?? []).filter(x => x.flags?.dnd5e?.activity === uuid).at(-1);
        if (r?.shapes && areaAlive(r)) { if (uuid) placed.delete(uuid); return r; }
        await sleep(200);
    }
    return null;
}
async function templateOf(wf) {
    if (isCat()) return regionOf(wf);
    let t = wf.template;
    for (let i = 0; i < 15 && !t; i++) {
        await sleep(200);
        t = wf.template ?? (wf.templateUuid ? fromUuidSync(wf.templateUuid) : null);
    }
    return t?.document ?? t ?? null;
}
async function setTargets(wf, tokens) {
    if (cpr()?.workflowUtils?.updateTargets) return cpr().workflowUtils.updateTargets(wf, tokens);
    wf.targets = new Set(tokens);
}

// A save (and damage) rolled as a Midi workflow from the caster, so players get their normal save prompts.
async function hurt(caster, tokens, {name, img, formula, type, ability, dc, onSave = 'half', save = true}) {
    if (!tokens.length || !cpr()?.workflowUtils?.syntheticItemDataRoll) return new Set();
    const id = 'nixPetraSpell000';
    const parts = formula ? [{custom: {enabled: true, formula: String(formula)}, types: [type]}] : [];
    const act = {_id: id, name, activation: {type: 'special'}, range: {units: 'any'},
        target: {affects: {count: String(tokens.length), type: 'creature'}}};
    if (save) Object.assign(act, {type: 'save', save: {ability: [ability], dc: {calculation: '', formula: String(dc)}}, damage: {onSave, parts}});
    else Object.assign(act, {type: 'damage', damage: {parts}});
    const itemData = {name, img: img ?? 'icons/magic/unholy/barrier-shield-dome-deflect-teal.webp', type: 'feat',
        system: {activities: {[id]: act}}, flags: {[MODULE_ID]: {petraSynthetic: true}, autoanimations: {isEnabled: false, version: 5}}};
    try {
        const wf = await cpr().workflowUtils.syntheticItemDataRoll(itemData, caster, tokens);
        return new Set(Array.from(wf?.failedSaves ?? []).map(t => t.document?.id ?? t.id));
    } catch (err) {
        console.error(TITLE + ' | ' + name, err);
        return new Set();
    }
}
async function addEffect(actor, data) {
    if (actor.isOwner) return (await actor.createEmbeddedDocuments('ActiveEffect', fxAll([data])))?.[0]?.id ?? null;
    return gm('effect', {actor: actor.uuid, data});
}
const dcOf = (caster, item) => Number(item?.system?.activities?.find?.(a => a.save?.dc?.value)?.save.dc.value
    ?? caster?.system?.attributes?.spell?.dc ?? 15);

// ---------------------------------------------------------------- cast-time (caster's client)
async function onPreamble(wf) {
    try {
        if (!wf?.item) return;
        restoreReach(wf.actor);
        const kind = kindOf(wf.item);
        if (kind === 'wallOfDeath' && actKind(wf.activity) === 'ring') return await ringTargets(wf);
        if (kind === 'negativeFlood') return await floodSplit(wf);
        if (kind === 'vileBook' && actKind(wf.activity) === 'darkSpeech') return await darkSpeechTargets(wf);
        if (wf.targets?.size && walls('prism').length) return await prismBlock(wf);
    } catch (err) { console.error(TITLE + ' | Petra spells preamble', err); }
}

// Ring wall: only creatures on the ring are in the wall's area.
async function ringTargets(wf) {
    const tpl = await templateOf(wf);
    if (!tpl) return;
    const s = geom(tpl);
    const keep = Array.from(wf.targets ?? []).filter(t => distTo(centerOf(t.document), s) <= radiusOf(t.document) + pxft() * 0.5);
    await setTargets(wf, keep);
}

// Negative Energy Flood: undead don't save; they get temp HP after the roll.
async function floodSplit(wf) {
    const all = Array.from(wf.targets ?? []);
    const undead = all.filter(t => typeOf(t.actor) === 'undead');
    if (!undead.length) return;
    wf.nixFloodUndead = undead.map(t => t.document.uuid);
    await setTargets(wf, all.filter(t => !undead.includes(t)));
}

// Book of Vile Darkness, Dark Speech (1.7.5): evil creatures and the reader herself aren't harmed.
export const isEvil = actor => /(^|[^a-z])evil([^a-z]|$)/i.test(String(actor?.system?.details?.alignment ?? ''));
async function darkSpeechTargets(wf) {
    const all = Array.from(wf.targets ?? []);
    const keep = all.filter(t => t.actor && t.actor.uuid !== wf.actor?.uuid && !isEvil(t.actor));
    if (keep.length !== all.length) await setTargets(wf, keep);
}
// ...and she takes 1d12 psychic each time (no save).
async function darkSpeechBacklash(wf) {
    const me = wf.token ?? tokenOfActor(wf.actor);
    if (!me) return;
    await hurt(wf.actor, [me], {name: 'Dark Speech (backlash)', img: wf.item.img, formula: '1d12', type: 'psychic', save: false});
}

// Prismatic Wall (1.7.5, Nix 2026-11-20): nothing reaches a creature behind the wall (or inside / outside the globe)
// while any layer stands. An attack or spell by anyone not on Petra's side aimed across it loses those targets and
// hits the outermost layer instead (auto-redirect, no dialog): attacks roll against AC 10, then the damage of the
// roll (or the spell used) is checked against that layer's destroy condition after the roll (resolvePrismHits).
// The wall the line crosses first (nearest the attacker) takes the hit; several targets behind it = one hit.
// The Prismatic Wall between an attacker and a target (the one nearest the attacker), or null.
function prismWallBetween(from, to, moverUuid) {
    let best = null;
    for (const tpl of walls('prism')) {
        const st = wallState(tpl), s = geom(tpl);
        if (st.allowed?.includes(moverUuid) || !(st.layers ?? []).length) continue;
        if (!crosses(from, to, s)) continue;
        const d = distTo(from, s);
        if (!best || d < best.d) best = {tpl, d};
    }
    return best;
}
async function prismBlock(wf) {
    const me = wf.token ?? tokenOfActor(wf.actor);
    if (!me || wf.item?.flags?.[MODULE_ID]?.petraSynthetic) return;
    const from = centerOf(me.document ?? me);
    const hits = new Map();   // wall uuid -> target names
    const keep = Array.from(wf.targets).filter(t => {
        const tdoc = t.document ?? t;
        if (tdoc.id === (me.document ?? me).id) return true;
        const best = prismWallBetween(from, centerOf(tdoc), (me.document ?? me).uuid);
        if (!best) return true;
        const list = hits.get(best.tpl.uuid) ?? [];
        list.push(tdoc.name);
        hits.set(best.tpl.uuid, list);
        return false;
    });
    if (!hits.size) return;
    wf.nixPrismHits = Array.from(hits, ([tpl, names]) => ({tpl, names}));
    await setTargets(wf, keep);
}

// Melee at the wall (Nix 2026-11-20): a melee attack at a creature across the wall (inside the globe) goes ahead even
// out of reach and hits the wall. Midi checks melee reach before our preamble (postChatCardChecks, v13 and 14.7),
// after its preItemRoll hook, and adds flags.midi-qol.range.<mwak|msak> to the reach. So at preItemRoll the actor
// gets, in memory only (never saved), exactly the extra feet those targets need; preamble (or 20 s) puts it back.
export const MELEE_TYPES = ['mwak', 'msak'];
export function reachNeeded(fromPx, targetsPx, pxPerFt) {
    return Math.ceil(Math.max(0, ...targetsPx.map(p => Math.hypot(p.x - fromPx.x, p.y - fromPx.y) / pxPerFt)));
}
const reachSaved = new Map();   // actor uuid -> {key, had, prev, timer}
function restoreReach(actor) {
    const r = actor ? reachSaved.get(actor.uuid) : null;
    if (!r) return;
    reachSaved.delete(actor.uuid);
    clearTimeout(r.timer);
    const range = actor.flags?.['midi-qol']?.range;
    if (!range) return;
    if (r.had) range[r.key] = r.prev; else delete range[r.key];
}
function onPreItemRoll(data) {
    try {
        const wf = data?.workflow;
        const act = wf?.activity, actor = wf?.actor;
        if (!act?.attack || !MELEE_TYPES.includes(act.actionType) || !actor || !walls('prism').length) return;
        const me = wf.token ?? tokenOfActor(actor);
        if (!me) return;
        const meDoc = me.document ?? me, from = centerOf(meDoc);
        const pool = wf.targets?.size ? wf.targets : game.user?.targets;
        const across = Array.from(pool ?? []).map(t => t.document ?? t)
            .filter(td => td?.id !== meDoc.id && prismWallBetween(from, centerOf(td), meDoc.uuid)).map(centerOf);
        const need = reachNeeded(from, across, pxft());
        if (!need) return;
        restoreReach(actor);
        actor.flags['midi-qol'] ??= {};
        const range = actor.flags['midi-qol'].range ??= {};
        const key = act.actionType, had = key in range, prev = range[key];
        range[key] = had && prev ? '(' + prev + ') + ' + need : String(need);
        reachSaved.set(actor.uuid, {key, had, prev, timer: setTimeout(() => restoreReach(actor), 20000)});
    } catch (err) { console.error(TITLE + ' | Prismatic Wall melee reach', err); }
}

// Globe size (Nix 2026-11-20): 70 ft across when cast, 10 ft less per fallen layer, 10 ft with only violet left:
// radius = 5 ft per layer left. The straight wall keeps its placed length.
export const globeRadiusFt = layersLeft => 5 * Math.max(1, Number(layersLeft) || 0);
// Update data that sets a globe's radius: MeasuredTemplate `distance` (ft) or the Region's first shape (px).
export function globeResize(doc, ft, pxPerFt) {
    const shapes = doc?.toObject?.().shapes ?? (Array.isArray(doc?.shapes) ? doc.shapes : null);
    if (!shapes) return {distance: ft};
    return {shapes: shapes.map((sh, i) => {
        if (i) return sh;
        const out = {...sh};
        if ('radiusX' in out || 'radiusY' in out) { out.radiusX = ft * pxPerFt; out.radiusY = ft * pxPerFt; }
        else out.radius = ft * pxPerFt;
        return out;
    })};
}
async function sizeGlobe(tpl, layersLeft) {
    try {
        const data = globeResize(tpl, globeRadiusFt(layersLeft), pxft());
        if (tpl.isOwner) await tpl.update(data); else await gm('update', {uuid: tpl.uuid, data});
    } catch (err) { console.error(TITLE + ' | Prismatic Wall globe size', err); }
}

export const PRISM_AC = 10;
// Nix 2026-11-20: a natural 1 misses, a critical always hits, otherwise total vs AC 10.
export const prismAttackHits = ({total, critical, fumble}) => !fumble && (!!critical || Number(total) >= PRISM_AC);
// Nix 2026-11-20: a damage layer has hit points (its threshold) that only its damage type wears down, hit after hit
// (red 25 cold, ...). `taken` = that type's damage the layer already took. Other types do nothing. No carry-over:
// the rest of a breaking hit doesn't reach the next layer. Indigo / violet: the spell breaks them.
export function layerHit(key, {damage = {}, spell = '', taken = 0} = {}) {
    const L = LAYERS.find(l => l.key === key);
    if (!L) return {broken: false, dealt: 0, taken: 0, left: null};
    if (L.breakSpell) return {broken: L.breakSpell.test(String(spell).trim()), dealt: 0, taken: 0, left: null};
    const dealt = Math.max(0, Number(damage[L.breakType]) || 0);
    const total = (Number(taken) || 0) + dealt;
    return {broken: total >= L.breakMin, dealt, taken: Math.min(total, L.breakMin), left: Math.max(0, L.breakMin - total)};
}
export const layerBreaks = (key, opts) => layerHit(key, opts).broken;
function damageByType(wf) {
    const out = {};
    for (const r of wf.damageRolls ?? []) {
        const type = r.options?.type ?? r.options?.types?.[0];
        if (type) out[type] = (out[type] ?? 0) + (Number(r.total) || 0);
    }
    return out;
}
async function resolvePrismHits(wf) {
    const list = wf.nixPrismHits;
    if (!list?.length) return;
    wf.nixPrismHits = null;
    const attack = !!(wf.activity?.attack || wf.attackRoll);
    const roll = wf.attackRoll;
    const hit = !attack || (!!roll && prismAttackHits({total: wf.attackTotal ?? roll.total, critical: wf.isCritical, fumble: wf.isFumble}));
    const data = {damage: hit ? damageByType(wf) : {}, spell: wf.item?.type === 'spell' ? wf.item.name : '', hit, attack,
        total: attack ? Number(wf.attackTotal ?? roll?.total ?? 0) : null, by: wf.actor?.name ?? '', what: wf.item?.name ?? ''};
    for (const h of list) await gm('prismHit', {...data, tpl: h.tpl, names: h.names});
}
// Runs on the active GM (templates / Regions are the GM's), one hit at a time per wall so the damage adds up.
const prismHitGM = data => serial('prism:' + data.tpl, () => prismHitNow(data));
async function prismHitNow({tpl: uuid, names, damage, spell, hit, attack, total, by, what}) {
    const tpl = fromUuidSync(uuid);
    const st = wallState(tpl);
    if (!tpl || !areaAlive(tpl) || !st?.layers?.length) return false;
    const caster = casterOf(st);
    const L = layer(st.layers[0]);
    const head = '<b>' + esc(st.name) + '</b>: ' + esc(what) + ' (' + esc(by) + ') at ' + esc(names.join(', ')) + ' hits the ' + L.label.toLowerCase() + ' layer instead';
    if (attack && !hit) return chat(caster, head + ', and misses it (' + total + ' vs AC ' + PRISM_AC + '). Nothing gets through.');
    const dealt = Object.entries(damage ?? {}).filter(([, n]) => n > 0).map(([t, n]) => n + ' ' + t).join(', ');
    const r = layerHit(L.key, {damage, spell, taken: st.taken?.[L.key] ?? 0});
    if (!r.broken) {
        const wear = r.left === null ? ' (only ' + L.ends + ' destroys it)'
            : r.dealt ? ': ' + r.taken + ' / ' + L.breakMin + ' ' + L.breakType + ' damage taken, ' + r.left + ' left'
                : ' (only ' + L.breakType + ' damage wears it down; ' + r.left + ' of ' + L.breakMin + ' left)';
        if (r.dealt) await tpl.setFlag(MODULE_ID, WALL, {...st, taken: {...(st.taken ?? {}), [L.key]: r.taken}});
        return chat(caster, head + (dealt ? ' (' + esc(dealt) + ')' : '') + '. The ' + L.label.toLowerCase() + ' layer holds' + wear + '. Nothing gets through.');
    }
    await chat(caster, head + (dealt ? ' (' + esc(dealt) + ')' : '') + ' and destroys it' + (r.left === null ? '' : ' (' + L.breakMin + ' ' + L.breakType + ' damage taken in all)') + '.');
    return destroyOuter(tpl, caster);
}
// The outermost layer falls; the next one is outermost now (or the wall is gone).
async function destroyOuter(tpl, actor) {
    const st = wallState(tpl);
    const next = layer(st.layers[0]);
    const layers = st.layers.slice(1);
    if (!layers.length) {
        await chat(actor, '<b>' + esc(st.name) + '</b>: the last layer falls; the wall is gone.');
        return tpl.delete({nixWallEnd: true});
    }
    await tpl.setFlag(MODULE_ID, WALL, {...st, layers});   // a fallen layer's `taken` entry is never read again
    if (st.globe) await sizeGlobe(tpl, layers.length);
    await chat(actor, '<b>' + esc(st.name) + '</b>: the ' + next.label.toLowerCase() + ' layer is destroyed. Left, outside in: ' + layers.map(k => layer(k).label).join(', ') + '.');
}

async function onRollFinished(wf) {
    try {
        if (!wf?.item || wf.item.flags?.[MODULE_ID]?.petraSynthetic) return;
        if (wf.nixPrismHits?.length) await resolvePrismHits(wf);
        const kind = kindOf(wf.item);
        if (!kind) return;
        const ak = actKind(wf.activity);
        if (kind === 'wallOfDeath') return await castDeath(wf);
        if (kind === 'negativeFlood') return await castFlood(wf);
        if (kind === 'fingerOfDeath') return await markRise(wf, {humanoidOnly: true, controlled: true});
        if (kind === 'vileBook' && ak === 'darkSpeech') return await darkSpeechBacklash(wf);
        if (kind === 'prismaticWall') return await (ak === 'layer' ? prismLayerMenu(wf) : castPrism(wf, ak === 'globe'));
    } catch (err) { console.error(TITLE + ' | Petra spells', err); }
}

// The damage of this cast (upcast included), from the rolled damage or the activity.
function castFormula(wf) {
    const r = wf.damageRolls?.[0] ?? wf.damageRoll;
    if (r?.formula) return {formula: r.formula, type: r.options?.type ?? r.options?.types?.[0] ?? 'necrotic'};
    const act = wf.activity;
    const part = act?.damage?.parts?.[0];
    if (!part) return {formula: null, type: 'necrotic'};
    const level = Number(wf.castData?.castLevel ?? wf.item.system.level ?? 0);
    const up = Math.max(0, level - Number(wf.item.system.level ?? 0));
    const f = part.scaledFormula?.(up) ?? part.formula ?? (part.number && part.denomination ? part.number + 'd' + part.denomination : null);
    return {formula: f, type: [...(part.types ?? [])][0] ?? 'necrotic'};
}

async function castDeath(wf) {
    const tpl = await templateOf(wf);
    if (!tpl) return gmWhisper('<b>Wall of Death</b>: no ' + (isCat() ? 'area (Region)' : 'template') + ' was placed, so the wall isn\'t tracked. Cast it again and place the wall.');
    const cfg = cfgOf(wf.item);
    const s = geom(tpl);
    const labels = sideLabels(s);
    const {formula, type} = castFormula(wf);
    if (!formula) return gmWhisper('<b>Wall of Death</b>: the spell has no damage to repeat. Check its save activity.');
    const userId = cpr()?.socketUtils?.firstOwner?.(wf.actor, true) ?? game.user.id;
    const side = await cpr()?.dialogUtils?.buttonDialog?.(wf.item.name, 'Which side of the wall deals damage?',
        [['The ' + labels['1'] + ' side', 1], ['The ' + labels['-1'] + ' side', -1]], {userId}) ?? 1;
    const ability = [...(wf.activity?.save?.ability ?? [])][0] ?? cfg.ability ?? 'con';
    const dc = Number(wf.activity?.save?.dc?.value ?? dcOf(wf.actor, wf.item));
    await tpl.setFlag(MODULE_ID, WALL, {kind: 'death', caster: wf.actor.uuid, item: wf.item.uuid, name: wf.item.name, img: wf.item.img,
        side, sideLabel: labels[String(side)], formula, type, ability, dc, tickSave: !!cfg.tickSave, reach: Number(cfg.reach ?? 10), castAt: Date.now()});
    deathAnimation(tpl);
    // Ends with concentration (and the template with this effect).
    const effId = await addEffect(wf.actor, {name: wf.item.name, img: wf.item.img, origin: wf.item.uuid, transfer: false,
        duration: {seconds: Number(cfg.seconds ?? 60)}, description: 'Wall of Death is up. Deleting this ends the wall.',
        flags: {[MODULE_ID]: {petraWallTemplate: tpl.uuid}}});
    const conc = cpr()?.effectUtils?.getConcentrationEffect?.(wf.actor, wf.item);
    const eff = effId ? wf.actor.effects.get(effId) : null;
    if (conc && eff) await cpr().effectUtils.addDependent?.(conc, [eff]);
    await chat(wf.actor, '<b>' + esc(wf.item.name) + '</b>: the ' + esc(labels[String(side)]) + ' side is deadly. Ending a turn inside the wall or within '
        + (cfg.reach ?? 10) + ' ft of that side, or entering the wall for the first time on a turn: ' + esc(formula) + ' ' + esc(type)
        + (cfg.tickSave ? ' (' + ability.toUpperCase() + ' save DC ' + dc + ' for half).' : '.'));
}

async function castFlood(wf) {
    const undead = (wf.nixFloodUndead ?? []).map(u => fromUuidSync(u)).filter(Boolean);
    if (undead.length) {
        let total = (wf.damageRolls ?? []).reduce((s, r) => s + (Number(r.total) || 0), 0);
        if (!total) {
            const {formula, type} = castFormula(wf);
            const roll = await new CONFIG.Dice.DamageRoll(formula ?? '5d12', {}, {type: type ?? 'necrotic'}).evaluate();
            await roll.toMessage({speaker: ChatMessage.getSpeaker({actor: wf.actor}), flavor: wf.item.name + ' (undead: temporary hit points)'});
            total = roll.total;
        }
        const temp = Math.floor(total / 2);
        const lines = [];
        for (const doc of undead) {
            const a = doc.actor;
            if (!a) continue;
            const cur = Number(a.system.attributes.hp.temp ?? 0);
            if (temp > cur) await gm('update', {uuid: a.uuid, data: {'system.attributes.hp.temp': temp}});
            lines.push(esc(doc.name) + (temp > cur ? ' gains <b>' + temp + '</b> temporary hit points' : ' keeps its ' + cur + ' temporary hit points (more than ' + temp + ')'));
        }
        await chat(wf.actor, '<b>' + esc(wf.item.name) + '</b> feeds the undead (no save): ' + lines.join('; ') + '.');
    }
    await markRise(wf, {humanoidOnly: false, controlled: false});
}

// Remember who this spell hit; at the caster's next turn start, the dead rise.
async function markRise(wf, {humanoidOnly, controlled}) {
    const undead = new Set(wf.nixFloodUndead ?? []);
    const hit = Array.from(wf.targets ?? []).filter(t => t.actor && !undead.has(t.document.uuid) && typeOf(t.actor) !== 'undead'
        && (!humanoidOnly || typeOf(t.actor) === 'humanoid'));
    if (!hit.length) return;
    const item = wf.actor.items.get(wf.item.id) ?? wf.item;
    const pending = (cfgOf(item)?.pending ?? []).filter(p => !hit.some(t => t.document.uuid === p.token));
    for (const t of hit) pending.push({token: t.document.uuid, name: t.document.name, controlled, round: game.combat?.round ?? null});
    await item.update({['flags.' + MODULE_ID + '.' + FLAG + '.pending']: pending});
    if (!inCombat()) await risePending(wf.actor);
}

const killed = actor => {
    if (!actor || (actor.system.attributes?.hp?.value ?? 1) > 0) return false;
    if (actor.statuses?.has('dead')) return true;
    if (actor.type === 'npc') return true;
    return Number(actor.system.attributes?.death?.failure ?? 0) >= 3;
};

async function zombieActor() {
    const world = game.actors.find(a => /^zombie$/i.test(a.name.trim()));
    if (world) return world;
    let best = null;
    for (const p of game.packs.filter(p => p.documentName === 'Actor')) {
        const idx = await p.getIndex();
        const e = idx.find(x => /^zombie$/i.test(String(x.name).trim()));
        if (!e) continue;
        const score = (/24/.test(p.collection) ? 2 : 0) + (p.collection.startsWith('dnd5e.') ? 1 : 0);
        if (!best || score > best.score) best = {p, e, score};
    }
    if (!best) return null;
    return game.actors.importFromCompendium(best.p, best.e._id);
}

async function risePending(caster) {
    const items = caster.items?.filter(i => cfgOf(i)?.pending?.length) ?? [];
    if (!items.length) return;
    const rise = [];
    for (const item of items) {
        for (const p of cfgOf(item).pending) {
            const doc = fromUuidSync(p.token);
            if (doc && killed(doc.actor)) rise.push({doc, controlled: p.controlled, spell: item.name});
        }
        await item.update({['flags.' + MODULE_ID + '.' + FLAG + '.pending']: []});
    }
    if (!rise.length) return;
    const yes = await cpr()?.dialogUtils?.confirm?.('Rise as zombies', rise.map(r => '<b>' + esc(r.doc.name) + '</b> (' + esc(r.spell)
        + (r.controlled ? ', follows ' + esc(caster.name) + '\'s orders' : ', attacks the nearest creature it can see') + ')').join('<br>')
        + '<br>Raise them now?', {userId: gmId()});
    if (!yes) return;
    const zombie = await zombieActor();
    if (!zombie) return gmWhisper('<b>Rise as zombies</b>: no Zombie actor in the world or the compendiums. Place them by hand.');
    const casterTok = tokenOfActor(caster);
    for (const r of rise) {
        const scene = r.doc.parent;
        const disposition = r.controlled ? (casterTok?.document.disposition ?? CONST.TOKEN_DISPOSITIONS.HOSTILE) : CONST.TOKEN_DISPOSITIONS.HOSTILE;
        const td = await zombie.getTokenDocument({x: r.doc.x, y: r.doc.y, disposition, name: 'Zombie (' + r.doc.name + ')', actorLink: false, hidden: false});
        const [tok] = await scene.createEmbeddedDocuments('Token', [td.toObject()]);
        await r.doc.update({hidden: true});
        if (tok && game.combat?.scene?.id === scene.id) {
            await game.combat.createEmbeddedDocuments('Combatant', [{tokenId: tok.id, sceneId: scene.id, actorId: zombie.id, hidden: false}]);
        }
    }
    await chat(caster, '<b>The dead rise</b>: ' + rise.map(r => esc(r.doc.name)).join(', ') + ' stand' + (rise.length === 1 ? 's' : '')
        + ' up as zombies.' + (inCombat() ? ' Roll their initiative.' : ''));
}

// ---------------------------------------------------------------- Prismatic Wall
// Destroy conditions, Nix's rulings 2026-11-20: each damage layer has HP (red 20, +10 per layer after it) that only
// its damage type wears down, over any number of hits; orange thunder (RAW a strong wind), green lightning (RAW
// Passwall). Indigo and violet have no HP: Daylight / Dispel Magic only.
export const LAYERS = [
    {key: 'red', label: 'Red', type: 'fire', ends: '20 cold damage', breakType: 'cold', breakMin: 20},
    {key: 'orange', label: 'Orange', type: 'acid', ends: '30 thunder damage', breakType: 'thunder', breakMin: 30},
    {key: 'yellow', label: 'Yellow', type: 'lightning', ends: '40 force damage', breakType: 'force', breakMin: 40},
    {key: 'green', label: 'Green', type: 'poison', ends: '50 lightning damage', breakType: 'lightning', breakMin: 50},
    {key: 'blue', label: 'Blue', type: 'cold', ends: '60 fire damage', breakType: 'fire', breakMin: 60},
    {key: 'indigo', label: 'Indigo', ends: 'bright light from Daylight', breakSpell: /^daylight$/i},
    {key: 'violet', label: 'Violet', ends: 'Dispel Magic', breakSpell: /^dispel magic$/i}
];
const layer = k => LAYERS.find(l => l.key === k);

async function castPrism(wf, globe) {
    const tpl = await templateOf(wf);
    if (!tpl) return gmWhisper('<b>Prismatic Wall</b>: no ' + (isCat() ? 'area (Region)' : 'template') + ' was placed, so the wall isn\'t tracked.');
    const cfg = cfgOf(wf.item);
    if (globe) await sizeGlobe(tpl, LAYERS.length);   // 35 ft radius (70 ft across), wherever it was centred
    const s = geom(tpl);
    const me = wf.token ?? tokenOfActor(wf.actor);
    const disp = me?.document.disposition;
    const allowed = canvas.tokens.placeables.filter(t => t?.actor && (t.id === me?.id || (disp !== undefined && t.document.disposition === disp))).map(t => t.document.uuid);
    const W = CONST.WALL_SENSE_TYPES, M = CONST.WALL_MOVEMENT_TYPES;
    // 1.7.5 (Nix 2026-11-16): the wall doesn't hide what's behind it (only a failed glare save blinds). The Foundry walls
    // blocked sight and nothing else, so none are placed any more; the crossing / layer rules are ours.
    const wall = c => ({c, move: M.NONE, sight: W.NONE, light: W.NONE, sound: W.NONE, flags: {[MODULE_ID]: {petraWall: tpl.id}}});
    const segs = [];
    if (s.type === 'line') segs.push(wall([s.a.x, s.a.y, s.b.x, s.b.y].map(Math.round)));
    else for (let i = 0; i < 24; i++) {
        const a0 = i / 24 * 2 * Math.PI, a1 = (i + 1) / 24 * 2 * Math.PI;
        segs.push(wall([s.c.x + Math.cos(a0) * s.r, s.c.y + Math.sin(a0) * s.r, s.c.x + Math.cos(a1) * s.r, s.c.y + Math.sin(a1) * s.r].map(Math.round)));
    }
    const scene = tpl.parent;
    const made = [];   // see above: no sight-blocking Foundry walls (segs kept for a movement-blocking option later)
    const mid = midpoint(s);
    const anim = CONFIG.Canvas?.lightAnimations?.rainbowswirl ? 'rainbowswirl' : (CONFIG.Canvas?.lightAnimations?.swirl ? 'swirl' : null);
    const [light] = await scene.createEmbeddedDocuments('AmbientLight', [{x: Math.round(mid.x), y: Math.round(mid.y),
        config: {bright: 100, dim: 200, color: '#ffffff', alpha: 0.35, animation: anim ? {type: anim, speed: 3, intensity: 5} : {}},
        flags: {[MODULE_ID]: {petraWall: tpl.id}}}]);
    const inside = canvas.tokens.placeables.filter(t => t.actor && distTo(t.center, s) < radiusOf(t.document) - 1);
    await tpl.setFlag(MODULE_ID, WALL, {kind: 'prism', caster: wf.actor.uuid, item: wf.item.uuid, name: wf.item.name, img: wf.item.img,
        globe, dice: Number(cfg.dice ?? 12), dc: dcOf(wf.actor, wf.item), allowed, layers: LAYERS.map(l => l.key),
        wallIds: made.map(w => w.id), lightId: light?.id ?? null});
    await addEffect(wf.actor, {name: wf.item.name, img: wf.item.img, origin: wf.item.uuid, transfer: false, duration: {seconds: Number(cfg.seconds ?? 600)},
        description: 'Prismatic Wall is up. Deleting this ends the wall.', flags: {[MODULE_ID]: {petraWallTemplate: tpl.uuid}}});
    // 1.7.5: glare for everyone not on her side who is already within 20 ft when the wall appears (Con save or Blinded
    // 1 minute); stepping into 20 ft later is still handled on movement.
    const fresh = areaAlive(tpl) ? tpl : null;
    if (fresh) for (const t of glareTargets(canvas.tokens.placeables, s, allowed)) await prismGlare(fresh, t.document);
    await chat(wf.actor, '<b>' + esc(wf.item.name) + '</b> (' + (globe ? 'globe' : 'wall') + '): seven layers, ' + (cfg.dice ?? 12) + 'd6 per damage layer, DC '
        + dcOf(wf.actor, wf.item) + '. Unharmed: ' + allowed.map(u => esc(fromUuidSync(u)?.name)).filter(Boolean).join(', ') + '.'
        + (inside.length ? '<br><b>GM:</b> the wall is in ' + inside.map(t => esc(t.document.name)).join(', ') + '\'s space; RAW the spell ends without effect.' : ''));
}

async function prismLayerMenu(wf) {
    const mine = walls('prism').filter(t => wallState(t).caster === wf.actor.uuid);
    if (!mine.length) return ui.notifications.info('Prismatic Wall: no wall of ' + wf.actor.name + '\'s on this scene.');
    const tpl = mine[mine.length - 1];
    const st = wallState(tpl);
    const next = layer(st.layers[0]);
    const buttons = [];
    if (next) buttons.push(['Destroy the ' + next.label + ' layer (' + next.ends + ')', 'destroy']);
    buttons.push(['End the wall', 'end'], ['Cancel', false]);
    const worn = next?.breakMin ? '<br>The ' + next.label.toLowerCase() + ' layer has taken ' + (st.taken?.[next.key] ?? 0) + ' / ' + next.breakMin + ' ' + next.breakType + ' damage.' : '';
    const pick = await cpr()?.dialogUtils?.buttonDialog?.(wf.item.name, 'Layers left, outside in: <b>' + st.layers.map(k => layer(k).label).join(', ')
        + '</b>.' + worn + '<br>Layers fall one at a time, red first. (Dispel Magic can only end the violet layer, once it is the last.)', buttons, {userId: gmId()});
    if (pick === 'end') return tpl.delete({nixWallEnd: true});
    if (pick !== 'destroy') return;
    if (isActiveGM()) return destroyOuter(tpl, wf.actor);
    await gm('prismDestroy', {tpl: tpl.uuid});
}

// A creature goes through the wall: every intact layer, in order.
async function prismPass(tpl, doc) {
    const st = wallState(tpl);
    const caster = casterOf(st);
    const tok = doc.object;
    if (!caster || !tok || st.allowed?.includes(doc.uuid)) return;
    await chat(caster, '<b>' + esc(st.name) + '</b>: ' + esc(doc.name) + ' passes through ' + st.layers.length + ' layer' + (st.layers.length === 1 ? '' : 's') + '.');
    for (const k of st.layers) {
        if (!doc.actor || !canvas.scene.tokens.get(doc.id)) return;
        await prismLayerEffect(st, caster, doc, k);
    }
}
// One layer's effect on a creature (Dex save): damage, or Indigo / Violet on a failure.
async function prismLayerEffect(st, caster, doc, k) {
    const tok = doc.object;
    if (!tok) return;
    {
        const L = layer(k);
        const name = st.name + ': ' + L.label;
        if (L.type) return hurt(caster, [tok], {name, img: st.img, formula: st.dice + 'd6', type: L.type, ability: 'dex', dc: st.dc});
        const failed = await hurt(caster, [tok], {name, img: st.img, ability: 'dex', dc: st.dc, onSave: 'none'});
        if (!failed.has(doc.id)) return;
        if (k === 'indigo') {
            await addEffect(doc.actor, {name: 'Prismatic Wall: Indigo', img: st.img, origin: st.item, transfer: false, statuses: ['restrained'],
                description: 'Restrained. Con save at the end of each of its turns: 3 successes end it, 3 failures turn it to stone (Petrified until freed by Greater Restoration or similar).',
                flags: {[MODULE_ID]: {prismIndigo: {caster: st.caster, dc: st.dc, ok: 0, bad: 0}}}});
        } else if (k === 'violet') {
            await addEffect(doc.actor, {name: 'Prismatic Wall: Violet', img: st.img, origin: st.item, transfer: false, statuses: ['blinded'],
                description: 'Blinded. Wis save at the start of the caster\'s next turn: success ends it; failure ends it and sends the creature to another plane (GM\'s choice).',
                flags: {[MODULE_ID]: {prismViolet: {caster: st.caster, dc: st.dc}}}});
        }
    }
}

const blindedNow = actor => actor?.statuses?.has('blinded');
async function prismGlare(tpl, doc) {
    const st = wallState(tpl);
    const caster = casterOf(st);
    if (!caster || !doc.object || st.allowed?.includes(doc.uuid) || blindedNow(doc.actor) || !alive(doc)) return;
    const failed = await hurt(caster, [doc.object], {name: st.name + ': Glare', img: st.img, ability: 'con', dc: st.dc, onSave: 'none'});
    if (!failed.has(doc.id)) return;
    await addEffect(doc.actor, {name: 'Prismatic Wall: Blinded', img: st.img, origin: st.item, transfer: false, statuses: ['blinded'],
        duration: {seconds: 60}, description: 'Blinded by the wall\'s glare for 1 minute.', flags: {[MODULE_ID]: {prismGlare: tpl.uuid}}});
}
const near20 = (p, doc, s) => distTo(p, s) <= radiusOf(doc) + 20 * pxft();
// Creatures that make the glare save when the wall appears: within 20 ft, not designated, not already blinded.
function glareTargets(tokens, s, allowed) {
    return tokens.filter(t => t?.actor && !allowed.includes(t.document.uuid) && alive(t.document) && !blindedNow(t.actor)
        && near20(centerOf(t.document), t.document, s));
}

// ---------------------------------------------------------------- Sorcerous Burst (2024)
// Each d8 that shows an 8 adds another d8 (which can explode too), up to the spellcasting
// modifier in extra dice per cast. Each extra die is its own real roll (manual dice prompt).
export function burstPlan(results, cap, rollOne) {
    let pending = results.filter(r => r === 8).length, extra = [];
    while (pending > 0 && extra.length < cap) {
        const r = rollOne();
        extra.push(r);
        pending--;
        if (r === 8) pending++;
    }
    return extra;
}
const isDie = t => t instanceof (foundry.dice?.terms?.Die ?? class {}) || (t?.faces && Array.isArray(t?.results));
async function onDamageRolled(wf) {
    try {
        if (kindOf(wf?.item) !== 'sorcerousBurst' || !wf.damageRolls?.length || wf.nixBurstDone) return;
        wf.nixBurstDone = true;
        const d8s = wf.damageRolls.flatMap(r => r.terms.filter(t => isDie(t) && t.faces === 8));
        if (d8s.some(t => (t.modifiers ?? []).some(m => /^x/i.test(m)))) return;   // already exploding natively
        const a = wf.actor;
        const cap = Math.max(0, Number(a.system.abilities?.[a.system.attributes?.spellcasting || 'cha']?.mod ?? 0));
        const eights = d8s.flatMap(t => t.results.filter(r => r.active !== false).map(r => r.result));
        if (!cap || !eights.includes(8)) return;
        const type = wf.damageRolls[0].options?.type ?? 'force';
        let pending = eights.filter(r => r === 8).length;
        const extra = [];
        while (pending > 0 && extra.length < cap) {
            const roll = await new CONFIG.Dice.DamageRoll('1d8', {}, {type, properties: [...(wf.damageRolls[0].options?.properties ?? [])]}).evaluate();
            extra.push(roll);
            pending--;
            if (roll.total === 8) pending++;
        }
        if (!extra.length) return;
        await wf.setDamageRolls(wf.damageRolls.concat(extra));
        await chat(a, '<b>' + esc(wf.item.name) + '</b> bursts: +' + extra.length + 'd8 (' + extra.map(r => r.total).join(', ') + ')'
            + (pending > 0 ? ', stopped at the ' + cap + '-die limit' : '') + '.');
    } catch (err) { console.error(TITLE + ' | Sorcerous Burst', err); }
}

// ---------------------------------------------------------------- GM: movement and turns
const lastPos = new Map();
const queues = new Map();
function serial(key, fn) {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn).catch(err => console.error(TITLE + ' | Petra spells', err));
    queues.set(key, next);
    return next;
}
const entered = new Map();   // templateId -> Map(tokenId -> turnKey)

function onCanvasReady() {
    lastPos.clear();
    for (const t of canvas.tokens?.placeables ?? []) lastPos.set(t.id, centerOf(t.document));
}

function onUpdateToken(doc, changed) {
    if (!('x' in changed || 'y' in changed) || doc.parent?.id !== canvas.scene?.id) return;
    const from = lastPos.get(doc.id);
    const to = centerOf(doc);
    lastPos.set(doc.id, to);
    if (!isActiveGM() || !from || !doc.actor) return;
    const rad = radiusOf(doc);
    serial(doc.id, async () => {
        await sleep(300);
        for (const tpl of walls('death')) {
            const st = wallState(tpl), s = geom(tpl);
            const hit = crosses(from, to, s) || (distTo(to, s) <= rad && distTo(from, s) > rad);
            if (!hit) continue;
            const seen = entered.get(tpl.id) ?? new Map();
            entered.set(tpl.id, seen);
            if (seen.get(doc.id) === turnKey()) continue;
            seen.set(doc.id, turnKey());
            await deathTick(tpl, doc, 'enters');
        }
        for (const tpl of walls('prism')) {
            const s = geom(tpl);
            if (crosses(from, to, s) || (distTo(to, s) <= rad && distTo(from, s) > rad)) await prismPass(tpl, doc);
            if (!areaAlive(tpl)) continue;
            if (near20(to, doc, s) && !near20(from, doc, s)) await prismGlare(tpl, doc);
        }
    });
}

// ---------------------------------------------------------------- Prismatic Wall: teleports (1.7.5, Nix 2026-11-16)
// A teleport (Misty Step, Dimension Door, Chris's Premades' teleports, a GM "blink" / "displace" move) whose straight
// path crosses the wall, or goes into / out of the globe, is stopped on the mover's side of the wall and the creature
// takes the outermost layer's effect (as for passing that layer). Walking through still runs every layer (RAW).
// Chris's Premades 1 teleports with {isPaste: true}; CAT 0.1.9 moves with the "displace" action; Foundry marks
// teleport actions with CONFIG.Token.movement.actions[action].teleport.
export function isTeleportMove(options, id, actions = globalThis.CONFIG?.Token?.movement?.actions ?? {}) {
    if (options?.isPaste || options?.teleport) return true;
    const mv = options?.movement?.[id];
    const wps = mv?.waypoints ?? mv?.pending?.waypoints ?? [];
    return wps.some(w => actions?.[w?.action]?.teleport === true || w?.action === 'displace' || w?.action === 'blink');
}
// The point on from -> to just before it crosses the wall, backed off `back` px toward `from` (null if it doesn't cross).
export function stopShort(from, to, s, back) {
    if (!crosses(from, to, s)) return null;
    let lo = 0, hi = 1;
    const at = u => ({x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u});
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (crosses(from, at(m), s)) hi = m; else lo = m; }
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return at(Math.max(0, lo - back / len));
}
function onPreUpdateToken(doc, changed, options) {
    try {
        if (!('x' in changed || 'y' in changed) || options?.nixPrismStop || doc.parent?.id !== canvas.scene?.id || !doc.actor) return;
        if (!isTeleportMove(options, doc.id)) return;
        const from = centerOf(doc);
        const to = centerOf({x: changed.x ?? doc.x, y: changed.y ?? doc.y, width: doc.width, height: doc.height});
        let best = null;
        for (const tpl of walls('prism')) {
            const st = wallState(tpl), s = geom(tpl);
            if (st.allowed?.includes(doc.uuid) || !(st.layers ?? []).length) continue;
            const stop = stopShort(from, to, s, radiusOf(doc) + 2);
            if (stop && (!best || distTo(from, s) < best.d)) best = {tpl, stop, d: distTo(from, s)};
        }
        if (!best) return;
        const half = {x: (doc.width ?? 1) * canvas.dimensions.size / 2, y: (doc.height ?? 1) * canvas.dimensions.size / 2};
        const xy = {x: Math.round(best.stop.x - half.x), y: Math.round(best.stop.y - half.y)};
        const tplUuid = best.tpl.uuid;
        setTimeout(async () => {
            try {
                await doc.update(xy, {nixPrismStop: tplUuid, animate: false});
                await gm('prismOuter', {tpl: tplUuid, token: doc.uuid});
            } catch (err) { console.error(TITLE + ' | Prismatic Wall teleport', err); }
        }, 0);
        return false;
    } catch (err) { console.error(TITLE + ' | Prismatic Wall teleport', err); }
}
async function prismOuterGM({tpl: uuid, token}) {
    const tpl = fromUuidSync(uuid), doc = fromUuidSync(token);
    const st = wallState(tpl);
    const caster = casterOf(st);
    if (!tpl || !doc?.actor || !caster || !st?.layers?.length) return false;
    const L = layer(st.layers[0]);
    await chat(caster, '<b>' + esc(st.name) + '</b>: ' + esc(doc.name) + ' tries to teleport through the wall, is stopped at it and meets the '
        + L.label.toLowerCase() + ' layer.');
    await prismLayerEffect(st, caster, doc, L.key);
    return true;
}

async function deathTick(tpl, doc, why) {
    const st = wallState(tpl);
    const caster = casterOf(st);
    if (!caster || !doc.object || !alive(doc)) return;
    const hpOf = () => { const hp = doc.actor?.system?.attributes?.hp ?? {}; return (Number(hp.value) || 0) + (Number(hp.temp) || 0); };
    const before = hpOf();
    await hurt(caster, [doc.object], {name: st.name + (why === 'enters' ? ' (enters the wall)' : ' (ends its turn)'), img: st.img,
        formula: st.formula, type: st.type, ability: st.ability, dc: st.dc, save: !!st.tickSave});
    await deathReaction(caster, st, doc, Math.max(0, before - hpOf()));
}

// 1.7.5: "whenever a creature takes damage from the wall, the caster can use her reaction to gain temporary hit points
// equal to the damage dealt". Asked only while her reaction is free (once per round in combat); temp HP don't stack.
export function deathReactionAllowed({dealt, inCombat, reactionUsed, incapacitated}) {
    return dealt > 0 && !incapacitated && !(inCombat && reactionUsed);
}
async function deathReaction(caster, st, doc, dealt) {
    const u = cpr();
    const inCombatNow = inCombat();
    const ok = deathReactionAllowed({dealt, inCombat: inCombatNow, reactionUsed: !!u?.actorUtils?.hasUsedReaction?.(caster),
        incapacitated: !!globalThis.MidiQOL?.checkIncapacitated?.(caster)});
    if (!ok) return;
    const cur = Number(caster.system.attributes?.hp?.temp) || 0;
    const userId = u?.socketUtils?.firstOwner?.(caster, true) ?? u?.queryUtils?.firstOwner?.(caster, true) ?? gmId();
    const yes = await u?.dialogUtils?.confirm?.(st.name, esc(doc.name) + ' took ' + dealt + ' damage from the wall. Use your reaction to gain '
        + dealt + ' temporary hit points' + (cur ? ' (you have ' + cur + '; they do not stack, the higher stays)' : '') + '?', {userId});
    if (!yes) return;
    if (inCombatNow) await u?.actorUtils?.setReactionUsed?.(caster);
    if (dealt > cur) await gm('update', {uuid: caster.uuid, data: {'system.attributes.hp.temp': dealt}});
    await chat(caster, '<b>' + esc(st.name) + '</b>: ' + esc(caster.name) + ' drinks the death the wall deals and gains ' + dealt + ' temporary hit points'
        + (dealt > cur ? '.' : ' (kept her ' + cur + ').'));
}

// 1.7.5: green fire ring on the wall for as long as it lasts (Sequencer, persistent, named after the area).
const DEATH_RING = 'modules/jb2a_patreon/Library/Generic/Fire/FireRing_01_Circle_Green_500.webp';
const ringName = tpl => 'Petra Wall ' + tpl.id;
function deathAnimation(tpl) {
    try {
        if (!globalThis.Sequence || !globalThis.Sequencer) return;
        const s = geom(tpl);
        const seq = new Sequence();
        if (s.type === 'circle') seq.effect().file(DEATH_RING).atLocation(s.c).size(s.r * 2).persist().name(ringName(tpl)).belowTokens().fadeIn(500).fadeOut(500);
        else seq.effect().file(DEATH_RING).atLocation(s.a).stretchTo(s.b).persist().name(ringName(tpl)).belowTokens().fadeIn(500).fadeOut(500);
        seq.play();
    } catch (err) { console.warn(TITLE + ' | Wall of Death animation', err); }
}

async function onUpdateCombat(combat, changed) {
    if (!isActiveGM() || !combat.started || !('turn' in changed || 'round' in changed)) return;
    try {
        // End of the previous creature's turn.
        const prev = combat.combatants.get(combat.previous?.combatantId);
        const pdoc = prev?.token;
        if (pdoc?.actor && pdoc.parent?.id === canvas.scene?.id) {
            for (const tpl of walls('death')) {
                const st = wallState(tpl);
                if (inDeathZone(centerOf(pdoc), radiusOf(pdoc), geom(tpl), st.side, Number(st.reach ?? 10) * pxft())) await deathTick(tpl, pdoc, 'ends');
            }
            await indigoSave(pdoc);
        }
        // Start of the current creature's turn.
        const cdoc = combat.combatant?.token;
        const actor = combat.combatant?.actor;
        if (cdoc?.actor && cdoc.parent?.id === canvas.scene?.id) {
            for (const tpl of walls('prism')) if (near20(centerOf(cdoc), cdoc, geom(tpl))) await prismGlare(tpl, cdoc);
        }
        if (actor) {
            await violetSaves(actor);
            await risePending(actor);
        }
    } catch (err) { console.error(TITLE + ' | Petra spells turn', err); }
}

async function indigoSave(doc) {
    const eff = doc.actor.effects.find(e => e.flags?.[MODULE_ID]?.prismIndigo);
    if (!eff) return;
    const f = eff.flags[MODULE_ID].prismIndigo;
    const caster = fromUuidSync(f.caster);
    if (!caster) return;
    const failed = await hurt(caster, [doc.object], {name: 'Prismatic Wall: Indigo', img: eff.img, ability: 'con', dc: f.dc, onSave: 'none'});
    const ok = f.ok + (failed.has(doc.id) ? 0 : 1), bad = f.bad + (failed.has(doc.id) ? 1 : 0);
    if (ok >= 3) {
        await eff.delete();
        return chat(caster, '<b>Prismatic Wall: Indigo</b>: ' + esc(doc.name) + ' breaks free (3 successes).');
    }
    if (bad >= 3) {
        await eff.delete();
        await addEffect(doc.actor, {name: 'Prismatic Wall: Petrified', img: eff.img, origin: eff.origin, transfer: false, statuses: ['petrified'],
            description: 'Turned to stone by the indigo layer until freed by Greater Restoration or similar magic.'});
        return chat(caster, '<b>Prismatic Wall: Indigo</b>: ' + esc(doc.name) + ' turns to stone (3 failures).');
    }
    await eff.update({['flags.' + MODULE_ID + '.prismIndigo']: {...f, ok, bad}});
    await chat(caster, '<b>Prismatic Wall: Indigo</b>: ' + esc(doc.name) + ' ' + ok + ' success' + (ok === 1 ? '' : 'es') + ', ' + bad + ' failure' + (bad === 1 ? '' : 's') + '.');
}

async function violetSaves(caster) {
    const docs = canvas.scene?.tokens.filter(d => d.actor?.effects.some(e => e.flags?.[MODULE_ID]?.prismViolet?.caster === caster.uuid)) ?? [];
    for (const doc of docs) {
        const eff = doc.actor.effects.find(e => e.flags?.[MODULE_ID]?.prismViolet?.caster === caster.uuid);
        const f = eff.flags[MODULE_ID].prismViolet;
        const failed = await hurt(caster, [doc.object], {name: 'Prismatic Wall: Violet', img: eff.img, ability: 'wis', dc: f.dc, onSave: 'none'});
        await eff.delete();
        if (!failed.has(doc.id)) { await chat(caster, '<b>Prismatic Wall: Violet</b>: ' + esc(doc.name) + ' shakes off the blindness.'); continue; }
        await doc.update({hidden: true});
        await chat(caster, '<b>Prismatic Wall: Violet</b>: ' + esc(doc.name) + ' is cast onto another plane of existence (GM\'s choice). Its token is hidden.');
    }
}

// ---------------------------------------------------------------- cleanup
async function onDeleteTemplate(tpl) {
    if (!isActiveGM()) return;
    const st = wallState(tpl);
    if (!st) return;
    entered.delete(tpl.id);
    try { if (globalThis.Sequencer) await Sequencer.EffectManager.endEffects({name: ringName(tpl)}); } catch { /* none playing */ }
    const scene = tpl.parent;
    const wallIds = scene.walls.filter(w => w.flags?.[MODULE_ID]?.petraWall === tpl.id).map(w => w.id);
    if (wallIds.length) await scene.deleteEmbeddedDocuments('Wall', wallIds).catch(() => {});
    const lightIds = scene.lights.filter(l => l.flags?.[MODULE_ID]?.petraWall === tpl.id).map(l => l.id);
    if (lightIds.length) await scene.deleteEmbeddedDocuments('AmbientLight', lightIds).catch(() => {});
    const caster = casterOf(st);
    const eff = caster?.effects.find(e => e.flags?.[MODULE_ID]?.petraWallTemplate === tpl.uuid);
    if (eff) await eff.delete().catch(() => {});
    if (caster) await chat(caster, '<b>' + esc(st.name) + '</b> ends.');
}
async function onDeleteEffect(effect) {
    if (!isActiveGM()) return;
    const uuid = effect.flags?.[MODULE_ID]?.petraWallTemplate;
    if (!uuid) return;
    const tpl = fromUuidSync(uuid);
    if (tpl && areaAlive(tpl)) await tpl.delete({nixWallEnd: true}).catch(() => {});
}

// 1.7.5: Midi deletes an "instantaneous" activity's template a few seconds after the cast when its "auto remove
// instantaneous templates" setting is on (Workflow.ts, v13), and Wall of Death's save activities may be instantaneous
// while the spell is concentration: the wall vanished and dealt no ticks. A wall's area stays while its effect on the
// caster is up; it ends with that effect (concentration) or a deliberate delete within a few seconds of casting.
export function keepWallArea({state, ageMs, effectUp, ours}) {
    return !!state && !ours && effectUp && ageMs < 15000;
}
function onPreDeleteArea(tpl, options) {
    const st = wallState(tpl);
    const caster = st ? casterOf(st) : null;
    const effectUp = !!caster?.effects?.some?.(e => e.flags?.[MODULE_ID]?.petraWallTemplate === tpl.uuid);
    if (!keepWallArea({state: st, ageMs: Date.now() - Number(st?.castAt ?? 0), effectUp, ours: !!options?.nixWallEnd})) return;
    console.log(TITLE + ' | ' + (st.name ?? 'wall') + ': kept its area (removed right after the cast while the spell is still up).');
    return false;
}

export function registerPetraSpells() {
    Hooks.on(HOOKS.preambleComplete, onPreamble);
    Hooks.on('midi-qol.preItemRollV2', onPreItemRoll);
    Hooks.on(HOOKS.rollFinished, onRollFinished);
    Hooks.on(HOOKS.damageRollComplete, onDamageRolled);
    Hooks.on('canvasReady', onCanvasReady);
    Hooks.on('createToken', doc => { if (doc.parent?.id === canvas.scene?.id) lastPos.set(doc.id, centerOf(doc)); });
    Hooks.on('preUpdateToken', onPreUpdateToken);
    Hooks.on('updateToken', onUpdateToken);
    addGmHandler('prismHit', prismHitGM);
    addGmHandler('prismOuter', prismOuterGM);
    addGmHandler('prismDestroy', async ({tpl}) => { const t = fromUuidSync(tpl); const st = wallState(t); if (!t || !st?.layers?.length) return false; await destroyOuter(t, casterOf(st)); return true; });
    Hooks.on('updateCombat', onUpdateCombat);
    Hooks.on('deleteMeasuredTemplate', onDeleteTemplate);
    Hooks.on('deleteRegion', onDeleteTemplate);
    Hooks.on('dnd5e.postCreateMeasuredTemplate', onRegionsPlaced);
    Hooks.on('deleteActiveEffect', onDeleteEffect);
    Hooks.on('preDeleteMeasuredTemplate', onPreDeleteArea);
    Hooks.on('preDeleteRegion', onPreDeleteArea);
    if (canvas?.ready) onCanvasReady();
    return {LAYERS, PRISM_AC, prismAttackHits, layerHit, layerBreaks, reachNeeded, globeRadiusFt, globeResize, isTeleportMove, stopShort, isEvil, deathReactionAllowed, keepWallArea, burstPlan, shapeOf, regionShape, distTo, sideOf, crosses, sideLabels, inDeathZone, risePending, zombieActor, cpr2Owns};
}
