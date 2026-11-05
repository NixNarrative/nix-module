// =====================================================================
//  NETHTARI FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Nethtari selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros (flags.cat.embeddedMacros, stored shape) for:
//   - Agonizing Blast: +Cha per Eldritch Blast beam (actorDamageRollBonuses)
//   - Eldritch Bident: d12 beams (itemPreItemRoll) and the nat-20 shunt (itemRollFinished)
//   - Fiendish Vigor: maximum False Life without a slot (actorDamageRoll) + 12 temp HP button
//   - Gift of the Protectors: Write Names + 1 HP instead of 0 (sceneDamageComplete / targetDamageComplete)
//   - Sentinel Raven: +Cha Perception while the raven is summoned (Chris's Premades 2 Find Familiar)
//   - Soul of the Raven: Merge / Return activities (token art and size handled directly)
//   - Pearl of Power: regains a Pact slot
//  Raven's Shield and Spell Sniper were migrated by Foundry; checked, rebuilt only if missing.
//  Removes the inert v13 copies (flags.chris-premades) of these macros.
//  Her Eldritch Blast beams come from the world Eldritch Blast installer (run it first).
//
//  Every macro body is wrapped in `return await (async () => {...})();`.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Nethtari fixes (v14): select Nethtari\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name));
const findAll = re => actor.items.filter(i => re.test(i.name));
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
async function ensureActivity(item, name, type, data) {
    let act = (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
    if (!act) {
        await item.createActivity(type, {name, ...data}, {renderSheet: false});
        act = (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
    } else await act.update(data);
    return act;
}
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
 
// =====================================================================
//  Macros (CAT scope: document, actor, token (TokenDocument), workflow, ditem, config, options...)
// =====================================================================
 
// Agonizing Blast feature: roll / actorDamageRollBonuses / 100.
const agonizing = async () => {
    if (workflow.item?.name?.toLowerCase().trim() !== 'eldritch blast') return;
    if (!workflow.damageRolls?.length) return;
    const cha = workflow.actor.system.abilities.cha.mod;
    if (cha <= 0) return;
    await workflowUtils.bonusDamage(workflow, String(cha), {ignoreCrit: true, damageType: workflow.damageRolls[0]?.options?.type ?? 'force'});
};
 
// Eldritch Blast: roll / itemPreItemRoll / 20. d12 beams while the Bident is equipped and attuned.
const bidentDie = async () => {
    const me = workflow.actor;
    const bident = me.items.find(i => /eldritch bident/i.test(i.name) && i.system.equipped && (!i.system.attunement || i.system.attuned));
    const die = bident ? 12 : 10;
    for (const act of workflow.item.system.activities?.contents ?? []) {
        const parts = act.damage?.parts;
        if (!parts?.length) continue;
        if (parts.every(p => (p.denomination ?? die) === die)) continue;
        const data = parts.map(p => {
            const o = p.toObject ? p.toObject() : foundry.utils.deepClone(p);
            if (o.denomination === 10 || o.denomination === 12) o.denomination = die;
            return o;
        });
        await act.update({'damage.parts': data});
    }
};
 
// Eldritch Blast: roll / itemRollFinished / 60. Each beam is its own workflow (world installer).
const bidentShunt = async () => {
    if (!workflow.attackRoll || !workflow.hitTargets?.size) return;
    const d20 = workflow.attackRoll.dice?.[0];
    const nat = d20?.results?.find(r => r.active)?.result ?? d20?.total;
    if (nat !== 20) return;
    const me = workflow.actor;
    const bident = me.items.find(i => /eldritch bident/i.test(i.name) && i.system.equipped && (!i.system.attunement || i.system.attuned));
    if (!bident) return;
    const target = workflow.hitTargets.first();
    if (!target?.actor || target.document.hidden) return;
    const res = await rollUtils.requestRoll(target.actor, 'save', 'cha', {rollDC: 10, fast: true});
    const r0 = res?.rolls?.[0] ?? (Array.isArray(res) ? res[0] : res);
    const total = r0?.total;
    const natD = r0?.dice?.[0];
    const natural = natD?.results?.find(x => x.active)?.result ?? natD?.total;
    const natOne = natural === 1;
    if (total === undefined || (total >= 10 && !natOne)) {
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
            content: '<b>' + bident.name + ':</b> ' + target.document.name + ' resists being shunted (Charisma save ' + (total ?? '?') + ' vs DC 10).'});
        return;
    }
    // Its combatants: remember whether each was hidden, so the return can put them back.
    const shuntCombatants = game.combats.contents.flatMap(c => c.combatants.filter(cb => cb.tokenId === target.document.id && cb.sceneId === target.document.parent?.id))
        .map(cb => ({uuid: cb.uuid, hidden: !!cb.hidden}));
    // On the target's effect. document = that effect, actor = the target.
    const onTurn = async () => {
        // Put the token's combatants back as they were before the shunt (older shunts: just unhide them).
        const restoreCombatants = async (s, tok) => {
            const td = tok?.document ?? tok;
            const list = s?.combatants ?? (td ? game.combats.contents.flatMap(c => c.combatants.filter(cb => cb.tokenId === td.id && cb.sceneId === td.parent?.id))
                .map(cb => ({uuid: cb.uuid, hidden: false})) : []);
            for (const c of list) {
                const cb = await fromUuid(c.uuid);
                if (cb && !!cb.hidden !== c.hidden) await documentUtils.update(cb, {hidden: c.hidden});
            }
        };
        const eff = document;
        const s = eff.flags.world?.bidentShunt;
        if (!s) return;
        const tok = actorUtils.getFirstToken(eff.parent);
        if (tok) await tok.update({hidden: false});
        await restoreCombatants(s, tok);
        await documentUtils.update(eff, {'flags.world.bidentShunt.returned': true});
        if (tok) {
            const src = s.sourceTokenUuid ? await fromUuid(s.sourceTokenUuid) : null;
            const r = await new CONFIG.Dice.DamageRoll('2d12', {}, {type: 'psychic'}).evaluate();
            await workflowUtils.applyWorkflowDamage(src?.object ?? tok.object, r, 'psychic', [tok.object],
                {flavor: 'Eldritch Bident: return from the far plane'});
        }
        await documentUtils.deleteDocument(eff);
    };
    const onDelete = async () => {
        // Put the token's combatants back as they were before the shunt (older shunts: just unhide them).
        const restoreCombatants = async (s, tok) => {
            const td = tok?.document ?? tok;
            const list = s?.combatants ?? (td ? game.combats.contents.flatMap(c => c.combatants.filter(cb => cb.tokenId === td.id && cb.sceneId === td.parent?.id))
                .map(cb => ({uuid: cb.uuid, hidden: false})) : []);
            for (const c of list) {
                const cb = await fromUuid(c.uuid);
                if (cb && !!cb.hidden !== c.hidden) await documentUtils.update(cb, {hidden: c.hidden});
            }
        };
        const eff = document;
        if (eff.flags.world?.bidentShunt?.returned) return;
        const tok = actorUtils.getFirstToken(eff.parent);
        if (tok?.hidden) await tok.update({hidden: false});
        await restoreCombatants(eff.flags.world?.bidentShunt, tok);
    };
    const m = (name, event, pass, fn) => ({name, event, pass, macros: [{priority: 50, macro: 'return await (' + fn.toString() + ')();'}]});
    await effectUtils.createEffects(target.actor, [{
        name: 'Shunted (Eldritch Bident)',
        img: bident.img,
        origin: bident.uuid,
        duration: {value: 1, units: 'rounds'},
        description: 'Shunted to a plane of eldritch horrors. Reappears at the start of its next turn and takes 2d12 psychic damage.',
        flags: {
            world: {bidentShunt: {sourceTokenUuid: workflow.token?.document.uuid, combatants: shuntCombatants}},
            cat: {identifier: 'bidentShunt', embeddedMacros: [
                m('Bident shunt return', 'combat', 'actorTurnStart', onTurn),
                m('Bident shunt cleanup', 'effect', 'deleted', onDelete)
            ]}
        }
    }]);
    if (globalThis.Sequencer) {
        const f = ['jb2a.portals.vertical.vortex.purple', 'jb2a.misty_step.01.purple'].find(x => Sequencer.Database.entryExists(x));
        if (f) new Sequence().effect().file(f).atLocation(target).scaleToObject(1.5).play();
    }
    await target.document.update({hidden: true});
    for (const c of shuntCombatants) {
        const cb = await fromUuid(c.uuid);
        if (cb && !cb.hidden) await documentUtils.update(cb, {hidden: true});
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + bident.name + ':</b> natural 20! ' + target.document.name + ' fails its Charisma save (' + total + (natOne ? ', natural 1' : '')
            + ') and is shunted to a plane of eldritch horrors. It returns at the start of its next turn and takes 2d12 psychic damage.'});
};
 
