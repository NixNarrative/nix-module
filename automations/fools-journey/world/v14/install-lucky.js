// =====================================================================
//  LUCKY (2024 feat), Foundry v14 (Chris's Premades 2 / CAT) copy
//  World installer: run by Nix Fix (or as a Script macro, as GM, nothing selected).
//  Sets up every character with the Lucky feat. Safe to re-run.
//   - Luck Points = proficiency bonus, regained on a long rest
//   - "Luck Point: Advantage": Advantage on the next D20 Test
//     (activity macro: roll / activityRollFinished / 50)
//   - When attacked: asked whether to spend a point to give the attack
//     Disadvantage (item macro: roll / targetAttackRollConfig / 50)
//  Removes the inert v13 copies (flags.chris-premades).
// =====================================================================
const lc = s => String(s ?? '').toLowerCase().trim();
const run = fn => 'return await (' + fn.toString() + ')();';
 
// ---- Activity macro: Advantage on the next D20 Test ----------------------------------
const luckyAdv = async () => {
    const me = workflow.actor;
    const get = (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier);
    const old = get(me, 'nixLuckyAdvantage');
    if (old) await documentUtils.deleteDocument(old);
    await effectUtils.createEffects(me, [{
        name: 'Lucky: Advantage', img: workflow.item.img, origin: workflow.item.uuid,
        description: 'Advantage on the next D20 Test (attack roll, ability check or saving throw).',
        duration: {value: 3600, units: 'seconds'},
        system: {changes: [{key: 'flags.midi-qol.advantage.all', type: 'override', value: '1', priority: 20}]},
        flags: {cat: {identifier: 'nixLuckyAdvantage'}, dae: {specialDuration: ['1Attack', 'isSave', 'isCheck', 'isSkill']}}
    }]);
};
// ---- Item macro: someone attacks the Lucky character --------------------------------
const luckyDis = async () => {
    const lucky = document;
    const me = lucky.parent;
    if (!workflow?.actor || workflow.actor.uuid === me.uuid) return;
    if (!(lucky.system.uses?.value > 0)) return;
    if (workflow.nixLuckyAsked?.has?.(me.uuid)) return;
    (workflow.nixLuckyAsked ??= new Set()).add(me.uuid);
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm(lucky.name,
        '<b>' + workflow.actor.name + '</b> is attacking <b>' + me.name + '</b> with ' + workflow.item.name
        + '.<br>Spend a Luck Point to give the attack Disadvantage? (' + lucky.system.uses.value + ' left)', {userId});
    if (!yes) return;
    await documentUtils.update(lucky, {'system.uses.spent': (lucky.system.uses.spent ?? 0) + 1});
    workflow.tracker.disadvantage.add(lucky.name, lucky.name);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + lucky.name + ':</b> ' + me.name + ' spends a Luck Point. ' + workflow.actor.name + '\'s attack has Disadvantage.'});
};
 
// Names match with or without a cost suffix.
const baseName = s => lc(s).replace(/\s*\(\s*\d+d\d+\s*\)\s*$/, '');
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => baseName(a.name) === baseName(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update({name, ...data});
    return actByName(item, name);
}
 
const isLuckyFeat = i => i.type === 'feat' && lc(i.name).startsWith('lucky') && !/footwork/i.test(i.name)
    && (i.system.type?.value === 'feat' || /luck point/i.test(i.system.description?.value ?? ''));
const premade = i => {
    const cat = i.flags?.cat ?? {};
    return cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades');
};
const warnings = [];
async function setupLucky(item) {
    const spent = Math.min(Number(item.system.uses?.spent ?? 0), item.actor?.system.attributes?.prof ?? 6);
    await item.update({'system.uses': {max: '@prof', spent, recovery: [{period: 'lr', type: 'recoverAll'}]}});
    for (const a of item.system.activities?.contents ?? []) if (a.name !== 'Luck Point: Advantage') await item.update({['system.activities.-=' + a.id]: null});
    const act = await ensureActivity(item, 'Luck Point: Advantage', 'utility', {
        img: item.img,
        activation: {type: 'special', value: null, override: true},
        consumption: {targets: [{type: 'itemUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Spends a Luck Point: Advantage on the next D20 Test.'}
    });
    const actList = foundry.utils.deepClone(act.flags?.cat?.embeddedMacros ?? []).filter(m => m.name !== 'Lucky: Advantage');
    actList.push({name: 'Lucky: Advantage', event: 'roll', pass: 'activityRollFinished', macros: [{priority: 50, macro: run(luckyAdv)}]});
    await act.update({'flags.cat.embeddedMacros': actList});
    const list = foundry.utils.deepClone(item.flags?.cat?.embeddedMacros ?? []).filter(m => !['Lucky: Disadvantage', 'Lucky: Advantage'].includes(m.name));
    list.push({name: 'Lucky: Disadvantage', event: 'roll', pass: 'targetAttackRollConfig', macros: [{priority: 50, macro: run(luckyDis)}]});
    const updates = {'flags.cat.embeddedMacros': list};
    const cpr = item.flags?.['chris-premades'] ?? {};
    if (cpr.embeddedMacros?.length) updates['flags.chris-premades.embeddedMacros'] = cpr.embeddedMacros.filter(m => !/^Lucky: /.test(m.name));
    if (cpr.embeddedActivityMacros) updates['flags.chris-premades.-=embeddedActivityMacros'] = null;
    await item.update(updates);
    if (premade(item)) warnings.push(item.actor.name + ': ' + item.name + ' also has a Chris\'s Premades 2 automation. Set it to None in the Medkit so Luck Points aren\'t asked twice.');
}
 
const done = [];
const handle = async (a, where) => {
    for (const item of a.items.filter(isLuckyFeat)) { await setupLucky(item); done.push(a.name + where); }
};
for (const a of game.actors) await handle(a, '');
for (const s of game.scenes) for (const t of s.tokens) if (!t.actorLink && t.actor) await handle(t.actor, ' (token on ' + s.name + ')');
await ChatMessage.create({whisper: [game.user.id], content: '<b>Lucky (v14) set up</b> (' + done.length + '): ' + (done.join(', ') || 'no Lucky feats found')
    + '<br>Luck Points = proficiency bonus, regained on a long rest. Use <b>Luck Point: Advantage</b> before a roll for Advantage on the next D20 Test; when attacked, the owner is asked whether to spend a point for Disadvantage.'
    + (warnings.length ? '<ul><li>' + warnings.join('</li><li>') + '</li></ul>' : '')});
 