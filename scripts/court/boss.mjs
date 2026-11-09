// =====================================================================
//  NIX FIX: Court of Ravenloft boss kit (Dracula), v13
//  For an actor the "Dracula: boss kit" installer prepared (flags.nix-module.boss):
//   - Legendary Actions (an item, 4 uses, 5 in his lair, back at the start of his turn):
//       Seal (1), Strike (2, Bloodrift first), By the Throat (2: seal + By the Throat).
//       Devour (2) lives on Infernal Conduit (its own activity, spends 2 of these).
//       Lair (toggle): marks the current scene as his lair (5 Legendary Actions there).
//   - Regeneration: at the start of his turn he regains 20 HP (needs at least 1 HP)
//     unless he took 15+ radiant damage since the start of his last turn.
//   - Infernal Ascension (mythic phase, once per long rest): the first time he drops
//     to 0 HP he stays at 1 instead, then rises at full HP, Infernal Majesty switches on
//     by itself, Master of Hell: Darkness erupts (place the sphere) and his Legendary
//     Actions refill. Mythic Action: Hellfire Detonation (2): burn every seal he has on
//     creatures within 30 ft.
//  Runs on a GM client (radiant damage is counted on any client, written through CPR's socket).
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {biItem, burnAll, placeSeal, tokenOf} from './illrigger.mjs';

export const FLAG = 'boss';
const cpr = () => globalThis.chrisPremades?.utils;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
export const bossOf = actor => actor?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const kindOf = activity => activity?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const ASCENSION = 'nixInfernalAscension';
const ascended = actor => actor?.effects.some(e => e.flags?.[MODULE_ID]?.[ASCENSION]);
const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
export const REGEN = {amount: 20, radiantStop: 15};
export const LEGENDARY = {base: 4, lair: 5};
const laOf = actor => {
    const b = bossOf(actor);
    return actor?.items.get(b?.legendaryItem) ?? actor?.items.find(i => i.flags?.[MODULE_ID]?.legendary) ?? actor?.items.find(i => /^legendary actions/i.test(i.name));
};
export const inLair = (actor, scene) => !!scene && (bossOf(actor)?.lairScenes ?? []).includes(scene.id);
// Legendary Actions max: 4, or 5 when the scene is one of his lairs.
export async function syncLegendaryMax(actor, scene = game.combat?.scene ?? canvas.scene) {
    const b = bossOf(actor), la = laOf(actor);
    if (!b || !la) return;
    const max = String(inLair(actor, scene) ? (b.legendaryLair ?? LEGENDARY.lair) : (b.legendaryBase ?? LEGENDARY.base));
    if (String(la.system.uses?.max) !== max) await la.update({'system.uses.max': max});
}

function onPreUse(activity) {
    const kind = kindOf(activity);
    if (kind === 'detonate' && !ascended(activity.actor)) {
        ui.notifications.warn(activity.item.name + ': only during Infernal Ascension (his second phase).');
        return false;
    }
}

