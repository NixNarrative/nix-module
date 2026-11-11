// =====================================================================
//  SORCERER CORE (2024), Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with the sorcerer selected, as GM).
//  Safe to re-run: replaces what it wrote. Run the Metamagic fix-up (v14) first so
//  every option costs the 2024 price. Same behaviour as the v13 core:
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
//  Innate Sorcery: a "2 Sorcery Points" activity for when the uses are gone.
//  Sorcerous Restoration: asks after a Short Rest.
//
//  Built from: Bangiras's v14 Quickened / Heightened / Twinned / Sorcery Incarnate /
//  Sorcerous Restoration, Akira's v14 Extended, and the v13 core's Careful, Distant,
//  Empowered and Transmuted, rewritten for CAT:
//   - CAT embedded macros (flags.cat.embeddedMacros, {name, event, pass, macros: [{priority, macro}]}).
//   - Damage edits (Empowered, Transmuted) on roll / actorDamageRoll (damageRollComplete is read only on v14).
//   - Careful: save / actorBonus (auto-success), roll / targetDamage (no damage on a halving save),
//     roll / targetRollFinished (clean-up). Ill-fitting v13 passes (sceneRollFinished) are gone.
//   - Effects in v14 form: system.changes with `type`, duration {value, units}, flags.cat.identifier.
//   - Key deletion with Foundry 14's _del (ForcedDeletion), "-=" only as a fallback.
//  The inert v13 copies of these macros (flags.chris-premades) are removed.
// =====================================================================

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Sorcerer core (v14): select the sorcerer\'s token first.');
if (!globalThis.cat?.utils) return ui.notifications.error('Sorcerer core (v14): CAT (Coven\'s Automation Toolkit) is not active.');
const report = [];
// The helpers below also run here, in the installer, where CAT's macro scope isn't defined.
const {documentUtils, effectUtils, dialogUtils, queryUtils, genericUtils} = cat.utils;

// ---------------------------------------------------------------------------
//  Helpers carried into every macro this installer writes (H.wrap does that).
//  Free names (workflow, document, roll, documentUtils...) resolve in CAT's
//  macro scope when the macro runs.
// ---------------------------------------------------------------------------
const H = (function nixSorcerer14() {
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
    const getFx = (a, id) => a?.effects?.find(e => e.flags?.cat?.identifier === id) ?? documentUtils.getEffectByIdentifier(a, id);
    const owner = a => queryUtils.firstOwner(a, true) ?? game.user.id;
    // Foundry 14 deletes a key with _del (ForcedDeletion); "-=" is the old form.
    const unset = path => typeof _del !== 'undefined' ? {[path]: _del} : {[path.replace(/\.([^.]+)$/, '.-=$1')]: null};
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
    // CAT's selectTargetDialog returns {result, skip}; result is a TokenDocument, a list of them,
    // or [{document, value}]. Back to Token placeables with an actor.
    const picked = r => {
        const raw = r?.result !== undefined ? r.result : (Array.isArray(r) ? r[0] : r);
        const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        return list.map(x => x?.document ?? x).map(d => d?.object ?? d).filter(t => t?.actor);
    };
    const makeEffect = async (a, data, identifier) => {
        if (identifier) foundry.utils.setProperty(data, 'flags.cat.identifier', identifier);
        return (await effectUtils.createEffects(a, [data]))?.[0];
    };
    // Give back the points this option's use spent and drop its primed effect.
    const refund = async (a, wf, primedId, why) => {
        const primed = primedId && getFx(a, primedId);
        if (primed) await documentUtils.deleteDocument(primed);
        const t = acts(wf.item).flatMap(x => x.consumption?.targets ?? []).find(x => x.type === 'itemUses');
        const cost = Number(wf.activity?.consumption?.targets?.find(x => x.type === 'itemUses')?.value ?? t?.value ?? 0);
        const pts = (t?.target && a.items.get(t.target)) || points(a);
        if (pts && cost && (pts.system.uses?.spent ?? 0) >= cost) {
            await documentUtils.update(pts, {'system.uses.spent': pts.system.uses.spent - cost});
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
        {showSpellLevel: true, addNoneDocument: true, userId: owner(workflow.actor)});
    // Distant Spell: double the range (touch -> 30 ft) until the cast finishes.
    const distantApply = async spell => {
        if (spell.getFlag('world', 'nixDistantRestore')) return false;
        const restore = {item: foundry.utils.deepClone(spell.system.range ?? {}), acts: {}};
        const grow = r => r.units === 'touch' ? {units: 'ft', value: 30}
            : (['ft', 'mi'].includes(r.units) && Number(r.value) >= 5) ? {units: r.units, value: Number(r.value) * 2} : null;
        const upd = {};
        const g = grow(spell.system.range ?? {});
        if (g) { upd['system.range.units'] = g.units; upd['system.range.value'] = String(g.value); }
        for (const x of acts(spell)) {
            if (!x.range?.override) continue;
            const ga = grow(x.range);
            if (!ga) continue;
            restore.acts[x.id] = {units: x.range.units, value: x.range.value ?? null};
            upd['system.activities.' + x.id + '.range.units'] = ga.units;
            upd['system.activities.' + x.id + '.range.value'] = String(ga.value);
        }
        if (!Object.keys(upd).length) return false;
        upd['flags.world.nixDistantRestore'] = restore;
        await documentUtils.update(spell, upd);
        return true;
    };
    const distantRestore = async spell => {
        const r = spell?.getFlag?.('world', 'nixDistantRestore');
        if (!r) return;
        const upd = {'system.range.units': r.item?.units ?? '', 'system.range.value': r.item?.value ?? null,
            ...unset('flags.world.nixDistantRestore')};
        for (const [id, v] of Object.entries(r.acts ?? {})) {
            upd['system.activities.' + id + '.range.units'] = v.units;
            upd['system.activities.' + id + '.range.value'] = v.value;
        }
        await documentUtils.update(spell, upd);
    };
    // Cast the chosen spell once this Metamagic use has finished. A primed
    // Distant Spell stretches its range first. One fitting activity: use it;
    // several: the normal activity chooser.
    const cast = async (a, spell, fits = () => true) => {
        if (getFx(a, MM.distant.id) && await distantApply(spell)) spell = a.items.get(spell.id) ?? spell;
        const list = acts(spell).filter(fits);
        const act = list.length === 1 ? list[0] : null;
        setTimeout(() => act ? act.use() : spell.use(), 250);
    };
    // CAT embedded macro entry.
    const entry = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: wrap(fn)}]});
    // Macro text: these helpers + the function, its result handed back to CAT
    // (save "bonus" passes return the new roll).
    const wrap = fn => 'const H = (' + nixSorcerer14.toString() + ')();\nreturn await (' + fn.toString() + ')();';
    return {MM, SIX, baseName, keyOf, points, acts, getFx, owner, unset, castable, forcesSave, damageTypes, lasting, ranged, actionAct,
        twinnable, costOf, chat, picked, makeEffect, refund, primeOnly, pick, distantApply, distantRestore, cast, entry, wrap};
})();

