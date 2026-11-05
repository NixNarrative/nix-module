// =====================================================================
//  MAGICIANS JUDGE: one-click SETUP (Script macro, run as GM)
//  Select the token of the character who owns "Magicians Judge", then run.
//  Safe to re-run: it replaces everything it created before.
//
//  What it builds on the staff:
//   - 5 charges, regains 1d4+1 at dawn.
//   - Arcane Glyphs (passive, while equipped + attuned):
//       +1 to spell attack rolls, +1 to spell damage rolls
//       (attack spells, save spells and auto-damage spells like Magic Missile).
//   - Stasis (automatic): advantage on saving throws from anything that would
//     knock you prone.
//   - Judgement (1 charge, automatic): whenever you make a Wisdom (Insight)
//     check, a "Pass Judgement?" pop-up offers advantage on it.
//   - Sand Shroud (2 charges, reaction): when you're hit by an attack, +3 AC
//     (can turn that hit into a miss, like Shield) and attacks against you have
//     disadvantage, until the start of your next turn. Midi offers the prompt.
//   - Weight of Life (2 charges): cast Zone of Truth from the staff.
// =====================================================================
 
const ITEM_NAME = 'magicians judge';
const TAG = 'nixMagiciansJudge';
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Magicians Judge setup: select the token that owns the staff.');
const staff = actor.items.find(i => i.name.toLowerCase().trim() === ITEM_NAME);
if (!staff) return ui.notifications.error('Magicians Judge setup: ' + actor.name + ' has no item named "Magicians Judge".');
 
// ---- Clean out anything a previous run created ------------------------------
const oldEffects = staff.effects.filter(e => e.getFlag('world', TAG));
if (oldEffects.length) await staff.deleteEmbeddedDocuments('ActiveEffect', oldEffects.map(e => e.id));
const ourActivityNames = ['judgement', 'sand shroud', 'weight of life'];
const oldActs = (staff.system.activities?.contents ?? []).filter(a => ourActivityNames.includes(a.name.toLowerCase().trim()));
for (const a of oldActs) await staff.update({['system.activities.-=' + a.id]: null});
 
// ---- Charges -------------------------------------------------------------------
await staff.update({'system.uses': {spent: 0, max: '5', recovery: [{period: 'dawn', type: 'formula', formula: '1d4+1'}]}});
 
// ---- Arcane Glyphs: passive +1 spell attack / spell damage -------------------------
const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
const [glyphs] = await staff.createEmbeddedDocuments('ActiveEffect', [{
    name: 'Magicians Judge: Arcane Glyphs',
    img: staff.img,
    transfer: true,
    description: '+1 to spell attack rolls and spell damage rolls.',
    changes: [
        {key: 'system.bonuses.msak.attack', mode: ADD, value: '+1', priority: 20},
        {key: 'system.bonuses.rsak.attack', mode: ADD, value: '+1', priority: 20},
        {key: 'system.bonuses.msak.damage', mode: ADD, value: '+1', priority: 20},
        {key: 'system.bonuses.rsak.damage', mode: ADD, value: '+1', priority: 20},
        {key: 'system.bonuses.save.damage', mode: ADD, value: '+1', priority: 20},
        {key: 'system.bonuses.damage.damage', mode: ADD, value: '+1', priority: 20}
    ],
    flags: {world: {[TAG]: true}}
}]);
 
// ---- Sand Shroud effect (applied to self by the reaction) ---------------------------
const [shroudEffect] = await staff.createEmbeddedDocuments('ActiveEffect', [{
    name: 'Sand Shroud',
    img: 'icons/magic/air/wind-tornado-funnel-gray.webp',
    transfer: false,
    description: '+3 AC; attacks against you have disadvantage until the start of your next turn.',
    duration: {rounds: 1},
    changes: [
        {key: 'system.attributes.ac.bonus', mode: ADD, value: '+3', priority: 20},
        {key: 'flags.midi-qol.grants.disadvantage.attack.all', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '1', priority: 20}
    ],
    flags: {dae: {specialDuration: ['turnStart']}, world: {[TAG]: true}}
}]);
 
const useCharges = n => ({targets: [{type: 'itemUses', target: '', value: String(n), scaling: {}}], scaling: {allowed: false}});
 
// ---- Activities -----------------------------------------------------------------------
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
 
// ---- Embedded macros --------------------------------------------------------------------
// Stasis: advantage on saves from sources that would knock you prone.
const stasis = async () => {
    const item = trigger.entity;
    if (!item.system.equipped || (item.system.attunement && !item.system.attuned)) return;
    const uuid = trigger.config?.midiOptions?.saveItemUuid;
    if (!uuid) return;
    const source = fromUuidSync(uuid);
    if (!source) return;
    const effectsProne = (source.effects?.contents ?? []).some(e => e.statuses?.has?.('prone')
        || (e.changes ?? []).some(c => String(c.value).toLowerCase().includes('prone')));
    const text = String(source.system?.description?.value ?? '').toLowerCase();
    const textProne = /prone/.test(text);
    if (effectsProne || textProne) trigger.options.advantage = true;
};
 
// Judgement: whenever the wielder makes a Wisdom (Insight) check, offer
// "Pass Judgement?" (1 charge) for advantage on that check.
const judgement = async () => {
    if (trigger.skillId !== 'ins') return;
    const staff = trigger.entity;
    const actor = trigger.actor;
    if (!staff.system.equipped || (staff.system.attunement && !staff.system.attuned)) return;
    if ((staff.system.uses?.value ?? 0) < 1) return;
    if (trigger.options.advantage) return;
    const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
    const yes = await dialogUtils.confirm('Pass Judgement',
        'Pass Judgement? Spend 1 charge of ' + staff.name + ' (' + staff.system.uses.value + ' left) for advantage on this Insight check.',
        {userId});
    if (!yes) return;
    await genericUtils.update(staff, {'system.uses.spent': (staff.system.uses.spent ?? 0) + 1});
    trigger.options.advantage = true;
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),
        content: '<b>Pass Judgement:</b> the golden scales steady. Advantage on this Insight check.'});
};
 
const ourMacroNames = ['Magicians Judge: Stasis', 'Magicians Judge: Judgement'];
const itemMacros = (staff.getFlag('chris-premades', 'embeddedMacros') ?? []).filter(m => !ourMacroNames.includes(m.name));
itemMacros.push({name: 'Magicians Judge: Stasis', type: 'save', pass: 'situational', priority: 50,
    macro: 'await (' + stasis.toString() + ')();'});
itemMacros.push({name: 'Magicians Judge: Judgement', type: 'skill', pass: 'situational', priority: 50,
    macro: 'await (' + judgement.toString() + ')();'});
await staff.setFlag('chris-premades', 'embeddedMacros', itemMacros);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Magicians Judge set up on ' + actor.name + '</b><ul>'
    + '<li>5 charges, 1d4+1 at dawn</li><li>Arcane Glyphs: +1 spell attack &amp; damage</li><li>Stasis: advantage vs prone saves</li>'
    + '<li>Judgement (1, pops up on Insight checks), Sand Shroud (2, reaction), Weight of Life (2)</li>'
    + (zotUuid ? '' : '<li><b>Zone of Truth not found in your compendiums</b>: drag the spell onto the Weight of Life activity by hand.</li>')
    + '</ul>'});
 