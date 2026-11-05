// =====================================================================
//  EARWYN FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Earwyn selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros for:
//   - Shield Master: Shield Bash pop-up + 5 ft push (actorRollFinished, slideToken),
//     Interpose Shield (targetDamage)
//   - Hellish Rebuke pop-up when she takes damage (targetDamageComplete)
//   - Adamantine Plate: crits become normal hits unless the weapon is adamantine (targetAttackRoll)
//   - Trident of the Cobalt Divide: Lightning Conductor on a natural 20 (itemRollFinished)
//   - Winter's Bane: Speak the Activation Word (+1d6 cold for 1 minute)
//  The one-time v13 clean-up (old Shield Bash cantrip, Blessed Warrior, Hex legacy,
//  Winter's Bane rebuild) carried over; this only reports if any is back.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Earwyn fixes (v14): select Earwyn\'s token first.');
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
    if (cat.automation?.source) return cat.automation.source;
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
 
// =====================================================================
//  Macros
// =====================================================================
// Shield Master: roll / actorRollFinished / 60. Offer the bash after a melee weapon hit.
const bashAsk = async () => {
    const ON_MISS_TOO = false;
    const feat = document;
    const me = workflow.actor;
    if (workflow.workflowOptions?.nixBash) return;
    if (workflow.item?.type !== 'weapon' || !workflowUtils.isAttackType(workflow, 'meleeWeaponAttack')) return;
    if (!me.items.some(i => i.system.type?.value === 'shield' && i.system.equipped)) return;
    const pool = ON_MISS_TOO ? workflow.targets : workflow.hitTargets;
    const mine = workflow.token;
    if (!mine) return;
    const target = Array.from(pool ?? []).find(t => t.actor && (t.actor.system.attributes?.hp?.value ?? 1) > 0 && tokenUtils.getDistance(mine.document, t.document) <= 5);
    if (!target) return;
    if (game.combat?.started) {
        if (game.combat.combatant?.actor?.id !== me.id) return;
        const stamp = game.combat.id + ':' + game.combat.round + ':' + game.combat.turn;
        if (feat.getFlag('world', 'nixBashTurn') === stamp) return;
        workflow.nixBashStamp = stamp;
    }
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm(feat.name + ': Shield Bash',
        'Bash ' + target.document.name + ' with your shield? It makes a Strength saving throw or is pushed 5 ft away.', {userId});
    if (!yes) return;
    if (workflow.nixBashStamp) await feat.setFlag('world', 'nixBashTurn', workflow.nixBashStamp);
    const bash = feat.system.activities.find(a => a.name === 'Shield Bash');
    if (!bash) return;
    const wf = await workflowUtils.syntheticActivityRoll(bash, [target], {options: {workflowOptions: {nixBash: true}}});
    const failed = wf?.failedSaves?.size ? Array.from(wf.failedSaves) : [];
    for (const t of failed) {
        try { await tokenUtils.slideToken(t.document, {sourceToken: mine.document, distance: 5}); }
        catch (e) { console.warn('Shield Bash: push failed', e); }
    }
    if (failed.length) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>Shield Bash:</b> ' + failed.map(t => t.document.name).join(', ') + ' is shoved 5 ft back.'});
};
// Shield Bash activity: roll / activityPreambleComplete / 50.
const bashAnim = async () => {
    if (!globalThis.Sequence || !workflow.token) return;
    const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
    const pick = (list, search) => list.find(ok) ?? (() => { try { return (Sequencer.Database.searchFor(search) ?? []).map(x => typeof x === 'string' ? x : x?.dbPath).find(ok); } catch { return null; } })();
    const swing = pick(['jb2a.melee_generic.bludgeoning.one_handed', 'jb2a.melee_generic.bludgeoning.two_handed'], 'melee_generic.bludgeoning');
    const hit = pick(['jb2a.impact.004.blue', 'jb2a.impact.001.blue', 'jb2a.impact.white'], 'impact.0');
    const seq = new Sequence();
    for (const t of workflow.targets ?? []) {
        if (swing) seq.effect().file(swing).atLocation(workflow.token).stretchTo(t);
        if (hit) seq.effect().file(hit).atLocation(t).scaleToObject(1.5).delay(swing ? 350 : 0);
    }
    seq.play();
};
// Shield Master: roll / targetDamage / 60 (damage still editable). No damage on a successful Dex save.
const interpose = async () => {
    const feat = document;
    const me = feat.parent;
    if (!ditem || ditem.actorUuid !== me.uuid || !(ditem.totalDamage > 0)) return;
    const act = workflow.activity;
    const abil = act?.save?.ability;
    const dex = abil instanceof Set ? abil.has('dex') : Array.isArray(abil) ? abil.includes('dex') : abil === 'dex';
    if (!dex || act?.damage?.onSave !== 'half') return;
    if (!me.items.some(i => i.system.type?.value === 'shield' && i.system.equipped)) return;
    const inCombat = !!game.combat?.started;
    if (inCombat && actorUtils.hasUsedReaction(me)) return;
    const mine = Array.from(workflow.targets ?? []).find(t => t.actor?.uuid === me.uuid);
    if (!mine || !workflow.saves?.has(mine)) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm(feat.name + ': Interpose Shield',
        'You succeeded on the Dexterity save. Use your reaction to raise your shield and take <b>no damage</b> instead of half (' + ditem.totalDamage + ')?', {userId});
    if (!yes) return;
    if (inCombat) await actorUtils.setReactionUsed(me);
    workflowUtils.negateDamageItemDamage(ditem);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + feat.name + ':</b> ' + me.name + ' interposes her shield and takes no damage.'});
};
// Hellish Rebuke spell: roll / targetDamageComplete / 250.
const rebuke = async () => {
    const spell = document;
    const me = spell.parent;
    if (!ditem || ditem.actorUuid !== me.uuid || !(ditem.totalDamage > 0)) return;
    if (workflow.item?.uuid === spell.uuid) return;
    const foe = workflow.token;
    const mine = actorUtils.getFirstToken(me);
    if (!foe || !mine || !workflow.actor || workflow.actor.uuid === me.uuid) return;
    if (tokenUtils.getDistance(mine, foe.document) > 60) return;
    const inCombat = !!game.combat?.started;
    if (inCombat && actorUtils.hasUsedReaction(me)) return;
    if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(s => me.statuses?.has(s))) return;
    if ((ditem.newHP ?? 1) <= 0) return;
    const slots = Object.entries(me.system.spells ?? {}).filter(([k, s]) => (s.value ?? 0) > 0 && (s.level ?? 0) >= 1)
        .sort((a, b) => a[1].level - b[1].level);
    const free = spell.system.uses?.max && spell.system.uses.value > 0;
    if (!slots.length && !free) return;
    const buttons = slots.map(([k, s]) => ['Level ' + s.level + (k === 'pact' ? ' (pact)' : '') + ': ' + s.value + ' left', k]);
    if (free) buttons.unshift(['Free cast (' + spell.system.uses.value + ' left)', 'free']);
    buttons.push(['Don\'t cast', 'none']);
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const pick = await dialogUtils.buttonDialog(spell.name,
        foe.document.name + ' just damaged you (' + ditem.totalDamage + '). Use your reaction to cast ' + spell.name + ' at it?', buttons, {userId});
    if (!pick || pick === 'none') return;
    const activity = spell.system.activities.find(a => a.type === 'save') ?? spell.system.activities.contents[0];
    if (!activity) return;
    if (inCombat) await actorUtils.setReactionUsed(me);
    setTimeout(() => {
        const opts = pick === 'free' ? {consumeUsage: true} : {spellSlot: true, config: {spell: {slot: pick}}};
        workflowUtils.syntheticActivityRoll(activity, [foe], {...opts, userId});
    }, 300);
};
// Adamantine Plate: roll / targetAttackRoll / 100 (targetAttackRollComplete is read-only on v14).
const adamantine = async () => {
    const plate = document;
    if (!workflow.isCritical || !plate.system.equipped) return;
    const mine = Array.from(workflow.targets ?? []).find(t => t.actor?.uuid === plate.parent.uuid);
    if (!mine) return;
    if (workflow.item?.system?.properties?.has?.('ada')) {
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: plate.parent}),
            content: '<b>' + plate.name + ':</b> the adamantine ' + workflow.item.name + ' bites through. The critical hit stands.'});
        return;
    }
    workflow.isCritical = false;
    if (workflow.attackRoll?.options) workflow.attackRoll.options.isCritical = false;
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: plate.parent}),
        content: '<b>' + plate.name + ':</b> the critical hit against ' + plate.parent.name + ' becomes a normal hit.'});
};
// Trident: roll / itemRollFinished / 60.
const conductor = async () => {
    if (!workflow.hitTargets?.size || !workflow.activity?.hasAttack) return;
    const d20 = workflow.attackRoll?.dice?.[0];
    const nat = workflow.diceRoll ?? d20?.results?.find(r => r.active !== false)?.result ?? d20?.total;
    if (nat !== 20) return;
    const me = workflow.actor;
    for (const t of workflow.hitTargets) {
        if (!t.actor) continue;
        const old = t.actor.effects.find(e => e.flags?.world?.nixConductor === me.uuid);
        if (old) await documentUtils.deleteDocument(old);
        await effectUtils.createEffects(t.actor, [{
            name: 'Lightning Conductor', img: 'icons/magic/lightning/bolt-strike-blue.webp', origin: workflow.item.uuid,
            duration: {value: 2, units: 'rounds'},
            description: 'Vulnerable to Lightning damage until the end of ' + me.name + '\'s next turn.',
            system: {changes: [{key: 'system.traits.dv.value', type: 'add', value: 'lightning', priority: 20}]},
            flags: {world: {nixConductor: me.uuid}, dae: {specialDuration: ['turnEndSource']}}
        }]);
        if (globalThis.Sequence) {
            const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
            const f = ['jb2a.static_electricity.01.blue', 'jb2a.static_electricity.02.blue'].find(ok);
            if (f) new Sequence().effect().file(f).atLocation(t).scaleToObject(1.4).duration(3000).fadeOut(500).play();
        }
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>Lightning Conductor:</b> natural 20! ' + Array.from(workflow.hitTargets).map(t => t.document.name).join(', ') + ' is vulnerable to Lightning damage until the end of ' + me.name + '\'s next turn.'});
};
// Winter's Bane "Speak the Activation Word": roll / activityRollFinished / 50.
const baneOn = async () => {
    const me = workflow.actor;
    const bane = workflow.item;
    const getFx = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
    const old = getFx(me, 'nixWintersBane');
    if (old) await documentUtils.deleteDocument(old);
    // On the Bitter Frost effect. document = the effect.
    const frost = async () => {
        const id = document.flags?.world?.nixBaneItem;
        if (!id || workflow.item?.id !== id || !workflow.hitTargets?.size) return;
        if (!workflowUtils.isAttackType(workflow, 'meleeAttack')) return;
        await workflowUtils.bonusDamage(workflow, '1d6', {damageType: 'cold'});
    };
    const glow = async () => {
        const holder = document.parent;
        const tok = actorUtils.getFirstToken(holder)?.object;
        if (!tok || !globalThis.Sequence) return;
        const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
        const pick = (list, search) => list.find(ok) ?? (() => { try { return (Sequencer.Database.searchFor(search) ?? []).map(x => typeof x === 'string' ? x : x?.dbPath).find(ok); } catch { return null; } })();
        const burst = pick(['jb2a.ice_spikes.radial.burst.white', 'jb2a.impact_themed.ice_shard.blue'], 'ice_spikes');
        const aura = pick(['jb2a.wind_stream.white', 'jb2a.extras.tmfx.outflow.circle.01'], 'snowflake');
        const s = new Sequence();
        if (burst) s.effect().file(burst).atLocation(tok).scaleToObject(1.8);
        if (aura) s.effect().file(aura).attachTo(tok).scaleToObject(1.3).opacity(0.55).belowTokens().fadeIn(800).fadeOut(800).persist().name('Winters Bane ' + holder.id);
        s.play();
    };
    const fade = async () => {
        const holder = document.parent;
        if (globalThis.Sequencer && holder) await Sequencer.EffectManager.endEffects({name: 'Winters Bane ' + holder.id});
    };
    const m = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: 'return await (' + fn.toString() + ')();'}]});
    await effectUtils.createEffects(me, [{
        name: bane.name + ': Bitter Frost', img: 'icons/magic/water/snowflake-ice-blue-white.webp', origin: bane.uuid,
        duration: {value: 60, units: 'seconds'},
        description: 'Blue runes glow and the blade emits a bitter frost: +1d6 cold damage on melee hits with ' + bane.name + ' for 1 minute.',
        flags: {
            world: {nixBaneItem: bane.id},
            cat: {identifier: 'nixWintersBane', embeddedMacros: [
                m('Bitter Frost damage', 'roll', 'actorDamageRollBonuses', 100, frost),
                m('Bitter Frost glow', 'effect', 'created', 50, glow),
                m('Bitter Frost fade', 'effect', 'deleted', 50, fade)
            ]}
        }
    }]);
};
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Shield Master -------------------------------------------------------------------------
const sm = find(/^shield master/i);
if (!sm) report.push('<li><b>Shield Master</b> not found.</li>');
else {
    const bash = await ensureActivity(sm, 'Shield Bash', 'save', {
        img: 'icons/skills/melee/shield-block-bash-blue.webp',
        activation: {type: 'special', value: null, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'ft', value: '5', override: true},
        target: {affects: {type: 'creature', count: '1'}, override: true},
        save: {ability: ['str'], dc: {calculation: 'str', formula: ''}}
    });
    // Hidden from the sheet as a dnd5e rider (Chris's Premades 1's hiddenActivities isn't read on v14).
    const riders = Array.from(new Set([...(sm.flags?.dnd5e?.riders?.activity ?? []), bash.id]));
    await sm.update({'flags.dnd5e.riders.activity': riders});
    await setCat(bash, ['Shield Bash: animation'], [entry('Shield Bash: animation', 'roll', 'activityPreambleComplete', 50, bashAnim)]);
    await setCat(sm, ['Shield Bash', 'Interpose Shield'], [
        entry('Shield Bash', 'roll', 'actorRollFinished', 60, bashAsk),
        entry('Interpose Shield', 'roll', 'targetDamage', 60, interpose)]);
    await dropOld(sm, ['Shield Bash', 'Interpose Shield', 'Shield Bash: animation']);
    report.push('<li>Shield Master: <b>Shield Bash</b> pop-up once on her turn after a melee weapon hit (Str save or pushed 5 ft); <b>Interpose Shield</b> reaction for no damage on a successful Dex save.'
        + (sm.flags?.['gambits-premades']?.gpsUuid ? ' <b>Check:</b> Shield Master also carries a Gambit\'s Premades link; if Gambit\'s offers its own Shield Master prompt too, remove the Gambit\'s automation from the item.' : '') + '</li>');
}
 
