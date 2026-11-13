// =====================================================================
//  NIX FIX: Court of Ravenloft, table-test fixes of 2026-11-12 (1.7.1), v13 and v14
//
//   Hellsight (Lucian's boon): the token switches to its Truesight vision mode while the
//     effect is on (the old mode comes back after), and Darkness's Blinded comes off when it
//     starts (cast inside Darkness); when it ends inside Darkness he's blinded again (v13).
//   Invoke Hell: Honey-Sweet Blades (Lucian): 1 minute; weapon attacks against a creature
//     carrying his seal have advantage, and a hit is a critical hit.
//   Vengeful Shot (v13): one prompt. The weapon is picked (ranged first), asked only if several fit.
//   Infernal Conduit (v13): its dice are the activity's own damage (fixes installer); this
//     file keeps Chris's Premades' range check (5 ft, 30 with Unfettered) and the heal / cost.
//   Mage Slayer (2024): concentration breaker (disadvantage on the concentration save of a
//     creature she damages) and Guarded Mind (api.court.guardedMind, called from the feat's
//     save-bonus macro the fixes installer writes).
//  Activity kinds (flags.nix-module.court): honeySweet, vengefulShot, conduit.
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {isActiveGM, sealsOf} from './illrigger.mjs';
import {cpr, fxAll, isCat, MODES, HOOKS, ident} from './engine.mjs';
import {ltOf, gm} from './lieutenants.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const say = (actor, content) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content});
const kindOf = activity => activity?.flags?.[MODULE_ID]?.court ?? null;
const gmId = () => game.users.activeGM?.id ?? game.user.id;
const tokUuid = t => t?.document?.uuid ?? t?.uuid;
const isWeaponAttack = wf => wf?.item?.type === 'weapon' && wf?.activity?.type === 'attack';
const dist = (a, b) => (cpr()?.tokenUtils?.getDistance ?? MidiQOL.getDistance)(a, b, {});

