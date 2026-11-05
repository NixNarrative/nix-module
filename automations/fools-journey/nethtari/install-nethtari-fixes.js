// =====================================================================
//  NETHTARI FIXES: one-click INSTALLER (Script macro, run as GM)
//  Select Nethtari's token, then run. Safe to re-run.
//   - Agonizing Blast (+Cha per beam) and Eldritch Bident (d12 beams)
//   - Fiendish Vigor (at-will False Life gives max temp HP)
//   - Gift of the Protectors (Write Names + prompt at 0 HP, once per long rest;
//     removes duplicate copies)
//   - Sentinel Raven (Find Familiar + Perception bonus while summoned)
//   - Soul of the Raven (merge / return activities)
//   - Raven's Shield (rebuilt properly), Spell Sniper, Pearl of Power
// =====================================================================
const SCRIPTS = {
 "AGONIZING": "await (async () => {\n    if (workflow.item?.name?.toLowerCase().trim() !== 'eldritch blast') return;\n    if (!workflow.damageRolls?.length) return;\n    const cha = workflow.actor.system.abilities.cha.mod;\n    if (cha <= 0) return;\n    await workflowUtils.bonusDamage(workflow, String(cha), {ignoreCrit: true, damageType: workflow.damageRolls[0]?.options?.type ?? 'force'});\n})();",
 "BIDENT_DIE": "await (async () => {\n    const actor = workflow.actor;\n    const bident = actor.items.find(i => /eldritch bident/i.test(i.name) && i.system.equipped\n        && (!i.system.attunement || i.system.attuned));\n    const die = bident ? 12 : 10;\n    for (const act of workflow.item.system.activities?.contents ?? []) {\n        const parts = act.damage?.parts;\n        if (!parts?.length) continue;\n        if (parts.every(p => (p.denomination ?? die) === die)) continue;\n        const data = parts.map(p => {\n            const o = p.toObject ? p.toObject() : foundry.utils.deepClone(p);\n            if (o.denomination === 10 || o.denomination === 12) o.denomination = die;\n            return o;\n        });\n        await act.update({'damage.parts': data});\n    }\n})();",
 "GIFT_WRITE": "await (async () => {\n    const item = workflow.item;\n    const me = workflow.actor;\n    const max = Math.max(1, me.system.abilities.cha.mod);\n    const seen = new Set();\n    const candidates = [];\n    for (const a of game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner)) { seen.add(a.id); candidates.push(a); }\n    for (const t of canvas.tokens.placeables) {\n        if (t.actor && !seen.has(t.actor.id) && t.document.disposition === 1) { seen.add(t.actor.id); candidates.push(t.actor); }\n    }\n    const current = item.getFlag('world', 'giftNames') ?? [];\n    const picked = await dialogUtils.selectDocumentsDialog(item.name,\n        'Which creatures have written their names in the Book of Shadows? (up to ' + max + ')',\n        candidates, {max, checkbox: true, sortAlphabetical: true});\n    if (!picked) return;\n    const ids = picked.filter(p => p.amount).map(p => p.document.id).slice(0, max);\n    await item.setFlag('world', 'giftNames', ids);\n    const names = ids.map(id => game.actors.get(id)?.name ?? id);\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>' + item.name + ':</b> names in the Book of Shadows: ' + (names.join(', ') || '<i>none</i>') + '.'\n            + (current.length ? '' : '')});\n})();",
 "GIFT_SAVE": "await (async () => {\n    const item = trigger.entity;\n    const me = item.actor;\n    if (!ditem || ditem.newHP > 0 || ditem.oldHP <= 0) return;\n    const victim = fromUuidSync(ditem.actorUuid);\n    if (!victim) return;\n    const names = item.getFlag('world', 'giftNames') ?? [];\n    if (!names.includes(victim.id)) return;\n    if (item.system.uses?.max && !(item.system.uses.value > 0)) return;\n    // \"Not killed outright\": massive damage (remaining damage >= max HP) kills instantly.\n    const overflow = (ditem.totalDamage ?? 0) - (ditem.oldHP ?? 0) - (ditem.oldTempHP ?? 0);\n    if (overflow >= (victim.system.attributes.hp.max ?? Infinity)) return;\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const yes = await dialogUtils.confirm(item.name,\n        victim.name + ' is about to drop to 0 HP. Use ' + item.name + ' to leave them at 1 HP instead? (once per long rest)', {userId});\n    if (!yes) return;\n    workflowUtils.preventDeath(ditem);\n    if (item.system.uses?.max) await genericUtils.update(item, {'system.uses.spent': (item.system.uses.spent ?? 0) + 1});\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>' + item.name + ':</b> ' + victim.name + '\\'s name glows in the Book of Shadows. They drop to 1 HP instead of 0.'});\n})();",
 "VIGOR_MAX": "await (async () => {\n    // Fiendish Vigor feature | Midi Actor | damageRollComplete | 40\n    // When False Life is cast WITHOUT a spell slot (the Fiendish Vigor way),\n    // replace the temp HP roll with its maximum.\n    if (workflow.item?.name?.toLowerCase().trim() !== 'false life') return;\n    const method = workflow.item.system.method ?? workflow.item.system.preparation?.mode;\n    const viaVigor = workflow.item.flags?.dnd5e?.cachedFor || ['atwill', 'innate'].includes(method)\n        || /vigor/i.test(workflow.item.system.sourceItem ?? '');\n    if (!viaVigor || !workflow.damageRolls?.length) return;\n    let max = 0;\n    for (const r of workflow.damageRolls) max += (await new Roll(r.formula, workflow.actor.getRollData()).evaluate({maximize: true})).total;\n    const current = workflow.damageRolls.reduce((t, r) => t + r.total, 0);\n    if (current >= max) return;\n    await workflowUtils.replaceDamage(workflow, String(max), {damageType: workflow.damageRolls[0]?.options?.type ?? 'temphp'});\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),\n        content: '<b>Fiendish Vigor:</b> False Life gives the maximum: <b>' + max + '</b> temporary hit points.'});\n})();",
 "VIGOR_CAST": "await (async () => {\n    const AMOUNT = 12;\n    const actor = workflow.actor;\n    const cur = actor.system.attributes.hp.temp ?? 0;\n    if (AMOUNT > cur) await genericUtils.update(actor, {'system.attributes.hp.temp': AMOUNT});\n    const token = workflow.token ?? actorUtils.getFirstToken(actor);\n    if (token && globalThis.Sequence) {\n        const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };\n        const f = ['jb2a.energy_field.01.purple', 'jb2a.shield.01.complete.01.purple', 'jb2a.healing_generic.burst.purplepink'].find(ok);\n        if (f) new Sequence().effect().file(f).atLocation(token).scaleToObject(1.8).play();\n    }\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),\n        content: '<b>Fiendish Vigor:</b> False Life wraps ' + actor.name + ' in fiendish vitality: <b>' + AMOUNT + ' temporary hit points</b>'\n            + (AMOUNT > cur ? '.' : ' (she already has ' + cur + ', so no change).')});\n})();",
 "RAVEN_PERCH": "await (async () => {\n    if (workflow.item?.name?.toLowerCase().trim() !== 'find familiar') return;\n    const me = workflow.actor;\n    let familiarEffect;\n    for (let i = 0; i < 20 && !familiarEffect; i++) {\n        familiarEffect = me.effects.find(e => e.flags?.['chris-premades']?.summons?.ids?.['Find Familiar'])\n            ?? effectUtils.getEffectByIdentifier(me, 'findFamiliar');\n        if (!familiarEffect) await genericUtils.sleep(500);\n    }\n    if (!familiarEffect) return;\n    const old = effectUtils.getEffectByIdentifier(me, 'sentinelRavenNear');\n    if (old) await genericUtils.remove(old);\n    const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;\n    const [eff] = await effectUtils.createEffect(me, {\n        name: 'Sentinel Raven',\n        img: trigger.entity.img,\n        origin: trigger.entity.uuid,\n        description: 'While her raven is summoned: + Charisma modifier to Perception checks and passive Perception.',\n        changes: [\n            {key: 'system.skills.prc.bonuses.check', mode: ADD, value: '+@abilities.cha.mod', priority: 20},\n            {key: 'system.skills.prc.bonuses.passive', mode: ADD, value: '+@abilities.cha.mod', priority: 20}\n        ]\n    }, {identifier: 'sentinelRavenNear'}).then(r => [r].flat());\n    if (eff) await effectUtils.addDependent(familiarEffect, [eff]);\n})();",
 "RAVEN_MERGE": "await (async () => {\n    const me = workflow.actor;\n    const myToken = workflow.token;\n    if (!myToken) return;\n    if (effectUtils.getEffectByIdentifier(me, 'soulOfTheRaven')) return ui.notifications.info('Already merged with the raven.');\n    const fam = me.effects.find(e => e.flags?.['chris-premades']?.summons?.ids?.['Find Familiar']);\n    const ids = fam?.flags['chris-premades'].summons.ids['Find Familiar'] ?? [];\n    let raven = ids.map(id => canvas.tokens.get(id)).find(t => t && !t.document.hidden);\n    raven ??= canvas.tokens.placeables.find(t => !t.document.hidden\n        && t.actor?.flags?.['chris-premades']?.summons?.control?.actor === me.uuid);\n    if (!raven) return ui.notifications.warn('Soul of the Raven: summon your raven first (Find Familiar).');\n    if (tokenUtils.getDistance(myToken, raven) > 5) return ui.notifications.warn('Soul of the Raven: the raven must be perched on your shoulder (within 5 ft).');\n    const move = raven.actor.system.attributes.movement ?? {};\n    const O = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;\n    const changes = [\n        {key: 'system.traits.size', mode: O, value: 'tiny', priority: 30},\n        {key: 'ATL.width', mode: O, value: '0.5', priority: 30},\n        {key: 'ATL.height', mode: O, value: '0.5', priority: 30},\n        {key: 'ATL.texture.src', mode: O, value: raven.document.texture.src, priority: 30}\n    ];\n    for (const k of ['walk', 'fly', 'climb', 'swim', 'burrow']) {\n        changes.push({key: 'system.attributes.movement.' + k, mode: O, value: String(Number(move[k]) || 0), priority: 30});\n    }\n    const onEnd = async () => {\n        const eff = trigger.entity;\n        const r = eff.flags.world?.soulRaven;\n        if (!r) return;\n        const scene = game.scenes.get(r.sceneId);\n        const t = scene?.tokens.get(r.ravenId);\n        const mine = actorUtils.getFirstToken(eff.parent);\n        if (t) await t.update({hidden: false, ...(mine ? {x: mine.document.x, y: mine.document.y} : {})});\n    };\n    await effectUtils.createEffect(me, {\n        name: 'Soul of the Raven',\n        img: raven.document.texture.src,\n        origin: workflow.item.uuid,\n        description: 'Merged with her raven: Tiny, the raven\\'s speeds, and her action can only Dash, Disengage, Dodge, Help, Hide or Search. Still gets the raven-on-shoulder benefits. Action: return to normal.',\n        changes,\n        flags: {\n            world: {soulRaven: {ravenId: raven.id, sceneId: raven.document.parent.id}},\n            'chris-premades': {embeddedMacros: [\n                {name: 'Soul of the Raven end', type: 'effect', pass: 'deleted', priority: 50, macro: 'await (' + onEnd.toString() + ')();'}\n            ]}\n        }\n    }, {identifier: 'soulOfTheRaven'});\n    await raven.document.update({hidden: true});\n    if (globalThis.Sequencer) {\n        const f = ['jb2a.smoke.puff.centered.grey', 'jb2a.misty_step.01.purple'].find(x => Sequencer.Database.entryExists(x));\n        if (f) new Sequence().effect().file(f).atLocation(myToken).scaleToObject(2).play();\n    }\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>Soul of the Raven:</b> ' + me.name + ' merges with her raven.'});\n})();",
 "RAVEN_SPLIT": "await (async () => {\n    const eff = effectUtils.getEffectByIdentifier(workflow.actor, 'soulOfTheRaven');\n    if (!eff) return ui.notifications.info('Not merged with the raven.');\n    await genericUtils.remove(eff);\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),\n        content: '<b>Soul of the Raven:</b> ' + workflow.actor.name + ' and her raven separate.'});\n})();",
 "PEARL": "await (async () => {\n    const me = workflow.actor;\n    const spells = me.system.spells ?? {};\n    const pact = spells.pact;\n    let key = null;\n    if (pact?.max && pact.value < pact.max) key = 'pact';\n    else {\n        for (let l = 5; l >= 1; l--) {\n            const s = spells['spell' + l];\n            if (s?.max && s.value < s.max) { key = 'spell' + l; break; }\n        }\n    }\n    if (!key) {\n        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n            content: '<b>Pearl of Power:</b> no spent spell slot to regain (pact ' + (pact?.value ?? '?') + '/' + (pact?.max ?? '?') + '). Use refunded.'});\n        if (workflow.item.system.uses?.spent > 0) await genericUtils.update(workflow.item, {'system.uses.spent': workflow.item.system.uses.spent - 1});\n        return;\n    }\n    await me.update({['system.spells.' + key + '.value']: spells[key].value + 1});\n    const label = key === 'pact' ? 'a Pact Magic slot (level ' + (pact.level ?? '?') + ')' : 'a level ' + key.slice(5) + ' slot';\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>Pearl of Power:</b> ' + me.name + ' regains ' + label + '.'});\n})();",
 "BIDENT_SHUNT": "await (async () => {\n    if (!workflow.attackRoll || !workflow.hitTargets?.size) return;\n    const d20 = workflow.attackRoll.dice?.[0];\n    const nat = d20?.results?.find(r => r.active)?.result ?? d20?.total;\n    if (nat !== 20) return;\n    const me = workflow.actor;\n    const bident = me.items.find(i => /eldritch bident/i.test(i.name) && i.system.equipped\n        && (!i.system.attunement || i.system.attuned));\n    if (!bident) return;\n    const target = workflow.hitTargets.first();\n    if (!target?.actor || target.document.hidden) return;\n    const roll = await rollUtils.requestRoll(target, 'save', 'cha', {target: 10, fastForward: true, rollMode: 'publicroll', chatMessage: true});\n    const r0 = roll?.total !== undefined ? roll : roll?.[0];\n    const total = r0?.total;\n    const natD = r0?.dice?.[0];\n    const natural = natD?.results?.find(x => x.active)?.result ?? natD?.total;\n    const natOne = natural === 1;\n    if (total === undefined || (total >= 10 && !natOne)) {\n        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n            content: '<b>' + bident.name + ':</b> ' + target.document.name + ' resists being shunted (Charisma save ' + (total ?? '?') + ' vs DC 10).'});\n        return;\n    }\n    const onTurn = async () => {\n        const eff = trigger.entity;\n        const s = eff.flags.world?.bidentShunt;\n        if (!s) return;\n        const tok = actorUtils.getFirstToken(eff.parent);\n        if (tok) await tok.document.update({hidden: false});\n        await genericUtils.update(eff, {'flags.world.bidentShunt.returned': true});\n        if (tok) {\n            const src = await fromUuid(s.sourceTokenUuid);\n            const r = await new CONFIG.Dice.DamageRoll('2d12', {}, {type: 'psychic'}).evaluate();\n            await workflowUtils.applyWorkflowDamage(src?.object ?? tok, r, 'psychic', [tok],\n                {flavor: 'Eldritch Bident: return from the far plane'});\n        }\n        await genericUtils.remove(eff);\n    };\n    const onDelete = async () => {\n        const eff = trigger.entity;\n        if (eff.flags.world?.bidentShunt?.returned) return;\n        const tok = actorUtils.getFirstToken(eff.parent);\n        if (tok?.document.hidden) await tok.document.update({hidden: false});\n    };\n    const run = fn => 'await (' + fn.toString() + ')();';\n    await effectUtils.createEffect(target.actor, {\n        name: 'Shunted (Eldritch Bident)',\n        img: bident.img,\n        origin: bident.uuid,\n        description: 'Shunted to a plane of eldritch horrors. Reappears at the start of its next turn and takes 2d12 psychic damage.',\n        flags: {\n            world: {bidentShunt: {sourceTokenUuid: workflow.token?.document.uuid}},\n            'chris-premades': {embeddedMacros: [\n                {name: 'Bident shunt return', type: 'combat', pass: 'turnStart', priority: 50, macro: run(onTurn)},\n                {name: 'Bident shunt cleanup', type: 'effect', pass: 'deleted', priority: 50, macro: run(onDelete)}\n            ]}\n        }\n    });\n    if (globalThis.Sequencer) {\n        const f = ['jb2a.portals.vertical.vortex.purple', 'jb2a.misty_step.01.purple'].find(x => Sequencer.Database.entryExists(x));\n        if (f) new Sequence().effect().file(f).atLocation(target).scaleToObject(1.5).play();\n    }\n    await target.document.update({hidden: true});\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>' + bident.name + ':</b> natural 20! ' + target.document.name + ' fails its Charisma save (' + total + (natOne ? ', natural 1' : '')\n            + ') and is shunted to a plane of eldritch horrors. It returns at the start of its next turn and takes 2d12 psychic damage.'});\n})();"
};
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Nethtari fixes: select Nethtari\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name));
const findAll = re => actor.items.filter(i => re.test(i.name));
const cprId = i => i?.flags?.['chris-premades']?.info?.identifier;
async function setMacros(doc, names, add) {
    const kept = (doc.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.setFlag('chris-premades', 'embeddedMacros', kept.concat(add));
}
async function setActivityMacros(item, activity, names, add) {
    const path = 'flags.chris-premades.embeddedActivityMacros.' + activity.id;
    const kept = (foundry.utils.getProperty(item, path) ?? []).filter(m => !names.includes(m.name));
    await item.setFlag('chris-premades', 'embeddedActivityMacros.' + activity.id, kept.concat(add));
}
async function ensureActivity(item, name, type, data) {
    let act = (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
    if (!act) {
        await item.createActivity(type, {name, ...data}, {renderSheet: false});
        act = (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
    } else await act.update(data);
    return act;
}
const ADD = CONST.ACTIVE_EFFECT_MODES.ADD, O = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
 
// ---- 1. Agonizing Blast + Eldritch Bident d12 ---------------------------------------
const eb = actor.items.find(i => i.type === 'spell' && lc(i.name) === 'eldritch blast');
const agon = find(/agonizing blast/i);
if (!agon) report.push('<li><b>Agonizing Blast</b> not found.</li>');
else if (cprId(agon) === 'agonizingBlast') {
    await agon.setFlag('chris-premades', 'agonizingBlast.spells', ['Eldritch Blast']);
    await setMacros(agon, ['Agonizing Blast (Nix)'], []);
    report.push('<li>Agonizing Blast: Chris\'s Premades version now set to Eldritch Blast (+Cha per beam).</li>');
} else {
    await setMacros(agon, ['Agonizing Blast (Nix)'], [
        {name: 'Agonizing Blast (Nix)', type: 'midi-actor', pass: 'damageRollComplete', priority: 100, macro: SCRIPTS.AGONIZING}]);
    report.push('<li>Agonizing Blast: +Cha to every Eldritch Blast beam.</li>');
}
if (!eb) report.push('<li><b>Eldritch Blast</b> not found.</li>');
else {
    await setMacros(eb, ['Eldritch Bident die', 'Eldritch Bident shunt'], [
        {name: 'Eldritch Bident die', type: 'midi-item', pass: 'preItemRoll', priority: 20, macro: SCRIPTS.BIDENT_DIE},
        {name: 'Eldritch Bident shunt', type: 'midi-item', pass: 'rollFinished', priority: 60, macro: SCRIPTS.BIDENT_SHUNT}]);
    report.push('<li>Eldritch Blast: beams roll d12 while the Eldritch Bident is equipped and attuned (d10 otherwise); a natural 20 on a beam that hits forces a DC 10 Charisma save or the target is shunted away until the start of its next turn, then takes 2d12 psychic.'
        + (cprId(eb) || eb.getFlag('world', 'nixEbCprInfo') ? '' : ' <b>Eldritch Blast has no Chris\'s Premades automation: apply it in the Medkit for the beam handling.</b>') + '</li>');
}
const bidents = findAll(/eldritch bident/i);
if (bidents.length > 1) report.push('<li><b>' + bidents.length + ' Eldritch Bidents</b> in her inventory. Delete the spare (keep the equipped, attuned one).</li>');
 
// ---- 2. Fiendish Vigor: max False Life -----------------------------------------------
const vigor = find(/fiendish vigor/i);
const vigorLife = actor.items.filter(i => i.type === 'spell' && lc(i.name) === 'false life'
    && (i.flags?.dnd5e?.cachedFor || ['atwill', 'innate'].includes(i.system.method ?? i.system.preparation?.mode) || /vigor/i.test(i.system.sourceItem ?? '')));
// Static: at-will copies get a fixed (maximum) temp HP formula, so no dice are asked for.
for (const fl of vigorLife) {
    await setMacros(fl, ['Fiendish Vigor max'], []);
    for (const act of (fl.system.activities?.contents ?? []).filter(a => a.type === 'heal' && a.healing)) {
        const h = act.healing;
        const formula = h.custom?.enabled ? h.custom.formula : ((h.number && h.denomination) ? h.number + 'd' + h.denomination : '0') + (h.bonus ? ' + ' + h.bonus : '');
        if (/^\s*\d+\s*$/.test(formula)) continue;
        const max = (await new Roll(formula, actor.getRollData()).evaluate({maximize: true})).total;
        await act.update({'healing.custom': {enabled: true, formula: String(max)}});
    }
}
// Live: whenever False Life is cast without a slot, its roll is replaced by the maximum.
if (vigor) await setMacros(vigor, ['Fiendish Vigor max'], [
    {name: 'Fiendish Vigor max', type: 'midi-actor', pass: 'damageRollComplete', priority: 40, macro: SCRIPTS.VIGOR_MAX}]);
// One-click version on the feature itself: no spell, no dice, straight to 12 temp HP.
if (vigor) {
    const NAME = 'Cast False Life (Fiendish Vigor)';
    for (const a of (vigor.system.activities?.contents ?? []).filter(a => a.name !== NAME)) await vigor.update({['system.activities.-=' + a.id]: null});
    if (vigor.flags?.['chris-premades']?.embeddedActivityMacros) await vigor.unsetFlag('chris-premades', 'embeddedActivityMacros');
    const cast = await ensureActivity(vigor, NAME, 'utility', {
        img: 'icons/magic/life/heart-cross-strong-purple-orange.webp',
        activation: {type: 'action', value: 1, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Cast False Life without a spell slot: 12 temporary hit points.'}});
    await setActivityMacros(vigor, cast, ['Fiendish Vigor: 12 temp HP'], [
        {name: 'Fiendish Vigor: 12 temp HP', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.VIGOR_CAST}]);
    report.push('<li>Fiendish Vigor: the feature now has one activity, <b>' + NAME + '</b>: an Action that gives her 12 temporary hit points with no dice (if she has fewer than that).</li>');
}
report.push('<li>Fiendish Vigor: False Life cast without a slot gives maximum temp HP'
    + (vigorLife.length ? ' (' + vigorLife.length + ' at-will copy set to a fixed amount)' : '') + (vigor ? '' : ' <b>(Fiendish Vigor feature not found)</b>') + '.</li>');
 
// ---- 3. Gift of the Protectors --------------------------------------------------------
const gifts = findAll(/gift of the protectors/i);
if (!gifts.length) report.push('<li><b>Gift of the Protectors</b> not found.</li>');
else {
    const gift = gifts.find(g => g.system.uses?.max) ?? gifts[0];
    const extras = gifts.filter(g => g.id !== gift.id);
    if (extras.length) await actor.deleteEmbeddedDocuments('Item', extras.map(g => g.id));
    // Clear the old jury-rigged automation on the kept copy.
    if (cprId(gift)) await gift.unsetFlag('chris-premades', 'info');
    await gift.update({'system.uses': {spent: 0, max: '1', recovery: [{period: 'lr', type: 'recoverAll'}]}});
    for (const a of (gift.system.activities?.contents ?? [])) {
        if (lc(a.name) !== 'write names') await gift.update({['system.activities.-=' + a.id]: null});
    }
    const write = await ensureActivity(gift, 'Write Names', 'utility', {activation: {type: 'special', value: null, condition: ''}, consumption: {targets: []}});
    await setMacros(gift, ['Gift of the Protectors save', 'Gift of the Protectors self'], [
        {name: 'Gift of the Protectors save', type: 'midi-actor', pass: 'sceneApplyDamage', priority: 240, macro: SCRIPTS.GIFT_SAVE},
        {name: 'Gift of the Protectors self', type: 'midi-actor', pass: 'targetApplyDamage', priority: 240, macro: SCRIPTS.GIFT_SAVE}]);
    if (write) await setActivityMacros(gift, write, ['Gift write names'], [
        {name: 'Gift write names', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.GIFT_WRITE}]);
    report.push('<li>Gift of the Protectors rebuilt' + (extras.length ? ' (' + extras.length + ' duplicate removed)' : '')
        + '. Use its <b>Write Names</b> activity to pick who is in the book (up to her Cha mod).</li>');
}
 
// ---- 4. Sentinel Raven + Find Familiar -------------------------------------------------
const sentinel = find(/sentinel raven/i);
if (!sentinel) report.push('<li><b>Sentinel Raven</b> not found.</li>');
else {
    await setMacros(sentinel, ['Sentinel Raven perch'], [
        {name: 'Sentinel Raven perch', type: 'midi-actor', pass: 'rollFinished', priority: 60, macro: SCRIPTS.RAVEN_PERCH}]);
    let ff = actor.items.find(i => i.type === 'spell' && lc(i.name) === 'find familiar');
    if (!ff) {
        const packs = game.packs.filter(p => p.documentName === 'Item').sort((a, b) =>
            (b.collection.includes('24') ? 1 : 0) - (a.collection.includes('24') ? 1 : 0));
        for (const pack of packs) {
            const entry = pack.index.find(e => e.name === 'Find Familiar' && (e.type === 'spell' || !e.type));
            if (!entry) continue;
            const doc = await pack.getDocument(entry._id);
            const data = doc.toObject();
            data.system.method = 'atwill';
            data.system.prepared = 2;
            if (data.system.preparation) data.system.preparation = {mode: 'atwill', prepared: true};
            data.system.sourceItem = sentinel.name;
            [ff] = await actor.createEmbeddedDocuments('Item', [data]);
            break;
        }
    }
    report.push('<li>Sentinel Raven: ' + (ff ? 'Find Familiar is on her sheet (at will). ' : '<b>Find Familiar not found in your compendiums.</b> ')
        + 'While the raven is summoned she gets +Cha to Perception and passive Perception.'
        + (cprId(ff) ? '' : ' <b>Apply Chris\'s Premades\' Find Familiar automation in its Medkit</b> and put a Raven actor in the "Familiars" folder.') + '</li>');
}
 
// ---- 5. Soul of the Raven ---------------------------------------------------------------
const soul = find(/soul of the raven/i);
if (!soul) report.push('<li><b>Soul of the Raven</b> not found.</li>');
else {
    const merge = await ensureActivity(soul, 'Merge with Raven', 'utility', {activation: {type: 'bonus', value: 1, condition: ''}, consumption: {targets: []}});
    const split = await ensureActivity(soul, 'Return to Normal', 'utility', {activation: {type: 'action', value: 1, condition: ''}, consumption: {targets: []}});
    if (merge) await setActivityMacros(soul, merge, ['Soul merge'], [{name: 'Soul merge', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.RAVEN_MERGE}]);
    if (split) await setActivityMacros(soul, split, ['Soul split'], [{name: 'Soul split', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.RAVEN_SPLIT}]);
    report.push('<li>Soul of the Raven: <b>Merge with Raven</b> (bonus action) and <b>Return to Normal</b> (action) activities.</li>');
}
 
// ---- 6. Raven's Shield ----------------------------------------------------------------
const shield = find(/raven'?s shield/i);
if (!shield) report.push('<li><b>Raven\'s Shield</b> not found.</li>');
else {
    const hardcoded = actor.effects.filter(e => /raven'?s? shield/i.test(e.name));
    if (hardcoded.length) await actor.deleteEmbeddedDocuments('ActiveEffect', hardcoded.map(e => e.id));
    if (shield.effects.size) await shield.deleteEmbeddedDocuments('ActiveEffect', shield.effects.map(e => e.id));
    await shield.createEmbeddedDocuments('ActiveEffect', [{
        name: 'Raven\'s Shield', img: shield.img, transfer: true,
        description: 'Advantage on death saving throws, immune to Frightened, resistance to necrotic damage.',
        changes: [
            {key: 'flags.midi-qol.advantage.deathSave', mode: O, value: '1', priority: 20},
            {key: 'system.traits.ci.value', mode: ADD, value: 'frightened', priority: 20},
            {key: 'system.traits.dr.value', mode: ADD, value: 'necrotic', priority: 20}
        ]
    }]);
    report.push('<li>Raven\'s Shield rebuilt' + (hardcoded.length ? ' (' + hardcoded.length + ' hand-made effect removed)' : '') + '.</li>');
}
 
// ---- 7. Spell Sniper ---------------------------------------------------------------------
const sniper = find(/spell sniper/i);
if (!sniper) report.push('<li><b>Spell Sniper</b> not found.</li>');
else {
    const old = sniper.effects.filter(e => /spell sniper/i.test(e.name));
    if (old.length) await sniper.deleteEmbeddedDocuments('ActiveEffect', old.map(e => e.id));
    await sniper.createEmbeddedDocuments('ActiveEffect', [{
        name: 'Spell Sniper', img: sniper.img, transfer: true,
        description: 'Spell attacks ignore half and three-quarters cover, no disadvantage from nearby enemies, longer range.',
        changes: [
            {key: 'flags.dnd5e.spellSniper', mode: O, value: '1', priority: 20},
            {key: 'flags.midi-qol.ignoreNearbyFoes', mode: O, value: '!!item.school', priority: 20}
        ]
    }]);
    report.push('<li>Spell Sniper: ignores half/three-quarters cover, no disadvantage with enemies adjacent, extended range for spell attacks.</li>');
}
 
// ---- 8. Pearl of Power -------------------------------------------------------------------
const pearl = find(/pearl of power/i);
if (!pearl) report.push('<li><b>Pearl of Power</b> not found.</li>');
else {
    await setMacros(pearl, ['Pearl of Power slot'], []);
    const acts = pearl.system.activities?.contents ?? [];
    if (!acts.length) report.push('<li><b>Pearl of Power has no activity</b>: add a Utility activity and run again.</li>');
    for (const act of acts) await setActivityMacros(pearl, act, ['Pearl of Power slot'], [
        {name: 'Pearl of Power slot', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.PEARL}]);
    report.push('<li>Pearl of Power: regains a Pact Magic slot (or her lowest spent slot).</li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nethtari fixes on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 