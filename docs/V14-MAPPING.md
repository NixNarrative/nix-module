# v14 mapping report (Step 1 of V14.md)
 
2026-11-03. Read from the sources of the zips Nix uploaded (unpacked from their source maps), plus the Bangiras v13, Akira v13 and Akira v14 actor exports.
No code is ported yet. This report says what every automation needs on Foundry v14.
 
**Versions read:** Foundry 14.369, dnd5e 6.0.6, CAT 0.1.6, Chris's Premades **2.1.6** (V14.md says 2.1.1), Midi QOL 14.6.8, DAE 14.6.6, Gambit's Premades 3.0.5, Automated Animations 8.0.6, Aura Effects 2.3.0, Vision 5e 3.2.3, WM5e 14.606.2.1, Automated Conditions 5e 14.606.4.8.
Note from Midi's changelog: Midi 14.6.x supports **dnd5e 6.0.x only**. dnd5e 6.1 changes damage application, so stay on 6.0.x.
 
## Bottom line
- **Nothing ports by copying.** Every macro needs the same set of mechanical renames (sections 2 to 4). The renames are predictable, so a converter can do most of the work.
- On top of that there are five platform changes that break real logic (section 5): Token vs TokenDocument, effect data (`system.changes`, new duration model), templates are now Regions, Midi chat cards, and damage passes split into read-only vs editable.
- **Four automations retire on v14** because Chris's Premades 2 does them natively: Life Bond, Font of Inspiration, Fire Shield switch, and probably Vitality of the Tree. Several more need checking against CPR2 before porting.
- **Akira v14 has none of our automations on it.** It looks re-imported through D&D Beyond Importer (section 7). Some items also still carry old CPR1 identifiers that do nothing on v14.
- The Bangiras pilot is a good choice. It touches almost every event type, has only one hard rework (Stasis), and uses no templates or summons.
## Corrections to V14.md
| V14.md says | Sources say |
|---|---|
| Entries are `{name, event, pass, priority, macro}` | That is the Medkit editor's flat form. **Stored** shape: `{name, event, pass, macros: [{macro, priority, distance?, dispositions?, disabled?}]}` (CAT `applications/medkit/base.mjs` `flatToEmbedded`, `lib/embeddedMacros.mjs` reads `macro.macros`). |
| `embeddedActivityMacros` moves to `flags.cat.embeddedMacros` | Activity macros go on the **activity's own flags**: `activity.flags.cat.embeddedMacros` (CAT `getActorTriggers` and the workflow event check `hasCatFlag(activity)`). dnd5e 6 activities have a `flags` field. |
| CAT injects `actor, token, item, scene` | Also true, but `token` is a **TokenDocument**, and there is **no `trigger` variable**: the trigger's fields are spread into scope (`document`, `workflow`, `ditem`, `config`, `options`, `roll`, `saveId`...). |
| CPR 2.1.1 | 2.1.6 now. |
 
