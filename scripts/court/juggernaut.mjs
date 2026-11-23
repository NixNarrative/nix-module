// =====================================================================
//  NIX FIX: Court of Ravenloft, Juggernaut boss kit (v13 Chris's Premades 1 and v14 CAT, 1.7.7)
//  For an actor the "Juggernaut: boss kit" installer marked (flags.nix-module.juggernaut):
//   - Aura (30 ft): rolled when combat starts and again at the start of each of his turns, among the
//     auras still switched on (the GM's Aura Controls: their devices can be destroyed). 3 on: 1d3;
//     2 on: 1d2 mapped to those two; 1 on: it is active, no roll; 0 on: no aura. The same aura keeps it.
//     The roll goes to chat; the active aura shows on his token (effect + icon, a Sequencer ring when JB2A has one).
//       1 Tasha's Hideous Laughter  A creature other than him that starts its turn within 30 ft, while he has HP,
//                                   makes a DC 13 Wis save (Midi's normal save request): Incapacitated for that
//                                   turn, Prone until the start of its next turn.
//       2 Ray of Enfeeblement       No save. Every creature other than him within 30 ft has disadvantage on
//                                   Constitution saves; it comes off as soon as the creature leaves.
//       3 Decaying Mist             No save. Every creature other than him within 30 ft can't regain hit points;
//                                   it comes off as soon as it leaves (plants wither: flavor).
//     Auras 2 and 3 are put on / taken off when a token moves (his or theirs), a token appears or goes, the aura
//     changes on his roll or by the switches, he dies, and when combat ends. One effect per creature per aura.
//   - Aura Controls (GM-only activity, no action, no pip): a switch per aura, stored on his flag (disabledAuras),
//     kept across combats. Switching the active aura off ends it at once; he has no aura until his next roll.
//   - Lightning absorption: lightning damage heals him by the amount instead (Midi damage hook).
//   - Legendary Actions (native pips, 1 each): Charge (30-ft line, 2d8 bludgeoning to each creature, DC 13 Dex
//     save or Prone); Toss: Rock (ranged attack, 30 ft: 2d8 bludgeoning + Prone on a hit); Toss: Creature (melee
//     attack on a Prone creature, Large or smaller, within reach: Prone, the GM picks where it lands within 30 ft,
//     then a DC 15 Dex save there: 2d8 bludgeoning, half on a success; Prone either way).
//   - Legendary Resistance (3/day, native pips): one prompt on a failed save (succeed / accept). v13: a Chris's
//     Premades 1 save macro; v14: the CAT save macro juggernautLegendaryResistance (illrigger-features.mjs).
//   - Petrifying Gaze (1/day): Flesh to Stone style. Fail the first DC 15 Con save -> Restrained and
//     petrifying; a Con save at the end of each of its turns; 3 failures = Petrified, 3 successes = free.
//  Active GM only for combat, saves and effects; the damage hook runs wherever the damage is rolled.
//  On v14 every call goes through engine.mjs's cpr() adapter (TokenDocuments for synthetic rolls, nothing spent).
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {appliedDamages, cpr, damageOfType, fx, HOOKS, MODES, rolledDamages, teleport} from './engine.mjs';

export const FLAG = 'juggernaut';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
export const jugOf = actor => actor?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const kindOf = activity => activity?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const AURA_FX = 'juggernautAura', PETRIFY_FX = 'juggernautPetrify', NOHEAL_FX = 'juggernautNoHeal', PRESENCE = 'juggernautPresence';

export const AURAS = Object.freeze({
    1: {key: 'laughter', name: 'Tasha\'s Hideous Laughter', save: true, ability: 'wis', dc: 13, img: 'icons/magic/control/hypnosis-mesmerism-swirl.webp',
        short: 'DC 13 Wis save at the start of its turn, or Incapacitated that turn and Prone.',
        text: 'A creature that starts its turn within 30 ft makes a DC 13 Wisdom save. On a failure it laughs: Incapacitated for that turn, Prone until the start of its next turn.',
        anim: [/template_circle\.aura.*(pink|purple)/, /aura.*(pink|purple)/]},
    2: {key: 'enfeeble', name: 'Ray of Enfeeblement', save: false, img: 'icons/magic/unholy/beam-ringed-impact-purple.webp',
        short: 'No save: disadvantage on Constitution saves while within 30 ft.',
        text: 'No save. Every creature other than him within 30 ft has disadvantage on Constitution saving throws. It ends as soon as the creature leaves the aura.',
        anim: [/template_circle\.aura.*(dark_?purple|black|grey|gray|dark)/, /aura.*(dark|black|grey|gray)/]},
    3: {key: 'mist', name: 'Decaying Mist', save: false, img: 'icons/magic/unholy/hand-claw-fog-green.webp',
        short: 'No save: can\'t regain hit points while within 30 ft.',
        text: 'No save. Every creature other than him within 30 ft can\'t regain hit points. It ends as soon as the creature leaves the aura. Plants in the mist wither and die.',
        anim: [/template_circle\.aura.*green/, /aura.*green/]}
});
export const DEFAULTS = Object.freeze({radius: 30, gazeDc: 15, chargeDc: 13, tossRange: 30, tossDc: 15});
export const auraOf = n => AURAS[Number(n)] ?? null;
const dcFor = (cfg, a) => Number(cfg?.dcs?.[a.key] ?? a.dc);

