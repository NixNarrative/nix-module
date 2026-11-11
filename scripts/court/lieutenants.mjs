// =====================================================================
//  NIX FIX: Court of Ravenloft lieutenants (Dayus Manroe, Sydmore, Valintina, Lucian), v13 and v14
//  Boss stat blocks in the same shape as Dracula's: their installers prepare the actor
//  (flags.nix-module.court = {key, ...}, activity flags flags.nix-module.court = '<kind>')
//  and boss.mjs runs their Legendary Actions (3, back at the start of their turn) and
//  the Blood Price / Legendary Resistance prompt. This file runs their subclass features:
//
//   Dayus (Shadowmaster):  Marked for Death, Strike from the Dark, Veil of Lies, Piercer,
//                          Slow (weapon mastery).
//   Sydmore (Sanguine Knight): Sutekh's Blessing, Foul Interchange, Sanguine Gift,
//                          Bloodstroke, Haemal Exchange.
//   Valintina (Architect of Ruin): Spellbreaker (Spell Duel), Submit, Enervating Spell,
//                          Vile Transmogrification, Hellfire Cantrip (legendary).
//   Lucian (Hellspeaker):  Charm Enemy, Intransigent, Let's Make a Deal, Slippery Ploy,
//                          Quid Pro Quo, Red Cant (embedded macro, uses api.court).
//
//  Hooks on Midi workflows run on whichever client runs the workflow (a player's, for a
//  player's attack). Anything that writes to a GM-owned document goes through the
//  module socket to the active GM (gm(action, data)). Questions go to the active GM.
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {biItem, cfgOf, executeRow, isActiveGM, living, placeSeal, sealsOn, tokenOf} from './illrigger.mjs';
import {cpr, fxAll, MODES, HOOKS} from './engine.mjs';

export const FLAG = 'court';
const CHANNEL = 'module.' + MODULE_ID;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const OV = () => MODES.OVERRIDE;
const ADD = () => MODES.ADD;
const DOWN = ['incapacitated', 'unconscious', 'paralyzed', 'stunned', 'petrified', 'dead'];

export const ltOf = actor => actor?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const keyOf = actor => ltOf(actor)?.key ?? null;
const kindOf = activity => activity?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const pb = a => Number(a?.system?.attributes?.prof) || 0;
const chaMod = a => Number(a?.system?.abilities?.cha?.mod) || 0;
const dcOf = a => 8 + pb(a) + chaMod(a);
const levelOf = a => a?.classes?.[cfgOf(a)?.classId || 'illrigger']?.system.levels ?? a?.system?.details?.level ?? 1;
const isDown = a => DOWN.some(s => a?.statuses?.has(s)) || (a?.system?.attributes?.hp?.value ?? 1) <= 0;
const dist = (a, b) => (cpr()?.tokenUtils?.getDistance ?? MidiQOL.getDistance)(a, b, {});
const canSee = (a, b) => { try { return MidiQOL.canSee(a, b); } catch { return true; } };
const inCombat = () => !!game.combat?.started;
const turnKey = () => inCombat() ? game.combat.id + ':' + game.combat.round + ':' + game.combat.turn : null;
const isTurnOf = a => inCombat() && (game.combat.combatant?.actor?.uuid === a.uuid || game.combat.combatant?.tokenId === tokenOf(a)?.id);
const usedReaction = a => inCombat() && !!(cpr()?.actorUtils?.hasUsedReaction?.(a) ?? MidiQOL.hasUsedReaction?.(a));
const canReact = a => !isDown(a) && !usedReaction(a);
const gmId = () => game.users.activeGM?.id ?? game.user.id;
const tokUuid = t => t?.document?.uuid ?? t?.uuid;
const tokFrom = uuid => { try { const d = fromUuidSync(uuid); return d?.object ?? d; } catch { return null; } };
const actorFrom = uuid => { try { return fromUuidSync(uuid); } catch { return null; } };
const court = key => canvas.tokens?.placeables.filter(t => t.actor && keyOf(t.actor) === key) ?? [];
const quiet = wf => !!(wf?.item?.flags?.[MODULE_ID]?.burnRoll || wf?.item?.flags?.[MODULE_ID]?.courtSave || wf?.workflowOptions?.nixCourt);
const say = (actor, content) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content});
const whisperGM = content => ChatMessage.create({whisper: ChatMessage.getWhisperRecipients('GM').map(u => u.id), content});
const typeOf = a => String(cpr()?.actorUtils?.typeOrRace?.(a) ?? a?.system?.details?.type?.value ?? '').toLowerCase();
const isAttack = wf => wf?.activity?.type === 'attack' || !!wf?.activity?.attack;
const isSaveAct = wf => wf?.activity?.type === 'save' || !!wf?.activity?.save?.ability?.size;
const attackType = (wf, t) => !!cpr()?.workflowUtils?.isAttackType?.(wf, t);

// ---------------------------------------------------------------- seal pool
export function sealsLeft(a) {
    const bi = biItem(a);
    if (!bi) return 0;
    if (cfgOf(a)?.unlimitedSeals || !bi.system.uses?.max) return Infinity;
    return Number(bi.system.uses.value) || 0;
}
async function spendSealsLocal(a, n) {
    const left = sealsLeft(a);
    if (left === Infinity) return true;
    if (left < n) return false;
    const bi = biItem(a);
    await bi.update({'system.uses.spent': (bi.system.uses.spent ?? 0) + n});
    return true;
}
export const spendSeals = (a, n = 1) => gm('spendSeals', {owner: a.uuid, n});
async function regainSealsLocal(a, n) {
    const bi = biItem(a);
    if (!bi?.system.uses?.max) return 0;
    const spent = bi.system.uses.spent ?? 0;
    const back = Math.min(n, spent);
    await bi.update({'system.uses.spent': spent - back});
    return back;
}

// ---------------------------------------------------------------- GM socket
const HANDLERS = {
    async spendSeals({owner, n}) { const a = actorFrom(owner); return a ? spendSealsLocal(a, n) : false; },
    async placeSeal({owner, token, count = 1, free = false}) {
        const a = actorFrom(owner), t = tokFrom(token);
        return a && t ? placeSeal(a, t, count, {free}) : 0;
    },
    async burn({owner, token, n = 1, type = 'necrotic'}) {
        const a = actorFrom(owner), t = tokFrom(token);
        return a && t ? executeRow({owner: a, token: t, n, type, boons: {}}) : 0;
    },
    async removeSeals({owner, token, n = 1}) {
        const t = tokFrom(token);
        const mine = sealsOn(t?.actor).get(owner)?.effects ?? [];
        const ids = mine.slice(0, n).map(e => e.id);
        if (ids.length) await t.actor.deleteEmbeddedDocuments('ActiveEffect', ids);
        return ids.length;
    },
    async save({owner, tokens, ability, dc, name, img}) {
        const a = actorFrom(owner), toks = tokens.map(tokFrom).filter(Boolean);
        if (!a || !toks.length) return [];
        return Array.from(await rollSaveLocal(a, toks, ability, dc, name, img));
    },
    async reaction({actor}) { const a = actorFrom(actor); if (a && inCombat()) await (cpr()?.actorUtils?.setReactionUsed?.(a) ?? MidiQOL.setReactionUsed?.(a)); return true; },
    async effect({actor, data}) {
        const a = actorFrom(actor);
        if (!a) return null;
        const [e] = await a.createEmbeddedDocuments('ActiveEffect', fxAll([data]));
        return e?.id ?? null;
    },
    async deleteEffect({actor, id}) { const a = actorFrom(actor); await a?.effects.get(id)?.delete().catch(() => {}); return true; },
    async update({uuid, data, options}) { const d = actorFrom(uuid); if (d) await d.update(data, options ?? {}); return true; }
};
const waiting = new Map();
export function gm(action, data) {
    if (isActiveGM()) return Promise.resolve(HANDLERS[action](data)).catch(err => { console.error(TITLE + ' | court ' + action, err); return null; });
    const id = foundry.utils.randomID();
    return new Promise(resolve => {
        const timer = setTimeout(() => { waiting.delete(id); resolve(null); }, 30000);
        waiting.set(id, v => { clearTimeout(timer); waiting.delete(id); resolve(v); });
        game.socket.emit(CHANNEL, {nix: FLAG, action, data, id, from: game.user.id});
    });
}
function onSocket(msg) {
    if (msg?.nix !== FLAG) return;
    if (msg.reply) { if (msg.to === game.user.id) waiting.get(msg.id)?.(msg.value); return; }
    if (!isActiveGM() || !HANDLERS[msg.action]) return;
    Promise.resolve(HANDLERS[msg.action](msg.data)).catch(err => { console.error(TITLE + ' | court ' + msg.action, err); return null; })
        .then(value => game.socket.emit(CHANNEL, {nix: FLAG, reply: true, id: msg.id, to: msg.from, value: value ?? null}));
}
const addEffect = (actor, data) => gm('effect', {actor: actor.uuid, data});

