// =====================================================================
//  SILENT SILK FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Silkie's alter ego: Rogue 3 (Soulknife), Drow. Run by Nix Fix (or as a Script macro with
//  Silent Silk selected, as GM). Safe to re-run: it replaces what it wrote.
//
//   - Magic Initiate + Drow spells: Charisma (data only)
//   - Psionic Power: all dice back on a long rest, ONE die back on a short rest (data only)
//   - Psi-Bolstered Knack: skill / actorBonus + check / actorBonus 300 (tool checks):
//     pop-up on a failed proficient check with a DC; the die is spent only on a success
//   - Psychic Whispers: roll / activityRollFinished 50 (rolls the hours; first use per long rest
//     free), reset at rest / actorLong 50
//   - Psionic Strike: roll / actorDamageRollBonuses 260: pop-up after a weapon hit within 30 ft
//     on her turn (once per turn); die + Int Force added to that hit. Manual button fixed.
//   - Robe of Useful Items: same "Detach a Patch" as Silkie's, sharing one set of patches
//  v14 changes from the v13 copy: CAT macros and scope names (roll, skillId, toolId),
//  queryUtils.firstOwner, MidiQOL.addRollTo, documentUtils, TokenDocuments for getDistance.
// =====================================================================

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Silent Silk fixes (v14): select Silent Silk\'s token first.');
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
    if (dupes.length) later.push('Duplicate items (check which to delete): ' + dupes.join(', ') + '.');
    const stale = actor.effects.filter(e => e.flags?.['chris-premades'] && !e.flags?.cat && !e.disabled);
    if (stale.length) later.push('Effects on the actor from Chris\'s Premades 1 (inert on v14): ' + stale.map(e => e.name).join(', ') + '. Delete them before testing.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
// =====================================================================
//  Macros
// =====================================================================

// Psi-Bolstered Knack: skill / actorBonus and check / actorBonus, priority 300, on Psionic Power.
// A failed ability check with a skill or tool she's proficient in -> add a Psionic Energy Die.
// The die is expended only if the check then succeeds. Returns the changed roll.
const knack = async () => {
    const item = document;
    const me = item.actor;
    const r = typeof roll !== 'undefined' ? roll : null;
    const cfg = typeof config !== 'undefined' ? config : null;
    const dc = Number(r?.options?.target ?? cfg?.target ?? NaN);
    if (!r || !dc || r.total >= dc || r.options?.nixKnack) return;
    const skill = (typeof skillId !== 'undefined' && skillId) || null;
    const tool = (typeof toolId !== 'undefined' && toolId) || cfg?.tool || null;
    // The check entry is for tool checks only; a skill check is answered by the skill entry.
    if (!skill && (!tool || cfg?.skill)) return;
    let prof = 0;
    if (skill) prof = Number(me.system.skills?.[skill]?.value ?? 0);
    else prof = Number(me.system.tools?.[tool]?.value ?? 0);
    if (!(prof >= 1)) return;
    if (!(item.system.uses?.value > 0)) return;
    const lvl = me.classes?.rogue?.system.levels ?? 3;
    const scale = Object.values(me.system.scale?.soulknife ?? {}).find(v => v?.faces);
    const die = scale?.faces ? '1d' + scale.faces : '1d' + (lvl >= 17 ? 12 : lvl >= 11 ? 10 : lvl >= 5 ? 8 : 6);
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const what = skill ? (CONFIG.DND5E.skills[skill]?.label ?? skill) : 'tool';
    if (!await dialogUtils.confirm('Psi-Bolstered Knack', 'You failed a ' + what + ' check (' + r.total + ' vs DC ' + dc + '). Roll a Psionic Energy Die (' + die
        + ') and add it? It is only spent if you then succeed.', {userId})) return;
    const extra = await new Roll(die).evaluate();
    await extra.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: 'Psi-Bolstered Knack'});
    const out = MidiQOL.addRollTo(r, extra);
    out.data = r.data;
    out.options = {...(r.options ?? {}), ...(out.options ?? {}), nixKnack: true};
    if (out.total >= dc) await documentUtils.update(item, {'system.uses.spent': (item.system.uses.spent ?? 0) + 1});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Psi-Bolstered Knack:</b> +' + extra.total + ' (now ' + out.total + ' vs DC ' + dc + '). '
        + (out.total >= dc ? 'Success! The die is spent.' : 'Still a failure, so the die is not spent.')});
    return out;
};

