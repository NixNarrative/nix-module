// =====================================================================
//  Sydmore (Boss): BOSS KIT (Script macro, run as GM). Run after "Sydmore: fixes".
//  Safe to re-run. Same shape as Dracula's boss kit, sized for a lieutenant:
//   - Legendary Actions (3, regained at the start of the turn): Seal (1, spends a seal
//     from the pool), Strike (2), Foul Interchange (2).
//   - Legendary Resistance (3/day) + Blood Price in one prompt on a failed save
//     (Dracula's: Legendary Resistance bleeds floor(spell level / 2) d10).
//   - Invoke Hell options: 1/day each, no shared Invoke Hell use.
//  Seals keep their normal pool (6, back on a short rest); Dracula alone has unlimited seals.
// =====================================================================
const MOD = 'nix-module';
const BLOOD_PRICE = `
// Nix Fix: Blood Price (Legendary). Save / bonus / 50. On a failed save with a DC:
// spend a Hit Die and add it, or spend Legendary Resistance to succeed and bleed
// floor(spell level / 2) d10 (1st: none, 2nd: 1d10, 4th: 2d10, 7th: 3d10). No spell level
// (not a spell, or the source can't be read): no HP.
// In Infernal Majesty the blood also hits the nearest enemy within 10 ft.
const {roll, actor} = trigger;
// Level of the spell behind this save, or null (not a spell / couldn't tell).
function sourceSpellLevel() {
    const mo = trigger.config?.midiOptions ?? trigger.options?.midiOptions ?? {};
    const uuid = mo.saveItemUuid ?? mo.itemUuid ?? trigger.options?.saveItemUuid ?? trigger.config?.saveItemUuid;
    if (!uuid) return null;
    let wf;
    try { wf = MidiQOL.Workflow.getWorkflow(uuid); } catch { wf = undefined; }
    const doc = wf?.item ?? fromUuidSync(uuid);
    const item = doc?.documentName === 'Item' ? doc : doc?.item;
    if (!item) return null;
    if (item.type !== 'spell') return null;
    const cast = Number(wf?.castData?.castLevel ?? item.system.level);
    return Number.isFinite(cast) ? cast : item.system.level;
}
const dc = roll.options?.target;
if (!dc || roll.total >= dc) return;
const cls = actor.items.filter(i => i.type === 'class' && (i.system.levels - (i.system.hd?.spent ?? 0)) > 0)
    .sort((a, b) => parseInt(String(b.system.hd?.denomination).slice(1)) - parseInt(String(a.system.hd?.denomination).slice(1)))[0];
const lr = actor.items.find(i => i.flags?.['nix-module']?.legendaryResistance);
const lrLeft = lr?.system.uses?.value ?? 0;
if (!cls && !lrLeft) return;
const die = cls?.system.hd?.denomination ?? 'd10';
const lvl = sourceSpellLevel();
const bleedLabel = n => n ? 'bleed ' + n + 'd10' : 'no bleed';
const buttons = [];
if (cls) buttons.push(['Blood Price: spend a Hit Die, +1' + die, 'price']);
if (lrLeft) {
    const head = 'Legendary Resistance (' + lrLeft + ' left): succeed, ';
    const n = lvl === null ? 0 : Math.floor(lvl / 2);
    buttons.push([head + (lvl === null ? 'no spell level' : 'level ' + lvl + ' spell') + ': ' + bleedLabel(n), 'legend:' + n]);
}
buttons.push(['Accept the failure', 'none']);
const userId = socketUtils.firstOwner(actor, true) ?? game.user.id;
const pick = await dialogUtils.buttonDialog('Blood Price', actor.name + ' failed a saving throw: ' + roll.total + ' against DC ' + dc + '.', buttons, {userId});
if (!pick || pick === 'none') return;
const tok = trigger.token ?? actorUtils.getFirstToken(actor);
const imOn = effectUtils.getEffectByIdentifier(actor, 'infernalMajestyEffect');
async function aura(amount) {
    if (!imOn || !tok || !(amount > 0)) return;
    const foes = tokenUtils.findNearby(tok, 10, 'enemy', {includeIncapacitated: true}).filter(t => tokenUtils.canSee(tok, t))
        .sort((a, b) => tokenUtils.getDistance(tok, a) - tokenUtils.getDistance(tok, b));
    if (!foes.length) return;
    await workflowUtils.applyDamage([foes[0]], amount, 'none');
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Infernal Majesty:</b> the spilled blood lashes ' + foes[0].document.name + ' for ' + amount + '.'});
}
if (pick === 'price') {
    await genericUtils.update(cls, {'system.hd.spent': (cls.system.hd.spent ?? 0) + 1});
    const r = await new Roll('1' + die).evaluate();
    const newRoll = MidiQOL.addRollTo(roll, r);
    newRoll.data = roll.data;
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Blood Price:</b> ' + actor.name + ' spends a Hit Die: +' + r.total + ' (' + newRoll.total + ').'});
    await aura(r.total);
    return newRoll;
}
await genericUtils.update(lr, {'system.uses.spent': (lr.system.uses.spent ?? 0) + 1});
const dice = Number(String(pick).split(':')[1]) || 0;
const bleed = dice ? (await new Roll(dice + 'd10').evaluate()).total : 0;
await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}), content: '<b>Legendary Resistance (Blood Price):</b> ' + actor.name + ' succeeds instead'
    + (bleed ? ' and bleeds ' + bleed + ' hit points (' + dice + 'd10).' : ' without bleeding.')});
const fix = await new Roll(String(dc - roll.total)).evaluate();
const newRoll = MidiQOL.addRollTo(roll, fix);
newRoll.data = roll.data;
if (bleed) setTimeout(async () => { await actor.applyDamage(bleed); await aura(bleed); }, 50);
return newRoll;
`;
const actor = canvas.tokens.controlled[0]?.actor;
if (!actor) return ui.notifications.warn('Sydmore boss kit: no actor.');
const cfg = actor.flags?.[MOD]?.illrigger;
if (!cfg) return ui.notifications.warn('Sydmore boss kit: apply the Illrigger engine (world) first.');
if (actor.flags?.[MOD]?.court?.key !== 'sydmore') return ui.notifications.warn('Sydmore boss kit: apply "Sydmore: fixes" to ' + actor.name + ' first.');
const report = [];
const ident = d => d?.flags?.['chris-premades']?.info?.identifier;
const find = (id, re) => actor.items.find(i => id && ident(i) === id) ?? actor.items.find(i => re.test(i.name));
const act = (id, type, data) => ({_id: id, type, ...data});
async function ensureItem(data, match) {
    let it = actor.items.find(match);
    if (it) { await it.update(data); return actor.items.get(it.id); }
    [it] = await actor.createEmbeddedDocuments('Item', [data]);
    return it;
}

