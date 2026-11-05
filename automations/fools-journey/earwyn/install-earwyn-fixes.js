// =====================================================================
//  EARWYN FIXES: one-click INSTALLER (Script macro, run as GM)
//  Select Earwyn's token, then run. Safe to re-run.
//   - Shield Master rebuilt (Shield Bash pop-up + push, Interpose Shield reaction)
//   - Removes the old Shield Bash cantrip, Blessed Warrior and Hex (legacy)
//   - Hellish Rebuke pops up when she takes damage
//   - Adamantine Plate: adamantine weapons can still crit
//   - Trident of the Cobalt Divide: Lightning Conductor on a natural 20; Prone no longer lands on her
//   - Winter's Bane rebuilt: +1, Activation Word (1/LR, +1d6 cold for 1 min), Sleet Storm (1/LR)
// =====================================================================
const SCRIPTS = {
 "BASH_ASK": "await (async () => {\n    const ON_MISS_TOO = false;          // true: offer the bash after any melee attack roll, hit or miss\n    const item = trigger.entity;\n    const actor = workflow.actor;\n    if (workflow.workflowOptions?.nixBash) return;\n    if (workflow.item?.type !== 'weapon' || !workflowUtils.isAttackType(workflow, 'meleeWeaponAttack')) return;\n    if (!actor.items.some(i => i.system.type?.value === 'shield' && i.system.equipped)) return;\n    const pool = ON_MISS_TOO ? workflow.targets : workflow.hitTargets;\n    const me = workflow.token;\n    const target = Array.from(pool ?? []).find(t => t.actor && (t.actor.system.attributes?.hp?.value ?? 1) > 0 && tokenUtils.getDistance(me, t) <= 5);\n    if (!me || !target) return;\n    if (combatUtils.inCombat()) {\n        if (game.combat.combatant?.actor?.id !== actor.id) return;                     // only on her turn\n        const stamp = game.combat.id + ':' + game.combat.round + ':' + game.combat.turn;\n        if (item.getFlag('world', 'nixBashTurn') === stamp) return;                       // once per turn\n        workflow.nixBashStamp = stamp;\n    }\n    const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\n    const yes = await dialogUtils.confirm(item.name + ': Shield Bash',\n        'Bash ' + target.document.name + ' with your shield? It makes a Strength saving throw or is pushed 5 ft away.', {userId});\n    if (!yes) return;\n    if (workflow.nixBashStamp) await item.setFlag('world', 'nixBashTurn', workflow.nixBashStamp);\n    const bash = item.system.activities.find(a => a.name === 'Shield Bash');\n    if (!bash) return;\n    const wf = await workflowUtils.syntheticActivityRoll(bash, [target], {options: {workflowOptions: {nixBash: true}}});\n    // Push 5 ft straight away from her on a failed save (same call Chris's Premades' Thunderous Smite uses).\n    const failed = wf?.failedSaves?.size ? Array.from(wf.failedSaves) : [];\n    for (const t of failed) await tokenUtils.pushToken(me, t, 5);\n    if (failed.length) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),\n        content: '<b>Shield Bash:</b> ' + failed.map(t => t.document.name).join(', ') + ' is shoved 5 ft back.'});\n})();",
 "BASH_ANIM": "await (async () => {\n    if (!globalThis.Sequence || !workflow.token) return;\n    const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };\n    const pick = (list, search) => list.find(ok) ?? (() => { try { const h = (Sequencer.Database.searchFor(search) ?? []).map(x => typeof x === 'string' ? x : x?.dbPath).filter(ok); return h[0]; } catch { return null; } })();\n    const swing = pick(['jb2a.melee_generic.bludgeoning.one_handed', 'jb2a.melee_generic.bludgeoning.two_handed'], 'melee_generic.bludgeoning');\n    const hit = pick(['jb2a.impact.004.blue', 'jb2a.impact.001.blue', 'jb2a.impact.white'], 'impact.0');\n    const seq = new Sequence();\n    for (const t of workflow.targets ?? []) {\n        if (swing) seq.effect().file(swing).atLocation(workflow.token).stretchTo(t);\n        if (hit) seq.effect().file(hit).atLocation(t).scaleToObject(1.5).delay(swing ? 350 : 0);\n    }\n    seq.play();\n})();",
 "INTERPOSE": "await (async () => {\n    const item = trigger.entity;\n    const me = item.actor;\n    if (!ditem || ditem.actorUuid !== me.uuid || !(ditem.totalDamage > 0)) return;\n    const act = workflow.activity;\n    const abil = act?.save?.ability;\n    const dex = abil instanceof Set ? abil.has('dex') : Array.isArray(abil) ? abil.includes('dex') : abil === 'dex';\n    if (!dex || act?.damage?.onSave !== 'half') return;\n    if (!me.items.some(i => i.system.type?.value === 'shield' && i.system.equipped)) return;\n    if (combatUtils.inCombat() && actorUtils.hasUsedReaction(me)) return;\n    const mine = Array.from(workflow.targets ?? []).find(t => t.actor?.uuid === me.uuid);\n    if (!mine) return;\n    // Only on a SUCCESSFUL save: reaction to take no damage instead of half.\n    // A failed save takes full damage as normal; no reaction = normal half damage.\n    if (!workflow.saves?.has(mine)) return;\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const yes = await dialogUtils.confirm(item.name + ': Interpose Shield',\n        'You succeeded on the Dexterity save. Use your reaction to raise your shield and take <b>no damage</b> instead of half (' + ditem.totalDamage + ')?', {userId});\n    if (!yes) return;\n    if (combatUtils.inCombat()) await actorUtils.setReactionUsed(me);\n    workflowUtils.negateDamageItemDamage(ditem);\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>' + item.name + ':</b> ' + me.name + ' interposes her shield and takes no damage.'});\n})();",
 "REBUKE": "await (async () => {\n    const spell = trigger.entity;\n    const me = spell.actor;\n    if (!ditem || ditem.actorUuid !== me.uuid || !(ditem.totalDamage > 0)) return;\n    if (workflow.item?.uuid === spell.uuid) return;\n    const foe = workflow.token;\n    const mine = actorUtils.getFirstToken(me);\n    if (!foe || !mine || !workflow.actor || workflow.actor.uuid === me.uuid) return;\n    if (tokenUtils.getDistance(mine, foe) > 60) return;\n    if (combatUtils.inCombat() && actorUtils.hasUsedReaction(me)) return;\n    if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(s => me.statuses?.has(s))) return;\n    if ((ditem.newHP ?? 1) <= 0) return;\n    const slots = Object.entries(me.system.spells ?? {}).filter(([k, s]) => (s.value ?? 0) > 0 && (s.level ?? 0) >= 1)\n        .sort((a, b) => a[1].level - b[1].level);\n    const free = spell.system.uses?.max && spell.system.uses.value > 0;\n    if (!slots.length && !free) return;\n    const buttons = slots.map(([k, s]) => ['Level ' + s.level + (k === 'pact' ? ' (pact)' : '') + ': ' + s.value + ' left', k]);\n    if (free) buttons.unshift(['Free cast (' + spell.system.uses.value + ' left)', 'free']);\n    buttons.push(['Don\\'t cast', 'none']);\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const pick = await dialogUtils.buttonDialog(spell.name,\n        foe.document.name + ' just damaged you (' + ditem.totalDamage + '). Use your reaction to cast ' + spell.name + ' at it?', buttons, {userId});\n    if (!pick || pick === 'none') return;\n    const activity = spell.system.activities.find(a => a.type === 'save') ?? spell.system.activities.contents[0];\n    if (!activity) return;\n    if (combatUtils.inCombat()) await actorUtils.setReactionUsed(me);\n    setTimeout(() => {\n        const opts = pick === 'free' ? {consumeUsage: true} : {spellSlot: true, config: {spell: {slot: pick}}};\n        workflowUtils.syntheticActivityRoll(activity, [foe], {...opts, userId});\n    }, 300);\n})();",
 "ADAMANTINE": "await (async () => {\n    const plate = trigger.entity;\n    if (!workflow.isCritical || !plate.system.equipped) return;\n    const mine = Array.from(workflow.targets ?? []).find(t => t.actor?.uuid === plate.actor.uuid);\n    if (!mine) return;\n    if (workflow.item?.system?.properties?.has?.('ada')) {\n        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: plate.actor}),\n            content: '<b>' + plate.name + ':</b> the adamantine ' + workflow.item.name + ' bites through. The critical hit stands.'});\n        return;\n    }\n    workflow.isCritical = false;\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: plate.actor}),\n        content: '<b>' + plate.name + ':</b> the critical hit against ' + plate.actor.name + ' becomes a normal hit.'});\n})();",
 "CONDUCTOR": "await (async () => {\n    if (!workflow.hitTargets?.size || !workflow.activity?.hasAttack) return;\n    const d20 = workflow.attackRoll?.dice?.[0];\n    const nat = workflow.diceRoll ?? d20?.results?.find(r => r.active !== false)?.result ?? d20?.total;\n    if (nat !== 20) return;\n    const me = workflow.actor;\n    for (const t of workflow.hitTargets) {\n        if (!t.actor) continue;\n        const old = t.actor.effects.find(e => e.flags?.world?.nixConductor === me.uuid);\n        if (old) await genericUtils.remove(old);\n        await effectUtils.createEffect(t.actor, {\n            name: 'Lightning Conductor', img: 'icons/magic/lightning/bolt-strike-blue.webp', origin: workflow.item.uuid,\n            duration: {rounds: 1, turns: 1},\n            description: 'Vulnerable to Lightning damage until the end of ' + me.name + '\\'s next turn.',\n            changes: [{key: 'system.traits.dv.value', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 'lightning', priority: 20}],\n            flags: {world: {nixConductor: me.uuid}}\n        });\n        if (globalThis.Sequence) {\n            const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };\n            const f = ['jb2a.static_electricity.01.blue', 'jb2a.static_electricity.02.blue'].find(ok);\n            if (f) new Sequence().effect().file(f).atLocation(t).scaleToObject(1.4).duration(3000).fadeOut(500).play();\n        }\n    }\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>Lightning Conductor:</b> natural 20! ' + Array.from(workflow.hitTargets).map(t => t.document.name).join(', ') + ' is vulnerable to Lightning damage until the end of ' + me.name + '\\'s next turn.'});\n})();",
 "BANE_ON": "await (async () => {\n    const actor = workflow.actor;\n    const bane = workflow.item;\n    const old = effectUtils.getEffectByIdentifier(actor, 'nixWintersBane');\n    if (old) await genericUtils.remove(old);\n    await effectUtils.createEffect(actor, {\n        name: bane.name + ': Bitter Frost', img: 'icons/magic/water/snowflake-ice-blue-white.webp', origin: bane.uuid,\n        duration: {seconds: 60, rounds: 10},\n        description: 'Blue runes glow and the blade emits a bitter frost: +1d6 cold damage on melee hits with ' + bane.name + ' for 1 minute.',\n        flags: {\n            world: {nixBaneItem: bane.id},\n            'chris-premades': {embeddedMacros: [\n                {name: 'Bitter Frost damage', type: 'midi-actor', pass: 'damageRollComplete', priority: 100, macro: \"await (async () => {\\n    const id = trigger.entity.flags?.world?.nixBaneItem;\\n    if (!id || workflow.item?.id !== id || !workflow.hitTargets?.size) return;\\n    if (!workflowUtils.isAttackType(workflow, 'meleeAttack')) return;\\n    await workflowUtils.bonusDamage(workflow, '1d6', {damageType: 'cold'});\\n})();\"},\n                {name: 'Bitter Frost glow', type: 'effect', pass: 'created', priority: 50, macro: \"await (async () => {\\n    const actor = trigger.entity.parent;\\n    const token = actorUtils.getFirstToken(actor);\\n    if (!token || !globalThis.Sequence) return;\\n    const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };\\n    const find = (list, search) => list.find(ok) ?? (() => { try { return (Sequencer.Database.searchFor(search) ?? []).map(x => typeof x === 'string' ? x : x?.dbPath).find(ok); } catch { return null; } })();\\n    const burst = find(['jb2a.ice_spikes.radial.burst.white', 'jb2a.impact_themed.ice_shard.blue'], 'ice_spikes');\\n    const aura = find(['jb2a.wind_stream.white', 'jb2a.extras.tmfx.outflow.circle.01'], 'snowflake');\\n    const s = new Sequence();\\n    if (burst) s.effect().file(burst).atLocation(token).scaleToObject(1.8);\\n    if (aura) s.effect().file(aura).attachTo(token).scaleToObject(1.3).opacity(0.55).belowTokens().fadeIn(800).fadeOut(800)\\n        .persist().name('Winters Bane ' + actor.id);\\n    s.play();\\n})();\"},\n                {name: 'Bitter Frost fade', type: 'effect', pass: 'deleted', priority: 50, macro: \"await (async () => {\\n    const actor = trigger.entity.parent;\\n    if (globalThis.Sequencer && actor) await Sequencer.EffectManager.endEffects({name: 'Winters Bane ' + actor.id});\\n})();\"}]}\n        }\n    }, {identifier: 'nixWintersBane'});\n})();",
 "BANE_DAMAGE": "await (async () => {\n    const id = trigger.entity.flags?.world?.nixBaneItem;\n    if (!id || workflow.item?.id !== id || !workflow.hitTargets?.size) return;\n    if (!workflowUtils.isAttackType(workflow, 'meleeAttack')) return;\n    await workflowUtils.bonusDamage(workflow, '1d6', {damageType: 'cold'});\n})();",
 "BANE_GLOW": "await (async () => {\n    const actor = trigger.entity.parent;\n    const token = actorUtils.getFirstToken(actor);\n    if (!token || !globalThis.Sequence) return;\n    const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };\n    const find = (list, search) => list.find(ok) ?? (() => { try { return (Sequencer.Database.searchFor(search) ?? []).map(x => typeof x === 'string' ? x : x?.dbPath).find(ok); } catch { return null; } })();\n    const burst = find(['jb2a.ice_spikes.radial.burst.white', 'jb2a.impact_themed.ice_shard.blue'], 'ice_spikes');\n    const aura = find(['jb2a.wind_stream.white', 'jb2a.extras.tmfx.outflow.circle.01'], 'snowflake');\n    const s = new Sequence();\n    if (burst) s.effect().file(burst).atLocation(token).scaleToObject(1.8);\n    if (aura) s.effect().file(aura).attachTo(token).scaleToObject(1.3).opacity(0.55).belowTokens().fadeIn(800).fadeOut(800)\n        .persist().name('Winters Bane ' + actor.id);\n    s.play();\n})();",
 "BANE_FADE": "await (async () => {\n    const actor = trigger.entity.parent;\n    if (globalThis.Sequencer && actor) await Sequencer.EffectManager.endEffects({name: 'Winters Bane ' + actor.id});\n})();"
};
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Earwyn fixes: select Earwyn\'s token first.');
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
async function hideActivity(item, act, identifier) {
    const ids = foundry.utils.deepClone(item.flags?.['chris-premades']?.activityIdentifiers ?? {});
    ids[identifier] = act.id;
    const hidden = Array.from(new Set([...(item.flags?.['chris-premades']?.hiddenActivities ?? []), identifier]));
    const riders = Array.from(new Set([...(item.flags?.dnd5e?.riders?.activity ?? []), act.id]));
    await item.update({'flags.chris-premades.activityIdentifiers': ids, 'flags.chris-premades.hiddenActivities': hidden, 'flags.dnd5e.riders.activity': riders});
}
const toDelete = [];
 
