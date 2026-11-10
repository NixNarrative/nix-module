// =====================================================================
//  NIX FIX: Petra's spells (Court of Ravenloft, v13 / Midi QOL / Chris's Premades 1)
//  Acts only on spells the "Petra: spells" installer marked (flags.nix-module.petraSpell).
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
//  Prismatic Wall: wall or globe, opaque (sight-blocking walls), bright/dim light.
//    Creatures the caster designates (her side when cast) are unharmed. Others:
//    Con save or Blinded 1 minute on coming within 20 ft or starting a turn there;
//    passing through runs every intact layer in order (Dex save each): damage
//    layers, Indigo restraint (3 successes / 3 failures -> Petrified), Violet
//    blindness and plane shift. Ranged attacks and spells through the wall are
//    stopped by the matching layer. "Destroy a layer / end" activity.
//  Turn and movement checks run on the active GM; the cast-time parts on the caster's client.
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {isActiveGM} from './illrigger.mjs';
import {gm} from './lieutenants.mjs';

export const FLAG = 'petraSpell';
const WALL = 'petraWall';
const cpr = () => globalThis.chrisPremades?.utils;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const cfgOf = item => item?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const kindOf = item => cfgOf(item)?.kind ?? null;
const actKind = act => act?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const inCombat = () => !!game.combat?.started;
const turnKey = () => inCombat() ? game.combat.id + ':' + game.combat.round + ':' + game.combat.turn : 'none:' + Math.floor(Date.now() / 6000);
const typeOf = actor => String(cpr()?.actorUtils?.typeOrRace?.(actor) ?? MidiQOL?.typeOrRace?.(actor) ?? actor?.system?.details?.type?.value ?? '').toLowerCase();
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
export const midpoint = s => s.type === 'circle' ? {...s.c} : {x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2};

// ---------------------------------------------------------------- canvas helpers
const pxft = () => canvas.dimensions.size / canvas.dimensions.distance;
const gridOf = () => ({size: canvas.dimensions.size, distance: canvas.dimensions.distance});
const centerOf = doc => ({x: doc.x + (doc.width ?? 1) * canvas.dimensions.size / 2, y: doc.y + (doc.height ?? 1) * canvas.dimensions.size / 2});
const radiusOf = doc => Math.max(doc.width ?? 1, doc.height ?? 1) * canvas.dimensions.size / 2;
const wallState = tpl => tpl?.flags?.[MODULE_ID]?.[WALL] ?? null;
const walls = (kind, scene = canvas.scene) => (scene?.templates ?? []).filter(t => wallState(t)?.kind === kind);
const casterOf = st => { try { return fromUuidSync(st.caster); } catch { return null; } };
const tokenOfActor = actor => actor?.token?.object ?? actor?.getActiveTokens?.()[0] ?? null;
const alive = doc => (doc?.actor?.system?.attributes?.hp?.value ?? 1) > 0;

async function templateOf(wf) {
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
    if (actor.isOwner) return (await actor.createEmbeddedDocuments('ActiveEffect', [data]))?.[0]?.id ?? null;
    return gm('effect', {actor: actor.uuid, data});
}
const dcOf = (caster, item) => Number(item?.system?.activities?.find?.(a => a.save?.dc?.value)?.save.dc.value
    ?? caster?.system?.attributes?.spell?.dc ?? 15);

// ---------------------------------------------------------------- cast-time (caster's client)
async function onPreamble(wf) {
    try {
        if (!wf?.item) return;
        const kind = kindOf(wf.item);
        if (kind === 'wallOfDeath' && actKind(wf.activity) === 'ring') return await ringTargets(wf);
        if (kind === 'negativeFlood') return await floodSplit(wf);
        if (wf.targets?.size && canvas.scene?.templates.some(t => wallState(t)?.kind === 'prism')) return await prismBlock(wf);
    } catch (err) { console.error(TITLE + ' | Petra spells preamble', err); }
}

