// =====================================================================
//  PETRA: SPELLS (Court of Ravenloft)
//  One-click INSTALLER (Script macro, run as GM). Select Petra's token, then run.
//  Safe to re-run. The rules run in Nix Fix (scripts/court/petra-spells.mjs);
//  this marks her spells and sets up their templates.
//   - Wall of Death: wall template (and a "ring" activity); damage, save and size
//     are read from her own spell. Ongoing damage on the side she picks.
//   - Negative Energy Flood: undead gain temp HP instead of saving; the dead rise as zombies.
//   - Finger of Death: a Humanoid it kills rises as a zombie under her command.
//   - Sorcerous Burst: 8s on the d8s explode, up to her Cha modifier in extra dice.
//   - Prismatic Wall: Wall / Globe / "Destroy a layer / end" activities; layers,
//     blinding glare, opaque walls and light are handled by Nix Fix.
// =====================================================================

const MOD = 'nix-module', FLAG = 'petraSpell';
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Petra: spells: select Petra\'s token first.');
if (!game.modules.get(MOD)?.api?.petraSpells) return ui.notifications.error('Petra: spells: update Nix Fix and reload (the spell runtime isn\'t loaded).');
const report = [];
const spell = re => actor.items.find(i => i.type === 'spell' && re.test(i.name.trim()));
const plain = item => String(item.system.description?.value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const num = (text, re, d) => { const m = text.match(re); return m ? Number(m[1]) : d; };
const acts = item => Array.from(item.system.activities ?? []);
const partText = p => p ? (p.formula || (p.number && p.denomination ? p.number + 'd' + p.denomination + (p.bonus ? ' + ' + p.bonus : '') : '?'))
    + ' ' + [...(p.types ?? [])].join('/') : 'none';
const mine = a => a.flags?.[MOD]?.[FLAG];

// ---- 1. Wall of Death ---------------------------------------------------------------------
const wod = spell(/^wall of death$/i);
if (!wod) report.push('<li><b>Wall of Death</b> not found.</li>');
else {
    const text = plain(wod);
    const main = acts(wod).find(a => mine(a) === 'wall') ?? acts(wod).find(a => a.type === 'save' && !mine(a)) ?? acts(wod).find(a => !mine(a));
    if (!main) report.push('<li><b>Wall of Death</b> has no activity to build on.</li>');
    else {
        const length = num(text, /(\d+)\s*(?:feet|ft\.?)\s*long/i, 60);
        const height = num(text, /(\d+)\s*(?:feet|ft\.?)\s*high/i, 20);
        const thick = num(text, /(\d+)\s*(?:foot|feet|ft\.?)\s*thick/i, 1);
        const diameter = num(text, /(\d+)\s*(?:feet|ft\.?)\s*in diameter/i, 20);
        const reach = num(text, /within\s*(\d+)\s*(?:feet|ft\.?)\s*of\s*(?:that|one|either|the chosen)?\s*side/i, 10);
        // Does the ongoing damage allow a save? Look at the sentence about ending a turn.
        const turnLine = (text.split(/(?<=[.!?])\s+/).find(s => /ends? (?:its|their) turn/i.test(s)) ?? '');
        const tickSave = /saving throw|\bsave\b/i.test(turnLine);
        const bothSides = /both sides|either side/i.test(turnLine);
        const ability = [...(main.save?.ability ?? [])][0] ?? 'con';
        const part = main.damage?.parts?.[0];
        const tpl = t => ({count: '1', contiguous: false, units: 'ft', ...t});
        const upd = {
            ['system.activities.' + main.id + '.target.template']: tpl({type: 'wall', size: String(length), width: String(thick), height: String(height)}),
            ['system.activities.' + main.id + '.target.override']: true,
            ['system.activities.' + main.id + '.flags.' + MOD + '.' + FLAG]: 'wall',
            ['flags.' + MOD + '.' + FLAG]: {kind: 'wallOfDeath', tickSave, ability, reach, seconds: 60, pending: []}
        };
        const ring = foundry.utils.mergeObject(main.toObject(), {_id: 'nixWallRing00000', name: (main.name || 'Wall') + ' (ring)', sort: (main.sort ?? 0) + 1,
            target: {override: true, template: tpl({type: 'cylinder', size: String(diameter / 2), height: String(height)})},
            flags: {[MOD]: {[FLAG]: 'ring'}}}, {inplace: false});
        upd['system.activities.nixWallRing00000'] = ring;
        await wod.update(upd);
        report.push('<li><b>Wall of Death</b> (level ' + wod.system.level + '): ' + length + ' ft wall or ' + diameter + ' ft ring, '
            + ability.toUpperCase() + ' save, damage ' + esc(partText(part)) + '. Each turn: ending a turn inside or within ' + reach + ' ft of the chosen side, or entering the wall: '
            + (tickSave ? 'save for half' : 'damage, no save') + (text.trim() ? ' (read from the spell text: <i>&ldquo;' + esc(turnLine.slice(0, 220) || 'no sentence about ending a turn found') + '&rdquo;</i>).' : ' <b>(the spell has no description here: the v13 defaults are used, one damaging side, no save on the ongoing damage).</b>')
            + (bothSides ? ' <b>The text says both sides hurt:</b> she still picks one; tell Claude if both should.' : '')
            + (part ? '' : ' <b>No damage on the save activity: fix the spell first.</b>') + '</li>');
    }
}

// ---- 2. Negative Energy Flood ----------------------------------------------------------------
const nef = spell(/^negative energy flood$/i);
if (!nef) report.push('<li><b>Negative Energy Flood</b> not found.</li>');
else {
    const main = acts(nef).find(a => a.type === 'save') ?? acts(nef)[0];
    await nef.update({['flags.' + MOD + '.' + FLAG]: {kind: 'negativeFlood', pending: []}});
    report.push('<li><b>Negative Energy Flood</b>: ' + (main ? [...(main.save?.ability ?? [])].join('/').toUpperCase() + ' save, ' + esc(partText(main.damage?.parts?.[0])) : 'no activity')
        + '. Undead targets skip the save and gain half the roll as temp HP; a creature it kills rises as a Zombie at the start of her next turn (you confirm).</li>');
}

// ---- 3. Finger of Death ------------------------------------------------------------------------
const fod = spell(/^finger of death$/i);
if (!fod) report.push('<li><b>Finger of Death</b> not found (optional).</li>');
else {
    await fod.update({['flags.' + MOD + '.' + FLAG]: {kind: 'fingerOfDeath', pending: []}});
    report.push('<li><b>Finger of Death</b>: a Humanoid it kills rises as a Zombie under her command at the start of her next turn (you confirm).</li>');
}

// ---- 4. Prismatic Wall -------------------------------------------------------------------------
const pw = spell(/^prismatic wall$/i);
if (!pw) report.push('<li><b>Prismatic Wall</b> not found.</li>');
else {
    const text = plain(pw);
    const dice = num(text, /(\d+)d6\s*fire/i, 12);
    const length = num(text, /(\d+)\s*(?:feet|ft\.?)\s*long/i, 90);
    const height = num(text, /(\d+)\s*(?:feet|ft\.?)\s*high/i, 30);
    const globe = num(text, /globe\s*(?:that is\s*)?up to\s*(\d+)\s*(?:feet|ft\.?)/i, 30);
    const old = acts(pw).filter(a => !mine(a));
    const base = {activation: {type: 'action', value: 1, override: false}, duration: {override: false}, range: {override: false},
        consumption: {spellSlot: true, targets: [], scaling: {allowed: false}}, roll: {prompt: false, visible: false, formula: '', name: ''}};
    const util = (id, name, kind, template, extra = {}) => foundry.utils.mergeObject({_id: id, type: 'utility', name, sort: 0,
        target: {override: true, prompt: true, template: {count: '1', contiguous: false, units: 'ft', ...template}, affects: {type: '', count: ''}},
        flags: {[MOD]: {[FLAG]: kind}}, ...foundry.utils.deepClone(base)}, extra, {inplace: false});
    const upd = {
        ['flags.' + MOD + '.' + FLAG]: {kind: 'prismaticWall', dice, seconds: 600},
        'system.activities.nixPrismWall0000': util('nixPrismWall0000', 'Wall', 'wall', {type: 'wall', size: String(length), width: '1', height: String(height)}),
        'system.activities.nixPrismGlobe000': util('nixPrismGlobe000', 'Globe', 'globe', {type: 'sphere', size: String(globe / 2)}, {sort: 1}),
        'system.activities.nixPrismLayer000': util('nixPrismLayer000', 'Destroy a layer / end', 'layer', {type: ''},
            {sort: 2, activation: {type: 'special', value: null, override: true}, consumption: {spellSlot: false}, target: {template: {count: ''}, prompt: false}})
    };
    for (const a of old) upd['system.activities.-=' + a.id] = null;
    await pw.update(upd);
    report.push('<li><b>Prismatic Wall</b>: activities Wall (' + length + ' ft) and Globe (' + globe + ' ft), plus "Destroy a layer / end"'
        + (old.length ? ' (replaced ' + old.length + ' imported activit' + (old.length === 1 ? 'y' : 'ies') + '; Revert brings ' + (old.length === 1 ? 'it' : 'them') + ' back)' : '')
        + '. ' + dice + 'd6 per damage layer (from the spell text). Creatures on her side when she casts it pass unharmed.</li>');
}

// ---- 5. Sorcerous Burst --------------------------------------------------------------------------
const sb = spell(/^sorcerous burst$/i);
if (!sb) report.push('<li><b>Sorcerous Burst</b> not found.</li>');
else {
    const upd = {['flags.' + MOD + '.' + FLAG]: {kind: 'sorcerousBurst'}};
    const fixed = [];
    for (const a of acts(sb)) (a.damage?.parts ?? []).forEach((p, i) => {
        const f = p.custom?.formula ?? '';
        if (/d8\s*x/i.test(f)) {
            upd['system.activities.' + a.id + '.damage.parts.' + i + '.custom.formula'] = f.replace(/(d8)\s*x[o]?\d*/ig, '$1');
            fixed.push(f);
        }
    });
    // Parts are an array: write each touched activity's parts whole.
    for (const a of acts(sb)) {
        const keys = Object.keys(upd).filter(k => k.startsWith('system.activities.' + a.id + '.damage.parts.'));
        if (!keys.length) continue;
        const parts = a.toObject().damage.parts;
        for (const k of keys) { parts[Number(k.split('.')[5])].custom.formula = upd[k]; delete upd[k]; }
        upd['system.activities.' + a.id + '.damage.parts'] = parts;
    }
    await sb.update(upd);
    const chr = actor.system.attributes?.spellcasting || 'cha';
    const cap = actor.system.abilities?.[chr]?.mod ?? 0;
    const cpr = Object.keys(sb.flags?.['chris-premades']?.macros ?? {}).length || sb.flags?.['chris-premades']?.info?.identifier;
    report.push('<li><b>Sorcerous Burst</b>: each 8 on a d8 adds another d8 (those can burst too), up to ' + cap + ' extra d8s ('
        + chr.toUpperCase() + ' modifier), each rolled as a real die.'
        + (fixed.length ? ' Removed the built-in exploding dice (' + esc(fixed.join(', ')) + ') so it can\'t double up.' : '')
        + (cpr ? ' <b>Chris\'s Premades automation is on this spell:</b> if it also explodes 8s, set its automation to None.' : '') + '</li>');
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])); }
await ChatMessage.create({whisper: [game.user.id], content: '<b>Petra: spells on ' + esc(actor.name) + '</b><ul>' + report.join('') + '</ul>'});
