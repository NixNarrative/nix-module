// =====================================================================
//  PETRA: SPELLS, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Petra selected, as GM). Safe to re-run.
//  The rules run in Nix Fix (scripts/court/petra-spells.mjs, the same file as v13);
//  this marks her spells and sets up their areas. On v14 dnd5e places a Region where
//  v13 placed a template; the wall state lives on the Region.
//   - Wall of Death: wall area (and a "ring" activity); damage, save and size from her
//     own spell. Ongoing damage on the side she picks.
//   - Negative Energy Flood: undead gain temp HP instead of saving; the dead rise as zombies.
//   - Sorcerous Burst: 8s on the d8s explode, up to her Cha modifier in extra dice.
//   - Prismatic Wall: Wall / Globe / "Destroy a layer / end" activities; layers,
//     blinding glare, opaque walls and light are handled by Nix Fix.
//  v14 differences:
//   - Wall of Death and Prismatic Wall carry Chris's Premades 2's own automation after the
//     Medkit. Ours replaces it (its activities and macro reference are removed; Revert brings
//     them back). To try theirs instead, re-apply the spell in the Medkit: Nix Fix then steps
//     aside on that spell (docs/V14-PORT-COURT.md, "Wall of Death / Prismatic Wall").
//   - Finger of Death: Midi QOL 14 raises the zombie itself on v14 (its automation note), so
//     ours isn't added (it would raise two). Without Midi's automation, ours is added as on v13.
//   - The v14 spell descriptions are empty (Chris's Premades 2 items): sizes fall back to the
//     v13 defaults (Wall of Death 60 ft wall / 20 ft ring, 10 ft reach, no save on the ongoing
//     damage; Prismatic Wall 90 ft / 30 ft globe, 12d6).
// =====================================================================

