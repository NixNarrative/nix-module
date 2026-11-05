// =====================================================================
//  DEMONIC GAMBLE: Chris's Premades Embedded Macro
//  Put on: Demons Rage > Demonic Gamble activity > Medkit > Embedded Macros
//  Type: Midi Item   |   Pass: preItemRoll   |   Priority: 50
//
//  Target the enemy, then click the activity. It asks how many Hit Dice to
//  wager (up to Proficiency Bonus) and which damage type, then which weapon
//  if he has more than one equipped. The dice are spent, a "Demonic Gamble"
//  effect goes on the Barbarian, and the weapon attack runs automatically:
//    hit           -> normal weapon damage + modifier + Rage + Nd6 of the chosen type
//    critical hit  -> weapon dice and gamble dice both doubled, plus Nd6 temp HP (not doubled)
//    critical miss -> enemy takes nothing; he takes only the Nd6 gamble damage
//  The effect removes itself after that attack (or after 1 round).
//
//  Returning true from this pass cancels the activity, so backing out of the
//  dialog costs nothing.
// =====================================================================
 
const DAMAGE_TYPES = ['fire', 'acid', 'poison'];
const REQUIRE_RAGE = true;
const RAGE_EFFECT_NAMES = ['rage', 'raging', 'demons rage', 'demon\'s rage'];
const EFFECT_IDENTIFIER = 'demonicGambleEffect';
 
// ---- Animations (Sequencer + JB2A) ------------------------------------
// Each path is a Sequencer database path (copy from Sequencer's Database
// Viewer). {color} is swapped for the damage type's colours below, trying each
// in order and using the first one your JB2A has. If none exist, the first
// path that does exist is used with TINT applied instead.
const PLAY_ANIMATIONS = true;
const ANIMATIONS = {
    hit:      'jb2a.thunderwave.center.{color}',           // on the target when the gamble damage lands
    crit:     'jb2a.healing_generic.400px.{color}',          // on the Barbarian when the demon pays out (temp HP)
    backfire: 'jb2a.thunderwave.center.{color}'            // on the Barbarian when a natural 1 blows up in his face
};
const ANIMATION_COLORS = {
    fire:   ['dark_red', 'red', 'dark_red'],
    acid:   ['dark_purple', 'red', 'dark_purple'],
    poison: ['greenyellow', 'red', 'green']
};
// Fallback: colours that ship in the free JB2A, tinted to match the damage type.
const FALLBACK_COLORS = ['orange', 'dark_orange', 'purple', 'blue'];
const TINT = {fire: null, acid: '#8cff3a', poison: '#b04dff'};
const ANIMATION_SCALE = {wager: 1.8, hit: 1.6, crit: 1.4, backfire: 1.8};
 
const actor = workflow.actor;
const title = workflow.activity?.name ?? 'Demonic Gamble';
 
// ---- Gate checks -----------------------------------------------------
if (effectUtils.getEffectByIdentifier(actor, EFFECT_IDENTIFIER)) {
    ui.notifications.warn(title + ': a gamble is already riding on your next attack.');
    return true;
}
const raging = effectUtils.getEffectByIdentifier(actor, 'rage')
    || actor.appliedEffects.some(e => RAGE_EFFECT_NAMES.includes(e.name.toLowerCase()));
if (REQUIRE_RAGE && !raging) {
    ui.notifications.warn(title + ': you can only gamble while raging.');
    return true;
}
if (!game.user.targets.size) {
    ui.notifications.warn(title + ': target the creature you are attacking first.');
    return true;
}
const pb = actor.system.attributes.prof ?? 0;
const classes = actor.items.filter(i => i.type === 'class' && (i.system.levels - i.system.hd.spent) > 0);
if (!pb || !classes.length) {
    ui.notifications.warn(title + ': no Hit Dice left to wager.');
    return true;
}
 
