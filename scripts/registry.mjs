// =====================================================================
//  NIX FIX: automation registry
//  Every automation file the module ships, which campaign uses it, who it
//  runs on, and in what order. To add a new automation: drop the file in
//  automations/<campaign>/<character>/ and add one entry here.
//
//  kind:
//    world      World installer. Runs with nothing selected.
//    setup      Per-character setup script (run before that character's installer).
//    character  Per-character installer.
//    embedded   An embedded macro the module writes onto an item/activity for you
//               (replaces "open the Medkit and paste").
//    levelup    Only when the character reaches that level (manual).
//    tool       Read-only diagnostic (manual).
//  actors:  names of the characters it runs on (matched by the CHARACTERS table).
//  manual:  never part of "Apply all".
//
//  Foundry v14 (Chris's Premades 2 / CAT engine):
//    v14: {file, target?}  The v14 copy of this automation. Entries without it
//                          show "Not ported to v14 yet" on a v14 world and never run there.
//    v14.target            For embedded entries: CAT {event, pass, priority}. Item,
//                          activity, name and marker come from `target`.
//    v14: {retired: '...'} Chris's Premades 2 does this itself on v14. Shown as
//                          "Retired on v14" with the reason; never runs there.
//  v14 copies live next to the v13 ones in a v14/ folder.
// =====================================================================
 
export const CAMPAIGNS = {
    'fools-journey': "The Fool's Journey",
    'journey-to-the-east': 'Journey to the East',
    'espalian-escapades': 'Espalian Escapades',
    'court-of-ravenloft': 'Court of Ravenloft'
};
 
// How each character's actor is recognised. First pattern is the preferred name.
// Actors named "(old)", "(copy)", "(updated)" etc. are ranked last.
export const CHARACTERS = {
    bangiras: {name: 'Bangiras', campaign: 'fools-journey', match: [/^bangiras\b/i]},
    nethtari: {name: 'Nethtari', campaign: 'fools-journey', match: [/^nethtari\b/i]},
    quez: {name: 'Quez', campaign: 'fools-journey', match: [/^quez\b/i]},
    westly: {name: 'Westly', campaign: 'fools-journey', match: [/^westly\b/i]},
    earwyn: {name: 'Earwyn', campaign: 'fools-journey', match: [/^earwyn\b/i]},
    vina: {name: 'Vina', campaign: 'fools-journey', match: [/^vina\b/i]},
    nox: {name: 'Nox', campaign: 'journey-to-the-east', match: [/^nox\b/i]},
    akira: {name: 'Akira', campaign: 'journey-to-the-east', match: [/^akira\b/i]},
    cordelia: {name: 'Cordelia', campaign: 'journey-to-the-east', match: [/^cordelia\b/i]},
    tsuki: {name: 'Tsuki', campaign: 'journey-to-the-east', match: [/^tsuki\b/i]},
    peri: {name: 'Peri', campaign: 'journey-to-the-east', match: [/^perr?itwinkle\b/i, /^peri\b/i]},
    silkie: {name: 'Silkie', campaign: 'espalian-escapades', match: [/^silkie\b/i]},
    silentSilk: {name: 'Silent Silk', campaign: 'espalian-escapades', match: [/^silent silk\b/i]},
    hellsing: {name: 'Hellsing Elbur', campaign: 'espalian-escapades', match: [/^hellsing\b/i, /\bhellsing\b/i]},
    lyric: {name: 'Lyric', campaign: 'espalian-escapades', match: [/^lyric\b/i, /^michela\b/i]},
    petra: {name: 'Petra', campaign: 'court-of-ravenloft', match: [/^petra\b/i]},
    sydmore: {name: 'Sydmore', campaign: 'court-of-ravenloft', match: [/^sydmore\b(?!.*\bboss\b)/i]},
    'sydmore-boss': {name: 'Sydmore (Boss)', campaign: 'court-of-ravenloft', match: [/^sydmore\b.*\bboss\b/i]},
    dayus: {name: 'Dayus Manroe', campaign: 'court-of-ravenloft', match: [/^dayus\b(?!.*\bboss\b)/i]},
    'dayus-boss': {name: 'Dayus Manroe (Boss)', campaign: 'court-of-ravenloft', match: [/^dayus\b.*\bboss\b/i]},
    dracula: {name: 'Dracula', campaign: 'court-of-ravenloft', match: [/^dracula\b/i]},
    lucian: {name: 'Lucian', campaign: 'court-of-ravenloft', match: [/^lucian\b(?!.*\bboss\b)/i]},
    'lucian-boss': {name: 'Lucian (Boss)', campaign: 'court-of-ravenloft', match: [/^lucian\b.*\bboss\b/i]},
    valintina: {name: 'Valintina', campaign: 'court-of-ravenloft', match: [/^valintina\b(?!.*\bboss\b)/i, /^valentina\b(?!.*\bboss\b)/i]},
    'valintina-boss': {name: 'Valintina (Boss)', campaign: 'court-of-ravenloft', match: [/^valintina\b.*\bboss\b/i, /^valentina\b.*\bboss\b/i]},
    octavian: {name: 'Father Octavian', campaign: 'court-of-ravenloft', match: [/^father\s+octavian\b/i, /^octavian\b/i]},
    zadimus: {name: 'Zadimus', campaign: 'court-of-ravenloft', match: [/^zadimus\b/i]},
    juggernaut: {name: 'Juggernaut', campaign: 'court-of-ravenloft', match: [/^juggernaut\b/i]}
};
 
