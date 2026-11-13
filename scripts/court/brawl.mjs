// =====================================================================
//  NIX FIX: Brawler feats, one popup per hit (1.7.1; v13 Chris's Premades 1)
//
//  Crusher, Grappler (2024) and Tavern Brawler (2024) each asked on every unarmed hit
//  (Chris's Premades: "Move target?", "Attempt to grapple?", "Use Tavern Brawler?"). For an actor
//  marked flags.nix-module.brawl (Sydmore's fixes set it and switch those three CPR macros off)
//  Nix Fix asks ONCE per hit, after the damage, for the creature hit:
//     ( ) nothing   ( ) Push 5 ft (Tavern Brawler)   ( ) Move 5 ft (Crusher, crosshair)   ( ) Grapple (Grappler)
//  One choice per hit (a push or the grapple). Each feat keeps its own once-per-turn use, so
//  Tavern Brawler's push on attack 1 still leaves Crusher's for attack 2; used options don't show.
//  When the Illrigger engine's Baleful Interdict dialog opens for the same damage, these options
//  sit in that window (one window total); otherwise they get their own small window.
//  Automatic, no prompt: Crusher's critical-hit advantage, Grappler's advantage against the
//  creature he's grappling. Tavern Brawler's reroll of 1s stays on its own effect.
//  Runs on the active GM's client. API: game.modules.get('nix-module').api.brawl
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {cpr, isCat, HOOKS} from './engine.mjs';

export const FLAG = 'brawl';
const KEYS = {tb: 'tavernBrawler', crusher: 'crusher', grapple: 'grappler'};
const LABELS = {tb: 'Push 5 ft (Tavern Brawler)', crusher: 'Move 5 ft, you pick the spot (Crusher)', grapple: 'Grapple (Grappler, free)'};
const UNARMED = ['unarmedStrike', 'monkUnarmedStrike', 'tavernBrawlerUnarmedStrike'];
const TTL = 10 * 60 * 1000;
const FALLBACK_MS = 1200;

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const ident = d => d?.flags?.['chris-premades']?.info?.identifier;
const isActiveGM = () => game.user.isGM && (!game.users.activeGM || game.users.activeGM.id === game.user.id);
const marked = a => !!a?.flags?.[MODULE_ID]?.[FLAG];
const feat = (a, re) => a?.items?.find(i => i.type === 'feat' && re.test(i.name)) ?? null;
export const featsOf = a => ({tb: feat(a, /^tavern brawler\b/i), crusher: feat(a, /^crusher\b/i), grapple: feat(a, /^grappler\b/i)});
export const isUnarmed = item => !!item && (UNARMED.includes(ident(item)) || /unarmed strike/i.test(item.name) || item.system?.type?.value === 'unarmed');
const inCombat = () => !!game.combat?.started;
const turnKey = () => inCombat() ? game.combat.round + '-' + game.combat.turn : null;
// Same per-turn flag Chris's Premades uses (flags.chris-premades.<key>.turn), so the two agree.
const usedThisTurn = (item, key) => !!turnKey() && (cpr()?.combatUtils?.perTurnCheck ? !cpr().combatUtils.perTurnCheck(item, key) : item.flags?.['chris-premades']?.[key]?.turn === turnKey());
const setUsed = (item, key) => cpr()?.combatUtils?.setTurnCheck ? cpr().combatUtils.setTurnCheck(item, key) : item.setFlag('chris-premades', key + '.turn', turnKey() ?? '');
const SIZES = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'];
const sizeOf = a => cpr()?.actorUtils?.getSize ? cpr().actorUtils.getSize(a) : Math.max(0, SIZES.indexOf(a?.system?.traits?.size));
const damageTypes = wf => new Set((wf.damageRolls ?? []).map(r => r.options?.type).filter(Boolean));
const meleeAttack = wf => wf.activity?.type === 'attack' && (cpr()?.workflowUtils?.getActionType ? cpr().workflowUtils.getActionType(wf) === 'mwak' : wf.activity?.actionType === 'mwak');

