// =====================================================================
//  VINA FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Vina selected, as GM).
//  Safe to re-run.
//   - Potent Spellcasting: +Wis written into each Cleric cantrip's damage (no macro)
//   - Chef: Vina's Sweet Treats (bake on a Long Rest, Give a Treat, sparkle on eating)
//   - Divine Intervention: pick level -> Cleric spell -> cast free (button menus)
//   - Warding Flare / Improved: Chris's Premades 2 does both on v14 (ours retired);
//     only the "no target confirmation" setting is kept
//  v14 changes: CAT macros (rest/actorLong, activityRollFinished, itemRollFinished),
//  DialogApp replaced with button dialogs, compendium lookup through CAT.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Vina fixes (v14): select Vina\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name));
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
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update(data);
    return actByName(item, name);
}
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
 
// =====================================================================
//  Macros
// =====================================================================
// Chef: rest / actorLong / 50. A fresh batch (Wis mod) of treats.
const treatsBake = async () => {
    const chef = document;
    const me = chef.parent;
    const NAME = 'Vina\'s Sweet Treats';
    const count = Math.max(1, me.system.abilities.wis.mod);
    const data = foundry.utils.deepClone(chef.getFlag('world', 'nixTreatData'));
    if (!data) return;
    const existing = me.items.find(i => i.name === NAME && i.type === 'consumable');
    if (existing) await documentUtils.update(existing, {'system.quantity': count, 'system.uses.spent': 0});
    else { data.system.quantity = count; await me.createEmbeddedDocuments('Item', [data]); }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + chef.name + ':</b> ' + me.name + ' bakes a fresh batch of <b>' + count + ' ' + NAME + '</b>. Each one grants 2d4 + 2 temporary hit points.'});
};
// Chef "Give a Treat" activity: roll / activityRollFinished / 50.
const treatsGive = async () => {
    const me = workflow.actor;
    const NAME = 'Vina\'s Sweet Treats';
    const mine = me.items.find(i => i.name === NAME && i.type === 'consumable');
    if (!mine || !(mine.system.quantity > 0)) return ui.notifications.warn('No ' + NAME + ' left to give.');
    const targets = Array.from(workflow.targets ?? []).filter(t => t.actor && t.actor.uuid !== me.uuid);
    if (!targets.length) return ui.notifications.warn('Target the party member who gets the treat.');
    const given = [];
    for (const t of targets) {
        if (!(mine.system.quantity > 0)) break;
        const theirs = t.actor.items.find(i => i.name === NAME && i.type === 'consumable');
        try {
            if (theirs) await documentUtils.update(theirs, {'system.quantity': (theirs.system.quantity ?? 0) + 1});
            else {
                const data = mine.toObject(); delete data._id;
                data.system.quantity = 1; data.system.uses.spent = 0;
                if (itemUtils.createItems) await itemUtils.createItems(t.actor, [data]);
                else await t.actor.createEmbeddedDocuments('Item', [data]);
            }
        } catch (e) { ui.notifications.warn('Could not hand a treat to ' + t.document.name + ' (the GM can drag one onto their sheet).'); continue; }
        await mine.update({'system.quantity': mine.system.quantity - 1});
        given.push(t.document.name);
    }
    if (given.length) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + me.name + '</b> hands one of ' + NAME + ' to ' + given.join(', ') + '. (' + mine.system.quantity + ' left)'});
};
// On the treat item: roll / itemRollFinished / 50.
const treatEat = async () => {
    const t = workflow.targets?.first?.() ?? workflow.token;
    if (!t || !globalThis.Sequence) return;
    const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
    const f = ['jb2a.healing_generic.200px.yellow', 'jb2a.healing_generic.burst.yellowwhite', 'jb2a.healing_generic.200px.green'].find(ok);
    if (f) new Sequence().effect().file(f).atLocation(t).scaleToObject(1.6).play();
};
// Divine Intervention activity: roll / activityRollFinished / 50.
const divine = async () => {
    const me = workflow.actor;
    const di = workflow.item;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    let uuids = [];
    try {
        const list = dnd5e.registry?.spellLists?.forType?.('class', 'cleric');
        uuids = Array.from(list?.uuids ?? list?.spells ?? []);
    } catch {}
    if (!uuids.length) {
        for (const pack of game.packs.filter(p => p.documentName === 'JournalEntry')) {
            const docs = await pack.getDocuments().catch(() => []);
            for (const j of docs) for (const pg of j.pages) {
                if (pg.type !== 'spells') continue;
                if (pg.system?.identifier === 'cleric' || /^cleric/i.test(pg.name)) uuids.push(...Array.from(pg.system?.spells ?? []));
            }
        }
    }
    uuids = [...new Set(uuids)];
    if (!uuids.length) { ui.notifications.error(di.name + ': no Cleric spell list found in your compendiums.'); return; }
    const spells = [];
    const seen = new Set();
    for (const u of uuids) {
        const e = await fromUuid(u).catch(() => null);
        if (!e || e.type !== 'spell' || seen.has(e.name)) continue;
        const lvl = Number(e.system.level);
        if (lvl < 1 || lvl > 5) continue;
        if ((e.system.activities?.contents ?? []).some(a => a.activation?.type === 'reaction')) continue;
        seen.add(e.name);
        spells.push({uuid: u, name: e.name, level: lvl, img: e.img});
    }
    const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];
    let chosen = null;
    while (!chosen) {
        const levels = [1, 2, 3, 4, 5].map(l => [l, spells.filter(s => s.level === l).length]).filter(([, n]) => n);
        const lv = await dialogUtils.buttonDialog(di.name, 'Choose a spell level. Any Cleric spell of that level (not a Reaction) is cast without a spell slot.',
            levels.map(([l, n]) => [ORD[l] + ' Level (' + n + ' spells)', String(l), {image: 'icons/magic/holy/prayer-hands-glowing-yellow.webp'}])
                .concat([['Cancel', 'none', {image: 'icons/svg/cancel.svg'}]]), {userId, displayAsRows: true});
        if (!lv || lv === 'none') return;
        const list = spells.filter(s => s.level === Number(lv)).sort((a, b) => a.name.localeCompare(b.name));
        const pick = await dialogUtils.buttonDialog(di.name + ': ' + ORD[lv] + ' Level', 'Choose the spell to cast (no slot, no material components).',
            [['← Back to spell levels', 'back', {image: 'icons/svg/direction.svg'}]].concat(list.map(s => [s.name, s.uuid, {image: s.img}])), {userId, displayAsRows: true});
        if (!pick) return;
        if (pick === 'back') continue;
        chosen = list.find(s => s.uuid === pick);
    }
    for (const old of me.items.filter(i => i.getFlag('world', 'nixDivineCast'))) {
        if (!me.effects.some(e => e.origin?.includes(old.id))) await old.delete();
    }
    // Her own copy first (keeps its automation), then Chris's Premades 2's compendium version, then the list's.
    const own = me.items.find(i => i.type === 'spell' && i.name === chosen.name && !i.getFlag('world', 'nixDivineCast'));
    let data = own?.toObject();
    if (!data) {
        try {
            const doc = await (compendiumUtils.getSpell?.(chosen.name, {rules: 'modern'}) ?? compendiumUtils.getDocumentByName?.(chosen.name, {type: 'spell'}));
            if (doc) data = doc.toObject ? doc.toObject() : foundry.utils.deepClone(doc);
        } catch {}
    }
    if (!data) data = (await fromUuid(chosen.uuid)).toObject();
    delete data._id;
    foundry.utils.setProperty(data, 'system.method', 'innate');
    foundry.utils.setProperty(data, 'system.prepared', 1);
    foundry.utils.setProperty(data, 'system.sourceClass', 'cleric');
    foundry.utils.setProperty(data, 'system.uses', {max: '', spent: 0, recovery: []});
    foundry.utils.setProperty(data, 'system.properties', (data.system.properties ?? []).filter(p => p !== 'material'));
    foundry.utils.setProperty(data, 'flags.world.nixDivineCast', true);
    const [cast] = await me.createEmbeddedDocuments('Item', [data]);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + di.name + ':</b> ' + me.name + '\'s deity answers. She casts <b>' + chosen.name + '</b> (' + ORD[chosen.level] + ' level) without a spell slot.'});
    if (!cast.system.properties?.has?.('concentration')) {
        const id = Hooks.on('midi-qol.RollComplete', wf => {
            if (wf?.item?.uuid !== cast.uuid) return;
            Hooks.off('midi-qol.RollComplete', id);
            setTimeout(() => me.items.get(cast.id)?.delete(), 1500);
        });
    }
    const acts = cast.system.activities.contents;
    setTimeout(() => (acts.length === 1 ? acts[0].use({consume: {spellSlot: false, resources: false}}) : cast.use()), 300);
};
// Divine Intervention: rest / actorLong / 50. Remove left-over temporary spell copies.
const divineClean = async () => {
    const me = document.parent;
    const old = me.items.filter(i => i.getFlag('world', 'nixDivineCast')).map(i => i.id);
    if (old.length) await me.deleteEmbeddedDocuments('Item', old);
};
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Potent Spellcasting ------------------------------------------------------------------
const potent = find(/potent spellcasting/i);
const blessed = actor.items.filter(i => /^blessed strikes/i.test(i.name.trim()) && !/potent/i.test(i.name));
if (blessed.length) report.push('<li><i>Delete <b>Blessed Strikes</b> (' + blessed.length + '); Potent Spellcasting replaces it.</i></li>');
if (!potent) report.push('<li><b>Potent Spellcasting</b> not found.</li>');
else if (premadeOn(potent) === 'cpr2') report.push('<li>Potent Spellcasting has Chris\'s Premades 2\'s automation: set it to None in the Medkit, or the +Wis we write into the cantrips is added twice. Then run this again.</li>');
else {
    const onlyCleric = Object.keys(actor.classes ?? {}).every(k => k === 'cleric');
    const cantrips = actor.items.filter(i => i.type === 'spell' && Number(i.system.level) === 0
        && (i.system.sourceClass === 'cleric' || (!i.system.sourceClass && onlyCleric)));
    const done = [];
    for (const sp of cantrips) {
        let has = false;
        for (const act of sp.system.activities.contents) {
            const parts = act.toObject().damage?.parts;
            if (!parts?.length) continue;
            const p = parts[0];
            let changed = false;
            if (p.custom?.enabled) {
                if (!/wis\.mod/.test(p.custom.formula ?? '')) { p.custom.formula = (p.custom.formula || '0') + ' + @abilities.wis.mod'; changed = true; }
            } else if (!/wis\.mod/.test(p.bonus ?? '')) { p.bonus = (p.bonus ? p.bonus + ' + ' : '') + '@abilities.wis.mod'; changed = true; }
            if (changed) await act.update({'damage.parts': parts});
            has = true;
        }
        if (has) done.push(sp.name);
    }
    report.push('<li>Potent Spellcasting: +Wis is part of the damage of ' + (done.join(', ') || 'no damaging Cleric cantrips') + '. <b>Don\'t apply Chris\'s Premades 2\'s Potent Spellcasting</b> (it would add it again).'
        + (done.some(n => /toll the dead/i.test(n)) ? ' Re-run this after re-applying Toll the Dead in the Medkit.' : '') + '</li>');
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
        flags: {world: {nixSweetTreat: true}, cat: {embeddedMacros: [entry('Sweet Treat sparkle', 'roll', 'itemRollFinished', 50, treatEat)]}}
    };
    await chef.setFlag('world', 'nixTreatData', treatData);
    const give = await ensureActivity(chef, 'Give a Treat', 'utility', {
        img: treatData.img, activation: {type: 'action', value: 1, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'ft', value: '5', override: true},
        target: {affects: {type: 'creature', count: '1'}, override: true}});
    await setCat(give, ['Give a Treat'], [entry('Give a Treat', 'roll', 'activityRollFinished', 50, treatsGive)]);
    await setCat(chef, ['Sweet Treats: bake'], [entry('Sweet Treats: bake', 'rest', 'actorLong', 50, treatsBake)]);
    await dropOld(chef, ['Sweet Treats: bake', 'Give a Treat']);
    // Refresh existing stacks (hers and anyone she gave treats to) so their sparkle macro is the v14 one.
    const stacks = game.actors.contents.flatMap(a => a.items.filter(i => i.name === NAME && i.type === 'consumable'));
    for (const s of stacks) {
        await s.update({'flags.cat.embeddedMacros': treatData.flags.cat.embeddedMacros});
        if (s.flags?.['chris-premades']?.embeddedMacros?.length) await s.update({'flags.chris-premades.embeddedMacros': []});
    }
    const mineStack = actor.items.find(i => i.name === NAME && i.type === 'consumable');
    if (!mineStack) { const d = foundry.utils.deepClone(treatData); d.system.quantity = Math.max(1, actor.system.abilities?.wis?.mod ?? 1); await actor.createEmbeddedDocuments('Item', [d]); }
    report.push('<li>Chef: <b>' + NAME + '</b> refill to her Wis modifier on each Long Rest; <b>Give a Treat</b> moves one to the targeted ally; eating one sparkles.'
        + (stacks.length ? ' (' + stacks.length + ' existing stack(s) updated.)' : '') + '</li>');
}
 
