// =====================================================================
//  SORCERER CORE (2024): one-click INSTALLER (Script macro, run as GM)
//  Select the sorcerer's token, then run. Safe to re-run: replaces what it wrote.
//  Shared by every 2024 sorcerer (Petra first; Bangiras can move over later).
//  Run the Metamagic fix-up first so every option costs the 2024 price.
//
//  Metamagic (2024), every option the sorcerer has:
//    Careful, Distant, Extended, Heightened, Quickened, Transmuted, Twinned:
//      click the option, pick a castable spell it fits, the spell is cast at once.
//      Cancelling the list refunds the Sorcery Points.
//    Empowered: click it BEFORE the spell (alone, or before another option).
//      The next spell that rolls damage rerolls up to Cha mod of its lowest dice.
//      Doesn't count as the one Metamagic per spell (2024). Unused = refunded
//      when it expires (1 minute) or is deleted.
//  Sorcery Incarnate: while Innate Sorcery is active, clicking an option offers a
//    second option for the same spell.
//  Innate Sorcery: spends its use; advantage on melee spell attacks too; a
//    "2 Sorcery Points" activity for when the uses are gone (Sorcery Incarnate).
//  Sorcerous Restoration: asks after a Short Rest.
//  Chris's Premades' own (2014) Metamagic macros are switched off on the options.
// =====================================================================

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Sorcerer core: select the sorcerer\'s token first.');
if (!globalThis.chrisPremades?.utils) return ui.notifications.error('Sorcerer core: Chris\'s Premades is not active.');
const report = [];
// The helpers below also run here, in the installer, where Chris's Premades' macro names aren't defined.
const {genericUtils, effectUtils} = chrisPremades.utils;

