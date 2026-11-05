// =====================================================================
//  BANGIRAS FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by the Nix Module (or as a Script macro with Bangiras selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  Writes CAT embedded macros (flags.cat.embeddedMacros, stored shape
//  {name, event, pass, macros: [{macro, priority}]}) for:
//   - Magicians Judge: Stasis v3 (advantage vs prone saves, Topple included)
//   - Magicians Judge: Sand Shroud animation (on the effect the reaction applies)
//   - Metamagic: Quickened, Heightened, Twinned (2024)
//   - Sorcery Incarnate (second Metamagic while Innate Sorcery is active)
//   - Sorcerous Restoration (asks after a Short Rest)
//   - Mantle of Flame (starts/ends with Innate Sorcery) + Phoenix Spark
//   - Hold Monster / Hold Person: end-of-turn Wisdom save with the live DC
//  Also: converts his stored ATL.* light/sight keys to token.*, removes the
//  inert v13 copies of these macros (flags.chris-premades), and reports what
//  is left for later (Counterspell + Ring: Shift Spell wait for the world
//  Counterspell port).
//
//  Every macro body is wrapped in `return await (async () => {...})();` so it
//  never re-declares a name CAT puts in scope (actor, token, item, document...).
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Bangiras fixes (v14): select Bangiras\'s token first.');
const report = [];
const baseName = i => i.name.toLowerCase().replace(/^metamagic\s*[:\-–]\s*/, '').trim();
const findItem = (names, type) => actor.items.find(i => (!type || i.type === type) && names.includes(baseName(i)));
const run = fn => 'return await (' + fn.toString() + ')();';
const entry = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: run(fn)}]});
 
