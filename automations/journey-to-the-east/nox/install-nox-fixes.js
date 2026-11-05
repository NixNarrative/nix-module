// =====================================================================
//  NOX FIXES (Journey to the East): one-click INSTALLER (Script macro, run as GM)
//  Select Nox's token, then run. Safe to re-run.
//   - Unarmed Strike: Dex, Martial Arts die (d10), Force damage, proficient
//   - Empowered Strikes / Uncanny Metabolism: extra copies removed
//   - Uncanny Metabolism: asked when combat starts if Focus isn't full
//   - Deflect Attacks: once per turn
//   - Self-Restoration: end-of-turn pop-up to end Charmed / Frightened / Poisoned
//   - Giant-Eel Scarf: advantage vs physical grapples and restraints (not spells)
//   - Sentinel (2024): Guardian + Halt (same as Quez)
//   - Flurry of Blows: strikes go to his target, are split between several targets,
//     or (no target) to hostile creatures he picks within 65 ft; one dice window per
//     strike (attack d20 + damage die), like Nethtari's Eldritch Blast
//  Darkness (Shadow Arts) comes from the Darkness & Devil's Sight WORLD installer.
// =====================================================================
const SCRIPTS = {
 "UNCANNY": "await (async () => {\n// Uncanny Metabolism: when combat starts, if he isn't at full Focus, ask whether to use it.\nconst item = trigger.entity;\nconst actor = item.actor;\nif (!actor || (item.system.uses?.max && !(item.system.uses.value > 0))) return;\nconst focus = actor.items.find(i => /monk'?s focus|focus points|^ki( points)?$/i.test(i.name.trim()) && i.system.uses?.max);\nif (!focus || !((focus.system.uses.spent ?? 0) > 0)) return;\nconst level = actor.classes?.monk?.system.levels ?? 0;\nconst userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\nconst yes = await dialogUtils.confirm(item.name, 'Rolling initiative with ' + focus.system.uses.value + '/' + focus.system.uses.max\n    + ' Focus Points. Use ' + item.name + ' to regain all Focus Points and heal Martial Arts die + ' + level + '?', {userId});\nif (!yes) return;\nawait genericUtils.update(focus, {'system.uses.spent': 0});\nconst heal = item.system.activities?.find(a => a.type === 'heal');\nconst token = actorUtils.getFirstToken(actor);\nif (heal && token) await workflowUtils.syntheticActivityRoll(heal, [token], {userId, consumeUsage: true, consumeResources: true});\nelse {\n    if (item.system.uses?.max) await genericUtils.update(item, {'system.uses.spent': (item.system.uses.spent ?? 0) + 1});\n    const die = actor.system.scale?.monk?.['martial-arts']?.die ?? ('1d' + (level >= 17 ? 12 : level >= 11 ? 10 : level >= 5 ? 8 : 6));\n    const r = await new Roll(die + ' + ' + level).evaluate();\n    await r.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: item.name + ': healing'});\n    const hp = actor.system.attributes.hp;\n    await genericUtils.update(actor, {'system.attributes.hp.value': Math.min(hp.max, hp.value + r.total)});\n}\nawait ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + '\\'s Focus Points are fully restored.'});\n})();",
 "SELF_RESTORE": "await (async () => {\n// Self-Restoration: at the end of his turn, offer to end Charmed, Frightened or Poisoned.\nconst item = trigger.entity;\nconst actor = item.actor;\nconst CONDS = ['charmed', 'frightened', 'poisoned'];\nconst has = CONDS.filter(s => actor.statuses?.has(s));\nif (!has.length) return;\nconst userId = socketUtils.firstOwner(actor, true) ?? game.user.id;\nconst label = s => CONFIG.statusEffects.find(e => e.id === s)?.name ? game.i18n.localize(CONFIG.statusEffects.find(e => e.id === s).name) : s;\nconst pick = await dialogUtils.buttonDialog(item.name, 'End of your turn: use ' + item.name + ' to end one condition?',\n    has.map(s => ['End ' + label(s), s]).concat([['Not now', false]]), {userId});\nif (!pick) return;\nconst effects = actor.effects.filter(e => e.statuses?.has(pick));\nfor (const e of effects) await genericUtils.remove(e);\nif (actor.statuses?.has(pick)) await actor.toggleStatusEffect(pick, {active: false});\nawait ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + ' shakes off being ' + label(pick) + '.'});\n})();",
 "SCARF_SAVE": "await (async () => {\n// Giant-Eel Scarf: advantage on saves against being Grappled or Restrained by physical means\n// (not spells).\nconst scarf = trigger.entity;\nif (scarf.system.attunement && !scarf.system.attuned) return;\nconst uuid = trigger.config?.midiOptions?.saveItemUuid;\nconst src = uuid ? fromUuidSync(uuid) : null;\nif (!src || src.type === 'spell' || src.system?.type?.value === 'spellFeature') return;\nconst BIND = /grappl|restrain/i;\nconst texts = [src.name, String(src.system?.description?.value ?? '')];\nfor (const e of src.effects?.contents ?? []) { texts.push(e.name); for (const s of e.statuses ?? []) texts.push(s); }\nfor (const a of src.system?.activities?.contents ?? []) texts.push(a.name);\nif (texts.some(t => BIND.test(t))) trigger.options.advantage = true;\n})();",
 "SCARF_ESCAPE": "await (async () => {\n// Giant-Eel Scarf: advantage on Athletics / Acrobatics / Str / Dex checks to escape a physical\n// grapple or restraint (not one from a spell).\nconst scarf = trigger.entity;\nif (scarf.system.attunement && !scarf.system.attuned) return;\nconst actor = scarf.actor;\nconst id = trigger.skillId ?? trigger.checkId;\nif (!['ath', 'acr', 'str', 'dex'].includes(id)) return;\nconst binds = actor.effects.filter(e => !e.disabled && (e.statuses?.has('grappled') || e.statuses?.has('restrained')));\nif (!binds.length) return;\nconst physical = binds.some(e => {\n    const o = e.origin ? fromUuidSync(e.origin, {strict: false}) : null;\n    const it = o?.documentName === 'Item' ? o : o?.parent?.documentName === 'Item' ? o.parent : null;\n    return !it || (it.type !== 'spell' && it.system?.type?.value !== 'spellFeature');\n});\nif (physical) trigger.options.advantage = true;\n})();",
 "SENTINEL": "await (async () => {\n    const item = trigger.entity;\n    const me = item.actor;\n    const mine = actorUtils.getFirstToken(me);\n    const foe = workflow.token;\n    if (!mine || !foe || !workflow.actor || workflow.actor.uuid === me.uuid) return;\n    if (!workflow.activity?.hasAttack && !workflowUtils.isAttackType(workflow, 'attack')) return;\n    if (foe.document.disposition === mine.document.disposition) return;\n    const others = Array.from(workflow.hitTargets ?? []).filter(t => t.id !== mine.id);\n    if (!others.length) return;\n    if (tokenUtils.getDistance(mine, foe) > 5) return;\n    if (combatUtils.inCombat() && actorUtils.hasUsedReaction(me)) return;\n    if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(s => me.statuses?.has(s))) return;\n    let weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack')\n        && ['simpleM', 'martialM'].includes(i.system.type?.value));\n    if (!weapons.length) weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack'));\n    if (!weapons.length) return;\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const text = foe.document.name + ' hit ' + others.map(t => t.document.name).join(', ') + ' right next to you. Use your reaction to make an Opportunity Attack against it?';\n    let weapon;\n    if (weapons.length === 1) {\n        if (!await dialogUtils.confirm(item.name + ': Guardian', text, {userId})) return;\n        weapon = weapons[0];\n    } else {\n        weapon = await dialogUtils.selectDocumentDialog(item.name + ': Guardian', text + ' Choose a weapon (or Cancel).', weapons, {userId});\n        if (!weapon) return;\n    }\n    const activity = weapon.system.activities.find(a => a.type === 'attack');\n    if (combatUtils.inCombat()) await actorUtils.setReactionUsed(me);\n    setTimeout(async () => {\n        const wf = await workflowUtils.syntheticActivityRoll(activity, [foe], {options: {workflowOptions: {nixSentinel: true}}});\n        // Halt: a creature hit by the Opportunity Attack has Speed 0 for the rest of the turn.\n        const hit = wf?.hitTargets?.size ? wf.hitTargets.first() : null;\n        if (hit?.actor) await effectUtils.createEffect(hit.actor, {\n            name: 'Sentinel: Halted', img: item.img, origin: item.uuid, duration: {turns: 1},\n            description: 'Speed 0 for the rest of the current turn.',\n            changes: ['walk', 'fly', 'swim', 'climb', 'burrow'].map(k => ({key: 'system.attributes.movement.' + k, mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '0', priority: 60})),\n            flags: {dae: {specialDuration: ['turnEnd']}}\n        });\n    }, 300);\n})();"
};
// ---- Flurry of Blows: midi-item / rollFinished / 10 (before Chris's Premades' own, which stands down) ----
const flurry = async () => {
    // FLURRY OF BLOWS: target-aware strikes with dice windows (Nix Fix, Foundry v13 / Chris's Premades 1)
    // 1. One hostile target selected: every strike goes to it.
    //    Two or more: a pop-up splits the strikes between them.
    //    None: a pop-up lists the hostile creatures within 65 ft (he can move between them).
    // 2. One dice window per strike opens, all at once, headed
    //    "[Target] Strike 1/3: 1d20 + mod + prof | Damage: 1dX + mod" (attack d20 + damage die).
    //    If Midi needs one more die (unexpected advantage, a crit), a small box asks.
    // 3. Each strike resolves through Midi as a normal Unarmed Strike with those dice.
    //    A target out of reach: "move next to it, then Strike". A target that drops:
    //    the strikes left can go to another hostile creature within 65 ft.
    const V14 = false;
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
    // ---- Lucky (2024): asked before the dice windows, once per strike aimed at a Lucky character ----
    // A yes spends the point now and gives that strike's window two d20s; the strike's own
    // workflow then applies the Disadvantage without asking again (globalThis.nixLuckyPending).
    const luckyQueues = {};                                          // target actor uuid -> [yes/no per strike]
    const isLuckyFeat = i => i.type === 'feat' && /^lucky/i.test(i.name.trim()) && !/footwork/i.test(i.name)
        && [...(i.flags?.cat?.embeddedMacros ?? []), ...(i.flags?.['chris-premades']?.embeddedMacros ?? [])].some(m => m.name === 'Lucky: Disadvantage');
    for (let i = 0; i < plan.length; i++) {
        const t = plan[i];
        const ta = t.actor;
        if (!ta || ta.uuid === me.uuid || t.document.disposition === monk.document.disposition) continue;
        const lucky = ta.items.find(isLuckyFeat);
        if (!lucky) continue;
        const q = (luckyQueues[ta.uuid] ??= []);
        const n = plan.filter(p => p.actor?.uuid === ta.uuid).length;
        if (!(lucky.system.uses?.value > 0)) { q.push(false); continue; }
        const userId = socketUtils.firstOwner(ta, true) ?? game.user.id;
        const yes = await dialogUtils.confirm(lucky.name, '<b>' + me.name + '</b> is aiming ' + (n > 1 ? 'strike ' + (q.length + 1) + ' of ' + n : 'a strike')
            + ' of ' + feature.name + ' at <b>' + ta.name + '</b>.<br>Spend a Luck Point to give this attack roll Disadvantage? (' + lucky.system.uses.value + ' left)', {userId});
        q.push(!!yes);
        if (!yes) continue;
        await genericUtils.update(lucky, {'system.uses.spent': (lucky.system.uses.spent ?? 0) + 1});
        twoD20[i] = true;
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: ta}),
            content: '<b>' + lucky.name + ':</b> ' + ta.name + ' spends a Luck Point. That strike of ' + me.name + '\'s ' + feature.name + ' has Disadvantage.'});
    }
    globalThis.nixLuckyPending = Object.keys(luckyQueues).length ? {attacker: me.uuid, queues: luckyQueues} : null;
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
        // Like Chris's Premades' own flurry, the strike counts as a Special action (no action used).
        let ench = null;
        try {
            ench = await itemUtils.enchantItem(strike, {name: feature.name, img: feature.img, origin: feature.uuid, duration: {seconds: 1},
                changes: Object.keys(CONFIG.DND5E.activityTypes).flatMap(k => ([
                    {key: 'activities[' + k + '].activation.type', mode: 5, value: 'special', priority: 20},
                    {key: 'system.activation.type', mode: 5, value: 'special', priority: 20}]))});
        } catch (e) { ench = null; }
        try {
            const a = me.items.get(strike.id)?.system.activities.get(strikeAct.id) ?? strikeAct;
            return await workflowUtils.syntheticActivityRoll(a, [t], {options: {targetConfirmation: 'none'}});
        } finally { if (ench) await genericUtils.remove(ench); }
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
                if (go !== 'strike') { const skip = t.id; while (i < plan.length && plan[i].id === skip) { luckyQueues[plan[i].actor?.uuid]?.shift(); i++; } continue; }
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
        globalThis.nixLuckyPending = null;
    }
};
const FLURRY = 'return await (' + flurry.toString() + ')();';

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Nox fixes: select Nox\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
const findAll = re => actor.items.filter(i => re.test(i.name.trim()));
const cprId = item => item?.flags?.['chris-premades']?.info?.identifier;
async function setMacros(doc, names, add) {
    const kept = (doc.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
    await doc.setFlag('chris-premades', 'embeddedMacros', kept.concat(add));
}
async function setActivityMacros(item, activity, add) {
    const names = add.map(m => m.name);
    const kept = (item.flags?.['chris-premades']?.embeddedActivityMacros?.[activity.id] ?? []).filter(m => !names.includes(m.name));
    await item.setFlag('chris-premades', 'embeddedActivityMacros.' + activity.id, kept.concat(add));
}
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update(data);
    return actByName(item, name);
}
// Delete every copy of a feature except the one to keep (Chris's Premades version first).
async function dedupe(re, label) {
    const all = findAll(re);
    if (all.length < 2) return all[0];
    const keep = all.find(i => cprId(i)) ?? all.find(i => !/\(copy\)/i.test(i.name)) ?? all[0];
    const gone = all.filter(i => i.id !== keep.id);
    await actor.deleteEmbeddedDocuments('Item', gone.map(i => i.id));
    report.push('<li>' + label + ': removed ' + gone.length + ' extra cop' + (gone.length > 1 ? 'ies' : 'y') + ' (kept <b>' + keep.name + '</b>' + (cprId(keep) ? ', the Chris\'s Premades one' : '') + ').</li>');
    return keep;
}
// Move a familiar actor into its own folder and point a caster's Find Familiar there.
async function linkFamiliar(famName, items) {
    const fam = game.actors.find(a => a.name === famName && a.type === 'npc') ?? game.actors.find(a => a.name === famName);
    if (!fam) { report.push('<li>Familiar <b>' + famName + '</b>: no actor with that exact name in the Actors sidebar.</li>'); return; }
    const folderName = 'Familiars: ' + actor.name.split(' ')[0];
    const folder = game.folders.find(f => f.type === 'Actor' && f.name === folderName) ?? await Folder.create({name: folderName, type: 'Actor'});
    if (fam.folder?.id !== folder.id) await fam.update({folder: folder.id});
    const done = [];
    for (const it of items.filter(Boolean)) {
        await it.setFlag('chris-premades', 'config.folder', folderName);
        await it.setFlag('chris-premades', 'config.name', famName);
        done.push(it.name);
    }
    report.push('<li>Familiar: <b>' + famName + '</b> moved to the Actors folder "' + folderName + '", and ' + (done.join(' and ') || 'no Find Familiar item')
        + ' now summons ' + famName + ' (the creature type is still asked: Celestial, Fey or Fiend).</li>');
}
 
