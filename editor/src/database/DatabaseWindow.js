/**
 * The Database as a window of its own beside the map (see utils/DetachedWindow.js), so a record
 * can be edited on one screen while the map and an event are edited on the other. Between
 * openings its window hides and keeps its place.
 *
 *   RRDatabaseWindow.install(viewer)   once, on the #database-viewer overlay
 *   RRDatabaseWindow.open(viewer)      as the Database opens: its window shows, made the first time
 *   RRDatabaseWindow.isOpen()          the Database is showing
 *   RRDatabaseWindow.ownsKeys()        open, and the last click or focus landed in it
 */
(function(root) {
    'use strict';
    const Detached = root.RRDetachedWindow || (typeof require === 'function' ? require('../utils/DetachedWindow.js') : null);

    const api = Detached.create({
        overlayId: 'database-viewer',
        panelSelector: '.database-window',
        headerSelector: '.database-header',
        titleSelector: '.database-title',
        title: 'Database',
        page: 'database-panel.html',
        storageKey: 'rr-database-window-3',
        popoutKey: 'rr-database-popout-2',
        minWidth: 900,
        minHeight: 560,
        defaultWidth: 1840,
        defaultHeight: 1160,
        sizeToScreen: true,
        floatingClass: 'rr-database-floating',
        poppedClass: 'rr-database-popped',
        gripClass: 'rr-database-grip',
        dockedEvent: 'rr-database-docked',
        isOpen: overlay => !!overlay.classList && overlay.classList.contains('active'),
        // Closed by Alt+F4 or the taskbar: as Escape does, asking first about unsaved changes.
        async closeFromFrame() {
            const database = root.reactor && root.reactor.databaseEditorUI;
            if (database && typeof database.askToCloseDatabase === 'function') await database.askToCloseDatabase();
        }
    });

    root.RRDatabaseWindow = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