// Psychic Whispers: roll / activityRollFinished / 50. Roll the die for the hours; first use after
// each long rest is free.
const whispers = async () => {
    const item = workflow.item;
    const me = workflow.actor;
    const lvl = me.classes?.rogue?.system.levels ?? 3;
    const scale = Object.values(me.system.scale?.soulknife ?? {}).find(v => v?.faces);
    const die = scale?.faces ? '1d' + scale.faces : '1d' + (lvl >= 17 ? 12 : lvl >= 11 ? 10 : lvl >= 5 ? 8 : 6);
    let free = '';
    if (!item.flags?.world?.nixWhispersUsed) {
        await documentUtils.setFlag(item, 'world', 'nixWhispersUsed', true);
        const fresh = me.items.get(item.id);
        const spent = fresh.system.uses?.spent ?? 0;
        if (spent > 0) await documentUtils.update(fresh, {'system.uses.spent': spent - 1});
        free = ' (first use since her long rest: no die spent)';
    }
    const r = await new Roll(die).evaluate();
    await r.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: 'Psychic Whispers: hours'});
    const n = Array.from(workflow.targets ?? []).map(t => t.document.name);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Psychic Whispers:</b> ' + me.name + ' links minds with '
        + (n.join(', ') || 'up to ' + me.system.attributes.prof + ' creatures') + ' for <b>' + r.total + ' hour' + (r.total > 1 ? 's' : '') + '</b> (telepathy within 1 mile)' + free + '.'});
};
// rest / actorLong / 50 on Psionic Power.
const whispersRest = async () => {
    if (document.flags?.world?.nixWhispersUsed) await documentUtils.update(document, {'flags.world.-=nixWhispersUsed': null});
};

// Psionic Strike: roll / actorDamageRollBonuses / 260 on Psionic Power. Once on each of her turns,
// right after she hits a creature within 30 ft with a WEAPON attack: spend a die for die + Int Force.
const psiStrike = async () => {
    const item = document;
    const me = item.actor;
    if (workflow.actor?.uuid !== me.uuid || workflow.workflowOptions?.nixPsiStrike) return;
    if (workflow.item?.type !== 'weapon' || /^unarmed strike/i.test(workflow.item.name.trim())) return;
    if (!workflow.attackRoll || !workflow.hitTargets?.size) return;
    const fresh = me.items.get(item.id);
    if (!(fresh.system.uses?.value > 0)) return;
    const mine = workflow.token ?? actorUtils.getFirstToken(me)?.object;
    const target = Array.from(workflow.hitTargets).find(t => !mine || tokenUtils.getDistance(mine.document, t.document) <= 30);
    if (!target) return;
    const c = game.combat;
    const key = c?.started ? c.id + ':' + c.round + ':' + c.turn : null;
    if (key && c.combatant?.actor?.uuid !== me.uuid) return;                 // only on her own turn
    if (key && fresh.flags?.world?.nixPsiStrikeTurn === key) return;         // once per turn
    const lvl = me.classes?.rogue?.system.levels ?? 3;
    const scale = Object.values(me.system.scale?.soulknife ?? {}).find(v => v?.faces);
    const die = scale?.faces ? '1d' + scale.faces : '1d' + (lvl >= 17 ? 12 : lvl >= 11 ? 10 : lvl >= 5 ? 8 : 6);
    const int = Number(me.system.abilities?.int?.mod ?? 0);
    const mod = int ? (int > 0 ? ' + ' : ' - ') + Math.abs(int) : '';
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const left = fresh.system.uses.value + '/' + fresh.system.uses.max;
    if (!await dialogUtils.confirm('Psionic Strike', 'You hit ' + target.document.name + ' with ' + workflow.item.name + '. Spend a Psionic Energy Die (' + left + ') to deal '
        + die + mod + ' extra Force damage?', {userId})) return;
    await documentUtils.update(fresh, {'system.uses.spent': (fresh.system.uses.spent ?? 0) + 1});
    if (key) await documentUtils.setFlag(fresh, 'world', 'nixPsiStrikeTurn', key);
    await workflowUtils.bonusDamage(workflow, die + mod + '[force]', {damageType: 'force'});
    if (globalThis.Sequencer) {
        const f = ['jb2a.impact.004.blue', 'jb2a.impact.blue.0', 'jb2a.static_electricity.01.blue'].find(x => { try { return Sequencer.Database.entryExists(x); } catch { return false; } });
        if (f) new Sequence().effect().file(f).atLocation(target).scaleToObject(1.6).play();
    }
    const now = me.items.get(item.id).system.uses.value;
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Psionic Strike:</b> ' + me.name + '\'s ' + workflow.item.name
        + ' crackles with psionic force (+' + die + mod + ' Force). ' + now + ' Psionic Energy ' + (now === 1 ? 'Die' : 'Dice') + ' left.'});
};

