// =====================================================================
//  VINA FIXES: one-click INSTALLER (Script macro, run as GM)
//  Select Vina's token, then run. Safe to re-run.
//   - Potent Spellcasting: +Wis written into each Cleric cantrip's damage; Blessed Strikes removed
//   - Divine Intervention: pick level -> Cleric spell -> cast free
//   - Warding Flare / Improved: no target confirmation, temp HP to the protected ally
//   - Chef: Vina's Sweet Treats (Wis-mod treats each long rest, 2d4+2 temp HP, Give a Treat)
// =====================================================================
const SCRIPTS = {
 "TREATS_BAKE": "await (async () => {\n    const chef = trigger.entity;\n    const actor = chef.actor;\n    const NAME = 'Vina\\'s Sweet Treats';\n    const count = Math.max(1, actor.system.abilities.wis.mod);\n    const data = foundry.utils.deepClone(chef.getFlag('world', 'nixTreatData'));\n    if (!data) return;\n    const existing = actor.items.find(i => i.name === NAME && i.type === 'consumable');\n    if (existing) await existing.update({'system.quantity': count, 'system.uses.spent': 0});\n    else { data.system.quantity = count; await actor.createEmbeddedDocuments('Item', [data]); }\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),\n        content: '<b>' + chef.name + ':</b> ' + actor.name + ' bakes a fresh batch of <b>' + count + ' ' + NAME + '</b>. Each one grants 2d4 + 2 temporary hit points.'});\n})();",
 "TREATS_GIVE": "await (async () => {\n    const actor = workflow.actor;\n    const NAME = 'Vina\\'s Sweet Treats';\n    const mine = actor.items.find(i => i.name === NAME && i.type === 'consumable');\n    if (!mine || !(mine.system.quantity > 0)) return ui.notifications.warn('No ' + NAME + ' left to give.');\n    const targets = Array.from(workflow.targets ?? []).filter(t => t.actor && t.actor.uuid !== actor.uuid);\n    if (!targets.length) return ui.notifications.warn('Target the party member who gets the treat.');\n    const given = [];\n    for (const t of targets) {\n        if (!(mine.system.quantity > 0)) break;\n        const theirs = t.actor.items.find(i => i.name === NAME && i.type === 'consumable');\n        if (theirs) await genericUtils.update(theirs, {'system.quantity': (theirs.system.quantity ?? 0) + 1});\n        else {\n            const data = mine.toObject(); delete data._id;\n            data.system.quantity = 1; data.system.uses.spent = 0;\n            await itemUtils.createItems(t.actor, [data]);\n        }\n        await mine.update({'system.quantity': mine.system.quantity - 1});\n        given.push(t.document.name);\n    }\n    if (given.length) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),\n        content: '<b>' + actor.name + '</b> hands one of ' + NAME + ' to ' + given.join(', ') + '. (' + mine.system.quantity + ' left)'});\n})();",
 "TREAT_EAT": "await (async () => {\n    const t = workflow.targets?.first?.() ?? workflow.token;\n    if (!t || !globalThis.Sequence) return;\n    const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };\n    const f = ['jb2a.healing_generic.200px.yellow', 'jb2a.healing_generic.burst.yellowwhite', 'jb2a.healing_generic.200px.green'].find(ok);\n    if (f) new Sequence().effect().file(f).atLocation(t).scaleToObject(1.6).play();\n})();",
 "DIVINE": "await (async () => {\n    const actor = workflow.actor;\n    const di = workflow.item;\n    // 1. The Cleric spell list: dnd5e's spell list registry first, then any \"Cleric\" spell-list journal page.\n    let uuids = [];\n    try {\n        const list = dnd5e.registry?.spellLists?.forType?.('class', 'cleric');\n        uuids = Array.from(list?.uuids ?? list?.spells ?? []);\n    } catch {}\n    if (!uuids.length) {\n        for (const pack of game.packs.filter(p => p.documentName === 'JournalEntry')) {\n            const docs = await pack.getDocuments().catch(() => []);\n            for (const j of docs) for (const pg of j.pages) {\n                if (pg.type !== 'spells') continue;\n                if (pg.system?.identifier === 'cleric' || /^cleric/i.test(pg.name)) uuids.push(...Array.from(pg.system?.spells ?? []));\n            }\n        }\n    }\n    uuids = [...new Set(uuids)];\n    if (!uuids.length) { ui.notifications.error(di.name + ': no Cleric spell list found in your compendiums.'); return; }\n    const spells = [];\n    const seen = new Set();\n    for (const u of uuids) {\n        const e = await fromUuid(u).catch(() => null);\n        if (!e || e.type !== 'spell' || seen.has(e.name)) continue;\n        const lvl = Number(e.system.level);\n        if (lvl < 1 || lvl > 5) continue;\n        if ((e.system.activities?.contents ?? []).some(a => a.activation?.type === 'reaction') || e.system.activation?.type === 'reaction') continue;\n        seen.add(e.name);\n        spells.push({uuid: u, name: e.name, level: lvl, img: e.img});\n    }\n    // 2. Menus in the same button style as the Metamagic spell lists, with a Back button.\n    const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];\n    const menu = async (title, content, fields) => {\n        const res = await DialogApp.dialog(title, content, [['button', fields, {displayAsRows: true}]], undefined);\n        return res?.buttons ?? false;\n    };\n    let chosen = null;\n    while (!chosen) {\n        const levels = [1, 2, 3, 4, 5].map(l => [l, spells.filter(s => s.level === l).length]).filter(([, n]) => n);\n        const lv = await menu(di.name, 'Choose a spell level. Any Cleric spell of that level (not a Reaction) is cast without a spell slot.',\n            levels.map(([l, n]) => ({label: ORD[l] + ' Level (' + n + ' spells)', name: String(l), options: {image: 'icons/magic/holy/prayer-hands-glowing-yellow.webp'}}))\n                .concat([{label: 'Cancel', name: 'none', options: {image: 'icons/svg/cancel.svg'}}]));\n        if (!lv || lv === 'none') return;\n        const list = spells.filter(s => s.level === Number(lv)).sort((a, b) => a.name.localeCompare(b.name));\n        const pick = await menu(di.name + ': ' + ORD[lv] + ' Level', 'Choose the spell to cast (no slot, no material components).',\n            [{label: '\\u2190 Back to spell levels', name: 'back', options: {image: 'icons/svg/direction.svg'}}]\n                .concat(list.map(s => ({label: s.name, name: s.uuid, options: {image: s.img}}))));\n        if (!pick) return;\n        if (pick === 'back') continue;\n        chosen = list.find(s => s.uuid === pick);\n    }\n    // 3. Build the spell under its normal name, so Chris's Premades / other automations recognise it:\n    //    her own copy if she has one, else Chris's Premades' version, else the compendium spell.\n    for (const old of actor.items.filter(i => i.getFlag('world', 'nixDivineCast'))) {\n        if (!actor.effects.some(e => e.origin?.includes(old.id))) await old.delete();\n    }\n    const own = actor.items.find(i => i.type === 'spell' && i.name === chosen.name && !i.getFlag('world', 'nixDivineCast'));\n    let data = own?.toObject();\n    if (!data) {\n        try {\n            const cpr = await compendiumUtils.getItemFromCompendium(constants.modernPacks.spells, chosen.name, {ignoreNotFound: true, object: true});\n            if (cpr) data = cpr.toObject ? cpr.toObject() : foundry.utils.deepClone(cpr);\n        } catch {}\n    }\n    if (!data) data = (await fromUuid(chosen.uuid)).toObject();\n    delete data._id;\n    foundry.utils.setProperty(data, 'system.method', 'innate');\n    foundry.utils.setProperty(data, 'system.prepared', 1);\n    foundry.utils.setProperty(data, 'system.sourceClass', 'cleric');\n    foundry.utils.setProperty(data, 'system.uses', {max: '', spent: 0, recovery: []});\n    foundry.utils.setProperty(data, 'system.properties', (data.system.properties ?? []).filter(p => p !== 'material'));\n    foundry.utils.setProperty(data, 'flags.world.nixDivineCast', true);\n    const [item] = await actor.createEmbeddedDocuments('Item', [data]);\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),\n        content: '<b>' + di.name + ':</b> ' + actor.name + '\\'s deity answers. She casts <b>' + chosen.name + '</b> (' + ORD[chosen.level] + ' level) without a spell slot.'});\n    // 4. Non-concentration spells are tidied away once they finish; concentration ones stay until it ends (or a long rest).\n    if (!item.system.properties?.has?.('concentration')) {\n        const id = Hooks.on('midi-qol.RollComplete', wf => {\n            if (wf?.item?.uuid !== item.uuid) return;\n            Hooks.off('midi-qol.RollComplete', id);\n            setTimeout(() => actor.items.get(item.id)?.delete(), 1500);\n        });\n    }\n    const acts = item.system.activities.contents;\n    setTimeout(() => (acts.length === 1 ? acts[0].use({consume: {spellSlot: false, resources: false}}) : item.use()), 300);\n})();",
 "DIVINE_CLEAN": "await (async () => {\n    const actor = trigger.entity.actor;\n    const old = actor.items.filter(i => i.getFlag('world', 'nixDivineCast')).map(i => i.id);\n    if (old.length) await actor.deleteEmbeddedDocuments('Item', old);\n})();",
 "FLARE_TEMP": "await (async () => {\n    const actor = workflow.actor;\n    const ally = workflow.targets?.first?.();\n    if (!ally?.actor) return;\n    const roll = await new Roll('2d6 + ' + actor.system.abilities.wis.mod).evaluate();\n    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: 'Improved Warding Flare: temporary hit points for ' + ally.document.name});\n    const cur = ally.actor.system.attributes.hp.temp ?? 0;\n    if (roll.total > cur) await genericUtils.update(ally.actor, {'system.attributes.hp.temp': roll.total});\n})();"
};
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Vina fixes: select Vina\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name));
async function setMacros(doc, names, add) {
    const kept = (doc.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.setFlag('chris-premades', 'embeddedMacros', kept.concat(add));
}
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update(data);
    return actByName(item, name);
}
 
