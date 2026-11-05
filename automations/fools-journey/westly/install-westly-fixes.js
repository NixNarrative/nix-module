// =====================================================================
//  WESTLY FIXES: one-click INSTALLER (Script macro, run as GM)
//  Select Westly's token, then run. Safe to re-run.
//   - Radiant / Silent Strike: 2d6 Cunning Strikes (no charges), Sneak Attack becomes radiant / necrotic
//   - Panache 5.5: Goad and Awe Cunning Strikes (old Panache action removed)
//   - Fancy Footwork 5.5, Uncanny Dodge uses his reaction, Lucky
//   - Skill Expert merged into one item
//   - Cloak of the Bat (fly in dim light / darkness)
//   - Twin Blades bond: one attunement slot for both swords
// =====================================================================
const SCRIPTS = {
 "BLADE_MARK": "await (async () => {\n    workflow.nixRollsBeforeSneak = workflow.damageRolls?.length ?? 0;\n})();",
 "BLADE_DAMAGE": "await (async () => {\n    const chosen = workflow['chris-premades']?.cunningStrike?.activities ?? [];\n    if (!chosen.length) return;\n    const kinds = [];\n    for (const uuid of chosen) {\n        const a = await fromUuid(uuid);\n        const info = a?.item?.getFlag('world', 'nixBladeStrikes')?.[a.id];\n        if (info) kinds.push(info.kind);\n    }\n    if (!kinds.length) return;\n    // The first weapon strike picked sets the Sneak Attack damage type.\n    const type = kinds[0] === 'radiant' ? 'radiant' : 'necrotic';\n    const rolls = workflow.damageRolls ?? [];\n    const from = workflow.nixRollsBeforeSneak ?? rolls.length;\n    if (rolls.length <= from) return;                       // every Sneak Attack die was traded away\n    for (let i = from; i < rolls.length; i++) {\n        rolls[i].options.type = type;\n        for (const t of rolls[i].terms) if (t.options && 'flavor' in t.options) t.options.flavor = type;\n    }\n    await workflow.setDamageRolls(rolls);\n})();",
 "SILENT": "await (async () => {\n    const me = workflow.actor;\n    const status = CONFIG.statusEffects.find(s => s.id === 'silenced') ? ['silenced'] : [];\n    for (const t of workflow.failedSaves ?? []) {\n        if (!t.actor) continue;\n        await effectUtils.createEffect(t.actor, {\n            name: 'Silenced (Silent Strike)', img: 'icons/magic/perception/silhouette-stealth-shadow.webp', origin: workflow.item.uuid,\n            duration: {rounds: 1}, statuses: status,\n            description: 'Silenced until the start of ' + me.name + '\\'s next turn: can\\'t speak or cast spells with a Verbal component.',\n            changes: [{key: 'flags.midi-qol.fail.spell.vocal', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '1', priority: 20}],\n            flags: {dae: {specialDuration: ['turnStartSource']}}\n        });\n    }\n})();",
 "RADIANT": "await (async () => {\n    const me = workflow.actor;\n    const OV = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;\n    for (const t of workflow.failedSaves ?? []) {\n        if (!t.actor) continue;\n        await effectUtils.createEffect(t.actor, {\n            name: 'Radiant Strike', img: 'icons/magic/light/explosion-star-glow-yellow.webp', origin: workflow.item.uuid,\n            duration: {rounds: 1},\n            description: 'Until the start of ' + me.name + '\\'s next turn: sheds Bright Light in a 5-foot radius, attack rolls against it have Advantage, and it can\\'t benefit from the Invisible condition.',\n            changes: [\n                {key: 'ATL.light.bright', mode: OV, value: '5', priority: 20},\n                {key: 'ATL.light.dim', mode: OV, value: '5', priority: 20},\n                {key: 'flags.midi-qol.grants.advantage.attack.all', mode: OV, value: '1', priority: 20}],\n            flags: {\n                dae: {specialDuration: ['turnStartSource']},\n                'chris-premades': {embeddedMacros: [\n                    {name: 'Radiant Strike: no invisibility', type: 'effect', pass: 'created', priority: 50, macro: \"await (async () => {\\n    const fx = trigger.entity;\\n    const actor = fx.parent;\\n    const off = [];\\n    for (const e of actor.effects) {\\n        if (e.id === fx.id || e.disabled || !e.statuses?.has('invisible')) continue;\\n        await e.update({disabled: true});\\n        off.push(e.uuid);\\n    }\\n    if (off.length) await fx.setFlag('world', 'nixRadiantOff', off);\\n})();\"},\n                    {name: 'Radiant Strike: invisibility back', type: 'effect', pass: 'deleted', priority: 50, macro: \"await (async () => {\\n    for (const uuid of trigger.entity.flags?.world?.nixRadiantOff ?? []) {\\n        const e = await fromUuid(uuid);\\n        if (e?.disabled) await e.update({disabled: false});\\n    }\\n})();\"}]}\n            }\n        });\n    }\n})();",
 "GOAD": "await (async () => {\n    const westly = workflow.actor;\n    for (const t of workflow.failedSaves ?? []) {\n        if (!t.actor) continue;\n        await effectUtils.createEffect(t.actor, {\n            name: 'Goaded by ' + westly.name, img: 'icons/skills/social/intimidation-impressing.webp', origin: workflow.item.uuid,\n            duration: {rounds: 2},\n            description: 'Disadvantage on attack rolls against creatures other than ' + westly.name\n                + ', and can\\'t make Opportunity Attacks against creatures other than ' + westly.name + ', until the end of its next turn.',\n            changes: [{key: 'flags.midi-qol.disadvantage.attack.all', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,\n                value: 'targetActorId !== \"' + westly.id + '\"', priority: 20}],\n            flags: {dae: {specialDuration: ['turnEnd']}}\n        });\n    }\n})();",
 "AWE": "await (async () => {\n    const me = workflow.token;\n    if (!me) return;\n    const near = canvas.tokens.placeables.filter(t => t.actor && t.id !== me.id && t.visible\n        && (t.actor.system.attributes?.hp?.value ?? 1) > 0 && tokenUtils.getDistance(me, t) <= 30);\n    if (!near.length) { await workflowUtils.updateTargets(workflow, []); return; }\n    const first = workflow.targets?.first?.()?.id;\n    const preselected = Object.fromEntries(near.map(t => [t.id, t.id === first || t.document.disposition !== me.document.disposition]));\n    const userId = socketUtils.firstOwner(workflow.actor, true) ?? game.user.id;\n    const pick = await dialogUtils.selectTargetDialog(workflow.activity.name,\n        'Choose the creatures within 30 ft that must make a Wisdom save or be Charmed.', near,\n        {type: 'multiple', maxAmount: near.length, skipDeadAndUnconscious: false, coverToken: me, displayDistance: true, preselected, userId});\n    const chosen = Array.isArray(pick?.[0]) ? pick[0] : [];\n    await workflowUtils.updateTargets(workflow, chosen);\n})();",
 "FOOTWORK": "await (async () => {\n    if (!workflowUtils.isAttackType(workflow, 'meleeAttack')) return;\n    const me = workflow.actor;\n    for (const t of workflow.targets ?? []) {\n        if (!t.actor || t.actor.effects.some(e => e.flags?.world?.nixFootwork === me.id)) continue;\n        await effectUtils.createEffect(t.actor, {\n            name: 'Fancy Footwork (' + me.name + ')', img: 'icons/skills/movement/feet-winged-boots-brown.webp', origin: workflow.item.uuid,\n            duration: {rounds: 1},\n            description: 'Can\\'t make Opportunity Attacks against ' + me.name + ' for the rest of ' + me.name + '\\'s turn.',\n            // Gambit's Premades: no opportunity attacks from this creature while the effect lasts (only Westly's turn).\n            changes: [{key: 'flags.gambits-premades.oaSuppression', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: 'true', priority: 20}],\n            flags: {world: {nixFootwork: me.id}, dae: {specialDuration: ['turnEndSource']}}\n        });\n    }\n})();",
 "UNCANNY": "await (async () => {\n    if (!actorUtils.hasUsedReaction(workflow.actor)) await actorUtils.setReactionUsed(workflow.actor);\n})();",
 "CLOAK_LIGHT": "await (async () => {\n    const lightAt = (token) => {\n        const p = token.document.getCenterPoint?.() ?? token.center;\n        const env = canvas.scene.environment ?? {};\n        const dark = canvas.environment?.darknessLevel ?? env.darknessLevel ?? 0;\n        const g = canvas.environment?.globalLightSource;\n        // Global illumination: trust Foundry's own \"is it on right now\" when it has one, else the scene settings.\n        const globalOn = g ? (g.active && !g.disabled && dark < 1) :\n            (env.globalLight?.enabled && dark >= (env.globalLight?.darkness?.min ?? 0) && dark <= (env.globalLight?.darkness?.max ?? 1) && dark < 1);\n        let level = 'dark', why = 'no light reaches him (scene darkness ' + Math.round(dark * 100) + '%)';\n        if (globalOn) { level = 'bright'; why = 'global illumination (scene darkness ' + Math.round(dark * 100) + '%)'; }\n        if (level !== 'bright') {\n            const Global = foundry.canvas?.sources?.GlobalLightSource;\n            for (const src of canvas.effects.lightSources) {\n                if (!src.active || src.isDarkness || src === g || (Global && src instanceof Global)) continue;\n                if (src.object?.document?.id === token.document.id) continue;          // ignore his own token light\n                if (!src.shape?.contains?.(p.x, p.y)) continue;\n                const r = (src.ratio ?? 0) * (src.shape.config?.radius ?? src.radius ?? 0);\n                const name = src.object?.document?.name ?? src.object?.name ?? 'a light';\n                if (r > 0 && Math.hypot(p.x - src.data.x, p.y - src.data.y) <= r) { level = 'bright'; why = 'bright light from ' + name; break; }\n                level = 'dim'; why = 'dim light from ' + name;\n            }\n        }\n        if (level !== 'dark' && canvas.effects.testInsideDarkness?.(p, token.document.elevation ?? 0)) { level = 'dark'; why = 'magical darkness'; }\n        return {level, why};\n    };\n    const cloak = trigger.entity;\n    const token = trigger.token?.document ? trigger.token : (trigger.token?.object ?? actorUtils.getFirstToken(cloak.actor));\n    if (!token?.document) return;\n    const fly = cloak.effects.find(e => e.getFlag('world', 'nixCloakFly'));\n    if (!fly || fly.disabled) return;                                        // not gripping: nothing to do\n    const {level, why} = lightAt(token);\n    if (level !== 'bright') return;\n    await fly.update({disabled: true});\n    await cloak.setFlag('world', 'nixCloakGrip', false);\n    ui.notifications.info(cloak.name + ': no longer in dim light or darkness (' + why + '). He loses the fly speed.');\n})();",
 "CLOAK_GRIP": "await (async () => {\n    const lightAt = (token) => {\n        const p = token.document.getCenterPoint?.() ?? token.center;\n        const env = canvas.scene.environment ?? {};\n        const dark = canvas.environment?.darknessLevel ?? env.darknessLevel ?? 0;\n        const g = canvas.environment?.globalLightSource;\n        // Global illumination: trust Foundry's own \"is it on right now\" when it has one, else the scene settings.\n        const globalOn = g ? (g.active && !g.disabled && dark < 1) :\n            (env.globalLight?.enabled && dark >= (env.globalLight?.darkness?.min ?? 0) && dark <= (env.globalLight?.darkness?.max ?? 1) && dark < 1);\n        let level = 'dark', why = 'no light reaches him (scene darkness ' + Math.round(dark * 100) + '%)';\n        if (globalOn) { level = 'bright'; why = 'global illumination (scene darkness ' + Math.round(dark * 100) + '%)'; }\n        if (level !== 'bright') {\n            const Global = foundry.canvas?.sources?.GlobalLightSource;\n            for (const src of canvas.effects.lightSources) {\n                if (!src.active || src.isDarkness || src === g || (Global && src instanceof Global)) continue;\n                if (src.object?.document?.id === token.document.id) continue;          // ignore his own token light\n                if (!src.shape?.contains?.(p.x, p.y)) continue;\n                const r = (src.ratio ?? 0) * (src.shape.config?.radius ?? src.radius ?? 0);\n                const name = src.object?.document?.name ?? src.object?.name ?? 'a light';\n                if (r > 0 && Math.hypot(p.x - src.data.x, p.y - src.data.y) <= r) { level = 'bright'; why = 'bright light from ' + name; break; }\n                level = 'dim'; why = 'dim light from ' + name;\n            }\n        }\n        if (level !== 'dark' && canvas.effects.testInsideDarkness?.(p, token.document.elevation ?? 0)) { level = 'dark'; why = 'magical darkness'; }\n        return {level, why};\n    };\n    const cloak = workflow.item;\n    const token = workflow.token ?? actorUtils.getFirstToken(cloak.actor);\n    const fly = cloak.effects.find(e => e.getFlag('world', 'nixCloakFly'));\n    if (!fly || !token) return;\n    if (!fly.disabled) {\n        await fly.update({disabled: true});\n        await cloak.setFlag('world', 'nixCloakGrip', false);\n        return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: cloak.actor}), content: '<b>' + cloak.name + ':</b> ' + cloak.actor.name + ' lets go of the cloak and stops flying.'});\n    }\n    const {level, why} = lightAt(token);\n    if (level === 'bright') return ui.notifications.warn(cloak.name + ': he must be in dim light or darkness to grip the cloak (' + why + ').');\n    await fly.update({disabled: false});\n    await cloak.setFlag('world', 'nixCloakGrip', true);\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: cloak.actor}),\n        content: '<b>' + cloak.name + ':</b> ' + cloak.actor.name + ' grips the edges of the cloak: <b>fly speed 40 ft</b> (' + level + ': ' + why + ').'});\n})();",
 "LUCKY_ADV": "await (async () => {\n    const actor = workflow.actor;\n    const old = effectUtils.getEffectByIdentifier(actor, 'nixLuckyAdvantage');\n    if (old) await genericUtils.remove(old);\n    await effectUtils.createEffect(actor, {\n        name: 'Lucky: Advantage', img: workflow.item.img, origin: workflow.item.uuid,\n        description: 'Advantage on the next D20 Test (attack roll, ability check or saving throw).',\n        changes: [{key: 'flags.midi-qol.advantage.all', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '1', priority: 20}],\n        flags: {dae: {specialDuration: ['1Attack', 'isSave', 'isCheck', 'isSkill']}}\n    }, {identifier: 'nixLuckyAdvantage'});\n})();",
 "LUCKY_DIS": "await (async () => {\n    const lucky = trigger.entity;\n    const me = lucky.actor;\n    if (!workflow.actor || workflow.actor.uuid === me.uuid) return;\n    if (!(lucky.system.uses?.value > 0)) return;\n    if (workflow.nixLuckyAsked?.has?.(me.uuid)) return;\n    (workflow.nixLuckyAsked ??= new Set()).add(me.uuid);\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const yes = await dialogUtils.confirm(lucky.name,\n        '<b>' + workflow.actor.name + '</b> is attacking <b>' + me.name + '</b> with ' + workflow.item.name\n        + '.<br>Spend a Luck Point to give the attack Disadvantage? (' + lucky.system.uses.value + ' left)', {userId});\n    if (!yes) return;\n    await genericUtils.update(lucky, {'system.uses.spent': (lucky.system.uses.spent ?? 0) + 1});\n    workflow.tracker.disadvantage.add(lucky.name, lucky.name);\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n        content: '<b>' + lucky.name + ':</b> ' + me.name + ' spends a Luck Point. ' + workflow.actor.name + '\\'s attack has Disadvantage.'});\n})();"
};
const lc = s => String(s ?? '').toLowerCase().trim();
const ADD = CONST.ACTIVE_EFFECT_MODES.ADD, OV = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
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
// Names match with or without a cost suffix, so "Goad" and "Goad (1d6)" are the same activity.
const baseName = s => lc(s).replace(/\s*\(\s*\d+d\d+\s*\)\s*$/, '');
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => baseName(a.name) === baseName(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) {
        await item.createActivity(type, {name, ...data}, {renderSheet: false});
        act = actByName(item, name);
    } else await act.update({name, ...data});
    return actByName(item, name);
}
// One item effect (not transferred) tagged with world.<tag>, created or refreshed.
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
 