// Robe of Useful Items: roll / activityRollFinished / 50 (same as Silkie's).
const robe = async () => {
    const item = workflow.item;
    const me = workflow.actor;
    const BASE = ['Bullseye Lantern', 'Dagger', 'Mirror', 'Pole', 'Rope', 'Sack'];
    const TABLE = [[8, 'Bag of 100 GP'], [15, 'Silver coffer (500 GP)'], [22, 'Iron door'], [30, '10 gems (100 GP each)'], [44, 'Wooden ladder (24 ft)'],
        [51, 'Riding Horse with saddle'], [59, 'Open pit (10-ft cube)'], [68, '4 Potions of Healing'], [75, 'Rowboat (12 ft)'],
        [83, 'Spell Scroll (level 1-3, your choice)'], [90, '2 Mastiffs'], [96, 'Window (2 x 4 ft, 2 ft deep)'], [100, 'Portable Ram']];
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

// ---- 1. Spells: Charisma --------------------------------------------------------------------
{
    const spells = actor.items.filter(i => i.type === 'spell');
    for (const sp of spells) {
        await sp.update({'system.ability': 'cha'});
        for (const a of sp.system.activities.contents.filter(a => a.type === 'save')) await a.update({'save.dc': {calculation: 'spellcasting', formula: ''}});
    }
    const atk = actor.system.attributes.prof + actor.system.abilities.cha.mod;
    report.push('<li>Spells: ' + (spells.map(s => s.name).join(', ') || 'none found') + ' use <b>Charisma</b> (like Silkie): spell attack +' + atk + ', save DC ' + (8 + atk) + '.</li>');
}

// ---- 2. Psionic Power: rest recovery ----------------------------------------------------------
const pp = actor.items.find(i => /^psionic power/i.test(i.name.trim()) && i.system.uses?.max) ?? find(/^psionic power/i);
if (!pp) report.push('<li><b>Psionic Power</b> not found.</li>');
else {
    if (premadeOn(pp) === 'cpr2') report.push('<li><b>Psionic Power has a Chris\'s Premades 2 automation.</b> Ours do the same jobs (Knack, Whispers, Strike), so set it to None in the Medkit '
        + 'or the pop-ups come twice. Then run this again.</li>');
    await pp.update({'system.uses.recovery': [{period: 'lr', type: 'recoverAll'}, {period: 'sr', type: 'formula', formula: '1'}]});
    report.push('<li>Psionic Power (' + pp.system.uses?.value + '/' + pp.system.uses?.max + '): all dice back on a long rest, <b>one</b> back on a short rest.</li>');

    // ---- 3. Psi-Bolstered Knack + Whispers rest + Psionic Strike (item macros) ----------------
    const NAMES = ['Knack (skill)', 'Knack (tool)', 'Psychic Whispers: long rest', 'Psionic Strike'];
    await dropOld(pp, NAMES.concat(['Psychic Whispers']));
    await setCat(actor.items.get(pp.id), NAMES, [
        entry('Knack (skill)', 'skill', 'actorBonus', 300, knack),
        entry('Knack (tool)', 'check', 'actorBonus', 300, knack),
        entry('Psychic Whispers: long rest', 'rest', 'actorLong', 50, whispersRest),
        entry('Psionic Strike', 'roll', 'actorDamageRollBonuses', 260, psiStrike)]);
    report.push('<li>Psi-Bolstered Knack: when she <b>fails</b> a skill or tool check she\'s proficient in and the roll has a DC, she gets a pop-up to add a Psionic Energy Die. '
        + 'The die is spent only if that makes it a success. (Checks rolled with no DC can\'t tell they failed: use the Knack button by hand for those.)</li>');

    // ---- 4. Psychic Whispers (activity) ---------------------------------------------------------
    const fresh = actor.items.get(pp.id);
    const pw = fresh.system.activities.contents.find(a => /whisper/i.test(a.name ?? ''));
    if (!pw) report.push('<li>Psychic Whispers: no activity on Psionic Power.</li>');
    else {
        const t = pw.consumption?.targets ?? [];
        if (!t.some(x => x.type === 'itemUses')) await pw.update({'consumption.targets': t.concat([{type: 'itemUses', target: '', value: '1', scaling: {}}])});
        await setCat(actor.items.get(pp.id).system.activities.get(pw.id), ['Psychic Whispers'], [entry('Psychic Whispers', 'roll', 'activityRollFinished', 50, whispers)]);
        report.push('<li>Psychic Whispers: target up to ' + actor.system.attributes.prof + ' creatures and use it. It rolls the die for the number of hours; the first use after each long rest gives the die back.</li>');
    }

    // ---- 5. Psionic Strike manual button --------------------------------------------------------
    const ps = actor.items.get(pp.id).system.activities.contents.find(a => /psionic strike/i.test(a.name ?? ''));
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
        + 'Yes rolls ' + (sk ? 'her Soulknife die' : dieF) + ' + Int (' + actor.system.abilities.int.mod + ') and adds it to that hit as <b>Force</b> damage, with a blue impact on the target. '
        + 'Unarmed Strike doesn\'t count. Out of combat she\'s asked on each weapon hit.'
        + (ps ? ' The "' + ps.name + '" button on Psionic Power rolls the same damage and spends a die, for a hit the pop-up missed.' : '')
        + (sk ? '' : ' <b>Re-run at Rogue 5</b> so the manual button uses a d8.') + '</li>');
}

