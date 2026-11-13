// =====================================================================
//  Sydmore: FIXES (Script macro, run as GM). Run after the Illrigger engine. Safe to re-run.
//  The character sheet's subclass features and feats, RAW resources. Nix Fix runs it on
//  both Sydmore and Sydmore (Boss); the boss kit goes on top of the Boss copy only.
//  Built in (scripts/court/lieutenants.mjs):
//     Exsanguinate (engine), Bloodstroke (melee hit on an Exsanguinate ally: attacker takes his
//     level), Sutekh's Blessing (blood sense list), Foul Interchange (spends a seal: end a
//     condition, pass it on with a Con save), Sanguine Gift (+level healing for a seal),
//     Haemal Exchange (reaction: -1d8 on a sealed creature's attack/save, +1d8 to an ally),
//     Embolden Allies (split the healing) and Vitalize (+PB to ability checks), Invoke Hell.
// =====================================================================
const MOD = 'nix-module';
const KEY = 'sydmore';
const SENTINEL = "await (async () => {\n    const item = trigger.entity;\n    const me = item.actor;\n    const mine = actorUtils.getFirstToken(me);\n    const foe = workflow.token;\n    if (!mine || !foe || !workflow.actor || workflow.actor.uuid === me.uuid) return;\n    if (!workflow.activity?.hasAttack && !workflowUtils.isAttackType(workflow, 'attack')) return;\n    if (foe.document.disposition === mine.document.disposition) return;\n    const others = Array.from(workflow.hitTargets ?? []).filter(t => t.id !== mine.id);\n    if (!others.length) return;\n    if (tokenUtils.getDistance(mine, foe) > 5) return;\n    if (combatUtils.inCombat() && actorUtils.hasUsedReaction(me)) return;\n    if (['incapacitated', 'unconscious', 'stunned', 'paralyzed', 'petrified'].some(s => me.statuses?.has(s))) return;\n    let weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack')\n        && ['simpleM', 'martialM'].includes(i.system.type?.value));\n    if (!weapons.length) weapons = me.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.activities?.some(a => a.type === 'attack'));\n    if (!weapons.length) return;\n    const userId = socketUtils.firstOwner(me, true) ?? game.user.id;\n    const text = foe.document.name + ' hit ' + others.map(t => t.document.name).join(', ') + ' right next to you. Use your reaction to make an Opportunity Attack against it?';\n    let weapon;\n    if (weapons.length === 1) {\n        if (!await dialogUtils.confirm(item.name + ': Guardian', text, {userId})) return;\n        weapon = weapons[0];\n    } else {\n        weapon = await dialogUtils.selectDocumentDialog(item.name + ': Guardian', text + ' Choose a weapon (or Cancel).', weapons, {userId});\n        if (!weapon) return;\n    }\n    const activity = weapon.system.activities.find(a => a.type === 'attack');\n    if (combatUtils.inCombat()) await actorUtils.setReactionUsed(me);\n    setTimeout(async () => {\n        const wf = await workflowUtils.syntheticActivityRoll(activity, [foe], {options: {workflowOptions: {nixSentinel: true}}});\n        // Halt: a creature hit by the Opportunity Attack has Speed 0 for the rest of the turn.\n        const hit = wf?.hitTargets?.size ? wf.hitTargets.first() : null;\n        if (hit?.actor) await effectUtils.createEffect(hit.actor, {\n            name: 'Sentinel: Halted', img: item.img, origin: item.uuid, duration: {turns: 1},\n            description: 'Speed 0 for the rest of the current turn.',\n            changes: ['walk', 'fly', 'swim', 'climb', 'burrow'].map(k => ({key: 'system.attributes.movement.' + k, mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: '0', priority: 60})),\n            flags: {dae: {specialDuration: ['turnEnd']}}\n        });\n    }, 300);\n})();";
if (!game.modules.get(MOD)?.api?.court) return ui.notifications.warn('Sydmore fixes: needs the current Nix Fix (reload the world after updating).');

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
        // 1.7.1: options split into "Interdict Boons: X" / "Invoke Hell: X" items count as their bundle.
        const split = n => /^(interdict boons|invoke hell):\s*\S/i.test(n);
        for (const item of actor.items) {
            if (itemRe && !itemRe.test(item.name) && !split(item.name)) continue;
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
        let brawl = false;
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
            } else if (/weapon master/i.test(n) && !/great weapon master/i.test(n)) {
                const slow = actor.items.filter(i => i.type === 'weapon' && (i.system.mastery === 'slow' || (/\(slow\)/i.test(n) && /longbow/i.test(i.name))));
                court.slowWeapons = slow.map(i => i.id);
                lines.push(n + ': Slow on ' + (slow.map(i => i.name).join(', ') || '<b>no matching weapon</b>') + ' (a hit that deals damage: Speed −10 ft until the start of the next turn, no stacking).');
            } else if (/^sentinel/i.test(n)) {
                if (ident(f) === 'sentinel') lines.push(n + ': Chris\'s Premades runs it.');
                else {
                    await setMacros(f, ['Sentinel: Guardian'], [{name: 'Sentinel: Guardian', type: 'midi-actor', pass: 'sceneRollFinished', priority: 50, macro: SENTINEL}]);
                    lines.push(n + ': Quez\'s Sentinel (an enemy within 5 ft hits someone else: reaction attack, Speed 0 on a hit). Opportunity attacks stay with Gambit\'s.');
                }
            } else if (/^(crusher|grappler|tavern brawler)\b/i.test(n)) {
                // 1.7.1: one push / grapple popup per hit (scripts/court/brawl.mjs) instead of CPR's three prompts.
                const id = /^crusher/i.test(n) ? 'crusher' : /^grappler/i.test(n) ? 'grappler' : 'tavernBrawler';
                const list = f.flags?.['chris-premades']?.macros?.midi?.actor;
                if (Array.isArray(list) && list.includes(id)) await f.setFlag('chris-premades', 'macros.midi.actor', list.filter(x => x !== id));
                brawl = true;
                lines.push(n + ': ' + ({crusher: 'push 5 ft (once per turn) in the one after-hit popup; critical-hit advantage automatic.',
                    grappler: 'grapple (free, once per turn) in the one after-hit popup; advantage against the creature he grapples automatic.',
                    tavernBrawler: 'push 5 ft (once per turn) in the one after-hit popup; rerolling 1s stays on the feat.'})[id]
                    + (Array.isArray(list) && list.includes(id) ? ' (Chris\'s Premades\' prompt switched off)' : ''));
            } else if (/^mage slayer\b/i.test(n)) {
                lines.push(n + ': built in (see Mage Slayer below).');
            } else lines.push(n + ': ' + (ident(f) ? 'Chris\'s Premades runs it.' : 'sheet only (no automation needed or none built).'));
        }
        await actor.update({['flags.' + MOD + '.brawl']: brawl});
        if (brawl) lines.push('<b>One popup per hit:</b> push (Tavern Brawler or Crusher) <i>or</i> grapple (Grappler), shown in the Baleful Interdict window when that opens too.');
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


    // ---- Illrigger spells (1.7.1): Vengeful Blade and Hell's Lash run by Nix Fix (scripts/court/illrigger-spells.mjs)
    async function illriggerSpells() {
        const acts = it => it.system.activities?.contents ?? Array.from(it.system.activities ?? []);
        const vb = actor.items.find(i => i.type === 'spell' && /^vengeful blade/i.test(i.name));
        if (vb) {
            const keep = acts(vb).find(a => a.flags?.[MOD]?.court === 'vengefulBlade');
            const drop = {};
            for (const a of acts(vb)) if (a !== keep) drop['system.activities.-=' + a.id] = null;
            if (Object.keys(drop).length) await vb.update(drop);
            if (!keep) await vb.update({'system.activities.nixVengefulBld0': {_id: 'nixVengefulBld0', type: 'utility', name: 'Vengeful Blade',
                activation: {type: 'action', value: 1, override: true}, range: {units: 'ft', value: '5', override: true},
                target: {affects: {type: 'creature', count: '1'}, override: true}, consumption: {spellSlot: false, targets: []}, effects: [],
                flags: {[MOD]: {court: 'vengefulBlade'}}}});
            report.push('Vengeful Blade: one button. Target a creature within 5 ft, cast it, pick the weapon: on a hit +necrotic and the aura; its next attack or spell costs it the aura\'s necrotic (RAW), ends at the start of ' + actor.name + '\'s next turn.');
        }
        const hl = actor.items.find(i => i.type === 'spell' && /^hell'?s lash/i.test(i.name));
        if (hl) {
            const cast = acts(hl).find(a => a.flags?.[MOD]?.court === 'hellsLash') ?? acts(hl).find(a => a.type === 'save' && /cast/i.test(a.name ?? '')) ?? acts(hl).find(a => a.type === 'save');
            if (cast) {
                const drop = {};
                for (const a of acts(hl)) if (a !== cast) drop['system.activities.-=' + a.id] = null;
                if (Object.keys(drop).length) await hl.update(drop);
                await hl.update({['system.activities.' + cast.id + '.flags.' + MOD + '.court']: 'hellsLash', ['system.activities.' + cast.id + '.effects']: []});
                report.push('Hell\'s Lash: cast it as usual (Con save, 4d4 fire). A failed save tethers the target (red tether). Start of its turn: a popup to deal the 2d4 fire; end of its turn: its save to end it (burn a seal for disadvantage, offered if it carries the caster\'s seals). The Turn Start / Turn End buttons are gone.');
            } else report.push('<b>Hell\'s Lash: no save activity found.</b>');
        }
    }


    const V14 = !globalThis.chrisPremades?.utils && !!globalThis.cat?.utils;
    const acts = it => it.system.activities?.contents ?? Array.from(it.system.activities ?? []);
    // Strip one Chris's Premades 1 macro from an item's midi list (v13; harmless on v14).
    async function stripCpr(item, name, path = 'midi.item') {
        const list = foundry.utils.getProperty(item, 'flags.chris-premades.macros.' + path);
        if (Array.isArray(list) && list.includes(name)) { await item.update({['flags.chris-premades.macros.' + path]: list.filter(n => n !== name)}); return true; }
        return false;
    }

    // ---- 1.7.1: subclass interdict boons and Invoke Hell options, one item each ---------------
    // D&D Beyond puts a subclass's options in one item ("Sutekh's Interdiction" > Foul Interchange,
    // Sanguine Gift; "Invoke Hell" > Embolden Allies, Vitalize). Each becomes its own item,
    // "Interdict Boons: <Option>" / "Invoke Hell: <Option>", with its activity (Nix Fix flags kept)
    // and the effects it applies; the bundle is deleted ("Invoke Hell" itself stays: it holds the use).
    async function splitBundles() {
        const PASSIVE = /^(sanguine gift|axiomatic seals|hell'?s assassin)$/i;
        const ACTIVATION = [[/^red cant$/i, 'special'], [/^(spellbreaker|slippery ploy)$/i, 'reaction'], [/^veil of lies$/i, 'bonus'], [/^foul interchange$/i, 'action']];
        const pool = actor.items.find(i => /^interdict boons$/i.test(i.name));
        const BOON_IMG = pool?.img || 'icons/skills/targeting/crosshair-triple-strike-orange.webp';
        const optName = n => String(n ?? '').replace(/^.*?'?s interdiction:\s*/i, '').replace(/^invoke hell:\s*/i, '').replace(/\s*\(passive\)\s*$/i, '').trim();
        const made = [], removed = [];
        async function moveOut(bundle, a, prefix, img) {
            const opt = optName(a.name);
            if (!opt) return false;
            const name = prefix + opt;
            const passive = prefix === 'Interdict Boons: ' && PASSIVE.test(opt);
            const existing = actor.items.find(i => i.id !== bundle.id && i.name.toLowerCase() === name.toLowerCase());
            if (!existing) {
                const actData = a.toObject();
                actData.name = opt;
                const over = ACTIVATION.find(([re]) => re.test(opt));
                if (over) actData.activation = {...(actData.activation ?? {}), type: over[1]};
                const effIds = (actData.effects ?? []).map(e => e._id ?? e.id).filter(Boolean);
                const effects = passive ? [] : bundle.effects.filter(e => effIds.includes(e.id)).map(e => e.toObject());
                await actor.createEmbeddedDocuments('Item', [{name, type: 'feat', img,
                    system: {description: {value: bundle.system.description?.value ?? ''}, type: foundry.utils.deepClone(bundle.system.type ?? {}),
                        source: foundry.utils.deepClone(bundle.system.source ?? {}), requirements: bundle.system.requirements ?? '',
                        activities: passive ? {} : {[a.id]: actData}},
                    effects, flags: {[MOD]: {split: {from: bundle.name, option: opt}}}}], {keepEmbeddedIds: true});
                made.push(name + (passive ? ' (passive)' : ''));
            }
            await bundle.update({['system.activities.-=' + a.id]: null});
            return true;
        }
        // Subclass interdictions (Sutekh's, Moloch's, Asmodeus's, Belial's).
        for (const b of actor.items.filter(i => /^\w+'?s interdiction$/i.test(i.name) && !/^interdiction$/i.test(i.name))) {
            for (const a of acts(b)) await moveOut(b, a, 'Interdict Boons: ', BOON_IMG);
            const left = actor.items.get(b.id);
            if (left && !acts(left).length) { await actor.deleteEmbeddedDocuments('Item', [b.id]); removed.push(b.name); }
        }
        // Invoke Hell bundles ("Invoke Hell", "Invoke Hell: Sanguine Knight", ...).
        for (const b of actor.items.filter(i => /^invoke hell\b/i.test(i.name))) {
            const opts = acts(b).filter(a => /^invoke hell:\s*\S/i.test(a.name ?? '') && optName(a.name).toLowerCase() !== optName(b.name).toLowerCase());
            if (!opts.length) continue;
            for (const a of opts) await moveOut(b, a, 'Invoke Hell: ', b.img);
            const left = actor.items.get(b.id);
            if (left && !/^invoke hell$/i.test(left.name) && !acts(left).length) { await actor.deleteEmbeddedDocuments('Item', [b.id]); removed.push(b.name); }
        }
        // Lucian: Slippery Ploy (13th level) had no activity at all.
        if (/hellspeaker/i.test(actor.items.find(i => i.type === 'subclass')?.name ?? '') || actor.items.some(i => /^interdict boons:\s*red cant$/i.test(i.name))) {
            const lvl = actor.classes?.illrigger?.system.levels ?? 0;
            if ((lvl >= 13 || actor.type === 'npc') && !actor.items.some(i => /slippery ploy/i.test(i.name))) {
                await actor.createEmbeddedDocuments('Item', [{name: 'Interdict Boons: Slippery Ploy', type: 'feat', img: BOON_IMG,
                    system: {description: {value: '<p>Reaction, when an enemy targets you with an attack, spell or effect: place a seal on it; it makes a Charisma save or picks a new target (Nix Fix prompts you).</p>'},
                        activities: {nixSlipperyPloy0: {_id: 'nixSlipperyPloy0', type: 'utility', name: 'Slippery Ploy', activation: {type: 'reaction', value: 1},
                            range: {units: 'self'}, consumption: {targets: []}, flags: {[MOD]: {court: 'none'}}}}},
                    flags: {[MOD]: {split: {from: 'Moloch\'s Interdiction', option: 'Slippery Ploy'}}}}]);
                made.push('Interdict Boons: Slippery Ploy (new: reaction)');
            }
        }
        // Invoke Hell use: one, back on a short or long rest, shared by the options (characters and captains).
        // A boss (boss kit applied) keeps its options 1/day each.
        const opts = actor.items.filter(i => /^invoke hell:\s*\S/i.test(i.name) && acts(i).length);
        let shared = '';
        if (opts.length && !actor.flags?.[MOD]?.boss) {
            let base = actor.items.find(i => /^invoke hell$/i.test(i.name));
            if (!base) [base] = await actor.createEmbeddedDocuments('Item', [{name: 'Invoke Hell', type: 'feat', img: opts[0].img,
                system: {uses: {max: '1', spent: 0, recovery: [{period: 'sr', type: 'recoverAll'}]}}}]);
            else if (!base.system.uses?.max) await base.update({'system.uses': {max: '1', spent: 0, recovery: [{period: 'sr', type: 'recoverAll'}]}});
            // Its own D&D Beyond button ("Invoke Hell", spends the use and does nothing): the options do that now.
            const own = acts(base).filter(a => !optName(a.name) || /^invoke hell$/i.test(String(a.name ?? '').trim()));
            if (own.length) await base.update(Object.fromEntries(own.map(a => ['system.activities.-=' + a.id, null])));
            for (const it of opts) {
                const upd = {};
                for (const a of acts(it)) {
                    upd['system.activities.' + a.id + '.consumption.targets'] = [{type: 'itemUses', target: base.id, value: '1'}];
                    upd['system.activities.' + a.id + '.uses'] = {max: '', spent: 0, recovery: []};
                }
                await it.update(upd);
            }
            shared = ' Invoke Hell: 1 use (short or long rest) shared by ' + opts.map(i => i.name.replace(/^invoke hell:\s*/i, '')).join(' and ') + '.';
        } else if (opts.length) shared = ' Boss: the Invoke Hell options stay 1/day each (re-apply the boss kit if you just split them).';
        report.push((made.length || removed.length)
            ? 'Split into their own items: ' + (made.join(', ') || 'none new') + (removed.length ? '; removed ' + removed.join(', ') + ' (Revert restores)' : '') + '.' + shared
            : 'Interdict boons / Invoke Hell options: already one item each.' + shared);
    }

    // ---- 1.7.1: Lucian's Invoke Hell options: Honey-Sweet Blades and Turncoat get working buttons
    async function hellspeakerOptions() {
        const hs = actor.items.find(i => /^invoke hell:\s*honey-?sweet blades$/i.test(i.name));
        const hsAct = hs && acts(hs)[0];
        if (hsAct) {
            await hs.update({['system.activities.' + hsAct.id + '.flags.' + MOD + '.court']: 'honeySweet', ['system.activities.' + hsAct.id + '.effects']: [],
                ['system.activities.' + hsAct.id + '.range']: {units: 'self'}, ['system.activities.' + hsAct.id + '.target.affects']: {type: 'self'}});
            report.push('Invoke Hell: Honey-Sweet Blades: click it; for 1 minute his weapon attacks against a creature carrying his seal have advantage, and a hit is a critical hit.');
        }
        const tc = actor.items.find(i => /^invoke hell:\s*turncoat$/i.test(i.name));
        const tcAct = tc && (acts(tc).find(a => a.type === 'save') ?? acts(tc)[0]);
        if (tcAct) {
            let eff = tc.effects.find(e => e.flags?.[MOD]?.turncoat);
            const dc = 8 + (actor.system.attributes.prof ?? 0) + (actor.system.abilities.cha.mod ?? 0);
            const ot = 'turn=end, saveAbility=cha, saveDC=' + dc + ', label=Turncoat';
            const data = V14
                ? {name: 'Turncoat', img: tc.img, transfer: false, statuses: ['charmed'], duration: {value: 60, units: 'seconds'}, description: 'Charmed by ' + actor.name + ' (Turncoat). Repeats the Charisma save at the end of each of its turns.',
                    system: {changes: [{key: 'flags.midi-qol.OverTime', type: 'override', value: ot, priority: 20}]}, flags: {[MOD]: {turncoat: true}}}
                : {name: 'Turncoat', img: tc.img, transfer: false, statuses: ['charmed'], duration: {seconds: 60}, description: 'Charmed by ' + actor.name + ' (Turncoat). Repeats the Charisma save at the end of each of its turns.',
                    changes: [{key: 'flags.midi-qol.OverTime', mode: 5, value: ot, priority: 20}], flags: {[MOD]: {turncoat: true}}};
            if (!eff) [eff] = await tc.createEmbeddedDocuments('ActiveEffect', [data]); else await eff.update(data);
            const upd = {['system.activities.' + tcAct.id + '.range']: {value: '60', units: 'ft'},
                ['system.activities.' + tcAct.id + '.target.affects']: {type: 'enemy', count: '5', choice: true},
                ['system.activities.' + tcAct.id + '.effects']: [{_id: eff.id}]};
            if (tcAct.type === 'save') upd['system.activities.' + tcAct.id + '.save'] = {ability: ['cha'], dc: {calculation: 'cha', formula: ''}};
            else report.push('<b>Turncoat: its activity is not a save activity.</b>');
            await tc.update(upd);
            report.push('Invoke Hell: Turncoat: target up to 5 enemies within 60 ft, Charisma save DC ' + dc + '; a failure charms it for 1 minute (save again at the end of each of its turns). <i>Check the charm against the book.</i>');
        }
    }

    // ---- 1.7.1: Combat Mastery: Lies: the weapon itself attacks with Charisma (v13 and v14) -----
    async function liesWeapons() {
        const lies = find('combatMasteryLies', /combat mastery:\s*lies/i);
        if (!lies) return;
        const owned = t => actor.items.some(i => i.type === 'weapon' && i.system.type?.baseItem === t);
        let wt = lies.flags?.[MOD]?.weaponType;
        const cprWt = lies.flags?.['chris-premades']?.config?.weaponType;
        if (!wt && cprWt && owned(cprWt)) wt = cprWt;
        if (!wt && court.liesDefault && owned(court.liesDefault)) wt = court.liesDefault;
        if (!wt) {
            const types = Array.from(new Set(actor.items.filter(i => i.type === 'weapon' && i.system.equipped && i.system.type?.baseItem && !/R$/.test(i.system.type?.value ?? '')).map(i => i.system.type.baseItem)));
            if (types.length === 1) wt = types[0];
        }
        if (!wt) return report.push('<b>Combat Mastery: Lies: no single melee weapon type equipped</b>: set flags.nix-module.weaponType on the item (e.g. longsword).');
        await lies.update({['flags.' + MOD + '.weaponType']: wt, 'flags.chris-premades.config.weaponType': wt});
        const fixed = [];
        for (const w of actor.items.filter(i => i.type === 'weapon' && i.system.type?.baseItem === wt)) {
            const upd = {};
            for (const a of acts(w)) if (a.type === 'attack' && a.attack?.ability !== 'cha') upd['system.activities.' + a.id + '.attack.ability'] = 'cha';
            if (Object.keys(upd).length) await w.update(upd);
            fixed.push(w.name);
        }
        report.push('Combat Mastery: Lies (' + wt + '): ' + (fixed.join(', ') || 'none') + ' attack and deal damage with Charisma (set on the weapon itself).');
    }

    // ---- 1.7.1, v13: Infernal Conduit dice rolled with the activity (one manual roll, before the save)
    async function infernalConduitV13() {
        if (V14) return;
        const ic = find('infernalConduit', /^infernal conduit$/i);
        if (!ic) return;
        const ids = ic.flags?.['chris-premades']?.activityIdentifiers ?? {};
        const typeOf = a => Object.entries(ids).find(([, id]) => id === a.id)?.[0] ?? (/heal/i.test(a.name ?? '') ? 'healing' : 'necrotic');
        const upd = {};
        for (const a of acts(ic)) {
            if (a.type !== 'save') continue;
            const t = typeOf(a);
            upd['system.activities.' + a.id + '.damage.parts'] = [{number: 1, denomination: 10, bonus: '', types: [t], custom: {enabled: false, formula: ''}, scaling: {mode: 'whole', number: 1}}];
            upd['system.activities.' + a.id + '.flags.' + MOD + '.court'] = 'conduit';
        }
        if (!Object.keys(upd).length) return report.push('<b>Infernal Conduit: no Heal / Harm save activities found.</b>');
        await ic.update(upd);
        await stripCpr(ic, 'infernalConduit');
        report.push('Infernal Conduit: the dice (one d10 per use spent) are the activity\'s own damage, so they\'re rolled once, before the save (manual rolls ask once). Harm heals him by the necrotic dealt; Heal costs him the HP healed. Range 5 ft (30 ft with Unfettered).');
    }

    // ---- 1.7.1, v13: Vengeful Shot: one prompt (the weapon is picked for you)
    async function vengefulShotV13() {
        if (V14) return;
        const vs = actor.items.find(i => ident(i) === 'interdictBoonVengefulShot' || /^interdict boons:\s*vengeful shot$/i.test(i.name));
        if (!vs) return;
        await stripCpr(vs, 'interdictBoonVengefulShot');
        const upd = {};
        for (const a of acts(vs)) upd['system.activities.' + a.id + '.flags.' + MOD + '.court'] = 'vengefulShot';
        await vs.update(upd);
        report.push('Vengeful Shot: target the creature, use it: the attack is made with his ranged weapon (or his only weapon) without asking; you\'re asked only if he has several that fit.');
    }

    // ---- 1.7.1: Mage Slayer (2024), built in: concentration breaker + Guarded Mind
    async function mageSlayer() {
        const ms = actor.items.find(i => i.type === 'feat' && /^mage slayer\b/i.test(i.name));
        court.mageSlayer = ms?.id ?? null;
        if (!ms) return;
        if (!ms.system.uses?.max) await ms.update({'system.uses': {max: '1', spent: 0, recovery: [{period: 'sr', type: 'recoverAll'}]}});
        const body = 'const ab = (typeof saveId !== "undefined" && saveId) || roll?.options?.ability || roll?.data?.abilityId;\n'
            + 'const add = await game.modules.get("nix-module")?.api?.court?.guardedMind(me, roll, ab);\nif (!add) return;\n'
            + 'const out = await rollUtils.addToRoll(roll, String(add), {rollData: roll.data});\nout.options.nixGuardedMind = true;\nreturn out;\n})();';
        if (V14 && typeof setCat === 'function') {
            await setCat(ms, ['Guarded Mind'], [{name: 'Guarded Mind', event: 'save', pass: 'actorBonus', macros: [{priority: 90,
                macro: 'return await (async () => {\nconst me = document.parent;\nif (!roll || roll.options?.nixGuardedMind) return;\n' + body}]}]);
        } else if (typeof setMacros === 'function') {
            await setMacros(ms, ['Guarded Mind'], [{name: 'Guarded Mind', type: 'save', pass: 'bonus', priority: 90,
                macro: 'return await (async () => {\nconst t = trigger;\nconst me = t.entity.actor;\nconst roll = t.roll;\nconst saveId = t.saveId;\nif (!roll || roll.options?.nixGuardedMind) return;\n' + body}]);
        }
        report.push('Mage Slayer: a concentrating creature ' + actor.name + ' damages makes its concentration save with disadvantage; Guarded Mind (1/short rest): when ' + actor.name + ' fails an Int, Wis or Cha save you\'re asked whether to succeed instead. Built in, so set Gambit\'s / Chris\'s Premades\' Mage Slayer to none on her (one prompt).');
    }

    await splitBundles();

    // ---- Character section -----------------------------------------------------------------
    report.push(await mark(findAct(/foul interchange/i, /sutekh/i), 'interchange', {noEffects: true, noSealCost: true})
        ? 'Foul Interchange (Action): target the afflicted creature, then pick the condition and who it passes to.' : '<b>Foul Interchange not found</b> (Sutekh\'s Interdiction).');
    report.push(await mark(findAct(/sutekh'?s blessing/i, /sutekh'?s blessing/i), 'blessing')
        ? 'Sutekh\'s Blessing (Action, ' + actor.system.attributes.prof + '/day): whispers you every creature with blood within 120 ft (distance, direction, type).' : '<b>Sutekh\'s Blessing not found.</b>');
    // Invoke Hell options (1.7.1): Embolden Allies opens a window to split the healing; Vitalize applies the bonus.
    report.push(await mark(findAct(/embolden allies/i, /invoke hell/i), 'embolden', {noEffects: true})
        ? 'Embolden Allies (Invoke Hell, Bonus Action): a window to split ' + (5 * (actor.classes?.illrigger?.system.levels ?? 15)) + ' HP between him and creatures within 30 ft.' : '<b>Embolden Allies not found.</b>');
    report.push(await mark(findAct(/vitalize/i, /invoke hell/i), 'vitalize', {noEffects: true})
        ? 'Vitalize (Invoke Hell): pick creatures within 30 ft; +' + actor.system.attributes.prof + ' to ability checks for 1 minute.' : '<b>Vitalize not found.</b>');
    const has = re => actor.items.some(i => re.test(i.name) || i.system.activities?.some?.(a => re.test(a.name ?? '')));
    court.sanguineGift = has(/sanguine gift/i);
    court.bloodstroke = has(/^bloodstroke/i);
    court.haemal = has(/haemal exchange/i);
    const sg = findAct(/sanguine gift/i, /sutekh/i);
    if (sg) await mark(sg, 'none', {noEffects: true});
    if (court.sanguineGift) report.push('Sanguine Gift: when an ally within 30 ft regains hit points, you get a prompt to spend a seal for +' + (actor.classes?.illrigger?.system.levels ?? 15) + ' (no action).');
    if (court.bloodstroke) report.push('Bloodstroke: an ally holding Exsanguinate temporary HP is hit by a melee attack: the attacker takes ' + (actor.classes?.illrigger?.system.levels ?? 15) + ' ' + court.bloodstrokeType
        + ' damage (change flags.nix-module.court.bloodstrokeType to cold or fire).');
    if (court.haemal) report.push('Haemal Exchange (reaction, 60 ft): offered when a creature carrying his seal rolls an attack that hits by less than 8, or is about to save. Burns the seal (damage), it subtracts 1d8, an ally within 30 ft gets +1d8 on its next attack or save.');
    report.push('Exsanguinate: engine (temp HP to an ally when he burns seals on a living creature).');
    // Unarmed Strike: his main attack, 1d8 bludgeoning (+ his ability modifier, added by dnd5e). Terrorizing Force
    // counts it (an unarmed strike is a melee weapon attack), so its extra damage lands on it too.
    {
        const us = actor.items.find(i => i.type === 'weapon' && (i.system.type?.value === 'unarmed' || /^unarmed strike/i.test(i.name)));
        if (us) {
            const b = us.system.damage?.base ?? {};
            const types = Array.from(b.types ?? []);
            if (!(b.number === 1 && b.denomination === 8 && !b.custom?.enabled && !b.bonus))
                await us.update({'system.damage.base.number': 1, 'system.damage.base.denomination': 8, 'system.damage.base.bonus': '',
                    'system.damage.base.custom.enabled': false, 'system.damage.base.types': types.length ? types : ['bludgeoning']});
            report.push('Unarmed Strike: 1d8 ' + (types[0] ?? 'bludgeoning') + ' + his modifier (his main attack; his Strike (2) Legendary Action too). Terrorizing Force adds to it.');
        } else report.push('<b>Unarmed Strike not found.</b>');
    }
    const ar = find(null, /^adrenaline rush/i), re = find(null, /^relentless endurance/i);
    report.push('Orc: ' + [ar && 'Adrenaline Rush (' + (ar.system.uses?.max ?? '?') + '/SR)', re && 'Relentless Endurance' + (ident(re) ? ' (Chris\'s Premades)' : ' (sheet only: drop him to 1 HP yourself once per long rest)')].filter(Boolean).join(', ') + '.');

    await enginePassives();
    await illriggerSpells();
    await feats();
    await hellspeakerOptions();
    await liesWeapons();
    await infernalConduitV13();
    await vengefulShotV13();
    await mageSlayer();
    await actor.update({['flags.' + MOD + '.court']: court});
    await ChatMessage.create({whisper: [game.user.id], content: '<b>Nix Fix: ' + actor.name + ' fixes</b><ul><li>' + report.join('</li><li>') + '</li></ul>'});
}
for (const t of canvas.tokens.controlled) if (t.actor) await fixOne(t.actor);
