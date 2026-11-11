// =====================================================================
//  DRACULA: BOSS KIT (Script macro, run as GM). Run after the Illrigger engine.
//  Safe to re-run. Runs Dracula as a boss on top of his Illrigger 20 kit:
//   - Baleful Interdict: no seal count. Seals come from his once-per-turn hit /
//     Bonus Action placement and from Legendary Actions.
//   - Legendary Actions (4, 5 in his lair, regained at the start of his turn): Seal (1),
//     Strike (2), By the Throat (2), Devour (2, on Infernal Conduit). Telekinetic Seal:
//     reaction, costs 1. Lair (toggle) marks the current scene as his lair.
//   - Regeneration: 20 HP at the start of his turn unless he took 15+ radiant damage.
//   - Infernal Conduit: Devour is his vampire bite (Bonus Action, or Legendary Action 2),
//     spends Conduit d10s; Invigorate is hidden.
//   - Infernal Ascension (mythic phase, once per long rest): at 0 HP he rises at full HP,
//     Infernal Majesty turns on and Master of Hell: Darkness erupts. Mythic Action:
//     Hellfire Detonation (2) burns every seal he has within 30 ft.
//   - Blood Price + Legendary Resistance in one prompt on a failed save. Legendary
//     Resistance bleeds (spell level / 2, rounded down)d10: 1st 0, 2nd 1d10, 4th 2d10, 7th 3d10.
//   - Invoke Hell (Grand Strategist, Punishment), You Die on My Command! and Devastator: 1/day each.
//   - Combat Mastery: Inexorable is a plain passive (save bonus), no activities.
//   - Dispater's Interdiction split into Chris's Premades' Telekinetic Seal,
//     By the Throat and Dispater's Supremacy (crits on 18-20 vs sealed creatures).
//   - Terrorizing Force: Necrotic on Chris's Premades (1d8, 2d8 in Infernal Majesty).
//   - Master of Hell: Inferno gets its Dex save. Feral Instinct renamed (advantage on initiative).
//   - On an NPC stat block (tool "Make stat block"): native Legendary Action / Resistance pips,
//     each Legendary Action in the Legendary Actions section, Hit Dice on the actor (1.6.1).
// =====================================================================
const MOD = 'nix-module';
const PACK = 'chris-premades.CPRThirdPartyClassFeatures';
const BLOOD_PRICE = `
// Nix Fix: Blood Price (Legendary). Save / bonus / 50. On a failed save with a DC:
// spend a Hit Die and add it, or spend Legendary Resistance to succeed and bleed
// floor(spell level / 2) d10 (1st: none, 2nd: 1d10, 4th: 2d10, 7th: 3d10). No spell level
// (not a spell, or the source can't be read): no HP.
// In Infernal Majesty the blood also hits the nearest enemy within 10 ft.
const {roll, actor} = trigger;
// Level of the spell behind this save, or null (not a spell / couldn't tell).
function sourceSpellLevel() {
    const mo = trigger.config?.midiOptions ?? trigger.options?.midiOptions ?? {};
    const uuid = mo.saveItemUuid ?? mo.itemUuid ?? trigger.options?.saveItemUuid ?? trigger.config?.saveItemUuid;
    if (!uuid) return null;
    let wf;
    try { wf = MidiQOL.Workflow.getWorkflow(uuid); } catch { wf = undefined; }
    const doc = wf?.item ?? fromUuidSync(uuid);
    const item = doc?.documentName === 'Item' ? doc : doc?.item;
    if (!item) return null;
    if (item.type !== 'spell') return null;
    const cast = Number(wf?.castData?.castLevel ?? item.system.level);
    return Number.isFinite(cast) ? cast : item.system.level;
}
const dc = roll.options?.target;
if (!dc || roll.total >= dc) return;
// NPC stat block (Nix Fix "Make stat block"): Hit Dice and Legendary Resistance live on the
// actor (system.attributes.hd, system.resources.legres). Character: class item + item uses.
const npc = actor.type === 'npc';
const byDie = (a, b) => parseInt(String(b.system.hd?.denomination).slice(1)) - parseInt(String(a.system.hd?.denomination).slice(1));
const cls = npc ? null : actor.items.filter(i => i.type === 'class' && (i.system.levels - (i.system.hd?.spent ?? 0)) > 0).sort(byDie)[0];
const npcHd = npc ? (actor.system.attributes.hd?.value ?? 0) : 0;
const lr = actor.items.find(i => i.flags?.['nix-module']?.legendaryResistance);
const lrLeft = npc ? (actor.system.resources?.legres?.value ?? 0) : (lr?.system.uses?.value ?? 0);
if (!cls && !npcHd && !lrLeft) return;
const die = (npc ? actor.items.filter(i => i.type === 'class').sort(byDie)[0]?.system.hd?.denomination : cls?.system.hd?.denomination) ?? 'd10';
const lvl = sourceSpellLevel();
const bleedLabel = n => n ? 'bleed ' + n + 'd10' : 'no bleed';
const buttons = [];
if (cls || npcHd) buttons.push(['Blood Price: spend a Hit Die, +1' + die + (npc ? ' (' + npcHd + ' left)' : ''), 'price']);
if (lrLeft) {
    const head = 'Legendary Resistance (' + lrLeft + ' left): succeed, ';
    const n = lvl === null ? 0 : Math.floor(lvl / 2);
    buttons.push([head + (lvl === null ? 'no spell level' : 'level ' + lvl + ' spell') + ': ' + bleedLabel(n), 'legend:' + n]);
}
buttons.push(['Accept the failure', 'none']);
const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
const pick = await dialogUtils.buttonDialog('Blood Price', actor.name + ' failed a saving throw: ' + roll.total + ' against DC ' + dc + '.', buttons, {userId});
if (!pick || pick === 'none') return;
const tok = trigger.token ?? actorUtils.getFirstToken(actor);
const imOn = effectUtils.getEffectByIdentifier(actor, 'infernalMajestyEffect');
async function aura(amount) {
    if (!imOn || !tok || !(amount > 0)) return;
    const foes = tokenUtils.findNearby(tok, 10, 'enemy', {includeIncapacitated: true}).filter(t => tokenUtils.canSee(tok, t))
        .sort((a, b) => tokenUtils.getDistance(tok, a) - tokenUtils.getDistance(tok, b));
    if (!foes.length) return;
    await workflowUtils.applyDamage([foes[0]], amount, 'none');
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Infernal Majesty:</b> the spilled blood lashes ' + foes[0].document.name + ' for ' + amount + '.'});
}
if (pick === 'price') {
    if (npc) await genericUtils.update(actor, {'system.attributes.hd.spent': (actor.system.attributes.hd.spent ?? 0) + 1});
    else await genericUtils.update(cls, {'system.hd.spent': (cls.system.hd.spent ?? 0) + 1});
    const r = await new Roll('1' + die).evaluate();
    const newRoll = MidiQOL.addRollTo(roll, r);
    newRoll.data = roll.data;
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Blood Price:</b> ' + actor.name + ' spends a Hit Die: +' + r.total + ' (' + newRoll.total + ').'});
    await aura(r.total);
    return newRoll;
}
if (npc) await genericUtils.update(actor, {'system.resources.legres.spent': (actor.system.resources.legres.spent ?? 0) + 1});
else await genericUtils.update(lr, {'system.uses.spent': (lr.system.uses.spent ?? 0) + 1});
const dice = Number(String(pick).split(':')[1]) || 0;
const bleed = dice ? (await new Roll(dice + 'd10').evaluate()).total : 0;
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Legendary Resistance (Blood Price):</b> ' + actor.name + ' succeeds instead'
    + (bleed ? ' and bleeds ' + bleed + ' hit points (' + dice + 'd10).' : ' without bleeding.')});
const fix = await new Roll(String(dc - roll.total)).evaluate();
const newRoll = MidiQOL.addRollTo(roll, fix);
newRoll.data = roll.data;
if (bleed) setTimeout(async () => { await actor.applyDamage(bleed); await aura(bleed); }, 50);
return newRoll;
`;

