# v14 pilot: Bangiras
 
2026-11-03. Nix Module 1.1.0. Built on the `fvtt-Actor-bangiras-PostCPR` export (Foundry 14.369, dnd5e 6.0.6, CPR 2.1.6, CAT 0.1.6).
**Status: written and checked offline, not tested at the table yet.** Test on the v14 copy of The Fool's Journey only.
 
## What's in it
**Engine (`scripts/`)**
- `runner.mjs`: a second engine. On a CAT world each entry runs its `v14` file; embedded macros go to `item.flags.cat.embeddedMacros` (or `activity.flags.cat.embeddedMacros`) in CAT's stored shape `{name, event, pass, macros: [{macro, priority}]}`, and the inert v13 copy in `flags.chris-premades` is removed. Entries with no v14 copy show **Not ported to v14 yet** and never run. A world copied from v13 carries v13 "applied" records; those show as updates (last applied with the v13 engine).
- `registry.mjs`: `v14: {file, target: {event, pass, priority}}` on the Bangiras entries.
- `compat.mjs`: a v14 version table (dnd5e capped below 6.1, CAT below 0.2). `detectEngine` now returns `cat` as usable (partial).
- `health.mjs`: scans CAT macros (item, activity, effect) as well as old CPR1 ones, and lists the old ones separately on v14.
- `panel.mjs`: "Not ported" rows are greyed out with no Apply button.
**Bangiras v14 files** (`automations/fools-journey/bangiras/v14/`)
| Automation | CAT event / pass | Notes |
|---|---|---|
| Metamagic fix-up | (installer) | Also flags CPR2 automations on the options. |
| Magicians Judge setup | Judgement: skill / `actorSituational` | New effect format; Sand Shroud uses native "until start of next turn". Removes the stray untagged Sand Shroud effect (see below). |
| Stasis v3 | save / `actorSituational` + roll / `targetRollFinished` | Sourced saves: `getSaveSource(config)`. Topple: the staff marks "hit by a Topple weapon" for 15 s, then a sourceless Con save gets advantage. |
| Sand Shroud animation | effect / `created`, `deleted` | Now on the effect the reaction actually applies. |
| Heightened / Twinned / Quickened | roll / `itemRollFinished` | Primed effects: `actorPreambleComplete` (H 40, T 30), `actorRollFinished` (Q 60). Heightened target: save `actorSituational` + `actorPost`, combat `actorTurnEnd`. |
| Sorcery Incarnate | roll / `actorRollFinished` 20 | |
| Sorcerous Restoration | rest / `actorShort` | Skips long rests. |
| Mantle of Flame | roll / `itemRollFinished` 60 | Mantle effect: `targetOnHit` 250, `actorDamageRollBonuses` 60, effect created/deleted; `token.light.*`. |
| Phoenix Spark | `itemRollFinished` 50 + `targetDamageComplete` 245 | `preventZeroHP`. |
| Hold Monster live DC | roll / `itemRollFinished` 60 | Edits `system.changes`. |
| Seeking Spell | roll / `actorAttackRoll` 50 | |
| Ring: Spell Surge | roll / `activityRollFinished` 50 (on the activity) | |
| Shadowfell Shard | roll / `actorRollFinished` 50 | `DialogApp` replaced by a target pick + ability buttons (with "No curse"). |
 
Every macro is wrapped in `return await (async () => {...})();`, so none re-declares a name CAT puts in scope (`actor`, `item`, `token`, `document`...).
 
