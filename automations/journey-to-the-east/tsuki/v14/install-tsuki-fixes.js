// =====================================================================
//  TSUKI FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Tsuki selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros for:
//   - Cosmic Omen: Weal / Woe pop-ups only when they can flip a roll (same fate stack as
//     Cordelia's Portent); today's omen from a 1d20 after each long rest or from the
//     feature's own "Cosmic Omen" activity. Ours rolls the d6 itself (no Chris's Premades).
//   - Elemental Fury: Potent Spellcasting = +Wis written into Druid cantrip damage (Vina's method)
//   - Luna: moved to "Familiars: Tsuki" for Chris's Premades 2's Find Familiar
//  Retired on v14: Wild Shape uses (Chris's Premades 2's Wild Shape spends the feature's uses).
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Tsuki fixes (v14): select Tsuki\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
const findAll = re => actor.items.filter(i => re.test(i.name.trim()));
const run = fn => 'return await (' + fn.toString() + ')();';
const entry = (name, event, pass, priority, fn, extra = {}) => ({name, event, pass, macros: [{priority, macro: run(fn), ...extra}]});
async function setCat(doc, names, add) {
    const list = foundry.utils.deepClone(doc.flags?.cat?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.update({'flags.cat.embeddedMacros': list.concat(add)});
}
async function dropOld(item, names) {
    const cpr = item.flags?.['chris-premades'] ?? {};
    const upd = {};
    const old = cpr.embeddedMacros ?? [];
    if (old.some(m => names.includes(m.name))) upd['flags.chris-premades.embeddedMacros'] = old.filter(m => !names.includes(m.name));
    for (const [id, list] of Object.entries(cpr.embeddedActivityMacros ?? {})) {
        if (list?.some(m => names.includes(m.name))) upd['flags.chris-premades.embeddedActivityMacros.' + id] = list.filter(m => !names.includes(m.name));
    }
    if (Object.keys(upd).length) await item.update(upd);
}
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update(data);
    return actByName(item, name);
}
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
// Leftovers worth a look: CPR1 tags, duplicate items, v13 effects on the actor.
function whatsLeft(skip = /^$/) {
    const later = [];
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1' && !skip.test(i.name));
    if (cpr1.length) later.push('Still tagged for Chris\'s Premades 1 (does nothing on v14; re-apply in the Medkit if Chris\'s Premades 2 has it): ' + cpr1.map(i => i.name).join(', ') + '.');
    const dupes = Object.entries(actor.items.contents.reduce((m, i) => ((m[i.type + '|' + i.name] = (m[i.type + '|' + i.name] ?? 0) + 1), m), {}))
        .filter(([k, n]) => n > 1 && !k.startsWith('class|')).map(([k, n]) => k.split('|')[1] + ' x' + n);
    if (dupes.length) later.push('Duplicate items (check which to delete; an innate and a prepared copy of a spell can both be right): ' + dupes.join(', ') + '.');
    const legacy = actor.items.filter(i => i.type === 'spell' && /\(legacy\)\s*$/i.test(i.name));
    if (legacy.length) later.push('Legacy (2014) spells still on the sheet: ' + legacy.map(i => i.name).join(', ') + '.');
    const stale = actor.effects.filter(e => e.flags?.['chris-premades'] && !e.flags?.cat && !e.disabled);
    if (stale.length) later.push('Effects on the actor from Chris\'s Premades 1 (inert on v14): ' + stale.map(e => e.name).join(', ') + '. Delete them before testing.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
// =====================================================================
//  Macros
// =====================================================================
 
// ---- FATE STACK ENGINE (shared by Tsuki's Cosmic Omen and Cordelia's Portent) ----------------
// Runs once per attack roll or saving throw, after Bardic Inspiration has had its chance.
// Order: Weal/Woe, then Portent. A pop-up only appears when that option could flip the result.
// kind: 'attack' | 'save'. rollerToken: a Token placeable. Returns the changed roll, or null.
const nixFate = async ({kind, roll, target, rollerToken}) => {
    if (!roll || !Number.isFinite(Number(target)) || !rollerToken?.actor) return null;
    target = Number(target);
    const OMEN_RANGE = 30;
    const d20Of = r => {
        const d = (r.dice ?? []).find(x => x.faces === 20) ?? r.terms?.[0];
        const kept = (d?.results ?? []).filter(x => x.active !== false && !x.discarded);
        return kept.length ? Number(kept[0].result) : Number(d?.total ?? 0);
    };
    const state = r => {
        const nat = d20Of(r);
        if (kind === 'attack') {
            if (nat === 1) return {ok: false, locked: true, nat};
            if (nat >= (r.options?.criticalSuccess ?? 20)) return {ok: true, crit: true, nat};
            return {ok: r.total >= target, nat};
        }
        return {ok: r.total >= target, nat};
    };
    const side = (helperTok, tok) => {
        const a = helperTok.document.disposition, b = tok.document.disposition;
        if (helperTok.id === tok.id || a === b) return 'friend';
        if (a !== 0 && b !== 0 && a === -b) return 'foe';
        return 'neutral';
    };
    // Replace the kept d20 with a value (Portent), keeping the roll's class, data and options.
    const replaceD20 = (r, v) => {
        const n = Roll.fromData(foundry.utils.deepClone(r.toJSON()));
        const d = n.dice.find(x => x.faces === 20);
        if (!d) return r;
        const kept = d.results.filter(x => x.active !== false && !x.discarded);
        if (kept[0]) kept[0].result = v;
        n._total = n._evaluateTotal();
        n.data = r.data;
        n.options = {...(r.options ?? {})};
        return n;
    };
    const addTo = async (r, n) => {
        const extra = await new Roll(String(n)).evaluate();
        const out = MidiQOL.addRollTo(r, extra);
        out.data = r.data;
        out.options = {...(r.options ?? {}), ...(out.options ?? {})};
        return out;
    };
    const ownerOf = a => queryUtils.firstOwner(a, true) ?? game.user.id;
    const inCombat = !!game.combat?.started;
    const label = kind === 'attack' ? 'attack roll' : 'saving throw';
    let current = roll;
    let changed = false;
 
    const helpers = [];
    for (const t of canvas.tokens.placeables) {
        if (!t.actor || t.document.hidden) continue;
        for (const it of t.actor.items) {
            const role = it.flags?.world?.nixFate;
            if (role) helpers.push({tok: t, item: it, role});
        }
    }
    helpers.sort((a, b) => (a.role === 'omen' ? 0 : 1) - (b.role === 'omen' ? 0 : 1));
 
    for (const h of helpers) {
        const me = h.tok.actor;
        if (MidiQOL.checkIncapacitated?.(me)) continue;
        const s = state(current);
        const rel = side(h.tok, rollerToken);
        const userId = ownerOf(me);
 
        // ---------- Cosmic Omen (Weal / Woe): reaction, 30 ft, 1d6 ----------
        if (h.role === 'omen') {
            const omen = h.item;
            const mode = omen.flags?.world?.nixOmenMode ?? null;
            if (!mode) continue;
            if (!(omen.system.uses?.value > 0)) continue;
            if (inCombat && actorUtils.hasUsedReaction(me)) continue;
            if (h.tok.id !== rollerToken.id && tokenUtils.getDistance(h.tok.document, rollerToken.document) > OMEN_RANGE) continue;
            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;
            let sign = 0;
            if (mode === 'weal' && rel === 'friend' && !s.ok && !s.locked && current.total + 6 >= target) sign = 1;
            if (mode === 'woe' && rel === 'foe' && s.ok && !s.crit && current.total - 6 < target) sign = -1;
            if (!sign) continue;
            const who = rollerToken.document.name;
            const text = sign > 0
                ? '<b>Weal:</b> ' + who + ' just failed a ' + label + ' (' + current.total + '). Use your reaction to add 1d6?'
                : '<b>Woe:</b> ' + who + ' just succeeded on a ' + label + ' (' + current.total + '). Use your reaction to subtract 1d6?';
            if (!await dialogUtils.confirm(omen.name, text, {userId})) continue;
            const r = await new Roll('1d6').evaluate();
            await r.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: omen.name + (sign > 0 ? ': Weal' : ': Woe')});
            await documentUtils.update(omen, {'system.uses.spent': (omen.system.uses.spent ?? 0) + 1});
            if (inCombat) await actorUtils.setReactionUsed(me);
            current = await addTo(current, sign * r.total);
            changed = true;
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
                content: '<b>' + omen.name + (sign > 0 ? ' (Weal)' : ' (Woe)') + ':</b> ' + (sign > 0 ? '+' : '-') + r.total + ' to '
                    + who + '\'s ' + label + ' (now ' + current.total + ').'});
            continue;
        }
 
        // ---------- Portent: replace the d20 with a foretelling roll ----------
        if (h.role === 'portent') {
            const portent = h.item;
            const dice = [...(portent.flags?.world?.nixPortent?.rolls ?? [])];
            if (!dice.length) continue;
            if (h.tok.id !== rollerToken.id && !tokenUtils.canSee(h.tok, rollerToken)) continue;
            const base = current.total - s.nat;
            let opts = [];
            if (rel === 'friend' && !s.ok) opts = dice.filter(v => v > 10 && base + v >= target);
            if (rel === 'foe' && s.ok) opts = dice.filter(v => v < 10 && base + v < target);
            opts = [...new Set(opts)].sort((a, b) => b - a);
            if (!opts.length) continue;
            const who = rollerToken.document.name;
            const head = rel === 'friend'
                ? who + ' just failed a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?'
                : who + ' just succeeded on a ' + label + ' (d20 showed ' + s.nat + '). Change Fate?';
            const pick = await dialogUtils.buttonDialog(portent.name + ': Change Fate', head,
                opts.map(v => ['Replace the d20 with your ' + v, String(v)]).concat([['Leave it', false]]), {userId});
            if (!pick) continue;
            const v = Number(pick);
            const left = [...dice];
            left.splice(left.indexOf(v), 1);
            await portent.setFlag('world', 'nixPortent', {...(portent.flags.world.nixPortent ?? {}), rolls: left});
            const shown = me.effects.find(e => e.flags?.world?.nixPortentShow);
            if (shown) await documentUtils.update(shown, {name: left.length ? 'Portent: ' + left.join(', ') : 'Portent: (all used)'});
            current = replaceD20(current, v);
            changed = true;
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}),
                content: '<b>' + portent.name + ': Change Fate.</b> ' + me.name + ' replaces ' + who + '\'s d20 with a <b>' + v
                    + '</b> (' + label + ' now ' + current.total + ').' + (left.length ? ' Foretold rolls left: ' + left.join(', ') + '.' : ' No foretold rolls left.')});
        }
    }
    return changed ? current : null;
};
// Attack rolls: roll / actorAttackRoll (the helper attacks) and sceneAttackRoll (anyone), priority 900,
// after Chris's Premades 2's own re-rolls (Seeking Spell 800). One run per workflow.
const fateAttack = async () => {
    if (!workflow?.attackRoll || workflow.nixFateDone || !workflow.targets?.size || !workflow.token) return;
    workflow.nixFateDone = true;
    const tgt = Array.from(workflow.targets).find(t => t.actor);
    if (!tgt) return;
    const ac = Number(tgt.actor.system.attributes?.ac?.value ?? 10);
    const res = await nixFate({kind: 'attack', roll: workflow.attackRoll, target: ac, rollerToken: workflow.token});
    if (res) await workflow.setAttackRoll(res);
};
// Saving throws: save / actorBonus (the helper's own save) and sceneBonus (anyone's), priority 300.
// Returning a Roll replaces the save (same as Blood Price). One run per roll.
const fateSave = async () => {
    const dc = Number(roll?.options?.target ?? config?.target);
    if (!roll || !dc || roll.options?.nixFate) return;
    roll.options.nixFate = true;
    const saver = config?.subject ?? (typeof actor !== 'undefined' ? actor : null);
    const tok = saver ? actorUtils.getFirstToken(saver)?.object : null;
    if (!tok) return;
    const res = await nixFate({kind: 'save', roll, target: dc, rollerToken: tok});
    if (!res) return;
    res.options.nixFate = true;
    return res;
};
const withFate = fn => 'return await (async () => {\nconst nixFate = ' + nixFate.toString() + ';\n    return await (' + fn.toString() + ')();\n})();';
const fateEntry = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: withFate(fn)}]});
const FATE_NAMES = ['Fate: attacks (own)', 'Fate: attacks (others)', 'Fate: saves (own)', 'Fate: saves (others)'];
// Install the fate stack on a helper's feature (Cosmic Omen = 'omen', Portent = 'portent').
async function installFate(item, role, extra = []) {
    await item.update({'flags.world.nixFate': role});
    await setCat(item, FATE_NAMES.concat(extra.map(e => e.name)), [
        fateEntry('Fate: attacks (own)', 'roll', 'actorAttackRoll', 900, fateAttack),
        fateEntry('Fate: attacks (others)', 'roll', 'sceneAttackRoll', 900, fateAttack),
        fateEntry('Fate: saves (own)', 'save', 'actorBonus', 300, fateSave),
        fateEntry('Fate: saves (others)', 'save', 'sceneBonus', 300, fateSave)].concat(extra));
    await dropOld(item, FATE_NAMES.concat(['Portent: long rest', 'Portent: foretell', 'Cosmic Omen: long rest']));
}
 
