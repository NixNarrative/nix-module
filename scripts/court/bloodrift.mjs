// =====================================================================
//  NIX FIX: Bloodrift (Court of Ravenloft homebrew artifact, v13 / Midi QOL)
//  Runs for any weapon the Bloodrift installer marked (flags.nix-module.bloodrift).
//
//  Blood Gauge = the item's Uses (0-100), so it shows on the sheet and Red Mist /
//  Unleashing spend it with normal consumption.
//   Shortsword (start): 1d6 piercing, Finesse, Light, Vex. -3 Gauge at turn start.
//   Longsword (30+, reverts below 30): 1d8 slashing, Versatile 1d10, Sap. -5 at turn start.
//   Greatsword (Bonus Action at 70+, 1 minute or Gauge 0): 2d6 slashing, Heavy, Two-Handed,
//     Graze. No decay, no gain; every attack costs 5.
//  +3, best of Str/Dex(finesse)/Cha. Extra necrotic = the form's damage die (GM toggle
//  "Extra necrotic die: on/off" -> flag extraDie false drops it); the
//  necrotic ignores resistance and treats immunity as resistance. Necrotic dealt
//  to living creatures fills the Gauge (not in Greatsword Form).
//  Bloodlash, Red Mist, Ravenous Strikes, Bloodseeker + Hunted, Bloody Arc,
//  Unleashing the Madness, The Hunger Within (curse), Death Wish.
//  Trial by Blood is theater of the mind (not tracked).
//  Workflow parts run on the client running the attack; turn-start parts on the GM.
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';

export const FLAG = 'bloodrift';
export const FORMS = {
    short: {label: 'Shortsword', number: 1, faces: 6, type: 'piercing', props: ['fin', 'lgt', 'mgc'], mastery: 'vex', base: 'shortsword', decay: 3},
    long: {label: 'Longsword', number: 1, faces: 8, type: 'slashing', props: ['ver', 'mgc'], mastery: 'sap', base: 'longsword', decay: 5, versatile: {number: 1, faces: 10}},
    great: {label: 'Greatsword', number: 2, faces: 6, type: 'slashing', props: ['hev', 'two', 'mgc'], mastery: 'graze', base: 'greatsword', decay: 0}
};
const cpr = () => globalThis.chrisPremades?.utils;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
const inCombat = () => !!game.combat?.started;
const turnKey = () => inCombat() ? game.combat.id + ':' + game.combat.round + ':' + game.combat.turn : 'none';

export const stateOf = item => item?.flags?.[MODULE_ID]?.[FLAG] ?? null;
export const isBloodrift = item => !!stateOf(item);
export const gaugeOf = item => Number(item?.system?.uses?.value ?? 0);
export const formOf = (state, gauge) => state?.great ? 'great' : gauge >= 30 ? 'long' : 'short';
const actKind = activity => activity?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const attackActivity = item => item.system.activities.find(a => actKind(a) === 'attack') ?? item.system.activities.find(a => a.type === 'attack');
const wielded = actor => actor?.items.find(i => isBloodrift(i) && i.system.equipped && i.system.attuned !== false);
const tokenOf = actor => actor?.token?.object ?? actor?.getActiveTokens?.()[0] ?? null;
const necroticImmune = actor => {
    const di = actor?.system?.traits?.di;
    return !!(di?.value?.has?.('necrotic') || (Array.isArray(di?.value) && di.value.includes('necrotic')) || di?.all);
};
const living = actor => !['construct', 'undead'].includes(String(MidiQOL.typeOrRace?.(actor) ?? actor?.system?.details?.type?.value ?? '').toLowerCase());

// Best of Str, Dex (finesse forms only) and Cha: Bloodrift lets him use his "spellcasting" ability.
export function bestAbility(actor, form) {
    const a = actor?.system?.abilities ?? {};
    const pool = FORMS[form].props.includes('fin') ? ['str', 'dex', 'cha'] : ['str', 'cha'];
    return pool.reduce((b, k) => ((a[k]?.mod ?? -99) > (a[b]?.mod ?? -99) ? k : b), pool[0]);
}