**Not in the pilot:** Counterspell and Ring: Shift Spell (port together with the world Counterspell), the world Hold spells installer (Bangiras's own Hold Monster is covered).
 
## Checked offline
- All files parse; every macro compiles with CAT's scope names as parameters.
- The three installers ran against a mock of the PostCPR export: 14 CAT macros written, all in the stored shape, re-runs replace instead of stacking, no v13 copies of ours left. ATL keys on Innate Sorcery and True Seeing were moved to `token.*`.
- The runner wrote Seeking Spell, Spell Surge (activity level) and Shadowfell Shard on the real items, removed their v13 copies, kept Shift Spell's v13 copy, and refused Shift Spell as "not ported".
- No v13-only helpers left (`trigger.*`, `socketUtils`, `genericUtils.remove/update`, `createEffect`, `combatUtils.inCombat`, `DialogApp`, `preventDeath`, `ACTIVE_EFFECT_MODES`).
## Found in the export
- **Sand Shroud animation was on the wrong effect in v13.** The staff had two "Sand Shroud" effects; the reaction applies the tagged one, and the v13 fixes put the animation on the untagged leftover. The v14 setup deletes the leftover, and the v14 fixes target the effect the activity references.
- **Innate Sorcery's stored effect adds `@abilities.cha.mod` to every ranged spell attack's damage.** Mantle of Flame already adds +Cha to fire damage on his turn, so Fire Bolt gets it twice. Left as is; the installer flags it. Remove that change if it isn't meant to be there.
- Breath Weapon and Chromatic Warding still carry CPR1 tags (inert on v14). Duplicates: Dagger, Hex, Misty Step (Hex and Misty Step may be the Fey Touched free casts; check before deleting).
## Before testing (v14 copy, as GM)
1. Console checks from V14-MAPPING section 9 (effect `system.changes` create; `CONST.ACTIVE_EFFECT_CHANGE_TYPES`). The v14 files don't use `CONST.ACTIVE_EFFECT_MODES`.
2. CAT setting `displayDebugEventData` on for the first few tests: the console shows each event's scope.
3. Nix Module > Apply (in order): Metamagic fix-up, Magicians Judge setup, Bangiras fixes, Seeking Spell, Spell Surge, Shadowfell Shard. Read the whispers.
4. Health check: "all compile", and the Bangiras rows show ✅.
## Table test checklist
Things the mapping couldn't settle from the sources are marked **(confirm)**.
- [ ] **Judgement**: Insight check offers Pass Judgement; yes gives advantage and spends 1 charge. **(confirm `options.advantage` set in `actorSituational` sticks)**
- [ ] **Stasis, sourced**: a spell or feature that knocks prone asks for a save: advantage.
- [ ] **Stasis, Topple**: an NPC with a Topple weapon hits him: the Con save has advantage. **(confirm `targetRollFinished` runs before CAT's Topple save)**
- [ ] **Sand Shroud**: reaction gives +3 AC, attackers have disadvantage, animation plays and ends at the start of his turn. **(confirm `effect/created` fires for the effect copied onto him)**
- [ ] **Quickened**: spell list, cast, Bonus Action used, Action back; cancel refunds 2 SP.
- [ ] **Heightened**: two targets, pick one, its save has disadvantage; effect clears after the save on a one-off spell; stays for Hold Monster's repeat saves. **(confirm `getSaveSource` returns the spell, and the `actorPost` pass name)**
- [ ] **Twinned**: one target selected: asked for the second, both targeted. **(confirm `selectTargetDialog` with TokenDocuments)**
- [ ] **Sorcery Incarnate**: with Innate Sorcery on, clicking one option offers a second; both apply to one spell.
- [ ] **Seeking Spell**: a missed spell attack offers the reroll; new total shown.
- [ ] **Mantle of Flame**: Innate Sorcery starts it (light 30/60, fire aura); melee hit within 5 ft burns the attacker; Fire Bolt on his turn gets +Cha **(confirm `bonusDamage` in `actorDamageRollBonuses`)**; ends when Innate Sorcery ends.
- [ ] **Phoenix Spark**: damage that would drop him to 0 asks first; yes: 1 HP, burst within 10 ft, Mantle ends. Clicking it by hand also bursts.
- [ ] **Sorcerous Restoration**: short rest asks; long rest doesn't.
- [ ] **Hold Monster**: cast with Innate Sorcery on: the held target's end-of-turn save uses DC 17 (16 + 1).
- [ ] **Spell Surge**: list, cast, then Paralyzed/Incapacitated until the end of his next turn.
- [ ] **Shadowfell Shard**: Metamagic then a spell: pick target + ability; its next check and save with that ability have disadvantage, then the curse fades.
If one fails, open the console with CAT debug on and note the event/pass and what the scope printed; most likely fixes are a pass name or a TokenDocument/placeable swap.
 