// Fiendish Vigor feature: roll / actorDamageRoll / 40. Slot-less False Life rolls its maximum.
// (CAT has no replaceDamage; the damage rolls are swapped while they are still editable.)
const vigorMax = async () => {
    if (workflow.item?.name?.toLowerCase().trim() !== 'false life') return;
    const method = workflow.item.system.method ?? workflow.item.system.preparation?.mode;
    const viaVigor = workflow.item.flags?.dnd5e?.cachedFor || ['atwill', 'innate'].includes(method)
        || /vigor/i.test(workflow.item.system.sourceItem ?? '');
    if (!viaVigor || !workflow.damageRolls?.length) return;
    let changed = false;
    const rolls = [];
    for (const r of workflow.damageRolls) {
        const max = await new CONFIG.Dice.DamageRoll(r.formula, workflow.actor.getRollData(), foundry.utils.deepClone(r.options ?? {})).evaluate({maximize: true});
        if (max.total > r.total) changed = true;
        rolls.push(max);
    }
    if (!changed) return;
    await workflow.setDamageRolls(rolls);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        content: '<b>Fiendish Vigor:</b> False Life gives the maximum: <b>' + rolls.reduce((t, r) => t + r.total, 0) + '</b> temporary hit points.'});
};
 
// Fiendish Vigor "Cast False Life" activity: roll / activityRollFinished / 50.
const vigorCast = async () => {
    const AMOUNT = 12;
    const me = workflow.actor;
    const cur = me.system.attributes.hp.temp ?? 0;
    if (AMOUNT > cur) await documentUtils.update(me, {'system.attributes.hp.temp': AMOUNT});
    const tok = workflow.token ?? actorUtils.getFirstToken(me)?.object;
    if (tok && globalThis.Sequencer) {
        const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
        const f = ['jb2a.energy_field.01.purple', 'jb2a.shield.01.complete.01.purple', 'jb2a.healing_generic.burst.purplepink'].find(ok);
        if (f) new Sequence().effect().file(f).atLocation(tok).scaleToObject(1.8).play();
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>Fiendish Vigor:</b> False Life wraps ' + me.name + ' in fiendish vitality: <b>' + AMOUNT + ' temporary hit points</b>'
            + (AMOUNT > cur ? '.' : ' (she already has ' + cur + ', so no change).')});
};
 