export const alive = actor => !!actor && (actor.system?.attributes?.hp?.value ?? 0) > 0 && !actor.statuses?.has?.('dead');
const tokenOf = actor => actor?.token?.object ?? actor?.getActiveTokens?.()?.[0] ?? null;
const SIZES = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'];
export const tossable = actor => SIZES.indexOf(actor?.system?.traits?.size ?? 'med') <= SIZES.indexOf('lg');

// ---------------------------------------------------------------- aura switches (pure, tested)
// flags.nix-module.juggernaut.disabledAuras: the aura numbers whose devices are destroyed (switched off).
export const disabledOf = cfg => new Set(Array.from(cfg?.disabledAuras ?? []).map(Number).filter(n => AURAS[n]));
export const enabledAuras = cfg => [1, 2, 3].filter(n => !disabledOf(cfg).has(n));
// What his aura roll does with the auras still on: none (no aura), auto (the one left, no roll) or roll (1dN mapped).
export function auraRollPlan(enabled) {
    const list = Array.from(new Set(Array.from(enabled ?? []).map(Number).filter(n => AURAS[n]))).sort((a, b) => a - b);
    if (!list.length) return {mode: 'none', list};
    if (list.length === 1) return {mode: 'auto', list, aura: list[0]};
    return {mode: 'roll', list, formula: '1d' + list.length};
}
// The aura a die result picks: result 1 = the first switched-on aura, 2 = the second...
export const auraForRoll = (plan, total) => plan?.list?.length ? plan.list[Math.min(plan.list.length, Math.max(1, Math.floor(Number(total)) || 1)) - 1] : 0;
// Chat text for the mapping when fewer than 3 are on.
export const mappingText = plan => plan.list.map((n, i) => (i + 1) + ' = ' + AURAS[n].name).join(', ');

// ---------------------------------------------------------------- no-save auras 2 / 3: who is in them (pure, tested)
// juggs: [{tokenId, sceneId, aura, radius, alive}], tokens: [{id, sceneId, isJuggernaut}], dist(juggTokenId, tokenId) in feet.
// Returns Map(tokenId -> Set of aura keys it should carry). The Juggernaut never carries his own (or another's).
export function desiredPresence(juggs, tokens, dist) {
    const out = new Map();
    for (const t of tokens) {
        const keys = new Set();
        if (!t.isJuggernaut) for (const j of juggs) {
            const a = auraOf(j.aura);
            if (!a || a.save || !j.alive || j.sceneId !== t.sceneId) continue;
            const d = Number(dist(j.tokenId, t.id));
            if (Number.isFinite(d) && d <= Number(j.radius ?? DEFAULTS.radius)) keys.add(a.key);
        }
        out.set(t.id, keys);
    }
    return out;
}
// current: [{id, key}] presence effects on one creature; desired: Set of keys. Duplicates are removed (no stacking).
export function presenceDiff(current, desired) {
    const seen = new Set(), remove = [];
    for (const e of current ?? []) {
        if (!desired.has(e.key) || seen.has(e.key)) remove.push(e.id);
        else seen.add(e.key);
    }
    return {remove, add: Array.from(desired).filter(k => !seen.has(k))};
}
export function presenceEffect(key, source) {
    const a = Object.values(AURAS).find(x => x.key === key);
    if (!a || a.save) return null;
    const base = {name: a.name + ' (' + (source?.name ?? 'Juggernaut') + '\'s aura)', img: a.img, origin: source?.uuid, transfer: false, disabled: false,
        // A duration makes it temporary, so its icon shows on the token; Nix Fix takes it off when the creature leaves.
        duration: {seconds: 3600}, description: '<p>' + a.text + '</p>', flags: {[MODULE_ID]: {[PRESENCE]: key}}};
    if (key === 'enfeeble') return {...base, changes: [{key: 'flags.midi-qol.disadvantage.save.con', mode: MODES.OVERRIDE, value: '1', priority: 20}]};
    return {...base, flags: {[MODULE_ID]: {[PRESENCE]: key, [NOHEAL_FX]: true}}};
}