// Replace our CAT macros on an Item, ActiveEffect or Activity (dropped by name).
async function setCat(doc, names, add) {
    const list = foundry.utils.deepClone(doc.flags?.cat?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.update({'flags.cat.embeddedMacros': list.concat(add)});
}
// Remove the inert v13 copies (CPR1 flag) of the macros we just rewrote.
async function dropOld(doc, test) {
    const old = doc.flags?.['chris-premades']?.embeddedMacros;
    if (!old?.length) return 0;
    const keep = old.filter(m => !test(m));
    if (keep.length !== old.length) await doc.update({'flags.chris-premades.embeddedMacros': keep});
    return old.length - keep.length;
}
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
 
// =====================================================================
//  The macros. Each runs in CAT's scope: document (the item/effect carrying
//  it), actor, token (TokenDocument), workflow, ditem, config, options,
//  saveId/skillId, result, and the CAT utils.
// =====================================================================
 
// ---- Magicians Judge: Stasis v3 ----------------------------------------------------
// save / actorSituational: advantage on saves against anything that knocks him prone.
// Topple asks for its Con save with no source item (V14-MAPPING 5.6), so a second
// macro on the staff marks "a Topple weapon just hit me" and this one reads the mark.
const stasis = async () => {
    const staff = document;
    if (!staff.system.equipped || (staff.system.attunement && !staff.system.attuned)) return;
    const PRONE = /\bprone\b|\btopple/i;
    const src = workflowUtils.getSaveSource?.(config) ?? null;
    const texts = [];
    for (const doc of [src?.item, src?.activity].filter(Boolean)) {
        texts.push(doc.name ?? '', String(doc.system?.description?.value ?? doc.description?.value ?? ''));
        for (const e of doc.effects?.contents ?? []) {
            if (e.statuses?.has?.('prone')) texts.push('prone');
            for (const c of (e.system?.changes ?? e.changes ?? [])) texts.push(String(c.value));
        }
        for (const ref of doc.effects ?? []) {        // activity effect references
            const e = ref?.effect ?? (ref?._id ? src?.item?.effects?.get(ref._id) : null);
            if (e?.statuses?.has?.('prone')) texts.push('prone');
        }
    }
    if (texts.some(t => PRONE.test(t))) { options.advantage = true; return; }
    // Topple: no source, a Constitution save, and a Topple weapon hit him moments ago.
    const mark = staff.parent?.getFlag('world', 'nixToppleHitAt') ?? 0;
    if (!src?.item && saveId === 'con' && Date.now() - mark < 15000) options.advantage = true;
};
// roll / targetRollFinished: a weapon with the Topple mastery hit him.
const toppleMark = async () => {
    const staff = document;
    const me = staff.parent;
    if (!me || workflow.actor?.uuid === me.uuid) return;
    if (!Array.from(workflow.hitTargets ?? []).some(t => t.actor?.uuid === me.uuid)) return;
    if (workflow.item?.system?.mastery !== 'topple') return;
    await me.setFlag('world', 'nixToppleHitAt', Date.now());
};
 
// ---- Sand Shroud animation (on the effect the reaction applies) ---------------------
const sandStart = async () => {
    const effect = document;
    const tok = actorUtils.getFirstToken(effect.parent);
    const obj = tok?.object ?? tok;
    if (!obj || !globalThis.Sequencer) return;
    const pick = list => list.find(f => Sequencer.Database.entryExists(f));
    const below = pick(['jb2a.shield_themed.below.molten_earth.03.orange', 'jb2a.shield_themed.below.molten_earth.01.orange']);
    const above = pick(['jb2a.shield_themed.above.molten_earth.03.orange', 'jb2a.shield_themed.above.molten_earth.01.orange']);
    const ring = pick(['jb2a.token_border.circle.spinning.orange.004', 'jb2a.token_border.circle.spinning.orange.001']);
    const burst = pick(['jb2a.impact.ground_crack.orange.01', 'jb2a.impact.ground_crack.orange.02']);
    const NAME = 'Sand Shroud ' + effect.parent.id;
    const seq = new Sequence();
    if (burst) seq.effect().file(burst).atLocation(obj).belowTokens().scaleToObject(2.5);
    if (below) seq.effect().file(below).attachTo(obj).belowTokens().scaleToObject(1.8).opacity(0.9).fadeIn(400).fadeOut(400).persist().name(NAME);
    if (above) seq.effect().file(above).attachTo(obj).scaleToObject(1.8).opacity(0.6).fadeIn(800).fadeOut(400).persist().name(NAME);
    if (ring) seq.effect().file(ring).attachTo(obj).scaleToObject(2).opacity(0.7).fadeIn(400).fadeOut(400).persist().name(NAME);
    await seq.play();
};
const sandEnd = async () => {
    if (!globalThis.Sequencer) return;
    await Sequencer.EffectManager.endEffects({name: 'Sand Shroud ' + document.parent.id});
};
 
// ---- Shared bits for the Metamagic options (pasted into each macro) ---------------
// (Kept as plain text so every macro stays self-contained.)
const MM_SHARED = `
    const getEffect = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
    const refundAndClear = async (me, primedId, why) => {
        const primed = getEffect(me, primedId);
        if (primed) await documentUtils.deleteDocument(primed);
        const points = me.items.find(i => i.type === 'feat' && i.name.toLowerCase().trim() === 'sorcery points');
        const cost = Number(workflow.activity?.consumption?.targets?.[0]?.value ?? 0);
        if (points && cost && (points.system.uses?.spent ?? 0) >= cost) {
            await documentUtils.update(points, {'system.uses.spent': points.system.uses.spent - cost});
        }
        ui.notifications.info(workflow.item.name + ': ' + why + ' Sorcery Points refunded.');
    };
    const castableSpells = (me) => {
        const slots = Object.entries(me.system.spells ?? {})
            .filter(([key, slot]) => (slot?.value ?? 0) > 0)
            .map(([key, slot]) => key === 'pact' ? Number(slot.level ?? 0) : Number(key.replace('spell', '')))
            .filter(n => n > 0);
        const maxSlot = Math.max(0, ...slots);
        const seen = new Set();
        return me.items.filter(s => {
            if (s.type !== 'spell') return false;
            const lvl = s.system.level ?? 0;
            const method = s.system.method ?? s.system.preparation?.mode;
            const ok = lvl === 0 || ['atwill', 'innate'].includes(method)
                || (s.system.uses?.max && (s.system.uses.value ?? 0) > 0 && method !== 'spell')
                || maxSlot >= lvl;
            if (!ok) return false;
            const key = s.name + '|' + lvl;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
`;
// Builds a Metamagic item macro: shared helpers + the option's own body.
const mmMacro = (header, body) => header + '\nreturn await (async () => {' + MM_SHARED + body + '\n})();\n';
 
const HEIGHTENED = mmMacro(`// HEIGHTENED SPELL (2024), v14 / CAT. Item macro: roll / itemRollFinished / 50.
// Target the creature(s), click Heightened Spell (2 SP), pick a save spell; it's cast now.
// Before anyone saves, pick one of its targets: disadvantage on its saves against that
// spell until the spell stops affecting it. Cancelling refunds the points.
// marker: heightenedSpellPrimed`, `
    const PRIMED = 'heightenedSpellPrimed';
    const me = workflow.actor;
    const title = workflow.item.name;
    const old = getEffect(me, PRIMED);
    if (old) await documentUtils.deleteDocument(old);
 
    // Carried by the primed effect. roll / actorPreambleComplete / 40.
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        const forcesSave = workflow.saveActivity || workflow.activity?.type === 'save' || workflow.activity?.save;
        if (!forcesSave) return;                       // not a save spell: stay primed
        const primed = document;
        const targets = Array.from(workflow.targets ?? []).filter(t => t.actor);
        if (!targets.length) return;
        await documentUtils.deleteDocument(primed);
        let pick = targets[0].document;
        if (targets.length > 1) {
            const chosen = await dialogUtils.selectTargetDialog(primed.name,
                'Which target has disadvantage on its saves against ' + workflow.item.name + '?',
                targets.map(t => t.document), {skipDeadAndUnconscious: false, displayDistance: false});
            pick = chosen?.[0]?.document ?? chosen?.[0];
        }
        if (!pick?.actor) return;
 
        // On the target's effect. document = that effect, actor = the target.
        const situational = async () => {
            const h = document.flags.world?.heightenedTarget;
            if (!h) return;
            const src = workflowUtils.getSaveSource?.(config);
            const fromItem = src?.item?.uuid;
            if (fromItem ? fromItem === h.spellUuid : h.firstSaveOpen) options.disadvantage = true;
        };
        const post = async () => {
            const effect = document;
            const h = effect.flags.world?.heightenedTarget;
            if (!h) return;
            if (h.firstSaveOpen) await documentUtils.update(effect, {'flags.world.heightenedTarget.firstSaveOpen': false});
            await genericUtils.sleep(1500);                       // let Midi apply or remove the spell's effects
            const holder = effect.parent;
            if (!holder?.effects.get(effect.id)) return;
            const lingering = holder.effects.some(e => e.id !== effect.id
                && (e.origin === h.spellUuid || String(e.origin ?? '').startsWith(h.spellUuid + '.')));
            if (!lingering) await documentUtils.deleteDocument(effect);
        };
        const turnEnd = async () => {
            const effect = document;
            const h = effect.flags.world?.heightenedTarget;
            if (!h || h.firstSaveOpen) return;
            const holder = effect.parent;
            const lingering = holder.effects.some(e => e.id !== effect.id
                && (e.origin === h.spellUuid || String(e.origin ?? '').startsWith(h.spellUuid + '.')));
            if (!lingering) await documentUtils.deleteDocument(effect);
        };
        const m = (name, event, pass, fn) => ({name, event, pass, macros: [{priority: 50, macro: 'return await (' + fn.toString() + ')();'}]});
        await effectUtils.createEffects(pick.actor, [{
            name: 'Heightened: ' + workflow.item.name,
            img: primed.img,
            origin: workflow.item.uuid,
            duration: {value: 60, units: 'seconds'},
            description: 'Disadvantage on saving throws against ' + workflow.item.name + '.',
            flags: {
                world: {heightenedTarget: {spellUuid: workflow.item.uuid, firstSaveOpen: true}},
                cat: {identifier: 'heightenedSpellTarget', embeddedMacros: [
                    m('Heightened save', 'save', 'actorSituational', situational),
                    m('Heightened save end', 'save', 'actorPost', post),
                    m('Heightened turn check', 'combat', 'actorTurnEnd', turnEnd)
                ]}
            }
        }]);
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
            content: '<b>Heightened Spell:</b> ' + pick.name + ' has disadvantage on saves against ' + workflow.item.name + '.'});
    };
 
    await effectUtils.createEffects(me, [{
        name: 'Heightened Spell (primed)',
        img: workflow.item.img,
        origin: workflow.item.uuid,
        duration: {value: 1, units: 'rounds'},
        description: 'The next spell he casts that forces a saving throw is Heightened.',
        flags: {cat: {identifier: PRIMED, embeddedMacros: [
            {name: 'Heightened cast', event: 'roll', pass: 'actorPreambleComplete',
                macros: [{priority: 40, macro: 'return await (' + onCast.toString() + ')();'}]}
        ]}}
    }]);
 
    // Sorcery Incarnate primes this as the SECOND option: don't cast.
    if (me.getFlag('world', 'nixMetamagicPrimeOnly')) { await me.unsetFlag('world', 'nixMetamagicPrimeOnly'); return; }
 
    const spells = castableSpells(me)
        .filter(s => s.system.activities?.some(a => a.type === 'save'))
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
    if (!spells.length) return refundAndClear(me, PRIMED, 'no castable spells force a saving throw.');
    const spell = await dialogUtils.selectDocumentDialog(title, 'Heighten which spell? (Only spells that force a saving throw are listed.)', spells,
        {showSpellLevel: true, addNoneDocument: true});
    if (!spell) return refundAndClear(me, PRIMED, 'no spell chosen.');
    const use = spell.system.activities.find(a => a.type === 'save') ?? spell.system.activities.contents[0];
    setTimeout(() => use?.use(), 250);`);
 
const TWINNED = mmMacro(`// TWINNED SPELL (2024), v14 / CAT. Item macro: roll / itemRollFinished / 50.
// Target BOTH creatures, click Twinned Spell (1 SP), pick a spell that targets one more
// creature when upcast; it's cast on both. One target only: you're asked for the second.
// marker: twinnedSpellPrimed`, `
    const PRIMED = 'twinnedSpellPrimed';
    const me = workflow.actor;
    const title = workflow.item.name;
    const old = getEffect(me, PRIMED);
    if (old) await documentUtils.deleteDocument(old);
 
    // Carried by the primed effect. roll / actorPreambleComplete / 30.
    // workflow.token / workflow.targets are Token placeables; CAT helpers want documents.
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        const primed = document;
        const caster = workflow.token;
        const casterActor = workflow.actor;
        const refund = async (why) => {
            await documentUtils.deleteDocument(primed);
            const points = casterActor.items.find(i => i.type === 'feat' && i.name.toLowerCase().trim() === 'sorcery points');
            if (points && (points.system.uses?.spent ?? 0) > 0) {
                await documentUtils.update(points, {'system.uses.spent': Math.max(0, points.system.uses.spent - 1)});
            }
            ui.notifications.info('Twinned Spell: ' + why + ' Sorcery Point refunded.');
        };
        const activity = workflow.activity;
        if (!caster) return refund('no token for the caster.');
        await documentUtils.deleteDocument(primed);
 
        let targets = Array.from(workflow.targets ?? []).filter(t => t.actor);
        if (targets.length < 2) {
            const range = activity?.range ?? {};
            const maxDistance = range.units === 'touch' ? 5 : (Number(range.value) > 0 ? Number(range.value) : Infinity);
            const already = new Set(targets.map(t => t.document.uuid));
            const dist = t => tokenUtils.getDistance(caster.document, t.document);
            const candidates = canvas.tokens.placeables
                .filter(t => t.actor && !already.has(t.document.uuid) && !t.document.hidden && t.id !== caster.id)
                .filter(t => dist(t) <= maxDistance)
                .sort((a, b) => dist(a) - dist(b));
            if (!candidates.length) return refund('no second creature within range of ' + workflow.item.name + '.');
            const chosen = await dialogUtils.selectTargetDialog('Twinned Spell',
                'Only one creature was targeted. Choose the second target for ' + workflow.item.name + '.',
                candidates.map(t => t.document), {skipDeadAndUnconscious: false, coverToken: caster.document, displayDistance: true});
            const pickDoc = chosen?.[0]?.document ?? chosen?.[0];
            const twin = pickDoc?.object;
            if (!twin) return refund('no second target chosen.');
            workflow.targets.add(twin);
            if (workflow.hitTargets && !activity?.attack) workflow.hitTargets.add(twin);
            twin.setTarget(true, {releaseOthers: false, groupSelection: true});
            targets.push(twin);
        }
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: casterActor}),
            content: '<b>Twinned Spell:</b> ' + workflow.item.name + ' is cast one level higher and targets <b>'
                + targets.map(t => t.document.name).join('</b> and <b>') + '</b>.'});
    };
 
    await effectUtils.createEffects(me, [{
        name: 'Twinned Spell (primed)',
        img: workflow.item.img,
        origin: workflow.item.uuid,
        duration: {value: 1, units: 'rounds'},
        description: 'The next spell he casts can target one additional creature.',
        flags: {cat: {identifier: PRIMED, embeddedMacros: [
            {name: 'Twinned cast', event: 'roll', pass: 'actorPreambleComplete',
                macros: [{priority: 30, macro: 'return await (' + onCast.toString() + ')();'}]}
        ]}}
    }]);
 
    if (me.getFlag('world', 'nixMetamagicPrimeOnly')) { await me.unsetFlag('world', 'nixMetamagicPrimeOnly'); return; }
 
    const TWINNABLE = /(additional|extra|one more) (creature|target|humanoid|beast|willing creature)/i;
    const twinnable = s => TWINNABLE.test(String(s.system.description?.value ?? '').replace(/<[^>]+>/g, ' '));
    const spells = castableSpells(me)
        .filter(s => s.system.level > 0 && twinnable(s))
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
    if (!spells.length) return refundAndClear(me, PRIMED, 'no castable spells can be twinned.');
    const spell = await dialogUtils.selectDocumentDialog(title, 'Twin which spell? (Only spells that target an additional creature when upcast. Target both creatures before picking.)', spells,
        {showSpellLevel: true, addNoneDocument: true});
    if (!spell) return refundAndClear(me, PRIMED, 'no spell chosen.');
    const use = spell.system.activities.contents[0];
    setTimeout(() => use?.use(), 250);`);
 
const QUICKENED = mmMacro(`// QUICKENED SPELL (2024), v14 / CAT. Item macro: roll / itemRollFinished / 50.
// Click Quickened Spell (2 SP), pick a 1-action spell; it's cast now. When it finishes,
// the Bonus Action is marked used and the Action given back. Cancelling refunds.
// marker: quickenedSpellPrimed`, `
    const PRIMED = 'quickenedSpellPrimed';
    const me = workflow.actor;
    const title = workflow.item.name;
    const old = getEffect(me, PRIMED);
    if (old) await documentUtils.deleteDocument(old);
 
    // Carried by the primed effect. roll / actorRollFinished / 60.
    const onDone = async () => {
        if (workflow.item?.type !== 'spell') return;
        if (workflow.activity?.activation?.type !== 'action') return;   // not a 1-action spell: stay primed
        const primed = document;
        const q = primed.flags.world?.quickened ?? {};
        const a = workflow.actor;
        await documentUtils.deleteDocument(primed);
        try {
            if (globalThis.MidiQOL?.hasUsedBonusAction && !MidiQOL.hasUsedBonusAction(a)) await MidiQOL.setBonusActionUsed(a);
        } catch (e) { console.warn('Quickened Spell: could not mark the bonus action', e); }
        const giveBack = async () => {
            if (q.actionUsedBefore) return;
            if (a.getFlag('midi-qol', 'actions')?.action) await MidiQOL.removeActionUsed(a);
        };
        await giveBack();
        setTimeout(giveBack, 800);
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: a}),
            content: '<b>Quickened Spell:</b> ' + workflow.item.name + ' was cast as a Bonus Action.'});
    };
 
    await effectUtils.createEffects(me, [{
        name: 'Quickened Spell (primed)',
        img: workflow.item.img,
        origin: workflow.item.uuid,
        duration: {value: 1, units: 'rounds'},
        description: 'The next 1-action spell he casts takes a Bonus Action instead.',
        flags: {
            world: {quickened: {actionUsedBefore: !!me.getFlag('midi-qol', 'actions')?.action}},
            cat: {identifier: PRIMED, embeddedMacros: [
                {name: 'Quickened done', event: 'roll', pass: 'actorRollFinished',
                    macros: [{priority: 60, macro: 'return await (' + onDone.toString() + ')();'}]}
            ]}
        }
    }]);
 
    if (me.getFlag('world', 'nixMetamagicPrimeOnly')) { await me.unsetFlag('world', 'nixMetamagicPrimeOnly'); return; }
 
    const actionActivity = s => (s.system.activities?.contents ?? []).find(a => a.activation?.type === 'action');
    const spells = castableSpells(me).filter(s => actionActivity(s))
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
    if (!spells.length) return refundAndClear(me, PRIMED, 'no castable 1-action spells.');
    const spell = await dialogUtils.selectDocumentDialog(title,
        'Quicken which spell? (Spells that take 1 action. It will take your Bonus Action instead.)', spells,
        {showSpellLevel: true, addNoneDocument: true});
    if (!spell) return refundAndClear(me, PRIMED, 'no spell chosen.');
    const use = actionActivity(spell);
    setTimeout(() => use?.use(), 250);`);
 
// ---- Sorcery Incarnate: roll / actorRollFinished / 20 -------------------------------
const incarnate = async () => {
    const OPTIONS = {'heightened spell': 'heightenedSpellPrimed', 'twinned spell': 'twinnedSpellPrimed', 'quickened spell': 'quickenedSpellPrimed'};
    const WAIT_MS = 20000;
    const getEffect = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
    const me = workflow.actor;
    const base = i => i.name.toLowerCase().replace(/^metamagic\s*[:\-–]\s*/, '').trim();
    const first = workflow.item;
    if (first?.type !== 'feat' || !OPTIONS[base(first)]) return;
    if (me.getFlag('world', 'nixMetamagicPrimeOnly')) return;      // this IS the second option
    if (!me.appliedEffects.find(e => /innate sorcery/i.test(e.name))) return;
 
    const points = me.items.find(i => i.type === 'feat' && i.name.toLowerCase().trim() === 'sorcery points');
    const left = points?.system.uses?.value ?? 0;
    const costOf = i => Number(i.system.activities?.contents?.[0]?.consumption?.targets?.find(t => t.type === 'itemUses')?.value ?? 0);
    const choices = me.items.filter(i => i.type === 'feat' && OPTIONS[base(i)]
        && base(i) !== base(first) && costOf(i) <= left && !getEffect(me, OPTIONS[base(i)]));
    if (!choices.length) return;
 
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const second = await dialogUtils.selectDocumentDialog(document.name,
        'Innate Sorcery is active. Add a second Metamagic option to this spell? (' + left + ' Sorcery Points left)',
        choices, {addNoneDocument: true, userId});
    if (!second) return;
    const act = second.system.activities?.contents?.[0];
    if (!act) return ui.notifications.warn('Sorcery Incarnate: ' + second.name + ' has no activity.');
    await me.setFlag('world', 'nixMetamagicPrimeOnly', true);
    try {
        await act.use({}, {configure: false});
        const id = OPTIONS[base(second)];
        const start = Date.now();
        while (!getEffect(me, id) && Date.now() - start < WAIT_MS) await genericUtils.sleep(250);
    } finally {
        if (me.getFlag('world', 'nixMetamagicPrimeOnly')) await me.unsetFlag('world', 'nixMetamagicPrimeOnly');
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>Sorcery Incarnate:</b> ' + me.name + ' weaves ' + first.name + ' and ' + second.name + ' into one spell.'});
};
 
// ---- Sorcerous Restoration: rest / actorShort / 50 ----------------------------------
// actorShort fires on any rest; a long rest refills the points anyway.
const restoration = async () => {
    if (result?.type === 'long' || result?.longRest) return;
    const feature = document;
    const me = feature.parent;
    if (feature.system.uses?.max && !(feature.system.uses.value > 0)) return;
    const points = me.items.find(i => i.type === 'feat' && i.name.toLowerCase().trim() === 'sorcery points');
    if (points && (points.system.uses?.spent ?? 0) <= 0) return;   // already full
    const act = feature.system.activities?.contents?.[0];
    if (!act) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const regain = Math.floor((me.classes?.sorcerer?.system.levels ?? 0) / 2);
    const yes = await dialogUtils.confirm(feature.name,
        'Short rest finished. Use ' + feature.name + ' to regain up to ' + (regain || 'some') + ' Sorcery Points? ('
        + (points?.system.uses?.value ?? '?') + '/' + (points?.system.uses?.max ?? '?') + ' now)', {userId});
    if (!yes) return;
    await act.use({}, {configure: false});
};
 
// ---- Mantle of Flame: roll / itemRollFinished / 60 (on Mantle of Flame / Innate Sorcery) --
const mantle = async () => {
    const MANTLE = 'mantleOfFlame';
    const getEffect = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
    const me = workflow.actor;
    const feature = workflow.item;
    let innate;
    for (let i = 0; i < 10 && !innate; i++) {
        innate = me.effects.find(e => /innate sorcery/i.test(e.name) && !e.disabled && !e.flags?.cat?.identifier);
        if (!innate) await genericUtils.sleep(200);
    }
    if (!innate) return ui.notifications.warn('Mantle of Flame: no active Innate Sorcery effect found, so the Mantle did not start.');
 
    // Carried by the Mantle effect. document = the Mantle effect.
    // roll / targetOnHit / 250: a melee attacker within 5 ft takes fire = Cha mod.
    const onHit = async () => {
        const me = document.parent;
        const mine = actorUtils.getFirstToken(me);
        if (!mine || !workflow.token || workflow.actor?.uuid === me.uuid) return;
        if (!Array.from(workflow.hitTargets ?? []).some(t => t.actor?.uuid === me.uuid)) return;
        if (!workflowUtils.isAttackType(workflow, 'meleeAttack')) return;
        if (tokenUtils.getDistance(workflow.token.document, mine.document ?? mine) > 5) return;
        const cha = me.system.abilities.cha.mod;
        if (cha <= 0) return;
        const r = await new CONFIG.Dice.DamageRoll(String(cha), {}, {type: 'fire'}).evaluate();
        await workflowUtils.applyWorkflowDamage(mine.object ?? mine, r, 'fire', [workflow.token],
            {flavor: 'Mantle of Flame', sourceItem: {name: 'Mantle of Flame', img: document.img, type: 'feat'}});
    };
    // roll / actorDamageRollBonuses / 60: +Cha to his fire damage rolls on his turn.
    const onDamage = async () => {
        const me = document.parent;
        if (workflow.actor?.uuid !== me.uuid) return;
        const c = game.combat;
        if (c?.started && c.combatant?.actor?.uuid !== me.uuid) return;     // not his turn
        if (!workflowUtils.getDamageTypes(workflow.damageRolls ?? []).has('fire')) return;
        const cha = me.system.abilities.cha.mod;
        if (cha <= 0) return;
        await workflowUtils.bonusDamage(workflow, String(cha), {ignoreCrit: true, damageType: 'fire'});
    };
    const animStart = async () => {
        const tok = actorUtils.getFirstToken(document.parent);
        const obj = tok?.object ?? tok;
        if (!obj || !globalThis.Sequencer) return;
        const pick = list => list.find(f => Sequencer.Database.entryExists(f));
        const below = pick(['jb2a.shield_themed.below.fire.03.orange', 'jb2a.shield_themed.below.fire.01.orange']);
        const above = pick(['jb2a.shield_themed.above.fire.03.orange', 'jb2a.shield_themed.above.fire.01.orange']);
        const NAME = 'Mantle of Flame ' + document.parent.id;
        const seq = new Sequence();
        if (below) seq.effect().file(below).attachTo(obj).belowTokens().scaleToObject(1.8).fadeIn(500).fadeOut(400).persist().name(NAME);
        if (above) seq.effect().file(above).attachTo(obj).scaleToObject(1.8).opacity(0.5).fadeIn(900).fadeOut(400).persist().name(NAME);
        await seq.play();
    };
    const animEnd = async () => {
        if (!globalThis.Sequencer) return;
        await Sequencer.EffectManager.endEffects({name: 'Mantle of Flame ' + document.parent.id});
    };
    // Carried by the Innate Sorcery effect: effect / deleted ends the Mantle too.
    const endWithInnate = async () => {
        const holder = document.parent;
        const m = (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(holder, 'mantleOfFlame');
        if (m) await documentUtils.deleteDocument(m);
    };
    const m = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: 'return await (' + fn.toString() + ')();'}]});
 
    const old = getEffect(me, MANTLE);
    if (old) await documentUtils.deleteDocument(old);
    const d = innate.duration ?? {};
    const duration = d.units ? {value: d.value, units: d.units} : {value: 60, units: 'seconds'};
    await effectUtils.createEffects(me, [{
        name: 'Mantle of Flame',
        img: 'icons/magic/fire/flame-burning-creature-skeleton.webp',
        origin: feature.uuid,
        type: 'base',
        duration,
        description: 'Bright light 30 ft, dim 30 ft more. Melee attackers within 5 ft take fire damage equal to his Charisma modifier. On his turn his fire damage rolls gain +Charisma modifier.',
        system: {changes: [
            {key: 'token.light.bright', type: 'upgrade', value: '30', priority: 20, phase: 'initial'},
            {key: 'token.light.dim', type: 'upgrade', value: '60', priority: 20, phase: 'initial'}
        ]},
        flags: {cat: {identifier: MANTLE, embeddedMacros: [
            m('Mantle of Flame hit back', 'roll', 'targetOnHit', 250, onHit),
            m('Mantle of Flame fire bonus', 'roll', 'actorDamageRollBonuses', 60, onDamage),
            m('Mantle of Flame anim start', 'effect', 'created', 50, animStart),
            m('Mantle of Flame anim end', 'effect', 'deleted', 50, animEnd)
        ]}}
    }]);
    const list = foundry.utils.deepClone(innate.flags?.cat?.embeddedMacros ?? []).filter(x => x.name !== 'End Mantle of Flame');
    list.push(m('End Mantle of Flame', 'effect', 'deleted', 50, endWithInnate));
    await innate.update({'flags.cat.embeddedMacros': list});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>Mantle of Flame:</b> phoenix fire wreathes ' + me.name + ', eyes glowing like hot coals.'});
};
 
