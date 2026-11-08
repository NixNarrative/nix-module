// =====================================================================
//  NIX FIX: world settings
//  1. Checks the settings the automations depend on (and fixes them on request).
//  2. Exports / imports module settings between worlds, so Journey to the East,
//     The Fool's Journey and Espalian Escapades stay configured the same.
// =====================================================================
import {TITLE} from './constants.mjs';
 
const read = (ns, key) => {
    try { return game.settings.settings.has(ns + '.' + key) ? game.settings.get(ns, key) : undefined; }
    catch { return undefined; }
};
 
// Settings the automations rely on. `want` = the value to set when fixing; `check` decides ok.
export const REQUIRED = [
    {ns: 'gambits-premades', key: 'Enable Opportunity Attack', want: true, label: "Gambit's Premades: Enable Opportunity Attack = ON",
        why: 'Opportunity attacks never fire without it (Sentinel, War Caster, Mage Slayer, Fancy Footwork rely on it).'},
    {ns: 'gambits-premades', key: 'Enable Counterspell', want: false, label: "Gambit's Premades: Counterspell automation = OFF",
        why: 'The Spell Duel Counterspell replaces it; with both on, players get two prompts.'},
    {ns: 'midi-qol', key: 'ConfigSettings', label: 'Midi QOL: reactions on for players and GM', fixable: false,
        check: v => !v || (v.doReactions !== 'none' && v.gmDoReactions !== 'none'),
        why: 'Lucky, Hellish Rebuke, Phoenix Spark, Counterspell and others are reactions. Set in Midi\'s Workflow settings > Reactions.'},
    {module: 'vision-5e', label: 'Vision 5e active', why: 'The Darkness & Devil\'s Sight installer needs it.'},
    {module: 'sequencer', label: 'Sequencer active', why: 'Animations (Sand Shroud, Mantle of Flame, Hybrid Transformation...).'},
    {module: 'socketlib', label: 'socketlib active', why: 'Player prompts on other clients.'}
];
 
export function checkSettings() {
    return REQUIRED.map(r => {
        if (r.module) {
            const ok = !!game.modules.get(r.module)?.active;
            return {...r, state: ok ? 'ok' : 'warn', current: ok ? 'active' : 'inactive', fixable: false};
        }
        if (!game.modules.get(r.ns)?.active) return {...r, state: 'skip', current: 'module inactive', fixable: false};
        const v = read(r.ns, r.key);
        if (v === undefined) return {...r, state: 'unknown', current: 'setting not found (renamed in this version?)', fixable: false};
        const ok = r.check ? r.check(v) : v === r.want;
        return {...r, state: ok ? 'ok' : 'warn', current: typeof v === 'object' ? '' : String(v), fixable: r.fixable !== false && !ok};
    });
}
 
export async function fixSettings() {
    const fixed = [];
    for (const r of checkSettings().filter(c => c.fixable)) {
        await game.settings.set(r.ns, r.key, r.want);
        fixed.push(r.label);
    }
    return fixed;
}
 
// ---------------------------------------------------------------- export / import
// Modules whose world settings are worth keeping identical across campaigns.
export const SYNC_MODULES = ['midi-qol', 'chris-premades', 'cat', 'gambits-premades', 'autoanimations', 'dae', 'times-up',
    'vision-5e', 'sequencer', 'automated-conditions-5e', 'tidy5e-sheet', 'token-action-hud-dnd5e', 'monks-tokenbar',
    'smarttarget', 'acdc', 'levels', 'wall-height', 'aura-effects', 'dnd5e'];
 
// Never copied: per-world bookkeeping that would break the other world.
const NEVER = [/^nix-module\.(bindings|applied|campaign)$/, /migration/i, /version$/i, /^core\./];
 
function splitKey(fullKey, cfg) {
    const i = fullKey.indexOf('.');
    return {ns: cfg?.namespace ?? fullKey.slice(0, i), key: cfg?.key ?? fullKey.slice(i + 1)};
}
 
function worldSettingsFor(modules) {
    const out = {};
    for (const [fullKey, cfg] of game.settings.settings.entries()) {
        if (cfg.scope !== 'world') continue;
        const {ns, key} = splitKey(fullKey, cfg);
        if (!modules.includes(ns)) continue;
        if (NEVER.some(r => r.test(fullKey))) continue;
        try {
            const v = game.settings.get(ns, key);
            out[fullKey] = (v && typeof v === 'object' && typeof v.toObject === 'function') ? v.toObject() : v;
        } catch { /* unreadable: skip */ }
    }
    return out;
}
 
