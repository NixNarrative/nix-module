// =====================================================================
//  NIX FIX: Illrigger class features on Foundry v14 (CAT)
//
//  Chris's Premades 2 has no Illrigger. On v13 the Court leaned on Chris's Premades 1's
//  Illrigger automations (scripts/macros/2014/classFeatures/illrigger, CPR 1.5.51, MIT
//  licence). This file ports the ones the Court sheets carry to CAT function macros,
//  registered under the source 'nix-module'. Items, activities and effects only carry a
//  reference (flags.cat.macros.<type> = [{source: 'nix-module', identifier, rules: 'all'}]),
//  written by the v14 "Illrigger engine" installer, so updating Nix Fix updates them all.
//
//  Identifiers are the CPR1 names (balefulInterdict..., infernalConduit, ...), so the
//  Court runtime's existing identifier lookups keep working.
//
//  Not ported (the Nix Fix engine in illrigger.mjs already does them, one dialog per event):
//  Baleful Interdict's hit prompt and burn prompt, Deathstrike (a checkbox in the hit
//  dialog), Superior Interdict (applied at burn time), Soul's Doom (added to every damage
//  event), the Bedevil / Styx's Apathy / Unleash Hell burn boons (rows in the burn dialog).
//  Passive only, no macro: Combat Mastery: Unfettered / Bravado, Master of Hell, Invoke Hell,
//  Interdict Boons, Dispater's Blessing, Hellsight, Hellish Frenzy, By the Throat, Grand Strategist.
//  Boss kits (step 3): bloodPriceLegendary, the combined Blood Price / Legendary Resistance prompt.
//  See docs/V14-PORT-COURT.md, step 2.
// =====================================================================
import {MODULE_ID, TITLE} from '../constants.mjs';
import {cfgOf, moveSeals, placeSeal, promptBurn, sealsOf, sealsOn, tokenOf} from './illrigger.mjs';
import {canUse, fx, ident, teleport, toDoc, toObj} from './engine.mjs';

export const SOURCE = MODULE_ID;
export const RULES = 'all';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const U = () => globalThis.cat.utils;
const inCombat = () => !!game.combat?.started;
const firstOwner = doc => U().queryUtils.firstOwner(doc, true) ?? game.user.id;
const say = (actor, html) => ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: html});
const itemOf = doc => doc?.documentName === 'Activity' ? doc.item : doc;
const byIdent = (actor, id, re) => actor?.items.find(i => ident(i) === id) ?? (re ? actor?.items.find(i => re.test(i.name)) : undefined);
const hasUnfettered = actor => !!byIdent(actor, 'combatMasteryUnfettered', /unfettered/i);
const firstTarget = wf => wf?.targets?.first?.() ?? Array.from(wf?.targets ?? [])[0];
const sizeOf = actor => U().actorUtils.getSize(actor);
const equippedWeapons = actor => actor.items.filter(i => i.type === 'weapon' && i.system.equipped);
const usable = item => !!item && canUse(item);
// The workflow's token as a placeable (Midi keeps placeables on the workflow).
const wfToken = wf => wf?.token ?? tokenOf(wf?.actor);