// ---- Phoenix Spark ----------------------------------------------------------------------
// Clicked by hand: roll / itemRollFinished / 50.
const sparkUse = async () => {
    const me = workflow.actor;
    const feature = workflow.item;
    const mantleFx = (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(me, 'mantleOfFlame');
    const level = me.classes?.sorcerer?.system.levels ?? 0;
    const cha = me.system.abilities.cha.mod;
    const dmg = mantleFx ? level + 2 * cha : Math.floor(level / 2) + cha;
    await me.setFlag('world', 'nixPhoenixSparkAt', Date.now());
    const mine = workflow.token ?? actorUtils.getFirstToken(me)?.object;
    if (mine && globalThis.Sequencer) {
        const f = ['jb2a.fireball.explosion.orange', 'jb2a.explosion.01.orange', 'jb2a.explosion.orange.0'].find(x => Sequencer.Database.entryExists(x));
        if (f) new Sequence().effect().file(f).atLocation(mine).size(5, {gridUnits: true}).play();
    }
    if (mine && dmg > 0) {
        const victims = canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id
            && !t.document.hidden && tokenUtils.getDistance(mine.document, t.document) <= 10);
        if (victims.length) {
            const r = await new CONFIG.Dice.DamageRoll(String(dmg), {}, {type: 'fire'}).evaluate();
            await workflowUtils.applyWorkflowDamage(mine, r, 'fire', victims, {flavor: feature.name, sourceItem: feature});
        }
    }
    if (mantleFx) await documentUtils.deleteDocument(mantleFx);
    const fixHp = async () => { if ((me.system.attributes.hp.value ?? 1) <= 0) await me.update({'system.attributes.hp.value': 1}); };
    await fixHp();
    setTimeout(fixHp, 1500);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + feature.name + ':</b> ' + me.name + ' refuses to fall! The phoenix fire roars outward ('
            + dmg + ' fire damage within 10 ft)' + (mantleFx ? ' and the Mantle of Flame burns out.' : '.')});
};
// Automatic: roll / targetDamageComplete / 245. ditem in scope; keep him at 1 HP.
const sparkGuard = async () => {
    const feature = document;
    const me = feature.parent;
    if (!ditem || ditem.newHP > 0 || ditem.oldHP <= 0) return;
    if (ditem.actorUuid && ditem.actorUuid !== me.uuid) return;
    const at = me.getFlag('world', 'nixPhoenixSparkAt') ?? 0;
    if (Date.now() - at < 15000) { workflowUtils.preventZeroHP(ditem); return; }
    if (feature.system.uses?.max && !(feature.system.uses.value > 0)) return;
    const inCombat = !!game.combat?.started;
    if (inCombat && actorUtils.hasUsedReaction(me)) return;
    const getFx = (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier);
    const mantleFx = getFx(me, 'mantleOfFlame');
    const level = me.classes?.sorcerer?.system.levels ?? 0;
    const cha = me.system.abilities.cha.mod;
    const dmg = mantleFx ? level + 2 * cha : Math.floor(level / 2) + cha;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm(feature.name,
        'You are about to drop to 0 HP. Use your reaction for ' + feature.name + '? You drop to 1 HP instead and everything within 10 ft takes '
        + dmg + ' fire damage' + (mantleFx ? ' (Mantle of Flame boosts it, then ends)' : '') + '.', {userId});
    if (!yes) return;
    workflowUtils.preventZeroHP(ditem);
    await me.setFlag('world', 'nixPhoenixSparkAt', Date.now());
    if (feature.system.uses?.max) await documentUtils.update(feature, {'system.uses.spent': (feature.system.uses.spent ?? 0) + 1});
    if (inCombat) await actorUtils.setReactionUsed(me);
    const tok = actorUtils.getFirstToken(me);
    const mine = tok?.object ?? tok;
    const blast = async () => {
        if (mine && globalThis.Sequencer) {
            const f = ['jb2a.fireball.explosion.orange', 'jb2a.explosion.01.orange', 'jb2a.explosion.orange.0'].find(x => Sequencer.Database.entryExists(x));
            if (f) new Sequence().effect().file(f).atLocation(mine).size(5, {gridUnits: true}).play();
        }
        if (mine && dmg > 0) {
            const victims = canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id
                && !t.document.hidden && tokenUtils.getDistance(mine.document, t.document) <= 10);
            if (victims.length) {
                const r = await new CONFIG.Dice.DamageRoll(String(dmg), {}, {type: 'fire'}).evaluate();
                await workflowUtils.applyWorkflowDamage(mine, r, 'fire', victims, {flavor: feature.name, sourceItem: feature});
            }
        }
        const still = getFx(me, 'mantleOfFlame');
        if (mantleFx && still) await documentUtils.deleteDocument(still);
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
            content: '<b>' + feature.name + ':</b> ' + me.name + ' refuses to fall! The phoenix fire roars outward ('
                + dmg + ' fire damage within 10 ft)' + (mantleFx ? ' and the Mantle of Flame burns out.' : '.')});
    };
    setTimeout(blast, 300);   // let the damage that triggered it land first
};
 
