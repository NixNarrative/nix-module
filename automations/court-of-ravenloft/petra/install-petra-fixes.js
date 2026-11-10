// =====================================================================
//  PETRA FIXES (Court of Ravenloft): Shadow Sorcery 2024 (Ravenloft: The Horrors Within)
//  One-click INSTALLER (Script macro, run as GM). Select Petra's token, then run.
//  Safe to re-run. Run "Sorcerer core (2024)" first (Metamagic, Innate Sorcery).
//   - Umbral Form: offered when she uses Innate Sorcery (free use, or 6 Sorcery
//     Points). Resistance to everything but force and radiant while Innate
//     Sorcery lasts; 1d10 force if she ends her turn inside a creature.
//   - Strength of the Grave (2024): at 0 HP, Cha save DC 5 + damage; success:
//     HP = Cha mod + Sorcerer level. Once per long rest after a success.
//     The duplicate 2014 Strength of the Grave item is deleted (Revert restores it).
//   - Beasts of Ill Omen: enemies within 5 ft of her Bestial Spirit have
//     disadvantage on saves against her spells.
//   - Shadow Walk: Bonus Action teleport up to 120 ft (light check in chat).
//   - The duplicate Summon Beast is deleted.
// =====================================================================

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Petra fixes: select Petra\'s token first.');
if (!globalThis.chrisPremades?.utils) return ui.notifications.error('Petra fixes: Chris\'s Premades is not active.');
const report = [];

