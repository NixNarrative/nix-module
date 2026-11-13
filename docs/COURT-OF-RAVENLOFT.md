# Court of Ravenloft (Barovia world, v13)

**Foundry v14:** the same Court runs on v14 since Nix Fix 1.7.0 (v14 installers in each `v14/` folder; on v14 the sheets themselves are the bosses, no "(Boss)" copies). What differs, and the v14 table test: `docs/V14-PORT-COURT.md`.

BBEGs, not a party. Checklist: Party Ability Checklist artifact, campaign tab "Court of Ravenloft" (ids cr-petra, cr-sydmore, cr-dayus, cr-dracula, cr-lucian, cr-valintina, cr-juggernaut, cr-octavian, cr-zadimus; rows cr-<name>-NN). 2026-11-11: rows rewritten for the boss stat blocks (sections Stat Block, Legendary Actions, Lair & Mythic Actions, Boss Traits, Seals & Burns, Traits & Actions); all reset to untested.
Exports: Foundry 13.348, dnd5e 5.3.3 (Dayus 5.1.10: open his sheet once to migrate).
Juggernaut (RavenLoft Vampires folder): export received 2026-11-09. CR 20 construct (Titan), Huge, colossus statblock. No automation yet (see "Juggernaut sheet notes").

| Actor | Class | Interdict DC | Seals | Conduit |
|---|---|---|---|---|
| Petra | Sorcerer 18 (Shadow Sorcery 2024) | spell DC 20 | | |
| Sydmore | Illrigger 15 Sanguine Knight | 17 | 6 (3d6) | 8 |
| Dayus Manroe | Illrigger 13 Shadowmaster (Unfettered) | 17 | 6 (3d6) | 7 |
| Dracula | Illrigger 20 Painkiller (boss) | 19 | unlimited (4d6) | 10 |
| Lucian | Illrigger 15 Hellspeaker | 18 | 6 (3d6) | 8 |
| Valintina | Illrigger 15 Architect of Ruin (Unfettered) | 18 | 6 (3d6) | 8 |
| Juggernaut | CR 20 construct (colossus) | | | |
| Father Octavian (captain) | Illrigger 7 Architect of Ruin (Unfettered) | 16 | 5 (2d6 +5) | 4 |
| Zadimus (captain) | Illrigger 7 Sanguine Knight (Lies) | 16 | 5 (2d6, +1d6 True Name) | 4 |

