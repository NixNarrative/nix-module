// =====================================================================
//  NOX FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Nox selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros for:
//   - Uncanny Metabolism: asked when he rolls initiative (combat / actorPreInitiative)
//   - Self-Restoration: end-of-turn pop-up to end Charmed / Frightened / Poisoned
//   - Giant-Eel Scarf: advantage vs physical grapples and restraints (not spells)
//   - Sentinel (2024): Guardian + Halt (same as Quez: nearbyRollFinished, enemies within 5 ft)
//  Retired on v14 (Chris's Premades 2 does it): Unarmed Strike (Martial Arts die,
//  Dex, Force via Martial Arts + Empowered Strikes), Deflect Attacks (spends the reaction).
//  Darkness (Shadow Arts) comes from the Darkness & Devil's Sight WORLD installer.
//  Removes the inert v13 copies (flags.chris-premades) of these macros.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Nox fixes (v14): select Nox\'s token first.');
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
 
// ---- Uncanny Metabolism: combat / actorPreInitiative / 50 (on the feature) ------------------
// document = the feature. Asks only if it is unused and Focus isn't full.
const uncanny = async () => {
    const feat = document;
    const me = feat.parent;
    if (!me || (feat.system.uses?.max && !(feat.system.uses.value > 0))) return;
    const focus = me.items.find(i => /monk'?s focus|focus points|^ki( points)?$/i.test(i.name.trim()) && i.system.uses?.max);
    if (!focus || !((focus.system.uses.spent ?? 0) > 0)) return;
    const level = me.classes?.monk?.system.levels ?? 0;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm(feat.name, 'Rolling initiative with ' + focus.system.uses.value + '/' + focus.system.uses.max
        + ' Focus Points. Use ' + feat.name + ' to regain all Focus Points and heal Martial Arts die + ' + level + '?', {userId});
    if (!yes) return;
    const heal = feat.system.activities?.find(a => a.type === 'heal');
    const tok = actorUtils.getFirstToken(me)?.object;
    if (heal && tok) await workflowUtils.syntheticActivityRoll(heal, [tok], {consumeUsage: true, consumeResources: true});
    else {
        if (feat.system.uses?.max) await documentUtils.update(feat, {'system.uses.spent': (feat.system.uses.spent ?? 0) + 1});
        const die = me.system.scale?.monk?.['martial-arts']?.die ?? ('1d' + (level >= 17 ? 12 : level >= 11 ? 10 : level >= 5 ? 8 : 6));
        const r = await new Roll(die + ' + ' + level).evaluate();
        await r.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: feat.name + ': healing'});
        const hp = me.system.attributes.hp;
        await documentUtils.update(me, {'system.attributes.hp.value': Math.min(hp.max, hp.value + r.total)});
    }
    // The heal activity restores Focus through its own consumption; make sure it is full either way.
    const fresh = me.items.get(focus.id);
    if ((fresh?.system.uses?.spent ?? 0) > 0) await documentUtils.update(fresh, {'system.uses.spent': 0});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + feat.name + ':</b> ' + me.name + '\'s Focus Points are fully restored.'});
};
 
// ---- Self-Restoration: combat / actorTurnEnd / 50 -------------------------------------------
const selfRestore = async () => {
    const feat = document;
    const me = feat.parent;
    const CONDS = ['charmed', 'frightened', 'poisoned'];
    const has = CONDS.filter(s => me.statuses?.has(s));
    if (!has.length) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const label = s => { const e = CONFIG.statusEffects.find(x => x.id === s); return e?.name ? game.i18n.localize(e.name) : s; };
    const pick = await dialogUtils.buttonDialog(feat.name, 'End of your turn: use ' + feat.name + ' to end one condition?',
        has.map(s => ['End ' + label(s), s]).concat([['Not now', false]]), {userId});
    if (!pick) return;
    for (const e of me.effects.filter(e => e.statuses?.has(pick))) await documentUtils.deleteDocument(e);
    if (me.statuses?.has(pick)) await me.toggleStatusEffect(pick, {active: false});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + feat.name + ':</b> ' + me.name + ' shakes off being ' + label(pick) + '.'});
};
 