const MOD = 'nix-module', FLAG = 'petraSpell';
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Petra: spells (v14): select Petra\'s token first.');
if (!game.modules.get(MOD)?.api?.petraSpells) return ui.notifications.error('Petra: spells (v14): update Nix Fix and reload (the spell runtime isn\'t loaded).');
const report = [];
const spell = re => actor.items.find(i => i.type === 'spell' && re.test(i.name.trim()));
const plain = item => String(item.system.description?.value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const num = (text, re, d) => { const m = text.match(re); return m ? Number(m[1]) : d; };
const acts = item => Array.from(item.system.activities ?? []);
const partText = p => p ? (p.custom?.enabled && p.custom.formula ? p.custom.formula : (p.formula || (p.number && p.denomination ? p.number + 'd' + p.denomination + (p.bonus ? ' + ' + p.bonus : '') : '?')))
    + ' ' + [...(p.types ?? [])].join('/') : 'none';
const mine = a => a.flags?.[MOD]?.[FLAG];
// Foundry 14 deletes a key with _del (ForcedDeletion); "-=" is the old form.
const unset = path => typeof _del !== 'undefined' ? {[path]: _del} : {[path.replace(/\.([^.]+)$/, '.-=$1')]: null};
// Chris's Premades 2's own automation on the item (macro reference, automation stamp, wall animation).
const cpr2 = item => Object.values(item.flags?.cat?.macros ?? {}).flat().some(m => m?.source === 'chris-premades') || item.flags?.cat?.automation?.source === 'chris-premades';
const stripCpr2 = item => cpr2(item) ? {...unset('flags.cat.macros'), ...unset('flags.cat.automation'), ...unset('flags.cat.animationConfig')} : {};
// An activity copied without Chris's Premades 2's placed-region config (CAT would run its own region damage).
const clean = a => { const o = a.toObject(); delete o.id; if (o.flags?.cat) { delete o.flags.cat.placed; delete o.flags.cat.hidden; } return o; };
const emptyText = item => !plain(item).trim();

// ---- 1. Wall of Death ---------------------------------------------------------------------
const wod = spell(/^wall of death$/i);
if (!wod) report.push('<li><b>Wall of Death</b> not found.</li>');
else {
    const text = plain(wod);
    const list = acts(wod);
    const main = list.find(a => mine(a) === 'wall') ?? list.find(a => a.type === 'save' && !/ring/i.test(a.name ?? '') && !mine(a)) ?? list.find(a => a.type === 'save');
    if (!main) report.push('<li><b>Wall of Death</b> has no save activity to build on.</li>');
    else {
        const length = num(text, /(\d+)\s*(?:feet|ft\.?)\s*long/i, 60);
        const height = num(text, /(\d+)\s*(?:feet|ft\.?)\s*high/i, 20);
        const thick = num(text, /(\d+)\s*(?:foot|feet|ft\.?)\s*thick/i, 1);
        const diameter = num(text, /(\d+)\s*(?:feet|ft\.?)\s*in diameter/i, 20);
        const reach = num(text, /within\s*(\d+)\s*(?:feet|ft\.?)\s*of\s*(?:that|one|either|the chosen)?\s*side/i, 10);
        const turnLine = (text.split(/(?<=[.!?])\s+/).find(s => /ends? (?:its|their) turn/i.test(s)) ?? '');
        const tickSave = /saving throw|\bsave\b/i.test(turnLine);
        const bothSides = /both sides|either side/i.test(turnLine);
        const ability = [...(main.save?.ability ?? [])][0] ?? 'con';
        const part = main.damage?.parts?.[0];
        const tpl = t => ({count: '1', contiguous: false, stationary: true, units: 'ft', ...t});
        const wallData = foundry.utils.mergeObject(clean(main), {_id: main.id, name: main.name && !/^wall$/i.test(main.name) ? main.name : 'Wall', sort: 0,
            target: {override: true, prompt: true, template: tpl({type: 'wall', size: String(length), width: String(thick), height: String(height)})},
            flags: {[MOD]: {[FLAG]: 'wall'}}}, {inplace: false});
        const ring = foundry.utils.mergeObject(foundry.utils.deepClone(wallData), {_id: 'nixWallRing00000', name: 'Ring', sort: 1,
            target: {override: true, prompt: true, template: tpl({type: 'cylinder', size: String(diameter / 2), width: '', height: String(height)})},
            flags: {[MOD]: {[FLAG]: 'ring'}}}, {inplace: false});
        const upd = {
            ['system.activities.' + main.id]: wallData,
            'system.activities.nixWallRing00000': ring,
            ['flags.' + MOD + '.' + FLAG]: {kind: 'wallOfDeath', tickSave, ability, reach, seconds: 60, pending: []},
            ...stripCpr2(wod)
        };
        const gone = list.filter(a => a.id !== main.id && a.id !== 'nixWallRing00000');
        for (const a of gone) Object.assign(upd, unset('system.activities.' + a.id));
        const hadCpr2 = cpr2(wod);
        await wod.update(upd);
        report.push('<li><b>Wall of Death</b> (level ' + wod.system.level + '): ' + length + ' ft wall or ' + diameter + ' ft ring, '
            + ability.toUpperCase() + ' save, damage ' + esc(partText(part)) + '. Each turn: ending a turn inside or within ' + reach + ' ft of the chosen side, or entering the wall: '
            + (tickSave ? 'save for half' : 'damage, no save') + (emptyText(wod) ? ' (the v14 description is empty: v13 defaults)' : ' (read from the spell text)') + '.'
            + (hadCpr2 ? ' Chris\'s Premades 2\'s Wall of Death automation removed' + (gone.length ? ' (with its ' + gone.length + ' extra activit' + (gone.length === 1 ? 'y' : 'ies') + ')' : '') + '; Revert brings it back.' : '')
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
        + '. Undead targets skip the save and gain half the roll as temp HP; a creature it kills rises as a Zombie at the start of her next turn (you confirm).'
        + (cpr2(nef) ? ' <b>It also has a Chris\'s Premades 2 automation: set it to None in the Medkit.</b>' : '') + '</li>');
}

// ---- 3. Finger of Death ------------------------------------------------------------------------
const fod = spell(/^finger of death$/i);
if (!fod) report.push('<li><b>Finger of Death</b> not found (optional).</li>');
else {
    const midi = Object.values(fod.flags?.cat?.macros ?? {}).flat().some(m => m?.source === 'midi-qol')
        && /zombie/i.test(fod.flags?.cat?.automation?.notes ?? '');
    if (midi) {
        if (fod.flags?.[MOD]?.[FLAG]) await fod.update(unset('flags.' + MOD + '.' + FLAG));
        report.push('<li><b>Finger of Death</b>: Midi QOL already raises a Humanoid it kills as a Zombie on v14, so Nix Fix leaves it alone (no second zombie).</li>');
    } else {
        await fod.update({['flags.' + MOD + '.' + FLAG]: {kind: 'fingerOfDeath', pending: []}});
        report.push('<li><b>Finger of Death</b>: a Humanoid it kills rises as a Zombie under her command at the start of her next turn (you confirm).</li>');
    }
}

// ---- 4. Prismatic Wall -------------------------------------------------------------------------
const pw = spell(/^prismatic wall$/i);
if (!pw) report.push('<li><b>Prismatic Wall</b> not found.</li>');
else {
    const text = plain(pw);
    const dice = num(text, /(\d+)d6\s*fire/i, acts(pw).flatMap(a => a.damage?.parts ?? []).find(p => [...(p.types ?? [])].includes('fire'))?.number ?? 12);
    const length = num(text, /(\d+)\s*(?:feet|ft\.?)\s*long/i, 90);
    const height = num(text, /(\d+)\s*(?:feet|ft\.?)\s*high/i, 30);
    const globe = num(text, /globe\s*(?:that is\s*)?up to\s*(\d+)\s*(?:feet|ft\.?)/i, 30);
    const old = acts(pw).filter(a => !mine(a));
    const base = {activation: {type: 'action', value: 1, override: false}, duration: {override: false}, range: {override: false},
        consumption: {spellSlot: true, targets: [], scaling: {allowed: false}}, roll: {prompt: false, visible: false, formula: '', name: ''}};
    const util = (id, name, kind, template, extra = {}) => foundry.utils.mergeObject({_id: id, type: 'utility', name, sort: 0,
        target: {override: true, prompt: true, template: {count: '1', contiguous: false, stationary: true, units: 'ft', ...template}, affects: {type: '', count: ''}},
        flags: {[MOD]: {[FLAG]: kind}}, ...foundry.utils.deepClone(base)}, extra, {inplace: false});
    const hadCpr2 = cpr2(pw);
    const upd = {
        ['flags.' + MOD + '.' + FLAG]: {kind: 'prismaticWall', dice, seconds: 600},
        'system.activities.nixPrismWall0000': util('nixPrismWall0000', 'Wall', 'wall', {type: 'wall', size: String(length), width: '1', height: String(height)}),
        'system.activities.nixPrismGlobe000': util('nixPrismGlobe000', 'Globe', 'globe', {type: 'sphere', size: String(globe / 2)}, {sort: 1}),
        'system.activities.nixPrismLayer000': util('nixPrismLayer000', 'Destroy a layer / end', 'layer', {type: ''},
            {sort: 2, activation: {type: 'special', value: null, override: true}, consumption: {spellSlot: false}, target: {template: {count: ''}, prompt: false}}),
        ...stripCpr2(pw)
    };
    for (const a of old) Object.assign(upd, unset('system.activities.' + a.id));
    await pw.update(upd);
    // Chris's Premades 2's layer effects on the item (Blinded / Indigo / Violet) are only applied by its macros: harmless, left.
    report.push('<li><b>Prismatic Wall</b>: activities Wall (' + length + ' ft) and Globe (' + globe + ' ft), plus "Destroy a layer / end"'
        + (old.length ? ' (replaced ' + old.length + ' activit' + (old.length === 1 ? 'y' : 'ies') + (hadCpr2 ? ' from Chris\'s Premades 2\'s automation' : '') + '; Revert brings ' + (old.length === 1 ? 'it' : 'them') + ' back)' : '')
        + '. ' + dice + 'd6 per damage layer' + (emptyText(pw) ? ' (the v14 description is empty: v13 defaults)' : ' (from the spell text)')
        + '. Creatures on her side when she casts it pass unharmed.</li>');
}

// ---- 5. Sorcerous Burst --------------------------------------------------------------------------
const sb = spell(/^sorcerous burst$/i);
if (!sb) report.push('<li><b>Sorcerous Burst</b> not found.</li>');
else {
    const upd = {['flags.' + MOD + '.' + FLAG]: {kind: 'sorcerousBurst'}};
    const fixed = [];
    // v14 data explodes natively ("1d8x@mod=8"): strip it so ours (one real die each) doesn't double up.
    const NATIVE = /(d8)\s*x[o]?(?:@[a-z.]+|\d+)?(?:[<>=]+\d+)?/ig;
    for (const a of acts(sb)) {
        const parts = a.toObject().damage?.parts ?? [];
        let touched = false;
        for (const p of parts) {
            const f = p.custom?.formula ?? '';
            if (/d8\s*x/i.test(f)) { fixed.push(f); p.custom.formula = f.replace(NATIVE, '$1'); touched = true; }
        }
        if (touched) upd['system.activities.' + a.id + '.damage.parts'] = parts;
    }
    await sb.update(upd);
    const chr = actor.system.attributes?.spellcasting || 'cha';
    const cap = actor.system.abilities?.[chr]?.mod ?? 0;
    report.push('<li><b>Sorcerous Burst</b>: each 8 on a d8 adds another d8 (those can burst too), up to ' + cap + ' extra d8s ('
        + chr.toUpperCase() + ' modifier), each rolled as a real die.'
        + (fixed.length ? ' Removed the built-in exploding dice (' + esc(fixed.join(', ')) + ') so it can\'t double up.' : '')
        + (cpr2(sb) ? ' <b>Chris\'s Premades 2 automation is on this spell:</b> if it also explodes 8s, set its automation to None.' : '') + '</li>');
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])); }
await ChatMessage.create({whisper: [game.user.id], content: '<b>Petra: spells (v14) on ' + esc(actor.name) + '</b><ul>' + report.join('') + '</ul>'});
