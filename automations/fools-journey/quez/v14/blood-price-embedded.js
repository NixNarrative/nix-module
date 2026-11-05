// =====================================================================
//  BLOOD PRICE: Chris's Premades 2 (CAT) Embedded Macro, Foundry v14
//  On: the Demons Rage ITEM (not an activity) (Nix Fix writes it)
//  Event: save   |   Pass: actorBonus   |   Priority: 50
//
//  After any saving throw he rolls, before the result is posted: if it fails
//  its DC he's asked whether to pay the Blood Price (his reaction). Hit Dice
//  sacrificed pick the die added: 1 HD = d4, 2 = d6, 3 = d8, 4 = d10, 5 = d12.
//  The prompt shows his roll total, never the DC. If even a d12 can't save it,
//  no prompt. (House ruling: no necrotic damage.)
//
//  v14 changes from the v13 copy: CAT scope (roll, actor, saveId directly),
//  queryUtils.firstOwner, documentUtils.update, game.combat for "in combat".
// =====================================================================
return await (async () => {
    const BLOOD_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];
    const REQUIRE_RAGE = false;
    const RAGE_NAMES = /^(rage|raging|demons? rage|demon'?s rage)/i;
    const USES_REACTION = true;
    const SKIP_IF_HOPELESS = true;
 
    const title = 'Blood Price';
    const dc = roll?.options?.target ?? config?.target;
    if (!roll || !dc || roll.total >= dc) return;
    if (SKIP_IF_HOPELESS && dc - roll.total > 12) return;
    if (REQUIRE_RAGE) {
        const getFx = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
        if (!getFx(actor, 'rage') && !actor.appliedEffects.some(e => RAGE_NAMES.test(e.name.trim()))) return;
    }
    const inCombat = !!game.combat?.started;
    if (USES_REACTION && inCombat && actorUtils.hasUsedReaction(actor)) return;
    const hdLeft = actor.items.filter(i => i.type === 'class').reduce((s, c) => s + (c.system.levels - c.system.hd.spent), 0);
    if (!hdLeft) return;
 
    const abilityLabel = CONFIG.DND5E.abilities[saveId]?.label ?? saveId;
    const content = 'You failed a ' + abilityLabel + ' saving throw (rolled ' + roll.total + '). Pay the Blood Price? '
        + '1 HD = d4, 2 = d6, 3 = d8, 4 = d10, 5 = d12.';
    const userId = queryUtils.firstOwner(actor, true) ?? game.user.id;
    const selection = await dialogUtils.selectHitDie(actor, title, content, {max: BLOOD_DICE.length, userId});
    if (!selection) return;
    const spends = selection.filter(s => s.amount > 0);
    const hitDice = spends.reduce((sum, s) => sum + s.amount, 0);
    if (!hitDice) return;
    const die = BLOOD_DICE[Math.min(hitDice, BLOOD_DICE.length) - 1];
 
    for (const s of spends) await documentUtils.update(s.document, {'system.hd.spent': s.document.system.hd.spent + s.amount});
    if (USES_REACTION && inCombat) await actorUtils.setReactionUsed(actor);
 
    const bloodRoll = await new Roll('1' + die).evaluate();
    const newRoll = MidiQOL.addRollTo(roll, bloodRoll);
    newRoll.data = roll.data;
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),
        content: '<b>' + title + ':</b> ' + actor.name + ' sacrifices <b>' + hitDice + '</b> Hit ' + (hitDice === 1 ? 'Die' : 'Dice')
            + ' to the Patron and rolls a ' + die + ': <b>+' + bloodRoll.total + '</b> to the ' + abilityLabel + ' save.'});
    return newRoll;
})();
 