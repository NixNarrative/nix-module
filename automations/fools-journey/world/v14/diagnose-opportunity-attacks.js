// =====================================================================
//  OPPORTUNITY ATTACKS: DIAGNOSTIC, Foundry v14 copy (run as GM)
//  Changes nothing. Best run during a combat, on the scene where OAs fail.
//  Whispers you a report:
//   1. every active module that could handle Opportunity Attacks or reactions
//   2. every module setting about opportunity attacks / reactions, with its value
//      (Gambit's Premades 3, Midi QOL 14, CAT and Chris's Premades 2 included)
//   3. in the current combat: who has an Opportunity Attack item / effect,
//      and any OA regions on the scene (templates are Regions on v14)
// =====================================================================
const esc = s => foundry.utils.escapeHTML(String(s ?? ''));
const OA = /opportun/i;
const RX = /opportun|reaction|reactive/i;
 
// ---- 1. Modules ---------------------------------------------------------------------
const watch = /opportun|gambit|midi|chris-premades|^cat$|coven|reaction|combat-utility|automated|threat|attack-of|movement|drag-ruler|elevation-ruler|token-attacher|dfreds|times-up|dae/i;
const mods = game.modules.contents.filter(m => m.active && (watch.test(m.id) || watch.test(m.title)));
const modRows = mods.map(m => '<tr><td>' + esc(m.title) + '</td><td>' + esc(m.version) + '</td></tr>').join('');
const oaModules = game.modules.contents.filter(m => m.active && (OA.test(m.id) || OA.test(m.title)));
 
// ---- 2. Settings ---------------------------------------------------------------------
const setRows = [];
for (const [key, cfg] of game.settings.settings.entries()) {
    const text = [key, cfg.name, cfg.hint].map(t => { try { return game.i18n.localize(String(t ?? '')); } catch { return String(t ?? ''); } }).join(' ');
    if (!RX.test(text)) continue;
    if (!game.modules.get(cfg.namespace)?.active && cfg.namespace !== 'core' && cfg.namespace !== game.system.id) continue;
    let value;
    try { value = game.settings.get(cfg.namespace, cfg.key); } catch { value = '(unreadable)'; }
    if (typeof value === 'object') value = JSON.stringify(value);
    if (String(value).length > 120) value = String(value).slice(0, 120) + '...';
    const label = (() => { try { return game.i18n.localize(cfg.name ?? cfg.key); } catch { return cfg.key; } })();
    setRows.push('<tr><td>' + esc(cfg.namespace) + '</td><td>' + esc(label) + '<br><small>' + esc(cfg.key) + ' (' + esc(cfg.scope) + ')</small></td><td><b>' + esc(value) + '</b></td></tr>');
}
const midi = globalThis.MidiQOL?.configSettings?.();
const midiRows = [];
if (midi) for (const k of ['autoCheckHit', 'doReactions', 'gmDoReactions', 'reactionTimeout', 'enforceReactions', 'enforceBonusActions', 'showReactionAttackRoll', 'recordAOO', 'optionalRulesEnabled', 'checkRange', 'autoTarget'])
    if (k in midi) midiRows.push('<tr><td>' + esc(k) + '</td><td><b>' + esc(typeof midi[k] === 'object' ? JSON.stringify(midi[k]) : midi[k]) + '</b></td></tr>');
if (midi?.optionalRules) for (const [k, v] of Object.entries(midi.optionalRules)) if (/react|incapacitat|range|nearby/i.test(k))
    midiRows.push('<tr><td>optionalRules.' + esc(k) + '</td><td><b>' + esc(typeof v === 'object' ? JSON.stringify(v) : v) + '</b></td></tr>');
 
// ---- 3. Current combat ------------------------------------------------------------------
const combatRows = [];
const activationOf = i => [...new Set((i.system.activities?.contents ?? []).map(a => a.activation?.type).filter(Boolean))].join('/');
if (game.combat) {
    for (const c of game.combat.combatants) {
        const a = c.actor;
        if (!a) { combatRows.push('<tr><td>' + esc(c.name) + '</td><td colspan="3">no actor</td></tr>'); continue; }
        const items = a.items.filter(i => OA.test(i.name)).map(i => i.name + (activationOf(i) ? ' [' + activationOf(i) + ']' : ''));
        const fx = a.effects.filter(e => OA.test(e.name)).map(e => e.name + (e.disabled ? ' (off)' : ''));
        const reactionItems = a.items.filter(i => (i.system.activities?.contents ?? []).some(x => /reaction/.test(x.activation?.type ?? ''))).length;
        const used = (() => { try { return MidiQOL.hasUsedReaction(a) ? 'used' : 'free'; } catch { return '?'; } })();
        combatRows.push('<tr><td>' + esc(c.name) + '</td><td>' + esc(items.join(', ') || '-') + '</td><td>' + esc(fx.join(', ') || '-') + '</td><td>' + reactionItems + ' / ' + used + '</td></tr>');
    }
}
const regions = (canvas.scene?.regions?.contents ?? []).filter(r => OA.test(r.name) || OA.test(JSON.stringify(r.flags ?? {})));
 
// ---- Report -------------------------------------------------------------------------------
const table = (head, rows) => rows.length ? '<table><tr>' + head.map(h => '<th>' + h + '</th>').join('') + '</tr>' + rows.join('') + '</table>' : '<p><em>none</em></p>';
let html = '<h3>Opportunity Attack diagnostic (v14)</h3>';
html += '<p><b>Modules that could handle OAs on their own:</b> ' + (oaModules.map(m => esc(m.title)).join(', ') || 'none') + '</p>';
html += '<h4>Related active modules</h4><table>' + modRows + '</table>';
html += '<h4>Settings mentioning opportunity attacks / reactions</h4>' + table(['Module', 'Setting', 'Value'], setRows);
html += '<h4>Midi QOL reaction settings</h4>' + table(['Setting', 'Value'], midiRows);
html += '<h4>Current combat</h4>' + (game.combat ? table(['Combatant', 'OA items', 'OA effects', 'Reaction items / reaction'], combatRows) : '<p><em>No combat running: start one and run this again for this part.</em></p>');
html += '<p>OA regions on this scene: <b>' + regions.length + '</b>' + (regions.length ? ' (' + regions.map(r => esc(r.name)).join(', ') + ')' : '') + '.</p>';
await ChatMessage.create({whisper: [game.user.id], content: html});
console.log('OA diagnostic (v14)', {oaModules: oaModules.map(m => m.id), settings: setRows.length, midi: midiRows.length, regions});
 