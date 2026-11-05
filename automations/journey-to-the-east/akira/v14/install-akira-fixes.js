// =====================================================================
//  AKIRA FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Akira selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros for:
//   - Fount of Sunlight: radiance effect (radiant resistance, light, glow) and the
//     blinding reaction (targetDamageComplete on the effect), ends with concentration
//   - Combat Inspiration: rides on Chris's Premades 2's Bardic Inspiration effect:
//     defense (AC pop-up only when an attack would hit) and offense (damage on a hit)
//   - Metamagic: Extended Spell (duration doubling for v14 {value, units}) + Subtle Spell
//   - Spellfire Adept: radiant ignores resistance; "Set your heart ablaze?" Hit Dice bonus
//  Retired on v14 (Chris's Premades 2 does it): Fire Shield, Font of Inspiration,
//  Panini's Life Bond (Find Steed).
//  Removes the inert v13 copies (flags.chris-premades) of these macros.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Akira fixes (v14): select Akira\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
const findAll = re => actor.items.filter(i => re.test(i.name.trim()));
const run = fn => 'return await (' + fn.toString() + ')();';
const entry = (name, event, pass, priority, fn, extra = {}) => ({name, event, pass, macros: [{priority, macro: run(fn), ...extra}]});
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
// Leftovers worth a look: CPR1 tags, duplicate items, v13 effects on the actor.
function whatsLeft(skip = /^$/) {
    const later = [];
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1' && !skip.test(i.name));
    if (cpr1.length) later.push('Still tagged for Chris\'s Premades 1 (does nothing on v14; re-apply in the Medkit if Chris\'s Premades 2 has it): ' + cpr1.map(i => i.name).join(', ') + '.');
    const dupes = Object.entries(actor.items.contents.reduce((m, i) => ((m[i.type + '|' + i.name] = (m[i.type + '|' + i.name] ?? 0) + 1), m), {}))
        .filter(([k, n]) => n > 1 && !k.startsWith('class|')).map(([k, n]) => k.split('|')[1] + ' x' + n);
    if (dupes.length) later.push('Duplicate items (check which to delete; an innate and a prepared copy of a spell can both be right): ' + dupes.join(', ') + '.');
    const legacy = actor.items.filter(i => i.type === 'spell' && /\(legacy\)\s*$/i.test(i.name));
    if (legacy.length) later.push('Legacy (2014) spells still on the sheet: ' + legacy.map(i => i.name).join(', ') + '.');
    const stale = actor.effects.filter(e => e.flags?.['chris-premades'] && !e.flags?.cat && !e.disabled);
    if (stale.length) later.push('Effects on the actor from Chris\'s Premades 1 (inert on v14): ' + stale.map(e => e.name).join(', ') + '. Delete them before testing.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
// =====================================================================
//  Macros
// =====================================================================
 
// ---- Fount of Sunlight -----------------------------------------------------------------------
// On the radiance effect: roll / targetDamageComplete / 300. document = the effect.
const fountReact = async () => {
    const eff = document;
    const me = eff.parent;
    const mine = actorUtils.getFirstToken(me);
    const foe = workflow?.token;
    if (!mine || !foe?.actor || foe.actor.uuid === me.uuid || !ditem) return;
    const dmg = Number(ditem.hpDamage ?? 0) + Number(ditem.tempDamage ?? 0) || Number(ditem.totalDamage ?? 0);
    if (!(dmg > 0)) return;
    if (tokenUtils.getDistance(mine, foe.document) > 60 || !tokenUtils.canSee(mine.object, foe)) return;
    const inCombat = !!game.combat?.started;
    if (inCombat && actorUtils.hasUsedReaction(me)) return;
    if (foe.actor.statuses?.has('blinded')) return;
    setTimeout(async () => {
        const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
        if (!await dialogUtils.confirm(eff.name, foe.document.name + ' just hurt you. Use your reaction to flare with light? (Constitution save or Blinded until the end of your next turn)', {userId})) return;
        if (inCombat) await actorUtils.setReactionUsed(me);
        const spell = await fromUuid(eff.flags?.world?.nixFountSpell ?? eff.origin);
        const acts = spell?.system?.activities?.contents ?? [];
        const act = acts.find(a => a.type === 'save' && /blind/i.test(a.name ?? '')) ?? acts.find(a => a.type === 'save');
        if (act) { await workflowUtils.syntheticActivityRoll(act, [foe]); return; }
        const dc = me.system.attributes?.spell?.dc ?? 13;
        const data = {name: 'Fount of Sunlight: Blinding Flare', type: 'feat', img: eff.img, system: {activities: {nixFountBlind001: {
            _id: 'nixFountBlind001', type: 'save', name: 'Blinding Flare', activation: {type: 'reaction'}, target: {affects: {type: 'creature', count: '1'}},
            save: {ability: ['con'], dc: {calculation: '', formula: String(dc)}}, effects: [{_id: 'nixFountBlindEf1'}]}}},
            effects: [{_id: 'nixFountBlindEf1', name: 'Blinded by Sunlight', img: 'icons/svg/blind.svg', transfer: false, statuses: ['blinded'],
                duration: {value: 2, units: 'rounds'}, flags: {dae: {specialDuration: ['turnEndSource']}}}]};
        await workflowUtils.syntheticItemDataRoll(data, me, [foe]);
    }, 400);
};
// On the radiance effect: effect / created and deleted. Golden glow on her token.
const fountGlowOn = async () => {
    const eff = document;
    const tok = actorUtils.getFirstToken(eff.parent)?.object;
    if (!tok || !globalThis.Sequencer) return;
    const pick = l => l.find(f => { try { return Sequencer.Database.entryExists(f); } catch { return false; } });
    const glow = pick(['jb2a.bless.400px.loop.yellow', 'jb2a.bless.200px.loop.yellow', 'jb2a.token_border.circle.static.orange.004']);
    const flash = pick(['jb2a.divine_smite.caster.yellowwhite', 'jb2a.bless.400px.intro.yellow']);
    const seq = new Sequence();
    if (flash) seq.effect().file(flash).atLocation(tok).scaleToObject(2.2);
    if (glow) seq.effect().file(glow).attachTo(tok).belowTokens().scaleToObject(2).opacity(0.75).fadeIn(500).fadeOut(500).persist().name('Fount ' + eff.parent.id);
    await seq.play();
};
const fountGlowOff = async () => {
    if (!globalThis.Sequencer) return;
    await Sequencer.EffectManager.endEffects({name: 'Fount ' + document.parent.id});
};
// On the "Cast Spell" activity: roll / activityRollFinished / 60.
const fountCast = async () => {
    const me = workflow.actor;
    const spell = workflow.item;
    const ID = 'nixFountRadiance';
    const old = actorUtils.getEffectByIdentifier(me, ID);
    if (old) await documentUtils.deleteDocument(old);
    const code = spell.flags?.world?.nixFount;
    if (!code) return;
    const [eff] = await effectUtils.createEffects(me, [{
        name: spell.name + ': Radiance', img: spell.img, origin: spell.uuid, duration: {value: 60, units: 'seconds'},
        description: 'Resistance to radiant damage. Bright light 20 ft, dim light 20 ft beyond. Reaction when damaged by a creature within 60 ft: Constitution save or Blinded until the end of your next turn.',
        system: {changes: [
            {key: 'system.traits.dr.value', type: 'add', value: 'radiant', priority: 20},
            {key: 'token.light.bright', type: 'upgrade', value: '20', priority: 20},
            {key: 'token.light.dim', type: 'upgrade', value: '40', priority: 20}]},
        flags: {world: {nixFountSpell: spell.uuid}, cat: {identifier: ID, embeddedMacros: [
            {name: 'Fount: blinding reaction', event: 'roll', pass: 'targetDamageComplete', macros: [{priority: 300, macro: code.react}]},
            {name: 'Fount: glow on', event: 'effect', pass: 'created', macros: [{priority: 50, macro: code.on}]},
            {name: 'Fount: glow off', event: 'effect', pass: 'deleted', macros: [{priority: 50, macro: code.off}]}]}}
    }]) ?? [];
    const conc = effectUtils.getConcentrationEffect(me, spell);
    if (eff && conc) await documentUtils.makeDependent(conc, [eff]);
};
 
// ---- Combat Inspiration (on Bardic Inspiration's effect; Chris's Premades 2 copies it to the ally) ----
// Defense: roll / targetAttackRollBonuses / 50. Only when the attack would hit and the die could stop it.
const ciDefense = async () => {
    const effect = document;
    const me = effect.parent;
    if (!me || !workflow?.attackRoll || workflow.isCritical || workflow.isFumble) return;
    if (effect.flags?.world?.nixBardicOwner === me.uuid) return;
    if (!Array.from(workflow.targets ?? []).some(t => t.actor?.uuid === me.uuid)) return;
    const raw = effect.flags?.['chris-premades']?.bardicInspiration;
    const origin = effect.origin ? fromUuidSync(effect.origin, {strict: false}) : null;
    const bard = origin?.actor ?? origin?.parent?.actor ?? null;
    if (bard && !bard.items.some(i => /^combat inspiration/i.test(i.name.trim()))) return;
    const scale = Object.values(bard?.system?.scale?.bard ?? {}).find(v => v?.formula || v?.die);
    const formula = (typeof raw === 'string' ? raw : raw?.formula) || scale?.formula || scale?.die || '1d8';
    const ac = Number(me.system.attributes?.ac?.value ?? 10);
    const total = Number(workflow.attackTotal ?? workflow.attackRoll.total);
    if (total < ac) return;
    const max = (await new Roll(formula).evaluate({maximize: true})).total;
    if (ac + max <= total) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm('Combat Inspiration', (workflow.token?.document.name ?? 'The') + '\'s attack (' + total
        + ') is about to hit you (AC ' + ac + '). Roll your Bardic Inspiration (' + formula + ') and add it to your AC?', {userId});
    if (!yes) return;
    const roll = await new Roll(formula).evaluate();
    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: 'Combat Inspiration: +' + roll.total + ' AC against this attack'});
    await effectUtils.createEffects(me, [{name: 'Combat Inspiration: Defense', img: effect.img, origin: effect.origin, duration: {value: 1, units: 'rounds'},
        system: {changes: [{key: 'system.attributes.ac.bonus', type: 'add', value: '+' + roll.total, priority: 20}]},
        flags: {dae: {specialDuration: ['isAttacked']}}}]);
    await documentUtils.deleteDocument(effect);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Combat Inspiration:</b> ' + me.name + '\'s AC is ' + (ac + roll.total)
        + ' against this attack (' + (ac + roll.total > total ? 'it misses!' : 'it still hits') + ').'});
};
// Offense: roll / actorDamageRollBonuses / 50. The ally hits with an attack: add the die to the damage?
const ciOffense = async () => {
    const effect = document;
    const me = effect.parent;
    if (!me || workflow.actor?.uuid !== me.uuid || !workflow.attackRoll || !workflow.hitTargets?.size) return;
    if (effect.flags?.world?.nixBardicOwner === me.uuid) return;
    const raw = effect.flags?.['chris-premades']?.bardicInspiration;
    const origin = effect.origin ? fromUuidSync(effect.origin, {strict: false}) : null;
    const bard = origin?.actor ?? origin?.parent?.actor ?? null;
    if (bard && !bard.items.some(i => /^combat inspiration/i.test(i.name.trim()))) return;
    const scale = Object.values(bard?.system?.scale?.bard ?? {}).find(v => v?.formula || v?.die);
    const formula = (typeof raw === 'string' ? raw : raw?.formula) || scale?.formula || scale?.die || '1d8';
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    if (!await dialogUtils.confirm('Combat Inspiration', 'You hit. Add your Bardic Inspiration (' + formula + ') to the damage?', {userId})) return;
    await workflowUtils.bonusDamage(workflow, formula, {damageType: workflow.defaultDamageType});
    await documentUtils.deleteDocument(effect);
};
 
