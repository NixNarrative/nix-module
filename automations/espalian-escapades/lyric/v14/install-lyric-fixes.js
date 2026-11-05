// =====================================================================
//  LYRIC EPISTÍMONAS FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Lyric selected, as GM). Safe to re-run.
//
//   - Renames "Michela character" to Lyric Epistímonas (actor, prototype token, placed tokens)
//   - Fey Step (Summer): fire damage = Wisdom modifier (data only)
//   - Trance: rest / actorLong 50 on Trance + roll / activityRollFinished 50 on "Change Season &
//     Proficiencies": season + two weapon/tool proficiencies until the next long rest (DialogV2)
//   - Fey Step season riders: roll / activityPreTargeting 10 on each rider (return true stops it)
//   - Starry Form / Wild Companion / Absorb Elements / Wild Shape: Chris's Premades 2 (Medkit);
//     the installer checks they spend Wild Shape and says what's missing
//  Retired on v14: the Chris's Premades 1 itemUpdate calls (apply in the Medkit instead) and the
//  Wild Shape single-counter fix (Chris's Premades 2's Wild Shape spends the feature's uses).
// =====================================================================

const NAME = 'Lyric Epistímonas';
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Lyric fixes (v14): select Lyric\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
const run = fn => 'return await (' + fn.toString() + ')();';
const entry = (name, event, pass, priority, fn) => ({name, event, pass, macros: [{priority, macro: run(fn)}]});
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
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
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

// Trance (Eladrin): rest / actorLong / 50 on Trance (document = the item), and roll /
// activityRollFinished / 50 on its "Change Season & Proficiencies" activity. Pick the season
// (or roll), then two weapon/tool proficiencies that last until the next long rest.
const trance = async () => {
    const d = typeof document !== 'undefined' ? document : null;
    const wf = typeof workflow !== 'undefined' ? workflow : null;
    const item = d?.documentName === 'Item' ? d : (d?.item ?? wf?.item);
    const me = item?.actor;
    if (!me) return;
    const SEASONS = {autumn: 'Autumn', winter: 'Winter', spring: 'Spring', summer: 'Summer'};
    const BLURB = {autumn: 'peace and goodwill: Fey Step can Charm creatures near you',
        winter: 'contemplation and dolor: Fey Step can Frighten a creature near you',
        spring: 'cheerfulness: Fey Step can teleport a willing creature instead of you',
        summer: 'boldness: Fey Step deals fire damage to creatures near where you appear'};
    const cur = me.flags?.world?.nixSeason ?? (Object.keys(SEASONS).find(k => me.items.some(i => /^eladrin season/i.test(i.name) && new RegExp(k, 'i').test(i.name))) ?? 'summer');
    const label = async (uuid, key) => { try { return (await dnd5e.documents.Trait.getBaseItem(uuid, {indexOnly: true}))?.name ?? key; } catch { return key; } };
    const opts = [];
    const wp = new Set(me.system.traits?.weaponProf?.value ?? []);
    for (const [k, u] of Object.entries(CONFIG.DND5E.weaponIds ?? {})) if (!wp.has(k)) opts.push({value: 'weapon:' + k, label: 'Weapon: ' + await label(u, k)});
    for (const [k, u] of Object.entries(CONFIG.DND5E.toolIds ?? {})) if (!(me.system.tools?.[k]?.value >= 1) || me.effects.some(e => e.flags?.world?.nixTrance && (e.system?.changes ?? []).some(c => c.key === 'system.tools.' + k + '.value')))
        opts.push({value: 'tool:' + k, label: 'Tool: ' + await label(u, k)});
    opts.sort((a, b) => a.label.localeCompare(b.label));
    const esc = s => foundry.utils.escapeHTML(String(s ?? ''));
    const select = (name, list, value) => '<select name="' + name + '">' + list.map(o => '<option value="' + esc(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
    const seasonOpts = Object.entries(SEASONS).map(([k, v]) => ({value: k, label: v + ' (' + BLURB[k] + ')'})).concat([{value: 'roll', label: 'Roll for it (1d4)'}]);
    const none = [{value: '', label: '(none)'}];
    const group = (l, html) => '<div class="form-group"><label>' + l + '</label><div class="form-fields">' + html + '</div></div>';
    const content = '<p>Your trance ends. Choose your season and two proficiencies drawn from shared elven memory (they last until your next long rest).</p>'
        + group('Season', select('season', seasonOpts, cur)) + group('Proficiency 1', select('p1', none.concat(opts), '')) + group('Proficiency 2', select('p2', none.concat(opts), ''));
    // Shown to whoever's client runs the rest or clicks the activity (usually her player).
    const res = await foundry.applications.api.DialogV2.prompt({
        window: {title: item.name}, position: {width: 560}, content, rejectClose: false,
        ok: {label: 'OK', callback: (event, button) => { const f = button.form.elements; return {season: f.season.value, p1: f.p1.value, p2: f.p2.value}; }}});
    if (!res) return;
    // Old Trance proficiencies end now.
    for (const e of me.effects.filter(e => e.flags?.world?.nixTrance)) await documentUtils.deleteDocument(e);
    let season = res.season || cur;
    if (season === 'roll') {
        const r = await new Roll('1d4').evaluate();
        await r.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: 'Eladrin Season (1 Autumn, 2 Winter, 3 Spring, 4 Summer)'});
        season = ['autumn', 'winter', 'spring', 'summer'][r.total - 1];
    }
    await documentUtils.update(me, {'flags.world.nixSeason': season});
    const S = SEASONS[season];
    const es = me.items.find(i => /^eladrin season/i.test(i.name.trim()));
    if (es) await documentUtils.update(es, {name: 'Eladrin Season: ' + S});
    const fs = me.items.find(i => /^fey step/i.test(i.name.trim()));
    if (fs) { const tail = (fs.name.match(/ - (.+)$/) ?? [])[1]; await documentUtils.update(fs, {name: 'Fey Step: ' + S + (tail ? ' - ' + tail : '')}); }
    const picks = [...new Set([res.p1, res.p2].filter(Boolean))];
    const changes = [];
    const names = [];
    for (const p of picks) {
        const [kind, key] = p.split(':');
        names.push(opts.find(o => o.value === p)?.label.replace(/^(Weapon|Tool): /, '') ?? key);
        if (kind === 'weapon') changes.push({key: 'system.traits.weaponProf.value', type: 'add', value: key, priority: 20});
        else {
            changes.push({key: 'system.tools.' + key + '.value', type: 'upgrade', value: '1', priority: 20});
            if (!me.system.tools?.[key]?.ability) changes.push({key: 'system.tools.' + key + '.ability', type: 'override', value: CONFIG.DND5E.tools?.[key]?.ability ?? 'int', priority: 20});
        }
    }
    if (changes.length) await effectUtils.createEffects(me, [{name: 'Trance: ' + names.join(', '), img: item.img, origin: item.uuid,
        description: 'Proficiency drawn from shared elven memory, until the next long rest.', system: {changes}, flags: {world: {nixTrance: true}, cat: {identifier: 'nixTrance'}}}]);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + item.name + ':</b> ' + me.name + '\'s season is now <b>' + S + '</b> (' + BLURB[season] + ').'
        + (names.length ? ' Proficient until her next long rest: <b>' + names.join('</b> and <b>') + '</b>.' : '')});
};

