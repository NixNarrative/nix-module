// =====================================================================
//  RING OF THE SUNKEN KING: INSTALLER (Script macro, run as GM)
//  Select Earwyn's token, then run. Safe to re-run.
//   - Creates the "Spectral Tentacle" template actor (Summons (Nix) folder)
//   - Ring > Summon Tentacle: place it within 20 ft (Chris's Premades summon),
//     AC 10 + Cha, HP 2 x level, acts right after the wearer
//   - Tentacle: Slam (reach 10, 1d8 + Cha) and Grapple (Str contest -> Restrained)
// =====================================================================
const SCRIPTS = {
 "SUMMON": "await (async () => {\n    const TOKEN_ART = 'modules/jb2a_patreon/Library/Generic/Nature/VineElementalLoop02_03_Dark_Blue_300x300.webm';\n    const ring = workflow.item;\n    const actor = workflow.actor;\n    if (!workflow.token) return ui.notifications.warn(ring.name + ': put ' + actor.name + '\\'s token on the scene first.');\n    try {\n        // One tentacle at a time: dismiss the old one (effect + any leftover tokens).\n        const old = effectUtils.getEffectByIdentifier(actor, 'nixSunkenTentacle');\n        if (old) { await genericUtils.remove(old); await new Promise(r => setTimeout(r, 300)); }\n        for (const scene of game.scenes) {\n            const left = scene.tokens.filter(t => t.actor?.flags?.world?.nixTentacleOwner === actor.uuid).map(t => t.id);\n            if (left.length) await genericUtils.deleteEmbeddedDocuments(scene, 'Token', left);\n        }\n        const source = game.actors.find(a => a.getFlag('world', 'nixSunkenTentacleBase'));\n        if (!source) return ui.notifications.error(ring.name + ': the Spectral Tentacle actor is missing. Re-run the installer.');\n        const cha = actor.system.abilities.cha.mod;\n        const prof = actor.system.attributes.prof;\n        const level = actor.system.details?.level ?? 1;\n        const name = actor.name + '\\'s Spectral Tentacle';\n        const art = source.prototypeToken?.texture?.src || TOKEN_ART;\n        const scale = source.prototypeToken?.texture?.scaleX || 1.6;\n        const items = source.items.map(i => {\n            const d = i.toObject();\n            delete d._id;\n            for (const a of Object.values(d.system.activities ?? {})) {\n                if (a.type === 'attack') a.attack = {...(a.attack ?? {}), ability: 'none', bonus: String(cha + prof), flat: true};\n                if (a.damage?.parts?.[0]) a.damage.parts[0].bonus = String(cha);\n            }\n            return d;\n        });\n        const tokenData = {name, disposition: workflow.token.document.disposition,\n            texture: {src: art, scaleX: scale, scaleY: scale}, ring: {enabled: false}, lockRotation: true};\n        const updates = {\n            actor: {\n                name,\n                system: {\n                    abilities: {str: {value: actor.system.abilities.str.value}},\n                    attributes: {ac: {calc: 'flat', flat: 10 + cha}, hp: {max: 2 * level, value: 2 * level}}\n                },\n                prototypeToken: tokenData,\n                items,\n                flags: {world: {nixTentacleOwner: actor.uuid}}\n            },\n            token: tokenData\n        };\n        const spawned = await Summons.spawn(source, updates, ring, workflow.token, {\n            range: 20, animation: 'water', initiativeType: 'follows', customIdentifier: 'nixSunkenTentacle',\n            additionalSummonVaeButtons: [{type: 'use', name: 'Slam', identifier: 'nixTentacleSlam'}, {type: 'use', name: 'Grapple', identifier: 'nixTentacleGrapple'}]\n        });\n        if (!spawned?.length) return;\n        const effect = effectUtils.getEffectByIdentifier(actor, 'nixSunkenTentacle');\n        if (effect) await effect.setFlag('chris-premades', 'embeddedMacros', [\n            {name: 'Tentacle released', type: 'effect', pass: 'deleted', priority: 50, macro: \"await (async () => {\\n    const owner = trigger.entity.parent?.uuid;\\n    for (const t of canvas.tokens.placeables) {\\n        const fx = t.actor?.effects.filter(e => e.flags?.world?.nixTentacleGrip === owner) ?? [];\\n        for (const e of fx) await genericUtils.remove(e);\\n    }\\n})();\"}]);\n    } catch (err) {\n        console.error('Ring of the Sunken King | summon failed', err);\n        ui.notifications.error(ring.name + ': summoning failed (' + (err?.message ?? err) + '). Press F12 > Console for details.');\n    }\n})();",
 "RELEASE": "await (async () => {\n    const owner = trigger.entity.parent?.uuid;\n    for (const t of canvas.tokens.placeables) {\n        const fx = t.actor?.effects.filter(e => e.flags?.world?.nixTentacleGrip === owner) ?? [];\n        for (const e of fx) await genericUtils.remove(e);\n    }\n})();",
 "GRAPPLE": "await (async () => {\n    const me = workflow.token;\n    const target = workflow.targets?.first?.();\n    if (!me || !target?.actor) return ui.notifications.warn('Grapple: target a creature within 10 ft.');\n    if (tokenUtils.getDistance(me, target) > 10) return ui.notifications.warn('Grapple: ' + target.document.name + ' is more than 10 ft away.');\n    const owner = workflow.actor.flags?.world?.nixTentacleOwner ?? workflow.actor.uuid;\n    const wearer = (await fromUuid(owner)) ?? workflow.actor;\n    const ta = target.actor;\n    // Each side's dice go to whoever owns that creature (manual dice entry works as usual).\n    const rollFor = async (formula, who) => {\n        const userId = socketUtils.firstOwner(who, true) ?? game.user.id;\n        const roll = new Roll(formula);\n        return userId === game.user.id ? await roll.evaluate() : await rollUtils.remoteRoll(roll, userId);\n    };\n    const sign = n => (n < 0 ? ' - ' + Math.abs(n) : ' + ' + n);\n    // Tentacle: its Athletics (rolled by the wearer's player).\n    const tent = workflow.actor;\n    const athMod = tent.system.skills?.ath?.total ?? tent.system.abilities.str.mod;\n    const tRoll = await rollFor('1d20' + sign(athMod), wearer);\n    await tRoll.toMessage({speaker: ChatMessage.getSpeaker({token: me.document}),\n        flavor: 'Spectral Tentacle grapple: Athletics (d20' + sign(athMod) + ')'});\n    // Target: Athletics or Acrobatics, whichever is higher (Athletics on a tie).\n    const tAth = ta.system.skills?.ath?.total ?? ta.system.abilities.str.mod;\n    const tAcr = ta.system.skills?.acr?.total ?? ta.system.abilities.dex.mod;\n    const useAcr = tAcr > tAth;\n    const aMod = useAcr ? tAcr : tAth;\n    const dRoll = await rollFor('1d20' + sign(aMod), ta);\n    await dRoll.toMessage({speaker: ChatMessage.getSpeaker({token: target.document}),\n        flavor: target.document.name + ' resists the tentacle: ' + (useAcr ? 'Acrobatics' : 'Athletics') + ' (d20' + sign(aMod) + ')'});\n    const score = '(' + tRoll.total + ' vs ' + dRoll.total + ')';\n    if (tRoll.total <= dRoll.total) {                                   // tie: the target wins\n        await ChatMessage.create({speaker: ChatMessage.getSpeaker({token: me.document}),\n            content: '<b>Grapple:</b> ' + target.document.name + ' slips free of the tentacle ' + score + (tRoll.total === dRoll.total ? ', a tie goes to the target.' : '.')});\n        return;\n    }\n    const old = target.actor.effects.filter(e => e.flags?.world?.nixTentacleGrip === owner);\n    for (const e of old) await genericUtils.remove(e);\n    await effectUtils.createEffect(target.actor, {\n        name: 'Restrained (Spectral Tentacle)', img: 'icons/creatures/tentacles/tentacles-octopus-black-pink.webp', origin: workflow.item.uuid,\n        statuses: ['restrained'],\n        description: 'Held by a spectral tentacle. Ends if the tentacle is dismissed or destroyed (or the GM rules it escaped).',\n        flags: {world: {nixTentacleGrip: owner, nixTentacleToken: me.document.uuid}}\n    });\n    if (globalThis.Sequence) {\n        const ok = p => { try { return Sequencer.Database.entryExists(p); } catch { return false; } };\n        const f = ['jb2a.markers.chain.spectral_standard.complete.02.green', 'jb2a.entangle.green'].find(ok);\n        if (f) new Sequence().effect().file(f).atLocation(target).scaleToObject(1.4).duration(2500).fadeOut(600).play();\n    }\n    await ChatMessage.create({speaker: ChatMessage.getSpeaker({token: me.document}), content: '<b>Grapple:</b> the tentacle seizes ' + target.document.name + ' ' + score + ': <b>Restrained</b>.'});\n})();"
};
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (!actor) return ui.notifications.warn('Ring of the Sunken King: select Earwyn\'s token first.');
const ring = actor.items.find(i => /sunken king/i.test(i.name));
if (!ring) return ui.notifications.error(actor.name + ' has no Ring of the Sunken King.');
 