// ---- 2. Left over from v13 (already removed there) ----------------------------------------------
{
    const back = [...actor.items.filter(i => /^shield bash/i.test(i.name.trim())), ...actor.items.filter(i => /blessed warrior/i.test(i.name)),
        ...actor.items.filter(i => i.type === 'spell' && /^hex\b/i.test(i.name.trim()) && /legacy/i.test(i.name))];
    if (back.length) report.push('<li><i>Delete these (the v13 fixes removed them): ' + back.map(i => i.name).join(', ') + '.</i></li>');
}
 
// ---- 3. Hellish Rebuke --------------------------------------------------------------------------
const rebukeItem = actor.items.find(i => i.type === 'spell' && /^hellish rebuke/i.test(i.name.trim()));
if (!rebukeItem) report.push('<li><b>Hellish Rebuke</b> not found.</li>');
else {
    await setCat(rebukeItem, ['Hellish Rebuke prompt'], [entry('Hellish Rebuke prompt', 'roll', 'targetDamageComplete', 250, rebuke)]);
    await dropOld(rebukeItem, ['Hellish Rebuke prompt']);
    const midiReaction = (rebukeItem.system.activities?.contents ?? []).some(a => /reaction/.test(a.activation?.type ?? ''));
    report.push('<li>Hellish Rebuke: when a creature within 60 ft damages her and her reaction is free, she picks a slot (or no cast) and it fires at that creature.'
        + (midiReaction ? ' <b>Check:</b> its activity is a Reaction, so Midi may also offer it in its own reaction prompt; if both appear, turn one off.' : '') + '</li>');
}
 