// ---- Lucky (2024 feat): Luck Points = proficiency bonus, long rest ----------------------
const isLuckyFeat = i => i.type === 'feat' && lc(i.name).startsWith('lucky') && !/footwork/i.test(i.name)
    && (i.system.type?.value === 'feat' || /luck point/i.test(i.system.description?.value ?? ''));
async function setupLucky(item) {
    const spent = Math.min(Number(item.system.uses?.spent ?? 0), item.actor?.system.attributes?.prof ?? 6);
    await item.update({'system.uses': {max: '@prof', spent, recovery: [{period: 'lr', type: 'recoverAll'}]}});
    // Rebuild: one activity, "Luck Point: Advantage".
    for (const a of item.system.activities?.contents ?? []) if (a.name !== 'Luck Point: Advantage') await item.update({['system.activities.-=' + a.id]: null});
    if (item.flags?.['chris-premades']?.embeddedActivityMacros) await item.unsetFlag('chris-premades', 'embeddedActivityMacros');
    const act = await ensureActivity(item, 'Luck Point: Advantage', 'utility', {
        img: item.img,
        activation: {type: 'special', value: null, override: true},
        consumption: {targets: [{type: 'itemUses', target: '', value: '1', scaling: {}}], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Spends a Luck Point: Advantage on the next D20 Test.'}
    });
    await setActivityMacros(item, act, ['Lucky: Advantage'], [
        {name: 'Lucky: Advantage', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.LUCKY_ADV}]);
    await setMacros(item, ['Lucky: Disadvantage'], [
        {name: 'Lucky: Disadvantage', type: 'midi-actor', pass: 'targetPreAttackRollConfig', priority: 50, macro: SCRIPTS.LUCKY_DIS}]);
}
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Westly fixes: select Westly\'s token first.');
const report = [];
const find = re => actor.items.find(i => re.test(i.name));
const findAll = re => actor.items.filter(i => re.test(i.name));
const dexDC = {calculation: 'dex', formula: ''};
 
