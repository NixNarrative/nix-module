// =====================================================================
//  NIX FIX: control panel (Game Settings > Nix Fix, or the button in
//  the Settings sidebar). ApplicationV2 only, so it works on v13 and v14.
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';
import {CAMPAIGNS, CHARACTERS, entriesFor} from './registry.mjs';
import {detectEngine} from './compat.mjs';
import {actorFor, bind, candidates, runEntry, statusOf} from './runner.mjs';
import {currentCampaign, guessCampaign} from './campaign.mjs';
import {showHealth} from './health.mjs';
import {checkSettings, exportSettings, fixSettings, pickAndImport} from './world-settings.mjs';
 
const esc = s => (foundry.utils.escapeHTML ?? (x => String(x).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]))))(String(s ?? ''));
const KIND = {world: 'World', setup: 'Setup', character: 'Installer', embedded: 'Embedded', levelup: 'Level-up', tool: 'Tool'};
const STATE = {
    current: ['✅', 'Up to date'], outdated: ['🔄', 'Update available'], never: ['⬜', 'Not applied'],
    'missing-file': ['❌', 'File missing'], 'not-ported': ['➖', 'Not ported to v14 yet'],
    retired: ['🏁', 'Retired on v14: Chris\'s Premades 2 does this']
};
const INACTIVE = ['not-ported', 'retired'];
 
export async function applyAll({confirm = true, onlyOutdated = false} = {}) {
    const campaign = currentCampaign();
    if (!campaign) return ui.notifications.warn(TITLE + ': choose this world\'s campaign first.');
    const engine = detectEngine();
    if (!engine.ok) return ui.notifications.error(TITLE + ': ' + engine.why, {permanent: true});
    const todo = [];
    let notPorted = 0, retired = 0;
    for (const e of entriesFor(campaign).filter(e => !e.manual)) {
        const s = await statusOf(e);
        if (s.state === 'not-ported') notPorted++;
        if (s.state === 'retired') retired++;
        if (s.state === 'outdated' || (!onlyOutdated && s.state === 'never')) todo.push({e, s});
    }
    const skippedNote = [notPorted && notPorted + ' not ported to v14 yet', retired && retired + ' retired on v14'].filter(Boolean).join(', ');
    if (!todo.length) { ui.notifications.info(TITLE + ': everything is up to date.' + (skippedNote ? ' (' + skippedNote + '.)' : '')); return []; }
    if (confirm) {
        const ok = await foundry.applications.api.DialogV2.confirm({
            window: {title: TITLE + ': apply ' + todo.length},
            content: '<p>These run in order (world installers first). Each one replaces what it wrote before, so nothing stacks.</p><ul>'
                + todo.map(({e, s}) => '<li>' + STATE[s.state][0] + ' ' + esc(e.title) + '</li>').join('') + '</ul>'
                + (skippedNote ? '<p class="nix-small">Skipped: ' + esc(skippedNote) + '.</p>' : '')
                + '<p class="nix-small">Back up the world first if you haven\'t recently.</p>',
            rejectClose: false
        });
        if (!ok) return [];
    }
    const results = [];
    for (const {e} of todo) {
        ui.notifications.info(TITLE + ': applying ' + e.title + '...');
        results.push({e, r: await runEntry(e, {silent: true})});
    }
    const bad = results.filter(x => !x.r.ok);
    await ChatMessage.create({whisper: [game.user.id], content: '<b>' + TITLE + ': applied ' + (results.length - bad.length) + ' of ' + results.length + '</b><ul>'
        + results.map(x => '<li>' + (x.r.ok ? '✅ ' : '❌ ') + esc(x.r.msg) + '</li>').join('') + '</ul>'});
    if (bad.length) ui.notifications.warn(TITLE + ': ' + bad.length + ' did not apply. See the chat whisper.');
    else ui.notifications.info(TITLE + ': all ' + results.length + ' applied.');
    return results;
}
 
