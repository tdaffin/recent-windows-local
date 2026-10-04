# Recent Windows Extension Project Context

## Project Goals & Setup
* **Extension Name:** Recent Windows Focus (`recent-windows@local`)
* **Supported Environments:** Ubuntu 24.04 LTS with GNOME 46 and Ubuntu 26.04 LTS with GNOME 50 (Wayland).
* **Goal:** Track recent window focus history and display a dropdown menu in the top bar.
* **Menu Layout:** Application icons appear before the numbered window titles; entries without an available icon remain text-only.
* **Configurable Settings:** `display-limit` (int, default 60) and `max-history-length` (int, default 15).

## Directory Structure
- `README.md` — Developer setup, Ubuntu-specific debugging prerequisites, development-shell launch commands, and reload limitations.
- `extension.js` — Main logic using `Shell.WindowTracker` and `get_stable_sequence()` to track windows reliably without losing references.
- `prefs.js` — Preference UI using `Adw` and `Gtk.SpinButton` bound to GSettings. Imports the shared GNOME 46/50 preferences API from `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js`.
- `metadata.json` — Declares GNOME Shell versions `46` and `50` and the settings schema `org.gnome.shell.extensions.recent-windows`, used by both the extension and preferences.
- `schemas/org.gnome.shell.extensions.recent-windows.gschema.xml` — GSettings XML schema.
- `.vscode/tasks.json` — Contains build tasks to run `glib-compile-schemas schemas/` and disable/enable the extension. Toggling does not reload cached source or metadata.
- `.vscode/launch.json` — Uses `node-terminal` with `preLaunchTask: "Compile GSettings Schemas"` for live debugging. Launches a separate shell with `--nested --wayland` on GNOME 46 or `--devkit --wayland` on GNOME 50.

## Key Code Details
- Initialized settings in `extension.js`:
  `this._settings = this.getSettings('org.gnome.shell.extensions.recent-windows');`
- Avoided using `busctl` D-Bus restart calls due to Wayland security restrictions; use a separate shell for testing.

## Applying Updates
1. Run the **Compile GSettings Schemas** task (or `glib-compile-schemas schemas/` from the extension directory).
2. Use a fresh development shell to test source changes without logging out. To apply already-loaded JavaScript changes to the normal Wayland desktop, log out and back in; restarting the live shell is not supported. For metadata-only reloads, see [README.md](README.md#reloading-limitations).
3. Check `gnome-extensions info recent-windows@local`. If disabled, run `gnome-extensions enable recent-windows@local`.
4. Open settings with `gnome-extensions prefs recent-windows@local`.

An **OUT OF DATE** state means the running shell version is not in `metadata.json`, or the session still has the old metadata cached. Keep version validation enabled; only GNOME 46 and 50 are declared supported.
