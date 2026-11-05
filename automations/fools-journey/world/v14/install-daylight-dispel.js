// =====================================================================
//  INSTALL DAYLIGHT / DAWN DISPEL, Foundry v14 (Chris's Premades 2 / CAT) copy
//  World installer: run by Nix Fix (or as a Script macro, as GM). Safe to re-run.
//  Writes the dispel-Darkness script onto every Daylight and Dawn spell in the
//  world as roll / itemRollFinished / 60. Templates are Regions on v14, so it
//  looks for magical-darkness Regions on the scene.
// =====================================================================
const ENTRY = 'Nix Daylight Dispel';
 
const dispel = async () => {
    // DAYLIGHT / DAWN DISPEL DARKNESS (Nix Fix, v14 / CAT). roll / itemRollFinished / 60.
    // When the spell's area overlaps a magical Darkness made by a spell of this cast's
    // level or lower, that Darkness ends: its caster's concentration on it ends, or the
    // region is removed.
    const level = Number(workflow.castData?.castLevel ?? workflow.item.system.level ?? 0);
    const scene = canvas.scene;
    if (!scene) return;
    const ftPerPx = canvas.dimensions.distance / canvas.dimensions.size;
    // Our area: the spell's own region if it placed one, else a circle on the caster.
    await genericUtils.sleep(300);
    const mine = (scene.regions?.contents ?? []).filter(r => JSON.stringify(r.flags ?? {}).includes(workflow.item.uuid)).at(-1);
    const boundsOf = r => { const b = r.bounds ?? r.object?.bounds; return b ? {x: b.x + b.width / 2, y: b.y + b.height / 2, r: Math.max(b.width, b.height) / 2} : null; };
    let center, radius;
    const own = mine && boundsOf(mine);
    if (own) { center = {x: own.x, y: own.y}; radius = own.r * ftPerPx; }
    else if (workflow.token) { center = workflow.token.center; radius = /dawn/i.test(workflow.item.name) ? 30 : 60; }
    if (!center) return;
 
    const isDark = r => regionUtils.isMagicalDarkness?.(r) ?? false;
    const darkness = (scene.regions?.contents ?? []).filter(r => r !== mine && isDark(r));
    const dispelled = [], tooStrong = [];
    for (const r of darkness) {
        const b = boundsOf(r);
        if (!b) continue;
        const dist = Math.hypot(b.x - center.x, b.y - center.y) * ftPerPx;
        if (dist > radius + b.r * ftPerPx) continue;
        const act = regionUtils.getActivity?.(r);
        const dLevel = Number(r.flags?.cat?.castData?.castLevel ?? r.flags?.dnd5e?.spellLevel?.value ?? r.flags?.dnd5e?.spellLevel
            ?? act?.item?.system?.level ?? 2);
        const name = act?.item?.name ?? r.name ?? 'Darkness';
        if (dLevel > level) { tooStrong.push(name + ' (level ' + dLevel + ')'); continue; }
        let ended = false;
        const holders = game.actors.contents.concat(scene.tokens.filter(x => !x.actorLink && x.actor).map(x => x.actor));
        for (const a of holders) {
            for (const e of a.effects) {
                const deps = e.getDependents?.() ?? (e.getFlag?.('dnd5e', 'dependents') ?? []);
                if (deps.some(d => (d.uuid ?? d) === r.uuid)) { await documentUtils.deleteDocument(e); ended = true; }
            }
        }
        await genericUtils.sleep(200);
        if (!ended || scene.regions.get(r.id)) await documentUtils.deleteDocument(r);
        dispelled.push(name + ' (level ' + dLevel + ')');
    }
    if (dispelled.length || tooStrong.length) await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({actor: workflow.actor}),
        content: '<b>' + workflow.item.name + ':</b> '
            + (dispelled.length ? 'the light dispels ' + dispelled.join(', ') + '.' : '')
            + (tooStrong.length ? ' Too powerful to dispel: ' + tooStrong.join(', ') + '.' : '')
    });
};
 
const MACRO = '// =====================================================================\n'
    + '//  DAYLIGHT / DAWN DISPEL DARKNESS (Nix Fix, Foundry v14 / CAT)\n'
    + '//  roll / itemRollFinished / 60. Written by install-daylight-dispel.js (v14).\n'
    + '// =====================================================================\n'
    + 'return await (' + dispel.toString() + ')();\n';
 
const actors = new Map();
game.actors.forEach(a => actors.set(a.uuid, {actor: a, where: 'sidebar'}));
for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink && t.actor) actors.set(t.actor.uuid, {actor: t.actor, where: 'token in ' + scene.name});
const done = [];
for (const {actor, where} of actors.values()) {
    for (const item of actor.items.filter(i => i.type === 'spell' && ['daylight', 'dawn'].includes(i.name.toLowerCase().trim()))) {
        const list = foundry.utils.deepClone(item.flags?.cat?.embeddedMacros ?? []).filter(m => m.name !== ENTRY);
        list.push({name: ENTRY, event: 'roll', pass: 'itemRollFinished', macros: [{priority: 60, macro: MACRO}]});
        const updates = {'flags.cat.embeddedMacros': list};
        const old = item.flags?.['chris-premades']?.embeddedMacros ?? [];
        if (old.some(m => m.name === ENTRY)) updates['flags.chris-premades.embeddedMacros'] = old.filter(m => m.name !== ENTRY);
        await item.update(updates);
        const cpr1 = item.flags?.['chris-premades']?.info?.identifier;
        done.push(actor.name + ': ' + item.name + ' (' + where + ')' + (cpr1 ? ' <i>(still tagged ' + cpr1 + ' for Chris\'s Premades 1: re-apply it in the Medkit if CPR2 has it, then run this again)</i>' : ''));
    }
}
await ChatMessage.create({whisper: [game.user.id], content: '<b>Daylight/Dawn dispel (v14) installed on:</b><br>' + (done.join('<br>') || '<i>none found</i>')});
 