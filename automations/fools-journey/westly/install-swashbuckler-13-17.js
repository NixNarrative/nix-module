// =====================================================================
//  SWASHBUCKLER 5.5: LEVEL 13 + 17 FEATURES (Script macro, run as GM)
//  Select the Swashbuckler's token, then run after he levels. Safe to re-run;
//  it only adds what his Rogue level allows.
//   - Level 13 Dashing Strikes: Invigorate and Parrying Stance (Cunning Strike options)
//   - Level 17 Master Duelist: another attack right after a Sneak Attack
// =====================================================================
const SCRIPTS = {
 "INVIGORATE": "await (async () => {\n    const me = workflow.token;\n    if (!me) return;\n    const near = canvas.tokens.placeables.filter(t => t.actor && t.id !== me.id && t.visible && tokenUtils.getDistance(me, t) <= 30\n        && (t.actor.system.attributes?.hp?.value ?? 1) > 0);\n    const allies = near.filter(t => t.document.disposition === me.document.disposition);\n    const list = allies.length ? allies : near;\n    if (!list.length) return;\n    const userId = socketUtils.firstOwner(workflow.actor, true) ?? game.user.id;\n    const pick = await dialogUtils.selectTargetDialog(workflow.activity.name, 'Which creature within 30 ft is invigorated?', list,\n        {skipDeadAndUnconscious: false, coverToken: me, displayDistance: true, userId});\n    const target = pick?.[0];\n    await workflowUtils.updateTargets(workflow, target ? [target] : []);\n})();",
 "PARRY": "await (async () => {\n    const actor = workflow.actor;\n    const roll = await new Roll('1d6').evaluate();\n    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: 'Parrying Stance: bonus to AC until the start of your next turn'});\n    const old = effectUtils.getEffectByIdentifier(actor, 'nixParryingStance');\n    if (old) await genericUtils.remove(old);\n    await effectUtils.createEffect(actor, {\n        name: 'Parrying Stance (+' + roll.total + ' AC)', img: 'icons/skills/melee/sword-shield-stylized-white.webp',\n        origin: workflow.item.uuid, duration: {rounds: 1},\n        changes: [{key: 'system.attributes.ac.bonus', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: '+' + roll.total, priority: 20}],\n        flags: {dae: {specialDuration: ['turnStart']}}\n    }, {identifier: 'nixParryingStance'});\n})();",
 "DUELIST_MARK": "await (async () => {\n    const sneak = workflow.actor.items.find(i => /^sneak attack$/i.test(i.name.trim()));\n    workflow.nixDuelistBefore = {rolls: workflow.damageRolls?.length ?? 0, spent: sneak?.system.uses?.spent ?? 0};\n})();",
 "DUELIST_CHECK": "await (async () => {\n    const b = workflow.nixDuelistBefore;\n    if (!b) return;\n    const sneak = workflow.actor.items.find(i => /^sneak attack$/i.test(i.name.trim()));\n    const spentNow = sneak?.system.uses?.spent ?? 0;\n    if (spentNow > b.spent || (workflow.damageRolls?.length ?? 0) > b.rolls || workflow['chris-premades']?.cunningStrike) workflow.nixSneakUsed = true;\n})();",
 "DUELIST": "await (async () => {\n    const me = workflow.actor;\n    const item = trigger.entity;\n    if (!workflow.nixSneakUsed || !workflow.hitTargets?.size || !workflow.token || !workflow.activity) return;\n    if (workflow.workflowOptions?.nixDuelist) return;\n    const stamp = (game.combat?.id ?? 'none') + ':' + (game.combat?.round ?? 0) + ':' + (game.combat?.turn ?? 0);\n    if (combatUtils.inCombat() && item.getFlag('world', 'nixDuelistTurn') === stamp) return;\n    const target = workflow.hitTargets.first();\n    if (tokenUtils.getDistance(workflow.token, target) > 5) return;\n    const others = canvas.tokens.placeables.filter(t => t.actor && t.id !== workflow.token.id && t.id !== target.id\n        && !t.document.hidden && (t.actor.system.attributes?.hp?.value ?? 1) > 0 && tokenUtils.getDistance(workflow.token, t) <= 5);\n    if (others.length) return;\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const yes = await dialogUtils.confirm(item.name, 'Master Duelist: make another attack against ' + target.document.name + '?', {userId});\n    if (!yes) return;\n    if (combatUtils.inCombat()) await item.setFlag('world', 'nixDuelistTurn', stamp);\n    const activity = workflow.activity;\n    setTimeout(() => workflowUtils.syntheticActivityRoll(activity, [target], {options: {workflowOptions: {nixDuelist: true}}}), 500);\n})();"
};
const lc = s => String(s ?? '').toLowerCase().trim();
const ADD = CONST.ACTIVE_EFFECT_MODES.ADD, OV = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
const cprId = i => i?.flags?.['chris-premades']?.info?.identifier;
async function setMacros(doc, names, add) {
    const kept = (doc.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.setFlag('chris-premades', 'embeddedMacros', kept.concat(add));
}
async function setActivityMacros(item, activity, names, add) {
    const path = 'flags.chris-premades.embeddedActivityMacros.' + activity.id;
    const kept = (foundry.utils.getProperty(item, path) ?? []).filter(m => !names.includes(m.name));
    await item.setFlag('chris-premades', 'embeddedActivityMacros.' + activity.id, kept.concat(add));
}
// Names match with or without a cost suffix, so "Goad" and "Goad (1d6)" are the same activity.
const baseName = s => lc(s).replace(/\s*\(\s*\d+d\d+\s*\)\s*$/, '');
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => baseName(a.name) === baseName(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) {
        await item.createActivity(type, {name, ...data}, {renderSheet: false});
        act = actByName(item, name);
    } else await act.update({name, ...data});
    return actByName(item, name);
}
// One item effect (not transferred) tagged with world.<tag>, created or refreshed.
async function ensureItemEffect(item, tag, data) {
    const old = item.effects.find(e => e.getFlag('world', tag));
    const full = foundry.utils.mergeObject({transfer: false, flags: {world: {[tag]: true}}}, data);
    if (old) { await old.update(full); return item.effects.get(old.id); }
    return (await item.createEmbeddedDocuments('ActiveEffect', [full]))[0];
}
const strikeData = (cost, extra = {}) => foundry.utils.mergeObject({
    activation: {type: 'special', value: null, override: true},
    consumption: {targets: [], scaling: {allowed: false}},
    uses: {max: String(cost), spent: 0, recovery: []},
    range: {units: 'ft', value: '5', override: true},
    target: {affects: {type: 'creature', count: '1'}, override: true},
    duration: {units: 'inst', override: true}
}, extra);
 
