// =====================================================================
//  NOX FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Nox selected, as GM).
//  Safe to re-run: it replaces what it wrote.
//
//  CAT embedded macros for:
//   - Uncanny Metabolism: asked when he rolls initiative (combat / actorPreInitiative)
//   - Self-Restoration: end-of-turn pop-up to end Charmed / Frightened / Poisoned
//   - Giant-Eel Scarf: advantage vs physical grapples and restraints (not spells)
//   - Sentinel (2024): Guardian + Halt (same as Quez: nearbyRollFinished, enemies within 5 ft)
//   - Flurry of Blows: roll / activityRollFinished / 10 on the Flurry activity. Strikes go to his
//     target, are split between several targets, or (no target) to hostile creatures he picks
//     within 65 ft; one dice window per strike (attack d20 + damage die), like Eldritch Blast.
//     Chris's Premades 2's generic extraAttack on that activity gets its prompt switched off.
//  Retired on v14 (Chris's Premades 2 does it): Unarmed Strike (Martial Arts die,
//  Dex, Force via Martial Arts + Empowered Strikes), Deflect Attacks (spends the reaction).
//  Darkness (Shadow Arts) comes from the Darkness & Devil's Sight WORLD installer.
//  Removes the inert v13 copies (flags.chris-premades) of these macros.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Nox fixes (v14): select Nox\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
const findAll = re => actor.items.filter(i => re.test(i.name.trim()));
const run = fn => 'return await (' + fn.toString() + ')();';
const entry = (name, event, pass, priority, fn, extra = {}) => ({name, event, pass, macros: [{priority, macro: run(fn), ...extra}]});
async function setCat(doc, names, add) {
    const list = foundry.utils.deepClone(doc.flags?.cat?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.update({'flags.cat.embeddedMacros': list.concat(add)});
}
async function dropOld(item, names) {
    const cpr = item.flags?.['chris-premades'] ?? {};
    const upd = {};
    const old = cpr.embeddedMacros ?? [];
    if (old.some(m => names.includes(m.name))) upd['flags.chris-premades.embeddedMacros'] = old.filter(m => !names.includes(m.name));
    for (const [id, list] of Object.entries(cpr.embeddedActivityMacros ?? {})) {
        if (list?.some(m => names.includes(m.name))) upd['flags.chris-premades.embeddedActivityMacros.' + id] = list.filter(m => !names.includes(m.name));
    }
    if (Object.keys(upd).length) await item.update(upd);
}
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update(data);
    return actByName(item, name);
}
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
// Leftovers worth a look: CPR1 tags, duplicate items, v13 effects on the actor.
function whatsLeft(skip = /^$/) {
    const later = [];
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1' && !skip.test(i.name));
    if (cpr1.length) later.push('Still tagged for Chris\'s Premades 1 (does nothing on v14; re-apply in the Medkit if Chris\'s Premades 2 has it): ' + cpr1.map(i => i.name).join(', ') + '.');
    const dupes = Object.entries(actor.items.contents.reduce((m, i) => ((m[i.type + '|' + i.name] = (m[i.type + '|' + i.name] ?? 0) + 1), m), {}))
        .filter(([k, n]) => n > 1 && !k.startsWith('class|')).map(([k, n]) => k.split('|')[1] + ' x' + n);
    if (dupes.length) later.push('Duplicate items (check which to delete; an innate and a prepared copy of a spell can both be right): ' + dupes.join(', ') + '.');
    const legacy = actor.items.filter(i => i.type === 'spell' && /\(legacy\)\s*$/i.test(i.name));
    if (legacy.length) later.push('Legacy (2014) spells still on the sheet: ' + legacy.map(i => i.name).join(', ') + '.');
    const stale = actor.effects.filter(e => e.flags?.['chris-premades'] && !e.flags?.cat && !e.disabled);
    if (stale.length) later.push('Effects on the actor from Chris\'s Premades 1 (inert on v14): ' + stale.map(e => e.name).join(', ') + '. Delete them before testing.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
// =====================================================================
//  Macros
// =====================================================================
 
// ---- Uncanny Metabolism: combat / actorPreInitiative / 50 (on the feature) ------------------
// document = the feature. Asks only if it is unused and Focus isn't full.
const uncanny = async () => {
    const feat = document;
    const me = feat.parent;
    if (!me || (feat.system.uses?.max && !(feat.system.uses.value > 0))) return;
    const focus = me.items.find(i => /monk'?s focus|focus points|^ki( points)?$/i.test(i.name.trim()) && i.system.uses?.max);
    if (!focus || !((focus.system.uses.spent ?? 0) > 0)) return;
    const level = me.classes?.monk?.system.levels ?? 0;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const yes = await dialogUtils.confirm(feat.name, 'Rolling initiative with ' + focus.system.uses.value + '/' + focus.system.uses.max
        + ' Focus Points. Use ' + feat.name + ' to regain all Focus Points and heal Martial Arts die + ' + level + '?', {userId});
    if (!yes) return;
    const heal = feat.system.activities?.find(a => a.type === 'heal');
    const tok = actorUtils.getFirstToken(me)?.object;
    if (heal && tok) await workflowUtils.syntheticActivityRoll(heal, [tok], {consumeUsage: true, consumeResources: true});
    else {
        if (feat.system.uses?.max) await documentUtils.update(feat, {'system.uses.spent': (feat.system.uses.spent ?? 0) + 1});
        const die = me.system.scale?.monk?.['martial-arts']?.die ?? ('1d' + (level >= 17 ? 12 : level >= 11 ? 10 : level >= 5 ? 8 : 6));
        const r = await new Roll(die + ' + ' + level).evaluate();
        await r.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: feat.name + ': healing'});
        const hp = me.system.attributes.hp;
        await documentUtils.update(me, {'system.attributes.hp.value': Math.min(hp.max, hp.value + r.total)});
    }
    // The heal activity restores Focus through its own consumption; make sure it is full either way.
    const fresh = me.items.get(focus.id);
    if ((fresh?.system.uses?.spent ?? 0) > 0) await documentUtils.update(fresh, {'system.uses.spent': 0});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + feat.name + ':</b> ' + me.name + '\'s Focus Points are fully restored.'});
};
 
