// =====================================================================
//  BLOOD PRICE: Chris's Premades Embedded Macro
//  Put on: the Demons Rage ITEM (not an activity) > CPR Medkit >
//          Embedded Macros
//  Type: Save   |   Pass: bonus   |   Priority: 50
//
//  Runs after any saving throw he rolls, before the result is posted.
//  If the save fails its DC, he's asked whether to pay the Blood Price
//  (his reaction). The Hit Dice he sacrifices pick the die added to the save:
//      1 HD = d4   2 HD = d6   3 HD = d8   4 HD = d10   5 HD = d12
//  The prompt shows his roll total but never the DC or how close it was.
//  If the save missed by more than 12 (even a max d12 can't save it), no
//  prompt appears. (House ruling: no necrotic damage is taken.)
//
//  Works for any save that has a DC (Midi spell/ability saves, overtime
//  saves, concentration). The prompt goes to the player who owns him.
// =====================================================================
 
const BLOOD_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];   // index = Hit Dice spent - 1
const REQUIRE_RAGE = false;           // the text doesn't require Rage; set true if it should
const RAGE_EFFECT_NAMES = ['rage', 'raging', 'demons rage', 'demon\'s rage'];
const USES_REACTION = true;           // in combat: needs his reaction, and spends it
const SKIP_IF_HOPELESS = true;        // don't ask if even a max d12 can't reach the DC
 
const {roll, actor, saveId} = trigger;
const title = 'Blood Price';
const dc = roll.options?.target;
 
// ---- Only on a failed save with a known DC ------------------------------
if (!dc || roll.total >= dc) return;
const shortfall = dc - roll.total;
if (SKIP_IF_HOPELESS && shortfall > 12) return;
 
if (REQUIRE_RAGE) {
    const raging = effectUtils.getEffectByIdentifier(actor, 'rage')
        || actor.appliedEffects.some(e => RAGE_EFFECT_NAMES.includes(e.name.toLowerCase()));
    if (!raging) return;
}
const inCombat = combatUtils.inCombat();
if (USES_REACTION && inCombat && actorUtils.hasUsedReaction(actor)) return;
 
const hdLeft = actor.items.filter(i => i.type === 'class')
    .reduce((sum, c) => sum + (c.system.levels - c.system.hd.spent), 0);
if (!hdLeft) return;
 
// ---- Ask the player: how many Hit Dice? -----------------------------------
const abilityLabel = CONFIG.DND5E.abilities[saveId]?.label ?? saveId;
// Shows the roll total, never the DC or the margin.
const content = 'You failed a ' + abilityLabel + ' saving throw (rolled ' + roll.total + '). Pay the Blood Price? '
    + '1 HD = d4, 2 = d6, 3 = d8, 4 = d10, 5 = d12.';
const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
const selection = await dialogUtils.selectHitDie(actor, title, content, {max: BLOOD_DICE.length, userId});
if (!selection) return;
const spends = selection.filter(s => s.amount > 0);
const hitDice = spends.reduce((sum, s) => sum + s.amount, 0);
if (!hitDice) return;
const die = BLOOD_DICE[Math.min(hitDice, BLOOD_DICE.length) - 1];
 
// ---- Pay: Hit Dice and reaction -------------------------------------------
for (const {document, amount} of spends) {
    await genericUtils.update(document, {'system.hd.spent': document.system.hd.spent + amount});
}
if (USES_REACTION && inCombat) await actorUtils.setReactionUsed(actor);
 
// ---- Roll the blood die and add it to the save ----------------------------
// The save card shows the new total; the chat line below shows only the die.
const bloodRoll = await new Roll('1' + die).evaluate();
const newRoll = MidiQOL.addRollTo(roll, bloodRoll);
newRoll.data = roll.data;
 
await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: '<b>' + title + ':</b> ' + actor.name + ' sacrifices <b>' + hitDice + '</b> Hit '
        + (hitDice === 1 ? 'Die' : 'Dice') + ' to the Patron and rolls a ' + die
        + ': <b>+' + bloodRoll.total + '</b> to the ' + abilityLabel + ' save.'
});
 
return newRoll;
 