// ---- Metamagic: Extended / Subtle (item / itemRollFinished / 50) -------------------------------
const castableSpells = (who) => {
    const slots = Object.entries(who.system.spells ?? {})
        .filter(([key, slot]) => (slot?.value ?? 0) > 0)
        .map(([key, slot]) => key === 'pact' ? Number(slot.level ?? 0) : Number(key.replace('spell', '')))
        .filter(n => n > 0);
    const maxSlot = Math.max(0, ...slots);
    const seen = new Set();
    return who.items.filter(s => {
        if (s.type !== 'spell') return false;
        const lvl = s.system.level ?? 0;
        const method = s.system.method ?? s.system.preparation?.mode;
        const prepared = lvl === 0 || ['atwill', 'innate', 'always', 'pact'].includes(method) || s.system.prepared || s.system.preparation?.prepared;
        if (!prepared) return false;
        const ok = lvl === 0 || ['atwill', 'innate'].includes(method)
            || (s.system.uses?.max && (s.system.uses.value ?? 0) > 0 && !['spell', 'prepared'].includes(method))
            || maxSlot >= lvl;
        if (!ok) return false;
        const key = s.name + '|' + lvl;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};
const refundPoint = async (who, wf, why) => {
    const t = wf.activity?.consumption?.targets?.find(x => x.type === 'itemUses');
    const cost = Number(t?.value ?? 1);
    const points = (t?.target && who.items.get(t.target)) ?? who.items.find(i => /^sorcery points$/i.test(i.name.trim()));
    if (points && (points.system.uses?.spent ?? 0) >= cost) await documentUtils.update(points, {'system.uses.spent': points.system.uses.spent - cost});
    ui.notifications.info(wf.item.name + ': ' + why + ' Sorcery Point refunded.');
};
const MM_SHARED = 'const castableSpells = ' + castableSpells.toString() + ';\nconst refundPoint = ' + refundPoint.toString() + ';';
const withMM = fn => 'return await (async () => {\n' + MM_SHARED + '\n    return await (' + fn.toString() + ')();\n})();';
 
// Extended Spell (2024): pick a spell and cast it; its duration doubles (max 24 hours) and she has
// Advantage on Constitution saves to keep concentrating on it.
const extended = async () => {
    const me = workflow.actor;
    const title = workflow.item.name;
    const PRIMED = 'nixExtendedPrimed';
    const old = actorUtils.getEffectByIdentifier(me, PRIMED);
    if (old) await documentUtils.deleteDocument(old);
    const lasts = s => (s.system.activities?.contents ?? []).map(a => a.duration ?? {}).concat([s.system.duration ?? {}])
        .some(d => ['minute', 'hour', 'day'].includes(d.units) || (d.units === 'round' && Number(d.value) >= 10));
    const spells = castableSpells(me).filter(s => s.system.level > 0 && lasts(s))
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
    if (!spells.length) return refundPoint(me, workflow, 'no castable spells last 1 minute or longer.');
    const spell = await dialogUtils.selectDocumentDialog(title, 'Extend which spell? It is cast now; its duration doubles (max 24 hours).', spells, {showSpellLevel: true, addNoneDocument: true});
    if (!spell) return refundPoint(me, workflow, 'no spell chosen.');
    // On the primed effect: roll / actorRollFinished / 60. document = the primed effect.
    const onDone = async () => {
        if (workflow.item?.type !== 'spell') return;
        const primed = document;
        if (workflow.item.id !== primed.flags.world?.nixExtended?.spellId) return;
        await documentUtils.deleteDocument(primed);
        await genericUtils.sleep(800);
        const spellUuid = workflow.item.uuid;
        const CAP = {seconds: 86400, minutes: 1440, hours: 24, rounds: 14400, days: 1};
        const tokens = new Set([...(workflow.targets ?? []), workflow.token].filter(Boolean));
        const docs = [];
        for (const t of tokens) for (const e of t.actor?.effects ?? []) if (e.origin === spellUuid || String(e.origin ?? '').startsWith(spellUuid + '.')) docs.push(e);
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
            const [adv] = await effectUtils.createEffects(workflow.actor, [{name: 'Extended Spell: steady focus', img: primed.img, origin: primed.origin,
                duration: {value: Math.min(86400, Number(conc.duration?.value) || 60), units: conc.duration?.units ?? 'seconds'},
                system: {changes: [{key: 'flags.midi-qol.advantage.concentration', type: 'custom', value: '1', priority: 20}]},
                description: 'Advantage on Constitution saves to maintain concentration on the extended spell.'}]) ?? [];
            if (adv) await documentUtils.makeDependent(conc, [adv]);
        }
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
            content: '<b>Extended Spell:</b> ' + workflow.item.name + '\'s duration is doubled' + (n ? '' : ' (no timed effects found to change)')
                + (conc ? ', and ' + workflow.actor.name + ' has Advantage on saves to keep concentrating on it.' : '.')});
    };
    await effectUtils.createEffects(me, [{name: title + ': primed', img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        flags: {world: {nixExtended: {spellId: spell.id}}, cat: {identifier: PRIMED, embeddedMacros: [
            {name: 'Extended cast', event: 'roll', pass: 'actorRollFinished', macros: [{priority: 60, macro: 'return await (' + onDone.toString() + ')();'}]}]}}}]);
    const act = spell.system.activities.contents[0];
    setTimeout(() => act?.use(), 250);
};
// Subtle Spell (2024): no Verbal, Somatic or Material components; can't be Counterspelled.
const subtle = async () => {
    const me = workflow.actor;
    const PRIMED = 'nixSubtlePrimed';
    const old = actorUtils.getEffectByIdentifier(me, PRIMED);
    if (old) await documentUtils.deleteDocument(old);
    const hasVS = s => { const p = s.system.properties; return p?.has?.('vocal') || p?.has?.('somatic') || p?.has?.('material'); };
    const spells = castableSpells(me).filter(hasVS).sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
    if (!spells.length) return refundPoint(me, workflow, 'no castable spells.');
    const spell = await dialogUtils.selectDocumentDialog('Shhhh... No one will believe you', 'Cast which spell subtly? (no Verbal, Somatic or Material components)', spells, {showSpellLevel: true, addNoneDocument: true});
    if (!spell) return refundPoint(me, workflow, 'no spell chosen.');
    // On the primed effect: roll / actorPreambleComplete / 5 (before Counterspell's 10).
    const onCast = async () => {
        if (workflow.item?.type !== 'spell') return;
        const primed = document;
        if (workflow.item.id !== primed.flags.world?.nixSubtle?.spellId) return;
        workflow.nixSubtle = true;
        await documentUtils.deleteDocument(primed);
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
            content: '<b>Subtle Spell:</b> <i>Shhhh... No one will believe you.</i> ' + workflow.item.name + ' is cast without a word or gesture.'});
    };
    await effectUtils.createEffects(me, [{name: workflow.item.name + ': primed', img: workflow.item.img, origin: workflow.item.uuid, duration: {value: 60, units: 'seconds'},
        flags: {world: {nixSubtle: {spellId: spell.id}}, cat: {identifier: PRIMED, embeddedMacros: [
            {name: 'Subtle cast', event: 'roll', pass: 'actorPreambleComplete', macros: [{priority: 5, macro: 'return await (' + onCast.toString() + ')();'}]}]}}}]);
    const act = spell.system.activities.contents[0];
    setTimeout(() => act?.use(), 250);
};
 