// ---------------------------------------------------------------------------
//  Helpers carried into every macro this installer writes (H.wrap does that).
//  Free names (workflow, trigger, effectUtils...) resolve in Chris's Premades'
//  macro scope when the macro runs.
// ---------------------------------------------------------------------------
const H = (function nixSorcerer() {
    const MM = {
        careful: {id: 'nixCarefulPrimed', name: 'careful spell'},
        distant: {id: 'nixDistantPrimed', name: 'distant spell'},
        empowered: {id: 'nixEmpoweredPrimed', name: 'empowered spell'},
        extended: {id: 'nixExtendedPrimed', name: 'extended spell'},
        heightened: {id: 'heightenedSpellPrimed', name: 'heightened spell'},
        quickened: {id: 'quickenedSpellPrimed', name: 'quickened spell'},
        transmuted: {id: 'nixTransmutedPrimed', name: 'transmuted spell'},
        twinned: {id: 'twinnedSpellPrimed', name: 'twinned spell'}
    };
    const SIX = ['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder'];
    const baseName = i => String(i?.name ?? '').toLowerCase().replace(/^metamagic\s*[:\-–]\s*/, '').trim();
    const keyOf = i => Object.keys(MM).find(k => MM[k].name === baseName(i));
    const points = a => a?.items?.find(i => i.type === 'feat'
        && (/^sorcery points$/i.test(i.name.trim()) || i.system?.identifier === 'sorcery-points'));
    const acts = s => s?.system?.activities?.contents ?? [];
    const asArray = v => v instanceof Set ? [...v] : Array.isArray(v) ? v : (v ? [v] : []);
    // Spells the caster can cast right now: prepared, with a slot or use left.
    const castable = a => {
        const slots = Object.entries(a.system.spells ?? {})
            .filter(([, slot]) => (slot?.value ?? 0) > 0)
            .map(([key, slot]) => key === 'pact' ? Number(slot.level ?? 0) : Number(key.replace('spell', '')))
            .filter(n => n > 0);
        const maxSlot = Math.max(0, ...slots);
        const seen = new Set();
        return a.items.filter(s => {
            if (s.type !== 'spell') return false;
            const lvl = s.system.level ?? 0;
            const method = s.system.method ?? s.system.preparation?.mode;
            const prepared = lvl === 0 || ['atwill', 'innate', 'always', 'pact'].includes(method)
                || s.system.prepared || s.system.preparation?.prepared;
            if (!prepared) return false;
            const ok = lvl === 0 || ['atwill', 'innate'].includes(method)
                || (s.system.uses?.max && (s.system.uses.value ?? 0) > 0 && !['spell', 'prepared'].includes(method))
                || maxSlot >= lvl;
            if (!ok) return false;
            const key = s.name + '|' + lvl;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((x, y) => (x.system.level - y.system.level) || x.name.localeCompare(y.name));
    };
    const forcesSave = s => acts(s).some(x => x.type === 'save') || !!s.hasSave;
    const damageTypes = s => new Set(acts(s).flatMap(x => (x.damage?.parts ?? []).flatMap(p => asArray(p.types))));
    const deals = s => damageTypes(s).size > 0;
    const lasting = s => acts(s).map(x => x.duration ?? {}).concat([s.system.duration ?? {}])
        .some(d => ['minute', 'hour', 'day'].includes(d.units) || (d.units === 'round' && Number(d.value) >= 10));
    const ranged = s => {
        const r = s.system.range ?? {};
        return r.units === 'touch' || (['ft', 'mi'].includes(r.units) && Number(r.value) >= 5)
            || acts(s).some(x => x.range?.override && (x.range.units === 'touch' || Number(x.range.value) >= 5));
    };
    const actionAct = s => acts(s).find(x => x.activation?.type === 'action');
    const twinnable = s => /(additional|extra|one more) (creature|target|humanoid|beast|willing creature)/i
        .test(String(s.system.description?.value ?? '').replace(/<[^>]+>/g, ' '));
    const costOf = i => Number(acts(i)[0]?.consumption?.targets?.find(t => t.type === 'itemUses')?.value ?? 0);
    const chat = (a, html) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: a}), content: html});
    // Give back the points this option's use spent and drop its primed effect.
    const refund = async (a, wf, primedId, why) => {
        const primed = primedId && effectUtils.getEffectByIdentifier(a, primedId);
        if (primed) await genericUtils.remove(primed);
        const t = acts(wf.item).flatMap(x => x.consumption?.targets ?? []).find(x => x.type === 'itemUses');
        const cost = Number(wf.activity?.consumption?.targets?.find(x => x.type === 'itemUses')?.value ?? t?.value ?? 0);
        const pts = (t?.target && a.items.get(t.target)) || points(a);
        if (pts && cost && (pts.system.uses?.spent ?? 0) >= cost) {
            await genericUtils.update(pts, {'system.uses.spent': pts.system.uses.spent - cost});
        }
        ui.notifications.info(wf.item.name + ': ' + why + (cost ? ' Sorcery Points refunded.' : ''));
    };
    // Sorcery Incarnate's combiner sets this while it primes a SECOND option.
    const primeOnly = async a => {
        if (!a.getFlag('world', 'nixMetamagicPrimeOnly')) return false;
        await a.unsetFlag('world', 'nixMetamagicPrimeOnly');
        return true;
    };
    const pick = (title, prompt, list) => dialogUtils.selectDocumentDialog(title, prompt, list,
        {showSpellLevel: true, addNoneDocument: true, userId: socketUtils.firstOwner(workflow.actor, true) ?? game.user.id});
    // Distant Spell: double the range (touch -> 30 ft) until the cast finishes.
    const distantApply = async spell => {
        if (spell.getFlag('world', 'nixDistantRestore')) return false;
        const restore = {item: foundry.utils.deepClone(spell.system.range ?? {}), acts: {}};
        const grow = r => r.units === 'touch' ? {units: 'ft', value: 30}
            : (['ft', 'mi'].includes(r.units) && Number(r.value) >= 5) ? {units: r.units, value: Number(r.value) * 2} : null;
        const upd = {};
        const g = grow(spell.system.range ?? {});
        if (g) { upd['system.range.units'] = g.units; upd['system.range.value'] = g.value; }
        for (const x of acts(spell)) {
            if (!x.range?.override) continue;
            const ga = grow(x.range);
            if (!ga) continue;
            restore.acts[x.id] = {units: x.range.units, value: x.range.value ?? null};
            upd['system.activities.' + x.id + '.range.units'] = ga.units;
            upd['system.activities.' + x.id + '.range.value'] = ga.value;
        }
        if (!Object.keys(upd).length) return false;
        upd['flags.world.nixDistantRestore'] = restore;
        await genericUtils.update(spell, upd);
        return true;
    };
    const distantRestore = async spell => {
        const r = spell?.getFlag?.('world', 'nixDistantRestore');
        if (!r) return;
        const upd = {'system.range.units': r.item?.units ?? '', 'system.range.value': r.item?.value ?? null,
            'flags.world.-=nixDistantRestore': null};
        for (const [id, v] of Object.entries(r.acts ?? {})) {
            upd['system.activities.' + id + '.range.units'] = v.units;
            upd['system.activities.' + id + '.range.value'] = v.value;
        }
        await genericUtils.update(spell, upd);
    };
    // Cast the chosen spell once this Metamagic use has finished. A primed
    // Distant Spell stretches its range first. One fitting activity: use it;
    // several: the normal activity chooser.
    const cast = async (a, spell, fits = () => true) => {
        if (effectUtils.getEffectByIdentifier(a, MM.distant.id) && await distantApply(spell)) spell = a.items.get(spell.id) ?? spell;
        const list = acts(spell).filter(fits);
        const act = list.length === 1 ? list[0] : null;
        setTimeout(() => act ? act.use() : spell.use(), 250);
    };
    // Macro text: these helpers + the function. wrapReturn hands the function's
    // result back to Chris's Premades (save "bonus" passes return the new roll).
    const wrap = fn => 'const H = (' + nixSorcerer.toString() + ')();\nawait (' + fn.toString() + ')();';
    const wrapReturn = fn => 'const H = (' + nixSorcerer.toString() + ')();\nreturn await (' + fn.toString() + ')();';
    return {MM, SIX, baseName, keyOf, points, acts, castable, forcesSave, damageTypes, deals, lasting, ranged, actionAct,
        twinnable, costOf, chat, refund, primeOnly, pick, distantApply, distantRestore, cast, wrap, wrapReturn};
})();

// ===========================================================================
//  OPTION MACROS  (each: Midi Item | rollFinished | 50, on that option's item)
// ===========================================================================

