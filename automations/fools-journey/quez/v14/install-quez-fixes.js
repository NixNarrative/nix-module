// =====================================================================
//  QUEZ FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Quez selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros for:
//   - Vitality of the Tree with Demons Rage (Chris's Premades 2 does it for his
//     plain Rage; ours only runs when Demons Rage starts a rage)
//   - Great Weapon Master (2024): Heavy Weapon Mastery + Hew
//   - Sentinel (2024): Guardian reaction + Halt (nearbyRollFinished, enemies within 5 ft)
//   - Chieftain's Fury: Earth Shatter (rage / exhaustion / Small auto-fail / prone) + Fire Strike animation
//   - Javelin of Lightning: Lightning Bolt (attack + line save) with animation
//   - Tina's Gravity Gloves: Bond Weapons + Recall Weapons
//  Demonic Gamble, Blood Price and Blood Restoration are separate Nix Fix entries.
//  Removes the inert v13 copies (flags.chris-premades) of these macros.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Quez fixes (v14): select Quez\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name));
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
 
// =====================================================================
//  Macros
// =====================================================================
// Shared text pasted into macros that need an animation lookup.
const FIND_ANIM = `
    const findAnim = (paths = [], search = []) => {
        if (!globalThis.Sequencer) return null;
        const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
        for (const p of paths) if (ok(p)) return p;
        for (const s of search) {
            let hits = [];
            try { hits = Sequencer.Database.searchFor(s) ?? []; } catch {}
            const flat = hits.map(h => typeof h === 'string' ? h : h?.dbPath ?? h?.name).filter(Boolean).filter(ok);
            if (flat.length) return flat[0];
        }
        return null;
    };`;
const withAnim = fn => 'return await (async () => {' + FIND_ANIM + '\n    return await (' + fn.toString() + ')();\n})();';
const entryAnim = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: withAnim(fn)}]});
 
