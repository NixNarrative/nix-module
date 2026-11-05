// =====================================================================
//  PERI FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Perritwinkle selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//  Run it AFTER applying Chris's Premades 2's Rage and Wild Surge in the Medkit
//  (the Medkit rebuilds those items and would wipe what this writes).
//
//  CAT embedded macros for:
//   - Rage -> Wild Surge: a new Rage rolls Wild Surge (skipped if Chris's Premades 2 already did)
//   - Wild Surge animations: one per d8 result; "Configure Surge Animations" (DialogV2 form)
//   - Great Weapon Master (2024): same as Quez (actorDamageRollBonuses + Hew)
//   - Mage Slayer: Guarded Mind pop-up on a failed Int/Wis/Cha save (save / actorBonus)
//  Data only: Fairy Magic (Faerie Fire, Enlarge/Reduce, Druidcraft) uses Wisdom.
//  Chris's Premades 2 only has the 2014 (legacy) Wild Surge; its 8 results match.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Peri fixes (v14): select Peri\'s token first.');
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
 
const SURGE_KEYS = ['shadowyTendrils', 'teleport', 'intangibleSpirit', 'magicInfusion', 'retribution', 'protectiveLights', 'flowersAndVines', 'boltOfLight'];
const SURGE_LABELS = ['1: Shadowy Tendrils', '2: Teleport', '3: Intangible Spirit', '4: Magic Infusion', '5: Retribution', '6: Protective Lights', '7: Flowers and Vines', '8: Bolt of Light'];
const SURGE_DEFAULTS = {
    shadowyTendrils: {file: 'jb2a.arms_of_hadar.dark_purple', size: 12, mode: 'once'},
    teleport: {file: 'jb2a.misty_step.01.purple', size: 2, mode: 'once'},
    intangibleSpirit: {file: 'jb2a.magic_signs.circle.02.conjuration.complete.pink', size: 3, mode: 'once'},
    magicInfusion: {file: 'jb2a.static_electricity.03.purple', size: 2, mode: 'loop'},
    retribution: {file: 'jb2a.shield_themed.above.eldritch_web.01.dark_purple', size: 2, mode: 'loop'},
    protectiveLights: {file: 'jb2a.bless.400px.loop.purple', size: 5, mode: 'loop'},
    flowersAndVines: {file: 'jb2a.plant_growth.02.round.4x4.complete.greenred', size: 7, mode: 'loop'},
    boltOfLight: {file: 'jb2a.divine_smite.caster.yellowwhite', size: 2.5, mode: 'once'}
};
const SURGE_SHARED = 'const SURGE_KEYS = ' + JSON.stringify(SURGE_KEYS) + ';\nconst SURGE_LABELS = ' + JSON.stringify(SURGE_LABELS) + ';\nconst SURGE_DEFAULTS = ' + JSON.stringify(SURGE_DEFAULTS) + ';';
const withSurge = fn => 'return await (async () => {\n' + SURGE_SHARED + '\n    return await (' + fn.toString() + ')();\n})();';
 
// ---- Rage -> Wild Surge ------------------------------------------------------------------------
// roll / itemPreItemRoll / 10 on Rage: remember which rage effects existed.
const rageMark = async () => {
    const isRage = e => !e.disabled && (e.flags?.cat?.identifier === 'rage' || e.flags?.['chris-premades']?.info?.identifier === 'rage' || /^rag(e|ing)\b/i.test(e.name.trim()));
    workflow.nixRageBefore = workflow.actor.effects.filter(isRage).map(e => e.id);
    workflow.nixRageAt = Date.now();
};
// roll / itemRollFinished / 400 on Rage: a NEW rage rolls Wild Surge, unless something already did.
const rageSurge = async () => {
    const me = workflow.actor;
    if (!Array.isArray(workflow.nixRageBefore)) return;
    const isRage = e => !e.disabled && (e.flags?.cat?.identifier === 'rage' || e.flags?.['chris-premades']?.info?.identifier === 'rage' || /^rag(e|ing)\b/i.test(e.name.trim()));
    let rage = me.effects.find(e => isRage(e) && !workflow.nixRageBefore.includes(e.id));
    if (!rage) { await genericUtils.sleep(600); rage = me.effects.find(e => isRage(e) && !workflow.nixRageBefore.includes(e.id)); }
    if (!rage) return;
    const surge = me.items.find(i => /^wild surge$/i.test(i.name.trim()));
    if (!surge) return;
    const act = surge.system.activities.contents.find(a => /^wild surge$/i.test(a.name ?? '')) ?? surge.system.activities.contents.find(a => !/configure/i.test(a.name ?? ''));
    if (!act) return;
    await genericUtils.sleep(900);
    const since = workflow.nixRageAt ?? Date.now() - 5000;
    const already = game.messages.contents.slice(-10).some(m => (m.timestamp ?? 0) >= since && m.speaker?.actor === me.id
        && (/wild surge/i.test(String(m.flavor ?? '') + String(m.content ?? '')) || m.rolls?.some(r => r.dice?.[0]?.faces === 8)));
    if (already) return;
    await workflowUtils.syntheticActivityRoll(act, [], {consumeResources: false});
};
 