// ---- The prompt (one window: Hit Dice per class + damage type) -------
const inputs = [
    ['selectAmount', classes.map(c => ({
        label: c.name + ' (' + (c.system.levels - c.system.hd.spent) + '/' + c.system.levels + ' ' + c.system.hd.denomination + ')',
        name: c.id,
        options: {image: c.img, minAmount: 0, maxAmount: Math.min(c.system.levels - c.system.hd.spent, pb)}
    })), {displayAsRows: true, totalMax: pb}],
    ['radio', DAMAGE_TYPES.map((type, i) => ({
        label: CONFIG.DND5E.damageTypes[type].label,
        name: type,
        options: {image: constants.damageIcons[type], isChecked: i === 0}
    })), {displayAsRows: true, radioName: 'damageType'}]
];
const content = 'How many Hit Dice will you wager (max ' + pb + ')? Each adds 1d6 if you hit. '
    + 'A critical hit grants that many d6 as temp HP; a critical miss deals them to you.';
const result = await DialogApp.dialog(title, content, inputs, 'okCancel', {width: 460});
if (!result?.buttons) return true;
 
const spends = classes.map(c => ({cls: c, amount: Number(result[c.id] ?? 0)})).filter(s => s.amount > 0);
const dice = spends.reduce((sum, s) => sum + s.amount, 0);
if (!dice) return true;
const damageType = DAMAGE_TYPES.includes(result.damageType) ? result.damageType : DAMAGE_TYPES[0];
const typeLabel = CONFIG.DND5E.damageTypes[damageType].label;
 
// ---- Pick the weapon to attack with ------------------------------------
// Equipped weapons with an attack activity; if several, he chooses.
let weapons = actor.items.filter(i => i.type === 'weapon' && i.system.activities?.some(a => a.type === 'attack'));
const equipped = weapons.filter(i => i.system.equipped);
if (equipped.length) weapons = equipped;
if (!weapons.length) {
    ui.notifications.warn(title + ': no weapon to attack with.');
    return true;
}
const weapon = weapons.length === 1 ? weapons[0]
    : await dialogUtils.selectDocumentDialog(title, 'Attack with which weapon?', weapons);
if (!weapon) return true;
const attackActivity = weapon.system.activities.find(a => a.type === 'attack');
 
// ---- Pay the price ---------------------------------------------------
for (const {cls, amount} of spends) {
    await genericUtils.update(cls, {'system.hd.spent': cls.system.hd.spent + amount});
}
 
// ---- Animation player ------------------------------------------------
// Self-contained so it can also be copied into the effect's script below.
const playAnim = async (key, token, anim) => {
    try {
        if (!anim?.play || !token || !globalThis.Sequencer) return;
        const base = anim.paths?.[key];
        if (!base) return;
        const exists = p => Sequencer.Database.entryExists(p);
        let file = (anim.colors ?? []).map(c => base.replace('{color}', c)).find(exists);
        let tint = null;
        if (!file) {
            file = (anim.fallback ?? []).map(c => base.replace('{color}', c)).find(exists)
                ?? (exists(base) ? base : null);
            tint = anim.tint;
        }
        if (!file) return console.warn('Demonic Gamble | no JB2A animation found for', base);
        const seq = new Sequence().effect().file(file).atLocation(token)
            .scaleToObject(anim.scale?.[key] ?? 1.5);
        if (tint) seq.tint(tint);
        await seq.play();
    } catch (err) {
        console.warn('Demonic Gamble | animation failed', err);
    }
};
const animData = {
    play: PLAY_ANIMATIONS, paths: ANIMATIONS, colors: ANIMATION_COLORS[damageType],
    fallback: FALLBACK_COLORS, tint: TINT[damageType], scale: ANIMATION_SCALE
};
 
// ---- Scripts carried by the effect ---------------------------------------
// These run later in CPR's macro scope, so they only use trigger, workflow and
// CPR utils. trigger.entity is the effect itself.
 
