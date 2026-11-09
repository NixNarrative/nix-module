// =====================================================================
//  NIX FIX: Illrigger engine (Court of Ravenloft, Foundry v13 / Chris's Premades 1)
//
//  Replaces Chris's Premades' Baleful Interdict prompt flow for every actor the
//  "Illrigger engine" world installer has prepared (flags.nix-module.illrigger).
//  Rule of thumb: at most ONE GM dialog per event.
//
//   Weapon hit by a prepared Illrigger (decided at the hit, before damage):
//     - target has none of his seals: "Place a seal?" (no burn on that attack)
//     - target has his seals: burn row, "Also place another seal" (off), Deathstrike
//     - other Illriggers' seals on the same target appear as rows in the same dialog
//   Any other damage to a sealed creature (anyone's attack, spells, minions, AoE):
//     - one dialog per damage event, one row per (target, Illrigger in range)
//   Rows hold: seals to burn, fire/necrotic, and that Illrigger's boons
//   (Bedevil, Styx's Apathy, Unleash Hell, Exsanguinate). One click applies all.
//   Silent: Superior Interdict (ignores resistance), Axiomatic Seals, Hell's
//   Assassin rerolls, True Name +1d6, Soul's Doom on every kind of damage.
//
//  Seals stay Chris's Premades-shaped ActiveEffects (identifier
//  balefulInterdictEffect, origin = the Baleful Interdict item) so its boons
//  (Dispater's Supremacy, Move Seals...) still recognise them; their CPR macro
//  is stripped so CPR never asks to burn.
//  Runs on the active GM's client. API: game.modules.get('nix-module').api.illrigger
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';

export const FLAG = 'illrigger';
export const SEAL_ID = 'balefulInterdictEffect';
const BURN_TYPES = ['necrotic', 'fire'];
const DOWN = ['incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified', 'dead'];
const EVENT_WINDOW = 350;                    // ms: damage landing this close together is one event
const IN_FLIGHT_MS = 6000;

const cpr = () => globalThis.chrisPremades?.utils;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const ident = doc => doc?.flags?.['chris-premades']?.info?.identifier;
export const cfgOf = actor => actor?.flags?.[MODULE_ID]?.[FLAG] ?? null;
export const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- lookups
// The actor that owns a seal: the flag Nix Fix writes, else the effect's origin item.
function originItem(effect) {
    try { const o = effect.origin ? fromUuidSync(effect.origin, {strict: false}) : null; return o?.documentName === 'Item' ? o : null; }
    catch { return null; }
}
export function sealOwner(effect) {
    const u = effect.flags?.[MODULE_ID]?.seal?.owner;
    if (u) { try { const a = fromUuidSync(u, {strict: false}); if (a) return a; } catch { /* fall through */ } }
    return originItem(effect)?.actor ?? null;
}
const isBI = item => !!item && (ident(item) === 'balefulInterdict' || /^baleful interdict\b/i.test(item.name) && !/:\s*(burn|move)/i.test(item.name));
export function isSeal(effect) {
    if (!effect || effect.documentName !== 'ActiveEffect') return false;
    if (effect.flags?.[MODULE_ID]?.seal) return true;
    if (ident(effect) === SEAL_ID) return true;
    const o = originItem(effect);
    return !!o && isBI(o) && /baleful interdict|seal/i.test(effect.name);
}
export const biItem = actor => actor?.items.filter(isBI)
    .sort((a, b) => (ident(b) === 'balefulInterdict') - (ident(a) === 'balefulInterdict') || (Number(b.system.uses?.max) || 0) - (Number(a.system.uses?.max) || 0))[0] ?? null;
const byIdOrName = (actor, id, re) => (id && actor.items.get(id)) || actor.items.find(i => re.test(i.name));

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
const canUse = item => !!item && (cpr()?.itemUtils?.canUse?.(item) ?? true);

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
        const owner = originItem(e)?.actor;
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

async function withSuperiorInterdict(owner, fn) {
    if (!cfgOf(owner)?.superiorInterdict) return fn();
    const [tmp] = await owner.createEmbeddedDocuments('ActiveEffect', [{
        name: 'Superior Interdict (burning)', img: 'icons/magic/fire/flame-burning-skull-orange.webp', transfer: false,
        duration: {seconds: 6}, changes: BURN_TYPES.map(v => ({key: 'system.traits.idr.value', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: v, priority: 20})),
        flags: {[MODULE_ID]: {transient: true}}
    }]);
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
    data.duration = {};
    return data;
}

