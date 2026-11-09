# Court of Ravenloft (Barovia world, v13)

BBEGs, not a party. Checklist: Party Ability Checklist artifact, campaign tab "Court of Ravenloft" (ids cr-petra, cr-sydmore, cr-dayus, cr-dracula, cr-lucian, cr-valintina; rows cr-<name>-NN).
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

## Decisions (Nix)
- Seals stay visible to everyone (normal effect icon), like CPR.
- Burning: one combined GM prompt per damage event, listing every Illrigger with seals on the target; skippable.
- Dracula's Ancient Berserker Armor: leave manual (he wears Plate +3).
- Juggernaut joins the Court.
- 2026-11-09: CPR's Illrigger flow is clunky (too many pop-ups). Nix Fix replaces it. Goal: at most one GM dialog per event.
- 2026-11-09: Keep the place-seal prompt on the first weapon hit each turn. An attack never gets two Illrigger dialogs.
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