// ---- Cosmic Omen: today's omen (even = Weal, odd = Woe) ----------------------------------------
// rest / actorLong / 50 (asks first) and roll / activityRollFinished on the "Cosmic Omen" activity.
const omenRoll = async () => {
    const omen = document?.documentName === 'Item' ? document : (document?.item ?? document?.parent);
    const me = omen.actor;
    const wf = typeof workflow !== 'undefined' ? workflow : null;
    let total = Number(wf?.utilityRolls?.[0]?.total ?? wf?.utilityRoll?.total) || 0;
    if (!wf) {
        const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
        if (!await dialogUtils.confirm(omen.name, 'Long rest finished. Roll 1d20 for today\'s Cosmic Omen? (even = Weal, odd = Woe)', {userId})) return;
    }
    if (!total) {
        const r = await new Roll('1d20').evaluate();
        await r.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: omen.name + ': Weal or Woe'});
        total = r.total;
    }
    const mode = total % 2 ? 'woe' : 'weal';
    await omen.setFlag('world', 'nixOmenMode', mode);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + omen.name + ':</b> ' + total + ', today is <b>' + (mode === 'weal' ? 'Weal' : 'Woe') + '</b>.'});
};
 
// Familiar: Chris's Premades 2's Find Familiar (the v13 CPR1 config.folder / config.name flags are gone).
// Moves the familiar actor into its own folder and reports what Find Familiar is on the sheet.
async function familiar(famName, items) {
    const fam = game.actors.find(a => a.name === famName && a.type === 'npc') ?? game.actors.find(a => a.name === famName);
    const folderName = 'Familiars: ' + actor.name.split(' ')[0];
    let moved = false;
    if (fam) {
        const folder = game.folders.find(f => f.type === 'Actor' && f.name === folderName) ?? await Folder.create({name: folderName, type: 'Actor'});
        if (fam.folder?.id !== folder.id) { await fam.update({folder: folder.id}); moved = true; }
    }
    const cpr2 = items.filter(i => premadeOn(i) === 'cpr2');
    const stale = items.filter(i => premadeOn(i) === 'cpr1');
    report.push('<li>Familiar <b>' + famName + '</b>: ' + (fam ? (moved ? 'moved to' : 'in') + ' the Actors folder "' + folderName + '". ' : '<b>no actor named ' + famName + ' in the Actors sidebar.</b> ')
        + (cpr2.length ? 'Cast ' + cpr2[0].name + ' (Chris\'s Premades 2) and pick ' + famName + ' / that folder when it asks for the creature.' : '<b>Apply Chris\'s Premades 2\'s Find Familiar in the Medkit.</b>')
        + (stale.length ? ' <i>' + stale.length + ' old Find Familiar cop' + (stale.length > 1 ? 'ies' : 'y') + ' still tagged for Chris\'s Premades 1 (the v13 one that named ' + famName + '): delete it.</i>' : '') + '</li>');
}
// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Cosmic Omen ------------------------------------------------------------------------------
{
    const omen = find(/^cosmic omen/i);
    if (!omen) report.push('<li><b>Cosmic Omen</b> not found.</li>');
    else {
        await installFate(omen, 'omen', [entry('Cosmic Omen: long rest', 'rest', 'actorLong', 50, omenRoll)]);
        const main = omen.system.activities.contents.find(a => /^cosmic omen$/i.test(a.name ?? '')) ?? omen.system.activities.contents.find(a => a.roll?.formula === '1d20');
        if (main) await setCat(omen.system.activities.get(main.id), ['Cosmic Omen: roll'], [entry('Cosmic Omen: roll', 'roll', 'activityRollFinished', 50, omenRoll)]);
        // The old Chris's Premades 1 Weal / Woe activities are hidden helpers nobody reads on v14.
        const helpers = omen.system.activities.contents.filter(a => /^cosmic omen: (weal|woe)$/i.test(a.name ?? ''));
        const mode = omen.flags?.world?.nixOmenMode;
        report.push('<li>Cosmic Omen: after a long rest she gets a pop-up to roll 1d20 (even = Weal, odd = Woe); using the <b>' + (main?.name ?? 'Cosmic Omen') + '</b> activity sets it too. '
            + 'Reaction + one use per long rest (Wis mod), within 30 ft and in sight: <b>Weal</b> when a friendly creature fails an attack roll or save by 6 or less; '
            + '<b>Woe</b> when a hostile one succeeds by 5 or less (not on a critical hit). Today: ' + (mode ? '<b>' + mode + '</b>' : '<b>not rolled yet</b> (use the activity once)') + '.'
            + (premadeOn(omen) === 'cpr1' ? ' <i>Still tagged for Chris\'s Premades 1 (inert). <b>Don\'t apply a Medkit automation to it</b>: it would wipe these macros.'
                + (helpers.length ? ' Its "' + helpers.map(a => a.name).join('" / "') + '" activities are unused leftovers.' : '') + '</i>' : '') + '</li>');
    }
}
 
