# GNOME 46 Extension Project Context

## Project Goals & Setup
* **Extension Name:** Recent Windows Focus (`recent-windows@local`)
* **Environment:** Ubuntu 24.04 LTS, GNOME 46 (Wayland)
* **Goal:** Track recent window focus history and display a dropdown menu in the top bar.
* **Configurable Settings:** `display-limit` (int, default 60) and `max-history-length` (int, default 15).

## Directory Structure
- `extension.js` — Main logic using `Shell.WindowTracker` and `get_stable_sequence()` to track windows reliably without losing references.
- `prefs.js` — Preference UI using `Adw` and `Gtk.SpinButton` bound to GSettings.
- `metadata.json` — Target GNOME shell version `46`, schema ID `org.gnome.shell.extensions.recent-windows`.
- `schemas/org.gnome.shell.extensions.recent-windows.gschema.xml` — GSettings XML schema.
- `.vscode/tasks.json` — Contains build tasks to run `glib-compile-schemas schemas/` and disable/enable the extension.
- `.vscode/launch.json` — Uses `node-terminal` to run `dbus-run-session gnome-shell --nested --wayland` with `preLaunchTask: "Compile GSettings Schemas"` for live debugging.

## Key Code Details
- Initialized settings in `extension.js`:
  `this._settings = this.getSettings('org.gnome.shell.extensions.recent-windows');`
- Avoided using `busctl` D-Bus restart calls due to Wayland security restrictions; using nested shell (`dbus-run-session gnome-shell --nested --wayland`) for testing.
