// =====================================================================
//  LIFE BOND (Find Steed): WORLD INSTALLER (Script macro, run as GM)
//  "When you regain Hit Points from a level 1+ spell, the steed regains the
//   same number of Hit Points if you're within 5 feet of it."
//
//  Run once with nothing selected: every character with Find Steed gets the
//  automation. Safe to re-run.
//
//  How the steed is found (first match wins), on the caster's current scene:
//   1. a steed linked by this installer (see below)
//   2. a steed summoned by Chris's Premades' or dnd5e's Find Steed from that caster
//   3. any creature with a "Life Bond" feature owned by the same player as the caster
//
//  Optional manual link: select the STEED's token and TARGET the caster's
//  token, then run this. The steed then always counts as that caster's.
// =====================================================================
 
const LIFE_BOND = async () => {
    // Find Steed spell | Midi Actor | targetApplyDamage | 300
    const me = trigger.entity.actor;
    if (!ditem || ditem.actorUuid !== me.uuid) return;
    const gained = (ditem.newHP ?? 0) - (ditem.oldHP ?? 0);
    if (!(gained > 0)) return;
    const item = workflow.item;
    if (item?.type !== 'spell') return;
    const level = Number(workflow.castData?.castLevel ?? workflow.spellLevel ?? item.system.level ?? 0);
    if (level < 1) return;
    // Several Find Steed copies (free cast + slot) all carry this macro: run once per heal.
    workflow.nixLifeBond ??= new Set();
    if (workflow.nixLifeBond.has(me.uuid)) return;
    workflow.nixLifeBond.add(me.uuid);
 
    const mine = actorUtils.getFirstToken(me);
    if (!mine) return;
    const hasBond = a => a?.items?.some(i => /^life bond/i.test(i.name.trim()));
    const tokens = mine.document.parent.tokens.contents.filter(t => t.actor && t.id !== mine.document.id && hasBond(t.actor));
    const ownerIds = a => Object.entries(a?.ownership ?? {}).filter(([id, lvl]) => lvl === 3 && !game.users.get(id)?.isGM).map(([id]) => id);
    const casterEffectIds = me.effects.flatMap(e => Object.values(e.flags?.['chris-premades']?.summons?.ids ?? {}).flat());
    const linked = t => t.actor.flags?.world?.nixSteedOwner === me.uuid;
    const summoned = t => casterEffectIds.includes(t.id)
        || String(t.actor.flags?.dnd5e?.summon?.origin ?? '').startsWith(me.uuid + '.')
        || t.actor.effects.some(e => { const p = e.flags?.['chris-premades']?.parentEntityUuid; return p && p.startsWith(me.uuid + '.'); });
    const sameOwner = t => { const a = ownerIds(me), b = ownerIds(t.actor); return a.length && a.some(id => b.includes(id)); };
    const steeds = tokens.filter(linked).length ? tokens.filter(linked)
        : tokens.filter(summoned).length ? tokens.filter(summoned) : tokens.filter(sameOwner);
    const near = steeds.filter(t => t.object && tokenUtils.getDistance(mine, t.object) <= 5
        && (t.actor.system.attributes?.hp?.value ?? 0) < (t.actor.system.attributes?.hp?.max ?? 0));
    if (!near.length) return;
    setTimeout(async () => {
        for (const t of near) {
            await workflowUtils.applyDamage([t.object], gained, 'healing');
            if (globalThis.Sequence) {
                const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
                const beam = ['jb2a.energy_strands.range.standard.green', 'jb2a.energy_beam.normal.green.01'].find(ok);
                const glow = ['jb2a.healing_generic.200px.green', 'jb2a.healing_generic.burst.green'].find(ok);
                const s = new Sequence();
                if (beam) s.effect().file(beam).atLocation(mine).stretchTo(t.object);
                if (glow) s.effect().file(glow).atLocation(t.object).scaleToObject(1.6).delay(beam ? 500 : 0);
                s.play();
            }
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: t.actor}),
                content: '<b>Life Bond:</b> ' + t.name + ' shares ' + me.name + '\'s healing and regains ' + gained + ' hit points.'});
        }
    }, 400);
};
const MACRO = 'await (' + LIFE_BOND.toString() + ')();';
const NAME = 'Life Bond (steed shares healing)';
 
// ---- Optional manual link: steed selected, caster targeted ----------------------------------
const steedTok = canvas.tokens.controlled.find(t => t.actor?.items.some(i => /^life bond/i.test(i.name.trim())));
const casterTok = game.user.targets.first();
let linkMsg = '';
if (steedTok && casterTok?.actor && casterTok.id !== steedTok.id) {
    await steedTok.actor.setFlag('world', 'nixSteedOwner', casterTok.actor.uuid);
    // Also on the world actor, so future summons of this steed stay linked.
    const base = game.actors.get(steedTok.document.actorId);
    if (base && base !== steedTok.actor) await base.setFlag('world', 'nixSteedOwner', casterTok.actor.uuid);
    linkMsg = '<p>Linked <b>' + steedTok.name + '</b> to <b>' + casterTok.actor.name + '</b>.</p>';
}
 
// ---- Put the macro on every Find Steed spell ------------------------------------------------
const done = [];
const handle = async (actor, where) => {
    const spells = actor.items.filter(i => i.type === 'spell' && /^find (greater )?steed/i.test(i.name.trim()));
    for (const s of spells) {
        const kept = (s.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => m.name !== NAME);
        await s.setFlag('chris-premades', 'embeddedMacros', kept.concat([{name: NAME, type: 'midi-actor', pass: 'targetApplyDamage', priority: 300, macro: MACRO}]));
    }
    if (spells.length) done.push(actor.name + where);
};
for (const a of game.actors) if (a.type === 'character') await handle(a, '');
for (const s of game.scenes) for (const t of s.tokens) if (!t.actorLink && t.actor?.type === 'character') await handle(t.actor, ' (token on ' + s.name + ')');
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Life Bond installed</b>' + linkMsg
    + '<p>Find Steed casters: ' + (done.join(', ') || '<i>none found</i>') + '.</p>'
    + '<p>When one of them regains hit points from a level 1+ spell while within 5 ft of their steed, the steed regains the same amount.</p>'});
 