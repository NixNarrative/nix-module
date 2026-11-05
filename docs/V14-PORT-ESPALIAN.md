# v14 port: Espalian Escapades characters
 
2026-11-04. Nix Fix 1.5.0. Same model as the Journey to the East port (V14-PORT-JOURNEY-EAST.md).
**Status: written and checked offline, not tested at the table yet.**
With this batch every automation in all three campaigns has a v14 copy or is retired.
 
## What's ported
| Character | v14 file | Macros | Notes |
|---|---|---|---|
| Silkie | `silkie/v14/install-silkie-fixes.js` | 2 | Agile Strikes `itemRollFinished` 80 on Bardic Inspiration (only the use that spends a die or targets someone; the strike is a synthetic Unarmed Strike with `nixAgile` so it can't loop). Robe `activityRollFinished` on "Detach a Patch". Unarmored Defense, Unarmed Strike, prepared spells, Fey Ancestry are data (v14 `system.changes`). |
| Silent Silk | `silent-silk/v14/install-silent-silk-fixes.js` | 6 | Psi-Bolstered Knack `skill/actorBonus` + `check/actorBonus` 300 (the check entry only answers tool checks), returns `MidiQOL.addRollTo`. Psionic Strike `actorDamageRollBonuses` 260. Psychic Whispers `activityRollFinished` + reset at `rest/actorLong`. Robe shared with Silkie. |
| Hellsing | `hellsing/v14/install-hellsing-fixes.js` | 5 (+6 made at use) | Crimson Rite, Bloated Agony, Transform / Revert / Configure Look on `activityRollFinished`. The effects they create carry their own CAT macros: rite `actorDamageRollBonuses` 250 + `rest/actorShort` (ends on any rest, no DAE rest duration) + `effect/deleted`; curse `actorAttackRoll` 50 on the cursed creature; hybrid form `combat/actorTurnStart` (Bloodlust) + `effect/deleted`. Configure Look is a DialogV2 form. |
| Lyric | `lyric/v14/install-lyric-fixes.js` | 4 (one per Fey Step rider) | Trance `rest/actorLong` + `activityRollFinished` (DialogV2 form). Fey Step season gate `activityPreTargeting` 10 (no `workflow` at that pass: reads `actor` / `activity`; `return true` stops it). |
 
## Retired / moved to Chris's Premades 2
| What | Why |
|---|---|
| Silkie / Lyric: `chrisPremades.utils.itemUtils.itemUpdate` calls (Bardic Inspiration, Starry Form, Wild Companion, Absorb Elements) | Chris's Premades 1 only. Apply them in the Medkit; the installers report which are still not CPR2. |
| Lyric: Wild Shape single counter | Chris's Premades 2's Wild Shape spends the feature's uses (as Tsuki). |
| Lyric: adding Wild Shape consumption to Starry Form / Wild Companion | Only done while they're not CPR2 (so it can't spend twice); on CPR2 the installer just checks. |
 
