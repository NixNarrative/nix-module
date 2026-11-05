// =====================================================================
//  HELLSING ELBUR FIXES, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Hellsing selected, as GM). Safe to re-run.
//
//   - Hemocraft: spellcasting ability Intelligence (data only)
//   - Crimson Rite (Rite of the Flame): roll / activityRollFinished 50. The rite effect carries
//     roll / actorDamageRollBonuses 250 (+hemocraft die fire), rest / actorShort (ends on any rest)
//     and effect / deleted (takes the magical property back off)
//   - Blood Curse of Bloated Agony: roll / activityRollFinished 50; the curse effect on the target
//     carries roll / actorAttackRoll 50 (1d8 necrotic on its second attack in a turn)
//   - Shifting (Beasthide), Blood Maledict: data only
//   - Hybrid Transformation: Transform / Revert / Configure Look (activityRollFinished 50); the form
//     effect carries combat / actorTurnStart 50 (Bloodlust) and effect / deleted 50 (revert)
//  v14 changes from the v13 copy: CAT macros on activities and on the effects the macros create,
//  effectUtils.createEffects with system.changes `type` and {value, units} durations,
//  documentUtils, DialogV2 for Configure Look (no DialogApp), TokenDocuments for getDistance.
// =====================================================================

const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Hellsing fixes (v14): select Hellsing\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
const run = fn => 'return await (' + fn.toString() + ')();';
// A macro that builds effects carrying their own macros gets those as NESTED.<key> strings.
const withNested = (fn, nested) => 'return await (async () => {\nconst NESTED = ' + JSON.stringify(nested) + ';\nreturn await (' + fn.toString() + ')();\n})();';
const entryCode = (name, event, pass, priority, macro) => ({name, event, pass, macros: [{priority, macro}]});
const entry = (name, event, pass, priority, fn) => entryCode(name, event, pass, priority, run(fn));
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
const premadeOn = item => {
    if (!item) return null;
    const cat = item.flags?.cat ?? {};
    if (cat.automation?.source === 'chris-premades' || Object.values(cat.macros ?? {}).flat().some(m => m?.source === 'chris-premades')) return 'cpr2';
    if (item.flags?.['chris-premades']?.info?.identifier) return 'cpr1';
    return null;
};
function whatsLeft(skip = /^$/) {
    const later = [];
    const cpr1 = actor.items.filter(i => premadeOn(i) === 'cpr1' && !skip.test(i.name));
    if (cpr1.length) later.push('Still tagged for Chris\'s Premades 1 (does nothing on v14; re-apply in the Medkit if Chris\'s Premades 2 has it): ' + cpr1.map(i => i.name).join(', ') + '.');
    const dupes = Object.entries(actor.items.contents.reduce((m, i) => ((m[i.type + '|' + i.name] = (m[i.type + '|' + i.name] ?? 0) + 1), m), {}))
        .filter(([k, n]) => n > 1 && !k.startsWith('class|')).map(([k, n]) => k.split('|')[1] + ' x' + n);
    if (dupes.length) later.push('Duplicate items (check which to delete): ' + dupes.join(', ') + '.');
    const stale = actor.effects.filter(e => (e.flags?.['chris-premades'] && !e.flags?.cat && !e.disabled)
        || ['nixCrimsonRite', 'nixHybridForm'].includes(e.flags?.['chris-premades']?.info?.identifier));
    if (stale.length) later.push('Effects on the actor from Chris\'s Premades 1 / the v13 macros (inert on v14): ' + stale.map(e => e.name).join(', ') + '. Delete them before testing.');
    for (const l of later) report.push('<li><i>' + l + '</i></li>');
}
const actByName = (item, name) => (item.system.activities?.contents ?? []).find(a => lc(a.name) === lc(name));
async function ensureActivity(item, name, type, data) {
    let act = actByName(item, name);
    if (act && act.type !== type) { await item.update({['system.activities.-=' + act.id]: null}); act = null; }
    if (!act) await item.createActivity(type, {name, ...data}, {renderSheet: false});
    else await act.update(data);
    return actByName(actor.items.get(item.id), name);
}
// =====================================================================
//  Macros
// =====================================================================

