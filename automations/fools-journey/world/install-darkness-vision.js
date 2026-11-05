// =====================================================================
//  INSTALL DARKNESS & VISION: Script macro (run as GM). Safe to re-run.
//  Needs Vision 5e + Chris's Premades (Darkness with "Real Darkness" on).
//   - Devil's Sight feats: flagged as seeing in magical darkness for CPR's
//     attack checks (Vision 5e already gives them the vision itself).
//   - Shadow Sorcerer "Eyes of the Dark" / Shadow Monk "Shadow Arts": same flag,
//     plus Vision 5e's Devil's Sight detection on their tokens.
//   - Every Darkness spell: CPR "Use Real Darkness" on, "Magical Gloom" animation;
//     creatures inside that can't see through magical
//     darkness get Blinded; it's removed when they leave or the spell ends.
// =====================================================================
const CAST = "await (async () => {\n    let template = workflow.template;\n    for (let i = 0; i < 10 && !template; i++) { await genericUtils.sleep(200); template = workflow.template; }\n    if (!template) return;\n    await genericUtils.sleep(300);                                  // let CPR finish its own setup\n    const S = {\"enter\":\"await (async () => {\\n    const template = trigger.entity;\\n    const token = trigger.token;\\n    const actor = token?.actor;\\n    if (!actor) return;\\n    const ranges = actor.system.attributes?.senses?.ranges ?? actor.system.attributes?.senses ?? {};\\n    const tokenMode = id => {\\n        const dm = token.document.detectionModes;\\n        const m = Array.isArray(dm) ? dm.find(x => x.id === id) : dm?.[id];\\n        return m && m.enabled !== false && (m.range ?? 0) > 0;\\n    };\\n    const sees = (actor.flags?.['chris-premades']?.senses?.magicalDarkness ?? 0) > 0\\n        || (actor.detectionModes?.devilsSight ?? 0) > 0 || tokenMode('devilsSight')\\n        || (ranges.blindsight ?? 0) > 0 || (ranges.truesight ?? 0) > 0\\n        || tokenMode('blindsight') || tokenMode('seeAll');\\n    if (sees) return;\\n    if (actor.effects.some(e => e.flags?.world?.nixDarkBlind === template.uuid)) return;\\n    await effectUtils.createEffect(actor, {\\n        name: 'Darkness: Blinded',\\n        img: 'icons/magic/perception/silhouette-stealth-shadow.webp',\\n        origin: template.flags?.dnd5e?.origin ?? template.uuid,\\n        statuses: ['blinded'],\\n        description: 'Inside magical Darkness without a way to see through it.',\\n        flags: {world: {nixDarkBlind: template.uuid}}\\n    });\\n})();\",\"left\":\"await (async () => {\\n    const template = trigger.entity;\\n    const actor = trigger.token?.actor;\\n    if (!actor) return;\\n    const mine = actor.effects.filter(e => e.flags?.world?.nixDarkBlind === template.uuid);\\n    for (const e of mine) await genericUtils.remove(e);\\n})();\",\"deleted\":\"await (async () => {\\n    const uuid = trigger.entity.uuid;\\n    const actors = new Set(canvas.tokens.placeables.map(t => t.actor).filter(a => a));\\n    game.actors.forEach(a => actors.add(a));\\n    for (const a of actors) {\\n        for (const e of a.effects.filter(e => e.flags?.world?.nixDarkBlind === uuid)) await genericUtils.remove(e);\\n    }\\n})();\"};                                          // injected by the installer\n    const list = (template.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !/^Nix Darkness/.test(m.name));\n    list.push({name: 'Nix Darkness enter', type: 'template', pass: 'enter', priority: 50, macro: S.enter});\n    list.push({name: 'Nix Darkness left', type: 'template', pass: 'left', priority: 50, macro: S.left});\n    list.push({name: 'Nix Darkness deleted', type: 'template', pass: 'deleted', priority: 50, macro: S.deleted});\n    await template.setFlag('chris-premades', 'embeddedMacros', list);\n    // Creatures already inside when it's cast.\n    const blind = async (token) => {\n        const actor = token?.actor;\n        if (!actor) return;\n        const ranges = actor.system.attributes?.senses?.ranges ?? actor.system.attributes?.senses ?? {};\n        const tokenMode = id => {\n            const dm = token.document.detectionModes;\n            const m = Array.isArray(dm) ? dm.find(x => x.id === id) : dm?.[id];\n            return m && m.enabled !== false && (m.range ?? 0) > 0;\n        };\n        const sees = (actor.flags?.['chris-premades']?.senses?.magicalDarkness ?? 0) > 0\n            || (actor.detectionModes?.devilsSight ?? 0) > 0 || tokenMode('devilsSight')\n            || (ranges.blindsight ?? 0) > 0 || (ranges.truesight ?? 0) > 0\n            || tokenMode('blindsight') || tokenMode('seeAll');\n        if (sees || actor.effects.some(e => e.flags?.world?.nixDarkBlind === template.uuid)) return;\n        await effectUtils.createEffect(actor, {\n            name: 'Darkness: Blinded',\n            img: 'icons/magic/perception/silhouette-stealth-shadow.webp',\n            origin: workflow.item.uuid,\n            statuses: ['blinded'],\n            description: 'Inside magical Darkness without a way to see through it.',\n            flags: {world: {nixDarkBlind: template.uuid}}\n        });\n    };\n    for (const token of templateUtils.getTokensInTemplate(template)) await blind(token);\n})();";
 