// Which options this hit offers (pure apart from the per-turn flags; exported for tests).
export function optionsFor({attacker, item, target, types, melee}) {
    const f = featsOf(attacker), out = [];
    if (!target?.actor || !melee) return out;
    if (f.tb && isUnarmed(item) && !usedThisTurn(f.tb, KEYS.tb)) out.push('tb');
    if (f.crusher && types.has('bludgeoning') && sizeOf(target.actor) <= sizeOf(attacker) + 1 && !usedThisTurn(f.crusher, KEYS.crusher)) out.push('crusher');
    if (f.grapple && isUnarmed(item) && !usedThisTurn(f.grapple, KEYS.grapple) && grappleActivity(item)) out.push('grapple');
    return out;
}
function grappleActivity(item) {
    const byId = cpr()?.activityUtils?.getActivityByIdentifier?.(item, 'grapple');
    return byId ?? item.system?.activities?.find?.(a => /grapple/i.test(a.name ?? '')) ?? null;
}

// ---------------------------------------------------------------- hits waiting for their damage
const pending = new Map();   // targetActorUuid -> {attacker, attackerToken, target, item, options, expires, wfId}
const fresh = p => !!p && p.expires > Date.now();

async function onDamageRolled(wf) {
    try {
        if (isCat() || !isActiveGM() || !marked(wf?.actor) || wf.hitTargets?.size !== 1) return;
        const target = wf.hitTargets.first();
        if (!target?.actor || target.actor.uuid === wf.actor.uuid) return;
        const types = damageTypes(wf), melee = meleeAttack(wf);
        // Crusher: a critical hit with bludgeoning damage gives attacks against it advantage until his next turn (automatic).
        const {crusher} = featsOf(wf.actor);
        if (crusher && wf.isCritical && types.has('bludgeoning') && !target.actor.effects.some(e => e.flags?.[MODULE_ID]?.crusherCrit === wf.id))
            await target.actor.createEmbeddedDocuments('ActiveEffect', [{name: crusher.name, img: crusher.img, origin: crusher.uuid, transfer: false,
                duration: {seconds: 12, rounds: 1}, changes: [{key: 'flags.midi-qol.grants.advantage.attack.all', mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: '1', priority: 20}],
                flags: {dae: {specialDuration: ['turnStartSource']}, [MODULE_ID]: {crusherCrit: wf.id}}}]);
        const options = optionsFor({attacker: wf.actor, item: wf.item, target, types, melee});
        if (!options.length) return;
        pending.set(target.actor.uuid, {attacker: wf.actor, attackerToken: wf.token, target, item: wf.item, options, expires: Date.now() + TTL, wfId: wf.id});
    } catch (err) { console.error(TITLE + ' | brawl', err); }
}

// The Illrigger engine's after-damage dialog takes the section for the creature it's about (one window).
export function take(targetActorUuid, name = 'brawl') {
    const p = pending.get(targetActorUuid);
    pending.delete(targetActorUuid);
    return fresh(p) ? section(p, name) : null;
}

// After the workflow: if no other window took it, its own small window.
function onRollFinished(wf) {
    if (isCat() || !isActiveGM() || !marked(wf?.actor)) return;
    for (const [k, p] of pending) {
        if (p.wfId !== wf.id) continue;
        setTimeout(() => {
            if (pending.get(k) !== p) return;
            pending.delete(k);
            if (fresh(p)) alone(section(p)).catch(err => console.error(TITLE + ' | brawl', err));
        }, FALLBACK_MS);
    }
    for (const [k, p] of pending) if (!fresh(p)) pending.delete(k);
}