// ===========================================================================
//  OPTION MACROS  (each: roll / itemRollFinished / 50, on that option's item)
//  Inside them: document = the item (or effect) carrying the macro.
// ===========================================================================

// ---- Careful Spell ----------------------------------------------------------
const careful = async () => {
    const me = workflow.actor, title = workflow.item.name, P = H.MM.careful.id;
    const old = H.getFx(me, P);
    if (old) await documentUtils.deleteDocument(old);
    // On the primed effect. roll / actorPreambleComplete / 45. Next spell that forces a
    // save: up to Cha mod (min 1) of its targets automatically succeed, and take no
    // damage where a success means half.
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        if (!(workflow.saveActivity || workflow.activity?.type === 'save' || workflow.activity?.save)) return;
        const primed = document;
        const caster = workflow.token;
        await documentUtils.deleteDocument(primed);
        const targets = Array.from(workflow.targets ?? []).filter(t => t.actor && t.id !== caster?.id);
        if (!targets.length) return;
        const n = Math.max(1, workflow.actor.system.abilities.cha.mod);
        const allies = targets.filter(t => caster && t.document.disposition === caster.document.disposition);
        let chosen = allies.length && allies.length <= n ? allies : null;
        if (!chosen) {
            const r = await dialogUtils.selectTargetDialog(primed.name,
                'Careful Spell: choose up to ' + n + ' creature' + (n > 1 ? 's' : '') + ' that automatically succeed on the save against '
                + workflow.item.name + ' (and take no damage where a success would halve it).', targets.map(t => t.document),
                {type: 'multiple', maxAmount: n, skipDeadAndUnconscious: false, coverToken: caster?.document, displayDistance: true,
                    preselected: Object.fromEntries(allies.slice(0, n).map(t => [t.id, true])), userId: H.owner(workflow.actor)});
            chosen = H.picked(r);
        }
        chosen = (chosen ?? []).filter(t => t?.actor).slice(0, n);
        if (!chosen.length) return;
        const spellUuid = workflow.item.uuid;
        // On the protected creature's effect. document = that effect.
        const autoSucceed = async () => {
            const c = document.flags.world?.nixCareful;
            if (!c) return;
            const from = workflowUtils.getSaveSource?.(config)?.item?.uuid;
            if (from && from !== c.spellUuid) return;
            const dc = roll?.options?.target ?? config?.target;
            if (!roll || !dc || roll.total >= dc) return;
            const lift = await new Roll(String(dc - roll.total)).evaluate();
            const newRoll = MidiQOL.addRollTo(roll, lift);
            newRoll.data = roll.data;
            return newRoll;
        };
        const noDamage = async () => {
            const c = document.flags.world?.nixCareful;
            if (!c || !ditem || workflow.item?.uuid !== c.spellUuid) return;
            if (targetToken?.actor && document.parent && targetToken.actor.uuid !== document.parent.uuid) return;
            if (workflow.activity?.damage?.onSave !== 'half') return;
            workflowUtils.negateDamageItemDamage(ditem);
        };
        const cleanup = async () => {
            const c = document.flags.world?.nixCareful;
            if (c && workflow.item?.uuid === c.spellUuid) await documentUtils.deleteDocument(document);
        };
        for (const t of chosen) {
            await H.makeEffect(t.actor, {
                name: 'Careful Spell', img: primed.img, origin: spellUuid, duration: {value: 1, units: 'turns'},
                description: 'Automatically succeeds on the save against ' + workflow.item.name + '; no damage where a success would halve it.',
                flags: {world: {nixCareful: {spellUuid}}, cat: {embeddedMacros: [
                    H.entry('Careful: succeed', 'save', 'actorBonus', 10, autoSucceed),
                    H.entry('Careful: no damage', 'roll', 'targetDamage', 30, noDamage),
                    H.entry('Careful: done', 'roll', 'targetRollFinished', 50, cleanup)]}}
            });
        }
        await H.chat(workflow.actor, '<b>Careful Spell:</b> ' + chosen.map(t => t.document.name).join(', ')
            + ' automatically succeed' + (chosen.length === 1 ? 's' : '') + ' against ' + workflow.item.name + '.');
    };
    await H.makeEffect(me, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        description: 'The next spell that forces a saving throw is Careful.',
        flags: {cat: {embeddedMacros: [H.entry('Careful cast', 'roll', 'actorPreambleComplete', 45, onCast)]}}
    }, P);
    if (await H.primeOnly(me)) return;
    const spells = H.castable(me).filter(s => H.forcesSave(s));
    if (!spells.length) return H.refund(me, workflow, P, 'no castable spells force a saving throw.');
    const spell = await H.pick(title, 'Careful which spell? (Spells that force a saving throw. Target the creatures first.)', spells);
    if (!spell) return H.refund(me, workflow, P, 'no spell chosen.');
    await H.cast(me, spell, x => x.type === 'save');
};

