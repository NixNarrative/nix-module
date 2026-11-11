// =====================================================================
//  DRACULA: BOSS KIT, Foundry v14 (CAT) copy (Script macro, run as GM, Dracula selected).
//  Run after the Illrigger engine (v14). Safe to re-run. The same boss as the v13 kit:
//   - Baleful Interdict: no seal count. Seals come from his once-per-turn hit /
//     Bonus Action placement and from Legendary Actions.
//   - Legendary Actions (4, 5 in his lair, regained at the start of his turn): Seal (1),
//     Strike (2), By the Throat (2), Devour (2, on Infernal Conduit). Telekinetic Seal:
//     reaction, costs 1. Lair (toggle) marks the current scene as his lair.
//   - Regeneration: 20 HP at the start of his turn unless he took 15+ radiant damage.
//   - Infernal Conduit: Devour is his vampire bite (Bonus Action, or Legendary Action 2),
//     spends Conduit d10s; Heal is hidden.
//   - Infernal Ascension (mythic phase, once per long rest): at 0 HP he rises at full HP,
//     Infernal Majesty turns on and Master of Hell: Darkness erupts. Mythic Action:
//     Hellfire Detonation (2) burns every seal he has within 30 ft.
//   - Blood Price + Legendary Resistance in one prompt on a failed save. Legendary
//     Resistance bleeds (spell level / 2, rounded down)d10: 1st 0, 2nd 1d10, 4th 2d10, 7th 3d10.
//   - Invoke Hell (Grand Strategist, Punishment), You Die on My Command! and Devastator: 1/day each.
//   - Combat Mastery: Inexorable is a plain passive (save bonus), no activities.
//   - Dispater's Interdiction split into Telekinetic Seal, By the Throat and Dispater's
//     Supremacy (crits on 18-20 vs sealed creatures).
//   - Terrorizing Force: Necrotic (1d8, 2d8 in Infernal Majesty).
//   - Master of Hell: Inferno gets its Dex save. Feral Instinct renamed (advantage on initiative).
//
//  What's different from the v13 kit:
//   - Chris's Premades 2 has no Illrigger compendium. Telekinetic Seal, By the Throat,
//     Dispater's Supremacy, Grand Strategist and Punishment are built here from Chris's
//     Premades 1.5.51's item data and wired to Nix Fix's v14 Illrigger features
//     (flags.cat.macros). The D&D Beyond "Dispater's Interdiction" bundle is removed, as on v13.
//   - Blood Price + Legendary Resistance: Nix Fix's bloodPriceLegendary function macro on the
//     Legendary Resistance item (no pasted code). Blood Price's own macro steps aside for it.
//   - Every activity that spent a seal stops spending one (his seals have no count), not
//     only the boon items: the Interdict Boons bundle's activities too.
//   - Effects in v14 form (system.changes with type). Heal is hidden as a dnd5e rider.
//   - On an NPC stat block (tool "Make stat block", 1.7.0): native pips, Legendary Actions section.
// =====================================================================
const MOD = 'nix-module';
const F = game.modules.get(MOD)?.api?.illriggerFeatures;
if (!globalThis.cat?.utils) return ui.notifications.error('Dracula boss kit (v14): CAT is not active.');
if (!F?.refFor?.('bloodPriceLegendary')) return ui.notifications.error('Dracula boss kit (v14): Nix Fix is too old (no bloodPriceLegendary). Update it and reload.');
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return ui.notifications.warn('Dracula boss kit: no actor.');
const cfg = actor.flags?.[MOD]?.illrigger;
if (!cfg || cfg.engine !== 'cat') return ui.notifications.warn('Dracula boss kit: apply the Illrigger engine (v14) first.');
const report = [];
const ident = d => d?.flags?.['chris-premades']?.info?.identifier ?? d?.flags?.[MOD]?.identifier ?? d?.flags?.cat?.identifier;
const find = (id, re) => actor.items.find(i => id && ident(i) === id) ?? actor.items.find(i => re.test(i.name));
const actByIdent = (item, id) => { const k = item?.flags?.['chris-premades']?.activityIdentifiers?.[id]; return (k && item.system.activities.get(k)) || item?.system.activities.find(a => a.identifier === id); };
const act = (id, type, data) => ({_id: id, type, ...data});
const plain = t => (typeof t?.toObject === 'function' ? t.toObject() : foundry.utils.deepClone(t));

