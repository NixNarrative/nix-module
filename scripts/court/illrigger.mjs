// =====================================================================
//  NIX FIX: Illrigger engine (Court of Ravenloft; v13 Chris's Premades 1 and v14 CAT)
//
//  Replaces Chris's Premades' Baleful Interdict prompt flow for every actor the
//  "Illrigger engine" world installer has prepared (flags.nix-module.illrigger).
//  Rule of thumb: at most ONE GM dialog per event.
//
//   One dialog per damage event, AFTER the damage lands (1.7.1), one row per
//   (target, Illrigger in range). A weapon hit by a prepared Illrigger adds his
//   "Place a seal" (no seals there yet) or "Also place another seal" to that dialog.
//   Only Deathstrike asks at the hit (it makes the hit critical), and only when usable.
//   Any damage to a sealed creature counts (anyone's attack, spells, minions, AoE).
//   Rows hold: seals to burn, fire/necrotic, and that Illrigger's boons
//   (Bedevil, Styx's Apathy, Unleash Hell, Soul Eater, Exsanguinate). One click applies all.
//   Silent: Superior Interdict (ignores resistance), Axiomatic Seals, Hell's
//   Assassin rerolls, True Name +1d6 (and free seals on a natural 18-20, Nix's rule), Soul's Doom on every kind of damage, Terrorizing Force (v13).
//   Boons spend the Interdict Boons use only, never a second seal (1.7.1).
//
//  Seals stay Chris's Premades-shaped ActiveEffects (identifier
//  balefulInterdictEffect, origin = the Baleful Interdict item) so its boons
//  (Dispater's Supremacy, Move Seals...) still recognise them; their CPR macro
//  is stripped so CPR never asks to burn.
//  Runs on the active GM's client. API: game.modules.get('nix-module').api.illrigger
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {cpr, fx, ident as engineIdent, isCat, MODES, HOOKS} from './engine.mjs';
import {take as takeBrawl} from './brawl.mjs';

export const FLAG = 'illrigger';
export const SEAL_ID = 'balefulInterdictEffect';
const BURN_TYPES = ['necrotic', 'fire'];
const DOWN = ['incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified', 'dead'];
const EVENT_WINDOW = 350;                    // ms: damage landing this close together is one event
const IN_FLIGHT_MS = 6000;
const HIT_TTL = 10 * 60 * 1000;              // ms: a hit waits this long for its damage (applied by hand from the card)

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const ident = engineIdent;
export const cfgOf = actor => actor?.flags?.[MODULE_ID]?.[FLAG] ?? null;
export const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- lookups
// The actor that owns a seal: the flag Nix Fix writes, else the effect's origin.
// The origin can be the Baleful Interdict item (engine / Chris's Premades seals), one of its
// activities, or the Illrigger himself: a seal placed with the item's Bonus Action activity
// comes out with the actor as its origin (1.7.1 table test), so all three resolve.
function originDoc(effect) {
    try { return effect.origin ? fromUuidSync(effect.origin, {strict: false}) ?? null : null; }
    catch { return null; }
}
function originItem(effect) {
    const o = originDoc(effect);
    if (o?.documentName === 'Item') return o;
    if (o?.item?.documentName === 'Item') return o.item;            // an activity
    return null;
}
export function originActor(effect) {
    const o = originDoc(effect);
    if (o?.documentName === 'Actor') return o;
    return originItem(effect)?.actor ?? null;
}
export function sealOwner(effect) {
    const u = effect.flags?.[MODULE_ID]?.seal?.owner;
    if (u) { try { const a = fromUuidSync(u, {strict: false}); if (a) return a; } catch { /* fall through */ } }
    return originActor(effect);
}
const isBI = item => !!item && (ident(item) === 'balefulInterdict' || /^baleful interdict\b/i.test(item.name) && !/:\s*(burn|move)/i.test(item.name));
export function isSeal(effect) {
    if (!effect || effect.documentName !== 'ActiveEffect') return false;
    if (effect.flags?.[MODULE_ID]?.seal) return true;
    if (ident(effect) === SEAL_ID) return true;
    if (!/baleful interdict|seal/i.test(effect.name)) return false;
    const o = originItem(effect);
    if (o) return isBI(o);
    // Actor origin: only an Illrigger with a Baleful Interdict item, and only the seal itself.
    const a = originActor(effect);
    return !!a && !!a.items?.some?.(isBI) && /^baleful interdict(\s*:.*)?$/i.test(effect.name.trim());
}
export const biItem = actor => actor?.items.filter(isBI)
    .sort((a, b) => (ident(b) === 'balefulInterdict') - (ident(a) === 'balefulInterdict') || (Number(b.system.uses?.max) || 0) - (Number(a.system.uses?.max) || 0))[0] ?? null;
const byIdOrName = (actor, id, re) => (id && actor.items.get(id)) || actor.items.find(i => re.test(i.name));

// The same Illrigger: same uuid, or the same base actor (an unlinked token's synthetic actor has
// the world actor's id; a seal whose origin is the world actor's item still belongs to the token).
export const sameActor = (a, b) => !!a && !!b && (a === b || a.uuid === b.uuid || (!!a.id && a.id === b.id && a.documentName === b.documentName));
// This owner's seals on one actor (1.7.1: owner matched with sameActor, not only by uuid).
export function sealsOf(actor, owner) {
    const out = [];
    for (const e of actor?.effects ?? []) if (isSeal(e) && sameActor(sealOwner(e), owner)) out.push(e);
    return out;
}

// Seals on one actor, grouped by owner uuid: Map(ownerUuid -> {owner, effects}).
export function sealsOn(actor) {
    const out = new Map();
    for (const e of actor?.effects ?? []) {
        if (!isSeal(e)) continue;
        const owner = sealOwner(e);
        if (!owner) continue;
        const k = owner.uuid;
        if (!out.has(k)) out.set(k, {owner, effects: []});
        out.get(k).effects.push(e);
    }
    return out;
}

