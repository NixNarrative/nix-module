// =====================================================================
//  NIX FIX: Dispel Magic (2024 rules), pure helpers (1.7.7). No Foundry calls: tested by dev/dispel-magic.test.mjs.
//  2024 text: "Choose a creature, an object, or a magical effect within range. Any ongoing spell of level 3 or lower on
//  the target ends. For each ongoing spell of level 4 or higher on the target, make an ability check using your
//  spellcasting ability (DC 10 plus that spell's level). On a successful check, the spell ends.
//  Using a Higher-Level Spell Slot. You automatically end a spell on the target if the spell's level is equal to or
//  less than the level of the spell slot you use."
// =====================================================================
export const DISPEL_RANGE_FT = 120;
export const DISPEL_BASE_LEVEL = 3;

export const dispelDC = level => 10 + (Number(level) || 0);
// A spell of this level ends without a check when Dispel Magic is cast at dispelLevel.
export const endsAutomatically = (spellLevel, dispelLevel = DISPEL_BASE_LEVEL) => (Number(spellLevel) || 0) <= (Number(dispelLevel) || DISPEL_BASE_LEVEL);

// The level a spell effect was cast at. sources: {flags} of the effect / template / Region / summoned actor, and the
// spell item if it resolves. Order: Midi castData, Chris's Premades / CAT castData, dnd5e spellLevel (number, or
// {value, base} on a scaled spell item), the summon level, the item's own (possibly upcast) level, else fallback.
export function castLevelOf({flags = {}, item = null, fallback = null} = {}) {
    const n = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
    const sl = flags?.dnd5e?.spellLevel;
    return n(flags?.['midi-qol']?.castData?.castLevel) ?? n(flags?.['chris-premades']?.castData?.castLevel) ?? n(flags?.cat?.castData?.castLevel)
        ?? n(typeof sl === 'object' ? sl?.value : sl) ?? n(flags?.dnd5e?.summon?.level)
        ?? n(item?.flags?.dnd5e?.spellLevel?.value) ?? n(item?.system?.level) ?? n(fallback);
}

// Is this document's magic a spell that Dispel Magic can end? kind: 'effect' | 'area' | 'summon'.
// Not listed: class / monster features and magic-item properties (origin isn't a spell, or a passive transfer effect),
// the caster's own Concentrating marker (its spell is dispelled where it lands), instantaneous spells, Nix Fix's own
// feature effects (Illrigger seals, Juggernaut auras), and anything already disabled.
export function spellEffectInfo(doc, {kind = 'effect', item = null} = {}) {
    if (!doc) return {ok: false, why: 'nothing'};
    const nix = doc.flags?.['nix-module'] ?? {};
    if (kind === 'effect') {
        if (doc.disabled) return {ok: false, why: 'disabled'};
        if (doc.transfer) return {ok: false, why: 'item property (passive effect)'};
        const statuses = doc.statuses instanceof Set ? doc.statuses : new Set(doc.statuses ?? []);
        if (statuses.has('concentrating') || doc.system?.type === 'concentrating' || doc.type === 'concentrating') return {ok: false, why: 'concentration marker'};
        if (nix.seal || nix.juggernautAura || nix.juggernautPresence || nix.sunlightSensitive) return {ok: false, why: 'feature effect'};
    }
    const castFlags = !!(doc.flags?.['midi-qol']?.castData || doc.flags?.['chris-premades']?.castData || doc.flags?.cat?.castData || doc.flags?.dnd5e?.spellLevel !== undefined);
    if (item && item.type !== 'spell') return {ok: false, why: 'not a spell (' + (item.type ?? '?') + ')'};
    if (!item && !castFlags && !(kind === 'area' && (nix.petraWall || nix.sunlight)) && !nix.sunlight) return {ok: false, why: 'no spell origin'};
    const units = item?.system?.duration?.units;
    if (units === 'inst') return {ok: false, why: 'instantaneous'};
    const level = castLevelOf({flags: doc.flags, item, fallback: nix.sunlight?.level ?? null});
    const concentration = !!(item?.system?.properties?.has?.('concentration') || (Array.isArray(item?.system?.properties) && item.system.properties.includes('concentration')));
    return {ok: true, level: level ?? 0, name: item?.name ?? nix.sunlight?.name ?? nix.petraWall?.name ?? doc.name ?? 'Spell', concentration};
}

// Each spell on the chosen target with how it is resolved: ends without a check, or a check against DC 10 + level.
export function planDispel(spells, dispelLevel = DISPEL_BASE_LEVEL) {
    return (spells ?? []).map(s => endsAutomatically(s.level, dispelLevel) ? {...s, auto: true, dc: null} : {...s, auto: false, dc: dispelDC(s.level)});
}

// One row per spell (several effects of the same cast on one creature are one spell: same origin + level).
export function groupSpells(entries) {
    const out = new Map();
    for (const e of entries ?? []) {
        const k = (e.originUuid ?? e.name) + '|' + e.level;
        if (!out.has(k)) out.set(k, {...e, docs: [...(e.docs ?? [])]});
        else out.get(k).docs.push(...(e.docs ?? []));
    }
    return Array.from(out.values());
}
