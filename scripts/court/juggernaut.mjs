// =====================================================================
//  NIX FIX: Court of Ravenloft, Juggernaut boss kit (v13; harmless on v14 until ported)
//  For an actor the "Juggernaut: boss kit" installer marked (flags.nix-module.juggernaut):
//   - Aura (30 ft): 1d3 rolled when combat starts and again at the start of each of his turns
//     (same number = same aura). The roll goes to chat; the active aura shows on his token
//     (effect name + icon, and a Sequencer ring when JB2A has one). A creature other than him
//     that starts its turn within 30 ft of him, while he has HP, makes one save (Midi's normal
//     save request, no other prompt):
//       1 Tasha's Hideous Laughter  DC 13 Wis: Incapacitated for that turn, Prone until the start of its next turn.
//       2 Ray of Enfeeblement       DC 15 Con: disadvantage on Con saves until the start of its next turn.
//       3 Decaying Mist             DC 15 Con: can't regain hit points until the start of its next turn.
//   - Lightning absorption: lightning damage heals him by the amount instead (Midi damage hook).
//   - Legendary Actions (native pips, 1 each): Charge (30-ft line, 2d8 bludgeoning to each creature,
//     DC 13 Dex save or Prone) and Toss (Rock: ranged attack, 30 ft; Creature: melee attack on a Prone
//     creature, Large or smaller, within reach; a hit deals 2d8 bludgeoning and knocks the target Prone;
//     a tossed creature then lands where the GM picks, within 30 ft).
//   - Legendary Resistance (3/day, native pips): one prompt on a failed save (succeed / accept).
//   - Petrifying Gaze (1/day): Flesh to Stone style. Fail the first DC 15 Con save -> Restrained and
//     petrifying; a Con save at the end of each of its turns; 3 failures = Petrified, 3 successes = free.
//  Active GM only for combat, saves and effects; the damage hook runs wherever the damage is rolled.
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {appliedDamages, cpr, damageOfType, fx, HOOKS, MODES, rolledDamages, teleport} from './engine.mjs';

export const FLAG = 'juggernaut';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
export const jugOf = actor => actor?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const kindOf = activity => activity?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const AURA_FX = 'juggernautAura', PETRIFY_FX = 'juggernautPetrify', NOHEAL_FX = 'juggernautNoHeal';

export const AURAS = Object.freeze({
    1: {key: 'laughter', name: 'Tasha\'s Hideous Laughter', ability: 'wis', dc: 13, img: 'icons/magic/control/hypnosis-mesmerism-swirl.webp',
        text: 'A creature that starts its turn within 30 ft makes a DC 13 Wisdom save. On a failure it laughs: Incapacitated for that turn, Prone until the start of its next turn.',
        anim: [/template_circle\.aura.*(pink|purple)/, /aura.*(pink|purple)/]},
    2: {key: 'enfeeble', name: 'Ray of Enfeeblement', ability: 'con', dc: 15, img: 'icons/magic/unholy/beam-ringed-impact-purple.webp',
        text: 'A creature that starts its turn within 30 ft makes a DC 15 Constitution save. On a failure it has disadvantage on Constitution saves until the start of its next turn.',
        anim: [/template_circle\.aura.*(dark_?purple|black|grey|gray|dark)/, /aura.*(dark|black|grey|gray)/]},
    3: {key: 'mist', name: 'Decaying Mist', ability: 'con', dc: 15, img: 'icons/magic/unholy/hand-claw-fog-green.webp',
        text: 'A creature that starts its turn within 30 ft makes a DC 15 Constitution save. On a failure it can\'t regain hit points until the start of its next turn. Plants in the mist wither and die.',
        anim: [/template_circle\.aura.*green/, /aura.*green/]}
});
export const DEFAULTS = Object.freeze({radius: 30, gazeDc: 15, chargeDc: 13, tossRange: 30});
export const auraOf = n => AURAS[Number(n)] ?? null;
const dcFor = (cfg, a) => Number(cfg?.dcs?.[a.key] ?? a.dc);

export const alive = actor => !!actor && (actor.system?.attributes?.hp?.value ?? 0) > 0 && !actor.statuses?.has?.('dead');
const tokenOf = actor => actor?.getActiveTokens?.()?.[0] ?? null;
const SIZES = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'];
export const tossable = actor => SIZES.indexOf(actor?.system?.traits?.size ?? 'med') <= SIZES.indexOf('lg');

