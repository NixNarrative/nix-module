// =====================================================================
//  RING OF CHANGING SHAPES: SHIFT SPELL (Chris's Premades Embedded Macro)
//  Put on: the Ring of Changing Shapes ITEM (not an activity) > CPR Medkit >
//          Embedded Macros
//  Type: Midi Actor   |   Pass: preItemRoll   |   Priority: 50
//
//  Activity setup (the ring's Activities tab): add a Utility activity named
//  exactly "Shift Spell" with Uses: Max 1, Recovery: Dawn, and NO consumption.
//  He never clicks it; it only tracks the once-per-dawn use.
//
//  Automatic. Whenever one of his spells is stopped by a Counterspell
//  (our Counterspell macro, or Gambit's Premades), and the ring is equipped and attuned,
//  Shift Spell has its use left, he has 3+ Sorcery Points and (in combat)
//  his reaction, he's offered a different spell to cast instead:
//   - same level as the countered spell or lower,
//   - same casting time,
//   - no consumed material components.
//  It's cast at the countered spell's level without spending a spell slot.
//  Costs: 3 Sorcery Points, his reaction, and Shift Spell's use for the day.
// =====================================================================
 
const COST = 3;
const SHIFT_ACTIVITY_NAME = 'shift spell';
const REQUIRE_EQUIPPED = true;
const REQUIRE_ATTUNED = true;
const USES_REACTION = true;
 
if (workflow.item?.type !== 'spell') return;
const ring = trigger.entity;
const actor = workflow.actor;
 
// Midi fires per-workflow copies of its hooks. Two ways a cast gets countered:
//  - our Counterspell macro: marks wf.nixCounterspelled, then Midi aborts
//    (caught on 'preAbort'),
//  - Gambit's Counterspell: aborts during 'prePreambleComplete'.
const hookNames = ['midi-qol.prePreambleComplete.' + workflow.id, 'midi-qol.preAbort.' + workflow.id];
const hookIds = {};
let handled = false;
const offShift = () => hookNames.forEach(n => Hooks.off(n, hookIds[n]));
const onCountered = async (wf, viaAbortHook) => {
    if (handled || !wf?.aborted) return;            // not countered
    if (viaAbortHook && !wf.nixCounterspelled) return;   // aborted for some other reason
    handled = true;
    offShift();
 
    if (REQUIRE_EQUIPPED && !ring.system.equipped) return;
    if (REQUIRE_ATTUNED && ring.system.attunement && !ring.system.attuned) return;
    const shift = (ring.system.activities?.contents ?? []).find(a => a.name.toLowerCase().trim() === SHIFT_ACTIVITY_NAME);
    if (shift?.uses?.max && !(shift.uses.value > 0)) return;
    const points = actor.items.find(i => i.type === 'feat' && i.name.toLowerCase().trim() === 'sorcery points');
    if (!points || (points.system.uses?.value ?? 0) < COST) return;
    const inCombat = combatUtils.inCombat();
    if (USES_REACTION && inCombat && actorUtils.hasUsedReaction(actor)) return;
 
    // ---- Eligible replacement spells ----------------------------------------
    const level = Number(wf.castData?.castLevel ?? wf.item.system.level ?? 0);
    const activation = wf.activity?.activation?.type;
    const seen = new Set();
    const candidates = actor.items.filter(s => {
        if (s.type !== 'spell' || s.id === wf.item.id) return false;
        if ((s.system.level ?? 0) > level) return false;
        if (s.system.materials?.consumed) return false;
        const act = (s.system.activities?.contents ?? []).find(a => a.activation?.type === activation);
        if (!act) return false;
        const key = s.name + '|' + s.system.level;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => (b.system.level - a.system.level) || a.name.localeCompare(b.name));
    if (!candidates.length) return;
 
    const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
    const pick = await dialogUtils.selectDocumentDialog(ring.name + ': Shift Spell',
        wf.item.name + ' was countered! Spend ' + COST + ' Sorcery Points and your reaction to cast a different spell '
        + '(level ' + level + ' or lower, same casting time) without spending a spell slot?',
        candidates, {showSpellLevel: true, addNoneDocument: true, userId});
    if (!pick) return;
 
    // ---- Pay ------------------------------------------------------------------
    await genericUtils.update(points, {'system.uses.spent': (points.system.uses.spent ?? 0) + COST});
    if (shift?.uses?.max) await shift.update({'uses.spent': (shift.uses.spent ?? 0) + 1});
    if (USES_REACTION && inCombat) await actorUtils.setReactionUsed(actor);
 
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor}),
        content: '<b>' + ring.name + ':</b> the mercury shifts. ' + actor.name + ' casts <b>' + pick.name
            + '</b> instead of the countered ' + wf.item.name + '.'
    });
 
    // ---- Cast it once the countered spell has finished aborting ---------------
    const act = (pick.system.activities?.contents ?? []).find(a => a.activation?.type === activation);
    const pickLevel = pick.system.level ?? 0;
    const usage = {consume: {spellSlot: false}};
    if (pickLevel > 0) usage.spell = {slot: 'spell' + Math.max(level, pickLevel)};
    setTimeout(() => act?.use(usage, {configure: false}), 500);
};
hookIds[hookNames[0]] = Hooks.on(hookNames[0], wf => onCountered(wf, false));
hookIds[hookNames[1]] = Hooks.on(hookNames[1], wf => onCountered(wf, true));
// If this cast is never countered, drop the listeners after a while.
setTimeout(offShift, 600000);
 