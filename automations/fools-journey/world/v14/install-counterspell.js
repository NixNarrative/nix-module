// =====================================================================
//  INSTALL COUNTERSPELL REACTION, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro, as GM, nothing selected). Safe to re-run.
//
//  Writes the Spell Duel Counterspell onto every "Counterspell" spell in the
//  world (sidebar actors and unlinked tokens on every scene) as a CAT embedded
//  macro: roll / scenePreambleComplete / 10. CAT only fires one document NAME
//  per event (the Counterspell with the highest level), and this one macro then
//  checks every creature on the scene, so that is what we want.
//  Removes the inert v13 copies (flags.chris-premades) and any older copies.
//
//  Changes from v13 (V14-MAPPING section 6):
//   - Cancelling the spell: the macro returns true. When the caster's slot is
//     LOST it sets keepConsumption; on a tie / nat-20 upset CAT refunds the slot.
//   - Rolls happen on the client running the cast (CAT has no remoteRoll).
//   - After a counter it calls Hooks.callAll('nixCounterspelled', workflow),
//     which Bangiras's Ring: Shift Spell listens for.
//   - Turn OFF Counterspell in Gambit's Premades, and set Chris's Premades 2's
//     own Counterspell automation to None on these spells, so only one runs.
// =====================================================================
const ENTRY_NAME = 'Nix Counterspell Reaction';
const MARKER = 'SPELL DUEL v14';
 