// ---- Spellfire Adept: roll / actorDamageRollBonuses / 300 ---------------------------------------
const spellfire = async () => {
    const feat = document;
    const me = feat.parent;
    if (workflow.actor?.uuid !== me.uuid || !workflow.damageRolls?.length) return;
    if (workflow.workflowOptions?.nixSpellfire) return;
    const isAttack = !!workflow.attackRoll;
    if (isAttack && !workflow.hitTargets?.size) return;
    if (!isAttack && !workflow.targets?.size) return;
    const isRadiant = r => String(r.options?.type ?? '').toLowerCase() === 'radiant'
        || (r.terms ?? []).some(t => /radiant/i.test(String(t.flavor ?? t.options?.flavor ?? '')));
    if (!workflow.damageRolls.some(isRadiant)) return;
    const nat = isAttack ? Number((workflow.attackRoll.terms?.[0]?.results ?? []).find(x => x.active !== false)?.result ?? 0) : 0;
    const nat20 = isAttack && nat === 20;
    const c = game.combat;
    const key = c?.started ? c.id + ':' + c.round + ':' + c.turn : null;
    if (key && feat.flags?.world?.nixSpellfireTurn === key && !nat20) return;
    const left = me.items.filter(i => i.type === 'class').reduce((s, k) => s + (k.system.levels - (k.system.hd?.spent ?? 0)), 0);
    if (!left) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const pick = await dialogUtils.selectHitDie(me, 'Set your heart ablaze?',
        (nat20 ? 'Natural 20! ' : '') + 'Fueled Spellfire: spend up to 2 Hit Dice. They are rolled and added as radiant damage. (Cancel to skip.)', {max: 2, userId});
    const spends = (pick ?? []).filter(s => s.amount > 0);
    if (!spends.length) return;
    for (const s of spends) await documentUtils.update(s.document, {'system.hd.spent': (s.document.system.hd.spent ?? 0) + s.amount});
    const formula = spends.map(s => s.amount + String(s.document.system.hd.denomination).replace(/^\d*/, '')).join(' + ');
    await workflowUtils.bonusDamage(workflow, formula, {damageType: 'radiant'});
    if (key) await feat.setFlag('world', 'nixSpellfireTurn', key);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + feat.name + ':</b> ' + me.name + '\'s heart blazes. '
        + spends.map(s => s.amount + ' ' + s.document.name + ' Hit ' + (s.amount > 1 ? 'Dice' : 'Die')).join(' and ') + ' (' + formula + ') added as radiant damage.'});
};
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Retired: Fire Shield, Font of Inspiration, Life Bond --------------------------------------
{
    const fs = actor.items.find(i => i.type === 'spell' && /^fire shield$/i.test(i.name.trim()));
    const font = find(/^font of inspiration/i);
    const steed = actor.items.find(i => i.type === 'spell' && /^find steed$/i.test(i.name.trim()));
    const say = (it, label) => !it ? null : premadeOn(it) === 'cpr2' ? label + ': Chris\'s Premades 2.' : '<b>' + label + ': apply Chris\'s Premades 2\'s version in the Medkit.</b>';
    const bits = [say(fs, 'Fire Shield'), say(font, 'Font of Inspiration (picks the slot itself)'), say(steed, 'Find Steed (Panini\'s Life Bond)')].filter(Boolean);
    if (bits.length) report.push('<li>' + bits.join(' ') + '</li>');
}
 
