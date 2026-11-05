// =====================================================================
//  SHADOWFELL SHARD: Chris's Premades Embedded Macro
//  Put on: the Shadowfell Shard ITEM > CPR Medkit > Embedded Macros
//  Type: Midi Actor   |   Pass: rollFinished   |   Priority: 50
//
//  1. He uses a Metamagic option (any feature with the Metamagic subtype,
//     or one of METAMAGIC_NAMES). If the shard is equipped and attuned and has
//     a use left, it becomes "primed" for 1 round.
//  2. He casts the spell. AFTER the spell has fully resolved (its attacks,
//     saves and damage are done), he picks one creature the spell targeted and
//     an ability score.
//  3. That creature is cursed: disadvantage on its next ability check (skills
//     included) and its next saving throw using that ability. It's a set-up
//     for the team: allies can exploit it this round, or he can on his next
//     turn. It doesn't affect the spell that triggered it. By default the
//     curse ends after the creature's next roll with that ability (see
//     CURSE_ENDS).
//
//  Uses: set the shard's Uses to Max "@prof", recovering on Long Rest (or
//  Dawn). If no uses are set, it's unlimited.
// =====================================================================
 
const METAMAGIC_NAMES = ['careful spell', 'distant spell', 'empowered spell', 'extended spell',
    'heightened spell', 'quickened spell', 'seeking spell', 'subtle spell', 'transmuted spell', 'twinned spell'];
const REQUIRE_EQUIPPED = true;        // "holding or wearing the shard"
const REQUIRE_ATTUNED = true;
// How the curse ends:
//   'first' = the whole curse ends after the creature's next roll with that
//             ability, save OR check (whichever comes first).
//   'both'  = it lasts until it has hit one save AND one check with that ability.
const CURSE_ENDS = 'first';
const PRIMED_IDENTIFIER = 'shadowfellShardPrimed';
const CURSE_IDENTIFIER = 'shadowfellShardCurse';
 
const shard = trigger.entity;
const actor = workflow.actor;
const title = shard.name;
 
const isMetamagic = (item) => item?.type === 'feat' && (
    item.system.type?.subtype === 'metamagic'
    || METAMAGIC_NAMES.includes(item.name.toLowerCase().replace(/^metamagic\s*[:\-–]\s*/, '').trim()));
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
    if (effectUtils.getEffectByIdentifier(actor, PRIMED_IDENTIFIER)) return;
    await effectUtils.createEffect(actor, {
        name: title + ': Primed',
        img: shard.img,
        origin: shard.uuid,
        duration: {rounds: 1}
    }, {identifier: PRIMED_IDENTIFIER});
    return;
}
 
// ---- Step 2: a spell is being cast while primed -> offer the curse ---------
// rollFinished: the spell is done, so the curse never touches its own rolls.
if (workflow.item?.type !== 'spell') return;
const primed = effectUtils.getEffectByIdentifier(actor, PRIMED_IDENTIFIER);
if (!primed) return;
const targets = Array.from(workflow.targets ?? []).filter(t => t.actor && t.actor.uuid !== actor.uuid);
if (!targets.length) return;            // e.g. a self spell: stay primed for the real one
await genericUtils.remove(primed);
if (!shardReady()) return;
 
const abilities = Object.entries(CONFIG.DND5E.abilities).map(([value, a]) => ({value, label: a.label}));
const inputs = [
    ['radio', targets.map((t, i) => ({
        label: t.document.name,
        name: t.document.uuid,
        options: {image: t.document.texture.src, isChecked: i === 0}
    })), {displayAsRows: true, radioName: 'target'}],
    ['selectOption', [{
        label: 'Ability to curse',
        name: 'ability',
        options: {options: abilities, currentValue: 'wis'}
    }]]
];
const content = 'As ' + workflow.item.name + ' fades, the Shadowfell lingers. Curse one creature it targeted? '
    + 'It has disadvantage on its next ability check and its next saving throw with the chosen ability.';
const result = await DialogApp.dialog(title, content, inputs, 'okCancel', {width: 460});
if (!result?.buttons) return;
const targetDoc = await fromUuid(result.target ?? targets[0].document.uuid);
const ability = CONFIG.DND5E.abilities[result.ability] ? result.ability : 'wis';
const cursed = targetDoc?.actor;
if (!cursed) return;
 
if (shard.system.uses?.max) {
    await genericUtils.update(shard, {'system.uses.spent': (shard.system.uses.spent ?? 0) + 1});
}
 
// ---- Step 3: the curse ------------------------------------------------------
// Scripts carried by the curse effect. They run later in CPR's save/check/skill
// passes, where trigger.entity is the curse effect. KIND is injected per pass.
const onSituational = async () => {
    const c = trigger.entity.flags.world?.shadowfellCurse;
    if (!c) return;
    const group = KIND === 'save' ? 'save' : 'check';
    if (c.used?.[group]) return;
    const ab = KIND === 'save' ? trigger.saveId
        : KIND === 'check' ? trigger.checkId
        : (trigger.config?.ability ?? trigger.actor.system.skills?.[trigger.skillId]?.ability);
    if (ab !== c.ability) return;
    trigger.options.disadvantage = true;
};
const onPost = async () => {
    const effect = trigger.entity;
    const c = effect.flags.world?.shadowfellCurse;
    if (!c) return;
    const group = KIND === 'save' ? 'save' : 'check';
    if (c.used?.[group]) return;
    const ab = KIND === 'save' ? trigger.saveId
        : KIND === 'check' ? trigger.checkId
        : (trigger.config?.ability ?? trigger.actor.system.skills?.[trigger.skillId]?.ability);
    if (ab !== c.ability) return;
    const used = {...(c.used ?? {}), [group]: true};
    if (c.ends !== 'both' || (used.save && used.check)) {
        await genericUtils.remove(effect);
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: trigger.actor}),
            content: '<b>Shadowfell Shard:</b> the curse on ' + trigger.actor.name + ' fades.'
        });
        return;
    }
    // 'both' mode: one half spent. Rename so the table can see what's left.
    const left = used.save ? 'check' : 'save';
    await genericUtils.update(effect, {
        'flags.world.shadowfellCurse.used': used,
        name: effect.name.replace(/\s*\(.*\)\s*$/, '') + ' (' + c.label + ' ' + left + ' only)'
    });
};
const script = (kind, fn) => 'const KIND = ' + JSON.stringify(kind) + ';\nawait (' + fn.toString() + ')();';
const curseMacros = ['save', 'check', 'skill'].flatMap(kind => [
    {name: 'Shadowfell Curse ' + kind, type: kind, pass: 'situational', priority: 50, macro: script(kind, onSituational)},
    {name: 'Shadowfell Curse ' + kind + ' end', type: kind, pass: 'post', priority: 50, macro: script(kind, onPost)}
]);
 
const abilityLabel = CONFIG.DND5E.abilities[ability].label;
await effectUtils.createEffect(cursed, {
    name: title + ': Cursed (' + abilityLabel + ')',
    img: shard.img,
    origin: shard.uuid,
    description: 'Disadvantage on the next ' + abilityLabel + ' ability check and the next '
        + abilityLabel + ' saving throw.',
    flags: {
        world: {shadowfellCurse: {ability, label: abilityLabel, ends: CURSE_ENDS, used: {save: false, check: false}}},
        'chris-premades': {embeddedMacros: curseMacros}
    }
}, {identifier: CURSE_IDENTIFIER});
 
await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: '<b>' + title + ':</b> ' + targetDoc.name + ' is cursed: disadvantage on its next '
        + abilityLabel + ' check and ' + abilityLabel + ' saving throw.'
});
 