// Gift of the Protectors "Write Names" activity: roll / activityRollFinished / 50.
const giftWrite = async () => {
    const gift = workflow.item;
    const me = workflow.actor;
    const max = Math.max(1, me.system.abilities.cha.mod);
    const seen = new Set();
    const candidates = [];
    for (const a of game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner)) { seen.add(a.id); candidates.push(a); }
    for (const t of canvas.tokens.placeables) {
        if (t.actor && !seen.has(t.actor.id) && t.document.disposition === 1) { seen.add(t.actor.id); candidates.push(t.actor); }
    }
    const picked = await dialogUtils.selectDocumentDialog(gift.name,
        'Which creatures have written their names in the Book of Shadows? (up to ' + max + ')',
        candidates, {max, checkbox: true, sortAlphabetical: true});
    if (!picked) return;
    const docs = (Array.isArray(picked) ? picked : [picked])
        .filter(p => p && (p.amount === undefined || p.amount)).map(p => p.document ?? p);
    const ids = docs.map(d => d.id).filter(Boolean).slice(0, max);
    await gift.setFlag('world', 'giftNames', ids);
    const names = ids.map(id => game.actors.get(id)?.name ?? id);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + gift.name + ':</b> names in the Book of Shadows: ' + (names.join(', ') || '<i>none</i>') + '.'});
};
 
// Gift of the Protectors: roll / sceneDamageComplete / 240 (anyone) and targetDamageComplete / 240 (herself).
const giftSave = async () => {
    const gift = document;
    const me = gift.parent;
    if (!ditem || ditem.newHP > 0 || ditem.oldHP <= 0) return;
    const victim = fromUuidSync(ditem.actorUuid);
    if (!victim) return;
    const names = gift.getFlag('world', 'giftNames') ?? [];
    if (!names.includes(victim.id)) return;
    if (gift.system.uses?.max && !(gift.system.uses.value > 0)) return;
    // Both passes can see the same damage on her: ask once.
    const key = ditem.actorUuid + '|' + ditem.oldHP + '|' + ditem.totalDamage;
    globalThis.nixGiftAsked ??= new Map();
    const at = globalThis.nixGiftAsked.get(key);
    if (at && Date.now() - at < 3000) { if (globalThis.nixGiftAsked.get(key + '|yes')) workflowUtils.preventZeroHP(ditem); return; }
    globalThis.nixGiftAsked.set(key, Date.now());
    // "Not killed outright": massive damage (remaining damage >= max HP) kills instantly.
    const overflow = (ditem.totalDamage ?? 0) - (ditem.oldHP ?? 0) - (ditem.oldTempHP ?? 0);
    if (overflow >= (victim.system.attributes.hp.max ?? Infinity)) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm(gift.name,
        victim.name + ' is about to drop to 0 HP. Use ' + gift.name + ' to leave them at 1 HP instead? (once per long rest)', {userId});
    if (!yes) return;
    globalThis.nixGiftAsked.set(key + '|yes', Date.now());
    workflowUtils.preventZeroHP(ditem);
    if (gift.system.uses?.max) await documentUtils.update(gift, {'system.uses.spent': (gift.system.uses.spent ?? 0) + 1});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>' + gift.name + ':</b> ' + victim.name + '\'s name glows in the Book of Shadows. They drop to 1 HP instead of 0.'});
};
 