// ---- Hold Monster / Hold Person: roll / itemRollFinished / 60 ----------------------------
const holdDc = async () => {
    const dc = Number(workflow.saveDC) || Number(workflow.activity?.save?.dc?.value)
        || Number(workflow.actor.system.attributes?.spell?.dc);
    if (!dc) return;
    const spellUuid = workflow.item.uuid;
    await genericUtils.sleep(500);                       // let Midi finish applying the effects
    for (const t of workflow.targets ?? []) {
        const target = t.actor;
        if (!target) continue;
        for (const effect of target.effects.filter(e => e.origin === spellUuid || e.origin?.startsWith(spellUuid + '.'))) {
            const path = effect.system?.changes ? 'system.changes' : 'changes';
            const changes = foundry.utils.deepClone(foundry.utils.getProperty(effect, path) ?? []);
            let touched = false;
            for (const c of changes) {
                if (c.key !== 'flags.midi-qol.OverTime') continue;
                c.value = String(c.value).replace(/saveDC\s*=\s*[^,]*/, 'saveDC=' + dc);
                touched = true;
            }
            if (touched) await documentUtils.update(effect, {[path]: changes});
        }
    }
};
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Magicians Judge ----------------------------------------------------------
const staff = actor.items.find(i => i.name.toLowerCase().trim() === 'magicians judge');
if (!staff) report.push('<li><b>Magicians Judge</b> not found: skipped Stasis and Sand Shroud.</li>');
else {
    await setCat(staff, ['Magicians Judge: Stasis', 'Magicians Judge: Topple mark'], [
        entry('Magicians Judge: Stasis', 'save', 'actorSituational', 50, stasis),
        entry('Magicians Judge: Topple mark', 'roll', 'targetRollFinished', 50, toppleMark)]);
    await dropOld(staff, m => m.name === 'Magicians Judge: Stasis');
    report.push('<li>Stasis v3 installed (advantage vs prone saves; Topple via a "hit by a Topple weapon" mark).</li>');
    const act = (staff.system.activities?.contents ?? []).find(a => /^sand shroud$/i.test(a.name ?? ''));
    const refId = act?.effects?.[0]?._id ?? act?.effects?.contents?.[0]?._id;
    const shroud = (refId && staff.effects.get(refId)) ?? staff.effects.find(e => e.name === 'Sand Shroud' && e.getFlag('world', 'nixMagiciansJudge'));
    if (!shroud) report.push('<li><b>Sand Shroud</b> effect not found: run the Magicians Judge setup first.</li>');
    else {
        await setCat(shroud, ['Sand Shroud anim start', 'Sand Shroud anim end'], [
            entry('Sand Shroud anim start', 'effect', 'created', 50, sandStart),
            entry('Sand Shroud anim end', 'effect', 'deleted', 50, sandEnd)]);
        for (const e of staff.effects) await dropOld(e, m => /^Sand Shroud anim/.test(m.name));
        report.push('<li>Sand Shroud animation installed on the effect the reaction applies.</li>');
    }
}
 