// ---- Distant Spell ----------------------------------------------------------
const distant = async () => {
    const me = workflow.actor, title = workflow.item.name, P = H.MM.distant.id;
    const old = H.getFx(me, P);
    if (old) await documentUtils.deleteDocument(old);
    // The range is doubled by H.cast just before the spell is used; put it back after.
    // On the primed effect: roll / actorRollFinished / 70.
    const onDone = async () => {
        if (workflow.item?.type !== 'spell') return;
        const spell = workflow.actor.items.get(workflow.item.id);
        if (!spell?.getFlag('world', 'nixDistantRestore')) return;
        const r = spell.system.range ?? {};
        await H.distantRestore(spell);
        await documentUtils.deleteDocument(document);
        await H.chat(workflow.actor, '<b>Distant Spell:</b> ' + spell.name + ' reached ' + (r.value ?? '?') + ' ' + (r.units ?? '') + '.');
    };
    // effect / deleted (the effect's own macro).
    const onGone = async () => {
        const a = document.parent;
        for (const s of a?.items?.filter(i => i.getFlag?.('world', 'nixDistantRestore')) ?? []) await H.distantRestore(s);
    };
    await H.makeEffect(me, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        description: 'The next spell cast through a Metamagic option has double range (touch becomes 30 ft).',
        flags: {cat: {embeddedMacros: [
            H.entry('Distant done', 'roll', 'actorRollFinished', 70, onDone),
            H.entry('Distant restore', 'effect', 'deleted', 50, onGone)]}}
    }, P);
    if (await H.primeOnly(me)) return;
    const spells = H.castable(me).filter(H.ranged);
    if (!spells.length) return H.refund(me, workflow, P, 'no castable spells have a range of 5 ft or more, or touch.');
    const spell = await H.pick(title, 'Distant which spell? Its range doubles (touch becomes 30 ft).', spells);
    if (!spell) return H.refund(me, workflow, P, 'no spell chosen.');
    await H.cast(me, spell);
};