// ---- Crimson Rite: Rite of the Flame ----------------------------------------------------------
// roll / activityRollFinished / 50. Pick one weapon; he takes 1 hemocraft die necrotic (can't be
// reduced); that weapon deals +1 hemocraft die fire and counts as magical until his next rest.
const riteCast = async () => {
    const me = workflow.actor;
    const item = workflow.item;
    const ID = 'nixCrimsonRite';
    const bh = Object.values(me.classes ?? {}).find(c => /blood/i.test(c.name ?? '') || /blood/i.test(c.system?.identifier ?? ''));
    const lvl = bh?.system?.levels ?? me.system.details?.level ?? 1;
    const die = lvl >= 16 ? '1d10' : lvl >= 11 ? '1d8' : lvl >= 5 ? '1d6' : '1d4';
    const weapons = me.items.filter(i => i.type === 'weapon' && (i.system.equipped || /^unarmed strike/i.test(i.name.trim())));
    if (!weapons.length) return void ui.notifications.warn(item.name + ': no equipped weapon.');
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const weapon = weapons.length === 1 ? weapons[0]
        : await dialogUtils.selectDocumentDialog(item.name, 'Which weapon takes the Rite of the Flame?', weapons, {userId});
    if (!weapon) return;
    const old = actorUtils.getEffectByIdentifier(me, ID);
    if (old) await documentUtils.deleteDocument(old);
    const unarmed = /^unarmed strike/i.test(weapon.name.trim());
    const ids = [weapon.id];
    if (unarmed) for (const it of me.items) if (/hybrid transformation features|predatory strike/i.test(it.name)) ids.push(it.id);
    const added = [];
    if (!unarmed) {
        const props = new Set(weapon.system.properties ?? []);
        if (!props.has('mgc')) { props.add('mgc'); await documentUtils.update(weapon, {'system.properties': [...props]}); added.push(weapon.id); }
    }
    const cost = await new Roll(die).evaluate();
    await cost.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: item.name + ': the rite takes its toll (necrotic, can\'t be reduced)'});
    await me.applyDamage(cost.total);
    await effectUtils.createEffects(me, [{
        name: 'Crimson Rite: Flame (' + weapon.name + ')', img: item.img, origin: item.uuid, duration: {value: 86400, units: 'seconds'},
        description: weapon.name + ' deals an extra ' + die + ' fire damage on a hit and counts as magical. Ends when he finishes a short or long rest.',
        flags: {world: {nixRite: {ids, die, added}}, cat: {identifier: ID, embeddedMacros: [
            {name: 'Rite: fire damage', event: 'roll', pass: 'actorDamageRollBonuses', macros: [{priority: 250, macro: NESTED.hit}]},
            {name: 'Rite: rest', event: 'rest', pass: 'actorShort', macros: [{priority: 50, macro: NESTED.rest}]},
            {name: 'Rite: end', event: 'effect', pass: 'deleted', macros: [{priority: 50, macro: NESTED.end}]}]}}
    }]);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + item.name + ':</b> ' + me.name + '\'s ' + weapon.name
        + ' burns with the Rite of the Flame (+' + die + ' fire, magical) until his next rest. He takes ' + cost.total + ' necrotic damage.'});
};
// On the rite effect: roll / actorDamageRollBonuses / 250.
const riteHit = async () => {
    const rite = document.flags?.world?.nixRite;
    if (!rite || !workflow?.item || !rite.ids.includes(workflow.item.id)) return;
    if (!workflow.hitTargets?.size) return;
    await workflowUtils.bonusDamage(workflow, rite.die + '[fire]', {damageType: 'fire'});
};
// On the rite effect: rest / actorShort (any rest) / 50.
const riteRest = async () => { await documentUtils.deleteDocument(document); };
// On the rite effect: effect / deleted / 50.
const riteEnd = async () => {
    const me = document.parent;
    for (const id of document.flags?.world?.nixRite?.added ?? []) {
        const w = me?.items?.get(id);
        if (!w) continue;
        const p = new Set(w.system.properties ?? []);
        p.delete('mgc');
        await documentUtils.update(w, {'system.properties': [...p]});
    }
};

