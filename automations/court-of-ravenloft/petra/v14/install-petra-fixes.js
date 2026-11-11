// =====================================================================
//  PETRA FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Shadow Sorcery 2024 (Ravenloft: The Horrors Within). Run by Nix Fix (or as a
//  Script macro with Petra selected, as GM). Safe to re-run. Run "Sorcerer core
//  (2024)" first (Metamagic, Innate Sorcery). Same behaviour as the v13 fixes:
//   - Umbral Form: offered when she uses Innate Sorcery (free use, or 6 Sorcery
//     Points). Resistance to everything but force and radiant while Innate Sorcery
//     lasts; 1d10 force if she ends her turn inside a creature. Her v14 Umbral Form
//     item's own "Innate Sorcery with Umbral Form" activity works too: it turns on
//     Innate Sorcery's effect and Umbral Form together.
//   - Strength of the Grave (2024), on Power of Shadow: at 0 HP (not killed outright),
//     Cha save DC 5 + damage; success: HP = Cha mod + Sorcerer level. Once per long
//     rest (Power of Shadow's own use). The 2014 Strength of the Grave item (Chris's
//     Premades 2's 1 HP version) is deleted (Revert restores it).
//   - Beasts of Ill Omen: enemies within 5 ft of her Bestial Spirit have disadvantage
//     on saves against her spells.
//   - Shadow Walk: Bonus Action teleport up to 120 ft (light check in chat).
//  v14 differences:
//   - CAT embedded macros; effects in v14 form; teleport through CAT (tokenUtils.teleportToken).
//   - The v14 sheet has two Summon Beast spells (one without concentration). v13 deleted
//     the duplicate; here it is only reported, so you can choose.
//   - Umbral Form's imported effect (Plutonium, switched off) is left alone; ours replaces it.
// =====================================================================

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Petra fixes (v14): select Petra\'s token first.');
if (!globalThis.cat?.utils) return ui.notifications.error('Petra fixes (v14): CAT is not active.');
const report = [];