// ======================================================== Hellsight
export const HELLSIGHT = /hell ?sight/i;
const isHellsight = e => !!e && !e.transfer && HELLSIGHT.test(e.name ?? '');
function truesightMode() {
    const modes = CONFIG.Canvas?.visionModes ?? {};
    return ['truesight', 'trueSight', 'trueseeing'].find(k => modes[k]) ?? null;
}
async function onHellsightOn(effect) {
    const actor = effect.parent;
    if (!(actor instanceof Actor)) return;
    const mode = truesightMode();
    for (const t of actor.getActiveTokens(false, true)) {
        const sight = t.sight ?? {};
        const upd = {};
        if (mode && sight.visionMode !== mode) {
            upd['flags.' + MODULE_ID + '.hellsightVision'] = {mode: sight.visionMode ?? 'basic', range: sight.range ?? 0};
            upd['sight.visionMode'] = mode;
            upd['sight.range'] = Math.max(Number(sight.range) || 0, 60);
        }
        if (Object.keys(upd).length) await t.update(upd);
    }
    if (!mode) console.warn(TITLE + ' | Hellsight: no Truesight vision mode registered (Vision 5e?); the vision mode was left as is.');
    // Inside Darkness when it starts: the Blinded that Darkness gave goes.
    const blind = actor.effects.filter(e => e.flags?.world?.nixDarkBlind);
    if (blind.length) {
        await actor.deleteEmbeddedDocuments('ActiveEffect', blind.map(e => e.id));
        await say(actor, '<b>Hellsight:</b> ' + esc(actor.name) + ' sees through the Darkness (no longer blinded).');
    }
}
async function onHellsightOff(effect) {
    const actor = effect.parent;
    if (!(actor instanceof Actor)) return;
    if (actor.effects.some(e => e.id !== effect.id && isHellsight(e))) return;
    for (const t of actor.getActiveTokens(false, true)) {
        const prev = t.flags?.[MODULE_ID]?.hellsightVision;
        if (!prev) continue;
        await t.update({'sight.visionMode': prev.mode, 'sight.range': prev.range, ['flags.' + MODULE_ID + '.-=hellsightVision']: null});
    }
    if (!isCat()) await reblind(actor).catch(err => console.error(TITLE + ' | Hellsight (Darkness)', err));
}
// v13: back inside a Chris's Premades Darkness template with nothing to see through it -> Blinded again.
async function reblind(actor) {
    const tok = actor.getActiveTokens()[0];
    const tu = cpr()?.templateUtils;
    if (!tok || !tu?.getTokensInTemplate || !canvas.templates) return;
    const ranges = actor.system.attributes?.senses?.ranges ?? actor.system.attributes?.senses ?? {};
    const dm = tok.document.detectionModes;
    const tokenMode = id => { const m = Array.isArray(dm) ? dm.find(x => x.id === id) : dm?.[id]; return m && m.enabled !== false && (m.range ?? 0) > 0; };
    const sees = (actor.flags?.['chris-premades']?.senses?.magicalDarkness ?? 0) > 0 || tokenMode('devilsSight')
        || (ranges.blindsight ?? 0) > 0 || (ranges.truesight ?? 0) > 0 || tokenMode('blindsight') || tokenMode('seeAll');
    if (sees) return;
    for (const tpl of canvas.templates.placeables) {
        if (!tpl.document.flags?.['chris-premades']?.template?.visibility?.magicalDarkness) continue;
        const inside = Array.from(tu.getTokensInTemplate(tpl.document ?? tpl) ?? []).some(t => (t.document ?? t).id === tok.document.id);
        if (!inside || actor.effects.some(e => e.flags?.world?.nixDarkBlind === tpl.document.uuid)) continue;
        await actor.createEmbeddedDocuments('ActiveEffect', [{name: 'Darkness: Blinded', img: 'icons/magic/perception/silhouette-stealth-shadow.webp',
            origin: tpl.document.flags?.dnd5e?.origin ?? tpl.document.uuid, statuses: ['blinded'], description: 'Inside magical Darkness without a way to see through it.',
            flags: {world: {nixDarkBlind: tpl.document.uuid}}}]);
        await say(actor, '<b>Hellsight</b> ends: ' + esc(actor.name) + ' is blind in the Darkness again.');
        return;
    }
}
function onCreateEffect(effect) {
    if (!isActiveGM() || !isHellsight(effect)) return;
    onHellsightOn(effect).catch(err => console.error(TITLE + ' | Hellsight', err));
}
function onDeleteEffect(effect) {
    if (!isActiveGM() || !isHellsight(effect)) return;
    onHellsightOff(effect).catch(err => console.error(TITLE + ' | Hellsight', err));
}

// ======================================================== Honey-Sweet Blades
const honeyOn = a => a?.effects.find(e => !e.disabled && e.flags?.[MODULE_ID]?.honeySweet) ?? null;
async function honeySweet(actor) {
    const old = honeyOn(actor);
    if (old) await old.delete();
    await actor.createEmbeddedDocuments('ActiveEffect', fxAll([{name: 'Invoke Hell: Honey-Sweet Blades', img: 'icons/skills/melee/blade-tip-chipped-blood-red.webp', transfer: false,
        duration: {seconds: 60}, description: 'Weapon attacks against a creature carrying his seal have advantage, and a hit is a critical hit.',
        flags: {[MODULE_ID]: {honeySweet: {owner: actor.uuid}}}}]));
    await say(actor, '<b>Invoke Hell: Honey-Sweet Blades:</b> for 1 minute ' + esc(actor.name) + '\'s weapon attacks against creatures carrying his seal have advantage and hit as critical hits.');
}
const sealedBy = (t, a) => !!t?.actor && sealsOf(t.actor, a).length > 0;
async function honeyPreamble(wf) {
    const a = wf.actor;
    if (!honeyOn(a) || !isWeaponAttack(wf) || wf.nixHoney) return;
    const t = wf.targets?.first?.();
    if (!sealedBy(t, a)) return;
    wf.nixHoney = true;
    await a.createEmbeddedDocuments('ActiveEffect', fxAll([{name: 'Honey-Sweet Blades (advantage)', img: 'icons/skills/melee/blade-tip-chipped-blood-red.webp', transfer: false,
        duration: {turns: 1}, changes: [{key: 'flags.midi-qol.advantage.attack.all', mode: MODES.OVERRIDE, value: '1', priority: 20}],
        flags: {dae: {specialDuration: ['1Attack']}, [MODULE_ID]: {transient: true}}}]));
}
async function honeyHit(wf) {
    const a = wf.actor;
    if (!wf.nixHoney || !honeyOn(a) || wf.isCritical || !wf.hitTargets?.size) return;
    if (!sealedBy(wf.hitTargets.first(), a)) return;
    await wf.setAttackRoll(cpr().rollUtils.makeCritical(wf.attackRoll));
    wf.isCritical = true;
    await say(a, '<b>Honey-Sweet Blades:</b> the hit becomes a critical hit.');
}