// ---- Giant-Eel Scarf ----------------------------------------------------------------------
// save / actorSituational / 50: advantage on saves against a physical grapple or restraint.
const scarfSave = async () => {
    const scarf = document;
    if (scarf.system.attunement && !scarf.system.attuned) return;
    const src = workflowUtils.getSaveSource(config)?.item;
    if (!src || src.type === 'spell' || src.system?.type?.value === 'spellFeature') return;
    const BIND = /grappl|restrain/i;
    const texts = [src.name, String(src.system?.description?.value ?? '')];
    for (const e of src.effects?.contents ?? []) { texts.push(e.name); for (const s of e.statuses ?? []) texts.push(s); }
    for (const a of src.system?.activities?.contents ?? []) texts.push(a.name);
    if (texts.some(t => BIND.test(t))) options.advantage = true;
};
// skill + check / actorSituational / 50: advantage on Athletics / Acrobatics / Str / Dex to escape.
const scarfEscape = async () => {
    const scarf = document;
    if (scarf.system.attunement && !scarf.system.attuned) return;
    const me = scarf.parent;
    const id = (typeof skillId !== 'undefined' && skillId) || (typeof checkId !== 'undefined' && checkId);
    if (!['ath', 'acr', 'str', 'dex'].includes(id)) return;
    const binds = me.effects.filter(e => !e.disabled && (e.statuses?.has('grappled') || e.statuses?.has('restrained')));
    if (!binds.length) return;
    const physical = binds.some(e => {
        const o = e.origin ? fromUuidSync(e.origin, {strict: false}) : null;
        const it = o?.documentName === 'Item' ? o : o?.parent?.documentName === 'Item' ? o.parent : null;
        return !it || (it.type !== 'spell' && it.system?.type?.value !== 'spellFeature');
    });
    if (physical) options.advantage = true;
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
    if (!weapons.length) weapons = me.items.filter(i => i.type === 'weapon' && (i.system.equipped || /^unarmed strike/i.test(i.name)) && i.system.activities?.some(a => a.type === 'attack'));
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
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Unarmed Strike / Empowered Strikes / Deflect Attacks (Chris's Premades 2) ---------------
{
    const strike = actor.items.find(i => i.type === 'weapon' && /^unarmed strike/i.test(i.name.trim()));
    const arts = find(/^martial arts/i);
    const es = findAll(/^empowered strikes/i);
    const da = find(/^deflect attacks/i);
    const bits = [];
    bits.push(premadeOn(arts) === 'cpr2' && premadeOn(strike) === 'cpr2'
        ? 'Unarmed Strike and Martial Arts use Chris\'s Premades 2 (Dex, Martial Arts die). Our v13 change to the strike is not needed.'
        : '<b>Apply Chris\'s Premades 2\'s Unarmed Strike and Martial Arts in the Medkit</b> (Martial Arts swaps in Dex and the Martial Arts die).');
    if (es.length > 1) bits.push('<b>' + es.length + ' Empowered Strikes</b>: keep the Chris\'s Premades 2 one, delete the others.');
    else if (es[0]) bits.push(premadeOn(es[0]) === 'cpr2' ? 'Empowered Strikes (Chris\'s Premades 2) makes the strikes Force.' : '<b>Apply Chris\'s Premades 2\'s Empowered Strikes</b> for Force damage.');
    if (da) bits.push(premadeOn(da) === 'cpr2' ? 'Deflect Attacks is Chris\'s Premades 2 (spends his reaction, so it is once per turn by itself).' : '<b>Apply Chris\'s Premades 2\'s Deflect Attacks</b> in the Medkit.');
    report.push('<li>' + bits.join(' ') + '</li>');
}
 
// ---- 2. Uncanny Metabolism ----------------------------------------------------------------------
{
    const ums = findAll(/^uncanny metabolism/i);
    const um = ums[0];
    if (!um) report.push('<li><b>Uncanny Metabolism</b> not found.</li>');
    else {
        await setCat(um, ['Uncanny Metabolism: initiative'], [entry('Uncanny Metabolism: initiative', 'combat', 'actorPreInitiative', 50, uncanny)]);
        await dropOld(um, ['Uncanny Metabolism: initiative']);
        report.push('<li>Uncanny Metabolism: when he rolls initiative, if he is missing Focus Points and the feature is unused, his player is asked; yes rolls its healing and restores all Focus.'
            + (ums.length > 1 ? ' <b>' + ums.length + ' copies on the sheet</b>: delete all but ' + um.name + ' (the first one has the macro).' : '') + '</li>');
    }
}
 
// ---- 3. Self-Restoration ---------------------------------------------------------------------
{
    const sr = find(/^self-?restoration/i);
    if (!sr) report.push('<li><b>Self-Restoration</b> not found.</li>');
    else {
        await setCat(sr, ['Self-Restoration: end of turn'], [entry('Self-Restoration: end of turn', 'combat', 'actorTurnEnd', 50, selfRestore)]);
        await dropOld(sr, ['Self-Restoration: end of turn']);
        report.push('<li>Self-Restoration: at the end of each of his turns in combat, if he is Charmed, Frightened or Poisoned, his player gets a pop-up to end one of them.</li>');
    }
}
 
// ---- 4. Giant-Eel Scarf --------------------------------------------------------------------------
{
    const scarf = find(/giant[- ]eel scarf/i);
    if (!scarf) report.push('<li><b>Giant-Eel Scarf</b> not found.</li>');
    else {
        const names = ['Scarf: grapple saves', 'Scarf: escape (skill)', 'Scarf: escape (check)'];
        await setCat(scarf, names, [
            entry('Scarf: grapple saves', 'save', 'actorSituational', 50, scarfSave),
            entry('Scarf: escape (skill)', 'skill', 'actorSituational', 50, scarfEscape),
            entry('Scarf: escape (check)', 'check', 'actorSituational', 50, scarfEscape)]);
        await dropOld(scarf, names);
        report.push('<li>Giant-Eel Scarf: Advantage on saves against being Grappled or Restrained, and on Athletics / Acrobatics / Str / Dex checks to escape, only when the source is not a spell.</li>');
    }
}
 
// ---- 5. Sentinel --------------------------------------------------------------------------------
{
    const sen = actor.items.find(i => i.type === 'feat' && /^sentinel\b/i.test(i.name));
    if (!sen) report.push('<li><b>Sentinel</b> not found.</li>');
    else {
        await setCat(sen, ['Sentinel: Guardian'], [entry('Sentinel: Guardian', 'roll', 'nearbyRollFinished', 50, sentinel, {distance: 5, dispositions: 'enemy'})]);
        await dropOld(sen, ['Sentinel: Guardian']);
        report.push('<li>Sentinel: same as Quez. When an enemy within 5 ft hits someone else, he is offered a reaction Opportunity Attack (his Unarmed Strike counts); on a hit its Speed drops to 0 for the turn.</li>');
    }
}
 
// ---- 6. What's left ---------------------------------------------------------------------------
whatsLeft(/^(uncanny metabolism|self-?restoration)/i);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nox fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 