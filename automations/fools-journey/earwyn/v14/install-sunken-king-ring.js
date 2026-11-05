// =====================================================================
//  RING OF THE SUNKEN KING, Foundry v14 (Chris's Premades 2 / CAT) copy
//  Run by Nix Fix (or as a Script macro with Earwyn selected, as GM).
//  Safe to re-run.
//   - Creates / refreshes the "Spectral Tentacle" actor (Summons (Nix) folder)
//   - Ring > Summon Tentacle is now a dnd5e Summon activity (CAT's summon generic
//     attached): place it within 20 ft. AC 10 + Cha, HP 2 x level, attacks with her
//     spell attack bonus (Cha + proficiency), 1d8 + Cha.
//   - Tentacle: Slam (reach 10) and Grapple (Athletics contest -> Restrained)
//  v14 changes: Chris's Premades 1's Summons.spawn is gone, so dnd5e's summon
//  activity does the placing and scaling; CAT macros; no remote rolls (the grapple
//  rolls both sides on the client that uses it); the Restrained effect ends itself
//  when the tentacle is gone.
// =====================================================================
 
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Ring of the Sunken King (v14): select Earwyn\'s token first.');
const ring = actor.items.find(i => /sunken king/i.test(i.name));
if (!ring) return ui.notifications.error(actor.name + ' has no Ring of the Sunken King.');
const run = fn => 'return await (' + fn.toString() + ')();';
const report = [];
 