// ---- Self-Restoration: combat / actorTurnEnd / 50 -------------------------------------------
const selfRestore = async () => {
    const feat = document;
    const me = feat.parent;
    const CONDS = ['charmed', 'frightened', 'poisoned'];
    const has = CONDS.filter(s => me.statuses?.has(s));
    if (!has.length) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const label = s => { const e = CONFIG.statusEffects.find(x => x.id === s); return e?.name ? game.i18n.localize(e.name) : s; };
    const pick = await dialogUtils.buttonDialog(feat.name, 'End of your turn: use ' + feat.name + ' to end one condition?',
        has.map(s => ['End ' + label(s), s]).concat([['Not now', false]]), {userId});
    if (!pick) return;
    for (const e of me.effects.filter(e => e.statuses?.has(pick))) await documentUtils.deleteDocument(e);
    if (me.statuses?.has(pick)) await me.toggleStatusEffect(pick, {active: false});
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + feat.name + ':</b> ' + me.name + ' shakes off being ' + label(pick) + '.'});
};
 
// ---- Giant-Eel Scarf ----------------------------------------------------------------------
// save / actorSituational / 50: advantage on saves against a physical grapple or restraint.
const scarfSave = async () => {
    const scarf = document;
    if (scarf.system.attunement && !scarf.system.attuned) return;
    const src = workflowUtils.getSaveSource(config)?.item;
    if (!src || src.type === 'spell' || src.system?.type?.value === 'spellFeature') return;
    const BIND = /grappl|restrain/i;
    const texts = [src.name, String(src.system?.description?.value ?? '')];
    for (const e of src.effects?.contents ?? []) { texts.push(e.name); for (const s of e.statuses ?? []) texts.push(s); }
    for (const a of src.system?.activities?.contents ?? []) texts.push(a.name);
    if (texts.some(t => BIND.test(t))) options.advantage = true;
};
// skill + check / actorSituational / 50: advantage on Athletics / Acrobatics / Str / Dex to escape.
const scarfEscape = async () => {
    const scarf = document;
    if (scarf.system.attunement && !scarf.system.attuned) return;
    const me = scarf.parent;
    const id = (typeof skillId !== 'undefined' && skillId) || (typeof checkId !== 'undefined' && checkId);
    if (!['ath', 'acr', 'str', 'dex'].includes(id)) return;
    const binds = me.effects.filter(e => !e.disabled && (e.statuses?.has('grappled') || e.statuses?.has('restrained')));
    if (!binds.length) return;
    const physical = binds.some(e => {
        const o = e.origin ? fromUuidSync(e.origin, {strict: false}) : null;
        const it = o?.documentName === 'Item' ? o : o?.parent?.documentName === 'Item' ? o.parent : null;
        return !it || (it.type !== 'spell' && it.system?.type?.value !== 'spellFeature');
    });
    if (physical) options.advantage = true;
};
 
