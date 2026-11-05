// =====================================================================
//  INSTALL ELDRITCH BLAST BEAM WINDOWS, Foundry v14 (Chris's Premades 2 / CAT) copy
//  World installer: run by Nix Fix (or as a Script macro, as GM). Safe to re-run.
//
//  For every Eldritch Blast in the world that has a "Cast" activity plus a
//  separate beam attack activity (the Chris's Premades shape, v1 or v2):
//  writes the one-window-per-beam script as roll / itemRollFinished / 10.
//  On v14 our macro fires the beams itself. Chris's Premades 2's Eldritch Blast
//  only carries a generic "one workflow per target" macro (multiSingleTarget);
//  ours runs first and clears the targets, so that one has nothing left to do.
//  Agonizing Blast, the Eldritch Bident and Spell Sniper hook into each beam's
//  own workflow (installed by Nethtari's fixes).
//  Lucky (2024) on a target is asked before the dice windows (see the Lucky block).
//  Removes the inert v13 copy (flags.chris-premades).
// =====================================================================
const ENTRY = 'Nix Eldritch Blast beams';
 
const beams = async () => {
    // ELDRITCH BLAST: one window per beam (Nix Fix, v14 / CAT). roll / itemRollFinished / 10.
    // 1. Cast with your target(s) selected. With several targets you assign the beams.
    // 2. One dice window per beam opens, all at once, headed
    //    "[Target] 1d20 + ability + proficiency (+ other) | Damage 1dX + bonus".
    //    If Midi needs one more die (unexpected advantage, a crit), a small box asks.
    // 3. Each beam then resolves through Midi as normal with the dice you entered.
    const spell = workflow.item;
    const me = workflow.actor;
    const caster = workflow.token;                                   // Token placeable
    const acts = spell.system.activities?.contents ?? [];
    const beam = itemUtils.getActivityByIdentifier?.(spell, 'eldritchBlastBeam', {strict: false})
        ?? acts.find(a => a.type === 'attack' && a.id !== workflow.activity?.id);
    if (!beam || workflow.activity?.id === beam.id) return;          // this is a beam's own workflow
    if (!workflow.targets?.size || !caster) return;
 
    // ---- How many beams, and who gets them ----------------------------------------
    const level = actorUtils.getLevelOrCR?.(me) ?? me.system.details?.level ?? Math.floor(Number(me.system.details?.cr ?? 0));
    const bolts = 1 + Math.floor((level + 1) / 6);
    const targets = Array.from(workflow.targets).filter(t => t.actor);
    const plan = [];                                                 // one Token placeable per beam
    if (targets.length === 1) {
        for (let i = 0; i < bolts; i++) plan.push(targets[0]);
    } else {
        let left = bolts;
        while (left > 0) {
            const choice = await dialogUtils.selectTargetDialog(spell.name,
                'Assign ' + left + ' beam' + (left > 1 ? 's' : '') + ' to your targets.', targets.map(t => t.document),
                {type: 'selectAmount', skipDeadAndUnconscious: false, coverToken: caster.document, maxAmount: left});
            const selection = choice?.[0];
            if (!selection?.length) break;
            let given = 0;
            for (const s of selection) {
                const tok = s.document?.object ?? s.document ?? s.object;
                for (let j = 0; j < Number(s.value ?? 0) && given < left; j++) { plan.push(tok); given++; }
            }
            if (!given) break;
            left -= given;
        }
    }
    if (!plan.length) return;
 
    const dmgPart = beam.damage?.parts?.[0];
    const dmgFaces = Number(dmgPart?.denomination) || 10;
 
    // ---- Advantage / disadvantage guess per target (before Midi rolls) -------------
    const has = (doc, path) => { const v = foundry.utils.getProperty(doc, path); return !!v && v !== '0' && v !== 'false'; };
    const flagAny = (doc, base) => ['all', 'rsak', 'spell', 'attack.all', 'attack.rsak'].some(k => has(doc, base + '.' + k));
    const st = (doc, id) => doc?.statuses?.has?.(id);
    const needsSecondD20 = (t) => {
        const ta = t.actor;
        const adv = ['blinded', 'paralyzed', 'restrained', 'stunned', 'unconscious', 'petrified'].some(s => st(ta, s))
            || st(me, 'invisible') || st(me, 'hidden')
            || flagAny(me, 'flags.midi-qol.advantage') || flagAny(me, 'flags.midi-qol.advantage.attack')
            || flagAny(ta, 'flags.midi-qol.grants.advantage.attack') || has(ta, 'flags.midi-qol.grants.advantage.attack.all');
        const dis = ['blinded', 'poisoned', 'restrained', 'prone', 'frightened'].some(s => st(me, s))
            || st(ta, 'invisible') || (st(ta, 'prone') && tokenUtils.getDistance(caster.document, t.document) > 5)
            || flagAny(me, 'flags.midi-qol.disadvantage') || flagAny(me, 'flags.midi-qol.disadvantage.attack')
            || flagAny(ta, 'flags.midi-qol.grants.disadvantage.attack') || has(ta, 'flags.midi-qol.grants.disadvantage.attack.all');
        return adv || dis;
    };
 
    // ---- Window header -------------------------------------------------------------
    const abil = beam.ability || me.system.attributes?.spellcasting || 'cha';
    const mod = me.system.abilities?.[abil]?.mod ?? 0;
    const prof = me.system.attributes?.prof ?? 0;
    const toHit = Number(String(beam.labels?.toHit ?? '').replace(/[^\d-]/g, ''));
    const other = Number.isFinite(toHit) && String(beam.labels?.toHit ?? '').trim() !== '' ? toHit - mod - prof : 0;
    const dmgBonus = String(beam.labels?.damage?.[0]?.formula ?? beam.labels?.damages?.[0]?.formula ?? '').replace(/^\s*\d*d\d+\s*/, '').trim();
    const sign = n => (n < 0 ? ' - ' + Math.abs(n) : ' + ' + n);
    const header = (t, two) => '[' + t.document.name + '] ' + (two ? '2d20' : '1d20') + sign(mod) + sign(prof) + (other ? sign(other) : '')
        + '   |   Damage: 1d' + dmgFaces + (dmgBonus ? ' ' + dmgBonus : '');
 
    // ---- One window per beam, all at once --------------------------------------------
    const twoD20 = plan.map(t => needsSecondD20(t));
    // ---- Lucky (2024): asked before the dice windows, once per beam aimed at a Lucky character ----
    // A yes spends the point now and gives that beam's window two d20s; the beam's own
    // workflow then applies the Disadvantage without asking again (globalThis.nixLuckyPending).
    const luckyQueues = {};                                          // target actor uuid -> [yes/no per beam]
    const isLuckyFeat = i => i.type === 'feat' && /^lucky/i.test(i.name.trim()) && !/footwork/i.test(i.name)
        && [...(i.flags?.cat?.embeddedMacros ?? []), ...(i.flags?.['chris-premades']?.embeddedMacros ?? [])].some(m => m.name === 'Lucky: Disadvantage');
    for (let i = 0; i < plan.length; i++) {
        const t = plan[i];
        const ta = t.actor;
        if (!ta || ta.uuid === me.uuid || t.document.disposition === caster.document.disposition) continue;
        const lucky = ta.items.find(isLuckyFeat);
        if (!lucky) continue;
        const q = (luckyQueues[ta.uuid] ??= []);
        const n = plan.filter(p => p.actor?.uuid === ta.uuid).length;
        if (!(lucky.system.uses?.value > 0)) { q.push(false); continue; }
        const userId = queryUtils.firstOwner(ta, true) ?? game.user.id;
        const yes = await dialogUtils.confirm(lucky.name, '<b>' + me.name + '</b> is aiming ' + (n > 1 ? 'beam ' + (q.length + 1) + ' of ' + n : 'a beam')
            + ' of ' + spell.name + ' at <b>' + ta.name + '</b>.<br>Spend a Luck Point to give this attack roll Disadvantage? (' + lucky.system.uses.value + ' left)', {userId});
        q.push(!!yes);
        if (!yes) continue;
        await documentUtils.update(lucky, {'system.uses.spent': (lucky.system.uses.spent ?? 0) + 1});
        twoD20[i] = true;
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: ta}),
            content: '<b>' + lucky.name + ':</b> ' + ta.name + ' spends a Luck Point. That beam of ' + me.name + '\'s ' + spell.name + ' has Disadvantage.'});
    }
    globalThis.nixLuckyPending = Object.keys(luckyQueues).length ? {attacker: me.uuid, queues: luckyQueues} : null;
    const prerolls = await Promise.all(plan.map((t, i) => {
        const r = new Roll((twoD20[i] ? '2d20' : '1d20') + ' + 1d' + dmgFaces);
        Object.defineProperty(r, 'formula', {value: header(t, twoD20[i]), configurable: true});
        return r.evaluate();
    }));
    const valuesOf = (r) => {
        const [atk, dmg] = r.dice;
        return {atk: atk.results.map(x => x.result), dmg: dmg.results.map(x => x.result)};
    };
 
    // ---- Feed those dice to each beam's own Midi workflow ------------------------------
    const METHOD = 'nixBeamQueue';
    const queue = {};
    let current = '';
    const askManual = async (faces) => {
        const why = faces === 20 ? 'second d20 (advantage / disadvantage)' : 'extra d' + faces + ' (critical hit)';
        const v = await foundry.applications.api.DialogV2.prompt({
            window: {title: current + ': ' + why},
            content: '<p><b>' + current + '</b> needs a ' + why + '.</p><input type="number" name="v" min="1" max="' + faces + '" autofocus>',
            ok: {callback: (ev, button) => Number(button.form.elements.v.value)}
        }).catch(() => null);
        return Math.clamp(Number(v) || 1, 1, faces);
    };
    CONFIG.Dice.fulfillment.methods[METHOD] = {
        label: 'Eldritch Blast beam dice', icon: '<i class="fa-solid fa-bolt"></i>', interactive: false,
        handler: async (term) => (queue[term.faces]?.length ? queue[term.faces].shift() : await askManual(term.faces))
    };
    const original = foundry.utils.deepClone(game.settings.get('core', 'diceConfiguration') ?? {});
    const patched = {...original, d20: METHOD, ['d' + dmgFaces]: METHOD};
    const hooks = [];
    for (const h of ['midi-qol.AttackRollComplete', 'midi-qol.postAttackRollComplete', 'midi-qol.preDamageRoll'])
        hooks.push([h, Hooks.on(h, wf => { if (wf?.item?.uuid === spell.uuid) queue[20] = []; })]);
    for (const h of ['midi-qol.DamageRollComplete', 'midi-qol.postDamageRollComplete'])
        hooks.push([h, Hooks.on(h, wf => { if (wf?.item?.uuid === spell.uuid) queue[dmgFaces] = []; })]);
 
    try {
        await game.settings.set('core', 'diceConfiguration', patched);
        for (let i = 0; i < plan.length; i++) {
            const t = plan[i];
            const v = valuesOf(prerolls[i]);
            queue[20] = [...v.atk];
            queue[dmgFaces] = [...v.dmg];
            current = '[' + t.document.name + ']';
            if (!t.actor || ((t.actor.system.attributes?.hp?.value ?? 1) <= 0 && plan.length > 1)) { luckyQueues[t.actor?.uuid]?.shift(); continue; }   // already down
            await workflowUtils.syntheticActivityRoll(beam, [t], {options: {targetConfirmation: 'none', nixBeam: i}});
            queue[20] = []; queue[dmgFaces] = [];
        }
    } finally {
        await game.settings.set('core', 'diceConfiguration', original);
        for (const [h, id] of hooks) Hooks.off(h, id);
        // Chris's Premades 2's own one-workflow-per-target macro runs after this one:
        // clear the targets so it stands down.
        workflow.targets = new Set();
        globalThis.nixLuckyPending = null;
    }
};
 