// ---- Macros ---------------------------------------------------------------------------
// Tentacle's Grapple activity: roll / activityRollFinished / 50.
const grappleScript = async () => {
    const mine = workflow.token;
    const target = workflow.targets?.first?.();
    if (!mine || !target?.actor) return ui.notifications.warn('Grapple: target a creature within 10 ft.');
    if (tokenUtils.getDistance(mine.document, target.document) > 10) return ui.notifications.warn('Grapple: ' + target.document.name + ' is more than 10 ft away.');
    const tent = workflow.actor;
    // The summoner: dnd5e / CAT record it on the summoned actor; fall back to the ring's wearer flag.
    const ownerUuid = tent.system?.summon?.summoner?.uuid ?? tent.flags?.dnd5e?.summon?.origin?.split('.Item.')[0]
        ?? tent.flags?.world?.nixTentacleOwner;
    const wearer = (ownerUuid ? await fromUuid(ownerUuid) : null) ?? game.actors.find(a => a.items.some(i => /sunken king/i.test(i.name)));
    const sign = n => (n < 0 ? ' - ' + Math.abs(n) : ' + ' + n);
    // Tentacle: Athletics with the wearer's Strength and proficiency.
    const athMod = wearer ? (wearer.system.abilities.str.mod + (wearer.system.attributes.prof ?? 0)) : (tent.system.skills?.ath?.total ?? tent.system.abilities.str.mod);
    const tRoll = await new Roll('1d20' + sign(athMod)).evaluate();
    await tRoll.toMessage({speaker: ChatMessage.getSpeaker({token: mine.document}), flavor: 'Spectral Tentacle grapple: Athletics (d20' + sign(athMod) + ')'});
    const ta = target.actor;
    const tAth = ta.system.skills?.ath?.total ?? ta.system.abilities.str.mod;
    const tAcr = ta.system.skills?.acr?.total ?? ta.system.abilities.dex.mod;
    const useAcr = tAcr > tAth;
    const aMod = useAcr ? tAcr : tAth;
    const dRoll = await new Roll('1d20' + sign(aMod)).evaluate();
    await dRoll.toMessage({speaker: ChatMessage.getSpeaker({token: target.document}),
        flavor: target.document.name + ' resists the tentacle: ' + (useAcr ? 'Acrobatics' : 'Athletics') + ' (d20' + sign(aMod) + ')'});
    const score = '(' + tRoll.total + ' vs ' + dRoll.total + ')';
    if (tRoll.total <= dRoll.total) {
        await ChatMessage.create({speaker: ChatMessage.getSpeaker({token: mine.document}),
            content: '<b>Grapple:</b> ' + target.document.name + ' slips free of the tentacle ' + score + (tRoll.total === dRoll.total ? ', a tie goes to the target.' : '.')});
        return;
    }
    const old = ta.effects.filter(e => e.flags?.world?.nixTentacleToken);
    for (const e of old) await documentUtils.deleteDocument(e);
    // On the Restrained effect: ends at the start of the target's turn if the tentacle is gone.
    const stillHeld = async () => {
        const fx = document;
        const tokUuid = fx.flags?.world?.nixTentacleToken;
        const t = tokUuid ? fromUuidSync(tokUuid) : null;
        if (!t || (t.actor?.system.attributes?.hp?.value ?? 1) <= 0) await documentUtils.deleteDocument(fx);
    };
    await effectUtils.createEffects(ta, [{
        name: 'Restrained (Spectral Tentacle)', img: 'icons/creatures/tentacles/tentacles-octopus-black-pink.webp', origin: workflow.item.uuid,
        statuses: ['restrained'],
        description: 'Held by a spectral tentacle. Ends if the tentacle is dismissed or destroyed (checked at the start of each of its turns), or the GM rules it escaped.',
        flags: {
            world: {nixTentacleGrip: wearer?.uuid ?? tent.uuid, nixTentacleToken: mine.document.uuid},
            cat: {embeddedMacros: [{name: 'Tentacle hold check', event: 'combat', pass: 'actorTurnStart', macros: [{priority: 50, macro: 'return await (' + stillHeld.toString() + ')();'}]}]}
        }
    }]);
    if (globalThis.Sequence) {
        const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };
        const f = ['jb2a.markers.chain.spectral_standard.complete.02.green', 'jb2a.entangle.green'].find(ok);
        if (f) new Sequence().effect().file(f).atLocation(target).scaleToObject(1.4).duration(2500).fadeOut(600).play();
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({token: mine.document}), content: '<b>Grapple:</b> the tentacle seizes ' + target.document.name + ' ' + score + ': <b>Restrained</b>.'});
};
// Tentacle's Release activity: roll / activityRollFinished / 50.
const releaseScript = async () => {
    const mine = workflow.token;
    if (!mine) return;
    for (const t of canvas.tokens.placeables) {
        for (const e of t.actor?.effects.filter(e => e.flags?.world?.nixTentacleToken === mine.document.uuid) ?? []) await documentUtils.deleteDocument(e);
    }
    await ChatMessage.create({speaker: ChatMessage.getSpeaker({token: mine.document}), content: '<b>Spectral Tentacle:</b> lets go.'});
};
// Ring's Summon Tentacle activity: roll / activityPreItemRoll / 50 and activityRollFinished / 60.
// One tentacle at a time: remember the old ones, remove them once the new one is placed.
const summonBefore = async () => {
    const base = game.actors.find(a => a.getFlag('world', 'nixSunkenTentacleBase'));
    if (!base) return;
    workflow.nixOldTentacles = canvas.scene.tokens.filter(t => t.actorId === base.id).map(t => t.uuid);
};
const summonAfter = async () => {
    const old = workflow.nixOldTentacles ?? [];
    if (!old.length) return;
    await genericUtils.sleep(500);
    for (const uuid of old) {
        const t = fromUuidSync(uuid);
        if (!t) continue;
        for (const p of canvas.tokens.placeables) {
            for (const e of p.actor?.effects.filter(e => e.flags?.world?.nixTentacleToken === uuid) ?? []) await documentUtils.deleteDocument(e);
        }
        try { await documentUtils.deleteDocument(t); }
        catch { ui.notifications.warn('Ring of the Sunken King: the GM needs to remove the old tentacle.'); }
    }
};
 