// Helpers carried into each macro (P.wrap). Free names resolve in CAT's macro scope.
const P = (function nixShadow14() {
    const points = a => a?.items?.find(i => i.type === 'feat'
        && (/^sorcery points$/i.test(i.name.trim()) || i.system?.identifier === 'sorcery-points'));
    const chat = (a, html) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: a}), content: html});
    const owner = a => queryUtils.firstOwner(a, true) ?? game.user.id;
    const getFx = (a, id) => a?.effects?.find(e => e.flags?.cat?.identifier === id) ?? documentUtils.getEffectByIdentifier(a, id);
    const firstToken = a => { const t = actorUtils.getFirstToken(a); return t?.object ?? t; };
    const find = (list, search) => {
        if (!globalThis.Sequencer) return null;
        const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
        return list.find(ok) ?? (() => { try { return (Sequencer.Database.searchFor(search) ?? []).map(x => typeof x === 'string' ? x : x?.dbPath).find(ok); } catch { return null; } })();
    };
    // Westly's Cloak of the Bat light check: 'bright' | 'dim' | 'dark'. Best effort on v14.
    const lightAt = token => {
        try {
            const p = token.document.getCenterPoint?.() ?? token.center;
            const env = canvas.scene.environment ?? {};
            const dark = canvas.environment?.darknessLevel ?? env.darknessLevel ?? 0;
            const g = canvas.environment?.globalLightSource;
            const globalOn = g ? (g.active && !g.disabled && dark < 1)
                : (env.globalLight?.enabled && dark >= (env.globalLight?.darkness?.min ?? 0) && dark <= (env.globalLight?.darkness?.max ?? 1) && dark < 1);
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
        } catch { return 'unknown'; }
    };
    const innateEffect = a => a.effects.find(e => /innate sorcery/i.test(e.name) && !e.disabled && !e.transfer
        && !e.flags?.world?.nixUmbral);
    // Umbral Form for as long as Innate Sorcery lasts.
    const applyUmbral = async (me, innate, item) => {
        const old = getFx(me, 'nixUmbralForm');
        if (old) await documentUtils.deleteDocument(old);
        const types = Object.keys(CONFIG.DND5E.damageTypes ?? {}).filter(t => !['force', 'radiant'].includes(t));
        // combat / actorTurnEnd: ending her turn inside a creature.
        const turnEnd = async () => {
            const e = document;
            const me = e.parent;
            const tok = P.firstToken(me);
            if (!tok) return;
            const c = tok.center;
            const inside = canvas.tokens.placeables.find(t => t.id !== tok.id && t.actor && t.bounds?.contains?.(c.x, c.y));
            if (!inside) return;
            const roll = await new CONFIG.Dice.DamageRoll('1d10', {}, {type: 'force'}).evaluate();
            await workflowUtils.applyWorkflowDamage(tok.document, roll, 'force', [tok.document],
                {flavor: 'Umbral Form', sourceItem: {name: 'Umbral Form', img: e.img, type: 'feat'}});
            await P.chat(me, '<b>Umbral Form:</b> ' + me.name + ' ends her turn inside ' + inside.document.name + ' and takes ' + roll.total + ' force damage.');
        };
        const animOn = async () => {
            const tok = P.firstToken(document.parent);
            if (!tok || !globalThis.Sequence) return;
            const f = P.find(['jb2a.energy_strands.overlay.dark_purple', 'jb2a.extras.tmfx.outflow.circle.01', 'jb2a.darkness.black'], 'darkness');
            if (f) await new Sequence().effect().file(f).attachTo(tok).scaleToObject(1.6).opacity(0.6).belowTokens()
                .fadeIn(600).fadeOut(600).persist().name('Umbral Form ' + document.parent.id).play();
        };
        const animOff = async () => {
            if (globalThis.Sequencer) await Sequencer.EffectManager.endEffects({name: 'Umbral Form ' + document.parent.id});
        };
        const dur = innate?.duration?.value ? {value: innate.duration.value, units: innate.duration.units ?? 'seconds'} : {value: 60, units: 'seconds'};
        const [eff] = await effectUtils.createEffects(me, [{
            name: 'Umbral Form', img: item?.img ?? 'icons/magic/perception/shadow-stealth-eyes-purple.webp', origin: item?.uuid, duration: dur,
            system: {changes: types.map(t => ({key: 'system.traits.dr.value', type: 'add', value: t, priority: 20}))},
            description: 'Shadow Resilience: resistance to all damage except force and radiant. Incorporeal Movement: move through creatures and objects as difficult terrain; 1d10 force if she ends her turn inside one (creatures are checked automatically, objects by hand). Ends with Innate Sorcery.',
            flags: {world: {nixUmbral: true}, cat: {identifier: 'nixUmbralForm', embeddedMacros: [
                {name: 'Umbral Form: inside', event: 'combat', pass: 'actorTurnEnd', macros: [{priority: 50, macro: wrap(turnEnd)}]},
                {name: 'Umbral Form: shadow', event: 'effect', pass: 'created', macros: [{priority: 50, macro: wrap(animOn)}]},
                {name: 'Umbral Form: fade', event: 'effect', pass: 'deleted', macros: [{priority: 50, macro: wrap(animOff)}]}]}}
        }]) ?? [];
        if (innate && eff) await documentUtils.makeDependent(innate, [eff]);
        await P.chat(me, '<b>Umbral Form:</b> ' + me.name + ' becomes living shadow: resistant to all damage but force and radiant, able to pass through creatures and objects.');
    };
    const wrap = fn => 'const P = (' + nixShadow14.toString() + ')();\nreturn await (' + fn.toString() + ')();';
    return {points, chat, owner, getFx, firstToken, find, lightAt, innateEffect, applyUmbral, wrap};
})();
const entry = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: P.wrap(fn)}]});

// ===========================================================================
//  MACROS
// ===========================================================================

