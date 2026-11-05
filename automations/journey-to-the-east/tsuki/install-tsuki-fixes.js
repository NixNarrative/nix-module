// =====================================================================
//  TSUKI FIXES (Journey to the East): one-click INSTALLER (Script macro, run as GM)
//  Select Tsuki's token, then run. Safe to re-run.
//   - Cosmic Omen: d20 after each long rest; Weal / Woe pop-ups only when they can flip a roll
//   - Wild Shape: 3 uses (the transform activity uses the feature's uses)
//   - Elemental Fury: one copy; Potent Spellcasting = +Wis in Druid cantrip damage (Vina's method)
//   - Find Familiar / Wild Companion summon Luna
// =====================================================================
const SCRIPTS = {
 "FATE_ATTACK": "await (async () => {\n// ---- FATE STACK ENGINE (shared by Cosmic Omen and Portent) -----------------------\n// Runs once per attack roll or saving throw, AFTER Bardic Inspiration has had its chance.\n// Order: Tsuki's Weal/Woe, then Cordelia's Portent. A pop-up only appears when that\n// option could actually flip the result (miss -> hit / fail -> pass, or the reverse).\n// kind: 'attack' | 'save'.  Returns the changed roll, or null if nothing changed.\nconst nixFate = async ({kind, roll, target, rollerToken, workflow}) => {\n    if (!roll || !Number.isFinite(Number(target)) || !rollerToken?.actor) return null;\n    target = Number(target);\n    const OMEN_RANGE = 30;\n    const d20Of = r => {\n        const t = r.terms?.[0];\n        const kept = (t?.results ?? []).filter(x => x.active !== false);\n        return kept.length ? Number(kept[0].result) : Number(t?.total ?? 0);\n    };\n    const state = r => {\n        const nat = d20Of(r);\n        if (kind === 'attack') {\n            if (nat === 1) return {ok: false, locked: true, nat};          // natural 1 always misses\n            if (nat >= (r.options?.criticalSuccess ?? 20)) return {ok: true, crit: true, nat};\n            return {ok: r.total >= target, nat};\n        }\n        return {ok: r.total >= target, nat};\n    };\n    const side = (helperTok, tok) => {\n        const a = helperTok.document.disposition, b = tok.document.disposition;\n        if (helperTok.id === tok.id || a === b) return 'friend';\n        if (a !== 0 && b !== 0 && a === -b) return 'foe';\n        return 'neutral';\n    };\n    const ownerOf = actor => socketUtils.firstOwner(actor, true) ?? game.user.id;\n    const inCombat = combatUtils.inCombat();\n    const label = kind === 'attack' ? 'attack roll' : 'saving throw';\n    let current = roll;\n    let changed = false;\n\n    const helpers = [];\n    for (const t of canvas.tokens.placeables) {\n        if (!t.actor || t.document.hidden) continue;\n        for (const it of t.actor.items) {\n            const role = it.flags?.world?.nixFate;\n            if (role) helpers.push({tok: t, item: it, role});\n        }\n    }\n    helpers.sort((a, b) => (a.role === 'omen' ? 0 : 1) - (b.role === 'omen' ? 0 : 1));\n\n    for (const h of helpers) {\n        const me = h.tok.actor;\n        if (MidiQOL.checkIncapacitated?.(me)) continue;\n        const s = state(current);\n        const rel = side(h.tok, rollerToken);\n        const userId = ownerOf(me);\n\n        // ---------- Cosmic Omen (Weal / Woe): reaction, 30 ft, d6 ----------\n        if (h.role === 'omen') {\n            const omen = h.item;\n            let mode = effectUtils.getEffectByIdentifier(me, 'cosmicOmenWeal') ? 'weal'\n                : effectUtils.getEffectByIdentifier(me, 'cosmicOmenWoe') ? 'woe' : (omen.flags?.world?.nixOmenMode ?? null);\n            if (!mode) continue;\n            if (!(omen.system.uses?.value > 0)) continue;\n            if (inCombat && actorUtils.hasUsedReaction(me)) continue;\n            if (h.tok.id !== rollerToken.id && tokenUtils.getDistance(h.tok, rollerToken) > OMEN_RANGE) continue;\n            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;\n            let sign = 0;\n            if (mode === 'weal' && rel === 'friend' && !s.ok && !s.locked && current.total + 6 >= target) sign = 1;\n            if (mode === 'woe' && rel === 'foe' && s.ok && !s.crit && current.total - 6 < target) sign = -1;\n            if (!sign) continue;\n            const who = rollerToken.document.name;\n            const text = sign > 0\n                ? '<b>Weal:</b> ' + who + ' just failed a ' + label + ' (' + current.total + '). Use your reaction to add 1d6?'\n                : '<b>Woe:</b> ' + who + ' just succeeded on a ' + label + ' (' + current.total + '). Use your reaction to subtract 1d6?';\n            if (!await dialogUtils.confirm(omen.name, text, {userId})) continue;\n            let n = 0;\n            const act = activityUtils.getActivityByIdentifier(omen, sign > 0 ? 'cosmicOmenWeal' : 'cosmicOmenWoe', {strict: true});\n            if (act) {\n                const wf = await workflowUtils.syntheticActivityRoll(act, [rollerToken], {\n                    options: {workflowOptions: {'chris-premades': {notManual: true}}}, dialog: {create: false}, consumeResources: true, userId});\n                n = Number(wf?.utilityRoll?.total) || 0;\n                if (!n) { const m = await fromUuid(wf?.itemCardUuid); n = Number(m?.rolls?.[0]?.total) || 0; }\n            }\n            if (!n) {\n                const r = await rollUtils.rollDice('1d6', {chatMessage: true, flavor: omen.name + (sign > 0 ? ': Weal' : ': Woe')});\n                n = r.roll.total;\n                await genericUtils.update(omen, {'system.uses.spent': (omen.system.uses.spent ?? 0) + 1});\n            }\n            if (inCombat) await actorUtils.setReactionUsed(me);\n            current = await rollUtils.addToRoll(current, String(sign * n), {rollData: current.data});\n            changed = true;\n            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n                content: '<b>' + omen.name + (sign > 0 ? ' (Weal)' : ' (Woe)') + ':</b> ' + (sign > 0 ? '+' : '-') + n + ' to '\n                    + who + '\\'s ' + label + ' (now ' + current.total + ').'});\n            continue;\n        }\n\n        // ---------- Portent: replace the d20 with a foretelling roll ----------\n        if (h.role === 'portent') {\n            const portent = h.item;\n            const dice = [...(portent.flags?.world?.nixPortent?.rolls ?? [])];\n            if (!dice.length) continue;\n            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;\n            const base = current.total - s.nat;\n            let options = [];\n            if (rel === 'friend' && !s.ok) options = dice.filter(v => v > 10 && base + v >= target);\n            if (rel === 'foe' && s.ok) options = dice.filter(v => v < 10 && base + v < target);\n            options = [...new Set(options)].sort((a, b) => b - a);\n            if (!options.length) continue;\n            const who = rollerToken.document.name;\n            const head = rel === 'friend'\n                ? who + ' just failed a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?'\n                : who + ' just succeeded on a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?';\n            const pick = await dialogUtils.buttonDialog(portent.name + ': Change Fate', head,\n                options.map(v => ['Replace the d20 with your ' + v, String(v)]).concat([['Leave it', false]]), {userId});\n            if (!pick) continue;\n            const v = Number(pick);\n            const left = [...dice];\n            left.splice(left.indexOf(v), 1);\n            await portent.setFlag('world', 'nixPortent', {...(portent.flags.world.nixPortent ?? {}), rolls: left});\n            const shown = me.effects.find(e => e.flags?.world?.nixPortentShow);\n            if (shown) await genericUtils.update(shown, {name: left.length ? 'Portent: ' + left.join(', ') : 'Portent: (all used)'});\n            current = await rollUtils.replaceD20(current, v);\n            changed = true;\n            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n                content: '<b>' + portent.name + ': Change Fate.</b> ' + me.name + ' replaces ' + who + '\\'s d20 with a <b>' + v\n                    + '</b> (' + label + ' now ' + current.total + ').' + (left.length ? ' Foretold rolls left: ' + left.join(', ') + '.' : ' No foretold rolls left.')});\n        }\n    }\n    return changed ? current : null;\n};\n// Fate stack: attack rolls. Runs from scenePostAttackRoll (someone else attacks) and\n// postAttackRoll (the helper attacks). Waits until Midi's preCheckHits so Bardic Inspiration\n// and Combat Inspiration (both earlier passes) have already been offered.\nif (!workflow?.attackRoll || workflow.nixFateHooked || !workflow.targets?.size || !workflow.token) return;\nworkflow.nixFateHooked = true;\nconst wfId = workflow.id;\nconst hookId = Hooks.on('midi-qol.preCheckHits', async wf => {\n    if (wf?.id !== wfId) return;\n    Hooks.off('midi-qol.preCheckHits', hookId);\n    const target = Array.from(wf.targets ?? []).find(t => t.actor);\n    if (!target) return;\n    const ac = Number(target.actor.system.attributes?.ac?.value ?? 10);\n    const res = await nixFate({kind: 'attack', roll: wf.attackRoll, target: ac, rollerToken: wf.token, workflow: wf});\n    if (res) await wf.setAttackRoll(res);\n});\nsetTimeout(() => Hooks.off('midi-qol.preCheckHits', hookId), 180000);\n})();",
 "FATE_SAVE": "return await (async () => {\n// ---- FATE STACK ENGINE (shared by Cosmic Omen and Portent) -----------------------\n// Runs once per attack roll or saving throw, AFTER Bardic Inspiration has had its chance.\n// Order: Tsuki's Weal/Woe, then Cordelia's Portent. A pop-up only appears when that\n// option could actually flip the result (miss -> hit / fail -> pass, or the reverse).\n// kind: 'attack' | 'save'.  Returns the changed roll, or null if nothing changed.\nconst nixFate = async ({kind, roll, target, rollerToken, workflow}) => {\n    if (!roll || !Number.isFinite(Number(target)) || !rollerToken?.actor) return null;\n    target = Number(target);\n    const OMEN_RANGE = 30;\n    const d20Of = r => {\n        const t = r.terms?.[0];\n        const kept = (t?.results ?? []).filter(x => x.active !== false);\n        return kept.length ? Number(kept[0].result) : Number(t?.total ?? 0);\n    };\n    const state = r => {\n        const nat = d20Of(r);\n        if (kind === 'attack') {\n            if (nat === 1) return {ok: false, locked: true, nat};          // natural 1 always misses\n            if (nat >= (r.options?.criticalSuccess ?? 20)) return {ok: true, crit: true, nat};\n            return {ok: r.total >= target, nat};\n        }\n        return {ok: r.total >= target, nat};\n    };\n    const side = (helperTok, tok) => {\n        const a = helperTok.document.disposition, b = tok.document.disposition;\n        if (helperTok.id === tok.id || a === b) return 'friend';\n        if (a !== 0 && b !== 0 && a === -b) return 'foe';\n        return 'neutral';\n    };\n    const ownerOf = actor => socketUtils.firstOwner(actor, true) ?? game.user.id;\n    const inCombat = combatUtils.inCombat();\n    const label = kind === 'attack' ? 'attack roll' : 'saving throw';\n    let current = roll;\n    let changed = false;\n\n    const helpers = [];\n    for (const t of canvas.tokens.placeables) {\n        if (!t.actor || t.document.hidden) continue;\n        for (const it of t.actor.items) {\n            const role = it.flags?.world?.nixFate;\n            if (role) helpers.push({tok: t, item: it, role});\n        }\n    }\n    helpers.sort((a, b) => (a.role === 'omen' ? 0 : 1) - (b.role === 'omen' ? 0 : 1));\n\n    for (const h of helpers) {\n        const me = h.tok.actor;\n        if (MidiQOL.checkIncapacitated?.(me)) continue;\n        const s = state(current);\n        const rel = side(h.tok, rollerToken);\n        const userId = ownerOf(me);\n\n        // ---------- Cosmic Omen (Weal / Woe): reaction, 30 ft, d6 ----------\n        if (h.role === 'omen') {\n            const omen = h.item;\n            let mode = effectUtils.getEffectByIdentifier(me, 'cosmicOmenWeal') ? 'weal'\n                : effectUtils.getEffectByIdentifier(me, 'cosmicOmenWoe') ? 'woe' : (omen.flags?.world?.nixOmenMode ?? null);\n            if (!mode) continue;\n            if (!(omen.system.uses?.value > 0)) continue;\n            if (inCombat && actorUtils.hasUsedReaction(me)) continue;\n            if (h.tok.id !== rollerToken.id && tokenUtils.getDistance(h.tok, rollerToken) > OMEN_RANGE) continue;\n            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;\n            let sign = 0;\n            if (mode === 'weal' && rel === 'friend' && !s.ok && !s.locked && current.total + 6 >= target) sign = 1;\n            if (mode === 'woe' && rel === 'foe' && s.ok && !s.crit && current.total - 6 < target) sign = -1;\n            if (!sign) continue;\n            const who = rollerToken.document.name;\n            const text = sign > 0\n                ? '<b>Weal:</b> ' + who + ' just failed a ' + label + ' (' + current.total + '). Use your reaction to add 1d6?'\n                : '<b>Woe:</b> ' + who + ' just succeeded on a ' + label + ' (' + current.total + '). Use your reaction to subtract 1d6?';\n            if (!await dialogUtils.confirm(omen.name, text, {userId})) continue;\n            let n = 0;\n            const act = activityUtils.getActivityByIdentifier(omen, sign > 0 ? 'cosmicOmenWeal' : 'cosmicOmenWoe', {strict: true});\n            if (act) {\n                const wf = await workflowUtils.syntheticActivityRoll(act, [rollerToken], {\n                    options: {workflowOptions: {'chris-premades': {notManual: true}}}, dialog: {create: false}, consumeResources: true, userId});\n                n = Number(wf?.utilityRoll?.total) || 0;\n                if (!n) { const m = await fromUuid(wf?.itemCardUuid); n = Number(m?.rolls?.[0]?.total) || 0; }\n            }\n            if (!n) {\n                const r = await rollUtils.rollDice('1d6', {chatMessage: true, flavor: omen.name + (sign > 0 ? ': Weal' : ': Woe')});\n                n = r.roll.total;\n                await genericUtils.update(omen, {'system.uses.spent': (omen.system.uses.spent ?? 0) + 1});\n            }\n            if (inCombat) await actorUtils.setReactionUsed(me);\n            current = await rollUtils.addToRoll(current, String(sign * n), {rollData: current.data});\n            changed = true;\n            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n                content: '<b>' + omen.name + (sign > 0 ? ' (Weal)' : ' (Woe)') + ':</b> ' + (sign > 0 ? '+' : '-') + n + ' to '\n                    + who + '\\'s ' + label + ' (now ' + current.total + ').'});\n            continue;\n        }\n\n        // ---------- Portent: replace the d20 with a foretelling roll ----------\n        if (h.role === 'portent') {\n            const portent = h.item;\n            const dice = [...(portent.flags?.world?.nixPortent?.rolls ?? [])];\n            if (!dice.length) continue;\n            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;\n            const base = current.total - s.nat;\n            let options = [];\n            if (rel === 'friend' && !s.ok) options = dice.filter(v => v > 10 && base + v >= target);\n            if (rel === 'foe' && s.ok) options = dice.filter(v => v < 10 && base + v < target);\n            options = [...new Set(options)].sort((a, b) => b - a);\n            if (!options.length) continue;\n            const who = rollerToken.document.name;\n            const head = rel === 'friend'\n                ? who + ' just failed a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?'\n                : who + ' just succeeded on a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?';\n            const pick = await dialogUtils.buttonDialog(portent.name + ': Change Fate', head,\n                options.map(v => ['Replace the d20 with your ' + v, String(v)]).concat([['Leave it', false]]), {userId});\n            if (!pick) continue;\n            const v = Number(pick);\n            const left = [...dice];\n            left.splice(left.indexOf(v), 1);\n            await portent.setFlag('world', 'nixPortent', {...(portent.flags.world.nixPortent ?? {}), rolls: left});\n            const shown = me.effects.find(e => e.flags?.world?.nixPortentShow);\n            if (shown) await genericUtils.update(shown, {name: left.length ? 'Portent: ' + left.join(', ') : 'Portent: (all used)'});\n            current = await rollUtils.replaceD20(current, v);\n            changed = true;\n            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n                content: '<b>' + portent.name + ': Change Fate.</b> ' + me.name + ' replaces ' + who + '\\'s d20 with a <b>' + v\n                    + '</b> (' + label + ' now ' + current.total + ').' + (left.length ? ' Foretold rolls left: ' + left.join(', ') + '.' : ' No foretold rolls left.')});\n        }\n    }\n    return changed ? current : null;\n};\n// Fate stack: saving throws. 'bonus' pass (the helper's own save) and 'sceneBonus' (anyone\n// else's save). Both run after Bardic Inspiration's 'bonus' pass. One run per roll.\nconst roll = trigger.roll;\nconst dc = Number(roll?.options?.target);\nif (!roll || !dc || roll.options?.nixFate) return;\nroll.options.nixFate = true;\nconst saver = trigger.sourceActor ?? trigger.actor;\nconst tok = actorUtils.getFirstToken(saver);\nif (!tok) return;\nconst res = await nixFate({kind: 'save', roll, target: dc, rollerToken: tok});\nif (!res) return;\nres.options.nixFate = true;\nreturn res;\n})();",
 "OMEN_REST": "await (async () => {\n// Cosmic Omen: after a Long Rest, roll for today's omen (even = Weal, odd = Woe).\nconst item = trigger.entity;\nconst actor = item.actor;\nconst userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\nif (!await dialogUtils.confirm(item.name, 'Long rest finished. Roll 1d20 for today\\'s Cosmic Omen? (even = Weal, odd = Woe)', {userId})) return;\nconst act = activityUtils.getActivityByIdentifier(item, 'cosmicOmen', {strict: true});\nif (act) { await workflowUtils.syntheticActivityRoll(act, [], {userId}); return; }\nconst r = await rollUtils.rollDice('1d20', {chatMessage: true, flavor: item.name});\nconst mode = r.roll.total % 2 ? 'woe' : 'weal';\nawait item.setFlag('world', 'nixOmenMode', mode);\nawait ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + r.roll.total + ', today is <b>' + (mode === 'weal' ? 'Weal' : 'Woe') + '</b>.'});\n})();"
};
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Tsuki fixes: select Tsuki\'s token first.');
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
// Install the fate-stack hooks on a helper's feature (Cosmic Omen = 'omen', Portent = 'portent').
async function installFate(item, role) {
    await item.setFlag('world', 'nixFate', role);
    await setMacros(item, ['Fate: attacks (others)', 'Fate: attacks (own)', 'Fate: saves (own)', 'Fate: saves (others)'], [
        {name: 'Fate: attacks (others)', type: 'midi-actor', pass: 'scenePostAttackRoll', priority: 300, macro: SCRIPTS.FATE_ATTACK},
        {name: 'Fate: attacks (own)', type: 'midi-actor', pass: 'postAttackRoll', priority: 300, macro: SCRIPTS.FATE_ATTACK},
        {name: 'Fate: saves (own)', type: 'save', pass: 'bonus', priority: 300, macro: SCRIPTS.FATE_SAVE},
        {name: 'Fate: saves (others)', type: 'save', pass: 'sceneBonus', priority: 300, macro: SCRIPTS.FATE_SAVE}]);
}
 
