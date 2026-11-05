# v14 port: world installers
 
2026-11-03. Nix Fix 1.2.0. Built against the PostCPR exports (Foundry 14.369, dnd5e 6.0.6, Chris's Premades 2.1.6, CAT 0.1.6).
**Status: written and checked offline, not tested at the table yet.** Same model as the Bangiras pilot (`docs/V14-PILOT-BANGIRAS.md`).
 
## What's ported
| Automation | v14 file | CAT event / pass | What changed |
|---|---|---|---|
| Counterspell (Spell Duel + Subtle) | `world/v14/install-counterspell.js` | roll / `scenePreambleComplete` 10 | Cancels by returning `true`. Slot lost: sets `keepConsumption`. Tie or nat-20 upset: CAT refunds the slot (replaces the old chat-card refund). Rolls on the client running the cast (no `remoteRoll` on CAT). Fires `Hooks.callAll('nixCounterspelled', workflow)` after a counter. Warns if a Counterspell also has a Chris's Premades 2 automation. |
| Ring: Shift Spell (Bangiras) | `bangiras/v14/ring-shift-spell-embedded.js` | roll / `actorPreItemRoll` 50 | Listens for `nixCounterspelled` (ours) instead of Midi's abort hook; Gambit's path kept. |
| Eldritch Blast beam windows | `world/v14/install-eldritch-blast.js` | roll / `itemRollFinished` 10 | Works on both Eldritch Blast shapes: CPR2 ("Cast" utility + hidden "Beam" attack, generic `multiSingleTarget` macro) and the old CPR1 one (Nethtari). Fires each beam with `syntheticActivityRoll`, then clears the targets so CPR2's generic stands down. |
| Darkness & Devil's Sight | `world/v14/install-darkness-vision.js` | Darkness: roll / `itemRollFinished` 70, then region `enter` / `left` / `deleted` on the Darkness region | "See in Magical Darkness" now sets `system.attributes.senses.ranges.devilsSight` 120 (CAT's darkness checks read it). Blinded-inside moved to region macros on CPR2's Darkness region. The CPR1 Darkness config flags are removed (configure the look in the Medkit). |
| Daylight / Dawn dispel | `world/v14/install-daylight-dispel.js` | roll / `itemRollFinished` 60 | Looks for magical-darkness Regions (`regionUtils.isMagicalDarkness`), level from `regionUtils.getActivity`. |
| Lucky (2024) | `world/v14/install-lucky.js` | activity `activityRollFinished` 50; item `targetAttackRollConfig` 50 | New effect format; `workflow.tracker` unchanged. |
| War Caster | `world/v14/install-war-caster.js` | (no macro) | Gambit flag only. Report reads activities. Notes when Eldritch Blast won't be offered. |
| Diagnose opportunity attacks | `world/v14/diagnose-opportunity-attacks.js` | (read-only) | Regions only; CAT listed. |
 
## Retired on v14 (Chris's Premades 2 does it)
| Automation | Why | What to do |
|---|---|---|
| Life Bond (Find Steed) | CPR2's 2024 Find Steed has Life Bond built in (`find-steed-life-bond`, at `targetDamageComplete`, with a range setting). Already applied on Akira. | Apply Find Steed in the Medkit; check its Life Bond range is 5 ft. |
| Hold Person / Monster saves | CPR2's Hold Person puts `OverTime ... saveDC=$activity.dc` (end of turn, Wisdom) on its Paralyzed effect, plus "ends if unaffected" and the humanoid check (seen on Tsuki's sheet). That is our fix. | Apply Hold Person in the Medkit on Vina (and Quez). Bangiras's fixes keep his Hold Monster DC live. |
 
The panel shows these as 🏁 **Retired on v14** with the reason, greyed out, and Apply all skips them.
 
## Checked offline
- Every file parses. Every CAT macro the installers write compiles with CAT's scope names as parameters (no re-declared `actor`, `token`, `item`, `document`...), and is wrapped in `return await (async () => {...})();`.
- Each installer ran twice against a mock world built from all ten PostCPR exports: macros are in CAT's stored shape, the second run replaces instead of stacking, and no v13-only helper is left (`trigger.*`, `socketUtils`, `genericUtils.remove/update`, `createEffect`, `combatUtils.inCombat`, `remoteRoll`, `ACTIVE_EFFECT_MODES`, `templateUtils`).
- Installed on: Counterspell (Cordelia; Bangiras not in this batch of exports), Eldritch Blast (Quez, Earwyn, Nethtari), Devil's Sight (Quez, Nethtari), Shadow Arts (Nox), Darkness (Earwyn, Nox, Nethtari x2), Daylight (Vina, Earwyn, Tsuki), Dawn (Vina), Lucky (Westly), War Caster (Vina, Earwyn).