const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return ui.notifications.warn('Dracula boss kit: no actor.');
const cfg = actor.flags?.[MOD]?.illrigger;
if (!cfg) return ui.notifications.warn('Dracula boss kit: apply the Illrigger engine (world) first.');
const report = [];
const ident = d => d?.flags?.['chris-premades']?.info?.identifier;
const find = (id, re) => actor.items.find(i => id && ident(i) === id) ?? actor.items.find(i => re.test(i.name));
const wait = ms => new Promise(r => setTimeout(r, ms));
const lc = s => String(s ?? '').toLowerCase().trim();

async function fromPack(names) {
    const pack = game.packs.get(PACK);
    if (!pack) return [];
    const index = await pack.getIndex();
    const out = [];
    for (const n of names) {
        const e = index.find(x => lc(x.name) === lc(n));
        if (e) out.push((await pack.getDocument(e._id)).toObject());
    }
    return out;
}
async function ensureItem(data, match) {
    let it = actor.items.find(match);
    if (it) { await it.update(data); return actor.items.get(it.id); }
    [it] = await actor.createEmbeddedDocuments('Item', [data]);
    return it;
}
const act = (id, type, data) => ({_id: id, type, ...data});

const prevBoss = actor.flags?.[MOD]?.boss ?? {};
const sceneNow = game.combat?.scene ?? canvas.scene;
function la0Max() { return sceneNow && (prevBoss.lairScenes ?? []).includes(sceneNow.id) ? 5 : 4; }

