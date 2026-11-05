// =====================================================================
//  CORDELIA FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Cordelia selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros for:
//   - Portent: "Change Fate" pop-ups on attack rolls (actor/sceneAttackRoll 900) and
//     saving throws (save actor/sceneBonus 300), last in the stack after Weal/Woe;
//     foretelling d20s after each long rest (rest / actorLong) or from Foretell
//   - Expert Divination: regain a lower slot after casting a Divination spell
//   - Kai: moved to "Familiars: Cordelia" for Chris's Premades 2's Find Familiar
//  Retired on v14: the Legacy -> 2024 swap of Fog Cloud / Gust of Wind / Water Walk
//  (the sheet has the 2024 spells; Chris's Premades 2 automates Fog Cloud and Gust of Wind).
//  Counterspell / Far Step come from the Counterspell WORLD installer.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Cordelia fixes (v14): select Cordelia\'s token first.');
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
 
// ---- Portent: roll the foretelling dice (2, or 3 from Wizard 14) --------------------------------
// rest / actorLong / 50 (document = Portent) and the Foretell activity (activityRollFinished).
const portentRoll = async () => {
    const portent = document?.documentName === 'Item' ? document : (document?.item ?? document?.parent);
    const me = portent.actor;
    const wiz = me.classes?.wizard?.system.levels ?? 0;
    const count = wiz >= 14 ? 3 : 2;
    const r = await new Roll(count + 'd20').evaluate();
    await r.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: portent.name + ': foretelling rolls'}, {rollMode: 'gmroll'});
    const rolls = r.dice[0].results.map(x => Number(x.result));
    await portent.setFlag('world', 'nixPortent', {rolls, rolledAt: Date.now()});
    const name = 'Portent: ' + rolls.join(', ');
    const shown = me.effects.find(e => e.flags?.world?.nixPortentShow);
    if (shown) await documentUtils.update(shown, {name});
    else await effectUtils.createEffects(me, [{name, img: portent.img, origin: portent.uuid, transfer: false,
        description: 'Foretold d20 rolls. Above 10: offered when you or an ally fails an attack roll or saving throw. Below 10: offered when a hostile creature succeeds on one.',
        flags: {world: {nixPortentShow: true}, cat: {identifier: 'nixPortentShow'}}}]);
    await ChatMessage.create({whisper: game.users.filter(u => u.isGM || me.testUserPermission(u, 'OWNER')).map(u => u.id),
        speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + portent.name + ':</b> ' + me.name + ' foretells <b>' + rolls.join(', ') + '</b>.'});
};
 
// ---- Expert Divination: roll / actorRollFinished / 60 --------------------------------------------
const expertDivination = async () => {
    const feat = document;
    const sp = workflow.item;
    if (sp?.type !== 'spell' || sp.system.school !== 'div') return;
    const method = sp.system.method ?? sp.system.preparation?.mode;
    if (['innate', 'atwill', 'ritual', 'pact'].includes(method)) return;
    const lvl = Number(workflowUtils.getCastLevel?.(workflow) ?? workflow.castData?.castLevel ?? sp.system.level);
    if (!(lvl >= 2)) return;
    const me = workflow.actor;
    const opts = [];
    for (let l = Math.min(lvl - 1, 5); l >= 1; l--) {
        const s = me.system.spells?.['spell' + l];
        if (s && (s.max ?? 0) > 0 && s.value < s.max) opts.push(l);
    }
    if (!opts.length) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
    const pick = opts.length === 1 ? String(opts[0]) : await dialogUtils.buttonDialog(feat.name,
        'You cast ' + sp.name + ' at ' + ord(lvl) + ' level. Regain which expended spell slot?',
        opts.map(l => [ord(l) + '-level slot (' + me.system.spells['spell' + l].value + '/' + me.system.spells['spell' + l].max + ')', String(l)]), {userId});
    if (!pick) return;
    const key = 'spell' + pick;
    await documentUtils.update(me, {['system.spells.' + key + '.value']: me.system.spells[key].value + 1});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + feat.name + ':</b> ' + me.name + ' regains a ' + ord(Number(pick)) + '-level spell slot.'});
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
 