// ---- Sentinel: roll / nearbyRollFinished / 50 (enemies within 5 ft, filtered by CAT) ----
const sentinel = async () => {
    const feat = document;
    const me = feat.parent;
    const mine = actorUtils.getFirstToken(me);
    const foe = workflow.token;
    if (!mine || !foe || !workflow.actor || workflow.actor.uuid === me.uuid) return;
    if (!workflow.activity?.hasAttack && !workflowUtils.isAttackType(workflow, 'attack')) return;
    if (foe.document.disposition === mine.disposition) return;
    const others = Array.from(workflow.hitTargets ?? []).filter(t => t.id !== mine.id);
    if (!others.length) return;
    if (tokenUtils.getDistance(mine, foe.document) > 5) return;
    const inCombat = !!game.combat?.started;
    if (inCombat && actorUtils.hasUsedReaction(me)) return;
    if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(s => me.statuses?.has(s))) return;
    let weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack')
        && ['simpleM', 'martialM'].includes(i.system.type?.value));
    if (!weapons.length) weapons = me.items.filter(i => i.type === 'weapon' && (i.system.equipped || /^unarmed strike/i.test(i.name)) && i.system.activities?.some(a => a.type === 'attack'));
    if (!weapons.length) return;
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const text = foe.document.name + ' hit ' + others.map(t => t.document.name).join(', ') + ' right next to you. Use your reaction to make an Opportunity Attack against it?';
    let weapon;
    if (weapons.length === 1) {
        if (!await dialogUtils.confirm(feat.name + ': Guardian', text, {userId})) return;
        weapon = weapons[0];
    } else {
        weapon = await dialogUtils.selectDocumentDialog(feat.name + ': Guardian', text + ' Choose a weapon (or Cancel).', weapons, {userId});
        if (!weapon) return;
    }
    const activity = weapon.system.activities.find(a => a.type === 'attack');
    if (inCombat) await actorUtils.setReactionUsed(me);
    setTimeout(async () => {
        const wf = await workflowUtils.syntheticActivityRoll(activity, [foe], {options: {workflowOptions: {nixSentinel: true}}});
        const hit = wf?.hitTargets?.size ? wf.hitTargets.first() : null;
        if (hit?.actor) await effectUtils.createEffects(hit.actor, [{
            name: 'Sentinel: Halted', img: feat.img, origin: feat.uuid,
            duration: {value: 1, units: 'rounds', expiry: 'turnEnd'},
            description: 'Speed 0 for the rest of the current turn.',
            system: {changes: ['walk', 'fly', 'swim', 'climb', 'burrow'].map(k => ({key: 'system.attributes.movement.' + k, type: 'override', value: '0', priority: 60}))}
        }]);
    }, 300);
};
 