// ---- Legendary Actions (3) -----------------------------------------------------------------
function legendary(signature, sigText, preferRanged) {
    const weapons = actor.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack'));
    const ranged = w => /R$/.test(w.system.type?.value ?? '') || w.system.activities.some(a => a.type === 'attack' && a.attack?.type?.value === 'ranged');
    const strike = (preferRanged ? weapons.find(ranged) : weapons.find(w => !ranged(w))) ?? weapons[0] ?? null;
    return {strike, data: {
        name: 'Legendary Actions', type: 'feat', img: 'icons/magic/unholy/hand-claw-glow-orange.webp',
        'system.description.value': '<p>' + actor.name + ' can take 3 Legendary Actions, one at a time, immediately after another creature\'s turn, and regains them at the start of their turn.</p>'
            + '<ul><li><b>Seal (1).</b> Place a Baleful Interdict seal on a creature within ' + cfg.range + ' ft (spends a seal).</li>'
            + '<li><b>Strike (2).</b> One attack with ' + (strike ? strike.name : 'a weapon') + '.</li>' + sigText + '</ul>',
        'system.type': {value: 'monster', subtype: ''},
        'system.uses': {max: '3', spent: 0, recovery: [{period: 'turnStart', type: 'recoverAll'}]},
        'system.activities': Object.assign({
            nixLegendSeal000: act('nixLegendSeal000', 'utility', {name: 'Seal (1)', activation: {type: 'special', value: 1}, range: {value: String(cfg.range), units: 'ft'},
                target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '1'}]}, flags: {[MOD]: {boss: 'seal'}}}),
            nixLegendStrike0: act('nixLegendStrike0', 'utility', {name: 'Strike (2)', activation: {type: 'special', value: 2}, range: {units: 'self'},
                target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {boss: 'strike'}}})
        }, signature),
        ['flags.' + MOD + '.legendary']: true
    }};
}
async function installLegendary(signature, sigText, preferRanged) {
    const {strike, data} = legendary(signature, sigText, preferRanged);
    const la = await ensureItem(data, i => i.flags?.[MOD]?.legendary || /^legendary actions$/i.test(i.name));
    report.push('Legendary Actions: 3, back at the start of the turn. Seal (1, spends a seal), Strike (2: ' + (strike?.name ?? '<b>no equipped weapon</b>') + '), ' + sigText.replace(/<[^>]+>/g, '').replace(/\.\s.*$/, '') + '.');
    // Telekinetic-Seal-style reactions don't exist here; boss flags (shared with Dracula's runtime).
    await actor.update({['flags.' + MOD + '.boss']: {version: 1, phase2: false, ascendedThisRest: false, legendaryItem: la.id, lairScenes: [],
        legendaryBase: 3, legendaryLair: 3, regen: false, paidSeals: true, strikeItem: strike?.id ?? null, radiantTaken: 0}});
    return la;
}


