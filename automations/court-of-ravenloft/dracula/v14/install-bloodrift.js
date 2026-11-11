// =====================================================================
//  BLOODRIFT, Foundry v14 (CAT) copy (Script macro, run as GM, Dracula selected).
//  Gives Dracula Bloodrift, the cursed
//  artifact sword that replaces the Blood Moon Blade. Safe to re-run: it updates
//  the Bloodrift already on the sheet (keeping its Blood Gauge and history).
//  The rules run in Nix Fix (scripts/court/bloodrift.mjs): forms, Blood Gauge,
//  Bloodlash, Red Mist, Ravenous Strikes, Bloodseeker / Hunted, Bloody Arc,
//  Unleashing the Madness, The Hunger Within, Death Wish. Trial by Blood is theater of the mind.
//  The Blood Moon Blade is unequipped and unattuned, not deleted.
//  v14 differences from the v13 copy: the Mastery effect is written the v14 way (system.changes
//  with type); otherwise the item, activities and runtime are the same on both versions.
// =====================================================================
const MOD = 'nix-module';
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return ui.notifications.warn('Bloodrift: no actor.');
const api = game.modules.get(MOD)?.api?.bloodrift;
if (!globalThis.cat?.utils) return ui.notifications.error('Bloodrift (v14): CAT is not active (on v13 use the v13 installer).');
if (!api) return ui.notifications.error('Bloodrift: Nix Fix\'s Bloodrift engine isn\'t running. Update Nix Fix and reload.');
const report = [];

const DESC = '<p><em>Weapon (sword), artifact (requires attunement, cursed). One of the Beauty &amp; Blood.</em></p>'
 + '<p><b>+3</b> to attack and damage rolls; it can use the wielder\'s spellcasting ability (Nix Fix uses the best of Str, Dex for finesse forms, and Cha). '
 + 'On a hit it deals extra <b>necrotic</b> damage equal to its current form\'s damage die (GM toggle: <i>Extra necrotic die: on/off</i>). Its necrotic ignores resistance and treats immunity as resistance.</p>'
 + '<p><b>Mastery of Bloodrift.</b> Proficiency with every form and its Weapon Mastery. <b>Bloodsight.</b> Within 60 ft the wielder perceives living creatures\' blood through cover and illusions. '
 + '<b>Death Wish.</b> Starting a turn at or below 20% HP grants one additional action that turn.</p>'
 + '<p><b>Blood Gauge</b> (this item\'s uses, max 100). Necrotic damage it deals to a living creature fills it. 30+: Longsword Form (back to Shortsword below 30). '
 + '70+: Bonus Action for Greatsword Form, 1 minute or until the Gauge is 0. Each form keeps the abilities of the earlier ones.</p>'
 + '<p><b>Shortsword Form</b>: 1d6 piercing, Finesse, Light, Vex; -3 Gauge at the start of each turn. <i>Bloodlash</i>: reaction attack against a creature that misses with a melee attack. '
 + '<i>Red Mist</i>: Bonus Action, spend 3/6/9 Gauge to teleport 15/30/45 ft. <i>Ravenous Strikes</i> (1/turn): a critical hit grants one more attack.</p>'
 + '<p><b>Longsword Form</b>: 1d8 slashing, Versatile (1d10), Sap; -5 Gauge at the start of each turn. <i>Bloodseeker</i>: each hit gives +1 to hit that creature (max +3); ends on a miss, '
 + 'on attacking another creature, or ending the turn without attacking it. <i>Hunted</i>: hitting a Bloodseeker target adds 1d4 necrotic per point of bonus.</p>'
 + '<p><b>Greatsword Form</b>: 2d6 slashing, Heavy, Two-Handed, Graze. The Gauge doesn\'t decay and can\'t be gained; each attack costs 5. Bloodseeker survives switching targets and Hunted uses d6s. '
 + '<i>Bloody Arc</i>: an Attack-action attack can hit every creature in reach with a separate roll each (spend 5 Gauge first for +5 ft reach). '
 + '<i>Unleashing the Madness</i>: Action, expend all Gauge: 30-ft cone, Dex save (DC 8 + PB + the attack ability), 1d10 slashing + 1d10 necrotic per 10 Gauge, half on a success; Greatsword Form ends.</p>'
 + '<p><b>The Hunger Within (curse).</b> At 50+ Gauge or in Greatsword Form, Wis save at the start of each turn (DC 10 + 1 per 10 Gauge) or be driven mad until the end of the turn: '
 + 'move toward and attack the nearest creature; if unable to attack, take necrotic damage equal to half the Gauge (none if immune to necrotic). <b>Ending Attunement.</b> Can\'t be willingly unattuned; '
 + 'only by being reduced to 0 HP while it is in Greatsword Form (affected by the curse meanwhile). Surviving ends attunement and it reverts to Shortsword Form; if the Gauge hits 0 first, '
 + 'the attempt fails and the wielder gains a level of Exhaustion.</p>';

