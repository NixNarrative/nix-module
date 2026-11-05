// =====================================================================
//  NIX MODULE: compatibility
//  Which automation engine this world runs on, and whether the installed
//  versions are inside the range the automations were tested with.
// =====================================================================
 
const newer = (a, b) => foundry.utils.isNewerVersion(String(a), String(b));   // a > b
 
// Versions every v13 automation was table-tested with (Foundry v13 worlds, Nov 2026).
// "below" is the first version that is NOT trusted any more (major rewrites).
export const TESTED_V13 = [
    {id: 'core', label: 'Foundry VTT', tested: '13', min: '13', below: '14'},
    {id: 'dnd5e', label: 'D&D 5e system', tested: '5.3.3', min: '5.0.0', below: '6.0.0', system: true},
    {id: 'midi-qol', label: 'Midi QOL', tested: '13.0.69', min: '13.0.0', below: '14.0.0', required: true},
    {id: 'chris-premades', label: "Chris's Premades (CPR)", tested: '1.5.51', min: '1.5.0', below: '2.0.0', required: true},
    {id: 'dae', label: 'DAE', tested: '13', min: '13.0.0', below: '14.0.0'},
    {id: 'gambits-premades', label: "Gambit's Premades", tested: '2.1.44', min: '2.1.0', below: '3.0.0'},
    {id: 'autoanimations', label: 'Automated Animations', tested: '6.8.2', min: '6.0.0', below: '7.0.0'},
    {id: 'vision-5e', label: 'Vision 5e', tested: '3.2.3', min: '3.0.0', below: '4.0.0'},
    {id: 'sequencer', label: 'Sequencer', tested: 'any', min: '0', below: null},
    {id: 'times-up', label: 'Times Up', tested: 'any', min: '0', below: null}
];
 
// The v14 port was written against these (V14-MAPPING.md, Nov 2026). Not table-tested yet.
// Midi 14.6.x supports dnd5e 6.0.x only: dnd5e 6.1 changes damage application.
// CAT is pre-release, so any minor bump is treated as untested.
export const TESTED_V14 = [
    {id: 'core', label: 'Foundry VTT', tested: '14.369', min: '14', below: '15'},
    {id: 'dnd5e', label: 'D&D 5e system', tested: '6.0.6', min: '6.0.0', below: '6.1.0', system: true},
    {id: 'midi-qol', label: 'Midi QOL', tested: '14.6.8', min: '14.6.5', below: '15.0.0', required: true},
    {id: 'chris-premades', label: "Chris's Premades 2", tested: '2.1.6', min: '2.1.0', below: '3.0.0', required: true},
    {id: 'cat', label: "Coven's Automation Toolkit (CAT)", tested: '0.1.6', min: '0.1.6', below: '0.2.0', required: true},
    {id: 'dae', label: 'DAE', tested: '14.6.6', min: '14.6.4', below: '15.0.0'},
    {id: 'gambits-premades', label: "Gambit's Premades", tested: '3.0.5', min: '3.0.0', below: '4.0.0'},
    {id: 'autoanimations', label: 'Automated Animations', tested: '8.0.6', min: '8.0.0', below: '9.0.0'},
    {id: 'vision-5e', label: 'Vision 5e', tested: '3.2.3', min: '3.0.0', below: '4.0.0'},
    {id: 'sequencer', label: 'Sequencer', tested: 'any', min: '0', below: null},
    {id: 'times-up', label: 'Times Up', tested: 'any', min: '0', below: null}
];
// Kept for anything that imported the old name.
export const TESTED = TESTED_V13;
 
export function generation() {
    return Number(game.release?.generation ?? String(game.version).split('.')[0]);
}
export const testedTable = () => (generation() >= 14 ? TESTED_V14 : TESTED_V13);
 
function versionOf(id) {
    if (id === 'core') return game.version ?? game.release?.version;
    if (id === 'dnd5e') return game.system.id === 'dnd5e' ? game.system.version : null;
    const m = game.modules.get(id);
    return m?.active ? m.version : null;
}
 
// One row per package: ok | warn (outside tested range) | missing | error (required, inactive).
export function compatReport() {
    return testedTable().map(t => {
        const version = versionOf(t.id);
        let status = 'ok', note = '';
        if (!version) {
            status = t.required ? 'error' : 'missing';
            note = t.required ? 'Required and not active.' : 'Not active.';
        } else if (newer(t.min, version)) {
            status = 'warn'; note = 'Older than anything tested.';
        } else if (t.below && !newer(t.below, version)) {
            status = 'warn'; note = 'Newer version than tested (' + t.tested + '). Test on a copy of the world first.';
        }
        return {...t, version, status, note};
    });
}
 
// The engine the automations write into.
//   cpr1:  CPR 1.x embedded macros (flags.chris-premades.embeddedMacros). Foundry v13.
//   cat:   CPR 2.x / Coven's Automation Toolkit (flags.cat.embeddedMacros, stored shape
//          {name, event, pass, macros: [{macro, priority}]}). Foundry v14. Partly ported:
//          only entries with a `v14` copy in the registry run; the rest show "not ported".
//   none:  Chris's Premades isn't active.
export function detectEngine() {
    const cpr = game.modules.get('chris-premades');
    const cat = game.modules.get('cat');
    if (cpr?.active && newer('2.0.0', cpr.version)) return {id: 'cpr1', ok: true, label: "Chris's Premades " + cpr.version + ' (embedded macros)'};
    if (cat?.active || (cpr?.active && !newer('2.0.0', cpr.version))) {
        if (!cat?.active) {
            return {id: 'cat', ok: false, label: "Chris's Premades " + (cpr?.version ?? '-') + ' without CAT',
                why: 'Chris\'s Premades 2 needs Coven\'s Automation Toolkit (CAT). Activate it: the v14 automations write CAT macros.'};
        }
        return {id: 'cat', ok: true, partial: true,
            label: "Chris's Premades " + (cpr?.version ?? '-') + ' / CAT ' + cat.version + ' (v14 engine)',
            note: 'v14 port in progress: automations marked "Not ported to v14 yet" don\'t run in this world. Test on a copy of the world first.'};
    }
    return {id: 'none', ok: false, label: 'Chris\'s Premades not active', why: 'Every automation runs through Chris\'s Premades embedded macros. Activate it.'};
}
 