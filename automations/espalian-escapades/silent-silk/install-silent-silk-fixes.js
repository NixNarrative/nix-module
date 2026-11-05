// =====================================================================
//  SILENT SILK FIXES (Espalian Escapades): one-click INSTALLER (Script macro, run as GM)
//  Silkie's alter ego: Rogue 3 (Soulknife), Drow. Select Silent Silk's token, then run. Safe to re-run.
//   - Magic Initiate + Drow spells: Charisma (Poison Spray +5, Faerie Fire DC 13; were -2 / DC 10)
//   - Psionic Power: all dice back on a long rest, ONE die back on a short rest (2024 Soulknife)
//   - Psi-Bolstered Knack: pop-up when she fails a proficient skill/tool check with a known DC;
//     the die is only spent if it turns the check into a success
//   - Psychic Whispers: rolls the die for the hours; first use after each long rest is free
//   - Psionic Strike: pop-up after a weapon hit within 30 ft on her turn (once per turn);
//     die + Int Force added to that hit. Manual button fixed (was a flat 1).
//   - Robe of Useful Items: same "Detach a Patch" as Silkie's, sharing one set of patches
// =====================================================================
const SCRIPTS = {
 KNACK: String.raw`return await (async () => {
// Psi-Bolstered Knack: failed ability check using a skill or tool she's proficient with -> roll a
// Psionic Energy Die and add it. The die is expended only if the check then succeeds.
const item = trigger.entity;
const actor = item.actor;
const roll = trigger.roll;
const dc = Number(roll?.options?.target);
if (!roll || !dc || roll.total >= dc || roll.options?.nixKnack) return;
const skill = trigger.skillId;
const tool = trigger.toolId;
let prof = 0;
if (skill) prof = Number(actor.system.skills?.[skill]?.value ?? 0);
else if (tool) prof = Number(actor.system.tools?.[tool]?.value ?? 0);
if (!(prof >= 1)) return;
if (!(item.system.uses?.value > 0)) return;
const lvl = actor.classes?.rogue?.system.levels ?? 3;
const scale = Object.values(actor.system.scale?.soulknife ?? {}).find(v => v?.faces);
const die = scale?.faces ? '1d' + scale.faces : '1d' + (lvl >= 17 ? 12 : lvl >= 11 ? 10 : lvl >= 5 ? 8 : 6);
const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
const what = skill ? (CONFIG.DND5E.skills[skill]?.label ?? skill) : 'tool';
if (!await dialogUtils.confirm('Psi-Bolstered Knack', 'You failed a ' + what + ' check (' + roll.total + ' vs DC ' + dc + '). Roll a Psionic Energy Die (' + die + ') and add it? It is only spent if you then succeed.', {userId})) return;
const r = await new Roll(die).evaluate();
await r.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: 'Psi-Bolstered Knack'});
const out = await rollUtils.addToRoll(roll, String(r.total), {rollData: roll.data});
out.options.nixKnack = true;
if (out.total >= dc) await genericUtils.update(item, {'system.uses.spent': (item.system.uses.spent ?? 0) + 1});
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Psi-Bolstered Knack:</b> +' + r.total + ' (now ' + out.total + ' vs DC ' + dc + '). '
    + (out.total >= dc ? 'Success! The die is spent.' : 'Still a failure, so the die is not spent.')});
return out;
})();`,
 WHISPERS: String.raw`await (async () => {
// Psychic Whispers: roll the Psionic Energy Die for the hours. First use after each long rest is free.
const item = workflow.item;
const actor = workflow.actor;
const lvl = actor.classes?.rogue?.system.levels ?? 3;
const scale = Object.values(actor.system.scale?.soulknife ?? {}).find(v => v?.faces);
const die = scale?.faces ? '1d' + scale.faces : '1d' + (lvl >= 17 ? 12 : lvl >= 11 ? 10 : lvl >= 5 ? 8 : 6);
let free = '';
if (!item.flags?.world?.nixWhispersUsed) {
    await item.setFlag('world', 'nixWhispersUsed', true);
    const spent = item.system.uses?.spent ?? 0;
    if (spent > 0) await genericUtils.update(item, {'system.uses.spent': spent - 1});
    free = ' (first use since her long rest: no die spent)';
}
const r = await new Roll(die).evaluate();
await r.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: 'Psychic Whispers: hours'});
const n = Array.from(workflow.targets ?? []).map(t => t.document.name);
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Psychic Whispers:</b> ' + actor.name + ' links minds with ' + (n.join(', ') || 'up to ' + actor.system.attributes.prof + ' creatures')
    + ' for <b>' + r.total + ' hour' + (r.total > 1 ? 's' : '') + '</b> (telepathy within 1 mile)' + free + '.'});
})();`,
 WHISPERS_REST: String.raw`await (async () => { const it = trigger.entity; if (it.flags?.world?.nixWhispersUsed) await it.unsetFlag('world', 'nixWhispersUsed'); })();`,
 PSI_STRIKE: String.raw`await (async () => {
// Psionic Strike: once on each of her turns, right after she hits a creature within 30 ft with a
// WEAPON attack, she's asked whether to spend a Psionic Energy Die. It's rolled and added to that
// attack's damage as Force: die + Int modifier. Out of combat she's asked on every weapon hit.
const item = trigger.entity;
const actor = item.actor;
if (workflow.actor?.uuid !== actor.uuid || workflow.workflowOptions?.nixPsiStrike) return;
if (workflow.item?.type !== 'weapon' || /^unarmed strike/i.test(workflow.item.name.trim())) return;
if (!workflow.attackRoll || !workflow.hitTargets?.size || !workflow.damageRolls?.length) return;
if (!(item.system.uses?.value > 0)) return;
const me = workflow.token ?? actorUtils.getFirstToken(actor);
const target = Array.from(workflow.hitTargets).find(t => !me || tokenUtils.getDistance(me, t) <= 30);
if (!target) return;
const c = game.combat;
const key = c?.started ? c.id + ':' + c.round + ':' + c.turn : null;
if (key && c.combatant?.actor?.uuid !== actor.uuid) return;               // only on her own turn
if (key && item.flags?.world?.nixPsiStrikeTurn === key) return;           // once per turn
const lvl = actor.classes?.rogue?.system.levels ?? 3;
const scale = Object.values(actor.system.scale?.soulknife ?? {}).find(v => v?.faces);
const die = scale?.faces ? '1d' + scale.faces : '1d' + (lvl >= 17 ? 12 : lvl >= 11 ? 10 : lvl >= 5 ? 8 : 6);
const int = Number(actor.system.abilities?.int?.mod ?? 0);
const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
const left = item.system.uses.value + '/' + item.system.uses.max;
if (!await dialogUtils.confirm('Psionic Strike', 'You hit ' + target.document.name + ' with ' + workflow.item.name + '. Spend a Psionic Energy Die (' + left + ') to deal ' + die + (int >= 0 ? ' + ' : ' - ') + Math.abs(int) + ' extra Force damage?', {userId})) return;
await genericUtils.update(item, {'system.uses.spent': (item.system.uses.spent ?? 0) + 1});
if (key) await item.setFlag('world', 'nixPsiStrikeTurn', key);
await workflowUtils.bonusDamage(workflow, die + (int ? (int > 0 ? ' + ' : ' - ') + Math.abs(int) : '') + '[force]', {damageType: 'force'});
if (globalThis.Sequencer && me) {
    const f = ['jb2a.impact.004.blue', 'jb2a.impact.blue.0', 'jb2a.static_electricity.01.blue'].find(x => { try { return Sequencer.Database.entryExists(x); } catch { return false; } });
    if (f) new Sequence().effect().file(f).atLocation(target).scaleToObject(1.6).play();
}
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Psionic Strike:</b> ' + actor.name + '\'s ' + workflow.item.name + ' crackles with psionic force (+' + die + (int ? (int > 0 ? ' + ' : ' - ') + Math.abs(int) : '') + ' Force). '
    + (item.system.uses.value) + ' Psionic Energy ' + (item.system.uses.value === 1 ? 'Die' : 'Dice') + ' left.'});
})();`,
 ROBE: String.raw`await (async () => {
// Robe of Useful Items: 2 each of six fixed patches + 4d4 random ones (rolled the first time).
// Detaching a patch is a Magic action; the robe becomes ordinary when the last one is gone.
const item = workflow.item;
const actor = workflow.actor;
const BASE = ['Bullseye Lantern', 'Dagger', 'Mirror', 'Pole', 'Rope', 'Sack'];
const TABLE = [[8, 'Bag of 100 GP'], [15, 'Silver coffer (500 GP)'], [22, 'Iron door'], [30, '10 gems (100 GP each)'], [44, 'Wooden ladder (24 ft)'],
    [51, 'Riding Horse with saddle'], [59, 'Open pit (10-ft cube)'], [68, '4 Potions of Healing'], [75, 'Rowboat (12 ft)'],
    [83, 'Spell Scroll (level 1-3, your choice)'], [90, '2 Mastiffs'], [96, 'Window (2 x 4 ft, 2 ft deep)'], [100, 'Portable Ram']];
// Silkie and Silent Silk share one robe: every robe with the same nixRobeGroup holds the same patches.
const group = item.flags?.world?.nixRobeGroup;
const peers = group ? game.actors.contents.flatMap(a => a.items.filter(i => i.flags?.world?.nixRobeGroup === group)) : [item];
if (!peers.includes(item)) peers.push(item);
const saveAll = async v => { for (const p of peers) await p.setFlag('world', 'nixRobe', v); };
let st = peers.map(p => p.flags?.world?.nixRobe).find(v => v?.patches);
if (!st?.patches) {
    const n = (await new Roll('4d4').evaluate()).total;
    const extra = [];
    for (let i = 0; i < n; i++) { const r = (await new Roll('1d100').evaluate()).total; extra.push(TABLE.find(([hi]) => r <= hi)[1]); }
    st = {patches: BASE.flatMap(b => [b, b]).concat(extra)};
    await saveAll(st);
    await ChatMessage.create({whisper: ChatMessage.getWhisperRecipients('GM'), speaker: ChatMessage.getSpeaker({actor}),
        content: '<b>' + item.name + ':</b> the robe\'s ' + n + ' extra patches are: ' + extra.join(', ') + '.'});
}
if (!st.patches.length) { ui.notifications.info(item.name + ': no patches left. It is an ordinary garment now.'); return; }
const counts = {};
for (const p of st.patches) counts[p] = (counts[p] ?? 0) + 1;
const pick = await dialogUtils.buttonDialog(item.name, 'Detach which patch?', Object.entries(counts).map(([p, c]) => [p + (c > 1 ? ' (x' + c + ')' : ''), p]).concat([['Cancel', false]]));
if (!pick) return;
const left = [...st.patches];
left.splice(left.indexOf(pick), 1);
await saveAll({patches: left});
let extra = '';
if (pick === 'Bag of 100 GP') { await actor.update({'system.currency.gp': Number(actor.system.currency?.gp ?? 0) + 100}); extra = ' 100 GP added to her purse.'; }
const COMP = {'Bullseye Lantern': /bullseye/i, 'Dagger': /^dagger$/i, 'Mirror': /mirror/i, 'Pole': /^pole/i, 'Rope': /^rope/i, 'Sack': /^sack$/i, '4 Potions of Healing': /^potion of healing$/i};
if (COMP[pick]) {
    for (const id of ['dnd5e.equipment24', 'dnd5e.items']) {
        const pack = game.packs.get(id);
        if (!pack) continue;
        const idx = await pack.getIndex();
        const hit = idx.find(e => COMP[pick].test(e.name));
        if (!hit) continue;
        const doc = await pack.getDocument(hit._id);
        const data = doc.toObject();
        if (pick === '4 Potions of Healing') data.system.quantity = 4;
        await actor.createEmbeddedDocuments('Item', [data]);
        extra = ' ' + (pick === '4 Potions of Healing' ? '4 Potions of Healing were' : data.name + ' was') + ' added to her inventory.';
        break;
    }
}
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + ' tears off a patch: <b>' + pick + '</b>.' + extra
    + (left.length ? ' ' + left.length + ' patch' + (left.length > 1 ? 'es' : '') + ' left.' : ' That was the last one; the robe is now an ordinary garment.')});
})();`
};
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Silent Silk fixes: select Silent Silk\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
async function setMacros(doc, names, add) {
    const kept = (doc.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.setFlag('chris-premades', 'embeddedMacros', kept.concat(add));
}
async function setActivityMacros(item, activity, add) {
    const names = add.map(m => m.name);
    const kept = (item.flags?.['chris-premades']?.embeddedActivityMacros?.[activity.id] ?? []).filter(m => !names.includes(m.name));
    await item.setFlag('chris-premades', 'embeddedActivityMacros.' + activity.id, kept.concat(add));
}
 
// ---- 1. Spells: Charisma --------------------------------------------------------------------
{
    const spells = actor.items.filter(i => i.type === 'spell');
    for (const sp of spells) {
        await sp.update({'system.ability': 'cha'});
        for (const a of sp.system.activities.contents.filter(a => a.type === 'save')) await a.update({'save.dc': {calculation: 'spellcasting', formula: ''}});
    }
    const atk = actor.system.attributes.prof + actor.system.abilities.cha.mod;
    report.push('<li>Spells: ' + (spells.map(s => s.name).join(', ') || 'none found') + ' now use <b>Charisma</b> (like Silkie): spell attack +' + atk + ', save DC ' + (8 + atk)
        + '. A Rogue has no spellcasting ability of her own, so Poison Spray was at -2 and Faerie Fire at DC 10.</li>');
}
 
// ---- 2. Psionic Power: rest recovery ----------------------------------------------------------
const pp = actor.items.find(i => /^psionic power/i.test(i.name.trim()) && i.system.uses?.max) ?? find(/^psionic power/i);
{
    if (!pp) report.push('<li><b>Psionic Power</b> not found.</li>');
    else {
        await pp.update({'system.uses.recovery': [{period: 'lr', type: 'recoverAll'}, {period: 'sr', type: 'formula', formula: '1'}]});
        report.push('<li>Psionic Power (' + pp.system.uses?.value + '/' + pp.system.uses?.max + '): all dice back on a long rest, <b>one</b> back on a short rest (was all on either).</li>');
    }
}
 
// ---- 3. Psi-Bolstered Knack ---------------------------------------------------------------------
if (pp) {
    await setMacros(pp, ['Knack (skill)', 'Knack (tool)', 'Psychic Whispers: long rest'], [
        {name: 'Knack (skill)', type: 'skill', pass: 'bonus', priority: 300, macro: SCRIPTS.KNACK},
        {name: 'Knack (tool)', type: 'tool', pass: 'bonus', priority: 300, macro: SCRIPTS.KNACK},
        {name: 'Psychic Whispers: long rest', type: 'rest', pass: 'long', priority: 50, macro: SCRIPTS.WHISPERS_REST}]);
    report.push('<li>Psi-Bolstered Knack: when she <b>fails</b> a skill or tool check she\'s proficient in and the roll has a DC, she gets a pop-up to add a Psionic Energy Die. '
        + 'The die is spent only if that makes it a success. (Checks rolled with no DC can\'t tell they failed: use the Knack button by hand for those.)</li>');
    // ---- 4. Psychic Whispers --------------------------------------------------------------------
    const pw = pp.system.activities.contents.find(a => /whisper/i.test(a.name ?? ''));
    if (!pw) report.push('<li>Psychic Whispers: no activity on Psionic Power.</li>');
    else {
        const t = pw.consumption?.targets ?? [];
        if (!t.some(x => x.type === 'itemUses')) await pw.update({'consumption.targets': t.concat([{type: 'itemUses', target: '', value: '1', scaling: {}}])});
        await setActivityMacros(pp, pw, [{name: 'Psychic Whispers', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.WHISPERS}]);
        report.push('<li>Psychic Whispers: target up to ' + actor.system.attributes.prof + ' creatures and use it. It rolls the die for the number of hours; the first use after each long rest gives the die back.</li>');
    }
    // ---- 4b. Psionic Strike ------------------------------------------------------------------
    await setMacros(pp, ['Psionic Strike'], [{name: 'Psionic Strike', type: 'midi-actor', pass: 'damageRollComplete', priority: 260, macro: SCRIPTS.PSI_STRIKE}]);
    const fresh = actor.items.get(pp.id);
    const ps = fresh.system.activities.contents.find(a => /psionic strike/i.test(a.name ?? ''));
    const sk = Object.entries(actor.system.scale?.soulknife ?? {}).find(([k, v]) => v?.faces);
    const lvl = actor.classes?.rogue?.system.levels ?? 3;
    const dieF = sk ? '@scale.soulknife.' + sk[0] : '1d' + (lvl >= 17 ? 12 : lvl >= 11 ? 10 : lvl >= 5 ? 8 : 6);
    if (ps && ps.damage) {
        const t = (ps.consumption?.targets ?? []).filter(x => x.type !== 'itemUses');
        await ps.update({'damage.parts': [{custom: {enabled: true, formula: dieF + ' + @abilities.int.mod'}, types: ['force'], number: null, denomination: null, bonus: '', scaling: {}}],
            'consumption.targets': t.concat([{type: 'itemUses', target: '', value: '1', scaling: {}}]),
            'activation.type': 'special', 'activation.override': true, 'range.value': '30', 'range.units': 'ft', 'target.affects.type': 'creature', 'target.affects.count': '1'});
    }
    report.push('<li>Psionic Strike: <b>automatic</b>. Once on each of her turns, right after a weapon attack (Psychic Blade, dagger, bow...) hits a creature within 30 ft, she gets a pop-up to spend a Psionic Energy Die. '
        + 'Yes rolls ' + (sk ? 'her Soulknife die' : dieF) + ' + Int (' + actor.system.abilities.int.mod + ') and adds it to that hit as <b>Force</b> damage (one damage card, crits double it), with a blue impact on the target. '
        + 'Unarmed Strike doesn\'t count. Out of combat she\'s asked on each weapon hit.'
        + (ps ? ' The "' + ps.name + '" button on Psionic Power now rolls the same damage (was a flat 1) and spends a die, for a hit the pop-up missed.' : '')
        + (sk ? '' : ' <b>Re-run at Rogue 5</b> so the manual button uses a d8.') + '</li>');
}
 
// ---- 5. Robe of Useful Items ------------------------------------------------------------------
{
    const robe = find(/^robe of useful items/i);
    if (!robe) report.push('<li><b>Robe of Useful Items</b> not found.</li>');
    else {
        let act = robe.system.activities.contents[0];
        if (!act) act = await robe.createActivity('utility', {name: 'Detach a Patch'}, {renderSheet: false});
        await act.update({name: 'Detach a Patch', 'activation.type': 'action', 'activation.override': true});
        await robe.setFlag('world', 'nixRobeGroup', 'silkie');
        const shared = game.actors.contents.flatMap(a => a.items.filter(i => i.flags?.world?.nixRobeGroup === 'silkie')).map(i => i.flags?.world?.nixRobe).find(v => v?.patches);
        if (shared) await robe.setFlag('world', 'nixRobe', shared);
        await setActivityMacros(robe, act, [{name: 'Robe: detach a patch', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.ROBE}]);
        report.push('<li>Robe of Useful Items: "Detach a Patch", same as Silkie\'s. It is the same robe as Silkie\'s: a patch torn off by either of them is gone for both.</li>');
    }
}
 
// ---- 6. Things to check (not changed) ---------------------------------------------------------
{
    const blade = actor.items.find(i => i.type === 'weapon' && /^psychic blade/i.test(i.name.trim()));
    if (blade && !(blade.system.quantity > 0)) { await blade.update({'system.quantity': 1}); report.push('<li>Psychic Blade weapon had quantity 0; set to 1 so its attacks aren\'t blocked.</li>'); }
    const pack = actor.items.find(i => i.type === 'container' && /^backpack/i.test(i.name.trim()));
    const cap = Number(pack?.system.capacity?.weight?.value ?? pack?.system.capacity?.value ?? 0);
    const held = Number(pack?.system.contentsWeight ?? 0);
    if (pack && cap && held > cap) report.push('<li>Backpack holds ' + held + ' lb but its capacity is ' + cap + ' lb. Move something out.</li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Silent Silk fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 