## Decisions (Nix)
- Seals stay visible to everyone (normal effect icon), like CPR.
- Burning: one combined GM prompt per damage event, listing every Illrigger with seals on the target; skippable.
- Dracula's Ancient Berserker Armor: leave manual (he wears Plate +3).
- Juggernaut joins the Court.
- 2026-11-09: CPR's Illrigger flow is clunky (too many pop-ups). Nix Fix replaces it. Goal: at most one GM dialog per event.
- 2026-11-09: Keep the place-seal prompt on the first weapon hit each turn. An attack never gets two Illrigger dialogs.
- 2026-11-11 (1.7.1): One dialog per hit, AFTER the damage (burns, boons and the attacker's place-a-seal together). Only Deathstrike asks at the hit, when usable. Boons spend the Interdict Boons use, never an extra seal. Terrorizing Force on v13 is Nix Fix's (unarmed strikes included).
- 2026-11-09: Blood Moon Blade's lightning damage is intended: it comes from a lair mechanic to build later. Bloodrift replaces the Blood Moon Blade.
- 2026-11-09: Dracula's Feral Instinct is intended (advantage on initiative).
- 2026-11-09: Run Dracula as a boss monster. Nix's ideas: seals without a count, placed with Legendary Actions; Infernal Majesty + Master of Hell: Darkness as a mythic second phase; Invoke Hell and You Die on My Command! 1/day innate; Dispater's Interdiction boons as legendary actions/reactions; Dispater's Supremacy; a cross of Blood Price and legendary actions.
- 2026-11-09: Bloodrift uses the best of Str/Dex/Cha (his Illrigger Cha counts as the "spellcasting ability").
- 2026-11-09 (1.6.0 table test): Dracula gets 4 Legendary Actions, 5 in his lair. Regenerates 20 HP at the start of his turns unless dealt 15 radiant (numbers may change). Infernal Conduit's Devour is his vampire bite: Bonus Action, or Legendary Action (2). Devastator joins the 1/day abilities. Inexorable is just a passive. Legendary Resistance bleeds floor(spell level / 2) d10 (1st none, 2nd 1d10, 4th 2d10, 7th 3d10).
- 2026-11-09: Bloodrift: Trial by Blood is theater of the mind. The extra necrotic die matches the form. Keep The Hunger Within, but it doesn't damage Dracula (immune to necrotic).
- 2026-11-09: Legendary Resistance with no spell level (non-spell or unreadable source) costs no HP. Bloodrift's extra necrotic die gets an off switch (for a level 12 party). All of this is 1.6.0.
- 2026-11-09: Juggernaut's Radiant Ray and Divine Beam damage is necrotic (intended).

## Built (Nix Fix 1.6.0, v13 only)
Runtime in the module (`scripts/court/`), switched on per actor/item by installers. Each part only acts on what its installer marked.

### Illrigger engine: `illrigger.mjs` + world installer "Illrigger engine (seals)"
Installer (runs on the five Illriggers, safe to re-run): strips CPR's Baleful Interdict actor macro (hit prompt), the seal effect's burn macro (on the item and on seals already on creatures) and Deathstrike's prompt; switches Soul's Doom's attack-only grants off; writes `flags.nix-module.illrigger` = {range 30/60, classId, damageScale, superiorInterdict, hellsAssassin, axiomatic (5), exsanguinate, deathstrike (item id), trueNameItem, unlimitedSeals}.
Runtime (active GM):
- `midi-qol.premades.postAttackRollComplete`: weapon hit by a marked Illrigger. Dialog rows: his row (Place a seal / burn + "Also place another seal" + Deathstrike + boons) and other Illriggers' burn rows on the hit targets. Placement and Deathstrike (crit, reaction, use) apply now; burns are stored and run when that target's damage lands.
- `updateActor` with `options.dnd5e.hp` (any HP loss, any source) -> batched 350 ms -> one dialog (rows per target x owner in range). Damage Nix Fix applies itself (burns, Soul's Doom, Unleash Hell) is marked in-flight and never reopens a dialog.
- Burn = a synthetic damage item rolled by the seal's owner through Midi (card, resistances, concentration). Formula: n x owner's dice (+1 set for Deathstrike), Hell's Assassin `r<3`, True Name +1d6, Axiomatic +5n, + Soul's Doom. Superior Interdict: transient `system.traits.idr` fire/necrotic on the owner. Only that owner's burned seals are deleted.
- Boons from the row: Bedevil, Styx's Apathy (reaction), Unleash Hell (reaction; seal damage to the target's allies within 5 ft, Dex half), Exsanguinate (temp HP to a chosen ally within 30 ft; living targets).
- `createActiveEffect`: any new seal of a marked Illrigger loses CPR's macro and records the once-per-turn placement.
- Seals keep CPR's identifier `balefulInterdictEffect` and origin, so Dispater's Supremacy / Move Seals / Telekinetic Seal still see them.
- API: `game.modules.get('nix-module').api.illrigger` (sealsOn, placeSeal, executeRow, burnAll, sealDice...).

### Dracula boss kit: `boss.mjs` + "Dracula: boss kit"
- Legendary Actions item (4, 5 in a lair scene; `turnStart` recovery): Seal (1), Strike (2, Bloodrift first), By the Throat (2: seal + CPR By the Throat), Lair (toggle this scene: `boss.lairScenes`). Max synced at each of his turn starts from the combat's scene, and on Infernal Ascension. Telekinetic Seal (reaction) costs 1 LA.
- Regeneration: `midi-qol.preTargetDamageApplication` adds radiant dealt to him (after resistances) to `boss.radiantTaken` (written through CPR's socket from any client); at his turn start (active GM, `updateCombat`) he regains `regenAmount` (20) if HP > 0 and the tally is under `radiantStop` (15); the tally resets.
- Infernal Conduit (CPR): Devour (Harm, identifier `necrotic`) renamed "Devour (Vampire Bite)", Bonus Action, touch. Copy activity `nixDevourLegend0` "Devour (Legendary, 2)": legendary activation, consumes @scaling Conduit dice + 2 LA, custom `(@scaling)d10` necrotic (CPR's rollFinished heals him from it). Invigorate hidden (`hiddenActivities: healing`).
- Combat Mastery: Inexorable: CPR save macro, activities and uses stripped.
- Baleful Interdict: no uses; seal-placing activities consume nothing; boons no longer consume seals; engine `unlimitedSeals`.
- Infernal Ascension (Mythic) item + runtime: `preUpdateActor` stops the first drop to 0 HP per long rest at 1, then sets HP to max, clears 0-HP statuses, refills LA, turns on Infernal Majesty (CPR item, free), rolls Master of Hell: Darkness (GM places the sphere), adds the "Infernal Ascension" effect. Mythic Action Hellfire Detonation (2 LA): burn all his seals within 30 ft (necrotic). Reset on long rest (`dnd5e.restCompleted`).
- Blood Price: CPR's save macro replaced by an embedded save/bonus macro "Blood Price (Legendary)": one button prompt on a failed save: spend a Hit Die (+1d10) / Legendary Resistance (3/day item, succeed, bleed floor(spell level / 2) d10; spell from Midi's `saveItemUuid` workflow cast level, else the item's level; no spell level (not a spell, or unreadable source): no HP) / accept. In Infernal Majesty the blood amount also hits the nearest visible enemy within 10 ft.
- CPR items added from `chris-premades.CPRThirdPartyClassFeatures`: Telekinetic Seal, By the Throat, Dispater's Supremacy, Grand Strategist, Punishment. D&D Beyond bundles "Dispater's Interdiction" and "Invoke Hell" deleted (Revert restores). Grand Strategist, Punishment, You Die on My Command!, Devastator: 1/long rest each, own uses.
- Terrorizing Force: Necrotic wired to CPR's macro (damage type necrotic), DDB effect disabled. Master of Hell: Inferno gets Dex save / Cha DC. Feral Instinct (Copy) renamed, advantage on initiative.

### Bloodrift: `bloodrift.mjs` + "Dracula: Bloodrift"
- Item flag `flags.nix-module.bloodrift` {great, greatRound, seeker{actorUuid: bonus}, attacked, ravenousKey, cursed}. Blood Gauge = item uses (max 100).
- Form changes rewrite the item (name, base item, properties, mastery, base damage, versatile, the attack's extra necrotic part and ability, Unleashing DC). Extra necrotic die: GM activity *Extra necrotic die: on/off* sets `extraDie: false` and empties the attack's extra part. Writes are serialised per item.
- Activities: Attack; Red Mist 15/30/45 (consume 3/6/9; CPR Teleport); Greatsword Form (needs 70); Bloody Arc and Bloody Arc +5 ft (5 Gauge) (separate attack per hostile in reach; Greatsword only); Unleashing the Madness (save, 30-ft cone, dice set from the Gauge at use, Gauge -> 0, form ends); Blood Gauge (whispers form and Gauge).
- Hooks: preUseActivity gates; preamble: transient necrotic `idr`; postWaitForAttackRoll: Bloodseeker bonus, Greatsword -5; damage: Hunted (bonus x d4/d6 necrotic); preTargetDamageApplication: necrotic immunity -> half, necrotic dealt to living creatures counted; rollFinished: Gauge gain (not in Greatsword), Bloodseeker update, Ravenous Strikes (1/turn, target dialog); postAttackRollComplete (any client): Bloodlash on a melee miss (owner's dialog via CPR); updateCombat (GM): end of previous turn clears Bloodseeker on creatures not attacked, 1-minute Greatsword limit, decay (-3/-5), Death Wish, The Hunger Within save and Mad effect (no damage line for a necrotic-immune wielder); preUpdateItem: players can't unattune.
- Not automated: Bloodsight (text on the Mastery effect), Ending Attunement attempt, Trial by Blood (theater of the mind, not tracked), "can't attack -> half Gauge necrotic" (told in chat), Unleashing's 1/2 on save handled by the activity.

### Petra: `world/install-sorcerer-core.js` + `petra/install-petra-fixes.js` (built 2026-11-09, needs table test)
Apply in order: Petra: Metamagic fix-up, Sorcerer core (2024), Petra fixes. CPR embedded macros (v13), like Bangiras.
- Sorcerer core: each Metamagic option item gets one "Metamagic" macro (Midi Item / rollFinished / 50) that primes an effect and casts the picked spell (`H.cast`: a primed Distant stretches the range first). Primed identifiers: nixCarefulPrimed, nixDistantPrimed, nixEmpoweredPrimed, nixExtendedPrimed, heightenedSpellPrimed, quickenedSpellPrimed, nixTransmutedPrimed, twinnedSpellPrimed. Sorcery Incarnate combiner on Sorcery Points (Midi Actor / rollFinished / 20; actor flag `world.nixMetamagicPrimeOnly` while priming the second). Careful puts a short effect on each protected creature (save bonus lifts the roll to the DC; targetApplyDamage negates half-on-save damage; removed at the spell's rollFinished). Distant writes `flags.world.nixDistantRestore` on the spell until the cast ends (the installer puts back leftovers). Every macro carries its helpers (`H.wrap`: named function `nixSorcerer`).
- Petra fixes: Umbral Form offer on Innate Sorcery (rollFinished / 70) and on the Umbral Form item; effect `nixUmbralForm` depends on the Innate Sorcery effect. Strength of the Grave on Power of Shadow (targetApplyDamage / 245; flag `world.nixGraveUsed`, reset on long rest). Beasts of Ill Omen (preambleComplete / 50): tokens named "Bestial Spirit" / "Ill Omen" (or flag `world.nixIllOmen`) of her disposition; temporary `flags.midi-qol.disadvantage.ability.save.all` on enemies within 5 ft. Shadow Walk: `chrisPremades.Teleport.target` 120 ft, Westly's light check.
- Not automated: repeat saves for Careful / Ill Omen (initial save only), incorporeal damage inside objects, Metamagic Adept's "points only for Metamagic".

### Petra's spells: `court/petra-spells.mjs` + "Petra: spells" (built 2026-11-09, needs table test)
Installer marks the spells (`flags.nix-module.petraSpell` {kind: wallOfDeath | negativeFlood | fingerOfDeath | prismaticWall, ...}); activities flagged `wall` / `ring` / `globe` / `layer`. Walls live on the template: `flags.nix-module.petraWall` {kind: death | prism, caster, side, formula, type, ability, dc, tickSave, reach | dice, allowed, layers}; caster effect `flags.nix-module.petraWallTemplate` (delete = wall ends). Turn and movement checks on the active GM (`updateCombat`, `updateToken` with a position cache); saves and damage are CPR synthetic workflows from Petra (players get normal save prompts).
- Wall of Death: tick save read from the sentence about ending a turn (MCDM text: no save). Concentration: the caster effect is a dependent of her concentration.
- Sorcerous Burst: `midi-qol.premades.preDamageRollComplete` adds one 1d8 DamageRoll per burst (same type), cap = spellcasting mod; runs before Empowered (CPR damageRollComplete).
- Zombies: `pending` on the spell item; checked at her next turn start (or at once outside combat). "Killed" = NPC at 0 HP, `dead` status, or 3 failed death saves.
- Prismatic Wall: "allowed" = tokens with her disposition at cast. Walls (move none, sight normal, light none) and an AmbientLight flagged `petraWall: <template id>`, removed with the template.
- Not automated: Prismatic Wall's "reaching into" the wall, damage-based layer destruction (use the activity), "wall in a creature's space" (GM told), Indigo/Violet when the target isn't on the current scene; Wall of Death damaging both sides (ask if her text says so).

### Lieutenants, character + boss: `lieutenants.mjs` + "<Name>: fixes" + "<Name> (Boss): boss kit" (built 2026-11-09, needs table test)
Two actors each: the character (e.g. "Dayus Manroe") and a duplicate named "<Name> (Boss)" (registry keys `dayus` / `dayus-boss`; names containing "boss" bind to the boss key only). Order: Illrigger engine (both), fixes (both: subclass features + feats, RAW resources), boss kit (Boss copy only: Legendary Actions, Legendary Resistance, Invoke Hell 1/day; refuses to run before the fixes).
Boss kit flags: Shared with Dracula's runtime (boss.mjs): `flags.nix-module.boss` {legendaryBase 3, legendaryLair 3, regen false, phase2 false, paidSeals true, strikeItem}. Own flags `flags.nix-module.court` {key, piercer, slowWeapons, haemal, haemalDamage, sanguineGift, bloodstroke, bloodstrokeType, spellbreaker, submit, charmEnemy, intransigent, slipperyPloy}; activity kinds `flags.nix-module.court` (veil, interchange, blessing, regainSeals, regainSlots, enervating, cantrip, bewitch, deal, quid, none).
- Installers generated: `node tools/court-boss-build/build.js <nix-module>` (fixes-core.js + boss-core.js + bodies.js; Blood Price macro copied from Dracula's installer, Sentinel from Quez's). Re-run the build after editing either.
- Socket `module.nix-module` {nix: 'court'}: spendSeals, placeSeal, burn, removeSeals, save, reaction, effect, deleteEffect, update. Hooks run on the workflow's client; questions go to the active GM.
- Choices made (change on request): seals keep their pools (only Dracula unlimited); "burn" deals damage for Haemal Exchange and Submit (RAW: no "no damage" line), not for Spellbreaker; Foul Interchange may target the user himself; Bloodstroke type necrotic; Legendary Resistance 3/day; Sutekh's Blessing ignores constructs, elementals, oozes, plants, undead.
- Not automated: Haemal Exchange on saves rolled outside Midi; counter-chains against Spellbreaker; Let's Make a Deal's "can't be cancelled by advantage"; Spellblade (activity only); Sutekh's Blessing barriers; Quid Pro Quo devil's initiative (added to combat, roll it).

### Captains: Father Octavian, Zadimus (1.7.1, built 2026-11-11, needs table test)
Illriggers 7 under the lieutenants (Nix, 2026-11-11): fixes only, **no boss kit, no Legendary Actions or Legendary Resistance**; Make stat block takes them as they are. Exports: `exports/v13/octavian.json`, `zadimus.json` (Foundry 13.348, dnd5e 5.3.3).
- One registry slot each (`octavian` matches "Father Octavian" / "Octavian", `zadimus`): bind the character, or later his NPC stat block (same name, "(NPC)") in the same slot. Illrigger engine actors include both. Rows "<Name>: fixes (captain)", order 50/51, v13 + v14 files.
- Generated: `tools/court-boss-build/captains-bodies.js` (`captain: true` skips the boss kit and the "(Boss)" registry slot). Shared part: `court.captain = true`; Invoke Hell RAW (the CPR "Invoke Hell" item 1/SR, both options consume it); a boon summary.
- Octavian: Enervating Spell (`enervating`, armed effect; the runtime gate no longer requires Valintina), Spellblade (`none`), Axiomatic Seals (engine), Hellish Versatility (text; illrigger cantrips = Ray of Frost, Thaumaturgy by D&D Beyond's class source), Reborn and Staff of Charming reported. Sheet spell slots are a manual override 4/3/1 (RAW 4/2): asked Nix.
- Zadimus: Foul Interchange (`interchange`), Sutekh's Blessing (`blessing`), Embolden Allies (`embolden`), Vitalize (`vitalize`), Lies weaponType `rapier` (`flags.nix-module.weaponType` + `flags.chris-premades.config.weaponType`), spells' casting ability set to Cha (no spellcasting class), Acheron's Chain's Baleful Interdict consumption removed (keeps the Interdict Boons 1/turn use).
- Engine: Soul Eater on the burn row (`boonsFor` / `runBoons` in `illrigger.mjs`): temp HP = illrigger level, spends the Interdict Boons use. Runtime: `emboldenAllies` (form with a number per creature within 30 ft, total <= 5 x level, healing via the GM socket with `nixGift` so Sanguine Gift doesn't prompt), `vitalize` (effect `system.bonuses.abilities.check` +PB, 60 s). Sydmore's fixes mark both too.
- `npcLegendary` on an NPC with no boss flags, no Legendary Actions item and no Legendary Resistance item: legact/legres 0, nothing moved. Make stat block lists captains ("(captain)"). Offline: `dev/statblock-captain.test.mjs`.

### Boss stat blocks: `court/statblock.mjs` + tool "Make stat block (boss NPC)" (Nix Fix 1.6.1, built 2026-11-10, needs table test)
Goal (Nix, 2026-11-10): the "(Boss)" copies should look like monster stat blocks (like Juggernaut: NPC sheet, native Legendary Action / Resistance pips, a Legendary Actions section). Foundry can't change an actor's type, so the tool makes an NPC twin; the character copies stay as they are. Pilot: Dracula, then the lieutenants.
- **What dnd5e 5.3.3 does with a class item on an NPC** (read from the system source): `system.scale` is prepared from items for every actor type, so `@scale.illrigger.*` (seal dice, Conduit) works; class levels add to `details.level`; proficiency = max(CR, level); spell slots follow the class progression. Hit Dice: an NPC tracks them on the actor (`system.attributes.hd.spent`, max = HP formula dice + class levels) and its rests only recover that, never the class item's `hd.spent`. HP: an NPC adds the class's Hit Point advancement on top of its stored max. So no flags were needed: the class item stays, Hit Dice move to the actor.
- **Tool** (`automations/court-of-ravenloft/world/make-stat-block.js`, Run from the window): pick the boss character and a CR. New NPC with the same name, folder, image, token, ownership, flags (boss / illrigger / court config) and every item and effect with the same ids (`Actor.<old id>` references swapped to the new one). Abilities, skills, tools, bonuses, traits, senses, movement, AC, initiative, spell slots, currency copied; rules 2024 (stat block style); HP formula empty (Hit Dice = class levels); `hd.spent` = the class items' spent. Then: HP max corrected for the advancement (stored max = character max minus what the class adds), AC set flat if the formula gives a different number, and a whisper comparing proficiency, saves, skills, initiative, spell DC, speed, class levels and scale values with the character. Run it again for the same character: Rebuild (items, effects and stats replaced, token and folder kept) or Make another.
- **Layout** (`npcLegendary(actor)`, also called at the end of every boss kit on an NPC, so a re-apply keeps it): Legendary Resistance item uses -> `system.resources.legres` (identifier `legendary-resistance`, uses removed); Legendary Actions max -> `system.resources.legact` (4 / 5 in his lair, 3 for lieutenants, `syncLegendaryMax` sets the pips); each Legendary Actions activity -> its own feat item (activation `legendary`, cost = its number, text taken from the list in the description; flag `legendaryAction` = activity id), Lair (toggle) under Lair Actions; the Legendary Actions item keeps only the description (identifier `legendary-actions`, list removed). Activities elsewhere that spent Legendary Action uses spend the pips (`attribute resources.legact.value`): Telekinetic Seal, Devour (Legendary, 2), Hellfire Detonation (activation `mythic`, Mythic Actions section). Devour gets a **button item** "Devour" in the Legendary Actions section (`legendaryProxy`): clicking it opens Infernal Conduit's Devour (Legendary, 2) (the real activity spends the pips and Conduit dice; Chris's Premades' Conduit macros stay on their item).
- **Runtime**: `boss.mjs` on an NPC sets/refills the pips (start of his turn, Infernal Ascension), lair message reads the pips. Blood Price prompt (Dracula + lieutenants): on an NPC, Hit Die from `system.attributes.hd` (die from the class item), Legendary Resistance from `system.resources.legres`. Character path unchanged.
- Panel: NPC actors show "(NPC)" in the binding lists (the NPC has the same name as its character).
- Offline check: `node dev/statblock.test.mjs` (layout, re-apply idempotence, lair 4/5, proxy button, Blood Price NPC + character).

## Table test (v13 Barovia world)
1. Nix Fix window: campaign Court of Ravenloft; bind the actors; Apply: Illrigger engine, then Dracula: boss kit, then Dracula: Bloodrift. Read each whisper.
2. Dracula hits a fresh creature with Bloodrift: one dialog, "Place a seal" ticked. Hit again the same turn: no dialog (once per turn) unless another Illrigger has seals there.
3. Next turn hit the sealed creature: burn row + "Also place another seal" (unticked) + Deathstrike. Tick Deathstrike: the hit turns critical, at least 1 seal burns after damage, 8d6+4d6 dice.
4. Petra Fireballs two creatures carrying Dracula's and Valintina's seals: ONE dialog with a row per target per Illrigger. Burn some: only those seals disappear, each owner's dice, Valintina +5 per seal.
5. Soul's Doom on a creature: any damage adds +6 once per event (no double on attacks).
6. Drop Dracula to 0: he stays up, full HP, Infernal Majesty on, place Master of Hell: Darkness, Legendary Actions refilled; Hellfire Detonation works now (blocked before). Long rest resets.
7. Fail a save with Dracula: one prompt (Hit Die / Legendary Resistance / accept). LR against a 1st-level spell: no bleed; 2nd: 1d10; 4th: 2d10; 7th: 3d10; no spell level: no bleed.
7a. Legendary Actions show 4. On his lair scene, use Lair (toggle this scene): 5, and his next turn start keeps 5 there.
7b. Damage him, start his turn: +20 HP with a chat line. Hit him for 15+ radiant first: "doesn't regenerate". At 0 HP: nothing.
7c. Infernal Conduit: Devour (Vampire Bite) as a Bonus Action, pick 3 dice: Con save, he heals the necrotic dealt, 3 Conduit spent. Devour (Legendary, 2) spends 2 Legendary Actions too. Invigorate isn't listed.
7d. Bloodrift: Extra necrotic die: on/off removes the extra die from the attack card (and back).
7e. Devastator: 1/day. Inexorable: no button; a save with 2 enemies adjacent gets +2.
8. Bloodrift: damage a living creature with necrotic until 30 -> Longsword Form; Bloodseeker +1/+2/+3 and Hunted; 70 -> Greatsword Form; each attack -5; Bloody Arc; Unleashing; turn-start decay and Hunger save at 50+.
9. A player misses Dracula in melee: Bloodlash prompt to the GM.

10. Petra: Apply Petra: Metamagic fix-up, Sorcerer core (2024), Petra fixes. Read the whispers (every option shows its SP cost; Strength of the Grave 2014 and the extra Summon Beast deleted).
11. Petra Careful: target Dracula and two heroes, click Careful Spell, pick Fireball: Dracula auto-succeeds and takes 0; the heroes save normally.
12. Petra Empowered: click it, then cast Blight: chat lists the rerolled dice. Click it and delete the effect: point refunded.
13. Petra Distant: Finger of Death shows 120 ft while casting, 60 ft after. Transmuted: Fireball asks for the new type at the damage roll. Extended: Greater Invisibility lasts 2 minutes.
14. Petra Innate Sorcery: Umbral Form prompt (free use / 6 SP); resistances on her sheet; ends with Innate Sorcery. With Innate on, Heightened offers a second option (Sorcery Incarnate). Out of Innate uses: the "2 Sorcery Points" activity.
15. Petra at 0 HP from 30 damage: Cha save DC 35; success = 24 HP and a chat line; a second time before a long rest: nothing.
16. Petra Beasts of Ill Omen: Bestial Spirit next to a hero, Fireball the hero: "Beast of Ill Omen" effect, disadvantage on the save.
17. Petra Shadow Walk: teleport picker, 120 ft.

17a. Petra: Apply Petra: spells. Whisper: Wall of Death size/save/damage and "no save" for the ongoing damage; Prismatic Wall 12d6.
17b. Wall of Death: cast, place the wall between her and two heroes: Con saves; pick a side. A hero ends its turn within 10 ft on that side: damage card, no save. Other side: nothing. Walk a hero through: damage once that turn. Drop concentration: template gone.
17c. Wall of Death (ring) around a hero standing on the ring and one in the middle: only the one on the ring saves.
17d. Negative Energy Flood on a vampire spawn: no save, temp HP = half the roll. On an NPC that drops to 0: at her next turn start, confirm: Zombie (<name>) appears on the corpse, corpse hidden, zombie in combat.
17e. Prismatic Wall: Dracula on her side walks through: nothing. A hero walks through: up to 7 Dex saves; failing Indigo = Restrained, end-of-turn Con saves; failing Violet = Blinded, Wis save at her next turn. A hero steps within 20 ft: Con save or Blinded. Fire Bolt across the wall: stopped (indigo). Destroy a layer / end: red goes first; End removes walls and light.

17f. Sorcerous Burst: hit with it until a d8 shows 8: an extra 1d8 roll (manual prompt), chain on another 8, chat line with the dice; never more than 6 extra (Cha +6).
18. Lieutenants: duplicate each and rename the copy "<Name> (Boss)"; in the Nix Fix window check both bind. Apply the Illrigger engine, each fixes (whisper per actor: feats list, anything "not found"), then each boss kit. The character sheets get no Legendary Actions and keep shared Invoke Hell.
19. Legendary Actions show 3 on each Boss copy; Seal (1) spends a seal (6 -> 5); Strike uses the weapon named in the whisper.
20. Dayus: first attack on his turn vs a sealed creature has advantage; melee hit with advantage adds 5d4 (6d4 in dim light). Veil of Lies: seal spent, invisible, ends on his next attack.
21. Sydmore: a PC with his seal attacks and hits by 1-7: Haemal prompt; -1d8, seal burns, ally effect +1d8. Foul Interchange on a poisoned ally passes poisoned to a PC on a failed Con save; it ends at the end of his next turn. Heal an ally within 30 ft: Sanguine Gift prompt. Exsanguinate an ally, hit it in melee: attacker takes 15 necrotic.
22. Valintina: a sealed PC casts a spell within 60 ft: Spellbreaker prompt, Spell Duel. She casts a save spell on a creature with 2+ seals: Submit dialog. Arm Enervating Spell, cast a damaging spell: targets vulnerable. Vile Transmogrification both ways.
23. Lucian: Bonus Action seal on a Humanoid: Charm Enemy dialog. Charm an ally within 10 ft of him: blocked. A PC attacks him: Slippery Ploy prompt; fail -> pick a new target or lose it. Quid Pro Quo: token hidden, devil appears; save success at turn end brings it back and removes the devil. Cha check with a low d20: Red Cant prompt.

24. **Make stat block (1.6.1), Dracula first.** Nix Fix window > Automations > Make stat block (boss NPC) > Run. Pick Dracula (Boss), CR (you choose). Whisper: HP/AC lined up, "match the character" (or what differs), class items "Illrigger 20/20, scale n/n", Hit Dice 20/20, layout line (4 Legendary Actions, 3 Legendary Resistances; Seal, Strike, By the Throat, Lair, Devour). The sheet opens: NPC sheet, 4 + 3 pips, Legendary Actions section (Seal 1, Strike 2, By the Throat 2, Devour 2), Lair Actions (Lair toggle), Mythic Actions (Hellfire Detonation). The character "Dracula (Boss)" is unchanged.
25. Bind the NPC: the Dracula slot lists "Dracula (Boss) (NPC)". Re-apply the Illrigger engine, Dracula: boss kit, Dracula: Bloodrift. Boss kit whisper ends with the layout line; nothing duplicated on the sheet.
26. NPC in combat: Seal (1) spends one pip and seals; Strike (2) attacks with Bloodrift; Devour button opens Devour (Legendary, 2): pick dice, 2 pips + dice spent, he heals. Telekinetic Seal (reaction) spends 1 pip. Not enough pips: dnd5e refuses. Start of his turn: pips refill, +20 HP. Lair toggle on his lair scene: 5 pips.
27. NPC Blood Price: fail a save vs a 4th-level spell: prompt shows "Hit Die +1d10 (20 left)" and "Legendary Resistance (3 left)". Hit Die: the NPC's Hit Dice go 20 -> 19. LR: a pip empties, 2d10 bleed. Long rest: Hit Dice and pips come back. (If you press "Accept the failure", dnd5e's own "Resist" button can still show on the save card: that one spends a pip without the bleed.)
28. Drop the NPC to 0: Infernal Ascension as before, pips refilled; Hellfire Detonation (Mythic, 2) works.
29. Then each lieutenant: Make stat block on "<Name> (Boss)", bind it in the "<Name> (Boss)" slot, re-apply the Illrigger engine, "<Name>: fixes", "<Name> (Boss): boss kit". 3 Legendary Actions (Seal, Strike, signature) in the section, 3 Legendary Resistances.

30. **Captains (1.7.1).** Bind Father Octavian and Zadimus in their slots. Apply the Illrigger engine (whisper: Octavian 5 seals, 2d6, range 60, Axiomatic Seals; Zadimus 5 seals, 2d6, range 30, Exsanguinate, True Name), then each "<Name>: fixes (captain)". Read the whisper: no "not found" lines.
31. Make stat block on each (picker shows "(captain)"): NPC sheet with **no** Legendary Action or Resistance pips, whisper "no Legendary Actions or Legendary Resistance (captain)". Bind the NPC in the same slot, re-apply the engine and the fixes.
32. Octavian: arm Enervating Spell (Invoke Hell spent), cast Scorching Ray at a resistant target: seal spent, damage doubled. Spellblade now says no use left until a short rest. Burn his seals: +5 each, Styx's Apathy / Unleash Hell checkboxes.
33. Zadimus: rapier attack uses Cha (+9). Burn his seals: Soul Eater checkbox (+7 temp HP, Interdict Boons use spent) and Exsanguinate. Bonus Action seal: Chris's Premades offers Acheron's Chain; it spends no extra seal. Embolden Allies: window splits 35 HP. (Invoke Hell is now spent.) Next short rest: Vitalize: +3 ability checks for 1 minute. Foul Interchange on a poisoned ally.

34. **1.7.1 second batch: re-apply.** On each Court Illrigger (character, then the NPC in the same slot): "<Name>: fixes". Whisper: "Split into their own items: ..." on the first run, "already one item each" after. Then each lieutenant's boss kit on the (Boss) copy. Sheet: *Interdict Boons: <Option>* and *Invoke Hell: <Option>* rows in the right sections; the old bundles are gone.
35. Characters / captains: use Invoke Hell: Embolden Allies, then Vitalize: refused (no use left until a short rest). (Boss) copy: each option 1/day.
36. Lucian: Longsword attack shows Cha (no hand edit). Hellsight inside Darkness: Blinded goes, token vision mode Truesight; when it ends (still inside): blinded again, vision mode back. Honey-Sweet Blades, then attack a sealed creature: advantage, hit = crit. Turncoat on 2 enemies: Cha saves, failure charmed.
37. Lucian: burn a seal with Unleash Hell on a necrotic-resistant creature's ally group: the splash isn't halved; purple explosion on the burned creature. Quid Pro Quo on a player: at the end of its turn the player gets a Cha save prompt; success: token back, devil gone from the map and the tracker.
38. Terrorizing Force (v13, manual rolls): one damage dialog with the weapon dice and the d8 together, no second popup.
39. Father Octavian: Infernal Conduit Harm (2 uses) at a creature 5 ft away: one manual roll of 2d10 first, then the target's save, damage after; he heals by the necrotic dealt. 10 ft away (no Unfettered): refused.
40. Dayus: Vengeful Shot: one prompt (the longbow is used). Strike from the Dark on a longbow hit with advantage on a sealed creature: +PBd4.
41. Sydmore: Crusher option: crosshair, drop the target within 5 ft.
42. Valintina: Mage Slayer: hit a concentrating caster: "Mage Slayer: concentration" effect, its concentration save at disadvantage. Fail a Wis save: Guarded Mind prompt, yes = success, use spent.

## Watch-outs
- Re-run the Illrigger engine after re-applying Baleful Interdict, Deathstrike or Soul's Doom in the Medkit; re-run the boss kit after re-applying any Dispater's / Invoke Hell / boon item (CPR's "created/medkit" macros point consumption back to seals).
- Sydmore, Dayus, Lucian, Valintina still have D&D Beyond Baleful Interdict items: the engine places/burns seals with them, but apply CPR's Baleful Interdict for the Bonus Action/Move Seals activities, then re-run the engine.
- Midi must allow manual damage application events to carry dnd5e's HP delta (default). Damage edited straight on the sheet also counts as a damage event.
- A creature whose type reads as construct/undead is not "living" (Exsanguinate, Bloodrift Gauge).

## Juggernaut sheet notes (export 2026-11-09)
- NPC, CR 20, AC 21, HP 270, speed 60, legendary actions 3, legendary resistance 4, Siege Monster, Immutable Form, Magic Resistance (text only, no Midi flag).
- Radiant Ray and Divine Beam say radiant in their text but their damage is set to necrotic: intended (Nix, 2026-11-09). Their text can be updated to match.
- Slam's 20-ft push and Radiant Ray's "Large or smaller" prone aren't automated (Radiant Ray applies Prone to any size).
- Divine Beam is currently spent (recharge 5-6).

## CPR's Illrigger coverage
CPR 1.x (v13) has Illrigger as legacy content in scripts/macros/2014/classFeatures/illrigger: core class, all combat masteries, every interdict boon, Painkiller subclass only.
No Sanguine Knight, Shadowmaster, Hellspeaker or Architect of Ruin. CPR 2.x (v14, CAT) has no Illrigger at all, so a v14 port means Nix Fix carries the whole class (the engine hooks Midi directly, so most of it should carry over).
Medkit matches by item name. DDB bundles several features into one item, so CPR can't match them.

## Bugs in CPR 1.5.51 balefulInterdict.js (fixed by the engine for marked actors)
1. Burning deleted the first `count` seal effects on the target, from any origin.
2. Seal dice came from the attacker, not the seal's owner.
3. Unfettered was looked up on the target.
4. AoE on several sealed targets merged onto one.
5. move(): 30 ft measured from the dead creature (still CPR's Move Seals; not changed).
Also: Superior Interdict regain has no "none left" check (CPR, unchanged).

## Bloodrift damage per hit (2026-11-09)
Average on a hit, no crit. +3 Bloodrift +5 ability (Cha +5 from Interdict DC 19; more if his Str is higher), Terrorizing Force necrotic 1d8 (2d8 in Infernal Majesty), 1d6 lightning. Greatsword includes Great Weapon Master +6 (Attack action). Not included: Hunted, seals, Soul's Doom, crits. Monte Carlo (200,000 rolls each) matched the exact averages.

| Form | With extra die | With extra die + IM | Without extra die | Without extra die + IM |
|---|---|---|---|---|
| Shortsword (1d6) | 23.0 | 27.5 | 19.5 | 24.0 |
| Longsword one-handed (1d8) | 25.0 | 29.5 | 20.5 | 25.0 |
| Longsword two-handed (1d10, extra die 1d8) | 26.0 | 30.5 | 21.5 | 26.0 |
| Greatsword (2d6, extra die 2d6) | 36.0 | 40.5 | 29.0 | 33.5 |

## Dracula's round vs The Fool's Journey (2026-11-09)
Party HP (checklist): Earwyn 109, Bangiras 88, Vina 96, Westly 85, Quez 135, Nethtari 91. Average 100.7, total 604.
Round = 3 Bloodrift attacks (Attack action, GWM +6 in Greatsword) + Ravenous Strikes extra attack on a crit + burn 1 seal (4d6) + Devour 5d10 Bonus Action (Con save +5 vs DC 19, half) + 4 Legendary Actions as 2 Strikes. One target, sealed (crit 18-20), AC 18, +14 to hit, Hunted from Bloodseeker, 1d6 lightning, Terrorizing Force. 100,000 simulated rounds each.

| Form | Extra die on | Extra die on + IM | Extra die off | Extra die off + IM |
|---|---|---|---|---|
| Shortsword | 186 | 211 | 166 | 191 |
| Longsword (2-handed) | 203 | 229 | 177 | 203 |
| Greatsword | 253 | 279 | 213 | 239 |

Every cell is 1.6x to 2.8x the average PC's HP; he drops an average PC from full in one round 96-100% of the time. All-in (Greatsword, IM, 10d10 Devour): 302.
Levers (Greatsword, no IM, extra on, 253): no Hunted 220; no Legendary Strikes 171; crit only on 20 227; extra die off 213.

## Next
1. Per-character installers for the other Illriggers' subclass features (see checklist flags), Petra's 2024 Metamagic / Sorcery Incarnate / Sorcerous Restoration / Strength of the Grave.
2. Haemal Exchange (reaction on a sealed creature's attack/save), Spellbreaker, Submit, Sanguine Gift: not in the engine yet.
3. Blood Moon Blade lightning lair mechanic.
4. v14 port of the engine (CAT).