// ---- Wild Surge animations ---------------------------------------------------------------------
// roll / activityRollFinished / 50 on "Configure Surge Animations".
const surgeConfig = async () => {
    const surge = workflow.item;
    const saved = surge.flags?.world?.nixSurgeAnims ?? {};
    const cur = k => ({...SURGE_DEFAULTS[k], ...(saved[k] ?? {})});
    const esc = s => foundry.utils.escapeHTML(String(s ?? ''));
    const rows = SURGE_KEYS.map((k, i) => {
        const c = cur(k);
        const opt = (v, l) => '<option value="' + v + '"' + (c.mode === v ? ' selected' : '') + '>' + l + '</option>';
        return '<tr><td style="white-space:nowrap">' + SURGE_LABELS[i] + '</td>'
            + '<td><input type="text" name="' + k + '_file" value="' + esc(c.file) + '" style="width:100%"></td>'
            + '<td><input type="number" step="0.5" name="' + k + '_size" value="' + esc(c.size) + '" style="width:4.5em"></td>'
            + '<td><select name="' + k + '_mode">' + opt('once', 'Once') + opt('loop', 'Loop while it lasts') + opt('none', 'None') + '</select></td></tr>';
    }).join('');
    const content = '<p>Paste a Sequencer database path (Sequencer > Database Viewer, click a name to copy it) or a file path for each result. Size is in grid squares.</p>'
        + '<table><tr><th>Result</th><th>Animation</th><th>Size</th><th>Play</th></tr>' + rows + '</table>'
        + '<label><input type="checkbox" name="preview"> Preview all 8 on this token after saving</label>';
    const res = await foundry.applications.api.DialogV2.prompt({
        window: {title: surge.name + ': Surge Animations'}, position: {width: 760}, content, rejectClose: false,
        ok: {label: 'Save', callback: (event, button) => {
            const f = button.form.elements;
            const out = {};
            for (const k of SURGE_KEYS) out[k] = {file: String(f[k + '_file']?.value ?? '').trim(), size: Number(f[k + '_size']?.value) || SURGE_DEFAULTS[k].size, mode: f[k + '_mode']?.value ?? SURGE_DEFAULTS[k].mode};
            return {out, preview: !!f.preview?.checked};
        }}});
    if (!res?.out) return;
    await surge.setFlag('world', 'nixSurgeAnims', res.out);
    ui.notifications.info(surge.name + ': surge animations saved.');
    if (!res.preview || !globalThis.Sequencer) return;
    const tok = workflow.token ?? actorUtils.getFirstToken(surge.actor)?.object;
    if (!tok) return;
    for (const [i, k] of SURGE_KEYS.entries()) {
        const c = res.out[k];
        if (!c.file || c.mode === 'none') continue;
        ui.notifications.info('Preview ' + SURGE_LABELS[i]);
        try { await new Sequence().effect().file(c.file).atLocation(tok).size(c.size, {gridUnits: true}).duration(2500).play(); } catch (err) { ui.notifications.warn(SURGE_LABELS[i] + ': ' + err.message); }
        await genericUtils.sleep(2800);
    }
};
// roll / itemRollFinished / 60 on Wild Surge: after the d8 is rolled, play that result's animation.
const surgeAnim = async () => {
    const surge = document;
    const me = surge.parent;
    if (/configure/i.test(workflow.activity?.name ?? '')) return;
    if (!globalThis.Sequencer) return;
    await genericUtils.sleep(400);
    const d8 = r => r?.dice?.[0]?.faces === 8 ? Number(r.total) : NaN;
    let n = [...(workflow.utilityRolls ?? []), workflow.utilityRoll, ...(workflow.damageRolls ?? [])].map(d8).find(v => v >= 1 && v <= 8);
    if (!n) {
        const since = Date.now() - 20000;
        const msg = game.messages.contents.slice(-15).reverse().find(m => (m.timestamp ?? 0) > since && m.speaker?.actor === me.id && d8(m.rolls?.[0]) >= 1);
        n = d8(msg?.rolls?.[0]);
    }
    if (!(n >= 1 && n <= 8)) return;
    const key = SURGE_KEYS[n - 1];
    const cfg = {...SURGE_DEFAULTS[key], ...(surge.flags?.world?.nixSurgeAnims?.[key] ?? {})};
    if (!cfg.file || cfg.mode === 'none') return;
    const tok = workflow.token ?? actorUtils.getFirstToken(me)?.object;
    if (!tok) return;
    let ok = false;
    try { ok = Sequencer.Database.entryExists(cfg.file) || /\.(webm|webp|png|gif|mp4)$/i.test(cfg.file); } catch {}
    if (!ok) return ui.notifications.warn(surge.name + ': animation "' + cfg.file + '" not found. Fix it in Configure Surge Animations.');
    const NAME = 'WildSurge ' + me.id;
    await Sequencer.EffectManager.endEffects({name: NAME});
    const e = new Sequence().effect().file(cfg.file).size(Number(cfg.size) || 2, {gridUnits: true});
    if (cfg.mode !== 'loop') return void await e.atLocation(tok).play();
    e.attachTo(tok).belowTokens().fadeIn(400).fadeOut(400).persist().name(NAME);
    await e.play();
    await genericUtils.sleep(500);
    // End the loop with the surge's own effect if there is one, else with the rage.
    const recent = me.effects.filter(x => String(x.origin ?? '').startsWith(surge.uuid)).at(-1);
    const isRage = x => !x.disabled && (x.flags?.cat?.identifier === 'rage' || /^rag(e|ing)\b/i.test(x.name.trim()));
    const holder = recent ?? me.effects.find(isRage);
    if (!holder) return;
    const list = foundry.utils.deepClone(holder.flags?.cat?.embeddedMacros ?? []).filter(m => m.name !== 'Wild Surge animation end');
    list.push({name: 'Wild Surge animation end', event: 'effect', pass: 'deleted',
        macros: [{priority: 50, macro: 'return await (async () => { await Sequencer.EffectManager.endEffects({name: ' + JSON.stringify(NAME) + '}); })();'}]});
    await documentUtils.update(holder, {'flags.cat.embeddedMacros': list});
};
 
