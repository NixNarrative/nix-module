// =====================================================================
//  LUCKY (2024 feat): WORLD INSTALLER (Script macro, run as GM, nothing selected)
//  Sets up every character with the Lucky feat. Safe to re-run.
//   - Luck Points = proficiency bonus, regained on a long rest
//   - "Luck Point: Advantage": Advantage on the next D20 Test
//   - When attacked: asked whether to spend a point to give the attack Disadvantage
// =====================================================================
const SCRIPTS = {
 "LUCKY_ADV": "await (async () => {\n    const actor = workflow.actor;\n    const old = effectUtils.getEffectByIdentifier(actor, 'nixLuckyAdvantage');\n    if (old) await genericUtils.remove(old);\n    await effectUtils.createEffect(actor, {\n        name: 'Lucky: Advantage', img: workflow.item.img, origin: workflow.item.uuid,\n        description: 'Advantage on the next D20 Test (attack roll, ability check or saving throw).',\n        changes: [{key: 'flags.midi-qol.advantage.all', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '1', priority: 20}],\n        flags: {dae: {specialDuration: ['1Attack', 'isSave', 'isCheck', 'isSkill']}}\n    }, {identifier: 'nixLuckyAdvantage'});\n})();",
 "LUCKY_DIS": "await (async () => {\n    const lucky = trigger.entity;\n    const me = lucky.actor;\n    if (!workflow.actor || workflow.actor.uuid === me.uuid) return;\n    const myTok = Array.from(workflow.targets ?? []).find(t => t?.actor?.uuid === me.uuid);\n    if (!myTok) return;\n    if (workflow.token && workflow.token.document.disposition === myTok.document.disposition) return;\n    // Already decided before an Eldritch Blast's dice windows: use that, don't ask again.\n    const pend = globalThis.nixLuckyPending;\n    if (pend?.attacker === workflow.actor.uuid && pend.queues?.[me.uuid]) {\n        if (pend.queues[me.uuid].shift()) workflow.tracker.disadvantage.add(lucky.name, lucky.name);\n        return;\n    }\n    if (!(lucky.system.uses?.value > 0)) return;\n    if (workflow.nixLuckyAsked?.has?.(me.uuid)) return;\n    (workflow.nixLuckyAsked ??= new Set()).add(me.uuid);\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const yes = await dialogUtils.confirm(lucky.name,\n        '<b>' + workflow.actor.name + '</b> is attacking <b>' + me.name + '</b> with ' + workflow.item.name\n        + '.<br>Spend a Luck Point to give the attack Disadvantage? (' + lucky.system.uses.value + ' left)', {userId});\n    if (!yes) return;\n    await genericUtils.update(lucky, {'system.uses.spent': (lucky.system.uses.spent ?? 0) + 1});\n    workflow.tracker.disadvantage.add(lucky.name, lucky.name);\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>' + lucky.name + ':</b> ' + me.name + ' spends a Luck Point. ' + workflow.actor.name + '\\'s attack has Disadvantage.'});\n})();"
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
 
// Every actor in the world (and every unlinked token on every scene) with the 2024 Lucky feat.
const done = [];
const handle = async (actor, where) => {
    for (const item of actor.items.filter(isLuckyFeat)) { await setupLucky(item); done.push(actor.name + where); }
};
for (const a of game.actors) await handle(a, '');
for (const s of game.scenes) for (const t of s.tokens) if (!t.actorLink && t.actor) await handle(t.actor, ' (token on ' + s.name + ')');
await ChatMessage.create({whisper: [game.user.id], content: '<b>Lucky set up</b> (' + done.length + '): ' + (done.join(', ') || 'no Lucky feats found')
    + '<br>Luck Points = proficiency bonus, regained on a long rest. Use <b>Luck Point: Advantage</b> before a roll for Advantage on the next D20 Test; when attacked, the owner is asked whether to spend a point for Disadvantage.'});