// ---------------------------------------------------------------- lightning absorption
// Midi (v13 branch, Workflow.callDamageHooksAndMacros): preTargetDamageApplication runs before the damage card is made;
// the card is applied from damageDetail (useDamageDetail) or hpDamage, and a negative hpDamage heals (GMAction
// calculateDamageAmounts: "healing" entries are summed as negative numbers). Lightning entries are zeroed and one
// "healing" entry of minus the amount is added, then the totals are worked out the way Midi's setupDamageDetails does.
// The amount is the lightning as dealt (after a save's halving); if a trait still zeroed it (an immunity from an effect),
// the amount as rolled. Midi's own absorption (system.traits.da.lightning) is left alone so it never heals twice.
// Midi 14.7 (v14) names the lists calculatedDamages / damages (engine.mjs appliedDamages / rolledDamages).
export function absorbLightning(ditem, hp) {
    if (!ditem || !hp) return 0;
    const list = appliedDamages(ditem);
    const light = Array.from(list ?? []).filter(d => d?.type === 'lightning');
    if (!light.length && damageOfType(rolledDamages(ditem), 'lightning') <= 0) return 0;
    if (light.some(d => d.active?.absorption || d.active?.type?.absorption || Number(d.value) < 0)) return 0;
    const dealt = damageOfType(light, 'lightning');
    const heal = Math.floor(dealt > 0 ? dealt : damageOfType(rolledDamages(ditem), 'lightning'));
    if (!(heal > 0)) return 0;
    for (const d of light) { d.nixAbsorbed = d.value; d.value = 0; if ('damage' in d) d.damage = 0; }
    list.push({type: 'healing', value: -heal, damage: -heal, active: {multiplier: 1}, nixAbsorbed: true});
    let damage = 0, healing = 0, temp = 0;
    for (const d of list) {
        const v = Number(d?.value) || 0;
        if (d?.type === 'temphp') temp += v;
        else if (d?.type === 'healing' || d?.active?.absorption) healing += v;
        else if (!['midi-none', 'vitality', 'maximum'].includes(d?.type)) damage += v;
    }
    damage = Math.max(0, damage);
    let total = damage + healing;
    total = total < 0 ? Math.ceil(total) : Math.floor(total);
    const value = Number(hp.value) || 0, tempNow = Number(hp.temp) || 0;
    const missing = Number.isFinite(Number(hp.damage)) ? Number(hp.damage) : Math.max(0, (Number(hp.effectiveMax ?? hp.max) || 0) - value);
    const deltaTemp = total > 0 ? Math.min(tempNow, total) : 0;
    const deltaHP = Math.min(Math.max(total - deltaTemp, -missing), value);
    ditem.totalDamage = damage;
    ditem.healingAdjustedTotalDamage = total;
    ditem.oldHP = value;
    ditem.hpDamage = deltaHP;
    ditem.newHP = value - deltaHP;
    ditem.oldTempHP = tempNow;
    ditem.newTempHP = Math.floor(Math.max(0, tempNow - deltaTemp, temp));
    ditem.tempDamage = tempNow - ditem.newTempHP;
    return heal;
}
function onTargetDamage(token, {ditem} = {}) {
    const actor = token?.actor;
    if (!jugOf(actor) || jugOf(actor).absorbLightning === false || !ditem) return;
    try {
        const heal = absorbLightning(ditem, actor.system.attributes.hp);
        if (heal > 0) ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),
            content: '<b>Lightning Absorption:</b> ' + esc(actor.name) + ' drinks in the lightning and regains up to ' + heal + ' hit points instead of taking it.'});
    } catch (err) { console.error(TITLE + ' | Juggernaut lightning absorption', err); }
}

// ---------------------------------------------------------------- saves
// Midi workflow from the Juggernaut, so the target gets its normal save request (players roll their own).
// damage: optional {parts, onSave} (Toss landing: 2d8 bludgeoning, half on a success).
async function rollSave(owner, tokens, ability, dc, name, img, damage = null) {
    if (!tokens.length || !cpr()?.workflowUtils?.syntheticItemDataRoll) return new Set();
    const id = 'nixJuggernautSv0';
    const itemData = {name, img, type: 'feat',
        system: {activities: {[id]: {_id: id, type: 'save', name, activation: {type: 'special'}, range: {units: 'any'},
            target: {affects: {count: String(tokens.length), type: 'creature'}},
            save: {ability: [ability], dc: {calculation: '', formula: String(dc)}}, damage: damage ?? {onSave: 'none', parts: []}}}},
        flags: {[MODULE_ID]: {juggernautSave: true}, autoanimations: {isEnabled: false, version: 5}}};
    try {
        const wf = await cpr().workflowUtils.syntheticItemDataRoll(itemData, owner, tokens);
        return new Set(Array.from(wf?.failedSaves ?? []).map(t => t.document?.uuid ?? t.uuid));
    } catch (err) {
        console.error(TITLE + ' | ' + name, err);
        return new Set();
    }
}
const failedOne = (set, tok) => set.has(tok.document?.uuid ?? tok.uuid);
export const TWO_D8 = Object.freeze({number: 2, denomination: 8, bonus: '', types: ['bludgeoning'], custom: {enabled: false, formula: ''}, scaling: {mode: '', number: null, formula: ''}});

// Effects a failed Laughter save leaves (Incapacitated this turn, Prone until the start of its next turn).
// Auras 2 and 3 have no save (presenceEffect), so they leave none.
export function auraEffects(n, source) {
    const a = auraOf(n);
    if (!a || !a.save) return [];
    const base = {img: a.img, origin: source?.uuid, transfer: false, disabled: false};
    const untilNext = {duration: {rounds: 1}, flags: {dae: {specialDuration: ['turnStart']}, [MODULE_ID]: {juggernautAuraFail: a.key}}};
    return [
        {...base, name: 'Hideous Laughter (Incapacitated)', statuses: ['incapacitated'], description: 'Laughing helplessly: Incapacitated for this turn.',
            duration: {turns: 1}, flags: {dae: {specialDuration: ['turnEnd']}, [MODULE_ID]: {juggernautAuraFail: a.key}}},
        {...base, ...untilNext, name: 'Hideous Laughter (Prone)', statuses: ['prone'], description: 'Fell over laughing: Prone until the start of its next turn.'}];
}

