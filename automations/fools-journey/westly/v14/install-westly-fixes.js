// =====================================================================
//  WESTLY FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Westly selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros for:
//   - Radiant / Silent Strike (2d6 Cunning Strikes): condition on a failed save, and
//     Sneak Attack damage turns radiant / necrotic
//   - Panache 5.5: Goad (1d6) and Awe (3d6) Cunning Strikes
//   - Fancy Footwork 5.5 (no Opportunity Attacks from creatures he swung at)
//   - Iysaya's Cloak of the Bat (fly only in dim light / darkness)
//  Lucky is the world Lucky installer. Uncanny Dodge: Chris's Premades 2 spends the
//  reaction itself, so ours is retired. Twin Blades bond, Panache text and Skill
//  Expert merge were one-time v13 changes; this only checks them.
//
//  Chris's Premades 2 runs Cunning Strike from its Sneak Attack automation. We can't
//  read which strike was picked from a documented field, so the damage-type change
//  looks for the picked strike's activity id anywhere CPR2 / CAT store it on the
//  workflow (V14-PORT-FOOLS-JOURNEY.md: confirm at the table).
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Westly fixes (v14): select Westly\'s token first.');
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
const baseName = s => lc(s).replace(/\s*\(\s*\d+d\d+\s*\)\s*$/, '');
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => baseName(a.name) === baseName(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update({name, ...data});
    return actByName(item, name);
}
async function ensureItemEffect(item, tag, data) {
    const old = item.effects.find(e => e.getFlag('world', tag));
    const full = foundry.utils.mergeObject({transfer: false, flags: {world: {[tag]: true}}}, data);
    if (old) { await old.update(full); return item.effects.get(old.id); }
    return (await item.createEmbeddedDocuments('ActiveEffect', [full]))[0];
}
const strikeData = (cost, extra = {}) => foundry.utils.mergeObject({
    activation: {type: 'special', value: null, override: true},
    consumption: {targets: [], scaling: {allowed: false}},
    uses: {max: String(cost), spent: 0, recovery: []},
    range: {units: 'ft', value: '5', override: true},
    target: {affects: {type: 'creature', count: '1'}, override: true},
    duration: {units: 'inst', override: true}
}, extra);
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
const dexDC = {calculation: 'dex', formula: ''};
 