// ---- Flurry of Blows: roll / activityRollFinished / 10 (on the Flurry activity) ----------------
const flurry = async () => {
    // FLURRY OF BLOWS: target-aware strikes with dice windows (Nix Fix, Foundry v14 / CAT)
    // 1. One hostile target selected: every strike goes to it.
    //    Two or more: a pop-up splits the strikes between them.
    //    None: a pop-up lists the hostile creatures within 65 ft (he can move between them).
    // 2. One dice window per strike opens, all at once, headed
    //    "[Target] Strike 1/3: 1d20 + mod + prof | Damage: 1dX + mod" (attack d20 + damage die).
    //    If Midi needs one more die (unexpected advantage, a crit), a small box asks.
    // 3. Each strike resolves through Midi as a normal Unarmed Strike with those dice.
    //    A target out of reach: "move next to it, then Strike". A target that drops:
    //    the strikes left can go to another hostile creature within 65 ft.
    const V14 = true;
    const RANGE = 65;                                                 // ft, for the picker
    const ANIMATE = true;                                             // Chris's Premades' flurry animation (JB2A Patreon)
    const DialogV2 = foundry.applications.api.DialogV2;
    const feature = workflow.item;
    const me = workflow.actor;
    const monk = workflow.token;                                      // Token placeable
    const act = workflow.activity;
    if (!me || !monk || !act || act.type === 'attack') return;
    const safe = (fn, d) => { try { return fn() ?? d; } catch { return d; } };
    const actId = safe(() => V14 ? documentUtils.getIdentifier(act) : activityUtils.getIdentifier(act), '');
    const isFlurry = ['flurryOfBlows', 'flurry-of-blows'].includes(actId) || /flurry of blows/i.test(act.name ?? '')
        || /^flurry of blows/i.test(feature.name.trim());
    if (!isFlurry) return;

    // ---- Strikes and the Unarmed Strike ------------------------------------------------
    const level = me.classes?.monk?.system.levels ?? 0;
    const heightened = me.items.some(i => /^heightened focus/i.test(i.name.trim()));
    const count = 2 + (heightened || level >= 10 ? 1 : 0);
    const isStrike = i => i?.type === 'weapon' && /^unarmed strike/i.test(i.name.trim()) && i.system.activities?.some(a => a.type === 'attack');
    let strike = safe(() => V14 ? actorUtils.getItemByIdentifier(me, 'unarmed-strike')
        : (itemUtils.getItemByIdentifier(me, 'monkUnarmedStrike') ?? itemUtils.getItemByIdentifier(me, 'unarmedStrike')), null);
    if (!isStrike(strike)) strike = me.items.find(i => isStrike(i) && /monk/i.test(i.name)) ?? me.items.find(isStrike);
    if (!strike) return ui.notifications.warn(feature.name + ': no Unarmed Strike with an attack on ' + me.name + '.');
    const attacks = strike.system.activities.filter(a => a.type === 'attack');
    const strikeAct = attacks.find(a => !/grapple|shove/i.test(a.name ?? '')) ?? attacks[0];
    const reach = Number(strike.system.range?.reach) || Number(strike.system.range?.value) || 5;

    // ---- Who can be hit ------------------------------------------------------------------
    const dist = t => safe(() => V14 ? tokenUtils.getDistance(monk.document, t.document) : tokenUtils.getDistance(monk, t), null)
        ?? safe(() => canvas.grid.measurePath([monk.center, t.center]).distance, 0);
    const hostile = t => t?.document?.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
    const alive = t => { const hp = t?.actor?.system.attributes?.hp; return !!t?.actor && (!hp || hp.value > 0); };
    const nearbyHostiles = () => canvas.tokens.placeables
        .filter(t => t.id !== monk.id && hostile(t) && alive(t) && !t.document.hidden && (game.user.isGM || t.visible) && dist(t) <= RANGE)
        .sort((a, b) => dist(a) - dist(b));
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    // Pop-up: how many strikes on each creature. Returns one token per strike, or null.
    const assign = async (tokens, total, intro, spread) => {
        const start = tokens.map((t, i) => spread ? Math.floor(total / tokens.length) + (i < total % tokens.length ? 1 : 0) : (i === 0 ? total : 0));
        const rows = tokens.map((t, i) => '<div class="form-group" style="display:flex;align-items:center;gap:8px;margin:4px 0">'
            + '<img src="' + esc(t.document.texture.src) + '" width="40" height="40" style="border:none;object-fit:contain;flex:none">'
            + '<label style="flex:1">' + esc(t.document.name) + ' <span style="opacity:0.7">(' + Math.round(dist(t)) + ' ft)</span></label>'
            + '<input type="number" name="n' + i + '" value="' + start[i] + '" min="0" max="' + total + '" step="1" style="width:4em;flex:none"></div>').join('');
        for (;;) {
            const counts = await DialogV2.wait({
                window: {title: feature.name},
                content: '<p>' + intro + '</p>' + rows + '<p style="opacity:0.8"><i>Strikes to assign: ' + total + '.</i></p>',
                buttons: [
                    {action: 'ok', label: 'Strike', icon: 'fa-solid fa-hand-fist', default: true,
                        callback: (ev, button) => tokens.map((t, i) => Math.max(0, Math.floor(Number(button.form.elements['n' + i].value) || 0)))},
                    {action: 'cancel', label: 'Cancel'}],
                rejectClose: false
            }).catch(() => null);
            if (!Array.isArray(counts)) return null;
            const sum = counts.reduce((a, b) => a + b, 0);
            if (sum !== total) { ui.notifications.warn(feature.name + ': assign exactly ' + total + ' strike' + (total > 1 ? 's' : '') + ' (you assigned ' + sum + ').'); continue; }
            const out = [];
            tokens.forEach((t, i) => { for (let j = 0; j < counts[i]; j++) out.push(t); });
            return out;
        }
    };

    const chosen = Array.from(workflow.targets ?? []).filter(t => t.id !== monk.id && hostile(t) && t.actor);
    let plan = [];
    if (chosen.length === 1) plan = Array(count).fill(chosen[0]);
    else if (chosen.length > 1) plan = await assign(chosen, count, 'Split your ' + count + ' strikes between your targets.', true);
    else {
        const near = nearbyHostiles();
        if (!near.length) return ui.notifications.warn(feature.name + ': no hostile creature within ' + RANGE + ' ft.');
        plan = near.length === 1 ? Array(count).fill(near[0])
            : await assign(near, count, 'No target selected. Pick who to hit: hostile creatures within ' + RANGE + ' ft (you can move between them).', false);
    }
    if (!plan?.length) return;

    // ---- Dice: Martial Arts die, advantage guess ------------------------------------------
    const scale = me.system.scale?.monk?.['martial-arts'];
    const faces = Number(scale?.faces) || Number(String(scale?.die ?? scale ?? '').match(/d(\d+)/)?.[1])
        || Number(strike.system.damage?.base?.denomination) || (level >= 17 ? 12 : level >= 11 ? 10 : level >= 5 ? 8 : 6);
    const has = (doc, path) => { const v = foundry.utils.getProperty(doc, path); return !!v && v !== '0' && v !== 'false'; };
    const flagAny = (doc, base) => ['all', 'mwak', 'attack.all', 'attack.mwak'].some(k => has(doc, base + '.' + k));
    const st = (doc, id) => doc?.statuses?.has?.(id);
    const needsSecondD20 = (t) => {
        const ta = t.actor;
        const adv = ['blinded', 'paralyzed', 'restrained', 'stunned', 'unconscious', 'petrified', 'prone'].some(s => st(ta, s))
            || st(me, 'invisible') || st(me, 'hidden')
            || flagAny(me, 'flags.midi-qol.advantage') || flagAny(ta, 'flags.midi-qol.grants.advantage.attack');
        const dis = ['blinded', 'poisoned', 'restrained', 'prone', 'frightened'].some(s => st(me, s)) || st(ta, 'invisible')
            || flagAny(me, 'flags.midi-qol.disadvantage') || flagAny(ta, 'flags.midi-qol.grants.disadvantage.attack');
        return adv || dis;
    };
    const autoCrit = t => ['paralyzed', 'unconscious'].some(s => st(t.actor, s));   // hit within 5 ft is a crit
    const mod = Math.max(me.system.abilities?.dex?.mod ?? 0, me.system.abilities?.str?.mod ?? 0);
    const prof = me.system.attributes?.prof ?? 0;
    const sign = n => (n < 0 ? ' - ' + Math.abs(n) : ' + ' + n);
    const header = (t, i, two, crit) => '[' + t.document.name + '] Strike ' + (i + 1) + '/' + plan.length + ': ' + (two ? '2d20' : '1d20') + sign(mod) + sign(prof)
        + '   |   Damage: ' + (crit ? 2 : 1) + 'd' + faces + sign(mod);

    // ---- One window per strike, all at once ------------------------------------------------
    const twoD20 = plan.map(t => needsSecondD20(t));
    const crits = plan.map(t => autoCrit(t));
    const prerolls = await Promise.all(plan.map((t, i) => {
        const r = new Roll((twoD20[i] ? '2d20' : '1d20') + ' + ' + (crits[i] ? 2 : 1) + 'd' + faces);
        Object.defineProperty(r, 'formula', {value: header(t, i, twoD20[i], crits[i]), configurable: true});
        return r.evaluate();
    }));
    const valuesOf = (r) => {
        const [atk, dmg] = r.dice;
        return {atk: atk.results.map(x => x.result), dmg: dmg.results.map(x => x.result)};
    };

    // ---- Feed those dice to each strike's own Midi workflow ----------------------------------
    // Only the strike's attack roll takes the d20s and only its damage roll takes the dX;
    // any other roll in between (a Stunning Strike save, an opportunity attack) rolls as usual.
    const METHOD = 'nixFlurryQueue';
    const queue = {20: [], [faces]: []};
    let phase = '';                                                   // 'attack' | 'damage' | ''
    let current = '';
    const original = foundry.utils.deepClone(game.settings.get('core', 'diceConfiguration') ?? {});
    const askManual = async (f, why) => {
        const v = await DialogV2.prompt({
            window: {title: (current || feature.name) + ': ' + why},
            content: '<p><b>' + esc(current || feature.name) + '</b> needs a ' + why + '.</p><input type="number" name="v" min="1" max="' + f + '" autofocus>',
            ok: {callback: (ev, button) => Number(button.form.elements.v.value)}
        }).catch(() => null);
        return Math.clamp(Number(v) || 1, 1, f);
    };
    const asUsual = async (term, options) => {
        const m = original['d' + term.faces];
        const method = m && m !== METHOD ? CONFIG.Dice.fulfillment.methods[m] : null;
        if (method?.handler && !method.interactive) return await method.handler(term, options);
        if (m && m !== METHOD) return await askManual(term.faces, 'd' + term.faces + ' roll');
        return Math.ceil((1 - CONFIG.Dice.randomUniform()) * term.faces);
    };
    CONFIG.Dice.fulfillment.methods[METHOD] = {
        label: 'Flurry of Blows dice', icon: '<i class="fa-solid fa-hand-fist"></i>', interactive: false,
        handler: async (term, options) => {
            if (term.faces === 20 && phase === 'attack') return queue[20].length ? queue[20].shift() : await askManual(20, 'second d20 (advantage / disadvantage)');
            if (term.faces === faces && phase === 'damage') return queue[faces].length ? queue[faces].shift() : await askManual(faces, 'extra d' + faces + ' (critical hit)');
            return await asUsual(term, options);
        }
    };
    const patched = {...original, d20: METHOD, ['d' + faces]: METHOD};
    const mine = wf => wf?.item?.uuid === strike.uuid;
    const hooks = [];
    for (const h of ['midi-qol.AttackRollComplete', 'midi-qol.postAttackRollComplete'])
        hooks.push([h, Hooks.on(h, wf => { if (mine(wf) && phase === 'attack') { queue[20] = []; phase = 'damage'; } })]);
    hooks.push(['midi-qol.preDamageRoll', Hooks.on('midi-qol.preDamageRoll', wf => { if (mine(wf)) { queue[20] = []; phase = 'damage'; } })]);
    for (const h of ['midi-qol.DamageRollComplete', 'midi-qol.postDamageRollComplete'])
        hooks.push([h, Hooks.on(h, wf => { if (mine(wf) && phase === 'damage') { queue[faces] = []; phase = ''; } })]);

    // ---- Animation (Chris's Premades' Flurry of Blows) ---------------------------------------
    const canAnimate = ANIMATE && game.modules.get('jb2a_patreon')?.active && game.modules.get('sequencer')?.active;
    const animate = (t, missed) => { try {
        const sd = monk.document, td = t.document;
        new Sequence()
            .effect().copySprite(monk).attachTo(monk).size(sd.width * sd.texture.scaleX, {gridUnits: true}).fadeOut(150).duration(1800).zIndex(2)
            .effect().delay(150).file('jb2a.flurry_of_blows.no_hit.yellow').atLocation(monk).stretchTo(t, {randomOffset: 0.2})
                .scale(0.6 * sd.width).playbackRate(1).startTime(300).endTime(600).opacity(1).rotate(0).mirrorX(false)
                .repeats(3, 300, 300).randomizeMirrorY().spriteOffset({x: sd.width * 0.25}, {gridUnits: true}).zIndex(1.1).wait(300)
            .effect().file('jb2a.impact.009.orange').atLocation(t, {randomOffset: 1}).missed(!!missed)
                .size(sd.width * 1.25, {gridUnits: true}).repeats(20, 50, 50).randomRotation()
            .effect().copySprite(t).atLocation(t).fadeIn(200).fadeOut(200)
                .loopProperty('sprite', 'position.x', {from: -0.05, to: 0.05, duration: 50, pingPong: true, gridUnits: true})
                .scaleToObject(td.texture.scaleX).duration(1400).opacity(0.25)
            .play();
    } catch (e) { console.warn('Nix Fix | Flurry animation', e); } };

    // ---- One strike ------------------------------------------------------------------
    const runStrike = async (t) => {
        return await workflowUtils.syntheticActivityRoll(strikeAct, [t],
            {options: {targetConfirmation: 'none', nixFlurry: true, ...(canAnimate ? {cat: {skipWeaponAnimation: true}} : {})}});
    };

    const animated = new Set();
    const pressed = new Set();                                        // targets he chose to strike from where he stands
    try {
        await game.settings.set('core', 'diceConfiguration', patched);
        let i = 0;
        while (i < plan.length) {
            let t = plan[i];
            // Target dropped (or gone): offer the strikes left to someone else within range.
            if (!alive(t) || !canvas.tokens.get(t.id)) {
                const left = plan.length - i;
                const others = nearbyHostiles();
                if (!others.length) break;
                const re = others.length === 1 ? Array(left).fill(others[0])
                    : await assign(others, left, esc(t.document.name) + ' is down. ' + left + ' strike' + (left > 1 ? 's' : '') + ' left: who gets them?', false);
                if (!re?.length) break;
                plan.splice(i, left, ...re);
                t = plan[i];
            }
            // Out of reach: he moves first (the pop-up doesn't block the canvas).
            const d = dist(t);
            if (d > reach && !pressed.has(t.id)) {
                const go = await DialogV2.wait({
                    window: {title: feature.name + ': ' + t.document.name},
                    content: '<p><b>' + esc(t.document.name) + '</b> is ' + Math.round(d) + ' ft away (reach ' + reach + ' ft). Move ' + esc(me.name)
                        + ' next to it, then press <b>Strike</b>.</p>',
                    buttons: [{action: 'strike', label: 'Strike', icon: 'fa-solid fa-hand-fist', default: true}, {action: 'skip', label: 'Skip this target'}],
                    rejectClose: false
                }).catch(() => null);
                if (go !== 'strike') { const skip = t.id; while (i < plan.length && plan[i].id === skip) i++; continue; }
                if (dist(t) > reach) pressed.add(t.id);
            }
            const v = valuesOf(prerolls[i]);
            queue[20] = [...v.atk];
            queue[faces] = [...v.dmg];
            current = '[' + t.document.name + '] Strike ' + (i + 1);
            phase = 'attack';
            let wf = null;
            try { wf = await runStrike(t); }
            finally { phase = ''; queue[20] = []; queue[faces] = []; }
            if (canAnimate && !animated.has(t.id)) { animated.add(t.id); animate(t, !(wf?.hitTargets?.size)); }
            i++;
        }
    } finally {
        await game.settings.set('core', 'diceConfiguration', original);
        for (const [h, id] of hooks) Hooks.off(h, id);
        // Chris's Premades' own Flurry of Blows (prompt switched off by the installer) has nothing left to do.
        workflow.targets = new Set();
    }
};

