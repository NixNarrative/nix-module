# Nix Fix

All the homebrew automation for **The Fool's Journey**, **Journey to the East** and **Espalian Escapades** in one Foundry module. Every installer and embedded macro that was tested at the table ships inside it, and the GM applies them from one window instead of pasting Script macros.

(Formerly "Nix Module". Only the name changed: the module ID is still `nix-module`, so the folder, each world's saved bindings and "applied" records, and the scripting API are the same.)

## Install
1. Unzip `nix-module-1.2.0.zip` into your Foundry `Data/modules/` folder, so you have `Data/modules/nix-module/module.json` (replace the old files).
2. Restart Foundry (or return to setup), open a world, and enable **Nix Fix** in Manage Modules. It needs Midi QOL and Chris's Premades (on v14 also CAT).
3. Do the same in each campaign world.

## Using it
Open **Game Settings > Nix Fix** (or the **Nix Fix** button at the bottom of the Settings sidebar). GM only.

1. **Campaign**: auto-detected from the actors in the world. Change it if the guess is wrong.
2. **Characters**: each character is matched to an actor. Actors named "(old)", "(Copy)", "(Updated)" are ranked last. If several match, pick the right one: that choice is saved for this world.
3. **Apply all updates**: runs everything this world hasn't applied yet or that changed since it was applied, in the right order (world installers first, then each character). No token selection needed.
4. Each row also has its own **Apply** button. Manual ones (Westly's Swashbuckler 13/17, the opportunity-attack diagnostic) never run with "Apply all".

Everything is safe to re-apply: every installer replaces what it wrote instead of stacking copies.

**Embedded macros you used to paste** (Seeking Spell, Ring of Changing Shapes, Shadowfell Shard, Demonic Gamble, Blood Price, Blood Restoration) are written onto the right item or activity by the module. Applying them also removes an older hand-pasted copy of the same macro.

## Health check
Run it after any update (Foundry, dnd5e, Midi, Chris's Premades, Gambit, or this module). It's read-only and shows:
- the automation engine and every module's version against the versions the automations were tested with;
- world settings the automations need (Gambit's opportunity attacks ON, Gambit's Counterspell OFF, Midi reactions, Vision 5e...), with **Fix the ones I can**;
- which automations are up to date, need an update, haven't been applied in this world, aren't ported to v14 yet, or are retired on v14;
- every embedded macro in the world (Chris's Premades 1 and CAT), and any that no longer compile;
- look-alike actors, so you know which "Bangiras" the module is using.

## Keeping both worlds the same
**Export settings** saves this world's settings for Midi, Chris's Premades, CAT, Gambit's, Automated Animations, DAE, Times Up, Vision 5e and the rest of the stack to a JSON file. In the other world, **Import settings** shows exactly which settings differ, grouped by module, and copies only the modules you tick. Per-world data (character bindings, what's been applied) never travels.

## Updating
When the automations change, the new module version replaces the files in `automations/`. On the next GM login each world says how many automations have updates; **Apply all updates** re-applies just those.

Optional: **Game Settings > Configure Settings > Nix Fix > Apply automation updates on GM login** re-applies changed automations automatically (new ones still wait for you).

## Foundry v14
The v14 Chris's Premades is a rewrite: Chris's Premades 2 runs on **Coven's Automation Toolkit (CAT)**, which stores embedded macros under a different flag (`flags.cat.embeddedMacros`), with different event names and a different set of helpers in the macro's scope.

So the module has two engines and picks one per world:
- **v13 (Chris's Premades 1):** everything, as table-tested.
- **v14 (Chris's Premades 2 + CAT):** automations with a v14 copy run (world installers and Bangiras so far; the rest of the characters are in progress). Others show **Not ported to v14 yet**; ones Chris's Premades 2 does itself show **Retired on v14** with the reason. Both are greyed out and skipped by Apply all. Embedded macros are written in CAT's format, and the dead v13 copy on the same item is removed. Espalian Escapades stays v13 only.

The module's own code uses only ApplicationV2 / DialogV2 and other APIs present in v13 and v14. The health check, version report and settings export/import work on both, so you can compare a v14 copy of a world against the v13 original. A world copied from v13 shows its applied automations as updates on v14 (they were applied with the v13 files).

Test on a duplicate of each world before moving a campaign. Details: `docs/V14.md`, `docs/V14-PILOT-BANGIRAS.md`, `docs/V14-PORT-WORLD.md`.

## For scripting
`game.modules.get('nix-module').api` exposes `open()`, `applyAll()`, `runEntry(id)`, `statusOf(entry)`, `showHealth()`, `healthReport()`, `exportSettings()`, `pickAndImport()`, `compatReport()`, `detectEngine()`, `bind(characterKey, actorUuid)` and the registry.

## Adding a new automation
1. Put the file in `automations/<campaign>/<character>/` (a v14 copy goes in `<character>/v14/`).
2. Add one entry to `scripts/registry.mjs` (kind, file, campaigns, actors, order, a one-line description). For a pasted embedded macro, give its `target` (item name, optional activity, type, pass, priority). For v14 add `v14: {file, target: {event, pass, priority}}`, or `v14: {retired: 'why'}` when Chris's Premades 2 does it.
3. Bump `version` in `module.json`. Worlds that applied an older copy see it as an update.

## Layout
```
module.json
scripts/        main, registry, runner, undo (Revert), panel, health, compat, world-settings, campaign
automations/    the table-tested scripts, unchanged (v14 copies in v14/ folders)
docs/           campaign READMEs, V14.md, V14-MAPPING.md, V14-PILOT-BANGIRAS.md, V14-PORT-WORLD.md
styles/
```
