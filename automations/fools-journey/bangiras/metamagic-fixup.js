// =====================================================================
//  METAMAGIC FIX-UP (2024): run once per sorcerer
//  A regular Script macro (Macro Directory > Create Macro > Type: Script).
//  Select the sorcerer's token, then run it. Safe to run again any time,
//  e.g. after a DDB re-import or a level-up that adds a Metamagic option.
//
//  What it does:
//   - Finds his Sorcery Points feature (warns if there are none or several).
//   - Finds every Metamagic option (Metamagic subtype, or a known name).
//   - Points each option's cost at THAT Sorcery Points item, with the 2024 cost.
//   - Reports anything still using a CPR automation, so you can set it to None.
//  It changes only the costs on the Metamagic options. Nothing else.
// =====================================================================
 
const COSTS_2024 = {
    'careful spell': 1, 'distant spell': 1, 'empowered spell': 1, 'extended spell': 1,
    'heightened spell': 2, 'quickened spell': 2, 'seeking spell': 1, 'subtle spell': 1,
    'transmuted spell': 1, 'twinned spell': 1
};
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Metamagic fix-up: select the sorcerer\'s token first.');
 
// Normalise names like "Metamagic: Twinned Spell" -> "twinned spell".
const baseName = item => item.name.toLowerCase().replace(/^metamagic\s*[:\-–]\s*/, '').trim();
 
// ---- Sorcery Points -------------------------------------------------------
const pointItems = actor.items.filter(i => i.type === 'feat'
    && (i.name.toLowerCase().trim() === 'sorcery points' || i.system.identifier === 'sorcery-points'));
if (!pointItems.length) return ui.notifications.error('Metamagic fix-up: ' + actor.name + ' has no "Sorcery Points" feature.');
if (pointItems.length > 1) ui.notifications.warn('Metamagic fix-up: ' + actor.name + ' has '
    + pointItems.length + ' Sorcery Points features. Using the one with uses set up; delete the extra.');
const points = pointItems.find(i => i.system.uses?.max) ?? pointItems[0];
if (!points.system.uses?.max) ui.notifications.warn('Metamagic fix-up: Sorcery Points has no Limited Uses set. '
    + 'Set its Max (e.g. @scale.sorcerer.sorcery-points or a number) and Recovery: Long Rest.');
 
// ---- Metamagic options ------------------------------------------------------
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
        await activity.update({
            'consumption.targets': [{type: 'itemUses', target: points.id, value: String(cost), scaling: {}}]
        });
    }
    const cpr = item.flags['chris-premades']?.info?.identifier;
    report.push('<li><b>' + item.name + '</b>: costs ' + cost + ' Sorcery Point' + (cost > 1 ? 's' : '')
        + (cpr ? ' &nbsp;<i>(still has a CPR automation: set it to None in the Medkit)</i>' : '') + '</li>');
}
if (points.flags['chris-premades']?.info?.identifier) {
    report.push('<li><b>' + points.name + '</b>: <i>still has a CPR automation: set it to None in the Medkit</i></li>');
}
 
await ChatMessage.create({
    whisper: [game.user.id],
    content: '<b>Metamagic fix-up: ' + actor.name + '</b><br>Sorcery Points: '
        + (points.system.uses?.value ?? '?') + '/' + (points.system.uses?.max ?? '?') + '<ul>' + report.join('') + '</ul>'
});
ui.notifications.info('Metamagic fix-up done for ' + actor.name + ': ' + options.length + ' option(s) updated.');
 