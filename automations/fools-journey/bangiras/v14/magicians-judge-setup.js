// =====================================================================
//  MAGICIANS JUDGE: SETUP, Foundry v14 copy
//  Run by the Nix Module (or as a Script macro with the owner selected).
//  Safe to re-run: it replaces everything it created before.
//
//  Builds on the staff:
//   - 5 charges, regains 1d4+1 at dawn.
//   - Arcane Glyphs (passive, while equipped + attuned): +1 spell attack, +1 spell damage.
//   - Judgement (1 charge, automatic): "Pass Judgement?" on Wisdom (Insight) checks.
//   - Sand Shroud (2 charges, reaction): +3 AC and attacks against you have
//     disadvantage until the start of your next turn.
//   - Weight of Life (2 charges): cast Zone of Truth from the staff.
//  Stasis and the Sand Shroud animation are written by the Bangiras fixes (v14).
//
//  v14 changes: effects use system.changes {key, type, value} and durations
//  {value, units, expiry} (native "until the start of your next turn" instead of
//  the DAE special duration); Judgement is a CAT macro (skill / actorSituational);
//  leftover untagged "Sand Shroud" effects from earlier versions are removed.
// =====================================================================
 
const ITEM_NAME = 'magicians judge';
const TAG = 'nixMagiciansJudge';
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Magicians Judge setup: select the token that owns the staff.');
const staff = actor.items.find(i => i.name.toLowerCase().trim() === ITEM_NAME);
if (!staff) return ui.notifications.error('Magicians Judge setup: ' + actor.name + ' has no item named "Magicians Judge".');
const notes = [];
 
// ---- Clean out anything a previous run created ------------------------------
// Ours are tagged; an untagged "Sand Shroud" is a leftover from an early version
// that no activity applies (it only carried the old animation macros).
const ourActivityNames = ['judgement', 'sand shroud', 'weight of life'];
const oldActs = (staff.system.activities?.contents ?? []).filter(a => ourActivityNames.includes((a.name ?? '').toLowerCase().trim()));
for (const a of oldActs) await staff.update({['system.activities.-=' + a.id]: null});
const oldEffects = staff.effects.filter(e => e.getFlag('world', TAG) || e.name === 'Sand Shroud');
const strays = oldEffects.filter(e => !e.getFlag('world', TAG)).length;
if (oldEffects.length) await staff.deleteEmbeddedDocuments('ActiveEffect', oldEffects.map(e => e.id));
if (strays) notes.push('Removed ' + strays + ' leftover untagged Sand Shroud effect' + (strays === 1 ? '' : 's') + ' (no activity applied it).');
 
// ---- Charges -------------------------------------------------------------------
await staff.update({'system.uses': {spent: 0, max: '5', recovery: [{period: 'dawn', type: 'formula', formula: '1d4+1'}]}});
 
// ---- Effects (Foundry 14 / dnd5e 6 shape) ------------------------------------------
const change = (key, type, value) => ({key, type, value: String(value), priority: 20, phase: 'initial'});
await staff.createEmbeddedDocuments('ActiveEffect', [{
    name: 'Magicians Judge: Arcane Glyphs',
    img: staff.img,
    type: 'base',
    transfer: true,
    description: '+1 to spell attack rolls and spell damage rolls.',
    system: {changes: [
        change('system.bonuses.msak.attack', 'add', '+1'),
        change('system.bonuses.rsak.attack', 'add', '+1'),
        change('system.bonuses.msak.damage', 'add', '+1'),
        change('system.bonuses.rsak.damage', 'add', '+1'),
        change('system.bonuses.save.damage', 'add', '+1'),
        change('system.bonuses.damage.damage', 'add', '+1')
    ]},
    flags: {world: {[TAG]: true}}
}]);
const [shroudEffect] = await staff.createEmbeddedDocuments('ActiveEffect', [{
    name: 'Sand Shroud',
    img: 'icons/magic/air/wind-tornado-funnel-gray.webp',
    type: 'base',
    transfer: false,
    description: '+3 AC; attacks against you have disadvantage until the start of your next turn.',
    duration: {value: 1, units: 'rounds', expiry: 'turnStart'},
    system: {changes: [
        change('system.attributes.ac.bonus', 'add', '+3'),
        change('flags.midi-qol.grants.disadvantage.attack.all', 'override', '1')
    ]},
    flags: {world: {[TAG]: true}}
}]);
 