// Sentinel Raven feature: roll / actorRollFinished / 60. After Find Familiar, +Cha Perception
// for as long as the familiar's summon effect lasts.
const ravenPerch = async () => {
    if (workflow.item?.name?.toLowerCase().trim() !== 'find familiar') return;
    const me = workflow.actor;
    const getFx = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
    const isSummonFx = e => /^find familiar$/i.test(e.name.trim()) && !/pocket/i.test(e.name);
    let familiarEffect;
    for (let i = 0; i < 20 && !familiarEffect; i++) {
        familiarEffect = getFx(me, 'findFamiliar')
            ?? me.effects.find(e => isSummonFx(e) && e.flags?.cat && String(e.origin ?? '').startsWith(workflow.item.uuid))
            ?? me.effects.find(e => isSummonFx(e) && e.flags?.cat);
        if (!familiarEffect) await genericUtils.sleep(500);
    }
    if (!familiarEffect) return;
    const old = getFx(me, 'sentinelRavenNear');
    if (old) await documentUtils.deleteDocument(old);
    const [eff] = await effectUtils.createEffects(me, [{
        name: 'Sentinel Raven',
        img: document.img,
        origin: document.uuid,
        description: 'While her raven is summoned: + Charisma modifier to Perception checks and passive Perception.',
        system: {changes: [
            {key: 'system.skills.prc.bonuses.check', type: 'add', value: '+@abilities.cha.mod', priority: 20},
            {key: 'system.skills.prc.bonuses.passive', type: 'add', value: '+@abilities.cha.mod', priority: 20}
        ]},
        flags: {cat: {identifier: 'sentinelRavenNear'}}
    }]);
    if (eff) await documentUtils.makeDependent(familiarEffect, [eff]);
};
 
