// =====================================================================
//  NIX FIX: health check
//  Run after any update (Foundry, dnd5e, Midi, CPR, this module). Read-only.
//   - engine + version ranges
//   - required world settings
//   - which automations are current / outdated / never applied / not ported / retired
//   - every embedded macro in the world still compiles (no syntax errors):
//     CPR1 (flags.chris-premades) and CAT (flags.cat, item / activity / effect)
//   - duplicate character actors that could be confused for the real one
// =====================================================================
import {TITLE} from './constants.mjs';
import {CAMPAIGNS, CHARACTERS, entriesFor} from './registry.mjs';
import {compatReport, detectEngine} from './compat.mjs';
import {checkSettings} from './world-settings.mjs';
import {statusOf, candidates, actorFor} from './runner.mjs';
import {currentCampaign} from './campaign.mjs';
 
const AsyncFn = foundry.utils.AsyncFunction ?? Object.getPrototypeOf(async function () {}).constructor;
const esc = s => (foundry.utils.escapeHTML ?? (x => String(x).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]))))(String(s ?? ''));
 
function allActors() {
    const out = new Map();
    for (const a of game.actors) out.set(a.uuid, {actor: a, where: 'sidebar'});
    for (const scene of game.scenes) for (const t of scene.tokens) {
        if (!t.actorLink && t.actor) out.set(t.actor.uuid, {actor: t.actor, where: 'token in ' + scene.name});
    }
    return [...out.values()];
}
 
// Every embedded macro on actors, items, activities and effects.
//   engine 'cpr1': flags.chris-premades (inert on v14)
//   engine 'cat':  flags.cat.embeddedMacros, stored {name, event, pass, macros: [{macro, priority}]}
export function scanEmbedded() {
    const found = [], broken = [];
    const compile = (rec, code) => { try { new AsyncFn(String(code ?? '')); } catch (err) { broken.push({...rec, error: err.message}); } };
    const testOld = (owner, where, list) => {
        for (const m of list ?? []) {
            const rec = {owner, where, name: m.name, type: m.type, pass: m.pass, engine: 'cpr1'};
            found.push(rec);
            compile(rec, m.macro);
        }
    };
    const testCat = (owner, where, list) => {
        for (const m of list ?? []) {
            const rec = {owner, where, name: m.name, type: m.event, pass: m.pass, engine: 'cat'};
            found.push(rec);
            for (const x of m.macros ?? [{macro: m.macro}]) compile(rec, x.macro);
        }
    };
    const both = (owner, where, doc) => {
        testOld(owner, where, doc?.flags?.['chris-premades']?.embeddedMacros);
        testCat(owner, where, doc?.flags?.cat?.embeddedMacros);
    };
    for (const {actor, where} of allActors()) {
        const label = actor.name + (where === 'sidebar' ? '' : ' (' + where + ')');
        both(label, 'actor', actor);
        for (const e of actor.effects) both(label, 'effect: ' + e.name, e);
        for (const item of actor.items) {
            both(label, item.name, item);
            for (const [id, list] of Object.entries(item.flags?.['chris-premades']?.embeddedActivityMacros ?? {})) {
                testOld(label, item.name + ' > ' + (item.system.activities?.get(id)?.name ?? id), list);
            }
            for (const act of item.system.activities?.contents ?? []) {
                testCat(label, item.name + ' > ' + (act.name || act.type), act.flags?.cat?.embeddedMacros);
            }
            for (const e of item.effects) both(label, item.name + ' > effect: ' + e.name, e);
        }
    }
    return {found, broken};
}
 