// ---- Blood Curse of Bloated Agony --------------------------------------------------------------
// roll / activityRollFinished / 50. Until the end of his next turn the target has Disadvantage on
// Str and Dex checks and takes 1d8 necrotic if it makes more than one attack on its turn.
// Amplify: 1 minute (Con save at the end of each of its turns ends it); he takes a hemocraft die.
const curseCast = async () => {
    const me = workflow.actor;
    const item = workflow.item;
    const target = Array.from(workflow.targets ?? [])[0];
    if (!target?.actor) return void ui.notifications.warn(item.name + ': target a creature first.');
    const bh = Object.values(me.classes ?? {}).find(c => /blood/i.test(c.name ?? '') || /blood/i.test(c.system?.identifier ?? ''));
    const lvl = bh?.system?.levels ?? me.system.details?.level ?? 1;
    const die = lvl >= 16 ? '1d10' : lvl >= 11 ? '1d8' : lvl >= 5 ? '1d6' : '1d4';
    const dc = 8 + Number(me.system.attributes?.prof ?? 2) + Number(me.system.abilities?.int?.mod ?? 0);
    const userId = queryUtils.firstOwner(me, true) ?? game.user.id;
    const amp = await dialogUtils.confirm(item.name, 'Amplify the curse? You take ' + die + ' necrotic damage (can\'t be reduced). It lasts 1 minute instead, and '
        + target.document.name + ' makes a DC ' + dc + ' Constitution save at the end of each of its turns to end it.', {userId});
    if (amp) {
        const r = await new Roll(die).evaluate();
        await r.toMessage({speaker: ChatMessage.getSpeaker({actor: me}), flavor: item.name + ': Amplify (necrotic, can\'t be reduced)'});
        await me.applyDamage(r.total);
    }
    const ID = 'nixBloatedAgony';
    const old = actorUtils.getEffectByIdentifier(target.actor, ID);
    if (old) await documentUtils.deleteDocument(old);
    const changes = [
        {key: 'flags.midi-qol.disadvantage.ability.check.str', type: 'custom', value: '1', priority: 20},
        {key: 'flags.midi-qol.disadvantage.ability.check.dex', type: 'custom', value: '1', priority: 20}];
    if (amp) changes.push({key: 'flags.midi-qol.OverTime', type: 'custom', value: 'turn=end, saveAbility=con, saveDC=' + dc + ', label=Bloated Agony', priority: 20});
    await effectUtils.createEffects(target.actor, [{
        name: 'Blood Curse of Bloated Agony', img: item.img, origin: item.uuid,
        duration: amp ? {value: 10, units: 'rounds'} : {value: 2, units: 'rounds'},
        description: 'Disadvantage on Strength and Dexterity checks. Takes 1d8 necrotic damage if it makes more than one attack during its turn.'
            + (amp ? ' Constitution save (DC ' + dc + ') at the end of each of its turns ends the curse.' : ''),
        system: {changes},
        flags: {dae: amp ? {} : {specialDuration: ['turnEndSource']}, world: {nixAgonySource: me.uuid},
            cat: {identifier: ID, embeddedMacros: [{name: 'Bloated Agony: second attack', event: 'roll', pass: 'actorAttackRoll', macros: [{priority: 50, macro: NESTED.agony}]}]}}
    }]);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + item.name + (amp ? ' (Amplified)' : '') + ':</b> ' + target.document.name
        + '\'s body swells. Disadvantage on Strength and Dexterity checks, and 1d8 necrotic if it attacks more than once on its turn'
        + (amp ? '. Lasts 1 minute (DC ' + dc + ' Constitution save at the end of each of its turns).' : ', until the end of ' + me.name + '\'s next turn.')});
};
// On the curse effect (on the cursed creature): roll / actorAttackRoll / 50.
const agonyAttack = async () => {
    const eff = document;
    const me = eff.parent;
    if (!workflow?.attackRoll || workflow.actor?.uuid !== me?.uuid) return;
    const c = game.combat;
    if (!c?.started || c.combatant?.actor?.uuid !== me.uuid) return;
    const key = c.id + ':' + c.round + ':' + c.turn;
    const st = eff.flags?.world?.nixAgony ?? {};
    const same = st.key === key;
    const count = same ? (st.count ?? 0) + 1 : 1;
    const done = same && st.done;
    await documentUtils.setFlag(eff, 'world', 'nixAgony', {key, count, done: !!(done || count >= 2)});
    if (count < 2 || done) return;
    const src = (await fromUuid(eff.flags?.world?.nixAgonySource ?? '')) ?? me;
    const tok = workflow.token;
    if (!tok) return;
    const data = {name: 'Bloated Agony', type: 'feat', img: eff.img, system: {activities: {nixAgonyDmg00001: {
        _id: 'nixAgonyDmg00001', type: 'damage', name: 'Bloated Agony', activation: {type: 'special'},
        damage: {parts: [{number: 1, denomination: 8, bonus: '', types: ['necrotic'], custom: {enabled: false}, scaling: {}}]}}}}};
    await workflowUtils.syntheticItemDataRoll(data, src, [tok]);
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Bloated Agony:</b> ' + tok.document.name + ' attacked twice this turn and its swollen body tears (1d8 necrotic).'});
};