// ---------------------------------------------------------------- dialogs
async function ask(title, content, buttons) {
    const u = cpr()?.dialogUtils;
    if (!u) return null;
    return u.buttonDialog(title, content, buttons, {userId: gmId()});
}
// GM-local form: rows of checkboxes / selects. fields: [{name, label, type: 'check'|'select', options:[[value,label]], checked}]
async function form(title, intro, fields) {
    const html = '<div class="nix-illrigger">' + (intro ? '<p>' + intro + '</p>' : '') + fields.map(f => f.type === 'select'
        ? '<p><label>' + esc(f.label) + ' <select name="' + f.name + '">' + f.options.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join('') + '</select></label></p>'
        : '<p><label><input type="checkbox" name="' + f.name + '"' + (f.checked ? ' checked' : '') + '> ' + esc(f.label) + '</label></p>').join('') + '</div>';
    const r = await foundry.applications.api.DialogV2.wait({
        window: {title}, position: {width: 460}, rejectClose: false, content: html,
        buttons: [
            {action: 'ok', label: 'Apply', icon: 'fa-solid fa-check', default: true, callback: (ev, button) => {
                const out = {};
                for (const f of fields) { const el = button.form.elements[f.name]; out[f.name] = f.type === 'select' ? el?.value : !!el?.checked; }
                return out;
            }},
            {action: 'skip', label: 'Skip', icon: 'fa-solid fa-xmark', callback: () => null}
        ]
    });
    return r && typeof r === 'object' ? r : null;
}

// ---------------------------------------------------------------- synthetic save
async function rollSaveLocal(owner, tokens, ability, dc, name, img) {
    const id = 'nixCourtSave0000';
    const itemData = {name, img: img ?? 'icons/magic/control/hypnosis-mesmerism-swirl.webp', type: 'feat',
        system: {activities: {[id]: {_id: id, type: 'save', name, activation: {type: 'special'}, range: {units: 'any'},
            target: {affects: {count: String(tokens.length), type: 'creature'}},
            save: {ability: [ability], dc: {calculation: '', formula: String(dc)}}, damage: {onSave: 'none', parts: []}}}},
        flags: {[MODULE_ID]: {courtSave: true}, autoanimations: {isEnabled: false, version: 5}}};
    const wf = await cpr().workflowUtils.syntheticItemDataRoll(itemData, owner, tokens);
    return new Set(Array.from(wf?.failedSaves ?? []).map(t => tokUuid(t)));
}
const rollSave = async (owner, tokens, ability, dc, name, img) =>
    new Set(await gm('save', {owner: owner.uuid, tokens: tokens.map(tokUuid), ability, dc, name, img}) ?? []);

// ---------------------------------------------------------------- light (Westly's check)
function lightAt(tok) {
    const p = tok.document.getCenterPoint?.() ?? tok.center;
    const env = canvas.scene.environment ?? {};
    const dark = canvas.environment?.darknessLevel ?? env.darknessLevel ?? 0;
    const g = canvas.environment?.globalLightSource;
    const globalOn = g ? (g.active && !g.disabled && dark < 1)
        : (env.globalLight?.enabled && dark >= (env.globalLight?.darkness?.min ?? 0) && dark <= (env.globalLight?.darkness?.max ?? 1) && dark < 1);
    let level = globalOn ? 'bright' : 'dark';
    if (level !== 'bright') {
        const Global = foundry.canvas?.sources?.GlobalLightSource;
        for (const src of canvas.effects.lightSources) {
            if (!src.active || src.isDarkness || src === g || (Global && src instanceof Global)) continue;
            if (!src.shape?.contains?.(p.x, p.y)) continue;
            const r = (src.ratio ?? 0) * (src.shape.config?.radius ?? src.radius ?? 0);
            if (r > 0 && Math.hypot(p.x - src.data.x, p.y - src.data.y) <= r) { level = 'bright'; break; }
            level = 'dim';
        }
    }
    if (level !== 'dark' && canvas.effects.testInsideDarkness?.(p, tok.document.elevation ?? 0)) level = 'dark';
    return level;
}

// ---------------------------------------------------------------- effects that end at the end of the owner's NEXT turn
const expiring = (owner) => ({[MODULE_ID]: {ltExpire: {owner: owner.uuid, ends: isTurnOf(owner) ? 2 : 1}}});
async function tickExpiring(ownerUuid) {
    for (const t of canvas.tokens.placeables) for (const e of t.actor?.effects ?? []) {
        const x = e.flags?.[MODULE_ID]?.ltExpire;
        if (!x || x.owner !== ownerUuid) continue;
        if (x.ends <= 1) await e.delete().catch(() => {});
        else await e.update({['flags.' + MODULE_ID + '.ltExpire.ends']: x.ends - 1});
    }
}