const counterspell = async () => {
    // SPELL DUEL v14. See install-counterspell.js (v14) for the rules.
    const SPELL_NAME = 'counterspell';
    const RANGE_FT = 60;
    const REQUIRE_SIGHT = true;
    const NPCS_CAN_COUNTER = true;        // false = only player characters get the reaction
    const ALLOW_COUNTER_CHAINS = true;    // false = no counterspelling a Counterspell
    const MAX_CHAIN_DEPTH = 6;
    const DEBUG_TO_GM = true;             // whisper the GM why creatures weren't offered it
 
    if (workflow.item?.type !== 'spell') return;
    if (workflow.nixCounterspellChecked) return;          // one check per cast
    if (workflow.nixSubtle) return;                       // Subtle Spell: nobody can tell a spell is being cast
    // Only the casting itself, not a spell's follow-up actions.
    if (workflowUtils.isSustainedRoll?.(workflow)) return;
    {
        const acts = workflow.item.system.activities?.contents ?? [];
        if (acts.length > 1 && workflow.activity && workflow.activity.id !== acts[0].id
            && workflow.activity.consumption?.spellSlot === false) return;
    }
    workflow.nixCounterspellChecked = true;
    const caster = workflow.token;                         // Token placeable
    if (!caster) return;
    const casterActor = workflow.actor;
    const spellName = workflow.item.name;
    const castLevel = Number(workflow.castData?.castLevel ?? workflow.item.system.level ?? 0);
    const inCombat = !!game.combat?.started;
    const notes = [];
    const reactedThisChain = new Set();
 
    const slotsAtOrAbove3 = (a) => Object.entries(a.system.spells ?? {})
        .filter(([key, slot]) => (slot?.value ?? 0) > 0)
        .map(([key, slot]) => ({key, value: slot.value,
            level: key === 'pact' ? Number(slot.level ?? 0) : Number(key.replace('spell', ''))}))
        .filter(x => x.level >= 3)
        .sort((x, y) => x.level - y.level);
    const spellMod = (a) => {
        const ab = a.system.attributes?.spellcasting;
        if (ab && a.system.abilities?.[ab]) return a.system.abilities[ab].mod;
        const dc = Number(a.system.attributes?.spell?.dc ?? 0);
        const prof = Number(a.system.attributes?.prof ?? 0);
        return dc ? dc - 8 - prof : 0;
    };
    const counterspellItem = a => a.items.find(i => i.type === 'spell' && i.name.toLowerCase().trim() === SPELL_NAME);
    const innateUses = item => {
        const method = item.system.method ?? item.system.preparation?.mode;
        return ['innate', 'atwill'].includes(method) && (method === 'atwill' || (item.system.uses?.value ?? 0) > 0);
    };
    const say = (a, content) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: a}), content});
    const rollFor = async (formula) => await new Roll(formula).evaluate();
    const giveSlotBack = async (a, key, item) => {
        if (key === 'innate') {
            if (item?.system.uses?.max) await documentUtils.update(item, {'system.uses.spent': Math.max(0, (item.system.uses.spent ?? 0) - 1)});
            return;
        }
        const cur = a.system.spells?.[key];
        if (cur) await documentUtils.update(a, {['system.spells.' + key + '.value']: Math.min(cur.value + 1, cur.max ?? Infinity)});
    };
    const dist = (a, b) => tokenUtils.getDistance(a.document ?? a, b.document ?? b, {wallsBlock: true});
 
    const eligibleAgainst = (targetToken, label) => {
        const list = [];
        const all = canvas.tokens.placeables
            .filter(t => t.actor && t.document.uuid !== targetToken.document.uuid && counterspellItem(t.actor))
            .map(t => ({t, d: dist(t, targetToken)}))
            .sort((a, b) => (a.d < 0 ? 9999 : a.d) - (b.d < 0 ? 9999 : b.d));
        for (const {t: r, d} of all) {
            const n = r.document.name + ' (vs ' + label + ')';
            const ra = r.actor;
            if (reactedThisChain.has(ra.uuid)) continue;
            if (!NPCS_CAN_COUNTER && ra.type !== 'character') { notes.push(n + ': NPC counters are off'); continue; }
            if (r.document.disposition === targetToken.document.disposition) { notes.push(n + ': same side (token disposition)'); continue; }
            if (d < 0 || d > RANGE_FT) { notes.push(n + ': ' + (d < 0 ? 'no path / walls block' : Math.round(d) + ' ft away')); continue; }
            if (REQUIRE_SIGHT && !MidiQOL.canSee(r, targetToken)) { notes.push(n + ': can\'t see the caster'); continue; }
            if (MidiQOL.checkIncapacitated(r)) { notes.push(n + ': incapacitated'); continue; }
            if (inCombat && actorUtils.hasUsedReaction(ra)) { notes.push(n + ': reaction already used'); continue; }
            if (!slotsAtOrAbove3(ra).length && !innateUses(counterspellItem(ra))) { notes.push(n + ': no 3rd-level or higher slot left'); continue; }
            list.push(r);
        }
        return list;
    };
 
    const askAndPay = async (r, targetActor) => {
        const ra = r.actor;
        const cs = counterspellItem(ra);
        const userId = queryUtils.firstOwner(ra, true) ?? game.user.id;
        const choices = slotsAtOrAbove3(ra).map(sl => [
            (sl.key === 'pact' ? 'Pact slot' : 'Level ' + sl.level + ' slot') + ' (+' + sl.level + ', ' + sl.value + ' left)', sl.key]);
        if (!choices.length && innateUses(cs)) choices.push([cs.name + ' (innate, +3)', 'innate']);
        choices.push(['Don\'t counter', false]);
        const picked = await dialogUtils.buttonDialog(cs.name,
            targetActor.name + ' is casting a spell! Spend your reaction to counter it? '
            + 'd20 + spellcasting modifier + spell level', choices, {userId});
        if (!picked) { notes.push(r.document.name + ': declined'); return null; }
        let level = 3;
        if (picked === 'innate') {
            if (cs.system.uses?.max) await documentUtils.update(cs, {'system.uses.spent': (cs.system.uses.spent ?? 0) + 1});
        } else {
            const sl = slotsAtOrAbove3(ra).find(x => x.key === picked);
            level = sl.level;
            await documentUtils.update(ra, {['system.spells.' + sl.key + '.value']: sl.value - 1});
        }
        reactedThisChain.add(ra.uuid);
        if (inCombat) await actorUtils.setReactionUsed(ra);
        return {key: picked, level, item: cs};
    };
 
    const duel = async (r, pay, targetActor, targetLevel, targetName) => {
        const ra = r.actor;
        const name = r.document.name;
        const csMod = spellMod(ra), tMod = spellMod(targetActor);
        await say(ra, '<b>Spell Duel!</b> ' + name + ' clashes with ' + targetActor.name + '\'s ' + targetName + '.');
        const csRoll = await rollFor('1d20 + ' + csMod + ' + ' + pay.level);
        await csRoll.toMessage({speaker: ChatMessage.getSpeaker({actor: ra}),
            flavor: pay.item.name + ' (Spell Duel): d20 + spellcasting ' + csMod + ' + slot level ' + pay.level});
        const nat20 = csRoll.dice?.[0]?.results?.some(x => x.active !== false && x.result === 20) ?? csRoll.dice?.[0]?.total === 20;
        if (nat20) {
            await giveSlotBack(ra, pay.key, pay.item);
            await say(ra, '<b>Spell Duel:</b> natural 20! ' + name + ' absorbed ' + targetActor.name
                + '\'s spell energy and their spell slot is not spent.');
        }
        const tRoll = await rollFor('1d20 + ' + tMod + ' + ' + targetLevel);
        await tRoll.toMessage({speaker: ChatMessage.getSpeaker({actor: targetActor}),
            flavor: targetName + ' (Spell Duel): d20 + spellcasting ' + tMod + ' + spell level ' + targetLevel});
        const tie = csRoll.total === tRoll.total;
        const nat20Upset = nat20 && csRoll.total < tRoll.total;
        const countered = csRoll.total >= tRoll.total || nat20;
        const score = '(' + csRoll.total + ' vs ' + tRoll.total + ')';
        if (!countered) {
            await say(targetActor, '<b>Spell Duel:</b> ' + targetActor.name + ' wins ' + score + '. ' + targetName + ' goes off!');
            return {countered: false};
        }
        await say(ra, '<b>Spell Duel:</b> ' + (nat20Upset
            ? targetActor.name + '\'s power was greater ' + score + ', but the natural 20 still tears <b>' + targetName
                + '</b> apart. Neither spell slot is spent.'
            : tie
                ? 'a dead heat ' + score + '! ' + targetActor.name + '\'s <b>' + targetName + '</b> unravels, but the spell slot is not spent.'
                : name + ' wins ' + score + '. ' + targetActor.name + '\'s <b>' + targetName + '</b> is countered and the slot is lost!'));
        return {countered: true, refundTarget: tie || nat20Upset};
    };
 
    // Returns {countered, refund} for the spell targetToken is casting.
    // refundTarget(): give the slot back (used for a countered Counterspell in a chain).
    const counterPhase = async (targetToken, targetLevel, targetName, refundTarget, depth) => {
        const targetActor = targetToken.actor;
        for (const r of eligibleAgainst(targetToken, targetName)) {
            if (!eligibleAgainst(targetToken, targetName).includes(r)) continue;   // reaction spent deeper in the chain
            const pay = await askAndPay(r, targetActor);
            if (!pay) continue;
            if (ALLOW_COUNTER_CHAINS && depth < MAX_CHAIN_DEPTH) {
                await say(r.actor, '<b>' + pay.item.name + ':</b> ' + r.document.name + ' moves to counter ' + targetActor.name + '!');
                const refundR = async () => giveSlotBack(r.actor, pay.key, pay.item);
                const inner = await counterPhase(r, pay.level, pay.item.name, refundR, depth + 1);
                if (inner.countered) {
                    if (inner.refund) await refundR();
                    await say(targetActor, '<b>Spell Duel:</b> ' + r.document.name + '\'s ' + pay.item.name
                        + ' never happens. ' + targetActor.name + '\'s ' + targetName + ' continues!');
                    continue;
                }
            }
            const res = await duel(r, pay, targetActor, targetLevel, targetName);
            if (!res.countered) continue;
            return {countered: true, refund: !!res.refundTarget};
        }
        return {countered: false};
    };
 
    const outcome = await counterPhase(caster, castLevel, spellName, null, 0);
 
    if (DEBUG_TO_GM && notes.length) {
        await ChatMessage.create({
            whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id),
            content: '<b>Counterspell check: ' + spellName + '</b><ul><li>' + notes.join('</li><li>') + '</li></ul>'
        });
    }
    if (!outcome.countered) return;
 
    workflow.nixCounterspelled = true;
    // Slot lost: keep the consumption. Tie / nat-20 upset: let CAT refund it.
    if (!outcome.refund) workflowUtils.setWorkflowProperty(workflow, 'keepConsumption', true);
    const conc = effectUtils.getConcentrationEffect?.(casterActor, workflow.item);
    if (conc) await documentUtils.deleteDocument(conc);
    try { Hooks.callAll('nixCounterspelled', workflow); } catch (err) { console.warn('Counterspell | nixCounterspelled hook', err); }
    return true;                                         // cancels the spell
};
 
