// =====================================================================
//  ILLRIGGER ENGINE (Court of Ravenloft): WORLD INSTALLER, Foundry v14 (CAT) copy
//  Run by Nix Fix on the Court Illriggers (Sydmore, Dayus Manroe, Dracula, Lucian,
//  Valintina), or as a Script macro (GM) with their tokens selected. Safe to re-run.
//
//  Chris's Premades 2 has no Illrigger, so on v14 Nix Fix carries the class features too
//  (scripts/court/illrigger-features.mjs, ported from Chris's Premades 1). This installer:
//   1. Records the engine config (flags.nix-module.illrigger), as on v13: range (Unfettered
//      60 ft), seal dice, Superior Interdict, Hell's Assassin, Axiomatic Seals, Exsanguinate,
//      Deathstrike, True Name weapon.
//   2. Baleful Interdict: Place Seal / Move Seals / Burn Seals activities wired to Nix Fix
//      (the engine places the seal; Burn opens the engine's burn dialog). The seal effect
//      keeps the identifier balefulInterdictEffect (flags.cat.identifier too). Seals already
//      on creatures are tagged.
//   3. Soul's Doom: its attack-only "grants" bonus is removed (the engine adds it to all damage).
//   4. Class features wired as CAT function macros (flags.cat.macros, source nix-module):
//      Infernal Conduit (Harm/Heal; the D&D Beyond one-activity version is split into Harm and
//      Heal), Terrorizing Force (D&D Beyond "+1d8" effect switched off), Forked Tongue, Blood Price,
//      Inexorable, Lies, Infernal Majesty, Styx's Apathy, Dis's Onslaught, Impaling / Vengeful
//      Shot, Flash of Brimstone, Conflagrant Channel, Devastator, You Die on My Command!,
//      Telekinetic Seal, Dispater's Supremacy, Punishment.
//   5. Boon costs that point at an item that isn't on this actor (copied from another sheet)
//      are pointed back at his Baleful Interdict (first cost) / Interdict Boons (second).
//  Old Chris's Premades 1 flags are left in place (inert on v14; Revert keeps working).
// =====================================================================
const MOD = 'nix-module';
const api = game.modules.get(MOD)?.api;
const F = api?.illriggerFeatures;
if (!globalThis.cat?.utils) return ui.notifications.error('Illrigger engine (v14): CAT is not active.');
if (!F?.refFor) return ui.notifications.error('Illrigger engine (v14): Nix Fix\'s Illrigger features are not registered (update Nix Fix, reload).');
const actors = Array.from(new Set(canvas.tokens.controlled.map(t => t.actor).filter(Boolean)));
if (!actors.length) return ui.notifications.warn('Illrigger engine: no Court Illriggers found (bind them in the Nix Fix window).');

const ident = d => d?.flags?.['chris-premades']?.info?.identifier ?? d?.flags?.[MOD]?.identifier ?? d?.flags?.cat?.identifier;
const actIds = item => item?.flags?.['chris-premades']?.activityIdentifiers ?? {};
const actByIdent = (item, id) => { const k = actIds(item)[id]; return (k && item.system.activities.get(k)) || item.system.activities.find(a => a.identifier === id); };
const find = (actor, id, re) => actor.items.find(i => ident(i) === id) ?? actor.items.find(i => re.test(i.name));
const findAll = (actor, id, re) => actor.items.filter(i => ident(i) === id || re.test(i.name));
const report = [];

// Merge one function-macro reference into a document's flags.cat.macros (no duplicates).
function withRef(doc, identifier) {
    const ref = F.refFor(identifier);
    if (!ref) throw new Error('No Nix Fix macro ' + identifier);
    const cur = foundry.utils.deepClone(doc.flags?.cat?.macros ?? {});
    for (const [type, list] of Object.entries(ref)) {
        cur[type] = (cur[type] ?? []).filter(r => !(r.source === MOD && r.identifier === identifier)).concat(list);
    }
    return cur;
}
async function refItem(item, identifier, extra = {}) {
    await item.update({'flags.cat.macros': withRef(item, identifier), ['flags.' + MOD + '.identifier']: ident(item) ?? identifier, ...extra});
}
async function refActivity(item, act, identifier, extra = {}) {
    if (!act) return false;
    await item.update({['system.activities.' + act.id + '.flags.cat.macros']: withRef(act, identifier), ...extra});
    return true;
}
async function refEffect(effect, identifier) {
    await effect.update({'flags.cat.macros': withRef(effect, identifier), 'flags.cat.identifier': identifier});
}
const isBI = i => ident(i) === 'balefulInterdict' || (/^baleful interdict\b/i.test(i.name) && !/(burn|move)/i.test(i.name));

