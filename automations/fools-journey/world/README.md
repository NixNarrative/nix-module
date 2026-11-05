# The Fool's Journey: Automation Macros (final, 2026-11-02)
 
Everything the six Fool's Journey characters use, tested at the table. These are the **final versions**; the older files in `claude/` are earlier working copies kept for reference.
 
**Setup:** Foundry v13, dnd5e 5.3.3, Midi QOL, Chris's Premades (CPR), Gambit's Premades, DAE, Times Up, Sequencer, JB2A Patreon, Automated Animations, Vision 5e. Manual dice entry at the table.
 
## How to use these files
Every file is a Foundry **Script** macro or a CPR **Embedded Macro**:
- **Installers / setup scripts**: Macro Directory > Create Macro > Type **Script** > paste > run **as GM**. Character installers need that character's token selected; world installers need nothing selected. All are safe to re-run: they replace what they wrote instead of stacking copies.
- **Embedded macros (paste)**: open the item (or activity) > CPR Medkit > Embedded Macros > add one with the Type / Pass / Priority given in the file header and paste the code.
- After re-applying a Chris's Premades automation in the Medkit or re-importing a character, re-run that character's installer.

## Required world settings
- Gambit's Premades: **Enable Opportunity Attack = on** (was off; that's why opportunity attacks never fired).
- Chris's Premades Darkness: Real Darkness on, Magical Gloom animation (set by the darkness installer).
- Midi QOL reactions on for players and GM (already set).

## Run order for a fresh world
1. World installers (folder `world/`): Counterspell, Eldritch Blast, Darkness & Devil's Sight, Daylight / Dawn Dispel, Lucky, Life Bond, War Caster, Hold Person / Monster (select Bangiras and Vina).
2. Bangiras: Metamagic Fix-up, then Magicians Judge Setup, then Bangiras Fixes; paste Seeking Spell, Shift Spell, Spell Surge, Shadowfell Shard.
3. Nethtari: Nethtari Fixes, Bottled Thunderstorm Setup.
4. Quez: Quez Fixes; paste Demonic Gamble, Blood Price, Blood Restoration.
5. Westly: Westly Fixes. Swashbuckler 13/17 only when he levels.
6. Earwyn: Earwyn Fixes, Ring of the Sunken King.
7. Vina: Vina Fixes.

## Per character
 
### Bangiras (Sorcerer 12, Phoenix)
| File | Kind | What it does |
|---|---|---|
| bangiras/metamagic-fixup.js | Setup | 2024 Metamagic costs on his Sorcery Points item |
| bangiras/magicians-judge-setup.js | Setup | Staff: charges, Arcane Glyphs, Stasis, Judgement, Sand Shroud |
| bangiras/install-bangiras-fixes.js | Installer | Stasis v2, Sand Shroud animation, Quickened, Sorcery Incarnate, Heightened/Twinned, Sorcerous Restoration, Mantle of Flame, Phoenix Spark, Hold live DC |
| bangiras/seeking-spell-embedded.js | Paste | Reroll a missed spell attack for 1 SP (Midi Actor / postAttackRoll / 50) |
| bangiras/ring-shift-spell-embedded.js | Paste | Swap a counterspelled spell (Midi Actor / preItemRoll / 50) |
| bangiras/ring-spell-surge-embedded.js | Paste | Extra spell, then Paralyzed (activity: Midi Item / rollFinished / 50) |
| bangiras/shadowfell-shard-embedded.js | Paste | Curse after a Metamagic spell (Midi Actor / rollFinished / 50) |
| world/fix-hold-spells.js | Setup | End-of-turn save with live DC (also Vina) |
| world/install-counterspell.js | World | Spell Duel Counterspell |
 
### Nethtari (Warlock 12, Raven Queen)
| File | Kind | What it does |
|---|---|---|
| nethtari/install-nethtari-fixes.js | Installer | Agonizing Blast, Eldritch Bident (d12, nat-20 shunt), Fiendish Vigor (12 temp HP, no dice), Gift of the Protectors, Sentinel Raven, Soul of the Raven, Raven's Shield, Spell Sniper, Pearl of Power |
| nethtari/bottled-thunderstorm-setup.js | Setup | All 8 Bottled Thunderstorm activities with animations, Thunderwave push |
| world/install-eldritch-blast.js | World | One dice window per beam (also Quez, Earwyn) |
| world/install-darkness-vision.js | World | Devil's Sight through magical darkness; Darkness blinds those who can't see (also Quez) |
| world/install-daylight-dispel.js | World | Daylight / Dawn dispel Darkness (also Vina) |
 
### Quez (Barbarian 8 / Druid 3 / Warlock 1)
| File | Kind | What it does |
|---|---|---|
| quez/install-quez-fixes.js | Installer | Vitality of the Tree automatic, Great Weapon Master (2024), Sentinel Guardian + Halt, Chieftain's Fury, Javelin of Lightning, Tina's Gravity Gloves |
| quez/demonic-gamble-embedded.js | Paste | Hit Dice wager (activity: Midi Item / preItemRoll / 50) |
| quez/blood-price-embedded.js | Paste | Hit Dice for a failed save (Save / bonus / 50) |
| quez/blood-restoration-embedded.js | Paste | Regain a Hit Die on a kill (Midi Actor / rollFinished / 50) |
 
### Westly (Rogue 12, Swashbuckler 5.5)
| File | Kind | What it does |
|---|---|---|
| westly/install-westly-fixes.js | Installer | Twin Blades (one attunement), Radiant / Silent Strike (2d6), Goad (1d6), Awe (3d6), Fancy Footwork (blocks Gambit opportunity attacks), Uncanny Dodge reaction, Lucky, Skill Expert merge, Cloak of the Bat (Grip the Cloak) |
| world/install-lucky.js | World | 2024 Lucky for every character with it |
| westly/install-swashbuckler-13-17.js | Level-up | Invigorate, Parrying Stance (13); Master Duelist (17) |
 
### Earwyn (Paladin 12, Oathbreaker)
| File | Kind | What it does |
|---|---|---|
| earwyn/install-earwyn-fixes.js | Installer | Shield Master (Bash + push, Interpose on a successful save), cleanup, Hellish Rebuke pop-up, Adamantine Plate, Trident Lightning Conductor, Winter's Bane |
| earwyn/install-sunken-king-ring.js | Installer | Animated Spectral Tentacle: Slam, Grapple (Athletics contest, tie to target) |
| world/install-life-bond.js | World | Steed shares spell healing within 5 ft |
| world/install-war-caster.js | World | War Caster spells in Gambit's opportunity attack prompt (also Vina) |
 
### Vina (Cleric 12, Light)
| File | Kind | What it does |
|---|---|---|
| vina/install-vina-fixes.js | Installer | Potent Spellcasting (+Wis in cantrip damage), Chef / Vina's Sweet Treats, Divine Intervention (level menu + Back, real spell names), Warding Flare without target confirmation |
 
### Tool
| File | What it does |
|---|---|
| world/diagnose-opportunity-attacks.js | Read-only report of opportunity attack settings and combatants |
 
## Known limits
- Goad: "can't make opportunity attacks against others" is a reminder only (Gambit can only switch off all of a creature's opportunity attacks).
- Sentinel: the "takes the Disengage action" trigger is not automated.
- Divine Intervention: if she already has the chosen spell prepared, a second copy shows in Innate Spellcasting until the cast finishes (concentration spells: until her next long rest).
- Pistachio's Fancy Hat: on hold for a new homebrew.

## Next step
When the other campaigns' characters are done, everything here moves into one "Nix module" (see `claude/nix-module-plan.md`).
 