// ---- 2. Fount of Sunlight ------------------------------------------------------------------------
{
    const fount = actor.items.find(i => i.type === 'spell' && /^fount of (sun|moon)light/i.test(i.name.trim()));
    if (!fount) report.push('<li><b>Fount of Sunlight</b> not found.</li>');
    else {
        const acts = fount.system.activities.contents;
        const cast = acts.find(a => !/blind/i.test(a.name ?? '') && a.type !== 'save') ?? acts[0];
        await fount.update({'flags.world.nixFount': {react: run(fountReact), on: run(fountGlowOn), off: run(fountGlowOff)}});
        if (cast) await setCat(fount.system.activities.get(cast.id), ['Fount: radiance'], [entry('Fount: radiance', 'roll', 'activityRollFinished', 60, fountCast)]);
        await dropOld(fount, ['Fount: radiance']);
        const atl = fount.effects.filter(e => (e.system?.changes ?? []).some(c => /^ATL\./.test(c.key)));
        report.push('<li>' + fount.name + ': casting it (' + (cast?.name || 'first activity') + ') also gives her <b>Resistance to radiant</b>, <b>bright light 20 ft / dim 20 ft</b> more and a golden glow, all ending with her concentration. '
            + 'When a creature she can see within 60 ft damages her, she is asked to use her reaction: ' + (acts.some(a => a.type === 'save') ? 'the spell\'s own Blinding save' : 'a Constitution save') + ' or Blinded until the end of her next turn.'
            + (atl.length ? ' (The D&D Beyond effect "' + atl.map(e => e.name).join('", "') + '" still uses <code>ATL.*</code> keys; run DAE Migration once, or rely on our light.)' : '') + '</li>');
    }
}
 