// ---- 2. Metamagic ------------------------------------------------------------------
const points = actor.items.find(i => i.type === 'feat' && i.name.toLowerCase().trim() === 'sorcery points');
for (const [label, names, marker, code] of [
    ['Heightened Spell', ['heightened spell'], 'heightenedSpellPrimed', HEIGHTENED],
    ['Twinned Spell', ['twinned spell'], 'twinnedSpellPrimed', TWINNED],
    ['Quickened Spell', ['quickened spell'], 'quickenedSpellPrimed', QUICKENED]
]) {
    const it = findItem(names, 'feat');
    if (!it) { report.push('<li><b>' + label + '</b> not found.</li>'); continue; }
    const list = foundry.utils.deepClone(it.flags?.cat?.embeddedMacros ?? [])
        .filter(m => m.name !== label && !(m.macros ?? []).some(x => String(x.macro).includes(marker)));
    list.push({name: label, event: 'roll', pass: 'itemRollFinished', macros: [{priority: 50, macro: code}]});
    await it.update({'flags.cat.embeddedMacros': list});
    const dropped = await dropOld(it, m => String(m.macro).includes(marker));
    const act = it.system.activities?.contents?.[0];
    if (!act) report.push('<li><b>' + label + '</b> has no activity: add a Utility activity and run again.</li>');
    else if (points && !(act.consumption?.targets ?? []).some(t => t.type === 'itemUses')) {
        await act.update({'consumption.targets': [{type: 'itemUses', target: points.id, value: label === 'Twinned Spell' ? '1' : '2', scaling: {}}]});
    }
    report.push('<li>' + label + ' installed' + (dropped ? ' (old v13 copy removed)' : '') + '.'
        + (premadeOn(it) === 'cpr2' ? ' <b>It also has a Chris\'s Premades 2 automation: set it to None in the Medkit.</b>' : '') + '</li>');
}
 