const FJ = 'fools-journey', JTE = 'journey-to-the-east', EE = 'espalian-escapades', CR = 'court-of-ravenloft';
const cr = f => 'court-of-ravenloft/' + f;
const fj = f => 'fools-journey/' + f;
const jte = f => 'journey-to-the-east/' + f;
 
export const ENTRIES = [
    // ---------------- World installers (shared between campaigns) ----------------
    {id: 'counterspell', title: 'Counterspell (Spell Duel + Subtle)', kind: 'world', file: fj('world/install-counterspell.js'), campaigns: [FJ, JTE, CR], order: 10,
        v14: {file: fj('world/v14/install-counterspell.js')},
        does: 'Spell Duel Counterspell on every Counterspell in the world; Subtle Spell casts cannot be countered. Turn OFF Gambit\'s Counterspell.'},
    {id: 'eldritch-blast', title: 'Eldritch Blast beam windows', kind: 'world', file: fj('world/install-eldritch-blast.js'), campaigns: [FJ, CR], order: 11,
        v14: {file: fj('world/v14/install-eldritch-blast.js')},
        does: 'One dice window per beam for every Eldritch Blast caster. (v14: re-run after re-applying Eldritch Blast in the Medkit.)'},
    {id: 'darkness-vision', title: 'Darkness & Devil\'s Sight', kind: 'world', file: fj('world/install-darkness-vision.js'), campaigns: [FJ, JTE, CR], order: 12,
        v14: {file: fj('world/v14/install-darkness-vision.js')},
        does: 'Devil\'s Sight / shadow features see through magical darkness; Darkness blinds those who can\'t. Needs Vision 5e.'},
    {id: 'daylight-dispel', title: 'Daylight / Dawn dispel', kind: 'world', file: fj('world/install-daylight-dispel.js'), campaigns: [FJ, JTE], order: 13,
        v14: {file: fj('world/v14/install-daylight-dispel.js')},
        does: 'Daylight and Dawn remove overlapping Darkness of equal or lower level.'},
    {id: 'lucky', title: 'Lucky (2024)', kind: 'world', file: fj('world/install-lucky.js'), campaigns: [FJ, JTE, EE, CR], order: 14,
        v14: {file: fj('world/v14/install-lucky.js')},
        does: '2024 Lucky for every character that has it.'},
    {id: 'life-bond', title: 'Life Bond (Find Steed)', kind: 'world', file: fj('world/install-life-bond.js'), campaigns: [FJ, JTE], order: 15,
        v14: {retired: 'Chris\'s Premades 2\'s 2024 Find Steed shares the healing itself (Life Bond). Apply Find Steed in the Medkit.'},
        does: 'The steed shares spell healing within 5 ft.'},
    {id: 'war-caster', title: 'War Caster', kind: 'world', file: fj('world/install-war-caster.js'), campaigns: [FJ, CR], order: 16,
        v14: {file: fj('world/v14/install-war-caster.js')},
        does: 'War Caster spells in Gambit\'s opportunity attack prompt.'},
    {id: 'hold-spells', title: 'Hold Person / Monster saves', kind: 'world', file: fj('world/fix-hold-spells.js'), campaigns: [FJ], order: 17,
        actors: ['bangiras', 'vina'], allAtOnce: true,
        v14: {retired: 'Chris\'s Premades 2\'s Hold Person / Hold Monster paralyze and repeat the Wisdom save at the end of each turn with the spell\'s DC. Apply them in the Medkit (Vina\'s Hold Person). Bangiras\'s fixes keep his Hold Monster DC live.'},
        does: 'End-of-turn Wisdom save with the live DC on each caster\'s Hold spells.'},
    {id: 'diagnose-oa', title: 'Diagnose opportunity attacks', kind: 'tool', file: fj('world/diagnose-opportunity-attacks.js'), campaigns: [FJ, JTE], order: 90, manual: true,
        v14: {file: fj('world/v14/diagnose-opportunity-attacks.js')},
        does: 'Read-only report of opportunity attack settings and combatants.'},
 
    // ---------------- The Fool's Journey ----------------
    {id: 'bangiras-metamagic', title: 'Metamagic fix-up', kind: 'setup', file: fj('bangiras/metamagic-fixup.js'), campaigns: [FJ], actors: ['bangiras'], order: 20,
        v14: {file: fj('bangiras/v14/metamagic-fixup.js')},
        does: '2024 Metamagic costs on his Sorcery Points item.'},
    {id: 'bangiras-judge', title: 'Magicians Judge setup', kind: 'setup', file: fj('bangiras/magicians-judge-setup.js'), campaigns: [FJ], actors: ['bangiras'], order: 21,
        v14: {file: fj('bangiras/v14/magicians-judge-setup.js')},
        does: 'Staff charges, Arcane Glyphs, Stasis, Judgement, Sand Shroud.'},
    {id: 'bangiras-fixes', title: 'Bangiras fixes', kind: 'character', file: fj('bangiras/install-bangiras-fixes.js'), campaigns: [FJ], actors: ['bangiras'], order: 22,
        v14: {file: fj('bangiras/v14/install-bangiras-fixes.js')},
        does: 'Stasis, Sand Shroud, Quickened, Sorcery Incarnate, Heightened/Twinned, Sorcerous Restoration, Mantle of Flame, Phoenix Spark, Hold live DC.'},
    {id: 'bangiras-seeking', title: 'Seeking Spell', kind: 'embedded', file: fj('bangiras/seeking-spell-embedded.js'), campaigns: [FJ], actors: ['bangiras'], order: 23,
        target: {item: /^(metamagic\s*[:\-–]\s*)?seeking spell$/i, type: 'midi-actor', pass: 'postAttackRoll', priority: 50, name: 'Seeking Spell', marker: 'SEEKING SPELL (2024)'},
        v14: {file: fj('bangiras/v14/seeking-spell-embedded.js'), target: {event: 'roll', pass: 'actorAttackRoll', priority: 50}},
        does: 'Reroll a missed spell attack for 1 Sorcery Point.'},
    {id: 'bangiras-shift', title: 'Ring: Shift Spell', kind: 'embedded', file: fj('bangiras/ring-shift-spell-embedded.js'), campaigns: [FJ], actors: ['bangiras'], order: 24,
        target: {item: /ring of changing shapes/i, type: 'midi-actor', pass: 'preItemRoll', priority: 50, name: 'Shift Spell', marker: 'RING OF CHANGING SHAPES: SHIFT SPELL',
            needsActivity: /^shift spell$/i},
        v14: {file: fj('bangiras/v14/ring-shift-spell-embedded.js'), target: {event: 'roll', pass: 'actorPreItemRoll', priority: 50}},
        does: 'Swap a counterspelled spell for another (needs the Counterspell world installer).'},
    {id: 'bangiras-surge', title: 'Ring: Spell Surge', kind: 'embedded', file: fj('bangiras/ring-spell-surge-embedded.js'), campaigns: [FJ], actors: ['bangiras'], order: 25,
        target: {item: /ring of changing shapes/i, activity: /^spell surge$/i, type: 'midi-item', pass: 'rollFinished', priority: 50, name: 'Spell Surge', marker: 'RING OF CHANGING SHAPES: SPELL SURGE'},
        v14: {file: fj('bangiras/v14/ring-spell-surge-embedded.js'), target: {event: 'roll', pass: 'activityRollFinished', priority: 50}},
        does: 'Extra spell, then Paralyzed until the end of his next turn.'},
    {id: 'bangiras-shard', title: 'Shadowfell Shard', kind: 'embedded', file: fj('bangiras/shadowfell-shard-embedded.js'), campaigns: [FJ], actors: ['bangiras'], order: 26,
        target: {item: /shadowfell shard/i, type: 'midi-actor', pass: 'rollFinished', priority: 50, name: 'Shadowfell Shard', marker: 'SHADOWFELL SHARD: Chris'},
        v14: {file: fj('bangiras/v14/shadowfell-shard-embedded.js'), target: {event: 'roll', pass: 'actorRollFinished', priority: 50}},
        does: 'Curse a target after a Metamagic spell.'},
    {id: 'nethtari-fixes', title: 'Nethtari fixes', kind: 'character', file: fj('nethtari/install-nethtari-fixes.js'), campaigns: [FJ], actors: ['nethtari'], order: 30,
        v14: {file: fj('nethtari/v14/install-nethtari-fixes.js')},
        does: 'Agonizing Blast, Eldritch Bident, Fiendish Vigor, Gift of the Protectors, Sentinel Raven, Soul of the Raven, Spell Sniper, Pearl of Power.'},
    {id: 'nethtari-thunderstorm', title: 'Bottled Thunderstorm setup', kind: 'setup', file: fj('nethtari/bottled-thunderstorm-setup.js'), campaigns: [FJ], actors: ['nethtari'], order: 31,
        v14: {file: fj('nethtari/v14/bottled-thunderstorm-setup.js')},
        does: 'All Bottled Thunderstorm activities with animations.'},
    {id: 'quez-fixes', title: 'Quez fixes', kind: 'character', file: fj('quez/install-quez-fixes.js'), campaigns: [FJ], actors: ['quez'], order: 40,
        v14: {file: fj('quez/v14/install-quez-fixes.js')},
        does: 'Vitality of the Tree (v14: Demons Rage only), Great Weapon Master, Sentinel, Chieftain\'s Fury, Javelin of Lightning, Tina\'s Gravity Gloves.'},
    {id: 'quez-gamble', title: 'Demonic Gamble', kind: 'embedded', file: fj('quez/demonic-gamble-embedded.js'), campaigns: [FJ], actors: ['quez'], order: 41,
        target: {item: /^demons? rage/i, activity: /demonic gamble/i, type: 'midi-item', pass: 'preItemRoll', priority: 50, name: 'Demonic Gamble', marker: 'DEMONIC GAMBLE: Chris'},
        v14: {file: fj('quez/v14/demonic-gamble-embedded.js'), target: {event: 'roll', pass: 'activityPreItemRoll', priority: 50}},
        does: 'Hit Dice wager on the Demonic Gamble activity.'},
    {id: 'quez-price', title: 'Blood Price', kind: 'embedded', file: fj('quez/blood-price-embedded.js'), campaigns: [FJ], actors: ['quez'], order: 42,
        target: {item: /^demons? rage/i, type: 'save', pass: 'bonus', priority: 50, name: 'Blood Price', marker: 'BLOOD PRICE: Chris'},
        v14: {file: fj('quez/v14/blood-price-embedded.js'), target: {event: 'save', pass: 'actorBonus', priority: 50}},
        does: 'Hit Dice for a failed save.'},
    {id: 'quez-restoration', title: 'Blood Restoration', kind: 'embedded', file: fj('quez/blood-restoration-embedded.js'), campaigns: [FJ], actors: ['quez'], order: 43,
        target: {item: /^demons? rage/i, type: 'midi-actor', pass: 'rollFinished', priority: 50, name: 'Blood Restoration', marker: 'BLOOD RESTORATION: Chris'},
        v14: {file: fj('quez/v14/blood-restoration-embedded.js'), target: {event: 'roll', pass: 'actorRollFinished', priority: 50}},
        does: 'Regain a Hit Die on a kill.'},
    {id: 'westly-fixes', title: 'Westly fixes', kind: 'character', file: fj('westly/install-westly-fixes.js'), campaigns: [FJ], actors: ['westly'], order: 50,
        v14: {file: fj('westly/v14/install-westly-fixes.js')},
        does: 'Twin Blades, Radiant/Silent Strike, Goad, Awe, Fancy Footwork, Uncanny Dodge, Lucky, Skill Expert, Cloak of the Bat. (v14: Lucky is the world installer; Uncanny Dodge is Chris\'s Premades 2.)'},
    {id: 'westly-13-17', title: 'Swashbuckler 13 / 17', kind: 'levelup', file: fj('westly/install-swashbuckler-13-17.js'), campaigns: [FJ], actors: ['westly'], order: 51, manual: true,
        v14: {file: fj('westly/v14/install-swashbuckler-13-17.js')},
        does: 'Invigorate, Parrying Stance (13); Master Duelist (17). Run when he levels.'},
    {id: 'earwyn-fixes', title: 'Earwyn fixes', kind: 'character', file: fj('earwyn/install-earwyn-fixes.js'), campaigns: [FJ], actors: ['earwyn'], order: 60,
        v14: {file: fj('earwyn/v14/install-earwyn-fixes.js')},
        does: 'Shield Master, Hellish Rebuke pop-up, Adamantine Plate, Trident, Winter\'s Bane.'},
    {id: 'earwyn-ring', title: 'Ring of the Sunken King', kind: 'character', file: fj('earwyn/install-sunken-king-ring.js'), campaigns: [FJ], actors: ['earwyn'], order: 61,
        v14: {file: fj('earwyn/v14/install-sunken-king-ring.js')},
        does: 'Spectral Tentacle: Slam and Grapple. (v14: a dnd5e Summon activity.)'},
    {id: 'vina-fixes', title: 'Vina fixes', kind: 'character', file: fj('vina/install-vina-fixes.js'), campaigns: [FJ], actors: ['vina'], order: 70,
        v14: {file: fj('vina/v14/install-vina-fixes.js')},
        does: 'Potent Spellcasting, Sweet Treats, Divine Intervention, Warding Flare. (v14: Warding Flare is Chris\'s Premades 2.)'},
 
    // ---------------- Journey to the East ----------------
    {id: 'nox-fixes', title: 'Nox fixes', kind: 'character', file: jte('nox/install-nox-fixes.js'), campaigns: [JTE], actors: ['nox'], order: 20,
        v14: {file: jte('nox/v14/install-nox-fixes.js')},
        does: 'Unarmed Strike, Uncanny Metabolism, Deflect Attacks, Self-Restoration, Giant-Eel Scarf, Sentinel, Flurry of Blows (target-aware strikes, one dice window each). (v14: Unarmed Strike, Empowered Strikes and Deflect Attacks are Chris\'s Premades 2; Uncanny Metabolism asks at initiative. Re-run after re-applying Monk\'s Focus.)'},
    {id: 'akira-fixes', title: 'Akira fixes', kind: 'character', file: jte('akira/install-akira-fixes.js'), campaigns: [JTE], actors: ['akira'], order: 30,
        v14: {file: jte('akira/v14/install-akira-fixes.js')},
        does: 'Fire Shield, Fount of Sunlight, Combat/Font of Inspiration, Extended + Subtle Spell, Spellfire Adept. (v14: Fire Shield and Font of Inspiration are Chris\'s Premades 2; Combat Inspiration rides on its Bardic Inspiration. Re-run after re-applying Bardic Inspiration.)'},
    {id: 'cordelia-fixes', title: 'Cordelia fixes', kind: 'character', file: jte('cordelia/install-cordelia-fixes.js'), campaigns: [JTE], actors: ['cordelia'], order: 40,
        v14: {file: jte('cordelia/v14/install-cordelia-fixes.js')},
        does: '2024 Fog Cloud / Gust of Wind / Water Walk, Portent, Expert Divination, Kai. Then click Portent > Foretell once. (v14: the 2024 spells are on the sheet; Kai comes from Chris\'s Premades 2\'s Find Familiar.)'},
    {id: 'tsuki-fixes', title: 'Tsuki fixes', kind: 'character', file: jte('tsuki/install-tsuki-fixes.js'), campaigns: [JTE], actors: ['tsuki'], order: 50,
        v14: {file: jte('tsuki/v14/install-tsuki-fixes.js')},
        does: 'Cosmic Omen, Wild Shape, Elemental Fury + Potent Spellcasting, Luna. (v14: Wild Shape is Chris\'s Premades 2; Cosmic Omen rolls its own d6.)'},
    {id: 'peri-fixes', title: 'Peri fixes', kind: 'character', file: jte('peri/install-peri-fixes.js'), campaigns: [JTE], actors: ['peri'], order: 60,
        v14: {file: jte('peri/v14/install-peri-fixes.js')},
        does: 'Fairy Magic, Wild Surge, Great Weapon Master, Mage Slayer. (v14: apply Chris\'s Premades 2\'s Rage and legacy Wild Surge first.)'},
 
    // ---------------- Espalian Escapades ----------------
    {id: 'silkie-fixes', title: 'Silkie fixes', kind: 'character', file: 'espalian-escapades/silkie/install-silkie-fixes.js',
        v14: {file: 'espalian-escapades/silkie/v14/install-silkie-fixes.js'}, campaigns: [EE], actors: ['silkie'], order: 10,
        does: 'Unarmored Defense, Unarmed Strike, Agile Strikes, Robe of Useful Items, prepared spells, Fey Ancestry. (v14: re-run after re-applying Bardic Inspiration in the Medkit.)'},
    {id: 'silent-silk-fixes', title: 'Silent Silk fixes', kind: 'character', file: 'espalian-escapades/silent-silk/install-silent-silk-fixes.js',
        v14: {file: 'espalian-escapades/silent-silk/v14/install-silent-silk-fixes.js'}, campaigns: [EE], actors: ['silentSilk'], order: 20,
        does: 'Charisma spells, Psionic Power, Psi-Bolstered Knack, Psychic Whispers, Robe, Psychic Blade.'},
    {id: 'hellsing-fixes', title: 'Hellsing fixes', kind: 'character', file: 'espalian-escapades/hellsing/install-hellsing-fixes.js',
        v14: {file: 'espalian-escapades/hellsing/v14/install-hellsing-fixes.js'}, campaigns: [EE], actors: ['hellsing'], order: 30,
        does: 'Hemocraft DC, Crimson Rite, Bloated Agony, Shifting, Blood Maledict, Hybrid Transformation.'},
    {id: 'lyric-fixes', title: 'Lyric fixes', kind: 'character', file: 'espalian-escapades/lyric/install-lyric-fixes.js',
        v14: {file: 'espalian-escapades/lyric/v14/install-lyric-fixes.js'}, campaigns: [EE], actors: ['lyric'], order: 40,
        does: 'Rename, Wild Shape, Starry Form, Fey Step, Trance, Absorb Elements. (v14: Wild Shape, Starry Form, Wild Companion and Absorb Elements are Chris\'s Premades 2; apply them in the Medkit first.)'},

    // ---------------- Court of Ravenloft (v14: Nix Fix runs the Illrigger features Chris's Premades 2 doesn't have) ----------------
    {id: 'illrigger-engine', title: 'Illrigger engine (seals)', kind: 'world', file: cr('world/install-illrigger-engine.js'), campaigns: [CR], order: 20,
        actors: ['sydmore', 'dayus', 'dracula', 'lucian', 'valintina', 'sydmore-boss', 'dayus-boss', 'lucian-boss', 'valintina-boss', 'octavian', 'zadimus'], allAtOnce: true,
        v14: {file: cr('world/v14/install-illrigger-engine.js')},
        does: 'Nix Fix runs Baleful Interdict for the Court: one GM dialog per event (place a seal on a hit, or burn with boons), any damage source can burn, per-owner dice and range, only burned seals removed. Re-run after re-applying Baleful Interdict, Deathstrike or Soul\'s Doom in the Medkit.'},
    {id: 'petra-metamagic', title: 'Petra: Metamagic fix-up', kind: 'setup', file: fj('bangiras/metamagic-fixup.js'), campaigns: [CR], actors: ['petra'], order: 30,
        v14: {file: fj('bangiras/v14/metamagic-fixup.js')},
        does: '2024 Metamagic costs on her Sorcery Points item (Bangiras\'s script).'},
    {id: 'sorcerer-core', title: 'Sorcerer core (2024)', kind: 'character', file: cr('world/install-sorcerer-core.js'), campaigns: [CR], actors: ['petra'], order: 31,
        v14: {file: cr('world/v14/install-sorcerer-core.js')},
        does: '2024 Metamagic (Careful, Distant, Empowered, Extended, Heightened, Quickened, Transmuted, Twinned: click, pick a spell, it is cast), Sorcery Incarnate second option, Innate Sorcery (spends a use, melee spell attacks, 2 SP activity), Sorcerous Restoration prompt. Switches off Chris\'s Premades\' 2014 Metamagic.'},
    {id: 'petra-fixes', title: 'Petra fixes', kind: 'character', file: cr('petra/install-petra-fixes.js'), campaigns: [CR], actors: ['petra'], order: 32,
        v14: {file: cr('petra/v14/install-petra-fixes.js')},
        does: 'Umbral Form (with Innate Sorcery), Strength of the Grave 2024, Beasts of Ill Omen save disadvantage, Shadow Walk teleport; deletes the duplicate 2014 Strength of the Grave and Summon Beast. (v14: the duplicate Summon Beast is only reported.)'},
    {id: 'petra-spells', title: 'Petra: spells', kind: 'character', file: cr('petra/install-petra-spells.js'), campaigns: [CR], actors: ['petra'], order: 33,
        v14: {file: cr('petra/v14/install-petra-spells.js')},
        does: 'Wall of Death (wall/ring template, damaging side, end-of-turn and entering damage from her own spell), Negative Energy Flood (undead temp HP, the dead rise as zombies), Finger of Death (Humanoids rise under her command), Prismatic Wall (wall/globe, seven layers, glare, opaque, destroy a layer), Sorcerous Burst (exploding d8s, Cha mod cap). (v14: walls are Regions and replace Chris\'s Premades 2\'s own Wall of Death / Prismatic Wall; Finger of Death is left to Midi QOL.)'},
    {id: 'sydmore-fixes', title: 'Sydmore: fixes', kind: 'world', file: cr('sydmore/install-sydmore-fixes.js'), campaigns: [CR], order: 42,
        actors: ['sydmore', 'sydmore-boss'], allAtOnce: true,
        v14: {file: cr('sydmore/v14/install-sydmore-fixes.js')},
        does: 'Character sheet (and the (Boss) copy): Sutekh\'s Blessing, Foul Interchange, Sanguine Gift, Bloodstroke, Haemal Exchange, Exsanguinate, Sentinel. RAW resources. Apply the Illrigger engine first.'},
    {id: 'sydmore-boss', title: 'Sydmore (Boss): boss kit', kind: 'character', file: cr('sydmore/install-sydmore-boss.js'), campaigns: [CR], actors: ['sydmore-boss'], order: 46,
        v14: {file: cr('sydmore/v14/install-sydmore-boss.js'), actors: ['sydmore']},
        does: 'Only on Sydmore (Boss): Legendary Actions 3 (Seal, Strike, Foul Interchange), Legendary Resistance 3/day + Blood Price, Invoke Hell options 1/day each. Apply Sydmore: fixes first. (v14: on Sydmore itself; the v14 sheet is the boss.)'},
    {id: 'dayus-fixes', title: 'Dayus Manroe: fixes', kind: 'world', file: cr('dayus/install-dayus-fixes.js'), campaigns: [CR], order: 43,
        actors: ['dayus', 'dayus-boss'], allAtOnce: true,
        v14: {file: cr('dayus/v14/install-dayus-fixes.js')},
        does: 'Character sheet (and the (Boss) copy): Marked for Death, Strike from the Dark, Veil of Lies, Hell\'s Assassin, Umbral Killer Evasion, Piercer, Slow mastery, Archery. RAW resources. Apply the Illrigger engine first.'},
    {id: 'dayus-boss', title: 'Dayus Manroe (Boss): boss kit', kind: 'character', file: cr('dayus/install-dayus-boss.js'), campaigns: [CR], actors: ['dayus-boss'], order: 47,
        v14: {file: cr('dayus/v14/install-dayus-boss.js'), actors: ['dayus']},
        does: 'Only on Dayus Manroe (Boss): Legendary Actions 3 (Seal, Strike, Veil of Lies), Legendary Resistance 3/day + Blood Price, Invoke Hell options 1/day each. Apply Dayus Manroe: fixes first. (v14: on Dayus Manroe itself; the v14 sheet is the boss.)'},
    {id: 'lucian-fixes', title: 'Lucian: fixes', kind: 'world', file: cr('lucian/install-lucian-fixes.js'), campaigns: [CR], order: 44,
        actors: ['lucian', 'lucian-boss'], allAtOnce: true,
        v14: {file: cr('lucian/v14/install-lucian-fixes.js')},
        does: 'Character sheet (and the (Boss) copy): Charm Enemy, Intransigent, Let\'s Make a Deal, Red Cant, Slippery Ploy, Quid Pro Quo. RAW resources. Apply the Illrigger engine first.'},
    {id: 'lucian-boss', title: 'Lucian (Boss): boss kit', kind: 'character', file: cr('lucian/install-lucian-boss.js'), campaigns: [CR], actors: ['lucian-boss'], order: 48,
        v14: {file: cr('lucian/v14/install-lucian-boss.js'), actors: ['lucian']},
        does: 'Only on Lucian (Boss): Legendary Actions 3 (Seal, Strike, Bewitching Seal), Legendary Resistance 3/day + Blood Price, Invoke Hell options 1/day each. Apply Lucian: fixes first. (v14: on Lucian itself; the v14 sheet is the boss.)'},
    {id: 'valintina-fixes', title: 'Valintina: fixes', kind: 'world', file: cr('valintina/install-valintina-fixes.js'), campaigns: [CR], order: 45,
        actors: ['valintina', 'valintina-boss'], allAtOnce: true,
        v14: {file: cr('valintina/v14/install-valintina-fixes.js')},
        does: 'Character sheet (and the (Boss) copy): Spellbreaker Spell Duel, Submit, Axiomatic Seals, Enervating Spell (click to arm), Vile Transmogrification. RAW resources. Apply the Illrigger engine first.'},
    {id: 'valintina-boss', title: 'Valintina (Boss): boss kit', kind: 'character', file: cr('valintina/install-valintina-boss.js'), campaigns: [CR], actors: ['valintina-boss'], order: 49,
        v14: {file: cr('valintina/v14/install-valintina-boss.js'), actors: ['valintina']},
        does: 'Only on Valintina (Boss): Legendary Actions 3 (Seal, Strike, Hellfire Cantrip), Legendary Resistance 3/day + Blood Price, Invoke Hell options 1/day each. Apply Valintina: fixes first. (v14: on Valintina itself; the v14 sheet is the boss.)'},
    {id: 'octavian-fixes', title: 'Father Octavian: fixes (captain)', kind: 'world', file: cr('octavian/install-octavian-fixes.js'), campaigns: [CR], order: 50,
        actors: ['octavian'], allAtOnce: true,
        v14: {file: cr('octavian/v14/install-octavian-fixes.js')},
        does: 'Captain (no boss kit, no Legendary Actions or Resistance): Illrigger 7 Architect of Ruin: Enervating Spell, Spellblade, Axiomatic Seals, Invoke Hell shared 1/short rest, burn-dialog boons. Apply the Illrigger engine first. Make stat block takes him as he is.'},
    {id: 'zadimus-fixes', title: 'Zadimus: fixes (captain)', kind: 'world', file: cr('zadimus/install-zadimus-fixes.js'), campaigns: [CR], order: 51,
        actors: ['zadimus'], allAtOnce: true,
        v14: {file: cr('zadimus/v14/install-zadimus-fixes.js')},
        does: 'Captain (no boss kit, no Legendary Actions or Resistance): Illrigger 7 Sanguine Knight: Foul Interchange, Sutekh\'s Blessing, Embolden Allies, Vitalize, Soul Eater, Exsanguinate, Lies (rapier), Invoke Hell shared 1/short rest. Apply the Illrigger engine first. Make stat block takes him as he is.'},
    {id: 'dracula-boss', title: 'Dracula: boss kit', kind: 'character', file: cr('dracula/install-dracula-boss.js'), campaigns: [CR], actors: ['dracula'], order: 40,
        v14: {file: cr('dracula/v14/install-dracula-boss.js')},
        does: 'Legendary Actions 4 / 5 in his lair (Seal, Strike, By the Throat, Devour), Regeneration (20, stopped by 15 radiant), Infernal Conduit Devour as his bite (Bonus / Legendary 2), Infernal Ascension mythic phase + Hellfire Detonation, Blood Price / Legendary Resistance prompt (bleed scales with spell level), unlimited seals, Dispater\'s Interdiction and Invoke Hell as Chris\'s Premades items, Grand Strategist / Punishment / You Die on My Command! / Devastator 1/day, Inexorable passive, Terrorizing Force, Feral Instinct. Apply the Illrigger engine first.'},
    {id: 'dracula-bloodrift', title: 'Dracula: Bloodrift', kind: 'character', file: cr('dracula/install-bloodrift.js'), campaigns: [CR], actors: ['dracula'], order: 41,
        v14: {file: cr('dracula/v14/install-bloodrift.js')},
        does: 'Bloodrift replaces the Blood Moon Blade: Blood Gauge, three forms, Bloodlash, Red Mist, Ravenous Strikes, Bloodseeker / Hunted, Bloody Arc, Unleashing the Madness, The Hunger Within, Death Wish.'},
    {id: 'make-stat-block', title: 'Make stat block (boss NPC)', kind: 'tool', file: cr('world/make-stat-block.js'), campaigns: [CR], order: 91, manual: true,
        v14: {file: cr('world/v14/make-stat-block.js')},
        does: 'Pick a boss character copy and a CR: makes an NPC actor with the same name (abilities, HP, AC, saves, skills, senses, traits, spell slots, every item incl. the Illrigger class), native Legendary Action / Resistance pips, each Legendary Action in the Legendary Actions section. The character is not changed. Then bind the NPC in its slot and re-apply the engine, fixes and boss kit. Run again to rebuild it.'}
];
 
// Run order inside a campaign: world installers first, then each character in table order.
export function entriesFor(campaign) {
    return ENTRIES.filter(e => e.campaigns.includes(campaign))
        .sort((a, b) => (a.kind === 'world' ? 0 : 1) - (b.kind === 'world' ? 0 : 1) || a.order - b.order);
}
 