const act = (id, type, data) => ({_id: id, type, ...data});
const red = ft => ({name: 'Red Mist: ' + ft + ' ft', activation: {type: 'bonus', value: 1}, range: {units: 'self'},
    consumption: {targets: [{type: 'itemUses', target: '', value: String(ft / 5)}]}, flags: {[MOD]: {bloodrift: 'redMist', feet: ft}}});
const activities = {
    nixBloodAttack00: act('nixBloodAttack00', 'attack', {name: 'Attack', activation: {type: 'action', value: 1},
        attack: {ability: '', bonus: '', flat: false, type: {value: 'melee', classification: 'weapon'}},
        damage: {includeBase: true, parts: [{number: 1, denomination: 6, types: ['necrotic']}]}, flags: {[MOD]: {bloodrift: 'attack'}}}),
    nixBloodRedMist1: act('nixBloodRedMist1', 'utility', red(15)),
    nixBloodRedMist2: act('nixBloodRedMist2', 'utility', red(30)),
    nixBloodRedMist3: act('nixBloodRedMist3', 'utility', red(45)),
    nixBloodGreatFrm: act('nixBloodGreatFrm', 'utility', {name: 'Greatsword Form', activation: {type: 'bonus', value: 1}, range: {units: 'self'},
        flags: {[MOD]: {bloodrift: 'great'}}}),
    nixBloodArc00000: act('nixBloodArc00000', 'utility', {name: 'Bloody Arc', activation: {type: 'action', value: 1}, range: {units: 'self'},
        flags: {[MOD]: {bloodrift: 'arc'}}}),
    nixBloodArcReach: act('nixBloodArcReach', 'utility', {name: 'Bloody Arc (+5 ft reach, 5 Gauge)', activation: {type: 'action', value: 1}, range: {units: 'self'},
        consumption: {targets: [{type: 'itemUses', target: '', value: '5'}]}, flags: {[MOD]: {bloodrift: 'arcReach'}}}),
    nixBloodUnleash0: act('nixBloodUnleash0', 'save', {name: 'Unleashing the Madness', activation: {type: 'action', value: 1}, range: {units: 'self'},
        target: {template: {type: 'cone', size: '30', units: 'ft'}, affects: {type: 'creature'}},
        save: {ability: ['dex'], dc: {calculation: '', formula: '8 + @prof + @abilities.cha.mod'}},
        damage: {onSave: 'half', parts: [{number: 1, denomination: 10, types: ['slashing']}, {number: 1, denomination: 10, types: ['necrotic']}]},
        flags: {[MOD]: {bloodrift: 'unleash'}}}),
    nixBloodGaugeSts: act('nixBloodGaugeSts', 'utility', {name: 'Blood Gauge', activation: {type: 'special'}, range: {units: 'self'},
        flags: {[MOD]: {bloodrift: 'status'}}}),
    nixBloodExtraTgl: act('nixBloodExtraTgl', 'utility', {name: 'Extra necrotic die: on/off (GM)', activation: {type: 'special'}, range: {units: 'self'},
        flags: {[MOD]: {bloodrift: 'extraToggle'}}})
};