// ---- Careful Spell ----------------------------------------------------------
const careful = async () => {
    const actor = workflow.actor, title = workflow.item.name, P = H.MM.careful.id;
    const old = effectUtils.getEffectByIdentifier(actor, P);
    if (old) await genericUtils.remove(old);
    // Next spell that forces a save: up to Cha mod (min 1) of its targets
    // automatically succeed, and take no damage where a success means half.
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        if (!(workflow.saveActivity || workflow.activity?.type === 'save' || workflow.activity?.save)) return;
        const primed = trigger.entity;
        const caster = workflow.token;
        await genericUtils.remove(primed);
        const targets = Array.from(workflow.targets ?? []).filter(t => t.actor && t.id !== caster?.id);
        if (!targets.length) return;
        const n = Math.max(1, workflow.actor.system.abilities.cha.mod);
        const allies = targets.filter(t => caster && t.document.disposition === caster.document.disposition);
        let chosen = allies.length && allies.length <= n ? allies : null;
        if (!chosen) {
            chosen = await dialogUtils.selectTargetDialog(primed.name,
                'Careful Spell: choose up to ' + n + ' creature' + (n > 1 ? 's' : '') + ' that automatically succeed on the save against '
                + workflow.item.name + ' (and take no damage where a success would halve it).', targets,
                {type: 'multiple', maxAmount: n, skipDeadAndUnconscious: false, coverToken: caster, displayDistance: true,
                    preselected: allies.slice(0, n), userId: socketUtils.firstOwner(workflow.actor, true) ?? game.user.id});
            chosen = (Array.isArray(chosen?.[0]) ? chosen[0] : []).map(p => (p?.document ?? p)?.object ?? p);
        }
        chosen = (chosen ?? []).filter(t => t?.actor).slice(0, n);
        if (!chosen.length) return;
        const spellUuid = workflow.item.uuid;
        // Scripts on the protected creature's effect.
        const autoSucceed = async () => {
            const c = trigger.entity.flags.world?.nixCareful;
            if (!c) return;
            const from = trigger.config?.midiOptions?.saveItemUuid;
            if (from && from !== c.spellUuid) return;
            const roll = trigger.roll;
            const dc = roll?.options?.target;
            if (!dc || roll.total >= dc) return;
            const lift = await new Roll(String(dc - roll.total)).evaluate();
            const newRoll = MidiQOL.addRollTo(roll, lift);
            newRoll.data = roll.data;
            return newRoll;
        };
        const noDamage = async () => {
            const eff = trigger.entity;
            const c = eff.flags.world?.nixCareful;
            if (!c || !ditem || workflow.item?.uuid !== c.spellUuid) return;
            if (ditem.actorUuid && ditem.actorUuid !== eff.parent?.uuid) return;
            if (workflow.activity?.damage?.onSave !== 'half') return;
            workflowUtils.negateDamageItemDamage(ditem);
        };
        const cleanup = async () => {
            const c = trigger.entity.flags.world?.nixCareful;
            if (c && workflow.item?.uuid === c.spellUuid) await genericUtils.remove(trigger.entity);
        };
        for (const t of chosen) {
            await effectUtils.createEffect(t.actor, {
                name: 'Careful Spell', img: primed.img, origin: spellUuid, duration: {seconds: 6, turns: 1},
                description: 'Automatically succeeds on the save against ' + workflow.item.name + '; no damage where a success would halve it.',
                flags: {world: {nixCareful: {spellUuid}}, 'chris-premades': {embeddedMacros: [
                    {name: 'Careful: succeed', type: 'save', pass: 'bonus', priority: 10, macro: H.wrapReturn(autoSucceed)},
                    {name: 'Careful: no damage', type: 'midi-actor', pass: 'targetApplyDamage', priority: 30, macro: H.wrap(noDamage)},
                    {name: 'Careful: done', type: 'midi-actor', pass: 'sceneRollFinished', priority: 50, macro: H.wrap(cleanup)}]}}
            });
        }
        await H.chat(workflow.actor, '<b>Careful Spell:</b> ' + chosen.map(t => t.document.name).join(', ')
            + ' automatically succeed' + (chosen.length === 1 ? 's' : '') + ' against ' + workflow.item.name + '.');
    };
    await effectUtils.createEffect(actor, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {seconds: 60},
        description: 'The next spell that forces a saving throw is Careful.',
        flags: {'chris-premades': {embeddedMacros: [
            {name: 'Careful cast', type: 'midi-actor', pass: 'preambleComplete', priority: 45, macro: H.wrap(onCast)}]}}
    }, {identifier: P});
    if (await H.primeOnly(actor)) return;
    const spells = H.castable(actor).filter(s => s.system.level >= 0 && H.forcesSave(s));
    if (!spells.length) return H.refund(actor, workflow, P, 'no castable spells force a saving throw.');
    const spell = await H.pick(title, 'Careful which spell? (Spells that force a saving throw. Target the creatures first.)', spells);
    if (!spell) return H.refund(actor, workflow, P, 'no spell chosen.');
    await H.cast(actor, spell, x => x.type === 'save');
};

// ---- Distant Spell ----------------------------------------------------------
const distant = async () => {
    const actor = workflow.actor, title = workflow.item.name, P = H.MM.distant.id;
    const old = effectUtils.getEffectByIdentifier(actor, P);
    if (old) await genericUtils.remove(old);
    // The range is doubled by H.cast just before the spell is used; put it back after.
    const onDone = async () => {
        if (workflow.item?.type !== 'spell') return;
        const spell = workflow.actor.items.get(workflow.item.id);
        if (!spell?.getFlag('world', 'nixDistantRestore')) return;
        const r = spell.system.range ?? {};
        await H.distantRestore(spell);
        await genericUtils.remove(trigger.entity);
        await H.chat(workflow.actor, '<b>Distant Spell:</b> ' + spell.name + ' reached ' + (r.value ?? '?') + ' ' + (r.units ?? '') + '.');
    };
    const onGone = async () => {
        const a = trigger.entity.parent;
        for (const s of a?.items?.filter(i => i.getFlag?.('world', 'nixDistantRestore')) ?? []) await H.distantRestore(s);
    };
    await effectUtils.createEffect(actor, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {seconds: 60},
        description: 'The next spell cast through a Metamagic option has double range (touch becomes 30 ft).',
        flags: {'chris-premades': {embeddedMacros: [
            {name: 'Distant done', type: 'midi-actor', pass: 'rollFinished', priority: 70, macro: H.wrap(onDone)},
            {name: 'Distant restore', type: 'effect', pass: 'deleted', priority: 50, macro: H.wrap(onGone)}]}}
    }, {identifier: P});
    if (await H.primeOnly(actor)) return;
    const spells = H.castable(actor).filter(H.ranged);
    if (!spells.length) return H.refund(actor, workflow, P, 'no castable spells have a range of 5 ft or more, or touch.');
    const spell = await H.pick(title, 'Distant which spell? Its range doubles (touch becomes 30 ft).', spells);
    if (!spell) return H.refund(actor, workflow, P, 'no spell chosen.');
    await H.cast(actor, spell);
};