async function auraSave(jug, jugTok, tok, n) {
    const a = auraOf(n);
    if (!a?.save || !tok?.actor) return;
    const failed = await rollSave(jug, [tok], a.ability, dcFor(jugOf(jug), a), a.name + ' (' + jug.name + '\'s aura)', a.img);
    if (!failedOne(failed, tok)) return;
    const old = tok.actor.effects.filter(e => e.flags?.[MODULE_ID]?.juggernautAuraFail === a.key).map(e => e.id);
    if (old.length) await tok.actor.deleteEmbeddedDocuments('ActiveEffect', old);
    await tok.actor.createEmbeddedDocuments('ActiveEffect', auraEffects(n, jug).map(fx));
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: jug}), content: '<b>' + esc(a.name) + ':</b> ' + esc(tok.document?.name ?? tok.name)
        + ' laughs helplessly: Incapacitated this turn, Prone until the start of its next turn.'});
}

// Decaying Mist: any raise of hp.value is refused while the effect is on (potions, spells, Midi cards, the sheet).
function onPreUpdateActor(actor, changed) {
    const next = foundry.utils.getProperty(changed, 'system.attributes.hp.value');
    if (next === undefined) return;
    const now = actor.system?.attributes?.hp?.value ?? 0;
    if (!(next > now)) return;
    if (!actor.effects?.some(e => !e.disabled && e.flags?.[MODULE_ID]?.[NOHEAL_FX])) return;
    foundry.utils.setProperty(changed, 'system.attributes.hp.value', now);
    ui.notifications.info('Decaying Mist: ' + actor.name + ' can\'t regain hit points while in the mist.');
}

// ---------------------------------------------------------------- no-save auras: keep the effects in step
let syncTimer = null, syncChain = Promise.resolve();
export function queueSync(delay = 150) {
    if (!isActiveGM()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncChain = syncChain.then(syncPresence).catch(err => console.error(TITLE + ' | Juggernaut aura sync', err)); }, delay);
}
async function syncPresence() {
    if (!isActiveGM() || !globalThis.canvas?.scene) return;
    const placed = canvas.tokens.placeables.filter(t => t.actor);
    const sceneId = canvas.scene.id;
    const juggToks = placed.filter(t => jugOf(t.actor));
    const juggs = juggToks.map(t => ({tokenId: t.id, sceneId, aura: Number(jugOf(t.actor).aura) || 0, radius: Number(jugOf(t.actor).radius ?? DEFAULTS.radius), alive: alive(t.actor), tok: t}));
    const byId = new Map(placed.map(t => [t.id, t]));
    const dist = (jId, tId) => cpr()?.tokenUtils?.getDistance?.(byId.get(jId), byId.get(tId));
    const want = desiredPresence(juggs, placed.map(t => ({id: t.id, sceneId, isJuggernaut: !!jugOf(t.actor)})), dist);
    const done = new Set();
    for (const t of placed) {
        const actor = t.actor;
        if (done.has(actor.uuid)) continue;   // linked actors with several tokens: the first one decides
        done.add(actor.uuid);
        const current = actor.effects.filter(e => e.flags?.[MODULE_ID]?.[PRESENCE]).map(e => ({id: e.id, key: e.flags[MODULE_ID][PRESENCE]}));
        const desired = want.get(t.id) ?? new Set();
        if (!current.length && !desired.size) continue;
        const {remove, add} = presenceDiff(current, desired);
        if (remove.length) await actor.deleteEmbeddedDocuments('ActiveEffect', remove.filter(id => actor.effects.get(id)));
        if (add.length) {
            const src = juggs.find(j => auraOf(j.aura)?.key === add[0])?.tok?.actor;
            await actor.createEmbeddedDocuments('ActiveEffect', add.map(k => presenceEffect(k, src)).filter(Boolean).map(fx));
        }
    }
}
// Every presence effect off one actor (combat end, Juggernaut gone).
async function stripPresence(actor) {
    const ids = actor?.effects?.filter(e => e.flags?.[MODULE_ID]?.[PRESENCE]).map(e => e.id) ?? [];
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
}
function onTokenMoved(doc, changed) {
    if (!isActiveGM() || doc.parent?.id !== canvas?.scene?.id) return;
    if (!['x', 'y', 'elevation', 'width', 'height', 'hidden'].some(k => k in (changed ?? {}))) return;
    if (!canvas.tokens.placeables.some(t => [2, 3].includes(Number(jugOf(t.actor)?.aura))) && !doc.actor?.effects?.some(e => e.flags?.[MODULE_ID]?.[PRESENCE])) return;
    queueSync(250);
}
function onTokenChange(doc) {
    if (!isActiveGM() || doc.parent?.id !== canvas?.scene?.id) return;
    if (canvas.tokens.placeables.some(t => jugOf(t.actor)) || jugOf(doc.actor)) queueSync(250);
}