// ---- 1. Shield Master rebuilt -----------------------------------------------------------------
const sm = find(/^shield master/i);
if (!sm) report.push('<li><b>Shield Master</b> not found.</li>');
else {
    const removed = [];
    for (const a of sm.system.activities.contents) if (a.name !== 'Shield Bash') { removed.push(a.name); await sm.update({['system.activities.-=' + a.id]: null}); }
    const oldFx = sm.effects.filter(e => !e.changes.some(c => /abilities\.\w+\.value/.test(c.key)));   // keep any +1 Str
    if (oldFx.length) await sm.deleteEmbeddedDocuments('ActiveEffect', oldFx.map(e => e.id));
    for (const k of ['embeddedActivityMacros', 'info', 'macros']) if (sm.flags?.['chris-premades']?.[k]) await sm.unsetFlag('chris-premades', k);
    if (sm.flags?.['midi-qol']?.onUseMacroName) await sm.update({'flags.midi-qol.onUseMacroName': ''});
    const bash = await ensureActivity(sm, 'Shield Bash', 'save', {
        img: 'icons/skills/melee/shield-block-bash-blue.webp',
        activation: {type: 'special', value: null, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'ft', value: '5', override: true},
        target: {affects: {type: 'creature', count: '1'}, override: true},
        save: {ability: ['str'], dc: {calculation: 'str', formula: ''}},
        description: {chatFlavor: 'Strength saving throw or be pushed 5 feet away.'}
    });
    await hideActivity(sm, bash, 'nixShieldBash');
    await sm.setFlag('chris-premades', 'embeddedActivityMacros.' + bash.id, [
        {name: 'Shield Bash: animation', type: 'midi-item', pass: 'preambleComplete', priority: 50, macro: SCRIPTS.BASH_ANIM}]);
    await setMacros(sm, ['Shield Bash', 'Interpose Shield'], [
        {name: 'Shield Bash', type: 'midi-actor', pass: 'rollFinished', priority: 60, macro: SCRIPTS.BASH_ASK},
        {name: 'Interpose Shield', type: 'midi-actor', pass: 'targetApplyDamage', priority: 60, macro: SCRIPTS.INTERPOSE}]);
    report.push('<li>Shield Master rebuilt. <b>Shield Bash:</b> once on her turn, after a melee weapon hit on a creature within 5 ft while holding a shield, she\'s asked whether to bash; the target makes a Strength save (DC 8 + Str + proficiency) or is pushed 5 ft. '
        + '<b>Interpose Shield:</b> when she succeeds on a Dex save for half damage while holding a shield, she gets a reaction pop-up to take no damage instead (no reaction = half as normal; a failed save takes full damage).'
        + (removed.length ? ' Old activities removed: ' + removed.join(', ') + '.' : '') + (oldFx.length ? ' Old effects deleted: ' + oldFx.map(e => e.name).join(', ') + '.' : '') + '</li>');
}
 