// ---- 0. Twin Blades bond: describes both swords and holds the one attunement slot -----------
const solaris = find(/^solaris/i), nocturna = find(/^nocturna/i);
const BOND = 'Twin Blades: Solaris & Nocturna';
let bond = actor.items.find(i => i.getFlag('world', 'nixTwinBond'));
// Earlier versions put the charges on a sword: take them off.
for (const s of [solaris, nocturna].filter(Boolean)) {
    if (s.getFlag('world', 'nixBladeCharges')) await s.unsetFlag('world', 'nixBladeCharges');
    const old = s.effects.find(e => e.getFlag('world', 'nixTwinAttune'));
    if (old) await old.delete();
}
if (solaris || nocturna) {
    const swordText = s => s ? '<h3>' + s.name + '</h3>' + (s.system.description?.value ?? '') : '';
    const bondData = {
        name: BOND, type: 'equipment', img: (solaris ?? nocturna).img,
        system: {
            type: {value: 'trinket', baseItem: ''}, rarity: (solaris ?? nocturna).system.rarity ?? '',
            attunement: 'required', attuned: true, equipped: true, weight: {value: 0, units: 'lb'}, quantity: 1,
            uses: {max: '', spent: 0, recovery: []},
            description: {value: '<p><em>Westly\'s paired blades share one bond.</em> Attuning to this bond attunes him to both Solaris and Nocturna (one attunement slot). '
                + 'Equip and attack with each sword separately from the inventory.</p>'
                + '<p><strong>Blade Strikes.</strong> When Westly deals Sneak Attack damage, he can choose <strong>Radiant Strike</strong> or <strong>Silent Strike</strong> as a Cunning Strike. Each costs <strong>2d6</strong> of the Sneak Attack dice and can be used as often as he likes.</p>'
                + '<p><strong>Radiant Strike.</strong> Dexterity save (DC 8 + Dex modifier + Proficiency Bonus). On a failure, until the start of Westly\'s next turn the target sheds Bright Light in a 5-foot radius, attack rolls against it have Advantage, and it can\'t benefit from the Invisible condition. The Sneak Attack damage becomes Radiant.</p>'
                + '<p><strong>Silent Strike.</strong> Wisdom save (same DC). On a failure the target is Silenced until the start of Westly\'s next turn. The Sneak Attack damage becomes Necrotic.</p>'
                + '<p>If both are chosen on the same hit, the one picked first sets the Sneak Attack damage type.</p><hr>'
                + swordText(solaris) + swordText(nocturna)}
        },
        flags: {world: {nixTwinBond: true}}
    };
    if (!bond) bond = (await actor.createEmbeddedDocuments('Item', [bondData]))[0];
    else {
        bondData.system.attuned = bond.system.attuned;
        bondData.system.equipped = bond.system.equipped;
        await bond.update(bondData);
    }
    if (bond.getFlag('world', 'nixBladeCharges')) await bond.unsetFlag('world', 'nixBladeCharges');
    // The swords no longer take their own attunement slots.
    for (const s of [solaris, nocturna].filter(Boolean)) if (s.system.attunement) await s.update({'system.attunement': '', 'system.attuned': false});
    report.push('<li><b>' + BOND + '</b> added to his inventory: describes both swords and the two strikes, and takes the single attunement slot (no charges). Solaris and Nocturna stay separate weapons and no longer need their own attunement.</li>');
} else report.push('<li><b>Solaris / Nocturna</b> not found: no Twin Blades bond made.</li>');
 