// Function-macro references (flags.cat.macros), merged without duplicates.
function withRef(doc, identifier) {
    const ref = F.refFor(identifier);
    if (!ref) throw new Error('No Nix Fix macro ' + identifier);
    const cur = foundry.utils.deepClone(doc?.flags?.cat?.macros ?? {});
    for (const [type, list] of Object.entries(ref)) cur[type] = (cur[type] ?? []).filter(r => !(r.source === MOD && r.identifier === identifier)).concat(list);
    return cur;
}
// Create the item, or update the one already there (type left out of updates).
async function ensureItem(data, match) {
    const it = actor.items.find(match);
    if (it) {
        const {type, ...upd} = data;
        await it.update(upd);
        return actor.items.get(it.id);
    }
    const [made] = await actor.createEmbeddedDocuments('Item', [data]);
    return made;
}
async function retarget(item, fn) {
    if (!item) return;
    const upd = {};
    for (const a of item.system.activities) {
        const t = (a.consumption?.targets ?? []).map(plain);
        const next = fn(a, t.map(x => ({...x})));
        if (JSON.stringify(next) !== JSON.stringify(t)) upd['system.activities.' + a.id + '.consumption.targets'] = next;
    }
    if (!Object.keys(upd).length) return false;
    await item.update(upd);
    return true;
}

const prevBoss = actor.flags?.[MOD]?.boss ?? {};
const sceneNow = game.combat?.scene ?? canvas.scene;
const la0Max = () => sceneNow && (prevBoss.lairScenes ?? []).includes(sceneNow.id) ? 5 : 4;

// ---- 1. Legendary Actions ---------------------------------------------------------------
const la = await ensureItem({
    name: 'Legendary Actions', type: 'feat', img: 'icons/magic/unholy/hand-claw-glow-orange.webp',
    system: {
        description: {value: '<p>Dracula can take 4 Legendary Actions (5 in his lair), one at a time, immediately after another creature\'s turn. He regains them at the start of his turn.</p>'
            + '<ul><li><b>Seal (1).</b> A Baleful Interdict seal on a creature within 30 ft.</li><li><b>Strike (2).</b> One attack with his weapon.</li>'
            + '<li><b>By the Throat (2).</b> A seal, then Dispater\'s By the Throat (Wis save or restrained).</li>'
            + '<li><b>Devour (2).</b> His vampire bite: Infernal Conduit\'s <i>Devour (Legendary, 2)</i> activity.</li></ul>'
            + '<p>Reaction: Telekinetic Seal costs 1. During Infernal Ascension: Hellfire Detonation (2).</p>'
            + '<p><b>Lair (toggle).</b> Marks the scene you\'re on as his lair (or unmarks it). In a lair scene he has 5 Legendary Actions.</p>'
            + '<p><b>Regeneration.</b> At the start of his turn he regains 20 hit points if he has at least 1, unless he took 15 or more radiant damage since the start of his last turn.</p>'},
        type: {value: 'monster', subtype: ''},
        uses: {max: String(la0Max()), spent: 0, recovery: [{period: 'turnStart', type: 'recoverAll'}]},
        activities: {
            nixLegendSeal000: act('nixLegendSeal000', 'utility', {name: 'Seal (1)', activation: {type: 'special', value: 1}, range: {value: '30', units: 'ft'},
                target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '1'}]}, flags: {[MOD]: {boss: 'seal'}}}),
            nixLegendStrike0: act('nixLegendStrike0', 'utility', {name: 'Strike (2)', activation: {type: 'special', value: 2}, range: {units: 'self'},
                target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {boss: 'strike'}}}),
            nixLegendThroat0: act('nixLegendThroat0', 'utility', {name: 'By the Throat (2)', activation: {type: 'special', value: 2}, range: {value: '30', units: 'ft'},
                target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {boss: 'throat'}}}),
            nixLegendLair000: act('nixLegendLair000', 'utility', {name: 'Lair (toggle this scene)', activation: {type: 'special', value: null}, range: {units: 'self'},
                consumption: {targets: []}, flags: {[MOD]: {boss: 'lair'}}})
        }
    },
    flags: {[MOD]: {legendary: true}}
}, i => i.flags?.[MOD]?.legendary || /^legendary actions$/i.test(i.name));
report.push('Legendary Actions: 4 (5 in his lair), back at the start of his turn. Seal (1), Strike (2), By the Throat (2), Devour (2, on Infernal Conduit). '
    + 'Use <i>Lair (toggle this scene)</i> on his lair scenes.');