// ---------------------------------------------------------------- aura state on the Juggernaut
const animName = tok => 'Juggernaut Aura ' + (tok?.document?.id ?? tok?.id ?? '');
function pickAnim(a) {
    try {
        const db = globalThis.Sequencer?.Database;
        if (!db) return null;
        const all = db.publicFlattenedEntries ?? db.flattenedEntries ?? [];
        const list = Array.isArray(all) ? all : Array.from(all ?? []);
        for (const re of [...a.anim, /template_circle\.aura/]) { const hit = list.find(p => re.test(String(p))); if (hit) return hit; }
    } catch { /* optional */ }
    return null;
}
async function endAnim(tok) { try { if (globalThis.Sequencer && tok) await Sequencer.EffectManager.endEffects({name: animName(tok)}); } catch { /* none playing */ } }
function playAnim(tok, a, radius) {
    try {
        const file = pickAnim(a);
        if (!file || !tok || !globalThis.Sequence) return;
        const dist = canvas.scene?.grid?.distance || 5;
        const across = (radius * 2) / dist + (tok.document?.width ?? 3);
        new Sequence().effect().file(file).attachTo(tok).size(across, {gridUnits: true}).persist().name(animName(tok)).belowTokens().fadeIn(500).fadeOut(500).play();
    } catch (err) { console.warn(TITLE + ' | Juggernaut aura animation', err); }
}

export async function clearAura(actor) {
    const ids = actor.effects.filter(e => e.flags?.[MODULE_ID]?.[AURA_FX]).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    await endAnim(tokenOf(actor));
    if (jugOf(actor)?.aura) await actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.aura']: 0});
    queueSync(0);
}
export async function setAura(actor, n) {
    const a = auraOf(n);
    if (!a) return clearAura(actor);
    const cfg = jugOf(actor);
    const radius = Number(cfg?.radius ?? DEFAULTS.radius);
    const have = actor.effects.filter(e => e.flags?.[MODULE_ID]?.[AURA_FX]);
    if (Number(cfg?.aura) === Number(n) && have.length === 1 && Number(have[0].flags[MODULE_ID][AURA_FX]) === Number(n)) { queueSync(0); return; }   // same aura keeps it
    if (have.length) await actor.deleteEmbeddedDocuments('ActiveEffect', have.map(e => e.id));
    // A duration makes it a temporary effect, so Foundry draws its icon on the token (cleared at combat end / his death).
    await actor.createEmbeddedDocuments('ActiveEffect', [fx({name: 'Aura: ' + a.name, img: a.img, transfer: false, disabled: false, duration: {seconds: 3600},
        description: '<p>' + a.text + '</p>', flags: {[MODULE_ID]: {[AURA_FX]: Number(n)}}})]);
    await actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.aura']: Number(n)});
    const tok = tokenOf(actor);
    await endAnim(tok);
    playAnim(tok, a, radius);
    queueSync(0);
}
export async function rollAura(actor, why) {
    const cfg = jugOf(actor);
    const plan = auraRollPlan(enabledAuras(cfg));
    const prev = Number(cfg?.aura) || 0;
    const head = '<b>' + esc(actor.name) + '\'s aura (' + esc(why) + '):</b> ';
    const speaker = ChatMessage.getSpeaker({actor});
    if (plan.mode === 'none') {
        await clearAura(actor);
        await ChatMessage.create({speaker, content: head + 'all auras destroyed: no aura.'});
        return 0;
    }
    if (plan.mode === 'auto') {
        const a = auraOf(plan.aura);
        await ChatMessage.create({speaker, content: head + 'only <b>' + esc(a.name) + '</b> is still working, so it is active (no roll)'
            + (plan.aura === prev ? ', as before' : '') + '. ' + esc(a.text)});
        await setAura(actor, plan.aura);
        return plan.aura;
    }
    const roll = await new Roll(plan.formula).evaluate();
    const n = auraForRoll(plan, roll.total);
    const a = auraOf(n);
    const map = plan.list.length < 3 ? ' (' + plan.list.length + ' auras still working: ' + mappingText(plan) + ')' : '';
    await roll.toMessage({speaker, flavor: head + plan.formula + map + ': ' + roll.total + ' = <b>' + esc(a.name) + '</b>'
        + (n === prev ? ' (same aura: it stays)' : '') + '. ' + esc(a.text)});
    await setAura(actor, n);
    return n;
}