// ---- 1. Unarmed Strike -------------------------------------------------------------
{
    const monk = actor.classes?.monk?.system.levels ?? 0;
    const faces = monk >= 17 ? 12 : monk >= 11 ? 10 : monk >= 5 ? 8 : 6;
    const strikes = actor.items.filter(i => i.type === 'weapon' && /^unarmed strike/i.test(i.name.trim()));
    if (!strikes.length) report.push('<li><b>Unarmed Strike</b> not found.</li>');
    for (const u of strikes) {
        await u.update({'system.damage.base': {number: 1, denomination: faces, bonus: '', types: ['force'], custom: {enabled: false, formula: ''}},
            'system.proficient': 1});
        for (const a of u.system.activities.contents.filter(a => a.type === 'attack')) {
            await a.update({'attack.ability': 'dex', 'damage.includeBase': true, 'damage.parts': []});
        }
    }
    if (strikes.length) report.push('<li>Unarmed Strike: Dexterity attack (+' + (actor.system.abilities.dex.mod + actor.system.attributes.prof) + '), 1d' + faces
        + ' + Dex <b>Force</b> damage (Martial Arts die). Re-run this installer when he reaches Monk 17 for the d12.</li>');
}
 
// ---- 2. Empowered Strikes: one copy, Force -------------------------------------------
{
    const es = await dedupe(/^empowered strikes/i, 'Empowered Strikes');
    if (es && cprId(es) === 'empoweredStrikes') await es.setFlag('chris-premades', 'config.autoApply', true);
    if (es) report.push('<li>Empowered Strikes: his Unarmed Strikes always deal Force damage (set on the strike itself' + (cprId(es) ? '; Chris\'s Premades no longer asks' : '') + ').</li>');
}
 