// ---- 2. Infernal Ascension (mythic phase) ----------------------------------------------
await ensureItem({
    name: 'Infernal Ascension (Mythic)', type: 'feat', img: 'icons/magic/unholy/silhouette-evil-horned-giant.webp',
    system: {
        description: {value: '<p><b>Once per long rest.</b> When Dracula drops to 0 hit points, he stays at 1, then rises at full hit points. '
            + 'Infernal Majesty turns on (no Bonus Action), Master of Hell: Darkness erupts (no use spent) and his Legendary Actions refill.</p>'
            + '<p><b>Mythic Action: Hellfire Detonation (2 Legendary Actions).</b> Every seal he has on creatures within 30 ft burns (necrotic), no reaction needed.</p>'},
        type: {value: 'monster', subtype: ''},
        activities: {
            nixMythicDeton00: act('nixMythicDeton00', 'utility', {name: 'Hellfire Detonation (2)', activation: {type: 'special', value: 2}, range: {units: 'self'},
                consumption: {targets: [{type: 'itemUses', target: la.id, value: '2'}]}, flags: {[MOD]: {boss: 'detonate'}}})
        }
    },
    flags: {[MOD]: {mythic: true}}
}, i => i.flags?.[MOD]?.mythic);
report.push('Infernal Ascension: at 0 HP (once per long rest) he rises at full HP with Infernal Majesty + Master of Hell: Darkness. Mythic Action: Hellfire Detonation (2).');

// ---- 3. Legendary Resistance (Blood Price): the combined prompt -------------------------
const lrMatch = i => i.flags?.[MOD]?.legendaryResistance;
const lrOld = actor.items.find(lrMatch);
await ensureItem({
    name: 'Legendary Resistance (Blood Price)', type: 'feat', img: 'icons/magic/life/heart-cross-strong-flame-purple-orange.webp',
    system: {
        description: {value: '<p>3/day. When Dracula fails a saving throw he can succeed instead. Against a spell he bleeds d10s equal to half the spell\'s level, rounded down '
            + '(1st: none, 2nd-3rd: 1d10, 4th-5th: 2d10, 6th-7th: 3d10, 8th-9th: 4d10). With no spell level (not a spell, or the source can\'t be read) he doesn\'t bleed. '
            + 'In Infernal Majesty the blood also hits the nearest enemy within 10 ft. Asked together with Blood Price on the same prompt.</p>'},
        type: {value: 'monster', subtype: ''},
        uses: {max: '3', spent: (actor.type === 'npc' && actor.system.resources?.legres?.max ? actor.system.resources.legres.spent : lrOld?.system.uses?.spent) ?? 0, recovery: [{period: 'lr', type: 'recoverAll'}]}
    },
    flags: {[MOD]: {legendaryResistance: true, bloodPriceLegendary: true, identifier: 'legendaryResistanceBloodPrice'}, cat: {macros: withRef(lrOld, 'bloodPriceLegendary')}}
}, lrMatch);
const bp = find('bloodPrice', /^blood price$/i);
report.push('Blood Price + Legendary Resistance: one prompt on a failed save: ' + (bp ? 'spend a Hit Die (+1d10), ' : '')
    + 'Legendary Resistance (3/day: succeed, bleed (spell level / 2)d10, none for 1st level or non-spells), or accept.'
    + (bp ? '' : ' <b>No Blood Price on the sheet</b>: the Hit Die option is left out.'));