// Helpers carried into each macro (P.wrap). Free names resolve in Chris's Premades' macro scope.
const P = (function nixShadow() {
    const points = a => a?.items?.find(i => i.type === 'feat'
        && (/^sorcery points$/i.test(i.name.trim()) || i.system?.identifier === 'sorcery-points'));
    const chat = (a, html) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: a}), content: html});
    const find = (list, search) => {
        if (!globalThis.Sequencer) return null;
        const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
        return list.find(ok) ?? (() => { try { return (Sequencer.Database.searchFor(search) ?? []).map(x => typeof x === 'string' ? x : x?.dbPath).find(ok); } catch { return null; } })();
    };
    // Westly's Cloak of the Bat light check: 'bright' | 'dim' | 'dark'.
    const lightAt = token => {
        const p = token.document.getCenterPoint?.() ?? token.center;
        const env = canvas.scene.environment ?? {};
        const dark = canvas.environment?.darknessLevel ?? env.darknessLevel ?? 0;
        const g = canvas.environment?.globalLightSource;
        const globalOn = g ? (g.active && !g.disabled && dark < 1) :
            (env.globalLight?.enabled && dark >= (env.globalLight?.darkness?.min ?? 0) && dark <= (env.globalLight?.darkness?.max ?? 1) && dark < 1);
        let level = globalOn ? 'bright' : 'dark';
        if (level !== 'bright') {
            const Global = foundry.canvas?.sources?.GlobalLightSource;
            for (const src of canvas.effects.lightSources) {
                if (!src.active || src.isDarkness || src === g || (Global && src instanceof Global)) continue;
                if (src.object?.document?.id === token.document.id) continue;
                if (!src.shape?.contains?.(p.x, p.y)) continue;
                const r = (src.ratio ?? 0) * (src.shape.config?.radius ?? src.radius ?? 0);
                if (r > 0 && Math.hypot(p.x - src.data.x, p.y - src.data.y) <= r) { level = 'bright'; break; }
                level = 'dim';
            }
        }
        if (level !== 'dark' && canvas.effects.testInsideDarkness?.(p, token.document.elevation ?? 0)) level = 'dark';
        return level;
    };
    const innateEffect = a => a.effects.find(e => /innate sorcery/i.test(e.name) && !e.disabled && !e.transfer
        && !e.flags?.world?.nixUmbral);
    // Umbral Form for as long as Innate Sorcery lasts.
    const applyUmbral = async (me, innate, item) => {
        const old = effectUtils.getEffectByIdentifier(me, 'nixUmbralForm');
        if (old) await genericUtils.remove(old);
        const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
        const types = Object.keys(CONFIG.DND5E.damageTypes ?? {}).filter(t => !['force', 'radiant'].includes(t));
        const turnEnd = async () => {
            const e = trigger.entity;
            const me = e.parent;
            const tok = actorUtils.getFirstToken(me);
            if (!tok) return;
            const c = tok.center;
            const inside = canvas.tokens.placeables.find(t => t.id !== tok.id && t.actor && t.bounds?.contains?.(c.x, c.y));
            if (!inside) return;
            const roll = await new CONFIG.Dice.DamageRoll('1d10', {}, {type: 'force'}).evaluate();
            await workflowUtils.applyWorkflowDamage(tok, roll, 'force', [tok],
                {flavor: 'Umbral Form', sourceItem: {name: 'Umbral Form', img: e.img, type: 'feat'}});
            await P.chat(me, '<b>Umbral Form:</b> ' + me.name + ' ends her turn inside ' + inside.document.name + ' and takes ' + roll.total + ' force damage.');
        };
        const animOn = async () => {
            const tok = actorUtils.getFirstToken(trigger.entity.parent);
            if (!tok || !globalThis.Sequence) return;
            const f = P.find(['jb2a.energy_strands.overlay.dark_purple', 'jb2a.extras.tmfx.outflow.circle.01', 'jb2a.darkness.black'], 'darkness');
            if (f) await new Sequence().effect().file(f).attachTo(tok).scaleToObject(1.6).opacity(0.6).belowTokens()
                .fadeIn(600).fadeOut(600).persist().name('Umbral Form ' + trigger.entity.parent.id).play();
        };
        const animOff = async () => {
            if (globalThis.Sequencer) await Sequencer.EffectManager.endEffects({name: 'Umbral Form ' + trigger.entity.parent.id});
        };
        const eff = await effectUtils.createEffect(me, {
            name: 'Umbral Form', img: item?.img ?? 'icons/magic/perception/shadow-stealth-eyes-purple.webp', origin: item?.uuid,
            duration: innate?.duration?.seconds ? {seconds: innate.duration.seconds} : {seconds: 60},
            changes: types.map(t => ({key: 'system.traits.dr.value', mode: ADD, value: t, priority: 20})),
            description: 'Shadow Resilience: resistance to all damage except force and radiant. Incorporeal Movement: move through creatures and objects as difficult terrain; 1d10 force if she ends her turn inside one (creatures are checked automatically, objects by hand). Ends with Innate Sorcery.',
            flags: {world: {nixUmbral: true}, 'chris-premades': {embeddedMacros: [
                {name: 'Umbral Form: inside', type: 'combat', pass: 'turnEnd', priority: 50, macro: P.wrap(turnEnd)},
                {name: 'Umbral Form: shadow', type: 'effect', pass: 'created', priority: 50, macro: P.wrap(animOn)},
                {name: 'Umbral Form: fade', type: 'effect', pass: 'deleted', priority: 50, macro: P.wrap(animOff)}]}}
        }, {identifier: 'nixUmbralForm'});
        if (innate && eff) await effectUtils.addDependent(innate, [eff]);
        await P.chat(me, '<b>Umbral Form:</b> ' + me.name + ' becomes living shadow: resistant to all damage but force and radiant, able to pass through creatures and objects.');
    };
    const wrap = fn => 'const P = (' + nixShadow.toString() + ')();\nawait (' + fn.toString() + ')();';
    return {points, chat, find, lightAt, innateEffect, applyUmbral, wrap};
})();

// ===========================================================================
//  MACROS
// ===========================================================================