// ---- Great Weapon Master (same as Quez) --------------------------------------------------------
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
 
// ---- Mage Slayer (Guarded Mind): save / actorBonus / 300 --------------------------------------
// A failed Int/Wis/Cha save can become a success, 1/short rest. Returning a Roll replaces the save.
const mageSlayer = async () => {
    const feat = document;
    const me = feat.parent;
    const dc = Number(roll?.options?.target ?? config?.target);
    if (!roll || !dc || roll.total >= dc || !['int', 'wis', 'cha'].includes(saveId)) return;
    if (feat.system.uses?.max && !(feat.system.uses.value > 0)) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const ab = CONFIG.DND5E.abilities[saveId]?.label ?? saveId;
    if (!await dialogUtils.confirm(feat.name, 'You failed a ' + ab + ' saving throw (' + roll.total + '). "Fuck it, I succeed anyways"?', {userId})) return;
    if (feat.system.uses?.max) await documentUtils.update(feat, {'system.uses.spent': (feat.system.uses.spent ?? 0) + 1});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + feat.name + ':</b> ' + me.name + ' shrugs it off and succeeds anyway!'});
    const extra = await new Roll(String(dc - roll.total)).evaluate();
    const out = MidiQOL.addRollTo(roll, extra);
    out.data = roll.data;
    return out;
};
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Fairy Magic: Wisdom (data only) --------------------------------------------------------
{
    const spells = actor.items.filter(i => i.type === 'spell' && /^(faerie fire|enlarge\/reduce|druidcraft)/i.test(i.name.trim())
        && (['innate', 'atwill'].includes(i.system.method ?? i.system.preparation?.mode) || /^druidcraft/i.test(i.name.trim())));
    for (const sp of spells) {
        if (sp.system.ability !== 'wis') await sp.update({'system.ability': 'wis'});
        for (const a of sp.system.activities.contents.filter(a => a.type === 'save')) await a.update({'save.dc': {calculation: 'spellcasting', formula: ''}});
    }
    report.push('<li>Fairy Magic: ' + (spells.map(s => s.name).join(', ') || '<b>no Fairy Magic spells found</b>') + ' use Wisdom (save DC 8 + PB + Wis).</li>');
}
 
