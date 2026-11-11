// =====================================================================
//  ILLRIGGER ENGINE (Court of Ravenloft): WORLD INSTALLER (Script macro, run as GM)
//  Nix Fix runs it on the five Court Illriggers (Sydmore, Dayus Manroe, Dracula,
//  Lucian, Valintina). Safe to re-run.
//   - Hands Baleful Interdict over to Nix Fix's engine (scripts/court/illrigger.mjs):
//     one GM dialog per event instead of Chris's Premades' prompt chain.
//   - Strips Chris's Premades' hit prompt (Baleful Interdict) and burn macro (on the
//     seal effect, and on seals already on creatures), and Deathstrike's own prompt
//     (Deathstrike is a checkbox in the hit dialog now).
//   - Soul's Doom: the engine adds it to every kind of damage, so CPR's attack-only
//     bonus is switched off (no double count). Its effect lasts 1 minute on the target.
//   - Records each Illrigger's range (Unfettered 60 ft), seal dice and passives.
// =====================================================================
const MOD = 'nix-module';
const actors = Array.from(new Set(canvas.tokens.controlled.map(t => t.actor).filter(Boolean)));
if (!actors.length) return ui.notifications.warn('Illrigger engine: no Court Illriggers found (bind them in the Nix Fix window).');
const ident = d => d?.flags?.['chris-premades']?.info?.identifier;
const find = (actor, id, re) => actor.items.find(i => ident(i) === id) ?? actor.items.find(i => re.test(i.name));
const report = [];

async function stripMacro(doc, path, name) {
    const list = foundry.utils.getProperty(doc, 'flags.chris-premades.macros.' + path);
    if (!Array.isArray(list) || !list.includes(name)) return false;
    await doc.update({['flags.chris-premades.macros.' + path]: list.filter(n => n !== name)});
    return true;
}
const isBI = i => ident(i) === 'balefulInterdict' || (/^baleful interdict\b/i.test(i.name) && !/(burn|move)/i.test(i.name));

for (const actor of actors) {
    const notes = [];
    const bis = actor.items.filter(isBI).sort((a, b) => (ident(b) === 'balefulInterdict') - (ident(a) === 'balefulInterdict') || (Number(b.system.uses?.max) || 0) - (Number(a.system.uses?.max) || 0));
    const bi = bis[0];
    if (!bi) { report.push('<li><b>' + actor.name + '</b>: no Baleful Interdict item. Skipped.</li>'); continue; }
    if (!ident(bi)) notes.push('Baleful Interdict is the D&D Beyond version: seals work, but apply Chris\'s Premades\' Baleful Interdict in the Medkit for the Bonus Action / Move Seals activities, then re-run this.');

    // 1. Chris's Premades' hit prompt and burn macro off.
    if (await stripMacro(bi, 'midi.actor', 'balefulInterdict')) notes.push('CPR\'s "Place a seal?" prompt switched off (Nix Fix asks).');
    for (const e of bi.effects) {
        if (e.flags?.['chris-premades']?.macros) await e.update({'flags.chris-premades.-=macros': null});
        if (!e.transfer && ident(e) !== 'balefulInterdictEffect') await e.update({'flags.chris-premades.info.identifier': 'balefulInterdictEffect'});
    }
    let swept = 0;
    const holders = new Set([...game.actors, ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink).map(t => t.actor))].filter(Boolean));
    for (const a of holders) for (const e of a.effects) {
        if (e.origin?.startsWith(actor.uuid + '.Item.') || e.flags?.[MOD]?.seal?.owner === actor.uuid) {
            if (e.flags?.['chris-premades']?.macros && (ident(e) === 'balefulInterdictEffect' || /baleful interdict/i.test(e.name))) {
                await e.update({'flags.chris-premades.-=macros': null, ['flags.' + MOD + '.seal']: {owner: actor.uuid}}); swept++;
            }
        }
    }
    if (swept) notes.push(swept + ' seal(s) already on creatures switched to Nix Fix.');

    // 2. Deathstrike: a checkbox in the hit dialog.
    const ds = find(actor, 'deathstrike', /^deathstrike/i);
    if (ds && await stripMacro(ds, 'midi.actor', 'deathstrike')) notes.push('Deathstrike: its own prompt off (it\'s in the hit dialog).');

    // 3. Soul's Doom: engine adds it to all damage.
    const sd = find(actor, 'interdictBoonSoulsDoom', /soul'?s doom/i);
    if (sd) for (const e of sd.effects) {
        const keep = e.changes.filter(c => !/grants\.bonus\.damage/.test(c.key));
        if (keep.length !== e.changes.length) { await e.update({changes: keep}); notes.push('Soul\'s Doom: now adds its bonus to every kind of damage (Nix Fix).'); }
        // Lasts 1 minute on the target (Nix, 1.7.0).
        if (!e.transfer && Number(e.duration?.seconds) !== 60) { await e.update({'duration.seconds': 60}); notes.push('Soul\'s Doom: lasts 1 minute.'); }
    }

    // 4. Configuration.
    const cls = actor.items.find(i => i.type === 'class' && /illrigger/i.test(i.name));
    const unfettered = actor.items.some(i => ident(i) === 'combatMasteryUnfettered' || /unfettered/i.test(i.name));
    const trueName = actor.items.find(i => i.type === 'weapon' && /true name/i.test(i.name));
    const old = actor.flags?.[MOD]?.illrigger ?? {};
    const cfg = {
        version: 1,
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
    const scale = actor.system.scale?.[cfg.classId]?.[cfg.damageScale] ?? actor.system.scale?.[cfg.classId]?.burnseal;
    const dice = scale?.number ? scale.number + 'd' + scale.faces : '(level table)';
    const extras = [cfg.superiorInterdict && 'Superior Interdict', cfg.hellsAssassin && 'Hell\'s Assassin', cfg.axiomatic && 'Axiomatic Seals +5',
        cfg.exsanguinate && 'Exsanguinate', cfg.deathstrike && 'Deathstrike', cfg.trueNameItem && trueName.name + ' (+1d6, extra seal on 18-20)'].filter(Boolean);
    report.push('<li><b>' + actor.name + '</b>: seals ' + (bi.system.uses?.max ? bi.system.uses.max : 'unlimited') + ', ' + dice + ' per seal, range ' + cfg.range + ' ft'
        + (extras.length ? '; ' + extras.join(', ') : '') + (notes.length ? '<ul><li>' + notes.join('</li><li>') + '</li></ul>' : '') + '</li>');
}
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: Illrigger engine</b><ul>' + report.join('') + '</ul>'
    + '<p>Weapon hits by these Illriggers ask once (place a seal, or burn + options). Any other damage to a sealed creature asks once per damage event, one row per Illrigger in range.</p>'});
