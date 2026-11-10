// =====================================================================
//  Dayus Manroe: FIXES (Script macro, run as GM). Run after the Illrigger engine. Safe to re-run.
//  The character sheet's subclass features and feats, RAW resources. Nix Fix runs it on
//  both Dayus Manroe and Dayus Manroe (Boss); the boss kit goes on top of the Boss copy only.
//  Built in (scripts/court/lieutenants.mjs):
//     Marked for Death (advantage on his first attack each turn vs a creature he has sealed),
//     Strike from the Dark (PB d4, +1d4 in dim light/darkness, melee with advantage, 1/turn),
//     Veil of Lies (spends a seal; invisible until he attacks or casts), Hell's Assassin,
//     Umbral Killer (Evasion, advantage on Stealth), Piercer, Slow mastery.
// =====================================================================
const MOD = 'nix-module';
const KEY = 'dayus';
const SENTINEL = "await (async () => {\n    const item = trigger.entity;\n    const me = item.actor;\n    const mine = actorUtils.getFirstToken(me);\n    const foe = workflow.token;\n    if (!mine || !foe || !workflow.actor || workflow.actor.uuid === me.uuid) return;\n    if (!workflow.activity?.hasAttack && !workflowUtils.isAttackType(workflow, 'attack')) return;\n    if (foe.document.disposition === mine.document.disposition) return;\n    const others = Array.from(workflow.hitTargets ?? []).filter(t => t.id !== mine.id);\n    if (!others.length) return;\n    if (tokenUtils.getDistance(mine, foe) > 5) return;\n    if (combatUtils.inCombat() && actorUtils.hasUsedReaction(me)) return;\n    if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(s => me.statuses?.has(s))) return;\n    let weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack')\n        && ['simpleM', 'martialM'].includes(i.system.type?.value));\n    if (!weapons.length) weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack'));\n    if (!weapons.length) return;\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const text = foe.document.name + ' hit ' + others.map(t => t.document.name).join(', ') + ' right next to you. Use your reaction to make an Opportunity Attack against it?';\n    let weapon;\n    if (weapons.length === 1) {\n        if (!await dialogUtils.confirm(item.name + ': Guardian', text, {userId})) return;\n        weapon = weapons[0];\n    } else {\n        weapon = await dialogUtils.selectDocumentDialog(item.name + ': Guardian', text + ' Choose a weapon (or Cancel).', weapons, {userId});\n        if (!weapon) return;\n    }\n    const activity = weapon.system.activities.find(a => a.type === 'attack');\n    if (combatUtils.inCombat()) await actorUtils.setReactionUsed(me);\n    setTimeout(async () => {\n        const wf = await workflowUtils.syntheticActivityRoll(activity, [foe], {options: {workflowOptions: {nixSentinel: true}}});\n        // Halt: a creature hit by the Opportunity Attack has Speed 0 for the rest of the turn.\n        const hit = wf?.hitTargets?.size ? wf.hitTargets.first() : null;\n        if (hit?.actor) await effectUtils.createEffect(hit.actor, {\n            name: 'Sentinel: Halted', img: item.img, origin: item.uuid, duration: {turns: 1},\n            description: 'Speed 0 for the rest of the current turn.',\n            changes: ['walk', 'fly', 'swim', 'climb', 'burrow'].map(k => ({key: 'system.attributes.movement.' + k, mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '0', priority: 60})),\n            flags: {dae: {specialDuration: ['turnEnd']}}\n        });\n    }, 300);\n})();";
if (!game.modules.get(MOD)?.api?.court) return ui.notifications.warn('Dayus Manroe fixes: needs the current Nix Fix (reload the world after updating).');

