// =====================================================================
//  BOTTLED THUNDERSTORM SETUP, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with the owner selected, as GM).
//  Safe to re-run: rebuilds the item's activities each time (charges kept).
//
//   8 charges. Lightning Bolt 3 / 5 charges, Thunderwave 2+ (pushes 10 ft on a failed
//   save), Swift Winds 1 / 3, Fair Winds, Unleash the Storm, Recharge in a Storm,
//   Calm the Storm.
//  v14 changes: effects use system.changes / {value, units}; activity macros are CAT
//  macros on each activity (activityRollFinished); the push uses tokenUtils.slideToken.
//  The line and cube areas are the activities' own templates (placed as Regions on v14).
// =====================================================================
 
const ITEM = 'bottled thunderstorm';
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Bottled Thunderstorm setup (v14): select the owner\'s token first.');
const item = actor.items.find(i => i.name.toLowerCase().trim() === ITEM);
if (!item) return ui.notifications.error(actor.name + ' has no item named "Bottled Thunderstorm".');
const run = fn => 'return await (' + fn.toString() + ')();';
const catMacro = (name, fn) => [{name, event: 'roll', pass: 'activityRollFinished', macros: [{priority: 50, macro: run(fn)}]}];
 
// ---- Charges ----------------------------------------------------------------------
const spent = Math.min(8, Number(item.system.uses?.spent ?? 0));
await item.update({'system.uses': {spent, max: '8', recovery: []}});
 
// ---- Wipe old activities, our old effects, and the inert v13 macros ------------------
for (const a of item.system.activities?.contents ?? []) await item.update({['system.activities.-=' + a.id]: null});
const oldFx = item.effects.filter(e => e.getFlag('world', 'nixThunder'));
if (oldFx.length) await item.deleteEmbeddedDocuments('ActiveEffect', oldFx.map(e => e.id));
if (item.flags?.['chris-premades']?.embeddedActivityMacros) await item.update({'flags.chris-premades.-=embeddedActivityMacros': null});
 
// ---- Speed effects ------------------------------------------------------------------
const speedFx = async (ft) => (await item.createEmbeddedDocuments('ActiveEffect', [{
    name: 'Swift Winds (+' + ft + ' ft)', img: 'icons/magic/air/wind-swirl-gray-blue.webp', transfer: false,
    duration: {value: 60, units: 'seconds'},
    description: '+' + ft + ' ft to walking speed for 1 minute.',
    system: {changes: [{key: 'system.attributes.movement.walk', type: 'add', value: String(ft), priority: 20}]},
    flags: {world: {nixThunder: true}}
}]))[0];
const fx10 = await speedFx(10);
const fx20 = await speedFx(20);
 
const cost = (n, scale) => ({
    targets: [{type: 'itemUses', target: '', value: String(n), scaling: scale ? {mode: 'amount', formula: '1'} : {}}],
    scaling: scale ? {allowed: true, max: '6'} : {allowed: false}
});
const make = (type, data) => item.createActivity(type, data, {renderSheet: false});
 
await make('save', {
    name: 'Lightning Bolt (3 charges)', img: 'icons/magic/lightning/bolt-strike-blue.webp',
    activation: {type: 'action', value: 1}, consumption: cost(3),
    range: {units: 'self'}, target: {template: {type: 'line', size: '100', width: '5', units: 'ft'}, affects: {type: 'creature'}},
    damage: {onSave: 'half', parts: [{number: 6, denomination: 6, types: ['lightning']}]},
    save: {ability: ['dex'], dc: {calculation: '', formula: '15'}}
});
await make('save', {
    name: 'Lightning Bolt (5 charges)', img: 'icons/magic/lightning/bolt-strike-purple.webp',
    activation: {type: 'action', value: 1}, consumption: cost(5),
    range: {units: 'self'}, target: {template: {type: 'line', size: '100', width: '5', units: 'ft'}, affects: {type: 'creature'}},
    damage: {onSave: 'half', parts: [{number: 9, denomination: 6, types: ['lightning']}]},
    save: {ability: ['dex'], dc: {calculation: '', formula: '18'}}
});
await make('save', {
    name: 'Thunderwave (2+ charges)', img: 'icons/magic/sonic/explosion-shock-wave-teal.webp',
    activation: {type: 'action', value: 1}, consumption: cost(2, true),
    range: {units: 'self'}, target: {template: {type: 'cube', size: '15', units: 'ft'}, affects: {type: 'creature'}},
    damage: {onSave: 'half', parts: [{number: 2, denomination: 8, types: ['thunder']}]},
    save: {ability: ['con'], dc: {calculation: '', formula: '15 + @scaling'}}
});
await make('utility', {
    name: 'Swift Winds (1 charge)', img: fx10.img, activation: {type: 'action', value: 1}, consumption: cost(1),
    range: {units: 'touch'}, target: {affects: {type: 'creature', count: '1'}}, effects: [{_id: fx10.id}]
});
await make('utility', {
    name: 'Swift Winds (3 charges)', img: fx20.img, activation: {type: 'action', value: 1}, consumption: cost(3),
    range: {units: 'touch'}, target: {affects: {type: 'creature', count: '1'}}, effects: [{_id: fx20.id}]
});
await make('utility', {
    name: 'Fair Winds (1 charge)', img: 'icons/environment/settlement/ship-sail.webp',
    activation: {type: 'action', value: 1}, consumption: cost(1),
    description: {chatFlavor: 'A favorable wind fills the sails: the ship\'s speed is doubled for 1 day.'}
});
await make('utility', {
    name: 'Unleash the Storm (all charges)', img: 'icons/magic/lightning/bolt-cloud-sky-white.webp',
    activation: {type: 'action', value: 1}, consumption: {targets: [], scaling: {allowed: false}}
});
await make('utility', {
    name: 'Recharge in a Storm', img: 'icons/magic/lightning/bolt-forked-large-blue.webp',
    activation: {type: 'special', value: null}, consumption: {targets: [], scaling: {allowed: false}}
});
await make('utility', {
    name: 'Calm the Storm', img: 'icons/magic/air/wind-weather-sailing-ship.webp',
    activation: {type: 'special', value: null}, consumption: {targets: [], scaling: {allowed: false}}
});
const byName = n => item.system.activities.contents.find(a => a.name === n);
 
