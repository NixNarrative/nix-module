// =====================================================================
//  BLOOD RESTORATION: Chris's Premades Embedded Macro
//  Put on: the Demons Rage ITEM (not an activity) > CPR Medkit >
//          Embedded Macros
//  Type: Midi Actor   |   Pass: rollFinished   |   Priority: 50
//
//  Runs after any attack, spell or ability he uses. If it dropped a living
//  enemy (one with blood) from above 0 HP to 0, he's asked whether to use his
//  reaction to absorb their blood and regain 1 Hit Die.
//  Only asks if he has a spent Hit Die to get back and (in combat) his
//  reaction is still available. One kill = one prompt; a multi-kill only
//  offers it once, since it costs his reaction.
// =====================================================================
 
// Creature types with no blood to absorb. Edit to taste.
const BLOODLESS_TYPES = ['undead', 'construct', 'elemental', 'ooze', 'plant'];
// Exceptions, matched against the creature's name and subtype (case doesn't matter).
// HAS_BLOOD wins over BLOODLESS_TYPES: a Vampire or Vampire Spawn is undead but bleeds.
const HAS_BLOOD = ['vampire', 'dhampir'];
// NO_BLOOD makes an otherwise living creature bloodless, e.g. 'skeleton' if one
// is ever typed as something other than undead.
const NO_BLOOD = ['skeleton'];
const ENEMIES_ONLY = true;            // ignore allies he drops (friendly fire)
const USES_REACTION = true;           // in combat: needs his reaction, and spends it
const REQUIRE_RAGE = false;           // the text doesn't require Rage; set true if it should
const RAGE_EFFECT_NAMES = ['rage', 'raging', 'demons rage', 'demon\'s rage'];
 
const actor = workflow.actor;
const title = 'Blood Restoration';
 
// Does this creature have blood? Name/subtype exceptions first, then its type.
const hasBlood = (target, tokenDoc) => {
    const details = target.system.details ?? {};
    const text = [target.name, tokenDoc?.name, details.type?.subtype, details.type?.custom]
        .filter(Boolean).join(' ').toLowerCase();
    if (NO_BLOOD.some(k => text.includes(k.toLowerCase()))) return false;
    if (HAS_BLOOD.some(k => text.includes(k.toLowerCase()))) return true;
    const type = String(MidiQOL.typeOrRace(target) ?? '').toLowerCase();
    return !BLOODLESS_TYPES.includes(type);
};
 
// ---- Did this use slay a living enemy? ----------------------------------
const slain = (workflow.damageList ?? [])
    .filter(d => (d.oldHP ?? 0) > 0 && (d.newHP ?? 0) <= 0)
    .map(d => {
        const target = fromUuidSync(d.actorUuid);
        const tokenDoc = d.targetUuid ? fromUuidSync(d.targetUuid) : null;
        return {target, tokenDoc};
    })
    .filter(({target}) => target && target.uuid !== actor.uuid)
    .filter(({target, tokenDoc}) => hasBlood(target, tokenDoc))
    .filter(({tokenDoc}) => !ENEMIES_ONLY || !tokenDoc || !workflow.token
        || tokenDoc.disposition !== workflow.token.document.disposition);
if (!slain.length) return;
 
// ---- Can he use it? -----------------------------------------------------
if (REQUIRE_RAGE) {
    const raging = effectUtils.getEffectByIdentifier(actor, 'rage')
        || actor.appliedEffects.some(e => RAGE_EFFECT_NAMES.includes(e.name.toLowerCase()));
    if (!raging) return;
}
const inCombat = combatUtils.inCombat();
if (USES_REACTION && inCombat && actorUtils.hasUsedReaction(actor)) return;
 
// Class with a spent Hit Die to restore; prefer the biggest die (d12 before d8).
const spentClasses = actor.items.filter(i => i.type === 'class' && i.system.hd.spent > 0)
    .sort((a, b) => parseInt(String(b.system.hd.denomination).replace('d', ''))
        - parseInt(String(a.system.hd.denomination).replace('d', '')));
if (!spentClasses.length) return;
const cls = spentClasses[0];
 
// ---- Ask -----------------------------------------------------------------
const victim = slain[0].tokenDoc?.name ?? slain[0].target.name;
const content = victim + ' falls. Use your reaction to absorb their blood and regain 1 Hit Die ('
    + cls.name + ' ' + cls.system.hd.denomination + ')?';
const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
const absorb = await dialogUtils.confirm(title, content, {userId});
if (!absorb) return;
 
// ---- Absorb ---------------------------------------------------------------
await genericUtils.update(cls, {'system.hd.spent': cls.system.hd.spent - 1});
if (USES_REACTION && inCombat) await actorUtils.setReactionUsed(actor);
 
await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: '<b>' + title + ':</b> ' + actor.name + ' absorbs the blood of ' + victim
        + ' and regains 1 Hit Die (' + cls.system.hd.denomination + ').'
});
 