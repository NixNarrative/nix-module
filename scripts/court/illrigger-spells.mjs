// =====================================================================
//  NIX FIX: Court of Ravenloft, Illrigger spells and odds and ends (1.7.1; v13 first, v14 shares it)
//
//   Vengeful Blade (Dayus, Valintina, Zadimus): like Booming Blade. The spell's one activity
//       (court kind 'vengefulBlade', set by the fixes) asks for the weapon, makes the attack;
//       on a hit +Xd8 necrotic (5th level: 1d8, 11th: 2d8, 17th: 3d8) and a "Vengeful Blade"
//       condition until the start of the caster's next turn. RAW (Nix 2026-11-12): if the creature
//       makes an attack or casts a spell before then, it takes (X+1)d8 necrotic and it ends.
//   Hell's Lash (Valintina, Zadimus): the Cast activity (kind 'hellsLash') keeps its save and
//       4d4 fire; a failed save tethers the target (JB2A Witch Bolt tether, red). Start of the
//       target's turn: the GM is asked to deal the 2d4 fire (+1d4 per slot level above 1st).
//       End of its turn: Con save to end it; if it carries the caster's seals and he has his
//       reaction, one question first: burn a seal for disadvantage on that save.
//       Concentration ends the tethers; the lash ending by save ends concentration.
//   Hellish Frenzy (Sydmore): whatever made the effect, it ends at the start of his next turn.
//   Shadow Fan (Valintina): Tessenjutsu at the start of her turn (+1 AC, or +1d4 necrotic on her
//       Shadow Fan hits, until the start of her next turn), flagged by her fixes.
//  Questions go to the active GM; anything a player's client sees goes through the court socket.
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {cfgOf, executeRow, isActiveGM, originActor, sameActor, sealsOf, tokenOf} from './illrigger.mjs';
import {cpr, fxAll, MODES, HOOKS} from './engine.mjs';
import {addGmHandler, ask, gm, rollSave} from './lieutenants.mjs';

export const LASH_FILE = 'modules/jb2a_patreon/Library/1st_Level/Witch_Bolt/WitchBolt_01_Regular_Red_30ft_1600x400.webm';
const VB_IMG = 'icons/magic/unholy/strike-hand-glow-pink.webp';
const LASH_IMG = 'icons/magic/fire/flame-burning-chain.webp';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const kindOf = activity => activity?.flags?.[MODULE_ID]?.court ?? null;
const inCombat = () => !!game.combat?.started;
const turnKey = () => inCombat() ? game.combat.id + ':' + game.combat.round + ':' + game.combat.turn : null;
const isTurnOf = a => inCombat() && (sameActor(game.combat.combatant?.actor, a) || game.combat.combatant?.tokenId === tokenOf(a)?.id);
const say = (actor, content) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content});
const actorFrom = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const tokFrom = uuid => { try { const d = fromUuidSync(uuid); return d?.object ?? d; } catch { return null; } };
const tokUuid = t => t?.document?.uuid ?? t?.uuid;
const usedReaction = a => inCombat() && !!(cpr()?.actorUtils?.hasUsedReaction?.(a) ?? MidiQOL.hasUsedReaction?.(a));
const sceneTokens = () => canvas?.tokens?.placeables ?? [];

// Cantrip tier: total character level; an NPC's class levels, else its spellcasting level, else CR.
export function cantripLevel(a) {
    if (!a) return 1;
    if (a.type === 'character' && a.system?.details?.level) return Number(a.system.details.level);
    const cls = Object.values(a.classes ?? {}).reduce((n, c) => n + (Number(c.system?.levels) || 0), 0);
    return cls || Number(a.system?.details?.spellLevel) || Number(a.system?.attributes?.spell?.level) || Math.max(1, Math.floor(Number(a.system?.details?.cr) || 1));
}
// Vengeful Blade dice: [extra d8 on the hit, d8 when it triggers].
export function vbDice(level) {
    const hit = level >= 17 ? 3 : level >= 11 ? 2 : level >= 5 ? 1 : 0;
    return [hit, hit + 1];
}
// Hell's Lash: d4s at the start of the target's turn for a slot level.
export const lashDice = level => 2 + Math.max(0, (Number(level) || 1) - 1);