export async function placeSeal(owner, targetToken, count = 1, {free = false} = {}) {
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
    await targetToken.actor.createEmbeddedDocuments('ActiveEffect', Array.from({length: n}, () => foundry.utils.deepClone(data)));
    if (turnKey()) placedTurn.set(owner.uuid, turnKey());
    return n;
}

// ---------------------------------------------------------------- burning
// row: {owner, token, n, type, deathstrike, boons: {bedevil, styx, unleash, exsanguinate: allyTokenId}}
export async function executeRow(row) {
    const {owner, token} = row;
    const c = cfgOf(owner) ?? {};
    const mine = sealsOn(token.actor).get(owner.uuid)?.effects ?? [];
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
export function boonsFor(owner, targetToken) {
    const c = cfgOf(owner) ?? {};
    const out = [];
    const r = usedReaction(owner);
    const b = boonItem(owner, 'interdictBoonBedevil', /bedevil/i);
    if (b && canUse(b)) out.push({key: 'bedevil', label: 'Bedevil', hint: 'next save −' + (owner.system.attributes.prof ?? '')});
    const s = boonItem(owner, 'interdictBoonStyxsApathy', /styx'?s apathy/i);
    if (s && canUse(s) && !r) out.push({key: 'styx', label: 'Styx\'s Apathy', hint: 'reaction: no reactions'});
    const u = boonItem(owner, 'interdictBoonUnleashHell', /unleash hell/i);
    if (u && canUse(u) && !r) out.push({key: 'unleash', label: 'Unleash Hell', hint: 'reaction: its allies within 5 ft'});
    if (c.exsanguinate && living(targetToken.actor)) {
        const me = tokenOf(owner);
        const allies = me ? canvas.tokens.placeables.filter(t => t.actor && t.document.disposition === me.document.disposition
            && !isDown(t.actor) && distance(me, t) <= 30) : [];
        if (allies.length) out.push({key: 'exsanguinate', label: 'Exsanguinate', hint: 'temp HP to', allies});
    }
    return out;
}

async function runBoons(row, dealt, type) {
    const {owner, token, boons = {}} = row;
    const u = cpr();
    if (boons.bedevil) {
        const it = boonItem(owner, 'interdictBoonBedevil', /bedevil/i);
        if (it) await u.workflowUtils.syntheticItemRoll(it, [token], {consumeUsage: true, consumeResources: true});
    }
    if (boons.styx) {
        const it = boonItem(owner, 'interdictBoonStyxsApathy', /styx'?s apathy/i);
        if (it) { await u.workflowUtils.syntheticItemRoll(it, [token], {consumeUsage: true, consumeResources: true}); await setReaction(owner); }
    }
    if (boons.unleash && dealt > 0) {
        const it = boonItem(owner, 'interdictBoonUnleashHell', /unleash hell/i);
        const act = it?.system.activities.find(a => a.type === 'save') ?? it?.system.activities.contents[0];
        const near = u.tokenUtils.findNearby(token, 5, 'ally', {includeIncapacitated: true}).filter(t => t.actor?.uuid !== owner.uuid);
        if (act && near.length) {
            const data = foundry.utils.deepClone(act.toObject());
            if (data.damage?.parts?.[0]) { data.damage.parts[0].bonus = String(dealt); data.damage.parts[0].types = [type]; data.damage.parts[0].number = null; }
            near.forEach(t => markInFlight(t.actor));
            await u.workflowUtils.syntheticActivityDataRoll(data, it, owner, near, {consumeUsage: true, consumeResources: true});
        }
        await setReaction(owner);
    }
    if (boons.exsanguinate && dealt > 0) {
        const ally = canvas.tokens.get(boons.exsanguinate);
        if (ally?.actor) {
            const cur = ally.actor.system.attributes.hp.temp ?? 0;
            if (dealt > cur) await ally.actor.update({'system.attributes.hp.temp': dealt});
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: owner}),
                content: '<b>Exsanguinate:</b> ' + esc(ally.document.name) + ' gains ' + dealt + ' temporary hit points' + (dealt > cur ? '' : ' (already had ' + cur + ')') + '.'});
        }
    }
}

