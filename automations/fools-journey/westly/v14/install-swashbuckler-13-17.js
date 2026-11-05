// =====================================================================
//  SWASHBUCKLER 5.5: LEVEL 13 + 17, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix when he levels (manual). Safe to re-run; only adds what his
//  Rogue level allows.
//   - Level 13 Dashing Strikes: Invigorate and Parrying Stance (Cunning Strike options)
//   - Level 17 Master Duelist: another attack right after a Sneak Attack
//  v14 changes: CAT activity / item macros, effect format, damage passes split
//  (Sneak Attack is spotted at actorDamageRollBonuses).
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Swashbuckler 13/17 (v14): select the Swashbuckler\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const run = fn => 'return await (' + fn.toString() + ')();';
const entry = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: run(fn)}]});
async function setCat(doc, names, add) {
    const list = foundry.utils.deepClone(doc.flags?.cat?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.update({'flags.cat.embeddedMacros': list.concat(add)});
}
async function dropOld(item, names) {
    const cpr = item.flags?.['chris-premades'] ?? {};
    const upd = {};
    const old = cpr.embeddedMacros ?? [];
    if (old.some(m => names.includes(m.name))) upd['flags.chris-premades.embeddedMacros'] = old.filter(m => !names.includes(m.name));
    for (const [id, list] of Object.entries(cpr.embeddedActivityMacros ?? {})) {
        if (list?.some(m => names.includes(m.name))) upd['flags.chris-premades.embeddedActivityMacros.' + id] = list.filter(m => !names.includes(m.name));
    }
    if (Object.keys(upd).length) await item.update(upd);
}
const baseName = s => lc(s).replace(/\s*\(\s*\d+d\d+\s*\)\s*$/, '');
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => baseName(a.name) === baseName(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update({name, ...data});
    return actByName(item, name);
}
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
 
// ---- Macros -----------------------------------------------------------------------------
// Invigorate activity: roll / activityPreambleComplete / 50.
const invigorate = async () => {
    const mine = workflow.token;
    if (!mine) return;
    const near = canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id && t.visible && tokenUtils.getDistance(mine.document, t.document) <= 30
        && (t.actor.system.attributes?.hp?.value ?? 1) > 0);
    const allies = near.filter(t => t.document.disposition === mine.document.disposition);
    const list = allies.length ? allies : near;
    if (!list.length) return;
    const userId = queryUtils.firstOwner(workflow.actor, true) ?? game.user.id;
    const pick = await dialogUtils.selectTargetDialog(workflow.activity.name, 'Which creature within 30 ft is invigorated?', list.map(t => t.document),
        {skipDeadAndUnconscious: false, coverToken: mine.document, displayDistance: true, userId});
    const target = (pick?.[0]?.document ?? pick?.[0])?.object;
    await workflowUtils.updateTargets(workflow, target ? [target] : []);
};
// Parrying Stance activity: roll / activityRollFinished / 50.
const parry = async () => {
    const me = workflow.actor;
    const roll = await new Roll('1d6').evaluate();
    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: 'Parrying Stance: bonus to AC until the start of your next turn'});
    const getFx = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
    const old = getFx(me, 'nixParryingStance');
    if (old) await documentUtils.deleteDocument(old);
    await effectUtils.createEffects(me, [{
        name: 'Parrying Stance (+' + roll.total + ' AC)', img: 'icons/skills/melee/sword-shield-stylized-white.webp',
        origin: workflow.item.uuid, duration: {value: 1, units: 'rounds', expiry: 'turnStart'},
        system: {changes: [{key: 'system.attributes.ac.bonus', type: 'add', value: '+' + roll.total, priority: 20}]},
        flags: {cat: {identifier: 'nixParryingStance'}}
    }]);
};
// Master Duelist: roll / actorDamageRollBonuses / 5 and / 950: did Sneak Attack add dice?
const duelistMark = async () => {
    const sneak = workflow.actor.items.find(i => /^sneak attack$/i.test(i.name.trim()));
    workflow.nixDuelistBefore ??= {rolls: workflow.damageRolls?.length ?? 0, spent: sneak?.system.uses?.spent ?? 0};
};
const duelistCheck = async () => {
    const b = workflow.nixDuelistBefore;
    if (!b) return;
    const sneak = workflow.actor.items.find(i => /^sneak attack$/i.test(i.name.trim()));
    const sneakRoll = (workflow.damageRolls ?? []).some(r => /sneak/i.test(String(r.options?.flavor ?? '') + String(r.options?.itemName ?? '')));
    if ((sneak?.system.uses?.spent ?? 0) > b.spent || (workflow.damageRolls?.length ?? 0) > b.rolls || sneakRoll) workflow.nixSneakUsed = true;
};
// Master Duelist: roll / actorRollFinished / 600.
const duelist = async () => {
    const me = workflow.actor;
    const feat = document;
    if (!workflow.nixSneakUsed || !workflow.hitTargets?.size || !workflow.token || !workflow.activity) return;
    if (workflow.workflowOptions?.nixDuelist) return;
    const inCombat = !!game.combat?.started;
    const stamp = (game.combat?.id ?? 'none') + ':' + (game.combat?.round ?? 0) + ':' + (game.combat?.turn ?? 0);
    if (inCombat && feat.getFlag('world', 'nixDuelistTurn') === stamp) return;
    const target = workflow.hitTargets.first();
    if (tokenUtils.getDistance(workflow.token.document, target.document) > 5) return;
    const others = canvas.tokens.placeables.filter(t => t.actor && t.id !== workflow.token.id && t.id !== target.id
        && !t.document.hidden && (t.actor.system.attributes?.hp?.value ?? 1) > 0 && tokenUtils.getDistance(workflow.token.document, t.document) <= 5);
    if (others.length) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm(feat.name, 'Master Duelist: make another attack against ' + target.document.name + '?', {userId});
    if (!yes) return;
    if (inCombat) await feat.setFlag('world', 'nixDuelistTurn', stamp);
    const activity = workflow.activity;
    setTimeout(() => workflowUtils.syntheticActivityRoll(activity, [target], {options: {workflowOptions: {nixDuelist: true}}}), 500);
};
 