// ---- 3. Divine Intervention ------------------------------------------------------------------------
const di = find(/^divine intervention/i);
if (!di) report.push('<li><b>Divine Intervention</b> not found.</li>');
else if (premadeOn(di) === 'cpr2') report.push('<li>Divine Intervention uses Chris\'s Premades 2 (ours not installed).</li>');
else {
    if (!(Number(di.system.uses?.max) > 0)) await di.update({'system.uses': {max: '1', spent: 0, recovery: [{period: 'lr', type: 'recoverAll'}]}});
    const act = await ensureActivity(di, 'Divine Intervention', 'utility', {
        img: di.img, activation: {type: 'action', value: 1, override: true},
        consumption: {targets: [{type: 'itemUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true}});
    await setCat(act, ['Divine Intervention'], [entry('Divine Intervention', 'roll', 'activityRollFinished', 50, divine)]);
    await setCat(di, ['Divine Intervention cleanup'], [entry('Divine Intervention cleanup', 'rest', 'actorLong', 50, divineClean)]);
    await dropOld(di, ['Divine Intervention', 'Divine Intervention cleanup']);
    report.push('<li>Divine Intervention: choose a level, then a Cleric spell (buttons, with Back); cast under its normal name with no slot; the temporary copy is removed afterwards (concentration spells: on her next Long Rest).</li>');
}
 
// ---- 4. Warding Flare / Improved Warding Flare --------------------------------------------------------
const flare = find(/^warding flare/i);
const improved = find(/^improved warding flare/i);
for (const it of [flare, improved].filter(Boolean)) {
    for (const a of it.system.activities.contents) await a.update({'midiProperties.confirmTargets': 'never'});
    await setCat(it, ['Improved Warding Flare temp HP'], []);
    await dropOld(it, ['Improved Warding Flare temp HP']);
}
if (flare) report.push('<li>Warding Flare' + (improved ? ' + Improved' : '') + ': ' + (premadeOn(flare) === 'cpr2' && (!improved || premadeOn(improved) === 'cpr2')
    ? 'Chris\'s Premades 2 handles both (the temp HP too); ours retired. Target confirmation off.'
    : '<b>apply Chris\'s Premades 2\'s Warding Flare and Improved Warding Flare in the Medkit</b> (ours is retired on v14).') + '</li>');
 
// ---- 5. Hold Person (Chris's Premades 2 does the repeat save) + leftovers ---------------------------
{
    const hold = actor.items.find(i => i.type === 'spell' && lc(i.name) === 'hold person');
    if (hold) {
        await dropOld(hold, ['Hold spell live DC']);
        const paralyzes = hold.effects.some(e => e.statuses?.has?.('paralyzed'));
        report.push('<li>Hold Person: ' + (premadeOn(hold) === 'cpr2' && paralyzes ? 'Chris\'s Premades 2 handles it.' : '<b>apply Chris\'s Premades 2\'s Hold Person in the Medkit</b>; as it is, its effect doesn\'t paralyze on v14.') + '</li>');
    }
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1' && !/potent spellcasting|dawn|hold person/i.test(i.name));
    if (cpr1.length) report.push('<li><i>Still tagged for Chris\'s Premades 1 (does nothing on v14; re-apply in the Medkit if Chris\'s Premades 2 has it): ' + cpr1.map(i => i.name).join(', ') + '.</i></li>');
    const oldFx = actor.effects.filter(e => e.flags?.['chris-premades'] && !e.flags?.cat);
    if (oldFx.length) report.push('<li><i>Old Chris\'s Premades 1 effect(s) on her: ' + oldFx.map(e => e.name).join(', ') + '. Delete them.</i></li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Vina fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 