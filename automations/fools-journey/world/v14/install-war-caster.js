// =====================================================================
//  WAR CASTER for Gambit's Opportunity Attacks, Foundry v14 copy
//  World installer: run by Nix Fix (or as a Script macro, as GM). Safe to re-run.
//  No Chris's Premades code: Gambit's Premades 3 still offers spells in its
//  Opportunity Attack prompt only when the War Caster feat carries Gambit's ID
//  (same gpsUuid as on v13). This tags every War Caster feat in the world and
//  makes sure cantrips count as prepared (Gambit skips unprepared spells).
//  Gambit's rule: casting time 1 Action, a spell attack or a saving throw,
//  targeting a creature, and prepared (or innate).
// =====================================================================
const GAMBIT_WAR_CASTER = '4cb8e0f5-63fd-49b7-b167-511db23d9dbf';
const done = [], cpr2 = [];
const handle = async (actor, where) => {
    const feats = actor.items.filter(i => /^war ?caster/i.test(i.name.trim()) && i.type === 'feat');
    if (!feats.length) return;
    for (const f of feats) {
        if (f.flags?.['gambits-premades']?.gpsUuid !== GAMBIT_WAR_CASTER) await f.setFlag('gambits-premades', 'gpsUuid', GAMBIT_WAR_CASTER);
        if (f.flags?.cat?.automation?.source === 'chris-premades') cpr2.push(actor.name);
    }
    for (const s of actor.items.filter(i => i.type === 'spell' && Number(i.system.level) === 0 && !i.system.prepared)) await s.update({'system.prepared': 1});
    const acts = item => item.system?.activities?.contents ?? [];
    const fits = a => a.activation?.type === 'action' && (!a.target?.affects?.type || ['creature', 'enemy'].includes(a.target.affects.type))
        && (a.type === 'save' || (a.type === 'attack' && (a.attack?.type?.classification === 'spell' || ['msak', 'rsak'].includes(a.actionType))));
    const ok = actor.items.filter(item => item.type === 'spell' && acts(item).some(fits)
        && (item.system?.prepared || (item.system?.method !== 'spell' && item.system?.method !== 'ritual'))).map(i => i.name);
    // Chris's Premades 2 Eldritch Blast: the 1-Action activity is a Utility "Cast", the attack is a hidden "Beam".
    const eb = actor.items.find(i => i.type === 'spell' && /^eldritch blast$/i.test(i.name.trim()));
    const ebNote = eb && !ok.includes(eb.name) ? ' <i>(Eldritch Blast is not listed: its 1-Action activity is a Utility "Cast" and the attack is a separate Beam, so Gambit may not offer it)</i>' : '';
    done.push('<li><b>' + actor.name + where + '</b>: ' + (ok.length ? ok.join(', ') : '<i>no spells qualify</i>') + ebNote + '</li>');
};
for (const a of game.actors) if (a.type === 'character') await handle(a, '');
for (const s of game.scenes) for (const t of s.tokens) if (!t.actorLink && t.actor?.type === 'character') await handle(t.actor, ' (token on ' + s.name + ')');
await ChatMessage.create({whisper: [game.user.id], content: '<b>War Caster linked to Gambit\'s Opportunity Attacks (v14)</b>'
    + '<p>Spells each War Caster should be able to pick in the opportunity attack prompt (our best reading of Gambit\'s rule):</p><ul>' + (done.join('') || '<li>No War Caster feats found.</li>') + '</ul>'
    + '<p>A spell missing from a list doesn\'t meet Gambit\'s rule (1 Action, spell attack or save, targets a creature, prepared).</p>'
    + (cpr2.length ? '<p><b>Chris\'s Premades 2 automation on War Caster:</b> ' + cpr2.join(', ') + '. If it offers its own opportunity-attack spell prompt, keep only one of the two.</p>' : '')});
 