// ---- 3. Sorcery Incarnate ------------------------------------------------------------
const incarnateItem = actor.items.find(i => i.name.toLowerCase().trim() === 'sorcery incarnate');
if (!incarnateItem) report.push('<li><b>Sorcery Incarnate</b> not found.</li>');
else {
    await setCat(incarnateItem, ['Sorcery Incarnate'], [entry('Sorcery Incarnate', 'roll', 'actorRollFinished', 20, incarnate)]);
    await dropOld(incarnateItem, m => m.name === 'Sorcery Incarnate' || String(m.macro).includes('nixMetamagicPrimeOnly'));
    report.push('<li>Sorcery Incarnate installed.</li>');
}
 
// ---- 4. Sorcerous Restoration --------------------------------------------------------
const restorationItem = actor.items.find(i => i.name.toLowerCase().trim() === 'sorcerous restoration');
if (!restorationItem) report.push('<li><b>Sorcerous Restoration</b> not found.</li>');
else {
    await setCat(restorationItem, ['Sorcerous Restoration prompt'], [entry('Sorcerous Restoration prompt', 'rest', 'actorShort', 50, restoration)]);
    await dropOld(restorationItem, m => m.name === 'Sorcerous Restoration prompt');
    report.push('<li>Sorcerous Restoration will ask after a Short Rest.</li>');
}
 
