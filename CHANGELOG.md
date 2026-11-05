# 1.5.2 (2026-11-05)
- **Lucky (2024) in every campaign.** The world Lucky installer now shows for The Fool's Journey, Journey to the East and Espalian Escapades (it sets up every actor with the 2024 Lucky feat).
- **Fix: Lucky vs Flurry of Blows.** Like Eldritch Blast, Flurry rolls every strike's dice before Midi runs the strikes; it now asks Lucky first, once per strike aimed at a Lucky character on the other side. A yes spends the point and gives that strike's window two d20s; the strike applies the Disadvantage without asking again. Strikes moved to a new target mid-flurry already have their dice, so Lucky asks there as usual (and Midi asks for the second d20). v13 and v14; re-apply Nox fixes.
- **Fix: Eldritch Bident shunt left the creature hidden in the combat tracker.** Hiding the token also hid its combatant, and the return only unhid the token (faded card in the combat bar). The shunt now remembers each combatant's visibility, hides it with the token, and puts it back on the return (or when the effect is removed). Shunts made before this fix unhide the combatant. v13 and v14; re-apply Nethtari fixes.
- **Fix: Lucky vs Eldritch Blast.** The beam windows roll every beam's dice before Midi runs the beams, so Lucky's prompt came after the dice. Eldritch Blast now asks first: for each beam aimed at a Lucky character on the other side, before the dice windows open. A yes spends the point, gives that beam's window two d20s, and the beam's workflow applies the Disadvantage without asking again (`globalThis.nixLuckyPending`). v13 and v14. Re-apply Eldritch Blast beam windows, Lucky (2024) and, on v13, Westly fixes.
- **Fix: Lucky asked about attacks that weren't against the Lucky character.** The Disadvantage prompt now only comes up when he is one of the attack's targets and the attacker isn't on his side (different token disposition). It is still asked before the attack is rolled (`targetPreAttackRollConfig` on v13, `targetAttackRollConfig` on v14). v13 and v14, including the Lucky copy inside Westly fixes (v13). Re-apply Lucky (2024) and Westly fixes.
- **New: Revert.** Every Apply now records what it changes (the fields it writes with their old values, items/effects/macros/actors it creates or deletes, world settings), and the row gets a **Revert** button that undoes the last apply. Only those changes are put back, so play since then (HP, spent slots, new items) is kept. If a later apply changed the same things, Revert takes it back too (newest first) and says so before it runs. A failed apply can be reverted too, undoing the part that ran. The recordings are JSON files in `worlds/<world>/nix-fix-undo/`, not in the world database; the setting `undo` holds the index. Applies made before 1.5.2 have no recording, so they can't be reverted. API: `revertEntry(id)`, `revertChain(id)`, `undoIndex()`.
- **Fix (v14): Ring of the Sunken King failed with "_id: must be a valid 16-character alphanumeric ID".** The Summon Tentacle profile ID was 15 characters (`nixTentacleProf`); it's now `nixTentacleProf0`. Every other hard-coded ID in the module was checked and is 16 characters.

# 1.5.1 (2026-11-05)
- **Fix (v14): character installers failed with "'get' on proxy: property 'tokens' is a read-only and non-configurable data property".** On Foundry v14 `canvas.tokens` is locked, and the panel's canvas stand-in (a Proxy around the real canvas) wasn't allowed to swap it. The stand-in now forwards from an empty object, so every Setup and character row (Metamagic fix-up, Magicians Judge setup, all character fixes) runs from the panel again. v13 behaviour is unchanged.
- **Fix: the Health check window scrolls.** The report scrolls inside the window and the Close button stays visible; the window also fits short screens.