// Innate Sorcery: Midi Item | rollFinished | 70 -> offer Umbral Form.
const umbralOffer = async () => {
    const me = workflow.actor;
    const umbral = me.items.find(i => /^umbral form$/i.test(i.name.trim()));
    if (!umbral) return;
    let innate;
    for (let i = 0; i < 10 && !innate; i++) {
        innate = P.innateEffect(me);
        if (!innate) await genericUtils.sleep(200);
    }
    if (!innate || effectUtils.getEffectByIdentifier(me, 'nixUmbralForm')) return;
    const free = umbral.system.uses?.max ? (umbral.system.uses.value ?? 0) : 0;
    const pts = P.points(me);
    const sp = pts?.system.uses?.value ?? 0;
    if (!free && sp < 6) return;
    const buttons = [];
    if (free) buttons.push(['Yes (' + free + ' use left)', 'free']);
    if (sp >= 6) buttons.push(['Yes, spend 6 Sorcery Points (' + sp + ' left)', 'points']);
    buttons.push(['No', false]);
    const pick = await dialogUtils.buttonDialog(umbral.name, 'Innate Sorcery is active. Adopt Umbral Form while it lasts?', buttons,
        {userId: socketUtils.firstOwner(me, true) ?? game.user.id});
    if (!pick) return;
    if (pick === 'free') await genericUtils.update(umbral, {'system.uses.spent': (umbral.system.uses.spent ?? 0) + 1});
    else await genericUtils.update(pts, {'system.uses.spent': (pts.system.uses.spent ?? 0) + 6});
    await P.applyUmbral(me, innate, umbral);
};

// Umbral Form clicked by itself: Midi Item | rollFinished | 50.
const umbralDirect = async () => {
    const me = workflow.actor;
    const umbral = workflow.item;
    const innate = P.innateEffect(me);
    if (!innate) {
        if ((umbral.system.uses?.spent ?? 0) > 0 && workflow.activity?.consumption?.targets?.some(t => t.type === 'itemUses')) {
            await genericUtils.update(umbral, {'system.uses.spent': umbral.system.uses.spent - 1});
        }
        return ui.notifications.warn('Umbral Form works while Innate Sorcery is active: use Innate Sorcery and it is offered. Use refunded.');
    }
    await P.applyUmbral(me, innate, umbral);
};

// Strength of the Grave (2024): Midi Actor | targetApplyDamage | 245, on Power of Shadow.
const grave = async () => {
    const host = trigger.entity;
    const me = host.actor ?? host.parent;
    if (!ditem || !me || (ditem.actorUuid && ditem.actorUuid !== me.uuid)) return;
    if (!((ditem.oldHP ?? 0) > 0) || (ditem.newHP ?? 1) > 0) return;
    if (host.getFlag('world', 'nixGraveUsed')) return;
    const dmg = Number(ditem.totalDamage ?? 0) || ((ditem.hpDamage ?? 0) + (ditem.tempDamage ?? 0));
    const max = me.system.attributes.hp.max ?? 0;
    const overflow = dmg - (ditem.oldHP ?? 0) - (ditem.oldTempHP ?? 0);
    if (max && overflow >= max) return P.chat(me, '<b>Strength of the Grave:</b> the blow kills ' + me.name + ' outright; the shadow can\'t hold her.');
    const dc = 5 + dmg;
    const level = me.classes?.sorcerer?.system.levels ?? me.system.details?.level ?? 0;
    const hpTo = Math.max(1, (me.system.abilities.cha.mod ?? 0) + level);
    let total;
    try {
        const r = typeof me.rollSavingThrow === 'function'
            ? await me.rollSavingThrow({ability: 'cha', target: dc}, {configure: false})
            : await me.rollAbilitySave('cha', {fastForward: true, targetValue: dc});
        total = (Array.isArray(r) ? r[0] : r)?.total;
    } catch (err) { console.warn('Strength of the Grave', err); }
    if (total === undefined) return;
    if (total < dc) return P.chat(me, '<b>Strength of the Grave:</b> ' + me.name + ' rolls ' + total + ' against DC ' + dc + ' and falls.');
    workflowUtils.preventDeath(ditem);
    await host.setFlag('world', 'nixGraveUsed', true);
    const lift = async () => {
        const hp = me.system.attributes.hp.value ?? 0;
        if (hp < hpTo) await me.update({'system.attributes.hp.value': hpTo});
    };
    setTimeout(lift, 1200);
    await P.chat(me, '<b>Strength of the Grave:</b> ' + me.name + ' rolls ' + total + ' against DC ' + dc
        + ' and refuses to fall: she is at <b>' + hpTo + ' HP</b>. (Once per long rest.)');
};
// Long rest: Strength of the Grave can be used again. Rest | long | 50.
const graveReset = async () => {
    if (trigger.entity.getFlag('world', 'nixGraveUsed')) await trigger.entity.unsetFlag('world', 'nixGraveUsed');
};