// ---- Empowered Spell (rider: click before the spell) ----------------------
const empowered = async () => {
    const actor = workflow.actor, title = workflow.item.name, P = H.MM.empowered.id;
    const old = effectUtils.getEffectByIdentifier(actor, P);
    if (old) {   // clicked twice: keep one, refund this use
        const t = workflow.activity?.consumption?.targets?.find(x => x.type === 'itemUses');
        const pts = (t?.target && actor.items.get(t.target)) || H.points(actor);
        const cost = Number(t?.value ?? 0);
        if (pts && cost && (pts.system.uses?.spent ?? 0) >= cost) await genericUtils.update(pts, {'system.uses.spent': pts.system.uses.spent - cost});
        return ui.notifications.info(title + ' is already waiting for the next damage roll. Sorcery Points refunded.');
    }
    const onDamage = async () => {
        if (workflow.item?.type !== 'spell' || !(workflow.damageRolls?.length)) return;
        const primed = trigger.entity;
        const me = workflow.actor;
        const n = Math.max(1, me.system.abilities.cha.mod);
        const dice = [];
        for (const r of workflow.damageRolls) for (const term of r.terms ?? []) {
            if (!term.faces || !Array.isArray(term.results)) continue;
            for (const res of term.results) if (res.active !== false && !res.discarded) dice.push({r, term, res, gap: (term.faces + 1) / 2 - res.result});
        }
        await genericUtils.update(primed, {'flags.world.nixEmpowered.used': true});
        await genericUtils.remove(primed);
        // Reroll the dice furthest below average, up to Cha mod. New rolls stand.
        const low = dice.filter(d => d.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, n);
        if (!low.length) return H.chat(me, '<b>Empowered Spell:</b> every die of ' + workflow.item.name + ' is already average or better; nothing rerolled.');
        const lines = [];
        for (const d of low) {
            const before = d.res.result;
            d.res.result = Math.ceil(CONFIG.Dice.randomUniform() * d.term.faces);
            lines.push('d' + d.term.faces + ' ' + before + ' &rarr; ' + d.res.result);
        }
        for (const r of new Set(low.map(d => d.r))) r._total = r._evaluateTotal();
        await workflow.setDamageRolls(workflow.damageRolls);
        await H.chat(me, '<b>Empowered Spell:</b> ' + workflow.item.name + ' rerolls ' + low.length + ' ' + (low.length === 1 ? 'die' : 'dice') + ': ' + lines.join(', ') + '.');
    };
    const onGone = async () => {
        const e = trigger.entity;
        const f = e.flags.world?.nixEmpowered;
        if (!f || f.used || !f.cost) return;
        const a = e.parent;
        const pts = (f.pointsId && a?.items?.get(f.pointsId)) || H.points(a);
        if (pts && (pts.system.uses?.spent ?? 0) >= f.cost) await genericUtils.update(pts, {'system.uses.spent': pts.system.uses.spent - f.cost});
        await H.chat(a, '<b>Empowered Spell</b> wasn\'t used: ' + f.cost + ' Sorcery Point' + (f.cost > 1 ? 's' : '') + ' refunded.');
    };
    const t = workflow.activity?.consumption?.targets?.find(x => x.type === 'itemUses');
    await effectUtils.createEffect(actor, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {seconds: 60},
        description: 'The next spell that rolls damage rerolls up to ' + Math.max(1, actor.system.abilities.cha.mod)
            + ' of its lowest dice. Works alongside another Metamagic option. Delete this effect to cancel (points refunded).',
        flags: {world: {nixEmpowered: {cost: Number(t?.value ?? 0), pointsId: t?.target || null}},
            'chris-premades': {embeddedMacros: [
                {name: 'Empowered damage', type: 'midi-actor', pass: 'damageRollComplete', priority: 40, macro: H.wrap(onDamage)},
                {name: 'Empowered refund', type: 'effect', pass: 'deleted', priority: 50, macro: H.wrap(onGone)}]}}
    }, {identifier: P});
    if (actor.getFlag('world', 'nixMetamagicPrimeOnly')) await actor.unsetFlag('world', 'nixMetamagicPrimeOnly');
    await H.chat(actor, '<b>Empowered Spell:</b> the next spell ' + actor.name + ' casts that rolls damage is empowered.');
};

// ---- Extended Spell -----------------------------------------------------------
const extended = async () => {
    const actor = workflow.actor, title = workflow.item.name, P = H.MM.extended.id;
    const old = effectUtils.getEffectByIdentifier(actor, P);
    if (old) await genericUtils.remove(old);
    // Next spell lasting 1 minute or more: duration x2 (max 24 h), advantage on
    // Constitution saves to keep concentrating on it.
    const onDone = async () => {
        if (workflow.item?.type !== 'spell' || !H.lasting(workflow.item)) return;
        const primed = trigger.entity;
        await genericUtils.remove(primed);
        await genericUtils.sleep(800);
        const spellUuid = workflow.item.uuid;
        const MAX = 86400;
        const tokens = new Set([...(workflow.targets ?? []), workflow.token].filter(Boolean));
        const docs = [];
        for (const t of tokens) for (const e of t.actor?.effects ?? []) {
            if (e.origin === spellUuid || String(e.origin ?? '').startsWith(spellUuid + '.')) docs.push(e);
        }
        const conc = effectUtils.getConcentrationEffect(workflow.actor, workflow.item);
        if (conc && !docs.includes(conc)) docs.push(conc);
        let n = 0;
        for (const e of docs) {
            const d = e.duration ?? {};
            const upd = {};
            if (d.seconds) upd['duration.seconds'] = Math.min(MAX, d.seconds * 2);
            if (d.rounds) upd['duration.rounds'] = Math.min(MAX / 6, d.rounds * 2);
            if (Object.keys(upd).length) { await genericUtils.update(e, upd); n++; }
        }
        if (conc) {
            const adv = await effectUtils.createEffect(workflow.actor, {name: 'Extended Spell: steady focus', img: primed.img, origin: primed.origin,
                duration: {seconds: Math.min(MAX, (conc.duration?.seconds ?? 60) * 2)},
                changes: [{key: 'flags.midi-qol.advantage.concentration', mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: '1', priority: 20}],
                description: 'Advantage on Constitution saves to maintain concentration on the extended spell.'});
            if (adv) await effectUtils.addDependent(conc, [adv]);
        }
        await H.chat(workflow.actor, '<b>Extended Spell:</b> ' + workflow.item.name + '\'s duration is doubled'
            + (n ? '' : ' (no timed effects found to change)')
            + (conc ? ', and ' + workflow.actor.name + ' has Advantage on saves to keep concentrating on it.' : '.'));
    };
    await effectUtils.createEffect(actor, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {seconds: 60},
        description: 'The next spell lasting 1 minute or more has its duration doubled.',
        flags: {'chris-premades': {embeddedMacros: [
            {name: 'Extended cast', type: 'midi-actor', pass: 'rollFinished', priority: 60, macro: H.wrap(onDone)}]}}
    }, {identifier: P});
    if (await H.primeOnly(actor)) return;
    const spells = H.castable(actor).filter(s => s.system.level > 0 && H.lasting(s));
    if (!spells.length) return H.refund(actor, workflow, P, 'no castable spells last 1 minute or longer.');
    const spell = await H.pick(title, 'Extend which spell? It is cast now; its duration doubles (max 24 hours).', spells);
    if (!spell) return H.refund(actor, workflow, P, 'no spell chosen.');
    await H.cast(actor, spell);
};

