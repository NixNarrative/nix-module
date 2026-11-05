// =====================================================================
//  INSTALL DARKNESS & VISION, Foundry v14 (Chris's Premades 2 / CAT) copy
//  World installer: run by Nix Fix (or as a Script macro, as GM). Safe to re-run.
//  Needs Vision 5e and Chris's Premades 2's Darkness (a Region automation).
//
//  On v14 CAT does the magical-darkness attack checks itself (advantage /
//  disadvantage), reading the Devil's Sight sense
//  system.attributes.senses.ranges.devilsSight. So:
//   - Devil's Sight feats: "See in Magical Darkness" effect now sets that sense
//     (120 ft) instead of the old Chris's Premades 1 flag. Their light/sight
//     keys move from ATL.* to token.* (DAE no longer applies ATL on v14).
//   - Shadow Sorcerer "Eyes of the Dark" / Shadow Monk "Shadow Arts": same sense,
//     plus Vision 5e's Devil's Sight detection on their tokens.
//   - Every Darkness spell: after the cast, creatures inside the Darkness region
//     that can't see through it get Blinded (region enter / left / deleted
//     macros on the region). CAT's attack checks still apply on top.
// =====================================================================
const run = fn => 'return await (' + fn.toString() + ')();';
 
// ---- Region macros (document = the Darkness region, token = the moving TokenDocument) ----
const regionEnter = async () => {
    const region = document;
    const tok = token?.object ?? token;
    const a = tok?.actor ?? token?.actor;
    if (!a) return;
    const ranges = a.system.attributes?.senses?.ranges ?? {};
    const tdoc = tok?.document ?? token;
    const modes = tdoc?.detectionModes;
    const tokenMode = id => { const m = Array.isArray(modes) ? modes.find(x => x.id === id) : modes?.[id]; return m && m.enabled !== false && (m.range ?? 0) > 0; };
    const sees = (ranges.devilsSight ?? 0) > 0 || (ranges.blindsight ?? 0) > 0 || (ranges.truesight ?? 0) > 0
        || tokenMode('devilsSight') || tokenMode('blindsight') || tokenMode('seeAll');
    if (sees) return;
    if (a.effects.some(e => e.flags?.world?.nixDarkBlind === region.uuid)) return;
    await effectUtils.createEffects(a, [{
        name: 'Darkness: Blinded', img: 'icons/magic/perception/silhouette-stealth-shadow.webp',
        origin: region.flags?.cat?.origin ?? region.uuid, statuses: ['blinded'],
        description: 'Inside magical Darkness without a way to see through it.',
        flags: {world: {nixDarkBlind: region.uuid}}
    }]);
};
const regionLeft = async () => {
    const region = document;
    const a = token?.actor;
    if (!a) return;
    for (const e of a.effects.filter(e => e.flags?.world?.nixDarkBlind === region.uuid)) await documentUtils.deleteDocument(e);
};
const regionDeleted = async () => {
    const uuid = document.uuid;
    const all = new Set(canvas.tokens.placeables.map(t => t.actor).filter(x => x));
    game.actors.forEach(x => all.add(x));
    for (const a of all) for (const e of a.effects.filter(e => e.flags?.world?.nixDarkBlind === uuid)) await documentUtils.deleteDocument(e);
};
 
// ---- Spell macro: roll / itemRollFinished / 70 -----------------------------------------
// Finds the Darkness region the cast just made, writes the three region macros on it,
// and blinds whoever is already inside.
const onCast = async () => {
    const S = {enter: '__ENTER__', left: '__LEFT__', deleted: '__DELETED__'};     // filled in by the installer
    const scene = canvas.scene;
    const started = Date.now() - 2000;
    const mine = r => JSON.stringify(r.flags ?? {}).includes(workflow.item.uuid)
        || JSON.stringify(r.flags ?? {}).includes(workflow.activity?.uuid ?? '#none#');
    const isDark = r => regionUtils.isMagicalDarkness?.(r) ?? /darkness/i.test(r.name ?? '');
    let region;
    for (let i = 0; i < 20 && !region; i++) {
        const list = (scene?.regions?.contents ?? []).filter(r => isDark(r) && !(r.flags?.cat?.embeddedMacros ?? []).some(m => /^Nix Darkness/.test(m.name)));
        region = list.find(mine) ?? list.filter(r => (r._stats?.createdTime ?? 0) >= started).at(-1);
        if (!region) await genericUtils.sleep(250);
    }
    if (!region) return console.warn('Nix Darkness | no Darkness region found for', workflow.item.name);
    const m = (name, pass, macro) => ({name, event: 'region', pass, macros: [{priority: 50, macro}]});
    const list = foundry.utils.deepClone(region.flags?.cat?.embeddedMacros ?? []).filter(x => !/^Nix Darkness/.test(x.name));
    list.push(m('Nix Darkness enter', 'enter', S.enter), m('Nix Darkness left', 'left', S.left), m('Nix Darkness deleted', 'deleted', S.deleted));
    await documentUtils.update(region, {'flags.cat.embeddedMacros': list, 'flags.world.nixDarknessOrigin': workflow.item.uuid});
    // Creatures already inside.
    const inside = Array.from(region.tokens ?? []);
    const enter = new (foundry.utils.AsyncFunction)('document', 'token', 'effectUtils', 'documentUtils', S.enter);
    for (const t of inside) await enter(region, t, effectUtils, documentUtils);
};
 
// The cast macro carries the region macros as text.
const CAST = run(onCast)
    .replace("'__ENTER__'", JSON.stringify(run(regionEnter)))
    .replace("'__LEFT__'", JSON.stringify(run(regionLeft)))
    .replace("'__DELETED__'", JSON.stringify(run(regionDeleted)));
 