// ---- Lucky (2024 feat): Luck Points = proficiency bonus, long rest ----------------------
const isLuckyFeat = i => i.type === 'feat' && lc(i.name).startsWith('lucky') && !/footwork/i.test(i.name)
    && (i.system.type?.value === 'feat' || /luck point/i.test(i.system.description?.value ?? ''));
async function setupLucky(item) {
    const spent = Math.min(Number(item.system.uses?.spent ?? 0), item.actor?.system.attributes?.prof ?? 6);
    await item.update({'system.uses': {max: '@prof', spent, recovery: [{period: 'lr', type: 'recoverAll'}]}});
    // Rebuild: one activity, "Luck Point: Advantage".
    for (const a of item.system.activities?.contents ?? []) if (a.name !== 'Luck Point: Advantage') await item.update({['system.activities.-=' + a.id]: null});
    if (item.flags?.['chris-premades']?.embeddedActivityMacros) await item.unsetFlag('chris-premades', 'embeddedActivityMacros');
    const act = await ensureActivity(item, 'Luck Point: Advantage', 'utility', {
        img: item.img,
        activation: {type: 'special', value: null, override: true},
        consumption: {targets: [{type: 'itemUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Spends a Luck Point: Advantage on the next D20 Test.'}
    });
    await setActivityMacros(item, act, ['Lucky: Advantage'], [
        {name: 'Lucky: Advantage', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.LUCKY_ADV}]);
    await setMacros(item, ['Lucky: Disadvantage'], [
        {name: 'Lucky: Disadvantage', type: 'midi-actor', pass: 'targetPreAttackRollConfig', priority: 50, macro: SCRIPTS.LUCKY_DIS}]);
}
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Swashbuckler 13/17: select the Swashbuckler\'s token first.');
const report = [];
const level = actor.classes?.rogue?.system.levels ?? actor.system.details?.level ?? 0;
const cs = actor.items.find(i => /^cunning strike$/i.test(i.name.trim()));
if (!cs) return ui.notifications.error(actor.name + ' has no Cunning Strike item.');
 
// ---- Level 13: Dashing Strikes (Invigorate, Parrying Stance) -------------------------------
if (level >= 13) {
    const inv = await ensureItemEffect(cs, 'nixInvigorateFx', {
        name: 'Invigorated', img: 'icons/magic/life/heart-glowing-red.webp', duration: {rounds: 2},
        description: '+1d6 to attack rolls and saving throws until the end of its next turn.',
        changes: ['mwak', 'rwak', 'msak', 'rsak'].map(k => ({key: 'system.bonuses.' + k + '.attack', mode: ADD, value: '+1d6', priority: 20}))
            .concat([{key: 'system.bonuses.abilities.save', mode: ADD, value: '+1d6', priority: 20}]),
        flags: {dae: {specialDuration: ['turnEnd']}}});
    const invigorate = await ensureActivity(cs, 'Invigorate', 'utility', strikeData(2, {
        img: inv.img, range: {units: 'ft', value: '30', override: true}, effects: [{_id: inv.id}],
        description: {chatFlavor: 'One creature within 30 ft adds 1d6 to attack rolls and saving throws until the end of its next turn.'}}));
    await setActivityMacros(cs, invigorate, ['Invigorate target'], [{name: 'Invigorate target', type: 'midi-item', pass: 'preambleComplete', priority: 50, macro: SCRIPTS.INVIGORATE}]);
    const parry = await ensureActivity(cs, 'Parrying Stance', 'utility', strikeData(2, {
        img: 'icons/skills/melee/sword-shield-stylized-white.webp', range: {units: 'self', override: true},
        target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Roll 1d6 and add it to your AC until the start of your next turn.'}}));
    await setActivityMacros(cs, parry, ['Parrying Stance'], [{name: 'Parrying Stance', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.PARRY}]);
    report.push('<li>Dashing Strikes: <b>Invigorate</b> (2d6) and <b>Parrying Stance</b> (2d6) added to the Cunning Strike menu.</li>');
} else report.push('<li>Rogue level ' + level + ': Dashing Strikes (level 13) not added yet.</li>');
 
// ---- Level 17: Master Duelist --------------------------------------------------------------
if (level >= 17) {
    let duel = actor.items.find(i => /^master duelist/i.test(i.name.trim()));
    if (!duel) duel = (await actor.createEmbeddedDocuments('Item', [{name: 'Master Duelist', type: 'feat',
        img: 'icons/skills/melee/swords-parry-block-yellow.webp',
        system: {type: {value: 'class', subtype: ''}, requirements: 'Swashbuckler 17',
            description: {value: '<p><em>Swashbuckler 5.5 update.</em> Immediately after you use your Sneak Attack, you can make another attack against the same target if you are within 5 feet of it and no other creatures are within 5 feet of you.</p>'}}}]))[0];
    await setMacros(duel, ['Master Duelist mark', 'Master Duelist check', 'Master Duelist'], [
        {name: 'Master Duelist mark', type: 'midi-actor', pass: 'damageRollComplete', priority: 210, macro: SCRIPTS.DUELIST_MARK},
        {name: 'Master Duelist check', type: 'midi-actor', pass: 'damageRollComplete', priority: 220, macro: SCRIPTS.DUELIST_CHECK},
        {name: 'Master Duelist', type: 'midi-actor', pass: 'rollFinished', priority: 600, macro: SCRIPTS.DUELIST}]);
    report.push('<li><b>Master Duelist</b>: after a Sneak Attack within 5 ft (and no one else within 5 ft of him) he is offered another attack against the same target.</li>');
} else report.push('<li>Rogue level ' + level + ': Master Duelist (level 17) not added yet.</li>');
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Swashbuckler 13 / 17 on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 