// Chris's Premades Darkness settings: Real Darkness on, Magical Gloom animation.
const GLOOM = Object.entries(CONFIG.Canvas.darknessAnimations ?? {})
    .find(([k, v]) => /gloom/i.test(k) || /gloom/i.test(game.i18n.localize(v.label ?? '')))?.[0] ?? 'magicalGloom';
const SEE_FLAG = {key: 'flags.chris-premades.senses.magicalDarkness', mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE, value: '120', priority: 20};
const actors = new Map();
game.actors.forEach(a => actors.set(a.uuid, {actor: a, where: 'sidebar'}));
for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink && t.actor) actors.set(t.actor.uuid, {actor: t.actor, where: 'token in ' + scene.name});
const sight = [], shadow = [], spells = [], shadowFail = [];
async function addSeeEffect(item) {
    const old = item.effects.filter(e => e.name === 'See in Magical Darkness');
    if (old.length) await item.deleteEmbeddedDocuments('ActiveEffect', old.map(e => e.id));
    await item.createEmbeddedDocuments('ActiveEffect', [{name: 'See in Magical Darkness', img: item.img, transfer: true,
        description: 'Sees normally inside magical Darkness (Chris\'s Premades attack checks).', changes: [SEE_FLAG]}]);
}
async function addTokenDevilsSight(actor) {
    // Work on the SAVED token data only. The live token data includes modes that
    // Vision 5e adds on the fly (with an infinite range), which can't be saved.
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
        const p = add(actor._source.prototypeToken);
        if (p) await actor.update(Object.fromEntries(Object.entries(p).map(([k, v]) => ['prototypeToken.' + k, v])));
        for (const scene of game.scenes) for (const t of scene.tokens.filter(t => t.actorId === actor.id && t.actorLink)) {
            const u = add(t._source); if (u) await t.update(u);
        }
    } catch (err) {
        console.warn('Darkness & vision: could not add Devils Sight vision to ' + actor.name, err);
        shadowFail.push(actor.name);
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
            const list = (item.getFlag('chris-premades', 'embeddedMacros') ?? []).filter(m => m.name !== 'Nix Darkness Blind');
            list.push({name: 'Nix Darkness Blind', type: 'midi-item', pass: 'rollFinished', priority: 70, macro: CAST});
            await item.setFlag('chris-premades', 'embeddedMacros', list);
            await item.setFlag('chris-premades', 'config.useRealDarkness', true);
            await item.setFlag('chris-premades', 'config.darknessAnimation', GLOOM);
            spells.push(actor.name + ' (' + where + ')');
        }
    }
}
await ChatMessage.create({whisper: [game.user.id], content: '<b>Darkness & vision installed</b>'
    + '<br><b>Devil\'s Sight</b> (sees in magical darkness): ' + (sight.join(', ') || '<i>none</i>')
    + '<br><b>Shadow features</b> (Devil\'s Sight vision added to their tokens): ' + (shadow.join(', ') || '<i>none</i>')
    + '<br><b>Darkness spells</b> (Real Darkness on, Magical Gloom, blinds creatures that can\'t see in it): ' + (spells.join(', ') || '<i>none</i>')
    + (shadowFail.length ? '<br><b>Could not add vision to:</b> ' + shadowFail.join(', ') + ' (add Devil\'s Sight 120 ft in their Token > Vision settings by hand).' : '')
    + '<br><i>Recast Darkness to test; existing Darkness areas are not updated.</i>'});
 