// ---- 3. Uncanny Metabolism ----------------------------------------------------------------
{
    const um = await dedupe(/^uncanny metabolism/i, 'Uncanny Metabolism');
    if (!um) report.push('<li><b>Uncanny Metabolism</b> not found.</li>');
    else {
        await setMacros(um, ['Uncanny Metabolism: initiative'], [{name: 'Uncanny Metabolism: initiative', type: 'combat', pass: 'combatStart', priority: 50, macro: SCRIPTS.UNCANNY}]);
        report.push('<li>Uncanny Metabolism: when combat begins (after initiative), if he is missing Focus Points and the feature is unused, his player is asked; yes restores all Focus and rolls the healing.</li>');
    }
}
 
// ---- 4. Deflect Attacks: once per turn ---------------------------------------------------
{
    const da = find(/^deflect attacks/i);
    if (!da) report.push('<li><b>Deflect Attacks</b> not found.</li>');
    else {
        const period = CONFIG.DND5E.limitedUsePeriods?.turn ? 'turn' : 'turnStart';
        const rec = [{period, type: 'recoverAll'}];
        if (da.system.uses?.max) await da.update({'system.uses.recovery': rec, 'system.uses.spent': 0});
        for (const a of da.system.activities.contents) if (a.uses?.max) await a.update({'uses.recovery': rec, 'uses.spent': 0});
        report.push('<li>Deflect Attacks: its use now comes back every turn (' + period + '), so it works once per turn instead of once per rest.</li>');
    }
}
 
