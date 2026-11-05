// =====================================================================
//  SILKIE FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Silkie selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//   - Dazzling Footwork: Unarmored Defense on (AC = 10 + Dex + Cha), v14 effect format
//   - Unarmed Strike: attacks with Dex; Bardic Damage die scales with her Bardic Inspiration die
//   - Agile Strikes: roll / itemRollFinished / 80 on Bardic Inspiration: free Unarmed Strike offer
//   - Robe of Useful Items: roll / activityRollFinished / 50 on "Detach a Patch" (shared with Silent Silk)
//   - Spellcasting: 6 prepared spells at Bard 3
//   - Fey Ancestry: added (copied from another character in the world if one has it)
//  v14 changes from the v13 copy: CAT macros (flags.cat.embeddedMacros, stored shape),
//  system.changes with `type`, queryUtils, no Chris's Premades 1 itemUpdate (apply in the Medkit).
//  Re-run after re-applying Bardic Inspiration in the Medkit (that wipes the Agile Strikes macro).
// =====================================================================

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Silkie fixes (v14): select Silkie\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
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
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
function whatsLeft(skip = /^$/) {
    const later = [];
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1' && !skip.test(i.name));
    if (cpr1.length) later.push('Still tagged for Chris\'s Premades 1 (does nothing on v14; re-apply in the Medkit if Chris\'s Premades 2 has it): ' + cpr1.map(i => i.name).join(', ') + '.');
    const dupes = Object.entries(actor.items.contents.reduce((m, i) => ((m[i.type + '|' + i.name] = (m[i.type + '|' + i.name] ?? 0) + 1), m), {}))
        .filter(([k, n]) => n > 1 && !k.startsWith('class|')).map(([k, n]) => k.split('|')[1] + ' x' + n);
    if (dupes.length) later.push('Duplicate items (check which to delete; an innate and a prepared copy of a spell can both be right): ' + dupes.join(', ') + '.');
    const legacy = actor.items.filter(i => i.type === 'spell' && /\(legacy\)\s*$/i.test(i.name));
    if (legacy.length) later.push('Legacy (2014) spells still on the sheet: ' + legacy.map(i => i.name).join(', ') + '.');
    const stale = actor.effects.filter(e => e.flags?.['chris-premades'] && !e.flags?.cat && !e.disabled);
    if (stale.length) later.push('Effects on the actor from Chris\'s Premades 1 (inert on v14): ' + stale.map(e => e.name).join(', ') + '. Delete them before testing.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
// =====================================================================
//  Macros
// =====================================================================

// Agile Strikes: roll / itemRollFinished / 80 on Bardic Inspiration. When she spends a use to
// inspire someone, she can make one Unarmed Strike as part of that action.
const agile = async () => {
    const me = workflow.actor;
    if (!me || me.uuid !== document.actor?.uuid) return;
    if (workflow.workflowOptions?.nixAgile) return;
    // Only the use that hands out a die (it spends a use or targets someone), not helper activities.
    const others = Array.from(workflow.targets ?? []).filter(t => t.actor?.uuid !== me.uuid);
    const spends = (workflow.activity?.consumption?.targets ?? []).some(t => t.type === 'itemUses');
    if (!others.length && !spends) return;
    const us = me.items.find(i => i.type === 'weapon' && /^unarmed strike/i.test(i.name.trim()));
    const act = us?.system.activities.contents.find(a => a.type === 'attack');
    if (!act) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    if (!await dialogUtils.confirm('Agile Strikes', 'You spent Bardic Inspiration. Make one Unarmed Strike as part of it?', {userId})) return;
    const mine = workflow.token ?? actorUtils.getFirstToken(me)?.object;
    let targets = Array.from(game.user.targets ?? []).filter(t => t.actor?.uuid !== me.uuid && !others.some(o => o.id === t.id));
    if (!targets.length) {
        const near = mine ? canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id && !t.document.hidden
            && tokenUtils.getDistance(mine.document, t.document) <= 5) : [];
        if (!near.length) return void ui.notifications.warn('Agile Strikes: no creature within 5 ft. Target one and use Unarmed Strike.');
        const pick = near.length === 1 ? near[0].document
            : await dialogUtils.selectDocumentDialog('Agile Strikes', 'Strike whom?', near.map(t => t.document), {userId});
        if (!pick) return;
        targets = [pick.object ?? pick];
    }
    setTimeout(() => workflowUtils.syntheticActivityRoll(act, targets.slice(0, 1), {consumeResources: false, options: {workflowOptions: {nixAgile: true}}}), 400);
};

// Robe of Useful Items: roll / activityRollFinished / 50 on "Detach a Patch". Same file on Silent Silk.
const robe = async () => {
    const item = workflow.item;
    const me = workflow.actor;
    const BASE = ['Bullseye Lantern', 'Dagger', 'Mirror', 'Pole', 'Rope', 'Sack'];
    const TABLE = [[8, 'Bag of 100 GP'], [15, 'Silver coffer (500 GP)'], [22, 'Iron door'], [30, '10 gems (100 GP each)'], [44, 'Wooden ladder (24 ft)'],
        [51, 'Riding Horse with saddle'], [59, 'Open pit (10-ft cube)'], [68, '4 Potions of Healing'], [75, 'Rowboat (12 ft)'],
        [83, 'Spell Scroll (level 1-3, your choice)'], [90, '2 Mastiffs'], [96, 'Window (2 x 4 ft, 2 ft deep)'], [100, 'Portable Ram']];
    // Silkie and Silent Silk share one robe: every robe with the same nixRobeGroup holds the same patches.
    const group = item.flags?.world?.nixRobeGroup;
    const peers = group ? game.actors.contents.flatMap(a => a.items.filter(i => i.flags?.world?.nixRobeGroup === group)) : [item];
    if (!peers.includes(item)) peers.push(item);
    const saveAll = async v => { for (const p of peers) await documentUtils.setFlag(p, 'world', 'nixRobe', v); };
    let st = peers.map(p => p.flags?.world?.nixRobe).find(v => v?.patches);
    if (!st?.patches) {
        const n = (await new Roll('4d4').evaluate()).total;
        const extra = [];
        for (let i = 0; i < n; i++) { const r = (await new Roll('1d100').evaluate()).total; extra.push(TABLE.find(([hi]) => r <= hi)[1]); }
        st = {patches: BASE.flatMap(b => [b, b]).concat(extra)};
        await saveAll(st);
        await ChatMessage.create({whisper: ChatMessage.getWhisperRecipients('GM'), speaker: ChatMessage.getSpeaker({actor: me}),
            content: '<b>' + item.name + ':</b> the robe\'s ' + n + ' extra patches are: ' + extra.join(', ') + '.'});
    }
    if (!st.patches.length) return void ui.notifications.info(item.name + ': no patches left. It is an ordinary garment now.');
    const counts = {};
    for (const p of st.patches) counts[p] = (counts[p] ?? 0) + 1;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const pick = await dialogUtils.buttonDialog(item.name, 'Detach which patch?',
        Object.entries(counts).map(([p, c]) => [p + (c > 1 ? ' (x' + c + ')' : ''), p]).concat([['Cancel', false]]), {userId});
    if (!pick) return;
    const left = [...st.patches];
    left.splice(left.indexOf(pick), 1);
    await saveAll({patches: left});
    let extra = '';
    if (pick === 'Bag of 100 GP') { await documentUtils.update(me, {'system.currency.gp': Number(me.system.currency?.gp ?? 0) + 100}); extra = ' 100 GP added to the purse.'; }
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
            await me.createEmbeddedDocuments('Item', [data]);
            extra = ' ' + (pick === '4 Potions of Healing' ? '4 Potions of Healing were' : data.name + ' was') + ' added to the inventory.';
            break;
        }
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + item.name + ':</b> ' + me.name + ' tears off a patch: <b>' + pick + '</b>.' + extra
        + (left.length ? ' ' + left.length + ' patch' + (left.length > 1 ? 'es' : '') + ' left.' : ' That was the last one; the robe is now an ordinary garment.')});
};
// =====================================================================
//  Install
// =====================================================================