export function activeSyncModules() {
    return SYNC_MODULES.filter(id => id === 'dnd5e' ? game.system.id === 'dnd5e' : game.modules.get(id)?.active);
}
 
// The file type stays 'nix-module-settings' so files exported before the rename still import.
export function exportSettings(modules = activeSyncModules()) {
    const data = {
        type: 'nix-module-settings', exported: new Date().toISOString(), world: game.world.title,
        foundry: game.version, modules: Object.fromEntries(modules.map(m => [m, m === 'dnd5e' ? game.system.version : game.modules.get(m)?.version])),
        settings: worldSettingsFor(modules)
    };
    const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
    const name = 'nix-settings-' + game.world.id + '-' + new Date().toISOString().slice(0, 10) + '.json';
    save(JSON.stringify(data, null, 2), 'text/json', name);
    return Object.keys(data.settings).length;
}
 
// Apply an exported file. Returns {applied, skipped, differs}. dryRun lists what would change.
export async function importSettings(data, {modules = null, dryRun = false} = {}) {
    if (data?.type !== 'nix-module-settings') throw new Error('Not a ' + TITLE + ' settings file.');
    const applied = [], skipped = [], differs = [];
    for (const [fullKey, value] of Object.entries(data.settings ?? {})) {
        const cfg = game.settings.settings.get(fullKey);
        const ns = fullKey.split('.')[0];
        if (modules && !modules.includes(ns)) continue;
        if (!cfg || cfg.scope !== 'world' || NEVER.some(r => r.test(fullKey))) { skipped.push(fullKey); continue; }
        const {key} = splitKey(fullKey, cfg);
        let current;
        try { current = game.settings.get(ns, key); } catch { skipped.push(fullKey); continue; }
        const cur = (current && typeof current.toObject === 'function') ? current.toObject() : current;
        if (foundry.utils.objectsEqual?.(cur, value) ?? JSON.stringify(cur) === JSON.stringify(value)) continue;
        differs.push(fullKey);
        if (dryRun) continue;
        try { await game.settings.set(ns, key, value); applied.push(fullKey); }
        catch (err) { console.warn(TITLE + ' | could not set ' + fullKey, err); skipped.push(fullKey); }
    }
    return {applied, skipped, differs};
}
 
export async function pickAndImport() {
    const readText = foundry.utils.readTextFromFile ?? globalThis.readTextFromFile;
    const file = await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
        input.click();
    });
    if (!file) return null;
    const data = JSON.parse(await readText(file));
    const preview = await importSettings(data, {dryRun: true});
    if (!preview.differs.length) {
        ui.notifications.info(TITLE + ': every setting in that file already matches this world.');
        return {applied: [], skipped: preview.skipped, differs: []};
    }
    const byModule = {};
    for (const k of preview.differs) (byModule[k.split('.')[0]] ??= []).push(k.slice(k.indexOf('.') + 1));
    const list = Object.entries(byModule).map(([m, keys]) =>
        '<li><label><input type="checkbox" name="mod" value="' + m + '" checked> <b>' + m + '</b> (' + keys.length + ')</label>'
        + '<div class="nix-small">' + keys.slice(0, 12).map(foundry.utils.escapeHTML ?? (s => s)).join(', ') + (keys.length > 12 ? ', ...' : '') + '</div></li>').join('');
    const DialogV2 = foundry.applications.api.DialogV2;
    const chosen = await DialogV2.wait({
        window: {title: 'Import settings from ' + (data.world ?? 'file')},
        position: {width: 560},
        content: '<p>These world settings differ from <b>' + game.world.title + '</b>. Tick the modules to copy over.</p><ul class="nix-list">' + list + '</ul>',
        buttons: [
            {action: 'apply', label: 'Apply', icon: 'fa-solid fa-check', default: true,
                callback: (event, button) => [...button.form.querySelectorAll('input[name=mod]:checked')].map(i => i.value)},
            {action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark', callback: () => null}
        ],
        rejectClose: false
    });
    if (!chosen?.length) return null;
    const result = await importSettings(data, {modules: chosen});
    ui.notifications.info(TITLE + ': ' + result.applied.length + ' settings copied. Reload to be sure every module picks them up.');
    return result;
}
 