export const tokenOf = actor => actor?.token?.object ?? actor?.getActiveTokens?.()[0] ?? null;
const distance = (a, b) => (cpr()?.tokenUtils?.getDistance ?? MidiQOL.getDistance)(a, b, {});
const isDown = actor => DOWN.some(s => actor?.statuses?.has(s)) || (actor?.system?.attributes?.hp?.value ?? 1) <= 0;
const creatureType = actor => String(cpr()?.actorUtils?.typeOrRace?.(actor) ?? actor?.system?.details?.type?.value ?? '').toLowerCase();
export const living = actor => !['construct', 'undead'].includes(creatureType(actor));
const inCombat = () => !!game.combat?.started;
const turnKey = () => inCombat() ? game.combat.id + ':' + game.combat.round + ':' + game.combat.turn : null;
const usedReaction = a => inCombat() && (cpr()?.actorUtils?.hasUsedReaction?.(a) ?? MidiQOL.hasUsedReaction?.(a));
const setReaction = async a => { if (inCombat()) await (cpr()?.actorUtils?.setReactionUsed?.(a) ?? MidiQOL.setReactionUsed?.(a)); };

// Range from the Illrigger to the target, and whether he can act on it now.
const rangeOf = owner => Number(cfgOf(owner)?.range) || 30;
export function inReach(owner, targetToken) {
    const me = tokenOf(owner);
    if (!me || !targetToken || isDown(owner)) return false;
    return distance(me, targetToken) <= rangeOf(owner);
}

// ---------------------------------------------------------------- seal dice
export function sealDice(owner) {
    const c = cfgOf(owner) ?? {};
    const sc = owner.system.scale?.[c.classId || 'illrigger'] ?? {};
    const s = sc[c.damageScale] ?? sc['baleful-interdict-damage'] ?? sc['burnseal'];
    if (s?.number && s?.faces) return {number: Number(s.number), faces: Number(s.faces)};
    const lvl = owner.classes?.[c.classId || 'illrigger']?.system.levels ?? owner.system.details?.level ?? 1;
    return {number: lvl >= 20 ? 4 : lvl >= 11 ? 3 : lvl >= 5 ? 2 : 1, faces: 6};
}