// ---- Vitality of the Tree (Demons Rage only) ----------------------------------------
// roll / actorPreItemRoll / 10 on the feature: remember which rage effects existed.
const vitalityMark = async () => {
    if (!/demons? rage/i.test(workflow.item?.name ?? '')) return;
    const isRage = e => !e.disabled && (e.flags?.cat?.identifier === 'rage' || e.flags?.['chris-premades']?.info?.identifier === 'rage'
        || /^(rage|raging|demons? rage|demon'?s rage)/i.test(e.name.trim()));
    workflow.nixRageBefore = workflow.actor.effects.filter(isRage).map(e => e.id);
};
// roll / actorRollFinished / 400: a new rage from Demons Rage -> Vitality Surge + Life-Giving Force.
const vitalityAuto = async () => {
    const vitality = document;
    const me = workflow.actor;
    if (!/demons? rage/i.test(workflow.item?.name ?? '') || !Array.isArray(workflow.nixRageBefore)) return;
    const isRage = e => !e.disabled && (e.flags?.cat?.identifier === 'rage' || e.flags?.['chris-premades']?.info?.identifier === 'rage'
        || /^(rage|raging|demons? rage|demon'?s rage)/i.test(e.name.trim()));
    let rage = me.effects.find(e => isRage(e) && !workflow.nixRageBefore.includes(e.id));
    if (!rage) { await genericUtils.sleep(600); rage = me.effects.find(e => isRage(e) && !workflow.nixRageBefore.includes(e.id)); }
    if (!rage) return;
    const level = me.classes?.barbarian?.system.levels ?? 0;
    const temp = me.system.attributes.hp.temp ?? 0;
    if (level > temp) await documentUtils.update(me, {'system.attributes.hp.temp': level});
    const tok = workflow.token ?? actorUtils.getFirstToken(me)?.object;
    const surge = findAnim(['jb2a.healing_generic.burst.greenorange', 'jb2a.healing_generic.burst.green'], ['healing_generic.burst', 'healing_generic']);
    if (surge && tok) new Sequence().effect().file(surge).atLocation(tok).scaleToObject(2).play();
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + vitality.name + ':</b> Vitality Surge. ' + me.name + ' gains ' + level + ' temporary hit points'
            + (level > temp ? '' : ' (already has ' + temp + ', so no change)') + '. At the start of each of his turns while raging he can grant temp HP to a creature within 10 ft.'});
    const list = foundry.utils.deepClone(rage.flags?.cat?.embeddedMacros ?? []).filter(m => !String(m.name).startsWith('Life-Giving Force'));
    const lifeCode = vitality.flags?.world?.nixLifeGiving;
    if (!lifeCode) return;
    list.push({name: 'Life-Giving Force', event: 'combat', pass: 'actorTurnStart', macros: [{priority: 50, macro: lifeCode.turn}]});
    list.push({name: 'Life-Giving Force: fade', event: 'effect', pass: 'deleted', macros: [{priority: 50, macro: lifeCode.fade}]});
    await rage.update({'flags.cat.embeddedMacros': list, 'flags.world.nixVitality': {given: []}});
};
// On the rage effect: combat / actorTurnStart. document = the rage effect.
const lifeGiving = async () => {
    const rage = document;
    const me = rage.parent;
    const mine = actorUtils.getFirstToken(me);
    if (!mine?.object) return;
    const near = canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id && !t.document.hidden
        && t.document.disposition === mine.disposition && tokenUtils.getDistance(mine, t.document) <= 10);
    if (!near.length) return;
    const level = me.classes?.barbarian?.system.levels ?? 0;
    const dice = Number(me.system.scale?.barbarian?.['rage-damage']?.value) || (level >= 16 ? 4 : level >= 9 ? 3 : 2);
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const pick = await dialogUtils.selectTargetDialog('Life-Giving Force',
        'Choose a creature within 10 ft to gain ' + dice + 'd6 temporary hit points (or Cancel).', near.map(t => t.document),
        {skipDeadAndUnconscious: false, coverToken: mine, displayDistance: true, userId});
    const tdoc = pick?.[0]?.document ?? pick?.[0];
    const target = tdoc?.object;
    if (!target?.actor) return;
    const roll = await new Roll(dice + 'd6').evaluate();
    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: 'Life-Giving Force: temporary hit points for ' + target.document.name});
    const cur = target.actor.system.attributes.hp.temp ?? 0;
    if (roll.total > cur) await documentUtils.update(target.actor, {'system.attributes.hp.temp': roll.total});
    const given = (rage.flags?.world?.nixVitality?.given ?? []).filter(g => g.uuid !== target.actor.uuid);
    given.push({uuid: target.actor.uuid, amount: roll.total});
    await rage.setFlag('world', 'nixVitality', {given});
    const beam = findAnim(['jb2a.energy_strands.range.standard.green', 'jb2a.energy_beam.normal.green.01'], ['energy_strands.range', 'energy_beam']);
    const glow = findAnim(['jb2a.healing_generic.200px.green', 'jb2a.healing_generic.burst.green'], ['healing_generic']);
    if (globalThis.Sequence) {
        const seq = new Sequence();
        if (beam) seq.effect().file(beam).atLocation(mine.object).stretchTo(target);
        if (glow) seq.effect().file(glow).atLocation(target).scaleToObject(1.8).delay(beam ? 600 : 0);
        seq.play();
    }
};
// On the rage effect: effect / deleted. Temp HP it gave fade with the rage.
const lifeFade = async () => {
    for (const g of document.flags?.world?.nixVitality?.given ?? []) {
        const a = await fromUuid(g.uuid);
        const temp = a?.system.attributes.hp.temp ?? 0;
        if (temp > 0 && temp <= g.amount) await documentUtils.update(a, {'system.attributes.hp.temp': 0});
    }
};
 
// ---- Great Weapon Master ------------------------------------------------------------
// roll / actorDamageRollBonuses / 250: +PB on a Heavy weapon hit (Attack action, his turn).
const gwmDamage = async () => {
    const me = workflow.actor;
    if (!workflow.hitTargets?.size || workflow.item?.type !== 'weapon' || !workflow.item.system.properties?.has('hev')) return;
    if (workflow.workflowOptions?.nixHew) return;
    if (workflow.activity?.activation?.type && workflow.activity.activation.type !== 'action') return;
    if (game.combat?.started && game.combat.combatant?.actor?.id !== me.id) return;
    const pb = me.system.attributes.prof ?? 0;
    if (pb) await workflowUtils.bonusDamage(workflow, String(pb), {damageType: workflow.defaultDamageType, ignoreCrit: true});
};
// roll / actorRollFinished / 450: Hew after a melee crit or a kill.
const gwmHew = async () => {
    const me = workflow.actor;
    const feat = document;
    if (workflow.item?.type !== 'weapon' || !workflowUtils.isAttackType(workflow, 'meleeWeaponAttack')) return;
    if (workflow.workflowOptions?.nixHew || workflow.workflowOptions?.nixSentinel) return;
    const killed = (workflow.damageList ?? []).some(d => (d.oldHP ?? 0) > 0 && (d.newHP ?? 1) <= 0);
    const crit = workflow.isCritical && workflow.hitTargets?.size;
    if (!killed && !crit) return;
    const inCombat = !!game.combat?.started;
    if (inCombat && MidiQOL.hasUsedBonusAction(me)) return;
    const mine = workflow.token;
    if (!mine) return;
    const reach = workflow.item.system.properties.has('rch') ? 10 : 5;
    const enemies = canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id && !t.document.hidden
        && t.document.disposition !== mine.document.disposition && (t.actor.system.attributes?.hp?.value ?? 1) > 0
        && tokenUtils.getDistance(mine.document, t.document) <= reach);
    if (!enemies.length) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const why = crit ? 'You scored a Critical Hit' : 'You dropped a creature to 0 HP';
    const pick = await dialogUtils.selectTargetDialog(feat.name + ': Hew',
        why + '. Make one attack with ' + workflow.item.name + ' as a Bonus Action? Choose the target (or Cancel).', enemies.map(t => t.document),
        {skipDeadAndUnconscious: false, coverToken: mine.document, displayDistance: true, userId});
    const target = (pick?.[0]?.document ?? pick?.[0])?.object;
    if (!target) return;
    if (inCombat) await MidiQOL.setBonusActionUsed(me);
    const activity = workflow.activity;
    setTimeout(() => workflowUtils.syntheticActivityRoll(activity, [target], {options: {workflowOptions: {nixHew: true}}}), 400);
};
 