// ---- 1. Cosmic Omen -------------------------------------------------------------------------------
{
    let omen = find(/^cosmic omen/i);
    if (!omen) report.push('<li><b>Cosmic Omen</b> not found.</li>');
    else {
        if (cprId(omen) !== 'cosmicOmen') {
            try { await chrisPremades.utils.itemUtils.itemUpdate(omen); } catch (err) { console.warn(err); }
            omen = find(/^cosmic omen/i);
        }
        const cpr = cprId(omen) === 'cosmicOmen';
        if (cpr) await omen.setFlag('chris-premades', 'config.enablePrompt', false);
        await installFate(omen, 'omen');
        await setMacros(omen, ['Cosmic Omen: long rest'], [{name: 'Cosmic Omen: long rest', type: 'rest', pass: 'long', priority: 50, macro: SCRIPTS.OMEN_REST}]);
        report.push('<li>Cosmic Omen' + (cpr ? ' (Chris\'s Premades version, its own every-roll prompt switched off)' : ' (<b>no Chris\'s Premades version applied</b>: a plain 1d6 is rolled)') + ': '
            + 'after a long rest she gets a pop-up to roll 1d20 (even = Weal, odd = Woe). Using a reaction and one use (' + (omen.system.uses?.max ?? '?') + '/LR), within 30 ft and in sight: '
            + '<b>Weal</b> is offered when a friendly creature fails an attack roll or saving throw by 6 or less; <b>Woe</b> when a hostile creature succeeds by 5 or less (not on a critical hit). '
            + 'Order: Bardic Inspiration, then Weal/Woe, then Cordelia\'s Portent.</li>');
    }
}
 