// ---- Legendary Resistance + Blood Price ----------------------------------------------------
async function installResistance() {
    await ensureItem({
        name: 'Legendary Resistance (Blood Price)', type: 'feat', img: 'icons/magic/life/heart-cross-strong-flame-purple-orange.webp',
        'system.description.value': '<p>3/day. When ' + actor.name + ' fails a saving throw they can succeed instead. Against a spell they bleed d10s equal to half the spell\'s level, rounded down '
            + '(1st: none, 2nd-3rd: 1d10, 4th-5th: 2d10, 6th-7th: 3d10, 8th-9th: 4d10). No spell level: no bleed. Asked together with Blood Price on the same prompt.</p>',
        'system.type': {value: 'monster', subtype: ''},
        'system.uses': {max: '3', spent: 0, recovery: [{period: 'lr', type: 'recoverAll'}]},
        ['flags.' + MOD + '.legendaryResistance']: true
    }, i => i.flags?.[MOD]?.legendaryResistance);
    const bp = find('bloodPrice', /^blood price/i);
    if (!bp) return report.push('<b>Blood Price not found</b>: Legendary Resistance (3/day) has no prompt until it is on the sheet.');
    const saves = (bp.flags?.['chris-premades']?.macros?.save ?? []).filter(n => n !== 'bloodPrice');
    const emb = (bp.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => m.name !== 'Blood Price (Legendary)');
    await bp.update({'flags.chris-premades.macros.save': saves,
        'flags.chris-premades.embeddedMacros': emb.concat([{name: 'Blood Price (Legendary)', type: 'save', pass: 'bonus', priority: 50, macro: BLOOD_PRICE}])});
    report.push('Blood Price + Legendary Resistance (3/day): one prompt on a failed save (spend a Hit Die / succeed and bleed / accept).');
}


// ---- Invoke Hell options: 1/day each -------------------------------------------------------
async function invokeHellDaily() {
    const done = [];
    for (const item of actor.items.filter(i => /^invoke hell/i.test(i.name) && i.system.activities?.size)) {
        const upd = {};
        for (const a of item.system.activities) {
            upd['system.activities.' + a.id + '.uses'] = {max: '1', spent: a.uses?.max === '1' ? (a.uses.spent ?? 0) : 0, recovery: [{period: 'lr', type: 'recoverAll'}]};
            upd['system.activities.' + a.id + '.consumption.targets'] = [{type: 'activityUses', target: '', value: '1'}];
            done.push(a.name === item.name ? item.name : item.name + ': ' + a.name);
        }
        await item.update(upd);
    }
    report.push(done.length ? 'Invoke Hell, 1/day each: ' + done.join(', ') + '.' : 'Invoke Hell: no options with activities found.');
}


await installLegendary({
    nixLegendFoul000: act('nixLegendFoul000', 'utility', {name: 'Foul Interchange (2)', activation: {type: 'special', value: 2}, range: {value: '30', units: 'ft'},
        target: {affects: {count: '1', type: 'creature'}}, consumption: {targets: [{type: 'itemUses', target: '', value: '2'}]}, flags: {[MOD]: {court: 'interchange'}}})
}, "<li><b>Foul Interchange (2).</b> Spend a seal: end blinded, charmed, dazed, deafened, frightened, paralyzed or poisoned on a creature within 30 ft (himself included); another creature within 60 ft makes a Con save or takes it on until the end of his next turn.</li>", false);
await installResistance();
await invokeHellDaily();
await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: ' + actor.name + ' boss kit</b><ul><li>' + report.join('</li><li>') + '</li></ul>'});