// ---- 4. Dispater's Interdiction and Invoke Hell: built here (Chris's Premades 1.5.51's items) --
const bi = actor.items.filter(i => ident(i) === 'balefulInterdict' || /^baleful interdict$/i.test(i.name.trim()))[0];
const ib = find('interdictBoons', /^interdict boons$/i);
const IMG_DI = 'icons/skills/targeting/crosshair-triple-strike-orange.webp';
const IMG_IH = 'icons/magic/unholy/silhouette-evil-horned-giant.webp';
const ibCost = ib ? [{type: 'itemUses', target: ib.id, value: '1'}] : [];
const onceADay = {max: '1', spent: 0, recovery: [{period: 'lr', type: 'recoverAll'}]};
const saveWis = {ability: ['wis'], dc: {calculation: 'cha', formula: ''}};
const oneCreature = {affects: {count: '1', type: 'creature', choice: false, special: ''}, template: {type: '', units: 'ft'}, prompt: true};
const emanation = CONFIG.DND5E?.areaTargetTypes?.emanationNoTemplate ? {type: 'emanationNoTemplate', size: '60', units: 'ft'} : {type: '', units: 'ft'};
const tkSeal = name => ({name, activation: {type: 'reaction', value: 1, condition: ''}, range: {value: '5', units: 'ft'}, target: oneCreature,
    duration: {units: 'inst'}, save: saveWis, damage: {onSave: 'half', parts: []}, effects: [], useConditionText: 'false',
    consumption: {spellSlot: false, targets: [...ibCost, {type: 'itemUses', target: la.id, value: '1'}]}});