// Soul's Doom on a creature: +X whenever it takes damage. X = the owner's proficiency bonus.
export function soulsDoomBonus(actor) {
    let total = 0;
    for (const e of actor?.effects ?? []) {
        if (e.disabled || !/soul'?s doom/i.test(e.name)) continue;
        const owner = originActor(e);
        if (owner && cfgOf(owner)) total += owner.system.attributes.prof ?? 0;
    }
    return total;
}

// The burn formula for n seals (pure; exported for tests).
export function burnFormula({dice, n, deathstrike = false, hellsAssassin = false, trueName = false, axiomatic = 0, flat = 0}) {
    const rr = hellsAssassin ? 'r<3' : '';
    const count = n * dice.number + (deathstrike ? dice.number : 0);
    const parts = [count + 'd' + dice.faces + rr];
    if (trueName) parts.push('1d6' + rr);
    if (axiomatic) parts.push(String(axiomatic * n));
    if (flat) parts.push(String(flat));
    return parts.join(' + ');
}

// ---------------------------------------------------------------- damage we apply ourselves
// Damage Nix Fix applies (burns, Soul's Doom) mustn't open another dialog.
const inFlight = new Map();     // actorUuid -> [expiry...]
function markInFlight(actor, times = 1) {
    const list = inFlight.get(actor.uuid) ?? [];
    for (let i = 0; i < times; i++) list.push(Date.now() + IN_FLIGHT_MS);
    inFlight.set(actor.uuid, list);
}
function consumeInFlight(actor) {
    const list = (inFlight.get(actor.uuid) ?? []).filter(t => t > Date.now());
    if (!list.length) { inFlight.delete(actor.uuid); return false; }
    list.shift();
    if (list.length) inFlight.set(actor.uuid, list); else inFlight.delete(actor.uuid);
    return true;
}

// A one-off damage activity rolled by the Illrigger through Midi (card, resistances, concentration...).
async function rollDamage(owner, targetToken, formula, type, name, img) {
    const id = 'nixBurnActivity0';
    const itemData = {
        name, img: img ?? 'icons/magic/fire/flame-burning-hand-purple.webp', type: 'feat',
        system: {activities: {[id]: {_id: id, type: 'damage', name, activation: {type: 'special'},
            range: {units: 'any'}, target: {affects: {count: '1', type: 'creature'}},
            damage: {parts: [{custom: {enabled: true, formula}, types: [type]}], critical: {allow: false}}}}},
        flags: {[MODULE_ID]: {burnRoll: true}, autoanimations: {isEnabled: false, version: 5}}
    };
    markInFlight(targetToken.actor);
    const wf = await cpr().workflowUtils.syntheticItemDataRoll(itemData, owner, [targetToken]);
    return wf?.damageTotal ?? wf?.damageList?.[0]?.totalDamage ?? 0;
}

// Unleash Hell (1.7.1, Nix): a dark purple blast on the burned creature, 5 ft beyond its edges.
export const UNLEASH_FILE = 'modules/jb2a_patreon/Library/Generic/Explosion/Explosion_04_Dark_Purple_400x400.webm';
function unleashAnimation(token) {
    try {
        if (!globalThis.Sequence || !token) return;
        const w = Math.max(token.document?.width ?? 1, token.document?.height ?? 1);
        new Sequence().effect().file(UNLEASH_FILE).atLocation(token).size(w + 2, {gridUnits: true}).play();
    } catch (err) { console.warn(TITLE + ' | Unleash Hell animation', err); }
}

async function withSuperiorInterdict(owner, fn) {
    if (!cfgOf(owner)?.superiorInterdict) return fn();
    const [tmp] = await owner.createEmbeddedDocuments('ActiveEffect', [fx({
        name: 'Superior Interdict (burning)', img: 'icons/magic/fire/flame-burning-skull-orange.webp', transfer: false,
        duration: {seconds: 6}, changes: BURN_TYPES.map(v => ({key: 'system.traits.idr.value', mode: MODES.ADD, value: v, priority: 20})),
        flags: {[MODULE_ID]: {transient: true}}
    })]);
    try { return await fn(); }
    finally { if (tmp) await tmp.delete().catch(() => {}); }
}

// ---------------------------------------------------------------- placing seals
const placedTurn = new Map();   // ownerUuid -> turnKey
export function canPlace(owner, targetToken, {ignoreTurn = false} = {}) {
    const c = cfgOf(owner);
    const item = biItem(owner);
    if (!c || !item || !targetToken?.actor || targetToken.actor.uuid === owner.uuid) return false;
    if (!ignoreTurn && turnKey() && placedTurn.get(owner.uuid) === turnKey()) return false;
    if (!c.unlimitedSeals && item.system.uses?.max && !(item.system.uses.value > 0)) return false;
    return inReach(owner, targetToken);
}

// RAW a seal lasts 1 minute: Temporary, 10 rounds (both versions; v14 gets {value, units}).
export function sealDuration() {
    if (isCat()) return {rounds: 10};
    const c = game.combat?.started ? game.combat : null;
    return {rounds: 10, seconds: 60, turns: 0, startTime: game.time?.worldTime ?? 0,
        combat: c?.id ?? null, startRound: c?.round ?? 0, startTurn: c?.turn ?? 0};
}
function sealData(owner, item) {
    const src = item.effects.find(e => !e.transfer && (ident(e) === SEAL_ID || /baleful interdict|seal/i.test(e.name))) ?? item.effects.find(e => !e.transfer);
    const data = src ? src.toObject() : {name: 'Baleful Interdict', img: item.img};
    delete data._id;
    foundry.utils.mergeObject(data, {
        name: 'Baleful Interdict: ' + owner.name, transfer: false, disabled: false, origin: item.uuid,
        'flags.chris-premades.info.identifier': SEAL_ID,
        ['flags.' + MODULE_ID + '.seal']: {owner: owner.uuid}
    });
    if (data.flags?.['chris-premades']) delete data.flags['chris-premades'].macros;
    if (data.flags?.dnd5e) delete data.flags.dnd5e.dependents;
    if (data.flags?.cat) { delete data.flags.cat.macros; delete data.flags.cat.embeddedMacros; }
    data.duration = sealDuration();
    return fx(data);
}

// free: not from his pool. bonus (True Name): free AND not his once-per-turn placement.
export async function placeSeal(owner, targetToken, count = 1, {free = false, bonus = false} = {}) {
    if (bonus) free = true;
    const c = cfgOf(owner);
    const item = biItem(owner);
    if (!item || !targetToken?.actor) return 0;
    let n = count;
    if (!free && !c?.unlimitedSeals && item.system.uses?.max) {
        n = Math.min(n, item.system.uses.value ?? 0);
        if (n > 0) await item.update({'system.uses.spent': (item.system.uses.spent ?? 0) + n});
    }
    if (n <= 0) return 0;
    const data = sealData(owner, item);
    if (bonus) foundry.utils.setProperty(data, 'flags.' + MODULE_ID + '.seal.bonus', true);
    await targetToken.actor.createEmbeddedDocuments('ActiveEffect', Array.from({length: n}, () => foundry.utils.deepClone(data)));
    if (turnKey() && !bonus) placedTurn.set(owner.uuid, turnKey());
    return n;
}

// ---------------------------------------------------------------- burning
// row: {owner, token, n, type, deathstrike, boons: {bedevil, styx, unleash, soulEater, exsanguinate: allyTokenId}}
export async function executeRow(row) {
    const {owner, token} = row;
    const c = cfgOf(owner) ?? {};
    const mine = sealsOf(token.actor, owner);
    const n = Math.min(Number(row.n) || 0, mine.length);
    if (n <= 0) return 0;
    const item = biItem(owner);
    const trueName = !!(c.trueNameItem && owner.items.get(c.trueNameItem)?.system.attuned !== false && owner.items.get(c.trueNameItem));
    const formula = burnFormula({dice: sealDice(owner), n, deathstrike: !!row.deathstrike, hellsAssassin: !!c.hellsAssassin,
        trueName, axiomatic: Number(c.axiomatic) || 0, flat: soulsDoomBonus(token.actor)});
    const type = BURN_TYPES.includes(row.type) ? row.type : 'necrotic';
    // Remove exactly the burned seals, this Illrigger's only.
    await token.actor.deleteEmbeddedDocuments('ActiveEffect', mine.slice(0, n).map(e => e.id));
    const dealt = await withSuperiorInterdict(owner, () =>
        rollDamage(owner, token, formula, type, (item?.name ?? 'Baleful Interdict') + ': ' + n + ' seal' + (n > 1 ? 's' : '') + ' burned', item?.img));
    await runBoons(row, dealt, type);
    return dealt;
}

const boonItem = (owner, id, re) => owner.items.find(i => ident(i) === id) ?? owner.items.find(i => re.test(i.name));
const boonPool = owner => boonItem(owner, 'interdictBoons', /^interdict boons$/i);
const boonPoolOk = owner => { const p = boonPool(owner); return !p?.system.uses?.max || (Number(p.system.uses.value) || 0) > 0; };
const illriggerLevel = owner => owner.classes?.[cfgOf(owner)?.classId || 'illrigger']?.system.levels ?? cfgOf(owner)?.level ?? owner.system.details?.level ?? 0;
export function boonsFor(owner, targetToken) {
    const c = cfgOf(owner) ?? {};
    const out = [];
    const r = usedReaction(owner);
    const b = boonItem(owner, 'interdictBoonBedevil', /bedevil/i);
    if (b && boonPoolOk(owner)) out.push({key: 'bedevil', label: 'Bedevil', hint: 'next save −' + (owner.system.attributes.prof ?? '')});
    const s = boonItem(owner, 'interdictBoonStyxsApathy', /styx'?s apathy/i);
    if (s && boonPoolOk(owner) && !r) out.push({key: 'styx', label: 'Styx\'s Apathy', hint: 'reaction: no reactions'});
    const u = boonItem(owner, 'interdictBoonUnleashHell', /unleash hell/i);
    if (u && boonPoolOk(owner) && !r) out.push({key: 'unleash', label: 'Unleash Hell', hint: 'reaction: its allies within 5 ft'});
    // Soul Eater (captains, 1.7.1): no action, temp HP = his illrigger level. Spends the turn's boon use, not a seal.
    const se = boonItem(owner, 'interdictBoonSoulEater', /soul eater/i);
    if (se && boonPoolOk(owner)) out.push({key: 'soulEater', label: 'Soul Eater', hint: '+' + illriggerLevel(owner) + ' temporary HP for ' + owner.name});
    if (c.exsanguinate && living(targetToken.actor)) {
        const me = tokenOf(owner);
        const allies = me ? canvas.tokens.placeables.filter(t => t.actor && t.document.disposition === me.document.disposition
            && !isDown(t.actor) && distance(me, t) <= 30) : [];
        if (allies.length) out.push({key: 'exsanguinate', label: 'Exsanguinate', hint: 'temp HP to', allies});
    }
    return out;
}

// Boons ride on the burn: they spend the turn's Interdict Boons use, never another seal (1.7.1, Nix).
// Chris's Premades' boon items consume a Baleful Interdict seal too, so their resources aren't consumed here.
async function spendBoonUse(owner) {
    const pool = boonPool(owner);
    if (pool?.system.uses?.max) await pool.update({'system.uses.spent': (pool.system.uses.spent ?? 0) + 1});
}
async function runBoons(row, dealt, type) {
    const {owner, token, boons = {}} = row;
    const u = cpr();
    if (boons.bedevil || boons.styx || boons.unleash || boons.soulEater) await spendBoonUse(owner);
    if (boons.bedevil) {
        const it = boonItem(owner, 'interdictBoonBedevil', /bedevil/i);
        if (it) await u.workflowUtils.syntheticItemRoll(it, [token], {consumeUsage: true, consumeResources: false});
    }
    if (boons.styx) {
        const it = boonItem(owner, 'interdictBoonStyxsApathy', /styx'?s apathy/i);
        if (it) { await u.workflowUtils.syntheticItemRoll(it, [token], {consumeUsage: true, consumeResources: false}); await setReaction(owner); }
    }
    if (boons.unleash && dealt > 0) {
        const it = boonItem(owner, 'interdictBoonUnleashHell', /unleash hell/i);
        const act = it?.system.activities.find(a => a.type === 'save') ?? it?.system.activities.contents[0];
        const near = u.tokenUtils.findNearby(token, 5, 'ally', {includeIncapacitated: true}).filter(t => t.actor?.uuid !== owner.uuid);
        if (act && near.length) {
            const data = foundry.utils.deepClone(act.toObject());
            if (data.damage?.parts?.[0]) { data.damage.parts[0].bonus = String(dealt); data.damage.parts[0].types = [type]; data.damage.parts[0].number = null; }
            near.forEach(t => markInFlight(t.actor));
            // 1.7.1: the splash is seal damage too, so it ignores resistance like the burn (Superior Interdict).
            await withSuperiorInterdict(owner, () => u.workflowUtils.syntheticActivityDataRoll(data, it, owner, near, {consumeUsage: true, consumeResources: false}));
        }
        unleashAnimation(token);
        await setReaction(owner);
    }
    if (boons.soulEater) {
        const gain = illriggerLevel(owner), cur = owner.system.attributes.hp.temp ?? 0;
        if (gain > cur) await owner.update({'system.attributes.hp.temp': gain});
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: owner}),
            content: '<b>Soul Eater:</b> ' + esc(owner.name) + ' gains ' + gain + ' temporary hit points' + (gain > cur ? '' : ' (already had ' + cur + ')') + '.'});
    }
    if (boons.exsanguinate && dealt > 0) {
        const ally = canvas.tokens.get(boons.exsanguinate);
        if (ally?.actor) {
            const cur = ally.actor.system.attributes.hp.temp ?? 0;
            if (dealt > cur) await ally.actor.update({'system.attributes.hp.temp': dealt});
            Hooks.callAll('nixExsanguinate', owner, ally, dealt);
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: owner}),
                content: '<b>Exsanguinate:</b> ' + esc(ally.document.name) + ' gains ' + dealt + ' temporary hit points' + (dealt > cur ? '' : ' (already had ' + cur + ')') + '.'});
        }
    }
}