// ---- 1. Legendary Actions ---------------------------------------------------------------
const la = await ensureItem({
    name: 'Legendary Actions', type: 'feat', img: 'icons/magic/unholy/hand-claw-glow-orange.webp',
    'system.description.value': '<p>Dracula can take 4 Legendary Actions (5 in his lair), one at a time, immediately after another creature\'s turn. He regains them at the start of his turn.</p>'
        + '<ul><li><b>Seal (1).</b> A Baleful Interdict seal on a creature within 30 ft.</li><li><b>Strike (2).</b> One attack with his weapon.</li>'
        + '<li><b>By the Throat (2).</b> A seal, then Dispater\'s By the Throat (Wis save or restrained).</li>'
        + '<li><b>Devour (2).</b> His vampire bite: Infernal Conduit\'s <i>Devour (Legendary, 2)</i> activity.</li></ul>'
        + '<p>Reaction: Telekinetic Seal costs 1. During Infernal Ascension: Hellfire Detonation (2).</p>'
        + '<p><b>Lair (toggle).</b> Marks the scene you\'re on as his lair (or unmarks it). In a lair scene he has 5 Legendary Actions.</p>'
        + '<p><b>Regeneration.</b> At the start of his turn he regains 20 hit points if he has at least 1, unless he took 15 or more radiant damage since the start of his last turn.</p>',
    'system.type': {value: 'monster', subtype: ''},
    'system.uses': {max: String(la0Max()), spent: 0, recovery: [{period: 'turnStart', type: 'recoverAll'}]},
    'system.activities': {
        nixLegendSeal000: act('nixLegendSeal000', 'utility', {name: 'Seal (1)', activation: {type: 'special', value: 1}, range: {value: '30', units: 'ft'},
            target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '1'}]}, flags: {[MOD]: {boss: 'seal'}}}),
        nixLegendStrike0: act('nixLegendStrike0', 'utility', {name: 'Strike (2)', activation: {type: 'special', value: 2}, range: {units: 'self'},
            target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {boss: 'strike'}}}),
        nixLegendThroat0: act('nixLegendThroat0', 'utility', {name: 'By the Throat (2)', activation: {type: 'special', value: 2}, range: {value: '30', units: 'ft'},
            target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {boss: 'throat'}}}),
        nixLegendLair000: act('nixLegendLair000', 'utility', {name: 'Lair (toggle this scene)', activation: {type: 'special', value: null}, range: {units: 'self'},
            consumption: {targets: []}, flags: {[MOD]: {boss: 'lair'}}})
    },
    ['flags.' + MOD + '.legendary']: true
}, i => i.flags?.[MOD]?.legendary || /^legendary actions$/i.test(i.name));
report.push('Legendary Actions: 4 (5 in his lair), back at the start of his turn. Seal (1), Strike (2), By the Throat (2), Devour (2, on Infernal Conduit). '
    + 'Use <i>Lair (toggle this scene)</i> on his lair scenes.');