// ---- 1. Cunning Strike: Radiant / Silent Strike, Goad, Awe ------------------------------
const cs = actor.items.find(i => /^cunning strike$/i.test(i.name.trim()));
if (!cs) report.push('<li><b>Cunning Strike</b> not found: strikes skipped.</li>');
else {
    if (cprId(cs) !== 'cunningStrike') report.push('<li><b>Cunning Strike</b> is not Chris\'s Premades\' version: apply it in the Medkit, or the strike menu won\'t appear.</li>');
 
    const map = foundry.utils.deepClone(cs.getFlag('world', 'nixBladeStrikes') ?? {});
    const strikes = [['radiant', /radiant strike/i, SCRIPTS.RADIANT], ['silent', /silent strike/i, SCRIPTS.SILENT]];
    const found = [];
    for (const [kind, re, macro] of strikes) {
        const act = cs.system.activities.contents.find(a => re.test(a.name));
        if (!act) { report.push('<li><b>' + (kind === 'radiant' ? 'Radiant' : 'Silent') + ' Strike</b> activity not found on Cunning Strike.</li>'); continue; }
        const cost = 2;                                              // costs 2d6 of the Sneak Attack dice
        map[act.id] = {kind, cost};
        // Our macro applies the condition, so the activity's own effects are cleared (avoids doubling).
        await act.update({effects: [], 'uses.max': String(cost)});
        await setActivityMacros(cs, act, ['Blade strike effect'], [
            {name: 'Blade strike effect', type: 'midi-item', pass: 'rollFinished', priority: 50, macro}]);
        found.push(act.name + ' (' + cost + ' die' + (cost > 1 ? 'ce' : '') + ')');
    }
    await cs.setFlag('world', 'nixBladeStrikes', map);
    await setMacros(cs, ['Blade strikes: sync', 'Blade strikes: mark', 'Blade strikes: damage'], [
        {name: 'Blade strikes: mark', type: 'midi-actor', pass: 'damageRollComplete', priority: 210, macro: SCRIPTS.BLADE_MARK},
        {name: 'Blade strikes: damage', type: 'midi-actor', pass: 'damageRollComplete', priority: 220, macro: SCRIPTS.BLADE_DAMAGE}]);
    if (found.length) report.push('<li>' + found.join(' and ') + ': cost 2d6 each, no charges (always offered when he has the dice). Sneak Attack damage turns radiant / necrotic (first strike picked wins). Silent: Silenced (no Verbal spells); Radiant: 5 ft bright light, attacks against it have Advantage, Invisible switched off; both until the start of Westly\'s next turn.</li>');
 
    // Goad (1d6)
    const goad = await ensureActivity(cs, 'Goad (1d6)', 'save', strikeData(1, {
        img: 'icons/skills/social/intimidation-impressing.webp', save: {ability: ['wis'], dc: dexDC},
        description: {chatFlavor: 'Wisdom save or Goaded until the end of its next turn.'}}));
    await setActivityMacros(cs, goad, ['Goad'], [{name: 'Goad', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.GOAD}]);
    // Awe (3d6)
    const charmFx = await ensureItemEffect(cs, 'nixAweFx', {
        name: 'Awed (Charmed)', img: 'icons/magic/control/hypnosis-mesmerism-swirl.webp', statuses: ['charmed'],
        duration: {rounds: 1, turns: 1}, description: 'Charmed by ' + actor.name + ' until the end of ' + actor.name + '\'s next turn.'});
    const awe = await ensureActivity(cs, 'Awe (3d6)', 'save', strikeData(3, {
        img: 'icons/magic/control/hypnosis-mesmerism-swirl.webp', save: {ability: ['wis'], dc: dexDC},
        range: {units: 'ft', value: '30', override: true}, target: {affects: {type: 'creature', count: ''}, override: true},
        effects: [{_id: charmFx.id, onSave: false}],
        description: {chatFlavor: 'Creatures of your choice within 30 ft: Wisdom save or Charmed until the end of your next turn.'}}));
    await setActivityMacros(cs, awe, ['Awe targets'], [{name: 'Awe targets', type: 'midi-item', pass: 'preambleComplete', priority: 50, macro: SCRIPTS.AWE}]);
    report.push('<li>Panache (5.5): <b>Goad</b> (1d6) and <b>Awe</b> (3d6) added to the Cunning Strike menu, save DC 8 + Dex + proficiency.</li>');
}
 