// ---------------------------------------------------------------- lightning absorption
// Midi (v13 branch, Workflow.callDamageHooksAndMacros): preTargetDamageApplication runs before the damage card is made;
// the card is applied from damageDetail (useDamageDetail) or hpDamage, and a negative hpDamage heals (GMAction
// calculateDamageAmounts: "healing" entries are summed as negative numbers). Lightning entries are zeroed and one
// "healing" entry of minus the amount is added, then the totals are worked out the way Midi's setupDamageDetails does.
// The amount is the lightning as dealt (after a save's halving); if a trait still zeroed it (an immunity from an effect),
// the amount as rolled. Midi's own absorption (system.traits.da.lightning) is left alone so it never heals twice.
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
async function rollSave(owner, tokens, ability, dc, name, img) {
    if (!tokens.length || !cpr()?.workflowUtils?.syntheticItemDataRoll) return new Set();
    const id = 'nixJuggernautSv0';
    const itemData = {name, img, type: 'feat',
        system: {activities: {[id]: {_id: id, type: 'save', name, activation: {type: 'special'}, range: {units: 'any'},
            target: {affects: {count: String(tokens.length), type: 'creature'}},
            save: {ability: [ability], dc: {calculation: '', formula: String(dc)}}, damage: {onSave: 'none', parts: []}}}},
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

// Effects a failed aura save leaves (until the start of the creature's next turn; Laughter's Incapacitated: this turn).
export function auraEffects(n, source) {
    const a = auraOf(n);
    if (!a) return [];
    const base = {img: a.img, origin: source?.uuid, transfer: false, disabled: false};
    const untilNext = {duration: {rounds: 1}, flags: {dae: {specialDuration: ['turnStart']}, [MODULE_ID]: {juggernautAuraFail: a.key}}};
    if (a.key === 'laughter') return [
        {...base, name: 'Hideous Laughter (Incapacitated)', statuses: ['incapacitated'], description: 'Laughing helplessly: Incapacitated for this turn.',
            duration: {turns: 1}, flags: {dae: {specialDuration: ['turnEnd']}, [MODULE_ID]: {juggernautAuraFail: a.key}}},
        {...base, ...untilNext, name: 'Hideous Laughter (Prone)', statuses: ['prone'], description: 'Fell over laughing: Prone until the start of its next turn.'}];
    if (a.key === 'enfeeble') return [{...base, ...untilNext, name: 'Ray of Enfeeblement', description: 'Disadvantage on Constitution saving throws until the start of its next turn.',
        changes: [{key: 'flags.midi-qol.disadvantage.save.con', mode: MODES.OVERRIDE, value: '1', priority: 20}]}];
    return [{...base, ...untilNext, name: 'Decaying Mist', description: 'Can\'t regain hit points until the start of its next turn.',
        flags: {...untilNext.flags, [MODULE_ID]: {juggernautAuraFail: a.key, [NOHEAL_FX]: true}}}];
}

async function auraSave(jug, jugTok, tok, n) {
    const a = auraOf(n);
    if (!a || !tok?.actor) return;
    const failed = await rollSave(jug, [tok], a.ability, dcFor(jugOf(jug), a), a.name + ' (' + jug.name + '\'s aura)', a.img);
    if (!failedOne(failed, tok)) return;
    const old = tok.actor.effects.filter(e => e.flags?.[MODULE_ID]?.juggernautAuraFail === a.key).map(e => e.id);
    if (old.length) await tok.actor.deleteEmbeddedDocuments('ActiveEffect', old);
    await tok.actor.createEmbeddedDocuments('ActiveEffect', auraEffects(n, jug).map(fx));
    const what = {laughter: 'laughs helplessly: Incapacitated this turn, Prone until the start of its next turn',
        enfeeble: 'is enfeebled: disadvantage on Constitution saves until the start of its next turn',
        mist: 'is caught in the decay: can\'t regain hit points until the start of its next turn'}[a.key];
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: jug}), content: '<b>' + esc(a.name) + ':</b> ' + esc(tok.document?.name ?? tok.name) + ' ' + what + '.'});
}