// ---- Activities -----------------------------------------------------------------------
const useCharges = n => ({targets: [{type: 'itemUses', target: '', value: String(n), scaling: {}}], scaling: {allowed: false}});
await staff.createActivity('utility', {
    name: 'Sand Shroud',
    img: shroudEffect.img,
    activation: {type: 'reaction', value: 1, condition: 'When you are hit by an attack'},
    consumption: useCharges(2),
    range: {units: 'self'},
    target: {affects: {type: 'self'}},
    effects: [{_id: shroudEffect.id}]
}, {renderSheet: false});
 
// Zone of Truth from the compendiums (2024 version preferred).
let zotUuid = null;
const packs = game.packs.filter(p => p.documentName === 'Item').sort((a, b) =>
    (b.collection.includes('24') ? 1 : 0) - (a.collection.includes('24') ? 1 : 0));
for (const pack of packs) {
    const entry = pack.index.find(e => e.name === 'Zone of Truth' && (e.type === 'spell' || !e.type));
    if (entry) { zotUuid = entry.uuid ?? pack.getUuid(entry._id); break; }
}
await staff.createActivity('cast', {
    name: 'Weight of Life',
    activation: {type: 'action', value: 1, condition: ''},
    consumption: useCharges(2),
    spell: {uuid: zotUuid, spellbook: true}
}, {renderSheet: false});
 
// ---- Judgement (CAT embedded macro on the staff) -------------------------------------------
// Event: skill | Pass: actorSituational. Scope: document = the staff, actor, skillId, options.
const judgement = async () => {
    if (skillId !== 'ins') return;
    const staff = document;
    const owner = staff.parent;
    if (!staff.system.equipped || (staff.system.attunement && !staff.system.attuned)) return;
    if ((staff.system.uses?.value ?? 0) < 1) return;
    if (options.advantage) return;
    const userId = queryUtils.firstOwner(owner, true) ?? game.user.id;
    const yes = await dialogUtils.confirm('Pass Judgement',
        'Pass Judgement? Spend 1 charge of ' + staff.name + ' (' + staff.system.uses.value + ' left) for advantage on this Insight check.',
        {userId});
    if (!yes) return;
    await documentUtils.update(staff, {'system.uses.spent': (staff.system.uses.spent ?? 0) + 1});
    options.advantage = true;
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: owner}),
        content: '<b>Pass Judgement:</b> the golden scales steady. Advantage on this Insight check.'});
};
const fresh = staff.parent.items.get(staff.id) ?? staff;
const catList = (foundry.utils.deepClone(fresh.flags?.cat?.embeddedMacros ?? [])).filter(m => m.name !== 'Magicians Judge: Judgement');
catList.push({name: 'Magicians Judge: Judgement', event: 'skill', pass: 'actorSituational',
    macros: [{priority: 50, macro: 'return await (' + judgement.toString() + ')();'}]});
await fresh.update({'flags.cat.embeddedMacros': catList});
// The v13 copies (CPR1 flag) are never read on v14: remove ours.
const old = fresh.flags?.['chris-premades']?.embeddedMacros ?? [];
const keep = old.filter(m => !/^Magicians Judge: (Stasis|Judgement)$/.test(m.name));
if (keep.length !== old.length) await fresh.update({'flags.chris-premades.embeddedMacros': keep});
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Magicians Judge set up on ' + actor.name + ' (v14)</b><ul>'
    + '<li>5 charges, 1d4+1 at dawn</li><li>Arcane Glyphs: +1 spell attack &amp; damage</li>'
    + '<li>Judgement (1, pops up on Insight checks), Sand Shroud (2, reaction), Weight of Life (2)</li>'
    + '<li>Stasis and the Sand Shroud animation: run the Bangiras fixes next.</li>'
    + notes.map(n => '<li>' + n + '</li>').join('')
    + (zotUuid ? '' : '<li><b>Zone of Truth not found in your compendiums</b>: drag the spell onto the Weight of Life activity by hand.</li>')
    + '</ul>'});
 