const old = actor.items.find(i => i.flags?.[MOD]?.bloodrift);
const moon = actor.items.find(i => /blood moon blade/i.test(i.name));
const base = {
    name: 'Bloodrift (Shortsword Form)', type: 'weapon',
    img: old?.img ?? moon?.img ?? 'icons/weapons/swords/sword-guard-red.webp',
    system: {
        description: {value: DESC}, rarity: 'artifact', attunement: 'required', attuned: true, equipped: true, proficient: 1,
        magicalBonus: 3, type: {value: 'martialM', baseItem: 'shortsword'}, properties: ['fin', 'lgt', 'mgc'], mastery: 'vex',
        damage: {base: {number: 1, denomination: 6, types: ['piercing']}},
        range: {reach: null, units: 'ft'}, weight: {value: 2, units: 'lb'},
        uses: {max: '100', spent: 100, recovery: []},
        activities
    },
    flags: {[MOD]: {bloodrift: {great: false, seeker: {}, cursed: true}}}
};
let item;
if (old) {
    // Keep the Gauge, form and history; refresh rules text and activities.
    const keep = {spent: old.system.uses.spent};
    const stale = old.system.activities.filter(a => !(a.id in activities)).map(a => a.id);
    await old.update(Object.fromEntries(stale.map(id => ['system.activities.-=' + id, null])));
    await old.update({'system.description.value': DESC, 'system.activities': activities, 'system.uses.max': '100', 'system.uses.spent': keep.spent,
        'system.magicalBonus': 3, 'system.rarity': 'artifact', 'system.attunement': 'required', 'system.proficient': 1,
        ['flags.' + MOD + '.bloodrift.-=kills']: null, ['flags.' + MOD + '.bloodrift.-=hunger']: null});
    item = actor.items.get(old.id);
    report.push('Bloodrift updated (Blood Gauge kept at ' + api.gaugeOf(item) + ').');
} else {
    [item] = await actor.createEmbeddedDocuments('Item', [base]);
    report.push('Bloodrift added, equipped and attuned (Shortsword Form, Blood Gauge 0).');
}
// Mastery of Bloodrift: proficiency with all three forms' masteries.
const fx = item.effects.find(e => e.flags?.[MOD]?.bloodriftMastery);
const fxData = {name: 'Mastery of Bloodrift', img: item.img, transfer: true,
    description: 'Proficiency with every Bloodrift form and its Weapon Mastery. Bloodsight: perceives the blood of living creatures within 60 ft through cover and illusions.',
    system: {changes: ['shortsword', 'longsword', 'greatsword'].map(v => ({key: 'system.traits.weaponProf.mastery.value', type: 'add', value: v, priority: 20}))},
    flags: {[MOD]: {bloodriftMastery: true}}};
if (fx) await fx.update(fxData); else await item.createEmbeddedDocuments('ActiveEffect', [fxData]);
// Right form, ability and Unleashing DC for the current Gauge.
await api.mutate(item, {force: true});
const now = actor.items.get(item.id);
report.push('Extra necrotic die: ' + (api.extraDieOn?.(now.flags[MOD].bloodrift) === false ? 'OFF' : 'on') + ' (toggle activity on the item).');
report.push('Attacks use ' + api.bestAbility(actor, api.formOf(now.flags[MOD].bloodrift, api.gaugeOf(now))).toUpperCase() + ' (best of Str/Dex/Cha) +3.');

if (moon && (moon.system.equipped || moon.system.attuned)) {
    await moon.update({'system.equipped': false, 'system.attuned': false});
    report.push(moon.name + ': unequipped and unattuned (still in his inventory; delete it when you\'re happy).');
}
const attuned = actor.items.filter(i => i.system.attuned).length;
const max = actor.system.attributes.attunement?.max ?? 3;
if (attuned > max) report.push('<b>Attunement:</b> ' + attuned + ' of ' + max + ' slots used.');

await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: Bloodrift for ' + actor.name + '</b><ul><li>' + report.join('</li><li>') + '</li></ul>'});