// ---- Install ----------------------------------------------------------------------------
const level = actor.classes?.rogue?.system.levels ?? actor.system.details?.level ?? 0;
const cs = actor.items.find(i => /^cunning strike$/i.test(i.name.trim()));
if (!cs) return ui.notifications.error(actor.name + ' has no Cunning Strike item.');
 
if (level >= 13) {
    const inv = await ensureItemEffect(cs, 'nixInvigorateFx', {
        name: 'Invigorated', img: 'icons/magic/life/heart-glowing-red.webp', duration: {value: 2, units: 'rounds'},
        description: '+1d6 to attack rolls and saving throws until the end of its next turn.',
        system: {changes: ['mwak', 'rwak', 'msak', 'rsak'].map(k => ({key: 'system.bonuses.' + k + '.attack', type: 'add', value: '+1d6', priority: 20}))
            .concat([{key: 'system.bonuses.abilities.save', type: 'add', value: '+1d6', priority: 20}])},
        flags: {dae: {specialDuration: ['turnEnd']}}});
    const invAct = await ensureActivity(cs, 'Invigorate', 'utility', strikeData(2, {
        img: inv.img, range: {units: 'ft', value: '30', override: true}, effects: [{_id: inv.id}],
        description: {chatFlavor: 'One creature within 30 ft adds 1d6 to attack rolls and saving throws until the end of its next turn.'}}));
    await setCat(invAct, ['Invigorate target'], [entry('Invigorate target', 'roll', 'activityPreambleComplete', 50, invigorate)]);
    const parryAct = await ensureActivity(cs, 'Parrying Stance', 'utility', strikeData(2, {
        img: 'icons/skills/melee/sword-shield-stylized-white.webp', range: {units: 'self', override: true},
        target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Roll 1d6 and add it to your AC until the start of your next turn.'}}));
    await setCat(parryAct, ['Parrying Stance'], [entry('Parrying Stance', 'roll', 'activityRollFinished', 50, parry)]);
    await dropOld(cs, ['Invigorate target', 'Parrying Stance']);
    report.push('<li>Dashing Strikes: <b>Invigorate</b> (2d6) and <b>Parrying Stance</b> (2d6) added to the Cunning Strike menu.</li>');
} else report.push('<li>Rogue level ' + level + ': Dashing Strikes (level 13) not added yet.</li>');
 
if (level >= 17) {
    let duel = actor.items.find(i => /^master duelist/i.test(i.name.trim()));
    if (!duel) duel = (await actor.createEmbeddedDocuments('Item', [{name: 'Master Duelist', type: 'feat',
        img: 'icons/skills/melee/swords-parry-block-yellow.webp',
        system: {type: {value: 'class', subtype: ''}, requirements: 'Swashbuckler 17',
            description: {value: '<p><em>Swashbuckler 5.5 update.</em> Immediately after you use your Sneak Attack, you can make another attack against the same target if you are within 5 feet of it and no other creatures are within 5 feet of you.</p>'}}}]))[0];
    await setCat(duel, ['Master Duelist mark', 'Master Duelist check', 'Master Duelist'], [
        entry('Master Duelist mark', 'roll', 'actorDamageRollBonuses', 5, duelistMark),
        entry('Master Duelist check', 'roll', 'actorDamageRollBonuses', 950, duelistCheck),
        entry('Master Duelist', 'roll', 'actorRollFinished', 600, duelist)]);
    await dropOld(duel, ['Master Duelist mark', 'Master Duelist check', 'Master Duelist']);
    report.push('<li><b>Master Duelist</b>: after a Sneak Attack within 5 ft (and no one else within 5 ft of him) he is offered another attack against the same target.</li>');
} else report.push('<li>Rogue level ' + level + ': Master Duelist (level 17) not added yet.</li>');
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Swashbuckler 13 / 17 (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 