for (const actor of actors) {
    const notes = [];
    const bis = actor.items.filter(isBI).sort((a, b) => (ident(b) === 'balefulInterdict') - (ident(a) === 'balefulInterdict') || (Number(b.system.uses?.max) || 0) - (Number(a.system.uses?.max) || 0));
    const bi = bis[0];
    if (!bi) { report.push('<li><b>' + actor.name + '</b>: no Baleful Interdict item. Skipped.</li>'); continue; }
    const ib = find(actor, 'interdictBoons', /^interdict boons$/i);

    // ---- 2. Baleful Interdict activities and seal effect
    await bi.update({['flags.' + MOD + '.identifier']: 'balefulInterdict'});
    const acts = bi.system.activities.contents;
    const place = actByIdent(bi, 'placeSeal') ?? acts.find(a => /seal/i.test(a.name ?? '') && !/(burn|move)/i.test(a.name ?? '') && a.type === 'utility');
    const move = actByIdent(bi, 'move') ?? acts.find(a => /move/i.test(a.name ?? ''));
    const burns = acts.filter(a => a.type === 'damage' && /burn/i.test(a.name ?? ''));
    if (place) {
        // The engine places the seal itself; an activity effect would place a second one.
        await refActivity(bi, place, 'balefulInterdictPlaceSeal', place.effects?.length ? {['system.activities.' + place.id + '.effects']: []} : {});
        notes.push('Place Seal (' + (place.name || place.id) + '): Nix Fix places the seal, checks the ' + '30/60 ft range and offers a boon.');
    } else notes.push('No Place Seal activity found on ' + bi.name + '.');
    if (move && await refActivity(bi, move, 'balefulInterdictMove')) notes.push('Move Seals: wired.');
    for (const b of burns) await refActivity(bi, b, 'balefulInterdictBurn');
    if (burns.length) notes.push('Burn Seals (' + burns.length + ' activities): open the Nix Fix burn dialog.');
    for (const e of bi.effects) {
        if (e.transfer) continue;
        const upd = {'flags.cat.identifier': 'balefulInterdictEffect', 'flags.chris-premades.info.identifier': 'balefulInterdictEffect'};
        if (e.flags?.cat?.macros) upd['flags.cat.-=macros'] = null;
        await e.update(upd);
    }
    let swept = 0;
    const holders = new Set([...game.actors, ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink).map(t => t.actor))].filter(Boolean));
    for (const a of holders) for (const e of a.effects) {
        if (!(e.origin?.startsWith(actor.uuid + '.Item.') || e.flags?.[MOD]?.seal?.owner === actor.uuid)) continue;
        if (!(ident(e) === 'balefulInterdictEffect' || /baleful interdict/i.test(e.name))) continue;
        if (e.flags?.cat?.identifier === 'balefulInterdictEffect' && e.flags?.[MOD]?.seal?.owner === actor.uuid) continue;
        await e.update({'flags.cat.identifier': 'balefulInterdictEffect', ['flags.' + MOD + '.seal']: {owner: actor.uuid}}); swept++;
    }
    if (swept) notes.push(swept + ' seal(s) already on creatures tagged for Nix Fix.');

    // ---- 3. Soul's Doom: the engine adds it to every damage event.
    for (const it of actor.items) for (const e of it.effects) {
        if (!/soul'?s doom/i.test(e.name)) continue;
        const ch = e.system?.changes ?? [];
        const keep = ch.filter(c => !/grants\.bonus\.damage/.test(c.key));
        if (keep.length !== ch.length) { await e.update({'system.changes': keep}); notes.push('Soul\'s Doom (' + it.name + '): adds its bonus to every kind of damage (Nix Fix).'); }
    }

    // ---- 4. Class features
    const wired = [];
    // Infernal Conduit
    const ic = find(actor, 'infernalConduit', /^infernal conduit$/i);
    if (ic) {
        let harm = actByIdent(ic, 'necrotic') ?? ic.system.activities.find(a => /harm|devour/i.test(a.name ?? ''));
        let heal = actByIdent(ic, 'healing') ?? ic.system.activities.find(a => /heal|invigorate/i.test(a.name ?? ''));
        const part = type => [{custom: {enabled: true, formula: '(@scaling)d10'}, number: null, denomination: null, bonus: '', types: [type], scaling: {mode: '', number: null, formula: ''}}];
        const cost = {targets: [{type: 'itemUses', target: '', value: '@scaling', scaling: {mode: '', formula: ''}}], scaling: {allowed: true, max: '@item.uses.value'}};
        if (!harm && !heal) {
            // D&D Beyond version (one "Infernal Conduit Dice" activity): split into Harm and Heal like CPR1's.
            const src = ic.system.activities.contents[0];
            const base = src ? src.toObject() : {type: 'save', activation: {type: 'action'}, save: {ability: ['con'], dc: {calculation: 'cha'}}, range: {units: 'touch'}, target: {affects: {count: '1', type: 'creature'}}};
            delete base.id; delete base.uuid;
            const mk = (id, name, type, onSave) => ({...foundry.utils.deepClone(base), _id: id, name, identifier: type, consumption: foundry.utils.deepClone(cost),
                damage: {onSave, parts: part(type)}, effects: []});
            const upd = {['system.activities.pGRWQXKnmKRHYGUg']: mk('pGRWQXKnmKRHYGUg', 'Harm', 'necrotic', 'half'),
                ['system.activities.wKzsEi6Bf37AnCq3']: mk('wKzsEi6Bf37AnCq3', 'Heal', 'healing', 'full')};
            if (src) upd['system.activities.-=' + src.id] = null;
            await ic.update(upd);
            harm = ic.system.activities.get('pGRWQXKnmKRHYGUg');
            heal = ic.system.activities.get('wKzsEi6Bf37AnCq3');
            notes.push('Infernal Conduit: D&D Beyond activity split into Harm (necrotic) and Heal, (@scaling)d10, one die per use spent.');
        }
        for (const [act, type] of [[harm, 'necrotic'], [heal, 'healing']]) {
            if (!act) continue;
            const p = act.damage?.parts?.[0];
            const extra = {['system.activities.' + act.id + '.identifier']: type};
            if (!p || !(p.custom?.enabled && p.custom.formula) || !(p.types?.has?.(type) || p.types?.includes?.(type))) extra['system.activities.' + act.id + '.damage.parts'] = part(type);
            if (!act.consumption?.scaling?.allowed) extra['system.activities.' + act.id + '.consumption'] = cost;
            await refActivity(ic, act, 'infernalConduit', extra);
        }
        await ic.update({['flags.' + MOD + '.identifier']: 'infernalConduit'});
        wired.push('Infernal Conduit');
    }
    // Terrorizing Force (item named "Terrorizing Force: <type>" on the D&D Beyond sheets)
    for (const tf of findAll(actor, 'terrorizingForce', /^terrorizing force/i)) {
        const offs = tf.effects.filter(e => e.transfer && !e.disabled && (e.system?.changes ?? []).some(c => /bonuses\.(mwak|rwak)\.damage/.test(c.key)));
        for (const e of offs) await e.update({disabled: true});
        await refItem(tf, 'terrorizingForce');
        const act = tf.system.activities.contents[0];
        if (act && !/:\s*(cold|fire|necrotic|poison)/i.test(tf.name)) await refActivity(tf, act, 'terrorizingForcePick');
        wired.push(tf.name + (offs.length ? ' (D&D Beyond +1d8 effect off)' : ''));
    }
    // Forked Tongue (the feature itself, not "Forked Tongue: <language>")
    const ft = find(actor, 'forkedTongue', /^forked tongue$/i);
    if (ft?.system.activities.size) { await refActivity(ft, ft.system.activities.contents[0], 'forkedTongue'); await ft.update({['flags.' + MOD + '.identifier']: 'forkedTongue'}); wired.push('Forked Tongue'); }
    // Saves
    const bp = find(actor, 'bloodPrice', /^blood price$/i);
    if (bp) { await refItem(bp, 'bloodPrice'); wired.push('Blood Price' + (actor.items.some(i => /^legendary resistance \(blood price\)/i.test(i.name)) ? ' (boss prompt takes over)' : '')); }
    const inex = find(actor, 'combatMasteryInexorable', /inexorable/i);
    if (inex) { await refItem(inex, 'combatMasteryInexorable'); wired.push('Inexorable'); }
    const lies = find(actor, 'combatMasteryLies', /combat mastery:\s*lies/i);
    if (lies) {
        let wt = lies.flags?.[MOD]?.weaponType ?? lies.flags?.['chris-premades']?.config?.weaponType;
        if (!wt) {
            const melee = actor.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.type?.baseItem && !/R$/.test(i.system.type?.value ?? ''));
            if (melee.length === 1) wt = melee[0].system.type.baseItem;
        }
        await refItem(lies, 'combatMasteryLies', wt ? {['flags.' + MOD + '.weaponType']: wt} : {});
        wired.push('Lies (' + (wt ?? 'battleaxe: set flags.nix-module.weaponType on the item for another weapon') + ')');
    }
    // Infernal Majesty
    const im = find(actor, 'infernalMajesty', /^infernal majesty$/i);
    if (im) {
        const use = actByIdent(im, 'use') ?? im.system.activities.find(a => a.activation?.type === 'bonus') ?? im.system.activities.contents[0];
        const death = actByIdent(im, 'death');
        const extra = {};
        if (death) extra['system.activities.' + death.id + '.identifier'] = 'death';
        await refActivity(im, use, 'infernalMajesty', extra);
        await im.update({['flags.' + MOD + '.identifier']: 'infernalMajesty'});
        for (const e of im.effects) if (!e.transfer) await e.update({'flags.cat.identifier': 'infernalMajestyEffect'});
        wired.push('Infernal Majesty' + (death ? ' (death burst at 0 HP)' : ''));
    }
    // Styx's Apathy: the effect it applies takes reactions away for a round.
    for (const it of actor.items) for (const e of it.effects) if (/styx'?s apathy/i.test(e.name) && !e.transfer) { await refEffect(e, 'interdictBoonStyxsApathyEffect'); wired.push('Styx\'s Apathy effect'); }
    // Boons with an activity (D&D Beyond bundles repeat several boons in each item: use the activity named for the boon).
    const boonActs = [
        ['interdictBoonDissOnslaught', /dis'?s onslaught/i], ['interdictBoonVengefulShot', /vengeful shot/i],
        ['interdictBoonFlashOfBrimstone', /flash of brimstone/i], ['interdictBoonConflagrantChannel', /conflagrant channel/i],
        ['devastator', /^devastator$/i], ['telekineticSeal', /telekinetic seal/i]];
    for (const [id, re] of boonActs) {
        const items = findAll(actor, id, re);
        const owner = items.find(i => re.test(i.name)) ?? items[0];
        const host = owner ?? actor.items.find(i => i.system.activities?.some(a => re.test(a.name ?? '')));
        if (!host) continue;
        const act = host.system.activities.find(a => re.test(a.name ?? '')) ?? (re.test(host.name) ? host.system.activities.contents.find(a => !a.name || re.test(a.name)) ?? host.system.activities.contents[0] : null);
        if (!act) continue;
        await refActivity(host, act, id);
        if (re.test(host.name)) await host.update({['flags.' + MOD + '.identifier']: ident(host) ?? id});
        wired.push(host.name + (act.name && act.name !== host.name ? ' > ' + act.name : ''));
    }
    // Item-level (actor / target / scene passes)
    for (const [id, re] of [['interdictBoonImpalingShot', /impaling shot/i], ['youDieOnMyCommand', /you die on my command/i],
        ['dispatersSupremacy', /dispater'?s supremacy/i], ['punishment', /punishment/i]]) {
        const it = find(actor, id, re);
        if (!it) continue;
        await refItem(it, id);
        wired.push(it.name);
    }

    // ---- 5. Boon costs pointing at items that aren't on this sheet
    let fixed = 0;
    for (const it of actor.items) {
        if (!it.system.activities?.size) continue;
        const upd = {};
        for (const a of it.system.activities) {
            const targets = a.consumption?.targets ?? [];
            let broken = 0, changed = false;
            const next = targets.map(t => {
                const d = typeof t.toObject === 'function' ? t.toObject() : foundry.utils.deepClone(t);
                if (d.type === 'itemUses' && d.target && !actor.items.get(d.target)) {
                    const to = broken++ === 0 ? bi : (ib ?? bi);
                    if (to && to.id !== it.id) { d.target = to.id; changed = true; } else if (to?.id === it.id) { d.target = ''; changed = true; }
                }
                return d;
            });
            if (changed) { upd['system.activities.' + a.id + '.consumption.targets'] = next; fixed++; }
        }
        if (Object.keys(upd).length) await it.update(upd);
    }
    if (fixed) notes.push(fixed + ' boon activit' + (fixed > 1 ? 'ies' : 'y') + ': costs pointed at an item from another sheet; now his Baleful Interdict / Interdict Boons.');

    // ---- 1. Configuration (same shape as v13)
    const cls = actor.items.find(i => i.type === 'class' && /illrigger/i.test(i.name));
    const unfettered = actor.items.some(i => ident(i) === 'combatMasteryUnfettered' || /unfettered/i.test(i.name));
    const trueName = actor.items.find(i => i.type === 'weapon' && /true name/i.test(i.name));
    const ds = find(actor, 'deathstrike', /^deathstrike/i);
    const old = actor.flags?.[MOD]?.illrigger ?? {};
    const cfg = {
        version: 2, engine: 'cat',
        classId: cls?.system.identifier || 'illrigger',
        damageScale: bi.flags?.['chris-premades']?.config?.damageScaleIdentifier || 'baleful-interdict-damage',
        level: cls?.system.levels ?? null,
        range: unfettered ? 60 : 30,
        superiorInterdict: !!find(actor, 'superiorInterdict', /^superior interdict/i),
        hellsAssassin: actor.items.some(i => /hell'?s assassin/i.test(i.name) || i.system.activities?.some?.(a => /hell'?s assassin/i.test(a.name ?? ''))),
        axiomatic: actor.items.some(i => /axiomatic seals/i.test(i.name) || i.system.activities?.some?.(a => /axiomatic seals/i.test(a.name ?? ''))) ? Math.max(1, actor.system.abilities.cha.mod) : 0,
        exsanguinate: actor.items.some(i => /^exsanguinate/i.test(i.name)),
        deathstrike: ds?.id ?? null,
        trueNameItem: trueName?.id ?? null,
        unlimitedSeals: !!old.unlimitedSeals
    };
    await actor.update({['flags.' + MOD + '.illrigger']: cfg});
    const sc = actor.system.scale?.[cfg.classId] ?? {};
    const scale = sc[cfg.damageScale] ?? sc['baleful-interdict-damage'] ?? sc.burnseal;
    const dice = scale?.number ? scale.number + 'd' + scale.faces : '(level table)';
    const extras = [cfg.superiorInterdict && 'Superior Interdict', cfg.hellsAssassin && 'Hell\'s Assassin', cfg.axiomatic && 'Axiomatic Seals +' + cfg.axiomatic,
        cfg.exsanguinate && 'Exsanguinate', cfg.deathstrike && 'Deathstrike', cfg.trueNameItem && trueName.name + ' (+1d6, extra seal on 18-20)'].filter(Boolean);
    if (wired.length) notes.push('Wired: ' + wired.join(', ') + '.');
    report.push('<li><b>' + actor.name + '</b>: seals ' + (bi.system.uses?.max ? bi.system.uses.max : 'unlimited') + ', ' + dice + ' per seal, range ' + cfg.range + ' ft'
        + (extras.length ? '; ' + extras.join(', ') : '') + (notes.length ? '<ul><li>' + notes.join('</li><li>') + '</li></ul>' : '') + '</li>');
}
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: Illrigger engine (v14)</b><ul>' + report.join('') + '</ul>'
    + '<p>Weapon hits by these Illriggers ask once (place a seal, or burn + options). Any other damage to a sealed creature asks once per damage event, one row per Illrigger in range.</p>'});