// Fey Step season riders: roll / activityPreTargeting / 10 on each rider activity.
// No workflow yet at this pass: read actor + the activity. Returning true stops the use.
const seasonGate = async () => {
    const act = (typeof activity !== 'undefined' && activity) || (typeof document !== 'undefined' ? document : null);
    const me = (typeof actor !== 'undefined' && actor) || act?.actor;
    if (!act || !me) return;
    const season = me.flags?.world?.nixSeason ?? 'summer';
    const tag = ['autumn', 'winter', 'spring', 'summer'].find(s => String(act.name ?? '').toLowerCase().includes(s));
    if (!tag || tag === season) return;
    const cap = s => s[0].toUpperCase() + s.slice(1);
    ui.notifications.warn((act.item?.name ?? 'Fey Step') + ': her season is ' + cap(season) + ', so the ' + cap(tag) + ' rider is not available. Change season in Trance after a long rest.');
    return true;
};
// =====================================================================
//  Install
// =====================================================================

// ---- 1. Name ----------------------------------------------------------------------------------
{
    const oldName = actor.name;
    if (oldName !== NAME) {
        await actor.update({name: NAME, 'prototypeToken.name': NAME});
        for (const s of game.scenes) {
            const ups = s.tokens.filter(t => t.actorId === actor.id && t.name !== NAME).map(t => ({_id: t.id, name: NAME}));
            if (ups.length) await s.updateEmbeddedDocuments('Token', ups);
        }
        report.push('<li>Renamed "' + oldName + '" to <b>' + NAME + '</b> (actor, prototype token and her tokens on every scene).</li>');
    } else report.push('<li>Name already ' + NAME + '.</li>');
}