// ---- 1. 2024 spells (the v13 Legacy swap is done) ---------------------------------------------------
{
    const names = ['Fog Cloud', 'Gust of Wind', 'Water Walk'];
    const bits = names.map(n => {
        const all = actor.items.filter(i => i.type === 'spell' && lc(i.name) === lc(n));
        if (!all.length) return null;
        const how = all.map(i => (i.system.method ?? '?') + (premadeOn(i) === 'cpr2' ? ', CPR2' : ''));
        return n + ' (' + how.join(' / ') + ')';
    }).filter(Boolean);
    report.push('<li>2024 spells on the sheet: ' + (bits.join(', ') || 'none') + '. Chris\'s Premades 2 automates Fog Cloud and Gust of Wind; nothing for us to do.</li>');
}
 
// ---- 2. Portent ----------------------------------------------------------------------------------
{
    const portent = find(/^portent/i);
    if (!portent) report.push('<li><b>Portent</b> not found.</li>');
    else {
        await installFate(portent, 'portent', [entry('Portent: long rest', 'rest', 'actorLong', 50, portentRoll)]);
        const fore = await ensureActivity(portent, 'Foretell (roll Portent dice)', 'utility', {
            img: portent.img, activation: {type: 'special', value: null, override: true}, consumption: {targets: [], scaling: {allowed: false}},
            range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true},
            description: {chatFlavor: 'Roll the foretelling d20s for today (normally done automatically after a long rest).'}});
        if (fore) await setCat(fore, ['Portent: foretell'], [entry('Portent: foretell', 'roll', 'activityRollFinished', 50, portentRoll)]);
        const have = portent.flags?.world?.nixPortent?.rolls ?? [];
        const gambit = portent.flags?.['chris-premades']?.info?.source === 'gambits-premades' || portent.flags?.['gambits-premades'];
        report.push('<li>Portent: after each long rest her ' + ((actor.classes?.wizard?.system.levels ?? 0) >= 14 ? 'three' : 'two') + ' foretelling d20s are rolled and shown as an effect (\"Portent: 14, 16\"). '
            + 'A roll <b>above 10</b> is offered (<i>Change Fate</i>) when she or an ally fails an attack roll or saving throw and it would turn it into a success; '
            + 'a roll <b>below 10</b> when a hostile creature succeeds and it would make it fail. Order: Bardic Inspiration, Tsuki\'s Weal/Woe, then Portent. '
            + (have.length ? 'Current rolls (kept from v13): ' + have.join(', ') + '.' : '<b>No rolls stored yet: click Portent > \"Foretell (roll Portent dice)\" once.</b>')
            + (gambit ? ' <i>Portent carries a Gambit\'s Premades tag: if Gambit\'s own Portent prompt also appears, turn it off.</i>' : '') + '</li>');
    }
}
 
// ---- 3. Expert Divination --------------------------------------------------------------------------
{
    const ed = find(/^expert divination/i);
    if (!ed) report.push('<li><b>Expert Divination</b> not found.</li>');
    else {
        await setCat(ed, ['Expert Divination'], [entry('Expert Divination', 'roll', 'actorRollFinished', 60, expertDivination)]);
        await dropOld(ed, ['Expert Divination']);
        report.push('<li>Expert Divination: after she casts a Divination spell of 2nd level or higher with a slot, she picks an expended slot of a lower level (5th at most) to regain.</li>');
    }
}
 
// ---- 4. Kai --------------------------------------------------------------------------------------
await familiar('Kai', actor.items.filter(i => i.type === 'spell' && /^find familiar$/i.test(i.name.trim())));
 
// ---- 5. What's left --------------------------------------------------------------------------------
whatsLeft(/^(portent|expert divination)/i);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Cordelia fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 