// ---- 2. Wild Shape: 3 uses ---------------------------------------------------------------------
{
    const ws = actor.items.find(i => /^wild shape$/i.test(i.name.trim()) && i.system.uses?.max) ?? find(/^wild shape/i);
    if (!ws) report.push('<li><b>Wild Shape</b> not found.</li>');
    else {
        const fixed = [];
        for (const a of ws.system.activities.contents) {
            const upd = {};
            if (a.uses?.max) { upd['uses.max'] = ''; upd['uses.spent'] = 0; upd['uses.recovery'] = []; }
            const targets = a.consumption?.targets ?? [];
            if (/transform|shape|midi/i.test(a.name ?? '') && !targets.some(t => t.type === 'itemUses')) upd['consumption.targets'] = targets.concat([{type: 'itemUses', target: '', value: '1', scaling: {}}]);
            if (Object.keys(upd).length) { await a.update(upd); fixed.push(a.name); }
        }
        report.push('<li>Wild Shape: ' + (fixed.length ? fixed.join(', ') + ' now spend' + (fixed.length > 1 ? '' : 's') + ' the feature\'s own uses' : 'activities already use the feature\'s uses')
            + ' (' + ws.system.uses?.value + '/' + ws.system.uses?.max + ').</li>');
    }
}
 