// ---- Activity scripts ---------------------------------------------------------------
const unleashScript = async () => {
    const item = workflow.item;
    const left = item.system.uses?.value ?? 0;
    if (left <= 0) return ui.notifications.warn(item.name + ' has no charges left.');
    await documentUtils.update(item, {'system.uses.spent': Number(item.system.uses.max) || 8});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        content: '<b>' + item.name + ':</b> every charge (' + left + ') bursts free! A magical thunderstorm rages overhead. (Use <b>Calm the Storm</b> to end the storm animation.)'});
    const tok = workflow.token;
    if (tok && globalThis.Sequencer) {
        const pick = list => list.find(f => Sequencer.Database.entryExists(f));
        const cloud = pick(['jb2a.call_lightning.high_res.blue', 'jb2a.call_lightning.low_res.blue', 'jb2a.call_lightning.high_res.blueorange', 'jb2a.call_lightning.low_res.blueorange']);
        const strike = pick(['jb2a.lightning_strike.blue', 'jb2a.lightning_strike.blue.0', 'jb2a.chain_lightning.primary.blue']);
        const seq = new Sequence();
        if (cloud) seq.effect().file(cloud).atLocation(tok).size(24, {gridUnits: true})
            .opacity(0.85).fadeIn(1500).fadeOut(1500).persist().aboveLighting().name('Bottled Thunderstorm ' + workflow.actor.id);
        if (strike) seq.effect().file(strike).atLocation(tok).delay(800).scaleToObject(3);
        await seq.play();
    }
};
const calmScript = async () => {
    if (globalThis.Sequencer) await Sequencer.EffectManager.endEffects({name: 'Bottled Thunderstorm ' + workflow.actor.id});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}), content: '<b>' + workflow.item.name + ':</b> the storm clouds disperse.'});
};
const rechargeScript = async () => {
    const item = workflow.item;
    const max = Number(item.system.uses?.max) || 8;
    const before = item.system.uses?.value ?? 0;
    const gain = await new Roll('1d8').evaluate();
    await gain.toMessage({speaker: ChatMessage.getSpeaker({actor: workflow.actor}), flavor: item.name + ': charges drawn from the storm'});
    const total = before + gain.total;
    if (total <= max) {
        await documentUtils.update(item, {'system.uses.spent': max - total});
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
            content: '<b>' + item.name + ':</b> regains ' + gain.total + ' charges (' + total + '/' + max + ').'});
        return;
    }
    await documentUtils.update(item, {'system.uses.spent': 0});
    const risk = await new Roll('1d100').evaluate();
    await risk.toMessage({speaker: ChatMessage.getSpeaker({actor: workflow.actor}), flavor: item.name + ': overcharged! (1-20 destroys it)'});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        content: '<b>' + item.name + ':</b> the storm is too great (' + total + ' charges). '
            + (risk.total <= 20 ? '<b>The bottle shatters and is destroyed!</b> (GM: delete the item.)' : 'The bottle holds, full at ' + max + ' charges.')});
};
// Thunderwave: every creature that failed its save is pushed 10 ft away.
// slideToken wants TokenDocuments; workflow.token / failedSaves are placeables.
const pushScript = async () => {
    if (!workflow.failedSaves?.size || !workflow.token) return;
    const src = workflow.token.document;
    for (const t of workflow.failedSaves) {
        if (!t?.document || t.id === workflow.token.id) continue;
        try { await tokenUtils.slideToken(t.document, {sourceToken: src, distance: 10}); }
        catch (e) { console.warn('Bottled Thunderstorm: push failed for ' + t.name, e); }
    }
};
 
const unleash = byName('Unleash the Storm (all charges)');
const recharge = byName('Recharge in a Storm');
const wave = byName('Thunderwave (2+ charges)');
const calm = byName('Calm the Storm');
if (unleash) await unleash.update({'flags.cat.embeddedMacros': catMacro('Unleash the Storm', unleashScript)});
if (recharge) await recharge.update({'flags.cat.embeddedMacros': catMacro('Recharge in a Storm', rechargeScript)});
if (calm) await calm.update({'flags.cat.embeddedMacros': catMacro('Calm the Storm', calmScript)});
if (wave) await wave.update({'flags.cat.embeddedMacros': catMacro('Thunderwave push', pushScript)});
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Bottled Thunderstorm (v14) set up on ' + actor.name + '</b>: '
    + (8 - spent) + '/8 charges, 9 activities (Lightning Bolt 3/5, Thunderwave 2+, Swift Winds 1/3, Fair Winds, Unleash, Recharge, Calm).'});
 