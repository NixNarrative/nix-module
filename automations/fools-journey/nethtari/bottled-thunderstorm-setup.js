// =====================================================================
//  BOTTLED THUNDERSTORM: one-click SETUP (Script macro, run as GM)
//  Select the token of the character who owns "Bottled Thunderstorm", then run.
//  Safe to re-run: it rebuilds the item's activities each time (charges kept).
//
//   8 charges. Activities:
//   - Lightning Bolt (3 charges): 100 ft line, DC 15 Dex, 6d6 lightning, half on save
//   - Lightning Bolt (5 charges): 100 ft line, DC 18 Dex, 9d6 lightning, half on save
//   - Thunderwave (2+ charges): 15 ft cube, DC 15 Con (+1 per extra charge), 2d8 thunder,
//     creatures that fail are pushed 10 ft away
//   - Swift Winds (1 charge): a creature gets +10 ft speed for 1 minute
//   - Swift Winds (3 charges): a creature gets +20 ft speed for 1 minute
//   - Fair Winds (1 charge): a ship's speed doubles for 1 day (chat note)
//   - Unleash the Storm (all charges): a magical thunderstorm, big storm-cloud
//     animation (like Call Lightning) that lasts until 'Calm the Storm' is used
//   - Recharge in a Storm (no cost): opened in a natural thunderstorm, regains
//     1d8 charges; going past 8 charges gives a 20% chance it's destroyed.
// =====================================================================
 
const ITEM = 'bottled thunderstorm';
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Bottled Thunderstorm setup: select the owner\'s token first.');
const item = actor.items.find(i => i.name.toLowerCase().trim() === ITEM);
if (!item) return ui.notifications.error(actor.name + ' has no item named "Bottled Thunderstorm".');
 
// ---- Charges -------------------------------------------------------------------
const spent = Math.min(8, Number(item.system.uses?.spent ?? 0));
await item.update({'system.uses': {spent, max: '8', recovery: []}});
 
// ---- Wipe old activities and our old effects -----------------------------------
for (const a of item.system.activities?.contents ?? []) await item.update({['system.activities.-=' + a.id]: null});
const oldFx = item.effects.filter(e => e.getFlag('world', 'nixThunder'));
if (oldFx.length) await item.deleteEmbeddedDocuments('ActiveEffect', oldFx.map(e => e.id));
const oldMacros = item.flags?.['chris-premades']?.embeddedActivityMacros;
if (oldMacros) await item.unsetFlag('chris-premades', 'embeddedActivityMacros');
 
// ---- Speed effects -----------------------------------------------------------------
const speedFx = async (ft) => (await item.createEmbeddedDocuments('ActiveEffect', [{
    name: 'Swift Winds (+' + ft + ' ft)', img: 'icons/magic/air/wind-swirl-gray-blue.webp', transfer: false,
    duration: {seconds: 60},
    description: '+' + ft + ' ft to walking speed for 1 minute.',
    changes: [{key: 'system.attributes.movement.walk', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(ft), priority: 20}],
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
const unleash = byName('Unleash the Storm (all charges)');
const recharge = byName('Recharge in a Storm');
const wave = byName('Thunderwave (2+ charges)');
const calm = byName('Calm the Storm');
 
// ---- Activity scripts ------------------------------------------------------------------
const unleashScript = async () => {
    const item = workflow.item;
    const left = item.system.uses?.value ?? 0;
    if (left <= 0) return ui.notifications.warn(item.name + ' has no charges left.');
    await genericUtils.update(item, {'system.uses.spent': Number(item.system.uses.max) || 8});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        content: '<b>' + item.name + ':</b> every charge (' + left + ') bursts free! A magical thunderstorm rages overhead. (Use <b>Calm the Storm</b> to end the storm animation.)'});
    // Storm cloud like Call Lightning: a big dark cloud over the area, lasting until calmed.
    const token = workflow.token;
    if (token && globalThis.Sequencer) {
        const pick = list => list.find(f => Sequencer.Database.entryExists(f));
        const cloud = pick(['jb2a.call_lightning.high_res.blue', 'jb2a.call_lightning.low_res.blue', 'jb2a.call_lightning.high_res.blueorange', 'jb2a.call_lightning.low_res.blueorange']);
        const strike = pick(['jb2a.lightning_strike.blue', 'jb2a.lightning_strike.blue.0', 'jb2a.chain_lightning.primary.blue']);
        const seq = new Sequence();
        if (cloud) seq.effect().file(cloud).atLocation(token).size(24, {gridUnits: true})
            .opacity(0.85).fadeIn(1500).fadeOut(1500).persist().aboveLighting().name('Bottled Thunderstorm ' + workflow.actor.id);
        if (strike) seq.effect().file(strike).atLocation(token).delay(800).scaleToObject(3);
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
        await genericUtils.update(item, {'system.uses.spent': max - total});
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
            content: '<b>' + item.name + ':</b> regains ' + gain.total + ' charges (' + total + '/' + max + ').'});
        return;
    }
    await genericUtils.update(item, {'system.uses.spent': 0});
    const risk = await new Roll('1d100').evaluate();
    await risk.toMessage({speaker: ChatMessage.getSpeaker({actor: workflow.actor}), flavor: item.name + ': overcharged! (1-20 destroys it)'});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        content: '<b>' + item.name + ':</b> the storm is too great (' + total + ' charges). '
            + (risk.total <= 20 ? '<b>The bottle shatters and is destroyed!</b> (GM: delete the item.)' : 'The bottle holds, full at ' + max + ' charges.')});
};
// Thunderwave: push every creature that failed its save 10 ft away (like CPR's Thunderous Smite).
const pushScript = async () => {
    if (!workflow.failedSaves?.size || !workflow.token) return;
    await Promise.all(Array.from(workflow.failedSaves).map(t => tokenUtils.pushToken(workflow.token, t, 10)));
};
const run = fn => 'await (' + fn.toString() + ')();';
await item.setFlag('chris-premades', 'embeddedActivityMacros', {
    [unleash.id]: [{name: 'Unleash the Storm', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: run(unleashScript)}],
    [recharge.id]: [{name: 'Recharge in a Storm', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: run(rechargeScript)}],
    [calm.id]: [{name: 'Calm the Storm', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: run(calmScript)}],
    [wave.id]: [{name: 'Thunderwave push', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: run(pushScript)}]
});
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Bottled Thunderstorm set up on ' + actor.name + '</b>: '
    + (8 - spent) + '/8 charges, 8 activities (Lightning Bolt 3/5, Thunderwave 2+, Swift Winds 1/3, Fair Winds, Unleash, Recharge).'});
 