## Checked offline
- Every file parses; every CAT macro compiles under CAT's scope names and is wrapped; no v13-only helper left (`trigger.`, `socketUtils`, `DialogApp`, `ACTIVE_EFFECT_MODES`, `effectUtils.createEffect(`, `genericUtils.remove/update`).
- The macros built at use time (Hellsing's rite / curse / hybrid effect macros, 6) compile too.
- Each installer ran twice against test actors: macro counts stable (2 / 6 / 5 / 4); our v13 copies removed from `flags.chris-premades`.
- All four registry entries load and point at existing files.
- **To do when the exports arrive:** run each installer against Nix's v14 exports (`node nix-module/dev/v14-offline-check.mjs <installer> <export.json> --select <name>`), then fill in "Found on the sheets".
 
## Found on the sheets
_(after the v14 exports are checked)_
 
## Before testing (v14 copy, as GM)
1. In the Medkit: Silkie's **Bardic Inspiration**; Lyric's **Wild Shape**, **Starry Form**, **Wild Companion**, **Absorb Elements**. **Don't** apply anything to: Silent Silk's Psionic Power (ours does Knack / Whispers / Strike; if CPR2 has one, set it to None), Hellsing's Crimson Rite / Bloated Agony / Hybrid Transformation, Lyric's Trance / Fey Step, either Robe.
2. Delete the leftovers the whispers list (old CPR1 effects, a v13 "Crimson Rite: Flame (...)" or "Hybrid Transformation" effect still on Hellsing).
3. Nix Fix > Apply in order: Silkie, Silent Silk, Hellsing, Lyric. (Silkie and Silent Silk both link the shared Robe; the patches left carry over from v13.)
4. CAT `displayDebugEventData` on for the first tests.
 
## Table test checklist
Things the sources couldn't settle are marked **(confirm)**.
 
### Silkie
- [ ] **AC** 10 + Dex + Cha with no armor.
- [ ] **Unarmed Strike**: Dex to hit; damage = Bardic Inspiration die + Dex, bludgeoning.
- [ ] **Agile Strikes**: give an ally Bardic Inspiration: "make one Unarmed Strike?"; yes attacks the target (or asks among creatures within 5 ft) without spending her action. Using the die on the ally's roll: no prompt. **(confirm CPR2's Bardic Inspiration rolls the item when she hands it out, so `itemRollFinished` fires; if no prompt, check the item's flags still have our macro after the Medkit)**
- [ ] **Robe**: Detach a Patch lists what's left; a patch taken by Silkie is gone on Silent Silk's robe too; Bag of 100 GP adds gold; Rope etc. come from the compendium.
- [ ] Spellbook shows x/6; Fey Ancestry gives advantage against Charmed.

### Silent Silk
- [ ] Poison Spray +5, Faerie Fire DC 13.
- [ ] **Short rest**: one Psionic die back. Long rest: all.
- [ ] **Psi-Bolstered Knack**: a DM-requested proficient skill check (with a DC) that fails: pop-up; the die is spent only if it then passes; the chat shows the new total. Same for a proficient **tool** check. A skill check doesn't ask twice. **(confirm the skill event's `roll.options.target` holds the DC, and that tool checks reach the `check` event with `toolId`)**
- [ ] **Psychic Whispers**: rolls the hours; first use after a long rest gives the die back.
- [ ] **Psionic Strike**: weapon hit within 30 ft on her turn: pop-up; yes adds die + Int Force to that hit; not again that turn; Unarmed Strike: no prompt. **(confirm `bonusDamage` at `actorDamageRollBonuses` 260 lands in the same damage card)**
- [ ] Robe as Silkie.

### Hellsing
- [ ] Hemocraft DC 8 + prof + Int in the curse's save.
- [ ] **Crimson Rite**: bonus action, pick a weapon: he takes 1d4 necrotic; hits with that weapon add 1d4 fire; it shows Magical. A short or long rest ends it and takes Magical off. Using it again moves it. **(confirm `rest/actorShort` on an actor effect fires on a long rest too, as the mapping says)**
- [ ] **Bloated Agony**: spends a Blood Maledict use; Amplify asks; target has disadvantage on Str/Dex checks; its second attack in one turn: 1d8 necrotic once. Normal ends at the end of Hellsing's next turn; Amplified: Con save at the end of its turns. **(confirm `actorAttackRoll` on an effect fires on the cursed creature's attacks, and DAE's `turnEndSource` converts on create)**
- [ ] **Shifting** (Beasthide): one activity, temp HP 2 x prof + 1d6, prof uses per long rest.
- [ ] **Hybrid Transformation**: Transform: burst + loop + optional token art; resistances, +1 AC, +1 melee damage, advantage on Str. Below half HP at turn start: Bloodlust save / chat. Revert ends it and restores the art. 0 HP ends it (`zeroHP`). Configure Look keeps the v13 choices and saves new ones.

### Lyric
- [ ] Name is Lyric Epistímonas everywhere.
- [ ] **Wild Shape / Starry Form / Wild Companion** (CPR2): each spends one Wild Shape use (not two).
- [ ] **Fey Step (Summer)**: fire = Wis mod.
- [ ] **Trance**: long rest: the form asks season (or roll) + 2 proficiencies; Eladrin Season / Fey Step renamed; yesterday's picks end. Clicking "Change Season & Proficiencies" does the same. **(confirm the rest event's macro runs on her player's client; if the GM sees the form instead, that's fine but say so)**
- [ ] **Fey Step riders**: only the current season's rider works; others warn and stop before targeting. **(confirm `activityPreTargeting` on an activity gets `activity` in scope and `return true` cancels)**
- [ ] **Absorb Elements** (CPR2): reaction prompt on elemental damage.

If one fails, turn on CAT's `displayDebugEventData`, repeat it, and note the event / pass and what the console prints.