// =====================================================================
//  Install
// =====================================================================
 
// ---- 1. Unarmed Strike / Empowered Strikes / Deflect Attacks (Chris's Premades 2) ---------------
{
    const strike = actor.items.find(i => i.type === 'weapon' && /^unarmed strike/i.test(i.name.trim()));
    const arts = find(/^martial arts/i);
    const es = findAll(/^empowered strikes/i);
    const da = find(/^deflect attacks/i);
    const bits = [];
    bits.push(premadeOn(arts) === 'cpr2' && premadeOn(strike) === 'cpr2'
        ? 'Unarmed Strike and Martial Arts use Chris\'s Premades 2 (Dex, Martial Arts die). Our v13 change to the strike is not needed.'
        : '<b>Apply Chris\'s Premades 2\'s Unarmed Strike and Martial Arts in the Medkit</b> (Martial Arts swaps in Dex and the Martial Arts die).');
    if (es.length > 1) bits.push('<b>' + es.length + ' Empowered Strikes</b>: keep the Chris\'s Premades 2 one, delete the others.');
    else if (es[0]) bits.push(premadeOn(es[0]) === 'cpr2' ? 'Empowered Strikes (Chris\'s Premades 2) makes the strikes Force.' : '<b>Apply Chris\'s Premades 2\'s Empowered Strikes</b> for Force damage.');
    if (da) bits.push(premadeOn(da) === 'cpr2' ? 'Deflect Attacks is Chris\'s Premades 2 (spends his reaction, so it is once per turn by itself).' : '<b>Apply Chris\'s Premades 2\'s Deflect Attacks</b> in the Medkit.');
    report.push('<li>' + bits.join(' ') + '</li>');
}
 