// ---------------------------------------------------------------- the dialog
// rows: [{owner, token, have, place: 'only'|'also'|null, deathstrike: bool, boons: [...]}]
const lastType = new Map();
// extras (1.7.1): other after-damage choices for the same hit (brawl.mjs: push / grapple), {html, read(form)}.
async function decide(title, intro, rows, extras = []) {
    if (!rows.length) return null;
    const body = rows.map((r, i) => {
        const pre = 'r' + i + '.';
        const cells = [];
        cells.push('<td><b>' + esc(r.owner.name) + '</b><br><small>on ' + esc(r.token.document.name) + '</small></td>');
        if (r.have) {
            const opts = Array.from({length: r.have + 1}, (_, k) => '<option value="' + k + '"' + (k === (r.deathstrikeMin ? 1 : 0) ? ' selected' : '') + '>' + k + '</option>').join('');
            const t = lastType.get(r.owner.uuid) ?? 'necrotic';
            cells.push('<td>Burn <select name="' + pre + 'n">' + opts + '</select> of ' + r.have
                + ' <select name="' + pre + 'type">' + BURN_TYPES.map(x => '<option value="' + x + '"' + (x === t ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>'
                + '<br><small>' + esc(sealDice(r.owner).number + 'd' + sealDice(r.owner).faces) + ' per seal</small></td>');
        } else cells.push('<td><i>' + esc(r.note ?? 'no seals yet') + '</i></td>');
        const extra = [];
        if (r.place === 'only') extra.push('<label><input type="checkbox" name="' + pre + 'place" checked> Place a seal</label>');
        if (r.place === 'also') extra.push('<label><input type="checkbox" name="' + pre + 'place"> Also place another seal</label>');
        if (r.deathstrikeDone) extra.push('<span title="Used on the hit: it was a critical hit">Deathstrike: burn at least 1, seal dice doubled</span>');
        if (r.deathstrike) extra.push('<label title="Reaction: the hit becomes a critical hit; burn at least 1 seal, seal dice doubled"><input type="checkbox" name="' + pre + 'deathstrike"> Deathstrike</label>');
        for (const b of r.boons ?? []) {
            if (b.allies) extra.push('<label>' + esc(b.label) + ' <select name="' + pre + 'exsanguinate"><option value="">no</option>'
                + b.allies.map(t => '<option value="' + t.id + '">' + esc(t.document.name) + '</option>').join('') + '</select></label>');
            else extra.push('<label title="' + esc(b.hint) + '"><input type="checkbox" name="' + pre + b.key + '"> ' + esc(b.label) + '</label>');
        }
        cells.push('<td class="nix-ill-extra">' + extra.join('<br>') + '</td>');
        return '<tr>' + cells.join('') + '</tr>';
    }).join('');
    const content = '<div class="nix-illrigger">' + (intro ? '<p>' + intro + '</p>' : '')
        + '<table><tbody>' + body + '</tbody></table>' + extras.map(x => x.html).join('') + '</div>';
    const read = (form) => rows.map((r, i) => {
        const g = n => form.elements['r' + i + '.' + n];
        const out = {owner: r.owner, token: r.token, have: r.have, hit: r.hit ?? null,
            n: Number(g('n')?.value ?? 0), type: g('type')?.value ?? 'necrotic',
            place: !!g('place')?.checked, deathstrike: !!r.deathstrikeDone || !!g('deathstrike')?.checked,
            boons: {bedevil: !!g('bedevil')?.checked, styx: !!g('styx')?.checked, unleash: !!g('unleash')?.checked, soulEater: !!g('soulEater')?.checked, exsanguinate: g('exsanguinate')?.value || null}};
        if (out.deathstrike && out.n < 1) out.n = Math.min(1, r.have);
        if (r.have) lastType.set(r.owner.uuid, out.type);
        return out;
    });
    const DialogV2 = foundry.applications.api.DialogV2;
    const result = await DialogV2.wait({
        window: {title}, position: {width: 520}, rejectClose: false, content,
        buttons: [
            {action: 'apply', label: 'Apply', icon: 'fa-solid fa-fire', default: true, callback: (ev, button) => { for (const x of extras) x.read(button.form); return read(button.form); }},
            {action: 'skip', label: 'Skip', icon: 'fa-solid fa-xmark', callback: () => null}
        ]
    });
    return Array.isArray(result) ? result : null;
}

// ---------------------------------------------------------------- True Name (Nix's rule, 1.7.1)
// A natural 18 or 19 with his attuned True Name weapon places one free seal on the creature hit,
// a natural 20 two, whether or not he places his own seal on that hit (free: not from his pool,
// and not his once-per-turn placement).
export function trueNameSeals(owner, hit) {
    const c = cfgOf(owner);
    if (!c?.trueNameItem || !hit || hit.itemId !== c.trueNameItem) return 0;
    const w = owner.items?.get?.(c.trueNameItem);
    if (!w || w.system?.attuned === false) return 0;
    const d = Number(hit.d20) || 0;
    return d >= 20 ? 2 : d >= 18 ? 1 : 0;
}

// ---------------------------------------------------------------- weapon hits by an Illrigger
// 1.7.1 (Nix): ONE dialog per hit, after the damage lands, so the burn and its boons are chosen
// with the damage known. A hit by a marked Illrigger only records itself; the damage event (flush)
// adds his "Place a seal" to the burn rows. Deathstrike is the one choice that has to come before
// the damage (it makes the hit critical): it asks first, and only when it can be used.
const hits = new Map();   // targetActorUuid -> {attacker, itemId, itemName, d20, deathstrike, turn, expires}
const hitFresh = h => !!h && h.expires > Date.now() && (!turnKey() || h.turn === turnKey());
async function askDeathstrike(attacker, targets) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const res = await DialogV2.wait({
        window: {title: TITLE + ': Deathstrike'}, position: {width: 440}, rejectClose: false,
        content: '<p>' + esc(attacker.name) + ' hits ' + targets.map(t => esc(t.document.name)).join(', ') + ', carrying his seals. '
            + 'Deathstrike (reaction): the hit becomes a critical hit; after the damage you burn at least 1 seal with doubled dice.</p>',
        buttons: targets.map((t, i) => ({action: 't' + i, label: 'Deathstrike' + (targets.length > 1 ? ': ' + t.document.name : ''), icon: 'fa-solid fa-skull', default: i === 0}))
            .concat([{action: 'no', label: 'No', icon: 'fa-solid fa-xmark'}])
    });
    const i = typeof res === 'string' && res.startsWith('t') ? Number(res.slice(1)) : -1;
    return targets[i] ?? null;
}
async function onAttackComplete(workflow) {
    try {
        if (!isActiveGM() || !workflow?.hitTargets?.size) return;
        const attacker = workflow.actor;
        const isWeapon = workflow.item?.type === 'weapon' || cpr()?.workflowUtils?.isAttackType?.(workflow, 'weaponAttack');
        if (!isWeapon || workflow.workflowOptions?.nixNoSeal) return;
        const mineCfg = cfgOf(attacker);
        if (!mineCfg) return;
        const melee = cpr()?.workflowUtils?.isAttackType?.(workflow, 'meleeWeaponAttack');
        const ds = byIdOrName(attacker, mineCfg.deathstrike, /^deathstrike/i);
        const dsOk = !!ds && melee && !workflow.isCritical && !usedReaction(attacker) && (ds.system.uses?.max ? ds.system.uses.value > 0 : true);
        const dsTargets = [];
        for (const t of workflow.hitTargets) {
            if (!t?.actor || t.actor.uuid === attacker.uuid) continue;
            hits.set(t.actor.uuid, {attacker, itemId: workflow.item?.id ?? null, itemName: workflow.item?.name ?? '', d20: workflow.d20AttackRoll ?? 0,
                deathstrike: false, turn: turnKey(), expires: Date.now() + HIT_TTL});
            if (dsOk && sealsOf(t.actor, attacker).length && inReach(attacker, t)) dsTargets.push(t);
        }
        if (!dsTargets.length) return;
        const t = await askDeathstrike(attacker, dsTargets);
        if (!t) return;
        if (ds.system.uses?.max) await ds.update({'system.uses.spent': (ds.system.uses.spent ?? 0) + 1});
        await setReaction(attacker);
        const h = hits.get(t.actor.uuid);
        if (h) h.deathstrike = true;
        await workflow.setAttackRoll(cpr().rollUtils.makeCritical(workflow.attackRoll));
        workflow.isCritical = true;
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: attacker}), content: '<b>Deathstrike:</b> the hit becomes a critical hit.'});
    } catch (err) { console.error(TITLE + ' | Illrigger hit', err); }
}
async function onRollFinished() {
    for (const [k, v] of hits) if (v.expires <= Date.now()) hits.delete(k);
}