// =====================================================================
//  Macros
// =====================================================================
// Cunning Strike item: roll / actorDamageRollBonuses / 5. Count the damage rolls before Sneak Attack adds its own.
const bladeMark = async () => {
    workflow.nixRollsBeforeSneak ??= workflow.damageRolls?.length ?? 0;
};
// Cunning Strike item: roll / actorDamageRollBonuses / 950. Retype the Sneak Attack dice.
const bladeDamage = async () => {
    const strikes = document.getFlag('world', 'nixBladeStrikes') ?? {};
    const ids = new Set(Object.keys(strikes));
    if (!ids.size) return;
    // Find picked strikes: CPR1 kept them at workflow['chris-premades'].cunningStrike.activities;
    // on Chris's Premades 2 we look for the activity ids anywhere under its / CAT's workflow data.
    const found = [];
    const seen = new WeakSet();
    const DM = foundry.abstract?.DataModel;
    const walk = (o, depth) => {
        if (o == null || depth > 5) return;
        if (typeof o === 'string') { for (const id of ids) if (o === id || o.endsWith('.' + id) || o.endsWith('Activity.' + id)) found.push(id); return; }
        if (typeof o !== 'object' || seen.has(o)) return;
        if (o.documentName || (DM && o instanceof DM)) { if (ids.has(o.id)) found.push(o.id); return; }
        seen.add(o);
        const vals = o instanceof Map ? [...o.values()] : o instanceof Set ? [...o] : Array.isArray(o) ? o : Object.values(o);
        for (const v of vals) walk(v, depth + 1);
    };
    for (const k of Object.keys(workflow)) if (/chris|cat|cunning|strike/i.test(k)) walk(workflow[k], 0);
    const picked = [...new Set(found)];
    if (!picked.length) return;
    const type = strikes[picked[0]]?.kind === 'radiant' ? 'radiant' : 'necrotic';
    const rolls = workflow.damageRolls ?? [];
    const from = workflow.nixRollsBeforeSneak ?? rolls.length;
    let changed = false;
    for (let i = 0; i < rolls.length; i++) {
        const sneaky = i >= from || /sneak/i.test(String(rolls[i].options?.flavor ?? '') + String(rolls[i].options?.itemName ?? ''));
        if (!sneaky) continue;
        rolls[i].options.type = type;
        for (const t of rolls[i].terms) if (t.options && 'flavor' in t.options) t.options.flavor = type;
        changed = true;
    }
    if (changed) await workflow.setDamageRolls(rolls);
};
// Silent Strike activity: roll / activityRollFinished / 50.
const silent = async () => {
    const me = workflow.actor;
    const status = CONFIG.statusEffects.find(s => s.id === 'silenced') ? ['silenced'] : [];
    for (const t of workflow.failedSaves ?? []) {
        if (!t.actor) continue;
        await effectUtils.createEffects(t.actor, [{
            name: 'Silenced (Silent Strike)', img: 'icons/magic/perception/silhouette-stealth-shadow.webp', origin: workflow.item.uuid,
            duration: {value: 1, units: 'rounds'}, statuses: status,
            description: 'Silenced until the start of ' + me.name + '\'s next turn: can\'t speak or cast spells with a Verbal component.',
            system: {changes: [{key: 'flags.midi-qol.fail.spell.vocal', type: 'override', value: '1', priority: 20}]},
            flags: {dae: {specialDuration: ['turnStartSource']}}
        }]);
    }
};
// Radiant Strike activity: roll / activityRollFinished / 50.
const radiant = async () => {
    const me = workflow.actor;
    const noInvis = async () => {
        const fx = document;
        const off = [];
        for (const e of fx.parent.effects) {
            if (e.id === fx.id || e.disabled || !e.statuses?.has('invisible')) continue;
            await e.update({disabled: true});
            off.push(e.uuid);
        }
        if (off.length) await fx.setFlag('world', 'nixRadiantOff', off);
    };
    const invisBack = async () => {
        for (const uuid of document.flags?.world?.nixRadiantOff ?? []) {
            const e = await fromUuid(uuid);
            if (e?.disabled) await e.update({disabled: false});
        }
    };
    const m = (name, pass, fn) => ({name, event: 'effect', pass, macros: [{priority: 50, macro: 'return await (' + fn.toString() + ')();'}]});
    for (const t of workflow.failedSaves ?? []) {
        if (!t.actor) continue;
        await effectUtils.createEffects(t.actor, [{
            name: 'Radiant Strike', img: 'icons/magic/light/explosion-star-glow-yellow.webp', origin: workflow.item.uuid,
            duration: {value: 1, units: 'rounds'},
            description: 'Until the start of ' + me.name + '\'s next turn: sheds Bright Light in a 5-foot radius, attack rolls against it have Advantage, and it can\'t benefit from the Invisible condition.',
            system: {changes: [
                {key: 'token.light.bright', type: 'override', value: '5', priority: 20},
                {key: 'token.light.dim', type: 'override', value: '5', priority: 20},
                {key: 'flags.midi-qol.grants.advantage.attack.all', type: 'override', value: '1', priority: 20}]},
            flags: {
                dae: {specialDuration: ['turnStartSource']},
                cat: {embeddedMacros: [m('Radiant Strike: no invisibility', 'created', noInvis), m('Radiant Strike: invisibility back', 'deleted', invisBack)]}
            }
        }]);
    }
};
// Goad activity: roll / activityRollFinished / 50.
const goad = async () => {
    const westly = workflow.actor;
    for (const t of workflow.failedSaves ?? []) {
        if (!t.actor) continue;
        await effectUtils.createEffects(t.actor, [{
            name: 'Goaded by ' + westly.name, img: 'icons/skills/social/intimidation-impressing.webp', origin: workflow.item.uuid,
            duration: {value: 2, units: 'rounds'},
            description: 'Disadvantage on attack rolls against creatures other than ' + westly.name
                + ', and can\'t make Opportunity Attacks against creatures other than ' + westly.name + ', until the end of its next turn.',
            system: {changes: [{key: 'flags.midi-qol.disadvantage.attack.all', type: 'override', value: 'targetActorId !== "' + westly.id + '"', priority: 20}]},
            flags: {dae: {specialDuration: ['turnEnd']}}
        }]);
    }
};
// Awe activity: roll / activityPreambleComplete / 50. Pick the creatures within 30 ft.
const awe = async () => {
    const mine = workflow.token;
    if (!mine) return;
    const near = canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id && t.visible
        && (t.actor.system.attributes?.hp?.value ?? 1) > 0 && tokenUtils.getDistance(mine.document, t.document) <= 30);
    if (!near.length) { await workflowUtils.updateTargets(workflow, []); return; }
    const first = workflow.targets?.first?.()?.id;
    const preselected = Object.fromEntries(near.map(t => [t.document.id, t.id === first || t.document.disposition !== mine.document.disposition]));
    const userId = queryUtils.firstOwner(workflow.actor, true) ?? game.user.id;
    const pick = await dialogUtils.selectTargetDialog(workflow.activity.name,
        'Choose the creatures within 30 ft that must make a Wisdom save or be Charmed.', near.map(t => t.document),
        {type: 'multiple', maxAmount: near.length, skipDeadAndUnconscious: false, coverToken: mine.document, displayDistance: true, preselected, userId});
    const chosen = (Array.isArray(pick?.[0]) ? pick[0] : []).map(p => (p?.document ?? p)?.object ?? p).filter(Boolean);
    await workflowUtils.updateTargets(workflow, chosen);
};
// Fancy Footwork: roll / actorRollFinished / 60.
const footwork = async () => {
    if (!workflowUtils.isAttackType(workflow, 'meleeAttack')) return;
    const me = workflow.actor;
    for (const t of workflow.targets ?? []) {
        if (!t.actor || t.actor.effects.some(e => e.flags?.world?.nixFootwork === me.id)) continue;
        await effectUtils.createEffects(t.actor, [{
            name: 'Fancy Footwork (' + me.name + ')', img: 'icons/skills/movement/feet-winged-boots-brown.webp', origin: workflow.item.uuid,
            duration: {value: 1, units: 'rounds'},
            description: 'Can\'t make Opportunity Attacks against ' + me.name + ' for the rest of ' + me.name + '\'s turn.',
            system: {changes: [{key: 'flags.gambits-premades.oaSuppression', type: 'override', value: 'true', priority: 20}]},
            flags: {world: {nixFootwork: me.id}, dae: {specialDuration: ['turnEndSource']}}
        }]);
    }
};
// Shared light check for the cloak (pasted into both macros).
const LIGHT_AT = `
    const lightAt = (tok) => {
        const p = tok.document.getCenterPoint?.() ?? tok.center;
        const env = canvas.scene.environment ?? {};
        const dark = canvas.environment?.darknessLevel ?? env.darknessLevel ?? 0;
        const g = canvas.environment?.globalLightSource;
        const globalOn = g ? (g.active && !g.disabled && dark < 1) :
            (env.globalLight?.enabled && dark >= (env.globalLight?.darkness?.min ?? 0) && dark <= (env.globalLight?.darkness?.max ?? 1) && dark < 1);
        let level = 'dark', why = 'no light reaches him (scene darkness ' + Math.round(dark * 100) + '%)';
        if (globalOn) { level = 'bright'; why = 'global illumination (scene darkness ' + Math.round(dark * 100) + '%)'; }
        if (level !== 'bright') {
            const Global = foundry.canvas?.sources?.GlobalLightSource;
            for (const src of canvas.effects.lightSources) {
                if (!src.active || src.isDarkness || src === g || (Global && src instanceof Global)) continue;
                if (src.object?.document?.id === tok.document.id) continue;
                if (!src.shape?.contains?.(p.x, p.y)) continue;
                const r = (src.ratio ?? 0) * (src.shape.config?.radius ?? src.radius ?? 0);
                const name = src.object?.document?.name ?? src.object?.name ?? 'a light';
                if (r > 0 && Math.hypot(p.x - src.data.x, p.y - src.data.y) <= r) { level = 'bright'; why = 'bright light from ' + name; break; }
                level = 'dim'; why = 'dim light from ' + name;
            }
        }
        if (level !== 'dark' && canvas.effects.testInsideDarkness?.(p, tok.document.elevation ?? 0)) { level = 'dark'; why = 'magical darkness'; }
        return {level, why};
    };`;
