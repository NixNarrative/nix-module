// =====================================================================
//  LYRIC EPISTÍMONAS FIXES (Espalian Escapades): one-click INSTALLER (Script macro, run as GM)
//  Select her token, then run. Safe to re-run.
//   - Renames "Michela character" to Lyric Epistímonas (actor, prototype token, placed tokens)
//   - Wild Shape: one counter (the transform spends the feature's uses)
//   - Starry Form / Wild Companion: Chris's Premades automation; both spend Wild Shape
//   - Fey Step (Summer): fire damage = Wisdom modifier (was a flat 1)
//   - Trance: long-rest pop-up for season + two weapon/tool proficiencies until the next long rest
//   - Eladrin Season: renamed to the season; only that season's Fey Step rider can be used
//   - Absorb Elements: Chris's Premades automation
// =====================================================================
const SCRIPTS = {
 TRANCE: String.raw`await (async () => {
// Trance (Eladrin): after a long rest, or clicked by hand. Pick this season (or roll), then two
// weapon/tool proficiencies that last until the next long rest. The season changes which Fey Step
// rider is unlocked and renames Eladrin Season / Fey Step to match.
const item = (typeof trigger !== 'undefined' && trigger?.entity) ? trigger.entity : workflow.item;
const actor = item.actor;
const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
const SEASONS = {autumn: 'Autumn', winter: 'Winter', spring: 'Spring', summer: 'Summer'};
const BLURB = {autumn: 'peace and goodwill: Fey Step can Charm creatures near you',
    winter: 'contemplation and dolor: Fey Step can Frighten a creature near you',
    spring: 'cheerfulness: Fey Step can teleport a willing creature instead of you',
    summer: 'boldness: Fey Step deals fire damage to creatures near where you appear'};
const cur = actor.flags?.world?.nixSeason ?? (Object.keys(SEASONS).find(k => actor.items.some(i => /^eladrin season/i.test(i.name) && new RegExp(k, 'i').test(i.name))) ?? 'summer');
// Old Trance proficiencies end now.
const oldFx = actor.effects.filter(e => e.flags?.world?.nixTrance);
for (const e of oldFx) await genericUtils.remove(e);
const label = async (uuid, key) => { try { return (await dnd5e.documents.Trait.getBaseItem(uuid, {indexOnly: true}))?.name ?? key; } catch { return key; } };
const opts = [];
const wp = new Set(actor.system.traits?.weaponProf?.value ?? []);
for (const [k, u] of Object.entries(CONFIG.DND5E.weaponIds ?? {})) if (!wp.has(k)) opts.push({value: 'weapon:' + k, label: 'Weapon: ' + await label(u, k)});
for (const [k, u] of Object.entries(CONFIG.DND5E.toolIds ?? {})) if (!(actor.system.tools?.[k]?.value >= 1)) opts.push({value: 'tool:' + k, label: 'Tool: ' + await label(u, k)});
opts.sort((a, b) => a.label.localeCompare(b.label));
const seasonOpts = Object.entries(SEASONS).map(([k, v]) => ({value: k, label: v + ' (' + BLURB[k] + ')'})).concat([{value: 'roll', label: 'Roll for it (1d4)'}]);
const none = [{value: '', label: '(none)'}];
const res = await DialogApp.dialog(item.name, 'Your trance ends. Choose your season and two proficiencies drawn from shared elven memory (they last until your next long rest).', [
    ['selectOption', [{label: 'Season', name: 'season', options: {currentValue: cur, options: seasonOpts}}], {displayAsRows: true}],
    ['selectOption', [{label: 'Proficiency 1', name: 'p1', options: {currentValue: '', options: none.concat(opts)}}], {displayAsRows: true}],
    ['selectOption', [{label: 'Proficiency 2', name: 'p2', options: {currentValue: '', options: none.concat(opts)}}], {displayAsRows: true}]], 'okCancel', {userId, width: 560});
if (!res?.buttons) return;
let season = res.season || cur;
if (season === 'roll') { const r = await new Roll('1d4').evaluate(); await r.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: 'Eladrin Season (1 Autumn, 2 Winter, 3 Spring, 4 Summer)'}); season = ['autumn', 'winter', 'spring', 'summer'][r.total - 1]; }
await genericUtils.update(actor, {'flags.world.nixSeason': season});
const S = SEASONS[season];
const es = actor.items.find(i => /^eladrin season/i.test(i.name.trim()));
if (es) await genericUtils.update(es, {name: 'Eladrin Season: ' + S});
const fs = actor.items.find(i => /^fey step/i.test(i.name.trim()));
if (fs) { const tail = (fs.name.match(/ - (.+)$/) ?? [])[1]; await genericUtils.update(fs, {name: 'Fey Step: ' + S + (tail ? ' - ' + tail : '')}); }
const picks = [...new Set([res.p1, res.p2].filter(Boolean))];
const changes = [];
const names = [];
for (const p of picks) {
    const [kind, key] = p.split(':');
    names.push(opts.find(o => o.value === p)?.label.replace(/^(Weapon|Tool): /, '') ?? key);
    if (kind === 'weapon') changes.push({key: 'system.traits.weaponProf.value', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: key, priority: 20});
    else {
        changes.push({key: 'system.tools.' + key + '.value', mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE, value: '1', priority: 20});
        if (!actor.system.tools?.[key]?.ability) changes.push({key: 'system.tools.' + key + '.ability', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: CONFIG.DND5E.tools?.[key]?.ability ?? 'int', priority: 20});
    }
}
if (changes.length) await effectUtils.createEffect(actor, {name: 'Trance: ' + names.join(', '), img: item.img, origin: item.uuid,
    description: 'Proficiency drawn from shared elven memory, until the next long rest.', changes, flags: {world: {nixTrance: true}}});
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + '\'s season is now <b>' + S + '</b> (' + BLURB[season] + ').'
    + (names.length ? ' Proficient until her next long rest: <b>' + names.join('</b> and <b>') + '</b>.' : '')});
})();`,
 SEASON_GATE: String.raw`return await (async () => {
// Fey Step season riders: only the current season's rider can be used.
const actor = workflow.actor;
const season = actor.flags?.world?.nixSeason ?? 'summer';
const mine = (workflow.activity?.name ?? '').toLowerCase();
const tag = ['autumn', 'winter', 'spring', 'summer'].find(s => mine.includes(s));
if (!tag || tag === season) return;
ui.notifications.warn(workflow.item.name + ': her season is ' + season[0].toUpperCase() + season.slice(1) + ', so the ' + tag[0].toUpperCase() + tag.slice(1) + ' rider is not available. Change season in Trance after a long rest.');
return true;
})();`
};
const NAME = 'Lyric Epistímonas';
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Lyric fixes: select Lyric\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
const cprId = item => item?.flags?.['chris-premades']?.info?.identifier;
async function applyCpr(re, id, label) {
    let it = find(re);
    if (!it) { report.push('<li><b>' + label + '</b> not found.</li>'); return null; }
    if (cprId(it) === id) return it;
    try { await chrisPremades.utils.itemUtils.itemUpdate(it); } catch (err) { console.warn(err); }
    return find(re);
}
 
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
 