// ---------------------------------------------------------------- item writes (serialised per item)
const queues = new Map();
function serial(item, fn) {
    const prev = queues.get(item.uuid) ?? Promise.resolve();
    const next = prev.then(fn, fn).catch(err => console.error(TITLE + ' | Bloodrift', err));
    queues.set(item.uuid, next);
    return next;
}

// The item data for a form (pure; exported for tests).
export const extraDieOn = state => state?.extraDie !== false;
export function formUpdate(item, form, actor, state = stateOf(item)) {
    const f = FORMS[form];
    const ability = bestAbility(actor ?? item.actor, form);
    const atk = attackActivity(item);
    const unleash = item.system.activities.find(a => actKind(a) === 'unleash');
    const upd = {
        name: 'Bloodrift (' + f.label + ' Form)',
        'system.type.baseItem': f.base,
        'system.properties': f.props,
        'system.mastery': f.mastery,
        'system.damage.base': {number: f.number, denomination: f.faces, types: [f.type], bonus: '', custom: {enabled: false, formula: ''}},
        'system.damage.versatile': f.versatile ? {number: f.versatile.number, denomination: f.versatile.faces, types: [f.type]} : {number: null, denomination: null, types: []}
    };
    if (atk) {
        upd['system.activities.' + atk.id + '.attack.ability'] = ability;
        upd['system.activities.' + atk.id + '.damage.parts'] = extraDieOn(state)
            ? [{number: f.number, denomination: f.faces, types: ['necrotic'], bonus: '', custom: {enabled: false, formula: ''}}] : [];
        upd['system.activities.' + atk.id + '.damage.includeBase'] = true;
    }
    if (unleash) upd['system.activities.' + unleash.id + '.save.dc'] = {calculation: '', formula: '8 + @prof + @abilities.' + ability + '.mod'};
    return upd;
}

// Change the Gauge and/or state, then put the item in the right form.
export function mutate(item, {delta = 0, set, state = {}, force = false} = {}) {
    return serial(item, async () => {
        const cur = item.actor?.items.get(item.id) ?? item;
        const s = foundry.utils.mergeObject(foundry.utils.deepClone(stateOf(cur) ?? {}), state);
        let g = set ?? gaugeOf(cur) + delta;
        g = Math.clamp(Math.round(g), 0, 100);
        if (s.great && g <= 0) s.great = false;
        const before = formOf(stateOf(cur), gaugeOf(cur));
        const after = formOf(s, g);
        const upd = {'system.uses.spent': 100 - g, ['flags.' + MODULE_ID + '.' + FLAG]: s};
        if (force || before !== after || !cur.name.includes(FORMS[after].label)) Object.assign(upd, formUpdate(cur, after, cur.actor, s));
        await cur.update(upd);
        if (before !== after) {
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: cur.actor}),
                content: '<b>Bloodrift</b> ' + (FORMS[after].label === 'Shortsword' ? 'shrinks back into its' : 'grows into its') + ' <b>' + FORMS[after].label + ' Form</b> (Blood Gauge ' + g + ').'});
            const tok = tokenOf(cur.actor);
            const anim = 'jb2a.markers.light.complete.red';
            try { if (tok && globalThis.Sequence && Sequencer.Database.entryExists(anim)) new Sequence().effect().file(anim).atLocation(tok).scaleToObject(1.6).play(); } catch { /* optional */ }
        }
        return g;
    });
}

// ---------------------------------------------------------------- workflow hooks
const isMine = wf => isBloodrift(wf?.item);
const seeker = item => foundry.utils.deepClone(stateOf(item)?.seeker ?? {});