// ---------------------------------------------------------------- the dialog
// rows: [{owner, token, have, place: 'only'|'also'|null, deathstrike: bool, boons: [...]}]
const lastType = new Map();
async function decide(title, intro, rows) {
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
        } else cells.push('<td><i>no seals yet</i></td>');
        const extra = [];
        if (r.place === 'only') extra.push('<label><input type="checkbox" name="' + pre + 'place" checked> Place a seal</label>');
        if (r.place === 'also') extra.push('<label><input type="checkbox" name="' + pre + 'place"> Also place another seal</label>');
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
        + '<table><tbody>' + body + '</tbody></table></div>';
    const read = (form) => rows.map((r, i) => {
        const g = n => form.elements['r' + i + '.' + n];
        const out = {owner: r.owner, token: r.token, have: r.have,
            n: Number(g('n')?.value ?? 0), type: g('type')?.value ?? 'necrotic',
            place: !!g('place')?.checked, deathstrike: !!g('deathstrike')?.checked,
            boons: {bedevil: !!g('bedevil')?.checked, styx: !!g('styx')?.checked, unleash: !!g('unleash')?.checked, exsanguinate: g('exsanguinate')?.value || null}};
        if (out.deathstrike && out.n < 1) out.n = Math.min(1, r.have);
        if (r.have) lastType.set(r.owner.uuid, out.type);
        return out;
    });
    const DialogV2 = foundry.applications.api.DialogV2;
    const result = await DialogV2.wait({
        window: {title}, position: {width: 520}, rejectClose: false, content,
        buttons: [
            {action: 'apply', label: 'Apply', icon: 'fa-solid fa-fire', default: true, callback: (ev, button) => read(button.form)},
            {action: 'skip', label: 'Skip', icon: 'fa-solid fa-xmark', callback: () => null}
        ]
    });
    return Array.isArray(result) ? result : null;
}

// ---------------------------------------------------------------- weapon hits by an Illrigger
const predecided = new Map();   // targetActorUuid -> {rows, expires}
async function onAttackComplete(workflow) {
    try {
        if (!isActiveGM() || !workflow?.hitTargets?.size) return;
        const attacker = workflow.actor;
        const isWeapon = workflow.item?.type === 'weapon' || cpr()?.workflowUtils?.isAttackType?.(workflow, 'weaponAttack');
        if (!isWeapon || workflow.workflowOptions?.nixNoSeal) return;
        const mineCfg = cfgOf(attacker);
        const rows = [];
        const melee = cpr()?.workflowUtils?.isAttackType?.(workflow, 'meleeWeaponAttack');
        for (const t of workflow.hitTargets) {
            if (!t?.actor || t.actor.uuid === attacker.uuid) continue;
            const seals = sealsOn(t.actor);
            if (mineCfg) {
                const have = seals.get(attacker.uuid)?.effects.length ?? 0;
                const placeOk = canPlace(attacker, t);
                const ds = have && melee && !workflow.isCritical && !usedReaction(attacker) && (() => {
                    const d = byIdOrName(attacker, mineCfg.deathstrike, /^deathstrike/i);
                    return d && (d.system.uses?.max ? d.system.uses.value > 0 : true);
                })();
                if (have && inReach(attacker, t)) rows.push({owner: attacker, token: t, have, place: placeOk ? 'also' : null, deathstrike: !!ds, boons: boonsFor(attacker, t)});
                else if (!have && placeOk) rows.push({owner: attacker, token: t, have: 0, place: 'only', boons: []});
            }
            for (const {owner, effects} of seals.values()) {
                if (owner.uuid === attacker.uuid || !inReach(owner, t)) continue;
                rows.push({owner, token: t, have: effects.length, boons: boonsFor(owner, t)});
            }
        }
        if (!rows.length) return;
        const picks = await decide(TITLE + ': Baleful Interdict', esc(attacker.name) + ' hits with ' + esc(workflow.item.name) + '. Burns happen when the damage lands.', rows);
        if (!picks) return;
        let crit = false;
        for (const p of picks) {
            if (p.place && canPlace(p.owner, p.token)) {    // once per turn, even with several targets ticked
                // True Name (rare): an extra seal on a natural 18-20 with that weapon.
                const tn = cfgOf(p.owner)?.trueNameItem && workflow.item?.id === cfgOf(p.owner).trueNameItem && (workflow.d20AttackRoll ?? 0) >= 18;
                await placeSeal(p.owner, p.token, tn ? 2 : 1);
            }
            if (p.deathstrike && p.n > 0) {
                const d = byIdOrName(p.owner, cfgOf(p.owner)?.deathstrike, /^deathstrike/i);
                if (d?.system.uses?.max) await d.update({'system.uses.spent': (d.system.uses.spent ?? 0) + 1});
                await setReaction(p.owner);
                crit = true;
            }
        }
        if (crit) {
            await workflow.setAttackRoll(cpr().rollUtils.makeCritical(workflow.attackRoll));
            workflow.isCritical = true;
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: attacker}), content: '<b>Deathstrike:</b> the hit becomes a critical hit.'});
        }
        for (const t of workflow.hitTargets) {
            const mine = picks.filter(p => p.token === t && p.n > 0);
            if (mine.length) predecided.set(t.actor.uuid, {rows: mine, expires: Date.now() + 30000, workflowId: workflow.id});
        }
    } catch (err) { console.error(TITLE + ' | Illrigger hit', err); }
}
async function onRollFinished(workflow) {
    // A pre-decided burn whose target took no damage burns nothing.
    for (const [k, v] of predecided) if (v.workflowId === workflow?.id) setTimeout(() => { if (predecided.get(k) === v) predecided.delete(k); }, EVENT_WINDOW * 3);
}

