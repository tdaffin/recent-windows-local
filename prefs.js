import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class RecentWindowsPreferences extends ExtensionPreferences {
    /**
     * Add controls with bidirectional GSettings bindings; no manual save is needed.
     * @param {Adw.PreferencesWindow} window Window supplied by the preferences service.
     * @returns {void}
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Window Tracking Settings' });
        page.add(group);

        const historyRow = new Adw.ActionRow({
            title: 'Max History Length',
            subtitle: 'Maximum number of recent windows to remember',
        });
        const historySpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 50, step_increment: 1 }),
            valign: Gtk.Align.CENTER,
        });
        settings.bind('max-history-length', historySpin, 'value', 0);
        historyRow.add_suffix(historySpin);
        group.add(historyRow);

        const displayRow = new Adw.ActionRow({
            title: 'Display Character Limit',
            subtitle: 'Maximum character length before truncating window titles',
        });
        const displaySpin = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 10, upper: 200, step_increment: 5 }),
            valign: Gtk.Align.CENTER,
        });
        settings.bind('display-limit', displaySpin, 'value', 0);
        displayRow.add_suffix(displaySpin);
        group.add(displayRow);

        window.add(page);
    }
}