// ---- 4. Adamantine Plate ------------------------------------------------------------------------
const plate = find(/adamantine/i);
if (!plate) report.push('<li><b>Adamantine Plate</b> not found.</li>');
else {
    let stripped = 0;
    for (const e of plate.effects) {
        const changes = e.system?.changes ?? [];
        const keep = changes.filter(c => !/critical/i.test(c.key));
        if (keep.length !== changes.length) { stripped += changes.length - keep.length; await e.update({'system.changes': keep}); }
    }
    await setCat(plate, ['Adamantine crits'], [entry('Adamantine crits', 'roll', 'targetAttackRoll', 100, adamantine)]);
    await dropOld(plate, ['Adamantine crits']);
    report.push('<li>Adamantine Plate: critical hits against her become normal hits unless the weapon has the Adamantine property.' + (stripped ? ' (Removed ' + stripped + ' old critical-immunity setting(s).)' : '') + '</li>');
}
 
// ---- 5. Trident of the Cobalt Divide --------------------------------------------------------------
const trident = find(/cobalt divide/i);
if (!trident) report.push('<li><b>Trident of the Cobalt Divide</b> not found.</li>');
else {
    const proneFx = trident.effects.filter(e => e.transfer && (e.statuses?.has('prone') || /prone/i.test(e.name)));
    for (const e of proneFx) await e.update({transfer: false});
    await setCat(trident, ['Lightning Conductor'], [entry('Lightning Conductor', 'roll', 'itemRollFinished', 60, conductor)]);
    await dropOld(trident, ['Lightning Conductor']);
    report.push('<li>Trident: a natural 20 that hits makes the target vulnerable to Lightning until the end of her next turn.' + (proneFx.length ? ' Its Prone effect no longer lands on her.' : '') + '</li>');
}
 
