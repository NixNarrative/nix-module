# v14 port: The Fool's Journey characters
 
2026-11-03. Nix Fix 1.3.0. Built on the PostCPR exports (Foundry 14.369, dnd5e 6.0.6, Chris's Premades 2.1.6, CAT 0.1.6).
**Status: written and checked offline, not tested at the table yet.** Same model as the Bangiras pilot and the world installers.
With this batch every Fool's Journey automation has a v14 copy or is retired.
 
## What's ported
| Character | v14 file | Macros | Notes |
|---|---|---|---|
| Nethtari | `nethtari/v14/install-nethtari-fixes.js` | 12 | Agonizing Blast `actorDamageRollBonuses`; Bident die `itemPreItemRoll`, shunt `itemRollFinished` (one per beam); Fiendish Vigor `actorDamageRoll` (replaces the gone `replaceDamage`) + 12 temp HP activity; Gift `sceneDamageComplete` + `targetDamageComplete` (asks once); Sentinel Raven with Chris's Premades 2's Find Familiar; Soul of the Raven sets her token's art and size directly; Pearl of Power. |
| Nethtari | `nethtari/v14/bottled-thunderstorm-setup.js` | 4 | Rebuilds 9 activities (adds Calm the Storm). Effects in v14 format; push uses `tokenUtils.slideToken`. The line and cube are the activities' own areas (Regions on v14). |
| Quez | `quez/v14/install-quez-fixes.js` | 14 | Vitality only for Demons Rage (Chris's Premades 2 does it for Rage); GWM `actorDamageRollBonuses` + Hew; Sentinel `nearbyRollFinished` (5 ft, enemies); Earth Shatter / Fire Strike / Javelin / Gloves as activity macros. Hold Person: old macro removed. |
| Quez | `quez/v14/demonic-gamble-embedded.js` | 1 | `activityPreItemRoll` on the Demonic Gamble activity. DialogApp replaced by the Hit Dice picker + damage-type buttons. |
| Quez | `quez/v14/blood-price-embedded.js` | 1 | `save / actorBonus` on Demons Rage. |
| Quez | `quez/v14/blood-restoration-embedded.js` | 1 | `actorRollFinished` on Demons Rage (replaces the old "Demonic Restoration" macro by its marker). |
| Westly | `westly/v14/install-westly-fixes.js` | 10 | Radiant / Silent Strike (re-created if the Medkit removes them), Goad, Awe, Fancy Footwork, Cloak of the Bat (`move/actorMoved`, `combat/actorEveryTurn`). |
| Westly | `westly/v14/install-swashbuckler-13-17.js` | 5 at level 17 | Manual, when he levels. |
| Earwyn | `earwyn/v14/install-earwyn-fixes.js` | 7 | Shield Bash `actorRollFinished` + `slideToken`; Interpose `targetDamage`; Hellish Rebuke `targetDamageComplete`; Adamantine `targetAttackRoll`; Lightning Conductor; Winter's Bane Bitter Frost. |
| Earwyn | `earwyn/v14/install-sunken-king-ring.js` | 4 | **Rework:** Summon Tentacle is now a dnd5e **Summon activity** (profile = the Spectral Tentacle actor) with CAT's summon generic attached. AC/HP/attack/damage come from the activity's bonuses and "match attacks". Grapple rolls both sides locally; Restrained ends itself when the tentacle is gone; new **Release** activity. |
| Vina | `vina/v14/install-vina-fixes.js` | 5 | Potent Spellcasting (data only); Sweet Treats `rest/actorLong` + Give a Treat; Divine Intervention with button menus. |
 
## Retired on v14 (Chris's Premades 2 does it)
| What | Why |
|---|---|
| Quez: Vitality of the Tree for his **Rage** | Chris's Premades 2's Vitality of the Tree + Rage (applied on his sheet). Ours stays only for Demons Rage. |
| Westly: Uncanny Dodge reaction marker | Chris's Premades 2's Uncanny Dodge spends the reaction. |
| Westly: Lucky | World Lucky installer. |
| Vina: Improved Warding Flare temp HP | Chris's Premades 2's 2024 Warding Flare / Improved Warding Flare (applied). |
| Quez / Vina: Hold Person live DC | World entry retired: apply Chris's Premades 2's Hold Person. |
 
## Checked offline
- Every file parses; every CAT macro compiles with CAT's scope names and is wrapped; no v13-only helper left.
- Each installer ran twice against its PostCPR export: macro counts stable (no stacking), v13 copies of our macros removed.
- The three Quez embedded files: the registry targets match Demons Rage and its Demonic Gamble activity, and each v14 file carries its v13 marker, so the runner replaces the old copy.
- Checker changes (`dev/v14-offline-check.mjs`): world actors made by an installer (the Spectral Tentacle) join the mock and get checked; activities have `toObject`; old activity macros are listed; `Summons.` is flagged as v13-only.

## Found on the sheets
- **Quez's Demons Rage is still Chris's Premades 1's Rage** (`info.identifier: rage`). Nothing reads that on v14, so starting Demons Rage no longer adds the rage damage bonus; it only applies its own effects (resistances, Str advantage). **Decide:** rage with his CPR2 **Rage** feature and use Demons Rage for its options, or add the rage damage to Demons Rage's effect by hand. Don't apply CPR2's Rage onto Demons Rage (the Medkit would rebuild its activities and drop Demonic Gamble).
- **Quez:** an old "Great Weapon Master" toggle effect is active on the actor (double bonus with ours); a v13 Rage effect is still on him. Duplicates: Handaxe, Find Familiar.
- **Westly:** Cunning Strike still carries the CPR1 tag while Sneak Attack is CPR2. "Auto Sneak Attack 10.0.10" (Midi sample item) is on his sheet: may double Sneak Attack.
- **Nethtari:** stale v13 Find Familiar / Sentinel Raven / Gift of the Protectors effects (CPR1, inert). Pearl of Power's activity is a D&D Beyond Importer macro activity (`ddb.item.pearlOfPower`). Eyes of the Rune Keeper has a stray "Gift of the Protectors" activity. Two Darkness spells.
- **Earwyn:** an old CPR1 Aura of Hate effect; Shield Master carries a Gambit's Premades link; Hellish Rebuke is a Reaction activity (Midi may offer it too).
- **Vina:** Hold Person won't paralyze until CPR2's is applied. Still CPR1-tagged: Thaumaturge, Celestial Resistance, Healing Hands, Celestial Revelation; an old "Channel Divinity: Caster" effect.

## Before testing (v14 copy, as GM)
1. World installers first (V14-PORT-WORLD.md), especially Eldritch Blast (Nethtari), Darkness, Lucky (Westly).
2. In the Medkit: Hold Person (Quez, Vina); check Find Familiar (Nethtari), Sneak Attack (Westly) are CPR2. **Don't** apply anything to: Nethtari's Eldritch Blast, Quez's Demons Rage / Javelin of Lightning, Vina's Potent Spellcasting.
3. Delete the leftovers the whispers list (old effects, GWM toggle, duplicates).
4. Nix Fix > Apply in order: Nethtari fixes, Bottled Thunderstorm, Quez fixes, Demonic Gamble, Blood Price, Blood Restoration, Westly fixes, Earwyn fixes, Ring of the Sunken King, Vina fixes.
5. dnd5e setting **Allow Summoning** on (Earwyn's tentacle as a player). CAT `displayDebugEventData` on for the first tests.

## Table test checklist
Things the sources couldn't settle are marked **(confirm)**.
 
### Nethtari
- [ ] **Agonizing Blast**: each beam adds +Cha. **(confirm `bonusDamage` in `actorDamageRollBonuses` on the synthetic beam rolls)**
- [ ] **Bident die**: with the Bident equipped + attuned, beams roll d12; unequipped, d10.
- [ ] **Bident shunt**: natural 20 on a hitting beam: DC 10 Cha save; on a fail the token hides, comes back at the start of its turn and takes 2d12 psychic. **(confirm `rollUtils.requestRoll(actor, 'save', 'cha', {rollDC, fast})` returns a roll with `.total`)**
- [ ] **Fiendish Vigor**: the activity gives 12 temp HP. At-will False Life shows its fixed max. **(confirm `workflow.setDamageRolls` in `actorDamageRoll`)**
- [ ] **Gift of the Protectors**: Write Names picks up to Cha mod. A named ally dropping to 0 asks her once (not twice when she is the one hit); yes leaves them at 1 HP. **(confirm `selectDocumentDialog` with `checkbox` returns `[{document, amount}]` or documents)**
- [ ] **Sentinel Raven**: cast Find Familiar (CPR2): +Cha Perception while summoned; dismissing ends it. **(confirm the CPR2 summon effect is found: identifier `findFamiliar` or name "Find Familiar")**
- [ ] **Soul of the Raven**: raven within 5 ft: merge hides the raven, her token becomes the raven at half size, Tiny, raven's speeds. Return to Normal restores her token and puts the raven beside her.
- [ ] **Pearl of Power**: regains one Pact slot (not two). If two, change its activity to Utility and re-run.
- [ ] **Bottled Thunderstorm**: Lightning Bolt 3/5 place a line; Thunderwave pushes failed saves 10 ft **(confirm `slideToken(doc, {sourceToken, distance})`)**; Swift Winds +10/+20 ft for 1 minute; Unleash / Calm start and stop the storm cloud; Recharge rolls 1d8.

### Quez
- [ ] **Rage (CPR2)**: Vitality Surge temp HP from Chris's Premades 2.
- [ ] **Demons Rage**: Vitality Surge temp HP from ours; at the start of each of his turns, Life-Giving Force asks for an ally within 10 ft; temp HP fade when the rage ends.
- [ ] **Demonic Gamble**: target, click: Hit Dice picker (max PB), damage-type buttons, weapon pick; attack runs with +Nd6; crit gives temp HP; nat 1 hurts him; weapon damage restored after. **(confirm `return true` from `activityPreItemRoll` cancels without spending anything)**
- [ ] **Blood Price**: a failed save offers Hit Dice for d4..d12 added to the save. **(confirm `roll.options.target` holds the DC and a returned Roll replaces the save)**
- [ ] **Blood Restoration**: dropping an enemy with blood offers 1 Hit Die back for his reaction.
- [ ] **GWM**: Heavy weapon hit on his turn: +PB. Melee crit or kill: Hew prompt (Bonus Action).
- [ ] **Sentinel**: an enemy within 5 ft hits an ally: reaction prompt; a hit sets its speed to 0 for the turn. **(confirm `nearbyRollFinished` with `distance: 5, dispositions: 'enemy'` on the macro entry)**
- [ ] **Earth Shatter**: refused when not raging; second use asks about Exhaustion; Small/Tiny auto-fail; Prone on fail; animation centred on the area. **(confirm where Midi 14 keeps the placed area: `workflow.template` / `workflow.region`)**
- [ ] **Javelin of Lightning**: Lightning Bolt attack + the line save on others; helper activity hidden.
- [ ] **Gravity Gloves**: Bond picks weapons (Thrown 20/60), Recall chat + animation.

### Westly
- [ ] **Cunning Strike menu** appears after Sneak Attack (CPR2) and lists Radiant, Silent, Goad, Awe.
- [ ] **Radiant / Silent Strike**: conditions on a failed save. **(confirm the Sneak Attack dice turn radiant / necrotic: the macro looks for the strike's activity id in CPR2's workflow data at `actorDamageRollBonuses` 950. If it doesn't change, open the console with CAT debug and note where CPR2 keeps the chosen strikes.)**
- [ ] **Goad**: disadvantage vs others until the end of its next turn. **Awe**: pick creatures within 30 ft, Charmed on a fail.
- [ ] **Fancy Footwork**: after a melee attack, that creature gets no Opportunity Attack on him this turn (Gambit's).
- [ ] **Uncanny Dodge** (CPR2) spends his reaction.
- [ ] **Cloak of the Bat**: Grip refused in bright light; flying in dim/dark; moving into bright light drops it. **(confirm `token` in `move/actorMoved` is his TokenDocument)**

### Earwyn
- [ ] **Shield Bash**: once on her turn after a melee hit within 5 ft with a shield: prompt, Str save, push 5 ft.
- [ ] **Interpose Shield**: successful Dex save for half: prompt; yes = no damage. **(confirm `negateDamageItemDamage` in `targetDamage`)**
- [ ] **Hellish Rebuke**: damaged by a creature within 60 ft: slot buttons; fires at it. Only one prompt (Midi's own reaction prompt off or ours).
- [ ] **Adamantine Plate**: a crit against her becomes a normal hit unless the weapon is adamantine. **(confirm setting `workflow.isCritical = false` in `targetAttackRoll` sticks)**
- [ ] **Trident**: nat 20 hit: lightning vulnerability until the end of her next turn.
- [ ] **Winter's Bane**: Activation Word: +1d6 cold on melee hits for 1 minute, frost aura.
- [ ] **Ring: Summon Tentacle**: summon window, place within 20 ft; AC 10 + Cha, HP 2 × level, Slam uses her spell attack and +Cha damage **(confirm dnd5e's summon bonuses `ac`/`hp`/`attackDamage` and `match.attacks`)**; summoning again removes the old one; Grapple contest → Restrained; Release frees; Restrained ends when the tentacle is gone. **(confirm CAT's summon generic: dismiss button and turn order)**

### Vina
- [ ] **Potent Spellcasting**: Sacred Flame and Toll the Dead show + Wis on the sheet and in the roll (once).
- [ ] **Sweet Treats**: Long Rest refills to Wis mod; Give a Treat moves one to a targeted ally **(a player may need the GM for another PC's sheet)**; eating gives 2d4 + 2 temp HP and sparkles.
- [ ] **Divine Intervention**: level buttons → spell buttons (Back works) → cast with no slot; copy removed after. **(confirm `dialogUtils.buttonDialog` accepts `[label, value, {image}]` and `displayAsRows`)**
- [ ] **Warding Flare / Improved** (CPR2): imposes disadvantage; the ally gets the temp HP.
- [ ] **Hold Person** (CPR2): paralyzes; repeat save at end of turn.

If one fails, turn on CAT's `displayDebugEventData`, repeat it, and note the event / pass and what the console prints. Most likely fixes are a pass name or a TokenDocument / placeable swap.
 