// ---- 1. The Spectral Tentacle world actor (template the ring summons from) ---------------------
let folder = game.folders.find(f => f.type === 'Actor' && f.name === 'Summons (Nix)');
if (!folder) folder = await Folder.create({name: 'Summons (Nix)', type: 'Actor'});
const slam = {
    name: 'Slam', type: 'weapon', img: 'icons/creatures/tentacles/tentacle-eyes-yellow-pink.webp',
    system: {
        type: {value: 'natural', baseItem: ''}, equipped: true, proficient: 1,
        range: {reach: 10, units: 'ft'},
        damage: {base: {number: 1, denomination: 8, bonus: '', types: ['bludgeoning']}},
        description: {value: '<p>Melee attack against a foe within 10 ft: 1d8 + the wearer\'s Charisma modifier bludgeoning damage. Attack bonus = wearer\'s Charisma modifier + Proficiency Bonus.</p>'},
        activities: {nixTentacleSlam0: {_id: 'nixTentacleSlam0', type: 'attack', name: 'Slam',
            activation: {type: 'action', value: 1}, range: {reach: 10, units: 'ft'},
            target: {affects: {type: 'creature', count: '1'}},
            attack: {ability: 'none', bonus: '0', flat: true, type: {value: 'melee', classification: 'weapon'}},
            damage: {includeBase: false, parts: [{number: 1, denomination: 8, bonus: '0', types: ['bludgeoning']}]}}}
    },
    flags: {'chris-premades': {info: {identifier: 'nixTentacleSlam'}}}
};
const grapple = {
    name: 'Grapple', type: 'feat', img: 'icons/creatures/tentacles/tentacles-octopus-black-pink.webp',
    system: {
        type: {value: 'monster', subtype: ''},
        description: {value: '<p>Target a creature within 10 ft. The tentacle makes an Athletics check (rolled by the wearer) against the target\'s Athletics or Acrobatics (whichever is higher). If the tentacle is higher (a tie goes to the target), the target is Restrained until the tentacle lets go, is dismissed or destroyed.</p>'},
        activities: {nixTentacleGrab0: {_id: 'nixTentacleGrab0', type: 'utility', name: 'Grapple',
            activation: {type: 'action', value: 1}, range: {value: '10', units: 'ft'},
            target: {affects: {type: 'creature', count: '1'}}}}
    },
    flags: {'chris-premades': {info: {identifier: 'nixTentacleGrapple'},
        embeddedMacros: [{name: 'Tentacle grapple', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.GRAPPLE}]}}
};
const baseData = {
    name: 'Spectral Tentacle', type: 'npc', folder: folder.id, img: 'icons/creatures/tentacles/tentacle-eyes-yellow-pink.webp',
    system: {
        abilities: {str: {value: 16}, dex: {value: 12}, con: {value: 14}, int: {value: 1}, wis: {value: 10}, cha: {value: 1}},
        attributes: {ac: {calc: 'flat', flat: 12}, hp: {value: 10, max: 10}, movement: {walk: 0, units: 'ft'}},
        details: {type: {value: 'construct', custom: 'spectral'}, cr: 1, biography: {value: '<p>Summoned by the Ring of the Sunken King. AC = 10 + wearer\'s Cha modifier, HP = 2 x wearer\'s level, acts right after the wearer.</p>'}},
        traits: {size: 'lg', di: {value: ['poison', 'psychic']}, ci: {value: ['charmed', 'frightened', 'poisoned', 'prone', 'exhaustion']}}
    },
    prototypeToken: {name: 'Spectral Tentacle', actorLink: false, width: 1, height: 1, lockRotation: true, ring: {enabled: false},
        texture: {src: 'modules/jb2a_patreon/Library/Generic/Nature/VineElementalLoop02_03_Dark_Blue_300x300.webm', scaleX: 1.6, scaleY: 1.6}},
    items: [slam, grapple],
    flags: {world: {nixSunkenTentacleBase: true}}
};
let base = game.actors.find(a => a.getFlag('world', 'nixSunkenTentacleBase'));
if (base) {
    await base.deleteEmbeddedDocuments('Item', base.items.map(i => i.id));
    const {items, ...rest} = baseData;
    await base.update(rest);
    await base.createEmbeddedDocuments('Item', items);
} else base = await Actor.create(baseData);
// The wearer's player owns the tentacle.
const owners = Object.fromEntries(Object.entries(actor.ownership).filter(([id, l]) => id !== 'default' && l >= 3));
if (Object.keys(owners).length) await base.update({ownership: {...base.ownership, ...owners}});
 