// ---- 1. Potent Spellcasting: +Wis written into each Cleric cantrip's damage -----------------
// (Same result as Chris's Premades' version, but the bonus is part of the cantrip's own damage, so it
//  shows on the sheet's damage column and in the roll. The runtime macros are switched off to avoid doubling.)
const potent = find(/potent spellcasting/i);
const blessed = actor.items.filter(i => /^blessed strikes/i.test(i.name.trim()) && !/potent/i.test(i.name));
if (blessed.length) { await actor.deleteEmbeddedDocuments('Item', blessed.map(i => i.id)); report.push('<li>Removed <b>Blessed Strikes</b> (' + blessed.length + '); Potent Spellcasting stays.</li>'); }
if (!potent) report.push('<li><b>Potent Spellcasting</b> not found.</li>');
else {
    if (/^blessed strikes/i.test(potent.name)) await potent.update({name: 'Potent Spellcasting'});
    const cprActor = potent.flags?.['chris-premades']?.macros?.midi?.actor;
    if (Array.isArray(cprActor) && cprActor.includes('potentSpellcasting'))
        await potent.setFlag('chris-premades', 'macros.midi.actor', cprActor.filter(m => m !== 'potentSpellcasting'));
    await setMacros(potent, ['Potent Spellcasting: on', 'Potent Spellcasting: off'], []);
    const stray = actor.effects.filter(e => e.flags?.['chris-premades']?.info?.identifier === 'nixPotentSpellcasting');
    if (stray.length) await actor.deleteEmbeddedDocuments('ActiveEffect', stray.map(e => e.id));
    const onlyCleric = Object.keys(actor.classes ?? {}).every(k => k === 'cleric');
    const cantrips = actor.items.filter(i => i.type === 'spell' && Number(i.system.level) === 0
        && (i.system.sourceClass === 'cleric' || (!i.system.sourceClass && onlyCleric)));
    const done = [];
    for (const sp of cantrips) {
        let changed = false;
        for (const act of sp.system.activities.contents) {
            const parts = act.toObject().damage?.parts;
            if (!parts?.length) continue;
            const p = parts[0];
            if (p.custom?.enabled) {
                if (!/wis\.mod/.test(p.custom.formula ?? '')) { p.custom.formula = (p.custom.formula || '0') + ' + @abilities.wis.mod'; changed = true; }
            } else if (!/wis\.mod/.test(p.bonus ?? '')) { p.bonus = (p.bonus ? p.bonus + ' + ' : '') + '@abilities.wis.mod'; changed = true; }
            if (changed) await act.update({'damage.parts': parts});
        }
        if (changed || sp.system.activities.contents.some(a => /wis\.mod/.test(JSON.stringify(a.toObject().damage ?? {})))) done.push(sp.name);
    }
    report.push('<li>Potent Spellcasting: +Wis (+' + actor.system.abilities.wis.mod + ') is now part of the damage of ' + (done.join(', ') || 'no damaging Cleric cantrips') + '. It shows on the sheet and in the roll (e.g. 2d8 + ' + actor.system.abilities.wis.mod + ').</li>');
}
 