// ---- Heightened Spell (Bangiras's, unchanged behaviour) -----------------------
const heightened = async () => {
    const actor = workflow.actor, title = workflow.item.name, P = H.MM.heightened.id;
    const old = effectUtils.getEffectByIdentifier(actor, P);
    if (old) await genericUtils.remove(old);
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        if (!(workflow.saveActivity || workflow.activity?.type === 'save' || workflow.activity?.save)) return;
        const primed = trigger.entity;
        const targets = Array.from(workflow.targets ?? []).filter(t => t.actor);
        if (!targets.length) return;
        await genericUtils.remove(primed);
        const chosen = targets.length === 1 ? [targets[0]]
            : await dialogUtils.selectTargetDialog(primed.name,
                'Which target has disadvantage on its saves against ' + workflow.item.name + '?',
                targets, {skipDeadAndUnconscious: false, displayDistance: false,
                    userId: socketUtils.firstOwner(workflow.actor, true) ?? game.user.id});
        const target = chosen?.[0];
        if (!target?.actor) return;
        const situational = async () => {
            const h = trigger.entity.flags.world?.heightenedTarget;
            if (!h) return;
            const fromItem = trigger.config?.midiOptions?.saveItemUuid;
            if (fromItem ? fromItem === h.spellUuid : h.firstSaveOpen) trigger.options.disadvantage = true;
        };
        const post = async () => {
            const effect = trigger.entity;
            const h = effect.flags.world?.heightenedTarget;
            if (!h) return;
            if (h.firstSaveOpen) await genericUtils.update(effect, {'flags.world.heightenedTarget.firstSaveOpen': false});
            await genericUtils.sleep(1500);
            const a = effect.parent;
            if (!a?.effects.get(effect.id)) return;
            const lingering = a.effects.some(e => e.id !== effect.id
                && (e.origin === h.spellUuid || String(e.origin ?? '').startsWith(h.spellUuid + '.')));
            if (!lingering) await genericUtils.remove(effect);
        };
        const turnEnd = async () => {
            const effect = trigger.entity;
            const h = effect.flags.world?.heightenedTarget;
            if (!h || h.firstSaveOpen) return;
            const a = effect.parent;
            const lingering = a.effects.some(e => e.id !== effect.id
                && (e.origin === h.spellUuid || String(e.origin ?? '').startsWith(h.spellUuid + '.')));
            if (!lingering) await genericUtils.remove(effect);
        };
        await effectUtils.createEffect(target.actor, {
            name: 'Heightened: ' + workflow.item.name, img: primed.img, origin: workflow.item.uuid,
            duration: {seconds: 60, rounds: 10},
            description: 'Disadvantage on saving throws against ' + workflow.item.name + '.',
            flags: {world: {heightenedTarget: {spellUuid: workflow.item.uuid, firstSaveOpen: true}},
                'chris-premades': {embeddedMacros: [
                    {name: 'Heightened save', type: 'save', pass: 'situational', priority: 50, macro: H.wrap(situational)},
                    {name: 'Heightened save end', type: 'save', pass: 'post', priority: 50, macro: H.wrap(post)},
                    {name: 'Heightened turn check', type: 'combat', pass: 'turnEnd', priority: 50, macro: H.wrap(turnEnd)}]}}
        }, {identifier: 'heightenedSpellTarget'});
        await H.chat(workflow.actor, '<b>Heightened Spell:</b> ' + target.document.name + ' has disadvantage on saves against ' + workflow.item.name + '.');
    };
    await effectUtils.createEffect(actor, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {seconds: 60},
        description: 'The next spell that forces a saving throw is Heightened.',
        flags: {'chris-premades': {embeddedMacros: [
            {name: 'Heightened cast', type: 'midi-actor', pass: 'preambleComplete', priority: 40, macro: H.wrap(onCast)}]}}
    }, {identifier: P});
    if (await H.primeOnly(actor)) return;
    const spells = H.castable(actor).filter(H.forcesSave);
    if (!spells.length) return H.refund(actor, workflow, P, 'no castable spells force a saving throw.');
    const spell = await H.pick(title, 'Heighten which spell? (Only spells that force a saving throw are listed.)', spells);
    if (!spell) return H.refund(actor, workflow, P, 'no spell chosen.');
    await H.cast(actor, spell, x => x.type === 'save');
};