const MACRO = '// =====================================================================\n'
    + '//  ELDRITCH BLAST: one window per beam (Nix Fix, Foundry v14 / CAT)\n'
    + '//  roll / itemRollFinished / 10. Written by install-eldritch-blast.js (v14).\n'
    + '// =====================================================================\n'
    + 'return await (' + beams.toString() + ')();\n';
 
const actors = new Map();
game.actors.forEach(a => actors.set(a.uuid, {actor: a, where: 'sidebar'}));
for (const scene of game.scenes) for (const t of scene.tokens) if (!t.actorLink && t.actor) actors.set(t.actor.uuid, {actor: t.actor, where: 'token in ' + scene.name});
const done = [], skipped = [];
for (const {actor, where} of actors.values()) {
    for (const item of actor.items.filter(i => i.type === 'spell' && i.name.toLowerCase().trim() === 'eldritch blast')) {
        const acts = item.system.activities?.contents ?? [];
        const hasBeam = acts.length > 1 && acts.some(a => a.type === 'attack') && acts.some(a => a.type !== 'attack');
        if (!hasBeam) { skipped.push(actor.name + ' (' + where + ')'); continue; }
        const list = foundry.utils.deepClone(item.flags?.cat?.embeddedMacros ?? []).filter(m => m.name !== ENTRY);
        list.push({name: ENTRY, event: 'roll', pass: 'itemRollFinished', macros: [{priority: 10, macro: MACRO}]});
        const updates = {'flags.cat.embeddedMacros': list};
        const old = item.flags?.['chris-premades']?.embeddedMacros ?? [];
        if (old.some(m => m.name === ENTRY)) updates['flags.chris-premades.embeddedMacros'] = old.filter(m => m.name !== ENTRY);
        if (item.getFlag('world', 'nixEbCprInfo')) updates['flags.world.-=nixEbCprInfo'] = null;
        await item.update(updates);
        const cpr2 = item.flags?.cat?.automation?.source === 'chris-premades';
        const cpr1 = !!item.flags?.['chris-premades']?.info?.identifier;
        done.push(actor.name + ' (' + where + ')' + (cpr2 ? '' : cpr1 ? ': still the Chris\'s Premades 1 version (works, but re-applying it in the Medkit wipes this; run this again after)' : ''));
    }
}
await ChatMessage.create({whisper: [game.user.id], content: '<b>Eldritch Blast beam windows (v14) installed on:</b><br>' + (done.join('<br>') || '<i>none</i>')
    + (skipped.length ? '<br><br><b>Skipped (no separate beam attack activity; apply Chris\'s Premades 2\'s Eldritch Blast in the Medkit, then run this again):</b><br>' + skipped.join('<br>') : '')
    + '<br><br><i>Re-applying Eldritch Blast in the Medkit removes this script. Run this installer again afterwards.</i>'});
 