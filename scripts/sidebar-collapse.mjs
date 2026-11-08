// =====================================================================
//  NIX FIX: click the open sidebar tab to collapse the sidebar
//  v13 collapsed the sidebar when you clicked the tab that was already open
//  (e.g. the chat button while chat is showing). v14 dropped that; it still
//  happens with every module off. This puts it back, per player (client
//  setting, on by default). v13 does it natively, so this only runs on v14+.
//
//  One click listener on the document (capture phase), so it runs before
//  Foundry's own tab handler and doesn't depend on the tab bar's id/class,
//  and it keeps working when the sidebar re-renders.
// =====================================================================
import {MODULE_ID, TITLE} from './constants.mjs';
import {generation} from './compat.mjs';

function onClick(event) {
    if (event.button !== 0) return;
    if (!game.settings.get(MODULE_ID, 'sidebarClickCollapse')) return;
    const sidebar = ui.sidebar;
    if (!sidebar?.expanded || typeof sidebar.toggleExpanded !== 'function') return;

    // Only the tab buttons themselves, not the tab panes (which also carry data-tab).
    const btn = event.target.closest?.('#sidebar :is(button, a)[data-tab]');
    if (!btn) return;
    if (btn.dataset.group && btn.dataset.group !== 'primary') return;
    const active = sidebar.tabGroups?.primary ?? sidebar.activeTab;
    if (!active || btn.dataset.tab !== active) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    sidebar.toggleExpanded(false);
}

export function registerSidebarCollapse() {
    game.settings.register(MODULE_ID, 'sidebarClickCollapse', {
        name: 'Click the open sidebar tab to collapse the sidebar',
        hint: 'Like Foundry v13: clicking the tab that is already open (e.g. Chat) collapses the sidebar. Foundry v14 only; each player can turn it off.',
        scope: 'client', config: true, type: Boolean, default: true
    });
    Hooks.once('ready', () => {
        if (generation() < 14) return;
        document.addEventListener('click', onClick, {capture: true});
        console.log(TITLE + ' | sidebar click-to-collapse ready');
    });
}