// ---- Quickened Spell (Bangiras's) ----------------------------------------------
const quickened = async () => {
    const actor = workflow.actor, title = workflow.item.name, P = H.MM.quickened.id;
    const old = effectUtils.getEffectByIdentifier(actor, P);
    if (old) await genericUtils.remove(old);
    const onDone = async () => {
        if (workflow.item?.type !== 'spell') return;
        if (workflow.activity?.activation?.type !== 'action') return;
        const primed = trigger.entity;
        const q = primed.flags.world?.quickened ?? {};
        const a = workflow.actor;
        await genericUtils.remove(primed);
        try {
            if (globalThis.MidiQOL?.hasUsedBonusAction && !MidiQOL.hasUsedBonusAction(a)) await MidiQOL.setBonusActionUsed(a);
        } catch (e) { console.warn('Quickened Spell: could not mark the bonus action', e); }
        const giveBack = async () => {
            if (q.actionUsedBefore) return;
            if (a.getFlag('midi-qol', 'actions')?.action) await MidiQOL.removeActionUsed(a);
        };
        await giveBack();
        setTimeout(giveBack, 800);
        await H.chat(a, '<b>Quickened Spell:</b> ' + workflow.item.name + ' was cast as a Bonus Action.');
    };
    await effectUtils.createEffect(actor, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {seconds: 60},
        description: 'The next 1-action spell takes a Bonus Action instead.',
        flags: {world: {quickened: {actionUsedBefore: !!actor.getFlag('midi-qol', 'actions')?.action}},
            'chris-premades': {embeddedMacros: [
                {name: 'Quickened done', type: 'midi-actor', pass: 'rollFinished', priority: 60, macro: H.wrap(onDone)}]}}
    }, {identifier: P});
    if (await H.primeOnly(actor)) return;
    const spells = H.castable(actor).filter(s => H.actionAct(s));
    if (!spells.length) return H.refund(actor, workflow, P, 'no castable 1-action spells.');
    const spell = await H.pick(title, 'Quicken which spell? (Spells that take 1 action. It takes the Bonus Action instead.)', spells);
    if (!spell) return H.refund(actor, workflow, P, 'no spell chosen.');
    await H.cast(actor, spell, x => x.activation?.type === 'action');
};

// ---- Transmuted Spell -----------------------------------------------------------
const transmuted = async () => {
    const actor = workflow.actor, title = workflow.item.name, P = H.MM.transmuted.id;
    const old = effectUtils.getEffectByIdentifier(actor, P);
    if (old) await genericUtils.remove(old);
    const onDamage = async () => {
        if (workflow.item?.type !== 'spell') return;
        const rolls = workflow.damageRolls ?? [];
        const hit = rolls.filter(r => H.SIX.includes(r.options?.type));
        if (!hit.length) return;                         // nothing to change: stay primed
        const primed = trigger.entity;
        await genericUtils.remove(primed);
        const from = [...new Set(hit.map(r => r.options.type))];
        const label = t => CONFIG.DND5E.damageTypes?.[t]?.label ?? t;
        const buttons = H.SIX.filter(t => !(from.length === 1 && from[0] === t)).map(t => [label(t), t]);
        buttons.push(['Keep ' + from.map(label).join(' / '), false]);
        const to = await dialogUtils.buttonDialog(primed.name,
            'Transmuted Spell: change the ' + from.map(label).join(' / ') + ' damage of ' + workflow.item.name + ' to:', buttons,
            {userId: socketUtils.firstOwner(workflow.actor, true) ?? game.user.id});
        if (!to) return;
        for (const r of hit) {
            r.options.type = to;
            for (const t of r.terms) if (t.options && 'flavor' in t.options) t.options.flavor = to;
        }
        await workflow.setDamageRolls(rolls);
        await H.chat(workflow.actor, '<b>Transmuted Spell:</b> ' + workflow.item.name + ' deals ' + label(to) + ' damage.');
    };
    await effectUtils.createEffect(actor, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {seconds: 60},
        description: 'The next spell dealing acid, cold, fire, lightning, poison or thunder damage can change it to another of those types.',
        flags: {'chris-premades': {embeddedMacros: [
            {name: 'Transmuted damage', type: 'midi-actor', pass: 'damageRollComplete', priority: 30, macro: H.wrap(onDamage)}]}}
    }, {identifier: P});
    if (await H.primeOnly(actor)) return;
    const spells = H.castable(actor).filter(s => [...H.damageTypes(s)].some(t => H.SIX.includes(t)));
    if (!spells.length) return H.refund(actor, workflow, P, 'no castable spells deal acid, cold, fire, lightning, poison or thunder damage.');
    const spell = await H.pick(title, 'Transmute which spell? You choose the new damage type when it rolls damage.', spells);
    if (!spell) return H.refund(actor, workflow, P, 'no spell chosen.');
    await H.cast(actor, spell);
};