// Beasts of Ill Omen: Midi Actor | preambleComplete | 50, on the feature.
const illOmen = async () => {
    if (workflow.item?.type !== 'spell') return;
    if (!(workflow.saveActivity || workflow.activity?.type === 'save' || workflow.activity?.save)) return;
    const me = workflow.token;
    if (!me) return;
    const beasts = canvas.tokens.placeables.filter(t => t.actor && t.id !== me.id
        && (t.document.flags?.world?.nixIllOmen || /bestial spirit|ill omen/i.test(t.name ?? ''))
        && t.document.disposition === me.document.disposition && (t.actor.system.attributes?.hp?.value ?? 0) > 0);
    if (!beasts.length) return;
    const foes = Array.from(workflow.targets ?? []).filter(t => t.actor && t.document.disposition !== me.document.disposition
        && beasts.some(b => tokenUtils.getDistance(b, t) <= 5));
    if (!foes.length) return;
    const spellUuid = workflow.item.uuid;
    const cleanup = async () => {
        const f = trigger.entity.flags.world?.nixIllOmen;
        if (f && workflow.item?.uuid === f.spellUuid) await genericUtils.remove(trigger.entity);
    };
    for (const t of foes) {
        await effectUtils.createEffect(t.actor, {
            name: 'Beast of Ill Omen', img: trigger.entity.img, origin: spellUuid, duration: {seconds: 6, turns: 1},
            changes: [{key: 'flags.midi-qol.disadvantage.ability.save.all', mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: '1', priority: 20}],
            description: 'Within 5 ft of a shadow beast: disadvantage on saves against ' + workflow.item.name + '.',
            flags: {world: {nixIllOmen: {spellUuid}}, 'chris-premades': {embeddedMacros: [
                {name: 'Ill Omen: done', type: 'midi-actor', pass: 'sceneRollFinished', priority: 50, macro: P.wrap(cleanup)}]}}
        });
    }
    await P.chat(workflow.actor, '<b>Beasts of Ill Omen:</b> ' + foes.map(t => t.document.name).join(', ')
        + ' save' + (foes.length === 1 ? 's' : '') + ' with disadvantage against ' + workflow.item.name + ' (next to her shadow beast).');
};

// Shadow Walk: Midi Item | rollFinished | 50.
const shadowWalk = async () => {
    const tok = workflow.token ?? actorUtils.getFirstToken(workflow.actor);
    if (!tok) return;
    const before = P.lightAt(tok);
    const TP = globalThis.chrisPremades?.Teleport;
    if (!TP?.target) return ui.notifications.warn('Shadow Walk: Chris\'s Premades\' teleport isn\'t available; move her token by hand (up to 120 ft).');
    await TP.target([tok], tok, {range: 120, animation: 'mistyStep'});
    await genericUtils.sleep(600);
    const after = canvas.tokens.get(tok.id);
    const there = after ? P.lightAt(after) : 'dark';
    const notes = [];
    if (before === 'bright') notes.push('she started in bright light');
    if (there === 'bright') notes.push('she arrived in bright light');
    await P.chat(workflow.actor, '<b>Shadow Walk:</b> ' + workflow.actor.name + ' steps into one shadow and out of another.'
        + (notes.length ? ' <i>Check the lighting: ' + notes.join(' and ') + '. Shadow Walk needs dim light or darkness at both ends.</i>' : ''));
};

// ===========================================================================
//  INSTALL
// ===========================================================================
const NAMES = /^(Umbral Form offer|Umbral Form use|Strength of the Grave \(2024\)|Strength of the Grave reset|Beasts of Ill Omen aura|Shadow Walk teleport)$/;
async function setMacros(doc, add) {
    const cur = doc.flags?.['chris-premades']?.embeddedMacros ?? [];
    await doc.setFlag('chris-premades', 'embeddedMacros', cur.filter(m => !NAMES.test(m.name ?? '')).concat(add));
}
const byName = re => actor.items.filter(i => re.test(i.name.trim()));
const ident = i => i?.flags?.['chris-premades']?.info?.identifier;