// Soul of the Raven "Merge with Raven" activity: roll / activityRollFinished / 50.
const ravenMerge = async () => {
    const me = workflow.actor;
    const myToken = workflow.token;
    if (!myToken) return;
    const getFx = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
    if (getFx(me, 'soulOfTheRaven')) return ui.notifications.info('Already merged with the raven.');
    // Find her familiar's token: ids stored on her Find Familiar effect(s), or a token
    // whose actor points back at her.
    const strings = new Set();
    const walk = o => { if (!o) return; if (typeof o === 'string') strings.add(o); else if (Array.isArray(o)) o.forEach(walk); else if (typeof o === 'object') Object.values(o).forEach(walk); };
    for (const e of me.effects.filter(e => /find familiar/i.test(e.name))) walk(e.flags);
    let api = [];
    try { api = [summonUtils.getSummons?.(me) ?? []].flat(); } catch { api = []; }
    for (const s of api) { if (s?.uuid) strings.add(s.uuid); if (s?.id) strings.add(s.id); }
    const pointsAtMe = t => { const s = new Set(); const w = o => { if (!o) return; if (typeof o === 'string') s.add(o); else if (typeof o === 'object') Object.values(o).forEach(w); }; w(t.actor?.flags?.cat); w(t.actor?.flags?.['chris-premades']?.summons); return s.has(me.uuid) || s.has(me.id); };
    const raven = canvas.tokens.placeables.find(t => t.actor && t.id !== myToken.id && !t.document.hidden
        && (strings.has(t.id) || strings.has(t.document.uuid) || strings.has(t.actor.uuid)))
        ?? canvas.tokens.placeables.find(t => t.actor && t.id !== myToken.id && !t.document.hidden && pointsAtMe(t));
    if (!raven) return ui.notifications.warn('Soul of the Raven: summon your raven first (Find Familiar).');
    if (tokenUtils.getDistance(myToken.document, raven.document) > 5) return ui.notifications.warn('Soul of the Raven: the raven must be perched on your shoulder (within 5 ft).');
    const move = raven.actor.system.attributes.movement ?? {};
    const changes = [{key: 'system.traits.size', type: 'override', value: 'tiny', priority: 30}];
    for (const k of ['walk', 'fly', 'climb', 'swim', 'burrow']) {
        changes.push({key: 'system.attributes.movement.' + k, type: 'override', value: String(Number(move[k]) || 0), priority: 30});
    }
    // Token art and size are set on her token directly and put back when the effect ends
    // (DAE 14 doesn't carry ATL.texture.src over).
    const before = {width: myToken.document.width, height: myToken.document.height, src: myToken.document.texture.src};
    const onEnd = async () => {
        const eff = document;
        const r = eff.flags.world?.soulRaven;
        if (!r) return;
        const mine = actorUtils.getFirstToken(eff.parent);
        if (mine && r.before) await mine.update({width: r.before.width, height: r.before.height, 'texture.src': r.before.src});
        const scene = game.scenes.get(r.sceneId);
        const t = scene?.tokens.get(r.ravenId);
        if (t) await t.update({hidden: false, ...(mine ? {x: mine.x, y: mine.y} : {})});
    };
    await effectUtils.createEffects(me, [{
        name: 'Soul of the Raven',
        img: raven.document.texture.src,
        origin: workflow.item.uuid,
        description: 'Merged with her raven: Tiny, the raven\'s speeds, and her action can only Dash, Disengage, Dodge, Help, Hide or Search. Still gets the raven-on-shoulder benefits. Action: return to normal.',
        system: {changes},
        flags: {
            world: {soulRaven: {ravenId: raven.id, sceneId: raven.document.parent.id, before}},
            cat: {identifier: 'soulOfTheRaven', embeddedMacros: [
                {name: 'Soul of the Raven end', event: 'effect', pass: 'deleted', macros: [{priority: 50, macro: 'return await (' + onEnd.toString() + ')();'}]}
            ]}
        }
    }]);
    await myToken.document.update({width: 0.5, height: 0.5, 'texture.src': raven.document.texture.src});
    await raven.document.update({hidden: true});
    if (globalThis.Sequencer) {
        const f = ['jb2a.smoke.puff.centered.grey', 'jb2a.misty_step.01.purple'].find(x => Sequencer.Database.entryExists(x));
        if (f) new Sequence().effect().file(f).atLocation(myToken).scaleToObject(2).play();
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>Soul of the Raven:</b> ' + me.name + ' merges with her raven.'});
};
 
// Soul of the Raven "Return to Normal" activity: roll / activityRollFinished / 50.
const ravenSplit = async () => {
    const eff = (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(workflow.actor, 'soulOfTheRaven');
    if (!eff) return ui.notifications.info('Not merged with the raven.');
    await documentUtils.deleteDocument(eff);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        content: '<b>Soul of the Raven:</b> ' + workflow.actor.name + ' and her raven separate.'});
};
 
