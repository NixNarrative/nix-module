// Which campaign this world is. Saved per world; "auto" picks the campaign
// whose characters are in the Actors sidebar.
import {MODULE_ID} from './constants.mjs';
import {CAMPAIGNS, CHARACTERS} from './registry.mjs';
import {candidates} from './runner.mjs';
 
export function guessCampaign() {
    const score = {};
    for (const [key, ch] of Object.entries(CHARACTERS)) if (candidates(key).length) score[ch.campaign] = (score[ch.campaign] ?? 0) + 1;
    const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
    if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) return null;
    return ranked[0][0];
}
 
export function currentCampaign() {
    const saved = game.settings.get(MODULE_ID, 'campaign');
    if (saved && saved !== 'auto' && CAMPAIGNS[saved]) return saved;
    return guessCampaign();
}
 