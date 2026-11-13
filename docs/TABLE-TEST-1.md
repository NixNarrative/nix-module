# Table test 1: Petra + Dracula vs The Fool's Journey (Nix Fix 1.7.0)

Started 2026-11-10. v13 Barovia world first, then the v14 copy. Shape: docs/FINAL-BATTLE-SIM.md.
Failures go to the List (project doc nix-module/docs/NEXT-UPDATE-LIST.md) as 1.7.1 items.

## Script
- S1 Setup + install order (v13)
- S2 Pre-combat: Heroes' Feast, lair toggle (5 LA), initiative (Feral Instinct)
- Phase 1 (party 12)
  - S3 R1: Petra Innate Sorcery/Umbral Form, Quickened Fireball, Counterspell duel, Sorcerous Burst; Dracula Bloodrift seal dialog (once/turn), Devour bonus, LA Seal/Strike, Telekinetic Seal; Lucky (Westly, Petra), Sentinel (Quez), Punishment, Bloodlash
  - S4 R2: burn + Deathstrike, Fireball on sealed targets (one dialog), Dispater's Supremacy 18 crit, Regeneration / 15 radiant, Careful, Heightened, Twinned, Wall of Death
  - S5 R3: Blood Price / Legendary Resistance (bleed by spell level), Empowered, Transmuted, Distant, Extended, Sorcery Incarnate, Prismatic Wall, Bloodrift forms
  - S6 R4: Negative Energy Flood, Strength of the Grave, Dracula to 0 -> Infernal Ascension, Hellfire Detonation
- Phase 2
  - S7: Infernal Majesty (2d8 Terrorizing Force, Blood Price splash), Master of Hell: Darkness vs Devil's Sight / Daylight, Greatsword, Bloody Arc, Unleashing
  - S8: level up 12 -> 13 (Westly Swashbuckler 13, DCs/scale)
  - S9: 1/day kit (You Die on My Command!, Devastator, Grand Strategist, By the Throat), Hunger Within, Death Wish
- S10 v14 copy: key steps again; Wall of Death / Prismatic Wall ours vs Chris's Premades 2's
- S11 Make stat block on Dracula; rerun S3-S5 highlights on the NPC

## Pass / fail log
| Step | Check | v13 | v14 | Notes |
|---|---|---|---|---|

## Found while planning (not yet failures)
- Daylight / Dawn dispel is not in the Court of Ravenloft campaign list (registry `daylight-dispel`: FJ, JTE). In the Barovia world it isn't offered, so Vina's Daylight won't dispel Master of Hell: Darkness unless it's applied with the campaign switched to The Fool's Journey.
- Party actors in the Barovia world don't show in the Court binding list; party rows (Westly Swashbuckler 13/17 at level-up) need the campaign switched to The Fool's Journey.