// Ring wall: only creatures on the ring are in the wall's area.
async function ringTargets(wf) {
    const tpl = await templateOf(wf);
    if (!tpl) return;
    const s = shapeOf(tpl, gridOf());
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

// Prismatic Wall: ranged attacks / spells across the wall.
async function prismBlock(wf) {
    const me = wf.token;
    if (!me) return;
    const isSpell = wf.item.type === 'spell';
    const ranged = ['rangedWeaponAttack', 'rangedSpellAttack'].some(k => cpr()?.workflowUtils?.isAttackType?.(wf, k));
    const magical = isSpell || !!wf.item.system?.properties?.has?.('mgc');
    if (!isSpell && !ranged) return;
    const from = me.center;
    const stopped = [];
    const keep = Array.from(wf.targets).filter(t => {
        if (t.id === me.id) return true;
        for (const tpl of walls('prism')) {
            const st = wallState(tpl);
            if (!crosses(from, t.center, shapeOf(tpl, gridOf()))) continue;
            const layers = st.layers ?? [];
            const by = isSpell && layers.includes('indigo') ? 'indigo (spells can\'t be cast through it)'
                : ranged && !magical && layers.includes('red') ? 'red (nonmagical ranged attacks can\'t pass)'
                    : ranged && magical && layers.includes('orange') ? 'orange (magical ranged attacks can\'t pass)' : null;
            if (by) { stopped.push(esc(t.document.name) + ': ' + by); return false; }
        }
        return true;
    });
    if (!stopped.length) return;
    await setTargets(wf, keep);
    await chat(wf.actor, '<b>Prismatic Wall</b> stops ' + esc(wf.item.name) + ':<br>' + stopped.join('<br>'));
}

async function onRollFinished(wf) {
    try {
        if (!wf?.item || wf.item.flags?.[MODULE_ID]?.petraSynthetic) return;
        const kind = kindOf(wf.item);
        if (!kind) return;
        const ak = actKind(wf.activity);
        if (kind === 'wallOfDeath') return await castDeath(wf);
        if (kind === 'negativeFlood') return await castFlood(wf);
        if (kind === 'fingerOfDeath') return await markRise(wf, {humanoidOnly: true, controlled: true});
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
    if (!tpl) return gmWhisper('<b>Wall of Death</b>: no template was placed, so the wall isn\'t tracked. Cast it again with a template.');
    const cfg = cfgOf(wf.item);
    const s = shapeOf(tpl, gridOf());
    const labels = sideLabels(s);
    const {formula, type} = castFormula(wf);
    if (!formula) return gmWhisper('<b>Wall of Death</b>: the spell has no damage to repeat. Check its save activity.');
    const userId = cpr()?.socketUtils?.firstOwner?.(wf.actor, true) ?? game.user.id;
    const side = await cpr()?.dialogUtils?.buttonDialog?.(wf.item.name, 'Which side of the wall deals damage?',
        [['The ' + labels['1'] + ' side', 1], ['The ' + labels['-1'] + ' side', -1]], {userId}) ?? 1;
    const ability = [...(wf.activity?.save?.ability ?? [])][0] ?? cfg.ability ?? 'con';
    const dc = Number(wf.activity?.save?.dc?.value ?? dcOf(wf.actor, wf.item));
    await tpl.setFlag(MODULE_ID, WALL, {kind: 'death', caster: wf.actor.uuid, item: wf.item.uuid, name: wf.item.name, img: wf.item.img,
        side, sideLabel: labels[String(side)], formula, type, ability, dc, tickSave: !!cfg.tickSave, reach: Number(cfg.reach ?? 10)});
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
export const LAYERS = [
    {key: 'red', label: 'Red', type: 'fire', ends: 'at least 25 cold damage', blocks: 'nonmagical ranged attacks'},
    {key: 'orange', label: 'Orange', type: 'acid', ends: 'a strong wind (Gust of Wind)', blocks: 'magical ranged attacks'},
    {key: 'yellow', label: 'Yellow', type: 'lightning', ends: 'at least 60 force damage'},
    {key: 'green', label: 'Green', type: 'poison', ends: 'Passwall (or a spell of its level or higher that opens a portal)'},
    {key: 'blue', label: 'Blue', type: 'cold', ends: 'at least 25 fire damage'},
    {key: 'indigo', label: 'Indigo', ends: 'bright light from Daylight', blocks: 'spells'},
    {key: 'violet', label: 'Violet', ends: 'Dispel Magic'}
];
const layer = k => LAYERS.find(l => l.key === k);

async function castPrism(wf, globe) {
    const tpl = await templateOf(wf);
    if (!tpl) return gmWhisper('<b>Prismatic Wall</b>: no template was placed, so the wall isn\'t tracked.');
    const cfg = cfgOf(wf.item);
    const s = shapeOf(tpl, gridOf());
    const me = wf.token ?? tokenOfActor(wf.actor);
    const disp = me?.document.disposition;
    const allowed = canvas.tokens.placeables.filter(t => t?.actor && (t.id === me?.id || (disp !== undefined && t.document.disposition === disp))).map(t => t.document.uuid);
    const W = CONST.WALL_SENSE_TYPES, M = CONST.WALL_MOVEMENT_TYPES;
    const wall = c => ({c, move: M.NONE, sight: W.NORMAL, light: W.NONE, sound: W.NONE, flags: {[MODULE_ID]: {petraWall: tpl.id}}});
    const segs = [];
    if (s.type === 'line') segs.push(wall([s.a.x, s.a.y, s.b.x, s.b.y].map(Math.round)));
    else for (let i = 0; i < 24; i++) {
        const a0 = i / 24 * 2 * Math.PI, a1 = (i + 1) / 24 * 2 * Math.PI;
        segs.push(wall([s.c.x + Math.cos(a0) * s.r, s.c.y + Math.sin(a0) * s.r, s.c.x + Math.cos(a1) * s.r, s.c.y + Math.sin(a1) * s.r].map(Math.round)));
    }
    const scene = tpl.parent;
    const made = await scene.createEmbeddedDocuments('Wall', segs);
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
    const pick = await cpr()?.dialogUtils?.buttonDialog?.(wf.item.name, 'Layers left, outside in: <b>' + st.layers.map(k => layer(k).label).join(', ')
        + '</b>.<br>Layers fall one at a time, red first. (Dispel Magic can only end the violet layer, once it is the last.)', buttons, {userId: gmId()});
    if (pick === 'end') return tpl.delete();
    if (pick !== 'destroy') return;
    const layers = st.layers.slice(1);
    if (!layers.length) {
        await chat(wf.actor, '<b>' + esc(st.name) + '</b>: the last layer falls; the wall is gone.');
        return tpl.delete();
    }
    await tpl.setFlag(MODULE_ID, WALL, {...st, layers});
    await chat(wf.actor, '<b>' + esc(st.name) + '</b>: the ' + next.label.toLowerCase() + ' layer is destroyed. Left: ' + layers.map(k => layer(k).label).join(', ') + '.');
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
        const L = layer(k);
        const name = st.name + ': ' + L.label;
        if (L.type) { await hurt(caster, [tok], {name, img: st.img, formula: st.dice + 'd6', type: L.type, ability: 'dex', dc: st.dc}); continue; }
        const failed = await hurt(caster, [tok], {name, img: st.img, ability: 'dex', dc: st.dc, onSave: 'none'});
        if (!failed.has(doc.id)) continue;
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
            const st = wallState(tpl), s = shapeOf(tpl, gridOf());
            const hit = crosses(from, to, s) || (distTo(to, s) <= rad && distTo(from, s) > rad);
            if (!hit) continue;
            const seen = entered.get(tpl.id) ?? new Map();
            entered.set(tpl.id, seen);
            if (seen.get(doc.id) === turnKey()) continue;
            seen.set(doc.id, turnKey());
            await deathTick(tpl, doc, 'enters');
        }
        for (const tpl of walls('prism')) {
            const s = shapeOf(tpl, gridOf());
            if (crosses(from, to, s) || (distTo(to, s) <= rad && distTo(from, s) > rad)) await prismPass(tpl, doc);
            if (!canvas.scene.templates.get(tpl.id)) continue;
            if (near20(to, doc, s) && !near20(from, doc, s)) await prismGlare(tpl, doc);
        }
    });
}