export async function healthReport() {
    const campaign = currentCampaign();
    const engine = detectEngine();
    const compat = compatReport();
    const settings = checkSettings();
    const entries = campaign ? entriesFor(campaign) : [];
    const statuses = [];
    for (const e of entries) statuses.push({entry: e, ...(await statusOf(e))});
    const {found, broken} = scanEmbedded();
 
    const dupes = [];
    for (const [key, ch] of Object.entries(CHARACTERS)) {
        if (ch.campaign !== campaign) continue;
        const list = candidates(key);
        if (list.length > 1) dupes.push({name: ch.name, bound: actorFor(key).actor?.name, all: list.map(a => a.name)});
    }
 
    const icon = s => ({ok: '✅', current: '✅', warn: '⚠️', outdated: '🔄', never: '⬜', error: '❌', missing: '➖', skip: '➖', unknown: '❔',
        'missing-file': '❌', 'not-ported': '➖', retired: '🏁'}[s] ?? s);
    const label = s => s.state === 'current' ? 'up to date' : s.state === 'never' ? (s.entry.manual ? 'manual' : 'not applied yet')
        : s.state === 'not-ported' ? 'not ported to v14 yet'
        : s.state === 'retired' ? 'retired on v14: ' + s.why
        : s.state + (s.why ? ' (' + s.why + ')' : '');
    const row = cells => '<tr>' + cells.map(c => '<td>' + c + '</td>').join('') + '</tr>';
    let html = '<div class="nix-report">';
    html += '<h3>Engine</h3><p>' + (engine.ok ? '✅ ' : '❌ ') + esc(engine.label)
        + (engine.ok ? (engine.note ? '<br><span class="nix-warn">' + esc(engine.note) + '</span>' : '') : '<br><span class="nix-warn">' + esc(engine.why) + '</span>') + '</p>';
    html += '<h3>Versions</h3><table>' + compat.map(c => row([icon(c.status), esc(c.label), esc(c.version ?? '-'), 'tested ' + esc(c.tested), esc(c.note)])).join('') + '</table>';
    html += '<h3>World settings</h3><table>' + settings.map(s => row([icon(s.state), esc(s.label), esc(s.state === 'ok' ? '' : s.why)])).join('') + '</table>';
    html += '<h3>Automations: ' + esc(CAMPAIGNS[campaign] ?? 'no campaign chosen') + '</h3>';
    if (!entries.length) html += '<p>Pick this world\'s campaign in the ' + esc(TITLE) + ' window.</p>';
    else html += '<table>' + statuses.map(s => row([icon(s.state), esc(s.entry.title), esc(label(s))])).join('') + '</table>';
 
    const cat = found.filter(f => f.engine === 'cat').length, old = found.length - cat;
    html += '<h3>Embedded macros in this world</h3><p>' + found.length + ' found'
        + (engine.id === 'cat' ? ' (' + cat + ' CAT, ' + old + ' old Chris\'s Premades 1: those never run on v14)' : '')
        + ', ' + (broken.length ? '<b class="nix-warn">' + broken.length + ' with syntax errors</b>' : 'all compile') + '.</p>';
    if (broken.length) html += '<table>' + broken.map(b => row(['❌', esc(b.owner), esc(b.where + ': ' + b.name), esc(b.error)])).join('') + '</table>';
    if (engine.id === 'cat' && old) {
        const owners = [...new Set(found.filter(f => f.engine === 'cpr1').map(f => f.owner + ' > ' + f.where))];
        html += '<details><summary>Old macros still sitting in flags.chris-premades (' + owners.length + ' documents)</summary><p class="nix-small">'
            + owners.map(esc).join('<br>') + '</p></details>';
    }
    if (dupes.length) {
        html += '<h3>Look-alike actors</h3><p>More than one actor matches these characters. The bound one is used; check it\'s the one on the map.</p><table>'
            + dupes.map(d => row(['⚠️', esc(d.name), 'using <b>' + esc(d.bound ?? 'none chosen') + '</b>', esc(d.all.join(', '))])).join('') + '</table>';
    }
    html += '</div>';
    return {html, engine, compat, settings, statuses, broken, dupes};
}
 
export async function showHealth() {
    const r = await healthReport();
    await foundry.applications.api.DialogV2.prompt({
        window: {title: TITLE + ': health check', resizable: true},
        position: {width: 720, height: 640},
        content: r.html,
        ok: {label: 'Close'},
        rejectClose: false
    });
    return r;
}
 