// Pearl of Power activity: roll / activityRollFinished / 50.
const pearlUse = async () => {
    const me = workflow.actor;
    const spells = me.system.spells ?? {};
    const pact = spells.pact;
    let key = null;
    if (pact?.max && pact.value < pact.max) key = 'pact';
    else {
        for (let l = 5; l >= 1; l--) {
            const s = spells['spell' + l];
            if (s?.max && s.value < s.max) { key = 'spell' + l; break; }
        }
    }
    if (!key) {
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
            content: '<b>Pearl of Power:</b> no spent spell slot to regain (pact ' + (pact?.value ?? '?') + '/' + (pact?.max ?? '?') + '). Use refunded.'});
        if (workflow.item.system.uses?.spent > 0) await documentUtils.update(workflow.item, {'system.uses.spent': workflow.item.system.uses.spent - 1});
        return;
    }
    await documentUtils.update(me, {['system.spells.' + key + '.value']: spells[key].value + 1});
    const label = key === 'pact' ? 'a Pact Magic slot (level ' + (pact.level ?? '?') + ')' : 'a level ' + key.slice(5) + ' slot';
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
        content: '<b>Pearl of Power:</b> ' + me.name + ' regains ' + label + '.'});
};
 
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Agonizing Blast + Eldritch Bident ----------------------------------------------
const eb = actor.items.find(i => i.type === 'spell' && lc(i.name) === 'eldritch blast');
const agon = find(/agonizing blast/i);
if (!agon) report.push('<li><b>Agonizing Blast</b> not found.</li>');
else if (premadeOn(agon) === 'cpr2') {
    await setCat(agon, ['Agonizing Blast (Nix)'], []);
    await dropOld(agon, ['Agonizing Blast (Nix)']);
    report.push('<li>Agonizing Blast uses Chris\'s Premades 2 (ours removed so it isn\'t added twice). Check it is set to Eldritch Blast in the Medkit.</li>');
} else {
    await setCat(agon, ['Agonizing Blast (Nix)'], [entry('Agonizing Blast (Nix)', 'roll', 'actorDamageRollBonuses', 100, agonizing)]);
    await dropOld(agon, ['Agonizing Blast (Nix)']);
    report.push('<li>Agonizing Blast: +Cha to every Eldritch Blast beam.</li>');
    const enchanted = eb?.effects?.some(e => /agonizing/i.test(e.name) || (e.system?.changes ?? []).some(c => c.key === 'system.damage.bonus'));
    if (enchanted) report.push('<li><b>Check:</b> Eldritch Blast also carries the Agonizing enchantment, so +Cha would be added twice. Remove the enchantment from Eldritch Blast.</li>');
}
if (!eb) report.push('<li><b>Eldritch Blast</b> not found.</li>');
else {
    await setCat(eb, ['Eldritch Bident die', 'Eldritch Bident shunt'], [
        entry('Eldritch Bident die', 'roll', 'itemPreItemRoll', 20, bidentDie),
        entry('Eldritch Bident shunt', 'roll', 'itemRollFinished', 60, bidentShunt)]);
    await dropOld(eb, ['Eldritch Bident die', 'Eldritch Bident shunt']);
    const beams = (eb.flags?.cat?.embeddedMacros ?? []).some(m => m.name === 'Nix Eldritch Blast beams');
    report.push('<li>Eldritch Blast: d12 beams while the Eldritch Bident is equipped and attuned; a natural 20 that hits forces a DC 10 Charisma save or the target is shunted until the start of its next turn, then takes 2d12 psychic.'
        + (beams ? '' : ' <b>Run the world Eldritch Blast installer too</b> (beam windows).')
        + (premadeOn(eb) === 'cpr1' ? ' Her Eldritch Blast is still the Chris\'s Premades 1 version; that\'s fine with the beam windows. <b>Don\'t re-apply it in the Medkit</b> unless you re-run this installer and the world one after.' : '') + '</li>');
}
const bidents = findAll(/eldritch bident/i);
if (bidents.length > 1) report.push('<li><b>' + bidents.length + ' Eldritch Bidents</b> in her inventory. Delete the spare (keep the equipped, attuned one).</li>');
 
// ---- 2. Fiendish Vigor ------------------------------------------------------------------
const vigor = find(/fiendish vigor/i);
const vigorLife = actor.items.filter(i => i.type === 'spell' && lc(i.name) === 'false life'
    && (i.flags?.dnd5e?.cachedFor || ['atwill', 'innate'].includes(i.system.method ?? i.system.preparation?.mode) || /vigor/i.test(i.system.sourceItem ?? '')));
for (const fl of vigorLife) {
    for (const act of (fl.system.activities?.contents ?? []).filter(a => a.type === 'heal' && a.healing)) {
        const h = act.healing;
        const formula = h.custom?.enabled ? h.custom.formula : ((h.number && h.denomination) ? h.number + 'd' + h.denomination : '0') + (h.bonus ? ' + ' + h.bonus : '');
        if (/^\s*\d+\s*$/.test(formula)) continue;
        const max = (await new Roll(formula, actor.getRollData()).evaluate({maximize: true})).total;
        await act.update({'healing.custom': {enabled: true, formula: String(max)}});
    }
}
if (vigor) {
    await setCat(vigor, ['Fiendish Vigor max'], [entry('Fiendish Vigor max', 'roll', 'actorDamageRoll', 40, vigorMax)]);
    const NAME = 'Cast False Life (Fiendish Vigor)';
    const cast = await ensureActivity(vigor, NAME, 'utility', {
        img: 'icons/magic/life/heart-cross-strong-purple-orange.webp',
        activation: {type: 'action', value: 1, override: true},
        consumption: {targets: [], scaling: {allowed: false}},
        range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
        description: {chatFlavor: 'Cast False Life without a spell slot: 12 temporary hit points.'}});
    if (cast) await setCat(cast, ['Fiendish Vigor: 12 temp HP'], [entry('Fiendish Vigor: 12 temp HP', 'roll', 'activityRollFinished', 50, vigorCast)]);
    await dropOld(vigor, ['Fiendish Vigor max', 'Fiendish Vigor: 12 temp HP']);
    report.push('<li>Fiendish Vigor: <b>' + NAME + '</b> gives 12 temporary hit points with no dice; False Life cast without a slot rolls its maximum'
        + (vigorLife.length ? ' (' + vigorLife.length + ' at-will copy set to a fixed amount)' : '') + '.</li>');
} else report.push('<li><b>Fiendish Vigor</b> not found.</li>');
for (const fl of vigorLife) await dropOld(fl, ['Fiendish Vigor max']);
 