# 1.5.0 (2026-11-04)
- **v14: Espalian Escapades ported.** Silkie, Silent Silk, Hellsing and Lyric fixes have v14 copies. Every automation in all three campaigns now runs on v14 or is retired. See docs/V14-PORT-ESPALIAN.md.
- v14 Psi-Bolstered Knack: `skill/actorBonus` + `check/actorBonus` (tool checks) returning the changed roll; the die is still spent only on a success.
- v14 Hellsing: the Crimson Rite, Bloated Agony and Hybrid Transformation effects carry their own CAT macros; the rite ends itself on any rest (`rest/actorShort`) instead of a DAE rest duration. Configure Transformation Look and Lyric's Trance are DialogV2 forms (no `DialogApp`).
- v14 Lyric: Fey Step season gate at `activityPreTargeting` (reads `actor` / `activity`, no workflow at that pass).
- **Nox: Flurry of Blows rework (v13 and v14)**, built like Nethtari's Eldritch Blast beams. One hostile target selected: all strikes go to it (3 at Monk 10+). Two or more: a pop-up splits the strikes. None: a pop-up of hostile creatures within 65 ft (he can move between them). One dice window per strike, all at once, with the attack d20 and the Martial Arts damage die; Midi then resolves each strike with those dice. A target out of reach asks him to move first; if a target drops, the strikes left can go to another hostile creature in range. Other rolls during a strike (a Stunning Strike save, an opportunity attack) roll as usual.
  - v13: `midi-item` / `rollFinished` / 10 on the item holding Flurry (Monk's Focus); Chris's Premades 1's `promptForTargets` is switched off so its own flurry stands down. Strikes count as a Special action, like CPR's.
  - v14: `roll` / `activityRollFinished` / 10 on the Flurry activity; Chris's Premades 2's generic `extraAttack` on it gets `prompt: false`. Re-run Nox fixes after re-applying Monk's Focus in the Medkit.
  - Both play Chris's Premades' flurry animation themselves (JB2A Patreon).
- Retired on v14 inside the installers: the Chris's Premades 1 `itemUpdate` calls (Bardic Inspiration, Starry Form, Wild Companion, Absorb Elements: apply them in the Medkit) and Lyric's Wild Shape counter fix (Chris's Premades 2's Wild Shape).

# 1.4.0 (2026-11-04)
- **v14: Journey to the East ported.** Nox, Akira, Cordelia, Tsuki and Peri fixes have v14 copies. Every Journey to the East automation now runs on v14 or is retired; only Espalian Escapades stays v13. See docs/V14-PORT-JOURNEY-EAST.md.
- v14 fate stack (Cordelia's Portent, Tsuki's Cosmic Omen) rebuilt on CAT passes: attacks at `actorAttackRoll` / `sceneAttackRoll` 900 with `workflow.setAttackRoll`, saves at `save` `actorBonus` / `sceneBonus` 300 returning the changed roll. The d20 swap and Weal/Woe add no longer need Chris's Premades 1 helpers; Cosmic Omen rolls its own d6.
- v14 Uncanny Metabolism asks when Nox rolls initiative (`combat/actorPreInitiative`) instead of after combat starts.
- v14 Combat Inspiration rides on Chris's Premades 2's Bardic Inspiration effect: Defense (`targetAttackRollBonuses`) and Offense (`actorDamageRollBonuses`). Re-run Akira fixes after re-applying Bardic Inspiration.
- v14 Extended Spell doubles `duration.value` for Foundry 14's `{value, units}` durations. Peri's Configure Surge Animations is a DialogV2 form (no `DialogApp`).
- Retired on v14 inside the character installers: Nox's Unarmed Strike / Deflect Attacks fixes, Akira's Fire Shield and Font of Inspiration, Cordelia's Legacy spell swap, Tsuki's Wild Shape uses, the Chris's Premades 1 familiar config. The v14 installers list duplicates instead of deleting them.

# 1.3.0 (2026-11-03)
- **v14: The Fool's Journey ported.** Nethtari fixes + Bottled Thunderstorm, Quez fixes + Demonic Gamble / Blood Price / Blood Restoration, Westly fixes + Swashbuckler 13/17, Earwyn fixes + Ring of the Sunken King, and Vina fixes have v14 copies. Every Fool's Journey automation now runs on v14 or is retired. See docs/V14-PORT-FOOLS-JOURNEY.md.
- v14 Ring of the Sunken King: Summon Tentacle is a dnd5e Summon activity (with CAT's summon generic) instead of Chris's Premades 1's `Summons.spawn`; the tentacle gets a Release activity and its Restrained effect ends itself when the tentacle is gone.
- v14 Fiendish Vigor swaps False Life's damage rolls at `actorDamageRoll` (CAT has no `replaceDamage`). Demonic Gamble and Divine Intervention use CAT dialogs instead of `DialogApp`.
- Retired on v14 inside the character installers: Quez's Vitality of the Tree for his CPR2 Rage (ours stays for Demons Rage), Westly's Uncanny Dodge marker, Vina's Improved Warding Flare temp HP.
- Offline checker: installer-made world actors are checked too, activities have `toObject`, old activity macros are listed, `Summons.` is flagged.

# 1.2.0 (2026-11-03)
- **Renamed to Nix Fix.** The title changes everywhere it shows (window, settings menu, sidebar button, chat whispers, notifications, docs). The module ID stays `nix-module`, so each world keeps its character bindings and "applied" records, the folder stays `Data/modules/nix-module`, and `game.modules.get('nix-module').api` still works. Settings files exported before the rename still import.
- **v14: world installers ported.** Counterspell (Spell Duel + Subtle), Eldritch Blast beam windows, Darkness & Devil's Sight, Daylight / Dawn dispel, Lucky, War Caster and the opportunity-attack diagnostic have v14 copies. Bangiras's Ring: Shift Spell is ported with Counterspell. See docs/V14-PORT-WORLD.md.
- **v14: retired automations.** Life Bond and the Hold Person / Monster saves are done by Chris's Premades 2 on v14. The panel and health check show them as "Retired on v14" with the reason; Apply all skips them. Registry field: `v14: {retired: '...'}`.
- v14 Counterspell cancels through CAT (`return true`): CAT refunds the caster's slot on a tie, `keepConsumption` keeps it spent when the counter wins.
- v14 Darkness: Devil's Sight is now the `devilsSight` sense that CAT's darkness checks read; Blinded-inside runs as region macros on Chris's Premades 2's Darkness region.
- Settings export includes CAT's world settings.

# 1.1.0 (2026-11-03)
- **Foundry v14 engine (pilot).** On a Chris's Premades 2 + CAT world the module now runs each automation's v14 copy and writes CAT embedded macros (`flags.cat.embeddedMacros`, item or activity level, stored shape). Automations without a v14 copy show "Not ported to v14 yet" and never run there. The v13 engine is unchanged.
- Bangiras ported to v14: Metamagic fix-up, Magicians Judge setup, Bangiras fixes (Stasis v3 with a Topple signal, Sand Shroud animation, Quickened / Heightened / Twinned, Sorcery Incarnate, Sorcerous Restoration, Mantle of Flame, Phoenix Spark, Hold Monster live DC), Seeking Spell, Ring: Spell Surge, Shadowfell Shard. Counterspell and Ring: Shift Spell come with the world Counterspell port. See docs/V14-PILOT-BANGIRAS.md.
- v14 version table (dnd5e capped below 6.1, CAT below 0.2) in the version check.
- Health check lists CAT macros too, and old Chris's Premades 1 macros separately on v14.
- A world copied from v13 shows its v13-applied automations as updates on v14.
- Fix (v14 only): the Sand Shroud animation goes on the effect the reaction applies; a leftover untagged Sand Shroud effect is removed by the setup.

# 1.0.0 (2026-11-02)
- First version. Ships every table-tested automation for The Fool's Journey (6 characters + 8 world installers), Journey to the East (5 characters + shared world installers) and Espalian Escapades (4 characters).
- Control panel: campaign detection, character-to-actor binding, Apply / Apply all updates without selecting tokens.
- Pasted embedded macros (Seeking Spell, Shift Spell, Spell Surge, Shadowfell Shard, Demonic Gamble, Blood Price, Blood Restoration) are written by the module.
- Update tracking per world; GM is told on login which automations changed. Optional auto-apply.
- Health check, version check against tested versions, required world settings check + fix.
- World settings export / import between campaigns.
- Foundry v14 / Chris's Premades 2 (CAT) detected; installers blocked until the v14 port (see docs/V14.md).