// ---- 2. Wild Shape: one counter ---------------------------------------------------------------
const ws = actor.items.find(i => /^wild shape$/i.test(i.name.trim()) && i.system.uses?.max) ?? find(/^wild shape/i);
{
    if (!ws) report.push('<li><b>Wild Shape</b> not found.</li>');
    else {
        const fixed = [];
        for (const a of ws.system.activities.contents) {
            const upd = {};
            if (a.uses?.max) { upd['uses.max'] = ''; upd['uses.spent'] = 0; upd['uses.recovery'] = []; }
            const targets = a.consumption?.targets ?? [];
            if (/transform|shape|midi/i.test(a.name ?? '') && !targets.some(t => t.type === 'itemUses')) upd['consumption.targets'] = targets.concat([{type: 'itemUses', target: '', value: '1', scaling: {}}]);
            if (Object.keys(upd).length) { await a.update(upd); fixed.push(a.name); }
        }
        report.push('<li>Wild Shape: ' + (fixed.length ? fixed.join(', ') + ' now spend' + (fixed.length > 1 ? '' : 's') + ' the feature\'s own uses' : 'activities already use the feature\'s uses')
            + ' (' + ws.system.uses?.value + '/' + ws.system.uses?.max + ', one back on a short rest, all on a long rest).</li>');
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
    const sf = await applyCpr(/^starry form/i, 'starryForm', 'Starry Form');
    if (sf) {
        const added = await spendWildShape(sf);
        report.push('<li>Starry Form' + (cprId(sf) ? ' (Chris\'s Premades version, same as Tsuki\'s)' : ' (<b>no Chris\'s Premades version applied</b>: the Dragon form\'s minimum-10 isn\'t automated)')
            + ': ' + (added.length ? added.join(', ') + ' now spend a Wild Shape use.' : 'already spends Wild Shape uses.') + '</li>');
    }
    const wc = await applyCpr(/^wild companion/i, 'wildCompanion', 'Wild Companion');
    if (wc) {
        const added = cprId(wc) ? [] : await spendWildShape(wc);
        report.push('<li>Wild Companion' + (cprId(wc) ? ': Chris\'s Premades version (spell slot or Wild Shape use).' : ': ' + (added.length ? 'now spends a Wild Shape use.' : 'already spends uses.')) + '</li>');
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
            report.push('<li>Fey Step (Summer): fire damage is now her Wisdom modifier (<b>' + actor.system.abilities.wis.mod + '</b>) instead of 1. Target the creatures within 5 ft of where she lands and use "' + summer.name + '".</li>');
        }
    }
}
 
