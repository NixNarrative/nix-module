// =====================================================================
//  RING OF CHANGING SHAPES: SPELL SURGE (Chris's Premades 2 / CAT Embedded Macro, Foundry v14)
//  On: the ring's "Spell Surge" ACTIVITY (activity.flags.cat.embeddedMacros; the Nix Module writes it)
//  Event: roll   |   Pass: activityRollFinished   |   Priority: 50
//
//  Activity setup (unchanged from v13): Utility, Bonus Action, Uses 1 / Dawn,
//  Consumption: Activity Uses 1 AND Item Uses -> Sorcery Points, 5.
//
//  1. He clicks Spell Surge (bonus action): 5 Sorcery Points + the daily use.
//  2. He picks a castable 1-action spell of 5th level or lower; it's cast now.
//  3. When that spell finishes he's Paralyzed and Incapacitated until the end
//     of his NEXT turn.
//  Cancelling the list refunds the Sorcery Points and the use.
//
//  v14 changes: CAT scope; effectUtils.createEffects + flags.cat; Foundry 14
//  durations {value, units}; combat check via game.combat.
// =====================================================================
return await (async () => {
    const MAX_LEVEL = 5;
    const PRIMED_IDENTIFIER = 'spellSurgePrimed';
    const LETHARGY_IDENTIFIER = 'spellSurgeLethargy';
 
    const me = workflow.actor;
    const ring = workflow.item;
    const surge = workflow.activity;
    const title = surge?.name ?? 'Spell Surge';
    const getEffect = (a, id) => (actorUtils.getEffectByIdentifier ?? documentUtils.getEffectByIdentifier)(a, id);
 
    const refund = async (why) => {
        for (const t of surge?.consumption?.targets ?? []) {
            if (t.type !== 'itemUses') continue;
            const target = t.target ? me.items.get(t.target) : ring;
            const cost = Number(t.value ?? 0);
            if (target && cost && (target.system.uses?.spent ?? 0) >= cost) {
                await documentUtils.update(target, {'system.uses.spent': target.system.uses.spent - cost});
            }
        }
        if (surge?.uses?.max && (surge.uses.spent ?? 0) > 0) await surge.update({'uses.spent': surge.uses.spent - 1});
        ui.notifications.info(title + ': ' + why + ' Sorcery Points and use refunded.');
    };
 
    const castableSpells = () => {
        const slots = Object.entries(me.system.spells ?? {})
            .filter(([key, slot]) => (slot?.value ?? 0) > 0)
            .map(([key, slot]) => key === 'pact' ? Number(slot.level ?? 0) : Number(key.replace('spell', '')))
            .filter(n => n > 0);
        const maxSlot = Math.max(0, ...slots);
        const seen = new Set();
        return me.items.filter(s => {
            if (s.type !== 'spell') return false;
            const lvl = s.system.level ?? 0;
            const method = s.system.method ?? s.system.preparation?.mode;
            const ok = lvl === 0 || ['atwill', 'innate'].includes(method)
                || (s.system.uses?.max && (s.system.uses.value ?? 0) > 0 && method !== 'spell')
                || maxSlot >= lvl;
            if (!ok) return false;
            const key = s.name + '|' + lvl;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
    const actionActivity = s => (s.system.activities?.contents ?? []).find(a => a.activation?.type === 'action');
    const spells = castableSpells()
        .filter(s => (s.system.level ?? 0) <= MAX_LEVEL && actionActivity(s))
        .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
    if (!spells.length) return refund('no castable 1-action spells of 5th level or lower.');
 
    const spell = await dialogUtils.selectDocumentDialog(title,
        'Surge which spell? (1-action spells of 5th level or lower. Afterwards you are Paralyzed and Incapacitated until the end of your next turn.)',
        spells, {showSpellLevel: true, addNoneDocument: true});
    if (!spell) return refund('no spell chosen.');
 
    // ---- Carried by the primed effect: when the surged spell finishes ----------
    // CAT scope: document = the primed effect, workflow = the spell's workflow.
    const onSpellDone = async () => {
        const primed = document;
        const p = primed.flags.world?.spellSurge;
        if (!p || workflow.item?.uuid !== p.spellUuid) return;
        await documentUtils.deleteDocument(primed);
 
        // Ends at the end of his NEXT turn: the first turn end (this turn) is skipped.
        const onTurnEnd = async () => {
            const effect = document;
            const l = effect.flags.world?.lethargy;
            if (!l) return;
            if (!l.skippedCurrent) {
                await documentUtils.update(effect, {'flags.world.lethargy.skippedCurrent': true});
                return;
            }
            await documentUtils.deleteDocument(effect);
        };
        const inCombat = !!game.combat?.started;
        await effectUtils.createEffects(workflow.actor, [{
            name: 'Spell Surge: Lethargy',
            img: primed.img,
            origin: p.ringUuid,
            statuses: ['paralyzed', 'incapacitated'],
            duration: inCombat ? {value: 2, units: 'rounds'} : {value: 12, units: 'seconds'},
            description: 'Paralyzed and incapacitated until the end of your next turn.',
            flags: {
                world: {lethargy: {skippedCurrent: false}},
                cat: {identifier: p.lethargyIdentifier, embeddedMacros: [
                    {name: 'Lethargy end', event: 'combat', pass: 'actorTurnEnd',
                        macros: [{priority: 50, macro: 'return await (' + onTurnEnd.toString() + ')();'}]}
                ]}
            }
        }]);
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
            content: '<b>Spell Surge:</b> a wave of lethargy sweeps over ' + workflow.actor.name
                + '. Paralyzed and incapacitated until the end of their next turn.'
        });
    };
 
    const oldPrimed = getEffect(me, PRIMED_IDENTIFIER);
    if (oldPrimed) await documentUtils.deleteDocument(oldPrimed);
    await effectUtils.createEffects(me, [{
        name: title + ' (primed): ' + spell.name,
        img: ring.img,
        origin: ring.uuid,
        duration: {value: 1, units: 'rounds'},
        flags: {
            world: {spellSurge: {spellUuid: spell.uuid, ringUuid: ring.uuid, lethargyIdentifier: LETHARGY_IDENTIFIER}},
            cat: {identifier: PRIMED_IDENTIFIER, embeddedMacros: [
                {name: 'Spell Surge done', event: 'roll', pass: 'actorRollFinished',
                    macros: [{priority: 90, macro: 'return await (' + onSpellDone.toString() + ')();'}]}
            ]}
        }
    }]);
 
    const castWith = actionActivity(spell);
    setTimeout(() => castWith?.use(), 250);
})();
 