// =====================================================================
//  NIX FIX (module id: nix-module)
//  Nix's homebrew automations for The Fool's Journey, Journey to the East
//  and Espalian Escapades, kept in one place:
//   - every table-tested installer and embedded macro ships in automations/
//   - the GM applies them from one window, per world, without selecting tokens
//   - when the module updates, the GM is told which automations changed
//   - health check, version check and world-settings sync across campaigns
//   - players' Smart Target / dice-mode choices kept on their user, not the browser
//
//  API: game.modules.get('nix-module').api
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';
import {CAMPAIGNS, CHARACTERS, ENTRIES, entriesFor} from './registry.mjs';
import {compatReport, detectEngine, generation} from './compat.mjs';
import {actorFor, bind, runEntry, statusOf} from './runner.mjs';
import {currentCampaign} from './campaign.mjs';
import {healthReport, showHealth, scanEmbedded} from './health.mjs';
import {checkSettings, exportSettings, fixSettings, importSettings, pickAndImport} from './world-settings.mjs';
import {NixPanel, applyAll} from './panel.mjs';
import {revertEntry, revertChain, undoIndex} from './undo.mjs';
import {registerPlayerSettings, restorePlayerSettings, playerSettingsReport, clearPlayerSettings} from './player-settings.mjs';
import {registerSidebarCollapse} from './sidebar-collapse.mjs';
 
let panel;
const open = () => (panel ??= new NixPanel()).render({force: true});
 
Hooks.once('init', () => {
    const s = (key, data) => game.settings.register(MODULE_ID, key, {config: false, ...data});
    s('campaign', {scope: 'world', type: String, default: 'auto'});
    s('bindings', {scope: 'world', type: Object, default: {}});
    s('applied', {scope: 'world', type: Object, default: {}});
    s('undo', {scope: 'world', type: Object, default: {}});
    s('lastCompatWarning', {scope: 'world', type: String, default: ''});
    game.settings.register(MODULE_ID, 'autoUpdate', {
        name: 'Apply automation updates on GM login',
        hint: 'When ' + TITLE + ' updates, automations that were already applied in this world are re-applied automatically the next time the GM logs in. New ones still wait for you.',
        scope: 'world', config: true, type: Boolean, default: false
    });
    registerPlayerSettings();
    registerSidebarCollapse();
    game.settings.registerMenu(MODULE_ID, 'panel', {
        name: TITLE, label: 'Open ' + TITLE, hint: 'Apply and update the campaign automations, health check, settings sync.',
        icon: 'fa-solid fa-hat-wizard', type: NixPanel, restricted: true
    });
 
    game.modules.get(MODULE_ID).api = {
        open, applyAll, runEntry, revertEntry, revertChain, undoIndex, statusOf, healthReport, showHealth, scanEmbedded,
        checkSettings, fixSettings, exportSettings, importSettings, pickAndImport,
        compatReport, detectEngine, currentCampaign, actorFor, bind,
        restorePlayerSettings, playerSettingsReport, clearPlayerSettings,
        registry: {CAMPAIGNS, CHARACTERS, ENTRIES, entriesFor}
    };
});
 
// A button in the Settings sidebar for the GM.
Hooks.on('renderSettings', (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector('.nix-module-open')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nix-module-open';
    btn.innerHTML = '<i class="fa-solid fa-hat-wizard"></i> ' + TITLE;
    btn.addEventListener('click', ev => { ev.preventDefault(); open(); });
    const target = root.querySelector('section.settings, #settings-game, .settings') ?? root;
    target.append(btn);
});
 
Hooks.once('ready', async () => {
    if (!game.user.isGM) return;
    if (game.users.activeGM && game.users.activeGM.id !== game.user.id) return;   // one GM does the checks
 
    // 1. Engine / versions.
    const engine = detectEngine();
    if (!engine.ok) ui.notifications.error(TITLE + ': ' + engine.why, {permanent: true});
    const warn = compatReport().filter(c => c.status === 'warn' || c.status === 'error');
    const signature = warn.map(w => w.id + '@' + w.version).join(',');
    if (warn.length && signature !== game.settings.get(MODULE_ID, 'lastCompatWarning')) {
        await ChatMessage.create({whisper: [game.user.id], content: '<b>' + TITLE + ': versions outside what was tested</b><ul>'
            + warn.map(w => '<li>' + w.label + ' ' + (w.version ?? '(inactive)') + ': ' + w.note + '</li>').join('')
            + '</ul>Run <b>Health check</b> in the ' + TITLE + ' window.'});
        await game.settings.set(MODULE_ID, 'lastCompatWarning', signature);
    }
    if (!engine.ok) return;
 
    // 2. Automations that changed since they were applied here.
    const campaign = currentCampaign();
    if (!campaign) return;
    const outdated = [], never = [];
    for (const e of entriesFor(campaign).filter(e => !e.manual)) {
        const s = await statusOf(e);
        if (s.state === 'outdated') outdated.push(e);
        else if (s.state === 'never') never.push(e);
    }
    if (outdated.length && game.settings.get(MODULE_ID, 'autoUpdate')) {
        await applyAll({confirm: false, onlyOutdated: true});
    } else if (outdated.length || never.length) {
        ui.notifications.info(TITLE + ': ' + [outdated.length && outdated.length + ' automation update(s)', never.length && never.length + ' not applied yet']
            .filter(Boolean).join(', ') + ' for ' + CAMPAIGNS[campaign] + '. Open Game Settings > ' + TITLE + '.', {permanent: true});
    }
    console.log(TITLE + ' | ready on Foundry v' + generation() + ', engine ' + engine.id);
});
 