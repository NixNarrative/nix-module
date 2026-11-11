// =====================================================================
//  NIX FIX: Court of Ravenloft engine adapter (v13 Chris's Premades 1 / v14 CAT)
//
//  The Court runtime (illrigger, bloodrift, boss, lieutenants, petra-spells) was
//  written against Chris's Premades 1 helpers (`chrisPremades.utils`). This file
//  keeps that call style working on both engines:
//    cpr()  v13: chrisPremades.utils, untouched.
//           v14: an object with the same helper names, routed to CAT (`cat.utils`).
//                CPR1 took and returned Token placeables; CAT takes TokenDocuments.
//                The adapter converts at the boundary, so callers keep passing and
//                receiving placeables. CPR1's synthetic rolls spent nothing unless
//                asked; CAT spends by default, so the adapter defaults to "spend nothing".
//    fx()   effect data written the v13 way ({changes: [{mode}]}, duration {seconds|rounds|turns})
//           converted to v14 (system.changes with `type`, duration {value, units}) and
//           the CPR1 identifier copied to flags.cat.identifier. Identity on v13.
//    MODES  numeric change modes (CONST.ACTIVE_EFFECT_MODES may be gone on v14).
//    ident() a document's Court identifier on either engine.
//    teleport() CPR1 Teleport.target / CAT tokenUtils.teleportToken.
//  See docs/V14-PORT-COURT.md, step 1.
// =====================================================================
import {MODULE_ID} from '../constants.mjs';

export const isCat = () => !globalThis.chrisPremades?.utils && !!globalThis.cat?.utils;
export const engineId = () => globalThis.chrisPremades?.utils ? 'cpr1' : (globalThis.cat?.utils ? 'cat' : 'none');

// Numeric change modes, the same numbers on v13 and v14 data.
export const MODES = Object.freeze({CUSTOM: 0, MULTIPLY: 1, ADD: 2, DOWNGRADE: 3, UPGRADE: 4, OVERRIDE: 5,
    ...(globalThis.CONST?.ACTIVE_EFFECT_MODES ?? {})});
const TYPE_OF_MODE = {0: 'custom', 1: 'multiply', 2: 'add', 3: 'downgrade', 4: 'upgrade', 5: 'override'};

// ---------------------------------------------------------------- identifiers
// v13: flags.chris-premades.info.identifier. v14: the same flag survives the migration on
// untouched items; the v14 installers write flags.cat.identifier (effects) and
// flags.nix-module.identifier (items, whose CAT identifier is system.identifier).
export function ident(doc) {
    return doc?.flags?.['chris-premades']?.info?.identifier
        ?? doc?.flags?.[MODULE_ID]?.identifier
        ?? doc?.flags?.cat?.identifier
        ?? undefined;
}

// ---------------------------------------------------------------- tokens
const isPlaceable = t => !!t && typeof t === 'object' && 'document' in t && t.document?.documentName === 'Token';
export const toDoc = t => isPlaceable(t) ? t.document : t;
export const toObj = t => !t ? t : (isPlaceable(t) ? t : (t.object ?? t));
const docs = list => Array.from(list ?? []).map(toDoc).filter(Boolean);

// ---------------------------------------------------------------- effects
function convertChange(c) {
    if (!c || typeof c !== 'object') return c;
    const out = {...c};
    if (out.type === undefined) {
        const m = typeof out.mode === 'string' ? out.mode : TYPE_OF_MODE[Number(out.mode ?? 2)];
        out.type = m ?? 'add';
    }
    delete out.mode;
    if (out.value !== undefined && typeof out.value !== 'string') out.value = String(out.value);
    return out;
}
function convertDuration(d) {
    if (!d || typeof d !== 'object') return d;
    if ('units' in d) return d;
    if (d.seconds != null) return {value: Number(d.seconds), units: 'seconds'};
    if (d.rounds != null) return {value: Number(d.rounds), units: 'rounds'};
    if (d.turns != null) return {value: Number(d.turns), units: 'turns'};
    return {};
}
// Converts one effect's data in place-safe fashion (returns a copy). Identity on v13.
export function fx(data) {
    if (!isCat() || !data || typeof data !== 'object') return data;
    const out = foundry.utils.deepClone(data);
    if (Array.isArray(out.changes)) {
        const list = out.changes.map(convertChange);
        delete out.changes;
        foundry.utils.setProperty(out, 'system.changes', (out.system?.changes ?? []).concat(list));
    } else if (Array.isArray(out.system?.changes)) {
        out.system.changes = out.system.changes.map(convertChange);
    }
    if (out.duration) out.duration = convertDuration(out.duration);
    const id = out.flags?.['chris-premades']?.info?.identifier ?? out['flags.chris-premades.info.identifier'];
    if (id && !out.flags?.cat?.identifier) foundry.utils.setProperty(out, 'flags.cat.identifier', id);
    // Dotted keys a caller merged in (mergeObject with string paths) are expanded here.
    return foundry.utils.expandObject(out);
}
export const fxAll = list => Array.from(list ?? []).map(fx);

