// =====================================================================
//  NOX FIXES (Journey to the East): one-click INSTALLER (Script macro, run as GM)
//  Select Nox's token, then run. Safe to re-run.
//   - Unarmed Strike: Dex, Martial Arts die (d10), Force damage, proficient
//   - Empowered Strikes / Uncanny Metabolism: extra copies removed
//   - Uncanny Metabolism: asked when combat starts if Focus isn't full
//   - Deflect Attacks: once per turn
//   - Self-Restoration: end-of-turn pop-up to end Charmed / Frightened / Poisoned
//   - Giant-Eel Scarf: advantage vs physical grapples and restraints (not spells)
//   - Sentinel (2024): Guardian + Halt (same as Quez)
//  Darkness (Shadow Arts) comes from the Darkness & Devil's Sight WORLD installer.
// =====================================================================
const SCRIPTS = {
 "UNCANNY": "await (async () => {\n// Uncanny Metabolism: when combat starts, if he isn't at full Focus, ask whether to use it.\nconst item = trigger.entity;\nconst actor = item.actor;\nif (!actor || (item.system.uses?.max && !(item.system.uses.value > 0))) return;\nconst focus = actor.items.find(i => /monk'?s focus|focus points|^ki( points)?$/i.test(i.name.trim()) && i.system.uses?.max);\nif (!focus || !((focus.system.uses.spent ?? 0) > 0)) return;\nconst level = actor.classes?.monk?.system.levels ?? 0;\nconst userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\nconst yes = await dialogUtils.confirm(item.name, 'Rolling initiative with ' + focus.system.uses.value + '/' + focus.system.uses.max\n    + ' Focus Points. Use ' + item.name + ' to regain all Focus Points and heal Martial Arts die + ' + level + '?', {userId});\nif (!yes) return;\nawait genericUtils.update(focus, {'system.uses.spent': 0});\nconst heal = item.system.activities?.find(a => a.type === 'heal');\nconst token = actorUtils.getFirstToken(actor);\nif (heal && token) await workflowUtils.syntheticActivityRoll(heal, [token], {userId, consumeUsage: true, consumeResources: true});\nelse {\n    if (item.system.uses?.max) await genericUtils.update(item, {'system.uses.spent': (item.system.uses.spent ?? 0) + 1});\n    const die = actor.system.scale?.monk?.['martial-arts']?.die ?? ('1d' + (level >= 17 ? 12 : level >= 11 ? 10 : level >= 5 ? 8 : 6));\n    const r = await new Roll(die + ' + ' + level).evaluate();\n    await r.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: item.name + ': healing'});\n    const hp = actor.system.attributes.hp;\n    await genericUtils.update(actor, {'system.attributes.hp.value': Math.min(hp.max, hp.value + r.total)});\n}\nawait ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + '\\'s Focus Points are fully restored.'});\n})();",
 "SELF_RESTORE": "await (async () => {\n// Self-Restoration: at the end of his turn, offer to end Charmed, Frightened or Poisoned.\nconst item = trigger.entity;\nconst actor = item.actor;\nconst CONDS = ['charmed', 'frightened', 'poisoned'];\nconst has = CONDS.filter(s => actor.statuses?.has(s));\nif (!has.length) return;\nconst userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\nconst label = s => CONFIG.statusEffects.find(e => e.id === s)?.name ? game.i18n.localize(CONFIG.statusEffects.find(e => e.id === s).name) : s;\nconst pick = await dialogUtils.buttonDialog(item.name, 'End of your turn: use ' + item.name + ' to end one condition?',\n    has.map(s => ['End ' + label(s), s]).concat([['Not now', false]]), {userId});\nif (!pick) return;\nconst effects = actor.effects.filter(e => e.statuses?.has(pick));\nfor (const e of effects) await genericUtils.remove(e);\nif (actor.statuses?.has(pick)) await actor.toggleStatusEffect(pick, {active: false});\nawait ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + ' shakes off being ' + label(pick) + '.'});\n})();",
 "SCARF_SAVE": "await (async () => {\n// Giant-Eel Scarf: advantage on saves against being Grappled or Restrained by physical means\n// (not spells).\nconst scarf = trigger.entity;\nif (scarf.system.attunement && !scarf.system.attuned) return;\nconst uuid = trigger.config?.midiOptions?.saveItemUuid;\nconst src = uuid ? fromUuidSync(uuid) : null;\nif (!src || src.type === 'spell' || src.system?.type?.value === 'spellFeature') return;\nconst BIND = /grappl|restrain/i;\nconst texts = [src.name, String(src.system?.description?.value ?? '')];\nfor (const e of src.effects?.contents ?? []) { texts.push(e.name); for (const s of e.statuses ?? []) texts.push(s); }\nfor (const a of src.system?.activities?.contents ?? []) texts.push(a.name);\nif (texts.some(t => BIND.test(t))) trigger.options.advantage = true;\n})();",
 "SCARF_ESCAPE": "await (async () => {\n// Giant-Eel Scarf: advantage on Athletics / Acrobatics / Str / Dex checks to escape a physical\n// grapple or restraint (not one from a spell).\nconst scarf = trigger.entity;\nif (scarf.system.attunement && !scarf.system.attuned) return;\nconst actor = scarf.actor;\nconst id = trigger.skillId ?? trigger.checkId;\nif (!['ath', 'acr', 'str', 'dex'].includes(id)) return;\nconst binds = actor.effects.filter(e => !e.disabled && (e.statuses?.has('grappled') || e.statuses?.has('restrained')));\nif (!binds.length) return;\nconst physical = binds.some(e => {\n    const o = e.origin ? fromUuidSync(e.origin, {strict: false}) : null;\n    const it = o?.documentName === 'Item' ? o : o?.parent?.documentName === 'Item' ? o.parent : null;\n    return !it || (it.type !== 'spell' && it.system?.type?.value !== 'spellFeature');\n});\nif (physical) trigger.options.advantage = true;\n})();",
 "SENTINEL": "await (async () => {\n    const item = trigger.entity;\n    const me = item.actor;\n    const mine = actorUtils.getFirstToken(me);\n    const foe = workflow.token;\n    if (!mine || !foe || !workflow.actor || workflow.actor.uuid === me.uuid) return;\n    if (!workflow.activity?.hasAttack && !workflowUtils.isAttackType(workflow, 'attack')) return;\n    if (foe.document.disposition === mine.document.disposition) return;\n    const others = Array.from(workflow.hitTargets ?? []).filter(t => t.id !== mine.id);\n    if (!others.length) return;\n    if (tokenUtils.getDistance(mine, foe) > 5) return;\n    if (combatUtils.inCombat() && actorUtils.hasUsedReaction(me)) return;\n    if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(s => me.statuses?.has(s))) return;\n    let weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack')\n        && ['simpleM', 'martialM'].includes(i.system.type?.value));\n    if (!weapons.length) weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack'));\n    if (!weapons.length) return;\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const text = foe.document.name + ' hit ' + others.map(t => t.document.name).join(', ') + ' right next to you. Use your reaction to make an Opportunity Attack against it?';\n    let weapon;\n    if (weapons.length === 1) {\n        if (!await dialogUtils.confirm(item.name + ': Guardian', text, {userId})) return;\n        weapon = weapons[0];\n    } else {\n        weapon = await dialogUtils.selectDocumentDialog(item.name + ': Guardian', text + ' Choose a weapon (or Cancel).', weapons, {userId});\n        if (!weapon) return;\n    }\n    const activity = weapon.system.activities.find(a => a.type === 'attack');\n    if (combatUtils.inCombat()) await actorUtils.setReactionUsed(me);\n    setTimeout(async () => {\n        const wf = await workflowUtils.syntheticActivityRoll(activity, [foe], {options: {workflowOptions: {nixSentinel: true}}});\n        // Halt: a creature hit by the Opportunity Attack has Speed 0 for the rest of the turn.\n        const hit = wf?.hitTargets?.size ? wf.hitTargets.first() : null;\n        if (hit?.actor) await effectUtils.createEffect(hit.actor, {\n            name: 'Sentinel: Halted', img: item.img, origin: item.uuid, duration: {turns: 1},\n            description: 'Speed 0 for the rest of the current turn.',\n            changes: ['walk', 'fly', 'swim', 'climb', 'burrow'].map(k => ({key: 'system.attributes.movement.' + k, mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '0', priority: 60})),\n            flags: {dae: {specialDuration: ['turnEnd']}}\n        });\n    }, 300);\n})();"
};
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Nox fixes: select Nox\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
const findAll = re => actor.items.filter(i => re.test(i.name.trim()));
const cprId = item => item?.flags?.['chris-premades']?.info?.identifier;
async function setMacros(doc, names, add) {
    const kept = (doc.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.setFlag('chris-premades', 'embeddedMacros', kept.concat(add));
}
async function setActivityMacros(item, activity, add) {
    const names = add.map(m => m.name);
    const kept = (item.flags?.['chris-premades']?.embeddedActivityMacros?.[activity.id] ?? []).filter(m => !names.includes(m.name));
    await item.setFlag('chris-premades', 'embeddedActivityMacros.' + activity.id, kept.concat(add));
}
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update(data);
    return actByName(item, name);
}
// Delete every copy of a feature except the one to keep (Chris's Premades version first).
async function dedupe(re, label) {
    const all = findAll(re);
    if (all.length < 2) return all[0];
    const keep = all.find(i => cprId(i)) ?? all.find(i => !/\(copy\)/i.test(i.name)) ?? all[0];
    const gone = all.filter(i => i.id !== keep.id);
    await actor.deleteEmbeddedDocuments('Item', gone.map(i => i.id));
    report.push('<li>' + label + ': removed ' + gone.length + ' extra cop' + (gone.length > 1 ? 'ies' : 'y') + ' (kept <b>' + keep.name + '</b>' + (cprId(keep) ? ', the Chris\'s Premades one' : '') + ').</li>');
    return keep;
}
// Move a familiar actor into its own folder and point a caster's Find Familiar there.
async function linkFamiliar(famName, items) {
    const fam = game.actors.find(a => a.name === famName && a.type === 'npc') ?? game.actors.find(a => a.name === famName);
    if (!fam) { report.push('<li>Familiar <b>' + famName + '</b>: no actor with that exact name in the Actors sidebar.</li>'); return; }
    const folderName = 'Familiars: ' + actor.name.split(' ')[0];
    const folder = game.folders.find(f => f.type === 'Actor' && f.name === folderName) ?? await Folder.create({name: folderName, type: 'Actor'});
    if (fam.folder?.id !== folder.id) await fam.update({folder: folder.id});
    const done = [];
    for (const it of items.filter(Boolean)) {
        await it.setFlag('chris-premades', 'config.folder', folderName);
        await it.setFlag('chris-premades', 'config.name', famName);
        done.push(it.name);
    }
    report.push('<li>Familiar: <b>' + famName + '</b> moved to the Actors folder "' + folderName + '", and ' + (done.join(' and ') || 'no Find Familiar item')
        + ' now summons ' + famName + ' (the creature type is still asked: Celestial, Fey or Fiend).</li>');
}
 
