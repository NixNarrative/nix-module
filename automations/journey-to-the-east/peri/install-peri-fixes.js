 // =====================================================================
//  PERI FIXES (Journey to the East): one-click INSTALLER (Script macro, run as GM)
//  Select Perritwinkle's token, then run. Safe to re-run.
//   - Fairy Magic (Faerie Fire, Enlarge/Reduce, Druidcraft): Wisdom
//   - Wild Surge / Unstable Backlash: extra copies removed
//   - Rage: Wild Surge rolls automatically when a new Rage starts
//   - Wild Surge: "Configure Surge Animations" (one animation per d8 result)
//   - Great Weapon Master (2024): same as Quez
//   - Mage Slayer: Guarded Mind pop-up on a failed Int/Wis/Cha save
// =====================================================================
const SCRIPTS = {
 "RAGE_MARK": "await (async () => {\n// Remember which Rage effects existed before this use, so a NEW rage can be spotted.\nconst isRage = e => !e.disabled && (e.flags?.['chris-premades']?.info?.identifier === 'rage' || /^rag(e|ing)\\b/i.test(e.name.trim()));\nworkflow.nixRageBefore = workflow.actor.effects.filter(isRage).map(e => e.id);\n})();",
 "RAGE_SURGE": "await (async () => {\n// Rage -> Wild Surge: when a new Rage starts, Wild Surge rolls automatically (like\n// Chris's Premades does for the 2014 Rage).\nconst actor = workflow.actor;\nif (!Array.isArray(workflow.nixRageBefore)) return;\nconst isRage = e => !e.disabled && (e.flags?.['chris-premades']?.info?.identifier === 'rage' || /^rag(e|ing)\\b/i.test(e.name.trim()));\nlet rage = actor.effects.find(e => isRage(e) && !workflow.nixRageBefore.includes(e.id));\nif (!rage) { await genericUtils.sleep(600); rage = actor.effects.find(e => isRage(e) && !workflow.nixRageBefore.includes(e.id)); }\nif (!rage) return;\nconst surge = itemUtils.getItemByIdentifier(actor, 'wildSurge') ?? actor.items.find(i => /^wild surge$/i.test(i.name.trim()));\nif (!surge) return;\nconst act = activityUtils.getActivityByIdentifier(surge, 'wildSurge', {strict: true}) ?? surge.system.activities.contents.find(a => !/configure/i.test(a.name));\nif (!act) return;\nsetTimeout(() => workflowUtils.syntheticActivityRoll(act, [], {consumeResources: false}), 300);\n})();",
 "SURGE_CONFIG": "await (async () => {\nconst SURGE_KEYS = ['shadowyTendrils', 'teleport', 'intangibleSpirit', 'magicInfusion', 'retribution', 'protectiveLights', 'flowersAndVines', 'boltOfLight'];\nconst SURGE_LABELS = ['1: Shadowy Tendrils', '2: Teleport', '3: Intangible Spirit', '4: Magic Infusion', '5: Retribution', '6: Protective Lights', '7: Flowers and Vines', '8: Bolt of Light'];\nconst SURGE_DEFAULTS = {\n    shadowyTendrils: {file: 'jb2a.arms_of_hadar.dark_purple', size: 12, mode: 'once'},\n    teleport: {file: 'jb2a.misty_step.01.purple', size: 2, mode: 'once'},\n    intangibleSpirit: {file: 'jb2a.magic_signs.circle.02.conjuration.complete.pink', size: 3, mode: 'once'},\n    magicInfusion: {file: 'jb2a.static_electricity.03.purple', size: 2, mode: 'loop'},\n    retribution: {file: 'jb2a.shield_themed.above.eldritch_web.01.dark_purple', size: 2, mode: 'loop'},\n    protectiveLights: {file: 'jb2a.bless.400px.loop.purple', size: 5, mode: 'loop'},\n    flowersAndVines: {file: 'jb2a.plant_growth.02.round.4x4.complete.greenred', size: 7, mode: 'loop'},\n    boltOfLight: {file: 'jb2a.divine_smite.caster.yellowwhite', size: 2.5, mode: 'once'}\n};\n// Configure Surge Animations: one row per Wild Surge result. Paste any Sequencer database\n// path (open Sequencer's Database Viewer to browse and copy) or a file path, set the size in\n// grid squares, and choose Once / Loop while the surge lasts / None.\nconst item = workflow.item;\nconst saved = item.flags?.world?.nixSurgeAnims ?? {};\nconst cur = k => ({...SURGE_DEFAULTS[k], ...(saved[k] ?? {})});\nconst inputs = [];\nfor (const [i, k] of SURGE_KEYS.entries()) {\n    inputs.push(['text', [{label: SURGE_LABELS[i], name: k + '_file', options: {currentValue: cur(k).file}}], {displayAsRows: true}]);\n    inputs.push(['number', [{label: 'Size (grid squares)', name: k + '_size', options: {currentValue: cur(k).size}}], {displayAsRows: false}]);\n    inputs.push(['selectOption', [{label: 'Play', name: k + '_mode', options: {currentValue: cur(k).mode,\n        options: [{value: 'once', label: 'Once'}, {value: 'loop', label: 'Loop while it lasts'}, {value: 'none', label: 'None'}]}}], {displayAsRows: false}]);\n}\ninputs.push(['checkbox', [{label: 'Preview all 8 on this token after saving', name: 'preview', options: {isChecked: false}}], {displayAsRows: true}]);\nconst res = await DialogApp.dialog(item.name + ': Surge Animations',\n    'Paste a Sequencer database path (Sequencer > Database Viewer, click a name to copy it) or a file path for each result.', inputs, 'okCancel', {width: 720, height: 'auto'});\nif (!res?.buttons) return;\nconst out = {};\nfor (const k of SURGE_KEYS) out[k] = {file: String(res[k + '_file'] ?? '').trim(), size: Number(res[k + '_size']) || SURGE_DEFAULTS[k].size, mode: res[k + '_mode'] ?? SURGE_DEFAULTS[k].mode};\nawait item.setFlag('world', 'nixSurgeAnims', out);\nui.notifications.info(item.name + ': surge animations saved.');\nif (!res.preview || !globalThis.Sequencer) return;\nconst token = workflow.token ?? actorUtils.getFirstToken(item.actor);\nif (!token) return;\nfor (const [i, k] of SURGE_KEYS.entries()) {\n    const c = out[k];\n    if (!c.file || c.mode === 'none') continue;\n    ui.notifications.info('Preview ' + SURGE_LABELS[i]);\n    try { await new Sequence().effect().file(c.file).atLocation(token).size(c.size, {gridUnits: true}).duration(2500).play(); } catch (err) { ui.notifications.warn(SURGE_LABELS[i] + ': ' + err.message); }\n    await genericUtils.sleep(2800);\n}\n})();",
 "SURGE_ANIM": "await (async () => {\nconst SURGE_KEYS = ['shadowyTendrils', 'teleport', 'intangibleSpirit', 'magicInfusion', 'retribution', 'protectiveLights', 'flowersAndVines', 'boltOfLight'];\nconst SURGE_LABELS = ['1: Shadowy Tendrils', '2: Teleport', '3: Intangible Spirit', '4: Magic Infusion', '5: Retribution', '6: Protective Lights', '7: Flowers and Vines', '8: Bolt of Light'];\nconst SURGE_DEFAULTS = {\n    shadowyTendrils: {file: 'jb2a.arms_of_hadar.dark_purple', size: 12, mode: 'once'},\n    teleport: {file: 'jb2a.misty_step.01.purple', size: 2, mode: 'once'},\n    intangibleSpirit: {file: 'jb2a.magic_signs.circle.02.conjuration.complete.pink', size: 3, mode: 'once'},\n    magicInfusion: {file: 'jb2a.static_electricity.03.purple', size: 2, mode: 'loop'},\n    retribution: {file: 'jb2a.shield_themed.above.eldritch_web.01.dark_purple', size: 2, mode: 'loop'},\n    protectiveLights: {file: 'jb2a.bless.400px.loop.purple', size: 5, mode: 'loop'},\n    flowersAndVines: {file: 'jb2a.plant_growth.02.round.4x4.complete.greenred', size: 7, mode: 'loop'},\n    boltOfLight: {file: 'jb2a.divine_smite.caster.yellowwhite', size: 2.5, mode: 'once'}\n};\n// Wild Surge animations: after Chris's Premades rolls the d8, play the animation chosen for\n// that result (Configure Surge Animations sets them). 'loop' plays until the surge ends.\nconst item = trigger.entity;\nconst actor = item.actor;\nconst actId = activityUtils.getIdentifier(workflow.activity);\nif (actId ? actId !== 'wildSurge' : !/^wild surge$/i.test(workflow.activity?.name ?? '')) return;\nif (!globalThis.Sequencer) return;\nawait genericUtils.sleep(300);\nconst since = Date.now() - 20000;\nconst msg = game.messages.contents.slice(-15).reverse().find(m => (m.timestamp ?? 0) > since\n    && String(m.flavor ?? '').startsWith(item.name + ':') && m.rolls?.[0]?.dice?.[0]?.faces === 8);\nconst n = Number(msg?.rolls?.[0]?.total);\nif (!(n >= 1 && n <= 8)) return;\nconst key = SURGE_KEYS[n - 1];\nconst cfg = {...SURGE_DEFAULTS[key], ...(item.flags?.world?.nixSurgeAnims?.[key] ?? {})};\nif (!cfg.file || cfg.mode === 'none') return;\nconst token = workflow.token ?? actorUtils.getFirstToken(actor);\nif (!token) return;\nlet ok = false;\ntry { ok = Sequencer.Database.entryExists(cfg.file) || /\\.(webm|webp|png|gif|mp4)$/i.test(cfg.file); } catch {}\nif (!ok) return ui.notifications.warn(item.name + ': animation \"' + cfg.file + '\" not found. Fix it in Configure Surge Animations.');\nconst NAME = 'WildSurge ' + actor.id;\nawait Sequencer.EffectManager.endEffects({name: NAME});\nconst e = new Sequence().effect().file(cfg.file).size(Number(cfg.size) || 2, {gridUnits: true});\nif (cfg.mode === 'loop') {\n    e.attachTo(token).belowTokens().fadeIn(400).fadeOut(400).persist().name(NAME);\n    await e.play();\n    await genericUtils.sleep(500);\n    const surgeFx = effectUtils.getEffectByIdentifier(actor, 'wildSurge');\n    const holder = surgeFx ?? effectUtils.getEffectByIdentifier(actor, 'rage');\n    if (holder) {\n        const kept = (holder.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => m.name !== 'Wild Surge animation end');\n        kept.push({name: 'Wild Surge animation end', type: 'effect', pass: 'deleted', priority: 50,\n            macro: \"await Sequencer.EffectManager.endEffects({name: 'WildSurge \" + actor.id + \"'});\"});\n        await holder.setFlag('chris-premades', 'embeddedMacros', kept);\n    }\n} else {\n    await e.atLocation(token).play();\n}\n})();",
 "GWM_DAMAGE": "await (async () => {\n    const actor = workflow.actor;\n    if (!workflow.hitTargets?.size || workflow.item?.type !== 'weapon' || !workflow.item.system.properties?.has('hev')) return;\n    if (workflow.workflowOptions?.nixHew) return;                              // the Hew attack is a Bonus Action\n    if (workflow.activity?.activation?.type && workflow.activity.activation.type !== 'action') return;\n    if (combatUtils.inCombat() && game.combat.combatant?.actor?.id !== actor.id) return;   // only on his own turn\n    const pb = actor.system.attributes.prof ?? 0;\n    if (pb) await workflowUtils.bonusDamage(workflow, String(pb), {damageType: workflow.defaultDamageType, ignoreCrit: true});\n})();",
 "GWM_HEW": "await (async () => {\n    const actor = workflow.actor;\n    const item = trigger.entity;\n    if (workflow.item?.type !== 'weapon' || !workflowUtils.isAttackType(workflow, 'meleeWeaponAttack')) return;\n    if (workflow.workflowOptions?.nixHew || workflow.workflowOptions?.nixSentinel) return;\n    const killed = (workflow.damageList ?? []).some(d => (d.oldHP ?? 0) > 0 && (d.newHP ?? 1) <= 0);\n    const crit = workflow.isCritical && workflow.hitTargets?.size;\n    if (!killed && !crit) return;\n    if (combatUtils.inCombat() && MidiQOL.hasUsedBonusAction(actor)) return;\n    const me = workflow.token;\n    if (!me) return;\n    const reach = (workflow.item.system.properties.has('rch') ? 10 : 5);\n    const enemies = canvas.tokens.placeables.filter(t => t.actor && t.id !== me.id && !t.document.hidden\n        && t.document.disposition !== me.document.disposition && (t.actor.system.attributes?.hp?.value ?? 1) > 0\n        && tokenUtils.getDistance(me, t) <= reach);\n    if (!enemies.length) return;\n    const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\n    const why = crit ? 'You scored a Critical Hit' : 'You dropped a creature to 0 HP';\n    const pick = await dialogUtils.selectTargetDialog(item.name + ': Hew',\n        why + '. Make one attack with ' + workflow.item.name + ' as a Bonus Action? Choose the target (or Cancel).', enemies,\n        {skipDeadAndUnconscious: false, coverToken: me, displayDistance: true, userId});\n    const target = pick?.[0];\n    if (!target) return;\n    if (combatUtils.inCombat()) await MidiQOL.setBonusActionUsed(actor);\n    const activity = workflow.activity;\n    setTimeout(() => workflowUtils.syntheticActivityRoll(activity, [target], {options: {workflowOptions: {nixHew: true}}}), 400);\n})();",
 "MAGE_SLAYER": "return await (async () => {\n// Mage Slayer (Guarded Mind): a failed Int/Wis/Cha save can become a success, 1/short rest.\nconst item = trigger.entity;\nconst {roll, saveId} = trigger;\nconst actor = item.actor;\nconst dc = Number(roll?.options?.target);\nif (!dc || roll.total >= dc || !['int', 'wis', 'cha'].includes(saveId)) return;\nif (item.system.uses?.max && !(item.system.uses.value > 0)) return;\nconst userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\nconst ab = CONFIG.DND5E.abilities[saveId]?.label ?? saveId;\nif (!await dialogUtils.confirm(item.name, 'You failed a ' + ab + ' saving throw (' + roll.total + '). \"Fuck it, I succeed anyways\"?', {userId})) return;\nif (item.system.uses?.max) await genericUtils.update(item, {'system.uses.spent': (item.system.uses.spent ?? 0) + 1});\nawait ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + ' shrugs it off and succeeds anyway!'});\nreturn await rollUtils.addToRoll(roll, String(dc - roll.total), {rollData: roll.data});\n})();"
};
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Peri fixes: select Peri\'s token first.');
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
 