// ---- 6. Robe of Useful Items ------------------------------------------------------------------
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
        report.push('<li>Robe of Useful Items: "Detach a Patch", same as Silkie\'s. It is the same robe as Silkie\'s: a patch torn off by either of them is gone for both.</li>');
    }
}

// ---- 7. Things to check (not changed) ---------------------------------------------------------
{
    const blade = actor.items.find(i => i.type === 'weapon' && /^psychic blade/i.test(i.name.trim()));
    if (blade && !(blade.system.quantity > 0)) { await blade.update({'system.quantity': 1}); report.push('<li>Psychic Blade weapon had quantity 0; set to 1 so its attacks aren\'t blocked.</li>'); }
    const pack = actor.items.find(i => i.type === 'container' && /^backpack/i.test(i.name.trim()));
    const cap = Number(pack?.system.capacity?.weight?.value ?? pack?.system.capacity?.value ?? 0);
    const held = Number(pack?.system.contentsWeight ?? 0);
    if (pack && cap && held > cap) report.push('<li>Backpack holds ' + held + ' lb but its capacity is ' + cap + ' lb. Move something out.</li>');
    const extraDie = actor.items.find(i => /^psionic energy die/i.test(i.name.trim()) && i.id !== pp?.id);
    if (extraDie) report.push('<li><i>"' + extraDie.name + '" is a second die counter (' + (extraDie.system.uses?.max ?? '?') + ' uses) that nothing spends: our pop-ups use Psionic Power\'s dice. Delete it if it\'s just an import leftover.</i></li>');
    whatsLeft(/^(psionic power|robe of useful items)/i);
}

await ChatMessage.create({whisper: [game.user.id], content: '<b>Silent Silk fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