function onPreUse(activity) {
    const item = activity?.item;
    if (!isBloodrift(item)) return;
    const kind = actKind(activity);
    const s = stateOf(item), g = gaugeOf(item);
    const no = msg => { ui.notifications.warn('Bloodrift: ' + msg); return false; };
    if (kind === 'great') {
        if (s.great) return no('already in Greatsword Form.');
        if (g < 70) return no('Greatsword Form needs 70 Blood Gauge (has ' + g + ').');
    }
    if (['arc', 'arcReach', 'unleash'].includes(kind) && !s.great) return no('only in Greatsword Form.');
    if (kind === 'unleash') {
        const dice = Math.floor(g / 10);
        if (!dice) return no('needs at least 10 Blood Gauge.');
        // In-memory only, for this use: 1d10 slashing + 1d10 necrotic per 10 Gauge.
        for (const p of activity.damage?.parts ?? []) { p.number = dice; p.denomination = 10; }
    }
}

async function onPreamble(workflow) {
    if (!isMine(workflow) || actKind(workflow.activity) !== 'attack' && actKind(workflow.activity) !== 'unleash') return;
    // Bloodrift's necrotic ignores resistance for this attack.
    const [fx] = await workflow.actor.createEmbeddedDocuments('ActiveEffect', [{
        name: 'Bloodrift: necrotic ignores resistance', img: workflow.item.img, transfer: false, duration: {seconds: 6},
        changes: [{key: 'system.traits.idr.value', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 'necrotic', priority: 20}],
        flags: {[MODULE_ID]: {transient: true}}
    }]);
    workflow.nixBloodriftFx = fx?.id;
}

async function onPostAttackRoll(workflow) {
    if (!isMine(workflow) || actKind(workflow.activity) !== 'attack' || !workflow.attackRoll) return;
    const item = workflow.item.actor.items.get(workflow.item.id) ?? workflow.item;
    const s = stateOf(item);
    const t = workflow.targets?.first?.();
    const form = formOf(s, gaugeOf(item));
    if (form !== 'short' && t?.actor) {
        const b = seeker(item)[t.actor.uuid] ?? 0;
        if (b > 0) {
            await cpr().workflowUtils.bonusAttack(workflow, '+' + b);
            workflow.nixSeekerBonus = b;
        }
    }
    if (s.great) await mutate(item, {delta: -5});
}

async function onDamageRolled(workflow) {
    if (!isMine(workflow) || actKind(workflow.activity) !== 'attack' || !workflow.hitTargets?.size) return;
    const b = workflow.nixSeekerBonus ?? 0;
    if (!b) return;
    const great = stateOf(workflow.item)?.great;
    await cpr().workflowUtils.bonusDamage(workflow, b + 'd' + (great ? 6 : 4), {damageType: 'necrotic'});
}

// Immunity -> resistance for the necrotic, and count the necrotic actually dealt.
function onTargetDamage(token, {workflow, ditem}) {
    if (!isMine(workflow) || !ditem) return;
    const nec = d => (d ?? []).filter(x => x.type === 'necrotic').reduce((s, x) => s + (Number(x.value) || 0), 0);
    let dealt = nec(ditem.damageDetail);
    const raw = nec(ditem.rawDamageDetail);
    const immune = cpr()?.actorUtils?.checkTrait?.(token.actor, 'di', 'necrotic');
    if (immune && raw > 0 && dealt === 0) {
        const half = Math.floor(raw / 2);
        cpr().workflowUtils.modifyDamageAppliedFlat(ditem, half, {type: 'necrotic'});
        dealt = half;
    }
    if (living(token.actor)) workflow.nixBloodriftNecrotic = (workflow.nixBloodriftNecrotic ?? 0) + Math.max(0, dealt);
}