// ---- 5. Fire Shield check -------------------------------------------------------------
const fireShield = actor.items.find(i => i.type === 'spell' && i.name.toLowerCase().trim() === 'fire shield');
if (fireShield) report.push(premadeOn(fireShield) === 'cpr2'
    ? '<li>Fire Shield uses Chris\'s Premades 2 (nothing of ours needed).</li>'
    : '<li><b>Fire Shield</b> has no Chris\'s Premades 2 automation: apply it in the Medkit.</li>');
 
// ---- 6. Mantle of Flame + Phoenix Spark ---------------------------------------------
const mantleItem = actor.items.find(i => /mantle of flame/i.test(i.name)) ?? actor.items.find(i => /^innate sorcery$/i.test(i.name.trim()));
if (!mantleItem) report.push('<li><b>Mantle of Flame / Innate Sorcery</b> not found.</li>');
else {
    await setCat(mantleItem, ['Mantle of Flame start'], [entry('Mantle of Flame start', 'roll', 'itemRollFinished', 60, mantle)]);
    await dropOld(mantleItem, m => m.name === 'Mantle of Flame start');
    report.push('<li>Mantle of Flame starts and ends with Innate Sorcery (' + mantleItem.name + ').</li>');
    // Note for Nix: the stored Innate Sorcery effect also adds +Cha to ALL ranged spell attack damage.
    const innateFx = mantleItem.effects.find(e => /innate sorcery/i.test(e.name));
    const rsak = (innateFx?.system?.changes ?? innateFx?.changes ?? []).find(c => c.key === 'system.bonuses.rsak.damage');
    if (rsak) report.push('<li><b>Check:</b> the Innate Sorcery effect adds <code>' + rsak.value + '</code> to every ranged spell attack\'s damage. '
        + 'Mantle of Flame already adds +Cha to fire damage on his turn, so Fire Bolt gets it twice. Remove that change if it isn\'t meant to be there.</li>');
}
const spark = actor.items.find(i => i.name.toLowerCase().trim() === 'phoenix spark');
if (!spark) report.push('<li><b>Phoenix Spark</b> not found.</li>');
else {
    await setCat(spark, ['Phoenix Spark use', 'Phoenix Spark guard'], [
        entry('Phoenix Spark use', 'roll', 'itemRollFinished', 50, sparkUse),
        entry('Phoenix Spark guard', 'roll', 'targetDamageComplete', 245, sparkGuard)]);
    await dropOld(spark, m => /^Phoenix Spark (trigger|use|guard)$/.test(m.name));
    report.push('<li>Phoenix Spark: our prompt appears when he would drop to 0 HP (1 HP + fire burst).'
        + (premadeOn(spark) === 'cpr2' ? ' <b>It also has a Chris\'s Premades 2 automation: set it to None so only one prompt shows.</b>' : '') + '</li>');
}
 