// ---- 1. Dazzling Footwork: Unarmored Defense -------------------------------------------------
{
    const df = find(/^dazzling footwork/i);
    const host = df ?? actor.items.find(i => i.effects.some(e => /unarmored defense/i.test(e.name)));
    const eff = host?.effects.find(e => /unarmored defense/i.test(e.name));
    const changes = [
        {key: 'system.attributes.ac.calc', type: 'override', value: 'custom', priority: 20},
        {key: 'system.attributes.ac.formula', type: 'override', value: '10 + @abilities.dex.mod + @abilities.cha.mod', priority: 20}];
    // dnd5e 6 has its own "unarmoredBard" AC (10 + Dex + Cha, and it knows about armor). If the
    // feature already sets it, ours would only fight it over ac.calc: switch ours off.
    const native = host?.effects.find(e => e !== eff && !e.disabled && (e.system?.changes ?? []).some(c => c.key === 'system.attributes.ac.calc' && c.value === 'unarmoredBard'));
    if (!host) report.push('<li><b>Dazzling Footwork</b> not found.</li>');
    else if (native && (!CONFIG.DND5E?.armorClasses || CONFIG.DND5E.armorClasses.unarmoredBard)) {
        if (eff && !eff.disabled) await eff.update({disabled: true});
        report.push('<li>Dazzling Footwork: uses dnd5e\'s own Unarmored Defense (Bard) from its "' + native.name + '" effect: AC = 10 + Dex + Cha without armor or a shield'
            + (eff ? '; our v13 "Unarmored Defense" effect is switched off so the two don\'t compete' : '') + '.</li>');
    }
    else {
        const data = {name: 'Unarmored Defense', disabled: false, transfer: true, system: {changes},
            description: 'Without armor or a Shield: AC = 10 + Dexterity + Charisma.'};
        if (eff) await eff.update(data); else await host.createEmbeddedDocuments('ActiveEffect', [{...data, img: host.img}]);
        const armored = actor.items.some(i => i.type === 'equipment' && i.system.equipped && ['light', 'medium', 'heavy', 'shield'].includes(i.system.type?.value));
        report.push('<li>Dazzling Footwork: Unarmored Defense is <b>on</b>. AC = 10 + Dex + Cha = <b>' + (10 + actor.system.abilities.dex.mod + actor.system.abilities.cha.mod) + '</b>.'
            + (premadeOn(df) === 'cpr2' ? ' <i>Dazzling Footwork has a Chris\'s Premades 2 automation too: if her AC comes out wrong, set it to None in the Medkit and run this again.</i>' : '')
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
        report.push('<li>Unarmed Strike: attack rolls use <b>Dexterity</b> (+' + (actor.system.abilities.dex.mod + actor.system.attributes.prof) + ').' + dmg
            + (premadeOn(us) === 'cpr2' ? ' <i>Re-run this if you re-apply Unarmed Strike in the Medkit.</i>' : '') + '</li>');
    }
}

// ---- 3. Agile Strikes (on Bardic Inspiration) -------------------------------------------------
{
    const bi = actor.items.find(i => i.flags?.cat?.identifier === 'bardicInspiration' || i.flags?.cat?.automation?.identifier === 'bardicInspiration') ?? find(/^bardic inspiration/i);
    if (!bi) report.push('<li><b>Bardic Inspiration</b> not found.</li>');
    else {
        await dropOld(bi, ['Agile Strikes']);
        await setCat(bi, ['Agile Strikes'], [entry('Agile Strikes', 'roll', 'itemRollFinished', 80, agile)]);
        report.push('<li>Agile Strikes: after she uses ' + bi.name + ' on someone she is asked whether to make a free <b>Unarmed Strike</b> '
            + '(her current target, or pick from creatures within 5 ft). It doesn\'t spend her action. '
            + (premadeOn(bi) === 'cpr2' ? '<i>Bardic Inspiration is Chris\'s Premades 2: re-run Silkie fixes whenever you re-apply it in the Medkit.</i>'
                : '<b>Apply Chris\'s Premades 2\'s Bardic Inspiration in the Medkit, then run this again</b> (the re-apply wipes our macro).') + '</li>');
    }
}

// ---- 4. Robe of Useful Items -----------------------------------------------------------------
{
    const r = find(/^robe of useful items/i);
    if (!r) report.push('<li><b>Robe of Useful Items</b> not found.</li>');
    else {
        if (!r.system.activities.contents[0]) await r.createActivity('utility', {name: 'Detach a Patch'}, {renderSheet: false});
        const act = actor.items.get(r.id).system.activities.contents[0];
        await act.update({name: 'Detach a Patch', 'activation.type': 'action', 'activation.override': true});
        await r.setFlag('world', 'nixRobeGroup', 'silkie');
        const shared = game.actors.contents.flatMap(a => a.items.filter(i => i.flags?.world?.nixRobeGroup === 'silkie')).map(i => i.flags?.world?.nixRobe).find(v => v?.patches);
        if (shared) await r.setFlag('world', 'nixRobe', shared);
        await dropOld(r, ['Robe: detach a patch']);
        await setCat(actor.items.get(r.id).system.activities.get(act.id), ['Robe: detach a patch'], [entry('Robe: detach a patch', 'roll', 'activityRollFinished', 50, robe)]);
        const st = actor.items.get(r.id).flags?.world?.nixRobe;
        report.push('<li>Robe of Useful Items (shared with Silent Silk: a patch torn off by either is gone for both): "Detach a Patch" (Magic action) lists the patches left. The 4d4 random patches are rolled the first time it is used and whispered to the GM. '
            + 'Gold goes into her purse; Dagger, Rope, Pole, Sack, Mirror, Bullseye Lantern and the Potions of Healing are added from the dnd5e compendium when found. '
            + (st?.patches ? 'Patches left now: ' + st.patches.length + ' (carried over from v13).' : 'Patches not rolled yet.') + '</li>');
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
    const have = find(/^fey ancestry/i);
    if (have) report.push('<li>Fey Ancestry: already on her sheet' + (premadeOn(have) === 'cpr1' ? ' (<i>tagged for Chris\'s Premades 1: re-apply in the Medkit if Chris\'s Premades 2 offers it</i>)' : '') + '.</li>');
    else {
        const donors = game.actors.contents.flatMap(a => a.id === actor.id ? [] : a.items.filter(i => /^fey ancestry/i.test(i.name.trim())));
        const src = donors.find(i => premadeOn(i) === 'cpr2') ?? donors.find(i => i.effects.size) ?? donors[0];
        let data;
        if (src) { data = src.toObject(); delete data._id; }
        else data = {name: 'Fey Ancestry', type: 'feat', img: 'icons/magic/nature/leaf-glow-teal.webp',
            system: {type: {value: 'race'}, description: {value: '<p>You have Advantage on saving throws you make to avoid or end the Charmed condition.</p>'}},
            effects: [{name: 'Fey Ancestry', img: 'icons/magic/nature/leaf-glow-teal.webp', transfer: true,
                system: {changes: [{key: 'flags.midi-qol.advantage.ability.save.all', type: 'custom', value: "'charmed' in (options?.statuses ?? []) || /charm/i.test(item?.name ?? '')", priority: 20}]}}]};
        await actor.createEmbeddedDocuments('Item', [data]);
        report.push('<li>Fey Ancestry: added' + (src ? ' (copied from ' + src.parent.name + '\'s, automation included)' : ' (Advantage on saves against being Charmed)') + '.</li>');
    }
}

// ---- 7. What's left ----------------------------------------------------------------------------
whatsLeft(/^(robe of useful items)/i);

await ChatMessage.create({whisper: [game.user.id], content: '<b>Silkie fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