const withLight = fn => 'return await (async () => {' + LIGHT_AT + '\n    return await (' + fn.toString() + ')();\n})();';
// Cloak item: move / actorMoved and combat / actorEveryTurn. token = his TokenDocument.
const cloakLight = async () => {
    const cloak = document;
    const tok = (token?.object ?? token) ?? actorUtils.getFirstToken(cloak.parent)?.object;
    if (!tok?.document) return;
    const fly = cloak.effects.find(e => e.getFlag('world', 'nixCloakFly'));
    if (!fly || fly.disabled) return;
    const {level, why} = lightAt(tok);
    if (level !== 'bright') return;
    await fly.update({disabled: true});
    await cloak.setFlag('world', 'nixCloakGrip', false);
    ui.notifications.info(cloak.name + ': no longer in dim light or darkness (' + why + '). He loses the fly speed.');
};
// Grip the Cloak activity: roll / activityRollFinished / 50.
const cloakGrip = async () => {
    const cloak = workflow.item;
    const tok = workflow.token ?? actorUtils.getFirstToken(cloak.actor)?.object;
    const fly = cloak.effects.find(e => e.getFlag('world', 'nixCloakFly'));
    if (!fly || !tok) return;
    if (!fly.disabled) {
        await fly.update({disabled: true});
        await cloak.setFlag('world', 'nixCloakGrip', false);
        return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: cloak.actor}), content: '<b>' + cloak.name + ':</b> ' + cloak.actor.name + ' lets go of the cloak and stops flying.'});
    }
    const {level, why} = lightAt(tok);
    if (level === 'bright') return ui.notifications.warn(cloak.name + ': he must be in dim light or darkness to grip the cloak (' + why + ').');
    await fly.update({disabled: false});
    await cloak.setFlag('world', 'nixCloakGrip', true);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: cloak.actor}),
        content: '<b>' + cloak.name + ':</b> ' + cloak.actor.name + ' grips the edges of the cloak: <b>fly speed 40 ft</b> (' + level + ': ' + why + ').'});
};
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 0. Twin Blades bond (made on v13; checked only) ---------------------------------------
const bond = actor.items.find(i => i.getFlag('world', 'nixTwinBond'));
const solaris = find(/^solaris/i), nocturna = find(/^nocturna/i);
if (bond) report.push('<li>Twin Blades bond present' + (bond.system.attuned ? ' and attuned' : ' (<b>not attuned</b>)') + '.</li>');
else if (solaris || nocturna) report.push('<li><b>No Twin Blades bond item.</b> Run the v13 Westly fixes once on v13, or attune the swords directly.</li>');
 
