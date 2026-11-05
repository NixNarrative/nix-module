// =====================================================================
//  CORDELIA FIXES (Journey to the East): one-click INSTALLER (Script macro, run as GM)
//  Select Cordelia's token, then run. Safe to re-run.
//   - Fog Cloud / Gust of Wind / Water Walk (Legacy) -> 2024 versions (innate uses kept)
//   - Portent: "Change Fate" pop-ups, last in the stack (after Bardic Inspiration and Weal/Woe)
//   - Expert Divination: regain a lower slot after casting a Divination spell
//   - Find Familiar summons Kai
//  Counterspell / Far Step come from the Counterspell WORLD installer.
// =====================================================================
const SCRIPTS = {
 "FATE_ATTACK": "await (async () => {\n// ---- FATE STACK ENGINE (shared by Cosmic Omen and Portent) -----------------------\n// Runs once per attack roll or saving throw, AFTER Bardic Inspiration has had its chance.\n// Order: Tsuki's Weal/Woe, then Cordelia's Portent. A pop-up only appears when that\n// option could actually flip the result (miss -> hit / fail -> pass, or the reverse).\n// kind: 'attack' | 'save'.  Returns the changed roll, or null if nothing changed.\nconst nixFate = async ({kind, roll, target, rollerToken, workflow}) => {\n    if (!roll || !Number.isFinite(Number(target)) || !rollerToken?.actor) return null;\n    target = Number(target);\n    const OMEN_RANGE = 30;\n    const d20Of = r => {\n        const t = r.terms?.[0];\n        const kept = (t?.results ?? []).filter(x => x.active !== false);\n        return kept.length ? Number(kept[0].result) : Number(t?.total ?? 0);\n    };\n    const state = r => {\n        const nat = d20Of(r);\n        if (kind === 'attack') {\n            if (nat === 1) return {ok: false, locked: true, nat};          // natural 1 always misses\n            if (nat >= (r.options?.criticalSuccess ?? 20)) return {ok: true, crit: true, nat};\n            return {ok: r.total >= target, nat};\n        }\n        return {ok: r.total >= target, nat};\n    };\n    const side = (helperTok, tok) => {\n        const a = helperTok.document.disposition, b = tok.document.disposition;\n        if (helperTok.id === tok.id || a === b) return 'friend';\n        if (a !== 0 && b !== 0 && a === -b) return 'foe';\n        return 'neutral';\n    };\n    const ownerOf = actor => socketUtils.firstOwner(actor, true) ?? game.user.id;\n    const inCombat = combatUtils.inCombat();\n    const label = kind === 'attack' ? 'attack roll' : 'saving throw';\n    let current = roll;\n    let changed = false;\n\n    const helpers = [];\n    for (const t of canvas.tokens.placeables) {\n        if (!t.actor || t.document.hidden) continue;\n        for (const it of t.actor.items) {\n            const role = it.flags?.world?.nixFate;\n            if (role) helpers.push({tok: t, item: it, role});\n        }\n    }\n    helpers.sort((a, b) => (a.role === 'omen' ? 0 : 1) - (b.role === 'omen' ? 0 : 1));\n\n    for (const h of helpers) {\n        const me = h.tok.actor;\n        if (MidiQOL.checkIncapacitated?.(me)) continue;\n        const s = state(current);\n        const rel = side(h.tok, rollerToken);\n        const userId = ownerOf(me);\n\n        // ---------- Cosmic Omen (Weal / Woe): reaction, 30 ft, d6 ----------\n        if (h.role === 'omen') {\n            const omen = h.item;\n            let mode = effectUtils.getEffectByIdentifier(me, 'cosmicOmenWeal') ? 'weal'\n                : effectUtils.getEffectByIdentifier(me, 'cosmicOmenWoe') ? 'woe' : (omen.flags?.world?.nixOmenMode ?? null);\n            if (!mode) continue;\n            if (!(omen.system.uses?.value > 0)) continue;\n            if (inCombat && actorUtils.hasUsedReaction(me)) continue;\n            if (h.tok.id !== rollerToken.id && tokenUtils.getDistance(h.tok, rollerToken) > OMEN_RANGE) continue;\n            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;\n            let sign = 0;\n            if (mode === 'weal' && rel === 'friend' && !s.ok && !s.locked && current.total + 6 >= target) sign = 1;\n            if (mode === 'woe' && rel === 'foe' && s.ok && !s.crit && current.total - 6 < target) sign = -1;\n            if (!sign) continue;\n            const who = rollerToken.document.name;\n            const text = sign > 0\n                ? '<b>Weal:</b> ' + who + ' just failed a ' + label + ' (' + current.total + '). Use your reaction to add 1d6?'\n                : '<b>Woe:</b> ' + who + ' just succeeded on a ' + label + ' (' + current.total + '). Use your reaction to subtract 1d6?';\n            if (!await dialogUtils.confirm(omen.name, text, {userId})) continue;\n            let n = 0;\n            const act = activityUtils.getActivityByIdentifier(omen, sign > 0 ? 'cosmicOmenWeal' : 'cosmicOmenWoe', {strict: true});\n            if (act) {\n                const wf = await workflowUtils.syntheticActivityRoll(act, [rollerToken], {\n                    options: {workflowOptions: {'chris-premades': {notManual: true}}}, dialog: {create: false}, consumeResources: true, userId});\n                n = Number(wf?.utilityRoll?.total) || 0;\n                if (!n) { const m = await fromUuid(wf?.itemCardUuid); n = Number(m?.rolls?.[0]?.total) || 0; }\n            }\n            if (!n) {\n                const r = await rollUtils.rollDice('1d6', {chatMessage: true, flavor: omen.name + (sign > 0 ? ': Weal' : ': Woe')});\n                n = r.roll.total;\n                await genericUtils.update(omen, {'system.uses.spent': (omen.system.uses.spent ?? 0) + 1});\n            }\n            if (inCombat) await actorUtils.setReactionUsed(me);\n            current = await rollUtils.addToRoll(current, String(sign * n), {rollData: current.data});\n            changed = true;\n            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n                content: '<b>' + omen.name + (sign > 0 ? ' (Weal)' : ' (Woe)') + ':</b> ' + (sign > 0 ? '+' : '-') + n + ' to '\n                    + who + '\\'s ' + label + ' (now ' + current.total + ').'});\n            continue;\n        }\n\n        // ---------- Portent: replace the d20 with a foretelling roll ----------\n        if (h.role === 'portent') {\n            const portent = h.item;\n            const dice = [...(portent.flags?.world?.nixPortent?.rolls ?? [])];\n            if (!dice.length) continue;\n            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;\n            const base = current.total - s.nat;\n            let options = [];\n            if (rel === 'friend' && !s.ok) options = dice.filter(v => v > 10 && base + v >= target);\n            if (rel === 'foe' && s.ok) options = dice.filter(v => v < 10 && base + v < target);\n            options = [...new Set(options)].sort((a, b) => b - a);\n            if (!options.length) continue;\n            const who = rollerToken.document.name;\n            const head = rel === 'friend'\n                ? who + ' just failed a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?'\n                : who + ' just succeeded on a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?';\n            const pick = await dialogUtils.buttonDialog(portent.name + ': Change Fate', head,\n                options.map(v => ['Replace the d20 with your ' + v, String(v)]).concat([['Leave it', false]]), {userId});\n            if (!pick) continue;\n            const v = Number(pick);\n            const left = [...dice];\n            left.splice(left.indexOf(v), 1);\n            await portent.setFlag('world', 'nixPortent', {...(portent.flags.world.nixPortent ?? {}), rolls: left});\n            const shown = me.effects.find(e => e.flags?.world?.nixPortentShow);\n            if (shown) await genericUtils.update(shown, {name: left.length ? 'Portent: ' + left.join(', ') : 'Portent: (all used)'});\n            current = await rollUtils.replaceD20(current, v);\n            changed = true;\n            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n                content: '<b>' + portent.name + ': Change Fate.</b> ' + me.name + ' replaces ' + who + '\\'s d20 with a <b>' + v\n                    + '</b> (' + label + ' now ' + current.total + ').' + (left.length ? ' Foretold rolls left: ' + left.join(', ') + '.' : ' No foretold rolls left.')});\n        }\n    }\n    return changed ? current : null;\n};\n// Fate stack: attack rolls. Runs from scenePostAttackRoll (someone else attacks) and\n// postAttackRoll (the helper attacks). Waits until Midi's preCheckHits so Bardic Inspiration\n// and Combat Inspiration (both earlier passes) have already been offered.\nif (!workflow?.attackRoll || workflow.nixFateHooked || !workflow.targets?.size || !workflow.token) return;\nworkflow.nixFateHooked = true;\nconst wfId = workflow.id;\nconst hookId = Hooks.on('midi-qol.preCheckHits', async wf => {\n    if (wf?.id !== wfId) return;\n    Hooks.off('midi-qol.preCheckHits', hookId);\n    const target = Array.from(wf.targets ?? []).find(t => t.actor);\n    if (!target) return;\n    const ac = Number(target.actor.system.attributes?.ac?.value ?? 10);\n    const res = await nixFate({kind: 'attack', roll: wf.attackRoll, target: ac, rollerToken: wf.token, workflow: wf});\n    if (res) await wf.setAttackRoll(res);\n});\nsetTimeout(() => Hooks.off('midi-qol.preCheckHits', hookId), 180000);\n})();",
 "FATE_SAVE": "return await (async () => {\n// ---- FATE STACK ENGINE (shared by Cosmic Omen and Portent) -----------------------\n// Runs once per attack roll or saving throw, AFTER Bardic Inspiration has had its chance.\n// Order: Tsuki's Weal/Woe, then Cordelia's Portent. A pop-up only appears when that\n// option could actually flip the result (miss -> hit / fail -> pass, or the reverse).\n// kind: 'attack' | 'save'.  Returns the changed roll, or null if nothing changed.\nconst nixFate = async ({kind, roll, target, rollerToken, workflow}) => {\n    if (!roll || !Number.isFinite(Number(target)) || !rollerToken?.actor) return null;\n    target = Number(target);\n    const OMEN_RANGE = 30;\n    const d20Of = r => {\n        const t = r.terms?.[0];\n        const kept = (t?.results ?? []).filter(x => x.active !== false);\n        return kept.length ? Number(kept[0].result) : Number(t?.total ?? 0);\n    };\n    const state = r => {\n        const nat = d20Of(r);\n        if (kind === 'attack') {\n            if (nat === 1) return {ok: false, locked: true, nat};          // natural 1 always misses\n            if (nat >= (r.options?.criticalSuccess ?? 20)) return {ok: true, crit: true, nat};\n            return {ok: r.total >= target, nat};\n        }\n        return {ok: r.total >= target, nat};\n    };\n    const side = (helperTok, tok) => {\n        const a = helperTok.document.disposition, b = tok.document.disposition;\n        if (helperTok.id === tok.id || a === b) return 'friend';\n        if (a !== 0 && b !== 0 && a === -b) return 'foe';\n        return 'neutral';\n    };\n    const ownerOf = actor => socketUtils.firstOwner(actor, true) ?? game.user.id;\n    const inCombat = combatUtils.inCombat();\n    const label = kind === 'attack' ? 'attack roll' : 'saving throw';\n    let current = roll;\n    let changed = false;\n\n    const helpers = [];\n    for (const t of canvas.tokens.placeables) {\n        if (!t.actor || t.document.hidden) continue;\n        for (const it of t.actor.items) {\n            const role = it.flags?.world?.nixFate;\n            if (role) helpers.push({tok: t, item: it, role});\n        }\n    }\n    helpers.sort((a, b) => (a.role === 'omen' ? 0 : 1) - (b.role === 'omen' ? 0 : 1));\n\n    for (const h of helpers) {\n        const me = h.tok.actor;\n        if (MidiQOL.checkIncapacitated?.(me)) continue;\n        const s = state(current);\n        const rel = side(h.tok, rollerToken);\n        const userId = ownerOf(me);\n\n        // ---------- Cosmic Omen (Weal / Woe): reaction, 30 ft, d6 ----------\n        if (h.role === 'omen') {\n            const omen = h.item;\n            let mode = effectUtils.getEffectByIdentifier(me, 'cosmicOmenWeal') ? 'weal'\n                : effectUtils.getEffectByIdentifier(me, 'cosmicOmenWoe') ? 'woe' : (omen.flags?.world?.nixOmenMode ?? null);\n            if (!mode) continue;\n            if (!(omen.system.uses?.value > 0)) continue;\n            if (inCombat && actorUtils.hasUsedReaction(me)) continue;\n            if (h.tok.id !== rollerToken.id && tokenUtils.getDistance(h.tok, rollerToken) > OMEN_RANGE) continue;\n            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;\n            let sign = 0;\n            if (mode === 'weal' && rel === 'friend' && !s.ok && !s.locked && current.total + 6 >= target) sign = 1;\n            if (mode === 'woe' && rel === 'foe' && s.ok && !s.crit && current.total - 6 < target) sign = -1;\n            if (!sign) continue;\n            const who = rollerToken.document.name;\n            const text = sign > 0\n                ? '<b>Weal:</b> ' + who + ' just failed a ' + label + ' (' + current.total + '). Use your reaction to add 1d6?'\n                : '<b>Woe:</b> ' + who + ' just succeeded on a ' + label + ' (' + current.total + '). Use your reaction to subtract 1d6?';\n            if (!await dialogUtils.confirm(omen.name, text, {userId})) continue;\n            let n = 0;\n            const act = activityUtils.getActivityByIdentifier(omen, sign > 0 ? 'cosmicOmenWeal' : 'cosmicOmenWoe', {strict: true});\n            if (act) {\n                const wf = await workflowUtils.syntheticActivityRoll(act, [rollerToken], {\n                    options: {workflowOptions: {'chris-premades': {notManual: true}}}, dialog: {create: false}, consumeResources: true, userId});\n                n = Number(wf?.utilityRoll?.total) || 0;\n                if (!n) { const m = await fromUuid(wf?.itemCardUuid); n = Number(m?.rolls?.[0]?.total) || 0; }\n            }\n            if (!n) {\n                const r = await rollUtils.rollDice('1d6', {chatMessage: true, flavor: omen.name + (sign > 0 ? ': Weal' : ': Woe')});\n                n = r.roll.total;\n                await genericUtils.update(omen, {'system.uses.spent': (omen.system.uses.spent ?? 0) + 1});\n            }\n            if (inCombat) await actorUtils.setReactionUsed(me);\n            current = await rollUtils.addToRoll(current, String(sign * n), {rollData: current.data});\n            changed = true;\n            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n                content: '<b>' + omen.name + (sign > 0 ? ' (Weal)' : ' (Woe)') + ':</b> ' + (sign > 0 ? '+' : '-') + n + ' to '\n                    + who + '\\'s ' + label + ' (now ' + current.total + ').'});\n            continue;\n        }\n\n        // ---------- Portent: replace the d20 with a foretelling roll ----------\n        if (h.role === 'portent') {\n            const portent = h.item;\n            const dice = [...(portent.flags?.world?.nixPortent?.rolls ?? [])];\n            if (!dice.length) continue;\n            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;\n            const base = current.total - s.nat;\n            let options = [];\n            if (rel === 'friend' && !s.ok) options = dice.filter(v => v > 10 && base + v >= target);\n            if (rel === 'foe' && s.ok) options = dice.filter(v => v < 10 && base + v < target);\n            options = [...new Set(options)].sort((a, b) => b - a);\n            if (!options.length) continue;\n            const who = rollerToken.document.name;\n            const head = rel === 'friend'\n                ? who + ' just failed a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?'\n                : who + ' just succeeded on a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?';\n            const pick = await dialogUtils.buttonDialog(portent.name + ': Change Fate', head,\n                options.map(v => ['Replace the d20 with your ' + v, String(v)]).concat([['Leave it', false]]), {userId});\n            if (!pick) continue;\n            const v = Number(pick);\n            const left = [...dice];\n            left.splice(left.indexOf(v), 1);\n            await portent.setFlag('world', 'nixPortent', {...(portent.flags.world.nixPortent ?? {}), rolls: left});\n            const shown = me.effects.find(e => e.flags?.world?.nixPortentShow);\n            if (shown) await genericUtils.update(shown, {name: left.length ? 'Portent: ' + left.join(', ') : 'Portent: (all used)'});\n            current = await rollUtils.replaceD20(current, v);\n            changed = true;\n            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),\n                content: '<b>' + portent.name + ': Change Fate.</b> ' + me.name + ' replaces ' + who + '\\'s d20 with a <b>' + v\n                    + '</b> (' + label + ' now ' + current.total + ').' + (left.length ? ' Foretold rolls left: ' + left.join(', ') + '.' : ' No foretold rolls left.')});\n        }\n    }\n    return changed ? current : null;\n};\n// Fate stack: saving throws. 'bonus' pass (the helper's own save) and 'sceneBonus' (anyone\n// else's save). Both run after Bardic Inspiration's 'bonus' pass. One run per roll.\nconst roll = trigger.roll;\nconst dc = Number(roll?.options?.target);\nif (!roll || !dc || roll.options?.nixFate) return;\nroll.options.nixFate = true;\nconst saver = trigger.sourceActor ?? trigger.actor;\nconst tok = actorUtils.getFirstToken(saver);\nif (!tok) return;\nconst res = await nixFate({kind: 'save', roll, target: dc, rollerToken: tok});\nif (!res) return;\nres.options.nixFate = true;\nreturn res;\n})();",
 "PORTENT_ROLL": "await (async () => {\n// Portent: roll the foretelling dice (2, or 3 from Wizard 14) and remember them.\nconst item = trigger?.entity ?? workflow?.item;\nconst actor = item.actor;\nconst wiz = actor.classes?.wizard?.system.levels ?? 0;\nconst count = wiz >= 14 ? 3 : 2;\nconst r = await rollUtils.rollDice(count + 'd20', {chatMessage: true, flavor: item.name + ': foretelling rolls', mode: 'gmroll'});\nconst rolls = r.roll.dice[0].results.map(x => Number(x.result));\nawait item.setFlag('world', 'nixPortent', {rolls, rolledAt: Date.now()});\nconst name = 'Portent: ' + rolls.join(', ');\nconst shown = actor.effects.find(e => e.flags?.world?.nixPortentShow);\nif (shown) await genericUtils.update(shown, {name});\nelse await effectUtils.createEffect(actor, {name, img: item.img, origin: item.uuid, transfer: false,\n    description: 'Foretold d20 rolls. Above 10: offered when you or an ally fails an attack roll or saving throw. Below 10: offered when a hostile creature succeeds on one.',\n    flags: {world: {nixPortentShow: true}}}, {identifier: 'nixPortentShow'});\nawait ChatMessage.create({whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, 'OWNER')).map(u => u.id),\n    speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + ' foretells <b>' + rolls.join(', ') + '</b>.'});\n})();",
 "EXPERT_DIVINATION": "await (async () => {\n// Expert Divination: casting a Divination spell of 2nd level or higher with a slot regains\n// one expended slot of a lower level (5th at most).\nconst item = trigger.entity;\nconst sp = workflow.item;\nif (sp?.type !== 'spell' || sp.system.school !== 'div') return;\nconst method = sp.system.method ?? sp.system.preparation?.mode;\nif (['innate', 'atwill', 'ritual', 'pact'].includes(method)) return;\nconst lvl = Number(workflowUtils.getCastLevel?.(workflow) ?? workflow.castData?.castLevel ?? sp.system.level);\nif (!(lvl >= 2)) return;\nconst actor = workflow.actor;\nconst opts = [];\nfor (let l = Math.min(lvl - 1, 5); l >= 1; l--) {\n    const s = actor.system.spells?.['spell' + l];\n    if (s && (s.max ?? 0) > 0 && s.value < s.max) opts.push(l);\n}\nif (!opts.length) return;\nconst userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\nconst ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');\nconst pick = opts.length === 1 ? String(opts[0]) : await dialogUtils.buttonDialog(item.name,\n    'You cast ' + sp.name + ' at ' + ord(lvl) + ' level. Regain which expended spell slot?',\n    opts.map(l => [ord(l) + '-level slot (' + actor.system.spells['spell' + l].value + '/' + actor.system.spells['spell' + l].max + ')', String(l)]), {userId});\nif (!pick) return;\nconst key = 'spell' + pick;\nawait genericUtils.update(actor, {['system.spells.' + key + '.value']: actor.system.spells[key].value + 1});\nawait ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + ' regains a ' + ord(Number(pick)) + '-level spell slot.'});\n})();"
};
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Cordelia fixes: select Cordelia\'s token first.');
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
 