// ---- 2. Wild Shape (Chris's Premades 2) ----------------------------------------------------------
const ws = actor.items.find(i => /^wild shape$/i.test(i.name.trim()) && i.system.uses?.max) ?? find(/^wild shape/i);
{
    if (!ws) report.push('<li><b>Wild Shape</b> not found.</li>');
    else {
        const change = ws.system.activities.contents.find(a => a.type === 'transform') ?? ws.system.activities.contents[0];
        const spends = (change?.consumption?.targets ?? []).some(t => t.type === 'itemUses');
        report.push('<li>Wild Shape: ' + (premadeOn(ws) === 'cpr2' ? 'Chris\'s Premades 2. ' : '<b>apply Chris\'s Premades 2\'s Wild Shape in the Medkit.</b> ')
            + (spends ? (change.name || 'Its transform activity') + ' spends the feature\'s own uses (' + ws.system.uses?.value + '/' + ws.system.uses?.max + ').'
                : '<b>' + (change?.name ?? 'The transform activity') + ' does not spend the feature\'s uses</b>: add an Item Uses consumption.') + '</li>');
    }
}
// Make every activity of an item spend 1 Wild Shape use, unless it already spends item uses.
async function spendWildShape(item) {
    if (!item || !ws) return [];
    const done = [];
    for (const a of item.system.activities.contents) {
        const t = a.consumption?.targets ?? [];
        if (t.some(x => x.type === 'itemUses')) continue;
        await a.update({'consumption.targets': t.concat([{type: 'itemUses', target: ws.id, value: '1', scaling: {}}])});
        done.push(a.name);
    }
    return done;
}

// ---- 3. Starry Form + Wild Companion ----------------------------------------------------------
{
    const sf = find(/^starry form/i);
    if (!sf) report.push('<li><b>Starry Form</b> not found.</li>');
    else if (premadeOn(sf) === 'cpr2') {
        const spends = sf.system.activities.contents.some(a => (a.consumption?.targets ?? []).some(t => t.type === 'itemUses'));
        report.push('<li>Starry Form: Chris\'s Premades 2 (Archer / Chalice / Dragon automated). ' + (spends ? 'It spends a Wild Shape use.'
            : '<b>Check that it spends a Wild Shape use</b> when she takes the form; if not, add an Item Uses consumption pointing at Wild Shape (not done here, so it can\'t spend twice).') + '</li>');
    } else {
        const added = await spendWildShape(sf);
        report.push('<li>Starry Form: <b>apply Chris\'s Premades 2\'s Starry Form in the Medkit</b> (the v13 Chris\'s Premades 1 automation does nothing on v14). '
            + (added.length ? 'Meanwhile ' + added.join(', ') + ' spend a Wild Shape use.' : '') + '</li>');
    }
    const wc = find(/^wild companion/i);
    if (!wc) report.push('<li><b>Wild Companion</b> not found.</li>');
    else if (premadeOn(wc) === 'cpr2') report.push('<li>Wild Companion: Chris\'s Premades 2 (spell slot or Wild Shape use).</li>');
    else {
        const added = await spendWildShape(wc);
        report.push('<li>Wild Companion: <b>apply Chris\'s Premades 2\'s Wild Companion in the Medkit</b>. ' + (added.length ? 'Meanwhile it spends a Wild Shape use.' : '') + '</li>');
    }
}

// ---- 4. Fey Step (Summer) ---------------------------------------------------------------------
{
    const fs = find(/^fey step/i);
    if (!fs) report.push('<li><b>Fey Step</b> not found.</li>');
    else {
        const summer = fs.system.activities.contents.find(a => /summer/i.test(a.name ?? '') && a.type === 'damage')
            ?? fs.system.activities.contents.find(a => /summer/i.test(a.name ?? ''));
        if (!summer?.damage) report.push('<li>Fey Step: no Summer damage activity found.</li>');
        else {
            await summer.update({'damage.parts': [{number: null, denomination: null, bonus: '', types: ['fire'], custom: {enabled: true, formula: '@abilities.wis.mod'}, scaling: {}}],
                'target.affects.type': 'creature', 'target.template.type': '', 'range.units': 'self'});
            report.push('<li>Fey Step (Summer): fire damage is her Wisdom modifier (<b>' + actor.system.abilities.wis.mod + '</b>). Target the creatures within 5 ft of where she lands and use "' + summer.name + '".</li>');
        }
    }
}