// ---- 2. Wild Shape (Chris's Premades 2) ----------------------------------------------------------
{
    const ws = actor.items.find(i => /^wild shape$/i.test(i.name.trim()) && i.system.uses?.max) ?? find(/^wild shape/i);
    if (!ws) report.push('<li><b>Wild Shape</b> not found.</li>');
    else {
        const change = ws.system.activities.contents.find(a => a.type === 'transform') ?? ws.system.activities.contents[0];
        const spends = (change?.consumption?.targets ?? []).some(t => t.type === 'itemUses');
        report.push('<li>Wild Shape: ' + (premadeOn(ws) === 'cpr2' ? 'Chris\'s Premades 2. ' : '<b>apply Chris\'s Premades 2\'s Wild Shape in the Medkit.</b> ')
            + (spends ? (change.name || 'Its transform activity') + ' spends the feature\'s own uses.' : '<b>' + (change?.name ?? 'The transform activity') + ' does not spend the feature\'s uses</b>: add an Item Uses consumption.') + '</li>');
    }
}
 
// ---- 3. Elemental Fury: Potent Spellcasting (data only) -------------------------------------------
{
    const furies = findAll(/^elemental fury/i);
    const keep = furies.find(i => /potent/i.test(i.name)) ?? furies[0];
    if (furies.length > 1) report.push('<li><i>Elemental Fury: ' + furies.length + ' copies (' + furies.map(i => '"' + i.name + '"').join(', ') + '); keep "' + keep.name + '".</i></li>');
    if (!keep) report.push('<li><b>Elemental Fury: Potent Spellcasting</b> not found.</li>');
    else if (premadeOn(keep) === 'cpr2') report.push('<li>Elemental Fury has Chris\'s Premades 2\'s automation: set it to None in the Medkit, or the +Wis we write into the cantrips is added twice. Then run this again.</li>');
    else {
        for (const e of keep.effects.filter(e => !e.disabled && (e.system?.changes ?? []).some(c => /damage/i.test(c.key)))) await e.update({disabled: true});
        const onlyDruid = Object.keys(actor.classes ?? {}).every(k => k === 'druid');
        const cantrips = actor.items.filter(i => i.type === 'spell' && Number(i.system.level) === 0 && (i.system.sourceClass === 'druid' || (!i.system.sourceClass && onlyDruid)));
        const done = [];
        for (const sp of cantrips) {
            let has = false;
            for (const act of sp.system.activities.contents) {
                const parts = act.toObject().damage?.parts;
                if (!parts?.length) continue;
                const p = parts[0];
                let changed = false;
                if (p.custom?.enabled) { if (!/wis\.mod/.test(p.custom.formula ?? '')) { p.custom.formula = (p.custom.formula || '0') + ' + @abilities.wis.mod'; changed = true; } }
                else if (!/wis\.mod/.test(p.bonus ?? '')) { p.bonus = (p.bonus ? p.bonus + ' + ' : '') + '@abilities.wis.mod'; changed = true; }
                if (changed) await act.update({'damage.parts': parts});
                has = true;
            }
            if (has) done.push(sp.name);
        }
        report.push('<li>Potent Spellcasting: +Wis (+' + actor.system.abilities.wis.mod + ') is part of the damage of ' + (done.join(', ') || 'no damaging Druid cantrips')
            + '. <b>Don\'t apply Chris\'s Premades 2\'s version</b> (it would add it again); re-run this after re-applying any of those cantrips in the Medkit.</li>');
    }
}
 
// ---- 4. Luna -----------------------------------------------------------------------------------
await familiar('Luna', actor.items.filter(i => i.type === 'spell' && /^find familiar$/i.test(i.name.trim())));
{
    const wc = find(/^wild companion/i);
    if (wc) report.push('<li>Wild Companion casts Find Familiar with a Wild Shape use (' + (premadeOn(wc) === 'cpr2' ? 'Chris\'s Premades 2' : 'not Chris\'s Premades 2') + '); Luna comes the same way.</li>');
}
 
// ---- 5. What's left ----------------------------------------------------------------------------
whatsLeft(/^(cosmic omen|elemental fury)/i);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Tsuki fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 