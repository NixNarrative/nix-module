# Espalian Escapades: Automation Macros (2026-11-02)
 
Party (level 3): Silkie (Bard 3, College of Dance, Drow), Silent Silk (Silkie's alter ego: Rogue 3, Soulknife, Drow), Hellsing Elbur (Blood Hunter 3, Order of the Lycan, Shifter/Beasthide), Lyric Epistímonas (Druid 3, Circle of the Stars, Eladrin).
 
Every file is a Foundry **Script** macro: Macro Directory > Create Macro > Type **Script** > paste > run **as GM** with that character's token selected. All are safe to re-run. After re-importing a character or re-applying a Chris's Premades automation, run that character's installer again.
 
## Run order
1. `silkie/install-silkie-fixes.js`
2. `silent-silk/install-silent-silk-fixes.js`
3. `hellsing/install-hellsing-fixes.js`
4. `lyric/install-lyric-fixes.js` (renames "Michela character" to Lyric Epistímonas)
Update 2026-11-02 (second pass): Hybrid Transformation, Blood Maledict = prof, Rage stand-in removed (Hellsing); Trance/Eladrin Season long-rest picker and Absorb Elements (Lyric); 6 prepared spells and Fey Ancestry (Silkie); new Silent Silk installer. Re-run each installer.
 

## Per character
| Character | File | What it does |
|---|---|---|
| Silkie | silkie/install-silkie-fixes.js | Unarmored Defense on (AC 10 + Dex + Cha = 17), Unarmed Strike uses Dex and its Bardic Damage die scales, Agile Strikes free Unarmed Strike after Bardic Inspiration, Robe of Useful Items "Detach a Patch" (4d4 random patches rolled once, gold and gear added), 6 prepared spells, Fey Ancestry added |
| Silent Silk | silent-silk/install-silent-silk-fixes.js | Spells on Charisma (Poison Spray +5, Faerie Fire DC 13), Psionic Power (all on LR, 1 on SR), Psi-Bolstered Knack pop-up on a failed proficient check with a DC (die spent only on success), Psychic Whispers (rolls hours, first use per LR free), Robe "Detach a Patch", Psychic Blade quantity fix |
| Hellsing | hellsing/install-hellsing-fixes.js | Hemocraft DC from Int (13), Crimson Rite = Rite of the Flame on one chosen weapon (bonus action, 1d4 necrotic to himself, +1d4 fire on hits, magical, ends on a rest; replaces the borrowed Divine Favor), Bloated Agony (no Stunned; spends Blood Maledict; disadvantage on Str/Dex checks, 1d8 necrotic on a second attack; Amplify option), Shifting (Beasthide only, one copy, temp HP 2 x prof + 1d6, prof uses per long rest), Blood Maledict = prof, Hybrid Transformation (Transform / Revert / Configure Look; animations + optional token art; Feral Might, Resilient Hide, Bloodlust at turn start), Rage stand-in removed |
| Lyric | lyric/install-lyric-fixes.js | Rename, Wild Shape single counter (Tsuki's fix), Starry Form + Wild Companion on Chris's Premades and spending Wild Shape, Fey Step Summer fire damage = Wis mod, Trance long-rest pop-up (season + 2 weapon/tool proficiencies until next LR; renames Eladrin Season and Fey Step), Fey Step season riders gated to the current season, Absorb Elements on Chris's Premades |
 
## Known limits / left for the DM
- Hybrid Transformation doesn't end itself on Incapacitated (only 0 HP, 1 hour, or Revert). Bloodlust only checks in combat.
- Psi-Bolstered Knack needs a DC on the roll (DM-requested checks); a bare skill roll has no DC to fail against.
- Silkie and Silent Silk share one Robe of Useful Items (patches synced between both actors). Both installers must be run once to link them.
- Rite of the Flame is fixed. When he learns a second rite at a higher level, the installer needs a rite choice added.
- Crimson Rite's self-damage goes through temp HP first. The rule says it can't be reduced; this was left as it is.
- Bloated Agony's 1d8 is counted per combat turn: the curse's macro runs on the creature's own attacks, so it only counts while combat is running.
- Silkie's Unarmored Defense doesn't switch itself off if she puts on armor or a shield.
- Silkie's "Prepared 0/0" counter is cosmetic: fix it on the Bard class item.
- Lyric has 9 prepared spells against a limit of 6 (a rules call, not a bug).
- Predatory Strike attacks still show on Hellsing's sheet while he is in Normal Form.
 