## Found on the sheets
- **Vina's Hold Person won't paralyze on v14.** Its effect has no `paralyzed` status; the condition comes from the old Chris's Premades 1 `conditions` flag, which nothing reads now. Applying CPR2's Hold Person fixes it.
- **Nethtari has two Darkness spells** (two different item IDs) and her Eldritch Blast is still the Chris's Premades 1 version (with the Bident macros). It works with the beam windows; re-applying it in the Medkit would wipe the Bident macros, so wait for her port.
- **Nethtari's Devil's Sight effect has four changes sharing one id** (`ABtljkV1KnXpmf28`). The Darkness installer gives them unique ids.
- **Quez's Devil's Sight still uses `ATL.sight.*`** (DAE Migration not run). The Darkness installer moves the feat's keys to `token.*`.
- **Vina's Dawn** still carries the CPR1 `dawn` tag. Re-apply it in the Medkit if CPR2 has Dawn, then re-run the Daylight installer.
- **Eldritch Blast and War Caster (Earwyn):** CPR2's Eldritch Blast is a Utility "Cast" plus a separate Beam, so Gambit probably won't offer it in the opportunity attack prompt.

## Before testing (v14 copy, as GM)
1. Run **DAE settings > DAE Migration** once if not done (ATL keys).
2. Turn OFF Gambit's Counterspell. In the Medkit, set any Chris's Premades 2 Counterspell automation to None (the installer whisper lists them).
3. Apply in this order: Counterspell, Eldritch Blast, Darkness & Devil's Sight, Daylight / Dawn, Lucky, War Caster. Then Bangiras's Ring: Shift Spell. Read the whispers.
4. CAT setting `displayDebugEventData` on for the first tests.

## Table test checklist
Things the sources couldn't settle are marked **(confirm)**.
- [ ] **Counterspell, basic**: an enemy with Counterspell within 60 ft, opposite disposition. A PC casts: the blind pop-up appears; countering rolls the duel. **(confirm `return true` from `scenePreambleComplete` cancels the cast)**
- [ ] **Counterspell, slot lost**: counterspeller wins: the caster's slot stays spent. **(confirm `keepConsumption`)**
- [ ] **Counterspell, tie**: the spell is countered and the caster's slot comes back (CAT refund).
- [ ] **Counter-counterspell**: the original caster gets the prompt to counter the Counterspell; winning lets the spell go off.
- [ ] **Subtle Spell** (Akira, once ported): no Counterspell prompt.
- [ ] **Distance / sight**: someone 70 ft away or behind a wall gets no prompt; the GM whisper says why. **(confirm `tokenUtils.getDistance` accepts `{wallsBlock}`)**
- [ ] **Shift Spell** (Bangiras): his spell gets countered: offered a replacement for 3 SP + reaction, cast without a slot.
- [ ] **Eldritch Blast, one target**: one window per beam opens at once; each beam resolves with those dice; no extra beams fire afterwards. **(confirm CPR2's `multiSingleTarget` runs after our priority-10 macro and stands down on empty targets)**
- [ ] **Eldritch Blast, two targets**: the beam-assign dialog. **(confirm `selectTargetDialog` `selectAmount` returns `[[{document, value}]]`)**
- [ ] **Darkness**: cast it on a creature without Devil's Sight: Blinded while inside, removed on leaving and when the spell ends. Quez / Nethtari inside: not Blinded, and attacks out of it have no darkness penalty. **(confirm region `enter`/`left` give `token` as a TokenDocument)**
- [ ] **Daylight on Darkness**: overlapping Darkness (level 2) is removed and its caster's concentration ends.
- [ ] **Lucky** (Westly): Luck Point: Advantage gives advantage on his next roll, then ends. When attacked, the prompt appears; yes gives the attack disadvantage. **(confirm `targetAttackRollConfig` runs before the attack is rolled)**
- [ ] **War Caster**: Gambit's opportunity attack prompt lists the reported spells.
- [ ] **Life Bond** (retired): Akira's steed and Akira share healing within 5 ft through CPR2.
- [ ] **Hold Person** (retired): Vina's Hold Person (after applying CPR2's) paralyzes and repeats the save at the end of each turn.
 