// ---- Hybrid Transformation ------------------------------------------------------------------
// "Transform": roll / activityRollFinished / 50. 1 hour: Feral Might, Resilient Hide, Bloodlust.
const hybridTransform = async () => {
    const me = workflow.actor;
    const item = workflow.item;
    const tok = workflow.token ?? actorUtils.getFirstToken(me)?.object;
    const ID = 'nixHybridForm';
    const old = actorUtils.getEffectByIdentifier(me, ID);
    if (old) await documentUtils.deleteDocument(old);
    const bh = Object.values(me.classes ?? {}).find(c => /blood/i.test(c.name ?? '') || /blood/i.test(c.system?.identifier ?? ''));
    const lvl = bh?.system?.levels ?? me.system.details?.level ?? 1;
    const might = lvl >= 18 ? 3 : lvl >= 11 ? 2 : 1;
    const heavy = me.items.some(i => i.type === 'equipment' && i.system.equipped && i.system.type?.value === 'heavy');
    const changes = [
        {key: 'flags.midi-qol.advantage.ability.check.str', type: 'custom', value: '1', priority: 20},
        {key: 'flags.midi-qol.advantage.ability.save.str', type: 'custom', value: '1', priority: 20},
        {key: 'system.bonuses.mwak.damage', type: 'add', value: '+' + might, priority: 20},
        {key: 'system.traits.dr.value', type: 'add', value: 'bludgeoning', priority: 20},
        {key: 'system.traits.dr.value', type: 'add', value: 'piercing', priority: 20},
        {key: 'system.traits.dr.value', type: 'add', value: 'slashing', priority: 20},
        {key: 'system.traits.dr.bypasses', type: 'add', value: 'mgc', priority: 20},
        {key: 'system.traits.dr.bypasses', type: 'add', value: 'sil', priority: 20}];
    if (!heavy) changes.push({key: 'system.attributes.ac.bonus', type: 'add', value: '+1', priority: 20});
    const cfg = {intro: '', loop: '', size: 2.5, image: '', ...(item.flags?.world?.nixHybridAnim ?? {})};
    const pick = l => l.filter(Boolean).find(f => { try { return Sequencer.Database.entryExists(f) || /\.(webm|webp|png|gif|mp4)$/i.test(f); } catch { return false; } });
    let oldImg = null;
    if (tok && cfg.image) { oldImg = tok.document.texture.src; await documentUtils.update(tok.document, {'texture.src': cfg.image}); }
    await effectUtils.createEffects(me, [{
        name: 'Hybrid Transformation', img: item.img, origin: item.uuid, duration: {value: 3600, units: 'seconds'},
        description: 'Feral Might: Advantage on Strength checks and saves, +' + might + ' melee damage. Resilient Hide: Resistance to nonmagical, non-silvered bludgeoning, piercing and slashing'
            + (heavy ? '' : ', +1 AC') + '. Predatory Strikes: Dex unarmed strikes (1d6), one extra as a Bonus Action after an Attack-action unarmed strike. Bloodlust below half HP.',
        system: {changes},
        flags: {dae: {specialDuration: ['zeroHP']}, world: {nixHybrid: {tokenUuid: tok?.document.uuid ?? null, oldImg}},
            cat: {identifier: ID, embeddedMacros: [
                {name: 'Hybrid: Bloodlust', event: 'combat', pass: 'actorTurnStart', macros: [{priority: 50, macro: NESTED.bloodlust}]},
                {name: 'Hybrid: revert', event: 'effect', pass: 'deleted', macros: [{priority: 50, macro: NESTED.end}]}]}}
    }]);
    if (tok && globalThis.Sequencer) {
        const intro = pick([cfg.intro, 'jb2a.impact.ground_crack.orange.02', 'jb2a.impact.ground_crack.01.orange', 'jb2a.divine_smite.caster.reversed.red', 'jb2a.impact.003.dark_red']);
        const loop = pick([cfg.loop, 'jb2a.token_border.circle.spinning.red.001', 'jb2a.markers.fear.dark_red.03', 'jb2a.bless.200px.loop.red', 'jb2a.energy_field.02.below.red']);
        const seq = new Sequence();
        if (intro) seq.effect().file(intro).atLocation(tok).size(Number(cfg.size) || 2.5, {gridUnits: true});
        if (loop) seq.effect().file(loop).attachTo(tok).belowTokens().size(Number(cfg.size) || 2.5, {gridUnits: true}).fadeIn(500).fadeOut(500).persist().name('Hybrid ' + me.id);
        try { await seq.play(); } catch (err) { console.warn(err); }
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>' + item.name + ':</b> ' + me.name + ' gives in to the curse and becomes a <b>hybrid beast</b> for up to 1 hour. '
        + 'Advantage on Strength checks and saves, +' + might + ' melee damage, resistant to nonmagical, non-silvered physical damage' + (heavy ? '' : ', +1 AC') + '.'});
};
// On the form effect: effect / deleted / 50.
const hybridEnd = async () => {
    const me = document.parent;
    const st = document.flags?.world?.nixHybrid ?? {};
    if (globalThis.Sequencer) await Sequencer.EffectManager.endEffects({name: 'Hybrid ' + me.id});
    if (st.tokenUuid && st.oldImg) { const t = await fromUuid(st.tokenUuid); if (t) await documentUtils.update(t, {'texture.src': st.oldImg}); }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Hybrid Transformation:</b> ' + me.name + ' returns to his normal form.'});
};
// On the form effect: combat / actorTurnStart / 50. Below half HP: DC 8 Wis save (auto-fail while
// concentrating) or he must move to the nearest creature and attack it.
const hybridBloodlust = async () => {
    const me = document.parent;
    const hp = me.system.attributes.hp;
    if (!(hp.value < hp.max / 2) || hp.value <= 0) return;
    const conc = me.statuses?.has('concentrating') || me.effects.some(e => !e.disabled && /concentrat/i.test(e.name));
    let ok = false;
    if (!conc) {
        const res = await me.rollSavingThrow({ability: 'wis', target: 8}, {configure: false}, {flavor: 'Bloodlust (DC 8 Wisdom)'});
        const r = Array.isArray(res) ? res[0] : res;
        ok = Number(r?.total) >= 8;
    }
    if (ok) return void await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Bloodlust:</b> ' + me.name + ' holds back the beast.'});
    const mine = actorUtils.getFirstToken(me);
    let target = null;
    if (mine) {
        const others = canvas.tokens.placeables.filter(t => t.actor && t.id !== mine.id && !t.document.hidden && (t.actor.system.attributes?.hp?.value ?? 1) > 0);
        const d = others.map(t => [t, tokenUtils.getDistance(mine, t.document)]);
        const min = Math.min(...d.map(x => x[1]));
        const near = d.filter(x => x[1] === min).map(x => x[0]);
        target = near.length ? near[Math.floor(Math.random() * near.length)] : null;
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Bloodlust!</b> ' + me.name + (conc ? ' is concentrating and automatically fails the save.' : ' fails the DC 8 Wisdom save.')
        + ' He must move straight toward ' + (target ? '<b>' + target.document.name + '</b> (the nearest creature' + (target.document.disposition === mine?.disposition ? ', <i>even though it is an ally</i>' : '') + ')' : 'the nearest creature')
        + ' and use the Attack action against it. He regains control once the attack is resolved.'});
};
// "Configure Transformation Look": roll / activityRollFinished / 50. DialogV2 form.
const hybridConfig = async () => {
    const item = workflow.item;
    const cur = {intro: 'jb2a.impact.ground_crack.orange.02', loop: 'jb2a.token_border.circle.spinning.red.001', size: 2.5, image: '', ...(item.flags?.world?.nixHybridAnim ?? {})};
    const esc = s => foundry.utils.escapeHTML(String(s ?? ''));
    const row = (label, name, value, type = 'text') => '<div class="form-group"><label>' + label + '</label><div class="form-fields"><input type="' + type + '" name="' + name + '" value="' + esc(value) + '"'
        + (type === 'number' ? ' step="0.5"' : '') + '></div></div>';
    const content = '<p>Paste a Sequencer database path (Sequencer > Database Viewer, click a name to copy) or a file path. Leave the token image blank to keep his art.</p>'
        + row('Transformation burst (plays once)', 'intro', cur.intro) + row('Aura while transformed (loops)', 'loop', cur.loop)
        + row('Size (grid squares)', 'size', cur.size, 'number') + row('Hybrid token image (file path, optional)', 'image', cur.image);
    const res = await foundry.applications.api.DialogV2.prompt({
        window: {title: item.name + ': Look'}, position: {width: 640}, content, rejectClose: false,
        ok: {label: 'Save', callback: (event, button) => {
            const f = button.form.elements;
            return {intro: String(f.intro?.value ?? '').trim(), loop: String(f.loop?.value ?? '').trim(), size: Number(f.size?.value) || 2.5, image: String(f.image?.value ?? '').trim()};
        }}});
    if (!res) return;
    await documentUtils.setFlag(item, 'world', 'nixHybridAnim', res);
    ui.notifications.info(item.name + ': look saved.');
};
// "Revert": roll / activityRollFinished / 50.
const hybridRevert = async () => {
    const eff = actorUtils.getEffectByIdentifier(workflow.actor, 'nixHybridForm');
    if (!eff) return void ui.notifications.info(workflow.actor.name + ' is not transformed.');
    await documentUtils.deleteDocument(eff);
};
const RITE_CODE = withNested(riteCast, {hit: run(riteHit), rest: run(riteRest), end: run(riteEnd)});
const CURSE_CODE = withNested(curseCast, {agony: run(agonyAttack)});
const HYBRID_CODE = withNested(hybridTransform, {bloodlust: run(hybridBloodlust), end: run(hybridEnd)});
// =====================================================================
//  Install
// =====================================================================