// ---- 5. Eladrin Season + Trance -------------------------------------------------------------------
{
    const tr = actor.items.find(i => /^trance$/i.test(i.name.trim()));
    if (!tr) report.push('<li><b>Trance</b> not found.</li>');
    else {
        const kept = (tr.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => m.name !== 'Trance: long rest');
        await tr.setFlag('chris-premades', 'embeddedMacros', kept.concat([{name: 'Trance: long rest', type: 'rest', pass: 'long', priority: 50, macro: SCRIPTS.TRANCE}]));
        let act = tr.system.activities.contents.find(a => /season|trance/i.test(a.name ?? ''));
        if (!act) { await tr.createActivity('utility', {name: 'Change Season & Proficiencies', activation: {type: 'special', value: null, override: true}}, {renderSheet: false});
            act = tr.system.activities.contents.find(a => /season/i.test(a.name ?? '')) ?? actor.items.get(tr.id).system.activities.contents.find(a => /season/i.test(a.name ?? '')); }
        if (act) {
            const k2 = (tr.flags?.['chris-premades']?.embeddedActivityMacros?.[act.id] ?? []).filter(m => m.name !== 'Trance: choose');
            await tr.setFlag('chris-premades', 'embeddedActivityMacros.' + act.id, k2.concat([{name: 'Trance: choose', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.TRANCE}]));
        }
        const oldPicks = actor.items.filter(i => /^trance:/i.test(i.name.trim()));
        if (oldPicks.length) await actor.deleteEmbeddedDocuments('Item', oldPicks.map(i => i.id));
        if (!actor.flags?.world?.nixSeason) {
            const es = actor.items.find(i => /^eladrin season/i.test(i.name.trim()));
            const s = ['autumn', 'winter', 'spring', 'summer'].find(k => new RegExp(k, 'i').test(es?.name ?? '')) ?? 'summer';
            await actor.update({'flags.world.nixSeason': s});
        }
        report.push('<li>Trance + Eladrin Season: after every long rest she gets a pop-up to pick her season (or roll 1d4) and two weapon/tool proficiencies until the next long rest. '
            + 'Eladrin Season and Fey Step are renamed to the season; the old proficiencies end. She can also run it by hand from Trance > "' + (act?.name ?? 'Change Season & Proficiencies') + '".'
            + (oldPicks.length ? ' Removed the fixed import picks (' + oldPicks.map(i => i.name.replace(/^trance:\s*/i, '')).join(', ') + '): check her Tools on the Character tab in case the import also wrote them there permanently.' : '') + '</li>');
    }
    const fs = find(/^fey step/i);
    if (fs) {
        const riders = fs.system.activities.contents.filter(a => /autumn|winter|spring|summer/i.test(a.name ?? ''));
        for (const a of riders) {
            const k2 = (fs.flags?.['chris-premades']?.embeddedActivityMacros?.[a.id] ?? []).filter(m => m.name !== 'Fey Step: season gate');
            await fs.setFlag('chris-premades', 'embeddedActivityMacros.' + a.id, k2.concat([{name: 'Fey Step: season gate', type: 'midi-item', pass: 'preTargeting', priority: 10, macro: SCRIPTS.SEASON_GATE}]));
        }
        const missing = ['Autumn', 'Winter', 'Spring', 'Summer'].filter(s => !riders.some(a => new RegExp(s, 'i').test(a.name)));
        report.push('<li>Fey Step: only the current season\'s rider (' + riders.map(a => a.name).join(', ') + ') can be used; the others warn and stop.'
            + (missing.length ? ' <b>No ' + missing.join(' / ') + ' activity</b> on the item, so that season has no rider button (Spring is just the teleport on another willing creature: use Fey Step (Teleport) and move them).' : '') + '</li>');
    }
}
 