// ---- 1. Unarmed Strike -------------------------------------------------------------
{
    const monk = actor.classes?.monk?.system.levels ?? 0;
    const faces = monk >= 17 ? 12 : monk >= 11 ? 10 : monk >= 5 ? 8 : 6;
    const strikes = actor.items.filter(i => i.type === 'weapon' && /^unarmed strike/i.test(i.name.trim()));
    if (!strikes.length) report.push('<li><b>Unarmed Strike</b> not found.</li>');
    for (const u of strikes) {
        await u.update({'system.damage.base': {number: 1, denomination: faces, bonus: '', types: ['force'], custom: {enabled: false, formula: ''}},
            'system.proficient': 1});
        for (const a of u.system.activities.contents.filter(a => a.type === 'attack')) {
            await a.update({'attack.ability': 'dex', 'damage.includeBase': true, 'damage.parts': []});
        }
    }
    if (strikes.length) report.push('<li>Unarmed Strike: Dexterity attack (+' + (actor.system.abilities.dex.mod + actor.system.attributes.prof) + '), 1d' + faces
        + ' + Dex <b>Force</b> damage (Martial Arts die). Re-run this installer when he reaches Monk 17 for the d12.</li>');
}
 
// ---- 2. Empowered Strikes: one copy, Force -------------------------------------------
{
    const es = await dedupe(/^empowered strikes/i, 'Empowered Strikes');
    if (es && cprId(es) === 'empoweredStrikes') await es.setFlag('chris-premades', 'config.autoApply', true);
    if (es) report.push('<li>Empowered Strikes: his Unarmed Strikes always deal Force damage (set on the strike itself' + (cprId(es) ? '; Chris\'s Premades no longer asks' : '') + ').</li>');
}
 