// ---- 1. Cunning Strike: Radiant / Silent Strike, Goad, Awe ------------------------------------
const sneak = actor.items.find(i => /^sneak attack$/i.test(i.name.trim()));
const cs = actor.items.find(i => /^cunning strike$/i.test(i.name.trim()));
if (!cs) report.push('<li><b>Cunning Strike</b> not found: strikes skipped.</li>');
else {
    const radiantAct = await ensureActivity(cs, 'Radiant Strike (2d6)', 'save', strikeData(2, {
        img: 'icons/magic/light/explosion-star-glow-yellow.webp', save: {ability: ['dex'], dc: dexDC}, effects: [],
        description: {chatFlavor: 'Dexterity save or shed Bright Light, attacks against it have Advantage, no Invisible, until the start of your next turn.'}}));
    const silentAct = await ensureActivity(cs, 'Silent Strike (2d6)', 'save', strikeData(2, {
        img: 'icons/magic/perception/silhouette-stealth-shadow.webp', save: {ability: ['wis'], dc: dexDC}, effects: [],
        description: {chatFlavor: 'Wisdom save or Silenced until the start of your next turn.'}}));
    const map = {};
    if (radiantAct) { map[radiantAct.id] = {kind: 'radiant', cost: 2}; await setCat(radiantAct, ['Blade strike effect'], [entry('Blade strike effect', 'roll', 'activityRollFinished', 50, radiant)]); }
    if (silentAct) { map[silentAct.id] = {kind: 'silent', cost: 2}; await setCat(silentAct, ['Blade strike effect'], [entry('Blade strike effect', 'roll', 'activityRollFinished', 50, silent)]); }
    await cs.update({'flags.world.-=nixBladeStrikes': null});
    await cs.setFlag('world', 'nixBladeStrikes', map);
    await setCat(cs, ['Blade strikes: mark', 'Blade strikes: damage'], [
        entry('Blade strikes: mark', 'roll', 'actorDamageRollBonuses', 5, bladeMark),
        entry('Blade strikes: damage', 'roll', 'actorDamageRollBonuses', 950, bladeDamage)]);
    report.push('<li>Radiant Strike and Silent Strike (2d6 each): conditions on a failed save; Sneak Attack damage turns radiant / necrotic (first strike picked wins). <b>(Confirm at the table that the damage type changes; see the checklist.)</b></li>');
 
    const goadAct = await ensureActivity(cs, 'Goad (1d6)', 'save', strikeData(1, {
        img: 'icons/skills/social/intimidation-impressing.webp', save: {ability: ['wis'], dc: dexDC},
        description: {chatFlavor: 'Wisdom save or Goaded until the end of its next turn.'}}));
    await setCat(goadAct, ['Goad'], [entry('Goad', 'roll', 'activityRollFinished', 50, goad)]);
    const charmFx = await ensureItemEffect(cs, 'nixAweFx', {
        name: 'Awed (Charmed)', img: 'icons/magic/control/hypnosis-mesmerism-swirl.webp', statuses: ['charmed'],
        duration: {value: 2, units: 'rounds'}, flags: {dae: {specialDuration: ['turnEndSource']}},
        description: 'Charmed by ' + actor.name + ' until the end of ' + actor.name + '\'s next turn.'});
    const aweAct = await ensureActivity(cs, 'Awe (3d6)', 'save', strikeData(3, {
        img: 'icons/magic/control/hypnosis-mesmerism-swirl.webp', save: {ability: ['wis'], dc: dexDC},
        range: {units: 'ft', value: '30', override: true}, target: {affects: {type: 'creature', count: ''}, override: true},
        effects: [{_id: charmFx.id, onSave: false}],
        description: {chatFlavor: 'Creatures of your choice within 30 ft: Wisdom save or Charmed until the end of your next turn.'}}));
    await setCat(aweAct, ['Awe targets'], [entry('Awe targets', 'roll', 'activityPreambleComplete', 50, awe)]);
    await dropOld(cs, ['Blade strikes: sync', 'Blade strikes: mark', 'Blade strikes: damage', 'Blade strike effect', 'Goad', 'Awe targets']);
    // Activity macros left under activity ids that no longer exist.
    const stale = Object.keys(cs.flags?.['chris-premades']?.embeddedActivityMacros ?? {}).filter(id => !cs.system.activities.get(id));
    for (const id of stale) await cs.update({['flags.chris-premades.embeddedActivityMacros.-=' + id]: null});
    report.push('<li>Panache (5.5): <b>Goad</b> (1d6) and <b>Awe</b> (3d6) in the Cunning Strike menu, save DC 8 + Dex + proficiency.</li>');
    if (premadeOn(sneak) !== 'cpr2') report.push('<li><b>Sneak Attack</b> has no Chris\'s Premades 2 automation: apply it in the Medkit (it runs the Cunning Strike menu on v14).</li>');
    if (premadeOn(cs) === 'cpr1') report.push('<li><b>Check:</b> Cunning Strike still carries the Chris\'s Premades 1 tag. If Chris\'s Premades 2\'s Sneak Attack doesn\'t offer the strike menu, apply Cunning Strike in the Medkit and run this installer again (it re-adds Radiant, Silent, Goad and Awe if the Medkit removes them).</li>');
}
const auto = actor.items.find(i => /^auto sneak attack/i.test(i.name));
if (auto) report.push('<li><b>Check:</b> "' + auto.name + '" (Midi\'s sample item) is on his sheet. With Chris\'s Premades 2\'s Sneak Attack it may add Sneak Attack twice: disable or delete it.</li>');
 