// ---- 2. Rage -> Wild Surge ------------------------------------------------------------------------
const surge = actor.items.find(i => i.type === 'feat' && /^wild surge$/i.test(i.name.trim())) ?? find(/^wild surge/i);
{
    const rage = actor.items.find(i => i.type === 'feat' && /^rage$/i.test(i.name.trim()));
    if (!rage) report.push('<li><b>Rage</b> not found.</li>');
    else if (!surge) report.push('<li>Rage: no Wild Surge feature to trigger.</li>');
    else {
        await setCat(rage, ['Rage: mark', 'Rage: Wild Surge'], [
            entry('Rage: mark', 'roll', 'itemPreItemRoll', 10, rageMark),
            entry('Rage: Wild Surge', 'roll', 'itemRollFinished', 400, rageSurge)]);
        await dropOld(rage, ['Rage: mark', 'Rage: Wild Surge']);
        report.push('<li>Rage: starting a new Rage rolls Wild Surge (unless Chris\'s Premades 2 already rolled it for that rage). Continuing a rage does not.'
            + (premadeOn(rage) === 'cpr2' ? '' : ' <b>Rage is still Chris\'s Premades 1\'s</b>: apply Chris\'s Premades 2\'s Rage in the Medkit (the damage bonus and resistances need it), then run this again.')
            + (premadeOn(surge) === 'cpr2' ? '' : ' <b>Wild Surge has no Chris\'s Premades 2 automation</b>: apply its (legacy, 2014) Wild Surge in the Medkit so the d8 table works, then run this again.') + '</li>');
    }
}
 
// ---- 3. Wild Surge animations ---------------------------------------------------------------------
if (surge) {
    const cfg = await ensureActivity(surge, 'Configure Surge Animations', 'utility', {
        img: 'icons/magic/symbols/runes-star-pentagon-magenta.webp', activation: {type: 'special', value: null, override: true},
        consumption: {targets: [], scaling: {allowed: false}}, range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Choose the animation for each Wild Surge result.'}});
    if (cfg) await setCat(cfg, ['Surge animations: configure'], [{name: 'Surge animations: configure', event: 'roll', pass: 'activityRollFinished', macros: [{priority: 50, macro: withSurge(surgeConfig)}]}]);
    await setCat(surge, ['Surge animations: play'], [{name: 'Surge animations: play', event: 'roll', pass: 'itemRollFinished', macros: [{priority: 60, macro: withSurge(surgeAnim)}]}]);
    await dropOld(surge, ['Surge animations: play', 'Surge animations: configure']);
    report.push('<li>Wild Surge animations: each of the 8 results plays its own animation (stand-ins are set; your v13 choices are kept). <b>Wild Surge > Configure Surge Animations</b> changes them: '
        + 'paste a Sequencer path, set the size, Once / Loop while it lasts / None; tick Preview to watch all 8.</li>');
}
 
// ---- 4. Great Weapon Master (2024) ---------------------------------------------------------------
{
    const gwm = find(/great weapon master/i);
    if (!gwm) report.push('<li><b>Great Weapon Master</b> not found.</li>');
    else if (premadeOn(gwm) === 'cpr2') {
        await setCat(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew'], []);
        await dropOld(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew']);
        report.push('<li>Great Weapon Master uses Chris\'s Premades 2 (ours removed).</li>');
    } else {
        const old = gwm.effects.filter(e => (e.system?.changes ?? []).some(c => /bonuses|damage/i.test(c.key)) && !e.disabled);
        for (const e of old) await e.update({disabled: true});
        await setCat(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew'], [
            entry('GWM: Heavy Weapon Mastery', 'roll', 'actorDamageRollBonuses', 250, gwmDamage),
            entry('GWM: Hew', 'roll', 'actorRollFinished', 450, gwmHew)]);
        await dropOld(gwm, ['GWM: Heavy Weapon Mastery', 'GWM: Hew']);
        const toggle = actor.effects.filter(e => /great weapon master/i.test(e.name) && !e.disabled);
        report.push('<li>Great Weapon Master: same as Quez. +Proficiency Bonus on Heavy weapon hits (Attack action, his turn); Hew after a melee crit or a kill.'
            + (old.length ? ' Old toggle effect switched off.' : '') + (toggle.length ? ' <b>A "Great Weapon Master" effect is active on him</b>: delete it, or damage gets the bonus twice.' : '') + '</li>');
    }
}
 
// ---- 5. Mage Slayer -------------------------------------------------------------------------------
{
    const ms = find(/^mage slayer/i);
    if (!ms) report.push('<li><b>Mage Slayer</b> not found.</li>');
    else {
        if (!ms.system.uses?.max) await ms.update({'system.uses': {max: '1', spent: 0, recovery: [{period: 'sr', type: 'recoverAll'}]}});
        await setCat(ms, ['Mage Slayer: Guarded Mind'], [entry('Mage Slayer: Guarded Mind', 'save', 'actorBonus', 300, mageSlayer)]);
        await dropOld(ms, ['Mage Slayer: Guarded Mind']);
        report.push('<li>Mage Slayer: when he fails an Intelligence, Wisdom or Charisma save he gets the pop-up <i>"Fuck it, I succeed anyways"</i>; yes turns it into a success (once per short or long rest). Gambit\'s Mage Slayer effect (concentration) is left as it is.</li>');
    }
}
 
// ---- 6. What's left ----------------------------------------------------------------------------
whatsLeft(/^(rage|wild surge|great weapon master|mage slayer)$/i);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Peri fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 