async function onRollFinished(workflow) {
    const kind = kindOf(workflow?.activity);
    if (!kind || !game.user.isGM) return;
    const actor = workflow.actor;
    const target = workflow.targets?.first?.();
    try {
        if (kind === 'seal') {
            if (!target) return ui.notifications.warn('Legendary Seal: target a creature first.');
            const n = await placeSeal(actor, target, 1, {free: true});
            if (n) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Legendary Action:</b> ' + esc(actor.name) + ' seals ' + esc(target.document.name) + '.'});
        } else if (kind === 'throat') {
            if (!target) return ui.notifications.warn('By the Throat: target a creature first.');
            await placeSeal(actor, target, 1, {free: true});
            const it = actor.items.find(i => i.flags?.['chris-premades']?.info?.identifier === 'byTheThroat') ?? actor.items.find(i => /by the throat/i.test(i.name));
            if (it) await cpr().workflowUtils.syntheticItemRoll(it, [target], {consumeUsage: false, consumeResources: false});
        } else if (kind === 'strike') {
            if (!target) return ui.notifications.warn('Legendary Strike: target a creature first.');
            const weapons = actor.items.filter(i => i.type === 'weapon' && i.system.equipped);
            const w = weapons.find(i => i.flags?.[MODULE_ID]?.bloodrift) ?? weapons[0];
            const act = w?.system.activities.find(a => a.type === 'attack');
            if (!act) return ui.notifications.warn('Legendary Strike: no equipped weapon.');
            setTimeout(() => cpr().workflowUtils.syntheticActivityRoll(act, [target]), 300);
        } else if (kind === 'lair') {
            const scene = canvas.scene;
            if (!scene) return;
            const lairs = new Set(bossOf(actor)?.lairScenes ?? []);
            const on = !lairs.has(scene.id);
            if (on) lairs.add(scene.id); else lairs.delete(scene.id);
            await actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.lairScenes']: Array.from(lairs)});
            await syncLegendaryMax(actor, scene);
            await ChatMessage.create({whisper: [game.user.id], speaker: ChatMessage.getSpeaker({actor}),
                content: '<b>Lair:</b> ' + esc(scene.name) + (on ? ' is now ' : ' is no longer ') + esc(actor.name) + '\'s lair. Legendary Actions: '
                    + laOf(actor)?.system.uses?.max + ' (refilled at the start of his turn).'});
        } else if (kind === 'detonate') {
            const dealt = await burnAll(actor, {type: 'necrotic', radius: 30});
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Hellfire Detonation:</b> every seal within 30 ft burns' + (dealt ? ' (' + dealt + ' damage).' : '. No seals in range.')});
        }
    } catch (err) { console.error(TITLE + ' | boss action ' + kind, err); }
}

// ---------------------------------------------------------------- Regeneration
// Radiant damage he takes is added up (after resistances) until the start of his next turn.
function onTargetDamage(token, {ditem} = {}) {
    const actor = token?.actor;
    const b = bossOf(actor);
    if (!b || b.regen === false || !ditem) return;
    const rad = (ditem.damageDetail ?? []).filter(d => d.type === 'radiant').reduce((n, d) => n + (Number(d.value) || 0), 0);
    if (rad <= 0) return;
    const total = (Number(b.radiantTaken) || 0) + rad;
    foundry.utils.setProperty(actor, 'flags.' + MODULE_ID + '.' + FLAG + '.radiantTaken', total);   // local copy for a second hit in the same event
    cpr()?.genericUtils?.setFlag(actor, MODULE_ID, FLAG + '.radiantTaken', total)?.catch?.(err => console.error(TITLE + ' | radiant tally', err));
}

export async function startOfTurn(actor, scene) {
    const b = bossOf(actor);
    if (!b) return;
    await syncLegendaryMax(actor, scene);
    if (b.regen === false) return;
    const amount = Number(b.regenAmount ?? REGEN.amount), stop = Number(b.radiantStop ?? REGEN.radiantStop);
    const radiant = Number(b.radiantTaken) || 0;
    await actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.radiantTaken']: 0});
    const hp = actor.system.attributes.hp;
    if (radiant >= stop) {
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),
            content: '<b>Regeneration:</b> ' + esc(actor.name) + ' took ' + radiant + ' radiant damage since his last turn. He doesn\'t regenerate this turn.'});
        return;
    }
    if (hp.value <= 0 || hp.value >= hp.max) return;
    const gain = Math.min(amount, hp.max - hp.value);
    await actor.update({'system.attributes.hp.value': hp.value + gain});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),
        content: '<b>Regeneration:</b> ' + esc(actor.name) + ' regains ' + gain + ' hit points' + (radiant ? ' (' + radiant + ' radiant taken, under ' + stop + ')' : '') + '.'});
}

async function onUpdateCombat(combat, changed) {
    if (!isActiveGM() || !combat.started || !('turn' in changed || 'round' in changed)) return;
    const actor = combat.combatant?.actor;
    if (!bossOf(actor)) return;
    try { await startOfTurn(actor, combat.scene ?? canvas.scene); } catch (err) { console.error(TITLE + ' | boss turn start', err); }
}

