// =====================================================================
//  NIX FIX: player settings keeper
//  Smart Target's targeting mode and ACDC's dice mode are "client" settings:
//  Foundry keeps them in the browser (localStorage) for the exact address the
//  player typed in. A new IP/port/link, a different browser or cleared site
//  data and they're back to the module defaults.
//
//  This keeps a copy on the player's User document (flags.nix-module.clientSettings),
//  which lives in the world database, and puts it back at login:
//   - remember: the player's last choice (from any browser) wins; anything
//               they never chose gets the GM's player defaults below.
//   - force:    the GM's player defaults are applied at every login.
//   - off:      nothing is touched.
//  The GM's own settings are backed up and restored too, but defaults only
//  apply to players.
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';

const FLAG = 'clientSettings';
const KEEP = 'keep';
const DICE_KEY = () => 'core.' + (foundry.dice?.Roll?.DICE_CONFIGURATION_SETTING ?? globalThis.Roll?.DICE_CONFIGURATION_SETTING ?? 'diceConfiguration');

// User flags expand dotted keys into nested objects, so store "ns.key" as "ns:key".
const enc = k => k.replaceAll('.', ':');

// CAT can take over manual rolls; ACDC then ignores its own mode, and so do we.
function catControlsDice() {
    if (!game.modules.get('cat')?.active) return false;
    const has = k => game.settings.settings.has('cat.' + k);
    if (!['manualRollsEnabled', 'manualRollsUsers', 'manualRollsInclusion'].every(has)) return false;
    return game.settings.get('cat', 'manualRollsEnabled')
        || (!!game.settings.get('cat', 'manualRollsUsers')?.length && game.settings.get('cat', 'manualRollsInclusion') > 0);
}

// Order matters: the core dice configuration before ACDC's mode.
function tracked() {
    const list = [
        {key: 'smarttarget.targetingMode', label: 'Smart Target mode', def: () => {
            const v = game.settings.get(MODULE_ID, 'playerTargetingMode');
            return v === KEEP ? undefined : Number(v);
        }},
        {key: 'smarttarget.release', label: 'Smart Target release behaviour'},
        {key: DICE_KEY(), label: 'Dice configuration'},
        {key: 'acdc.rollMode', label: 'Dice roll mode', skip: catControlsDice, def: () => {
            const v = game.settings.get(MODULE_ID, 'playerRollMode');
            return v === KEEP ? undefined : v;
        }},
        {key: 'acdc.manualNonRegisteredDenominations', label: 'ACDC unusual dice'}
    ];
    return list.filter(t => game.settings.settings.has(t.key) && !t.skip?.());
}