// ---- 6. Winter's Bane ------------------------------------------------------------------------------
const bane = find(/winter'?s bane/i);
if (!bane) report.push('<li><b>Winter\'s Bane</b> not found.</li>');
else {
    const word = actByName(bane, 'Speak the Activation Word');
    if (!word) report.push('<li><b>Winter\'s Bane</b> has no "Speak the Activation Word" activity: run the v13 Earwyn fixes rebuild on v13, or add a Bonus Action Utility activity with that name (1/long rest) and run this again.</li>');
    else {
        await setCat(word, ['Bitter Frost'], [entry('Bitter Frost', 'roll', 'activityRollFinished', 50, baneOn)]);
        await dropOld(bane, ['Bitter Frost']);
        const sleet = actByName(bane, 'Cast Sleet Storm');
        report.push('<li>Winter\'s Bane: <b>Speak the Activation Word</b> gives 1 minute of +1d6 cold on melee hits, with frost on her token.' + (sleet ? ' Cast Sleet Storm unchanged.' : ' <b>No Cast Sleet Storm activity.</b>') + '</li>');
    }
}
 
// ---- 7. What's left -------------------------------------------------------------------------------
{
    const later = [];
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1');
    if (cpr1.length) later.push('Still tagged for Chris\'s Premades 1 (does nothing on v14): ' + cpr1.map(i => i.name).join(', ') + '.');
    const oldAura = actor.effects.filter(e => e.flags?.['chris-premades'] && !e.flags?.cat);
    if (oldAura.length) later.push('Old Chris\'s Premades 1 effect(s) on her: ' + oldAura.map(e => e.name).join(', ') + '. Delete them and use the feature again.');
    const ring = find(/sunken king/i);
    if (ring) later.push('Ring of the Sunken King is its own Nix Fix entry (run it after this).');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Earwyn fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 