// Aura Controls: switch one aura on / off (its device destroyed or repaired). Kept on his flag across combats.
export async function setAuraEnabled(actor, n, on) {
    const cfg = jugOf(actor);
    const a = auraOf(n);
    if (!cfg || !a) return false;
    const dis = disabledOf(cfg);
    if (on) dis.delete(Number(n)); else dis.add(Number(n));
    await actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.disabledAuras']: Array.from(dis).sort((x, y) => x - y)});
    const ended = !on && Number(cfg.aura) === Number(n);
    if (ended) await clearAura(actor);
    const left = enabledAuras(jugOf(actor));
    await ChatMessage.create({whisper: game.users?.filter?.(u => u.isGM).map(u => u.id) ?? [game.user.id], speaker: ChatMessage.getSpeaker({actor}),
        content: '<b>Aura Controls:</b> ' + esc(a.name) + ' switched ' + (on ? 'on' : 'off') + '. Still working: '
            + (left.length ? left.map(x => esc(auraOf(x).name)).join(', ') : 'none (no aura from now on)') + '.'
            + (ended ? ' It was the active aura: it ends now, and he has no aura until his next roll.' : '')});
    if (ended) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + esc(a.name) + '</b> gutters out: the aura around ' + esc(actor.name) + ' fades.'});
    return true;
}
export async function openAuraControls(actor) {
    const cfg = jugOf(actor);
    if (!cfg) return false;
    const dis = disabledOf(cfg), cur = Number(cfg.aura) || 0;
    const rows = [1, 2, 3].map(n => {
        const a = AURAS[n];
        return '<label style="display:flex;gap:.5em;align-items:flex-start;margin:.35em 0"><input type="checkbox" name="aura' + n + '"' + (dis.has(n) ? '' : ' checked') + '>'
            + '<span><b>' + n + '. ' + esc(a.name) + '</b>' + (n === cur ? ' <i>(active now)</i>' : '') + '<br><small>' + esc(a.short) + '</small></span></label>';
    }).join('');
    const content = '<p>Active now: <b>' + (cur ? esc(AURAS[cur].name) : 'no aura') + '</b>.</p>'
        + '<p>Ticked = its device still works. Untick an aura when its device is destroyed: it is left out of his roll, and ends at once if it is the active one.</p>' + rows;
    const res = await foundry.applications.api.DialogV2.wait({window: {title: 'Aura Controls: ' + actor.name}, position: {width: 460}, content, rejectClose: false,
        buttons: [{action: 'apply', label: 'Apply', icon: 'fa-solid fa-check', default: true, callback: (ev, button) => [1, 2, 3].map(n => !!button.form?.elements?.['aura' + n]?.checked)},
            {action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark'}]});
    if (!Array.isArray(res)) return false;
    for (const n of [1, 2, 3]) if (res[n - 1] === dis.has(n)) await setAuraEnabled(actor, n, res[n - 1]);
    return true;
}

// ---------------------------------------------------------------- combat
async function onUpdateCombat(combat, changed) {
    if (!isActiveGM() || !combat.started || !('turn' in changed || 'round' in changed)) return;
    try {
        const rolledNow = new Set();
        const juggs = combat.combatants.filter(c => jugOf(c.actor)).map(c => c.actor);
        for (const j of juggs) {
            if (!alive(j)) { if (jugOf(j).aura) await clearAura(j); continue; }
            if (jugOf(j).auraCombat !== combat.id) {
                await j.update({['flags.' + MODULE_ID + '.' + FLAG + '.auraCombat']: combat.id});
                await rollAura(j, 'combat starts');
                rolledNow.add(j.id);
            }
        }
        // End of the previous creature's turn: Petrifying Gaze save.
        const prev = combat.combatants.get(combat.previous?.combatantId);
        if (prev?.actor && prev.id !== combat.combatant?.id) await petrifyTick(prev);
        // Start of the current creature's turn.
        const cur = combat.combatant;
        const actor = cur?.actor;
        if (!actor) return;
        if (jugOf(actor)) {
            if (alive(actor) && !rolledNow.has(actor.id)) await rollAura(actor, 'start of his turn');
            return;
        }
        const tok = cur.token?.object ?? tokenOf(actor);
        if (!tok) return;
        for (const j of juggs) {
            const n = jugOf(j).aura;
            if (!auraOf(n)?.save || !alive(j)) continue;     // only Laughter asks for a save; 2 and 3 are presence effects
            const jt = tokenOf(j);
            if (!jt || jt.document?.parent?.id !== tok.document?.parent?.id) continue;
            const dist = cpr()?.tokenUtils?.getDistance?.(jt, tok);
            if (!(Number(dist) <= Number(jugOf(j).radius ?? DEFAULTS.radius))) continue;
            await auraSave(j, jt, tok, n);
        }
    } catch (err) { console.error(TITLE + ' | Juggernaut turn', err); }
}
async function onDeleteCombat(combat) {
    if (!isActiveGM()) return;
    for (const c of combat.combatants) {
        try {
            if (jugOf(c.actor)?.aura || c.actor?.effects.some(e => e.flags?.[MODULE_ID]?.[AURA_FX])) {
                await clearAura(c.actor);
                await c.actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.auraCombat']: null});
            }
            await stripPresence(c.actor);
        } catch (err) { console.error(TITLE + ' | Juggernaut aura cleanup', err); }
    }
    queueSync(0);
}
function onUpdateActor(actor, changed) {
    if (!isActiveGM() || !jugOf(actor)?.aura) return;
    if (foundry.utils.getProperty(changed, 'system.attributes.hp.value') === undefined) return;
    if (!alive(actor)) clearAura(actor).catch(err => console.error(TITLE + ' | Juggernaut aura on death', err));
}

// ---------------------------------------------------------------- Petrifying Gaze (Flesh to Stone style)
export function petrifyStep(state, failed) {
    const s = {ok: Number(state?.ok) || 0, fail: Number(state?.fail) || 0};
    if (failed) s.fail++; else s.ok++;
    s.result = s.fail >= 3 ? 'petrified' : s.ok >= 3 ? 'free' : 'ongoing';
    return s;
}
const petrifyName = s => 'Petrifying (' + s.fail + '/3 failed, ' + s.ok + '/3 saved)';
async function startPetrify(jug, tok, dc) {
    const actor = tok.actor;
    const old = actor.effects.filter(e => e.flags?.[MODULE_ID]?.[PETRIFY_FX]).map(e => e.id);
    if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old);
    const s = {ok: 0, fail: 0};
    await actor.createEmbeddedDocuments('ActiveEffect', [fx({name: petrifyName(s), img: 'icons/magic/earth/barrier-stone-pillar-purple.webp', origin: jug.uuid,
        transfer: false, disabled: false, statuses: ['restrained'],
        description: '<p>Turning to stone: Restrained. A DC ' + dc + ' Constitution save at the end of each of its turns. Three failures: Petrified. Three successes: the effect ends.</p>',
        flags: {[MODULE_ID]: {[PETRIFY_FX]: {source: jug.uuid, dc, ...s}}}})]);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: jug}), content: '<b>Petrifying Gaze:</b> ' + esc(tok.document?.name ?? actor.name)
        + ' begins to turn to stone (Restrained). A DC ' + dc + ' Constitution save at the end of each of its turns: 3 failures = Petrified, 3 successes = free.'});
}
async function petrifyTick(combatant) {
    const actor = combatant.actor;
    const eff = actor?.effects.find(e => !e.disabled && e.flags?.[MODULE_ID]?.[PETRIFY_FX]);
    if (!eff) return;
    const st = eff.flags[MODULE_ID][PETRIFY_FX];
    const tok = combatant.token?.object ?? tokenOf(actor);
    if (!tok) return;
    const src = (st.source && globalThis.fromUuidSync?.(st.source)) || actor;
    const dc = Number(st.dc) || DEFAULTS.gazeDc;
    const failed = failedOne(await rollSave(src, [tok], 'con', dc, 'Petrifying Gaze (end of turn)', 'icons/magic/perception/eye-ringed-glow-angry-large-teal.webp'), tok);
    const s = petrifyStep(st, failed);
    const name = esc(tok.document?.name ?? actor.name);
    if (s.result === 'ongoing') {
        await eff.update({name: petrifyName(s), ['flags.' + MODULE_ID + '.' + PETRIFY_FX]: {...st, ok: s.ok, fail: s.fail}});
        return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Petrifying Gaze:</b> ' + name + (failed ? ' stiffens further' : ' resists') + ' (' + s.fail + '/3 failed, ' + s.ok + '/3 saved).'});
    }
    await eff.delete();
    if (s.result === 'petrified') {
        if (!actor.statuses.has('petrified')) await actor.toggleStatusEffect('petrified', {active: true});
        return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Petrifying Gaze:</b> ' + name + ' turns to stone: <b>Petrified</b> (until cured, e.g. Greater Restoration).'});
    }
    return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Petrifying Gaze:</b> ' + name + ' shakes off the stone and is free.'});
}