async function fixOne(actor) {
    const report = [];
    const cfg = actor.flags?.[MOD]?.illrigger;
    if (!cfg) return ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: ' + actor.name + '</b>: apply the Illrigger engine (world) first.'});
    const ident = d => d?.flags?.['chris-premades']?.info?.identifier;
    const lc = s => String(s ?? '').toLowerCase().trim();
    const find = (id, re) => actor.items.find(i => id && ident(i) === id) ?? actor.items.find(i => re.test(i.name));
    const act = (id, type, data) => ({_id: id, type, ...data});
    // The first activity (on any item) whose name matches; {item, a}.
    function findAct(re, itemRe) {
        for (const item of actor.items) {
            if (itemRe && !itemRe.test(item.name)) continue;
            const a = item.system.activities?.find?.(x => re.test(x.name ?? ''));
            if (a) return {item, a};
        }
        for (const item of actor.items) if (re.test(item.name) && (!itemRe || itemRe.test(item.name)) && item.system.activities?.size) return {item, a: item.system.activities.contents[0]};
        return null;
    }
    async function ensureItem(data, match) {
        let it = actor.items.find(match);
        if (it) { await it.update(data); return actor.items.get(it.id); }
        [it] = await actor.createEmbeddedDocuments('Item', [data]);
        return it;
    }
    async function setMacros(doc, names, add) {
        const kept = (doc.flags?.['chris-premades']?.embeddedMacros ?? []).filter(m => !names.includes(m.name));
        await doc.setFlag('chris-premades', 'embeddedMacros', kept.concat(add));
    }
    // Mark an activity for Nix Fix; optionally drop its own effects and seal consumption.
    async function mark(found, kind, {noEffects = false, noSealCost = false, extra = {}} = {}) {
        if (!found) return false;
        const {item, a} = found;
        const bi = actor.items.find(i => ident(i) === 'balefulInterdict' || /^baleful interdict\b/i.test(i.name));
        const upd = {['system.activities.' + a.id + '.flags.' + MOD + '.court']: kind};
        if (noEffects) upd['system.activities.' + a.id + '.effects'] = [];
        if (noSealCost) upd['system.activities.' + a.id + '.consumption.targets'] = (a.consumption?.targets ?? []).filter(x => !(x.type === 'itemUses' && bi && x.target === bi.id));
        for (const [k, v] of Object.entries(extra)) upd['system.activities.' + a.id + '.' + k] = v;
        await item.update(upd);
        return true;
    }
    const prevCourt = actor.flags?.[MOD]?.court ?? {};
    const court = {version: 1, key: KEY, bloodstrokeType: prevCourt.bloodstrokeType ?? 'necrotic', haemalDamage: prevCourt.haemalDamage ?? true};
    // ---- Feats -------------------------------------------------------------------------------
    async function feats() {
        const list = actor.items.filter(i => i.type === 'feat' && i.system.type?.value === 'feat');
        const lines = [];
        for (const f of list) {
            const n = f.name;
            if (/archery/i.test(n)) {
                const has = f.effects.some(e => e.changes.some(c => /rwak\.attack/.test(c.key)));
                if (!has) await f.createEmbeddedDocuments('ActiveEffect', [{name: 'Archery', img: f.img, transfer: true,
                    changes: [{key: 'system.bonuses.rwak.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: '+2', priority: 20}]}]);
                lines.push(n + ': +2 to ranged weapon attack rolls' + (has ? '' : ' (effect added)') + '.');
            } else if (/^piercer/i.test(n)) {
                court.piercer = ident(f) !== 'piercer';
                lines.push(n + ': ' + (court.piercer ? 'Nix Fix rerolls the lowest piercing die once per turn (if it rolled half or less) and adds a die on a crit.' : 'Chris\'s Premades runs it.'));
            } else if (/weapon master/i.test(n)) {
                const slow = actor.items.filter(i => i.type === 'weapon' && (i.system.mastery === 'slow' || (/\(slow\)/i.test(n) && /longbow/i.test(i.name))));
                court.slowWeapons = slow.map(i => i.id);
                lines.push(n + ': Slow on ' + (slow.map(i => i.name).join(', ') || '<b>no matching weapon</b>') + ' (a hit that deals damage: Speed −10 ft until the start of the next turn, no stacking).');
            } else if (/^sentinel/i.test(n)) {
                if (ident(f) === 'sentinel') lines.push(n + ': Chris\'s Premades runs it.');
                else {
                    await setMacros(f, ['Sentinel: Guardian'], [{name: 'Sentinel: Guardian', type: 'midi-actor', pass: 'sceneRollFinished', priority: 50, macro: SENTINEL}]);
                    lines.push(n + ': Quez\'s Sentinel (an enemy within 5 ft hits someone else: reaction attack, Speed 0 on a hit). Opportunity attacks stay with Gambit\'s.');
                }
            } else lines.push(n + ': ' + (ident(f) ? 'Chris\'s Premades runs it.' : 'sheet only (no automation needed or none built).'));
        }
        report.push('Feats: ' + (lines.length ? '<ul><li>' + lines.join('</li><li>') + '</li></ul>' : 'none on the sheet.'));
    }

    // ---- Engine passives the Illrigger engine reads from item names (they're activities here) --
    async function enginePassives() {
        const named = re => actor.items.some(i => re.test(i.name) || i.system.activities?.some?.(a => re.test(a.name ?? '')));
        const upd = {};
        if (named(/hell'?s assassin/i) && !cfg.hellsAssassin) upd['flags.' + MOD + '.illrigger.hellsAssassin'] = true;
        if (named(/axiomatic seals/i)) upd['flags.' + MOD + '.illrigger.axiomatic'] = Math.max(1, actor.system.abilities.cha.mod);
        if (Object.keys(upd).length) await actor.update(upd);
    }


    // ---- Character section -----------------------------------------------------------------
    const veil = findAct(/veil of lies/i, /belial/i);
    report.push(await mark(veil, 'veil', {noEffects: true, noSealCost: true})
        ? 'Veil of Lies (Bonus Action): spends a seal, Invisible for 10 minutes or until he attacks or casts a spell.' : '<b>Veil of Lies not found</b> (Belial\'s Interdiction).');
    report.push('Marked for Death: on his turn, his first attack against a creature carrying his seal has advantage (automatic).');
    const sftd = find(null, /^strike from the dark/i);
    report.push('Strike from the Dark: automatic once per turn (melee weapon hit with advantage on a sealed creature): ' + actor.system.attributes.prof + 'd4, +1d4 in dim light or darkness.'
        + (sftd ? ' Don\'t click the item\'s own button.' : ''));
    report.push('Hell\'s Assassin: seal and weapon damage dice of 1-2 reroll against sealed creatures (engine).');
    const uk = find(null, /^umbral killer/i);
    if (uk) {
        if (!uk.effects.some(e => e.flags?.[MOD]?.umbral)) await uk.createEmbeddedDocuments('ActiveEffect', [{name: 'Umbral Killer', img: uk.img, transfer: true,
            changes: [{key: 'flags.midi-qol.superSaver.dex', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '1', priority: 20},
                {key: 'flags.midi-qol.advantage.skill.ste', mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '1', priority: 20}], flags: {[MOD]: {umbral: true}}}]);
        report.push('Umbral Killer: Evasion (Dex saves: success 0, fail half) and advantage on Stealth. Darkvision and +10 ft speed come from the sheet.');
    } else report.push('<b>Umbral Killer not found.</b>');

    await enginePassives();
    await feats();
    await actor.update({['flags.' + MOD + '.court']: court});
    await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: ' + actor.name + ' fixes</b><ul><li>' + report.join('</li><li>') + '</li></ul>'});
}
for (const t of canvas.tokens.controlled) if (t.actor) await fixOne(t.actor);