// Innate Sorcery: roll / itemRollFinished / 70 -> offer Umbral Form.
const umbralOffer = async () => {
    const me = workflow.actor;
    const umbral = me.items.find(i => /^umbral form$/i.test(i.name.trim()));
    if (!umbral) return;
    let innate;
    for (let i = 0; i < 10 && !innate; i++) {
        innate = P.innateEffect(me);
        if (!innate) await genericUtils.sleep(200);
    }
    if (!innate || P.getFx(me, 'nixUmbralForm')) return;
    const free = umbral.system.uses?.max ? (umbral.system.uses.value ?? 0) : 0;
    const pts = P.points(me);
    const sp = pts?.system.uses?.value ?? 0;
    if (!free && sp < 6) return;
    const buttons = [];
    if (free) buttons.push(['Yes (' + free + ' use left)', 'free']);
    if (sp >= 6) buttons.push(['Yes, spend 6 Sorcery Points (' + sp + ' left)', 'points']);
    buttons.push(['No', false]);
    const pick = await dialogUtils.buttonDialog(umbral.name, 'Innate Sorcery is active. Adopt Umbral Form while it lasts?', buttons, {userId: P.owner(me)});
    if (!pick) return;
    if (pick === 'free') await documentUtils.update(umbral, {'system.uses.spent': (umbral.system.uses.spent ?? 0) + 1});
    else await documentUtils.update(pts, {'system.uses.spent': (pts.system.uses.spent ?? 0) + 6});
    await P.applyUmbral(me, innate, umbral);
};

// Umbral Form's "Innate Sorcery with Umbral Form" activity: activity / activityRollFinished / 50.
// The activity spends Innate Sorcery's use and its own; Innate Sorcery's effect is turned on here.
const umbralDirect = async () => {
    const me = workflow.actor;
    const umbral = workflow.item;
    let innate = P.innateEffect(me);
    if (!innate) {
        const src = me.items.find(i => /^innate sorcery$/i.test(i.name.trim()));
        const base = src?.effects?.find(e => !e.transfer) ?? src?.effects?.contents?.[0];
        if (!base) return ui.notifications.warn('Umbral Form: Innate Sorcery (with its effect) not found; turn it on by hand.');
        const data = base.toObject();
        delete data._id;
        data.transfer = false;
        data.disabled = false;
        data.origin = src.uuid;
        data.duration = {value: 60, units: 'seconds'};
        [innate] = await effectUtils.createEffects(me, [data]) ?? [];
    }
    if (!innate) return;
    await P.applyUmbral(me, innate, umbral);
};

// Strength of the Grave (2024): roll / targetDamageComplete / 150, on Power of Shadow.
// Uses Power of Shadow's own use (1 per long rest).
const grave = async () => {
    const host = document;
    const me = host.parent;
    if (!ditem || !me || (targetToken?.actor && targetToken.actor.uuid !== me.uuid)) return;
    if (!((ditem.oldHP ?? 0) > 0)) return;
    const resulting = (ditem.oldHP ?? 0) + (ditem.oldTempHP ?? 0) - (ditem.totalDamage ?? 0);
    if (resulting > 0) return;
    if (host.system.uses?.max && !(host.system.uses.value > 0)) return;
    const dmg = Number(ditem.totalDamage ?? 0);
    const max = me.system.attributes.hp.effectiveMax ?? me.system.attributes.hp.max ?? 0;
    if (max && resulting <= -max) return P.chat(me, '<b>Strength of the Grave:</b> the blow kills ' + me.name + ' outright; the shadow can\'t hold her.');
    const dc = 5 + dmg;
    const level = me.classes?.sorcerer?.system.levels ?? me.system.details?.level ?? 0;
    const hpTo = Math.max(1, (me.system.abilities.cha.mod ?? 0) + level);
    let total;
    try {
        const r = await me.rollSavingThrow({ability: 'cha', target: dc}, {configure: false});
        total = (Array.isArray(r) ? r[0] : r)?.total;
    } catch (err) { console.warn('Strength of the Grave', err); }
    if (total === undefined) return;
    if (total < dc) return P.chat(me, '<b>Strength of the Grave:</b> ' + me.name + ' rolls ' + total + ' against DC ' + dc + ' and falls.');
    workflowUtils.preventZeroHP(ditem, {targetHP: hpTo});
    if (host.system.uses?.max) await documentUtils.update(host, {'system.uses.spent': (host.system.uses.spent ?? 0) + 1});
    await P.chat(me, '<b>Strength of the Grave:</b> ' + me.name + ' rolls ' + total + ' against DC ' + dc
        + ' and refuses to fall: she is at <b>' + hpTo + ' HP</b>. (Once per long rest.)');
};