// ---- 3. Uncanny Metabolism ----------------------------------------------------------------
{
    const um = await dedupe(/^uncanny metabolism/i, 'Uncanny Metabolism');
    if (!um) report.push('<li><b>Uncanny Metabolism</b> not found.</li>');
    else {
        await setMacros(um, ['Uncanny Metabolism: initiative'], [{name: 'Uncanny Metabolism: initiative', type: 'combat', pass: 'combatStart', priority: 50, macro: SCRIPTS.UNCANNY}]);
        report.push('<li>Uncanny Metabolism: when combat begins (after initiative), if he is missing Focus Points and the feature is unused, his player is asked; yes restores all Focus and rolls the healing.</li>');
    }
}
 
// ---- 4. Deflect Attacks: once per turn ---------------------------------------------------
{
    const da = find(/^deflect attacks/i);
    if (!da) report.push('<li><b>Deflect Attacks</b> not found.</li>');
    else {
        const period = CONFIG.DND5E.limitedUsePeriods?.turn ? 'turn' : 'turnStart';
        const rec = [{period, type: 'recoverAll'}];
        if (da.system.uses?.max) await da.update({'system.uses.recovery': rec, 'system.uses.spent': 0});
        for (const a of da.system.activities.contents) if (a.uses?.max) await a.update({'uses.recovery': rec, 'uses.spent': 0});
        report.push('<li>Deflect Attacks: its use now comes back every turn (' + period + '), so it works once per turn instead of once per rest.</li>');
    }
}
 