// Terrorizing Force on v13 (1.7.1): Nix Fix adds it, for every Court Illrigger the engine installer
// flagged (flags.nix-module.terrorizingForce = {damageType}). Weapon attacks that hit, unarmed strikes
// included; 2d8 in Infernal Majesty. v14: illrigger-features.mjs (CAT macro) does it.
// 1.7.1: added to the weapon's own damage roll before it's rolled (dnd5e.preRollDamageV2), so manual
// rolls ask once, like the weapon dice; the separate bonus roll below only runs if that hook didn't.
const tfItem = a => a?.items.find(i => i.flags?.[MODULE_ID]?.terrorizingForce) ?? null;
const tfDice = a => a.effects.some(e => !e.disabled && !e.transfer && (ident(e) === 'infernalMajestyEffect' || /^infernal majesty/i.test(e.name))) ? '2d8' : '1d8';
function onPreRollDamage(config) {
    try {
        if (isCat()) return;
        const activity = config?.subject;
        const item = activity?.item, a = activity?.actor ?? item?.actor;
        if (activity?.type !== 'attack' || item?.type !== 'weapon') return;
        const tf = tfItem(a);
        if (!tf || !Array.isArray(config.rolls)) return;
        let wf;
        try { wf = globalThis.MidiQOL?.Workflow?.getWorkflow?.(activity.uuid); } catch { wf = undefined; }
        if (!wf || wf.nixTerrorizing || !wf.hitTargets?.size) return;
        const type = tf.flags[MODULE_ID].terrorizingForce.damageType || 'fire';
        const first = config.rolls[0] ?? {};
        config.rolls.push({parts: [tfDice(a)], data: first.data ?? activity.getRollData?.() ?? {},
            options: {type, types: [type], properties: Array.from(first.options?.properties ?? []), flavor: tf.name}});
        wf.nixTerrorizing = true;
    } catch (err) { console.error(TITLE + ' | Terrorizing Force (damage roll)', err); }
}
async function terrorizingForce(workflow) {
    if (isCat() || workflow?.nixTerrorizing) return;
    const a = workflow?.actor;
    if (!a || !workflow.hitTargets?.size || workflow.item?.type !== 'weapon' || workflow.activity?.type !== 'attack') return;
    const tf = tfItem(a);
    if (!tf) return;
    workflow.nixTerrorizing = true;
    await cpr().workflowUtils.bonusDamage(workflow, tfDice(a), {damageType: tf.flags[MODULE_ID].terrorizingForce.damageType || 'fire'});
}

