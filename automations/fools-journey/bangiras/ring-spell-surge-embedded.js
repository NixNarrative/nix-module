// =====================================================================
//  RING OF CHANGING SHAPES: SPELL SURGE (Chris's Premades Embedded Macro)
//  Put on: the ring's "Spell Surge" ACTIVITY > CPR Medkit > Embedded Macros
//  Type: Midi Item   |   Pass: rollFinished   |   Priority: 50
//
//  Activity setup (the ring's Activities tab, Spell Surge):
//   - Type: Utility.   Activation: Bonus Action.
//   - Uses: Max 1, Recovery: Dawn.
//   - Consumption: Activity Uses 1  AND  Item Uses -> Sorcery Points, 5.
//
//  1. He clicks Spell Surge (bonus action). The activity spends 5 Sorcery
//     Points and its once-per-dawn use.
//  2. A list shows his castable spells of 5th level or lower that take
//     1 action. He picks one and it's cast straight away (normal spell slot).
//  3. When that spell finishes, he's Paralyzed and Incapacitated until the
//     end of his NEXT turn.
//  Cancelling the list refunds the 5 Sorcery Points and the use.
// =====================================================================
 
const MAX_LEVEL = 5;
const PRIMED_IDENTIFIER = 'spellSurgePrimed';
const LETHARGY_IDENTIFIER = 'spellSurgeLethargy';
 
const actor = workflow.actor;
const surge = workflow.activity;
const title = surge?.name ?? 'Spell Surge';
 
// ---- Refund helper ------------------------------------------------------
const refund = async (why) => {
    for (const t of surge?.consumption?.targets ?? []) {
        if (t.type !== 'itemUses') continue;
        const target = t.target ? actor.items.get(t.target) : workflow.item;
        const cost = Number(t.value ?? 0);
        if (target && cost && (target.system.uses?.spent ?? 0) >= cost) {
            await genericUtils.update(target, {'system.uses.spent': target.system.uses.spent - cost});
        }
    }
    if (surge?.uses?.max && (surge.uses.spent ?? 0) > 0) await surge.update({'uses.spent': surge.uses.spent - 1});
    ui.notifications.info(title + ': ' + why + ' Sorcery Points and use refunded.');
};
 
// ---- Spells he can cast right now ----------------------------------------
const castableSpells = () => {
    const slots = Object.entries(actor.system.spells ?? {})
        .filter(([key, slot]) => (slot?.value ?? 0) > 0)
        .map(([key, slot]) => key === 'pact' ? Number(slot.level ?? 0) : Number(key.replace('spell', '')))
        .filter(n => n > 0);
    const maxSlot = Math.max(0, ...slots);
    const seen = new Set();
    return actor.items.filter(s => {
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
 
// ---- After the surged spell finishes: lethargy -----------------------------
// Runs in CPR's Midi scope. trigger.entity = the primed effect.
const onSpellDone = async () => {
    const primed = trigger.entity;
    const p = primed.flags.world?.spellSurge;
    if (!p || workflow.item?.uuid !== p.spellUuid) return;
    await genericUtils.remove(primed);
 
    // Ends at the end of his NEXT turn: the first turn end (this turn) is skipped.
    const onTurnEnd = async () => {
        const effect = trigger.entity;
        const l = effect.flags.world?.lethargy;
        if (!l) return;
        if (!l.skippedCurrent) {
            await genericUtils.update(effect, {'flags.world.lethargy.skippedCurrent': true});
            return;
        }
        await genericUtils.remove(effect);
    };
    const inCombat = combatUtils.inCombat();
    await effectUtils.createEffect(workflow.actor, {
        name: 'Spell Surge: Lethargy',
        img: primed.img,
        origin: p.ringUuid,
        statuses: ['paralyzed', 'incapacitated'],
        duration: inCombat ? {rounds: 2} : {seconds: 12},
        description: 'Paralyzed and incapacitated until the end of your next turn.',
        flags: {
            world: {lethargy: {skippedCurrent: false}},
            'chris-premades': {embeddedMacros: [
                {name: 'Lethargy end', type: 'combat', pass: 'turnEnd', priority: 50,
                    macro: 'await (' + onTurnEnd.toString() + ')();'}
            ]}
        }
    }, {identifier: p.lethargyIdentifier});
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        content: '<b>Spell Surge:</b> a wave of lethargy sweeps over ' + workflow.actor.name
            + '. Paralyzed and incapacitated until the end of their next turn.'
    });
};
 
const oldPrimed = effectUtils.getEffectByIdentifier(actor, PRIMED_IDENTIFIER);
if (oldPrimed) await genericUtils.remove(oldPrimed);
await effectUtils.createEffect(actor, {
    name: title + ': ' + spell.name,
    img: workflow.item.img,
    origin: workflow.item.uuid,
    duration: {rounds: 1},
    flags: {
        world: {spellSurge: {spellUuid: spell.uuid, ringUuid: workflow.item.uuid, lethargyIdentifier: LETHARGY_IDENTIFIER}},
        'chris-premades': {embeddedMacros: [
            {name: 'Spell Surge done', type: 'midi-actor', pass: 'rollFinished', priority: 90,
                macro: 'await (' + onSpellDone.toString() + ')();'}
        ]}
    }
}, {identifier: PRIMED_IDENTIFIER});
 
const castWith = actionActivity(spell);
setTimeout(() => castWith?.use(), 250);
 