// ---- 2. Infernal Ascension (mythic phase) ----------------------------------------------
await ensureItem({
    name: 'Infernal Ascension (Mythic)', type: 'feat', img: 'icons/magic/unholy/silhouette-evil-horned-giant.webp',
    'system.description.value': '<p><b>Once per long rest.</b> When Dracula drops to 0 hit points, he stays at 1, then rises at full hit points. '
        + 'Infernal Majesty turns on (no Bonus Action), Master of Hell: Darkness erupts (no use spent) and his Legendary Actions refill.</p>'
        + '<p><b>Mythic Action: Hellfire Detonation (2 Legendary Actions).</b> Every seal he has on creatures within 30 ft burns (necrotic), no reaction needed.</p>',
    'system.type': {value: 'monster', subtype: ''},
    'system.activities': {
        nixMythicDeton00: act('nixMythicDeton00', 'utility', {name: 'Hellfire Detonation (2)', activation: {type: 'special', value: 2}, range: {units: 'self'},
            consumption: {targets: [{type: 'itemUses', target: la.id, value: '2'}]}, flags: {[MOD]: {boss: 'detonate'}}})
    },
    ['flags.' + MOD + '.mythic']: true
}, i => i.flags?.[MOD]?.mythic);
report.push('Infernal Ascension: at 0 HP (once per long rest) he rises at full HP with Infernal Majesty + Master of Hell: Darkness. Mythic Action: Hellfire Detonation (2).');

// ---- 3. Legendary Resistance (Blood Price) + Blood Price prompt ------------------------
await ensureItem({
    name: 'Legendary Resistance (Blood Price)', type: 'feat', img: 'icons/magic/life/heart-cross-strong-flame-purple-orange.webp',
    'system.description.value': '<p>3/day. When Dracula fails a saving throw he can succeed instead. Against a spell he bleeds d10s equal to half the spell\'s level, rounded down '
        + '(1st: none, 2nd-3rd: 1d10, 4th-5th: 2d10, 6th-7th: 3d10, 8th-9th: 4d10). With no spell level (not a spell, or the source can\'t be read) he doesn\'t bleed. '
        + 'In Infernal Majesty the blood also hits the nearest enemy within 10 ft. Asked together with Blood Price on the same prompt.</p>',
    'system.type': {value: 'monster', subtype: ''},
    'system.uses': {max: '3', spent: 0, recovery: [{period: 'lr', type: 'recoverAll'}]},
    ['flags.' + MOD + '.legendaryResistance']: true
}, i => i.flags?.[MOD]?.legendaryResistance);
const bp = find('bloodPrice', /^blood price/i);
if (bp) {
    const saves = (bp.flags?.['chris-premades']?.macros?.save ?? []).filter(n => n !== 'bloodPrice');
    const emb = (bp.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => m.name !== 'Blood Price (Legendary)');
    await bp.update({'flags.chris-premades.macros.save': saves,
        'flags.chris-premades.embeddedMacros': emb.concat([{name: 'Blood Price (Legendary)', type: 'save', pass: 'bonus', priority: 50, macro: BLOOD_PRICE}])});
    report.push('Blood Price: one prompt on a failed save: spend a Hit Die (+1d10), Legendary Resistance (3/day: succeed, bleed (spell level / 2)d10, none for 1st level or non-spells), or accept.');
} else report.push('<b>Blood Price not found</b>: Legendary Resistance has no prompt until it is on the sheet.');