// ---- 5. Self-Restoration ---------------------------------------------------------------
{
    const sr = find(/^self-?restoration/i);
    if (!sr) report.push('<li><b>Self-Restoration</b> not found.</li>');
    else {
        await setMacros(sr, ['Self-Restoration: end of turn'], [{name: 'Self-Restoration: end of turn', type: 'combat', pass: 'turnEnd', priority: 50, macro: SCRIPTS.SELF_RESTORE}]);
        report.push('<li>Self-Restoration: at the end of each of his turns in combat, if he is Charmed, Frightened or Poisoned, his player gets a pop-up to end one of them.</li>');
    }
}
 
// ---- 6. Giant-Eel Scarf --------------------------------------------------------------------
{
    const scarf = find(/giant[- ]eel scarf/i);
    if (!scarf) report.push('<li><b>Giant-Eel Scarf</b> not found.</li>');
    else {
        await setMacros(scarf, ['Scarf: grapple saves', 'Scarf: escape (skill)', 'Scarf: escape (check)'], [
            {name: 'Scarf: grapple saves', type: 'save', pass: 'situational', priority: 50, macro: SCRIPTS.SCARF_SAVE},
            {name: 'Scarf: escape (skill)', type: 'skill', pass: 'situational', priority: 50, macro: SCRIPTS.SCARF_ESCAPE},
            {name: 'Scarf: escape (check)', type: 'check', pass: 'situational', priority: 50, macro: SCRIPTS.SCARF_ESCAPE}]);
        report.push('<li>Giant-Eel Scarf: Advantage on saves against being Grappled or Restrained, and on Athletics / Acrobatics / Str / Dex checks to escape, but only when the source is not a spell (Hold Person, Entangle and the like get no advantage).</li>');
    }
}
 