// Decaying Mist: any raise of hp.value is refused while the effect is on (potions, spells, Midi cards, the sheet).
function onPreUpdateActor(actor, changed) {
    const next = foundry.utils.getProperty(changed, 'system.attributes.hp.value');
    if (next === undefined) return;
    const now = actor.system?.attributes?.hp?.value ?? 0;
    if (!(next > now)) return;
    if (!actor.effects?.some(e => !e.disabled && e.flags?.[MODULE_ID]?.[NOHEAL_FX])) return;
    foundry.utils.setProperty(changed, 'system.attributes.hp.value', now);
    ui.notifications.info('Decaying Mist: ' + actor.name + ' can\'t regain hit points until the start of their next turn.');
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
}
export async function setAura(actor, n) {
    const a = auraOf(n);
    if (!a) return clearAura(actor);
    const cfg = jugOf(actor);
    const radius = Number(cfg?.radius ?? DEFAULTS.radius);
    const ids = actor.effects.filter(e => e.flags?.[MODULE_ID]?.[AURA_FX]).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    // A duration makes it a temporary effect, so Foundry draws its icon on the token (cleared at combat end / his death).
    await actor.createEmbeddedDocuments('ActiveEffect', [fx({name: 'Aura: ' + a.name, img: a.img, transfer: false, disabled: false, duration: {seconds: 3600},
        description: '<p>' + a.text + '</p>', flags: {[MODULE_ID]: {[AURA_FX]: Number(n)}}})]);
    await actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.aura']: Number(n)});
    const tok = tokenOf(actor);
    await endAnim(tok);
    playAnim(tok, a, radius);
}
export async function rollAura(actor, why) {
    const roll = await new Roll('1d3').evaluate();
    const n = Math.min(3, Math.max(1, Number(roll.total) || 1));
    const a = auraOf(n);
    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor}),
        flavor: '<b>' + esc(actor.name) + '\'s aura (' + why + '):</b> ' + n + ' = <b>' + esc(a.name) + '</b>. ' + esc(a.text)});
    await setAura(actor, n);
    return n;
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
            if (!n || !alive(j)) continue;
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
    for (const c of combat.combatants) if (jugOf(c.actor)?.aura || c.actor?.effects.some(e => e.flags?.[MODULE_ID]?.[AURA_FX])) {
        try { await clearAura(c.actor); await c.actor.update({['flags.' + MODULE_ID + '.' + FLAG + '.auraCombat']: null}); }
        catch (err) { console.error(TITLE + ' | Juggernaut aura cleanup', err); }
    }
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

// ---------------------------------------------------------------- Legendary Resistance (CPR save macro, bonus pass)
// The installer adds an embedded save macro that calls this. NPC: native pips (system.resources.legres);
// otherwise the item flagged legendaryResistance.
export async function legendaryResistance(trigger) {
    const {roll, actor} = trigger ?? {};
    const dc = roll?.options?.target;
    if (!jugOf(actor) || !dc || roll.total >= dc) return;
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
    const fix = await new Roll(String(dc - roll.total)).evaluate();
    const newRoll = MidiQOL.addRollTo(roll, fix);
    newRoll.data = roll.data;
    return newRoll;
}

// ---------------------------------------------------------------- Legendary Actions + Gaze
function onPreUse(activity) {
    if (kindOf(activity) !== 'tossCreature') return;
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
async function onRollFinished(workflow) {
    const kind = kindOf(workflow?.activity);
    if (!kind || !game.user.isGM) return;
    const jug = workflow.actor;
    try {
        if (kind === 'charge') {
            const down = Array.from(workflow.failedSaves ?? []).filter(t => t.actor !== jug);
            for (const t of down) await prone(t);
            if (down.length) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: jug}), content: '<b>Charge:</b> knocked Prone: ' + down.map(t => esc(t.name)).join(', ') + '.'});
        } else if (kind === 'tossRock' || kind === 'tossCreature') {
            const hit = Array.from(workflow.hitTargets ?? []);
            for (const t of hit) await prone(t);
            if (kind === 'tossCreature' && hit[0]) {
                ui.notifications.info('Toss: pick where ' + hit[0].name + ' lands (within ' + DEFAULTS.tossRange + ' ft).');
                await teleport(hit[0], {range: Number(jugOf(jug)?.tossRange ?? DEFAULTS.tossRange), animation: 'none'});
                await prone(hit[0]);
            }
            if (hit.length) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: jug}), content: '<b>Toss:</b> ' + hit.map(t => esc(t.name)).join(', ')
                + (kind === 'tossCreature' ? ' is hurled across the battlefield and lands Prone.' : ' is knocked Prone by the rock.')});
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
    return {AURAS, DEFAULTS, jugOf, rollAura, setAura, clearAura, absorbLightning, auraEffects, petrifyStep, legendaryResistance, tossable};
}