// ---- 1. Fairy Magic: Wisdom ------------------------------------------------------------------
{
    const spells = actor.items.filter(i => i.type === 'spell' && /^(faerie fire|enlarge\/reduce|druidcraft)/i.test(i.name.trim())
        && ['innate', 'atwill'].includes(i.system.method ?? i.system.preparation?.mode));
    for (const sp of spells) {
        await sp.update({'system.ability': 'wis'});
        for (const a of sp.system.activities.contents.filter(a => a.type === 'save')) await a.update({'save.dc': {calculation: 'spellcasting', formula: ''}});
    }
    const dc = 8 + actor.system.attributes.prof + actor.system.abilities.wis.mod;
    report.push('<li>Fairy Magic: ' + (spells.map(s => s.name).join(', ') || '<b>no Fairy Magic spells found</b>') + ' now use Wisdom (save DC ' + dc + ').</li>');
}
 
// ---- 2. Copies ----------------------------------------------------------------------------------
const surge = await dedupe(/^wild surge/i, 'Wild Surge');
await dedupe(/^unstable backlash/i, 'Unstable Backlash');
 
// ---- 3. Rage -> Wild Surge -------------------------------------------------------------------
{
    const rage = actor.items.find(i => cprId(i) === 'rage') ?? actor.items.find(i => i.type === 'feat' && /^rage$/i.test(i.name.trim()));
    if (!rage) report.push('<li><b>Rage</b> not found.</li>');
    else if (!surge) report.push('<li>Rage: no Wild Surge feature to trigger.</li>');
    else {
        await setMacros(rage, ['Rage: mark', 'Rage: Wild Surge'], [
            {name: 'Rage: mark', type: 'midi-item', pass: 'preItemRoll', priority: 10, macro: SCRIPTS.RAGE_MARK},
            {name: 'Rage: Wild Surge', type: 'midi-item', pass: 'rollFinished', priority: 400, macro: SCRIPTS.RAGE_SURGE}]);
        report.push('<li>Rage: starting a new Rage now rolls Wild Surge automatically (Chris\'s Premades rolls the d8 and applies the result). Continuing an existing rage does not.'
            + (cprId(surge) === 'wildSurge' ? '' : ' <b>Wild Surge has no Chris\'s Premades automation: apply it in the Medkit so the d8 table works.</b>') + '</li>');
    }
}
 