// ---- Empowered Spell (rider: click before the spell) ----------------------
const empowered = async () => {
    const me = workflow.actor, title = workflow.item.name, P = H.MM.empowered.id;
    const t = workflow.activity?.consumption?.targets?.find(x => x.type === 'itemUses');
    if (H.getFx(me, P)) {   // clicked twice: keep one, refund this use
        const pts = (t?.target && me.items.get(t.target)) || H.points(me);
        const cost = Number(t?.value ?? 0);
        if (pts && cost && (pts.system.uses?.spent ?? 0) >= cost) await documentUtils.update(pts, {'system.uses.spent': pts.system.uses.spent - cost});
        return ui.notifications.info(title + ' is already waiting for the next damage roll. Sorcery Points refunded.');
    }
    // On the primed effect: roll / actorDamageRoll / 40 (the pass where damage rolls can be edited).
    const onDamage = async () => {
        if (workflow.item?.type !== 'spell' || !(workflow.damageRolls?.length)) return;
        const primed = document;
        const caster = workflow.actor;
        const n = Math.max(1, caster.system.abilities.cha.mod);
        const dice = [];
        for (const r of workflow.damageRolls) for (const term of r.terms ?? []) {
            if (!term.faces || !Array.isArray(term.results)) continue;
            for (const res of term.results) if (res.active !== false && !res.discarded) dice.push({r, term, res, gap: (term.faces + 1) / 2 - res.result});
        }
        await documentUtils.update(primed, {'flags.world.nixEmpowered.used': true});
        await documentUtils.deleteDocument(primed);
        // Reroll the dice furthest below average, up to Cha mod. New rolls stand.
        const low = dice.filter(d => d.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, n);
        if (!low.length) return H.chat(caster, '<b>Empowered Spell:</b> every die of ' + workflow.item.name + ' is already average or better; nothing rerolled.');
        const lines = [];
        for (const d of low) {
            const before = d.res.result;
            d.res.result = Math.ceil(CONFIG.Dice.randomUniform() * d.term.faces);
            lines.push('d' + d.term.faces + ' ' + before + ' &rarr; ' + d.res.result);
        }
        for (const r of new Set(low.map(d => d.r))) r._total = r._evaluateTotal();
        await workflow.setDamageRolls(workflow.damageRolls);
        await H.chat(caster, '<b>Empowered Spell:</b> ' + workflow.item.name + ' rerolls ' + low.length + ' ' + (low.length === 1 ? 'die' : 'dice') + ': ' + lines.join(', ') + '.');
    };
    // effect / deleted: unused = refunded.
    const onGone = async () => {
        const e = document;
        const f = e.flags.world?.nixEmpowered;
        if (!f || f.used || !f.cost) return;
        const a = e.parent;
        const pts = (f.pointsId && a?.items?.get(f.pointsId)) || H.points(a);
        if (pts && (pts.system.uses?.spent ?? 0) >= f.cost) await documentUtils.update(pts, {'system.uses.spent': pts.system.uses.spent - f.cost});
        await H.chat(a, '<b>Empowered Spell</b> wasn\'t used: ' + f.cost + ' Sorcery Point' + (f.cost > 1 ? 's' : '') + ' refunded.');
    };
    await H.makeEffect(me, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        description: 'The next spell that rolls damage rerolls up to ' + Math.max(1, me.system.abilities.cha.mod)
            + ' of its lowest dice. Works alongside another Metamagic option. Delete this effect to cancel (points refunded).',
        flags: {world: {nixEmpowered: {cost: Number(t?.value ?? 0), pointsId: t?.target || null}},
            cat: {embeddedMacros: [
                H.entry('Empowered damage', 'roll', 'actorDamageRoll', 40, onDamage),
                H.entry('Empowered refund', 'effect', 'deleted', 50, onGone)]}}
    }, P);
    if (me.getFlag('world', 'nixMetamagicPrimeOnly')) await me.unsetFlag('world', 'nixMetamagicPrimeOnly');
    await H.chat(me, '<b>Empowered Spell:</b> the next spell ' + me.name + ' casts that rolls damage is empowered.');
};

// ---- Extended Spell (Akira's v14 duration doubling) --------------------------
const extended = async () => {
    const me = workflow.actor, title = workflow.item.name, P = H.MM.extended.id;
    const old = H.getFx(me, P);
    if (old) await documentUtils.deleteDocument(old);
    // On the primed effect: roll / actorRollFinished / 60. Next spell lasting 1 minute or
    // more: duration x2 (max 24 h), advantage on Con saves to keep concentrating on it.
    const onDone = async () => {
        if (workflow.item?.type !== 'spell' || !H.lasting(workflow.item)) return;
        const primed = document;
        const want = primed.flags.world?.nixExtended?.spellId;
        if (want && workflow.item.id !== want) return;
        await documentUtils.deleteDocument(primed);
        await genericUtils.sleep(800);
        const spellUuid = workflow.item.uuid;
        const CAP = {seconds: 86400, minutes: 1440, hours: 24, rounds: 14400, turns: 14400, days: 1};
        const tokens = new Set([...(workflow.targets ?? []), workflow.token].filter(Boolean));
        const docs = [];
        for (const tk of tokens) for (const e of tk.actor?.effects ?? []) if (e.origin === spellUuid || String(e.origin ?? '').startsWith(spellUuid + '.')) docs.push(e);
        const conc = effectUtils.getConcentrationEffect(workflow.actor, workflow.item);
        if (conc && !docs.includes(conc)) docs.push(conc);
        let n = 0;
        for (const e of docs) {
            const d = e.duration ?? {};
            const v = Number(d.value);
            if (!(v > 0) || !CAP[d.units]) continue;
            await documentUtils.update(e, {'duration.value': Math.min(CAP[d.units], v * 2)});
            n++;
        }
        if (conc) {
            const adv = await H.makeEffect(workflow.actor, {name: 'Extended Spell: steady focus', img: primed.img, origin: primed.origin,
                duration: {value: Math.min(86400, Number(conc.duration?.value) || 60), units: conc.duration?.units ?? 'seconds'},
                system: {changes: [{key: 'flags.midi-qol.advantage.concentration', type: 'custom', value: '1', priority: 20}]},
                description: 'Advantage on Constitution saves to maintain concentration on the extended spell.'});
            if (adv) await documentUtils.makeDependent(conc, [adv]);
        }
        await H.chat(workflow.actor, '<b>Extended Spell:</b> ' + workflow.item.name + '\'s duration is doubled' + (n ? '' : ' (no timed effects found to change)')
            + (conc ? ', and ' + workflow.actor.name + ' has Advantage on saves to keep concentrating on it.' : '.'));
    };
    const primed = await H.makeEffect(me, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        description: 'The next spell lasting 1 minute or more has its duration doubled.',
        flags: {world: {nixExtended: {}}, cat: {embeddedMacros: [H.entry('Extended cast', 'roll', 'actorRollFinished', 60, onDone)]}}
    }, P);
    if (await H.primeOnly(me)) return;
    const spells = H.castable(me).filter(s => s.system.level > 0 && H.lasting(s));
    if (!spells.length) return H.refund(me, workflow, P, 'no castable spells last 1 minute or longer.');
    const spell = await H.pick(title, 'Extend which spell? It is cast now; its duration doubles (max 24 hours).', spells);
    if (!spell) return H.refund(me, workflow, P, 'no spell chosen.');
    if (primed) await documentUtils.update(primed, {'flags.world.nixExtended.spellId': spell.id});
    await H.cast(me, spell);
};

