import assert from 'node:assert/strict';
const clone = o => structuredClone(o);
const setProperty = (o, p, v) => { const ks = p.split('.'); let x = o; for (const k of ks.slice(0, -1)) x = (x[k] ??= {}); x[ks.at(-1)] = v; };
const expandObject = o => { const out = {}; for (const [k, v] of Object.entries(o)) { const val = (v && typeof v === 'object' && !Array.isArray(v)) ? expandObject(v) : v; if (k.includes('.')) setProperty(out, k, val); else out[k] = (out[k] && typeof out[k] === 'object' && val && typeof val === 'object' && !Array.isArray(val)) ? {...out[k], ...val} : val; } return out; };
globalThis.foundry = {utils: {deepClone: clone, setProperty, expandObject}};
const calls = [];
const rec = name => (...a) => { calls.push([name, a]); return name.includes('Dialog') ? null : {ok: name}; };
globalThis.cat = {utils: {
  workflowUtils: {syntheticItemRoll: rec('syntheticItemRoll'), syntheticActivityDataRoll: rec('syntheticActivityDataRoll'), applyDamage: rec('applyDamage')},
  tokenUtils: {getDistance: (a, b) => { calls.push(['getDistance', [a, b]]); return 10; }, findNearby: (t, r, o) => { calls.push(['findNearby', [t, r, o]]); return [{name: 'docB', object: {name: 'objB', document: {documentName: 'Token'}}}]; }},
  dialogUtils: {selectTargetDialog: async (t, c, list, o) => { calls.push(['selectTargetDialog', [list, o]]); return {result: list[0], skip: true}; }},
  queryUtils: {firstOwner: () => 'u1'}, actorUtils: {getFirstToken: () => ({object: 'placeableX'})}
}};
const E = await import(new URL('../scripts/court/engine.mjs', import.meta.url));
// fx
const v13data = {name: 'x', changes: [{key: 'a', mode: 2, value: 'necrotic', priority: 20}, {key: 'b', mode: 5, value: 1, priority: 20}], duration: {turns: 1}, 'flags.chris-premades.info.identifier': 'sealX'};
const out = E.fx(v13data);
assert.deepEqual(out.system.changes, [{key: 'a', type: 'add', value: 'necrotic', priority: 20}, {key: 'b', type: 'override', value: '1', priority: 20}]);
assert.equal(out.changes, undefined);
assert.deepEqual(out.duration, {value: 1, units: 'turns'});
assert.equal(out.flags.cat.identifier, 'sealX');
assert.equal(out.flags['chris-premades'].info.identifier, 'sealX');
assert.deepEqual(E.fx(out), out, 'idempotent');
assert.deepEqual(E.fx({name: 'y', duration: {seconds: 6}}).duration, {value: 6, units: 'seconds'});
assert.deepEqual(E.fx({name: 'y', duration: {}}).duration, {});
assert.equal(E.MODES.ADD, 2); assert.equal(E.MODES.OVERRIDE, 5);
// adapter conversions
const tokDoc = {documentName: 'Token', uuid: 'T1', id: 't1', object: null};
const placeable = {document: tokDoc, name: 'p1'}; tokDoc.object = placeable;
const u = E.cpr();
assert.ok(u.isCatAdapter);
await u.workflowUtils.syntheticItemRoll({name: 'it'}, [placeable], {consumeUsage: true});
const [, [, targets, opts]] = calls.find(c => c[0] === 'syntheticItemRoll');
assert.equal(targets[0], tokDoc, 'placeable -> TokenDocument');
assert.deepEqual(opts, {consumeUsage: true, consumeResources: false, spellSlot: false, options: {workflowOptions: {targetConfirmation: 'none'}}},
  '1.7.4: a roll at targets Nix Fix chose carries Midi\'s no-Target-Confirmation option');
// fixedTargets (1.7.4)
assert.equal(E.NO_CONFIRM, 'none');
assert.equal(E.fixedTargets([], {a: 1}).options, undefined, 'no targets: untouched');
assert.equal(E.fixedTargets(undefined, undefined), undefined, 'nothing in, nothing out');
assert.deepEqual(E.fixedTargets([1], undefined), {options: {workflowOptions: {targetConfirmation: 'none'}}}, 'no options given');
assert.deepEqual(E.fixedTargets(new Set([1]), {options: {workflowOptions: {nixHew: true}, x: 1}}),
  {options: {workflowOptions: {targetConfirmation: 'none', nixHew: true}, x: 1}}, 'a Set of targets; the caller\'s other options kept');
