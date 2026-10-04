import '@girs/gjs';
import '@girs/gnome-shell/extensions/global';
import '@girs/gnome-shell/extensions/extension/ambient';
import '@girs/gnome-shell/extensions/prefs/ambient';
import '@girs/gnome-shell/ui/main/ambient';
import '@girs/gnome-shell/ui/panelMenu/ambient';
import '@girs/gnome-shell/ui/popupMenu/ambient';

// GNOME 46 popupMenu.js emits this signal, omitted by the published SignalMap:
// https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/46.0/js/ui/popupMenu.js
declare module '@girs/gnome-shell/ui/popupMenu' {
    namespace PopupMenuBase {
        interface SignalMap {
            'open-state-changed': [isOpen: boolean];
        }
    }
}