// ---- Twinned Spell (Bangiras's) ----------------------------------------------------
const twinned = async () => {
    const actor = workflow.actor, title = workflow.item.name, P = H.MM.twinned.id;
    const old = effectUtils.getEffectByIdentifier(actor, P);
    if (old) await genericUtils.remove(old);
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        const primed = trigger.entity;
        const caster = workflow.token;
        const casterActor = workflow.actor;
        const activity = workflow.activity;
        const giveBack = async why => {
            const pts = H.points(casterActor);
            if (pts && (pts.system.uses?.spent ?? 0) > 0) await genericUtils.update(pts, {'system.uses.spent': Math.max(0, pts.system.uses.spent - 1)});
            ui.notifications.info('Twinned Spell: ' + why + ' Sorcery Point refunded.');
        };
        await genericUtils.remove(primed);
        if (!caster) return giveBack('no token for the caster.');
        let targets = Array.from(workflow.targets ?? []).filter(t => t.actor);
        if (targets.length < 2) {
            const range = activity?.range ?? {};
            const maxDistance = range.units === 'touch' ? 5 : (Number(range.value) > 0 ? Number(range.value) : Infinity);
            const already = new Set(targets.map(t => t.document.uuid));
            const candidates = canvas.tokens.placeables
                .filter(t => t.actor && !already.has(t.document.uuid) && !t.document.hidden)
                .filter(t => tokenUtils.getDistance(caster, t) <= maxDistance)
                .sort((a, b) => tokenUtils.getDistance(caster, a) - tokenUtils.getDistance(caster, b));
            if (!candidates.length) return giveBack('no second creature within range of ' + workflow.item.name + '.');
            const chosen = await dialogUtils.selectTargetDialog('Twinned Spell',
                'Only one creature was targeted. Choose the second target for ' + workflow.item.name + '.',
                candidates, {skipDeadAndUnconscious: false, coverToken: caster, displayDistance: true,
                    userId: socketUtils.firstOwner(casterActor, true) ?? game.user.id});
            const twin = chosen?.[0];
            if (!twin) return giveBack('no second target chosen.');
            workflow.targets.add(twin);
            if (workflow.hitTargets && !activity?.attack) workflow.hitTargets.add(twin);
            twin.setTarget(true, {releaseOthers: false, groupSelection: true});
            targets.push(twin);
        }
        await H.chat(casterActor, '<b>Twinned Spell:</b> ' + workflow.item.name + ' targets <b>'
            + targets.map(t => t.document.name).join('</b> and <b>') + '</b>.');
    };
    await effectUtils.createEffect(actor, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {seconds: 60},
        description: 'The next spell can target one additional creature.',
        flags: {'chris-premades': {embeddedMacros: [
            {name: 'Twinned cast', type: 'midi-actor', pass: 'preambleComplete', priority: 30, macro: H.wrap(onCast)}]}}
    }, {identifier: P});
    if (await H.primeOnly(actor)) return;
    const spells = H.castable(actor).filter(s => s.system.level > 0 && H.twinnable(s));
    if (!spells.length) return H.refund(actor, workflow, P, 'no castable spells can be twinned.');
    const spell = await H.pick(title, 'Twin which spell? (Spells that target an additional creature when upcast. Target both creatures first.)', spells);
    if (!spell) return H.refund(actor, workflow, P, 'no spell chosen.');
    await H.cast(actor, spell);
};

// ===========================================================================
//  SORCERY INCARNATE: second option while Innate Sorcery is active
//  Midi Actor | rollFinished | 20, on the Sorcery Points item.
// ===========================================================================
const incarnate = async () => {
    const actor = workflow.actor;
    const first = workflow.item;
    const firstKey = first?.type === 'feat' ? H.keyOf(first) : null;
    if (!firstKey || firstKey === 'empowered') return;
    if (actor.getFlag('world', 'nixMetamagicPrimeOnly')) return;      // this IS the second option
    if (!actor.items.some(i => /^sorcery incarnate$/i.test(i.name.trim()))) return;
    if (!actor.appliedEffects.some(e => /innate sorcery/i.test(e.name))) return;
    const pts = H.points(actor);
    const left = pts?.system.uses?.value ?? 0;
    const choices = actor.items.filter(i => i.type === 'feat') .filter(i => {
        const k = H.keyOf(i);
        return k && k !== firstKey && k !== 'empowered' && H.costOf(i) <= left && !effectUtils.getEffectByIdentifier(actor, H.MM[k].id);
    });
    if (!choices.length) return;
    const second = await dialogUtils.selectDocumentDialog('Sorcery Incarnate',
        'Innate Sorcery is active. Add a second Metamagic option to this spell? (' + left + ' Sorcery Points left)',
        choices, {addNoneDocument: true, userId: socketUtils.firstOwner(actor, true) ?? game.user.id});
    if (!second) return;
    const activity = H.acts(second)[0];
    if (!activity) return ui.notifications.warn('Sorcery Incarnate: ' + second.name + ' has no activity.');
    const id = H.MM[H.keyOf(second)].id;
    await actor.setFlag('world', 'nixMetamagicPrimeOnly', true);
    try {
        await activity.use({}, {configure: false});
        const start = Date.now();
        while (!effectUtils.getEffectByIdentifier(actor, id) && Date.now() - start < 20000) await genericUtils.sleep(250);
    } finally {
        if (actor.getFlag('world', 'nixMetamagicPrimeOnly')) await actor.unsetFlag('world', 'nixMetamagicPrimeOnly');
    }
    await H.chat(actor, '<b>Sorcery Incarnate:</b> ' + actor.name + ' weaves ' + first.name + ' and ' + second.name + ' into one spell.');
};

// ===========================================================================
//  SORCEROUS RESTORATION (Bangiras's): Rest | short | 50
// ===========================================================================
const restoration = async () => {
    if (trigger.data?.longRest) return;
    const item = trigger.entity;
    const me = item.actor;
    if (item.system.uses?.max && !(item.system.uses.value > 0)) return;
    const pts = H.points(me);
    if (pts && (pts.system.uses?.spent ?? 0) <= 0) return;
    const activity = H.acts(item)[0];
    if (!activity) return;
    const regain = Math.floor((me.classes?.sorcerer?.system.levels ?? 0) / 2);
    const yes = await dialogUtils.confirm(item.name,
        'Short rest finished. Use ' + item.name + ' to regain up to ' + (regain || 'some') + ' Sorcery Points? ('
        + (pts?.system.uses?.value ?? '?') + '/' + (pts?.system.uses?.max ?? '?') + ' now)',
        {userId: socketUtils.firstOwner(me, true) ?? game.user.id});
    if (!yes) return;
    await activity.use({}, {configure: false});
};

// ===========================================================================
//  INSTALL
// ===========================================================================
const BODIES = {careful, distant, empowered, extended, heightened, quickened, transmuted, twinned};
const OUR_NAMES = /^(Metamagic|Careful Spell|Distant Spell|Empowered Spell|Extended Spell|Heightened Spell|Quickened Spell|Transmuted Spell|Twinned Spell|Sorcery Incarnate|Sorcerous Restoration prompt)$/;
const OLD_MARKERS = ['SpellPrimed', 'nixMetamagicPrimeOnly', 'nixExtendedPrimed', 'nixSorcerer'];
const isOurs = m => OUR_NAMES.test(m.name ?? '') || OLD_MARKERS.some(k => String(m.macro ?? '').includes(k));
async function setMacros(doc, add) {
    const cur = doc.flags?.['chris-premades']?.embeddedMacros ?? [];
    await doc.setFlag('chris-premades', 'embeddedMacros', cur.filter(m => !isOurs(m)).concat(add));
}
const cprMacros = i => Object.values(foundry.utils.flattenObject(i.flags?.['chris-premades']?.macros ?? {})).flat().filter(Boolean);