// Beasts of Ill Omen: roll / actorPreambleComplete / 50, on the feature.
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
        && beasts.some(b => tokenUtils.getDistance(b.document, t.document) <= 5));
    if (!foes.length) return;
    const spellUuid = workflow.item.uuid;
    // roll / targetRollFinished on the foe's effect: gone when the spell finishes.
    const cleanup = async () => {
        const f = document.flags.world?.nixIllOmen;
        if (f && workflow.item?.uuid === f.spellUuid) await documentUtils.deleteDocument(document);
    };
    for (const t of foes) {
        await effectUtils.createEffects(t.actor, [{
            name: 'Beast of Ill Omen', img: document.img, origin: spellUuid, duration: {value: 1, units: 'turns'},
            system: {changes: [{key: 'flags.midi-qol.disadvantage.ability.save.all', type: 'custom', value: '1', priority: 20}]},
            description: 'Within 5 ft of a shadow beast: disadvantage on saves against ' + workflow.item.name + '.',
            flags: {world: {nixIllOmen: {spellUuid}}, cat: {identifier: 'nixIllOmen', embeddedMacros: [
                {name: 'Ill Omen: done', event: 'roll', pass: 'targetRollFinished', macros: [{priority: 50, macro: P.wrap(cleanup)}]}]}}
        }]);
    }
    await P.chat(workflow.actor, '<b>Beasts of Ill Omen:</b> ' + foes.map(t => t.document.name).join(', ')
        + ' save' + (foes.length === 1 ? 's' : '') + ' with disadvantage against ' + workflow.item.name + ' (next to her shadow beast).');
};