const split = full => { const i = full.indexOf('.'); return [full.slice(0, i), full.slice(i + 1)]; };
const read = full => { try { return game.settings.get(...split(full)); } catch { return undefined; } };
const plain = v => (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
const same = (a, b) => JSON.stringify(plain(a)) === JSON.stringify(plain(b));
const inBrowser = full => { try { return localStorage.getItem(full) !== null; } catch { return false; } };

let restoring = false;

async function backup() {
    if (restoring || game.settings.get(MODULE_ID, 'playerSettingsMode') === 'off') return;
    const saved = game.user.getFlag(MODULE_ID, FLAG) ?? {};
    const update = {};
    for (const t of tracked()) {
        const k = enc(t.key);
        if (!inBrowser(t.key) && !(k in saved)) continue;   // never chosen anywhere: nothing to keep
        const v = plain(read(t.key));
        if (v !== undefined && !same(saved[k], v)) update[k] = v;
    }
    if (Object.keys(update).length) await game.user.setFlag(MODULE_ID, FLAG, update);
}
const backupSoon = foundry.utils.debounce(() => backup().catch(e => console.warn(TITLE + ' | player settings backup failed', e)), 750);

// ACDC only rewrites the dice configuration when its mode *changes*; make sure the two agree.
async function reconcileDice() {
    if (!game.modules.get('acdc')?.active || catControlsDice() || !game.settings.settings.has('acdc.rollMode')) return false;
    const mode = read('acdc.rollMode');
    const cfg = plain(read(DICE_KEY())) ?? {};
    const want = mode === 'auto' ? '' : 'manual';
    if ((cfg.default ?? '') === want) return false;
    cfg.default = want;
    await game.settings.set(...split(DICE_KEY()), cfg);
    return true;
}

export async function restorePlayerSettings() {
    const mode = game.settings.get(MODULE_ID, 'playerSettingsMode');
    if (mode === 'off') return [];
    const saved = game.user.getFlag(MODULE_ID, FLAG) ?? {};
    const changed = [];
    restoring = true;
    try {
        for (const t of tracked()) {
            const k = enc(t.key);
            const def = game.user.isGM ? undefined : t.def?.();
            let want;
            if (mode === 'force' && def !== undefined) want = def;
            else if (k in saved) want = saved[k];
            else if (!inBrowser(t.key)) want = def;
            if (want === undefined || same(read(t.key), want)) continue;
            await game.settings.set(...split(t.key), want);
            changed.push(t.label);
        }
        if (await reconcileDice() && !changed.includes('Dice configuration')) changed.push('Dice configuration');
    } catch (e) {
        console.warn(TITLE + ' | player settings restore failed', e);
    } finally {
        restoring = false;
    }
    await backup().catch(() => {});
    if (changed.length) {
        ui.controls?.render?.({reset: true});   // ACDC's toolbar button shows the mode
        console.log(TITLE + ' | restored player settings: ' + changed.join(', '));
    }
    return changed;
}

// GM helper: what each player has saved. game.modules.get('nix-module').api.playerSettingsReport()
export function playerSettingsReport() {
    return game.users.filter(u => !u.isGM).map(u => ({user: u.name, saved: u.getFlag(MODULE_ID, FLAG) ?? {}}));
}

// GM helper: forget a player's saved copy, so the defaults apply at their next login.
export async function clearPlayerSettings(userOrName) {
    const u = typeof userOrName === 'string' ? game.users.getName(userOrName) ?? game.users.get(userOrName) : userOrName;
    if (!u) throw new Error('No user ' + userOrName);
    await u.unsetFlag(MODULE_ID, FLAG);
}

export function registerPlayerSettings() {
    game.settings.register(MODULE_ID, 'playerSettingsMode', {
        name: 'Player settings: keep across browsers',
        hint: 'Smart Target and dice-mode settings live in each browser and reset when a player joins from a new address or browser. '
            + 'Remember: each player\'s own last choice is saved to their user and restored at login; the defaults below fill anything they never chose. '
            + 'Force: the defaults below are applied at every login.',
        scope: 'world', config: true, type: String, default: 'remember',
        choices: {remember: 'Remember each player\'s choices', force: 'Force the player defaults every login', off: 'Off'}
    });
    game.settings.register(MODULE_ID, 'playerTargetingMode', {
        name: 'Player default: Smart Target targeting mode',
        hint: 'Used for players who have never picked a targeting mode (or always, in Force).',
        scope: 'world', config: true, type: String, default: '2',
        choices: {[KEEP]: 'Don\'t set', 0: 'Default', 1: 'Alt-Click', 2: 'Always Target (Player Only)'}
    });
    game.settings.register(MODULE_ID, 'playerRollMode', {
        name: 'Player default: dice roll mode (ACDC)',
        hint: 'Used for players who have never picked a dice mode (or always, in Force). Ignored while CAT is controlling manual rolls.',
        scope: 'world', config: true, type: String, default: 'manual',
        choices: {[KEEP]: 'Don\'t set', auto: 'Automatic (digital) rolls', manual: 'Manual rolls', smart: 'Smart (ACDC roll types)'}
    });

    Hooks.on('clientSettingChanged', key => {
        if (restoring || !game.ready) return;
        if (tracked().some(t => t.key === key)) backupSoon();
    });
    Hooks.once('ready', () => restorePlayerSettings());
}