// ---- 2. Old jury-rigged Shield Bash cantrip ---------------------------------------------------------
const oldBash = actor.items.filter(i => /^shield bash/i.test(i.name.trim()));
if (oldBash.length) { toDelete.push(...oldBash.map(i => i.id)); report.push('<li>Removed the old <b>Shield Bash</b> cantrip (' + oldBash.length + ').</li>'); }
 
// ---- 3. Fighting Style: Blessed Warrior -> she uses Protection ------------------------------------------
const blessed = actor.items.filter(i => /blessed warrior/i.test(i.name));
if (blessed.length) { toDelete.push(...blessed.map(i => i.id)); report.push('<li>Removed <b>Fighting Style: Blessed Warrior</b> (her fighting style is Protection, which stays).</li>'); }
 
// ---- 4. Hex: keep the free cast and the 1st-level spell, remove the legacy copy -----------------------------
const hexes = actor.items.filter(i => i.type === 'spell' && /^hex\b/i.test(i.name.trim()));
const legacy = hexes.filter(i => /legacy/i.test(i.name) || i.system.source?.rules === '2014');
const keepHex = hexes.filter(i => !legacy.includes(i));
if (legacy.length && keepHex.length) { toDelete.push(...legacy.map(i => i.id)); report.push('<li>Removed <b>Hex (legacy)</b> (' + legacy.length + '); kept ' + keepHex.length + ' Hex (free cast + 1st level).</li>'); }
else if (legacy.length) report.push('<li>Hex: only the legacy copy exists, so it was left in place.</li>');
 
