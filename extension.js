import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class RecentWindowsExtension extends Extension {
    enable() {
        // Initialize extension settings
        // Pass explicit schema ID to avoid lookup failure
        this._settings = this.getSettings('org.gnome.shell.extensions.recent-windows');

        // 1. Create top bar indicator button
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        
        // Set icon for top bar
        const icon = new St.Icon({
            icon_name: 'view-restore-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);

        // Add to right side of top panel
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // 2. Initialize window history array
        // Store stable window metadata entries rather than direct window pointers
        this._recentHistory = [];

        // Listen for setting changes to update menu instantly
        this._settingsChangedId = this._settings.connect('changed', () => {
            this._updateMenu();
        });

        // 3. Connect focus signal on GNOME's display tracker
        this._focusSignalId = global.display.connect('notify::focus-window', () => {
            this._onWindowFocused();
        });

        // Populate initial focus window if one exists
        this._onWindowFocused();
    }

    _getStableId(win) {
        // Use GNOME's unique stable sequence ID, falling back to window handle ID
        if (typeof win.get_stable_sequence === 'function') {
            return win.get_stable_sequence();
        }
        return win.get_id ? win.get_id() : win;
    }

    _onWindowFocused() {
        const focusedWindow = global.display.focus_window;

        // Ignore invalid windows or special desktop panels
        if (!focusedWindow || focusedWindow.is_override_redirect()) {
            return;
        }

        const winId = this._getStableId(focusedWindow);

        // Remove if already tracked
        this._recentHistory = this._recentHistory.filter(item => item.id !== winId);

        // Add to top of stack
        this._recentHistory.unshift({
            id: winId,
            title: focusedWindow.get_title() || 'Untitled Window',
            app: Shell.WindowTracker.get_default().get_window_app(focusedWindow)
        });

        // Cap history length dynamically from settings
        const maxHistoryLength = this._settings.get_int('max-history-length');
        if (this._recentHistory.length > maxHistoryLength) {
            this._recentHistory.pop();
        }

        this._updateMenu();
    }

    _getAllActiveWindows() {
        // Collect all open actor windows across all workspaces
        const windows = [];
        global.get_window_actors().forEach(actor => {
            const win = actor.get_meta_window();
            if (win && !win.is_override_redirect()) {
                windows.push(win);
            }
        });
        return windows;
    }

    _updateMenu() {
        // Clear old menu items
        this._indicator.menu.removeAll();

        const activeWindows = this._getAllActiveWindows();
        const validItems = [];

        // Match tracked IDs against current active GNOME windows
        for (const item of this._recentHistory) {
            const liveWin = activeWindows.find(w => this._getStableId(w) === item.id);
            if (liveWin) {
                // Keep fresh window title if updated
                item.title = liveWin.get_title() || item.title;
                validItems.push({ item, window: liveWin });
            }
        }

        if (validItems.length === 0) {
            const emptyItem = new PopupMenu.PopupMenuItem('No recent windows', { reactive: false });
            this._indicator.menu.addMenuItem(emptyItem);
            return;
        }

        // Populate popup menu with the last focused windows
        validItems.forEach(({ item, window }, index) => {
            const title = item.title;
            // Shorten display title if too long dynamically from settings
            const displayLimit = this._settings.get_int('display-limit');
            const displayTitle = title.length > displayLimit ? `${title.substring(0, Math.max(0, displayLimit - 3))}...` : title;
            
            const menuItem = new PopupMenu.PopupMenuItem(`${index + 1}. ${displayTitle}`);
            
            // Add App icon to menu item if available
            if (item.app) {
                const appIcon = item.app.create_icon_texture(16);
                if (appIcon) {
                    menuItem.insert_child_below(appIcon, menuItem.label);
                }
            }

            // Click menu item to activate/raise window
            menuItem.connect('activate', () => {
                if (window) {
                    const workspace = window.get_workspace();
                    if (workspace) {
                        workspace.activate_with_focus(window, global.get_current_time());
                    } else {
                        window.activate(global.get_current_time());
                    }
                }
            });

            this._indicator.menu.addMenuItem(menuItem);
        });
    }

    disable() {
        // Disconnect settings change listener
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        // Disconnect focus signal
        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }

        // Destroy indicator widget
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;
        this._recentHistory = [];
    }
}
