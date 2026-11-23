// =====================================================================
//  INSTALL DISPEL MAGIC (2024 rules), Foundry v14 (Chris's Premades 2 / CAT) copy. World installer, all campaigns.
//  Run by Nix Fix (or as a Script macro, as GM). Safe to re-run. (1.7.7)
//  Marks every "Dispel Magic" spell in the world (sidebar actors and unlinked tokens on every scene) for Nix Fix's
//  Dispel Magic (scripts/dispel-magic.mjs): on cast, a pop-up of every spell effect within 120 ft (Regions for areas),
//  one pick, level <= the cast level ends, higher ones need a spellcasting check (DC 10 + level).
//  Chris's Premades 2 (2.1.9) / CAT (0.1.9) have no Dispel Magic automation; any premade one found on these spells
//  (flags.cat.macros / flags.cat.automation / embedded macros naming Dispel Magic) is removed so only Nix Fix's runs.
//  The spell's activities: range 120 ft, no targets and no template (Nix Fix asks for the target).
// =====================================================================
const MOD = 'nix-module';
const actors = new Map();
game.actors.forEach(a => actors.set(a.uuid, {actor: a, where: 'sidebar'}));
for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink && t.actor) actors.set(t.actor.uuid, {actor: t.actor, where: 'token in ' + scene.name});
const done = [], notes = [];
for (const {actor, where} of actors.values()) {
    for (const item of actor.items.filter(i => i.type === 'spell' && /^dispel magic\b/i.test(i.name.trim()))) {
        const upd = {['flags.' + MOD + '.dispelMagic']: {version: 1}};
        const stripped = [];
        const cat = item.flags?.cat ?? {};
        if (/dispel/i.test(cat.automation?.identifier ?? '') || /dispel/i.test(item.system?.identifier ?? '') && cat.automation) { upd['flags.cat.-=automation'] = null; stripped.push('CAT automation'); }
        const macros = cat.macros ?? {};
        for (const [type, list] of Object.entries(macros)) {
            if (Array.isArray(list) && list.some(r => /dispel/i.test(r?.identifier ?? ''))) { upd['flags.cat.macros.' + type] = list.filter(r => !/dispel/i.test(r?.identifier ?? '')); stripped.push('CAT macro (' + type + ')'); }
        }
        const emb = cat.embeddedMacros ?? [];
        if (emb.some(m => /dispel magic/i.test(m.name ?? ''))) { upd['flags.cat.embeddedMacros'] = emb.filter(m => !/dispel magic/i.test(m.name ?? '')); stripped.push('embedded macro'); }
        for (const a of item.system.activities ?? []) {
            upd['system.activities.' + a.id + '.range'] = {value: '120', units: 'ft', special: '', override: true};
            upd['system.activities.' + a.id + '.target'] = {affects: {type: '', count: '', choice: false, special: ''}, template: {type: '', size: '', units: 'ft', count: '', contiguous: false}, prompt: false, override: true};
        }
        await item.update(upd);
        done.push(actor.name + ': ' + item.name + ' (' + where + ')' + (stripped.length ? ' <i>(removed: ' + stripped.join(', ') + ')</i>' : ''));
    }
}
if (!game.modules.get(MOD)?.api?.dispelMagic) notes.push('<b>Nix Fix\'s Dispel Magic runtime isn\'t running</b>: update Nix Fix and reload (it needs Midi QOL).');
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: Dispel Magic (2024, v14) installed on ' + done.length + ':</b><br>' + (done.join('<br>') || '<i>none found</i>')
    + '<br><br>Cast it: pick one creature / object (every spell on it) or one area spell within 120 ft. Spells of the cast level or lower end; higher ones need a spellcasting check, DC 10 + their level.'
    + (notes.length ? '<br><br>' + notes.join('<br>') : '')});