// ---- 5. Hellish Rebuke: pop-up when she takes damage ----------------------------------------------------------
const rebuke = actor.items.find(i => i.type === 'spell' && /^hellish rebuke/i.test(i.name.trim()));
if (!rebuke) report.push('<li><b>Hellish Rebuke</b> not found.</li>');
else {
    await setMacros(rebuke, ['Hellish Rebuke prompt'], [{name: 'Hellish Rebuke prompt', type: 'midi-actor', pass: 'targetApplyDamage', priority: 250, macro: SCRIPTS.REBUKE}]);
    report.push('<li>Hellish Rebuke: when a creature within 60 ft damages her and her reaction is free, she\'s asked which spell slot to use (or not to cast); it then fires at that creature.</li>');
}
 
// ---- 6. Adamantine Plate: adamantine weapons can still crit ---------------------------------------------------
const plate = find(/adamantine/i);
if (!plate) report.push('<li><b>Adamantine Plate</b> not found.</li>');
else {
    let stripped = 0;
    for (const e of plate.effects) {
        const keep = e.changes.filter(c => !/critical/i.test(c.key));
        if (keep.length !== e.changes.length) { stripped += e.changes.length - keep.length; await e.update({changes: keep}); }
    }
    await setMacros(plate, ['Adamantine crits'], [{name: 'Adamantine crits', type: 'midi-actor', pass: 'targetAttackRollComplete', priority: 100, macro: SCRIPTS.ADAMANTINE}]);
    report.push('<li>Adamantine Plate: critical hits against her become normal hits, unless the weapon has the Adamantine property.' + (stripped ? ' (Replaced ' + stripped + ' old critical-immunity setting' + (stripped > 1 ? 's' : '') + '.)' : '') + '</li>');
}
 