// ---- 2. Fancy Footwork ------------------------------------------------------------------------
const footworkItem = find(/^fancy footwork/i);
if (!footworkItem) report.push('<li><b>Fancy Footwork</b> not found.</li>');
else {
    await setCat(footworkItem, ['Fancy Footwork'], [entry('Fancy Footwork', 'roll', 'actorRollFinished', 60, footwork)]);
    await dropOld(footworkItem, ['Fancy Footwork']);
    report.push('<li>Fancy Footwork: every melee attack stops that creature making Opportunity Attacks against him for the rest of his turn (Gambit\'s).</li>');
}
 
// ---- 3. Uncanny Dodge (Chris's Premades 2 spends the reaction) ------------------------------------
const dodge = find(/^uncanny dodge/i);
if (dodge) {
    await setCat(dodge, ['Uncanny Dodge reaction'], []);
    await dropOld(dodge, ['Uncanny Dodge reaction']);
    report.push('<li>Uncanny Dodge: ' + (premadeOn(dodge) === 'cpr2' ? 'Chris\'s Premades 2 handles it (our reaction marker retired).' : '<b>apply Chris\'s Premades 2\'s Uncanny Dodge in the Medkit</b>.') + '</li>');
}
 
// ---- 4. Lucky: world installer ------------------------------------------------------------------
const lucky = actor.items.find(i => i.type === 'feat' && /^lucky/i.test(i.name.trim()));
if (lucky) report.push('<li>Lucky: run the world <b>Lucky (2024)</b> installer' + ((lucky.flags?.cat?.embeddedMacros ?? []).length ? ' (already applied).' : '.') + '</li>');
 