// ---- 1. Legacy spells -> 2024 ----------------------------------------------------------------
{
    const find2024 = async (name) => {
        let best = null, bestScore = -1;
        for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
            let idx;
            try { idx = await pack.getIndex({fields: ['type', 'system.source.rules']}); } catch { continue; }
            for (const e of idx) {
                if (e.type !== 'spell' || lc(e.name) !== lc(name)) continue;
                let score = 0;
                if (String(e.system?.source?.rules ?? '') === '2024') score += 4;
                if (/players-handbook|phb/i.test(pack.metadata.packageName ?? '') || /2024|24/.test(pack.collection)) score += 2;
                if (pack.metadata.packageName === 'chris-premades') score += 1;
                if (score > bestScore) { best = {pack, id: e._id}; bestScore = score; }
            }
        }
        return best ? await best.pack.getDocument(best.id) : null;
    };
    const legacy = actor.items.filter(i => i.type === 'spell' && /\(legacy\)\s*$/i.test(i.name));
    const swapped = [], removed = [], missing = [];
    for (const old of legacy) {
        const base = old.name.replace(/\s*\(legacy\)\s*$/i, '').trim();
        const method = old.system.method ?? old.system.preparation?.mode;
        const twin = actor.items.find(i => i.type === 'spell' && i.id !== old.id && lc(i.name) === lc(base) && (i.system.method ?? i.system.preparation?.mode) === method);
        if (twin) { await old.delete(); removed.push(old.name); continue; }
        const src = await find2024(base);
        if (!src) { missing.push(base); continue; }
        const data = src.toObject();
        delete data._id;
        data.system.method = method;
        if (old.system.prepared !== undefined) data.system.prepared = old.system.prepared;
        if (old.system.preparation) data.system.preparation = foundry.utils.deepClone(old.system.preparation);
        if (old.system.sourceClass) data.system.sourceClass = old.system.sourceClass;
        if (old.system.ability) data.system.ability = old.system.ability;
        if (old.system.uses?.max) {
            data.system.uses = foundry.utils.deepClone(old.toObject().system.uses);
            for (const a of Object.values(data.system.activities ?? {})) {
                a.consumption ??= {targets: [], scaling: {}};
                a.consumption.targets ??= [];
                if (!a.consumption.targets.some(t => t.type === 'itemUses')) a.consumption.targets.push({type: 'itemUses', target: '', value: '1', scaling: {}});
                a.consumption.spellSlot = false;
            }
        }
        await actor.createEmbeddedDocuments('Item', [data]);
        await old.delete();
        swapped.push(base + (method === 'innate' ? ' (innate, ' + (old.system.uses?.max ?? '') + '/LR kept)' : ''));
    }
    report.push('<li>Legacy spells: ' + (swapped.length ? 'replaced with the 2024 version: ' + swapped.join(', ') + '. ' : '')
        + (removed.length ? 'Removed duplicate legacy copies: ' + removed.join(', ') + '. ' : '')
        + (missing.length ? '<b>No 2024 version found in your compendiums for: ' + missing.join(', ') + '</b> (import it from D&D Beyond or the 2024 PHB, then run again).' : '')
        + (!legacy.length ? 'none left.' : '') + '</li>');
}
 