// ---- 2. Old Panache action -> 5.5 text --------------------------------------------------
const panache = actor.items.find(i => /^panache/i.test(i.name.trim()));
if (panache) {
    for (const a of panache.system.activities?.contents ?? []) await panache.update({['system.activities.-=' + a.id]: null});
    await panache.update({
        name: 'Panache', 'system.uses': {max: '', spent: 0, recovery: []},
        'system.description.value': '<p><em>Swashbuckler 5.5 update.</em> Your charm becomes a weapon. You gain the following Cunning Strike options:</p>'
            + '<p><strong>Goad (Cost: 1d6).</strong> The target must succeed on a Wisdom saving throw or have Disadvantage on attack rolls against creatures other than you, and it can\'t make Opportunity Attacks against creatures other than you, until the end of its next turn.</p>'
            + '<p><strong>Awe (Cost: 3d6).</strong> Creatures of your choice within 30 feet of you must succeed on a Wisdom saving throw or have the Charmed condition until the end of your next turn.</p>'
            + '<p>(Both appear in the Cunning Strike menu after a Sneak Attack.)</p>'});
    for (const k of ['embeddedMacros', 'embeddedActivityMacros', 'info']) if (panache.flags?.['chris-premades']?.[k]) await panache.unsetFlag('chris-premades', k);
    report.push('<li>Panache: old action removed, item now describes Goad and Awe.</li>');
}
 