// ---- 2. The ring's activities ------------------------------------------------------------------
for (const a of ring.system.activities.contents) if (a.name !== 'Summon Tentacle') await ring.update({['system.activities.-=' + a.id]: null});
if (ring.flags?.['chris-premades']?.embeddedActivityMacros) await ring.unsetFlag('chris-premades', 'embeddedActivityMacros');
let summon = ring.system.activities.contents.find(a => a.name === 'Summon Tentacle');
const sData = {
    img: 'icons/creatures/tentacles/tentacle-eyes-yellow-pink.webp',
    activation: {type: 'action', value: 1, override: true},
    consumption: {targets: [], scaling: {allowed: false}},
    range: {value: '20', units: 'ft', override: true},
    target: {affects: {type: 'space'}, override: true},
    description: {chatFlavor: 'A spectral tentacle rises from a space within 20 ft.'}
};
if (!summon) { await ring.createActivity('utility', {name: 'Summon Tentacle', ...sData}, {renderSheet: false}); summon = ring.system.activities.contents.find(a => a.name === 'Summon Tentacle'); }
else await summon.update(sData);
await ring.setFlag('chris-premades', 'embeddedActivityMacros.' + summon.id, [
    {name: 'Summon Tentacle', type: 'midi-item', pass: 'rollFinished', priority: 50, macro: SCRIPTS.SUMMON}]);
 
await ChatMessage.create({whisper: [game.user.id], content: '<b>Ring of the Sunken King set up on ' + actor.name + '</b><ul>'
    + '<li><b>Summon Tentacle</b> (ring, Action): place a Spectral Tentacle within 20 ft. AC ' + (10 + actor.system.abilities.cha.mod) + ', HP ' + (2 * (actor.system.details?.level ?? 1))
    + ', acts right after ' + actor.name + ' in initiative. Summoning again replaces the old one; dismiss it from the effect on ' + actor.name + '.</li>'
    + '<li><b>Slam</b>: melee attack, reach 10 ft, +' + (actor.system.abilities.cha.mod + actor.system.attributes.prof) + ' to hit, 1d8 + ' + actor.system.abilities.cha.mod + ' bludgeoning.</li>'
    + '<li><b>Grapple</b>: the tentacle\'s Athletics vs the target\'s Athletics or Acrobatics (higher one); higher wins, ties go to the target; if the tentacle wins, the target is Restrained until the tentacle is dismissed or destroyed.</li>'
    + '<li>Template actor: <b>Spectral Tentacle</b> in the "Summons (Nix)" actor folder (owned by ' + actor.name + '\'s player).</li></ul>'});
 