// ---- 7. Trident of the Cobalt Divide ---------------------------------------------------------------
const trident = find(/cobalt divide/i);
if (!trident) report.push('<li><b>Trident of the Cobalt Divide</b> not found.</li>');
else {
    // Its Prone effect was set to apply to the wielder: make it a target-only effect.
    const proneFx = trident.effects.filter(e => e.transfer && (e.statuses?.has('prone') || /prone/i.test(e.name)));
    for (const e of proneFx) await e.update({transfer: false});
    const stuck = actor.effects.filter(e => (e.statuses?.has('prone') || /prone/i.test(e.name)) && e.origin?.includes(trident.id));
    if (stuck.length) await actor.deleteEmbeddedDocuments('ActiveEffect', stuck.map(e => e.id));
    await setMacros(trident, ['Lightning Conductor'], [{name: 'Lightning Conductor', type: 'midi-item', pass: 'rollFinished', priority: 60, macro: SCRIPTS.CONDUCTOR}]);
    report.push('<li>Trident: a natural 20 that hits makes the target vulnerable to Lightning damage until the end of her next turn.'
        + (proneFx.length ? ' Its Prone effect no longer applies to Earwyn herself (only to targets).' : '') + '</li>');
}
 
// ---- 8. Winter's Bane rebuilt --------------------------------------------------------------------------
const bane = find(/winter'?s bane/i);
if (!bane) report.push('<li><b>Winter\'s Bane</b> not found.</li>');
else {
    const keepAttack = bane.system.activities.contents.find(a => a.type === 'attack');
    const removed = [];
    for (const a of bane.system.activities.contents) if (a.id !== keepAttack?.id && !['Speak the Activation Word', 'Cast Sleet Storm'].includes(a.name)) { removed.push(a.name); await bane.update({['system.activities.-=' + a.id]: null}); }
    const oldFx = bane.effects.contents.slice();
    if (oldFx.length) await bane.deleteEmbeddedDocuments('ActiveEffect', oldFx.map(e => e.id));
    for (const k of ['embeddedMacros', 'embeddedActivityMacros']) if (bane.flags?.['chris-premades']?.[k]) await bane.unsetFlag('chris-premades', k);
    if (bane.flags?.['midi-qol']?.onUseMacroName) await bane.update({'flags.midi-qol.onUseMacroName': ''});
    const props = new Set(bane.system.properties ?? []); props.add('mgc');
    await bane.update({'system.magicalBonus': 1, 'system.properties': Array.from(props), 'system.attunement': bane.system.attunement || 'required'});
    // The attack must not spend anything (an item-uses cost here is what popped up the usage window on every swing).
    if (keepAttack) await keepAttack.update({activation: {type: 'action', value: 1, override: false},
        consumption: {targets: [], scaling: {allowed: false}, spellSlot: false}, uses: {max: '', spent: 0, recovery: []}});
    // Item-level uses aren't needed: the two powers track their own 1/long rest uses.
    await bane.update({'system.uses': {max: '', spent: 0, recovery: []}});
    const word = await ensureActivity(bane, 'Speak the Activation Word', 'utility', {
        img: 'icons/magic/water/snowflake-ice-blue-white.webp',
        activation: {type: 'bonus', value: 1, override: true},
        consumption: {targets: [{type: 'activityUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}},
        uses: {max: '1', spent: 0, recovery: [{period: 'lr', type: 'recoverAll'}]},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        duration: {value: '1', units: 'minute', override: true},
        description: {chatFlavor: 'Blue runes glow and the blade emits a bitter frost: +1d6 cold on melee hits for 1 minute.'}});
    await bane.setFlag('chris-premades', 'embeddedActivityMacros.' + word.id, [
        {name: 'Bitter Frost', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.BANE_ON}]);
    // Sleet Storm: find the spell in the compendiums (2024 version first).
    let sleet = null;
    for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
        const idx = await pack.getIndex({fields: ['type', 'system.source.rules']});
        const hits = idx.filter(e => e.type === 'spell' && /^sleet storm$/i.test(e.name));
        const best = hits.find(e => String(e.system?.source?.rules) === '2024') ?? hits[0];
        if (best && (!sleet || String(best.system?.source?.rules) === '2024')) sleet = best.uuid;
        if (sleet && String(best?.system?.source?.rules) === '2024') break;
    }
    if (sleet) {
        await ensureActivity(bane, 'Cast Sleet Storm', 'cast', {
            img: 'icons/magic/water/snowflake-ice-snow-white.webp',
            activation: {type: 'action', value: 1, override: false},
            consumption: {targets: [{type: 'activityUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}, spellSlot: false},
            uses: {max: '1', spent: 0, recovery: [{period: 'lr', type: 'recoverAll'}]},
            spell: {uuid: sleet, level: 3, challenge: {override: false}, spellbook: true}});
    }
    report.push('<li>Winter\'s Bane rebuilt: +1 magic weapon; attacks no longer ask about the activation word. <b>Speak the Activation Word</b> (Bonus Action, 1/long rest) gives 1 minute of +1d6 cold on melee hits with frost on her token. '
        + (sleet ? '<b>Cast Sleet Storm</b> (1/long rest, no slot).' : '<b>Sleet Storm spell not found in your compendiums</b>: drag Sleet Storm onto a Cast activity by hand.')
        + (removed.length ? ' Removed: ' + removed.join(', ') + '.' : '') + (oldFx.length ? ' Old effects deleted: ' + oldFx.map(e => e.name).join(', ') + '.' : '')
        + (bane.system.attuned ? '' : ' Note: it still needs attunement (her slots are full).') + '</li>');
}
 
if (toDelete.length) await actor.deleteEmbeddedDocuments('Item', [...new Set(toDelete)]);
await ChatMessage.create({whisper: [game.user.id], content: '<b>Earwyn fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 