async function onRollFinished(workflow) {
    if (!isMine(workflow)) return;
    const actor = workflow.actor;
    const item = actor.items.get(workflow.item.id) ?? workflow.item;
    const kind = actKind(workflow.activity);
    if (workflow.nixBloodriftFx) await actor.effects.get(workflow.nixBloodriftFx)?.delete().catch(() => {});
    const s = foundry.utils.deepClone(stateOf(item) ?? {});
    const form = formOf(s, gaugeOf(item));
    const token = workflow.token ?? tokenOf(actor);

    if (kind === 'attack' || kind === 'unleash') {
        // Bloodseeker (Longsword and Greatsword Forms).
        if (kind === 'attack') {
            const t = workflow.targets?.first?.();
            const map = seeker(item);
            if (t?.actor && form !== 'short') {
                if (form === 'long') for (const k of Object.keys(map)) if (k !== t.actor.uuid) delete map[k];
                if (workflow.hitTargets?.has(t)) map[t.actor.uuid] = Math.min(3, (map[t.actor.uuid] ?? 0) + 1);
                else delete map[t.actor.uuid];
            }
            s.seeker = map;
            s.attacked = Array.from(new Set([...(s.attackedKey === turnKey() ? s.attacked ?? [] : []), ...(t?.actor ? [t.actor.uuid] : [])]));
            s.attackedKey = turnKey();
        }
        const gain = s.great ? 0 : (workflow.nixBloodriftNecrotic ?? 0);
        if (kind === 'unleash') { s.great = false; await mutate(item, {set: 0, state: s}); }
        else await mutate(item, {delta: gain, state: s});
        if (gain > 0) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id),
            content: '<b>Bloodrift</b> drinks ' + gain + ' (Blood Gauge ' + gaugeOf(actor.items.get(item.id)) + ').'});
        // Ravenous Strikes (1/turn): a critical hit grants one more attack.
        if (kind === 'attack' && workflow.isCritical && workflow.hitTargets?.size && !workflow.workflowOptions?.nixRavenous
            && stateOf(actor.items.get(item.id))?.ravenousKey !== turnKey()) {
            await mutate(item, {state: {ravenousKey: turnKey()}});
            const reach = (FORMS[form].props.includes('rch') ? 10 : 5);
            const foes = canvas.tokens.placeables.filter(t => t.actor && token && t.document.disposition !== token.document.disposition
                && (t.actor.system.attributes?.hp?.value ?? 0) > 0 && cpr().tokenUtils.getDistance(token, t) <= reach);
            if (foes.length) {
                const userId = cpr().socketUtils.firstOwner(actor, true) ?? game.user.id;
                const pick = await cpr().dialogUtils.selectTargetDialog('Bloodrift: Ravenous Strikes', 'Critical hit! Make one additional attack (or Cancel).', foes,
                    {skipDeadAndUnconscious: false, coverToken: token, userId});
                const target = pick?.[0];
                if (target) setTimeout(() => cpr().workflowUtils.syntheticActivityRoll(attackActivity(item), [target], {options: {workflowOptions: {nixRavenous: true}}}), 400);
            }
        }
        return;
    }
    if (kind === 'great') {
        await mutate(item, {state: {great: true, greatRound: inCombat() ? game.combat.round : null, greatTime: game.time.worldTime}});
        return;
    }
    if (kind === 'redMist' && token) {
        const ft = Number(workflow.activity.flags?.[MODULE_ID]?.feet) || 15;
        await chrisPremades.Teleport.target([token], token, {range: ft, animation: 'mistyStep'});
        await mutate(item, {});      // consumption already took the Gauge; re-check the form
        return;
    }
    if ((kind === 'arc' || kind === 'arcReach') && token) {
        const reach = 5 + (kind === 'arcReach' ? 5 : 0);
        if (kind === 'arcReach') await mutate(item, {});
        const foes = canvas.tokens.placeables.filter(t => t.actor && t.id !== token.id && t.document.disposition !== token.document.disposition
            && !t.document.hidden && (t.actor.system.attributes?.hp?.value ?? 0) > 0 && cpr().tokenUtils.getDistance(token, t) <= reach);
        if (!foes.length) return ui.notifications.info('Bloody Arc: no hostile creature within ' + reach + ' ft.');
        setTimeout(async () => {
            for (const t of foes) {
                const it = actor.items.get(item.id);
                if (!it || !stateOf(it)?.great) break;     // the Gauge ran dry mid-arc
                await cpr().workflowUtils.syntheticActivityRoll(attackActivity(it), [t], {options: {workflowOptions: {nixArc: true}}});
            }
        }, 300);
        return;
    }
    if (kind === 'extraToggle') {
        const on = !extraDieOn(s);
        await mutate(item, {state: {extraDie: on}, force: true});
        await ChatMessage.create({whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), speaker: ChatMessage.getSpeaker({actor}),
            content: '<b>Bloodrift</b>: extra necrotic die <b>' + (on ? 'ON' : 'OFF') + '</b>.'});
        return;
    }
    if (kind === 'status') {
        await ChatMessage.create({whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), speaker: ChatMessage.getSpeaker({actor}),
            content: '<b>Bloodrift</b>: ' + FORMS[form].label + ' Form, Blood Gauge <b>' + gaugeOf(item) + '</b>/100, extra necrotic die ' + (extraDieOn(s) ? 'on' : 'off')
                + (s.great && s.greatRound != null ? ' (Greatsword since round ' + s.greatRound + ')' : '') + '.'});
    }
}

