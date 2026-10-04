import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class RecentWindowsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Window Tracking Settings' });
        page.add(group);

        // Max History Length Row
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

        // Display Title Limit Row
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
