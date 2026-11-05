# v14 port: Journey to the East characters
 
2026-11-04. Nix Fix 1.4.0. Built on the PostCPR exports (Foundry 14.369, dnd5e 6.0.6, Chris's Premades 2.1.6, CAT 0.1.6).
**Status: written and checked offline, not tested at the table yet.** Same model as The Fool's Journey port.
With this batch every Journey to the East automation has a v14 copy or is retired. Only Espalian Escapades stays v13.
 
## What's ported
| Character | v14 file | Macros | Notes |
|---|---|---|---|
| Nox | `nox/v14/install-nox-fixes.js` | 6 | Uncanny Metabolism `combat/actorPreInitiative` (asks when he rolls initiative, not after; the v13 limit is gone); its heal activity restores Focus by its own consumption. Self-Restoration `combat/actorTurnEnd`. Scarf `save/actorSituational` (source from `getSaveSource`) + `skill`/`check` `actorSituational`. Sentinel as Quez's (`nearbyRollFinished`, 5 ft, enemies; Unarmed Strike counts as a weapon). |
| Akira | `akira/v14/install-akira-fixes.js` | 6 (+3 made at cast) | Fount of Sunlight `activityRollFinished` on Cast Spell; the radiance effect carries `targetDamageComplete` (reaction) and `effect/created`/`deleted` (glow), uses `token.light.*`, depends on concentration (`makeDependent`). Combat Inspiration on Chris's Premades 2's Bardic Inspiration effect: Defense `targetAttackRollBonuses`, Offense `actorDamageRollBonuses`. Extended / Subtle `itemRollFinished` with primed effects (`actorRollFinished` / `actorPreambleComplete` 5); Extended doubles `duration.value` per unit (cap 24 h). Spellfire `actorDamageRollBonuses` 300; Searing Spellfire only rebuilt if missing. |
| Cordelia | `cordelia/v14/install-cordelia-fixes.js` | 7 | **Rework:** Portent on the new fate stack (below). Long rest `rest/actorLong`; Foretell activity `activityRollFinished`; stored rolls carry over from v13. Expert Divination `actorRollFinished`. Kai: folder move + Chris's Premades 2's Find Familiar. |
| Tsuki | `tsuki/v14/install-tsuki-fixes.js` | 6 | **Rework:** Cosmic Omen on the fate stack; it rolls its own 1d6 and spends a use (no Chris's Premades 1 Weal/Woe activities). Today's omen from the long-rest pop-up or the feature's own Cosmic Omen activity. Potent Spellcasting written into Druid cantrip damage (Vina's v14 method). Luna as Kai. |
| Peri | `peri/v14/install-peri-fixes.js` | 7 | Rage → Wild Surge `itemPreItemRoll` 10 + `itemRollFinished` 400, skips if a Wild Surge roll already showed up for that rage. Surge animations `itemRollFinished` 60 (finds the d8 in the workflow or his recent chat); Configure Surge Animations is a DialogV2 form (no `DialogApp`); loops end through an `effect/deleted` macro on the surge or rage effect. GWM as Quez's. Mage Slayer `save/actorBonus` (returns the save + the difference, like Blood Price). Fairy Magic data only. |
 
### The fate stack (Portent + Cosmic Omen), rebuilt
- Entries on each helper's feature: `roll/actorAttackRoll` + `roll/sceneAttackRoll` at **900** (after Chris's Premades 2's own re-rolls at 800), and `save/actorBonus` + `save/sceneBonus` at **300**. One run per attack (`workflow.nixFateDone`) and per save (`roll.options.nixFate`), whichever entry fires first.
- Order inside a run: every Weal/Woe helper on the scene first, then Portent. A pop-up appears only if that option could flip the result.
- Helpers gone from CAT are replaced inside the engine: the d20 swap rebuilds the roll from its JSON; Weal/Woe adds with `MidiQOL.addRollTo`; dice are plain `Roll`s.
- The v13 `midi-qol.preCheckHits` hook is gone: attacks change with `workflow.setAttackRoll` at the 900 pass.

## Retired on v14 (Chris's Premades 2 does it)
| What | Why |
|---|---|
| Nox: Unarmed Strike (Dex, Martial Arts die, Force) | Chris's Premades 2's Martial Arts (CAT alternate attributes: Dex + Martial Arts die) and Empowered Strikes (Force). Applied on his sheet. |
| Nox: Deflect Attacks once per turn | Chris's Premades 2's Deflect Attacks spends the reaction. |
| Nox / Akira: extra-copy cleanup | The v14 installers don't delete items; duplicates are listed instead. |
| Akira: Fire Shield | Chris's Premades 2's Fire Shield (applied). |
| Akira: Font of Inspiration slot picker | Chris's Premades 2's 2024 Font of Inspiration (applied; it is a Bardic Inspiration activity). |
| Akira: Panini's Life Bond | World entry retired: Chris's Premades 2's Find Steed (applied). |
| Cordelia: Legacy → 2024 Fog Cloud / Gust of Wind / Water Walk | Already swapped; the 2024 Fog Cloud and Gust of Wind are Chris's Premades 2. |
| Tsuki: Wild Shape uses | Chris's Premades 2's Wild Shape "Change Form" spends the feature's uses. |
| Cordelia / Tsuki: `config.folder` / `config.name` on Find Familiar | Chris's Premades 1 only. The familiars are moved into their folders; pick them when Chris's Premades 2's Find Familiar asks. |
 
## Checked offline
- Every file parses; every CAT macro compiles with CAT's scope names and is wrapped; no v13-only helper left.
- Each installer ran twice against its PostCPR export: macro counts stable (6 / 6 / 7 / 6 / 7), our v13 copies removed (old CPR1 macros left only on Counterspell and Daylight, which the world installers replace).
- The macros built at install and attached at runtime (Akira's Fount reaction and glow) compile too.
- All five JTE registry entries load and point at existing files.

## Found on the sheets
- **Peri:** Rage and Wild Surge are still **Chris's Premades 1** (nothing reads them on v14, so no rage bonus and no d8 table). Apply Chris's Premades 2's Rage and its legacy (2014) Wild Surge in the Medkit **first**, then run Peri fixes (the Medkit rebuilds those items). Also CPR1-tagged: Flight, Unstable Backlash. Druidcraft (Legacy). Duplicate Handaxe. Mage Slayer carries a Gambit's Premades effect (concentration part): left alone.
- **Tsuki:** Cosmic Omen is still CPR1-tagged: **don't apply** a Medkit automation to it (it would wipe ours). Three Find Familiar items (two CPR2, one old CPR1 one naming Luna: delete it). Twelve doubled spells (mostly innate + prepared; check). Five Legacy spells (Charm Monster, Ice Knife, Summon Beast / Elemental / Fey). CPR1-tagged: Fey Ancestry, Starry Form, Twinkling Constellations. Stale CPR1 Find Familiar effects on the actor.
- **Cordelia:** Portent carries a Gambit's Premades tag; if Gambit's own Portent prompt also shows, turn it off. No Portent rolls stored on the export: click Foretell once. Doubled Fog Cloud / Gust of Wind / Water Walk are innate + prepared (fine). Duplicate Dagger. Thaumaturge CPR1-tagged. Stale CPR1 Find Familiar effects. No actor named **Kai** was in the export's world (expected offline).
- **Akira:** Fount of Sunlight's D&D Beyond effect "Wreathed in Moonlight" still uses `ATL.light.*` (run **DAE Migration**, or rely on our light). Searing Spellfire is back on the sheet (the mapping said it was gone). Jack of All Trades CPR1-tagged. Duplicate Scimitar.
- **Nox:** Uncanny Metabolism and Self-Restoration are CPR1-tagged and carry our macros: **don't apply** Medkit automations to them. Spider Climb CPR1-tagged. Five Dagger items. A CPR1 "Grappling Wyvern" effect on him.

## Before testing (v14 copy, as GM)
1. World installers first (V14-PORT-WORLD.md): Counterspell (Cordelia; Akira's Subtle), Darkness & Devil's Sight (Nox), Daylight / Dawn (Tsuki).
2. In the Medkit: **Peri's Rage and Wild Surge (legacy)**. Check Bardic Inspiration (Akira), Find Familiar (Cordelia, Tsuki), Martial Arts / Unarmed Strike / Empowered Strikes / Deflect Attacks (Nox), Wild Shape (Tsuki) are CPR2. **Don't** apply anything to: Tsuki's Cosmic Omen and Elemental Fury, Nox's Uncanny Metabolism / Self-Restoration, Akira's Metamagic / Spellfire / Fount, Cordelia's Portent.
3. Delete the leftovers the whispers list (old CPR1 effects, old Find Familiar copy, duplicates).
4. Nix Fix > Apply in order: Nox, Akira, Cordelia, Tsuki, Peri. Then Cordelia: Portent > Foretell; Tsuki: use Cosmic Omen once.
5. Put actors named **Kai** and **Luna** in the world (the installers move them to "Familiars: Cordelia" / "Familiars: Tsuki"). CAT `displayDebugEventData` on for the first tests.

## Table test checklist
Things the sources couldn't settle are marked **(confirm)**.
 
### Nox
- [ ] **Unarmed Strike** (CPR2): Dex to hit, Martial Arts die (d10 at Monk 11) + Dex, Force. **(confirm the Martial Arts alternate attributes change the strike's ability and die, and Empowered Strikes sets Force)**
- [ ] **Deflect Attacks** (CPR2) spends his reaction.
- [ ] **Uncanny Metabolism**: start combat missing Focus: pop-up when he rolls initiative; yes heals and refills Focus; the feature's use is spent. **(confirm `combat/actorPreInitiative` fires on the item and a dialog there doesn't hold up the roll for the others)**
- [ ] **Self-Restoration**: Frightened at the end of his turn: pop-up; pick ends it.
- [ ] **Giant-Eel Scarf**: a monster's grapple save gets advantage; Hold Person's doesn't; escape checks get advantage against a monster's grapple. **(confirm `workflowUtils.getSaveSource(config).item` is the monster's item)**
- [ ] **Sentinel**: an enemy within 5 ft hits an ally: reaction prompt; a hit sets its speed to 0 for the turn.

### Akira
- [ ] **Fire Shield / Font of Inspiration / Find Steed** (CPR2) work as before (Font picks the slot).
- [ ] **Fount of Sunlight**: cast: radiance effect (resist radiant, light 20/40, glow); dropping concentration ends it and the glow. Hurt by a creature within 60 ft she can see: reaction prompt → its Con save or Blinded. **(confirm `token.light.*` lights her token, and `targetDamageComplete` on an actor effect fires for damage she takes)**
- [ ] **Combat Inspiration: Defense**: give an ally Bardic Inspiration; an attack that would hit them by less than the die: AC prompt; the die is used up. A miss or a hopeless hit: no prompt. **(confirm Chris's Premades 2 copies our `flags.cat.embeddedMacros` with the effect onto the ally, and that `flags.chris-premades.bardicInspiration` holds the formula. If no prompt appears, open the ally's Bardic Inspiration effect and check its flags.)**
- [ ] **Combat Inspiration: Offense**: the ally hits: "add your Bardic Inspiration to the damage?"; yes adds it and uses the die. Check CPR2's own Bardic Inspiration prompt still comes on the attack roll.
- [ ] **Extended Spell**: pick a 1-minute spell: it casts; its effects and concentration show 2 minutes; concentration saves have advantage. Cancel refunds the point.
- [ ] **Subtle Spell**: cast subtly near an enemy with Counterspell: no counter offered.
- [ ] **Spellfire Adept**: radiant damage: "Set your heart ablaze?"; spent Hit Dice add radiant damage; asks once per turn (again on a natural 20); a radiant-resistant target takes full damage.

### Cordelia
- [ ] **Foretell**: two d20s (gm roll); a "Portent: x, y" effect on her.
- [ ] **Long rest** re-rolls them.
- [ ] **Change Fate on attacks**: an ally misses where a foretold roll above 10 would hit: buttons; pick swaps the d20 and the attack hits. An enemy hits where a low roll would miss: buttons. **(confirm `sceneAttackRoll` exists and `workflow.setAttackRoll` at 900 changes the hit)**
- [ ] **Change Fate on saves**: an ally fails a save where a high roll passes: buttons; the save passes. **(confirm `save/sceneBonus` exists and that `config.subject` is the creature saving; if Portent offers on her own saves only, the scene pass name is wrong)**
- [ ] **Expert Divination**: cast a 2nd-level Divination with a slot: regain a 1st-level slot (asked if more than one choice).
- [ ] **Kai**: cast Find Familiar (CPR2): Kai can be chosen.

### Tsuki
- [ ] **Cosmic Omen roll**: the activity or the long-rest pop-up sets Weal (even) or Woe (odd); chat says which. **(confirm the activity's d20 is in `workflow.utilityRolls`; if two d20s appear, that's our fallback roll)**
- [ ] **Weal**: an ally within 30 ft fails by 6 or less: prompt; +1d6, use and reaction spent. **Woe**: an enemy succeeds by 5 or less: prompt; -1d6.
- [ ] **Stack order**: Weal/Woe first, then Cordelia's Portent if it still matters, both after Bardic Inspiration.
- [ ] **Wild Shape** (CPR2): Change Form spends a use.
- [ ] **Potent Spellcasting**: Starry Wisp / Thorn Whip show + Wis on the sheet and in the roll (once).
- [ ] **Luna**: Find Familiar or Wild Companion can summon her.

### Peri
- [ ] **Rage** (CPR2, after applying it): new rage → Wild Surge d8 once (not twice if Chris's Premades 2 also rolls it). Continue Raging: no surge.
- [ ] **Wild Surge animations**: each result plays its animation; looping ones end when the surge or rage ends. **(confirm the d8 is found: in the workflow, or in a chat message from Peri in the last 20 s)**
- [ ] **Configure Surge Animations**: the form shows your v13 choices; Save stores them; Preview plays all 8.
- [ ] **GWM**: Heavy weapon hit on his turn: +PB. Melee crit or kill: Hew prompt (Bonus Action).
- [ ] **Mage Slayer**: fail a Wis save: "Fuck it, I succeed anyways"; yes makes it pass and spends the use; a Dex save: no prompt.
- [ ] **Fairy Magic**: Faerie Fire's save DC uses Wisdom.

If one fails, turn on CAT's `displayDebugEventData`, repeat it, and note the event / pass and what the console prints. Most likely fixes are a pass name or a TokenDocument / placeable swap.
 