async function deathTick(tpl, doc, why) {
    const st = wallState(tpl);
    const caster = casterOf(st);
    if (!caster || !doc.object || !alive(doc)) return;
    await hurt(caster, [doc.object], {name: st.name + (why === 'enters' ? ' (enters the wall)' : ' (ends its turn)'), img: st.img,
        formula: st.formula, type: st.type, ability: st.ability, dc: st.dc, save: !!st.tickSave});
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
                if (inDeathZone(centerOf(pdoc), radiusOf(pdoc), shapeOf(tpl, gridOf()), st.side, Number(st.reach ?? 10) * pxft())) await deathTick(tpl, pdoc, 'ends');
            }
            await indigoSave(pdoc);
        }
        // Start of the current creature's turn.
        const cdoc = combat.combatant?.token;
        const actor = combat.combatant?.actor;
        if (cdoc?.actor && cdoc.parent?.id === canvas.scene?.id) {
            for (const tpl of walls('prism')) if (near20(centerOf(cdoc), cdoc, shapeOf(tpl, gridOf()))) await prismGlare(tpl, cdoc);
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
    if (tpl && tpl.parent?.templates.get(tpl.id)) await tpl.delete().catch(() => {});
}

export function registerPetraSpells() {
    Hooks.on('midi-qol.premades.postPreambleComplete', onPreamble);
    Hooks.on('midi-qol.premades.postRollFinished', onRollFinished);
    Hooks.on('midi-qol.premades.preDamageRollComplete', onDamageRolled);
    Hooks.on('canvasReady', onCanvasReady);
    Hooks.on('createToken', doc => { if (doc.parent?.id === canvas.scene?.id) lastPos.set(doc.id, centerOf(doc)); });
    Hooks.on('updateToken', onUpdateToken);
    Hooks.on('updateCombat', onUpdateCombat);
    Hooks.on('deleteMeasuredTemplate', onDeleteTemplate);
    Hooks.on('deleteActiveEffect', onDeleteEffect);
    if (canvas?.ready) onCanvasReady();
    return {LAYERS, burstPlan, shapeOf, distTo, sideOf, crosses, sideLabels, inDeathZone, risePending, zombieActor};
}
