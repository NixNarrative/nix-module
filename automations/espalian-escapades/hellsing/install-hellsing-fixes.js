// =====================================================================
//  HELLSING ELBUR FIXES (Espalian Escapades): one-click INSTALLER (Script macro, run as GM)
//  Select Hellsing's token, then run. Safe to re-run.
//   - Hemocraft: spellcasting ability set to Intelligence (DC 8 + prof + Int)
//   - Crimson Rite: Rite of the Flame on ONE chosen weapon, bonus action, 1 hemocraft die of
//     necrotic to himself, +1 hemocraft die fire on hits, weapon counts as magical, ends on a rest
//     (replaces the borrowed Divine Favor effect)
//   - Blood Curse of Bloated Agony: real curse (no more Stunned), spends Blood Maledict,
//     optional Amplify (1 minute, Con save each turn end)
//   - Shifting: Beasthide only, one copy, temp HP 2 x prof + 1d6, prof-bonus uses per long rest
//   - Blood Maledict: uses = proficiency bonus, back on a short rest
//   - Hybrid Transformation: Transform / Revert / Configure Look, like Rage down to the
//     animations (optional hybrid token art), Bloodlust check at turn start. Rage stand-in removed.
// =====================================================================
const SCRIPTS = {
 RITE_CAST: String.raw`await (async () => {
// Crimson Rite (Rite of the Flame): pick one weapon. Hellsing takes 1 hemocraft die of
// necrotic damage that can't be reduced; that weapon deals +1 hemocraft die fire and counts
// as magical until he finishes a short or long rest.
const actor = workflow.actor;
const item = workflow.item;
const ID = 'nixCrimsonRite';
const bh = Object.values(actor.classes ?? {}).find(c => /blood/i.test(c.name ?? '') || /blood/i.test(c.system?.identifier ?? ''));
const lvl = bh?.system?.levels ?? actor.system.details?.level ?? 1;
const die = lvl >= 16 ? '1d10' : lvl >= 11 ? '1d8' : lvl >= 5 ? '1d6' : '1d4';
const weapons = actor.items.filter(i => i.type === 'weapon' && (i.system.equipped || /^unarmed strike/i.test(i.name.trim())));
if (!weapons.length) { ui.notifications.warn(item.name + ': no equipped weapon.'); return; }
const weapon = weapons.length === 1 ? weapons[0]
    : await dialogUtils.selectDocumentDialog(item.name, 'Which weapon takes the Rite of the Flame?', weapons, {addNoneDocument: true});
if (!weapon) return;
const old = effectUtils.getEffectByIdentifier(actor, ID);
if (old) await genericUtils.remove(old);
const ids = [weapon.id];
if (/^unarmed strike/i.test(weapon.name.trim())) {
    for (const it of actor.items) if (/hybrid transformation features|predatory strike/i.test(it.name)) ids.push(it.id);
}
const added = [];
if (weapon.type === 'weapon' && !/^unarmed strike/i.test(weapon.name.trim())) {
    const props = new Set(weapon.system.properties ?? []);
    if (!props.has('mgc')) { props.add('mgc'); await genericUtils.update(weapon, {'system.properties': [...props]}); added.push(weapon.id); }
}
const cost = await new Roll(die).evaluate();
await cost.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: item.name + ': the rite takes its toll (necrotic, can\'t be reduced)'});
await actor.applyDamage(cost.total);
await effectUtils.createEffect(actor, {
    name: 'Crimson Rite: Flame (' + weapon.name + ')', img: item.img, origin: item.uuid, duration: {seconds: 86400},
    description: weapon.name + ' deals an extra ' + die + ' fire damage on a hit and counts as magical. Ends when he finishes a short or long rest.',
    flags: {dae: {specialDuration: ['shortRest', 'longRest']}, world: {nixRite: {ids, die, added}},
        'chris-premades': {embeddedMacros: [
            {name: 'Rite: fire damage', type: 'midi-actor', pass: 'damageRollComplete', priority: 250, macro: SCRIPTS_HIT},
            {name: 'Rite: end', type: 'effect', pass: 'deleted', priority: 50, macro: SCRIPTS_END}]}}
}, {identifier: ID});
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + '\'s ' + weapon.name
    + ' burns with the Rite of the Flame (+' + die + ' fire, magical) until his next rest. He takes ' + cost.total + ' necrotic damage.'});
})();`,
 RITE_HIT: String.raw`await (async () => {
const eff = trigger.entity;
const rite = eff.flags?.world?.nixRite;
if (!rite || !workflow?.item || !rite.ids.includes(workflow.item.id)) return;
if (!workflow.hitTargets?.size || !workflow.damageRolls?.length) return;
await workflowUtils.bonusDamage(workflow, rite.die + '[fire]', {damageType: 'fire'});
})();`,
 RITE_END: String.raw`await (async () => {
const eff = trigger.entity;
const actor = eff.parent;
for (const id of eff.flags?.world?.nixRite?.added ?? []) {
    const w = actor?.items?.get(id);
    if (!w) continue;
    const p = new Set(w.system.properties ?? []);
    p.delete('mgc');
    await genericUtils.update(w, {'system.properties': [...p]});
}
})();`,
 CURSE_CAST: String.raw`await (async () => {
// Blood Curse of Bloated Agony. Until the end of Hellsing's next turn the target has
// Disadvantage on Strength and Dexterity checks and takes 1d8 necrotic if it makes more
// than one attack on its turn. Amplify: lasts 1 minute (Con save at the end of each of its
// turns ends it) and Hellsing takes 1 hemocraft die of necrotic damage.
const actor = workflow.actor;
const item = workflow.item;
const target = Array.from(workflow.targets ?? [])[0];
if (!target?.actor) { ui.notifications.warn(item.name + ': target a creature first.'); return; }
const bh = Object.values(actor.classes ?? {}).find(c => /blood/i.test(c.name ?? '') || /blood/i.test(c.system?.identifier ?? ''));
const lvl = bh?.system?.levels ?? actor.system.details?.level ?? 1;
const die = lvl >= 16 ? '1d10' : lvl >= 11 ? '1d8' : lvl >= 5 ? '1d6' : '1d4';
const dc = 8 + Number(actor.system.attributes?.prof ?? 2) + Number(actor.system.abilities?.int?.mod ?? 0);
const amp = await dialogUtils.confirm(item.name, 'Amplify the curse? You take ' + die + ' necrotic damage (can\'t be reduced). It lasts 1 minute instead, and '
    + target.document.name + ' makes a DC ' + dc + ' Constitution save at the end of each of its turns to end it.');
if (amp) {
    const r = await new Roll(die).evaluate();
    await r.toMessage({speaker: ChatMessage.getSpeaker({actor}), flavor: item.name + ': Amplify (necrotic, can\'t be reduced)'});
    await actor.applyDamage(r.total);
}
const ID = 'nixBloatedAgony';
const old = effectUtils.getEffectByIdentifier(target.actor, ID);
if (old) await genericUtils.remove(old);
const changes = [
    {key: 'flags.midi-qol.disadvantage.ability.check.str', mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: '1', priority: 20},
    {key: 'flags.midi-qol.disadvantage.ability.check.dex', mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: '1', priority: 20}];
if (amp) changes.push({key: 'flags.midi-qol.OverTime', mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
    value: 'turn=end, saveAbility=con, saveDC=' + dc + ', label=Bloated Agony', priority: 20});
await effectUtils.createEffect(target.actor, {
    name: 'Blood Curse of Bloated Agony', img: item.img, origin: item.uuid,
    duration: amp ? {seconds: 60, rounds: 10} : {seconds: 12, rounds: 2},
    description: 'Disadvantage on Strength and Dexterity checks. Takes 1d8 necrotic damage if it makes more than one attack during its turn.'
        + (amp ? ' Constitution save (DC ' + dc + ') at the end of each of its turns ends the curse.' : ''),
    changes,
    flags: {dae: amp ? {} : {specialDuration: ['turnEndSource']}, world: {nixAgonySource: actor.uuid},
        'chris-premades': {embeddedMacros: [{name: 'Bloated Agony: second attack', type: 'midi-actor', pass: 'postAttackRoll', priority: 50, macro: SCRIPTS_AGONY}]}}
}, {identifier: ID});
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + (amp ? ' (Amplified)' : '') + ':</b> ' + target.document.name
    + '\'s body swells. Disadvantage on Strength and Dexterity checks, and 1d8 necrotic if it attacks more than once on its turn'
    + (amp ? '. Lasts 1 minute (DC ' + dc + ' Constitution save at the end of each of its turns).' : ', until the end of ' + actor.name + '\'s next turn.')});
})();`,
 AGONY_ATTACK: String.raw`await (async () => {
const eff = trigger.entity;
const me = eff.parent;
if (!workflow?.attackRoll || workflow.actor?.uuid !== me?.uuid) return;
const c = game.combat;
if (!c?.started || c.combatant?.actor?.uuid !== me.uuid) return;
const key = c.id + ':' + c.round + ':' + c.turn;
const st = eff.flags?.world?.nixAgony ?? {};
const same = st.key === key;
const count = same ? (st.count ?? 0) + 1 : 1;
const done = same && st.done;
await eff.setFlag('world', 'nixAgony', {key, count, done: !!(done || count >= 2)});
if (count < 2 || done) return;
const src = (await fromUuid(eff.flags?.world?.nixAgonySource ?? '')) ?? me;
const tok = workflow.token;
if (!tok) return;
const data = {name: 'Bloated Agony', type: 'feat', img: eff.img, system: {activities: {nixAgonyDmg00001: {
    _id: 'nixAgonyDmg00001', type: 'damage', name: 'Bloated Agony', activation: {type: 'special'},
    damage: {parts: [{number: 1, denomination: 8, bonus: '', types: ['necrotic'], custom: {enabled: false}, scaling: {}}]}}}}};
await workflowUtils.syntheticItemDataRoll(data, src, [tok]);
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: me}), content: '<b>Bloated Agony:</b> ' + tok.document.name + ' attacked twice this turn and its swollen body tears (1d8 necrotic).'});
})();`,
 HYBRID_TRANSFORM: String.raw`await (async () => {
// Hybrid Transformation (Order of the Lycan): bonus action, 1 hour. Feral Might, Resilient Hide,
// Predatory Strikes, Bloodlust. Plays the transformation animation and (optionally) swaps the token art.
const actor = workflow.actor;
const item = workflow.item;
const token = workflow.token ?? actorUtils.getFirstToken(actor);
const ID = 'nixHybridForm';
const old = effectUtils.getEffectByIdentifier(actor, ID);
if (old) await genericUtils.remove(old);
const bh = Object.values(actor.classes ?? {}).find(c => /blood/i.test(c.name ?? '') || /blood/i.test(c.system?.identifier ?? ''));
const lvl = bh?.system?.levels ?? actor.system.details?.level ?? 1;
const might = lvl >= 18 ? 3 : lvl >= 11 ? 2 : 1;
const heavy = actor.items.some(i => i.type === 'equipment' && i.system.equipped && i.system.type?.value === 'heavy');
const M = CONST.ACTIVE_EFFECT_MODES;
const changes = [
    {key: 'flags.midi-qol.advantage.ability.check.str', mode: M.CUSTOM, value: '1', priority: 20},
    {key: 'flags.midi-qol.advantage.ability.save.str', mode: M.CUSTOM, value: '1', priority: 20},
    {key: 'system.bonuses.mwak.damage', mode: M.ADD, value: '+' + might, priority: 20},
    {key: 'system.traits.dr.value', mode: M.ADD, value: 'bludgeoning', priority: 20},
    {key: 'system.traits.dr.value', mode: M.ADD, value: 'piercing', priority: 20},
    {key: 'system.traits.dr.value', mode: M.ADD, value: 'slashing', priority: 20},
    {key: 'system.traits.dr.bypasses', mode: M.ADD, value: 'mgc', priority: 20},
    {key: 'system.traits.dr.bypasses', mode: M.ADD, value: 'sil', priority: 20}];
if (!heavy) changes.push({key: 'system.attributes.ac.bonus', mode: M.ADD, value: '+1', priority: 20});
const cfg = {intro: '', loop: '', size: 2.5, image: '', ...(item.flags?.world?.nixHybridAnim ?? {})};
const pick = l => l.filter(Boolean).find(f => { try { return Sequencer.Database.entryExists(f) || /\.(webm|webp|png|gif|mp4)$/i.test(f); } catch { return false; } });
let oldImg = null;
if (token && cfg.image) { oldImg = token.document.texture.src; await genericUtils.update(token.document, {'texture.src': cfg.image}); }
const END = 'PLACEHOLDER_END';
const BLOODLUST = 'PLACEHOLDER_BLOODLUST';
await effectUtils.createEffect(actor, {
    name: 'Hybrid Transformation', img: item.img, origin: item.uuid, duration: {seconds: 3600},
    description: 'Feral Might: Advantage on Strength checks and saves, +' + might + ' melee damage. Resilient Hide: Resistance to nonmagical, non-silvered bludgeoning, piercing and slashing'
        + (heavy ? '' : ', +1 AC') + '. Predatory Strikes: Dex unarmed strikes (1d6), one extra as a Bonus Action after an Attack-action unarmed strike. Bloodlust below half HP.',
    changes,
    flags: {dae: {specialDuration: ['zeroHP']}, world: {nixHybrid: {tokenUuid: token?.document.uuid ?? null, oldImg}},
        'chris-premades': {embeddedMacros: [
            {name: 'Hybrid: Bloodlust', type: 'combat', pass: 'turnStart', priority: 50, macro: BLOODLUST},
            {name: 'Hybrid: revert', type: 'effect', pass: 'deleted', priority: 50, macro: END}]}}
}, {identifier: ID});
if (token && globalThis.Sequencer) {
    const intro = pick([cfg.intro, 'jb2a.impact.ground_crack.orange.02', 'jb2a.impact.ground_crack.01.orange', 'jb2a.divine_smite.caster.reversed.red', 'jb2a.impact.003.dark_red']);
    const loop = pick([cfg.loop, 'jb2a.token_border.circle.spinning.red.001', 'jb2a.markers.fear.dark_red.03', 'jb2a.bless.200px.loop.red', 'jb2a.energy_field.02.below.red']);
    const seq = new Sequence();
    if (intro) seq.effect().file(intro).atLocation(token).size(Number(cfg.size) || 2.5, {gridUnits: true});
    if (loop) seq.effect().file(loop).attachTo(token).belowTokens().size(Number(cfg.size) || 2.5, {gridUnits: true}).fadeIn(500).fadeOut(500).persist().name('Hybrid ' + actor.id);
    try { await seq.play(); } catch (err) { console.warn(err); }
}
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>' + item.name + ':</b> ' + actor.name + ' gives in to the curse and becomes a <b>hybrid beast</b> for up to 1 hour. '
    + 'Advantage on Strength checks and saves, +' + might + ' melee damage, resistant to nonmagical, non-silvered physical damage' + (heavy ? '' : ', +1 AC') + '.'});
})();`,
 HYBRID_END: String.raw`await (async () => {
const eff = trigger.entity;
const actor = eff.parent;
const st = eff.flags?.world?.nixHybrid ?? {};
if (globalThis.Sequencer) await Sequencer.EffectManager.endEffects({name: 'Hybrid ' + actor.id});
if (st.tokenUuid && st.oldImg) { const t = await fromUuid(st.tokenUuid); if (t) await genericUtils.update(t, {'texture.src': st.oldImg}); }
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Hybrid Transformation:</b> ' + actor.name + ' returns to his normal form.'});
})();`,
 HYBRID_BLOODLUST: String.raw`await (async () => {
// Bloodlust: if he starts his turn below half his HP maximum, DC 8 Wisdom save (automatic fail
// while concentrating) or he must move to the nearest creature and use the Attack action on it.
const eff = trigger.entity;
const actor = eff.parent;
const hp = actor.system.attributes.hp;
if (!(hp.value < hp.max / 2) || hp.value <= 0) return;
const conc = actor.statuses?.has('concentrating') || actor.effects.some(e => !e.disabled && /concentrat/i.test(e.name));
let ok = false;
if (!conc) {
    const res = await actor.rollSavingThrow({ability: 'wis', target: 8}, {configure: false}, {flavor: 'Bloodlust (DC 8 Wisdom)'});
    const r = Array.isArray(res) ? res[0] : res;
    ok = Number(r?.total) >= 8;
}
if (ok) { await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Bloodlust:</b> ' + actor.name + ' holds back the beast.'}); return; }
const me = actorUtils.getFirstToken(actor);
let target = null;
if (me) {
    const others = canvas.tokens.placeables.filter(t => t.actor && t.id !== me.id && !t.document.hidden && (t.actor.system.attributes?.hp?.value ?? 1) > 0);
    const d = others.map(t => [t, tokenUtils.getDistance(me, t)]);
    const min = Math.min(...d.map(x => x[1]));
    const near = d.filter(x => x[1] === min).map(x => x[0]);
    target = near.length ? near[Math.floor(Math.random() * near.length)] : null;
}
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Bloodlust!</b> ' + actor.name + (conc ? ' is concentrating and automatically fails the save.' : ' fails the DC 8 Wisdom save.')
    + ' He must move straight toward ' + (target ? '<b>' + target.document.name + '</b> (the nearest creature' + (target.document.disposition === me?.document.disposition ? ', <i>even though it is an ally</i>' : '') + ')' : 'the nearest creature')
    + ' and use the Attack action against it. He regains control once the attack is resolved.'});
})();`,
 HYBRID_CONFIG: String.raw`await (async () => {
// Configure the Hybrid Transformation look: intro animation, looping aura, size, and an optional
// token image for the hybrid form (left blank = the token art doesn't change).
const item = workflow.item;
const cur = {intro: 'jb2a.impact.ground_crack.orange.02', loop: 'jb2a.token_border.circle.spinning.red.001', size: 2.5, image: '', ...(item.flags?.world?.nixHybridAnim ?? {})};
const res = await DialogApp.dialog(item.name + ': Look', 'Paste a Sequencer database path (Sequencer > Database Viewer, click a name to copy) or a file path. Leave the token image blank to keep his art.', [
    ['text', [{label: 'Transformation burst (plays once)', name: 'intro', options: {currentValue: cur.intro}}], {displayAsRows: true}],
    ['text', [{label: 'Aura while transformed (loops)', name: 'loop', options: {currentValue: cur.loop}}], {displayAsRows: true}],
    ['number', [{label: 'Size (grid squares)', name: 'size', options: {currentValue: cur.size}}], {displayAsRows: true}],
    ['text', [{label: 'Hybrid token image (file path, optional)', name: 'image', options: {currentValue: cur.image}}], {displayAsRows: true}]], 'okCancel', {width: 640});
if (!res?.buttons) return;
await item.setFlag('world', 'nixHybridAnim', {intro: String(res.intro ?? '').trim(), loop: String(res.loop ?? '').trim(), size: Number(res.size) || 2.5, image: String(res.image ?? '').trim()});
ui.notifications.info(item.name + ': look saved.');
})();`,
 HYBRID_REVERT: String.raw`await (async () => {
const eff = effectUtils.getEffectByIdentifier(workflow.actor, 'nixHybridForm');
if (!eff) { ui.notifications.info('Hellsing is not transformed.'); return; }
await genericUtils.remove(eff);
})();`
};
SCRIPTS.HYBRID_TRANSFORM = SCRIPTS.HYBRID_TRANSFORM
    .replace("'PLACEHOLDER_END'", JSON.stringify(SCRIPTS.HYBRID_END))
    .replace("'PLACEHOLDER_BLOODLUST'", JSON.stringify(SCRIPTS.HYBRID_BLOODLUST));
