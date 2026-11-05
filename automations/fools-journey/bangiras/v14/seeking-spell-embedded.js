// =====================================================================
//  SEEKING SPELL (2024): Chris's Premades 2 (CAT) Embedded Macro, Foundry v14
//  On: the "Metamagic: Seeking Spell" feature (the Nix Module writes it)
//  Event: roll   |   Pass: actorAttackRoll   |   Priority: 50
//  (CPR's own Seeking Spell automation on this feature must stay off.)
//
//  Automatic: he never clicks Seeking Spell. Whenever one of his spell attack
//  rolls misses every target, he's asked whether to spend 1 Sorcery Point to
//  reroll the d20. He must use the new roll. actorAttackRoll runs before Midi
//  decides hit or miss, so the new roll is what counts.
//
//  v14 changes from the v13 copy: CAT scope (document instead of
//  trigger.entity), queryUtils.firstOwner, documentUtils.update.
// =====================================================================
return await (async () => {
    const COST = 1;
    const seeking = document;                        // the Seeking Spell feature
    const me = workflow.actor;
    if (workflow.item?.type !== 'spell' || !workflow.attackRoll || !workflow.targets?.size) return;
 
    // Missed everything? (A natural 1 always misses; otherwise compare to AC.)
    const total = workflow.attackRoll.total;
    const natOne = workflow.attackRoll.dice?.[0]?.total === 1 || workflow.isFumble;
    const missedAll = Array.from(workflow.targets).every(t => {
        const ac = t.actor?.system.attributes.ac.value;
        return natOne || (ac !== undefined && total < ac);
    });
    if (!missedAll) return;
 
    const points = me.items.find(i => i.type === 'feat' && i.name.toLowerCase().trim() === 'sorcery points');
    if (!points || (points.system.uses?.value ?? 0) < COST) return;
 
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const reroll = await dialogUtils.confirm(seeking.name,
        'Your ' + workflow.item.name + ' attack (' + total + ') misses. Spend ' + COST + ' Sorcery Point to reroll the d20? '
        + '(' + points.system.uses.value + ' left. You must use the new roll.)', {userId});
    if (!reroll) return;
 
    await documentUtils.update(points, {'system.uses.spent': (points.system.uses.spent ?? 0) + COST});
    const old = workflow.attackRoll;
    const newRoll = await new Roll(old.formula, old.data, old.options).evaluate();
    await workflow.setAttackRoll(newRoll);
 
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + seeking.name + ':</b> ' + me.name + ' spends ' + COST + ' Sorcery Point and rerolls the attack: '
            + total + ' → <b>' + newRoll.total + '</b>.'
    });
})();
 