// A one-off damage roll by `owner` through Midi (card, resistances, concentration, seals).
async function dealDamage(owner, token, formula, type, name, img) {
    const id = 'nixSpellDamage00';
    const itemData = {name, img: img ?? VB_IMG, type: 'feat',
        system: {activities: {[id]: {_id: id, type: 'damage', name, activation: {type: 'special'}, range: {units: 'any'},
            target: {affects: {count: '1', type: 'creature'}}, damage: {parts: [{custom: {enabled: true, formula}, types: [type]}], critical: {allow: false}}}}},
        flags: {[MODULE_ID]: {spellTick: true}, autoanimations: {isEnabled: false, version: 5}}};
    return cpr().workflowUtils.syntheticItemDataRoll(itemData, owner, [token]);
}

// =====================================================================
//  VENGEFUL BLADE
// =====================================================================
const vbPending = new Map();   // casterUuid -> {weaponId, target, hit, trigger, spell, expires}
const meleeWeapons = a => {
    const all = a.items.filter(i => i.type === 'weapon' && (i.system.activities?.contents ?? Array.from(i.system.activities ?? [])).some(x => x.type === 'attack'
        && (x.attack?.type?.value ?? 'melee') === 'melee'));
    const eq = all.filter(i => i.system.equipped);
    return eq.length ? eq : all;
};
async function vengefulBlade(actor, spell, target) {
    if (!target?.actor) return ui.notifications.warn('Vengeful Blade: target one creature within 5 ft first.');
    const list = meleeWeapons(actor);
    if (!list.length) return ui.notifications.warn('Vengeful Blade: ' + actor.name + ' has no melee weapon.');
    const id = list.length === 1 ? list[0].id : await ask('Vengeful Blade', 'Which weapon?', list.map(i => [i.name, i.id]));
    const w = actor.items.get(id);
    if (!w) return;
    const [hit, trigger] = vbDice(cantripLevel(actor));
    vbPending.set(actor.uuid, {weaponId: w.id, target: tokUuid(target), hit, trigger, spell: spell?.uuid ?? null, img: spell?.img, expires: Date.now() + 120000});
    try { await cpr().workflowUtils.syntheticItemRoll(w, [target], {consumeUsage: false, consumeResources: false}); }
    finally { setTimeout(() => vbPending.delete(actor.uuid), 1500); }
}
const vbFor = wf => {
    const p = wf?.actor && vbPending.get(wf.actor.uuid);
    return p && p.expires > Date.now() && wf.item?.id === p.weaponId ? p : null;
};
async function vbDamage(wf) {
    const p = vbFor(wf);
    if (!p || !p.hit || !wf.hitTargets?.size || wf.nixVB) return;
    wf.nixVB = true;
    await cpr().workflowUtils.bonusDamage(wf, p.hit + 'd8', {damageType: 'necrotic'});
}
async function vbHit(wf) {
    const p = vbFor(wf);
    if (!p) return;
    vbPending.delete(wf.actor.uuid);
    const t = Array.from(wf.hitTargets ?? []).find(x => tokUuid(x) === p.target) ?? wf.hitTargets?.first?.();
    if (!t?.actor) return say(wf.actor, '<b>Vengeful Blade:</b> the attack misses.');
    for (const old of t.actor.effects.filter(e => e.flags?.[MODULE_ID]?.vengefulBlade)) await gm('deleteEffect', {actor: t.actor.uuid, id: old.id});
    await gm('effect', {actor: t.actor.uuid, data: {name: 'Vengeful Blade', img: p.img ?? VB_IMG, transfer: false, origin: p.spell ?? wf.actor.uuid,
        duration: {rounds: 1, seconds: 6}, description: 'If it makes an attack or casts a spell it takes ' + p.trigger + 'd8 necrotic damage and this ends. Ends at the start of ' + wf.actor.name + '\'s next turn.',
        flags: {dae: {specialDuration: ['turnStartSource']}, [MODULE_ID]: {vengefulBlade: {owner: wf.actor.uuid, dice: p.trigger, since: turnKey()}}}}});
    await say(wf.actor, '<b>Vengeful Blade:</b> ' + esc(t.document.name) + ' radiates a dark aura: an attack or a spell before ' + esc(wf.actor.name) + '\'s next turn costs it ' + p.trigger + 'd8 necrotic.');
}
// The creature carrying Vengeful Blade makes an attack or casts a spell (any turn): the GM does the rest.
const isSpellCast = wf => wf.item?.type === 'spell' && !wf.item?.flags?.[MODULE_ID]?.spellTick;
async function vbTrigger(wf) {
    if (!wf?.actor || wf.nixVBCounted || wf.item?.flags?.[MODULE_ID]?.spellTick || wf.item?.flags?.[MODULE_ID]?.burnRoll || wf.item?.flags?.[MODULE_ID]?.courtSave) return;
    if (!(wf.activity?.type === 'attack' || wf.activity?.attack) && !isSpellCast(wf)) return;
    const e = wf.actor.effects.find(x => x.flags?.[MODULE_ID]?.vengefulBlade && !x.disabled);
    if (!e) return;
    wf.nixVBCounted = true;
    await gm('vbAttack', {actor: wf.actor.uuid, id: e.id, what: isSpellCast(wf) ? 'casts ' + wf.item.name : 'attacks'});
}
async function vbAttackLocal({actor, id, what}) {
    const a = actorFrom(actor), e = a?.effects.get(id);
    const v = e?.flags?.[MODULE_ID]?.vengefulBlade;
    if (!v) return false;
    await e.delete().catch(() => {});
    const owner = actorFrom(v.owner), tok = tokenOf(a);
    if (owner && tok) await dealDamage(owner, tok, v.dice + 'd8', 'necrotic', 'Vengeful Blade', VB_IMG);
    await say(owner ?? a, '<b>Vengeful Blade:</b> ' + esc(a.name) + ' ' + esc(what ?? 'attacks') + ' and takes ' + v.dice + 'd8 necrotic; the aura ends.');
    return true;
}