// ======================================================== Vengeful Shot (v13)
async function vengefulShot(wf) {
    const a = wf.actor, t = wf.targets?.first?.();
    if (!t) return ui.notifications.warn('Vengeful Shot: target the creature first.');
    const weapons = a.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some?.(x => x.type === 'attack'));
    if (!weapons.length) return ui.notifications.warn('Vengeful Shot: no equipped weapon.');
    const me = wf.token;
    const reach = w => { const r = w.system.range ?? {}; return Math.max(Number(r.long) || 0, Number(r.value) || 0, Number(r.reach) || 0, w.system.properties?.has?.('rch') ? 10 : 5); };
    const d = me ? dist(me, t) : 0;
    const fits = weapons.filter(w => reach(w) >= d);
    const ranged = fits.filter(w => /R$/.test(w.system.type?.value ?? '') || w.system.properties?.has?.('thr'));
    const pool = ranged.length ? ranged : (fits.length ? fits : weapons);
    let w = pool[0];
    if (pool.length > 1) {
        const id = await cpr().dialogUtils.buttonDialog(wf.item.name, 'Which weapon?', pool.map(i => [i.name, i.id]), {userId: gmId()});
        w = a.items.get(id);
        if (!w) return;
    }
    await cpr().workflowUtils.specialItemUse(w, [t], wf.item, {consumeResources: true, consumeUsage: true});
}

// ======================================================== Infernal Conduit (v13)
const unfettered = a => a.items.some(i => ident(i) === 'combatMasteryUnfettered' || /unfettered/i.test(i.name));
function conduitRange(wf) {
    const t = wf.targets?.first?.();
    if (!wf.token || !t) return true;
    const max = unfettered(wf.actor) ? 30 : 5;
    if (dist(wf.token, t) <= max) return true;
    ui.notifications.info('Infernal Conduit: the target must be within ' + max + ' ft.');
    wf.aborted = true;
    return false;
}
async function conduitAfter(wf) {
    const t = wf.targets?.first?.();
    if (!t?.actor || !wf.token) return;
    const u = cpr().workflowUtils;
    const types = u.getDamageTypes?.(wf.damageRolls) ?? new Set();
    const type = types.first?.() ?? Array.from(types)[0];
    if (!type) return;
    const amount = Math.abs(u.getTotalDamageOfType?.(wf.damageDetail, t.actor, type) ?? 0);
    if (!amount) return;
    await u.applyDamage([wf.token], amount, type === 'necrotic' ? 'healing' : 'none');
    if (wf.actor.system.attributes.hp.value === 0 && wf.actor.type === 'character') await wf.actor.update({'system.attributes.death.success': 3});
}