assert.equal(E.fixedTargets([1], {options: {workflowOptions: {targetConfirmation: 'always'}}}).options.workflowOptions.targetConfirmation, 'always', 'the caller\'s own choice wins');
assert.equal(E.fixedTargets([1], {confirmTargets: true}).options, undefined, 'confirmTargets: true keeps the dialog');
{ const given = {options: {workflowOptions: {k: 1}}}; E.fixedTargets([1], given); assert.deepEqual(given, {options: {workflowOptions: {k: 1}}}, 'the caller\'s object is not changed'); }
calls.length = 0;
await u.workflowUtils.syntheticItemRoll({name: 'it'}, [], {consumeUsage: true});
assert.equal(calls[0][1][2].options, undefined, 'CAT: no targets, no option');
calls.length = 0;
await u.workflowUtils.syntheticItemRoll({name: 'it'}, [placeable], {confirmTargets: true});
assert.equal(calls[0][1][2].options, undefined); assert.equal('confirmTargets' in calls[0][1][2], false, 'confirmTargets is ours, not passed to CAT');
calls.length = 0;
await u.workflowUtils.syntheticActivityDataRoll({_id: 'a'}, {name: 'item'}, {name: 'actor'}, [placeable], {});
const sadr = calls.find(c => c[0] === 'syntheticActivityDataRoll')[1];
assert.equal(sadr.length, 4, 'actor argument dropped'); assert.equal(sadr[2][0], tokDoc);
const d = u.tokenUtils.getDistance(placeable, tokDoc);
assert.equal(calls.find(c => c[0] === 'getDistance')[1][0], tokDoc);
const near = u.tokenUtils.findNearby(placeable, 5, 'ally', {includeIncapacitated: true});
assert.equal(near[0].name, 'objB', 'returns placeables');
assert.deepEqual(calls.find(c => c[0] === 'findNearby')[1][2], {disposition: 'ally', includeIncapacitated: true, includeToken: false});
const sel = await u.dialogUtils.selectTargetDialog('t', 'c', [placeable], {coverToken: placeable});
assert.equal(sel[0], placeable, 'result mapped back to placeable'); assert.equal(sel[1], true);
assert.equal(calls.find(c => c[0] === 'selectTargetDialog')[1][1].coverToken, tokDoc);
assert.equal(u.actorUtils.getFirstToken({}), 'placeableX');
// makeCritical
globalThis.Roll = {fromData: d => d};
const roll = {toJSON: () => ({options: {criticalSuccess: 20}, terms: [{faces: 20, results: [{result: 14, active: true}], options: {}}]})};
const crit = E.makeCritical(roll);
assert.equal(crit.options.criticalSuccess, 14); assert.equal(crit.terms[0].options.criticalSuccess, 14);
// canUse
const coll = arr => Object.assign(arr, {size: arr.length});
const actorItems = new Map([['BI', {system: {uses: {max: 3, value: 0}}}]]);
const item = {system: {uses: {max: 1, value: 1}, activities: coll([{consumption: {targets: [{type: 'itemUses', target: 'BI', value: '1'}]}, actor: {items: actorItems}, item: null}])}};
assert.equal(E.canUse(item), false);
actorItems.get('BI').system.uses.value = 2;
assert.equal(E.canUse(item), true);
// ident
assert.equal(E.ident({flags: {'nix-module': {identifier: 'x'}}}), 'x');
assert.equal(E.ident({flags: {cat: {identifier: 'y'}}}), 'y');
// v13: chrisPremades present -> identity
const v13calls = [];
const v13rec = name => (...a) => { v13calls.push([name, a]); return {ok: name}; };
globalThis.chrisPremades = {utils: {v13: true, genericUtils: {marker: 1},
  workflowUtils: {syntheticItemRoll: v13rec('syntheticItemRoll'), syntheticItemDataRoll: v13rec('syntheticItemDataRoll'), syntheticActivityRoll: v13rec('syntheticActivityRoll'),
    syntheticActivityDataRoll: v13rec('syntheticActivityDataRoll'), bonusDamage: v13rec('bonusDamage')}}};
assert.equal(E.cpr().v13, true);
// 1.7.4: on v13 the synthetic rolls go through fixedTargets too; everything else is Chris's Premades' own.
const u13 = E.cpr();
assert.equal(u13, E.cpr(), 'one adapter per utils object');
assert.equal(u13.genericUtils.marker, 1); assert.equal(u13.isCatAdapter, undefined);
const NC = {options: {workflowOptions: {targetConfirmation: 'none'}}};
await u13.workflowUtils.syntheticItemRoll('it', ['t'], {consumeUsage: false});
assert.deepEqual(v13calls.at(-1), ['syntheticItemRoll', ['it', ['t'], {consumeUsage: false, ...NC}]]);
await u13.workflowUtils.syntheticItemDataRoll('data', 'actor', ['t']);
assert.deepEqual(v13calls.at(-1), ['syntheticItemDataRoll', ['data', 'actor', ['t'], NC]]);
await u13.workflowUtils.syntheticActivityRoll('act', ['t'], {options: {workflowOptions: {nixArc: true}}});
assert.deepEqual(v13calls.at(-1)[1][2], {options: {workflowOptions: {targetConfirmation: 'none', nixArc: true}}});
await u13.workflowUtils.syntheticActivityDataRoll('ad', 'item', 'actor', ['t'], {consumeUsage: true});
assert.deepEqual(v13calls.at(-1), ['syntheticActivityDataRoll', ['ad', 'item', 'actor', ['t'], {consumeUsage: true, ...NC}]], 'v13 keeps the actor argument');
await u13.workflowUtils.syntheticActivityRoll('act', [], {consumeUsage: false});
assert.deepEqual(v13calls.at(-1)[1][2], {consumeUsage: false}, 'no targets (a self / template roll): untouched');
u13.workflowUtils.bonusDamage('wf', '1d8');
assert.deepEqual(v13calls.at(-1), ['bonusDamage', ['wf', '1d8']], 'other helpers pass straight through');
assert.equal(E.fx(v13data), v13data, 'fx identity on v13');
console.log('engine tests: all passed');