// Hell's Assassin: reroll 1s and 2s (once) on his weapon damage against a creature he has sealed.
async function onDamageRolled(workflow) {
    try { await terrorizingForce(workflow); } catch (err) { console.error(TITLE + ' | Terrorizing Force', err); }
    try {
        const c = cfgOf(workflow?.actor);
        if (!c?.hellsAssassin || workflow.item?.type !== 'weapon' || !workflow.damageRolls?.length) return;
        const t = workflow.hitTargets?.first?.();
        if (!t?.actor || !(sealsOf(t.actor, workflow.actor).length > 0)) return;
        let changed = false;
        for (const roll of workflow.damageRolls) {
            for (const term of roll.terms) {
                if (!(term instanceof foundry.dice.terms.Die)) continue;
                for (const r of term.results) if (r.active && !r.rerolled && r.result <= 2) {
                    r.result = Math.ceil(CONFIG.Dice.randomUniform() * term.faces); r.rerolled = true; changed = true;
                }
            }
            if (changed) roll._total = roll._evaluateTotal();
        }
        if (changed) await workflow.setDamageRolls(workflow.damageRolls);
    } catch (err) { console.error(TITLE + ' | Hell\'s Assassin', err); }
}

// ---------------------------------------------------------------- any damage
const pending = new Map();
let timer = null;
function onUpdateActor(actor, changed, options) {
    if (!isActiveGM() || !foundry.utils.hasProperty(changed, 'system.attributes.hp')) return;
    const before = options?.dnd5e?.hp;
    if (!before) return;
    const now = actor.system.attributes.hp;
    const lost = (before.value + (before.temp || 0)) - (now.value + (now.temp || 0));
    if (!(lost > 0) || options.isRest) return;
    if (consumeInFlight(actor)) return;
    pending.set(actor.uuid, {actor, lost: (pending.get(actor.uuid)?.lost ?? 0) + lost});
    clearTimeout(timer);
    timer = setTimeout(flush, EVENT_WINDOW);
}