// ---- 3. Gift of the Protectors ------------------------------------------------------------
const gifts = findAll(/gift of the protectors/i).filter(i => i.type === 'feat' && !/rune keeper/i.test(i.name));
if (!gifts.length) report.push('<li><b>Gift of the Protectors</b> not found.</li>');
else {
    const gift = gifts.find(g => g.system.uses?.max) ?? gifts[0];
    if (!gift.system.uses?.max) await gift.update({'system.uses': {spent: 0, max: '1', recovery: [{period: 'lr', type: 'recoverAll'}]}});
    const write = await ensureActivity(gift, 'Write Names', 'utility', {activation: {type: 'special', value: null, condition: ''}, consumption: {targets: []}});
    await setCat(gift, ['Gift of the Protectors save', 'Gift of the Protectors self'], [
        entry('Gift of the Protectors save', 'roll', 'sceneDamageComplete', 240, giftSave),
        entry('Gift of the Protectors self', 'roll', 'targetDamageComplete', 240, giftSave)]);
    if (write) await setCat(write, ['Gift write names'], [entry('Gift write names', 'roll', 'activityRollFinished', 50, giftWrite)]);
    await dropOld(gift, ['Gift of the Protectors save', 'Gift of the Protectors self', 'Gift write names']);
    const names = (gift.getFlag('world', 'giftNames') ?? []).map(id => game.actors.get(id)?.name ?? id);
    report.push('<li>Gift of the Protectors: 1 HP instead of 0 for names in the book (asks her first). Names kept from v13: ' + (names.join(', ') || '<i>none, use Write Names</i>') + '.</li>');
    const oldFx = actor.effects.filter(e => /gift of the protectors/i.test(e.name) && e.flags?.['chris-premades'] && !e.flags?.cat);
    if (oldFx.length) report.push('<li><i>' + oldFx.length + ' old Gift of the Protectors effect(s) on her from Chris\'s Premades 1 (' + oldFx.map(e => e.name).join(', ')
        + ') do nothing on v14. Delete them.</i></li>');
}
 
// ---- 4. Sentinel Raven + Find Familiar ------------------------------------------------------
const sentinel = find(/sentinel raven/i);
if (!sentinel) report.push('<li><b>Sentinel Raven</b> not found.</li>');
else {
    await setCat(sentinel, ['Sentinel Raven perch'], [entry('Sentinel Raven perch', 'roll', 'actorRollFinished', 60, ravenPerch)]);
    await dropOld(sentinel, ['Sentinel Raven perch']);
    const ff = actor.items.find(i => i.type === 'spell' && lc(i.name) === 'find familiar');
    report.push('<li>Sentinel Raven: after Find Familiar, +Cha to Perception and passive Perception while the raven is summoned.'
        + (!ff ? ' <b>Find Familiar is not on her sheet.</b>' : premadeOn(ff) === 'cpr2' ? '' : ' <b>Apply Chris\'s Premades 2\'s Find Familiar in the Medkit.</b>') + '</li>');
    const stale = actor.effects.filter(e => /find familiar|sentinel raven/i.test(e.name) && e.flags?.['chris-premades'] && !e.flags?.cat);
    if (stale.length) report.push('<li><i>Left over from v13 (Chris\'s Premades 1, inert): ' + stale.map(e => e.name).join(', ')
        + '. Delete them (and the old raven token if it is still on a scene), then summon the raven again.</i></li>');
}
 
// ---- 5. Soul of the Raven ---------------------------------------------------------------
const soul = find(/soul of the raven/i);
if (!soul) report.push('<li><b>Soul of the Raven</b> not found.</li>');
else {
    const merge = await ensureActivity(soul, 'Merge with Raven', 'utility', {activation: {type: 'bonus', value: 1, condition: ''}, consumption: {targets: []}});
    const split = await ensureActivity(soul, 'Return to Normal', 'utility', {activation: {type: 'action', value: 1, condition: ''}, consumption: {targets: []}});
    if (merge) await setCat(merge, ['Soul merge'], [entry('Soul merge', 'roll', 'activityRollFinished', 50, ravenMerge)]);
    if (split) await setCat(split, ['Soul split'], [entry('Soul split', 'roll', 'activityRollFinished', 50, ravenSplit)]);
    await dropOld(soul, ['Soul merge', 'Soul split']);
    report.push('<li>Soul of the Raven: <b>Merge with Raven</b> (bonus action) and <b>Return to Normal</b> (action). Her token takes the raven\'s art at half size, and goes back when she returns.</li>');
}
 