// ---- 6. Absorb Elements --------------------------------------------------------------------------
{
    const ae = actor.items.find(i => i.type === 'spell' && /^absorb elements/i.test(i.name.trim()));
    if (!ae) report.push('<li><b>Absorb Elements</b> not found.</li>');
    else if (cprId(ae) === 'absorbElements') report.push('<li>Absorb Elements already uses the Chris\'s Premades automation. If it still misbehaves, add a test note saying what happens.</li>');
    else {
        try { await chrisPremades.utils.itemUtils.itemUpdate(ae); } catch (err) { console.warn(err); }
        const ae2 = actor.items.find(i => i.type === 'spell' && /^absorb elements/i.test(i.name.trim()));
        report.push(cprId(ae2) === 'absorbElements'
            ? '<li>Absorb Elements: switched to the Chris\'s Premades automation (reaction pop-up when she takes acid/cold/fire/lightning/thunder damage, resistance, extra damage on her next melee hit).</li>'
            : '<li><b>Absorb Elements</b>: Chris\'s Premades had no automation to apply. Tell me what goes wrong when it\'s cast and I\'ll build it.</li>');
    }
}
 
// ---- 7. Notes -----------------------------------------------------------------------------------
{
    const druid = actor.items.find(i => i.type === 'class' && /druid/i.test(i.name));
    const prepared = actor.items.filter(i => i.type === 'spell' && i.system.level > 0 && (i.system.prepared === 1 || i.system.prepared === true || i.system.preparation?.prepared)
        && !['always', 'innate', 'atwill', 'pact'].includes(i.system.method ?? i.system.preparation?.mode)).map(i => i.name);
    report.push('<li>Not changed: ' + prepared.length + ' prepared ' + (druid?.name ?? 'Druid') + ' spells (' + prepared.join(', ') + '). A level-3 Druid prepares 6 (Star Map\'s Guidance and Guiding Bolt don\'t count).</li>');
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Lyric fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 