// =====================================================================
//  DAYUS
// =====================================================================
const markedTurn = new Map(), darkTurn = new Map(), piercerTurn = new Map();
async function markedForDeath(wf) {
    const a = wf.actor;
    if (keyOf(a) !== 'dayus' || !isAttack(wf) || !isTurnOf(a) || markedTurn.get(a.uuid) === turnKey()) return;
    const t = wf.targets?.first?.();
    if (!t?.actor || !sealsOn(t.actor).has(a.uuid)) return;
    markedTurn.set(a.uuid, turnKey());
    await a.createEmbeddedDocuments('ActiveEffect', fxAll([{name: 'Marked for Death', img: 'icons/skills/targeting/crosshair-pointed-orange.webp', transfer: false,
        duration: {turns: 1}, changes: [{key: 'flags.midi-qol.advantage.attack.all', mode: OV(), value: '1', priority: 20}],
        flags: {dae: {specialDuration: ['1Attack']}, [MODULE_ID]: {transient: true}}}]));
}
async function dayusDamage(wf) {
    const a = wf.actor, lt = ltOf(a);
    if (keyOf(a) !== 'dayus' || !wf.hitTargets?.size || wf.item?.type !== 'weapon') return;
    const t = wf.hitTargets.first();
    // Strike from the Dark: once per turn, melee weapon hit with advantage on an interdicted creature.
    if (attackType(wf, 'meleeWeaponAttack') && darkTurn.get(a.uuid) !== (turnKey() ?? 'x') && t?.actor && sealsOn(t.actor).has(a.uuid)
        && (wf.advantage || wf.attackRoll?.options?.advantageMode > 0)) {
        darkTurn.set(a.uuid, turnKey() ?? 'x');
        const lvl = lightAt(t);
        const n = pb(a) + (lvl === 'bright' ? 0 : 1);
        const type = wf.activity?.damage?.parts?.[0]?.types?.first?.() ?? Array.from(wf.activity?.damage?.parts?.[0]?.types ?? [])[0] ?? 'piercing';
        await cpr().workflowUtils.bonusDamage(wf, n + 'd4', {damageType: type});
        await say(a, '<b>Strike from the Dark:</b> +' + n + 'd4' + (lvl === 'bright' ? '' : ' (' + lvl + ': +1d4)') + '.');
    }
    // Piercer (if Chris's Premades doesn't run it): reroll the lowest piercing die once per turn; extra die on a crit.
    if (lt?.piercer) {
        const pierce = (wf.damageRolls ?? []).filter(r => (r.options?.type ?? r.options?.flavor) === 'piercing');
        if (pierce.length && piercerTurn.get(a.uuid) !== (turnKey() ?? 'x')) {
            let low = null;
            for (const r of pierce) for (const term of r.terms) if (term instanceof foundry.dice.terms.Die)
                for (const x of term.results) if (x.active && (!low || x.result < low.x.result)) low = {r, term, x};
            if (low && low.x.result <= Math.floor(low.term.faces / 2)) {
                piercerTurn.set(a.uuid, turnKey() ?? 'x');
                const old = low.x.result;
                low.x.result = Math.ceil(CONFIG.Dice.randomUniform() * low.term.faces);
                low.r._total = low.r._evaluateTotal();
                await wf.setDamageRolls(wf.damageRolls);
                await say(a, '<b>Piercer:</b> rerolled a ' + old + ' into a ' + low.x.result + '.');
            }
        }
        if (wf.isCritical && pierce.length) {
            const faces = pierce.flatMap(r => r.terms).find(term => term instanceof foundry.dice.terms.Die)?.faces ?? 8;
            await cpr().workflowUtils.bonusDamage(wf, '1d' + faces, {damageType: 'piercing'});
        }
    }
}
async function slowMastery(wf) {
    const a = wf.actor, lt = ltOf(a);
    if (!lt?.slowWeapons?.includes?.(wf.item?.id) || !wf.hitTargets?.size) return;
    for (const t of wf.hitTargets) {
        if (!t.actor || t.actor.effects.some(e => /^slow/i.test(e.name) && !e.disabled)) continue;
        await addEffect(t.actor, {name: 'Slow (' + a.name + ')', img: 'icons/magic/time/clock-stopwatch-white-blue.webp', transfer: false, origin: wf.item.uuid,
            duration: {rounds: 1}, description: 'Speed −10 ft until the start of ' + a.name + '\'s next turn (Slow mastery).',
            changes: ['walk', 'fly', 'swim', 'climb', 'burrow'].map(k => ({key: 'system.attributes.movement.' + k, mode: ADD(), value: '-10', priority: 20})),
            flags: {dae: {specialDuration: ['turnStartSource']}}});
    }
}
async function veilOfLies(actor) {
    if (!await spendSealsLocal(actor, 1)) return ui.notifications.warn('Veil of Lies: no seals left.');
    await actor.createEmbeddedDocuments('ActiveEffect', fxAll([{name: 'Veil of Lies', img: 'icons/magic/perception/silhouette-stealth-shadow.webp', transfer: false,
        statuses: ['invisible'], duration: {seconds: 600}, description: 'Invisible for 10 minutes or until he attacks or casts a spell.',
        flags: {dae: {specialDuration: ['1Attack', '1Spell']}}}]));
    await say(actor, '<b>Veil of Lies:</b> ' + esc(actor.name) + ' spends a seal and vanishes.');
}