// ---------------------------------------------------------------- Legendary Resistance
// v13: the installer's Chris's Premades 1 save macro (bonus pass) calls this with its trigger {roll, actor}.
// v14: CAT's save macro juggernautLegendaryResistance (actorBonus pass) calls it with {actor, roll, config}.
// NPC: native pips (system.resources.legres); otherwise the item flagged legendaryResistance.
export async function legendaryResistance(trigger) {
    const {roll, actor} = trigger ?? {};
    const dc = roll?.options?.target ?? trigger?.config?.target;
    if (!jugOf(actor) || !roll || !dc || roll.total >= dc) return;
    const npc = actor.type === 'npc' && !!actor.system?.resources?.legres;
    const lr = actor.items.find(i => i.flags?.[MODULE_ID]?.legendaryResistance);
    const left = npc ? (actor.system.resources.legres.value ?? 0) : (lr?.system.uses?.value ?? 0);
    if (!left) return;
    const u = cpr();
    const userId = u?.socketUtils?.gmID?.() ?? u?.socketUtils?.firstOwner?.(actor, true) ?? game.user.id;
    const pick = await u.dialogUtils.buttonDialog('Legendary Resistance', esc(actor.name) + ' failed a saving throw: ' + roll.total + ' against DC ' + dc + '.',
        [['Legendary Resistance (' + left + ' left): succeed instead', 'yes'], ['Accept the failure', 'no']], {userId});
    if (pick !== 'yes') return;
    if (npc) await u.genericUtils.update(actor, {'system.resources.legres.spent': (actor.system.resources.legres.spent ?? 0) + 1});
    else await u.genericUtils.update(lr, {'system.uses.spent': (lr.system.uses.spent ?? 0) + 1});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Legendary Resistance:</b> ' + esc(actor.name) + ' succeeds instead (' + (left - 1) + ' left).'});
    if (u?.isCatAdapter) return u.rollUtils.addToRoll(roll, String(dc - roll.total));
    const fix = await new Roll(String(dc - roll.total)).evaluate();
    const newRoll = MidiQOL.addRollTo(roll, fix);
    newRoll.data = roll.data;
    return newRoll;
}