// ======================================================== Mage Slayer (2024)
const concentrating = a => !!a && (a.statuses?.has?.(CONFIG.specialStatusEffects?.CONCENTRATING ?? 'concentrating') || a.effects.some(e => !e.disabled && e.statuses?.has?.('concentrating')));
async function mageSlayerDamage(wf) {
    const a = wf.actor;
    if (!ltOf(a)?.mageSlayer || !a.items.get(ltOf(a).mageSlayer)) return;
    const hit = wf.activity?.type === 'attack' ? Array.from(wf.hitTargets ?? []) : Array.from(wf.targets ?? []);
    for (const t of hit) {
        if (!t?.actor || t.actor.uuid === a.uuid || !concentrating(t.actor)) continue;
        if (t.actor.effects.some(e => e.flags?.[MODULE_ID]?.mageSlayer === wf.id)) continue;
        await gm('effect', {actor: t.actor.uuid, data: {name: 'Mage Slayer: concentration', img: 'icons/magic/control/debuff-energy-hold-teal-blue.webp', transfer: false,
            duration: {seconds: 6}, description: 'Disadvantage on the saving throw to keep concentration (' + a.name + '\'s Mage Slayer).',
            changes: [{key: 'flags.midi-qol.disadvantage.concentration', mode: MODES.OVERRIDE, value: '1', priority: 20}],
            flags: {dae: {specialDuration: ['isSave']}, [MODULE_ID]: {mageSlayer: wf.id, transient: true}}}});
    }
}
// Guarded Mind: called from the feat's save-bonus macro. Returns the number to add (making it a success) or null.
export async function guardedMind(actor, roll, ability) {
    if (!['int', 'wis', 'cha'].includes(ability)) return null;
    const target = Number(roll?.options?.target);
    if (!target || !(roll.total < target)) return null;
    const ms = actor.items.get(ltOf(actor)?.mageSlayer ?? '') ?? actor.items.find(i => i.type === 'feat' && /^mage slayer\b/i.test(i.name));
    if (!ms || (ms.system.uses?.max && !(Number(ms.system.uses.value) > 0))) return null;
    const ok = await cpr().dialogUtils.confirm('Guarded Mind (' + actor.name + ')', actor.name + ' failed a ' + (CONFIG.DND5E.abilities[ability]?.label ?? ability)
        + ' save (' + roll.total + ' vs DC ' + target + '). Succeed instead? (Mage Slayer, once per short rest)', {userId: gmId()});
    if (!ok) return null;
    if (ms.system.uses?.max) await gm('update', {uuid: ms.uuid, data: {'system.uses.spent': (ms.system.uses.spent ?? 0) + 1}});
    await say(actor, '<b>Guarded Mind:</b> ' + esc(actor.name) + ' succeeds instead.');
    return target - roll.total;
}

// ======================================================== hooks
async function onPreamble(wf) {
    try {
        if (!wf?.actor) return;
        if (kindOf(wf.activity) === 'conduit' && !wf.nixConduitChecked) { wf.nixConduitChecked = true; if (!conduitRange(wf)) return false; }
        await honeyPreamble(wf);
    } catch (err) { console.error(TITLE + ' | court extras preamble', err); }
    if (wf?.aborted) return false;
}
async function onAttackComplete(wf) { try { if (wf?.actor) await honeyHit(wf); } catch (err) { console.error(TITLE + ' | Honey-Sweet Blades', err); } }
async function onDamageRolled(wf) { try { if (wf?.actor) await mageSlayerDamage(wf); } catch (err) { console.error(TITLE + ' | Mage Slayer', err); } }
async function onRollFinished(wf) {
    try {
        const kind = kindOf(wf?.activity);
        if (!kind || !game.user.isGM || !wf.actor) return;
        if (kind === 'honeySweet') return honeySweet(wf.actor);
        if (kind === 'vengefulShot' && !isCat()) return vengefulShot(wf);
        if (kind === 'conduit' && !isCat()) return conduitAfter(wf);
    } catch (err) { console.error(TITLE + ' | court extras', err); }
}

export function registerCourtExtras() {
    Hooks.on(HOOKS.preambleComplete, onPreamble);
    if (!isCat()) Hooks.on('midi-qol.preambleComplete', onPreamble);
    Hooks.on(HOOKS.attackRollComplete, onAttackComplete);
    Hooks.on(HOOKS.damageRollComplete, onDamageRolled);
    Hooks.on(HOOKS.rollFinished, onRollFinished);
    Hooks.on('createActiveEffect', onCreateEffect);
    Hooks.on('deleteActiveEffect', onDeleteEffect);
    return {guardedMind, honeySweet};
}