// ---- 2. Uncanny Metabolism ----------------------------------------------------------------------
{
    const ums = findAll(/^uncanny metabolism/i);
    const um = ums[0];
    if (!um) report.push('<li><b>Uncanny Metabolism</b> not found.</li>');
    else {
        await setCat(um, ['Uncanny Metabolism: initiative'], [entry('Uncanny Metabolism: initiative', 'combat', 'actorPreInitiative', 50, uncanny)]);
        await dropOld(um, ['Uncanny Metabolism: initiative']);
        report.push('<li>Uncanny Metabolism: when he rolls initiative, if he is missing Focus Points and the feature is unused, his player is asked; yes rolls its healing and restores all Focus.'
            + (ums.length > 1 ? ' <b>' + ums.length + ' copies on the sheet</b>: delete all but ' + um.name + ' (the first one has the macro).' : '') + '</li>');
    }
}
 
// ---- 3. Self-Restoration ---------------------------------------------------------------------
{
    const sr = find(/^self-?restoration/i);
    if (!sr) report.push('<li><b>Self-Restoration</b> not found.</li>');
    else {
        await setCat(sr, ['Self-Restoration: end of turn'], [entry('Self-Restoration: end of turn', 'combat', 'actorTurnEnd', 50, selfRestore)]);
        await dropOld(sr, ['Self-Restoration: end of turn']);
        report.push('<li>Self-Restoration: at the end of each of his turns in combat, if he is Charmed, Frightened or Poisoned, his player gets a pop-up to end one of them.</li>');
    }
}
 