// =====================================================================
//  SYDMORE
// =====================================================================
const CONDITIONS = ['blinded', 'charmed', 'dazed', 'deafened', 'frightened', 'paralyzed', 'poisoned'];
const label = id => CONFIG.statusEffects.find(s => s.id === id)?.name ? game.i18n.localize(CONFIG.statusEffects.find(s => s.id === id).name) : id[0].toUpperCase() + id.slice(1);
const hasCondition = (a, id) => a.statuses?.has(id) || a.effects.some(e => !e.disabled && new RegExp('^' + id, 'i').test(e.name));
async function clearCondition(a, id) {
    for (const e of a.effects.filter(e => e.statuses?.has(id) || new RegExp('^' + id, 'i').test(e.name))) await gm('deleteEffect', {actor: a.uuid, id: e.id});
}
async function foulInterchange(actor, target) {
    const me = tokenOf(actor);
    if (!target?.actor || !me) return ui.notifications.warn('Foul Interchange: target a creature within 30 ft.');
    if (dist(me, target) > 30) return ui.notifications.warn('Foul Interchange: ' + target.document.name + ' is more than 30 ft away.');
    const have = CONDITIONS.filter(id => hasCondition(target.actor, id));
    if (!have.length) return ui.notifications.warn('Foul Interchange: ' + target.document.name + ' has none of: ' + CONDITIONS.join(', ') + '.');
    const victims = canvas.tokens.placeables.filter(t => t.actor && t !== target && t !== me && !isDown(t.actor) && dist(me, t) <= 60 && canSee(me, t));
    const pick = await form('Foul Interchange', esc(target.document.name) + ': end a condition (spends a seal). Another creature within 60 ft makes a Con save (DC ' + dcOf(actor) + ') or suffers it until the end of ' + esc(actor.name) + '\'s next turn.', [
        {name: 'cond', label: 'Condition', type: 'select', options: have.map(id => [id, label(id)])},
        {name: 'victim', label: 'Pass it to', type: 'select', options: [['', 'no one']].concat(victims.map(t => [t.id, t.document.name]))}]);
    if (!pick) return;
    if (!await spendSealsLocal(actor, 1)) return ui.notifications.warn('Foul Interchange: no seals left.');
    await clearCondition(target.actor, pick.cond);
    let line = '<b>Foul Interchange:</b> ' + esc(target.document.name) + ' is no longer ' + esc(label(pick.cond).toLowerCase()) + '.';
    const v = pick.victim ? canvas.tokens.get(pick.victim) : null;
    if (v) {
        if (v.actor.system.traits?.ci?.value?.has?.(pick.cond)) line += ' ' + esc(v.document.name) + ' is immune.';
        else {
            const failed = await rollSaveLocal(actor, [v], 'con', dcOf(actor), 'Foul Interchange');
            if (failed.has(tokUuid(v))) {
                const st = CONFIG.statusEffects.find(s => s.id === pick.cond);
                await addEffect(v.actor, {name: label(pick.cond) + ' (Foul Interchange)', img: st?.img ?? 'icons/magic/unholy/strike-body-explode-disintegrate.webp',
                    transfer: false, statuses: st ? [pick.cond] : [], origin: actor.uuid, flags: expiring(actor),
                    description: label(pick.cond) + ' until the end of ' + actor.name + '\'s next turn.'});
                line += ' ' + esc(v.document.name) + ' takes it on.';
            } else line += ' ' + esc(v.document.name) + ' resists.';
        }
    }
    await say(actor, line);
}
async function sutekhsBlessing(actor) {
    const me = tokenOf(actor);
    if (!me) return;
    const BLOODLESS = ['construct', 'elemental', 'ooze', 'plant', 'undead'];
    const rows = canvas.tokens.placeables.filter(t => t !== me && t.actor && !BLOODLESS.some(x => typeOf(t.actor).includes(x)) && dist(me, t) <= 120)
        .map(t => {
            const deg = (Math.atan2(t.center.y - me.center.y, t.center.x - me.center.x) * 180 / Math.PI + 450) % 360;
            const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
            return '<tr><td>' + esc(t.document.name) + '</td><td>' + Math.round(dist(me, t)) + ' ft ' + dir + '</td><td>' + esc(typeOf(t.actor) || '?') + '</td></tr>';
        });
    await whisperGM('<b>Sutekh\'s Blessing (' + esc(actor.name) + '):</b> creatures with blood within 120 ft until the end of his next turn '
        + '(blocked by 1 ft of stone, 1 in of metal, thin lead or 3 ft of wood/dirt: check walls yourself).'
        + (rows.length ? '<table>' + rows.join('') + '</table>' : '<p>None.</p>'));
}
// Haemal Exchange, attacks: offered only when the d8 could turn a hit into a miss.
async function haemalAttack(wf) {
    if (quiet(wf) || !wf.attackRoll || !wf.actor || !wf.token) return;
    const t = wf.targets?.first?.();
    if (!t?.actor || wf.attackRoll.isCritical) return;
    const ac = Number(t.actor.system.attributes?.ac?.value) || 0;
    const margin = wf.attackRoll.total - ac;
    if (margin < 0 || margin >= 8) return;
    for (const s of court('sydmore')) {
        const sa = s.actor;
        if (!ltOf(sa)?.haemal || !sealsOn(wf.actor).has(sa.uuid) || !canReact(sa) || dist(s, wf.token) > 60 || !canSee(s, wf.token)) continue;
        const r = await haemal(sa, s, wf.token, wf.actor.name + ' attacks ' + t.document.name + ': ' + wf.attackRoll.total + ' vs AC ' + ac + '.');
        if (r) {
            await cpr().workflowUtils.bonusAttack(wf, '-' + r);
            return;
        }
    }
}
async function haemalSaves(wf) {
    if (!isSaveAct(wf) || !wf.targets?.size) return;
    for (const s of court('sydmore')) {
        const sa = s.actor;
        if (!ltOf(sa)?.haemal || !canReact(sa)) continue;
        for (const t of wf.targets) {
            if (!t.actor || !sealsOn(t.actor).has(sa.uuid) || dist(s, t) > 60 || !canSee(s, t)) continue;
            const r = await haemal(sa, s, t, t.document.name + ' is about to save against ' + wf.item.name + '.');
            if (r) {
                await addEffect(t.actor, {name: 'Haemal Exchange (−' + r + ')', img: 'icons/magic/unholy/orb-drain-red.webp', transfer: false, duration: {rounds: 1},
                    changes: [{key: 'system.bonuses.abilities.save', mode: ADD(), value: '-' + r, priority: 20}], flags: {dae: {specialDuration: ['isSave']}}});
                break;
            }
        }
    }
}
// One question: burn a seal on the creature and empower which ally. Returns the d8 (or 0).
async function haemal(sa, s, victim, why) {
    const allies = canvas.tokens.placeables.filter(t => t.actor && t !== s && t.document.disposition === s.document.disposition && !isDown(t.actor) && dist(s, t) <= 30);
    const buttons = allies.map(t => ['Yes: empower ' + t.document.name, t.id]).concat([['Yes (no ally)', 'none'], ['No', false]]);
    const pick = await ask('Haemal Exchange (' + sa.name + ')', why + ' Burn one of ' + sa.name + '\'s seals on ' + victim.document.name
        + ' (reaction): it subtracts 1d8, and an ally within 30 ft adds 1d8 to its next attack roll or saving throw.', buttons);
    if (!pick) return 0;
    const roll = await new Roll('1d8').evaluate();
    await roll.toMessage({speaker: ChatMessage.getSpeaker({actor: sa}), flavor: 'Haemal Exchange: ' + victim.document.name + ' subtracts'});
    await gm('reaction', {actor: sa.uuid});
    await gm(ltOf(sa)?.haemalDamage === false ? 'removeSeals' : 'burn', {owner: sa.uuid, token: tokUuid(victim), n: 1, type: 'necrotic'});
    const ally = pick !== 'none' ? canvas.tokens.get(pick) : null;
    if (ally?.actor) {
        const r2 = await new Roll('1d8').evaluate();
        await addEffect(ally.actor, {name: 'Haemal Exchange (+' + r2.total + ')', img: 'icons/magic/life/heart-glowing-red.webp', transfer: false, duration: {seconds: 600},
            description: '+' + r2.total + ' to the next attack roll or saving throw.',
            changes: ['mwak', 'rwak', 'msak', 'rsak'].map(k => ({key: 'system.bonuses.' + k + '.attack', mode: ADD(), value: '+' + r2.total, priority: 20}))
                .concat([{key: 'system.bonuses.abilities.save', mode: ADD(), value: '+' + r2.total, priority: 20}]),
            flags: {dae: {specialDuration: ['1Attack', 'isSave']}}});
        await say(sa, '<b>Haemal Exchange:</b> ' + esc(victim.document.name) + ' −' + roll.total + '; ' + esc(ally.document.name) + ' +' + r2.total + ' on its next attack or save.');
    } else await say(sa, '<b>Haemal Exchange:</b> ' + esc(victim.document.name) + ' −' + roll.total + '.');
    return roll.total;
}
// Bloodstroke: an ally with Exsanguinate temp HP is hit by a melee attack -> attacker takes damage = his level.
async function bloodstroke(wf) {
    if (quiet(wf) || !wf.hitTargets?.size || !wf.token || !attackType(wf, 'meleeAttack')) return;
    for (const t of wf.hitTargets) {
        const mark = t.actor?.effects.find(e => e.flags?.[MODULE_ID]?.exsanguinate);
        if (!mark || !(t.actor.system.attributes.hp.temp > 0)) continue;
        const owner = actorFrom(mark.flags[MODULE_ID].exsanguinate);
        if (!ltOf(owner)?.bloodstroke) continue;
        const type = ltOf(owner).bloodstrokeType ?? 'necrotic';
        await cpr().workflowUtils.applyDamage([wf.token], levelOf(owner), type);
        await say(owner, '<b>Bloodstroke:</b> ' + esc(wf.token.document.name) + ' takes ' + levelOf(owner) + ' ' + type + ' damage for striking ' + esc(t.document.name) + '.');
    }
}
function onExsanguinate(owner, ally) {
    if (!ltOf(owner)?.bloodstroke || !isActiveGM() || !ally?.actor) return;
    const old = ally.actor.effects.find(e => e.flags?.[MODULE_ID]?.exsanguinate);
    const data = {name: 'Exsanguinate (Bloodstroke)', img: 'icons/magic/unholy/barrier-shield-glowing-pink.webp', transfer: false,
        description: 'While it has these temporary hit points, a creature that hits it with a melee attack takes ' + levelOf(owner) + ' damage.',
        flags: {[MODULE_ID]: {exsanguinate: owner.uuid}}};
    (old ? old.update(data) : ally.actor.createEmbeddedDocuments('ActiveEffect', fxAll([data]))).catch(err => console.error(TITLE + ' | Bloodstroke mark', err));
}
// Sanguine Gift: an ally within 30 ft of Sydmore regains HP -> spend a seal for + his level.
async function sanguineGift(actor, gain) {
    const t = tokenOf(actor);
    if (!t) return;
    for (const s of court('sydmore')) {
        const sa = s.actor;
        if (!ltOf(sa)?.sanguineGift || s === t || isDown(sa) || s.document.disposition !== t.document.disposition || dist(s, t) > 30 || !canSee(s, t) || sealsLeft(sa) < 1) continue;
        const hp = actor.system.attributes.hp;
        if (hp.value >= hp.max) return;
        const bonus = levelOf(sa);
        if (!await cpr().dialogUtils.confirm('Sanguine Gift (' + sa.name + ')', t.document.name + ' regains ' + gain + ' HP. Spend a seal to add ' + bonus + '? (' + sealsLeft(sa) + ' seals left)', {userId: gmId()})) return;
        await spendSealsLocal(sa, 1);
        await actor.update({'system.attributes.hp.value': Math.min(hp.max, hp.value + bonus)}, {nixGift: true});
        return say(sa, '<b>Sanguine Gift:</b> ' + esc(t.document.name) + ' regains ' + bonus + ' more hit points.');
    }
}