// ---- Heightened Spell (Bangiras's v14) ------------------------------------------
const heightened = async () => {
    const me = workflow.actor, title = workflow.item.name, P = H.MM.heightened.id;
    const old = H.getFx(me, P);
    if (old) await documentUtils.deleteDocument(old);
    // On the primed effect: roll / actorPreambleComplete / 40.
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        if (!(workflow.saveActivity || workflow.activity?.type === 'save' || workflow.activity?.save)) return;   // stay primed
        const primed = document;
        const targets = Array.from(workflow.targets ?? []).filter(t => t.actor);
        if (!targets.length) return;
        await documentUtils.deleteDocument(primed);
        let pick = targets[0];
        if (targets.length > 1) {
            const r = await dialogUtils.selectTargetDialog(primed.name,
                'Which target has disadvantage on its saves against ' + workflow.item.name + '?',
                targets.map(t => t.document), {skipDeadAndUnconscious: false, displayDistance: false, userId: H.owner(workflow.actor)});
            pick = H.picked(r)[0];
        }
        if (!pick?.actor) return;
        // On the target's effect. document = that effect.
        const situational = async () => {
            const h = document.flags.world?.heightenedTarget;
            if (!h) return;
            const fromItem = workflowUtils.getSaveSource?.(config)?.item?.uuid;
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
        await H.makeEffect(pick.actor, {
            name: 'Heightened: ' + workflow.item.name, img: primed.img, origin: workflow.item.uuid,
            duration: {value: 60, units: 'seconds'},
            description: 'Disadvantage on saving throws against ' + workflow.item.name + '.',
            flags: {world: {heightenedTarget: {spellUuid: workflow.item.uuid, firstSaveOpen: true}},
                cat: {embeddedMacros: [
                    H.entry('Heightened save', 'save', 'actorSituational', 50, situational),
                    H.entry('Heightened save end', 'save', 'actorPost', 50, post),
                    H.entry('Heightened turn check', 'combat', 'actorTurnEnd', 50, turnEnd)]}}
        }, 'heightenedSpellTarget');
        await H.chat(workflow.actor, '<b>Heightened Spell:</b> ' + pick.document.name + ' has disadvantage on saves against ' + workflow.item.name + '.');
    };
    await H.makeEffect(me, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        description: 'The next spell that forces a saving throw is Heightened.',
        flags: {cat: {embeddedMacros: [H.entry('Heightened cast', 'roll', 'actorPreambleComplete', 40, onCast)]}}
    }, P);
    if (await H.primeOnly(me)) return;
    const spells = H.castable(me).filter(s => H.acts(s).some(a => a.type === 'save'));
    if (!spells.length) return H.refund(me, workflow, P, 'no castable spells force a saving throw.');
    const spell = await H.pick(title, 'Heighten which spell? (Only spells that force a saving throw are listed.)', spells);
    if (!spell) return H.refund(me, workflow, P, 'no spell chosen.');
    await H.cast(me, spell, x => x.type === 'save');
};