async function flush() {
    const batch = Array.from(pending.values());
    pending.clear();
    const rows = [], bonusSeals = [];
    for (const {actor} of batch) {
        const token = tokenOf(actor);
        if (!token) continue;
        // Soul's Doom: every kind of damage.
        const sd = soulsDoomBonus(actor);
        if (sd > 0) {
            markInFlight(actor);
            await cpr().workflowUtils.applyDamage([token], sd, 'none');
            await ChatMessage.create({content: '<b>Soul\'s Doom:</b> ' + esc(token.document.name) + ' takes ' + sd + ' extra damage.'});
        }
        // A weapon hit by an Illrigger: his place-a-seal joins this dialog (one dialog per hit).
        const hit = hits.get(actor.uuid);
        hits.delete(actor.uuid);
        const live = hitFresh(hit) ? hit : null;
        if (live && trueNameSeals(live.attacker, live)) bonusSeals.push({owner: live.attacker, token, n: trueNameSeals(live.attacker, live), d20: live.d20, itemName: live.itemName});
        let attackerRow = false;
        for (const {owner, effects} of sealsOn(actor).values()) {
            if (!cfgOf(owner) || !inReach(owner, token)) continue;
            const row = {owner, token, have: effects.length, boons: boonsFor(owner, token)};
            if (live && sameActor(owner, live.attacker)) {
                attackerRow = true;
                row.hit = live;
                if (canPlace(owner, token)) row.place = 'also';
                if (live.deathstrike) { row.deathstrikeMin = true; row.deathstrikeDone = true; }
            }
            rows.push(row);
        }
        if (live && !attackerRow && canPlace(live.attacker, token))
            rows.push({owner: live.attacker, token, have: 0, place: 'only', boons: [], hit: live, note: 'hit with ' + live.itemName});
    }
    if (!rows.length) return placeBonusSeals(bonusSeals);
    // Brawler feats on the same hit (push / grapple) join this window instead of their own.
    const extras = [];
    for (const {actor} of batch) { const x = takeBrawl(actor.uuid, 'brawl' + extras.length); if (x) extras.push(x); }
    const names = Array.from(new Set(rows.map(r => r.token.document.name)));
    const tnNote = bonusSeals.map(b => '<br><i>' + esc(b.itemName) + ': natural ' + b.d20 + ', ' + b.n + ' free seal' + (b.n > 1 ? 's' : '') + ' on ' + esc(b.token.document.name) + ' (placed after this).</i>').join('');
    const picks = await decide(TITLE + ': Baleful Interdict', esc(names.join(', ')) + (names.length > 1 ? ' take' : ' takes') + ' damage.' + tnNote, rows, extras);
    if (picks) for (const x of extras) await x.apply().catch(err => console.error(TITLE + ' | brawl', err));
    // Skipped with Deathstrike used: it still burns one seal (doubled dice).
    const burns = picks ?? rows.filter(r => r.deathstrikeDone && r.have)
        .map(r => ({owner: r.owner, token: r.token, n: 1, type: lastType.get(r.owner.uuid) ?? 'necrotic', deathstrike: true, boons: {}}));
    for (const p of burns) if (p.n > 0) await executeRow(p).catch(err => console.error(TITLE + ' | burn', err));
    for (const p of picks ?? []) {
        if (!p.place || !p.hit || !canPlace(p.owner, p.token)) continue;   // once per turn, even with several targets ticked
        await placeSeal(p.owner, p.token, 1).catch(err => console.error(TITLE + ' | place seal', err));
    }
    await placeBonusSeals(bonusSeals);
}
async function placeBonusSeals(list) {
    for (const b of list) {
        const n = await placeSeal(b.owner, b.token, b.n, {bonus: true}).catch(err => { console.error(TITLE + ' | True Name seals', err); return 0; });
        if (n) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: b.owner}),
            content: '<b>' + esc(b.itemName) + ':</b> natural ' + b.d20 + ', ' + n + ' free seal' + (n > 1 ? 's' : '') + ' on ' + esc(b.token.document.name) + '.'});
    }
}

