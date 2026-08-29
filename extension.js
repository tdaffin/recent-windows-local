import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export default class RecentWindowsExtension extends Extension {
    enable() {
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
        this._recentWindows = [];

        // 3. Connect focus signal on GNOME's display tracker
        this._focusSignalId = global.display.connect('notify::focus-window', () => {
            this._onWindowFocused();
        });

        // Populate initial focus window if one exists
        this._onWindowFocused();
    }

    _onWindowFocused() {
        const focusedWindow = global.display.focus_window;

        // Ignore invalid windows or special desktop panels
        if (!focusedWindow || focusedWindow.is_override_redirect()) {
            return;
        }

        // Remove window if it already exists in our list (move to top)
        this._recentWindows = this._recentWindows.filter(
            item => item.window !== focusedWindow
        );

        // Unshift the newly focused window
        this._recentWindows.unshift({
            window: focusedWindow,
            title: focusedWindow.get_title() || 'Untitled Window',
            app: Shell.WindowTracker.get_default().get_window_app(focusedWindow)
        });

        // Limit history to top 15
        if (this._recentWindows.length > 15) {
            this._recentWindows.pop();
        }

        this._updateMenu();
    }

    _updateMenu() {
        // Clear old menu items
        this._indicator.menu.removeAll();

        // Remove any closed windows from the list
        this._recentWindows = this._recentWindows.filter(item => {
            return item.window && !item.window.is_override_redirect();
        });

        if (this._recentWindows.length === 0) {
            let emptyItem = new PopupMenu.PopupMenuItem('No recent windows', { reactive: false });
            this._indicator.menu.addMenuItem(emptyItem);
            return;
        }

        // Populate popup menu with the last focused windows
        this._recentWindows.forEach((item, index) => {
            const title = item.title;
            // Shorten display title if too long
            const displayTitle = title.length > 30 ? title.substring(0, 27) + '...' : title;
            
            const menuItem = new PopupMenu.PopupMenuItem(`${index + 1}. ${displayTitle}`);
            
            // Add App icon to menu item if available
            if (item.app) {
                const appIcon = item.app.create_icon_texture(16);
                if (appIcon) {
                    menuItem.add_child(appIcon);
                }
            }

            // Click menu item to activate/raise window
            menuItem.connect('activate', () => {
                if (item.window) {
                    const workspace = item.window.get_workspace();
                    if (workspace) {
                        workspace.activate_with_focus(item.window, global.get_current_time());
                    } else {
                        item.window.activate(global.get_current_time());
                    }
                }
            });

            this._indicator.menu.addMenuItem(menuItem);
        });
    }

    disable() {
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

        this._recentWindows = [];
    }
}