const pts = H.points(actor);
if (!pts) report.push('<li><b>Sorcery Points</b> not found: the options have nothing to spend. Run the Metamagic fix-up.</li>');

// ---- 1. Metamagic options ----------------------------------------------------
const options = actor.items.filter(i => i.type === 'feat' && H.keyOf(i));
const seenKeys = new Set();
for (const item of options) {
    const key = H.keyOf(item);
    if (seenKeys.has(key)) { report.push('<li><b>' + item.name + '</b> is a duplicate; only the first copy got the macro.</li>'); continue; }
    seenKeys.add(key);
    const notes = [];
    if (cprMacros(item).length) {
        await item.update({'flags.chris-premades.-=macros': null});
        notes.push('Chris\'s Premades\' own macro switched off');
    }
    for (const [aid, list] of Object.entries(item.flags?.['chris-premades']?.embeddedActivityMacros ?? {})) {
        const kept = (list ?? []).filter(m => !isOurs(m));
        if (kept.length !== (list ?? []).length) await item.setFlag('chris-premades', 'embeddedActivityMacros.' + aid, kept);
    }
    await setMacros(item, [{name: 'Metamagic', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: H.wrap(BODIES[key])}]);
    const act = H.acts(item)[0];
    if (!act) notes.push('<b>no activity: add a Utility activity and run again</b>');
    else if (!H.costOf(item)) notes.push('<b>costs nothing: run the Metamagic fix-up</b>');
    report.push('<li>' + item.name + ' (' + H.costOf(item) + ' SP)' + (notes.length ? ': ' + notes.join('; ') : '') + '.</li>');
}
if (!options.length) report.push('<li>No Metamagic options found.</li>');

// ---- 2. Sorcery Incarnate combiner (on Sorcery Points) ------------------------
const incarnateItem = actor.items.find(i => /^sorcery incarnate$/i.test(i.name.trim()));
if (incarnateItem) {
    const cur = incarnateItem.flags?.['chris-premades']?.embeddedMacros ?? [];
    if (cur.some(isOurs)) await incarnateItem.setFlag('chris-premades', 'embeddedMacros', cur.filter(m => !isOurs(m)));
}
if (pts) {
    await setMacros(pts, incarnateItem
        ? [{name: 'Sorcery Incarnate', type: 'midi-actor', pass: 'rollFinished', priority: 20, macro: H.wrap(incarnate)}] : []);
    if (incarnateItem) report.push('<li>Sorcery Incarnate: with Innate Sorcery active, an option offers a second one for the same spell.</li>');
}

// ---- 3. Innate Sorcery ------------------------------------------------------------
const innate = actor.items.find(i => /^innate sorcery$/i.test(i.name.trim()));
if (!innate) report.push('<li><b>Innate Sorcery</b> not found.</li>');
else {
    const notes = [];
    if (!innate.system.uses?.max) {
        await innate.update({'system.uses.max': '2', 'system.uses.recovery': [{period: 'lr', type: 'recoverAll'}]});
        notes.push('2 uses per Long Rest');
    }
    const main = H.acts(innate).find(a => !/sorcery points/i.test(a.name ?? '')) ?? H.acts(innate)[0];
    if (main && !(main.consumption?.targets ?? []).some(t => t.type === 'itemUses')) {
        await main.update({'consumption.targets': [...(main.consumption?.targets ?? []), {type: 'itemUses', target: innate.id, value: '1', scaling: {}}]});
        notes.push('spends a use');
    }
    for (const e of innate.effects) {
        const ch = e.changes ?? [];
        const r = ch.find(c => c.key === 'flags.midi-qol.advantage.attack.rsak');
        if (r && !ch.some(c => c.key === 'flags.midi-qol.advantage.attack.msak')) {
            await e.update({changes: ch.concat([{...r, key: 'flags.midi-qol.advantage.attack.msak'}])});
            notes.push('advantage on melee spell attacks too (' + e.name + ')');
        }
    }
    if (incarnateItem && pts && main && !H.acts(innate).some(a => /sorcery points/i.test(a.name ?? ''))) {
        const data = main.toObject();
        data._id = foundry.utils.randomID();
        data.name = 'Innate Sorcery (2 Sorcery Points)';
        data.consumption = {...(data.consumption ?? {}), targets: [{type: 'itemUses', target: pts.id, value: '2', scaling: {}}]};
        await innate.update({['system.activities.' + data._id]: data});
        notes.push('"2 Sorcery Points" activity for when the uses are gone');
    }
    report.push('<li>Innate Sorcery: ' + (notes.length ? notes.join('; ') : 'already set') + '.</li>');
}

// ---- 4. Sorcerous Restoration ---------------------------------------------------
const restore = actor.items.find(i => /^sorcerous restoration$/i.test(i.name.trim()));
if (!restore) report.push('<li><b>Sorcerous Restoration</b> not found.</li>');
else {
    await setMacros(restore, [{name: 'Sorcerous Restoration prompt', type: 'rest', pass: 'short', priority: 50, macro: H.wrap(restoration)}]);
    report.push('<li>Sorcerous Restoration asks after a Short Rest.</li>');
}

// ---- 5. Leftovers from earlier casts ----------------------------------------------
for (const s of actor.items.filter(i => i.getFlag?.('world', 'nixDistantRestore'))) {
    await H.distantRestore(s);
    report.push('<li>' + s.name + ': range put back from an unfinished Distant Spell.</li>');
}

await ChatMessage.create({whisper: [game.user.id], content: '<b>Sorcerer core (2024) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