// ---------------------------------------------------------------- the choice
// {html, read(form), apply()}: one radio group (nothing / each available option).
export function section(p, name = 'brawl') {
    const opts = [['', 'Nothing']].concat(p.options.map(o => [o, LABELS[o]]));
    const html = '<fieldset class="nix-brawl"><legend>' + esc(p.attacker.name) + ' hits ' + esc(p.target.document.name) + ' (' + esc(p.item?.name ?? 'attack') + ')</legend>'
        + opts.map(([v, l], i) => '<label style="display:block"><input type="radio" name="' + name + '" value="' + v + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(l) + '</label>').join('')
        + '<small>One per hit: a push or the grapple. Each feat once per turn.</small></fieldset>';
    const s = {p, html, choice: '',
        read(form) { const el = form?.elements?.[name]; s.choice = (el?.value ?? Array.from(form?.querySelectorAll?.('input[name="' + name + '"]') ?? []).find(x => x.checked)?.value) || ''; return s.choice; },
        apply() { return applyChoice(p, s.choice); }};
    return s;
}
async function alone(s) {
    const DialogV2 = foundry.applications.api.DialogV2;
    const res = await DialogV2.wait({window: {title: TITLE + ': ' + s.p.attacker.name}, position: {width: 400}, rejectClose: false, content: s.html,
        buttons: [{action: 'apply', label: 'Apply', icon: 'fa-solid fa-hand-fist', default: true, callback: (ev, button) => s.read(button.form)},
            {action: 'skip', label: 'Skip', icon: 'fa-solid fa-xmark', callback: () => null}]});
    if (res === null || res === 'skip') return;
    await s.apply();
}
export async function applyChoice(p, choice) {
    if (!choice || !p.options.includes(choice)) return false;
    const f = featsOf(p.attacker)[choice];
    if (!f || usedThisTurn(f, KEYS[choice])) return false;
    await setUsed(f, KEYS[choice]);
    const tgt = p.target, name = esc(tgt.document.name);
    if (choice === 'grapple') {
        const act = grappleActivity(p.item);
        if (!act) return false;
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: p.attacker}), content: '<b>' + esc(f.name) + ':</b> grapples ' + name + ' (free).'});
        await cpr().workflowUtils.syntheticActivityRoll(act, [tgt]);
        return true;
    }
    if (choice === 'crusher') {
        const moved = await crusherMove(p.attackerToken, tgt);
        if (moved) await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: p.attacker}), content: '<b>' + esc(f.name) + ':</b> moves ' + name + ' 5 ft.'});
        return moved;
    }
    await cpr().tokenUtils.pushToken(p.attackerToken, tgt, 5);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: p.attacker}), content: '<b>' + esc(f.name) + ':</b> pushes ' + name + ' 5 ft.'});
    return true;
}

// Crusher: Chris's Premades' own placement (its crusher.js late()): a crosshair with the target's
// image and size, up to 5 ft from where the target stands; the target goes where you click.
// Cancelled crosshair = no move (the feat's once-per-turn use is already spent, as in CPR).
export async function crusherMove(attackerToken, targetToken) {
    const doc = targetToken.document, ch = cpr()?.crosshairUtils;
    if (!ch?.aimCrosshair) { await cpr().tokenUtils.pushToken(attackerToken, targetToken, 5); return true; }
    const half = doc.width / 2, widthAdjust = canvas.grid.distance * Math.floor(half);
    const fudgeDistance = widthAdjust + (widthAdjust !== half * canvas.grid.distance ? 2.5 : 0);
    const pos = await ch.aimCrosshair({token: attackerToken, centerpoint: targetToken.center, maxRange: 5, fudgeDistance, drawBoundries: true, trackDistance: true,
        crosshairsConfig: {size: canvas.grid.distance * doc.width / 2, icon: doc.texture.src, resolution: (doc.width % 2) ? 1 : -1}});
    if (!pos || pos.cancelled) return false;
    const x = (pos.x ?? targetToken.center.x) - doc.width * canvas.grid.size / 2, y = (pos.y ?? targetToken.center.y) - doc.height * canvas.grid.size / 2;
    if (cpr()?.genericUtils?.update) await cpr().genericUtils.update(doc, {x, y}); else await doc.update({x, y});
    return true;
}

// Grappler (2024): advantage on attacks against a creature he's grappling (Chris's Premades' grappling effect).
function onPreAttackConfig(wf) {
    try {
        if (isCat() || !marked(wf?.actor) || !featsOf(wf.actor).grapple) return;
        const t = wf.targets?.first?.();
        if (!t) return;
        const mine = wf.actor.effects.filter(e => ident(e) === 'grappling' && e.flags?.['chris-premades']?.grapple?.tokenId === t.id);
        if (mine.length) wf.tracker?.advantage?.add?.('Grappler', 'Grappler');
    } catch (err) { console.error(TITLE + ' | Grappler', err); }
}

export function registerBrawl() {
    Hooks.on(HOOKS.damageRollComplete, onDamageRolled);
    Hooks.on(HOOKS.rollFinished, onRollFinished);
    Hooks.on('midi-qol.premades.preAttackRollConfig', onPreAttackConfig);
    return {take, section, optionsFor, applyChoice, featsOf, pending};
}
