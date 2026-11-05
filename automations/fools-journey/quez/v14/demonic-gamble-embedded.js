// =====================================================================
//  DEMONIC GAMBLE: Chris's Premades 2 (CAT) Embedded Macro, Foundry v14
//  On: Demons Rage > Demonic Gamble activity (Nix Fix writes it)
//  Event: roll   |   Pass: activityPreItemRoll   |   Priority: 50
//
//  Target the enemy, then click the activity. It asks how many Hit Dice to
//  wager (up to Proficiency Bonus), which damage type, then which weapon if
//  he has more than one equipped. The dice are spent, a "Demonic Gamble"
//  effect goes on him, and the weapon attack runs automatically:
//    hit           -> weapon damage + Nd6 of the chosen type
//    critical hit  -> weapon and gamble dice doubled, plus Nd6 temp HP (not doubled)
//    critical miss -> enemy takes nothing; he takes the Nd6 gamble damage
//  The effect removes itself after that attack (or after 1 round).
//  Returning true cancels the Demonic Gamble activity itself (CAT refunds it).
//
//  v14 changes from the v13 copy: Chris's Premades 1's DialogApp is gone, so the
//  wager is two steps (Hit Dice picker, then damage-type buttons); CAT scope
//  (document, no trigger), effect format, documentUtils.
// =====================================================================
return await (async () => {
    const DAMAGE_TYPES = ['fire', 'acid', 'poison'];
    const REQUIRE_RAGE = true;
    const RAGE_NAMES = /^(rage|raging|demons? rage|demon'?s rage)/i;
    const EFFECT_IDENTIFIER = 'demonicGambleEffect';
 
    // ---- Animations (Sequencer + JB2A); {color} is swapped per damage type ----
    const PLAY_ANIMATIONS = true;
    const ANIMATIONS = {
        hit: 'jb2a.thunderwave.center.{color}',
        crit: 'jb2a.healing_generic.400px.{color}',
        backfire: 'jb2a.thunderwave.center.{color}'
    };
    const ANIMATION_COLORS = {fire: ['dark_red', 'red'], acid: ['dark_purple', 'red'], poison: ['greenyellow', 'green']};
    const FALLBACK_COLORS = ['orange', 'dark_orange', 'purple', 'blue'];
    const TINT = {fire: null, acid: '#8cff3a', poison: '#b04dff'};
    const ANIMATION_SCALE = {wager: 1.8, hit: 1.6, crit: 1.4, backfire: 1.8};
 
    const me = workflow.actor;
    const title = workflow.activity?.name ?? 'Demonic Gamble';
    const getFx = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
 
    // ---- Gate checks ---------------------------------------------------
    if (getFx(me, EFFECT_IDENTIFIER)) { ui.notifications.warn(title + ': a gamble is already riding on your next attack.'); return true; }
    const raging = getFx(me, 'rage') || me.appliedEffects.some(e => RAGE_NAMES.test(e.name.trim()));
    if (REQUIRE_RAGE && !raging) { ui.notifications.warn(title + ': you can only gamble while raging.'); return true; }
    if (!game.user.targets.size) { ui.notifications.warn(title + ': target the creature you are attacking first.'); return true; }
    const pb = me.system.attributes.prof ?? 0;
    const hdLeft = me.items.filter(i => i.type === 'class').reduce((s, c) => s + (c.system.levels - c.system.hd.spent), 0);
    if (!pb || !hdLeft) { ui.notifications.warn(title + ': no Hit Dice left to wager.'); return true; }
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
 
    // ---- The wager: Hit Dice, then damage type ---------------------------
    const selection = await dialogUtils.selectHitDie(me, title,
        'How many Hit Dice will you wager (max ' + pb + ')? Each adds 1d6 if you hit. A critical hit grants that many d6 as temp HP; a critical miss deals them to you.',
        {max: pb, userId});
    if (!selection) return true;
    const spends = selection.filter(s => s.amount > 0).map(s => ({cls: s.document, amount: s.amount}));
    const dice = Math.min(pb, spends.reduce((sum, s) => sum + s.amount, 0));
    if (!dice) return true;
    const damageType = await dialogUtils.buttonDialog(title, 'Wagering ' + dice + 'd6. Which damage type?',
        DAMAGE_TYPES.map(t => [CONFIG.DND5E.damageTypes[t].label, t, {image: constants.damageIcons?.[t]}]), {userId});
    if (!DAMAGE_TYPES.includes(damageType)) return true;
    const typeLabel = CONFIG.DND5E.damageTypes[damageType].label;
 
    // ---- Pick the weapon ---------------------------------------------------
    let weapons = me.items.filter(i => i.type === 'weapon' && i.system.activities?.some(a => a.type === 'attack'));
    const equipped = weapons.filter(i => i.system.equipped);
    if (equipped.length) weapons = equipped;
    if (!weapons.length) { ui.notifications.warn(title + ': no weapon to attack with.'); return true; }
    const weapon = weapons.length === 1 ? weapons[0] : await dialogUtils.selectDocumentDialog(title, 'Attack with which weapon?', weapons, {userId});
    if (!weapon) return true;
    const attackActivity = weapon.system.activities.find(a => a.type === 'attack');
 
    // ---- Pay the price -----------------------------------------------------
    let left = dice;
    for (const {cls, amount} of spends) {
        const n = Math.min(amount, left);
        if (n <= 0) break;
        await documentUtils.update(cls, {'system.hd.spent': cls.system.hd.spent + n});
        left -= n;
    }
 
    // ---- Animation player (copied into the effect's macro too) ---------------
    const playAnim = async (key, tok, anim) => {
        try {
            if (!anim?.play || !tok || !globalThis.Sequencer) return;
            const base = anim.paths?.[key];
            if (!base) return;
            const exists = p => Sequencer.Database.entryExists(p);
            let file = (anim.colors ?? []).map(c => base.replace('{color}', c)).find(exists);
            let tint = null;
            if (!file) {
                file = (anim.fallback ?? []).map(c => base.replace('{color}', c)).find(exists) ?? (exists(base) ? base : null);
                tint = anim.tint;
            }
            if (!file) return;
            const seq = new Sequence().effect().file(file).atLocation(tok).scaleToObject(anim.scale?.[key] ?? 1.5);
            if (tint) seq.tint(tint);
            await seq.play();
        } catch (err) { console.warn('Demonic Gamble | animation failed', err); }
    };
    const animData = {play: PLAY_ANIMATIONS, paths: ANIMATIONS, colors: ANIMATION_COLORS[damageType], fallback: FALLBACK_COLORS, tint: TINT[damageType], scale: ANIMATION_SCALE};
 
    // ---- Macros carried by the effect (document = the effect) ------------------
    // roll / actorRollFinished: backfire on a natural 1, temp HP on a crit, then remove.
    const onFinish = async () => {
        if (!workflow.activity?.hasAttack || !workflow.targets?.size) return;
        const effect = document;
        const g = effect.flags.world?.demonicGamble;
        if (!g || workflow.activity.uuid !== g.activityUuid) return;
        const a = workflow.actor;
        const speaker = ChatMessage.getSpeaker({actor: a});
        const label = CONFIG.DND5E.damageTypes[g.damageType].label;
        if (workflow.hitTargets?.size && !workflow.isFumble) for (const t of workflow.hitTargets) playAnim('hit', t, g.anim);
        if (workflow.isFumble) {
            playAnim('backfire', workflow.token, g.anim);
            const roll = await new Roll(g.dice + 'd6').evaluate();
            await roll.toMessage({speaker, flavor: 'Demonic Gamble: the gamble backfires! (' + label + ')'});
            if (workflow.token) await workflowUtils.applyDamage([workflow.token.document], roll.total, g.damageType);
        } else if (workflow.isCritical) {
            playAnim('crit', workflow.token, g.anim);
            const roll = await new Roll(g.dice + 'd6').evaluate();
            await roll.toMessage({speaker, flavor: 'Demonic Gamble: the demon pays out! (Temporary HP)'});
            const cur = a.system.attributes.hp.temp ?? 0;
            if (roll.total > cur) await documentUtils.update(a, {'system.attributes.hp.temp': roll.total});
        }
        await documentUtils.deleteDocument(effect);
    };
    // effect / deleted: put the weapon's damage back exactly as it was.
    const onDeleted = async () => {
        const g = document.flags.world?.demonicGamble;
        if (!g?.itemUuid) return;
        const it = await fromUuid(g.itemUuid);
        const act = it?.system.activities.get(g.activityId);
        if (act) await act.update({'damage.parts': g.originalParts});
    };
 
    // ---- Add the gamble dice to the weapon as a real damage part ---------------
    const originalParts = attackActivity.toObject().damage?.parts ?? [];
    const gamblePart = {number: dice, denomination: 6, bonus: '', types: [damageType]};
    await effectUtils.createEffects(me, [{
        name: title + ': ' + dice + 'd6 ' + typeLabel,
        img: workflow.activity?.img ?? workflow.item.img,
        origin: workflow.item.uuid,
        duration: {value: 1, units: 'rounds'},
        flags: {
            world: {demonicGamble: {dice, damageType, originalParts, anim: animData,
                itemUuid: weapon.uuid, activityId: attackActivity.id, activityUuid: attackActivity.uuid}},
            cat: {identifier: EFFECT_IDENTIFIER, embeddedMacros: [
                {name: 'Demonic Gamble Resolve', event: 'roll', pass: 'actorRollFinished', macros: [{priority: 50,
                    macro: 'return await (async () => {\nconst playAnim = ' + playAnim.toString() + ';\nreturn await (' + onFinish.toString() + ')();\n})();'}]},
                {name: 'Demonic Gamble Cleanup', event: 'effect', pass: 'deleted', macros: [{priority: 50,
                    macro: 'return await (' + onDeleted.toString() + ')();'}]}
            ]}
        }
    }]);
    await attackActivity.update({'damage.parts': [...originalParts, gamblePart]});
    playAnim('wager', workflow.token ?? me.getActiveTokens()[0], animData);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + title + ':</b> ' + me.name + ' wagers <b>' + dice + '</b> Hit ' + (dice === 1 ? 'Die' : 'Dice')
            + ' on an attack with ' + weapon.name + ' (' + typeLabel + ').'});
 
    // ---- Make the attack: cancel this activity, then launch the weapon's ------
    setTimeout(() => me.items.get(weapon.id)?.system.activities.get(attackActivity.id)?.use(), 250);
    return true;
})();
 