// Effect change list on either version (v14 keeps them in system.changes).
export const changesOf = effect => effect?.system?.changes ?? effect?.changes ?? [];

// ---------------------------------------------------------------- v14 adapter
function catAdapter() {
    const u = globalThis.cat.utils;
    const noSpend = o => ({consumeUsage: false, consumeResources: false, spellSlot: false, ...(o ?? {})});
    const opt = o => {
        const r = noSpend(o);
        // CPR1 used `killAnim`; CAT has no switch for it (the item data's own autoanimations flag decides).
        delete r.killAnim;
        return r;
    };
    const workflowUtils = {
        syntheticItemRoll: (item, targets, o) => u.workflowUtils.syntheticItemRoll(item, docs(targets), opt(o)),
        syntheticItemDataRoll: (itemData, actor, targets, o) => u.workflowUtils.syntheticItemDataRoll(itemData, actor, docs(targets), opt(o)),
        syntheticActivityRoll: (activity, targets, o) => u.workflowUtils.syntheticActivityRoll(activity, docs(targets), opt(o)),
        // CPR1: (activityData, item, actor, targets, opts). CAT: (activityData, item, targets, opts).
        syntheticActivityDataRoll: (activityData, item, actor, targets, o) => u.workflowUtils.syntheticActivityDataRoll(activityData, item, docs(targets), opt(o)),
        bonusDamage: (wf, formula, o) => u.workflowUtils.bonusDamage(wf, formula, o),
        bonusAttack: (wf, formula) => u.workflowUtils.bonusAttack(wf, formula),
        modifyDamageAppliedFlat: (ditem, n, o) => u.workflowUtils.modifyDamageAppliedFlat(ditem, n, o),
        applyDamage: (tokens, value, type) => u.workflowUtils.applyDamage(docs(tokens), value, type),
        isAttackType: (wf, type) => u.workflowUtils.isAttackType(wf, type),
        isSustainedRoll: wf => u.workflowUtils.isSustainedRoll?.(wf) ?? false,
        updateTargets: (wf, tokens, userId) => u.workflowUtils.updateTargets(wf, docs(tokens), userId),
        getDamageTypes: rolls => u.workflowUtils.getDamageTypes(rolls),
        preventDeath: ditem => u.workflowUtils.preventZeroHP(ditem),
        preventZeroHP: (ditem, o) => u.workflowUtils.preventZeroHP(ditem, o)
    };
    const tokenUtils = {
        getDistance: (a, b, o) => u.tokenUtils.getDistance(toDoc(a), toDoc(b), o ?? {}),
        // CPR1: (token, range, disposition, {includeIncapacitated, includeToken}) -> placeables.
        findNearby: (token, range, disposition, o = {}) => u.tokenUtils.findNearby(toDoc(token), range,
            {disposition: disposition ?? 'all', includeIncapacitated: o.includeIncapacitated ?? false, includeToken: o.includeToken ?? false}).map(toObj).filter(Boolean),
        canSee: (a, b) => u.tokenUtils.canSee(toObj(a), toObj(b)),
        pushToken: (src, t, distance) => u.tokenUtils.slideToken(toDoc(t), {sourceToken: toDoc(src), distance})
    };
    const actorUtils = {
        typeOrRace: a => u.actorUtils.typeOrRace(a),
        checkTrait: (a, type, trait) => u.actorUtils.checkTrait(a, type, trait),
        hasUsedReaction: a => u.actorUtils.hasUsedReaction(a),
        setReactionUsed: a => u.actorUtils.setReactionUsed(a),
        removeReactionUsed: a => globalThis.MidiQOL?.removeReactionUsed?.(a),
        getFirstToken: a => toObj(u.actorUtils.getFirstToken(a)),
        getSize: (a, asString) => u.actorUtils.getSize(a, asString),
        getItemByIdentifier: (a, id) => a?.items.find(i => ident(i) === id) ?? u.actorUtils.getItemByIdentifier(a, id)
    };
    const dialogUtils = {
        confirm: (title, content, o) => u.dialogUtils.confirm(title, content, o),
        buttonDialog: (title, content, buttons, o) => u.dialogUtils.buttonDialog(title, content, buttons, o),
        selectDocumentDialog: (title, content, list, o) => u.dialogUtils.selectDocumentDialog(title, content, list, o),
        selectHitDie: (a, title, content, o) => u.dialogUtils.selectHitDie(a, title, content, o),
        selectDamageType: (types, title, content, o) => u.dialogUtils.selectDamageType(types, title, content, o),
        // CPR1 returned [result, skip] (placeables) or false. CAT returns {result, skip} (documents) or null.
        selectTargetDialog: async (title, content, targets, o = {}) => {
            const list = docs(targets);
            const opts = {...o};
            if (opts.coverToken) opts.coverToken = toDoc(opts.coverToken);
            const r = await u.dialogUtils.selectTargetDialog(title, content, list, opts);
            if (!r || r.result === undefined || r.result === null) return false;
            const back = x => x?.document ? {...x, document: toObj(x.document)} : toObj(x);
            return [Array.isArray(r.result) ? r.result.map(back) : back(r.result), r.skip];
        }
    };
    const socketUtils = {
        firstOwner: (doc, useId) => u.queryUtils.firstOwner(doc, useId),
        gmID: () => u.queryUtils.gmID()
    };
    const genericUtils = {
        setFlag: (doc, scope, key, value) => u.documentUtils.setFlag(doc, scope, key, value),
        update: (doc, updates, o) => u.documentUtils.update(doc, updates, o),
        remove: (doc, o) => u.documentUtils.deleteDocument(doc, o),
        sleep: ms => new Promise(r => setTimeout(r, ms))
    };
    const effectUtils = {
        getEffectByIdentifier: (actor, id) => actor?.effects?.find(e => ident(e) === id) ?? u.documentUtils.getEffectByIdentifier(actor, id),
        getAllEffectsByIdentifier: (actor, id) => (actor?.effects?.filter(e => ident(e) === id) ?? []),
        getConcentrationEffect: (actor, item) => u.effectUtils.getConcentrationEffect(actor, item),
        addDependent: (parent, children) => u.documentUtils.makeDependent(parent, children),
        createEffect: async (actor, data, {identifier} = {}) => {
            const d = fx(data);
            if (identifier) foundry.utils.setProperty(d, 'flags.cat.identifier', identifier);
            return (await u.effectUtils.createEffects(actor, [d]))?.[0];
        }
    };
    const rollUtils = {
        makeCritical,
        addToRoll: (roll, formula, o) => u.rollUtils.addToRoll(roll, formula, o),
        requestRoll: (token, request, ability, o = {}) => u.rollUtils.requestRoll(toObj(token)?.actor ?? token?.actor ?? token, request, ability,
            {rollDC: o.target ?? o.rollDC, fast: o.fastForward ?? o.fast, advantage: o.advantage, disadvantage: o.disadvantage})
    };
    const itemUtils = {canUse, getItemByIdentifier: actorUtils.getItemByIdentifier};
    return {workflowUtils, tokenUtils, actorUtils, dialogUtils, socketUtils, genericUtils, effectUtils, rollUtils, itemUtils,
        cat: u, isCatAdapter: true};
}