// ---------------------------------------------------------------- Legendary Actions + Gaze + Aura Controls
function onPreUse(activity) {
    const kind = kindOf(activity);
    if (kind === 'controls') {
        // GM-only switchboard: no action, no pip, no chat card.
        if (!game.user.isGM) { ui.notifications.warn('Aura Controls: GM only.'); return false; }
        openAuraControls(activity.actor).catch(err => console.error(TITLE + ' | Aura Controls', err));
        return false;
    }
    if (kind !== 'tossCreature') return;
    const targets = Array.from(game.user.targets ?? []);
    const t = targets[0];
    if (targets.length !== 1 || !t?.actor) { ui.notifications.warn('Toss (Creature): target one Prone creature, Large or smaller, within reach.'); return false; }
    if (!t.actor.statuses?.has('prone')) { ui.notifications.warn('Toss (Creature): ' + t.name + ' isn\'t Prone. Throw a rock instead, or knock them down first.'); return false; }
    if (!tossable(t.actor)) { ui.notifications.warn('Toss (Creature): ' + t.name + ' is bigger than Large.'); return false; }
}
async function onPreamble(workflow) {
    if (kindOf(workflow?.activity) !== 'charge' || !game.user.isGM) return;
    const self = workflow.token;
    const keep = Array.from(workflow.targets ?? []).filter(t => t !== self && t.actor !== workflow.actor);
    if (keep.length === (workflow.targets?.size ?? 0)) return;
    if (cpr()?.workflowUtils?.updateTargets) await cpr().workflowUtils.updateTargets(workflow, keep);
    else workflow.targets = new Set(keep);
}
const prone = async tok => { if (tok?.actor && !tok.actor.statuses.has('prone')) await tok.actor.toggleStatusEffect('prone', {active: true}); };
// Toss: Creature (1.7.7): the 2d8 is dealt where it lands, DC 15 Dex save for half (Midi's normal save request).
export async function tossLanding(jug, tok) {
    const cfg = jugOf(jug);
    const dc = Number(cfg?.tossDc ?? DEFAULTS.tossDc);
    ui.notifications.info('Toss: pick where ' + tok.name + ' lands (within ' + Number(cfg?.tossRange ?? DEFAULTS.tossRange) + ' ft).');
    await teleport(tok, {range: Number(cfg?.tossRange ?? DEFAULTS.tossRange), animation: 'none'});
    await prone(tok);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: jug}), content: '<b>Toss:</b> ' + esc(tok.name) + ' is hurled across the battlefield and lands Prone: DC '
        + dc + ' Dexterity save, 2d8 bludgeoning (half on a success).'});
    await rollSave(jug, [tok], 'dex', dc, 'Toss: landing', 'icons/magic/earth/projectile-boulder-debris.webp', {onSave: 'half', parts: [{...TWO_D8}]});
    await prone(tok);
}
async function onRollFinished(workflow) {
    const kind = kindOf(workflow?.activity);
    if (!kind || !game.user.isGM) return;
    const jug = workflow.actor;
    try {
        if (kind === 'charge') {
            const down = Array.from(workflow.failedSaves ?? []).filter(t => t.actor !== jug);
            for (const t of down) await prone(t);
            if (down.length) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: jug}), content: '<b>Charge:</b> knocked Prone: ' + down.map(t => esc(t.name)).join(', ') + '.'});
        } else if (kind === 'tossRock') {
            const hit = Array.from(workflow.hitTargets ?? []);
            for (const t of hit) await prone(t);
            if (hit.length) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: jug}), content: '<b>Toss:</b> ' + hit.map(t => esc(t.name)).join(', ') + ' is knocked Prone by the rock.'});
        } else if (kind === 'tossCreature') {
            const hit = Array.from(workflow.hitTargets ?? []);
            if (hit[0]) await tossLanding(jug, hit[0]);
        } else if (kind === 'gaze') {
            const dc = Number(jugOf(jug)?.gazeDc ?? DEFAULTS.gazeDc);
            for (const t of Array.from(workflow.failedSaves ?? []).filter(t => t.actor && t.actor !== jug)) await startPetrify(jug, t, dc);
        }
    } catch (err) { console.error(TITLE + ' | Juggernaut ' + kind, err); }
}

export function registerJuggernaut() {
    Hooks.on('dnd5e.preUseActivity', onPreUse);
    Hooks.on(HOOKS.preambleComplete, onPreamble);
    Hooks.on(HOOKS.rollFinished, onRollFinished);
    Hooks.on('midi-qol.preTargetDamageApplication', onTargetDamage);
    Hooks.on('preUpdateActor', onPreUpdateActor);
    Hooks.on('updateActor', onUpdateActor);
    Hooks.on('updateCombat', onUpdateCombat);
    Hooks.on('deleteCombat', onDeleteCombat);
    Hooks.on('updateToken', onTokenMoved);
    Hooks.on('createToken', onTokenChange);
    Hooks.on('deleteToken', onTokenChange);
    Hooks.on('canvasReady', () => queueSync(500));
    return {AURAS, DEFAULTS, jugOf, rollAura, setAura, clearAura, setAuraEnabled, openAuraControls, enabledAuras, auraRollPlan, auraForRoll,
        absorbLightning, auraEffects, presenceEffect, desiredPresence, presenceDiff, syncAuras: () => queueSync(0), petrifyStep, legendaryResistance, tossable, tossLanding};
}