// ---- 5. Eladrin Season + Trance -------------------------------------------------------------------
{
    const tr = actor.items.find(i => /^trance$/i.test(i.name.trim()));
    if (!tr) report.push('<li><b>Trance</b> not found.</li>');
    else {
        await dropOld(tr, ['Trance: long rest', 'Trance: choose']);
        await setCat(actor.items.get(tr.id), ['Trance: long rest'], [entry('Trance: long rest', 'rest', 'actorLong', 50, trance)]);
        let act = actor.items.get(tr.id).system.activities.contents.find(a => /season|trance/i.test(a.name ?? ''));
        if (!act) {
            await tr.createActivity('utility', {name: 'Change Season & Proficiencies', activation: {type: 'special', value: null, override: true}}, {renderSheet: false});
            act = actor.items.get(tr.id).system.activities.contents.find(a => /season/i.test(a.name ?? ''));
        }
        if (act) await setCat(actor.items.get(tr.id).system.activities.get(act.id), ['Trance: choose'], [entry('Trance: choose', 'roll', 'activityRollFinished', 50, trance)]);
        const oldPicks = actor.items.filter(i => /^trance:/i.test(i.name.trim()));
        if (oldPicks.length) await actor.deleteEmbeddedDocuments('Item', oldPicks.map(i => i.id));
        if (!actor.flags?.world?.nixSeason) {
            const es = actor.items.find(i => /^eladrin season/i.test(i.name.trim()));
            const s = ['autumn', 'winter', 'spring', 'summer'].find(k => new RegExp(k, 'i').test(es?.name ?? '')) ?? 'summer';
            await actor.update({'flags.world.nixSeason': s});
        }
        const pickFx = actor.effects.filter(e => e.flags?.world?.nixTrance);
        report.push('<li>Trance + Eladrin Season: after every long rest she gets a pop-up to pick her season (or roll 1d4) and two weapon/tool proficiencies until the next long rest. '
            + 'Eladrin Season and Fey Step are renamed to the season; the old proficiencies end. She can also run it by hand from Trance > "' + (act?.name ?? 'Change Season & Proficiencies') + '". '
            + 'Season now: <b>' + (actor.flags?.world?.nixSeason ?? 'summer') + '</b>' + (pickFx.length ? '; today\'s picks (' + pickFx.map(e => e.name.replace(/^trance:\s*/i, '')).join(', ') + ') carried over from v13' : '') + '.'
            + (oldPicks.length ? ' Removed the fixed import picks (' + oldPicks.map(i => i.name.replace(/^trance:\s*/i, '')).join(', ') + ').' : '') + '</li>');
    }
    const fs = find(/^fey step/i);
    if (fs) {
        await dropOld(fs, ['Fey Step: season gate']);
        const riders = fs.system.activities.contents.filter(a => /autumn|winter|spring|summer/i.test(a.name ?? ''));
        for (const a of riders) await setCat(actor.items.get(fs.id).system.activities.get(a.id), ['Fey Step: season gate'], [entry('Fey Step: season gate', 'roll', 'activityPreTargeting', 10, seasonGate)]);
        const missing = ['Autumn', 'Winter', 'Spring', 'Summer'].filter(s => !riders.some(a => new RegExp(s, 'i').test(a.name)));
        report.push('<li>Fey Step: only the current season\'s rider (' + riders.map(a => a.name).join(', ') + ') can be used; the others warn and stop.'
            + (premadeOn(fs) === 'cpr2' ? ' <i>Fey Step is Chris\'s Premades 2: if its own season choice also pops up, set it to None in the Medkit and run this again.</i>' : '')
            + (missing.length ? ' <b>No ' + missing.join(' / ') + ' activity</b> on the item, so that season has no rider button (Spring is just the teleport on another willing creature).' : '') + '</li>');
    }
}

// ---- 6. Absorb Elements --------------------------------------------------------------------------
{
    const ae = actor.items.find(i => i.type === 'spell' && /^absorb elements/i.test(i.name.trim()));
    if (!ae) report.push('<li><b>Absorb Elements</b> not found.</li>');
    else report.push(premadeOn(ae) === 'cpr2'
        ? '<li>Absorb Elements: Chris\'s Premades 2 (reaction pop-up when she takes acid/cold/fire/lightning/thunder damage, resistance, extra damage on her next melee hit).</li>'
        : '<li><b>Absorb Elements: apply Chris\'s Premades 2\'s version in the Medkit.</b> If it has none, tell me what goes wrong when it\'s cast.</li>');
}

// ---- 7. Notes -----------------------------------------------------------------------------------
{
    const druid = actor.items.find(i => i.type === 'class' && /druid/i.test(i.name));
    const prepared = actor.items.filter(i => i.type === 'spell' && i.system.level > 0 && (i.system.prepared === 1 || i.system.prepared === true || i.system.preparation?.prepared)
        && !['always', 'innate', 'atwill', 'pact'].includes(i.system.method ?? i.system.preparation?.mode)).map(i => i.name);
    report.push('<li>Not changed: ' + prepared.length + ' prepared ' + (druid?.name ?? 'Druid') + ' spells (' + prepared.join(', ') + '). A level-3 Druid prepares 6 (Star Map\'s Guidance and Guiding Bolt don\'t count).</li>');
    whatsLeft(/^(trance|fey step|eladrin season)/i);
}

await ChatMessage.create({whisper: [game.user.id], content: '<b>Lyric fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