// ---- 2. Chef: Vina's Sweet Treats -----------------------------------------------------------------
const chef = find(/^chef/i);
if (!chef) report.push('<li><b>Chef</b> not found.</li>');
else {
    const NAME = 'Vina\'s Sweet Treats';
    const treatData = {
        name: NAME, type: 'consumable', img: 'icons/consumables/food/cake-slice-chocolate-white-pink.webp',
        system: {
            type: {value: 'food', subtype: ''}, quantity: 1, weight: {value: 0, units: 'lb'},
            uses: {max: '1', spent: 0, autoDestroy: true, recovery: []},
            description: {value: '<p>A sweet treat baked by Vina. Eating it (Bonus Action) grants <strong>2d4 + 2 temporary hit points</strong>.</p><p>Vina bakes a fresh batch equal to her Wisdom modifier on each Long Rest.</p>'},
            activities: {
                nixEatTreat00000: {_id: 'nixEatTreat00000', type: 'heal', name: 'Eat Treat', img: 'icons/consumables/food/cake-slice-chocolate-white-pink.webp',
                    activation: {type: 'bonus', value: 1}, consumption: {targets: [{type: 'itemUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}},
                    range: {units: 'self'}, target: {affects: {type: 'self'}},
                    healing: {number: 2, denomination: 4, bonus: '2', types: ['temphp']}}
            }
        },
        flags: {world: {nixSweetTreat: true}, 'chris-premades': {embeddedMacros: [
            {name: 'Sweet Treat sparkle', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.TREAT_EAT}]}}
    };
    await chef.setFlag('world', 'nixTreatData', treatData);
    const give = await ensureActivity(chef, 'Give a Treat', 'utility', {
        img: treatData.img, activation: {type: 'action', value: 1, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'ft', value: '5', override: true},
        target: {affects: {type: 'creature', count: '1'}, override: true},
        description: {chatFlavor: 'Hand one of Vina\'s Sweet Treats to the targeted creature.'}});
    await chef.setFlag('chris-premades', 'embeddedActivityMacros.' + give.id, [
        {name: 'Give a Treat', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.TREATS_GIVE}]);
    await setMacros(chef, ['Sweet Treats: bake'], [{name: 'Sweet Treats: bake', type: 'rest', pass: 'long', priority: 50, macro: SCRIPTS.TREATS_BAKE}]);
    // Bake the first batch now (or refresh the existing stack's look).
    const count = Math.max(1, actor.system.abilities.wis.mod);
    const existing = actor.items.find(i => i.name === NAME && i.type === 'consumable');
    if (existing) { const d = foundry.utils.deepClone(treatData); delete d.system.quantity; await existing.update(d); }
    else { const d = foundry.utils.deepClone(treatData); d.system.quantity = count; await actor.createEmbeddedDocuments('Item', [d]); }
    report.push('<li>Chef: <b>' + NAME + '</b> added to her inventory (' + (existing ? existing.system.quantity : count) + ' now). Each Long Rest her stack is refilled to ' + count + ' (her Wisdom modifier). A treat is eaten as a Bonus Action for 2d4 + 2 temp HP. '
        + 'To share: target a party member and use <b>Chef > Give a Treat</b>; one treat moves to their inventory (they can also be dragged onto their sheet).</li>');
}
 
// ---- 3. Divine Intervention: pick a Cleric spell (level 1-5) by level, cast it free ------------------
const di = find(/^divine intervention/i);
if (!di) report.push('<li><b>Divine Intervention</b> not found.</li>');
else {
    for (const k of ['info', 'macros', 'embeddedActivityMacros']) if (di.flags?.['chris-premades']?.[k]) await di.unsetFlag('chris-premades', k);
    for (const a of di.system.activities.contents.filter(a => a.name !== 'Divine Intervention')) await di.update({['system.activities.-=' + a.id]: null});
    if (!(Number(di.system.uses?.max) > 0)) await di.update({'system.uses': {max: '1', spent: 0, recovery: [{period: 'lr', type: 'recoverAll'}]}});
    const act = await ensureActivity(di, 'Divine Intervention', 'utility', {
        img: di.img, activation: {type: 'action', value: 1, override: true},
        consumption: {targets: [{type: 'itemUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Call on your deity: cast any Cleric spell of level 5 or lower (not a Reaction) without a slot.'}});
    await di.setFlag('chris-premades', 'embeddedActivityMacros.' + act.id, [
        {name: 'Divine Intervention', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.DIVINE}]);
    await setMacros(di, ['Divine Intervention cleanup'], [{name: 'Divine Intervention cleanup', type: 'rest', pass: 'long', priority: 50, macro: SCRIPTS.DIVINE_CLEAN}]);
    report.push('<li>Divine Intervention: choose a spell level, then the spell (button list like the Metamagic menus, with a Back button). It is cast under its normal name (her own copy or Chris\'s Premades\' version when available, so automations work) with no slot. The temporary copy is removed after the cast (concentration spells: on her next long rest).</li>');
}
 
// ---- 4. Warding Flare / Improved Warding Flare: no target confirmation ----------------------------------
const flare = find(/^warding flare/i);
const improved = find(/^improved warding flare/i);
for (const it of [flare, improved].filter(Boolean)) {
    for (const a of it.system.activities.contents) await a.update({'midiProperties.confirmTargets': 'never'});
}
if (flare) {
    const cprImproved = improved?.flags?.['chris-premades']?.info?.identifier === 'improvedWardingFlare';
    await setMacros(flare, ['Improved Warding Flare temp HP'], (improved && !cprImproved) ? [
        {name: 'Improved Warding Flare temp HP', type: 'midi-item', pass: 'rollFinished', priority: 60, macro: SCRIPTS.FLARE_TEMP}] : []);
    report.push('<li>Warding Flare' + (improved ? ' and Improved Warding Flare' : '') + ': no more target confirmation; the protected ally is targeted automatically.'
        + (improved ? (cprImproved ? ' Improved Warding Flare\'s 2d6 + Wis temp HP go to that ally (Chris\'s Premades).' : ' The protected ally automatically gains 2d6 + Wis temp HP.') : '') + '</li>');
} else report.push('<li><b>Warding Flare</b> not found.</li>');
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Vina fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 