// ---- 3. Fancy Footwork (5.5) -------------------------------------------------------------
const footwork = find(/^fancy footwork/i);
if (!footwork) report.push('<li><b>Fancy Footwork</b> not found.</li>');
else {
    await footwork.update({'system.description.value': '<p><em>Swashbuckler 5.5 update.</em> When you make a melee attack roll against a creature, that creature can\'t make Opportunity Attacks against you for the rest of your turn, whether the attack hits or misses.</p>'});
    await setMacros(footwork, ['Fancy Footwork'], [{name: 'Fancy Footwork', type: 'midi-actor', pass: 'rollFinished', priority: 60, macro: SCRIPTS.FOOTWORK}]);
    report.push('<li>Fancy Footwork: every melee attack marks the target "Fancy Footwork": no Opportunity Attacks against Westly for the rest of his turn.</li>');
}
 
// ---- 4. Uncanny Dodge marks the reaction -------------------------------------------------
const dodge = find(/^uncanny dodge/i);
if (dodge) {
    await setMacros(dodge, ['Uncanny Dodge reaction'], [{name: 'Uncanny Dodge reaction', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.UNCANNY}]);
    report.push('<li>Uncanny Dodge: now marks Westly\'s reaction as used.</li>');
}
 
// ---- 5. Lucky ------------------------------------------------------------------------------
const lucky = actor.items.find(isLuckyFeat);
if (lucky) { await setupLucky(lucky); report.push('<li>Lucky: Luck Points = proficiency bonus (long rest). "Luck Point: Advantage" gives Advantage on the next D20 Test; when attacked he is asked whether to spend a point for Disadvantage.</li>'); }
 
