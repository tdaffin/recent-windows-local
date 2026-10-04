import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/**
 * @typedef {number | Meta.Window} WindowId
 * Stable sequence (or legacy handle); the window itself is the last-resort key.
 */

/**
 * @typedef {object} RecentWindowEntry
 * Cached metadata, not proof that the window is still open.
 * @property {WindowId} id
 * @property {string} title Last nonempty title, refreshed when building the menu.
 * @property {Shell.App | null} app Not all windows have a tracked application.
 */

/** Owns the panel button, MRU history, and signal connections while enabled. */
export default class RecentWindowsExtension extends Extension {
    /** @type {ReturnType<Extension['getSettings']> | null} */
    _settings = null;

    /** @type {PanelMenu.Button | null} */
    _indicator = null;

    /** @type {PopupMenu.PopupMenu | null} */
    _menu = null;

    /** @type {RecentWindowEntry[]} */
    _recentHistory = [];

    /** @type {number | null} */
    _settingsChangedId = null;

    /** @type {number | null} */
    _focusSignalId = null;

    /** @type {number | null} */
    _menuSignalId = null;

    /** @returns {void} Connect listeners and seed history with the focused window. */
    enable() {
        this._settings = this.getSettings('org.gnome.shell.extensions.recent-windows');

        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        const menu = this._indicator.menu;
        if (!(menu instanceof PopupMenu.PopupMenu)) {
            throw new Error('Recent Windows requires a standard popup menu');
        }
        this._menu = menu;

        const icon = new St.Icon({
            icon_name: 'view-restore-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._recentHistory = [];

        this._menuSignalId = menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen) {
                this._updateMenu();
            }
            return undefined;
        });

        this._settingsChangedId = this._settings.connect('changed', () => {
            this._updateMenu();
        });

        this._focusSignalId = global.display.connect('notify::focus-window', () => {
            this._onWindowFocused();
        });

        this._onWindowFocused();
    }

    /**
     * @param {Meta.Window} win
     * @returns {WindowId} Identity shared by focus events and managed-window snapshots.
     */
    _getStableId(win) {
        if (typeof win.get_stable_sequence === 'function') {
            return win.get_stable_sequence();
        }
        return win.get_id ? win.get_id() : win;
    }

    /** @returns {void} Move a normal focused window to the front without duplicates. */
    _onWindowFocused() {
        const focusedWindow = global.display.focus_window;

        if (!focusedWindow || focusedWindow.is_override_redirect()) {
            return;
        }

        const winId = this._getStableId(focusedWindow);

        this._recentHistory = this._recentHistory.filter(item => item.id !== winId);

        this._recentHistory.unshift({
            id: winId,
            title: focusedWindow.get_title() || 'Untitled Window',
            app: Shell.WindowTracker.get_default().get_window_app(focusedWindow)
        });

        this._updateMenu();
    }

    /** @returns {Meta.Window[]} Managed windows, including those without visible actors. */
    _getAllActiveWindows() {
        return global.display.list_all_windows().filter(win => !win.is_override_redirect());
    }

    /**
     * Refresh titles and match history to live windows before applying the cap.
     * @returns {void}
     * @throws {Error} If called without the enabled extension's settings and menu.
     */
    _updateMenu() {
        const settings = this._settings;
        const menu = this._menu;
        if (!settings || !menu) {
            throw new Error('Recent Windows cannot update its menu while disabled');
        }
        menu.removeAll();

        const activeWindows = new Map(
            this._getAllActiveWindows().map(win => [this._getStableId(win), win])
        );
        // Closed windows must not consume slots and evict still-open history entries.
        const validItems = this._recentHistory
            .flatMap(item => {
                const window = activeWindows.get(item.id);
                return window ? [{ item, window }] : [];
            })
            .slice(0, settings.get_int('max-history-length'));
        this._recentHistory = validItems.map(({ item }) => item);

        for (const { item, window } of validItems) {
            item.title = window.get_title() || item.title;
        }

        if (validItems.length === 0) {
            const emptyItem = new PopupMenu.PopupMenuItem('No recent windows', { reactive: false });
            menu.addMenuItem(emptyItem);
            return;
        }

        validItems.forEach(({ item, window }, index) => {
            const title = item.title;
            const displayLimit = settings.get_int('display-limit');
            const displayTitle = title.length > displayLimit ? `${title.substring(0, Math.max(0, displayLimit - 3))}...` : title;

            const menuItem = new PopupMenu.PopupMenuItem(`${index + 1}. ${displayTitle}`);

            if (item.app) {
                const appIcon = item.app.create_icon_texture(16);
                if (appIcon) {
                    menuItem.insert_child_below(appIcon, menuItem.label);
                }
            }

            menuItem.connect('activate', () => {
                const workspace = window.get_workspace();
                if (workspace) {
                    workspace.activate_with_focus(window, global.get_current_time());
                } else {
                    window.activate(global.get_current_time());
                }
            });

            menu.addMenuItem(menuItem);
        });
    }

    /** @returns {void} Release all owned resources; safe after partial enablement. */
    disable() {
        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }

        if (this._menuSignalId && this._menu) {
            this._menu.disconnect(this._menuSignalId);
            this._menuSignalId = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._menu = null;
        this._settings = null;
        this._recentHistory = [];
    }
}
