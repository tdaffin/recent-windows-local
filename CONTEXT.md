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
- `tests/extension.test.cjs` — Node-based regression tests with mocked GNOME APIs; run via the **Run Extension Tests** task.
- `package.json` / `package-lock.json` — Pinned development-only checking dependencies and `typecheck`, `build`, and `test` scripts; Node.js 18+ with npm.
- `jsconfig.json` / `types/gnome.d.ts` — Strict no-output GJS checking against GNOME 46 declarations, including GI/resource imports, shell globals, and a precise missing popup-signal correction. No Node/browser globals.
- `tests/jsconfig.json` — Separate strict no-output Node context for the CommonJS test fixtures; does not import executable GJS source into the type project.
- `.vscode/tasks.json` — **Prepare Extension** runs type checking before schema compilation; **Build & Enable Extension** depends on preparation before toggling. Standalone checking/schema tasks remain available. Toggling does not reload cached JavaScript.
- `.vscode/launch.json` — Uses `node-terminal` with `preLaunchTask: "Prepare Extension"` for live debugging. Launches a separate shell with `--nested --wayland` on GNOME 46 or `--devkit --wayland` on GNOME 50.

## Key Code Details
- Initialized settings in `extension.js`:
  `this._settings = this.getSettings('org.gnome.shell.extensions.recent-windows');`
- Match stable IDs against `global.display.list_all_windows()`, not compositor actors. Prune closed entries before applying the history limit and refresh the menu when it opens.
- JSDoc describes window identity, cached history, nullable state, settings, preferences, and test fixture contracts. Enabled state owns a standard popup menu; disable also tolerates partial enablement.
- GJS declaration internals require `skipLibCheck` because upstream types include transitive version conflicts. Application JavaScript remains strictly checked; Node declaration checking is enabled. Settings retain the exact base API's return type rather than asserting compatibility between different Gio declarations.
- There is no emitted application code, bundler, or runtime npm import. GNOME loads the original JavaScript files directly.
- Avoided using `busctl` D-Bus restart calls due to Wayland security restrictions; use a separate shell for testing.

## Applying Updates
1. Run `npm ci` for initial development setup. Run **Prepare Extension** (or `npm run build`) to type-check all code before compiling schemas.
2. Use a fresh development shell to test source changes without logging out. To apply already-loaded JavaScript changes to the normal Wayland desktop, log out and back in; restarting the live shell is not supported. For metadata-only reloads, see [README.md](README.md#reloading-limitations).
3. Check `gnome-extensions info recent-windows@local`. If disabled, run `gnome-extensions enable recent-windows@local`.
4. Open settings with `gnome-extensions prefs recent-windows@local`.

An **OUT OF DATE** state means the running shell version is not in `metadata.json`, or the session still has the old metadata cached. Keep version validation enabled; only GNOME 46 and 50 are declared supported.