const MACRO = '// =====================================================================\n'
    + '//  COUNTERSPELL "' + MARKER + '" REACTION (Nix Fix, Foundry v14 / CAT)\n'
    + '//  On every Counterspell: roll / scenePreambleComplete / 10. Written by\n'
    + '//  install-counterspell.js (v14); edit that file, not this copy.\n'
    + '// =====================================================================\n'
    + 'return await (' + counterspell.toString() + ')();\n';
 
const isOurs = m => m.name === ENTRY_NAME || [m.macro, ...(m.macros ?? []).map(x => x.macro)].some(c => typeof c === 'string'
    && (c.includes('Counterspell check') || c.includes('COUNTERSPELL (2024) REACTION') || c.includes('SPELL DUEL')));
const premade = i => {
    const cat = i.flags?.cat ?? {};
    return cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades');
};
 
const actors = new Map();
game.actors.forEach(a => actors.set(a.uuid, {actor: a, where: 'sidebar'}));
for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink && t.actor) actors.set(t.actor.uuid, {actor: t.actor, where: 'token in ' + scene.name});
 
const installed = [], removedOld = [], cprOn = [];
for (const {actor, where} of actors.values()) {
    for (const item of actor.items.filter(i => i.type === 'spell' && i.name.toLowerCase().trim() === 'counterspell')) {
        const cat = foundry.utils.deepClone(item.flags?.cat?.embeddedMacros ?? []);
        cat.filter(isOurs).filter(m => m.name !== ENTRY_NAME).forEach(m => removedOld.push(actor.name + ' (' + where + '): "' + m.name + '"'));
        const list = cat.filter(m => !isOurs(m));
        list.push({name: ENTRY_NAME, event: 'roll', pass: 'scenePreambleComplete', macros: [{priority: 10, macro: MACRO}]});
        const updates = {'flags.cat.embeddedMacros': list};
        const old = item.flags?.['chris-premades']?.embeddedMacros ?? [];
        if (old.some(isOurs)) updates['flags.chris-premades.embeddedMacros'] = old.filter(m => !isOurs(m));
        await item.update(updates);
        installed.push(actor.name + ' (' + where + ')');
        if (premade(item)) cprOn.push(actor.name);
    }
}
await ChatMessage.create({whisper: [game.user.id],
    content: '<b>Counterspell reaction (v14) installed on ' + installed.length + ':</b><br>' + (installed.join('<br>') || '<i>none found</i>')
        + (removedOld.length ? '<br><br><b>Removed old copies:</b><br>' + removedOld.join('<br>') : '')
        + (cprOn.length ? '<br><br><b>Also has a Chris\'s Premades 2 Counterspell automation (set it to None in the Medkit so only one prompt shows):</b> ' + cprOn.join(', ') : '')
        + '<br><br>Turn OFF Counterspell in Gambit\'s Premades.'});
 