const BUILT = [
    {id: 'telekineticSeal', name: 'Dispater\'s Interdiction: Telekinetic Seal', img: IMG_DI,
        desc: '<p><b>Reaction</b> (1 Legendary Action and his Interdict Boon for the turn). A creature within 5 ft makes a Wisdom save (DC 8 + PB + Cha). '
            + 'On a failure he pushes it up to 15 ft away, or knocks it prone (one activity each).</p>',
        activities: {nixTeleSealPush0: act('nixTeleSealPush0', 'save', {...tkSeal('Telekinetic Seal: Push 15 ft'), identifier: 'push'}),
            nixTeleSealProne: act('nixTeleSealProne', 'save', {...tkSeal('Telekinetic Seal: Knock Prone'), identifier: 'prone'})},
        refs: {activity: {nixTeleSealPush0: 'telekineticSeal', nixTeleSealProne: 'telekineticSeal'}}},
    {id: 'byTheThroat', name: 'Dispater\'s Interdiction: By the Throat', img: IMG_DI,
        desc: '<p>When he places a seal (his Interdict Boon for the turn): the creature makes a Wisdom save (DC 8 + PB + Cha) or is restrained for 2 rounds. '
            + 'Offered as a boon when he places a seal; also his <i>By the Throat (2)</i> Legendary Action.</p>',
        activities: {nixByTheThroat00: act('nixByTheThroat00', 'save', {name: 'By the Throat', identifier: 'use', activation: {type: 'special', value: null, condition: ''},
            range: {units: 'spec'}, target: oneCreature, duration: {value: '2', units: 'round'}, save: saveWis, damage: {onSave: 'half', parts: []},
            effects: [{_id: 'nixByTheThroatFx', onSave: false}], consumption: {spellSlot: false, targets: ibCost}})},
        effects: [{_id: 'nixByTheThroatFx', name: 'Dispater\'s Interdiction: By the Throat', img: IMG_DI, transfer: false, statuses: ['restrained'], system: {changes: []}}]},
    {id: 'dispatersSupremacy', name: 'Dispater\'s Interdiction: Dispater\'s Supremacy (Passive)', img: IMG_DI,
        desc: '<p>His attacks score a critical hit on 18-20 against a creature that carries one of his seals.</p>',
        activities: {},
        effects: [{_id: 'nixSupremacyFx00', name: 'Dispater\'s Interdiction: Dispater\'s Supremacy', img: IMG_DI, transfer: false,
            system: {changes: [{key: 'flags.midi-qol.grants.criticalThreshold', type: 'override', value: '18', priority: 20}]}, flags: {dae: {dontApply: true}}}],
        refs: {item: 'dispatersSupremacy'}},
    {id: 'grandStrategist', name: 'Invoke Hell: Grand Strategist', img: IMG_IH, uses: onceADay,
        desc: '<p><b>Action, 1/day.</b> Allies within 60 ft don\'t provoke opportunity attacks until the start of his next turn.</p>',
        activities: {nixGrandStrateg0: act('nixGrandStrateg0', 'utility', {name: 'Grand Strategist', identifier: 'use', activation: {type: 'action', value: 1, condition: ''},
            range: {value: '60', units: 'ft'}, target: {affects: {type: 'ally', count: '', choice: false, special: ''}, template: emanation, prompt: true},
            duration: {value: '1', units: 'turn'}, effects: [{_id: 'nixGrandStratFx0'}], consumption: {spellSlot: false, targets: [{type: 'itemUses', target: '', value: '1'}]}})},
        effects: [{_id: 'nixGrandStratFx0', name: 'Invoke Hell: Grand Strategist', img: IMG_IH, transfer: false,
            system: {changes: [{key: 'flags.gambits-premades.oaImmunity', type: 'override', value: '1', priority: 20}]}}]},
    {id: 'punishment', name: 'Invoke Hell: Punishment', img: IMG_IH, uses: onceADay,
        desc: '<p><b>Reaction, 1/day.</b> When a creature hits him and deals damage, it makes a Wisdom save (DC 8 + PB + Cha) and takes necrotic damage equal to that damage, half on a success. '
            + 'Nix Fix asks when it applies.</p>',
        activities: {nixPunishment000: act('nixPunishment000', 'save', {name: 'Punishment', identifier: 'use', activation: {type: 'reaction', value: 1, condition: ''},
            range: {units: 'any'}, target: oneCreature, duration: {units: 'inst'}, save: saveWis, useConditionText: 'false',
            damage: {onSave: 'half', parts: [{number: null, denomination: null, bonus: '0', types: ['necrotic'], custom: {enabled: false, formula: ''}}]},
            effects: [], consumption: {spellSlot: false, targets: [{type: 'itemUses', target: '', value: '1'}]}})},
        refs: {item: 'punishment'}}
];
const built = [];
for (const b of BUILT) {
    const match = i => ident(i) === b.id || i.name === b.name;
    const old = actor.items.find(match);
    const data = {name: b.name, type: 'feat', img: b.img,
        system: {description: {value: b.desc}, type: {value: 'class', subtype: ''}, uses: b.uses ? {...b.uses, spent: old?.system.uses?.spent ?? 0} : {max: '', spent: 0, recovery: []},
            activities: foundry.utils.deepClone(b.activities)},
        flags: {[MOD]: {identifier: b.id, builtBy: 'draculaBossKit'}}};
    if (!Object.keys(b.activities).length) delete data.system.activities;
    if (b.refs?.item) data.flags.cat = {macros: withRef(old, b.refs.item)};
    for (const [aid, rid] of Object.entries(b.refs?.activity ?? {})) data.system.activities[aid].flags = {cat: {macros: withRef(old?.system.activities.get(aid), rid)}};
    const it = await ensureItem(data, match);
    // Effects: replace ours (fixed ids), keep any the GM added.
    const ours = (b.effects ?? []).map(e => e._id);
    const stale = it.effects.filter(e => ours.includes(e.id)).map(e => e.id);
    if (stale.length) await it.deleteEmbeddedDocuments('ActiveEffect', stale);
    if (b.effects?.length) await it.createEmbeddedDocuments('ActiveEffect', foundry.utils.deepClone(b.effects), {keepId: true});
    // Activities of an earlier build that aren't ours any more.
    const gone = it.system.activities.filter(a => !(a.id in b.activities)).map(a => a.id);
    if (gone.length) await it.update(Object.fromEntries(gone.map(id => ['system.activities.-=' + id, null])));
    built.push(b.name.replace(/^(Dispater's Interdiction|Invoke Hell): /, ''));
}
report.push('Built (Chris\'s Premades 1.5.51 items, Nix Fix macros): ' + built.join(', ') + '.');
// D&D Beyond bundle: its activities point at an effect it doesn't have, and it would duplicate the above.
const bundles = actor.items.filter(i => !ident(i) && /^dispater'?s interdiction$/i.test(i.name.trim()));
if (bundles.length) {
    await actor.deleteEmbeddedDocuments('Item', bundles.map(i => i.id));
    report.push('Removed the D&D Beyond bundle: ' + bundles.map(i => i.name).join(', ') + '.');
}

// ---- 5. Baleful Interdict: no seal count; nothing spends seals --------------------------
if (bi) {
    await bi.update({'system.uses.max': '', 'system.uses.spent': 0});
    await retarget(bi, (a, t) => t.filter(x => !(x.type === 'itemUses' && (!x.target || x.target === bi.id))));
    let n = 0;
    for (const it of actor.items) {
        if (it.id === bi.id || !it.system.activities?.size) continue;
        if (await retarget(it, (a, t) => t.filter(x => !(x.type === 'itemUses' && x.target === bi.id)))) n++;
    }
    report.push('Baleful Interdict: no seal count (hit / Bonus Action placement once per turn, more with Legendary Actions).'
        + (n ? ' ' + n + ' other item' + (n > 1 ? 's' : '') + ' no longer spend seals.' : ''));
} else report.push('<b>Baleful Interdict not found.</b>');
report.push('Telekinetic Seal (reaction) costs 1 Legendary Action.');

// ---- 6. Once per day: Invoke Hell options, You Die on My Command!, Devastator -----------
for (const [id, re] of [['grandStrategist', /grand strategist/i], ['punishment', /^invoke hell: punishment/i], ['youDieOnMyCommand', /you die on my command/i], ['devastator', /^devastator/i]]) {
    const it = find(id, re);
    if (!it) { report.push('<b>' + re.source + '</b> not found.'); continue; }
    await it.update({'system.uses': {...onceADay, spent: Math.min(1, it.system.uses?.spent ?? 0)}});
    await retarget(it, () => [{type: 'itemUses', target: '', value: '1'}]);
}
report.push('Grand Strategist, Punishment, You Die on My Command! and Devastator: 1/day each, no shared Invoke Hell use.');

// ---- 7. Terrorizing Force: Necrotic --------------------------------------------------------
const tfs = actor.items.filter(i => ident(i) === 'terrorizingForce' || /^terrorizing force/i.test(i.name));
for (const tf of tfs) {
    await tf.update({'flags.cat.macros': withRef(tf, 'terrorizingForce'), ['flags.' + MOD + '.identifier']: 'terrorizingForce',
        ['flags.' + MOD + '.terrorizingForce.damageType']: 'necrotic'});
    for (const e of tf.effects) if (e.transfer && !e.disabled && (e.system?.changes ?? []).some(c => /bonuses\.(mwak|rwak)\.damage/.test(c.key))) await e.update({disabled: true});
}
if (tfs.length) report.push('Terrorizing Force: +1d8 necrotic on every weapon hit (melee and ranged), 2d8 in Infernal Majesty. D&D Beyond\'s melee-only effect off.');
else report.push('<b>Terrorizing Force not found.</b>');

// ---- 8. Master of Hell: Inferno save -----------------------------------------------------
const moh = actor.items.find(i => /^master of hell/i.test(i.name));
const inferno = moh?.system.activities.find(a => /inferno/i.test(a.name ?? ''));
const nAbil = a => a?.save?.ability?.size ?? a?.save?.ability?.length ?? 0;
if (inferno && inferno.type === 'save' && !nAbil(inferno)) {
    await moh.update({['system.activities.' + inferno.id + '.save']: {ability: ['dex'], dc: {calculation: 'cha', formula: ''}}});
    report.push('Master of Hell: Inferno now asks for a Dexterity save (DC 8 + PB + Cha).');
}

// ---- 9. Feral Instinct ---------------------------------------------------------------------
const feral = actor.items.find(i => /^feral instinct/i.test(i.name));
if (feral) {
    if (/\(copy\)/i.test(feral.name)) await feral.update({name: 'Feral Instinct'});
    const hasAdv = feral.effects.some(e => e.transfer && (e.system?.changes ?? []).some(c => c.key === 'flags.dnd5e.initiativeAdv' || (c.key === 'system.attributes.init.roll.mode' && Number(c.value) > 0)));
    if (!hasAdv) await feral.createEmbeddedDocuments('ActiveEffect', [{name: 'Feral Instinct', img: feral.img, transfer: true,
        system: {changes: [{key: 'system.attributes.init.roll.mode', type: 'add', value: '1', priority: 20}]}}]);
    report.push('Feral Instinct: renamed; advantage on initiative.');
}

// ---- 10. Infernal Conduit: Devour = his vampire bite (Bonus Action / Legendary Action 2) ----
const conduit = find('infernalConduit', /^infernal conduit$/i);
if (conduit) {
    const devour = actByIdent(conduit, 'necrotic') ?? conduit.system.activities.find(a => a.id !== 'nixDevourLegend0' && /harm|devour/i.test(a.name ?? ''));
    const heal = actByIdent(conduit, 'healing') ?? conduit.system.activities.find(a => /heal|invigorate/i.test(a.name ?? ''));
    const wired = devour && (devour.flags?.cat?.macros?.roll ?? []).some(r => r.source === MOD && r.identifier === 'infernalConduit');
    if (!devour || !wired) report.push('<b>Infernal Conduit</b> isn\'t wired by the Illrigger engine (v14): run that first, then re-run this.');
    else {
        const upd = {};
        upd['system.activities.' + devour.id + '.name'] = 'Devour (Vampire Bite)';
        upd['system.activities.' + devour.id + '.activation'] = {type: 'bonus', value: 1, override: false, condition: ''};
        upd['system.activities.' + devour.id + '.range'] = {units: 'touch', override: false, special: ''};
        // Legendary copy: same save, dice and Nix Fix macro (he heals the necrotic dealt), 2 Legendary Actions.
        const dv = devour.toObject();
        delete dv.uuid; delete dv.id;
        upd['system.activities.nixDevourLegend0'] = {...dv, _id: 'nixDevourLegend0', name: 'Devour (Legendary, 2)', identifier: 'devourLegendary',
            activation: {type: 'legendary', value: 2, override: false, condition: ''},
            range: {units: 'touch', override: false, special: ''},
            consumption: {scaling: {allowed: true, max: '@item.uses.value'}, spellSlot: false,
                targets: [{type: 'itemUses', target: '', value: '@scaling', scaling: {mode: '', formula: ''}}, {type: 'itemUses', target: la.id, value: '2', scaling: {mode: '', formula: ''}}]},
            damage: {...dv.damage, onSave: 'half', parts: [{custom: {enabled: true, formula: '(@scaling)d10'}, number: null, denomination: null, bonus: '', types: ['necrotic'], scaling: {mode: '', number: null, formula: ''}}]},
            flags: {...(dv.flags ?? {}), cat: {...(dv.flags?.cat ?? {}), macros: withRef(devour, 'infernalConduit')}, [MOD]: {boss: 'devourLegend'}}};
        if (heal) upd['flags.dnd5e.riders.activity'] = Array.from(new Set([...(conduit.flags?.dnd5e?.riders?.activity ?? []), heal.id]));
        await conduit.update(upd);
        const now = actor.items.get(conduit.id);
        report.push('Infernal Conduit (' + (now.system.uses?.max ? now.system.uses.value + '/' + now.system.uses.max : '?') + ' d10s, back on a long rest): '
            + '<i>Devour (Vampire Bite)</i> is a Bonus Action, <i>Devour (Legendary, 2)</i> spends 2 Legendary Actions. Choose how many d10s in the usage window; '
            + 'Con save for half, he heals the necrotic dealt.' + (heal ? ' Heal hidden (a dnd5e rider; remove it from flags.dnd5e.riders to bring it back).' : ''));
    }
} else report.push('<b>Infernal Conduit not found.</b>');

// ---- 11. Combat Mastery: Inexorable: a plain passive -------------------------------------
const inex = find('combatMasteryInexorable', /inexorable/i);
if (inex) {
    const upd = {'flags.cat.macros': withRef(inex, 'combatMasteryInexorable'), ['flags.' + MOD + '.identifier']: 'combatMasteryInexorable',
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
// NPC stat block (tool "Make stat block"): native Legendary Action / Resistance pips, each
// Legendary Action in the Legendary Actions section, Hellfire Detonation under Mythic Actions.
if (actor.type === 'npc') {
    const sb = game.modules.get(MOD)?.api?.statBlock;
    if (sb?.npcLegendary) report.push(...await sb.npcLegendary(actor));
    else report.push('<b>NPC:</b> Nix Fix\'s stat block runtime isn\'t running, so the stat block layout was skipped (update Nix Fix and reload).');
}
if (!game.modules.get(MOD)?.api?.boss) report.push('<b>Nix Fix\'s boss runtime isn\'t running</b> (Legendary Actions, Regeneration, Infernal Ascension need it): update Nix Fix and reload.');

await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: ' + actor.name + ' boss kit (v14)</b><ul><li>' + report.join('</li><li>') + '</li></ul>'});