// ---- 4. Giant-Eel Scarf --------------------------------------------------------------------------
{
    const scarf = find(/giant[- ]eel scarf/i);
    if (!scarf) report.push('<li><b>Giant-Eel Scarf</b> not found.</li>');
    else {
        const names = ['Scarf: grapple saves', 'Scarf: escape (skill)', 'Scarf: escape (check)'];
        await setCat(scarf, names, [
            entry('Scarf: grapple saves', 'save', 'actorSituational', 50, scarfSave),
            entry('Scarf: escape (skill)', 'skill', 'actorSituational', 50, scarfEscape),
            entry('Scarf: escape (check)', 'check', 'actorSituational', 50, scarfEscape)]);
        await dropOld(scarf, names);
        report.push('<li>Giant-Eel Scarf: Advantage on saves against being Grappled or Restrained, and on Athletics / Acrobatics / Str / Dex checks to escape, only when the source is not a spell.</li>');
    }
}
 
// ---- 5. Sentinel --------------------------------------------------------------------------------
{
    const sen = actor.items.find(i => i.type === 'feat' && /^sentinel\b/i.test(i.name));
    if (!sen) report.push('<li><b>Sentinel</b> not found.</li>');
    else {
        await setCat(sen, ['Sentinel: Guardian'], [entry('Sentinel: Guardian', 'roll', 'nearbyRollFinished', 50, sentinel, {distance: 5, dispositions: 'enemy'})]);
        await dropOld(sen, ['Sentinel: Guardian']);
        report.push('<li>Sentinel: same as Quez. When an enemy within 5 ft hits someone else, he is offered a reaction Opportunity Attack (his Unarmed Strike counts); on a hit its Speed drops to 0 for the turn.</li>');
    }
}
 