// ---- 1. Hemocraft DC ----------------------------------------------------------------------
{
    const bh = actor.items.find(i => i.type === 'class' && /blood/i.test(i.name));
    if (bh?.system?.spellcasting && bh.system.spellcasting.ability !== 'int') await bh.update({'system.spellcasting.ability': 'int'});
    if (actor.system.attributes?.spellcasting !== undefined && actor.system.attributes.spellcasting !== 'int') {
        try { await actor.update({'system.attributes.spellcasting': 'int'}); } catch (err) { console.warn(err); }
    }
    const dc = 8 + Number(actor.system.attributes.prof ?? 2) + Number(actor.system.abilities.int.mod ?? 0);
    report.push('<li>Hemocraft: spellcasting ability Intelligence. His curses use DC ' + dc + ' (8 + proficiency + Int) no matter what the sheet header shows.</li>');
}

// ---- 2. Crimson Rite: Rite of the Flame ---------------------------------------------------
{
    const rite = find(/^crimson rite/i);
    if (!rite) report.push('<li><b>Crimson Rite</b> not found.</li>');
    else {
        const borrowed = rite.effects.filter(e => /divine favor/i.test(e.name));
        if (borrowed.length) await rite.deleteEmbeddedDocuments('ActiveEffect', borrowed.map(e => e.id));
        const live = actor.effects.filter(e => /divine favor/i.test(e.name) && (!e.origin || String(e.origin).includes(rite.id)));
        if (live.length) await actor.deleteEmbeddedDocuments('ActiveEffect', live.map(e => e.id));
        if (!rite.system.activities.contents[0]) await rite.createActivity('utility', {name: 'Rite of the Flame'}, {renderSheet: false});
        const act = actor.items.get(rite.id).system.activities.contents[0];
        await act.update({'activation.type': 'bonus', 'activation.override': true, effects: [], 'range.units': 'self', 'target.affects.type': ''});
        await dropOld(rite, ['Crimson Rite: Flame']);
        await setCat(actor.items.get(rite.id).system.activities.get(act.id), ['Crimson Rite: Flame'], [entryCode('Crimson Rite: Flame', 'roll', 'activityRollFinished', 50, RITE_CODE)]);
        // A rite left running from v13: its end macro is Chris's Premades 1, so end it here
        // (take Magical back off the weapon, delete the effect), as a rest would.
        const oldRite = actor.effects.find(e => e.flags?.['chris-premades']?.info?.identifier === 'nixCrimsonRite' && !e.flags?.cat?.identifier);
        if (oldRite) {
            for (const id of oldRite.flags?.world?.nixRite?.added ?? []) {
                const w = actor.items.get(id);
                if (!w) continue;
                const p = new Set(w.system.properties ?? []);
                if (p.delete('mgc')) await w.update({'system.properties': [...p]});
            }
            await actor.deleteEmbeddedDocuments('ActiveEffect', [oldRite.id]);
        }
        report.push('<li>Crimson Rite: <b>bonus action</b>: pick one equipped weapon (Unarmed Strike also covers his Predatory Strikes). He takes 1 hemocraft die of necrotic (can\'t be reduced), '
            + 'and that weapon deals +1 hemocraft die <b>fire</b> on hits and counts as magical until he finishes a short or long rest. Using it again moves the rite.'
            + (borrowed.length || live.length ? ' The borrowed Divine Favor effect was removed.' : '')
            + (oldRite ? ' The rite left running from v13 ("' + oldRite.name + '") was ended and its weapon is no longer Magical: use the rite again on v14.' : '') + '</li>');
    }
}