// ---- 3. Combat Inspiration (on Bardic Inspiration's effect) ----------------------------------------
{
    const cis = findAll(/^combat inspiration/i);
    const bi = actor.items.find(i => i.type === 'feat' && /^bardic inspiration/i.test(i.name.trim()));
    if (!cis.length) report.push('<li><b>Combat Inspiration</b> not found.</li>');
    else if (!bi) report.push('<li><b>Bardic Inspiration</b> not found.</li>');
    else {
        const src = bi.effects.find(e => /bardic inspiration/i.test(e.name)) ?? bi.effects.contents[0];
        if (!src) report.push('<li><b>Bardic Inspiration</b> has no effect to carry Combat Inspiration. Re-apply Chris\'s Premades 2\'s Bardic Inspiration, then run again.</li>');
        else {
            await setCat(src, ['Combat Inspiration: defense', 'Combat Inspiration: offense'], [
                entry('Combat Inspiration: defense', 'roll', 'targetAttackRollBonuses', 50, ciDefense),
                entry('Combat Inspiration: offense', 'roll', 'actorDamageRollBonuses', 50, ciOffense)]);
            await src.update({'flags.world.nixBardicOwner': actor.uuid});
            await dropOld(src, ['Combat Inspiration: defense']);
            report.push('<li>Combat Inspiration: the Bardic Inspiration die she hands out (Chris\'s Premades 2) now also offers <b>Defense</b> (only when an attack would hit and the die could make it miss) and <b>Offense</b> (add the die to damage after a hit). '
                + (premadeOn(bi) === 'cpr2' ? '' : '<b>Bardic Inspiration is not Chris\'s Premades 2: apply it in the Medkit, then run this again.</b> ')
                + '<i>Re-applying Bardic Inspiration in the Medkit removes this: run Akira fixes again after.</i></li>');
        }
        await dropOld(bi, ['Font of Inspiration: spend a slot']);
        if (cis.length > 1) report.push('<li><i>' + cis.length + ' Combat Inspiration items: delete the extra copy.</i></li>');
    }
}
 