// =====================================================================
//  HELL'S LASH
// =====================================================================
const lashName = (effectId) => 'nixHellsLash-' + effectId;
function lashAnim(ownerTok, targetTok, effectId) {
    try {
        if (!globalThis.Sequence || !ownerTok || !targetTok) return;
        new Sequence().effect().file(LASH_FILE).attachTo(ownerTok).stretchTo(targetTok, {attachTo: true}).persist().name(lashName(effectId)).play();
    } catch (err) { console.warn(TITLE + ' | Hell\'s Lash animation', err); }
}
function lashAnimEnd(effectId) { try { globalThis.Sequencer?.EffectManager?.endEffects({name: lashName(effectId)}); } catch { /* none */ } }

async function hellsLash(wf) {
    const owner = wf.actor;
    const failed = new Set(Array.from(wf.failedSaves ?? []).map(tokUuid));
    const level = Number(wf.castData?.castLevel ?? wf.item?.system?.level ?? 1) || 1;
    const dc = Number(wf.activity?.save?.dc?.value) || Number(owner.system.attributes?.spell?.dc) || 8 + (owner.system.attributes?.prof ?? 2) + (owner.system.abilities?.cha?.mod ?? 0);
    const me = tokenOf(owner);
    const tied = [];
    for (const t of wf.targets ?? []) {
        if (!t?.actor || !failed.has(tokUuid(t))) continue;
        for (const old of t.actor.effects.filter(e => e.flags?.[MODULE_ID]?.hellsLash?.owner === owner.uuid)) await gm('deleteEffect', {actor: t.actor.uuid, id: old.id});
        const id = await gm('effect', {actor: t.actor.uuid, data: {name: 'Hell\'s Lash: Tethered', img: wf.item.img ?? LASH_IMG, transfer: false, origin: wf.item.uuid,
            duration: {seconds: 60, rounds: 10}, description: 'Tethered to ' + owner.name + ': ' + lashDice(level) + 'd4 fire at the start of each of its turns; Con save (DC ' + dc + ') at the end of each of its turns ends it.',
            flags: {[MODULE_ID]: {hellsLash: {owner: owner.uuid, item: wf.item.uuid, level, dc, ownerToken: tokUuid(me), token: tokUuid(t)}}}}});
        if (id) { lashAnim(me, t, id); tied.push(t.document.name); }
    }
    if (tied.length) await say(owner, '<b>Hell\'s Lash:</b> ' + tied.map(esc).join(', ') + ' is tethered (' + lashDice(level) + 'd4 fire at the start of its turns, Con save DC ' + dc + ' at the end).');
    else if (wf.targets?.size) {
        // Nobody tethered: the spell has nothing left to hold.
        const conc = cpr()?.effectUtils?.getConcentrationEffect?.(owner, wf.item);
        if (conc) await conc.delete().catch(() => {});
    }
}
const lashesOn = a => a?.effects.filter(e => e.flags?.[MODULE_ID]?.hellsLash && !e.disabled) ?? [];
async function lashStart(actor) {
    for (const e of lashesOn(actor)) {
        const L = e.flags[MODULE_ID].hellsLash, owner = actorFrom(L.owner), tok = tokenOf(actor);
        if (!owner || !tok) continue;
        const n = lashDice(L.level);
        const pick = await ask('Hell\'s Lash (' + owner.name + ')', esc(tok.document.name) + ' starts its turn tethered. Deal ' + n + 'd4 fire?',
            [['Deal ' + n + 'd4 fire', 'deal'], ['Not this turn', 'no'], ['End the lash', 'end']]);
        if (pick === 'deal') await dealDamage(owner, tok, n + 'd4', 'fire', 'Hell\'s Lash', e.img ?? LASH_IMG);
        else if (pick === 'end') await endLash(e, 'ends');
    }
}
async function lashEnd(actor) {
    for (const e of lashesOn(actor)) {
        const L = e.flags[MODULE_ID].hellsLash, owner = actorFrom(L.owner), tok = tokenOf(actor);
        if (!owner || !tok) continue;
        let dis = false;
        const seals = sealsOf(actor, owner).length;
        if (seals && !usedReaction(owner) && cfgOf(owner)) {
            const pick = await ask('Hell\'s Lash (' + owner.name + ')', esc(tok.document.name) + ' saves to end the lash (Con, DC ' + L.dc + '). It carries ' + seals + ' of '
                + esc(owner.name) + '\'s seals: burn one (reaction) to give the save disadvantage?', [['Burn a seal (fire)', 'fire'], ['Burn a seal (necrotic)', 'necrotic'], ['Just roll the save', 'no']]);
            if (pick === 'fire' || pick === 'necrotic') {
                dis = true;
                await gm('reaction', {actor: owner.uuid});
                await executeRow({owner, token: tok, n: 1, type: pick, boons: {}});
            }
        }
        if (dis) await gm('effect', {actor: actor.uuid, data: {name: 'Hell\'s Lash: disadvantage', img: LASH_IMG, transfer: false, duration: {rounds: 1},
            changes: [{key: 'flags.midi-qol.disadvantage.ability.save.con', mode: MODES.OVERRIDE, value: '1', priority: 20}], flags: {dae: {specialDuration: ['isSave']}, [MODULE_ID]: {transient: true}}}});
        const failed = await rollSave(owner, [tok], 'con', L.dc, 'Hell\'s Lash: end the tether', e.img ?? LASH_IMG);
        if (!failed.has(tokUuid(tok))) await endLash(e, 'breaks free');
    }
}
async function endLash(e, how) {
    const L = e.flags?.[MODULE_ID]?.hellsLash;
    if (!L) return;
    const owner = actorFrom(L.owner);
    await e.delete().catch(() => {});
    // Single target: the spell ends with it.
    const item = actorFrom(L.item);
    const conc = owner && item ? cpr()?.effectUtils?.getConcentrationEffect?.(owner, item) : null;
    if (conc && !sceneTokens().some(t => lashesOn(t.actor).some(x => x.flags[MODULE_ID].hellsLash.owner === L.owner))) await conc.delete().catch(() => {});
    if (owner) await say(owner, '<b>Hell\'s Lash:</b> ' + esc(e.parent?.name ?? 'the creature') + ' ' + how + '.');
}
// Concentration on Hell's Lash ends: every tether of that caster from that spell goes.
async function onDeleteEffect(effect) {
    if (!isActiveGM()) return;
    if (effect.flags?.[MODULE_ID]?.hellsLash) return lashAnimEnd(effect.id);
    const a = effect.parent;
    if (!(a instanceof Actor) || !(effect.statuses?.has?.('concentrating') || /concentrat/i.test(effect.name ?? ''))) return;
    for (const t of sceneTokens()) for (const e of lashesOn(t.actor)) {
        const L = e.flags[MODULE_ID].hellsLash;
        if (!sameActor(actorFrom(L.owner), a)) continue;
        const item = actorFrom(L.item);
        const src = String(effect.origin ?? '') + ' ' + String(effect.flags?.dnd5e?.itemData?.name ?? '') + ' ' + String(effect.name ?? '') + ' ' + String(effect.description ?? '');
        if (item && !src.includes(item.uuid) && !src.includes(item.id) && !/hell'?s lash/i.test(src)) continue;
        await e.delete().catch(() => {});
    }
}

// =====================================================================
//  HELLISH FRENZY: ends at the start of its owner's next turn
// =====================================================================
const isFrenzy = e => /hellish frenzy/i.test(e?.name ?? '');
async function onCreateEffect(effect) {
    if (!isActiveGM() || !isFrenzy(effect) || effect.flags?.[MODULE_ID]?.frenzy) return;
    const owner = originActor(effect) ?? (effect.parent instanceof Actor ? effect.parent : null);
    if (!owner || !cfgOf(owner)) return;
    const upd = {['flags.' + MODULE_ID + '.frenzy']: {owner: owner.uuid, since: turnKey()}};
    const sd = new Set(effect.flags?.dae?.specialDuration ?? []);
    sd.add(sameActor(effect.parent, owner) ? 'turnStart' : 'turnStartSource');
    upd['flags.dae.specialDuration'] = Array.from(sd);
    await effect.update(upd).catch(err => console.error(TITLE + ' | Hellish Frenzy', err));
}
async function frenzyEnd(actor) {
    for (const t of sceneTokens()) for (const e of (t.actor?.effects ?? []).filter(isFrenzy)) {
        const f = e.flags?.[MODULE_ID]?.frenzy;
        const owner = f ? actorFrom(f.owner) : (originActor(e) ?? e.parent);
        if (!sameActor(owner, actor) || (f?.since && f.since === turnKey())) continue;
        await e.delete().catch(() => {});
    }
    // His own copy may sit on an actor without a token (a sidebar actor): check him too.
    for (const e of (actor.effects ?? []).filter(isFrenzy)) if (!(e.flags?.[MODULE_ID]?.frenzy?.since === turnKey())) await e.delete().catch(() => {});
}

// =====================================================================
//  SHADOW FAN: Tessenjutsu at the start of her turn
// =====================================================================
const fanOf = a => a?.items.find(i => i.flags?.[MODULE_ID]?.shadowFan && i.system.equipped && i.system.attuned !== false) ?? null;
async function tessenStart(actor) {
    for (const e of actor.effects.filter(x => x.flags?.[MODULE_ID]?.tessen)) await e.delete().catch(() => {});
    const fan = fanOf(actor);
    if (!fan) return;
    const pick = await ask('Tessenjutsu (' + actor.name + ')', esc(fan.name) + ': until the start of her next turn?',
        [['+1 AC', 'ac'], ['+1d4 necrotic on ' + fan.name + ' hits', 'dmg'], ['Neither', 'no']]);
    if (pick !== 'ac' && pick !== 'dmg') return;
    await actor.createEmbeddedDocuments('ActiveEffect', fxAll([{name: 'Tessenjutsu: ' + (pick === 'ac' ? '+1 AC' : '+1d4 necrotic'), img: fan.img, transfer: false, origin: fan.uuid,
        duration: {rounds: 1}, changes: pick === 'ac' ? [{key: 'system.attributes.ac.bonus', mode: MODES.ADD, value: '+1', priority: 20}] : [],
        flags: {dae: {specialDuration: ['turnStart']}, [MODULE_ID]: {tessen: pick}}}]));
    await say(actor, '<b>Tessenjutsu:</b> ' + (pick === 'ac' ? '+1 AC' : '+1d4 necrotic on her ' + esc(fan.name) + ' hits') + ' until the start of her next turn.');
}
async function tessenDamage(wf) {
    if (!wf?.actor || !wf.hitTargets?.size || wf.nixTessen || !wf.item?.flags?.[MODULE_ID]?.shadowFan) return;
    if (!wf.actor.effects.some(e => e.flags?.[MODULE_ID]?.tessen === 'dmg')) return;
    wf.nixTessen = true;
    await cpr().workflowUtils.bonusDamage(wf, '1d4', {damageType: 'necrotic'});
}

// =====================================================================
//  hooks
// =====================================================================
async function onRollFinished(wf) {
    try {
        await vbHit(wf);
        const kind = kindOf(wf?.activity), a = wf?.actor;
        if (!kind || !a || !game.user.isGM) return;
        if (kind === 'vengefulBlade') {
            const t = wf.targets?.first?.() ?? game.user.targets.first();
            setTimeout(() => vengefulBlade(a, wf.item, t).catch(err => console.error(TITLE + ' | Vengeful Blade', err)), 300);
        } else if (kind === 'hellsLash') await hellsLash(wf);
    } catch (err) { console.error(TITLE + ' | Illrigger spells', err); }
}
async function onDamageRolled(wf) {
    try { await vbDamage(wf); await tessenDamage(wf); } catch (err) { console.error(TITLE + ' | Illrigger spells damage', err); }
}
async function onPreamble(wf) { try { await vbTrigger(wf); } catch (err) { console.error(TITLE + ' | Vengeful Blade trigger', err); } }
async function onUpdateCombat(combat, changed) {
    if (!isActiveGM() || !combat.started || !('turn' in changed || 'round' in changed)) return;
    try {
        const prev = combat.combatants.get(combat.previous?.combatantId)?.actor;
        if (prev) await lashEnd(prev);
        const cur = combat.combatant?.actor;
        if (!cur) return;
        await frenzyEnd(cur);
        // Vengeful Blade ends at the start of its caster's next turn (backs up DAE's turnStartSource).
        for (const t of sceneTokens()) for (const e of (t.actor?.effects ?? []).filter(x => x.flags?.[MODULE_ID]?.vengefulBlade)) {
            const v = e.flags[MODULE_ID].vengefulBlade;
            if (sameActor(actorFrom(v.owner), cur) && v.since !== turnKey()) await e.delete().catch(() => {});
        }
        await lashStart(cur);
        await tessenStart(cur);
    } catch (err) { console.error(TITLE + ' | Illrigger spells turn', err); }
}

export function registerIllriggerSpells() {
    addGmHandler('vbAttack', vbAttackLocal);
    Hooks.on(HOOKS.rollFinished, onRollFinished);
    Hooks.on(HOOKS.damageRollComplete, onDamageRolled);
    Hooks.on(HOOKS.preambleComplete, onPreamble);
    Hooks.on('updateCombat', onUpdateCombat);
    Hooks.on('createActiveEffect', onCreateEffect);
    Hooks.on('deleteActiveEffect', onDeleteEffect);
    return {vengefulBlade, hellsLash, cantripLevel, vbDice, lashDice, endLash};
}
