// =====================================================================
//  SHADOWFELL SHARD: Chris's Premades 2 (CAT) Embedded Macro, Foundry v14
//  On: the Shadowfell Shard ITEM (the Nix Module writes it)
//  Event: roll   |   Pass: actorRollFinished   |   Priority: 50
//
//  1. He uses a Metamagic option. If the shard is equipped, attuned and has a
//     use left, it becomes "primed" for 1 round.
//  2. He casts the spell. After it fully resolves, he picks one creature the
//     spell targeted and an ability.
//  3. That creature is cursed: disadvantage on its next ability check (skills
//     included) and its next saving throw with that ability. The curse ends
//     after its next roll with that ability (see CURSE_ENDS).
//
//  v14 changes: CAT scope; DialogApp is not in CAT's scope, so the target and
//  the ability are two short dialogs; curse macros use save/check/skill
//  actorSituational + actorPost; effects via effectUtils.createEffects.
// =====================================================================
return await (async () => {
    const METAMAGIC_NAMES = ['careful spell', 'distant spell', 'empowered spell', 'extended spell',
        'heightened spell', 'quickened spell', 'seeking spell', 'subtle spell', 'transmuted spell', 'twinned spell'];
    const REQUIRE_EQUIPPED = true;
    const REQUIRE_ATTUNED = true;
    //   'first' = the curse ends after the creature's next roll with that ability (save OR check)
    //   'both'  = it lasts until it has hit one save AND one check with that ability
    const CURSE_ENDS = 'first';
    const PRIMED_IDENTIFIER = 'shadowfellShardPrimed';
    const CURSE_IDENTIFIER = 'shadowfellShardCurse';
 
    const shard = document;
    const me = workflow.actor;
    const title = shard.name;
    const getEffect = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
 
    const isMetamagic = (it) => it?.type === 'feat' && (
        it.system.type?.subtype === 'metamagic'
        || METAMAGIC_NAMES.includes(it.name.toLowerCase().replace(/^metamagic\s*[:\-–]\s*/, '').trim()));
    const shardReady = () => {
        if (REQUIRE_EQUIPPED && !shard.system.equipped) return false;
        if (REQUIRE_ATTUNED && shard.system.attunement && !shard.system.attuned) return false;
        const uses = shard.system.uses;
        if (uses?.max && !(uses.value > 0)) return false;
        return true;
    };
 
    // ---- Step 1: a Metamagic option was used -> prime the shard ----------------
    if (isMetamagic(workflow.item)) {
        if (!shardReady()) return;
        if (getEffect(me, PRIMED_IDENTIFIER)) return;
        await effectUtils.createEffects(me, [{
            name: title + ': Primed',
            img: shard.img,
            origin: shard.uuid,
            duration: {value: 1, units: 'rounds'},
            flags: {cat: {identifier: PRIMED_IDENTIFIER}}
        }]);
        return;
    }
 
    // ---- Step 2: a spell finished while primed -> offer the curse --------------
    if (workflow.item?.type !== 'spell') return;
    const primed = getEffect(me, PRIMED_IDENTIFIER);
    if (!primed) return;
    const targets = Array.from(workflow.targets ?? []).filter(t => t.actor && t.actor.uuid !== me.uuid);
    if (!targets.length) return;            // e.g. a self spell: stay primed for the real one
    await documentUtils.deleteDocument(primed);
    if (!shardReady()) return;
 
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    let pick = targets[0].document;
    if (targets.length > 1) {
        const chosen = await dialogUtils.selectTargetDialog(title,
            'As ' + workflow.item.name + ' fades, the Shadowfell lingers. Curse which creature it targeted?',
            targets.map(t => t.document), {skipDeadAndUnconscious: false, userId});
        pick = chosen?.[0]?.document ?? chosen?.[0];
        if (!pick) return;
    }
    const cursed = pick?.actor;
    if (!cursed) return;
    const abilityButtons = Object.entries(CONFIG.DND5E.abilities).map(([k, a]) => [a.label, k]);
    abilityButtons.push(['No curse', false]);
    const ability = await dialogUtils.buttonDialog(title,
        'Curse ' + pick.name + ': disadvantage on its next ability check and its next saving throw with which ability?',
        abilityButtons, {userId});
    if (!ability || !CONFIG.DND5E.abilities[ability]) return;
 
    if (shard.system.uses?.max) {
        await documentUtils.update(shard, {'system.uses.spent': (shard.system.uses.spent ?? 0) + 1});
    }
 
    // ---- Step 3: the curse ------------------------------------------------------
    // CAT scope in the save/check/skill events: document = the curse effect,
    // actor = the roller, saveId / checkId / skillId, config, options.
    const onSituational = async () => {
        const c = document.flags.world?.shadowfellCurse;
        if (!c) return;
        const group = KIND === 'save' ? 'save' : 'check';
        if (c.used?.[group]) return;
        const ab = KIND === 'save' ? saveId
            : KIND === 'check' ? checkId
            : (config?.ability ?? actor.system.skills?.[skillId]?.ability);
        if (ab !== c.ability) return;
        options.disadvantage = true;
    };
    const onPost = async () => {
        const effect = document;
        const c = effect.flags.world?.shadowfellCurse;
        if (!c) return;
        const group = KIND === 'save' ? 'save' : 'check';
        if (c.used?.[group]) return;
        const ab = KIND === 'save' ? saveId
            : KIND === 'check' ? checkId
            : (config?.ability ?? actor.system.skills?.[skillId]?.ability);
        if (ab !== c.ability) return;
        const used = {...(c.used ?? {}), [group]: true};
        if (c.ends !== 'both' || (used.save && used.check)) {
            await documentUtils.deleteDocument(effect);
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({actor}),
                content: '<b>Shadowfell Shard:</b> the curse on ' + actor.name + ' fades.'
            });
            return;
        }
        const left = used.save ? 'check' : 'save';
        await documentUtils.update(effect, {
            'flags.world.shadowfellCurse.used': used,
            name: effect.name.replace(/\s*\(.*\)\s*$/, '') + ' (' + c.label + ' ' + left + ' only)'
        });
    };
    const script = (kind, fn) => 'const KIND = ' + JSON.stringify(kind) + ';\nreturn await (' + fn.toString() + ')();';
    const curseMacros = ['save', 'check', 'skill'].flatMap(kind => [
        {name: 'Shadowfell Curse ' + kind, event: kind, pass: 'actorSituational', macros: [{priority: 50, macro: script(kind, onSituational)}]},
        {name: 'Shadowfell Curse ' + kind + ' end', event: kind, pass: 'actorPost', macros: [{priority: 50, macro: script(kind, onPost)}]}
    ]);
 
    const abilityLabel = CONFIG.DND5E.abilities[ability].label;
    const old = getEffect(cursed, CURSE_IDENTIFIER);
    if (old) await documentUtils.deleteDocument(old);
    await effectUtils.createEffects(cursed, [{
        name: title + ': Cursed (' + abilityLabel + ')',
        img: shard.img,
        origin: shard.uuid,
        description: 'Disadvantage on the next ' + abilityLabel + ' ability check and the next '
            + abilityLabel + ' saving throw.',
        flags: {
            world: {shadowfellCurse: {ability, label: abilityLabel, ends: CURSE_ENDS, used: {save: false, check: false}}},
            cat: {identifier: CURSE_IDENTIFIER, embeddedMacros: curseMacros}
        }
    }]);
 
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + title + ':</b> ' + pick.name + ' is cursed: disadvantage on its next '
            + abilityLabel + ' check and ' + abilityLabel + ' saving throw.'
    });
})();
 