// Hell's Assassin: reroll 1s and 2s (once) on his weapon damage against a creature he has sealed.
async function onDamageRolled(workflow) {
    try {
        const c = cfgOf(workflow?.actor);
        if (!c?.hellsAssassin || workflow.item?.type !== 'weapon' || !workflow.damageRolls?.length) return;
        const t = workflow.hitTargets?.first?.();
        if (!t?.actor || !sealsOn(t.actor).has(workflow.actor.uuid)) return;
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
    const rows = [], decided = [];
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
        const pre = predecided.get(actor.uuid);
        if (pre && pre.expires > Date.now()) { predecided.delete(actor.uuid); decided.push(...pre.rows); continue; }
        predecided.delete(actor.uuid);
        for (const {owner, effects} of sealsOn(actor).values()) {
            if (!cfgOf(owner) || !inReach(owner, token)) continue;
            rows.push({owner, token, have: effects.length, boons: boonsFor(owner, token)});
        }
    }
    for (const r of decided) await executeRow(r).catch(err => console.error(TITLE + ' | burn', err));
    if (!rows.length) return;
    const names = Array.from(new Set(rows.map(r => r.token.document.name)));
    const picks = await decide(TITLE + ': Burn seals?', esc(names.join(', ')) + (names.length > 1 ? ' take' : ' takes') + ' damage.', rows);
    for (const p of picks ?? []) if (p.n > 0) await executeRow(p).catch(err => console.error(TITLE + ' | burn', err));
}

// ---------------------------------------------------------------- seal hygiene
async function onCreateEffect(effect, options, userId) {
    if (!isActiveGM() || !isSeal(effect)) return;
    const owner = sealOwner(effect);
    if (!owner || !cfgOf(owner)) return;
    if (turnKey() && userId) placedTurn.set(owner.uuid, turnKey());
    const upd = {};
    if (effect.flags?.['chris-premades']?.macros) upd['flags.chris-premades.-=macros'] = null;
    if (!effect.flags?.[MODULE_ID]?.seal) upd['flags.' + MODULE_ID + '.seal'] = {owner: owner.uuid};
    if (ident(effect) !== SEAL_ID) upd['flags.chris-premades.info.identifier'] = SEAL_ID;
    if (Object.keys(upd).length) await effect.update(upd);
}

// ---------------------------------------------------------------- public helpers
// Burn every seal an Illrigger has on creatures within his range (Dracula's mythic Detonation).
export async function burnAll(owner, {type = 'necrotic', radius} = {}) {
    const me = tokenOf(owner);
    if (!me) return 0;
    let total = 0;
    for (const t of canvas.tokens.placeables) {
        if (!t.actor || t.id === me.id) continue;
        const have = sealsOn(t.actor).get(owner.uuid)?.effects.length ?? 0;
        if (!have || distance(me, t) > (radius ?? rangeOf(owner))) continue;
        total += await executeRow({owner, token: t, n: have, type, boons: {}});
    }
    return total;
}

export function registerIllrigger() {
    Hooks.on('midi-qol.premades.postAttackRollComplete', onAttackComplete);
    Hooks.on('midi-qol.premades.preDamageRollComplete', onDamageRolled);
    Hooks.on('midi-qol.premades.postRollFinished', onRollFinished);
    Hooks.on('updateActor', onUpdateActor);
    Hooks.on('createActiveEffect', onCreateEffect);
    return {cfgOf, sealsOn, sealDice, placeSeal, executeRow, burnAll, canPlace, burnFormula, isSeal};
}