// ---- 1. The Spectral Tentacle world actor ------------------------------------------------
let folder = game.folders?.find(f => f.type === 'Actor' && f.name === 'Summons (Nix)');
if (!folder && globalThis.Folder) folder = await Folder.create({name: 'Summons (Nix)', type: 'Actor'});
const slam = {
    name: 'Slam', type: 'weapon', img: 'icons/creatures/tentacles/tentacle-eyes-yellow-pink.webp',
    system: {
        type: {value: 'natural', baseItem: ''}, equipped: true, proficient: 1,
        range: {reach: 10, units: 'ft'},
        damage: {base: {number: 1, denomination: 8, bonus: '', types: ['bludgeoning']}},
        description: {value: '<p>Melee attack against a foe within 10 ft: 1d8 + the wearer\'s Charisma modifier bludgeoning damage. Attack bonus = the wearer\'s spell attack bonus (Charisma + Proficiency).</p>'},
        activities: {nixTentacleSlam0: {_id: 'nixTentacleSlam0', type: 'attack', name: 'Slam',
            activation: {type: 'action', value: 1}, range: {reach: 10, units: 'ft'},
            target: {affects: {type: 'creature', count: '1'}},
            attack: {ability: 'none', bonus: '', flat: false, type: {value: 'melee', classification: 'weapon'}},
            damage: {includeBase: false, parts: [{number: 1, denomination: 8, bonus: '', types: ['bludgeoning']}]}}}
    }
};
const grapple = {
    name: 'Grapple', type: 'feat', img: 'icons/creatures/tentacles/tentacles-octopus-black-pink.webp',
    system: {
        type: {value: 'monster', subtype: ''},
        description: {value: '<p>Target a creature within 10 ft. The tentacle makes an Athletics check (the wearer\'s Strength + proficiency) against the target\'s Athletics or Acrobatics (whichever is higher). If the tentacle is higher (a tie goes to the target), the target is Restrained until the tentacle lets go, is dismissed or destroyed.</p>'},
        activities: {
            nixTentacleGrab0: {_id: 'nixTentacleGrab0', type: 'utility', name: 'Grapple',
                activation: {type: 'action', value: 1}, range: {value: '10', units: 'ft'},
                target: {affects: {type: 'creature', count: '1'}},
                flags: {cat: {embeddedMacros: [{name: 'Tentacle grapple', event: 'roll', pass: 'activityRollFinished', macros: [{priority: 50, macro: run(grappleScript)}]}]}}},
            nixTentacleFree0: {_id: 'nixTentacleFree0', type: 'utility', name: 'Release',
                activation: {type: 'special', value: null}, range: {units: 'self'}, target: {affects: {type: 'self'}},
                flags: {cat: {embeddedMacros: [{name: 'Tentacle release', event: 'roll', pass: 'activityRollFinished', macros: [{priority: 50, macro: run(releaseScript)}]}]}}}
        }
    }
};
const baseData = {
    name: 'Spectral Tentacle', type: 'npc', folder: folder?.id, img: 'icons/creatures/tentacles/tentacle-eyes-yellow-pink.webp',
    system: {
        abilities: {str: {value: 16}, dex: {value: 12}, con: {value: 14}, int: {value: 1}, wis: {value: 10}, cha: {value: 1}},
        attributes: {ac: {calc: 'flat', flat: 10}, hp: {value: 1, max: 1}, movement: {walk: 0, units: 'ft'}},
        details: {type: {value: 'construct', custom: 'spectral'}, cr: 1, biography: {value: '<p>Summoned by the Ring of the Sunken King. AC = 10 + wearer\'s Cha modifier, HP = 2 x wearer\'s level.</p>'}},
        traits: {size: 'lg', di: {value: ['poison', 'psychic']}, ci: {value: ['charmed', 'frightened', 'poisoned', 'prone', 'exhaustion']}}
    },
    prototypeToken: {name: 'Spectral Tentacle', actorLink: false, width: 1, height: 1, lockRotation: true, ring: {enabled: false},
        texture: {src: 'modules/jb2a_patreon/Library/Generic/Nature/VineElementalLoop02_03_Dark_Blue_300x300.webm', scaleX: 1.6, scaleY: 1.6}},
    items: [slam, grapple],
    flags: {world: {nixSunkenTentacleBase: true, nixTentacleOwner: actor.uuid}}
};
let base = game.actors.find(a => a.getFlag('world', 'nixSunkenTentacleBase'));
if (base) {
    await base.deleteEmbeddedDocuments('Item', base.items.map(i => i.id));
    const {items, ...rest} = baseData;
    await base.update(rest);
    await base.createEmbeddedDocuments('Item', items);
    report.push('<li>Spectral Tentacle actor refreshed.</li>');
} else if (globalThis.Actor?.create) {
    base = await Actor.create(baseData);
    report.push('<li>Spectral Tentacle actor created in the "Summons (Nix)" folder.</li>');
}
if (!base) report.push('<li><b>Could not create the Spectral Tentacle actor.</b></li>');
else {
    const owners = Object.fromEntries(Object.entries(actor.ownership ?? {}).filter(([id, l]) => id !== 'default' && l >= 3));
    if (Object.keys(owners).length) await base.update({ownership: {...(base.ownership ?? {}), ...owners}});
}
 