async function pickWeapon(actor, title) {
    const list = equippedWeapons(actor);
    if (list.length <= 1) return list[0];
    const id = await U().dialogUtils.buttonDialog(title, 'Which weapon?', list.map(i => [i.name, i.id]), {userId: firstOwner(actor)});
    return actor.items.get(id);
}
// One weapon attack as part of another feature (CAT specialItemUse: activation becomes special).
async function featureAttack(actor, source, targets, title) {
    const w = await pickWeapon(actor, title ?? source.name);
    if (!w) return;
    return U().workflowUtils.specialItemUse(w, Array.from(targets).map(toDoc), source, {consumeUsage: true, consumeResources: true});
}
// Offer one of the boons a seal placement or move allows. Returns the chosen item or null.
async function offerBoons(actor, target, {bonus = true} = {}) {
    if (!byIdent(actor, 'interdictBoons', /^interdict boons$/i)) return null;
    let list;
    if (bonus) {
        const throat = byIdent(actor, 'byTheThroat', /by the throat/i);
        const throatOk = throat && target?.actor && sizeOf(target.actor) <= sizeOf(actor) + 1;
        list = [byIdent(actor, 'interdictBoonAcheronsChain', /acheron'?s chain/i), byIdent(actor, 'interdictBoonDissOnslaught', /dis'?s onslaught/i),
            byIdent(actor, 'interdictBoonFlashOfBrimstone', /flash of brimstone/i), byIdent(actor, 'interdictBoonSoulsDoom', /soul'?s doom/i), throatOk ? throat : null];
    } else list = [byIdent(actor, 'interdictBoonFlashOfBrimstone', /flash of brimstone/i)];
    list = Array.from(new Set(list.filter(usable)));
    if (!list.length) return null;
    const id = await U().dialogUtils.buttonDialog('Interdict Boons', 'Use a boon on ' + esc(target?.document?.name ?? target?.name ?? 'the target') + '?',
        list.map(i => [i.name, i.id]).concat([['No', '']]), {userId: firstOwner(actor)});
    const it = id ? actor.items.get(id) : null;
    if (!it) return null;
    // D&D Beyond bundles repeat several boons per item: roll the activity Nix Fix wired (or the one named for it).
    const act = it.system.activities.find(x => (x.flags?.cat?.macros?.roll ?? []).some(r => r.source === SOURCE))
        ?? it.system.activities.find(x => x.name && it.name.toLowerCase().includes(x.name.toLowerCase().replace(/\s*\(passive\)$/, '')))
        ?? it.system.activities.contents[0];
    const targets = target ? [toDoc(target)] : [];
    if (act) await U().workflowUtils.syntheticActivityRoll(act, targets, {consumeUsage: true, consumeResources: true, spellSlot: false});
    else await U().workflowUtils.syntheticItemRoll(it, targets, {consumeUsage: true, consumeResources: true, spellSlot: false});
    return it;
}

// ======================================================== Baleful Interdict (activities)
// Place Seal (Bonus Action / Action): range check, seal through the Nix Fix engine, boons.
async function placeSealRange({workflow}) {
    const t = firstTarget(workflow);
    if (!t) return;
    const range = Number(cfgOf(workflow.actor)?.range) || (hasUnfettered(workflow.actor) ? 60 : 30);
    const me = wfToken(workflow);
    if (me && U().tokenUtils.getDistance(toDoc(me), toDoc(t)) > range) {
        ui.notifications.info('Baleful Interdict: the target must be within ' + range + ' ft.');
        return true;
    }
}
async function placeSealUse({workflow}) {
    const t = firstTarget(workflow);
    if (!t?.actor) return;
    // The activity already spent its use: place for free.
    const n = await placeSeal(workflow.actor, t, 1, {free: true});
    if (!n) return;
    await offerBoons(workflow.actor, t, {bonus: workflow.activity?.activation?.type === 'bonus'});
}
// Move Seals: every seal of his on a dead or unconscious creature moves to the target.
async function moveSealsUse({workflow}) {
    const t = firstTarget(workflow);
    if (!t?.actor) return;
    const pick = async list => {
        const r = await U().dialogUtils.selectTargetDialog(workflow.item.name, 'Move the seals from which creature?', list.map(toDoc),
            {skipDeadAndUnconscious: false, userId: firstOwner(workflow.actor)});
        return r?.result ? toObj(r.result) : null;
    };
    if (await moveSeals(workflow.actor, t, {pick})) await offerBoons(workflow.actor, t, {bonus: true});
}
// Burn Seals (Fire / Necrotic): opens the engine's burn dialog instead of the fixed roll.
async function burnSealsUse({workflow}) {
    const tokens = Array.from(workflow.targets ?? []);
    setTimeout(() => promptBurn(workflow.actor, tokens, {title: workflow.item.name}).catch(err => console.error(TITLE + ' | burn', err)), 50);
    return true;   // cancel the activity's own damage roll (it consumes nothing)
}

// ======================================================== Infernal Conduit
// Harm: the target takes (@scaling)d10 necrotic and he heals that much. Heal: the target
// regains it and he takes that much. 5 ft (30 ft with Unfettered). At 0 HP after Heal he is stable.
async function conduitRange({workflow}) {
    const t = firstTarget(workflow);
    const me = wfToken(workflow);
    if (!t || !me) return;
    const max = hasUnfettered(workflow.actor) ? 30 : 5;
    if (U().tokenUtils.getDistance(toDoc(me), toDoc(t)) > max) {
        ui.notifications.info(workflow.item.name + ': the target must be within ' + max + ' ft.');
        return true;
    }
}
async function conduitUse({workflow}) {
    const me = wfToken(workflow);
    const t = firstTarget(workflow);
    if (!me || !t?.actor) return;
    const types = U().workflowUtils.getDamageTypes(workflow.damageRolls ?? []);
    const healing = types.has('healing') || types.has('temphp');
    const d = (workflow.damageList ?? []).find(x => x.actorUuid === t.actor.uuid || x.tokenUuid === t.document.uuid);
    const amount = Math.abs(Number(d?.hpDamage ?? 0) + Number(d?.tempDamage ?? 0)) || Math.abs(Number(d?.totalDamage ?? 0));
    if (!amount) return;
    await U().workflowUtils.applyDamage([toDoc(me)], amount, healing ? 'none' : 'healing');
    if (healing && workflow.actor.system.attributes.hp.value <= 0) await U().documentUtils.update(workflow.actor, {'system.attributes.death.success': 3});
}

// ======================================================== Terrorizing Force
const TF_TYPES = ['cold', 'fire', 'necrotic', 'poison'];
export function terrorizingType(item) {
    const flag = item.flags?.[MODULE_ID]?.terrorizingForce?.damageType ?? item.flags?.['chris-premades']?.terrorizingForce?.damageType;
    if (TF_TYPES.includes(flag)) return flag;
    const m = /terrorizing force\s*[:(]\s*(cold|fire|necrotic|poison)/i.exec(item.name);
    return m ? m[1].toLowerCase() : 'fire';
}
async function terrorizingDamage({document: item, workflow}) {
    if (!workflow.hitTargets?.size || !U().workflowUtils.isAttackType(workflow, 'weaponAttack')) return;
    const im = workflow.actor.effects.some(e => ident(e) === 'infernalMajestyEffect' && !e.disabled);
    await U().workflowUtils.bonusDamage(workflow, im ? '2d8' : '1d8', {damageType: terrorizingType(item)});
}
async function terrorizingPick({workflow}) {
    if (/terrorizing force\s*[:(]\s*(cold|fire|necrotic|poison)/i.test(workflow.item.name)) return;   // the D&D Beyond item names its type
    const type = await U().dialogUtils.selectDamageType(TF_TYPES, workflow.item.name, 'Damage type for Terrorizing Force?');
    if (type) await U().documentUtils.setFlag(workflow.item, MODULE_ID, 'terrorizingForce.damageType', type);
}

// ======================================================== Forked Tongue
async function forkedTongue({workflow}) {
    const actor = workflow.actor;
    const levels = actor.classes?.[cfgOf(actor)?.classId || 'illrigger']?.system?.levels ?? 1;
    const old = actor.effects.find(e => ident(e) === 'forkedTongueEffect');
    const prev = (old?.system?.changes ?? old?.changes ?? []).filter(c => c.key === 'system.traits.languages.value').map(c => c.value);
    const known = Array.from(actor.system.traits.languages.value ?? []).filter(l => !prev.includes(l));
    const all = [];
    const walk = (obj) => { for (const [k, v] of Object.entries(obj ?? {})) { if (typeof v === 'string') all.push([k, v]); else if (v?.label) { all.push([k, v.label]); walk(v.children); } } };
    walk(CONFIG.DND5E.languages);
    const max = levels >= 9 ? 3 : 2;
    const opts = all.filter(([k]) => !known.includes(k));
    const content = '<p>Pick up to ' + max + ' languages.</p><div style="columns:2">' + opts.map(([k, l]) =>
        '<label style="display:block"><input type="checkbox" name="' + esc(k) + '"' + (prev.includes(k) ? ' checked' : '') + '> ' + esc(game.i18n.localize(l)) + '</label>').join('') + '</div>';
    const picked = await foundry.applications.api.DialogV2.wait({window: {title: workflow.item.name}, rejectClose: false, content,
        buttons: [{action: 'ok', label: 'OK', default: true, callback: (ev, button) => opts.map(([k]) => k).filter(k => button.form.elements[k]?.checked).slice(0, max)},
            {action: 'cancel', label: 'Cancel', callback: () => null}]});
    if (!Array.isArray(picked)) return;
    if (old) await U().documentUtils.deleteDocument(old);
    await U().effectUtils.createEffects(actor, [fx({name: workflow.item.name, img: workflow.item.img, origin: workflow.item.uuid,
        changes: picked.map(k => ({key: 'system.traits.languages.value', mode: 2, value: k, priority: 20})),
        flags: {cat: {identifier: 'forkedTongueEffect'}}})]);
}

// ======================================================== saves: Blood Price, Inexorable
async function bloodPrice({document: item, actor, token, roll}) {
    const target = roll?.options?.target;
    if (!target || roll.total >= target) return;
    // The boss kits' combined "Legendary Resistance (Blood Price)" prompt handles bosses.
    if (actor.items.some(i => i.flags?.[MODULE_ID]?.bloodPriceLegendary || /^legendary resistance \(blood price\)/i.test(i.name))) return;
    const sel = await U().dialogUtils.selectHitDie(actor, item.name + ': ' + roll.total + ' against DC ' + target + '. Spend a Hit Die?', '', {max: 1, userId: firstOwner(actor)});
    const pick = Array.isArray(sel) ? sel.find(s => s.amount > 0) : null;
    if (!pick?.document) return;
    await U().documentUtils.update(pick.document, {'system.hd.spent': (pick.document.system.hd.spent ?? 0) + 1});
    const newRoll = await U().rollUtils.addToRoll(roll, '1' + pick.document.system.hd.denomination);
    const bled = newRoll.total - roll.total;
    if (actor.effects.some(e => ident(e) === 'infernalMajestyEffect') && token) {
        const foes = U().tokenUtils.findNearby(toDoc(token), 10, {disposition: 'enemy', includeIncapacitated: true}).filter(t => U().tokenUtils.canSee(toObj(token), t.object));
        const foe = foes.length > 1
            ? (await U().dialogUtils.selectTargetDialog('Infernal Majesty', 'Blood Price: which creature takes ' + bled + ' damage?', foes, {skipDeadAndUnconscious: false, userId: firstOwner(actor)}))?.result
            : foes[0];
        if (foe) await U().workflowUtils.applyDamage([foe], bled, 'none');
    }
    return newRoll;
}
async function inexorable({token, roll}) {
    if (!token) return;
    const n = U().tokenUtils.findNearby(toDoc(token), 5, {disposition: 'enemy', includeIncapacitated: true}).length;
    if (!n) return;
    return U().rollUtils.addToRoll(roll, String(Math.min(n, 5)));
}

// ======================================================== bosses: Blood Price + Legendary Resistance (one prompt)
// On the boss kits' "Legendary Resistance (Blood Price)" item (Dracula; the lieutenants in step 5). The v13
// kits pasted this as a Chris's Premades 1 embedded macro. On a failed save with a DC, one prompt:
//  - Blood Price (when he has it): spend a Hit Die and add it;
//  - Legendary Resistance: succeed, and bleed floor(spell level / 2) d10 (1st none, 2nd 1d10, 4th 2d10,
//    7th 3d10). No spell level (not a spell, or the source can't be read): no bleed;
//  - accept the failure.
// In Infernal Majesty the hit points spent also hit the nearest enemy within 10 ft he can see.
export const bleedDice = level => (level === null || level === undefined || !Number.isFinite(Number(level))) ? 0 : Math.max(0, Math.floor(Number(level) / 2));
function saveSourceSpellLevel(config, options) {
    const mo = config?.midiOptions ?? options?.midiOptions ?? {};
    const uuid = mo.saveItemUuid ?? mo.itemUuid ?? options?.saveItemUuid ?? config?.saveItemUuid;
    if (!uuid) return null;
    let wf;
    try { wf = globalThis.MidiQOL?.Workflow?.getWorkflow?.(uuid); } catch { wf = undefined; }
    let doc = wf?.item;
    if (!doc) { try { doc = fromUuidSync(uuid); } catch { doc = undefined; } }
    const item = doc?.documentName === 'Item' ? doc : doc?.item;
    if (!item || item.type !== 'spell') return null;
    const cast = Number(wf?.castData?.castLevel ?? item.system.level);
    return Number.isFinite(cast) ? cast : item.system.level;
}
const isLegendaryResistance = i => !!i?.flags?.[MODULE_ID]?.legendaryResistance || /^legendary resistance \(blood price\)/i.test(i?.name ?? '');
async function bloodPriceLegendary({document: item, actor, token, roll, config, options}) {
    const dc = roll?.options?.target ?? config?.target;
    if (!roll || !dc || roll.total >= dc) return;
    const lr = isLegendaryResistance(item) ? item : actor.items.find(isLegendaryResistance);
    // NPC stat block (tool "Make stat block"): Legendary Resistance is the native pips
    // (system.resources.legres) and Hit Dice are the actor's (system.attributes.hd: spent on the
    // actor, die from the largest class die, else the NPC's own). Character: the item's uses and
    // the class items' Hit Dice.
    const npc = actor.type === 'npc' && !!actor.system?.resources?.legres?.max;
    const lrLeft = npc ? (actor.system.resources.legres.value ?? 0) : (lr?.system?.uses?.value ?? 0);
    const hasPrice = !!byIdent(actor, 'bloodPrice', /^blood price$/i);
    const dieNum = c => parseInt(String(c?.system?.hd?.denomination ?? '').replace(/^d/i, '')) || 0;
    const classes = actor.items.filter(i => i.type === 'class').sort((a, b) => dieNum(b) - dieNum(a));
    const npcHd = actor.system?.attributes?.hd;
    const cls = !hasPrice ? null : npc
        ? ((npcHd?.value ?? 0) > 0 ? {npc: true, system: {hd: {denomination: 'd' + (dieNum(classes[0]) || Number(npcHd.denomination) || 8)}}} : null)
        : classes.filter(i => (i.system.levels - (i.system.hd?.spent ?? 0)) > 0)[0] ?? null;
    if (!cls && !lrLeft) return;
    const die = cls?.system.hd?.denomination ?? 'd10';
    const level = saveSourceSpellLevel(config, options);
    const n = bleedDice(level);
    const buttons = [];
    if (cls) buttons.push(['Blood Price: spend a Hit Die, +1' + die, 'price']);
    if (lrLeft) buttons.push(['Legendary Resistance (' + lrLeft + ' left): succeed, ' + (level === null ? 'no spell level' : 'level ' + level + ' spell')
        + ': ' + (n ? 'bleed ' + n + 'd10' : 'no bleed'), 'legend']);
    buttons.push(['Accept the failure', 'none']);
    const pick = await U().dialogUtils.buttonDialog('Blood Price', esc(actor.name) + ' failed a saving throw: ' + roll.total + ' against DC ' + dc + '.', buttons, {userId: firstOwner(actor)});
    if (!pick || pick === 'none' || (pick === 'price' && !cls) || (pick === 'legend' && !lrLeft)) return;
    const tok = token ? toObj(token) : tokenOf(actor);
    const imOn = actor.effects.some(e => ident(e) === 'infernalMajestyEffect' && !e.disabled);
    const aura = async amount => {
        if (!imOn || !tok || !(amount > 0)) return;
        const me = toDoc(tok);
        const foes = U().tokenUtils.findNearby(me, 10, {disposition: 'enemy', includeIncapacitated: true})
            .filter(t => U().tokenUtils.canSee(tok, t.object ?? t))
            .sort((a, b) => U().tokenUtils.getDistance(me, a) - U().tokenUtils.getDistance(me, b));
        if (!foes.length) return;
        await U().workflowUtils.applyDamage([foes[0]], amount, 'none');
        await say(actor, '<b>Infernal Majesty:</b> the spilled blood lashes ' + esc(foes[0].name) + ' for ' + amount + '.');
    };
    if (pick === 'price') {
        if (cls.npc) await U().documentUtils.update(actor, {'system.attributes.hd.spent': (actor.system.attributes.hd.spent ?? 0) + 1});
        else await U().documentUtils.update(cls, {'system.hd.spent': (cls.system.hd.spent ?? 0) + 1});
        const newRoll = await U().rollUtils.addToRoll(roll, '1' + die);
        const bled = newRoll.total - roll.total;
        await say(actor, '<b>Blood Price:</b> ' + esc(actor.name) + ' spends a Hit Die: +' + bled + ' (' + newRoll.total + ').');
        await aura(bled);
        return newRoll;
    }
    if (npc) await U().documentUtils.update(actor, {'system.resources.legres.spent': (actor.system.resources.legres.spent ?? 0) + 1});
    else await U().documentUtils.update(lr, {'system.uses.spent': (lr.system.uses.spent ?? 0) + 1});
    const bleed = n ? (await new Roll(n + 'd10').evaluate()).total : 0;
    await say(actor, '<b>Legendary Resistance (Blood Price):</b> ' + esc(actor.name) + ' succeeds instead'
        + (bleed ? ' and bleeds ' + bleed + ' hit points (' + n + 'd10).' : ' without bleeding.'));
    const newRoll = await U().rollUtils.addToRoll(roll, String(dc - roll.total));
    // After the save resolves: the bleed is real damage to him (and the Infernal Majesty lash).
    if (bleed) setTimeout(() => (async () => { await actor.applyDamage(bleed); await aura(bleed); })().catch(err => console.error(TITLE + ' | Blood Price bleed', err)), 50);
    return newRoll;
}

// ======================================================== Combat Mastery: Lies
async function lies({document: item, workflow}) {
    const base = workflow.item?.system?.type?.baseItem;
    if (!base || workflow.activity?.type !== 'attack') return;
    const want = item.flags?.[MODULE_ID]?.weaponType ?? item.flags?.['chris-premades']?.config?.weaponType ?? 'battleaxe';
    if (base !== want) return;
    const data = workflow.activity.toObject();
    foundry.utils.setProperty(data, 'attack.ability', 'cha');
    U().workflowUtils.setActivity(workflow, data);
}

// ======================================================== Infernal Majesty
async function infernalMajesty({workflow}) {
    const item = workflow.item, actor = workflow.actor;
    // The activity may have applied the item's effect itself; tag it, else create it.
    const applied = actor.effects.find(e => !e.transfer && e.origin && (e.origin === item.uuid || e.origin.startsWith(item.uuid + '.')) && ident(e) !== 'infernalMajestyEffect'
        && item.effects.some(s => s.name === e.name));
    if (applied) return U().documentUtils.update(applied, {'flags.cat.identifier': 'infernalMajestyEffect'});
    if (actor.effects.some(e => ident(e) === 'infernalMajestyEffect')) return;
    const src = item.effects.find(e => !e.transfer) ?? item.effects.contents[0];
    if (!src) return;
    const data = src.toObject();
    delete data._id;
    data.transfer = false;
    data.origin = item.uuid;
    data.duration = U().activityUtils?.getEffectDuration?.(workflow.activity) ?? {value: 60, units: 'seconds'};
    foundry.utils.setProperty(data, 'flags.cat.identifier', 'infernalMajestyEffect');
    await U().effectUtils.createEffects(actor, [data]);
}
// At 0 HP with Infernal Majesty on: offer its Death activity (the GM decides), then hide the token.
async function infernalMajestyDeath(actor) {
    const eff = actor.effects.find(e => ident(e) === 'infernalMajestyEffect');
    if (!eff) return;
    const item = byIdent(actor, 'infernalMajesty', /^infernal majesty/i);
    if (!item) return;
    if (!await U().dialogUtils.confirm(item.name, actor.name + ' drops to 0 HP in Infernal Majesty. Use its death burst?', {userId: firstOwner(actor)})) return;
    const act = item.system.activities.find(a => a.identifier === 'death' || /death|explo|burst/i.test(a.name ?? ''))
        ?? item.system.activities.find(a => a.activation?.type !== 'bonus' && a.id !== item.system.activities.contents[0]?.id);
    if (act) await U().workflowUtils.syntheticActivityRoll(act, [], {consumeUsage: false, consumeResources: false, spellSlot: false});
    const tok = tokenOf(actor);
    if (tok) await U().documentUtils.update(tok.document, {hidden: true});
}

// ======================================================== Interdict Boons
async function styxTurnStart({document: effect}) { if (inCombat() && effect.parent) await U().actorUtils.setReactionUsed(effect.parent); }
async function styxTurnEnd({document: effect}) { if (effect.parent) await globalThis.MidiQOL?.removeReactionUsed?.(effect.parent); }
async function dissOnslaught({workflow}) {
    if (!workflow.targets?.size) return;
    await featureAttack(workflow.actor, workflow.item, workflow.targets, workflow.item.name);
}
// 1.7.1: one prompt. The weapon is picked for you (ranged first, one that reaches); asked only if several fit.
async function vengefulShot({workflow}) {
    if (!workflow.targets?.size) return;
    const actor = workflow.actor, t = firstTarget(workflow), me = wfToken(workflow);
    const list = equippedWeapons(actor).filter(i => i.system.activities?.some?.(a => a.type === 'attack'));
    if (!list.length) return;
    const reach = w => { const r = w.system.range ?? {}; return Math.max(Number(r.long) || 0, Number(r.value) || 0, Number(r.reach) || 0, w.system.properties?.has?.('rch') ? 10 : 5); };
    const d = me && t ? U().tokenUtils.getDistance(toDoc(me), toDoc(t)) : 0;
    const fits = list.filter(w => reach(w) >= d);
    const ranged = fits.filter(w => /R$/.test(w.system.type?.value ?? '') || w.system.properties?.has?.('thr'));
    const pool = ranged.length ? ranged : (fits.length ? fits : list);
    let w = pool[0];
    if (pool.length > 1) {
        const id = await U().dialogUtils.buttonDialog(workflow.item.name, 'Which weapon?', pool.map(i => [i.name, i.id]), {userId: firstOwner(actor)});
        w = actor.items.get(id);
        if (!w) return;
    }
    return U().workflowUtils.specialItemUse(w, Array.from(workflow.targets).map(toDoc), workflow.item, {consumeUsage: true, consumeResources: true});
}
async function impalingShot({document: item, workflow}) {
    if (!workflow.hitTargets?.size || !U().workflowUtils.isAttackType(workflow, 'rangedWeaponAttack')) return;
    const t = workflow.hitTargets.first();
    if (!t?.actor || !(sealsOf(t.actor, workflow.actor).length > 0)) return;
    const act = item.system.activities.find(a => a.identifier === 'use') ?? item.system.activities.contents[0];
    if (!act || !canUse(item)) return;
    if (!await U().dialogUtils.confirm(item.name, 'Use ' + esc(item.name) + ' on ' + esc(t.document.name) + '?', {userId: firstOwner(workflow.actor)})) return;
    await U().workflowUtils.syntheticActivityRoll(act, Array.from(workflow.hitTargets).map(toDoc), {consumeUsage: true, consumeResources: true, spellSlot: false});
}
async function brimstoneStep({workflow}) {
    const me = wfToken(workflow);
    if (me) await teleport(me, {range: 60, animation: 'mistyStep'});
}

// ======================================================== Painkiller
async function devastator({workflow}) {
    const me = wfToken(workflow);
    if (!me || !workflow.targets?.size) return;
    const enemies = Array.from(workflow.targets).filter(t => t.document.disposition !== me.document.disposition);
    const allies = Array.from(workflow.targets).filter(t => t.id !== me.id && t.document.disposition === me.document.disposition);
    if (enemies.length !== 1 || allies.length > (workflow.actor.system.attributes.prof ?? 0)) {
        ui.notifications.info('Devastator: target one enemy and up to your proficiency bonus in allies.');
        return;
    }
    await featureAttack(workflow.actor, workflow.item, [enemies[0]], workflow.item.name);
    const src = workflow.item.effects.contents[0];
    if (!src || !allies.length) return;
    const data = src.toObject();
    delete data._id;
    data.transfer = false;
    data.origin = src.uuid;
    data.duration = {value: 1, units: 'turns'};
    for (const a of allies) await U().effectUtils.createEffects(a.actor, [data]);
}
// You Die on My Command!: an ally (or himself) within 30 ft he can see would drop to 0 HP.
async function youDieOnMyCommand({document: item, workflow, ditem, targetToken}) {
    const owner = item.actor;
    const mine = tokenOf(owner);
    if (!mine || !targetToken?.actor || !ditem) return;
    if (targetToken.disposition !== mine.document.disposition) return;
    if (!(ditem.oldHP > 0) || ditem.newHP !== 0) return;
    if (workflow?.hitTargets && !Array.from(workflow.hitTargets).some(t => t.document?.uuid === targetToken.uuid) && workflow.activity?.type === 'attack') return;
    if (inCombat() && U().actorUtils.hasUsedReaction(owner)) return;
    if (U().tokenUtils.getDistance(targetToken, mine.document) > 30) return;
    if (targetToken.id !== mine.id && !U().tokenUtils.canSee(mine, targetToken.object)) return;
    if (!canUse(item)) return;
    const ok = await U().dialogUtils.confirm(item.name, esc(targetToken.name) + ' would drop to 0 HP. Use ' + esc(item.name) + '?', {userId: firstOwner(owner)});
    if (!ok) return;
    const act = item.system.activities.contents[0];
    if (act) await U().workflowUtils.syntheticActivityRoll(act, [targetToken], {consumeUsage: true, consumeResources: true, spellSlot: false});
    U().workflowUtils.preventZeroHP(ditem);
}
// Telekinetic Seal: on a failed save, push 15 ft or knock Prone. CPR1 split it into a push and a prone
// activity (identifiers 'push' / 'prone'); the D&D Beyond bundle has one save activity, so it asks.
async function telekineticSeal({workflow}) {
    const me = wfToken(workflow);
    const t = workflow.failedSaves?.first?.();
    if (!me || !t?.actor) return;
    let how = workflow.activity?.identifier;
    if (how !== 'push' && how !== 'prone') how = await U().dialogUtils.buttonDialog(workflow.item.name, esc(t.document.name) + ' failed the save.',
        [['Push 15 ft', 'push'], ['Knock Prone', 'prone']], {userId: firstOwner(workflow.actor)});
    if (how === 'push') await U().tokenUtils.slideToken(toDoc(t), {sourceToken: toDoc(me), distance: 15});
    else if (how === 'prone' && !t.actor.statuses.has('prone')) await t.actor.toggleStatusEffect('prone', {active: true});
}
// Dispater's Supremacy: attacks against a creature carrying a seal get the item's effect (1 s).
async function dispatersSupremacy({document: item, workflow}) {
    const t = firstTarget(workflow);
    if (!t?.actor || !U().workflowUtils.isAttackType(workflow, 'attack')) return;
    if (!t.actor.effects.some(e => ident(e) === 'balefulInterdictEffect' || e.flags?.[MODULE_ID]?.seal)) return;
    const src = item.effects.contents[0];
    if (!src) return;
    const data = src.toObject();
    delete data._id;
    data.transfer = false;
    data.origin = src.uuid;
    data.duration = {value: 1, units: 'seconds'};
    await U().effectUtils.createEffects(t.actor, [data]);
}
// Punishment: a creature hits him and deals damage -> reaction, that much damage back.
async function punishment({document: item, workflow}) {
    const owner = item.actor;
    if (!workflow.hitTargets?.size || !workflow.token || !U().workflowUtils.isAttackType(workflow, 'attack')) return;
    if (!Array.from(workflow.hitTargets).some(t => t.actor?.uuid === owner.uuid)) return;
    if ((inCombat() && U().actorUtils.hasUsedReaction(owner)) || !canUse(item)) return;
    const took = (workflow.damageList ?? []).find(d => d.actorUuid === owner.uuid && d.totalDamage > 0);
    if (!took) return;
    if (!await U().dialogUtils.confirm(item.name, 'Use ' + esc(item.name) + ' on ' + esc(workflow.token.document.name) + ' (' + took.totalDamage + ' damage)?', {userId: firstOwner(owner)})) return;
    const act = item.system.activities.find(a => a.identifier === 'use') ?? item.system.activities.contents[0];
    if (!act) return;
    const data = act.toObject();
    if (data.damage?.parts?.[0]) data.damage.parts[0].bonus = String(took.totalDamage);
    await U().workflowUtils.syntheticActivityDataRoll(data, item, [toDoc(workflow.token)], {consumeUsage: true, consumeResources: true, spellSlot: false});
}

// ======================================================== registration
// Each entry becomes one function macro. Passes named activity... go on the activity that runs them
// (an item-level ref would fire for every activity of a D&D Beyond multi-activity bundle);
// actor.../target.../scene... passes go on the item; combat passes on an effect.
export const MACROS = {
    balefulInterdictPlaceSeal: {roll: [{pass: 'activityPreambleComplete', macro: placeSealRange, priority: 50}, {pass: 'activityRollFinished', macro: placeSealUse, priority: 50}]},
    balefulInterdictMove: {roll: [{pass: 'activityRollFinished', macro: moveSealsUse, priority: 50}]},
    balefulInterdictBurn: {roll: [{pass: 'activityPreItemRoll', macro: burnSealsUse, priority: 50}]},
    infernalConduit: {roll: [{pass: 'activityPreambleComplete', macro: conduitRange, priority: 50}, {pass: 'activityRollFinished', macro: conduitUse, priority: 50}]},
    terrorizingForce: {roll: [{pass: 'actorDamageRollBonuses', macro: terrorizingDamage, priority: 50}]},
    terrorizingForcePick: {roll: [{pass: 'activityRollFinished', macro: terrorizingPick, priority: 50}]},
    forkedTongue: {roll: [{pass: 'activityRollFinished', macro: forkedTongue, priority: 50}]},
    bloodPrice: {save: [{pass: 'actorBonus', macro: bloodPrice, priority: 50}]},
    combatMasteryInexorable: {save: [{pass: 'actorBonus', macro: inexorable, priority: 45}]},
    bloodPriceLegendary: {save: [{pass: 'actorBonus', macro: bloodPriceLegendary, priority: 50}]},
    combatMasteryLies: {roll: [{pass: 'actorPreambleComplete', macro: lies, priority: 25}]},
    infernalMajesty: {roll: [{pass: 'activityRollFinished', macro: infernalMajesty, priority: 50}]},
    interdictBoonStyxsApathyEffect: {combat: [{pass: 'actorTurnStart', macro: styxTurnStart, priority: 50}, {pass: 'actorTurnEnd', macro: styxTurnEnd, priority: 50}]},
    interdictBoonDissOnslaught: {roll: [{pass: 'activityRollFinished', macro: dissOnslaught, priority: 50}]},
    interdictBoonVengefulShot: {roll: [{pass: 'activityRollFinished', macro: vengefulShot, priority: 50}]},
    interdictBoonImpalingShot: {roll: [{pass: 'actorRollFinished', macro: impalingShot, priority: 275}]},
    interdictBoonFlashOfBrimstone: {roll: [{pass: 'activityRollFinished', macro: brimstoneStep, priority: 50}]},
    interdictBoonConflagrantChannel: {roll: [{pass: 'activityRollFinished', macro: brimstoneStep, priority: 50}]},
    devastator: {roll: [{pass: 'activityRollFinished', macro: devastator, priority: 50}]},
    youDieOnMyCommand: {roll: [{pass: 'sceneDamageComplete', macro: youDieOnMyCommand, priority: 100}]},
    telekineticSeal: {roll: [{pass: 'activityRollFinished', macro: telekineticSeal, priority: 50}]},
    dispatersSupremacy: {roll: [{pass: 'actorPreambleComplete', macro: dispatersSupremacy, priority: 50}]},
    punishment: {roll: [{pass: 'targetRollFinished', macro: punishment, priority: 100}]}
};
// The reference an item / activity / effect carries: {type: [{source, identifier, rules}]}.
export function refFor(identifier) {
    const m = MACROS[identifier];
    if (!m) return null;
    return Object.fromEntries(Object.keys(m).map(type => [type, [{source: SOURCE, identifier, rules: RULES}]]));
}

let registered = false;
export function registerIllriggerFeatures() {
    if (registered || !globalThis.cat?.api) return false;
    const api = cat.api;
    api.registerSourceName?.(SOURCE, TITLE);
    for (const [identifier, triggers] of Object.entries(MACROS)) {
        api.registerFnMacro({source: SOURCE, identifier, rules: RULES, label: 'Nix Fix: ' + identifier, ...triggers});
    }
    // Infernal Majesty's death burst (CAT has no "death" event): the active GM watches HP.
    Hooks.on('updateActor', (actor, changed) => {
        if (!game.user.isGM || (game.users.activeGM && game.users.activeGM.id !== game.user.id)) return;
        if (foundry.utils.getProperty(changed, 'system.attributes.hp.value') !== 0) return;
        infernalMajestyDeath(actor).catch(err => console.error(TITLE + ' | Infernal Majesty death', err));
    });
    registered = true;
    return true;
}