// The hit becomes a critical: the d20's critical threshold drops to its own result.
export function makeCritical(roll) {
    const data = foundry.utils.deepClone(roll.toJSON());
    const d20 = data.terms?.find(t => Number(t.faces) === 20);
    const natural = Number(d20?.results?.find(r => r.active !== false)?.result ?? roll.d20?.total ?? 1);
    const thr = Math.max(1, Math.min(natural, 20));
    data.options = {...(data.options ?? {}), criticalSuccess: thr};
    if (d20) d20.options = {...(d20.options ?? {}), criticalSuccess: thr};
    return Roll.fromData(data);
}

// CPR1 itemUtils.canUse: every consumption target of some activity can be paid.
export function canUse(item) {
    const acts = item?.system?.activities;
    if (!acts?.size) return !item?.system?.uses?.max || (item.system.uses.value ?? 0) > 0;
    return acts.some(a => {
        for (const t of a.consumption?.targets ?? []) {
            const need = Math.max(0, Number.parseInt(t.value) || (/@/.test(String(t.value)) ? 1 : 0));
            if (t.type === 'itemUses') {
                const src = t.target ? a.actor?.items.get(t.target) : a.item;
                if (src && src.system.uses?.max && (src.system.uses.value ?? 0) < need) return false;
            } else if (t.type === 'activityUses') {
                if (a.uses?.max && (a.uses.value ?? 0) < need) return false;
            }
        }
        return true;
    });
}

let adapter = null;
export function cpr() {
    const v13 = globalThis.chrisPremades?.utils;
    if (v13) return v13;
    if (!globalThis.cat?.utils) return undefined;
    return (adapter ??= catAdapter());
}

// ---------------------------------------------------------------- teleport
// v13: CPR1 Teleport.target([token], token, {range, animation}). v14: CAT teleportToken with
// a registered animation ('mistyStep' -> Chris's Premades 2's mistyStep).
export async function teleport(token, {range = 30, animation = 'mistyStep'} = {}) {
    const obj = toObj(token);
    if (globalThis.chrisPremades?.Teleport?.target) return chrisPremades.Teleport.target([obj], obj, {range, animation});
    const u = globalThis.cat?.utils;
    if (!u) return;
    let anim;
    try { anim = animation && animation !== 'none' ? u.animationUtils.getAnimation({source: 'chris-premades', identifier: animation}) : undefined; }
    catch { anim = undefined; }
    return u.tokenUtils.teleportToken(toDoc(obj), {range, animation: anim});
}

// ---------------------------------------------------------------- Midi hook names
// Both engines fire these (CAT listens to the same ones on v14: lib/constants.mjs workflowHookNames).
export const HOOKS = Object.freeze({
    attackRollComplete: 'midi-qol.premades.postAttackRollComplete',
    damageRollComplete: 'midi-qol.premades.preDamageRollComplete',
    rollFinished: 'midi-qol.premades.postRollFinished',
    preambleComplete: 'midi-qol.premades.postPreambleComplete',
    savesComplete: 'midi-qol.premades.postSavesComplete'
});