// ---- 4. Metamagic: Extended + Subtle ------------------------------------------------------------
{
    const points = actor.items.find(i => i.type === 'feat' && /^sorcery points$/i.test(i.name.trim()) && i.system.uses?.max) ?? find(/^sorcery points$/i);
    if (!points) report.push('<li><b>Sorcery Points</b> (Metamagic Adept) not found: Extended / Subtle have nothing to spend.</li>');
    const exts = findAll(/(^|: *)extended spell$/i);
    const ext = exts[0];
    const sub = find(/(^|: *)subtle spell$/i);
    for (const [it, fn, label] of [[ext, extended, 'Extended Spell'], [sub, subtle, 'Subtle Spell']]) {
        if (!it) { report.push('<li><b>' + label + '</b> not found.</li>'); continue; }
        let act = it.system.activities.contents[0];
        if (!act) act = await ensureActivity(it, label, 'utility', {activation: {type: 'special', value: null, override: true}});
        if (points) await act.update({'consumption.targets': [{type: 'itemUses', target: points.id, value: '1', scaling: {}}]});
        await setCat(it, [label], [{name: label, event: 'roll', pass: 'itemRollFinished', macros: [{priority: 50, macro: withMM(fn)}]}]);
        await dropOld(it, [label]);
    }
    report.push('<li>Extended Spell: click it, pick from her castable spells that last 1 minute or more, and it is cast at once. Its duration is doubled (max 24 h) and she has Advantage on concentration saves for it. 1 Sorcery Point.'
        + (exts.length > 1 ? ' <i>' + exts.length + ' Extended Spell items: delete the extra (the first one has the macro).</i>' : '') + '</li>');
    report.push('<li>Subtle Spell: the list appears under <i>"Shhhh... No one will believe you"</i>. Cast with no components; it can\'t be Counterspelled (needs the Counterspell world installer). Cancelling either list refunds the point.</li>');
}
 