// ---- 5. Self-Restoration ---------------------------------------------------------------
{
    const sr = find(/^self-?restoration/i);
    if (!sr) report.push('<li><b>Self-Restoration</b> not found.</li>');
    else {
        await setMacros(sr, ['Self-Restoration: end of turn'], [{name: 'Self-Restoration: end of turn', type: 'combat', pass: 'turnEnd', priority: 50, macro: SCRIPTS.SELF_RESTORE}]);
        report.push('<li>Self-Restoration: at the end of each of his turns in combat, if he is Charmed, Frightened or Poisoned, his player gets a pop-up to end one of them.</li>');
    }
}
 
// ---- 6. Giant-Eel Scarf --------------------------------------------------------------------
{
    const scarf = find(/giant[- ]eel scarf/i);
    if (!scarf) report.push('<li><b>Giant-Eel Scarf</b> not found.</li>');
    else {
        await setMacros(scarf, ['Scarf: grapple saves', 'Scarf: escape (skill)', 'Scarf: escape (check)'], [
            {name: 'Scarf: grapple saves', type: 'save', pass: 'situational', priority: 50, macro: SCRIPTS.SCARF_SAVE},
            {name: 'Scarf: escape (skill)', type: 'skill', pass: 'situational', priority: 50, macro: SCRIPTS.SCARF_ESCAPE},
            {name: 'Scarf: escape (check)', type: 'check', pass: 'situational', priority: 50, macro: SCRIPTS.SCARF_ESCAPE}]);
        report.push('<li>Giant-Eel Scarf: Advantage on saves against being Grappled or Restrained, and on Athletics / Acrobatics / Str / Dex checks to escape, but only when the source is not a spell (Hold Person, Entangle and the like get no advantage).</li>');
    }
}
 
// ---- 7. Sentinel ------------------------------------------------------------------------
{
    const sen = find(/^sentinel/i);
    if (!sen) report.push('<li><b>Sentinel</b> not found.</li>');
    else {
        await setMacros(sen, ['Sentinel: Guardian'], [{name: 'Sentinel: Guardian', type: 'midi-actor', pass: 'sceneRollFinished', priority: 50, macro: SCRIPTS.SENTINEL}]);
        report.push('<li>Sentinel: same script as Quez. When an enemy within 5 ft hits someone else, he is offered a reaction Opportunity Attack; on a hit its Speed drops to 0 for the turn.</li>');
    }
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nox fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 