// Nest the hit / end / second-attack scripts inside the cast scripts.
SCRIPTS.RITE_CAST = SCRIPTS.RITE_CAST
    .replace('macro: SCRIPTS_HIT', 'macro: ' + JSON.stringify(SCRIPTS.RITE_HIT))
    .replace('macro: SCRIPTS_END', 'macro: ' + JSON.stringify(SCRIPTS.RITE_END));
SCRIPTS.CURSE_CAST = SCRIPTS.CURSE_CAST.replace('macro: SCRIPTS_AGONY', 'macro: ' + JSON.stringify(SCRIPTS.AGONY_ATTACK));
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Hellsing fixes: select Hellsing\'s token first.');
const report = [];
const lc = s => String(s ?? '').toLowerCase().trim();
const find = re => actor.items.find(i => re.test(i.name.trim()));
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
 
// ---- 1. Hemocraft DC ----------------------------------------------------------------------
{
    const bh = actor.items.find(i => i.type === 'class' && /blood/i.test(i.name));
    if (bh?.system?.spellcasting && bh.system.spellcasting.ability !== 'int') await bh.update({'system.spellcasting.ability': 'int'});
    if (actor.system.attributes?.spellcasting !== undefined && actor.system.attributes.spellcasting !== 'int') {
        try { await actor.update({'system.attributes.spellcasting': 'int'}); } catch (err) { console.warn(err); }
    }
    const dc = 8 + Number(actor.system.attributes.prof ?? 2) + Number(actor.system.abilities.int.mod ?? 0);
    report.push('<li>Hemocraft: spellcasting ability set to Intelligence. His curses use DC ' + dc + ' (8 + proficiency + Int) no matter what the sheet header shows.</li>');
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
        let act = rite.system.activities.contents[0];
        if (!act) act = await rite.createActivity('utility', {name: 'Rite of the Flame'}, {renderSheet: false});
        await act.update({'activation.type': 'bonus', 'activation.override': true, effects: [], 'range.units': 'self', 'target.affects.type': ''});
        await setActivityMacros(rite, act, [{name: 'Crimson Rite: Flame', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.RITE_CAST}]);
        report.push('<li>Crimson Rite: the borrowed Divine Favor effect is gone' + (live.length ? ' (and the one active on him was removed)' : '') + '. '
            + 'It is now a <b>bonus action</b>: pick one equipped weapon (Unarmed Strike also covers his Predatory Strikes). He takes 1 hemocraft die of necrotic (can\'t be reduced), '
            + 'and that weapon deals +1 hemocraft die <b>fire</b> on hits and counts as magical until he finishes a short or long rest. Using it again moves the rite.</li>');
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
        let act = curse.system.activities.contents[0];
        if (!act) act = await curse.createActivity('utility', {name: 'Blood Curse of Bloated Agony'}, {renderSheet: false});
        const upd = {'activation.type': 'bonus', 'activation.override': true, effects: [],
            'range.value': '30', 'range.units': 'ft', 'target.affects.type': 'creature', 'target.affects.count': '1'};
        if (maledict) upd['consumption.targets'] = [{type: 'itemUses', target: maledict.id, value: '1', scaling: {}}];
        await act.update(upd);
        await setActivityMacros(curse, act, [{name: 'Bloated Agony: curse', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.CURSE_CAST}]);
        report.push('<li>Bloated Agony: the wrong <b>Stunned</b> effect is removed. Target a creature within 30 ft and use it (bonus action'
            + (maledict ? ', spends 1 Blood Maledict use, ' + maledict.system.uses?.value + '/' + maledict.system.uses?.max + ' per short rest' : ', <b>Blood Maledict not found so it spends nothing</b>')
            + '). It asks whether to <b>Amplify</b>. The target gets Disadvantage on Strength and Dexterity checks and takes 1d8 necrotic the moment it makes a second attack on its turn (once per turn). '
            + 'Normal: ends at the end of his next turn. Amplified: 1 minute, Con save at the end of each of its turns, and he takes 1 hemocraft die necrotic.</li>');
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
        // effects: keep only the chosen form's effect that the shift activity applies
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
                thp = ' Temp HP is now <b>' + formula.replace('@prof', 'proficiency') + '</b>.';
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
 
// ---- 6. Hybrid Transformation (replaces the Rage stand-in) --------------------------------
{
    const ht = find(/^hybrid transformation/i);
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
        const rv = await ensureActivity(ht, 'Revert', 'utility', {img: 'icons/magic/control/silhouette-hold-change-blue.webp',
            activation: {type: 'special', value: null, override: true}, consumption: {targets: [], scaling: {allowed: false}}, range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true}});
        const look = await ensureActivity(ht, 'Configure Transformation Look', 'utility', {img: 'icons/magic/symbols/runes-star-pentagon-orange.webp',
            activation: {type: 'special', value: null, override: true}, consumption: {targets: [], scaling: {allowed: false}}, range: {units: 'self', override: true}, target: {affects: {type: 'self'}, override: true}});
        await setActivityMacros(ht, tr, [{name: 'Hybrid: transform', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.HYBRID_TRANSFORM}]);
        await setActivityMacros(ht, rv, [{name: 'Hybrid: revert', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.HYBRID_REVERT}]);
        await setActivityMacros(ht, look, [{name: 'Hybrid: configure look', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.HYBRID_CONFIG}]);
        report.push('<li>Hybrid Transformation: <b>Transform</b> (bonus action, ' + (ht.system.uses?.max ?? 1) + '/short rest) plays a burst and a looping red aura on his token and applies, for 1 hour: '
            + 'Advantage on Strength checks and saves, +1 melee damage (+2 at 11th, +3 at 18th), Resistance to nonmagical non-silvered bludgeoning/piercing/slashing, +1 AC (not in heavy armor). '
            + 'In combat, <b>Bloodlust</b> runs at the start of each of his turns below half HP (DC 8 Wis save, auto-fail while concentrating; on a fail chat names the nearest creature he must attack). '
            + 'It ends at 0 HP, after 1 hour, or with <b>Revert</b> (free). <b>Configure Transformation Look</b> sets the animations and an optional hybrid token image.'
            + (oldFx.length ? ' Its old effect' + (oldFx.length > 1 ? 's were' : ' was') + ' switched off.' : '') + '</li>');
    }
    const rage = actor.items.find(i => /^rage$/i.test(i.name.trim()));
    if (rage) { await rage.delete(); report.push('<li>Removed the <b>Rage</b> stand-in: Hybrid Transformation replaces it.</li>'); }
}
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Hellsing fixes installed on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 