// ---- 3. Blood Curse of Bloated Agony ------------------------------------------------------
{
    const curse = find(/bloated agony/i);
    const maledict = find(/^blood maledict/i);
    if (!curse) report.push('<li><b>Blood Curse of Bloated Agony</b> not found.</li>');
    else {
        const bad = curse.effects.filter(e => /stun/i.test(e.name) || (e.statuses?.has?.('stunned')));
        if (bad.length) await curse.deleteEmbeddedDocuments('ActiveEffect', bad.map(e => e.id));
        if (!curse.system.activities.contents[0]) await curse.createActivity('utility', {name: 'Blood Curse of Bloated Agony'}, {renderSheet: false});
        const act = actor.items.get(curse.id).system.activities.contents[0];
        const upd = {'activation.type': 'bonus', 'activation.override': true, effects: [],
            'range.value': '30', 'range.units': 'ft', 'target.affects.type': 'creature', 'target.affects.count': '1'};
        if (maledict) upd['consumption.targets'] = [{type: 'itemUses', target: maledict.id, value: '1', scaling: {}}];
        await act.update(upd);
        await dropOld(curse, ['Bloated Agony: curse']);
        await setCat(actor.items.get(curse.id).system.activities.get(act.id), ['Bloated Agony: curse'], [entryCode('Bloated Agony: curse', 'roll', 'activityRollFinished', 50, CURSE_CODE)]);
        report.push('<li>Bloated Agony: target a creature within 30 ft and use it (bonus action'
            + (maledict ? ', spends 1 Blood Maledict use' : ', <b>Blood Maledict not found so it spends nothing</b>')
            + '). It asks whether to <b>Amplify</b>. The target gets Disadvantage on Strength and Dexterity checks and takes 1d8 necrotic the moment it makes a second attack on its turn (once per turn). '
            + 'Normal: ends at the end of his next turn. Amplified: 1 minute, Con save at the end of each of its turns, and he takes 1 hemocraft die necrotic.'
            + (bad.length ? ' The wrong Stunned effect was removed.' : '') + '</li>');
    }
}