// =====================================================================
//  VALINTINA
// =====================================================================
function castLevelOf(wf) { return Number(wf.castData?.castLevel ?? wf.item?.system?.level ?? 0); }
const illriggerSpell = item => item?.type === 'spell' && (!item.system.sourceClass || /illrigger/i.test(item.system.sourceClass));
const spellMod = a => {
    const ab = a.system.attributes?.spellcasting;
    if (ab && a.system.abilities?.[ab]) return a.system.abilities[ab].mod;
    const dc = Number(a.system.attributes?.spell?.dc ?? 0);
    return dc ? dc - 8 - pb(a) : 0;
};
async function spellbreaker(wf) {
    if (wf.item?.type !== 'spell' || wf.nixSpellbreaker || wf.nixSubtle || !wf.token) return;
    if (cpr()?.workflowUtils?.isSustainedRoll?.(wf)) return;
    const acts = wf.item.system.activities?.contents ?? [];
    if (acts.length > 1 && wf.activity && wf.activity.id !== acts[0].id && wf.activity.consumption?.spellSlot === false) return;
    wf.nixSpellbreaker = true;
    for (const v of court('valintina')) {
        const va = v.actor;
        if (!ltOf(va)?.spellbreaker || v === wf.token || !canReact(va) || dist(v, wf.token) > 60 || !canSee(v, wf.token)) continue;
        const have = sealsOn(wf.actor).get(va.uuid)?.effects.length ?? 0;
        if (!have) continue;
        const buttons = Array.from({length: have}, (_, i) => ['Burn ' + (i + 1) + ' seal' + (i ? 's' : '') + ': Counterspell at level ' + (3 + i), i + 1]).concat([['No', false]]);
        const n = await ask('Spellbreaker (' + va.name + ')', wf.actor.name + ' is casting a spell! Burn seals on them (no damage) to cast Counterspell with no slot? Spell Duel: d20 + Cha + counter level.', buttons);
        if (!n) continue;
        await gm('reaction', {actor: va.uuid});
        await gm('removeSeals', {owner: va.uuid, token: tokUuid(wf.token), n});
        const level = 2 + n, lvlT = castLevelOf(wf);
        const vr = await new Roll('1d20 + ' + chaMod(va) + ' + ' + level).evaluate();
        await vr.toMessage({speaker: ChatMessage.getSpeaker({actor: va}), flavor: 'Spellbreaker (Spell Duel): d20 + Cha ' + chaMod(va) + ' + level ' + level});
        const cr = await new Roll('1d20 + ' + spellMod(wf.actor) + ' + ' + lvlT).evaluate();
        await cr.toMessage({speaker: ChatMessage.getSpeaker({actor: wf.actor}), flavor: wf.item.name + ' (Spell Duel): d20 + spellcasting ' + spellMod(wf.actor) + ' + spell level ' + lvlT});
        const nat20 = vr.dice?.[0]?.total === 20;
        if (vr.total < cr.total && !nat20) { await say(wf.actor, '<b>Spell Duel:</b> ' + esc(wf.actor.name) + ' wins (' + vr.total + ' vs ' + cr.total + '). ' + esc(wf.item.name) + ' goes off!'); continue; }
        const refund = vr.total === cr.total || (nat20 && vr.total < cr.total);
        if (refund && lvlT > 0) {
            const key = (wf.item.system.method ?? wf.item.system.preparation?.mode) === 'pact' ? 'pact' : 'spell' + lvlT;
            const slot = wf.actor.system.spells?.[key];
            if (slot && slot.value < (slot.max ?? Infinity)) await gm('update', {uuid: wf.actor.uuid, data: {['system.spells.' + key + '.value']: slot.value + 1}});
        }
        await say(va, '<b>Spellbreaker:</b> ' + esc(wf.actor.name) + '\'s <b>' + esc(wf.item.name) + '</b> is countered (' + vr.total + ' vs ' + cr.total + ')' + (refund ? '; the slot is not spent.' : '.'));
        const conc = cpr()?.effectUtils?.getConcentrationEffect?.(wf.actor, wf.item);
        if (conc) await gm('deleteEffect', {actor: wf.actor.uuid, id: conc.id});
        wf.aborted = true;
        return;
    }
}
async function submit(wf) {
    const a = wf.actor;
    if (keyOf(a) !== 'valintina' || !ltOf(a)?.submit || !illriggerSpell(wf.item) || !isSaveAct(wf)) return;
    const cand = Array.from(wf.targets ?? []).filter(t => t.actor && (sealsOn(t.actor).get(a.uuid)?.effects.length ?? 0) >= 2);
    if (!cand.length) return;
    const pick = await form('Submit', 'Burn two of ' + esc(a.name) + '\'s seals on a creature: it has disadvantage on its save against ' + esc(wf.item.name) + '.',
        cand.map(t => ({name: t.id, label: t.document.name + ' (' + sealsOn(t.actor).get(a.uuid).effects.length + ' seals)'})).concat([
            {name: 'type', label: 'Burn as', type: 'select', options: [['necrotic', 'necrotic'], ['fire', 'fire']]}]));
    if (!pick) return;
    for (const t of cand.filter(t => pick[t.id])) {
        await executeRow({owner: a, token: t, n: 2, type: pick.type, boons: {}});
        await addEffect(t.actor, {name: 'Submit', img: 'icons/magic/control/debuff-chains-shackle-movement-red.webp', transfer: false, duration: {rounds: 1},
            changes: [{key: 'flags.midi-qol.disadvantage.ability.save.all', mode: OV(), value: '1', priority: 20}], flags: {dae: {specialDuration: ['isSave']}}});
    }
}
// Enervating Spell: armed by its activity (1/day); the next damaging illrigger spell of 1st level+ spends a seal.
async function enervate(wf) {
    const a = wf.actor;
    const armed = a?.effects.find(e => e.flags?.[MODULE_ID]?.enervating);
    if (!armed || keyOf(a) !== 'valintina' || !illriggerSpell(wf.item) || castLevelOf(wf) < 1 || !(wf.hitTargets?.size || wf.targets?.size)) return;
    const types = Array.from(new Set((wf.damageRolls ?? []).map(r => r.options?.type).filter(t => t && !['healing', 'temphp'].includes(t))));
    if (!types.length) return;
    if (!await spendSealsLocal(a, 1)) { ui.notifications.warn('Enervating Spell: no seals left (still armed).'); return; }
    await armed.delete();
    const made = [];
    const [self] = await a.createEmbeddedDocuments('ActiveEffect', fxAll([{name: 'Enervating Spell (casting)', img: 'icons/magic/unholy/projectile-helix-blood-red.webp', transfer: false,
        changes: types.flatMap(t => [{key: 'system.traits.idr.value', mode: ADD(), value: t, priority: 20}, {key: 'system.traits.idi.value', mode: ADD(), value: t, priority: 20}]),
        flags: {[MODULE_ID]: {transient: true}}}]));
    made.push({actor: a.uuid, id: self.id});
    for (const t of (wf.hitTargets?.size ? wf.hitTargets : wf.targets)) {
        if (!t.actor) continue;
        const id = await addEffect(t.actor, {name: 'Enervating Spell', img: 'icons/magic/unholy/projectile-helix-blood-red.webp', transfer: false, duration: {seconds: 6},
            changes: types.map(x => ({key: 'system.traits.dv.value', mode: ADD(), value: x, priority: 20})), flags: {[MODULE_ID]: {transient: true}}});
        if (id) made.push({actor: t.actor.uuid, id});
    }
    wf.nixEnervate = made;
    await say(a, '<b>Enervating Spell:</b> ' + esc(wf.item.name) + ' makes its targets vulnerable to ' + types.join(', ') + ' (resistance and immunity suppressed).');
}
async function vileTransmogrification(actor, which) {
    const slots = Object.entries(actor.system.spells ?? {}).filter(([k, s]) => /^spell\d$/.test(k) && s.max > 0)
        .map(([k, s]) => ({k, level: Number(k.slice(5)), value: s.value, max: s.max}));
    if (which === 'seals') {
        const have = slots.filter(s => s.value > 0);
        if (!have.length) return ui.notifications.warn('Regaining Seals: no spell slots left.');
        const k = await ask('Vile Transmogrification: Regaining Seals', 'Spend a spell slot to regain seals equal to its level.', have.map(s => ['Level ' + s.level + ' (' + s.value + ' left)', s.k]).concat([['Cancel', false]]));
        if (!k) return false;
        const s = have.find(x => x.k === k);
        await actor.update({['system.spells.' + k + '.value']: s.value - 1});
        const back = await regainSealsLocal(actor, s.level);
        await say(actor, '<b>Regaining Seals:</b> a level ' + s.level + ' slot becomes ' + back + ' seal' + (back === 1 ? '' : 's') + '.');
        return true;
    }
    const left = sealsLeft(actor);
    const opts = [];
    for (let lvl = 1; lvl * 3 <= left; lvl++) { const s = slots.find(x => x.level === lvl); if (s && s.value < s.max) opts.push(['Spend ' + lvl * 3 + ' seals: level ' + lvl + ' slot', lvl]); }
    if (!opts.length) return ui.notifications.warn('Regaining Spell Slots: not enough seals for a missing slot (3 seals per slot level).');
    const lvl = await ask('Vile Transmogrification: Regaining Spell Slots', 'Spend seals to regain a spell slot of one-third their number. ' + left + ' seals left.', opts.concat([['Cancel', false]]));
    if (!lvl) return false;
    await spendSealsLocal(actor, lvl * 3);
    const s = slots.find(x => x.level === lvl);
    await actor.update({['system.spells.' + s.k + '.value']: s.value + 1});
    await say(actor, '<b>Regaining Spell Slots:</b> ' + lvl * 3 + ' seals become a level ' + lvl + ' slot.');
    return true;
}

