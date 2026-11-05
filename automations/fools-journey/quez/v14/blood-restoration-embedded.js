// =====================================================================
//  BLOOD RESTORATION: Chris's Premades 2 (CAT) Embedded Macro, Foundry v14
//  On: the Demons Rage ITEM (not an activity) (Nix Fix writes it)
//  Event: roll   |   Pass: actorRollFinished   |   Priority: 50
//
//  After anything he uses: if it dropped a living enemy (one with blood) from
//  above 0 HP to 0, he's asked whether to use his reaction to absorb their
//  blood and regain 1 Hit Die. One prompt per use (it costs his reaction).
//
//  v14 changes from the v13 copy: queryUtils.firstOwner, documentUtils.update,
//  game.combat for "in combat". workflow.damageList is unchanged in Midi 14.
// =====================================================================
return await (async () => {
    const BLOODLESS_TYPES = ['undead', 'construct', 'elemental', 'ooze', 'plant'];
    const HAS_BLOOD = ['vampire', 'dhampir'];
    const NO_BLOOD = ['skeleton'];
    const ENEMIES_ONLY = true;
    const USES_REACTION = true;
    const REQUIRE_RAGE = false;
    const RAGE_NAMES = /^(rage|raging|demons? rage|demon'?s rage)/i;
 
    const me = workflow.actor;
    const title = 'Blood Restoration';
    const hasBlood = (target, tokenDoc) => {
        const details = target.system.details ?? {};
        const text = [target.name, tokenDoc?.name, details.type?.subtype, details.type?.custom].filter(Boolean).join(' ').toLowerCase();
        if (NO_BLOOD.some(k => text.includes(k))) return false;
        if (HAS_BLOOD.some(k => text.includes(k))) return true;
        const type = String(MidiQOL.typeOrRace(target) ?? '').toLowerCase();
        return !BLOODLESS_TYPES.includes(type);
    };
    const slain = (workflow.damageList ?? [])
        .filter(d => (d.oldHP ?? 0) > 0 && (d.newHP ?? 0) <= 0)
        .map(d => ({target: fromUuidSync(d.actorUuid), tokenDoc: d.targetUuid ? fromUuidSync(d.targetUuid) : null}))
        .filter(({target}) => target && target.uuid !== me.uuid)
        .filter(({target, tokenDoc}) => hasBlood(target, tokenDoc))
        .filter(({tokenDoc}) => !ENEMIES_ONLY || !tokenDoc || !workflow.token || tokenDoc.disposition !== workflow.token.document.disposition);
    if (!slain.length) return;
 
    if (REQUIRE_RAGE) {
        const getFx = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
        if (!getFx(me, 'rage') && !me.appliedEffects.some(e => RAGE_NAMES.test(e.name.trim()))) return;
    }
    const inCombat = !!game.combat?.started;
    if (USES_REACTION && inCombat && actorUtils.hasUsedReaction(me)) return;
    const spentClasses = me.items.filter(i => i.type === 'class' && i.system.hd.spent > 0)
        .sort((a, b) => parseInt(String(b.system.hd.denomination).replace('d', '')) - parseInt(String(a.system.hd.denomination).replace('d', '')));
    if (!spentClasses.length) return;
    const cls = spentClasses[0];
 
    const victim = slain[0].tokenDoc?.name ?? slain[0].target.name;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const absorb = await dialogUtils.confirm(title, victim + ' falls. Use your reaction to absorb their blood and regain 1 Hit Die ('
        + cls.name + ' ' + cls.system.hd.denomination + ')?', {userId});
    if (!absorb) return;
    await documentUtils.update(cls, {'system.hd.spent': cls.system.hd.spent - 1});
    if (USES_REACTION && inCombat) await actorUtils.setReactionUsed(me);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + title + ':</b> ' + me.name + ' absorbs the blood of ' + victim + ' and regains 1 Hit Die (' + cls.system.hd.denomination + ').'});
})();
 