// When the weapon attack finishes: backfire on a natural 1, temp HP on a
// critical hit (plain Nd6, never doubled), then remove the effect.
const onFinish = async () => {
    if (!workflow.activity?.hasAttack || !workflow.targets.size) return;
    const effect = trigger.entity;
    const g = effect.flags.world?.demonicGamble;
    if (!g || workflow.activity.uuid !== g.activityUuid) return;
    const actor = workflow.actor;
    const speaker = ChatMessage.getSpeaker({actor});
    const label = CONFIG.DND5E.damageTypes[g.damageType].label;
    if (workflow.hitTargets.size && !workflow.isFumble) {
        for (const t of workflow.hitTargets) playAnim('hit', t, g.anim);
    }
    if (workflow.isFumble) {
        playAnim('backfire', workflow.token, g.anim);
        const roll = await new Roll(g.dice + 'd6').evaluate();
        await roll.toMessage({speaker, flavor: 'Demonic Gamble: the gamble backfires! (' + label + ')'});
        await workflowUtils.applyDamage([workflow.token], roll.total, g.damageType);
    } else if (workflow.isCritical) {
        playAnim('crit', workflow.token, g.anim);
        const roll = await new Roll(g.dice + 'd6').evaluate();
        await roll.toMessage({speaker, flavor: 'Demonic Gamble: the demon pays out! (Temporary HP)'});
        const currentTemp = actor.system.attributes.hp.temp ?? 0;
        if (roll.total > currentTemp) await genericUtils.update(actor, {'system.attributes.hp.temp': roll.total});
    }
    await genericUtils.remove(effect);
};
 
// Whenever the effect goes away (attack finished, expired, or deleted by
// hand): put the weapon's damage back exactly as it was. Runs on the GM's client.
const onDeleted = async () => {
    const g = trigger.entity.flags.world?.demonicGamble;
    if (!g?.itemUuid) return;
    const item = await fromUuid(g.itemUuid);
    const activity = item?.system.activities.get(g.activityId);
    if (activity) await activity.update({'damage.parts': g.originalParts});
};
 
// ---- Add the gamble dice to the weapon -----------------------------------
// The dice become a real damage part on the weapon's attack activity, exactly
// like typing "4d6 Fire" into the weapon sheet. dnd5e then rolls them with the
// weapon damage: the manual dice prompt asks for them, a critical hit doubles
// them along with the weapon dice, and Midi applies it all to the target.
const originalParts = attackActivity.toObject().damage?.parts ?? [];
const gamblePart = {number: dice, denomination: 6, bonus: '', types: [damageType]};
 
const effectData = {
    name: title + ': ' + dice + 'd6 ' + typeLabel,
    img: workflow.activity?.img ?? workflow.item.img,
    origin: workflow.item.uuid,
    duration: {rounds: 1},
    flags: {
        world: {demonicGamble: {
            dice, damageType, originalParts, anim: animData,
            itemUuid: weapon.uuid, activityId: attackActivity.id, activityUuid: attackActivity.uuid
        }},
        'chris-premades': {
            embeddedMacros: [
                {name: 'Demonic Gamble Resolve', type: 'midi-actor', pass: 'rollFinished', priority: 50,
                    macro: 'const playAnim = ' + playAnim.toString() + ';\nawait (' + onFinish.toString() + ')();'},
                {name: 'Demonic Gamble Cleanup', type: 'effect', pass: 'deleted', priority: 50,
                    macro: 'await (' + onDeleted.toString() + ')();'}
            ]
        }
    }
};
// Effect first, so the cleanup exists before the weapon is changed.
await effectUtils.createEffect(actor, effectData, {identifier: EFFECT_IDENTIFIER});
await attackActivity.update({'damage.parts': [...originalParts, gamblePart]});
playAnim('wager', workflow.token ?? actor.getActiveTokens()[0], animData);
 
await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}),
    content: '<b>' + title + ':</b> ' + actor.name + ' wagers <b>' + dice + '</b> Hit ' + (dice === 1 ? 'Die' : 'Dice')
        + ' on an attack with ' + weapon.name + ' (' + typeLabel + ').'
});
 
// ---- Make the attack -------------------------------------------------
// Cancel the Demonic Gamble activity itself (it has no damage of its own),
// then launch the weapon attack a moment later. The activity is re-fetched
// so the attack uses the updated damage parts.
setTimeout(() => actor.items.get(weapon.id)?.system.activities.get(attackActivity.id)?.use(), 250);
return true;