// Bloodlash: a creature misses the wielder with a melee attack -> reaction attack back.
async function onAttackComplete(workflow) {
    try {
        if (!workflow?.targets?.size || !workflow.token || workflow.workflowOptions?.nixBloodlash) return;
        if (!cpr()?.workflowUtils?.isAttackType?.(workflow, 'meleeAttack')) return;
        for (const t of workflow.targets) {
            if (workflow.hitTargets?.has(t) || !t.actor || t.actor.uuid === workflow.actor?.uuid) continue;
            const item = wielded(t.actor);
            if (!item || (inCombat() && cpr().actorUtils.hasUsedReaction(t.actor))) continue;
            if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(x => t.actor.statuses.has(x))) continue;
            const userId = cpr().socketUtils.firstOwner(t.actor, true) ?? game.user.id;
            const yes = await cpr().dialogUtils.confirm('Bloodrift: Bloodlash', esc(workflow.token.document.name) + ' missed ' + esc(t.document.name) + '. Use the reaction to attack it?', {userId});
            if (!yes) continue;
            if (inCombat()) await cpr().actorUtils.setReactionUsed(t.actor);
            const foe = workflow.token;
            setTimeout(() => cpr().workflowUtils.syntheticActivityRoll(attackActivity(item), [foe], {userId, options: {workflowOptions: {nixBloodlash: true}}}), 400);
        }
    } catch (err) { console.error(TITLE + ' | Bloodlash', err); }
}