// ---- 5. Spellfire Adept -----------------------------------------------------------------------
{
    const sf = find(/^spellfire (adept|spark)/i);
    if (!sf) report.push('<li><b>Spellfire Adept</b> not found.</li>');
    else {
        const NAME = 'Searing Spellfire';
        const data = {name: NAME, img: sf.img, transfer: true, disabled: false,
            description: 'Her radiant damage ignores resistance to radiant damage.',
            system: {changes: [{key: 'system.traits.idr.value', type: 'add', value: 'radiant', priority: 20}]}};
        const old = sf.effects.find(e => e.name === NAME);
        if (!old) await sf.createEmbeddedDocuments('ActiveEffect', [data]);
        else if (!(old.system?.changes ?? []).some(c => c.key === 'system.traits.idr.value')) await old.update({system: data.system, disabled: false});
        await setCat(sf, ['Fueled Spellfire'], [entry('Fueled Spellfire', 'roll', 'actorDamageRollBonuses', 300, spellfire)]);
        await dropOld(sf, ['Fueled Spellfire']);
        report.push('<li>Spellfire Adept: radiant damage <b>ignores radiant resistance</b>. When she deals radiant damage she is asked <i>"Set your heart ablaze?"</i> (up to 2 Hit Dice, rolled and added as radiant). Once per turn in combat; a natural 20 radiant attack always asks.</li>');
    }
}
 
// ---- 6. What's left --------------------------------------------------------------------------
whatsLeft(/^(combat inspiration|metamagic|extended spell|subtle spell|sorcery points|spellfire)/i);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Akira fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 