## 1. Where CAT reads embedded macros
- Item: `item.flags.cat.embeddedMacros`. Activity: `activity.flags.cat.embeddedMacros`. Effect: `effect.flags.cat.embeddedMacros`. Tokens, regions and scenes can carry them too.
- An event collects triggers from many documents and sorts all macros by priority, so the priorities we use still order things between documents.
- **Same-name rule (unchanged from CPR1):** by default only one *document name* fires per event. Example: every creature's "Counterspell" item. CAT keeps the one with the highest cast level / DC. Our Counterspell already relies on this. Watch for it anywhere two documents share a name.
- Effects created by our macros: put `flags.cat.embeddedMacros` (new shape) and `flags.cat.identifier` in the effect data. `effectUtils.createEffects(actor, [data])` keeps both.
## 2. Scope translation (inside every macro)
| CPR1 | CAT |
|---|---|
| `trigger.entity` | `document` |
| `trigger.actor`, `trigger.token` | `actor`, `token` (a **TokenDocument**) |
| `trigger.config`, `trigger.options`, `trigger.roll` | `config`, `options`, `roll` |
| `trigger.saveId` / `skillId` / `checkId` | `saveId` / `skillId` / `checkId` |
| `trigger.data.longRest` (rest) | `result.type === 'long'` |
| `trigger.config.midiOptions.saveItemUuid` | `workflowUtils.getSaveSource(config)` returns `{activity, item, actor}` |
| `ditem` | `ditem` (+ `targetToken`) in the damage passes |
| `workflow` | `workflow` (still Midi's; `workflow.token` is still a **Token placeable**) |
| Return `true` from preItemRoll/preambleComplete to cancel | Same, and **CAT refunds consumption** unless you set `workflowUtils.setWorkflowProperty(workflow, 'keepConsumption', true)` |
 
Also in scope: every CAT util (`activityUtils, actorUtils, animationUtils, automationUtils, combatUtils, compendiumUtils, crosshairUtils, dataUtils, dialogUtils, documentUtils, effectUtils, folderUtils, genericUtils, itemUtils, queryUtils, regionUtils, rollUtils, summonUtils, tokenUtils, uiUtils, workflowUtils`), `constants`, `D20Bonus`, `DamageBonus`. **`DialogApp` is not in scope** (Demonic Gamble, Shadowfell Shard and Divine Intervention use it).
 
## 3. Event / pass mapping
CAT pass = **scope prefix + Pass**. The prefix says where the macro lives relative to the roll: `item`, `activity`, `actor` (the user's items, effects, activities), `target` (each target's items and effects), `scene`, `nearby` (with optional `distance`/`dispositions` filters), `token`, `region`...
 
| Our CPR1 `type` / `pass` | CAT `event` / `pass` | Notes |
|---|---|---|
| midi-item / preTargeting | roll / `itemPreTargeting` (`activityPreTargeting` on an activity) | gets `config, dialog, message`, no `workflow` |
| midi-item / preItemRoll | roll / `itemPreItemRoll` | return true cancels (+refund) |
| midi-item / preambleComplete | roll / `itemPreambleComplete` | |
| midi-item / savesComplete | roll / `itemSavesComplete` | |
| midi-item / rollFinished | roll / `itemRollFinished` (`activityRollFinished`) | |
| midi-actor / preItemRoll, preambleComplete, rollFinished | roll / `actorPreItemRoll`, `actorPreambleComplete`, `actorRollFinished` | primed-effect Metamagic uses these |
| midi-actor / postAttackRoll | roll / `actorAttackRoll` | "re-roll here" (CPR2's own Seeking Spell uses this, priority 800) |
| midi-actor / targetPreAttackRollConfig | roll / `targetAttackRollConfig` | Lucky disadvantage |
| midi-actor / targetPostAttackRoll | roll / `targetAttackRoll` or `targetAttackRollBonuses` | Combat Inspiration AC |
| midi-actor / targetAttackRollComplete | roll / `targetAttackRollComplete` | **read only** now: Adamantine Plate must move to `targetAttackRoll` |
| midi-actor / damageRollComplete (adds damage) | roll / `actorDamageRollBonuses` | **`damageRollComplete` is read only now.** Spellfire, Mantle, Agonizing, GWM, Bitter Frost, Blade Strikes |
| midi-actor / targetApplyDamage (reads/edits ditem) | roll / `targetDamage` (edit) or `targetDamageComplete` (final, prevent death) | Phoenix Spark, Gift, Interpose, Rebuke, Fount reaction |
| midi-actor / sceneApplyDamage | roll / `sceneDamageComplete` | Gift of the Protectors |
| midi-actor / scenePreambleComplete | roll / `scenePreambleComplete` | Counterspell |
| midi-actor / sceneRollFinished | roll / `nearbyRollFinished` + `distance: 5, dispositions: 'enemy'` | Sentinel (CAT filters for us) |
| midi-actor / onHit | roll / `targetOnHit` | Mantle of Flame hit-back |
| save / situational, bonus | save / `actorSituational`, `actorBonus` (return a Roll) | `actorTargetSituational` = only saves an activity asked for |
| skill / situational | skill / `actorSituational` | Judgement |
| check / situational | check / `actorSituational` | Shadowfell curse |
| effect / created, deleted (on the effect itself) | effect / `created`, `deleted` (bare) | GM client only, like before |
| combat / turnStart, turnEnd, everyTurn, combatStart | combat / `actorTurnStart`, `actorTurnEnd`, `actorEveryTurn`, `actorCombatStart` | new: `actorPreInitiative` (fixes Uncanny Metabolism's "no initiative trigger" limit) |
| rest / short, long | rest / `actorShort` (any rest), `actorLong` | |
| movement / moved | move / `actorMoved` | Cloak of the Bat |
| template / enter, left, deleted | region / `enter`, `left`, `deleted` (on the region) | templates are Regions now (section 5) |
 
## 4. Helper mapping
| Our call | CAT | Status |
|---|---|---|
| `effectUtils.createEffect(actor, data, {identifier})` | `effectUtils.createEffects(actor, [data])`, identifier in `flags.cat.identifier` | **renamed**, returns an array |
| `effectUtils.createEffect(..., {concentrationItem})` | `parentEntity` option or `documentUtils.makeDependent(concEffect, [effect])` | changed |
| `effectUtils.getEffectByIdentifier` | `actorUtils.getEffectByIdentifier` / `documentUtils.getEffectByIdentifier` | moved |
| `effectUtils.addDependent` | `documentUtils.makeDependent` | renamed |
| `effectUtils.getConcentrationEffect` | same | ok |
| `genericUtils.remove` / `update` / `setFlag` | `documentUtils.deleteDocument` / `update` / `setFlag` | moved |
| `genericUtils.deleteEmbeddedDocuments` | `documentUtils.deleteEmbeddedDocuments` | moved |
| `genericUtils.sleep` | same | ok |
| `socketUtils.firstOwner(doc, true)` | `queryUtils.firstOwner(doc, true)` | moved, same signature |
| `rollUtils.remoteRoll(roll, userId)` | **none** | rework: roll on the GM, or route through the owner's dialog |
| `rollUtils.requestRoll(token, 'save', 'cha', {target, fastForward...})` | `rollUtils.requestRoll(actor, 'save', 'cha', {rollDC, fast, mode})` | signature changed (Bident shunt) |
| `combatUtils.inCombat()` | **none** | use `game.combat?.started` or `tokenUtils.getCombatData` |
| `actorUtils.hasUsedReaction` / `setReactionUsed` | same (wrap MidiQOL) | ok |
| `actorUtils.getFirstToken(actor)` | same name, returns a **TokenDocument** | behaviour change |
| `tokenUtils.getDistance(a, b)` | same name, wants **TokenDocuments** (calls `.object`) | behaviour change |
| `tokenUtils.canSee` | same (MidiQOL.canSee) | ok |
| `tokenUtils.pushToken(src, t, 5)` | `tokenUtils.slideToken(token, {sourceToken, distance: 5})` | renamed (Shield Bash) |
| `workflowUtils.preventDeath(ditem)` | `workflowUtils.preventZeroHP(ditem)` | renamed |
| `workflowUtils.replaceDamage` | **none** | rework: edit rolls in `actorDamageRoll` (Fiendish Vigor) |
| `workflowUtils.bonusDamage`, `applyWorkflowDamage`, `applyDamage`, `syntheticActivityRoll`, `syntheticItemDataRoll`, `isAttackType`, `getDamageTypes`, `negateDamageItemDamage`, `updateTargets`, `isSustainedRoll` | same | ok (`applyDamage` wants TokenDocuments) |
| `dialogUtils.confirm`, `buttonDialog`, `selectDocumentDialog`, `selectTargetDialog`, `selectHitDie` | same | ok (`selectTargetDialog` wants TokenDocuments, `coverToken` too) |
| `dialogUtils.selectDocumentsDialog` | `selectDocumentDialog(..., {max, checkbox: true})` | merged (Gift, Gravity Gloves) |
| `activityUtils.getActivityByIdentifier` | `itemUtils.getActivityByIdentifier` | moved |
| `compendiumUtils.getItemFromCompendium`, `constants.modernPacks` | `compendiumUtils.getDocumentByName` / `getSpell` | rework (Divine Intervention) |
| `templateUtils.getTokensInTemplate` | none; regions know their tokens (`region.tokens`) | rework |
| `Summons.spawn(...)` (CPR1 global) | `summonUtils.spawnSummon` / `createSummon` | rework (Sunken King ring) |
| `chrisPremades.utils.itemUtils.itemUpdate(item)` | `automationUtils.updateItem(item)` (global is `cat`, not `chrisPremades`) | rework (Akira Fire Shield; now unneeded) |
| `MidiQOL.*` (`setBonusActionUsed`, `removeActionUsed`, `addRollTo`, `canSee`, `checkIncapacitated`, `typeOrRace`, `getCachedChatMessage`) | still exported by Midi 14.6.8 | ok |
 
## 5. Platform changes that break logic
1. **Token vs TokenDocument.** CAT helpers take TokenDocuments; `workflow.token`, `workflow.targets`, `canvas.tokens.placeables` are still placeables. Convert at the boundary (`t.document`, `doc.object`). This touches most macros: anything doing `mine.document.parent`, `token.center` on `getFirstToken`, or passing placeables to `getDistance`/`selectTargetDialog`.
2. **Effect data (Foundry 14 + dnd5e 6).** Changes live in `system.changes`, each `{key, type: 'add'|'override'|'upgrade'|'custom', value, priority}` (CAT and CPR2 use `type`, never `mode`; dnd5e 6 uses `CONST.ACTIVE_EFFECT_CHANGE_TYPES`). Durations are `{value, units: 'seconds'|'rounds', expiry}`. Remaining time is `duration.secondsRemaining`. Our code writes `changes`, `mode: CONST.ACTIVE_EFFECT_MODES.*` and `duration: {seconds|rounds|turns}` everywhere.
   - Extended Spell doubles `duration.seconds`/`rounds`. That logic must be rewritten for `value/units`.
   - DAE converts the old `turnStart/turnEnd/turnStartSource/turnEndSource` special durations to native expiry on create (`sourceStart` etc.). Midi still registers `isAttacked`, `1Attack`, `isSave`... Low risk, but write the new form.
3. **`ATL.*` keys.** DAE 14.6.6 converts them to `token.*` on write (`atlMigration.js`). `ATL.light.*`, `ATL.width/height` are covered. **`ATL.texture.src` is not in DAE's list** (Soul of the Raven). Write `token.*` directly.
4. **Templates are Regions.** Midi removed `AbilityTemplate` and `Scene#templates`, and CPR2 Darkness is a region automation. CAT now does magical darkness attack checks itself (`regionVisibility`), reading `system.attributes.senses.ranges.devilsSight` (`CONFIG.DND5E.senses.devilsSight` is registered by CAT). Affects Darkness & Devil's Sight, Daylight/Dawn, Earth Shatter, and Bottled Thunderstorm (probably).
5. **Midi chat cards.** Since 14.6.0: no `flags.dnd5e` on Midi messages, usage cards are a sub-type with no content splicing, targets live in `system.targets`. Stasis v2 reads card flags and text, and Counterspell's refund reads `card.system.deltas`/`flags.dnd5e.use.consumed`.
6. **Topple has no source.** CAT's Topple calls `rollUtils.requestRoll(actor, 'save', 'con', {rollDC})`. There is no item, no activity and no card text. Stasis needs a new signal, for example a `targetRollFinished` macro on the staff that marks "a Topple weapon just hit me" (CAT runs Topple *after* the `rollFinished` event), then `actorSituational` checks the mark on a Con save.
7. **CPR1 internals we read are gone:** `flags.chris-premades.info.identifier` (now `flags.cat.automation` / `flags.cat.identifier`), `...summons.ids`, `...config.folder/name` (familiars), `...activityIdentifiers` / `hiddenActivities` (CAT has `itemUtils.unhideActivities/rehideActivities`), `workflow['chris-premades'].cunningStrike`, CPR1 Eldritch Blast's beam flag and `multiWorkflowAttack` option, and the Bardic Inspiration effect flag (CPR2 stores the formula string at `flags.chris-premades.bardicInspiration`, and 2024 BI is a `D20Bonus` in CAT's combined optional-bonus dialog).
## 6. Per-automation verdicts (registry order)
**Easy** = renames only (sections 2 to 4). **Medium** = renames plus one or two section-5 changes. **Rework** = the logic depends on something removed. **Retire** = CPR2/CAT does it; keep the v13 copy only.
 
### World installers
| Automation | Verdict | What changes |
|---|---|---|
| Counterspell (both campaigns) | Medium | `roll/scenePreambleComplete`. Cancel by `return true`; on "slot lost" set `keepConsumption`, on tie let CAT refund (replaces the card-deltas refund). Replace `remoteRoll`, `inCombat`; `getDistance` with documents. Subtle check (`workflow.nixSubtle`) still works because both run in one sorted event. |
| Eldritch Blast beam windows | Rework | Built on CPR1 EB's beam activity flag, its `multiWorkflowAttack` option and its stand-down. **CPR2 2.1.6 has no Eldritch Blast automation** (only an animation entry), so our macro has to split the beams itself: no beam activity to find and nothing to stand down. The dice-fulfillment part is core and should survive. Agonizing Blast, Bident and Spell Sniper hook into it. |
| Darkness & Devil's Sight | Rework | Devil's Sight becomes one effect change (`system.attributes.senses.ranges.devilsSight` upgrade 120). Blinded-inside becomes `region/enter`/`left` on CPR2's Darkness region. Decide whether CAT's own darkness attack checks already cover what we wanted. |
| Daylight / Dawn dispel | Rework | Find Darkness **regions** (`regionUtils.isMagicalDarkness`, `regionUtils.getActivity(region)` for the level) instead of `scene.templates`. |
| Lucky (2024) | Medium | `roll/targetAttackRollConfig`. `workflow.tracker` still exists in Midi 14. Effect: new change/duration format. Option: rebuild as a `D20Bonus` (CAT optional bonus) like CPR2's Bardic Inspiration. |
| Life Bond (Find Steed) | **Retire** | CPR2 2024 Find Steed has `find-steed-life-bond` (`targetDamageComplete`, range setting). Already on Akira v14. |
| War Caster | Easy | Gambit flag only, no CPR. Gambit 3.0.5 still uses the same `gpsUuid`. |
| Hold Person / Monster saves | Medium | `roll/itemRollFinished`; OverTime value edit reads/writes `system.changes`. |
| Diagnose opportunity attacks | Easy | Read-only. Check the setting names against Gambit 3 / Midi 14. |
 
### The Fool's Journey
| Automation | Verdict | What changes |
|---|---|---|
| Bangiras: Metamagic fix-up | Easy | No engine; also look at `flags.cat.automation` when warning about CPR automations. |
| Bangiras: Magicians Judge setup | Medium | Effect format (Arcane Glyphs, Sand Shroud `{value:1, units:'rounds', expiry:'turnStart'}`); Stasis and Judgement move to `save`/`skill` `actorSituational`. |
| Bangiras fixes: Stasis v2 | **Rework** | Section 5.6. Non-Topple sources use `getSaveSource(config)`. |
| Bangiras fixes: Sand Shroud animation | Easy | `effect/created`, `deleted` (or CAT's `createAnimation` on the effect). |
| Bangiras fixes: Quickened, Heightened, Twinned | Medium | Primed effect `actorPreambleComplete`/`actorRollFinished`; Heightened target effect `save/actorSituational` using `getSaveSource`, `save/actorPost`, `combat/actorTurnEnd`; Twinned placeable/document conversions. |
| Bangiras fixes: Sorcery Incarnate | Medium | `actorRollFinished`; renames. |
| Bangiras fixes: Sorcerous Restoration | Easy | `rest/actorShort`; `result.type === 'long'`. |
| Bangiras fixes: Mantle of Flame + Phoenix Spark | Medium | `token.light.*`; hit-back `targetOnHit`; fire bonus `actorDamageRollBonuses`; guard `targetDamageComplete` + `preventZeroHP`. |
| Bangiras: Seeking Spell | Easy | `roll/actorAttackRoll`; `setAttackRoll` unchanged. |
| Bangiras: Ring Shift Spell | Medium | `actorPreItemRoll`; reads `workflow.nixCounterspelled`, so port it with Counterspell. |
| Bangiras: Ring Spell Surge | Medium | Activity flags `activityRollFinished`; Paralyzed effect format. |
| Bangiras: Shadowfell Shard | Medium | `actorRollFinished`; curse effect carries check/save/skill macros (scope names); `DialogApp` not in scope. |
| Nethtari fixes | Rework (parts) | Agonizing to `actorDamageRollBonuses` (or CPR2's own `agonizingBlast`); Bident die Easy; Bident shunt `requestRoll` signature + `combat/actorTurnStart`; Gift `sceneDamageComplete` + `preventZeroHP` + dialog merge; **Fiendish Vigor** needs `replaceDamage` replacement; **Sentinel Raven / Soul of the Raven** read CPR1 summon flags (rework with `summonUtils.getSummons*`) and `ATL.texture.src`. Pearl of Power Easy. |
| Bottled Thunderstorm setup | Not reviewed | Not read line by line. It builds 8 activities with animations; check for templates first. |
| Quez fixes | Medium (Earth Shatter, Javelin: Rework) | Vitality: check CPR2 `vitalityOfTheTree` first (likely retire). Rage detection must read CPR2 identifiers. GWM `actorDamageRollBonuses`. Sentinel `nearbyRollFinished`. Earth Shatter uses a template (region now). Javelin's hidden helper activity uses CPR1 `hiddenActivities`. Gloves: dialog merge. |
| Quez: Demonic Gamble | Medium | `activity` flags `activityPreItemRoll`; `return true` now also refunds (good); `DialogApp` not in scope; effect format. |
| Quez: Blood Price | Easy | `save/actorBonus`; read `roll, actor, saveId` directly. |
| Quez: Blood Restoration | Easy | `actorRollFinished`; `workflow.damageList` still there. |
| Westly fixes | Rework (Cunning Strike) | Radiant/Silent Strike read CPR1's `workflow['chris-premades'].cunningStrike`; in CPR2 Cunning Strike lives inside `sneakAttack.mjs`, so read that first. Goad/Awe/Footwork/Uncanny Medium. Cloak of the Bat: `move/actorMoved`, `combat/actorEveryTurn`, `token` is a document; its light-level code uses canvas internals, so test. Lucky as world. |
| Westly: Swashbuckler 13 / 17 | Not reviewed | Level-up script. Port when he levels. |
| Earwyn fixes | Medium | Bash `actorRollFinished` + `slideToken`; Interpose `targetDamage`; Rebuke `targetDamageComplete`; Adamantine `targetAttackRoll` (not Complete); Conductor Easy; Winter's Bane effect format; hidden Shield Bash activity uses CPR1 flags. |
| Earwyn: Ring of the Sunken King | **Rework** | CPR1 `Summons.spawn`. Use CAT's summon generic (`summonUtils`). The grapple uses `remoteRoll`. |
| Vina fixes | Medium | Potent Spellcasting writes damage parts: engine-free (check CPR2 doesn't add it twice). Sweet Treats `rest/actorLong`. Divine Intervention: compendium lookup and `DialogApp` (check CPR2's `divineIntervention` first). Warding Flare: CPR2 has `wardingFlare`/`improvedWardingFlare`; ours only removes target confirmation. |
 
### Journey to the East
From the README and a partial read; every installer except Akira's still needs a full read at port time.
| Automation | Verdict | What changes |
|---|---|---|
| Nox fixes | Medium | Uncanny Metabolism to `combat/actorPreInitiative` (fixes the known limit). Deflect Attacks: CPR2 has `deflectAttacks`. Self-Restoration `combat/actorTurnEnd`. Scarf `save/actorSituational`. Sentinel as Quez. |
| Akira: Fire Shield | **Retire** | Already on CPR2 in the v14 actor. |
| Akira: Fount of Sunlight | Medium | Activity flags; `token.light.*`; effect format; concentration dependency via `makeDependent`; reaction to `targetDamageComplete` (or `targetOnHit`); `remoteRoll` gone. |
| Akira: Combat Inspiration | Rework | CPR2 BI flag is now a formula string, and 2024 BI is an optional bonus. Hook CPR2's `createdBardicInspiration` called event, or put our macro on the BI item's effect (CPR2 copies that effect to the target). AC at `targetAttackRollBonuses`. |
| Akira: Font of Inspiration | **Retire** | CPR2 2024 `fontOfInspiration` picks the slot (`dialogUtils.selectSpellSlots`). Already applied on v14. |
| Akira: Extended + Subtle Spell | Medium | Primed effects; Extended's duration doubling rewritten for `value/units`; Subtle stays the Counterspell flag. |
| Akira: Spellfire Adept | Medium | `actorDamageRollBonuses`; `selectHitDie` exists; re-create the Searing Spellfire effect (gone on v14). |
| Cordelia fixes | Rework | 2024 Fog Cloud / Gust of Wind: CPR2 has both (likely retire). Portent "Change Fate" reaction stack across attacks and saves: rebuild on CAT optional bonuses or the new passes. Familiar Kai: CPR1 config flags gone. |
| Tsuki fixes | Rework | Cosmic Omen Weal/Woe (same stack as Portent); Wild Shape: CPR2 has `wildShape`; Luna familiar as Kai. |
| Peri fixes | Medium | Wild Surge: CPR2 only has the 2014 (legacy) `wildSurge`; GWM as Quez; Mage Slayer `save/actorSituational`. |
 
### Espalian Escapades
From the README only; full read at port time. Which Foundry version this world runs isn't covered here; it isn't in the v14 plan yet.
| Automation | Verdict | Likely change |
|---|---|---|
| Silkie | Medium | Agile Strikes after Bardic Inspiration: CPR2 called event `createdBardicInspiration`. Unarmored Defense / item setup engine-free. |
| Silent Silk | Medium | Psi-Bolstered Knack: `check`/`skill` `actorBonus` with the DC from `roll.options.target`. |
| Hellsing | Medium | Crimson Rite effect format; Hybrid Transformation `combat/actorTurnStart`, token art keys. |
| Lyric | Easy to Medium | Starry Form / Absorb Elements already on CPR; Trance `rest/actorLong`. |
 
## 7. Akira v14 as exported
- Foundry 14.369 / dnd5e 6.0.6. **No Nix macros on any item** (no `flags.chris-premades.embeddedMacros`, no `flags.cat.embeddedMacros`). Spellfire Adept has no Searing Spellfire effect. Fount of Sunlight has the D&D Beyond Importer effects. Many items show `flags.cat.automation.source = 'ddb-importer'`, so the sheet was re-imported.
- **Re-applied with CPR2 (Medkit):** Lay On Hands, Font of Inspiration, Countercharm, Unarmed Strike, Aid, Booming Blade, Divine Smite, Fire Shield, Mage Hand, Spirit Guardians, Vortex Warp, Bardic Inspiration, Find Steed (with Life Bond), Steel Wind Strike, Knowledge from a Past Life, Heroism, Protection from Evil and Good, Searing Smite, Shield of Faith.
- **Still carrying a CPR1 identifier, so doing nothing on v14:** Jack of All Trades, Combat Inspiration, both Extended Spell, Subtle Spell, Sorcery Points, Thunderous Smite, Bless, Command (+5 effects), Compelled Duel, Wrathful Smite. CPR2's own code has no Jack of All Trades, Combat Inspiration, Sorcery Points or Thunderous/Wrathful Smite macro, and Bless only has an animation entry. Command (2024) and Compelled Duel do have CPR2 automations. The Medkit still lists Bless and the Smites as available, so another registered source (Gambit's, DDB Importer or a CAT generic) offers them.
- **Duplicates:** two Combat Inspiration items and two "Metamagic: Extended Spell" items.
## 8. The `cat` engine in the runner
Minimum change, same model as today:
- `installEmbedded`: write `{name, event, pass, macros: [{macro, priority}]}` to `item.flags.cat.embeddedMacros`, or to `activity.update({'flags.cat.embeddedMacros': list})` for activity targets. Map each registry `target.type/pass` with the table in section 3.
- Character installers have their own `setMacros` helpers writing `flags.chris-premades`. Each v14 copy gets a `cat` version of those helpers, and its embedded scripts get the section 2/4 renames.
- `compat.mjs`: add a v14 `TESTED` table (versions at the top), and turn `detectEngine` `cat` into `ok: true` only once the v14 files exist.
Option worth weighing: CAT exposes `cat.api.registerFnMacro({source: 'nix-module', identifier, rules, roll: [{pass, macro, priority}], ...})` (that's how CPR2 registers everything). Items then carry only a reference (`flags.cat.macros.roll = [{source, identifier, rules}]`), and the code lives in the module. Updating the module updates every item, and re-applying an automation doesn't wipe a pasted script. It's a bigger change than the runner tweak above, so it's for a later decision rather than the pilot.
 
## 8b. What the v14 migration did (exports before the Medkit, 2026-11-03)
Bangiras, Akira, Quez and Nox, migrated from the post-fixes v13 worlds, exported before any Medkit re-apply.
- **Every embedded macro survived byte-for-byte**: Bangiras 18/18 and Akira 7/7 identical to their v13 exports; Quez and Nox carry all of theirs. They sit in `flags.chris-premades`, which CAT never reads, so they are inert but readable. The `cat` engine can find every old macro on the world in place (and a Health check can list them).
- Old CPR1 identifiers (`flags.chris-premades.info`) are still there too.
- **Core migrated stored effects**: all item effects now use `system.changes` with string `type` (`add`/`override`/`upgrade`/`custom`), and durations are `{value, units, expiry}`.
- **`ATL.*` keys were not converted** in stored item effects (Bangiras: Mantle of Flame, Goggles of Night, True Seeing; Akira: Lamp, Fount of Sunlight). DAE no longer applies `ATL.*`, so those lights and senses are off until **DAE settings > DAE Migration** is run once (DAE's auto-migration defaults to off). New writes are converted on the fly.
- DAE `specialDuration` entries stay on the stored item effects; DAE converts them when the effect is applied.
- Still to learn: whether the Medkit re-apply clears `flags.chris-premades`. Next exports: the same four actors after the Medkit.
## 8c. After the Medkit (exports 2026-11-03, *PostCPR)
- **Applying a Medkit automation wipes `flags.chris-premades` on that item** (confirmed: Quez Vitality of the Tree and Eldritch Blast, Akira Bardic Inspiration and Find Steed, Nox Darkness lost their Nix macros). Skipped items kept theirs byte-for-byte. So the v14 engine must convert old macros **before** anyone re-applies an item, or reinstall from its own files.
- Items left for the v14 installers (still old CPR1 tags, macros intact): Bangiras Mantle of Flame / Innate Sorcery, Counterspell, all Metamagic, Magicians Judge, rings, Phoenix Spark, Sorcerous Restoration, Hold Monster; Quez Demons Rage, Sentinel, Hold Person, Javelin of Lightning, Great Weapon Master, Chieftain's Fury, Gravity Gloves; Akira Spellfire, Fount of Sunlight, Extended/Subtle, Combat Inspiration (both copies), Sorcery Points; Nox Uncanny Metabolism, Self-Restoration, Sentinel, Giant-Eel Scarf.
- Retired by CPR2 now on the sheets: Life Bond, Font of Inspiration, Vitality of the Tree (CPR2 Rage applied), Fire Shield.
- Nox Unarmed Strike reset to `1 + @mod` bludgeoning. CPR2's Martial Arts has no macro in its source, so check at the table whether a roll uses Dex + Martial Arts die + Force (Empowered Strikes sets Force at `actorDamageRoll`). CPR2 Deflect Attacks spends the reaction, so our once-per-turn fix isn't needed.
- Still `ATL.*` (run **DAE Migration**): Bangiras Mantle of Flame, True Seeing; Akira Fount of Sunlight; Quez Belt of Dwarvenkind, Darkvision, Devil's Sight. Goggles of Night and Lamp were fixed by their automations.
- Duplicates to delete: Bangiras Hex, Misty Step, Dagger; Quez Find Familiar, Handaxe; Akira Scimitar (+ the doubled Combat Inspiration / Extended Spell); Nox Dagger.
- Next step: Bangiras pilot. Write the v14 `cat` engine in `runner.mjs` and his v14 installer, built on the PostCPR export.
## 9. Check in the v14 world before porting
- Console: `CONST.ACTIVE_EFFECT_MODES` and `CONST.ACTIVE_EFFECT_CHANGE_TYPES`. If the first is undefined, every installer line using it throws.
- Create one effect with `duration: {seconds: 60}` and one with `changes: [...]` (old shape) from the console, and see whether core migrates them or rejects them.
- CAT setting `displayDebugEventData`: turn on, run one attack, and the console prints a sample trigger scope.
 