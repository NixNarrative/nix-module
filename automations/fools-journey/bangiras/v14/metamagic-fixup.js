// =====================================================================
//  METAMAGIC FIX-UP (2024), Foundry v14 copy
//  Run by the Nix Module (or as a Script macro with the sorcerer selected).
//  Safe to run again any time, e.g. after a DDB re-import or a level-up.
//
//  - Finds his Sorcery Points feature.
//  - Points each Metamagic option's cost at THAT item, with the 2024 cost.
//  - Reports options that still carry a Chris's Premades automation (CPR1
//    identifier, or a CPR2/CAT automation), so you can set it to None.
//  It changes only the costs on the Metamagic options.
//  v14 change: also checks CAT's automation flags (flags.cat.automation / flags.cat.macros).
// =====================================================================
 
const COSTS_2024 = {
    'careful spell': 1, 'distant spell': 1, 'empowered spell': 1, 'extended spell': 1,
    'heightened spell': 2, 'quickened spell': 2, 'seeking spell': 1, 'subtle spell': 1,
    'transmuted spell': 1, 'twinned spell': 1
};
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Metamagic fix-up: select the sorcerer\'s token first.');
 
const baseName = item => item.name.toLowerCase().replace(/^metamagic\s*[:\-–]\s*/, '').trim();
// A premade automation that would fight ours: CPR1 identifier, or CAT macros from chris-premades.
const premade = item => {
    if (item.flags?.['chris-premades']?.info?.identifier) return 'old Chris\'s Premades 1 tag (inert on v14)';
    const cat = item.flags?.cat ?? {};
    const fromCpr = Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades');
    if (fromCpr) return 'Chris\'s Premades 2 automation';
    return null;
};
 
const pointItems = actor.items.filter(i => i.type === 'feat'
    && (i.name.toLowerCase().trim() === 'sorcery points' || i.system.identifier === 'sorcery-points'));
if (!pointItems.length) return ui.notifications.error('Metamagic fix-up: ' + actor.name + ' has no "Sorcery Points" feature.');
if (pointItems.length > 1) ui.notifications.warn('Metamagic fix-up: ' + actor.name + ' has '
    + pointItems.length + ' Sorcery Points features. Using the one with uses set up; delete the extra.');
const points = pointItems.find(i => i.system.uses?.max) ?? pointItems[0];
if (!points.system.uses?.max) ui.notifications.warn('Metamagic fix-up: Sorcery Points has no Limited Uses set. '
    + 'Set its Max (e.g. @classes.sorcerer.levels) and Recovery: Long Rest.');
 
const options = actor.items.filter(i => i.type === 'feat'
    && (i.system.type?.subtype === 'metamagic' || COSTS_2024[baseName(i)] !== undefined)
    && i.id !== points.id);
if (!options.length) return ui.notifications.warn('Metamagic fix-up: no Metamagic options found on ' + actor.name + '.');
 
const report = [];
for (const item of options) {
    const cost = COSTS_2024[baseName(item)] ?? 1;
    const activities = item.system.activities?.contents ?? [];
    if (!activities.length) {
        report.push('<li><b>' + item.name + '</b>: no activity to attach a cost to (add a Utility activity, then run again).</li>');
        continue;
    }
    for (const activity of activities) {
        await activity.update({'consumption.targets': [{type: 'itemUses', target: points.id, value: String(cost), scaling: {}}]});
    }
    const p = premade(item);
    report.push('<li><b>' + item.name + '</b>: costs ' + cost + ' Sorcery Point' + (cost > 1 ? 's' : '')
        + (p ? ' &nbsp;<i>(' + p + ': set it to None in the Medkit)</i>' : '') + '</li>');
}
const pp = premade(points);
if (pp) report.push('<li><b>' + points.name + '</b>: <i>' + pp + ': set it to None in the Medkit</i></li>');
 
await ChatMessage.create({
    whisper: [game.user.id],
    content: '<b>Metamagic fix-up (v14): ' + actor.name + '</b><br>Sorcery Points: '
        + (points.system.uses?.value ?? '?') + '/' + (points.system.uses?.max ?? '?') + '<ul>' + report.join('') + '</ul>'
});
ui.notifications.info('Metamagic fix-up done for ' + actor.name + ': ' + options.length + ' option(s) updated.');
 