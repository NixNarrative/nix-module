// =====================================================================
//  HOLD PERSON / HOLD MONSTER: end-of-turn save fix (Script macro, run as GM)
//  Select one or more caster tokens (Bangiras, Vina...), then run.
//  Safe to re-run.
//
//  Adds a Midi Overtime save to the Paralyzed effect of each Hold spell:
//  at the END of each of the target's turns it makes a Wisdom save; on a
//  success the spell ends on that target. The DC is set from each cast
//  (so Innate Sorcery's +1 and other bonuses active when casting count).
// =====================================================================
 
const NAMES = ['hold monster', 'hold person'];
const LIVE_DC = "// =====================================================================\n//  HOLD PERSON / HOLD MONSTER: live save DC (Chris's Premades Embedded Macro)\n//  On the Hold spell.  Type: Midi Item | Pass: rollFinished | Priority: 60\n//  (fix-hold-spells.js and the Bangiras installer write this for you)\n//\n//  After each cast, the end-of-turn save on every held target is set to the\n//  DC this cast actually used, so bonuses active at casting time (Innate\n//  Sorcery's +1, items, etc.) carry into the repeat saves.\n// =====================================================================\n\nconst dc = Number(workflow.saveDC) || Number(workflow.activity?.save?.dc?.value)\n    || Number(workflow.actor.system.attributes?.spell?.dc);\nif (!dc) return;\nconst spellUuid = workflow.item.uuid;\nawait genericUtils.sleep(500);                       // let Midi finish applying the effects\nfor (const token of workflow.targets ?? []) {\n    const target = token.actor;\n    if (!target) continue;\n    for (const effect of target.effects.filter(e => e.origin === spellUuid || e.origin?.startsWith(spellUuid + '.'))) {\n        const changes = foundry.utils.deepClone(effect.changes ?? []);\n        let touched = false;\n        for (const c of changes) {\n            if (c.key !== 'flags.midi-qol.OverTime') continue;\n            c.value = String(c.value).replace(/saveDC\\s*=\\s*[^,]*/, 'saveDC=' + dc);\n            touched = true;\n        }\n        if (touched) await genericUtils.update(effect, {changes});\n    }\n}\n";
const actors = canvas.tokens.controlled.map(t => t.actor).filter(a => a);
if (!actors.length && game.user.character) actors.push(game.user.character);
if (!actors.length) return ui.notifications.warn('Hold spells fix: select the caster\'s token first.');
 
const lines = [];
for (const actor of actors) {
    const spells = actor.items.filter(i => i.type === 'spell' && NAMES.includes(i.name.toLowerCase().trim()));
    if (!spells.length) { lines.push('<li>' + actor.name + ': no Hold Person or Hold Monster.</li>'); continue; }
    for (const spell of spells) {
        const act = (spell.system.activities?.contents ?? []).find(a => a.type === 'save') ?? spell.system.activities?.contents?.[0];
        const dc = Number(act?.save?.dc?.value) || Number(actor.system.attributes?.spell?.dc) || 13;
        const effects = spell.effects.filter(e => e.statuses?.has?.('paralyzed')
            || (e.changes ?? []).some(c => /paralyzed/i.test(String(c.value))) || /paralyz|hold/i.test(e.name));
        if (!effects.length) { lines.push('<li>' + actor.name + ' / ' + spell.name + ': <b>no Paralyzed effect on the spell</b>, nothing to patch.</li>'); continue; }
        for (const effect of effects) {
            const value = 'turn=end, saveAbility=wis, saveDC=' + dc + ', label=' + spell.name + ' (end of turn save)';
            const changes = (effect.changes ?? []).filter(c => c.key !== 'flags.midi-qol.OverTime');
            changes.push({key: 'flags.midi-qol.OverTime', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value, priority: 20});
            await effect.update({changes});
        }
        const macros = (spell.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => m.name !== 'Hold spell live DC');
        macros.push({name: 'Hold spell live DC', type: 'midi-item', pass: 'rollFinished', priority: 60, macro: LIVE_DC});
        await spell.setFlag('chris-premades', 'embeddedMacros', macros);
        lines.push('<li>' + actor.name + ' / ' + spell.name + ': end-of-turn Wisdom save, DC taken from each cast.</li>');
    }
}
await ChatMessage.create({whisper: [game.user.id], content: '<b>Hold spells fix</b><ul>' + lines.join('') + '</ul>'
    + '<i>Creatures already held keep the old effect; recast to test.</i>'});
 