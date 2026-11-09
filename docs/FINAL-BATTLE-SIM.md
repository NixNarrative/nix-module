# Final battle simulation brief (Court of Ravenloft vs The Fool's Journey)

Handoff written 2026-11-09. Numbers for a future session; nothing to build in Foundry.

## The fight
- **Heroes:** The Fool's Journey party, buffed by Vina's Heroes' Feast (each hero: +2d10 max and current HP, immune to poison and the frightened condition, advantage on Wisdom saves).
- **Villains:** Dracula and Petra.
- **Phase 1:** about 4 rounds. **Phase 2** (Dracula's Infernal Ascension: back to full HP, Infernal Majesty on, Master of Hell: Darkness): about another 4 rounds.
- **Level up:** the heroes are level 12, and **level up to 13 in the middle of phase 2** (pick the round, e.g. after phase 2 round 2; model the level-13 changes from that point).
- **Method (Nix's choice):** just play it out with the current stats and report how many rounds each phase actually lasts, who is standing, HP over time. No HP tuning.

## Sources
- **Heroes:** Party Ability Checklist artifact (slug `SPMusTTQK23JAi16T9kgni`), collections `characters` and `items` (campaign "The Fool's Journey"). Build each hero's turn from the checklist rows plus standard level-12/13 math; flag every guess.
  - Earwyn: Paladin 12 (Oathbreaker), High Elf, AC 21, HP 109, spell DC 16
  - Bangiras: Sorcerer 12 (Phoenix, UA), Red Dragonborn, HP 88, spell DC 17, 12 SP (AC not on the checklist)
  - Vina: Cleric 12 (Light), Aasimar, AC 19, HP 96, spell DC 17
  - Westly: Rogue 12 (Swashbuckler), Tabaxi, AC 17, HP 85, Init +9
  - Quez: Barbarian 8 (World Tree) / Druid 3 (Moon) / Warlock 1, Tortle, AC 17, HP 135
  - Nethtari: Warlock 12 (Raven Queen, Tome), Tiefling, AC 14, HP 91, spell DC 17, 3 x 5th-level pact slots
- **Dracula:** Illrigger 20 Painkiller. **Max HP 204** (not 145; the checklist summary is out of date). Plate +3; Interdict DC 19 (Cha +5); +14 to hit with Bloodrift. Full kit and the earlier round sims: `nix-module/docs/COURT-OF-RAVENLOFT.md` (sections "Built", "Bloodrift damage per hit", "Dracula's round vs The Fool's Journey", "Lighter round"). Use the lighter round as his default turn: 3 Bloodrift attacks + burn 1 seal (4d6) + Devour 2d10 Bonus Action + Legendary Actions 1 Strike (2) and 2 Seals. Regeneration 20 HP/turn unless 15+ radiant since his last turn. Legendary Resistance 3/day (bleed floor(spell level / 2) d10). Bloodrift extra necrotic die: run both on and off.
- **Petra:** Sorcerer 18 (Shadow Sorcery 2024), Changeling, HP 175, spell DC 20, 18 SP (+2 Metamagic Adept). Rows `cr-petra-NN` in the checklist (campaign "Court of Ravenloft"). Her turn needs to be built from her spells.

## Open questions for Nix at the start
- Dracula's AC (Plate +3 = 21, plus shield or other bonuses?) and saves; Petra's AC.
- Lair: is the final battle in his lair (5 Legendary Actions)?
- Which Bloodrift form / Blood Gauge he starts at.
- Petra's go-to spells and whether she's protected by allies; party tactics (focus Dracula vs Petra first).
