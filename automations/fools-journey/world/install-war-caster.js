// =====================================================================
//  WAR CASTER for Gambit's Opportunity Attacks: WORLD INSTALLER
//  (Script macro, run as GM, nothing selected). Safe to re-run.
//
//  Gambit's Premades only offers spells in its Opportunity Attack prompt when
//  the War Caster feat carries Gambit's own ID. Chris's Premades / SRD copies
//  don't, so the prompt only ever listed weapons. This tags every War Caster
//  feat in the world, and makes sure cantrips count as "prepared" (Gambit
//  skips unprepared spells).
//
//  Gambit's rule for which spells show up: casting time 1 Action, a spell
//  attack or a saving throw, targeting a creature, and prepared (or innate).
// =====================================================================
const GAMBIT_WAR_CASTER = '4cb8e0f5-63fd-49b7-b167-511db23d9dbf';
const done = [];
const handle = async (actor, where) => {
    const feats = actor.items.filter(i => /^war ?caster/i.test(i.name.trim()) && i.type === 'feat');
    if (!feats.length) return;
    for (const f of feats) if (f.flags?.['gambits-premades']?.gpsUuid !== GAMBIT_WAR_CASTER) await f.setFlag('gambits-premades', 'gpsUuid', GAMBIT_WAR_CASTER);
    // Cantrips are always ready; mark them prepared so Gambit doesn't skip them.
    for (const s of actor.items.filter(i => i.type === 'spell' && Number(i.system.level) === 0 && !i.system.prepared)) await s.update({'system.prepared': 1});
    // Which spells will Gambit offer?
    const ok = actor.items.filter(item => {
        const acts = item.system?.activities ?? [];
        return item.type === 'spell' && item.system?.activation?.type === 'action'
            && acts.some(a => ['msak', 'rsak', 'save'].includes(a.actionType))
            && (item.system?.prepared || (item.system?.method !== 'spell' && item.system?.method !== 'ritual'))
            && acts.some(a => ['creature', 'enemy'].includes(a.target?.affects?.type));
    }).map(i => i.name);
    done.push('<li><b>' + actor.name + where + '</b>: ' + (ok.length ? ok.join(', ') : '<i>no spells qualify</i>') + '</li>');
};
for (const a of game.actors) if (a.type === 'character') await handle(a, '');
for (const s of game.scenes) for (const t of s.tokens) if (!t.actorLink && t.actor?.type === 'character') await handle(t.actor, ' (token on ' + s.name + ')');
await ChatMessage.create({whisper: [game.user.id], content: '<b>War Caster linked to Gambit\'s Opportunity Attacks</b>'
    + '<p>Spells each War Caster can now pick in the opportunity attack prompt:</p><ul>' + (done.join('') || '<li>No War Caster feats found.</li>') + '</ul>'
    + '<p>A spell missing from a list doesn\'t meet Gambit\'s rule (1 Action, spell attack or save, targets a creature, prepared).</p>'});
 