// ---- Quickened Spell (Bangiras's v14) ----------------------------------------------
const quickened = async () => {
    const me = workflow.actor, title = workflow.item.name, P = H.MM.quickened.id;
    const old = H.getFx(me, P);
    if (old) await documentUtils.deleteDocument(old);
    // On the primed effect: roll / actorRollFinished / 60.
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
        await H.chat(a, '<b>Quickened Spell:</b> ' + workflow.item.name + ' was cast as a Bonus Action.');
    };
    await H.makeEffect(me, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        description: 'The next 1-action spell takes a Bonus Action instead.',
        flags: {world: {quickened: {actionUsedBefore: !!me.getFlag('midi-qol', 'actions')?.action}},
            cat: {embeddedMacros: [H.entry('Quickened done', 'roll', 'actorRollFinished', 60, onDone)]}}
    }, P);
    if (await H.primeOnly(me)) return;
    const spells = H.castable(me).filter(s => H.actionAct(s));
    if (!spells.length) return H.refund(me, workflow, P, 'no castable 1-action spells.');
    const spell = await H.pick(title, 'Quicken which spell? (Spells that take 1 action. It will take your Bonus Action instead.)', spells);
    if (!spell) return H.refund(me, workflow, P, 'no spell chosen.');
    await H.cast(me, spell, x => x.activation?.type === 'action');
};

// ---- Transmuted Spell -----------------------------------------------------------
const transmuted = async () => {
    const me = workflow.actor, title = workflow.item.name, P = H.MM.transmuted.id;
    const old = H.getFx(me, P);
    if (old) await documentUtils.deleteDocument(old);
    // On the primed effect: roll / actorDamageRoll / 30.
    const onDamage = async () => {
        if (workflow.item?.type !== 'spell') return;
        const rolls = workflow.damageRolls ?? [];
        const hit = rolls.filter(r => H.SIX.includes(r.options?.type));
        if (!hit.length) return;                         // nothing to change: stay primed
        const primed = document;
        await documentUtils.deleteDocument(primed);
        const from = [...new Set(hit.map(r => r.options.type))];
        const label = t => CONFIG.DND5E.damageTypes?.[t]?.label ?? t;
        const buttons = H.SIX.filter(t => !(from.length === 1 && from[0] === t)).map(t => [label(t), t]);
        buttons.push(['Keep ' + from.map(label).join(' / '), false]);
        const to = await dialogUtils.buttonDialog(primed.name,
            'Transmuted Spell: change the ' + from.map(label).join(' / ') + ' damage of ' + workflow.item.name + ' to:', buttons,
            {userId: H.owner(workflow.actor)});
        if (!to) return;
        for (const r of hit) {
            r.options.type = to;
            for (const term of r.terms) if (term.options && 'flavor' in term.options) term.options.flavor = to;
        }
        await workflow.setDamageRolls(rolls);
        await H.chat(workflow.actor, '<b>Transmuted Spell:</b> ' + workflow.item.name + ' deals ' + label(to) + ' damage.');
    };
    await H.makeEffect(me, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        description: 'The next spell dealing acid, cold, fire, lightning, poison or thunder damage can change it to another of those types.',
        flags: {cat: {embeddedMacros: [H.entry('Transmuted damage', 'roll', 'actorDamageRoll', 30, onDamage)]}}
    }, P);
    if (await H.primeOnly(me)) return;
    const spells = H.castable(me).filter(s => [...H.damageTypes(s)].some(t => H.SIX.includes(t)));
    if (!spells.length) return H.refund(me, workflow, P, 'no castable spells deal acid, cold, fire, lightning, poison or thunder damage.');
    const spell = await H.pick(title, 'Transmute which spell? You choose the new damage type when it rolls damage.', spells);
    if (!spell) return H.refund(me, workflow, P, 'no spell chosen.');
    await H.cast(me, spell);
};