// ---- Sentinel: roll / nearbyRollFinished / 50 (enemies within 5 ft, filtered by CAT) ----
const sentinel = async () => {
    const feat = document;
    const me = feat.parent;
    const mine = actorUtils.getFirstToken(me);
    const foe = workflow.token;
    if (!mine || !foe || !workflow.actor || workflow.actor.uuid === me.uuid) return;
    if (!workflow.activity?.hasAttack && !workflowUtils.isAttackType(workflow, 'attack')) return;
    if (foe.document.disposition === mine.disposition) return;
    const others = Array.from(workflow.hitTargets ?? []).filter(t => t.id !== mine.id);
    if (!others.length) return;
    if (tokenUtils.getDistance(mine, foe.document) > 5) return;
    const inCombat = !!game.combat?.started;
    if (inCombat && actorUtils.hasUsedReaction(me)) return;
    if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(s => me.statuses?.has(s))) return;
    let weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack')
        && ['simpleM', 'martialM'].includes(i.system.type?.value));
    if (!weapons.length) weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack'));
    if (!weapons.length) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const text = foe.document.name + ' hit ' + others.map(t => t.document.name).join(', ') + ' right next to you. Use your reaction to make an Opportunity Attack against it?';
    let weapon;
    if (weapons.length === 1) {
        if (!await dialogUtils.confirm(feat.name + ': Guardian', text, {userId})) return;
        weapon = weapons[0];
    } else {
        weapon = await dialogUtils.selectDocumentDialog(feat.name + ': Guardian', text + ' Choose a weapon (or Cancel).', weapons, {userId});
        if (!weapon) return;
    }
    const activity = weapon.system.activities.find(a => a.type === 'attack');
    if (inCombat) await actorUtils.setReactionUsed(me);
    setTimeout(async () => {
        const wf = await workflowUtils.syntheticActivityRoll(activity, [foe], {options: {workflowOptions: {nixSentinel: true}}});
        const hit = wf?.hitTargets?.size ? wf.hitTargets.first() : null;
        if (hit?.actor) await effectUtils.createEffects(hit.actor, [{
            name: 'Sentinel: Halted', img: feat.img, origin: feat.uuid,
            duration: {value: 1, units: 'rounds', expiry: 'turnEnd'},
            description: 'Speed 0 for the rest of the current turn.',
            system: {changes: ['walk', 'fly', 'swim', 'climb', 'burrow'].map(k => ({key: 'system.attributes.movement.' + k, type: 'override', value: '0', priority: 60}))}
        }]);
    }, 300);
};
 