// =====================================================================
//  LUCIAN
// =====================================================================
async function charmEnemy(actor, target, {free = false} = {}) {
    const ce = actor.items.get(ltOf(actor)?.charmEnemy) ?? actor.items.find(i => /^charm enemy/i.test(i.name));
    if (!ce || !target?.actor || !(ce.system.uses?.value > 0)) return;
    if (!typeOf(target.actor).includes('humanoid')) return;
    const me = tokenOf(actor);
    const others = canvas.tokens.placeables.filter(t => t !== target && t.actor && typeOf(t.actor).includes('humanoid') && me && dist(me, t) <= 30
        && (sealsOn(t.actor).get(actor.uuid)?.effects.length ?? 0) > 0);
    const fields = [{name: 'charm', label: 'Charm ' + target.document.name + ' (Cha save DC ' + dcOf(actor) + ', 1 hour)', checked: true}]
        .concat(others.map(t => ({name: t.id, label: 'Burn ' + t.document.name + '\'s seals too (' + sealsOn(t.actor).get(actor.uuid).effects.length + '), then charm it', type: 'select',
            options: [['0', 'no']].concat(Array.from({length: sealsOn(t.actor).get(actor.uuid).effects.length}, (_, i) => [String(i + 1), 'burn ' + (i + 1)])) })));
    const pick = await form('Charm Enemy (' + ce.system.uses.value + ' left)', esc(actor.name) + ' seals ' + esc(target.document.name) + '.', fields);
    if (!pick || (!pick.charm && !others.some(t => Number(pick[t.id]) > 0))) return;
    await ce.update({'system.uses.spent': (ce.system.uses.spent ?? 0) + 1});
    const tries = pick.charm ? [target] : [];
    for (const t of others) {
        const n = Number(pick[t.id]) || 0;
        if (!n) continue;
        await executeRow({owner: actor, token: t, n, type: 'necrotic', boons: {}});
        if (!isDown(t.actor)) tries.push(t);
    }
    const able = tries.filter(t => !t.actor.system.traits?.ci?.value?.has?.('charmed'));
    if (!able.length) return;
    const failed = await rollSaveLocal(actor, able, 'cha', dcOf(actor), 'Charm Enemy', ce.img);
    for (const t of able.filter(t => failed.has(tokUuid(t)))) {
        await addEffect(t.actor, {name: 'Charmed (' + actor.name + ')', img: 'icons/magic/control/hypnosis-mesmerism-swirl.webp', transfer: false, origin: ce.uuid,
            statuses: ['charmed'], duration: {seconds: 3600},
            description: 'Charmed by ' + actor.name + ' for 1 hour, or until he or his companions do anything harmful to it. It regards him as a friendly acquaintance; afterwards it knows.',
            flags: {dae: {specialDuration: ['isDamaged']}}});
    }
}
function onPreCreateEffect(effect, data) {
    const statuses = new Set([...(effect.statuses ?? []), ...(data?.statuses ?? [])]);
    if (!statuses.has('charmed')) return;
    const a = effect.parent;
    if (!(a instanceof Actor)) return;
    const t = tokenOf(a);
    for (const l of court('lucian')) {
        if (!ltOf(l.actor)?.intransigent || isDown(l.actor)) continue;
        if (l.actor.uuid === a.uuid || (t && t.document.disposition === l.document.disposition && dist(l, t) <= 10)) {
            ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: l.actor}), content: '<b>Intransigent:</b> ' + esc(a.name) + ' can\'t be charmed while near ' + esc(l.actor.name) + '.'});
            return false;
        }
    }
}
async function letsMakeADeal(actor, target) {
    if (!target?.actor) return ui.notifications.warn('Let\'s Make a Deal: target a willing ally within 60 ft.');
    const old = target.actor.effects.filter(e => e.flags?.[MODULE_ID]?.deal);
    for (const e of old) await gm('deleteEffect', {actor: target.actor.uuid, id: e.id});
    await addEffect(target.actor, {name: 'Deal with ' + actor.name, img: 'icons/sundries/documents/document-sealed-signatures-red.webp', transfer: false, duration: {seconds: 600},
        description: 'Once within 10 minutes: advantage and +' + pb(actor) + ' on one attack roll or saving throw. Hit/success: ' + levelOf(actor) + ' temporary HP. Miss/fail: disadvantage on the next attack roll or saving throw.',
        flags: {[MODULE_ID]: {deal: {owner: actor.uuid, bonus: pb(actor), temp: levelOf(actor)}}}});
    await say(actor, '<b>Let\'s Make a Deal:</b> ' + esc(target.document.name) + ' takes the deal.');
}
const dealOf = a => a?.effects.find(e => e.flags?.[MODULE_ID]?.deal);
async function dealBefore(wf) {
    if (isAttack(wf) && dealOf(wf.actor)) {
        const d = dealOf(wf.actor).flags[MODULE_ID].deal;
        if (!await cpr().dialogUtils.confirm('Let\'s Make a Deal', 'Strike the deal on this attack with ' + wf.item.name + '? (advantage, +' + d.bonus + ')', {userId: gmId()})) return;
        await addEffect(wf.actor, {name: 'Deal struck', img: 'icons/sundries/documents/document-sealed-signatures-red.webp', transfer: false, duration: {turns: 1},
            changes: [{key: 'flags.midi-qol.advantage.attack.all', mode: OV(), value: '1', priority: 20}]
                .concat(['mwak', 'rwak', 'msak', 'rsak'].map(k => ({key: 'system.bonuses.' + k + '.attack', mode: ADD(), value: '+' + d.bonus, priority: 20}))),
            flags: {dae: {specialDuration: ['1Attack']}}});
        wf.nixDeal = {attack: wf.actor.uuid};
    }
    if (isSaveAct(wf)) {
        for (const t of wf.targets ?? []) {
            const e = dealOf(t.actor);
            if (!e) continue;
            const d = e.flags[MODULE_ID].deal;
            if (!await cpr().dialogUtils.confirm('Let\'s Make a Deal', t.document.name + ' must save against ' + wf.item.name + '. Strike the deal? (advantage, +' + d.bonus + ')', {userId: gmId()})) continue;
            await addEffect(t.actor, {name: 'Deal struck', img: e.img, transfer: false, duration: {turns: 1},
                changes: [{key: 'flags.midi-qol.advantage.ability.save.all', mode: OV(), value: '1', priority: 20},
                    {key: 'system.bonuses.abilities.save', mode: ADD(), value: '+' + d.bonus, priority: 20}], flags: {dae: {specialDuration: ['isSave']}}});
            (wf.nixDeal ??= {}).saves = [...(wf.nixDeal.saves ?? []), tokUuid(t)];
        }
    }
}
async function dealAfter(wf) {
    const settle = async (actor, won) => {
        const e = dealOf(actor);
        if (!e) return;
        const d = e.flags[MODULE_ID].deal;
        await gm('deleteEffect', {actor: actor.uuid, id: e.id});
        const owner = actorFrom(d.owner);
        if (won) {
            if ((actor.system.attributes.hp.temp ?? 0) < d.temp) await gm('update', {uuid: actor.uuid, data: {'system.attributes.hp.temp': d.temp}});
            await say(owner, '<b>Deal kept:</b> ' + esc(actor.name) + ' gains ' + d.temp + ' temporary hit points.');
        } else {
            await addEffect(actor, {name: 'Bad Deal', img: 'icons/sundries/documents/document-torn-diagram-tan.webp', transfer: false, duration: {seconds: 600},
                description: 'Disadvantage on the next attack roll or saving throw (it can\'t be cancelled by advantage: adjudicate if both apply).',
                changes: [{key: 'flags.midi-qol.disadvantage.attack.all', mode: OV(), value: '1', priority: 20}, {key: 'flags.midi-qol.disadvantage.ability.save.all', mode: OV(), value: '1', priority: 20}],
                flags: {dae: {specialDuration: ['1Attack', 'isSave']}}});
            await say(owner, '<b>Deal broken:</b> ' + esc(actor.name) + ' has disadvantage on its next attack roll or saving throw.');
        }
    };
    if (wf.nixDeal?.attack) await settle(wf.actor, (wf.hitTargets?.size ?? 0) > 0);
    for (const u of wf.nixDeal?.saves ?? []) {
        const t = tokFrom(u);
        if (!t?.actor) continue;
        const saved = Array.from(wf.saves ?? []).some(x => tokUuid(x) === u);
        await settle(t.actor, saved);
    }
}
async function slipperyPloy(wf) {
    if (!wf.token || !wf.targets?.size || !(isAttack(wf) || wf.item?.type === 'spell' || isSaveAct(wf))) return;
    for (const l of court('lucian')) {
        const la = l.actor;
        if (!ltOf(la)?.slipperyPloy || !wf.targets.has(l) || la.uuid === wf.actor.uuid || l.document.disposition === wf.token.document.disposition) continue;
        if (!canReact(la) || sealsLeft(la) < 1) continue;
        const ok = await cpr().dialogUtils.confirm('Slippery Ploy (' + la.name + ')', wf.actor.name + ' targets ' + la.name + ' with ' + wf.item.name
            + '. Reaction: place a seal on it and force a Charisma save (DC ' + dcOf(la) + '); on a failure it must pick a new target or lose it.', {userId: gmId()});
        if (!ok) continue;
        await gm('reaction', {actor: la.uuid});
        await gm('placeSeal', {owner: la.uuid, token: tokUuid(wf.token), count: 1});
        const failed = await rollSave(la, [wf.token], 'cha', dcOf(la), 'Slippery Ploy');
        if (!failed.has(tokUuid(wf.token))) { await say(la, '<b>Slippery Ploy:</b> ' + esc(wf.token.document.name) + ' sees through it.'); continue; }
        wf.targets.delete(l);
        if (wf.targets.size) { await say(la, '<b>Slippery Ploy:</b> ' + esc(la.name) + ' slips out of ' + esc(wf.item.name) + '.'); continue; }
        const reach = Number(wf.activity?.range?.value) || (wf.activity?.range?.units === 'touch' ? 5 : Number(wf.item?.system?.range?.reach) || 5);
        const opts = canvas.tokens.placeables.filter(t => t.actor && t !== l && t !== wf.token && !isDown(t.actor) && dist(wf.token, t) <= reach && canSee(wf.token, t));
        const pick = opts.length ? await cpr().dialogUtils.buttonDialog('Slippery Ploy', 'Your target slips away. Choose a new target, or lose the ' + (isAttack(wf) ? 'attack' : 'effect') + '.',
            opts.map(t => [t.document.name, t.id]).concat([['Lose it', false]])) : null;
        if (pick) { wf.targets.add(canvas.tokens.get(pick)); await say(la, '<b>Slippery Ploy:</b> ' + esc(wf.token.document.name) + ' turns on ' + esc(canvas.tokens.get(pick).document.name) + '.'); }
        else { wf.aborted = true; await say(la, '<b>Slippery Ploy:</b> ' + esc(wf.token.document.name) + ' loses ' + esc(wf.item.name) + '.'); }
        return;
    }
}
async function quidProQuo(wf) {
    const a = wf.actor, t = wf.targets?.first?.();
    if (!t?.actor) return;
    let failed;
    if (isSaveAct(wf)) failed = Array.from(wf.failedSaves ?? []).some(x => x === t || tokUuid(x) === tokUuid(t));
    else failed = (await rollSaveLocal(a, [t], 'cha', dcOf(a), 'Quid Pro Quo')).has(tokUuid(t));
    const item = wf.item;
    if (!failed) {
        if (item.system.uses?.max) await item.update({'system.uses.spent': Math.max(0, (item.system.uses.spent ?? 0) - 1)});
        await addEffect(t.actor, {name: 'Immune to Quid Pro Quo', img: item.img, transfer: false, duration: {seconds: 86400}, flags: {[MODULE_ID]: {quidImmune: a.uuid}}});
        return say(a, '<b>Quid Pro Quo:</b> ' + esc(t.document.name) + ' resists (immune for 24 hours). The use isn\'t spent.');
    }
    const devil = await spawnDevil(a, t).catch(err => { console.error(TITLE + ' | Quid Pro Quo devil', err); return null; });
    await t.document.update({hidden: true});
    await addEffect(t.actor, {name: 'Banished (Quid Pro Quo)', img: 'icons/magic/fire/flame-burning-skull-orange.webp', transfer: false, duration: {seconds: 60},
        description: 'Banished to the wastes of Hell. Repeats the Charisma save at the end of each of its turns.',
        changes: [{key: 'flags.midi-qol.OverTime', mode: OV(), value: 'turn=end, saveAbility=cha, saveDC=' + dcOf(a) + ', label=Quid Pro Quo', priority: 20}],
        flags: {[MODULE_ID]: {quid: {owner: a.uuid, token: tokUuid(t), devil: devil?.uuid ?? null}}}});
    await say(a, '<b>Quid Pro Quo:</b> ' + esc(t.document.name) + ' is banished to Hell' + (devil ? ' and ' + esc(devil.name) + ' appears in its place.' : '. Place a devil jurist or horned devil there yourself (none found in the world or compendiums).'));
}
async function spawnDevil(lucian, at) {
    let src = game.actors.find(x => /^devil jurist$/i.test(x.name)) ?? game.actors.find(x => /^horned devil$/i.test(x.name));
    if (!src) for (const re of [/^devil jurist$/i, /^horned devil$/i]) {
        for (const p of game.packs.filter(p => p.documentName === 'Actor')) {
            const e = (await p.getIndex()).find(x => re.test(x.name));
            if (e) { src = await game.actors.importFromCompendium(p, e._id); break; }
        }
        if (src) break;
    }
    if (!src) return null;
    const lt = tokenOf(lucian);
    const td = await src.getTokenDocument({x: at.document.x, y: at.document.y, disposition: lt?.document.disposition ?? -1, hidden: false});
    const [tok] = await canvas.scene.createEmbeddedDocuments('Token', [td.toObject()]);
    if (tok && game.combat?.started && game.combat.scene?.id === canvas.scene.id)
        await game.combat.createEmbeddedDocuments('Combatant', [{tokenId: tok.id, sceneId: canvas.scene.id, actorId: tok.actorId}]);
    return tok;
}
async function onDeleteEffect(effect) {
    const q = effect.flags?.[MODULE_ID]?.quid;
    if (!q || !isActiveGM()) return;
    const t = tokFrom(q.token);
    if (t?.document?.hidden) await t.document.update({hidden: false});
    const d = q.devil ? tokFrom(q.devil) : null;
    if (d?.document) await d.document.delete();
    else if (d?.delete) await d.delete();
    await say(actorFrom(q.owner), '<b>Quid Pro Quo:</b> ' + esc(t?.document?.name ?? 'The creature') + ' returns' + (q.devil ? ' and the devil vanishes.' : '.'));
}
// Red Cant (embedded macro on Moloch's Interdiction) calls this.
export async function redCant(actor, roll) {
    const d20 = roll?.d20?.total ?? roll?.dice?.[0]?.total;
    if (!(d20 <= 9) || sealsLeft(actor) < 1) return null;
    if (!await cpr().dialogUtils.confirm('Red Cant', actor.name + ' rolled a ' + d20 + ' on a Charisma check. Spend a seal to treat it as a 10? (' + sealsLeft(actor) + ' left)', {userId: gmId()})) return null;
    await spendSeals(actor, 1);
    await say(actor, '<b>Red Cant:</b> the ' + d20 + ' becomes a 10.');
    return 10 - d20;
}