// ---------------------------------------------------------------- Infernal Ascension
function onPreUpdateActor(actor, changed, options) {
    const b = bossOf(actor);
    if (!game.user.isGM || !b?.phase2 || b.ascendedThisRest) return;
    const next = foundry.utils.getProperty(changed, 'system.attributes.hp.value');
    if (next === undefined || next > 0 || actor.system.attributes.hp.value <= 0) return;
    foundry.utils.setProperty(changed, 'system.attributes.hp.value', 1);
    options.nixAscend = true;
}
function onUpdateActor(actor, changed, options) {
    if (!options?.nixAscend || !game.user.isGM) return;
    setTimeout(() => ascend(actor).catch(err => console.error(TITLE + ' | Infernal Ascension', err)), 300);
}

async function clearDown(actor) {
    for (const s of ['dead', 'unconscious', 'incapacitated', 'prone']) if (actor.statuses.has(s)) await actor.toggleStatusEffect(s, {active: false}).catch(() => {});
}

export async function ascend(actor) {
    const b = bossOf(actor);
    if (!b || b.ascendedThisRest) return;
    await actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.ascendedThisRest']: true, 'system.attributes.hp.value': actor.system.attributes.hp.max});
    await clearDown(actor);
    setTimeout(() => clearDown(actor), 1500);    // Midi may add its 0-HP status a moment later
    await syncLegendaryMax(actor);
    const la = laOf(actor);
    if (la?.system.uses?.max) await la.update({'system.uses.spent': 0});
    await actor.createEmbeddedDocuments('ActiveEffect', [{name: 'Infernal Ascension', img: 'icons/magic/unholy/silhouette-evil-horned-giant.webp', transfer: false,
        description: 'Second phase: Mythic Actions are available until his next long rest.', flags: {[MODULE_ID]: {[ASCENSION]: true}}}]);
    const tok = tokenOf(actor);
    try {
        const anim = ['jb2a.impact.ground_crack.dark_red.01', 'jb2a.ground_cracks.dark_red.01', 'jb2a.explosion.01.dark_red'].find(p => Sequencer.Database.entryExists(p));
        if (tok && anim) new Sequence().effect().file(anim).atLocation(tok).scaleToObject(3).play();
    } catch { /* optional */ }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),
        content: '<h3>Infernal Ascension</h3>' + esc(actor.name) + ' refuses to fall. He rises at full strength, Infernal Majesty blazes around him, and hell\'s darkness swallows the field.'});
    const im = actor.items.find(i => i.flags?.['chris-premades']?.info?.identifier === 'infernalMajesty') ?? actor.items.find(i => /^infernal majesty/i.test(i.name));
    const imOn = actor.effects.some(e => e.flags?.['chris-premades']?.info?.identifier === 'infernalMajestyEffect');
    if (im && !imOn) await cpr().workflowUtils.syntheticItemRoll(im, [], {consumeUsage: false, consumeResources: false});
    const moh = actor.items.find(i => /^master of hell/i.test(i.name));
    const dark = moh?.system.activities.find(a => /darkness/i.test(a.name ?? '')) ?? moh?.system.activities.contents[0];
    if (dark) {
        ui.notifications.info('Infernal Ascension: place Master of Hell: Darkness (50-ft sphere within 150 ft).');
        await cpr().workflowUtils.syntheticActivityRoll(dark, [], {consumeUsage: false, consumeResources: false});
    }
}

async function onRest(actor, result) {
    if (!game.user.isGM || !bossOf(actor) || !(result?.longRest ?? result?.type === 'long')) return;
    await actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.ascendedThisRest']: false});
    const fx = actor.effects.filter(e => e.flags?.[MODULE_ID]?.[ASCENSION]).map(e => e.id);
    if (fx.length) await actor.deleteEmbeddedDocuments('ActiveEffect', fx);
}

export function registerBoss() {
    Hooks.on('dnd5e.preUseActivity', onPreUse);
    Hooks.on('midi-qol.premades.postRollFinished', onRollFinished);
    Hooks.on('preUpdateActor', onPreUpdateActor);
    Hooks.on('updateActor', onUpdateActor);
    Hooks.on('dnd5e.restCompleted', onRest);
    Hooks.on('midi-qol.preTargetDamageApplication', onTargetDamage);
    Hooks.on('updateCombat', onUpdateCombat);
    return {ascend, bossOf, biItem, startOfTurn, syncLegendaryMax, inLair, REGEN, LEGENDARY};
}