// ---- Chieftain's Fury: Earth Shatter (activity macros) ---------------------------------
// roll / activityPreItemRoll / 20: only while raging; second use costs Exhaustion. true cancels (CAT refunds).
const shatterGate = async () => {
    const me = workflow.actor;
    const isRage = e => !e.disabled && (e.flags?.cat?.identifier === 'rage' || e.flags?.['chris-premades']?.info?.identifier === 'rage'
        || /^(rage|raging|demons? rage|demon'?s rage)/i.test(e.name.trim()));
    const rage = me.effects.find(isRage);
    if (!rage) { ui.notifications.warn(workflow.activity.name + ': only while raging.'); return true; }
    if (rage.flags?.world?.nixShatterUsed) {
        const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
        const yes = await dialogUtils.confirm(workflow.activity.name,
            'You already used ' + workflow.activity.name + ' during this rage. Use it again and gain 1 level of Exhaustion?', {userId});
        if (!yes) return true;
        workflow.nixShatterExhaust = true;
    }
    workflow.nixShatterRage = rage.id;
};
// roll / activityPreambleComplete / 50: ground crack + shake. The area is a Region on v14.
const shatterAnim = async () => {
    if (!globalThis.Sequence) return;
    const area = workflow.template ?? workflow.region ?? null;
    const c = area?.object?.center ?? (area?.bounds ? {x: area.bounds.x + area.bounds.width / 2, y: area.bounds.y + area.bounds.height / 2} : null)
        ?? (Number.isFinite(area?.x) ? {x: area.x, y: area.y} : null);
    const at = c ?? workflow.token;
    const size = (Number(area?.distance) || 15) / canvas.scene.grid.distance;
    const crack = findAnim(['jb2a.impact.ground_crack.orange.02', 'jb2a.impact.ground_crack.orange.01', 'jb2a.impact.ground_crack.01.orange'], ['ground_crack']);
    const boulder = findAnim(['jb2a.impact.boulder.02', 'jb2a.impact.boulder.01'], ['impact.boulder']);
    const dust = findAnim(['jb2a.smoke.puff.ring.01.white.0', 'jb2a.smoke.puff.ring.01.white.1'], ['smoke.puff.ring', 'smoke.puff']);
    const seq = new Sequence();
    if (boulder && workflow.token) seq.effect().file(boulder).atLocation(workflow.token).scaleToObject(1.6);
    if (crack && at) seq.effect().file(crack).atLocation(at).size(size * 1.4, {gridUnits: true}).belowTokens().delay(250).fadeOut(1500);
    if (dust && at) seq.effect().file(dust).atLocation(at).size(size * 1.2, {gridUnits: true}).delay(350);
    try { seq.canvasPan().shake({duration: 900, strength: 6, rotation: false}).delay(250); } catch {}
    seq.play();
};
// roll / activitySavesComplete / 50: Small and Tiny creatures fail.
const shatterSmall = async () => {
    for (const t of Array.from(workflow.saves ?? [])) {
        if (!['tiny', 'sm'].includes(t.actor?.system.traits?.size)) continue;
        workflow.saves.delete(t);
        workflow.superSavers?.delete?.(t);
        workflow.semiSuperSavers?.delete?.(t);
        workflow.failedSaves.add(t);
    }
};
// roll / activityRollFinished / 50: Prone, mark the rage, Exhaustion on a repeat.
const shatterDone = async () => {
    const me = workflow.actor;
    for (const t of workflow.failedSaves ?? []) if (t.actor && !t.actor.statuses?.has('prone')) await t.actor.toggleStatusEffect('prone', {active: true});
    const rage = me.effects.get(workflow.nixShatterRage);
    if (rage) await rage.setFlag('world', 'nixShatterUsed', true);
    if (workflow.nixShatterExhaust) {
        const ex = Math.min(6, (me.system.attributes.exhaustion ?? 0) + 1);
        await documentUtils.update(me, {'system.attributes.exhaustion': ex});
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + workflow.activity.name + ':</b> the strain costs ' + me.name + ' a level of Exhaustion (now ' + ex + ').'});
    }
};
// Fire Strike: roll / activityPreambleComplete / 50.
const fireStrikeAnim = async () => {
    if (!globalThis.Sequence || !workflow.token) return;
    const swing = findAnim(['jb2a.melee_generic.slash.01.orange', 'jb2a.melee_generic.slashing.one_handed'], ['melee_generic.slash']);
    const bolt = findAnim(['jb2a.fire_bolt.orange', 'jb2a.fire_bolt.dark_red'], ['fire_bolt']);
    const boom = findAnim(['jb2a.explosion.01.orange', 'jb2a.explosion.01.dark_red'], ['explosion.01', 'explosion']);
    const seq = new Sequence();
    if (swing) seq.effect().file(swing).atLocation(workflow.token).scaleToObject(2.2);
    for (const t of workflow.targets ?? []) {
        if (bolt) seq.effect().file(bolt).atLocation(workflow.token).stretchTo(t).delay(200);
        if (boom) seq.effect().file(boom).atLocation(t).scaleToObject(1.6).delay(bolt ? 650 : 200);
    }
    seq.play();
};
 