// Shadow Walk: roll / itemRollFinished / 50.
const shadowWalk = async () => {
    const tok = workflow.token ?? P.firstToken(workflow.actor);
    if (!tok) return;
    const before = P.lightAt(tok);
    let anim;
    try { anim = animationUtils.getAnimation({source: 'chris-premades', identifier: 'mistyStep'}); } catch { anim = undefined; }
    await tokenUtils.teleportToken(tok.document, {range: 120, animation: anim});
    await genericUtils.sleep(600);
    const after = canvas.tokens.get(tok.id);
    const there = after ? P.lightAt(after) : 'unknown';
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
async function setCat(doc, add) {
    const cur = doc.flags?.cat?.embeddedMacros ?? [];
    await doc.update({'flags.cat.embeddedMacros': cur.filter(m => !NAMES.test(m.name ?? '')).concat(add)});
    const old = doc.flags?.['chris-premades']?.embeddedMacros;
    if (old?.some(m => NAMES.test(m.name ?? ''))) await doc.update({'flags.chris-premades.embeddedMacros': old.filter(m => !NAMES.test(m.name ?? ''))});
}
async function setActCat(item, act, add) {
    const cur = act.flags?.cat?.embeddedMacros ?? [];
    await item.update({['system.activities.' + act.id + '.flags.cat.embeddedMacros']: cur.filter(m => !NAMES.test(m.name ?? '')).concat(add)});
}
const byName = re => actor.items.filter(i => re.test(i.name.trim()));
const premade = i => Object.values(i?.flags?.cat?.macros ?? {}).flat().some(m => m?.source === 'chris-premades') || i?.flags?.cat?.automation?.source === 'chris-premades';

// ---- 1. Umbral Form ----------------------------------------------------------------
const innate = byName(/^innate sorcery$/i)[0];
const umbral = byName(/^umbral form$/i)[0];
if (!umbral) report.push('<li><b>Umbral Form</b> not found.</li>');
else if (!innate) report.push('<li><b>Innate Sorcery</b> not found: Umbral Form has nothing to ride on.</li>');
else {
    await setCat(innate, [entry('Umbral Form offer', 'roll', 'itemRollFinished', 70, umbralOffer)]);
    const acts = umbral.system.activities?.contents ?? [];
    const direct = acts.find(a => (a.consumption?.targets ?? []).some(t => t.target === innate.id))
        ?? acts.find(a => !/restore/i.test(a.name ?? '') && a.type === 'utility');
    const notes = [];
    if (direct) {
        await setCat(umbral, []);
        await setActCat(umbral, direct, [entry('Umbral Form use', 'roll', 'activityRollFinished', 50, umbralDirect)]);
        notes.push('its "' + (direct.name || 'use') + '" activity turns on Innate Sorcery and Umbral Form together');
    }
    if (acts.some(a => /restore/i.test(a.name ?? ''))) notes.push('"Restore Use" (6 Sorcery Points) refills its use');
    report.push('<li>Umbral Form: offered when she uses Innate Sorcery (' + (umbral.system.uses?.value ?? 0) + ' free use left, else 6 Sorcery Points). '
        + 'Resistance to all but force and radiant until Innate Sorcery ends; 1d10 force if she ends her turn inside a creature'
        + (notes.length ? '. Also: ' + notes.join('; ') : '') + '.</li>');
}

// ---- 2. Strength of the Grave (2024) ---------------------------------------------------
const shadow = byName(/^power of shadow$/i)[0];
const graves = byName(/^strength of the grave/i);
const graveHost = shadow ?? graves[0];
if (!graveHost) report.push('<li><b>Power of Shadow / Strength of the Grave</b> not found.</li>');
else {
    for (const g of graves.filter(g => g.id !== graveHost.id)) {
        await g.delete();
        report.push('<li>Deleted the duplicate <b>' + g.name + '</b>' + (premade(g) ? ' (Chris\'s Premades 2\'s 2014 version: 1 HP, no crits or radiant)' : '') + '.</li>');
    }
    if (graveHost !== shadow && premade(graveHost)) report.push('<li><b>' + graveHost.name + '</b> also has a Chris\'s Premades 2 automation: set it to None in the Medkit.</li>');
    await setCat(graveHost, [entry('Strength of the Grave (2024)', 'roll', 'targetDamageComplete', 150, grave)]);
    const hasUse = !!graveHost.system.uses?.max;
    report.push('<li>Strength of the Grave (2024) on ' + graveHost.name + ': at 0 HP a Cha save (DC 5 + damage); success = '
        + Math.max(1, (actor.system.abilities.cha.mod ?? 0) + (actor.classes?.sorcerer?.system.levels ?? 0)) + ' HP. '
        + (hasUse ? 'Spends ' + graveHost.name + '\'s use (' + (graveHost.system.uses.value ?? 0) + ' left, back on a long rest).' : '<b>' + graveHost.name + ' has no uses: it works every time until you give it 1 use per long rest.</b>') + '</li>');
}

// ---- 3. Beasts of Ill Omen ----------------------------------------------------------------
const omen = byName(/^beasts? of ill omen$/i)[0];
if (!omen) report.push('<li><b>Beasts of Ill Omen</b> not found.</li>');
else {
    await setCat(omen, [entry('Beasts of Ill Omen aura', 'roll', 'actorPreambleComplete', 50, illOmen)]);
    report.push('<li>Beasts of Ill Omen: enemies within 5 ft of her Bestial Spirit save with disadvantage against her spells (the initial save; repeat saves by hand).</li>');
}
const summons = byName(/^summon beast$/i).filter(i => i.type === 'spell');
if (summons.length > 1) {
    const noConc = summons.filter(s => (s.effects?.contents ?? []).some(e => (e.system?.changes ?? []).some(c => c.key === 'system.properties' && /-concentration/.test(String(c.value)))));
    report.push('<li><i>Two Summon Beast spells' + (noConc.length === 1 ? ' (one without concentration, probably the Beasts of Ill Omen version)' : '')
        + '. Not deleted on v14: delete the one you don\'t want.</i></li>');
}

// ---- 4. Shadow Walk ------------------------------------------------------------------------
const walk = byName(/^shadow walk$/i)[0];
if (!walk) report.push('<li><b>Shadow Walk</b> not found.</li>');
else {
    await setCat(walk, [entry('Shadow Walk teleport', 'roll', 'itemRollFinished', 50, shadowWalk)]);
    report.push('<li>Shadow Walk: pick a spot within 120 ft and she teleports; chat flags it if either end is in bright light.</li>');
}

await ChatMessage.create({whisper: [game.user.id], content: '<b>Petra fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
