// =====================================================================
//  INSTALL DISPEL MAGIC (2024 rules), Foundry v13 (Chris's Premades 1). World installer, all campaigns.
//  Run by Nix Fix (or as a Script macro, as GM). Safe to re-run. (1.7.7)
//  Marks every "Dispel Magic" spell in the world (sidebar actors and unlinked tokens on every scene) for Nix Fix's
//  Dispel Magic (scripts/dispel-magic.mjs): on cast, a pop-up of every spell effect within 120 ft, one pick, level
//  <= the cast level ends, higher ones need a spellcasting check (DC 10 + level).
//  Chris's Premades 1 (1.5.52) has no Dispel Magic automation; any premade macro found on these spells (Chris's
//  Premades / embedded macros named Dispel Magic) is removed so only Nix Fix's runs. Gambit's Premades: set its
//  Dispel Magic to none if you use it.
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
        const cpr = item.flags?.['chris-premades'] ?? {};
        if (/dispel/i.test(cpr.info?.identifier ?? '')) { upd['flags.chris-premades.-=info'] = null; stripped.push('Chris\'s Premades identifier'); }
        const midiItem = cpr.macros?.midi?.item;
        if (Array.isArray(midiItem) && midiItem.some(m => /dispel/i.test(m))) { upd['flags.chris-premades.macros.midi.item'] = midiItem.filter(m => !/dispel/i.test(m)); stripped.push('Chris\'s Premades macro'); }
        const emb = cpr.embeddedMacros ?? [];
        if (emb.some(m => /dispel magic/i.test(m.name ?? ''))) { upd['flags.chris-premades.embeddedMacros'] = emb.filter(m => !/dispel magic/i.test(m.name ?? '')); stripped.push('embedded macro'); }
        for (const a of item.system.activities ?? []) {
            upd['system.activities.' + a.id + '.range'] = {value: '120', units: 'ft', special: '', override: true};
            upd['system.activities.' + a.id + '.target'] = {affects: {type: '', count: '', choice: false, special: ''}, template: {type: '', size: '', units: 'ft', count: '', contiguous: false}, prompt: false, override: true};
        }
        await item.update(upd);
        done.push(actor.name + ': ' + item.name + ' (' + where + ')' + (stripped.length ? ' <i>(removed: ' + stripped.join(', ') + ')</i>' : ''));
    }
}
if (!game.modules.get(MOD)?.api?.dispelMagic) notes.push('<b>Nix Fix\'s Dispel Magic runtime isn\'t running</b>: update Nix Fix and reload (it needs Midi QOL).');
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: Dispel Magic (2024) installed on ' + done.length + ':</b><br>' + (done.join('<br>') || '<i>none found</i>')
    + '<br><br>Cast it: pick one creature / object (every spell on it) or one area spell within 120 ft. Spells of the cast level or lower end; higher ones need a spellcasting check, DC 10 + their level.'
    + (notes.length ? '<br><br>' + notes.join('<br>') : '')});