// ---- 4. Shifting (Beasthide) ----------------------------------------------------------------
{
    const sh = find(/^shifting$/i) ?? find(/^shifting/i);
    if (!sh) report.push('<li><b>Shifting</b> not found.</li>');
    else {
        const acts = sh.system.activities.contents;
        const chosenAct = acts.find(a => /^chosen:/i.test(a.name ?? ''));
        const chosen = lc((chosenAct?.name ?? 'Chosen: Beasthide').replace(/^chosen:\s*/i, '')) || 'beasthide';
        const gone = [];
        const seen = new Set();
        let keepAct = null;
        for (const a of acts) {
            const n = lc(a.name);
            const variant = (n.match(/^shift\s+(\w+)/) ?? [])[1];
            const isLongtoothAttack = /longtooth attack/.test(n);
            const dupe = seen.has(n);
            seen.add(n);
            if (dupe || (variant && variant !== chosen) || (isLongtoothAttack && chosen !== 'longtooth')) { gone.push(a.name); await sh.update({['system.activities.-=' + a.id]: null}); continue; }
            if (variant === chosen && !keepAct) keepAct = a;
        }
        const fresh = actor.items.get(sh.id);
        const keepAct2 = keepAct ? fresh.system.activities.get(keepAct.id) : null;
        const usedIds = new Set((keepAct2?.effects ?? []).map(e => e._id ?? e.id));
        const delFx = [];
        let keptOne = false;
        for (const e of fresh.effects) {
            const v = (lc(e.name).match(/shifted:\s*(\w+)/) ?? [])[1];
            if (!v) continue;
            if (v !== chosen) { delFx.push(e.id); continue; }
            if (usedIds.size ? !usedIds.has(e.id) : keptOne) delFx.push(e.id); else keptOne = true;
        }
        if (delFx.length) await fresh.deleteEmbeddedDocuments('ActiveEffect', delFx);
        await fresh.update({'system.uses.max': '@prof', 'system.uses.recovery': [{period: 'lr', type: 'recoverAll'}]});
        let thp = '';
        if (keepAct2) {
            const formula = chosen === 'beasthide' ? '2 * @prof + 1d6' : '2 * @prof';
            const upd = {'consumption.targets': [{type: 'itemUses', target: '', value: '1', scaling: {}}], 'activation.type': 'bonus'};
            if (keepAct2.type === 'heal') {
                upd['healing.custom.enabled'] = true;
                upd['healing.custom.formula'] = formula;
                upd['healing.types'] = ['temphp'];
                thp = ' Temp HP is <b>' + formula.replace('@prof', 'proficiency') + '</b>.';
            } else thp = ' <b>Check:</b> the shift activity isn\'t a healing activity, so its temp HP wasn\'t changed (should be 2 x proficiency' + (chosen === 'beasthide' ? ' + 1d6' : '') + ').';
            await keepAct2.update(upd);
        }
        report.push('<li>Shifting (' + chosen + '): removed ' + (gone.length ? gone.join(', ') : 'no extra activities') + (delFx.length ? ' and ' + delFx.length + ' extra effect' + (delFx.length > 1 ? 's' : '') : '')
            + '. Uses: proficiency bonus per long rest (' + fresh.system.uses?.max + ').' + thp + '</li>');
    }
}