// =====================================================================
//  activities (item + legendary)
// =====================================================================
function onPreUse(activity) {
    const kind = kindOf(activity), a = activity?.actor;
    if (!kind || !a) return;
    if (['veil', 'interchange'].includes(kind) && sealsLeft(a) < 1) { ui.notifications.warn(activity.name + ': no seals left.'); return false; }
    if (kind === 'quid') {
        const t = game.user.targets.first();
        if (t?.actor?.effects.some(e => e.flags?.[MODULE_ID]?.quidImmune === a.uuid)) { ui.notifications.warn('Quid Pro Quo: ' + t.document.name + ' is immune for 24 hours.'); return false; }
    }
}
async function onRollFinished(wf) {
    try {
        if (wf?.nixEnervate) for (const m of wf.nixEnervate) await gm('deleteEffect', m);
        if (wf?.nixDeal) await dealAfter(wf);
        if (!quiet(wf)) await slowMastery(wf);
        const kind = kindOf(wf?.activity), a = wf?.actor;
        // Lucian: Charm Enemy rides on his Bonus Action seal (Baleful Interdict).
        if (!kind && keyOf(a) === 'lucian' && ltOf(a)?.charmEnemy && wf.item?.id === biItem(a)?.id && wf.activity?.activation?.type === 'bonus') {
            const t = wf.targets?.first?.();
            if (t) setTimeout(() => charmEnemy(a, t).catch(err => console.error(TITLE + ' | Charm Enemy', err)), 500);
        }
        if (!kind || !game.user.isGM) return;
        const t = wf.targets?.first?.();
        switch (kind) {
            case 'veil': return veilOfLies(a);
            case 'interchange': return foulInterchange(a, t);
            case 'blessing': return sutekhsBlessing(a);
            case 'regainSeals': case 'regainSlots': {
                const done = await vileTransmogrification(a, kind === 'regainSeals' ? 'seals' : 'slots');
                if (!done && wf.activity.uses?.max) await wf.item.update({['system.activities.' + wf.activity.id + '.uses.spent']: Math.max(0, (wf.activity.uses.spent ?? 1) - 1)});
                return;
            }
            case 'enervating':
                if (!a.effects.some(e => e.flags?.[MODULE_ID]?.enervating)) await a.createEmbeddedDocuments('ActiveEffect', fxAll([{name: 'Enervating Spell (ready)', img: 'icons/magic/unholy/projectile-helix-blood-red.webp',
                    transfer: false, duration: {seconds: 60}, description: 'The next illrigger spell of 1st level or higher that deals damage spends a seal: its targets become vulnerable to its damage.',
                    flags: {[MODULE_ID]: {enervating: true}}}]));
                return say(a, '<b>Enervating Spell:</b> ready for her next damaging spell (1 minute).');
            case 'cantrip': {
                const cantrips = a.items.filter(i => i.type === 'spell' && Number(i.system.level) === 0 && i.system.activities?.size);
                if (!cantrips.length) return ui.notifications.warn('Hellfire Cantrip: no cantrips.');
                const id = cantrips.length === 1 ? cantrips[0].id : await ask('Hellfire Cantrip', 'Which cantrip?', cantrips.map(i => [i.name, i.id]));
                const sp = a.items.get(id);
                if (sp) setTimeout(() => cpr().workflowUtils.syntheticItemRoll(sp, Array.from(wf.targets ?? game.user.targets)), 300);
                return;
            }
            case 'bewitch':
                if (!t) return ui.notifications.warn('Bewitching Seal: target a creature first.');
                if (!await placeSeal(a, t, 1)) return ui.notifications.warn('Bewitching Seal: no seals left.');
                return charmEnemy(a, t);
            case 'deal': return letsMakeADeal(a, t);
            case 'quid': return quidProQuo(wf);
        }
    } catch (err) { console.error(TITLE + ' | court rollFinished', err); }
}
async function onPreamble(wf) {
    try {
        if (!wf?.actor || quiet(wf)) return;
        await markedForDeath(wf);
        await slipperyPloy(wf);
        if (wf.aborted) return;
        await spellbreaker(wf);
        if (wf.aborted) return;
        await submit(wf);
        await dealBefore(wf);
        await haemalSaves(wf);
    } catch (err) { console.error(TITLE + ' | court preamble', err); }
}
async function onDamageRolled(wf) {
    try { if (wf?.actor && !quiet(wf)) { await dayusDamage(wf); await enervate(wf); } }
    catch (err) { console.error(TITLE + ' | court damage', err); }
}
async function onAttackRolled(wf) { try { await haemalAttack(wf); } catch (err) { console.error(TITLE + ' | Haemal Exchange', err); } }
async function onAttackComplete(wf) { try { await bloodstroke(wf); } catch (err) { console.error(TITLE + ' | Bloodstroke', err); } }

