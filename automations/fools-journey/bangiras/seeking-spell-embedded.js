// =====================================================================
//  SEEKING SPELL (2024): Chris's Premades Embedded Macro
//  Put on: the "Metamagic: Seeking Spell" feature > CPR Medkit >
//          Embedded Macros
//  Type: Midi Actor   |   Pass: postAttackRoll   |   Priority: 50
//  (CPR's own automation on this feature must be set to None.)
//
//  Automatic: he never clicks Seeking Spell. Whenever one of his spell attack
//  rolls misses every target, he's asked whether to spend 1 Sorcery Point to
//  reroll the d20. He must use the new roll. It runs before Midi decides hit
//  or miss, so the new roll is what counts (and it goes through your manual
//  dice prompt).
// =====================================================================
 
const COST = 1;
const SORCERY_POINT_NAMES = ['sorcery points'];
 
const item = trigger.entity;                       // the Seeking Spell feature
const actor = workflow.actor;
if (workflow.item?.type !== 'spell' || !workflow.attackRoll || !workflow.targets?.size) return;
 
// Missed everything? (A natural 1 always misses; otherwise compare to AC.)
const total = workflow.attackRoll.total;
const natOne = workflow.attackRoll.dice?.[0]?.total === 1 || workflow.isFumble;
const missedAll = Array.from(workflow.targets).every(t => {
    const ac = t.actor?.system.attributes.ac.value;
    return natOne || (ac !== undefined && total < ac);
});
if (!missedAll) return;
 
const points = actor.items.find(i => i.type === 'feat' && SORCERY_POINT_NAMES.includes(i.name.toLowerCase().trim()));
if (!points || (points.system.uses?.value ?? 0) < COST) return;
 
const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
const reroll = await dialogUtils.confirm(item.name,
    'Your ' + workflow.item.name + ' attack (' + total + ') misses. Spend ' + COST + ' Sorcery Point to reroll the d20? '
    + '(' + points.system.uses.value + ' left. You must use the new roll.)', {userId});
if (!reroll) return;
 
await genericUtils.update(points, {'system.uses.spent': (points.system.uses.spent ?? 0) + COST});
const old = workflow.attackRoll;
const newRoll = await new Roll(old.formula, old.data, old.options).evaluate();
await workflow.setAttackRoll(newRoll);
 
await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: '<b>' + item.name + ':</b> ' + actor.name + ' spends ' + COST + ' Sorcery Point and rerolls the attack: '
        + total + ' → <b>' + newRoll.total + '</b>.'
});
 