// ---- 7. Sentinel ------------------------------------------------------------------------
{
    const sen = find(/^sentinel/i);
    if (!sen) report.push('<li><b>Sentinel</b> not found.</li>');
    else {
        await setMacros(sen, ['Sentinel: Guardian'], [{name: 'Sentinel: Guardian', type: 'midi-actor', pass: 'sceneRollFinished', priority: 50, macro: SCRIPTS.SENTINEL}]);
        report.push('<li>Sentinel: same script as Quez. When an enemy within 5 ft hits someone else, he is offered a reaction Opportunity Attack; on a hit its Speed drops to 0 for the turn.</li>');
    }
}
 
// ---- 8. Flurry of Blows -------------------------------------------------------------------
{
    const NAME = 'Flurry of Blows: targets';
    const holders = actor.items.filter(i => /^flurry of blows/i.test(i.name.trim())
        || (i.system.activities?.contents ?? []).some(a => /flurry of blows/i.test(a.name ?? '')));
    if (!holders.length) report.push('<li><b>Flurry of Blows</b> not found (no item or activity with that name).</li>');
    for (const it of holders) {
        await setMacros(it, [NAME], [{name: NAME, type: 'midi-item', pass: 'rollFinished', priority: 10, macro: FLURRY}]);
        // Chris's Premades' Monk's Focus: its own Flurry prompt off (ours does the targeting and plays its animation).
        if (cprId(it)) await it.setFlag('chris-premades', 'config.promptForTargets', false);
        const fact = (it.system.activities?.contents ?? []).find(a => /flurry of blows/i.test(a.name ?? '')) ?? it.system.activities?.contents?.[0];
        const warn = fact?.type === 'attack' ? ' <b>Its Flurry activity is an attack</b>: make it a Utility activity that spends 1 Focus Point, or the script stays out of the way.' : '';
        report.push('<li>Flurry of Blows (on <b>' + it.name + '</b>): one hostile target gets all ' + (2 + ((actor.classes?.monk?.system.levels ?? 0) >= 10 ? 1 : 0))
            + ' strikes; several targets: a pop-up splits them; no target: a pop-up of hostile creatures within 65 ft. One dice window per strike (attack + damage), like Eldritch Blast.'
            + (cprId(it) ? ' Chris\'s Premades\' own Flurry prompt is switched off (its animation still plays).' : '') + warn + '</li>');
    }
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nox fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 