// ---- 6. Skill Expert: merge into one item --------------------------------------------------
const experts = findAll(/skill expert/i);
if (experts.length > 1) {
    const keep = experts.find(i => /^skill expert/i.test(i.name.trim()) && i.type === 'feat') ?? experts[0];
    const extras = experts.filter(i => i.id !== keep.id);
    const moved = extras.flatMap(i => i.effects.contents.map(e => { const d = e.toObject(); delete d._id; d.origin = keep.uuid; return d; }));
    if (moved.length) await keep.createEmbeddedDocuments('ActiveEffect', moved);
    const bits = experts.map(i => i.name.match(/\(([^)]*)\)/)?.[1]).filter(Boolean).flatMap(s => s.split(/,\s*/));
    const label = [...new Set(bits)].join(', ');
    await actor.deleteEmbeddedDocuments('Item', extras.map(i => i.id));
    if (label) await keep.update({name: 'Skill Expert (' + label + ')'});
    report.push('<li>Skill Expert: ' + experts.length + ' items merged into one (' + keep.name + ')' + (moved.length ? ', ' + moved.length + ' effect(s) moved over' : '') + '.</li>');
} else if (experts.length === 1) report.push('<li>Skill Expert: already a single item.</li>');
 
// ---- 7. Iyssya's Cloak of the Bat: fly only in dim light / darkness --------------------------
const cloak = find(/cloak of the bat/i);
if (!cloak) report.push('<li><b>Cloak of the Bat</b> not found.</li>');
else {
    let fly = cloak.effects.find(e => e.getFlag('world', 'nixCloakFly'))
        ?? cloak.effects.find(e => e.changes.some(c => c.key === 'system.attributes.movement.fly'));
    const flyData = {name: 'Cloak of the Bat: Fly 40 ft', img: cloak.img, transfer: true,
        description: 'Fly speed 40 ft while gripping the cloak in dim light or darkness. Lost in bright light.',
        changes: [{key: 'system.attributes.movement.fly', mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE, value: '40', priority: 20}],
        flags: {world: {nixCloakFly: true}}};
    flyData.disabled = true;                                                   // starts off: he grips the cloak to fly
    if (fly) await fly.update(flyData); else await cloak.createEmbeddedDocuments('ActiveEffect', [flyData]);
    // "Grip the Cloak" activity (no action): toggles flying, refused in bright light.
    const grip = await ensureActivity(cloak, 'Grip the Cloak', 'utility', {
        img: cloak.img, activation: {type: 'special', value: null, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Grip (or let go of) the cloak: fly speed 40 ft while in dim light or darkness.'}});
    await setActivityMacros(cloak, grip, ['Grip the Cloak'], [{name: 'Grip the Cloak', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.CLOAK_GRIP}]);
    await setMacros(cloak, ['Cloak of the Bat light (move)', 'Cloak of the Bat light (turn)'], [
        {name: 'Cloak of the Bat light (move)', type: 'movement', pass: 'moved', priority: 50, macro: SCRIPTS.CLOAK_LIGHT},
        {name: 'Cloak of the Bat light (turn)', type: 'combat', pass: 'everyTurn', priority: 50, macro: SCRIPTS.CLOAK_LIGHT}]);
    report.push('<li>Cloak of the Bat: use <b>Grip the Cloak</b> to start flying (40 ft); it only works in dim light or darkness and says why if not. Moving into bright light makes him lose the fly speed (re-grip once back in the dark). Use it again to let go.</li>');
}
 
// ---- 8. Pistachio's Fancy Hat: left alone (homebrew to come). Clear any earlier macro. ------
const hat = find(/fancy hat/i);
if (hat && (hat.flags?.['chris-premades']?.embeddedMacros ?? []).some(m => m.name === 'Fancy Hat')) await setMacros(hat, ['Fancy Hat'], []);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Westly fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 