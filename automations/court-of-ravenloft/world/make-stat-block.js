// =====================================================================
//  COURT OF RAVENLOFT: MAKE STAT BLOCK (Nix Fix tool, run as GM, v13)
//  From a boss CHARACTER copy ("Dracula (Boss)", "Dayus Manroe (Boss)"...), make an NPC
//  actor with the same name that looks and plays like a 2024 monster stat block:
//  same abilities, HP, AC, saves, skills, senses, traits, spell slots and every item
//  (the Illrigger class item too: levels, scale values and Hit Dice still count), a CR you
//  pick (captains: no Legendary Actions or Resistance), native Legendary Action / Legendary Resistance pips, and the Legendary Actions on
//  their own items in the Legendary Actions section. The character copy is not changed.
//  Run it again for the same character to rebuild its NPC (stats and items replaced).
//  Then bind the NPC in the Nix Fix window and re-apply the engine, fixes and boss kit.
// =====================================================================
const MOD = 'nix-module';
const api = game.modules.get(MOD)?.api;
if (!api?.statBlock) return ui.notifications.warn('Make stat block: the Court of Ravenloft runtime isn\'t running (v13 / Chris\'s Premades 1 only).');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const picked = canvas.tokens.controlled[0]?.actor;
// Captains (Father Octavian, Zadimus; 1.7.1): their fixes mark them, and their stat block has no Legendary Actions or Resistance.
const isCaptain = a => !!a.flags?.[MOD]?.court?.captain;
const sources = game.actors.filter(a => a.type === 'character' && (a.flags?.[MOD]?.boss || isCaptain(a) || /\(boss\)/i.test(a.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
if (!sources.length) return ui.notifications.warn('Make stat block: no boss or captain character found (a character with a boss kit, or "(Boss)" in its name).');
const first = sources.find(a => a.id === picked?.id) ?? sources[0];
const crOf = a => api.statBlock.statBlocksOf(a)[0]?.system.details.cr;
const options = sources.map(a => {
    const has = api.statBlock.statBlocksOf(a).length;
    return '<option value="' + a.id + '"' + (a === first ? ' selected' : '') + '>' + esc(a.name) + (isCaptain(a) ? ' (captain)' : '') + (has ? ' (has a stat block)' : '') + '</option>';
}).join('');
const content = '<p>Makes an NPC actor with the same name from the boss or captain character. The character is not changed. Captains get no Legendary Actions or Legendary Resistance.</p>'
    + '<div class="form-group"><label>Boss or captain</label><select name="source">' + options + '</select></div>'
    + '<div class="form-group"><label>Challenge Rating</label><input type="text" name="cr" placeholder="e.g. 20" value="' + esc(crOf(first) ?? '') + '"></div>'
    + '<p class="hint">CR sets XP only: proficiency follows the class levels (or the CR, whichever is higher).</p>';
const res = await foundry.applications.api.DialogV2.prompt({
    window: {title: 'Make stat block'}, content, rejectClose: false,
    ok: {label: 'Make stat block', callback: (event, button) => ({source: button.form.elements.source.value, cr: button.form.elements.cr.value})}
});
if (!res) return;
const src = game.actors.get(res.source);
const crText = String(res.cr ?? '').trim();
const fractions = {'1/8': 0.125, '1/4': 0.25, '1/2': 0.5};
const cr = fractions[crText] ?? Number(crText);
if (!src || crText === '' || !Number.isFinite(cr) || cr < 0 || cr > 30) return ui.notifications.warn('Make stat block: pick a character and a CR between 0 and 30 (1/8, 1/4, 1/2 work too).');
let rebuild = null;
const existing = api.statBlock.statBlocksOf(src);
if (existing.length) {
    const pick = await foundry.applications.api.DialogV2.wait({
        window: {title: 'Make stat block: ' + src.name}, rejectClose: false,
        content: '<p>' + esc(src.name) + ' already has an NPC stat block. Rebuild it from the character (stats, items and effects replaced; its tokens and folder stay), or make another one?</p>',
        buttons: [{action: 'rebuild', label: 'Rebuild it', default: true}, {action: 'new', label: 'Make another'}, {action: 'cancel', label: 'Cancel'}]
    });
    if (!pick || pick === 'cancel') return;
    if (pick === 'rebuild') rebuild = existing[0];
}
const {npc} = await api.statBlock.makeStatBlock(src, {cr, rebuild});
npc?.sheet?.render(true);