// ---- Twinned Spell (Bangiras's v14) ----------------------------------------------------
const twinned = async () => {
    const me = workflow.actor, title = workflow.item.name, P = H.MM.twinned.id;
    const old = H.getFx(me, P);
    if (old) await documentUtils.deleteDocument(old);
    // On the primed effect: roll / actorPreambleComplete / 30. workflow.token / workflow.targets
    // are Token placeables; CAT helpers want documents.
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        const primed = document;
        const caster = workflow.token;
        const casterActor = workflow.actor;
        const refundOne = async why => {
            const pts = H.points(casterActor);
            if (pts && (pts.system.uses?.spent ?? 0) > 0) await documentUtils.update(pts, {'system.uses.spent': Math.max(0, pts.system.uses.spent - 1)});
            ui.notifications.info('Twinned Spell: ' + why + ' Sorcery Point refunded.');
        };
        await documentUtils.deleteDocument(primed);
        if (!caster) return refundOne('no token for the caster.');
        const activity = workflow.activity;
        const targets = Array.from(workflow.targets ?? []).filter(t => t.actor);
        if (targets.length < 2) {
            const range = activity?.range ?? {};
            const maxDistance = range.units === 'touch' ? 5 : (Number(range.value) > 0 ? Number(range.value) : Infinity);
            const already = new Set(targets.map(t => t.document.uuid));
            const dist = t => tokenUtils.getDistance(caster.document, t.document);
            const candidates = canvas.tokens.placeables
                .filter(t => t.actor && !already.has(t.document.uuid) && !t.document.hidden && t.id !== caster.id)
                .filter(t => dist(t) <= maxDistance)
                .sort((a, b) => dist(a) - dist(b));
            if (!candidates.length) return refundOne('no second creature within range of ' + workflow.item.name + '.');
            const r = await dialogUtils.selectTargetDialog('Twinned Spell',
                'Only one creature was targeted. Choose the second target for ' + workflow.item.name + '.',
                candidates.map(t => t.document), {skipDeadAndUnconscious: false, coverToken: caster.document, displayDistance: true,
                    userId: H.owner(casterActor)});
            const twin = H.picked(r)[0];
            if (!twin) return refundOne('no second target chosen.');
            workflow.targets.add(twin);
            if (workflow.hitTargets && !activity?.attack) workflow.hitTargets.add(twin);
            twin.setTarget(true, {releaseOthers: false, groupSelection: true});
            targets.push(twin);
        }
        await H.chat(casterActor, '<b>Twinned Spell:</b> ' + workflow.item.name + ' targets <b>'
            + targets.map(t => t.document.name).join('</b> and <b>') + '</b>.');
    };
    await H.makeEffect(me, {
        name: title, img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        description: 'The next spell can target one additional creature.',
        flags: {cat: {embeddedMacros: [H.entry('Twinned cast', 'roll', 'actorPreambleComplete', 30, onCast)]}}
    }, P);
    if (await H.primeOnly(me)) return;
    const spells = H.castable(me).filter(s => s.system.level > 0 && H.twinnable(s));
    if (!spells.length) return H.refund(me, workflow, P, 'no castable spells can be twinned.');
    const spell = await H.pick(title, 'Twin which spell? (Only spells that target an additional creature when upcast. Target both creatures before picking.)', spells);
    if (!spell) return H.refund(me, workflow, P, 'no spell chosen.');
    await H.cast(me, spell);
};

// ===========================================================================
//  SORCERY INCARNATE: second option while Innate Sorcery is active
//  roll / actorRollFinished / 20, on the Sorcery Incarnate item.
// ===========================================================================
const incarnate = async () => {
    const me = workflow.actor;
    const first = workflow.item;
    const firstKey = first?.type === 'feat' ? H.keyOf(first) : null;
    if (!firstKey || firstKey === 'empowered') return;
    if (me.getFlag('world', 'nixMetamagicPrimeOnly')) return;      // this IS the second option
    if (!me.appliedEffects.some(e => /innate sorcery/i.test(e.name))) return;
    const pts = H.points(me);
    const left = pts?.system.uses?.value ?? 0;
    const choices = me.items.filter(i => i.type === 'feat').filter(i => {
        const k = H.keyOf(i);
        return k && k !== firstKey && k !== 'empowered' && H.costOf(i) <= left && !H.getFx(me, H.MM[k].id);
    });
    if (!choices.length) return;
    const second = await dialogUtils.selectDocumentDialog(document.name,
        'Innate Sorcery is active. Add a second Metamagic option to this spell? (' + left + ' Sorcery Points left)',
        choices, {addNoneDocument: true, userId: H.owner(me)});
    if (!second) return;
    const act = H.acts(second)[0];
    if (!act) return ui.notifications.warn('Sorcery Incarnate: ' + second.name + ' has no activity.');
    const id = H.MM[H.keyOf(second)].id;
    await me.setFlag('world', 'nixMetamagicPrimeOnly', true);
    try {
        await act.use({}, {configure: false});
        const start = Date.now();
        while (!H.getFx(me, id) && Date.now() - start < 20000) await genericUtils.sleep(250);
    } finally {
        if (me.getFlag('world', 'nixMetamagicPrimeOnly')) await me.unsetFlag('world', 'nixMetamagicPrimeOnly');
    }
    await H.chat(me, '<b>Sorcery Incarnate:</b> ' + me.name + ' weaves ' + first.name + ' and ' + second.name + ' into one spell.');
};

// ===========================================================================
//  SORCEROUS RESTORATION (Bangiras's v14): rest / actorShort / 50
//  actorShort fires on any rest; a long rest refills the points anyway.
// ===========================================================================
const restoration = async () => {
    if (result?.type === 'long' || result?.longRest) return;
    const feature = document;
    const me = feature.parent;
    if (feature.system.uses?.max && !(feature.system.uses.value > 0)) return;
    const pts = H.points(me);
    if (pts && (pts.system.uses?.spent ?? 0) <= 0) return;   // already full
    const act = H.acts(feature)[0];
    if (!act) return;
    const regain = Math.floor((me.classes?.sorcerer?.system.levels ?? 0) / 2);
    const yes = await dialogUtils.confirm(feature.name,
        'Short rest finished. Use ' + feature.name + ' to regain up to ' + (regain || 'some') + ' Sorcery Points? ('
        + (pts?.system.uses?.value ?? '?') + '/' + (pts?.system.uses?.max ?? '?') + ' now)', {userId: H.owner(me)});
    if (!yes) return;
    await act.use({}, {configure: false});
};

