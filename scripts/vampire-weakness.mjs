// =====================================================================
//  NIX FIX: Vampire Weakness (Monster Manual 2024), 1.7.7, v13 and v14.
//
//  On the Court vampires (Dracula, Lucian, Valintina, Sydmore, Dayus Manroe) by the Court installer
//  automations/court-of-ravenloft/world/(v14/)install-vampire-weakness.js, which marks the item
//  flags.nix-module.vampireWeakness. Chris's Premades 1 (1.5.52) has a "Vampire Weakness" in its 2024 monster features:
//  three buttons and no macro (Running Water 20 acid, Sunlight 20 typed "none", Staked = Paralyzed). Chris's
//  Premades 2 (2.1.9) and CAT (0.1.9) have none. Here:
//   - Sunlight: 20 radiant when it STARTS its turn in sunlight (sunlight.mjs: a sunlight spell's light, or a Region
//     named Sunlight / Daylight). Disadvantage on attack rolls and every ability check while in sunlight is
//     sunlight.mjs (it reads Vampire Weakness as a Sunlight Sensitivity that covers every check).
//   - Running Water: 20 acid when it ENDS its turn in running water: a Region named "Running Water" (or flagged
//     flags.nix-module.runningWater), drawn by the GM over the river.
//   - Stake to the Heart, Forbiddance: the GM's call (the item's Staked button applies Paralyzed until deleted).
//  Damage goes through dnd5e's actor.applyDamage (resistance / immunity apply), on the active GM, with a chat line.
//  API: game.modules.get('nix-module').api.vampireWeakness
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';
import {centerOf, ftPerPx, inSunlight, isVampireWeakness, regionTest, sunlightSources} from './sunlight.mjs';

export const DAMAGE = Object.freeze({sun: {value: 20, type: 'radiant', why: 'starts its turn in sunlight'}, water: {value: 20, type: 'acid', why: 'ends its turn in running water'}});
const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);

// ---------------------------------------------------------------- pure helpers (tested)
export const weaknessOf = actor => Array.from(actor?.items ?? []).find(isVampireWeakness) ?? null;
export const isRunningWater = doc => !!doc?.flags?.[MODULE_ID]?.runningWater || /\brunning water\b/i.test(String(doc?.name ?? ''));
// Which damage this turn edge deals: 'start' + in sunlight, or 'end' + in running water.
export function turnDamage(edge, {sun = false, water = false} = {}) {
    if (edge === 'start' && sun) return DAMAGE.sun;
    if (edge === 'end' && water) return DAMAGE.water;
    return null;
}
// Did the combat move forward (a turn passed), not back (the GM undoing a turn)?
export function movedForward(prev, cur) {
    if (!prev || !cur) return false;
    const pr = Number(prev.round ?? 0), pt = Number(prev.turn ?? 0), cr = Number(cur.round ?? 0), ct = Number(cur.turn ?? 0);
    return cr > pr || (cr === pr && ct > pt);
}

// ---------------------------------------------------------------- canvas
export function runningWaterSources(scene = canvas?.scene) {
    const out = [];
    for (const r of scene?.regions?.contents ?? []) if (isRunningWater(r)) out.push({test: regionTest(r), label: r.name});
    for (const t of scene?.templates?.contents ?? []) if (isRunningWater(t) && t.object?.shape) out.push({test: p => t.object.shape.contains(p.x - t.x, p.y - t.y), label: 'running water'});
    return out;
}
const tokenOn = (combatant, scene) => {
    const doc = combatant?.token;
    if (!doc || doc.parent?.id !== scene?.id) return null;
    return doc.object ?? null;
};
export function weaknessAt(token, edge) {
    if (!token) return null;
    const p = centerOf(token);
    if (edge === 'start') return turnDamage('start', {sun: inSunlight(p, sunlightSources(), ftPerPx())});
    return turnDamage('end', {water: inSunlight(p, runningWaterSources(), ftPerPx())});
}

// ---------------------------------------------------------------- damage
export async function hurt(actor, token, dmg, item) {
    const hp = actor?.system?.attributes?.hp;
    if (!dmg || !hp || Number(hp.value) <= 0) return false;
    const before = Number(hp.value) + Number(hp.temp || 0);
    await actor.applyDamage([{value: dmg.value, type: dmg.type, properties: new Set()}]);
    const now = Number(actor.system.attributes.hp.value) + Number(actor.system.attributes.hp.temp || 0);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor, token: token?.document ?? token}),
        content: '<b>' + (item?.name ?? 'Vampire Weakness') + '</b>: ' + (token?.name ?? actor.name) + ' ' + dmg.why + ' and takes '
            + Math.max(0, before - now) + ' ' + dmg.type + ' damage (' + dmg.value + ' before resistance).'});
    return true;
}

async function onUpdateCombat(combat, changed) {
    try {
        if (!isActiveGM() || !combat?.started || !('turn' in (changed ?? {}) || 'round' in (changed ?? {}))) return;
        if (!movedForward(combat.previous, combat.current ?? {round: combat.round, turn: combat.turn})) return;
        const scene = canvas?.scene;
        if (!scene || (combat.scene && combat.scene.id !== scene.id)) return;
        // End of the previous creature's turn: running water.
        const prev = combat.combatants.get(combat.previous?.combatantId);
        const pItem = weaknessOf(prev?.actor);
        if (pItem) { const tok = tokenOn(prev, scene); await hurt(prev.actor, tok, weaknessAt(tok, 'end'), pItem); }
        // Start of this creature's turn: sunlight.
        const cur = combat.combatant;
        const cItem = weaknessOf(cur?.actor);
        if (cItem) { const tok = tokenOn(cur, scene); await hurt(cur.actor, tok, weaknessAt(tok, 'start'), cItem); }
    } catch (err) { console.error(TITLE + ' | Vampire Weakness', err); }
}

let registered = false;
export function registerVampireWeakness() {
    if (registered) return null;
    registered = true;
    Hooks.on('updateCombat', onUpdateCombat);
    return {DAMAGE, weaknessOf, isRunningWater, turnDamage, movedForward, runningWaterSources, weaknessAt, hurt};
}