// ---------------------------------------------------------------- turns (GM)
async function onUpdateCombat(combat, changed) {
    if (!isActiveGM() || !combat.started || !('turn' in changed || 'round' in changed)) return;
    // The previous combatant ended his turn: Bloodseeker bonuses on creatures he didn't attack end.
    const prev = combat.combatants.get(combat.previous?.combatantId);
    const prevItem = wielded(prev?.actor);
    if (prevItem) {
        const s = stateOf(prevItem);
        const attacked = s.attackedKey && s.attackedKey.startsWith(combat.id + ':' + combat.previous.round + ':') ? s.attacked ?? [] : [];
        const map = seeker(prevItem);
        for (const k of Object.keys(map)) if (!attacked.includes(k)) delete map[k];
        await mutate(prevItem, {state: {seeker: map, attacked: []}});
    }
    const actor = combat.combatant?.actor;
    const item = wielded(actor);
    if (!item) return;
    let s = stateOf(item);
    // Greatsword Form lasts 1 minute (10 rounds).
    if (s.great && s.greatRound != null && combat.round - s.greatRound >= 10) {
        await mutate(item, {state: {great: false}});
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Bloodrift</b>: the minute is up; Greatsword Form ends.'});
    }
    const cur = actor.items.get(item.id);
    s = stateOf(cur);
    const decay = s.great ? 0 : FORMS[formOf(s, gaugeOf(cur))].decay;
    if (decay && gaugeOf(cur) > 0) await mutate(cur, {delta: -decay});
    const g = gaugeOf(actor.items.get(item.id));
    // Death Wish.
    const hp = actor.system.attributes.hp;
    if (hp.max && hp.value > 0 && hp.value <= hp.max * 0.2) {
        await actor.createEmbeddedDocuments('ActiveEffect', [{name: 'Death Wish', img: item.img, transfer: false, duration: {turns: 1},
            description: 'Started the turn at or below 20% HP: one additional action this turn.', flags: {dae: {specialDuration: ['turnEnd']}}}]);
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Bloodrift: Death Wish</b>. ' + esc(actor.name) + ' gains one additional action this turn.'});
    }
    // The Hunger Within.
    const sNow = stateOf(actor.items.get(item.id));
    if (sNow.cursed !== false && (g >= 50 || sNow.great)) {
        const dc = 10 + Math.floor(g / 10);
        const rolls = await actor.rollSavingThrow({ability: 'wis', target: dc}, {configure: false}, {});
        const total = rolls?.[0]?.total ?? rolls?.total ?? 0;
        if (total < dc) {
            // The wielder's necrotic immunity holds: no self-damage (Dracula).
            const immune = necroticImmune(actor);
            const cost = immune ? 'necrotic immunity: no damage if it can\'t attack' : 'if it can\'t attack, it takes necrotic damage equal to half the Blood Gauge';
            await actor.createEmbeddedDocuments('ActiveEffect', [{name: 'The Hunger Within: Mad', img: item.img, transfer: false, duration: {turns: 1},
                description: 'Must move toward and attack the nearest creature it can perceive (' + cost + ').',
                flags: {dae: {specialDuration: ['turnEnd']}}}]);
            await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>The Hunger Within</b> (DC ' + dc + '): ' + esc(actor.name)
                + ' is driven mad until the end of the turn. Move toward and attack the nearest creature you can perceive'
                + (immune ? '. (Immune to necrotic: no damage if he can\'t attack.)' : '; if you can\'t attack, take ' + Math.floor(g / 2) + ' necrotic damage.')});
        }
    }
}

// Cursed: a player can't end attunement by un-ticking it.
function onPreUpdateItem(item, changed) {
    if (!isBloodrift(item) || game.user.isGM || stateOf(item)?.cursed === false) return;
    if (foundry.utils.getProperty(changed, 'system.attuned') === false) {
        ui.notifications.warn('Bloodrift bears its curse: you can\'t willingly end your attunement.');
        return false;
    }
}

export function registerBloodrift() {
    Hooks.on('dnd5e.preUseActivity', onPreUse);
    Hooks.on('midi-qol.premades.postPreambleComplete', onPreamble);
    Hooks.on('midi-qol.premades.postWaitForAttackRoll', onPostAttackRoll);
    Hooks.on('midi-qol.premades.preDamageRollComplete', onDamageRolled);
    Hooks.on('midi-qol.preTargetDamageApplication', onTargetDamage);
    Hooks.on('midi-qol.premades.postRollFinished', onRollFinished);
    Hooks.on('midi-qol.premades.postAttackRollComplete', onAttackComplete);
    Hooks.on('updateCombat', onUpdateCombat);
    Hooks.on('preUpdateItem', onPreUpdateItem);
    return {FORMS, formOf, gaugeOf, mutate, formUpdate, bestAbility, extraDieOn};
}