// ---- 5. Skill Expert / Panache (v13 one-time changes) ---------------------------------------------
const experts = actor.items.filter(i => /skill expert/i.test(i.name));
if (experts.length > 1) report.push('<li><b>' + experts.length + ' Skill Expert items</b>: the v13 fixes merge them; merge by hand on v14.</li>');
const panache = actor.items.find(i => /^panache/i.test(i.name.trim()));
if (panache?.system.activities?.size) report.push('<li><b>Panache</b> still has its old action: delete the activity (Goad and Awe replace it).</li>');
 
// ---- 6. Cloak of the Bat ---------------------------------------------------------------------------
const cloak = find(/cloak of the bat/i);
if (!cloak) report.push('<li><b>Cloak of the Bat</b> not found.</li>');
else {
    const fly = cloak.effects.find(e => e.getFlag('world', 'nixCloakFly'))
        ?? cloak.effects.find(e => (e.system?.changes ?? []).some(c => c.key === 'system.attributes.movement.fly'));
    const flyData = {name: 'Cloak of the Bat: Fly 40 ft', img: cloak.img, transfer: true, disabled: true,
        description: 'Fly speed 40 ft while gripping the cloak in dim light or darkness. Lost in bright light.',
        system: {changes: [{key: 'system.attributes.movement.fly', type: 'upgrade', value: '40', priority: 20}]},
        flags: {world: {nixCloakFly: true}}};
    if (fly) await fly.update({...flyData, disabled: fly.disabled}); else await cloak.createEmbeddedDocuments('ActiveEffect', [flyData]);
    const grip = await ensureActivity(cloak, 'Grip the Cloak', 'utility', {
        img: cloak.img, activation: {type: 'special', value: null, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true}});
    await setCat(grip, ['Grip the Cloak'], [{name: 'Grip the Cloak', event: 'roll', pass: 'activityRollFinished', macros: [{priority: 50, macro: withLight(cloakGrip)}]}]);
    await setCat(cloak, ['Cloak of the Bat light (move)', 'Cloak of the Bat light (turn)'], [
        {name: 'Cloak of the Bat light (move)', event: 'move', pass: 'actorMoved', macros: [{priority: 50, macro: withLight(cloakLight)}]},
        {name: 'Cloak of the Bat light (turn)', event: 'combat', pass: 'actorEveryTurn', macros: [{priority: 50, macro: withLight(cloakLight)}]}]);
    await dropOld(cloak, ['Grip the Cloak', 'Cloak of the Bat light (move)', 'Cloak of the Bat light (turn)']);
    report.push('<li>Cloak of the Bat: <b>Grip the Cloak</b> toggles the 40 ft fly speed, only in dim light or darkness; moving into bright light drops it.</li>');
}
 
// ---- 7. Leftovers ------------------------------------------------------------------------------------
{
    const later = [];
    const hat = find(/fancy hat/i);
    if (hat && (hat.flags?.['chris-premades']?.embeddedMacros ?? []).length) { await hat.update({'flags.chris-premades.embeddedMacros': []}); }
    const auras = actor.effects.filter(e => /^aura of (protection|courage)/i.test(e.name));
    if (auras.length) later.push('Aura effects on him (' + auras.map(e => e.name).join(', ') + ') come from a Paladin nearby when exported; nothing to do.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Westly fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 