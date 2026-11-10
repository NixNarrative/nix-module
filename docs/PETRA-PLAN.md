# Petra build plan (Court of Ravenloft, v13)

Written 2026-11-09. Petra: Sorcerer 18 (Shadow Sorcery 2024), Changeling, HP 175, DC 20, 18 SP (+2 Metamagic Adept). Checklist rows cr-petra-01..74.
Book of Vile Darkness is last (Nix's call).

## Status (2026-11-09)
Built, offline-tested (36 checks on a mock Petra), needs a table test (Court doc steps 10-17f):
- `automations/court-of-ravenloft/world/install-sorcerer-core.js`: all eight Metamagic options, Sorcery Incarnate, Innate Sorcery, Sorcerous Restoration.
- `automations/court-of-ravenloft/petra/install-petra-fixes.js`: Umbral Form, Strength of the Grave 2024, Beasts of Ill Omen, Shadow Walk, duplicate cleanup.
- `automations/court-of-ravenloft/petra/install-petra-spells.js` + `scripts/court/petra-spells.mjs`: Wall of Death, Negative Energy Flood, Finger of Death rise, Prismatic Wall, Sorcerous Burst (59 offline checks: geometry, flows, installer).
- Registry: petra-metamagic (Bangiras's fix-up), sorcerer-core, petra-fixes, petra-spells. Bangiras untouched; move him to the core after Petra's table test.
- Design choice: Empowered is clicked before the spell (no extra pop-up on every Metamagic use); Careful picks allies automatically when they fit.

## Go-to combat spells (Nix, 2026-11-09)
Eldritch Blast, Mind Sliver, Sorcerous Burst, Shield, Absorb Elements, Wither and Bloom, Darkness, Fireball, Blight, Greater Invisibility, Phantasmal Killer, Wall of Death, Negative Energy Flood, Scatter, Circle of Death, Finger of Death, Prismatic Wall.
- Already automated (CPR / Gambit / Nix Fix): Eldritch Blast, Mind Sliver, Shield, Absorb Elements, Wither and Bloom, Darkness, Fireball, Blight, Phantasmal Killer, Scatter, Circle of Death; Greater Invisibility applies Invisible.
- Built 2026-11-09 (Petra: spells, needs table test, Court doc 17a-17e): **Wall of Death**, **Negative Energy Flood**, **Prismatic Wall**; Finger of Death's zombie rise too.
- Sorcerous Burst's exploding d8s: built 2026-11-09 (Petra: spells, Court doc 17f).
- Petra's other spells (not go-to): triage only if they come up.

## Already covered (just apply)
World installers that already list Court of Ravenloft: Counterspell (Spell Duel), Eldritch Blast beams, Darkness & Devil's Sight (recognises Eyes of the Dark), Lucky, War Caster.

## Clean-up on her sheet (no code)
- Delete Strength of the Grave (2014, CPR); the 2024 one inside Power of Shadow is the keeper.
- Delete the second Summon Beast.
- After the Metamagic fix-up, set CPR's automation to None on every option it reports.

## Bring over from Bangiras
- metamagic-fixup.js: as is (generic; 2024 costs, points at her Sorcery Points item).
- Heightened, Twinned, Quickened (2024): same scripts.
- Sorcery Incarnate (second Metamagic while Innate Sorcery is on): same script, widen its option list.
- Sorcerous Restoration short-rest prompt: same script (regains floor(18/2) = 9).
- Not: Seeking Spell (she doesn't have it), Magicians Judge, Fire Shield, Mantle of Flame, Phoenix Spark, Hold spells, ring, shard.
- Refactor needed: Bangiras's installer can't be pointed at Petra. Its Mantle of Flame step falls back to any item named "Innate Sorcery", so it would bolt phoenix fire onto hers. Split the shared sorcerer parts into one "Sorcerer core (2024)" installer used by both.

## Bring over from Akira
- Extended Spell (2024): duration x2 (max 24 h) + advantage on concentration saves. Needs the primed / nixMetamagicPrimeOnly pattern so Sorcery Incarnate can use it as a second option.

## Build new
1. Careful Spell (2024): chosen creatures auto-succeed and take no damage on a half-on-success save. CPR's 2014 version only does the auto-success.
2. Distant / Empowered / Transmuted: costs match 2024 (1 SP). Test CPR's versions first; rewrite only if they can't join Sorcery Incarnate.
3. Innate Sorcery: activity spends a use; advantage on all Sorcerer spell attacks (melee too, e.g. Chill Touch); 2 SP when out of uses (Sorcery Incarnate).
4. Umbral Form: turns on with Innate Sorcery; enable the resistance effect (all but force/radiant); 1/LR or 6 SP; optional 1d10 force when she ends a turn inside a creature/object.
5. Strength of the Grave (2024): at 0 HP, Cha save DC 5 + damage; on success HP = Cha mod + level. Template: Phoenix Spark guard (targetApplyDamage + preventDeath) / Infernal Ascension.
6. Beasts of Ill Omen: 3 SP Summon Beast, no slot/material, optional no concentration (1 minute); enemies within 5 ft of the beast have disadvantage on saves vs her spells (template: Heightened's save-situational macro).
7. Shadow Walk: Bonus Action teleport 120 ft, dim light/darkness to dim light/darkness (CPR teleport like Red Mist; light check optional / GM confirm).

## Spells to triage (DDB-only or partial)
Aura of Desecration (DDB only), Wall of Death (no template), Delayed Blast Fireball (+1d6/round not tracked), Prismatic Spray (random ray not rolled), Prismatic Wall (layers), Contagion, Negative Energy Flood, Create Undead. Build only the ones she'll actually cast (needs Nix's go-to list; the final-battle sim needs it too).

## Last: Book of Vile Darkness
Dark Speech: no save, 3d6 psychic to non-evil creatures within 15 ft, 1d12 psychic to Petra, no daily limit. Command Evil: Dominate Monster DC 18 on an evil target, its own 1/dawn use. Today both share one use and Dark Speech rolls everything on the targets with a DC 17 Cha save.

## v14
Unlike the Illriggers, Petra can go to v14 later: every Bangiras piece above already has a v14 copy.
