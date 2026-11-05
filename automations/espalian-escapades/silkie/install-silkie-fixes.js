// =====================================================================
//  SILKIE FIXES (Espalian Escapades): one-click INSTALLER (Script macro, run as GM)
//  Select Silkie's token, then run. Safe to re-run.
//   - Dazzling Footwork: Unarmored Defense on (AC = 10 + Dex + Cha)
//   - Unarmed Strike: attacks with Dex; Bardic Damage die scales with her Bardic Inspiration die
//   - Agile Strikes: after using Bardic Inspiration, offered a free Unarmed Strike
//   - Robe of Useful Items: pick a patch to detach; random patches rolled once; gold added
//   - Spellcasting: 6 prepared spells at Bard 3
//   - Fey Ancestry: added (copied from another Eladrin/Elf in the world if one has it)
// =====================================================================
const SCRIPTS = {
 AGILE: String.raw`await (async () => {
// Agile Strikes: when Silkie spends a Bardic Inspiration use, she can make one Unarmed Strike as part of it.
const actor = workflow.actor;
const us = actor.items.find(i => i.type === 'weapon' && /^unarmed strike/i.test(i.name.trim()));
const act = us?.system.activities.contents.find(a => a.type === 'attack');
if (!act) return;
if (!await dialogUtils.confirm('Agile Strikes', 'You spent Bardic Inspiration. Make one Unarmed Strike as part of it? (Target the creature first.)')) return;
let targets = Array.from(game.user.targets ?? []);
if (!targets.length) {
    const me = workflow.token ?? actorUtils.getFirstToken(actor);
    const near = me ? canvas.tokens.placeables.filter(t => t.actor && t.id !== me.id && !t.document.hidden && tokenUtils.getDistance(me, t) <= 5) : [];
    if (!near.length) { ui.notifications.warn('Agile Strikes: no creature within 5 ft. Target one and use Unarmed Strike.'); return; }
    const pick = near.length === 1 ? near[0] : await dialogUtils.selectDocumentDialog('Agile Strikes', 'Strike whom?', near.map(t => t.document), {});
    if (!pick) return;
    targets = [pick.object ?? pick];
}
await workflowUtils.syntheticActivityRoll(act, targets.slice(0, 1), {consumeResources: false});
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
if (!actor) return ui.notifications.warn('Silkie fixes: select Silkie\'s token first.');
const report = [];
const find = re => actor.items.find(i => re.test(i.name.trim()));
const cprId = item => item?.flags?.['chris-premades']?.info?.identifier;
async function setMacros(doc, names, add) {
    const kept = (doc.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.setFlag('chris-premades', 'embeddedMacros', kept.concat(add));
}
async function setActivityMacros(item, activity, add) {
    const names = add.map(m => m.name);
    const kept = (item.flags?.['chris-premades']?.embeddedActivityMacros?.[activity.id] ?? []).filter(m => !names.includes(m.name));
    await item.setFlag('chris-premades', 'embeddedActivityMacros.' + activity.id, kept.concat(add));
}
 
// ---- 1. Dazzling Footwork: Unarmored Defense -------------------------------------------------
{
    const df = find(/^dazzling footwork/i);
    const host = df ?? actor.items.find(i => i.effects.some(e => /unarmored defense/i.test(e.name)));
    const eff = host?.effects.find(e => /unarmored defense/i.test(e.name));
    const changes = [
        {key: 'system.attributes.ac.calc', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 'custom', priority: 20},
        {key: 'system.attributes.ac.formula', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '10 + @abilities.dex.mod + @abilities.cha.mod', priority: 20}];
    if (!host) report.push('<li><b>Dazzling Footwork</b> not found.</li>');
    else {
        const data = {name: 'Unarmored Defense', disabled: false, transfer: true, changes,
            description: 'Without armor or a Shield: AC = 10 + Dexterity + Charisma.'};
        if (eff) await eff.update(data); else await host.createEmbeddedDocuments('ActiveEffect', [{...data, img: host.img}]);
        const armored = actor.items.some(i => i.type === 'equipment' && i.system.equipped && ['light', 'medium', 'heavy', 'shield'].includes(i.system.type?.value));
        report.push('<li>Dazzling Footwork: Unarmored Defense is <b>on</b>. AC = 10 + Dex + Cha = <b>' + (10 + actor.system.abilities.dex.mod + actor.system.abilities.cha.mod) + '</b>.'
            + (armored ? ' <b>She has armor or a shield equipped</b>: unequip it, since the feature only works without them (the effect doesn\'t check).' : '') + '</li>');
    }
}
 
// ---- 2. Unarmed Strike: Dex + Bardic Damage --------------------------------------------------
{
    const us = actor.items.find(i => i.type === 'weapon' && /^unarmed strike/i.test(i.name.trim()));
    if (!us) report.push('<li><b>Unarmed Strike</b> not found.</li>');
    else {
        for (const a of us.system.activities.contents.filter(a => a.type === 'attack')) await a.update({'attack.ability': 'dex'});
        const key = Object.keys(actor.system.scale?.bard ?? {}).find(k => /inspiration/i.test(k));
        let dmg = '';
        if (key) {
            await us.update({'system.damage.base.custom.enabled': true, 'system.damage.base.custom.formula': '@scale.bard.' + key + ' + @mod', 'system.damage.base.types': ['bludgeoning']});
            dmg = ' Damage is her Bardic Inspiration die + Dex, so it grows to a d8 at Bard 5 by itself.';
        } else dmg = ' Damage left as it was (her Bardic Inspiration scale wasn\'t found, so it won\'t grow at Bard 5 on its own).';
        report.push('<li>Unarmed Strike: attack rolls now use <b>Dexterity</b> (+' + (actor.system.abilities.dex.mod + actor.system.attributes.prof) + ').' + dmg + '</li>');
    }
}
 
// ---- 3. Agile Strikes ------------------------------------------------------------------------
{
    let bi = actor.items.find(i => cprId(i) === 'bardicInspiration') ?? find(/^bardic inspiration/i);
    if (bi && !cprId(bi)) {
        try { await chrisPremades.utils.itemUtils.itemUpdate(bi); } catch (err) { console.warn(err); }
        bi = actor.items.find(i => cprId(i) === 'bardicInspiration') ?? find(/^bardic inspiration/i);
    }
    if (!bi) report.push('<li><b>Bardic Inspiration</b> not found.</li>');
    else {
        const act = bi.system.activities.contents.find(a => /inspire/i.test(a.name ?? '')) ?? bi.system.activities.contents[0];
        await setActivityMacros(bi, act, [{name: 'Agile Strikes', type: 'midi-item', pass: 'rollFinished', priority: 80, macro: SCRIPTS.AGILE}]);
        report.push('<li>Agile Strikes: after she uses ' + bi.name + (cprId(bi) ? ' (Chris\'s Premades version)' : '') + ' she is asked whether to make a free <b>Unarmed Strike</b> '
            + '(her current target, or pick from creatures within 5 ft). It doesn\'t spend her action.</li>');
    }
}
 
// ---- 4. Robe of Useful Items -----------------------------------------------------------------
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
        const st = robe.flags?.world?.nixRobe;
        report.push('<li>Robe of Useful Items (shared with Silent Silk: a patch torn off by either is gone for both): "Detach a Patch" (Magic action) lists the patches left. The 4d4 random patches are rolled the first time it is used and whispered to the GM. '
            + 'Gold goes into her purse; Dagger, Rope, Pole, Sack, Mirror, Bullseye Lantern and the Potions of Healing are added from the dnd5e compendium when found. '
            + (st?.patches ? 'Patches left now: ' + st.patches.length + '.' : 'Patches not rolled yet.') + '</li>');
    }
}
 
// ---- 5. Prepared spells: 6 ------------------------------------------------------------------
{
    const bard = actor.items.find(i => i.type === 'class' && /bard/i.test(i.name));
    if (!bard) report.push('<li><b>Bard</b> class item not found.</li>');
    else {
        const key = Object.keys(actor.system.scale?.bard ?? {}).find(k => /prepared/i.test(k));
        const formula = key ? '@scale.bard.' + key : String(bard.system.levels >= 3 ? 6 : 4 + (bard.system.levels - 1));
        try { await bard.update({'system.spellcasting.preparation.formula': formula}); } catch (err) { console.warn(err); }
        report.push('<li>Spellcasting: Bard prepared-spell limit set to <b>' + (key ? 'her Bard table (6 at level 3)' : formula) + '</b>, so the Spellbook shows x/6 instead of 0/0.</li>');
    }
}
 
// ---- 6. Fey Ancestry ------------------------------------------------------------------------
{
    if (find(/^fey ancestry/i)) report.push('<li>Fey Ancestry: already on her sheet.</li>');
    else {
        const donors = game.actors.contents.flatMap(a => a.id === actor.id ? [] : a.items.filter(i => /^fey ancestry/i.test(i.name.trim())));
        const src = donors.find(i => i.flags?.['chris-premades']?.info) ?? donors.find(i => i.effects.size) ?? donors[0];
        let data;
        if (src) { data = src.toObject(); delete data._id; }
        else data = {name: 'Fey Ancestry', type: 'feat', img: 'icons/magic/nature/leaf-glow-teal.webp',
            system: {type: {value: 'race'}, description: {value: '<p>You have Advantage on saving throws you make to avoid or end the Charmed condition.</p>'}},
            effects: [{name: 'Fey Ancestry', img: 'icons/magic/nature/leaf-glow-teal.webp', transfer: true,
                changes: [{key: 'flags.midi-qol.advantage.ability.save.all', mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "'charmed' in (options?.statuses ?? []) || /charm/i.test(item?.name ?? '')", priority: 20}]}]};
        await actor.createEmbeddedDocuments('Item', [data]);
        report.push('<li>Fey Ancestry: added' + (src ? ' (copied from ' + src.parent.name + '\'s, automation included)' : ' (Advantage on saves against being Charmed)') + '.</li>');
    }
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Silkie fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 