// ---------------------------------------------------------------- seal hygiene
async function onCreateEffect(effect, options, userId) {
    if (!isActiveGM() || !isSeal(effect)) return;
    const owner = sealOwner(effect);
    if (!owner || !cfgOf(owner)) return;
    if (turnKey() && userId && !effect.flags?.[MODULE_ID]?.seal?.bonus) placedTurn.set(owner.uuid, turnKey());
    // Every seal looks the same however it was placed (hit, Bonus Action, Legendary, Move Seals):
    // name "Baleful Interdict: <owner>", origin = his Baleful Interdict item, Temporary 10 rounds.
    const item = biItem(owner);
    const upd = {};
    if (effect.flags?.['chris-premades']?.macros) upd['flags.chris-premades.-=macros'] = null;
    if (!effect.flags?.[MODULE_ID]?.seal) upd['flags.' + MODULE_ID + '.seal'] = {owner: owner.uuid};
    if (ident(effect) !== SEAL_ID) upd['flags.chris-premades.info.identifier'] = SEAL_ID;
    if (effect.flags?.cat?.identifier !== SEAL_ID && globalThis.cat?.utils) upd['flags.cat.identifier'] = SEAL_ID;
    if (effect.flags?.cat?.macros || effect.flags?.cat?.embeddedMacros) { upd['flags.cat.-=macros'] = null; upd['flags.cat.-=embeddedMacros'] = null; }
    const want = 'Baleful Interdict: ' + owner.name;
    if (effect.name !== want) upd.name = want;
    if (item && effect.origin !== item.uuid) upd.origin = item.uuid;
    if (effect.transfer) upd.transfer = false;
    if (!isTemporary(effect)) upd.duration = fx({duration: sealDuration()}).duration;
    if (Object.keys(upd).length) await effect.update(upd);
}
// Has a duration (Temporary on the Effects tab): v13 rounds/seconds/turns, v14 {value, units}.
function isTemporary(effect) {
    const d = effect.duration ?? {};
    if (d.units) return !!d.value && !['inst', 'perm', 'spec', ''].includes(d.units);
    return !!(d.rounds || d.seconds || d.turns);
}

// ---------------------------------------------------------------- public helpers
// Burn every seal an Illrigger has on creatures within his range (Dracula's mythic Detonation).
export async function burnAll(owner, {type = 'necrotic', radius} = {}) {
    const me = tokenOf(owner);
    if (!me) return 0;
    let total = 0;
    for (const t of canvas.tokens.placeables) {
        if (!t.actor || t.id === me.id) continue;
        const have = sealsOf(t.actor, owner).length;
        if (!have || distance(me, t) > (radius ?? rangeOf(owner))) continue;
        total += await executeRow({owner, token: t, n: have, type, boons: {}});
    }
    return total;
}

// The burn dialog for chosen targets, as if they had just taken damage (Baleful Interdict's
// own "Burn Seals" activities on v14 open this instead of rolling their fixed damage).
export async function promptBurn(owner, tokens, {title} = {}) {
    const rows = [];
    for (const t of tokens ?? []) {
        if (!t?.actor) continue;
        const have = sealsOf(t.actor, owner).length;
        if (have && inReach(owner, t)) rows.push({owner, token: t, have, boons: boonsFor(owner, t)});
    }
    if (!rows.length) { ui.notifications.info((title ?? 'Baleful Interdict') + ': none of your seals within range on the target.'); return 0; }
    const picks = await decide(title ?? (TITLE + ': Burn seals'), esc(owner.name) + ' burns seals.', rows);
    let total = 0;
    for (const p of picks ?? []) if (p.n > 0) total += await executeRow(p).catch(err => { console.error(TITLE + ' | burn', err); return 0; });
    return total;
}

// Baleful Interdict: Move Seals. Every seal this Illrigger has on one dead or unconscious
// creature moves to the target (the creature chosen from those carrying his seals).
export async function moveSeals(owner, targetToken, {pick} = {}) {
    if (!targetToken?.actor) return 0;
    const from = canvas.tokens.placeables.filter(t => t.actor && t.id !== targetToken.id
        && (t.actor.statuses.has('dead') || t.actor.statuses.has('unconscious') || (t.actor.system.attributes?.hp?.value ?? 1) <= 0)
        && sealsOf(t.actor, owner).length > 0);
    if (!from.length) { ui.notifications.info('Move Seals: none of your seals are on a dead or unconscious creature.'); return 0; }
    const src = from.length === 1 ? from[0] : (pick ? await pick(from) : from[0]);
    if (!src) return 0;
    if (distance(src, targetToken) > 30) { ui.notifications.info('Move Seals: the new target must be within 30 ft of ' + src.document.name + '.'); return 0; }
    const mine = sealsOf(src.actor, owner);
    const datas = mine.map(e => { const d = e.toObject(); delete d._id; return d; });
    await src.actor.deleteEmbeddedDocuments('ActiveEffect', mine.map(e => e.id));
    await targetToken.actor.createEmbeddedDocuments('ActiveEffect', datas);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: owner}),
        content: '<b>Move Seals:</b> ' + datas.length + ' seal' + (datas.length > 1 ? 's' : '') + ' move from ' + esc(src.document.name) + ' to ' + esc(targetToken.document.name) + '.'});
    return datas.length;
}

export function registerIllrigger() {
    Hooks.on(HOOKS.attackRollComplete, onAttackComplete);
    Hooks.on(HOOKS.damageRollComplete, onDamageRolled);
    Hooks.on(HOOKS.rollFinished, onRollFinished);
    Hooks.on('updateActor', onUpdateActor);
    Hooks.on('createActiveEffect', onCreateEffect);
    Hooks.on('dnd5e.preRollDamageV2', onPreRollDamage);
    return {cfgOf, sealsOn, sealsOf, sealDice, placeSeal, executeRow, burnAll, canPlace, burnFormula, isSeal, promptBurn, moveSeals, trueNameSeals};
}