// ---- Javelin of Lightning (activity macros on "Lightning Bolt") --------------------------
const javelinAnim = async () => {
    const target = workflow.targets?.first?.();
    if (!globalThis.Sequence || !workflow.token || !target) return;
    const bolt = findAnim(['jb2a.lightning_bolt.wide.blue', 'jb2a.lightning_bolt.narrow.blue'], ['lightning_bolt.wide', 'lightning_bolt']);
    const strike = findAnim(['jb2a.lightning_strike.blue.0', 'jb2a.lightning_strike.blue'], ['lightning_strike']);
    const seq = new Sequence();
    if (bolt) seq.effect().file(bolt).atLocation(workflow.token).stretchTo(target);
    if (strike) seq.effect().file(strike).atLocation(target).scaleToObject(2).delay(bolt ? 400 : 0);
    seq.play();
};
const javelinLine = async () => {
    const mine = workflow.token;
    const target = workflow.targets?.first?.();
    if (!mine || !target) return;
    const a = mine.center, b = target.center;
    const px = canvas.grid.size / canvas.scene.grid.distance;
    const segDist = (p) => {
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    const inLine = canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id && t.id !== target.id && !t.document.hidden
        && segDist(t.center) <= 2.5 * px + Math.min(t.w, t.h) / 2 - 1);
    if (!inLine.length) return;
    const zap = findAnim(['jb2a.static_electricity.01.blue', 'jb2a.static_electricity.02.blue'], ['static_electricity']);
    if (zap && globalThis.Sequence) { const s = new Sequence(); for (const t of inLine) s.effect().file(zap).atLocation(t).scaleToObject(1.4); s.play(); }
    const line = workflow.item.system.activities.find(x => x.name === 'Lightning Bolt: Line');
    if (line) await workflowUtils.syntheticActivityRoll(line, inLine);
};
 
// ---- Tina's Gravity Gloves ----------------------------------------------------------------
const glovesBond = async () => {
    const gloves = workflow.item;
    const me = workflow.actor;
    const THROW = {value: 20, long: 60};
    if (gloves.system.attunement && !gloves.system.attuned) return ui.notifications.warn(gloves.name + ': attune to the gloves first.');
    const unbond = async (w) => {
        const orig = w.getFlag('world', 'nixGravityOrig');
        if (!orig) return;
        const props = new Set(w.system.properties);
        if (!orig.thrown) props.delete('thr');
        await w.update({'system.properties': Array.from(props), 'system.range.value': orig.value, 'system.range.long': orig.long});
        await w.unsetFlag('world', 'nixGravityOrig');
    };
    const weapons = me.items.filter(i => i.type === 'weapon' && ['simpleM', 'martialM'].includes(i.system.type?.value));
    const current = weapons.filter(w => w.getFlag('world', 'nixGravityOrig'));
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const picked = await dialogUtils.selectDocumentDialog(gloves.name,
        'Bond one Heavy weapon or two other weapons. Bonded weapons can be thrown (' + THROW.value + '/' + THROW.long + ' ft) and recalled as a Bonus Action. Untick to release.',
        weapons, {max: 2, checkbox: true, sortAlphabetical: true, userId});
    if (!picked) return;
    let chosen = (Array.isArray(picked) ? picked : [picked]).filter(p => p && (p.amount === undefined || p.amount)).map(p => p.document ?? p);
    const heavy = chosen.find(w => w.system.properties.has('hev'));
    if (heavy && chosen.length > 1) { ui.notifications.info(gloves.name + ': a Heavy weapon takes both bonds, so only ' + heavy.name + ' is bonded.'); chosen = [heavy]; }
    for (const w of current) if (!chosen.some(c => c.id === w.id)) await unbond(w);
    for (const w of chosen) {
        if (w.getFlag('world', 'nixGravityOrig')) continue;
        await w.setFlag('world', 'nixGravityOrig', {thrown: w.system.properties.has('thr'), value: w.system.range?.value ?? null, long: w.system.range?.long ?? null});
        const props = new Set(w.system.properties); props.add('thr');
        await w.update({'system.properties': Array.from(props),
            'system.range.value': Math.max(Number(w.system.range?.value) || 0, THROW.value), 'system.range.long': Math.max(Number(w.system.range?.long) || 0, THROW.long)});
    }
    await gloves.setFlag('world', 'nixGravityBonded', chosen.map(w => w.id));
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + gloves.name + ':</b> ' + (chosen.length ? 'bonded to ' + chosen.map(w => w.name).join(' and ') + '.' : 'no weapons bonded.')});
};
const glovesRecall = async () => {
    const gloves = workflow.item;
    const me = workflow.actor;
    const ids = gloves.getFlag('world', 'nixGravityBonded') ?? [];
    const names = ids.map(id => me.items.get(id)?.name).filter(Boolean);
    if (!names.length) return ui.notifications.warn(gloves.name + ': no weapons are bonded. Use Bond Weapons first.');
    const tok = workflow.token ?? actorUtils.getFirstToken(me)?.object;
    const pull = findAnim(['jb2a.energy_strands.in.blue.01', 'jb2a.energy_strands.in.purple.01'], ['energy_strands.in', 'energy_strands']);
    if (pull && tok && globalThis.Sequence) new Sequence().effect().file(pull).atLocation(tok).scaleToObject(2).play();
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + gloves.name + ':</b> ' + names.join(' and ') + ' fl' + (names.length > 1 ? 'y' : 'ies') + ' back into ' + me.name + '\'s hands.'});
};
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Vitality of the Tree ---------------------------------------------------------------
const vitality = find(/vitality of the tree/i);
const rageItem = actor.items.find(i => i.type === 'feat' && lc(i.name) === 'rage');
const demonsRage = find(/^demons? rage/i);
if (!vitality) report.push('<li><b>Vitality of the Tree</b> not found.</li>');
else {
    await vitality.update({'flags.world.nixLifeGiving': {turn: withAnim(lifeGiving), fade: run(lifeFade)}});
    if (demonsRage) {
        await setCat(vitality, ['Vitality: mark', 'Vitality: auto'], [
            entry('Vitality: mark', 'roll', 'actorPreItemRoll', 10, vitalityMark),
            entryAnim('Vitality: auto', 'roll', 'actorRollFinished', 400, vitalityAuto)]);
    } else await setCat(vitality, ['Vitality: mark', 'Vitality: auto'], []);
    await dropOld(vitality, ['Vitality: mark', 'Vitality: auto']);
    report.push('<li>Vitality of the Tree: ' + (premadeOn(vitality) === 'cpr2' ? 'Chris\'s Premades 2 handles it for his <b>Rage</b>. ' : '<b>apply Chris\'s Premades 2\'s Vitality of the Tree in the Medkit</b> (for his Rage). ')
        + (demonsRage ? 'Ours covers <b>' + demonsRage.name + '</b>: starting it grants the Vitality Surge temp HP, and Life-Giving Force asks at the start of each of his turns while raging.' : '') + '</li>');
    if (rageItem && premadeOn(rageItem) !== 'cpr2') report.push('<li><b>Rage</b> has no Chris\'s Premades 2 automation: apply it in the Medkit.</li>');
}
if (demonsRage && premadeOn(demonsRage) === 'cpr1') report.push('<li><b>Decide:</b> ' + demonsRage.name + ' is still tagged as Chris\'s Premades 1\'s Rage. On v14 nothing reads that tag, so it no longer adds the Rage damage bonus or the CPR rage behaviour; it only applies its own effects (resistances, Strength advantage). Either start rages with his <b>Rage</b> feature (Chris\'s Premades 2) and use Demons Rage for its demonic options, or add the Rage damage to Demons Rage\'s effect by hand. Don\'t apply Chris\'s Premades 2\'s Rage onto Demons Rage: the Medkit would rebuild its activities and drop Demonic Gamble.</li>');
 