// ---- 3. Elemental Fury: Potent Spellcasting (Vina's method) --------------------------------------
{
    const furies = findAll(/^elemental fury/i);
    const keep = furies.find(i => /potent/i.test(i.name)) ?? furies[0];
    const extra = furies.filter(i => i.id !== keep?.id);
    if (extra.length) { await actor.deleteEmbeddedDocuments('Item', extra.map(i => i.id)); report.push('<li>Elemental Fury: removed ' + extra.map(i => '"' + i.name + '"').join(', ') + '; kept "' + keep.name + '".</li>'); }
    if (!keep) report.push('<li><b>Elemental Fury: Potent Spellcasting</b> not found.</li>');
    else {
        const cprActor = keep.flags?.['chris-premades']?.macros?.midi?.actor;
        if (Array.isArray(cprActor) && cprActor.some(m => /potentSpellcasting/i.test(m))) await keep.setFlag('chris-premades', 'macros.midi.actor', cprActor.filter(m => !/potentSpellcasting/i.test(m)));
        for (const e of keep.effects.filter(e => !e.disabled && e.changes.some(c => /damage/i.test(c.key)))) await e.update({disabled: true});
        const onlyDruid = Object.keys(actor.classes ?? {}).every(k => k === 'druid');
        const cantrips = actor.items.filter(i => i.type === 'spell' && Number(i.system.level) === 0 && (i.system.sourceClass === 'druid' || (!i.system.sourceClass && onlyDruid)));
        const done = [];
        for (const sp of cantrips) {
            let touched = false;
            for (const act of sp.system.activities.contents) {
                const parts = act.toObject().damage?.parts;
                if (!parts?.length) continue;
                const p = parts[0];
                if (p.custom?.enabled) { if (!/wis\.mod/.test(p.custom.formula ?? '')) { p.custom.formula = (p.custom.formula || '0') + ' + @abilities.wis.mod'; touched = true; } }
                else if (!/wis\.mod/.test(p.bonus ?? '')) { p.bonus = (p.bonus ? p.bonus + ' + ' : '') + '@abilities.wis.mod'; touched = true; }
                if (touched) await act.update({'damage.parts': parts});
            }
            if (touched || sp.system.activities.contents.some(a => /wis\.mod/.test(JSON.stringify(a.toObject().damage ?? {})))) done.push(sp.name);
        }
        report.push('<li>Potent Spellcasting: +Wis (+' + actor.system.abilities.wis.mod + ') is now part of the damage of ' + (done.join(', ') || 'no damaging Druid cantrips') + ', shown on the sheet and in the roll. Any old runtime bonus was switched off so it isn\'t added twice.</li>');
    }
}
 
// ---- 4. Luna --------------------------------------------------------------------------------
await linkFamiliar('Luna', actor.items.filter(i => /^find familiar$/i.test(i.name.trim()) || /^wild companion/i.test(i.name.trim())));
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Tsuki fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 