// ---- 4. Wild Surge animations ----------------------------------------------------------------
if (surge) {
    const cfg = await ensureActivity(surge, 'Configure Surge Animations', 'utility', {
        img: 'icons/magic/symbols/runes-star-pentagon-magenta.webp', activation: {type: 'special', value: null, override: true},
        consumption: {targets: [], scaling: {allowed: false}}, range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Choose the animation for each Wild Surge result.'}});
    await setActivityMacros(surge, cfg, [{name: 'Surge animations: configure', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.SURGE_CONFIG}]);
    await setMacros(surge, ['Surge animations: play'], [{name: 'Surge animations: play', type: 'midi-item', pass: 'rollFinished', priority: 60, macro: SCRIPTS.SURGE_ANIM}]);
    report.push('<li>Wild Surge animations: each of the 8 results plays its own animation (stand-ins are set). Click <b>Wild Surge > Configure Surge Animations</b> to change any of them: '
        + 'paste a Sequencer path (Sequencer\'s Database Viewer lets you browse and click to copy), set the size, and choose Once / Loop while it lasts / None. Tick "Preview" to watch all 8 on his token.</li>');
}
 
// ---- 5. Great Weapon Master (2024) ----------------------------------------------------------
{
    const gwm = find(/great weapon master/i);
    if (!gwm) report.push('<li><b>Great Weapon Master</b> not found.</li>');
    else {
        const old = gwm.effects.filter(e => e.changes.some(c => /bonuses|damage/i.test(c.key)) && !e.disabled);
        for (const e of old) await e.update({disabled: true});
        await setMacros(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew'], [
            {name: 'GWM: Heavy Weapon Mastery', type: 'midi-actor', pass: 'damageRollComplete', priority: 250, macro: SCRIPTS.GWM_DAMAGE},
            {name: 'GWM: Hew', type: 'midi-actor', pass: 'rollFinished', priority: 450, macro: SCRIPTS.GWM_HEW}]);
        report.push('<li>Great Weapon Master: same as Quez. Always on: a Heavy weapon hit on his turn (Attack action) adds his Proficiency Bonus; after a melee critical hit or a kill he is offered a Bonus Action attack.'
            + (old.length ? ' Old toggle effect switched off.' : '') + '</li>');
    }
}
 
// ---- 6. Mage Slayer -------------------------------------------------------------------------
{
    const ms = find(/^mage slayer/i);
    if (!ms) report.push('<li><b>Mage Slayer</b> not found.</li>');
    else {
        if (!ms.system.uses?.max) await ms.update({'system.uses': {max: '1', spent: 0, recovery: [{period: 'sr', type: 'recoverAll'}]}});
        await setMacros(ms, ['Mage Slayer: Guarded Mind'], [{name: 'Mage Slayer: Guarded Mind', type: 'save', pass: 'bonus', priority: 300, macro: SCRIPTS.MAGE_SLAYER}]);
        report.push('<li>Mage Slayer: when he fails an Intelligence, Wisdom or Charisma save he gets the pop-up <i>"Fuck it, I succeed anyways"</i>; yes turns it into a success (once per short or long rest).</li>');
    }
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Peri fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 