export class NixPanel extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: 'nix-module-panel',
        classes: ['nix-module'],
        tag: 'div',
        window: {title: TITLE, icon: 'fa-solid fa-hat-wizard', resizable: true},
        position: {width: 780, height: 760},
        actions: {
            apply: NixPanel.onApply,
            applyAll: NixPanel.onApplyAll,
            health: NixPanel.onHealth,
            fixSettings: NixPanel.onFixSettings,
            exportSettings: NixPanel.onExport,
            importSettings: NixPanel.onImport
        }
    };
 
    async _prepareContext() {
        const campaign = currentCampaign();
        const saved = game.settings.get(MODULE_ID, 'campaign');
        const entries = campaign ? entriesFor(campaign) : [];
        const rows = [];
        for (const e of entries) rows.push({e, s: await statusOf(e)});
        const chars = Object.entries(CHARACTERS).filter(([, c]) => c.campaign === campaign).map(([key, c]) => {
            const {actor, how} = actorFor(key);
            return {key, c, actor, how, options: candidates(key)};
        });
        return {campaign, saved, guess: guessCampaign(), engine: detectEngine(), rows, chars,
            settings: checkSettings().filter(s => s.state === 'warn'), version: game.modules.get(MODULE_ID).version};
    }
 
    async _renderHTML(ctx) {
        const opts = ['<option value="auto"' + (ctx.saved === 'auto' ? ' selected' : '') + '>Auto-detect' + (ctx.guess ? ' (' + esc(CAMPAIGNS[ctx.guess]) + ')' : '') + '</option>']
            .concat(Object.entries(CAMPAIGNS).map(([id, t]) => '<option value="' + id + '"' + (ctx.saved === id ? ' selected' : '') + '>' + esc(t) + '</option>'));
        const engineNote = ctx.engine.ok ? (ctx.engine.note ? '<br><small>' + esc(ctx.engine.note) + '</small>' : '') : '<br><small>' + esc(ctx.engine.why) + '</small>';
        let h = '<section class="nix-head">'
            + '<label>Campaign in this world <select name="campaign">' + opts.join('') + '</select></label>'
            + '<div class="nix-engine ' + (ctx.engine.ok ? 'ok' : 'bad') + '">' + (ctx.engine.ok ? '✅ ' : '❌ ') + esc(ctx.engine.label) + engineNote + '</div>'
            + '<div class="nix-buttons">'
            + '<button type="button" data-action="applyAll"><i class="fa-solid fa-play"></i> Apply all updates</button>'
            + '<button type="button" data-action="health"><i class="fa-solid fa-stethoscope"></i> Health check</button>'
            + '<button type="button" data-action="exportSettings"><i class="fa-solid fa-file-export"></i> Export settings</button>'
            + '<button type="button" data-action="importSettings"><i class="fa-solid fa-file-import"></i> Import settings</button>'
            + '</div></section>';
 
        if (ctx.settings.length) {
            h += '<section class="nix-settings"><h3>⚠️ World settings to fix</h3><ul>'
                + ctx.settings.map(s => '<li><b>' + esc(s.label) + '</b><br><small>' + esc(s.why) + '</small></li>').join('') + '</ul>'
                + (ctx.settings.some(s => s.fixable) ? '<button type="button" data-action="fixSettings"><i class="fa-solid fa-wrench"></i> Fix the ones I can</button>' : '')
                + '</section>';
        }
 
        if (!ctx.campaign) return h + '<p class="nix-empty">Choose the campaign this world runs.</p>';
 
        h += '<section><h3>Characters</h3><table class="nix-table">';
        for (const ch of ctx.chars) {
            const o = ['<option value="">(not in this world)</option>'].concat(ch.options.map(a =>
                '<option value="' + a.uuid + '"' + (ch.actor?.uuid === a.uuid ? ' selected' : '') + '>' + esc(a.name) + '</option>'));
            const note = ch.how === 'ambiguous' ? '<small class="nix-warn">Several matches: pick one</small>'
                : ch.how === 'none' ? '<small>No actor found</small>' : ch.how === 'auto' ? '<small>auto</small>' : '';
            h += '<tr><td><b>' + esc(ch.c.name) + '</b></td><td><select name="bind" data-char="' + ch.key + '">' + o.join('') + '</select> ' + note + '</td></tr>';
        }
        h += '</table></section>';
 
        h += '<section><h3>Automations</h3><table class="nix-table">';
        for (const {e, s} of ctx.rows) {
            const [icon, label] = e.manual && s.state === 'never' ? ['▫️', 'Manual'] : STATE[s.state] ?? ['?', s.state];
            const when = s.rec ? new Date(s.rec.at).toLocaleDateString() + ' (v' + s.rec.version + ')' : '';
            const inactive = INACTIVE.includes(s.state);
            const button = inactive ? '<button type="button" disabled>Apply</button>'
                : '<button type="button" data-action="apply" data-id="' + e.id + '">' + (e.kind === 'tool' ? 'Run' : s.state === 'current' ? 'Re-apply' : 'Apply') + '</button>';
            h += '<tr' + (inactive ? ' class="nix-dim"' : '') + '><td class="nix-icon" title="' + esc(label) + '">' + icon + '</td>'
                + '<td><b>' + esc(e.title) + '</b> <span class="nix-kind">' + KIND[e.kind] + '</span>'
                + (e.actors?.length ? ' <small>' + e.actors.map(k => esc(CHARACTERS[k]?.name ?? k)).join(', ') + '</small>' : '')
                + '<br><small>' + esc(e.does) + '</small></td>'
                + '<td><small>' + esc(s.state === 'retired' ? 'Retired on v14' : label) + (when ? '<br>' + esc(when) : '') + (s.why ? '<br>' + esc(s.why) : '') + '</small></td>'
                + '<td>' + button + '</td></tr>';
        }
        h += '</table></section><footer class="nix-small">' + esc(TITLE) + ' v' + esc(ctx.version) + '. Every installer is safe to re-apply: it replaces what it wrote.</footer>';
        return h;
    }
 
    _replaceHTML(result, content) {
        content.innerHTML = result;
    }
 
    _onRender() {
        const el = this.element;
        el.querySelector('select[name=campaign]')?.addEventListener('change', async ev => {
            await game.settings.set(MODULE_ID, 'campaign', ev.target.value);
            this.render();
        });
        el.querySelectorAll('select[name=bind]').forEach(sel => sel.addEventListener('change', async ev => {
            await bind(ev.target.dataset.char, ev.target.value || null);
            this.render();
        }));
    }
 
    static async onApply(event, target) {
        target.disabled = true;
        const r = await runEntry(target.dataset.id);
        ui.notifications[r.ok ? 'info' : 'warn'](TITLE + ': ' + r.msg);
        this.render();
    }
    static async onApplyAll() { await applyAll(); this.render(); }
    static async onHealth() { await showHealth(); }
    static async onFixSettings() {
        const fixed = await fixSettings();
        ui.notifications.info(TITLE + ': ' + (fixed.length ? 'fixed ' + fixed.join('; ') : 'nothing to fix automatically.'));
        this.render();
    }
    static async onExport() {
        const n = exportSettings();
        ui.notifications.info(TITLE + ': exported ' + n + ' world settings. Import the file in your other worlds.');
    }
    static async onImport() { await pickAndImport(); this.render(); }
}
 