const SEE = {key: 'system.attributes.senses.ranges.devilsSight', type: 'upgrade', value: '120', priority: 20};
const actors = new Map();
game.actors.forEach(a => actors.set(a.uuid, {actor: a, where: 'sidebar'}));
for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink && t.actor) actors.set(t.actor.uuid, {actor: t.actor, where: 'token in ' + scene.name});
const sight = [], shadow = [], spells = [], shadowFail = [], notes = [];
 
async function addSeeEffect(item) {
    const old = item.effects.filter(e => e.name === 'See in Magical Darkness');
    if (old.length) await item.deleteEmbeddedDocuments('ActiveEffect', old.map(e => e.id));
    await item.createEmbeddedDocuments('ActiveEffect', [{name: 'See in Magical Darkness', img: item.img, transfer: true,
        description: 'Sees normally inside magical Darkness (Devil\'s Sight sense, used by CAT\'s darkness checks).', system: {changes: [SEE]}}]);
    // Other effects on the feat: ATL.* -> token.*, and unique change ids.
    for (const e of item.effects) {
        const changes = e.system?.changes ?? [];
        const ids = new Set();
        let touched = false;
        const next = changes.map(c => {
            const n = {...c};
            if (String(n.key).startsWith('ATL.') && n.key !== 'ATL.texture.src') {
                n.key = 'token.' + n.key.slice(4);
                if (n.type === 'custom') n.type = 'override';
                touched = true;
            }
            if (n._id && ids.has(n._id)) { n._id = foundry.utils.randomID(); touched = true; }
            if (n._id) ids.add(n._id);
            return n;
        });
        if (touched) { await e.update({'system.changes': next}); notes.push(item.actor.name + ' > ' + item.name + ' > ' + e.name + ': light/sight keys tidied (ATL.* to token.*, duplicate change ids).'); }
    }
}
async function addTokenDevilsSight(a) {
    const clean = list => (list ?? []).filter(m => m && m.id && Number.isFinite(Number(m.range)))
        .map(m => ({id: m.id, range: Number(m.range), enabled: m.enabled !== false}));
    const add = source => {
        const dm = source?.detectionModes;
        if (Array.isArray(dm) || dm === undefined) {
            const list = clean(dm);
            if (list.some(m => m.id === 'devilsSight')) return null;
            return {detectionModes: list.concat([{id: 'devilsSight', range: 120, enabled: true}])};
        }
        if (dm.devilsSight) return null;
        return {'detectionModes.devilsSight': {range: 120, enabled: true}};
    };
    try {
        const p = add(a._source.prototypeToken);
        if (p) await a.update(Object.fromEntries(Object.entries(p).map(([k, v]) => ['prototypeToken.' + k, v])));
        for (const scene of game.scenes) for (const t of scene.tokens.filter(t => t.actorId === a.id && t.actorLink)) {
            const u = add(t._source); if (u) await t.update(u);
        }
    } catch (err) {
        console.warn('Darkness & vision: could not add Devils Sight vision to ' + a.name, err);
        shadowFail.push(a.name);
    }
}
for (const {actor, where} of actors.values()) {
    for (const item of actor.items) {
        const n = item.name.toLowerCase();
        if (item.type === 'feat' && /devil.s sight/.test(n)) { await addSeeEffect(item); sight.push(actor.name + ': ' + item.name); }
        else if (item.type === 'feat' && (/eyes of the dark|shadow arts/.test(n) || /eyes of the dark|shadow arts/i.test(item.system.description?.value ?? ''))) {
            await addSeeEffect(item);
            if (actor.isToken === false || !actor.token) await addTokenDevilsSight(actor);
            shadow.push(actor.name + ': ' + item.name);
        }
        else if (item.type === 'spell' && n.trim() === 'darkness') {
            const list = foundry.utils.deepClone(item.flags?.cat?.embeddedMacros ?? []).filter(m => m.name !== 'Nix Darkness Blind');
            list.push({name: 'Nix Darkness Blind', event: 'roll', pass: 'itemRollFinished', macros: [{priority: 70, macro: CAST}]});
            const updates = {'flags.cat.embeddedMacros': list};
            const old = item.flags?.['chris-premades'] ?? {};
            if (old.embeddedMacros?.some(m => m.name === 'Nix Darkness Blind')) updates['flags.chris-premades.embeddedMacros'] = old.embeddedMacros.filter(m => m.name !== 'Nix Darkness Blind');
            if (old.config) updates['flags.chris-premades.-=config'] = null;
            await item.update(updates);
            const cpr2 = item.flags?.cat?.automation?.source === 'chris-premades';
            spells.push(actor.name + ' (' + where + ')' + (cpr2 ? '' : ' <b>(no Chris\'s Premades 2 automation: apply Darkness in the Medkit first, or there is no region to find)</b>'));
        }
    }
}
await ChatMessage.create({whisper: [game.user.id], content: '<b>Darkness & vision (v14) installed</b>'
    + '<br><b>Devil\'s Sight</b> (sees in magical darkness): ' + (sight.join(', ') || '<i>none</i>')
    + '<br><b>Shadow features</b> (Devil\'s Sight vision added to their tokens): ' + (shadow.join(', ') || '<i>none</i>')
    + '<br><b>Darkness spells</b> (blinds creatures inside that can\'t see through it): ' + (spells.join(', ') || '<i>none</i>')
    + (notes.length ? '<br>' + notes.join('<br>') : '')
    + (shadowFail.length ? '<br><b>Could not add vision to:</b> ' + shadowFail.join(', ') + ' (add Devil\'s Sight 120 ft in their Token > Vision settings by hand).' : '')
    + '<br><i>Darkness\'s look (animation, real darkness) is set in the Medkit\'s configuration for each Darkness spell now. Recast Darkness to test.</i>'});
 