// ---- 6. Raven's Shield + Spell Sniper (migrated by Foundry; rebuilt only if missing) ---------
const ensureEffect = async (item, label, data) => {
    if (!item) { report.push('<li><b>' + label + '</b> not found.</li>'); return; }
    const has = item.effects.find(e => (e.system?.changes ?? []).length && data.system.changes.every(c => (e.system.changes ?? []).some(x => x.key === c.key)));
    if (has) { report.push('<li>' + label + ': effect already in place.</li>'); return; }
    const old = item.effects.filter(e => e.name === data.name);
    if (old.length) await item.deleteEmbeddedDocuments('ActiveEffect', old.map(e => e.id));
    await item.createEmbeddedDocuments('ActiveEffect', [data]);
    report.push('<li>' + label + ': effect rebuilt.</li>');
};
const shield = find(/raven'?s shield/i);
await ensureEffect(shield, 'Raven\'s Shield', {name: 'Raven\'s Shield', img: shield?.img, transfer: true,
    description: 'Advantage on death saving throws, immune to Frightened, resistance to necrotic damage.',
    system: {changes: [
        {key: 'flags.midi-qol.advantage.deathSave', type: 'override', value: '1', priority: 20},
        {key: 'system.traits.ci.value', type: 'add', value: 'frightened', priority: 20},
        {key: 'system.traits.dr.value', type: 'add', value: 'necrotic', priority: 20}]}});
const sniper = find(/spell sniper/i);
await ensureEffect(sniper, 'Spell Sniper', {name: 'Spell Sniper', img: sniper?.img, transfer: true,
    description: 'Spell attacks ignore half and three-quarters cover, no disadvantage from nearby enemies, longer range.',
    system: {changes: [
        {key: 'flags.dnd5e.spellSniper', type: 'override', value: '1', priority: 20},
        {key: 'flags.midi-qol.ignoreNearbyFoes', type: 'override', value: '!!item.school', priority: 20}]}});
const hardcoded = actor.effects.filter(e => /raven'?s? shield/i.test(e.name));
if (hardcoded.length) report.push('<li><i>Hand-made Raven\'s Shield effect on the actor (' + hardcoded.length + '): delete it, the feature carries its own.</i></li>');
 
// ---- 7. Pearl of Power ------------------------------------------------------------------------
const pearl = find(/pearl of power/i);
if (!pearl) report.push('<li><b>Pearl of Power</b> not found.</li>');
else {
    const acts = pearl.system.activities?.contents ?? [];
    if (!acts.length) report.push('<li><b>Pearl of Power has no activity</b>: add a Utility activity and run again.</li>');
    for (const act of acts) await setCat(act, ['Pearl of Power slot'], [entry('Pearl of Power slot', 'roll', 'activityRollFinished', 50, pearlUse)]);
    await dropOld(pearl, ['Pearl of Power slot']);
    const ddb = acts.find(a => a.type === 'ddbmacro');
    report.push('<li>Pearl of Power: regains a Pact Magic slot (or her highest spent slot).'
        + (ddb ? ' <b>Check:</b> its activity is a D&amp;D Beyond Importer macro activity (<code>' + (ddb.macro?.function ?? 'ddbmacro') + '</code>); if one use gives back two slots, change it to a Utility activity and run this again.' : '') + '</li>');
}
 
// ---- 8. What's left ---------------------------------------------------------------------------
{
    const later = [];
    const fl = actor.items.filter(i => i.type === 'spell' && lc(i.name) === 'false life');
    if (fl.some(i => premadeOn(i) === 'cpr1')) later.push('False Life still carries a Chris\'s Premades 1 tag (inert). Nothing needed; Fiendish Vigor works without it.');
    const darkness = actor.items.filter(i => i.type === 'spell' && lc(i.name) === 'darkness');
    if (darkness.length > 1) later.push('Two Darkness spells on her sheet. If one is a duplicate, delete it (the world Darkness installer handles both).');
    const rune = actor.items.find(i => /rune keeper/i.test(i.name) && (i.system.activities?.contents ?? []).some(a => /gift of the protectors/i.test(a.name ?? '')));
    if (rune) later.push('Eyes of the Rune Keeper has an activity named "Gift of the Protectors" (left over); delete that activity.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nethtari fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 