function onUpdateActor(actor, changed, options) {
    if (!isActiveGM() || !foundry.utils.hasProperty(changed, 'system.attributes.hp')) return;
    // Bloodstroke marker goes with the temporary hit points.
    const mark = actor.effects.find(e => e.flags?.[MODULE_ID]?.exsanguinate);
    if (mark && !(actor.system.attributes.hp.temp > 0)) mark.delete().catch(() => {});
    const before = options?.dnd5e?.hp;
    if (!before || options.isRest || options.nixGift || options.nixRegen) return;
    const gain = actor.system.attributes.hp.value - before.value;
    if (gain > 0) sanguineGift(actor, gain).catch(err => console.error(TITLE + ' | Sanguine Gift', err));
}
async function onUpdateCombat(combat, changed) {
    if (!isActiveGM() || !combat.started || !('turn' in changed || 'round' in changed)) return;
    const prev = combat.combatants.get(combat.previous?.combatantId)?.actor;
    if (prev) await tickExpiring(prev.uuid).catch(err => console.error(TITLE + ' | court expiry', err));
}

export function registerLieutenants() {
    game.socket.on(CHANNEL, onSocket);
    Hooks.on('dnd5e.preUseActivity', onPreUse);
    Hooks.on(HOOKS.preambleComplete, onPreamble);
    Hooks.on('midi-qol.premades.postWaitForAttackRoll', onAttackRolled);
    Hooks.on(HOOKS.damageRollComplete, onDamageRolled);
    Hooks.on(HOOKS.attackRollComplete, onAttackComplete);
    Hooks.on(HOOKS.rollFinished, onRollFinished);
    Hooks.on('preCreateActiveEffect', onPreCreateEffect);
    Hooks.on('deleteActiveEffect', onDeleteEffect);
    Hooks.on('updateActor', onUpdateActor);
    Hooks.on('updateCombat', onUpdateCombat);
    Hooks.on('nixExsanguinate', onExsanguinate);
    return {ltOf, gm, sealsLeft, spendSeals, redCant, charmEnemy, foulInterchange, veilOfLies, lightAt};
}