// ---- 2. Portent ------------------------------------------------------------------------------
{
    const portent = find(/^portent/i);
    if (!portent) report.push('<li><b>Portent</b> not found.</li>');
    else {
        await installFate(portent, 'portent');
        await setMacros(portent, ['Portent: long rest'], [{name: 'Portent: long rest', type: 'rest', pass: 'long', priority: 50, macro: SCRIPTS.PORTENT_ROLL}]);
        const fore = await ensureActivity(portent, 'Foretell (roll Portent dice)', 'utility', {
            img: portent.img, activation: {type: 'special', value: null, override: true}, consumption: {targets: [], scaling: {allowed: false}},
            range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
            description: {chatFlavor: 'Roll the foretelling d20s for today (normally done automatically after a long rest).'}});
        await setActivityMacros(portent, fore, [{name: 'Portent: foretell', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.PORTENT_ROLL}]);
        const have = portent.flags?.world?.nixPortent?.rolls ?? [];
        report.push('<li>Portent: after each long rest her ' + ((actor.classes?.wizard?.system.levels ?? 0) >= 14 ? 'three' : 'two') + ' foretelling d20s are rolled and shown as an effect on her ("Portent: 14, 16"). '
            + 'A roll <b>above 10</b> is offered (<i>Change Fate</i>) when she or an ally fails an attack roll or saving throw and that number would turn it into a success. '
            + 'A roll <b>below 10</b> is offered when a hostile creature succeeds and that number would make it fail. A 10 is never offered. Portent always comes last: Bardic Inspiration, then Tsuki\'s Weal/Woe, then Portent. '
            + (have.length ? 'Current rolls: ' + have.join(', ') + '.' : '<b>No rolls stored yet: click Portent > "Foretell (roll Portent dice)" once now.</b>') + '</li>');
    }
}
 
// ---- 3. Expert Divination -------------------------------------------------------------------
{
    const ed = find(/^expert divination/i);
    if (!ed) report.push('<li><b>Expert Divination</b> not found.</li>');
    else {
        for (const k of ['macros']) if (ed.flags?.['chris-premades']?.[k]) await ed.unsetFlag('chris-premades', k);
        await setMacros(ed, ['Expert Divination'], [{name: 'Expert Divination', type: 'midi-actor', pass: 'rollFinished', priority: 60, macro: SCRIPTS.EXPERT_DIVINATION}]);
        report.push('<li>Expert Divination: after she casts a Divination spell of 2nd level or higher with a slot, she picks an expended slot of a lower level (5th at most) to regain.</li>');
    }
}
 
// ---- 4. Kai -----------------------------------------------------------------------------------
await linkFamiliar('Kai', actor.items.filter(i => i.type === 'spell' && /^find familiar$/i.test(i.name.trim())));
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Cordelia fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 