// ---- 7. Hold Monster / Hold Person ----------------------------------------------------
for (const spell of actor.items.filter(i => i.type === 'spell' && ['hold monster', 'hold person'].includes(i.name.toLowerCase().trim()))) {
    const act = (spell.system.activities?.contents ?? []).find(a => a.type === 'save') ?? spell.system.activities?.contents?.[0];
    const dc = Number(act?.save?.dc?.value) || Number(actor.system.attributes?.spell?.dc) || 13;
    const effects = spell.effects.filter(e => e.statuses?.has?.('paralyzed') || /paralyz|hold/i.test(e.name));
    if (!effects.length) { report.push('<li><b>' + spell.name + '</b> has no Paralyzed effect to patch.</li>'); continue; }
    for (const effect of effects) {
        const path = effect.system?.changes ? 'system.changes' : 'changes';
        const changes = (foundry.utils.getProperty(effect, path) ?? []).filter(c => c.key !== 'flags.midi-qol.OverTime').map(c => ({...c}));
        changes.push({key: 'flags.midi-qol.OverTime', type: 'override', priority: 20, phase: 'initial',
            value: 'turn=end, saveAbility=wis, saveDC=' + dc + ', label=' + spell.name + ' (end of turn save)'});
        await effect.update({[path]: changes});
    }
    await setCat(spell, ['Hold spell live DC'], [entry('Hold spell live DC', 'roll', 'itemRollFinished', 60, holdDc)]);
    await dropOld(spell, m => m.name === 'Hold spell live DC');
    report.push('<li>' + spell.name + ': end-of-turn Wisdom save, using the DC of each cast.</li>');
}
 
// ---- 8. ATL.* keys -> token.* (DAE no longer applies ATL on v14) ---------------------------
{
    const fixed = [];
    const convert = async (effect, owner) => {
        const path = effect.system?.changes ? 'system.changes' : 'changes';
        const changes = foundry.utils.getProperty(effect, path) ?? [];
        if (!changes.some(c => String(c.key).startsWith('ATL.') && c.key !== 'ATL.texture.src')) return;
        const next = changes.map(c => {
            if (!String(c.key).startsWith('ATL.') || c.key === 'ATL.texture.src') return {...c};
            return {...c, key: 'token.' + c.key.slice(4), type: c.type === 'custom' ? 'override' : c.type};
        });
        await effect.update({[path]: next});
        fixed.push(owner + ' > ' + effect.name);
    };
    for (const it of actor.items) for (const e of it.effects) await convert(e, it.name);
    for (const e of actor.effects) await convert(e, 'actor');
    if (fixed.length) report.push('<li>Light/sight keys moved from ATL.* to token.*: ' + fixed.join(', ') + '.</li>');
}
 
// ---- 9. Leftover Heightened effects anywhere in the world -------------------------------
{
    const all = new Set(game.actors.contents);
    for (const sc of game.scenes) for (const t of sc.tokens) if (!t.actorLink && t.actor) all.add(t.actor);
    let removed = 0;
    for (const a of all) {
        for (const e of a.effects.filter(e => e.flags?.world?.heightenedTarget)) {
            const su = e.flags.world.heightenedTarget.spellUuid;
            const lingering = a.effects.some(x => x.id !== e.id && (x.origin === su || String(x.origin ?? '').startsWith(su + '.')));
            if (!lingering) { await e.delete(); removed++; }
        }
    }
    if (removed) report.push('<li>Removed ' + removed + ' leftover Heightened effect' + (removed === 1 ? '' : 's') + '.</li>');
}
 
// ---- 10. What's left for later ------------------------------------------------------------
{
    const later = [];
    const cs = actor.items.find(i => i.type === 'spell' && i.name.toLowerCase().trim() === 'counterspell');
    if (cs) later.push('Counterspell (Spell Duel) and Ring: Shift Spell wait for the world Counterspell port. Until then Counterspell does nothing automatic on v14.');
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1' && !['Counterspell', 'Phoenix Spark'].includes(i.name)
        && !/mantle of flame|metamagic|sorcery|magicians judge|ring of changing|shadowfell|hold (monster|person)/i.test(i.name));
    if (cpr1.length) later.push('Still tagged for Chris\'s Premades 1 (does nothing on v14, re-apply in the Medkit if CPR2 has it): ' + cpr1.map(i => i.name).join(', ') + '.');
    const dupes = Object.entries(actor.items.contents.reduce((m, i) => ((m[i.type + '|' + i.name] = (m[i.type + '|' + i.name] ?? 0) + 1), m), {}))
        .filter(([, n]) => n > 1).map(([k, n]) => k.split('|')[1] + ' x' + n);
    if (dupes.length) later.push('Duplicate items (check which to delete; Hex/Misty Step may be the Fey Touched free casts): ' + dupes.join(', ') + '.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Bangiras fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 