// ---- 2. The ring: one dnd5e Summon activity ------------------------------------------------
for (const a of ring.system.activities.contents) if (a.name !== 'Summon Tentacle' || a.type !== 'summon') await ring.update({['system.activities.-=' + a.id]: null});
if (ring.flags?.['chris-premades']?.embeddedActivityMacros) await ring.update({'flags.chris-premades.-=embeddedActivityMacros': null});
const sData = {
    img: 'icons/creatures/tentacles/tentacle-eyes-yellow-pink.webp',
    activation: {type: 'action', value: 1, override: true},
    consumption: {targets: [], scaling: {allowed: false}},
    range: {value: '20', units: 'ft', override: true},
    target: {affects: {type: 'space'}, override: true},
    duration: {units: 'perm', override: true},
    bonuses: {ac: '@abilities.cha.mod', hp: '2 * @details.level - 1', attackDamage: '@abilities.cha.mod', saveDamage: '', healing: ''},
    match: {attacks: true, proficiency: true, saves: false, disposition: true},
    profiles: base ? [{_id: 'nixTentacleProf', count: '1', name: 'Spectral Tentacle', uuid: base.uuid}] : [],
    summon: {mode: '', prompt: true}
};
let summon = ring.system.activities.contents.find(a => a.name === 'Summon Tentacle' && a.type === 'summon');
if (!summon) { await ring.createActivity('summon', {name: 'Summon Tentacle', ...sData}, {renderSheet: false}); summon = ring.system.activities.contents.find(a => a.name === 'Summon Tentacle'); }
else await summon.update(sData);
if (summon) await summon.update({'flags.cat.embeddedMacros': [
    {name: 'Tentacle: one at a time', event: 'roll', pass: 'activityPreItemRoll', macros: [{priority: 50, macro: run(summonBefore)}]},
    {name: 'Tentacle: remove old', event: 'roll', pass: 'activityRollFinished', macros: [{priority: 60, macro: run(summonAfter)}]}]});
// CAT's summon generic (placement animation, dismiss button, follows the summoner), like Chris's Premades 2's summon spells.
const catMacros = foundry.utils.deepClone(ring.flags?.cat?.macros ?? {});
for (const k of ['summon', 'move']) {
    catMacros[k] = (catMacros[k] ?? []).filter(m => !(m.source === 'cat' && m.identifier === 'summon'));
    catMacros[k].push({source: 'cat', rules: 'all', identifier: 'summon'});
}
await ring.update({'flags.cat.macros': catMacros});
 
const cha = actor.system.abilities.cha.mod, prof = actor.system.attributes.prof, lvl = actor.system.details?.level ?? 1;
report.push('<li><b>Summon Tentacle</b> (Action): dnd5e\'s summon window, then place it within 20 ft. AC ' + (10 + cha) + ', HP ' + (2 * lvl)
    + ', Slam +' + (cha + prof) + ' to hit (her spell attack), 1d8 + ' + cha + '. Summoning again removes the old tentacle.</li>');
report.push('<li><b>Grapple</b>: Athletics (+' + (actor.system.abilities.str.mod + prof) + ') vs the target\'s Athletics or Acrobatics; Restrained until released, dismissed or destroyed. <b>Release</b> lets go.</li>');
report.push('<li><i>Players can only summon if the dnd5e setting <b>Allow Summoning</b> is on (Game Settings > D&amp;D 5e).</i></li>');
await ChatMessage.create({whisper: [game.user.id], content: '<b>Ring of the Sunken King (v14) on ' + actor.name + '</b><ul>' + report.join('') + '</ul>'});
 