// ---- 4. Dispater's Interdiction and Invoke Hell as Chris's Premades items ---------------
const wanted = [
    ['telekineticSeal', 'Dispater\'s Interdiction: Telekinetic Seal'],
    ['byTheThroat', 'Dispater\'s Interdiction: By the Throat'],
    ['dispatersSupremacy', 'Dispater\'s Interdiction: Dispater\'s Supremacy (Passive)'],
    ['grandStrategist', 'Invoke Hell: Grand Strategist'],
    ['punishment', 'Invoke Hell: Punishment']
];
const missing = wanted.filter(([id]) => !actor.items.some(i => ident(i) === id)).map(([, n]) => n);
if (missing.length) {
    const datas = await fromPack(missing);
    if (datas.length) await actor.createEmbeddedDocuments('Item', datas);
    const notFound = missing.filter(n => !datas.some(d => lc(d.name) === lc(n)));
    if (notFound.length) report.push('<b>Not in Chris\'s Premades\' compendium:</b> ' + notFound.join(', ') + '.');
    else report.push('Added from Chris\'s Premades: ' + missing.join(', ') + '.');
    await wait(1200);     // let Chris's Premades' "created" macros point consumption first; we override below
}
// D&D Beyond bundles: Chris's Premades can't match them, and they'd duplicate the above.
const bundles = actor.items.filter(i => !ident(i) && (/^dispater'?s interdiction$/i.test(i.name.trim()) || /^invoke hell$/i.test(i.name.trim())));
if (bundles.length) {
    await actor.deleteEmbeddedDocuments('Item', bundles.map(i => i.id));
    report.push('Removed the D&D Beyond bundles: ' + bundles.map(i => i.name).join(', ') + ' (Revert brings them back).');
}

// ---- 5. Baleful Interdict: no seal count; boons stop spending seals ------------------
const bi = actor.items.filter(i => ident(i) === 'balefulInterdict' || /^baleful interdict$/i.test(i.name.trim()))[0];
async function retarget(item, fn) {
    if (!item) return;
    const upd = {};
    for (const a of item.system.activities) {
        const t = a.consumption?.targets ?? [];
        const next = fn(a, t.map(x => ({...x})));
        if (JSON.stringify(next) !== JSON.stringify(t)) upd['system.activities.' + a.id + '.consumption.targets'] = next;
    }
    if (Object.keys(upd).length) await item.update(upd);
}
if (bi) {
    await bi.update({'system.uses.max': '', 'system.uses.spent': 0});
    await retarget(bi, (a, t) => t.filter(x => !(x.type === 'itemUses' && (!x.target || x.target === bi.id))));
    report.push('Baleful Interdict: no seal count (hit / Bonus Action placement once per turn, more with Legendary Actions).');
}
const notBI = x => !(x.type === 'itemUses' && bi && x.target === bi.id);
for (const [id, re] of [['interdictBoonBedevil', /bedevil/i], ['interdictBoonSoulsDoom', /soul'?s doom/i], ['interdictBoonStyxsApathy', /styx/i],
    ['interdictBoonUnleashHell', /unleash hell/i], ['interdictBoonFlashOfBrimstone', /flash of brimstone/i]]) {
    await retarget(find(id, re), (a, t) => t.filter(notBI));
}
await retarget(find('telekineticSeal', /telekinetic seal/i), (a, t) => t.filter(notBI).filter(x => x.target !== la.id).concat([{type: 'itemUses', target: la.id, value: '1'}]));
await retarget(find('byTheThroat', /by the throat/i), (a, t) => t.filter(notBI));
report.push('Interdict boons no longer spend seals. Telekinetic Seal (reaction) costs 1 Legendary Action.');

// ---- 6. Once per day: Invoke Hell options, You Die on My Command! -----------------------
for (const [id, re] of [['grandStrategist', /grand strategist/i], ['punishment', /^invoke hell: punishment/i], ['youDieOnMyCommand', /you die on my command/i], ['devastator', /^devastator/i]]) {
    const it = find(id, re);
    if (!it) { report.push('<b>' + re.source + '</b> not found.'); continue; }
    await it.update({'system.uses': {max: '1', spent: 0, recovery: [{period: 'lr', type: 'recoverAll'}]}});
    await retarget(it, (a, t) => [{type: 'itemUses', target: '', value: '1'}]);
}
report.push('Grand Strategist, Punishment, You Die on My Command! and Devastator: 1/day each, no shared Invoke Hell use.');

// ---- 7. Terrorizing Force: Necrotic on Chris's Premades ----------------------------------
const tf = find('terrorizingForce', /^terrorizing force/i);
if (tf) {
    const actorMacros = Array.from(new Set([...(tf.flags?.['chris-premades']?.macros?.midi?.actor ?? []), 'terrorizingForce']));
    await tf.update({'flags.chris-premades.macros.midi.actor': actorMacros, 'flags.chris-premades.info.identifier': 'terrorizingForce',
        'flags.chris-premades.info.rules': 'legacy', 'flags.chris-premades.terrorizingForce.damageType': 'necrotic'});
    for (const e of tf.effects) if (!e.disabled && e.changes.some(c => /damage/i.test(c.key))) await e.update({disabled: true});
    report.push('Terrorizing Force: +1d8 necrotic on every weapon hit (melee and ranged), 2d8 in Infernal Majesty (Chris\'s Premades). D&D Beyond\'s melee-only effect off.');
}

// ---- 8. Master of Hell: Inferno save -----------------------------------------------------
const moh = actor.items.find(i => /^master of hell/i.test(i.name));
const inferno = moh?.system.activities.find(a => /inferno/i.test(a.name ?? ''));
if (inferno && inferno.type === 'save' && !inferno.save?.ability?.size) {
    await moh.update({['system.activities.' + inferno.id + '.save']: {ability: ['dex'], dc: {calculation: 'cha', formula: ''}}});
    report.push('Master of Hell: Inferno now asks for a Dexterity save (DC 8 + PB + Cha).');
}

// ---- 9. Feral Instinct ---------------------------------------------------------------------
const feral = actor.items.find(i => /^feral instinct/i.test(i.name));
if (feral) {
    if (/\(copy\)/i.test(feral.name)) await feral.update({name: 'Feral Instinct'});
    const hasAdv = feral.effects.some(e => e.transfer && e.changes.some(c => c.key === 'flags.dnd5e.initiativeAdv'));
    if (!hasAdv) await feral.createEmbeddedDocuments('ActiveEffect', [{name: 'Feral Instinct', img: feral.img, transfer: true,
        changes: [{key: 'flags.dnd5e.initiativeAdv', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '1', priority: 20}]}]);
    report.push('Feral Instinct: renamed; advantage on initiative.');
}

// ---- 10. Infernal Conduit: Devour = his vampire bite (Bonus Action / Legendary Action 2) ----
const conduit = find('infernalConduit', /^infernal conduit/i);
if (conduit) {
    const ids = conduit.flags?.['chris-premades']?.activityIdentifiers ?? {};
    const devour = conduit.system.activities.get(ids.necrotic) ?? conduit.system.activities.find(a => /harm|devour/i.test(a.name ?? ''));
    if (!ident(conduit) || !devour) report.push('<b>Infernal Conduit</b> isn\'t Chris\'s Premades\' version: apply it in the Medkit, then re-run this.');
    else {
        const upd = {};
        upd['system.activities.' + devour.id + '.name'] = 'Devour (Vampire Bite)';
        upd['system.activities.' + devour.id + '.activation'] = {type: 'bonus', value: 1, override: false, condition: ''};
        upd['system.activities.' + devour.id + '.range'] = {units: 'touch', override: false, special: ''};
        // Legendary copy: same save and dice, CPR's macro heals him from the necrotic dealt.
        const dv = devour.toObject();
        upd['system.activities.nixDevourLegend0'] = {...dv, _id: 'nixDevourLegend0', name: 'Devour (Legendary, 2)',
            activation: {type: 'legendary', value: 2, override: false, condition: ''},
            range: {units: 'touch', override: false, special: ''},
            consumption: {scaling: {allowed: true, max: '@item.uses.value'}, spellSlot: false,
                targets: [{type: 'itemUses', target: '', value: '@scaling', scaling: {mode: ''}}, {type: 'itemUses', target: la.id, value: '2', scaling: {mode: ''}}]},
            damage: {...dv.damage, parts: [{custom: {enabled: true, formula: '(@scaling)d10'}, number: null, denomination: null, bonus: '', types: ['necrotic'], scaling: {mode: '', number: 1}}]},
            flags: {[MOD]: {boss: 'devourLegend'}}};
        const hidden = new Set(conduit.flags?.['chris-premades']?.hiddenActivities ?? []);
        hidden.add('healing');
        upd['flags.chris-premades.hiddenActivities'] = Array.from(hidden);
        await conduit.update(upd);
        report.push('Infernal Conduit (' + (conduit.system.uses?.max ? conduit.system.uses.value + '/' + actor.items.get(conduit.id).system.uses.max : '?') + ' d10s, back on a long rest): '
            + '<i>Devour (Vampire Bite)</i> is a Bonus Action, <i>Devour (Legendary, 2)</i> spends 2 Legendary Actions. Choose how many d10s in the usage window; '
            + 'Con save for half, he heals the necrotic dealt. Invigorate hidden (Medkit: Activities brings it back).');
    }
} else report.push('<b>Infernal Conduit not found.</b>');

// ---- 11. Combat Mastery: Inexorable: a plain passive -------------------------------------
const inex = find('combatMasteryInexorable', /inexorable/i);
if (inex) {
    const upd = {'flags.chris-premades.info.identifier': 'combatMasteryInexorable', 'flags.chris-premades.info.rules': 'legacy',
        'flags.chris-premades.macros.save': Array.from(new Set([...(inex.flags?.['chris-premades']?.macros?.save ?? []), 'combatMasteryInexorable'])),
        'system.uses': {max: '', spent: 0, recovery: []}};
    for (const a of inex.system.activities) upd['system.activities.-=' + a.id] = null;
    await inex.update(upd);
    for (const e of inex.effects) if (!e.transfer && !e.disabled) await e.update({disabled: true});
    report.push('Combat Mastery: Inexorable: passive (+1 to saves per hostile creature within 5 ft, max +5), no activities or uses.');
} else report.push('<b>Combat Mastery: Inexorable not found.</b>');

// ---- 12. Boss flags -------------------------------------------------------------------------
await actor.update({['flags.' + MOD + '.illrigger.unlimitedSeals']: true,
    ['flags.' + MOD + '.boss']: {version: 2, phase2: true, ascendedThisRest: !!prevBoss.ascendedThisRest, legendaryItem: la.id,
        lairScenes: prevBoss.lairScenes ?? [], legendaryBase: 4, legendaryLair: 5,
        regen: true, regenAmount: prevBoss.regenAmount ?? 20, radiantStop: prevBoss.radiantStop ?? 15, radiantTaken: prevBoss.radiantTaken ?? 0}});
report.push('Regeneration: ' + (prevBoss.regenAmount ?? 20) + ' HP at the start of his turn unless he took ' + (prevBoss.radiantStop ?? 15) + '+ radiant since his last turn.');

// ---- 13. NPC stat block (Make stat block): native pips, Legendary Actions section --------------
if (actor.type === 'npc') {
    const sb = game.modules.get(MOD)?.api?.statBlock;
    if (sb) report.push(...await sb.npcLegendary(actor));
    else report.push('<b>NPC:</b> Nix Fix\'s runtime isn\'t running, so the stat block layout was skipped.');
}

await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: ' + actor.name + ' boss kit</b><ul><li>' + report.join('</li><li>') + '</li></ul>'});