// ---- 6. Flurry of Blows ---------------------------------------------------------------------
{
    const NAME = 'Flurry of Blows: targets';
    const isFlurryAct = a => /flurry of blows/i.test(a.name ?? '') || ['flurry-of-blows', 'flurryOfBlows'].includes(a.identifier ?? a.flags?.cat?.identifier);
    const holders = actor.items.filter(i => (i.system.activities?.contents ?? []).some(isFlurryAct)
        || (/^flurry of blows/i.test(i.name.trim()) && i.system.activities?.size));
    if (!holders.length) report.push('<li><b>Flurry of Blows</b> not found (no item or activity with that name).</li>');
    for (const it of holders) {
        const acts = (it.system.activities?.contents ?? []).filter(isFlurryAct);
        if (!acts.length) acts.push(it.system.activities.contents[0]);
        const notes = [];
        for (const a of acts) {
            const fresh = () => actor.items.get(it.id).system.activities.get(a.id);
            await setCat(fresh(), [NAME], [entry(NAME, 'roll', 'activityRollFinished', 10, flurry)]);
            // Chris's Premades 2: the generic extraAttack on this activity stands down (prompt off).
            if (fresh().flags?.cat?.genericConfig?.['chris-premades']?.extraAttack) {
                await fresh().update({'flags.cat.genericConfig.chris-premades.extraAttack.prompt': false});
                notes.push('Chris\'s Premades 2\'s own Flurry prompt is switched off (ours plays its animation).');
            }
            if (a.type === 'attack') notes.push('<b>The "' + a.name + '" activity is an attack</b>: make it a Utility activity that spends 1 Focus Point, or the script stays out of the way.');
        }
        await dropOld(it, [NAME]);
        report.push('<li>Flurry of Blows (on <b>' + it.name + '</b>): one hostile target gets all ' + (2 + ((actor.classes?.monk?.system.levels ?? 0) >= 10 ? 1 : 0))
            + ' strikes; several targets: a pop-up splits them; no target: a pop-up of hostile creatures within 65 ft. One dice window per strike (attack + damage), like Eldritch Blast. '
            + notes.join(' ') + ' <i>Re-applying Monk\'s Focus in the Medkit removes this; run Nox fixes again after.</i></li>');
    }
}
 
// ---- 7. What's left ---------------------------------------------------------------------------
whatsLeft(/^(uncanny metabolism|self-?restoration)/i);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nox fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 