// ---- 1. Umbral Form ----------------------------------------------------------------
const innate = byName(/^innate sorcery$/i)[0];
const umbral = byName(/^umbral form$/i)[0];
if (!umbral) report.push('<li><b>Umbral Form</b> not found.</li>');
else if (!innate) report.push('<li><b>Innate Sorcery</b> not found: Umbral Form has nothing to ride on.</li>');
else {
    await setMacros(innate, [{name: 'Umbral Form offer', type: 'midi-item', pass: 'rollFinished', priority: 70, macro: P.wrap(umbralOffer)}]);
    await setMacros(umbral, [{name: 'Umbral Form use', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: P.wrap(umbralDirect)}]);
    report.push('<li>Umbral Form: offered when she uses Innate Sorcery (' + (umbral.system.uses?.value ?? 0) + ' free use left, else 6 Sorcery Points). Resistance to all but force and radiant until Innate Sorcery ends; 1d10 force if she ends her turn inside a creature.</li>');
}

// ---- 2. Strength of the Grave (2024) ---------------------------------------------------
const shadow = byName(/^power of shadow$/i)[0];
const graves = byName(/^strength of the grave/i);
const graveHost = shadow ?? graves[0];
if (!graveHost) report.push('<li><b>Power of Shadow / Strength of the Grave</b> not found.</li>');
else {
    for (const g of graves.filter(g => g.id !== graveHost.id)) {
        await g.delete();
        report.push('<li>Deleted the duplicate <b>' + g.name + '</b>' + (ident(g) ? ' (Chris\'s Premades 2014: 1 HP)' : '') + '.</li>');
    }
    if (graveHost !== shadow && Object.keys(graveHost.flags?.['chris-premades']?.macros ?? {}).length) {
        await graveHost.update({'flags.chris-premades.-=macros': null});
    }
    await setMacros(graveHost, [
        {name: 'Strength of the Grave (2024)', type: 'midi-actor', pass: 'targetApplyDamage', priority: 245, macro: P.wrap(grave)},
        {name: 'Strength of the Grave reset', type: 'rest', pass: 'long', priority: 50, macro: P.wrap(graveReset)}]);
    report.push('<li>Strength of the Grave (2024) on ' + graveHost.name + ': at 0 HP a Cha save (DC 5 + damage); success = '
        + Math.max(1, (actor.system.abilities.cha.mod ?? 0) + (actor.classes?.sorcerer?.system.levels ?? 0)) + ' HP. Once per long rest'
        + (graveHost.getFlag('world', 'nixGraveUsed') ? ' (<b>used: resets on her next long rest</b>)' : ' (ready)') + '.</li>');
}

// ---- 3. Beasts of Ill Omen ----------------------------------------------------------------
const omen = byName(/^beasts? of ill omen$/i)[0];
if (!omen) report.push('<li><b>Beasts of Ill Omen</b> not found.</li>');
else {
    await setMacros(omen, [{name: 'Beasts of Ill Omen aura', type: 'midi-actor', pass: 'preambleComplete', priority: 50, macro: P.wrap(illOmen)}]);
    report.push('<li>Beasts of Ill Omen: enemies within 5 ft of her Bestial Spirit save with disadvantage against her spells (the initial save; repeat saves by hand).</li>');
}
const summons = byName(/^summon beast$/i).filter(i => i.type === 'spell');
if (summons.length > 1) {
    const keep = summons.find(ident) ?? summons[0];
    for (const s of summons.filter(s => s.id !== keep.id)) await s.delete();
    report.push('<li>Deleted ' + (summons.length - 1) + ' duplicate Summon Beast (kept the ' + (ident(keep) ? 'Chris\'s Premades' : 'first') + ' copy).</li>');
}

// ---- 4. Shadow Walk ------------------------------------------------------------------------
const walk = byName(/^shadow walk$/i)[0];
if (!walk) report.push('<li><b>Shadow Walk</b> not found.</li>');
else {
    await setMacros(walk, [{name: 'Shadow Walk teleport', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: P.wrap(shadowWalk)}]);
    report.push('<li>Shadow Walk: pick a spot within 120 ft and she teleports; chat flags it if either end is in bright light.</li>');
}

await ChatMessage.create({whisper: [game.user.id], content: '<b>Petra fixes on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