// ---- 2. Great Weapon Master ------------------------------------------------------------------
const gwm = find(/great weapon master/i);
if (!gwm) report.push('<li><b>Great Weapon Master</b> not found.</li>');
else if (premadeOn(gwm) === 'cpr2') {
    await setCat(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew'], []);
    await dropOld(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew']);
    report.push('<li>Great Weapon Master uses Chris\'s Premades 2 (ours removed).</li>');
} else {
    const old = gwm.effects.filter(e => !e.getFlag('world', 'nixKeep') && (e.system?.changes ?? []).some(c => /bonuses|damage/i.test(c.key)) && !e.disabled);
    for (const e of old) await e.update({disabled: true});
    await setCat(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew'], [
        entry('GWM: Heavy Weapon Mastery', 'roll', 'actorDamageRollBonuses', 250, gwmDamage),
        entry('GWM: Hew', 'roll', 'actorRollFinished', 450, gwmHew)]);
    await dropOld(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew']);
    const actorToggle = actor.effects.filter(e => /great weapon master/i.test(e.name));
    report.push('<li>Great Weapon Master: +Proficiency Bonus on Heavy weapon hits (Attack action, his turn); Hew after a melee crit or a kill.'
        + (old.length ? ' Old toggle effect switched off (' + old.map(e => e.name).join(', ') + ').' : '')
        + (actorToggle.length ? ' <b>A "Great Weapon Master" effect is active on him</b> (the old toggle): delete it, or damage gets the bonus twice.' : '') + '</li>');
}
 
// ---- 3. Sentinel ----------------------------------------------------------------------------
const sentinelItem = actor.items.find(i => i.type === 'feat' && /^sentinel\b/i.test(i.name));
if (!sentinelItem) report.push('<li><b>Sentinel</b> not found.</li>');
else {
    await setCat(sentinelItem, ['Sentinel: Guardian'], [entry('Sentinel: Guardian', 'roll', 'nearbyRollFinished', 50, sentinel, {distance: 5, dispositions: 'enemy'})]);
    await dropOld(sentinelItem, ['Sentinel: Guardian']);
    report.push('<li>Sentinel: when an enemy within 5 ft hits someone else, he is asked to use his reaction for an Opportunity Attack; a hit drops its Speed to 0 for the turn.</li>');
}
 
// ---- 4. Chieftain's Fury ----------------------------------------------------------------------
const fury = find(/chieftain'?s fury/i);
if (!fury) report.push('<li><b>Chieftain\'s Fury</b> not found.</li>');
else {
    const shatter = fury.system.activities.contents.find(a => /earth ?shatter/i.test(a.name));
    const fire = fury.system.activities.contents.find(a => /fire ?strike/i.test(a.name));
    if (shatter) {
        await shatter.update({'save.dc': {calculation: 'str', formula: ''},
            'target.template': {count: '1', contiguous: false, type: 'cube', size: '15', width: '', height: '', units: 'ft'}});
        await setCat(fury.system.activities.get(shatter.id), ['Earth Shatter: rage', 'Earth Shatter: animation', 'Earth Shatter: small fail', 'Earth Shatter: result'], [
            entry('Earth Shatter: rage', 'roll', 'activityPreItemRoll', 20, shatterGate),
            entryAnim('Earth Shatter: animation', 'roll', 'activityPreambleComplete', 50, shatterAnim),
            entry('Earth Shatter: small fail', 'roll', 'activitySavesComplete', 50, shatterSmall),
            entry('Earth Shatter: result', 'roll', 'activityRollFinished', 50, shatterDone)]);
        report.push('<li>Earth Shatter: only while raging; first use per rage free, then asks before 1 Exhaustion. 15 ft cube, Str save DC, Small/Tiny fail, failed saves Prone. Animation.</li>');
    } else report.push('<li>Chieftain\'s Fury: no <b>Earth Shatter</b> activity found.</li>');
    if (fire) {
        await setCat(fury.system.activities.get(fire.id), ['Fire Strike: animation'], [entryAnim('Fire Strike: animation', 'roll', 'activityPreambleComplete', 50, fireStrikeAnim)]);
        report.push('<li>Fire Strike: swing, fire bolt and explosion animation.</li>');
    }
    await dropOld(fury, ['Earth Shatter: rage', 'Earth Shatter: animation', 'Earth Shatter: small fail', 'Earth Shatter: result', 'Fire Strike: animation']);
}
 
// ---- 5. Javelin of Lightning --------------------------------------------------------------------
const jav = find(/javelin of lightning/i);
if (!jav) report.push('<li><b>Javelin of Lightning</b> not found.</li>');
else {
    const keep = jav.system.activities.contents.find(a => a.type === 'attack' && !/lightning/i.test(a.name)
        && !(a.damage?.parts ?? []).some(p => [...(p.types ?? [])].includes('lightning')));
    const removed = [];
    for (const a of jav.system.activities.contents) if (a.id !== keep?.id && !['Lightning Bolt', 'Lightning Bolt: Line'].includes(a.name)) { removed.push(a.name); await jav.update({['system.activities.-=' + a.id]: null}); }
    if (!jav.system.uses?.max) await jav.update({'system.uses': {max: '1', spent: 0, recovery: [{period: 'dawn', type: 'recoverAll'}]}});
    const bolt = await ensureActivity(jav, 'Lightning Bolt', 'attack', {
        img: 'icons/magic/lightning/bolt-strike-blue.webp',
        activation: {type: 'action', value: 1, override: true},
        consumption: {targets: [{type: 'itemUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}},
        range: {value: '120', units: 'ft', override: true},
        target: {affects: {type: 'creature', count: '1'}, override: true},
        attack: {type: {value: 'ranged', classification: 'weapon'}},
        damage: {includeBase: true, parts: [{number: 4, denomination: 6, types: ['lightning']}]}
    });
    const line = await ensureActivity(jav, 'Lightning Bolt: Line', 'save', {
        img: 'icons/magic/lightning/bolt-forked-blue.webp',
        activation: {type: 'special', value: null, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        target: {affects: {type: 'creature', count: ''}, override: true},
        save: {ability: ['dex'], dc: {calculation: '', formula: '13'}},
        damage: {onSave: 'half', parts: [{number: 4, denomination: 6, types: ['lightning']}]}
    });
    // Hide the helper: dnd5e riders (Chris's Premades 1's hiddenActivities flag isn't read on v14).
    const riders = Array.from(new Set([...(jav.flags?.dnd5e?.riders?.activity ?? []), line.id]));
    await jav.update({'flags.dnd5e.riders.activity': riders});
    await setCat(bolt, ['Lightning Bolt: animation', 'Lightning Bolt: line'], [
        entryAnim('Lightning Bolt: animation', 'roll', 'activityPreambleComplete', 50, javelinAnim),
        entryAnim('Lightning Bolt: line', 'roll', 'activityRollFinished', 50, javelinLine)]);
    if (jav.flags?.['chris-premades']?.embeddedActivityMacros) await jav.update({'flags.chris-premades.-=embeddedActivityMacros': null});
    report.push('<li>Javelin of Lightning: <b>Lightning Bolt</b> (1/dawn): ranged attack (javelin + 4d6 lightning on a hit) and a DC 13 Dex save for 4d6 lightning on every other creature in the 5-ft line.'
        + (removed.length ? ' Removed old activities: ' + removed.join(', ') + '.' : '')
        + (premadeOn(jav) === 'cpr1' ? ' (It still carries a Chris\'s Premades 1 tag, which does nothing. <b>Don\'t apply a Medkit automation to it</b>: that would wipe these activities.)' : '') + '</li>');
}
 
// ---- 6. Tina's Gravity Gloves --------------------------------------------------------------------
const gloves = find(/gravity gloves/i);
if (!gloves) report.push('<li><b>Tina\'s Gravity Gloves</b> not found.</li>');
else {
    for (const a of gloves.system.activities.contents) if (!['Bond Weapons', 'Recall Weapons'].includes(a.name)) await gloves.update({['system.activities.-=' + a.id]: null});
    if (!gloves.system.attunement) await gloves.update({'system.attunement': 'required'});
    const bond = await ensureActivity(gloves, 'Bond Weapons', 'utility', {
        img: 'icons/magic/control/silhouette-hold-change-blue.webp',
        activation: {type: 'special', value: null, override: true}, consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true}});
    const recall = await ensureActivity(gloves, 'Recall Weapons', 'utility', {
        img: 'icons/magic/movement/pinwheel-turning-blue.webp',
        activation: {type: 'bonus', value: 1, override: true}, consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true}});
    await setCat(bond, ['Gravity Gloves: bond'], [entry('Gravity Gloves: bond', 'roll', 'activityRollFinished', 50, glovesBond)]);
    await setCat(recall, ['Gravity Gloves: recall'], [entryAnim('Gravity Gloves: recall', 'roll', 'activityRollFinished', 50, glovesRecall)]);
    await dropOld(gloves, ['Gravity Gloves: bond', 'Gravity Gloves: recall']);
    report.push('<li>Tina\'s Gravity Gloves: <b>Bond Weapons</b> (one Heavy or two others gain Thrown 20/60) and <b>Recall Weapons</b> (Bonus Action).</li>');
}
 
// ---- 7. Hold Person (Chris's Premades 2 does the repeat save on v14) ---------------------------------
const hold = actor.items.find(i => i.type === 'spell' && lc(i.name) === 'hold person');
if (hold) {
    await dropOld(hold, ['Hold spell live DC']);
    report.push('<li>Hold Person: ' + (premadeOn(hold) === 'cpr2' ? 'Chris\'s Premades 2 handles the repeat save.' : '<b>apply Chris\'s Premades 2\'s Hold Person in the Medkit</b> (repeat save at the end of each turn). The old v13 macro was removed.') + '</li>');
}
 
// ---- 8. What's left --------------------------------------------------------------------------------------
{
    const later = [];
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1' && !/demons? rage|javelin of lightning|hold person/i.test(i.name));
    if (cpr1.length) later.push('Still tagged for Chris\'s Premades 1 (does nothing on v14; re-apply in the Medkit if Chris\'s Premades 2 has it): ' + cpr1.map(i => i.name).join(', ') + '.');
    const dupes = Object.entries(actor.items.contents.reduce((m, i) => ((m[i.type + '|' + i.name] = (m[i.type + '|' + i.name] ?? 0) + 1), m), {}))
        .filter(([k, n]) => n > 1 && !k.startsWith('class|')).map(([k, n]) => k.split('|')[1] + ' x' + n);
    if (dupes.length) later.push('Duplicate items (check which to delete): ' + dupes.join(', ') + '.');
    const oldRage = actor.effects.filter(e => /^rage$/i.test(e.name.trim()) && e.flags?.['chris-premades'] && !e.flags?.cat);
    if (oldRage.length) later.push('A Rage effect from v13 is still on him (Chris\'s Premades 1). End it before testing.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Quez fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 