// ---- 5. Blood Maledict: proficiency-bonus uses --------------------------------------------
{
    const bm = find(/^blood maledict/i);
    if (!bm) report.push('<li><b>Blood Maledict</b> not found.</li>');
    else {
        await bm.update({'system.uses.max': '@prof', 'system.uses.recovery': [{period: 'sr', type: 'recoverAll'}]});
        report.push('<li>Blood Maledict: uses = proficiency bonus (' + actor.system.attributes.prof + '), all back on a short or long rest.</li>');
    }
}

// ---- 6. Hybrid Transformation ------------------------------------------------------------------
{
    const ht = find(/^hybrid transformation$/i) ?? find(/^hybrid transformation(?! features)/i);
    if (!ht) report.push('<li><b>Hybrid Transformation</b> not found.</li>');
    else {
        const oldFx = ht.effects.filter(e => !e.disabled);
        for (const e of oldFx) await e.update({disabled: true, transfer: false});
        const acts = ht.system.activities.contents;
        let tr = acts.find(a => /transform/i.test(a.name ?? '')) ?? acts.find(a => !/revert|look|configure/i.test(a.name ?? ''));
        if (!tr) tr = await ensureActivity(ht, 'Transform', 'utility', {});
        await tr.update({name: 'Transform', 'activation.type': 'bonus', 'activation.override': true, effects: [], 'range.units': 'self', 'target.affects.type': 'self',
            'consumption.targets': [{type: 'itemUses', target: '', value: '1', scaling: {}}]});
        if (!(ht.system.uses?.max)) await ht.update({'system.uses.max': '1', 'system.uses.recovery': [{period: 'sr', type: 'recoverAll'}]});
        const quiet = {activation: {type: 'special', value: null, override: true}, consumption: {targets: [], scaling: {allowed: false}}, range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true}};
        const rv = await ensureActivity(ht, 'Revert', 'utility', {img: 'icons/magic/control/silhouette-hold-change-blue.webp', ...quiet});
        const look = await ensureActivity(ht, 'Configure Transformation Look', 'utility', {img: 'icons/magic/symbols/runes-star-pentagon-orange.webp', ...quiet});
        await dropOld(ht, ['Hybrid: transform', 'Hybrid: revert', 'Hybrid: configure look']);
        const live = actor.items.get(ht.id);
        await setCat(live.system.activities.get(tr.id), ['Hybrid: transform'], [entryCode('Hybrid: transform', 'roll', 'activityRollFinished', 50, HYBRID_CODE)]);
        await setCat(live.system.activities.get(rv.id), ['Hybrid: revert'], [entry('Hybrid: revert', 'roll', 'activityRollFinished', 50, hybridRevert)]);
        await setCat(live.system.activities.get(look.id), ['Hybrid: configure look'], [entry('Hybrid: configure look', 'roll', 'activityRollFinished', 50, hybridConfig)]);
        report.push('<li>Hybrid Transformation: <b>Transform</b> (bonus action, ' + (live.system.uses?.max ?? 1) + '/short rest) plays a burst and a looping red aura on his token and applies, for 1 hour: '
            + 'Advantage on Strength checks and saves, +1 melee damage (+2 at 11th, +3 at 18th), Resistance to nonmagical non-silvered bludgeoning/piercing/slashing, +1 AC (not in heavy armor). '
            + 'In combat, <b>Bloodlust</b> runs at the start of each of his turns below half HP (DC 8 Wis save, auto-fail while concentrating; on a fail chat names the nearest creature he must attack). '
            + 'It ends at 0 HP, after 1 hour, or with <b>Revert</b> (free). <b>Configure Transformation Look</b> keeps the v13 choices.'
            + (oldFx.length ? ' Its old effect' + (oldFx.length > 1 ? 's were' : ' was') + ' switched off.' : '') + '</li>');
    }
    const rage = actor.items.find(i => /^rage$/i.test(i.name.trim()));
    if (rage) { await rage.delete(); report.push('<li>Removed the <b>Rage</b> stand-in: Hybrid Transformation replaces it.</li>'); }
}

// ---- 7. What's left ----------------------------------------------------------------------------
whatsLeft(/^(crimson rite|blood curse|hybrid transformation|shifting|blood maledict)/i);

await ChatMessage.create({whisper: [game.user.id], content: '<b>Hellsing fixes (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
