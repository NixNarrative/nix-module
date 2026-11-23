// =====================================================================
//  NIX FIX: Illrigger ranges (1.7.7), shared by v13 and v14.
//  Combat Mastery: Unfettered (book): "When you use your Baleful Interdict to place or burn a seal, its range
//  is 60 feet instead of 30 feet. When you gain the Infernal Conduit feature at 6th level, its range is 30 feet
//  instead of touch. In addition, making a ranged attack while within 5 feet of a hostile creature does not
//  impose disadvantage on the attack roll."
//  Every seal path asks sealRange() (hit offer, Bonus Action / Action Place Seal, Legendary Seal, Bewitching
//  Seal, burn dialog, Deathstrike, Move Seals); Infernal Conduit asks conduitRange(). The sheet is read live,
//  so an Illrigger who gained Unfettered after the engine was applied still gets 60 ft.
//  An explicit config range (flags.nix-module.illrigger.range, e.g. a captain's) is kept; Unfettered only
//  raises it to at least 60.
//  The ranged-in-melee part is Midi's flags.midi-qol.ignoreNearbyFoes (Midi v13 branch and v14.7.0,
//  Workflow.ts: checkRule("nearbyFoe") skips the disadvantage when the flag is true), written by the engine
//  installers as a passive effect on the Unfettered item (as Chris's Premades 1's own Unfettered item does).
// =====================================================================
import {MODULE_ID} from '../constants.mjs';
import {ident} from './engine.mjs';

export const UNFETTERED_ID = 'combatMasteryUnfettered';
export const SEAL_RANGE = 30, SEAL_RANGE_UNFETTERED = 60;
export const CONDUIT_RANGE = 5, CONDUIT_RANGE_UNFETTERED = 30;
export const IGNORE_NEARBY_KEY = 'flags.midi-qol.ignoreNearbyFoes';

const items = actor => Array.from(actor?.items ?? []);
export const isUnfetteredItem = i => !!i && (ident(i) === UNFETTERED_ID || i.system?.identifier === UNFETTERED_ID || /\bunfettered\b/i.test(String(i.name ?? '')));
export const hasUnfettered = actor => items(actor).some(isUnfetteredItem);
export const unfetteredItem = actor => items(actor).find(isUnfetteredItem) ?? null;

// Seal range in feet: the config range (30 when none), at least 60 with Unfettered.
export function sealRange(actor) {
    const base = Number(actor?.flags?.[MODULE_ID]?.illrigger?.range) || SEAL_RANGE;
    return hasUnfettered(actor) ? Math.max(base, SEAL_RANGE_UNFETTERED) : base;
}
// Infernal Conduit reach in feet: touch (5), 30 with Unfettered.
export const conduitRange = actor => hasUnfettered(actor) ? CONDUIT_RANGE_UNFETTERED : CONDUIT_RANGE;
// Pure check used by the runtime and the tests: can a seal be placed / burned at this distance?
export const sealInRange = (actor, feet) => Number.isFinite(Number(feet)) && Number(feet) <= sealRange(actor);