// ===========================================================================
//  INSTALL
// ===========================================================================
const BODIES = {careful, distant, empowered, extended, heightened, quickened, transmuted, twinned};
const OUR_NAMES = /^(Metamagic|Careful Spell|Distant Spell|Empowered Spell|Extended Spell|Heightened Spell|Quickened Spell|Transmuted Spell|Twinned Spell|Sorcery Incarnate|Sorcerous Restoration prompt)$/;
const OLD_MARKERS = ['SpellPrimed', 'nixMetamagicPrimeOnly', 'nixExtendedPrimed', 'nixSorcerer'];
const isOurs = m => OUR_NAMES.test(m?.name ?? '') || OLD_MARKERS.some(k => JSON.stringify(m?.macros ?? m?.macro ?? '').includes(k));
// Replace our CAT macros on an item (others kept).
async function setCat(doc, add) {
    const cur = doc.flags?.cat?.embeddedMacros ?? [];
    await doc.update({'flags.cat.embeddedMacros': cur.filter(m => !isOurs(m)).concat(add)});
}
// Remove the inert v13 copies (CPR1 flag) of our macros.
async function dropOld(doc) {
    const old = doc.flags?.['chris-premades']?.embeddedMacros;
    if (!old?.length) return 0;
    const keep = old.filter(m => !isOurs(m));
    if (keep.length !== old.length) await doc.update({'flags.chris-premades.embeddedMacros': keep});
    return old.length - keep.length;
}
const premadeOn = item => Object.values(item.flags?.cat?.macros ?? {}).flat().some(m => m?.source === 'chris-premades')
    || item.flags?.cat?.automation?.source === 'chris-premades';

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
    await setCat(item, [{name: 'Metamagic', event: 'roll', pass: 'itemRollFinished', macros: [{priority: 50, macro: H.wrap(BODIES[key])}]}]);
    if (await dropOld(item)) notes.push('old v13 copy removed');
    if (premadeOn(item)) notes.push('<b>it also has a Chris\'s Premades 2 automation: set it to None in the Medkit</b>');
    const act = H.acts(item)[0];
    if (!act) notes.push('<b>no activity: add a Utility activity and run again</b>');
    else if (!H.costOf(item)) notes.push('<b>costs nothing: run the Metamagic fix-up</b>');
    report.push('<li>' + item.name + ' (' + H.costOf(item) + ' SP)' + (notes.length ? ': ' + notes.join('; ') : '') + '.</li>');
}
if (!options.length) report.push('<li>No Metamagic options found.</li>');

// ---- 2. Sorcery Incarnate combiner -------------------------------------------
const incarnateItem = actor.items.find(i => /^sorcery incarnate$/i.test(i.name.trim()));
if (pts && (pts.flags?.cat?.embeddedMacros ?? []).some(isOurs)) await setCat(pts, []);      // older placement
if (incarnateItem) {
    await setCat(incarnateItem, [H.entry('Sorcery Incarnate', 'roll', 'actorRollFinished', 20, incarnate)]);
    await dropOld(incarnateItem);
    if (pts) await dropOld(pts);
    report.push('<li>Sorcery Incarnate: with Innate Sorcery active, an option offers a second one for the same spell.</li>');
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
        await main.update({'consumption.targets': [...(main.consumption?.targets ?? []), {type: 'itemUses', target: '', value: '1', scaling: {}}]});
        notes.push('spends a use');
    }
    for (const e of innate.effects) {
        const ch = e.system?.changes ?? [];
        const r = ch.find(c => c.key === 'flags.midi-qol.advantage.attack.rsak');
        if (r && !ch.some(c => c.key === 'flags.midi-qol.advantage.attack.msak')) {
            const {_id, ...copy} = r;
            await e.update({'system.changes': ch.concat([{...copy, key: 'flags.midi-qol.advantage.attack.msak'}])});
            notes.push('advantage on melee spell attacks too (' + e.name + ')');
        }
    }
    if (incarnateItem && pts && main && !H.acts(innate).some(a => /sorcery points/i.test(a.name ?? ''))) {
        const data = main.toObject();
        data._id = 'nixInnateSP00000';
        data.name = 'Innate Sorcery (2 Sorcery Points)';
        data.sort = (data.sort ?? 0) + 1;
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
    await setCat(restore, [H.entry('Sorcerous Restoration prompt', 'rest', 'actorShort', 50, restoration)]);
    await dropOld(restore);
    report.push('<li>Sorcerous Restoration asks after a Short Rest.</li>');
}

// ---- 5. Leftovers from earlier casts ----------------------------------------------
for (const s of actor.items.filter(i => i.getFlag?.('world', 'nixDistantRestore'))) {
    await H.distantRestore(s);
    report.push('<li>' + s.name + ': range put back from an unfinished Distant Spell.</li>');
}

await ChatMessage.create({whisper: [game.user.id], content: '<b>Sorcerer core (2024, v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
