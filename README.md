# Recent Windows Focus

A GNOME Shell extension that keeps a recent window-focus history in a top-bar
menu. Application icons appear before the numbered window titles.

Supported environments:

- Ubuntu 24.04 LTS with GNOME Shell 46.
- Ubuntu 26.04 LTS with GNOME Shell 50.

## Menu history

The menu remembers recently focused windows that are still open, including
minimized windows and windows on other workspaces. Closed windows are removed
before applying the history limit, and the menu refreshes whenever it opens.

**Max History Length** defaults to **15** and can be adjusted from **1 to 50**
in the extension's preferences. If more than that many open windows have been
focused, the least recently focused entries leave the history intentionally;
focusing one again brings it back to the top.

## Developer setup

### 1. Install the checkout in the extension directory

GNOME discovers the extension by its directory name, `recent-windows@local`.
For a new checkout:

```sh
mkdir -p "$HOME/.local/share/gnome-shell/extensions"
git clone https://github.com/tdaffin/recent-windows-local.git \
    "$HOME/.local/share/gnome-shell/extensions/recent-windows@local"
cd "$HOME/.local/share/gnome-shell/extensions/recent-windows@local"
```

If that directory already contains the extension, use the existing checkout
instead of cloning over it.

### 2. Install debugging prerequisites

Check your shell version:

```sh
gnome-shell --version
```

On **Ubuntu 24.04 / GNOME 46**, install the GSettings schema compiler:

```sh
sudo apt update
sudo apt install libglib2.0-bin
```

On **Ubuntu 26.04 / GNOME 50**, also install the Mutter development kit:

```sh
sudo apt update
sudo apt install libglib2.0-bin mutter-dev-bin
```

The `mutter-dev-bin` package provides `/usr/libexec/mutter-devkit`, which
GNOME 50 needs to display its development shell in a window. Having
`gnome-shell` installed alone is not sufficient.

### 3. Install development tools and prepare the extension

With **Node.js 18 or newer** and npm installed, run from the checkout directory:

```sh
npm ci
npm run build
```

The build first type-checks the JavaScript, then compiles the settings schemas.
TypeScript and GNOME declarations are **development-only** dependencies; GNOME
still loads the JavaScript directly. No transpilation or bundling is involved.
The compiled schema and `node_modules/` are generated locally and not tracked.

### Checked JSDoc and autocomplete

Open the checkout in VS Code after running `npm ci`. JSDoc describes window
identities, history records, nullable application references, extension lifecycle,
preferences, and test mocks. Hover over a symbol for its contract and use
**Ctrl+Space** for completion, including GNOME API methods.

Run **Type Check Extension**, or:

```sh
npm run typecheck
```

[jsconfig.json](jsconfig.json) checks the GJS sources against GNOME Shell **46**
declarations, without Node or browser globals. [tests/jsconfig.json](tests/jsconfig.json)
checks the CommonJS fixtures separately with Node declarations. Both use strict
checking and `noEmit`, so checking never generates JavaScript.

The GNOME declarations are experimental. Their generated internals contain
version conflicts, so the GJS configuration uses `skipLibCheck` to skip checking
declaration-file internals; our JavaScript is still strictly checked against those
types. A narrow correction in [types/gnome.d.ts](types/gnome.d.ts) adds the documented
popup `open-state-changed` signal missing from the published declarations.
Settings use the exact return type of GNOME's `getSettings()` to avoid mixing
different transitive Gio declaration versions.

If editor diagnostics refer to old code while `npm run typecheck` passes, reopen
the file from disk without overwriting unsaved work, then run **TypeScript:
Restart TS Server**. **TypeScript: Select TypeScript Version** lets you choose
the installed workspace version.

Typing against 46 helps avoid newer-shell-only APIs, but does **not** certify
runtime compatibility or prevent every GNOME API change. Test against real GNOME
46 and 50 when available. Development tools are pinned in
[package-lock.json](package-lock.json); use `npm ci` for reproducible installs.

## Debugging without logging out

Open the checkout in VS Code, select **Launch Nested GNOME Shell** in
**Run and Debug**, and launch it. The configuration in
[.vscode/launch.json](.vscode/launch.json) runs **Prepare Extension** (type checking,
then schema compilation) first and
selects the appropriate launch command.

Alternatively, launch from a terminal:

Run `npm run build` first to perform the same preparation checks.

**GNOME 46:**

```sh
dbus-run-session gnome-shell --nested --wayland
```

**GNOME 50:**

```sh
dbus-run-session gnome-shell --devkit --wayland
```

These commands start a separate shell without replacing your current desktop
or closing your applications. They use a separate D-Bus session, but still
share your user settings; changes to extension preferences or enablement can
affect both shells.

If the indicator is missing, focus the development-shell window, press
**Alt+F2**, enter `lg`, and run this in the Looking Glass evaluator:

```js
Main.extensionManager.enableExtension('recent-windows@local')
```

Press **Esc** to close Looking Glass. Enabling from an unrelated terminal
instead targets that terminal's D-Bus session, not necessarily the development
shell.

After editing JavaScript, stop the development shell with **Ctrl+C** in its
launch terminal and launch it again. This creates a fresh JavaScript runtime
without logging out of your normal desktop.

### No window appears on GNOME 50

If the launch output includes:

```text
Failed to launch devkit: Failed to execute child process ... /usr/libexec/mutter-devkit ... (No such file or directory)
```

Stop the failed launch with **Ctrl+C**, install `mutter-dev-bin` as shown above,
then retry. The shell can remain running without a visible window when this
helper is missing.

## Reloading limitations

The **Build & Enable Extension** task in
[.vscode/tasks.json](.vscode/tasks.json) type-checks the code, compiles schemas,
then toggles the
extension. It does not refresh JavaScript modules already cached by GNOME.

For a metadata-only change, such as adding support for the current shell
version, Looking Glass can reread the metadata without restarting the desktop:

```js
await Main.extensionManager.reloadExtension(Main.extensionManager.lookup('recent-windows@local'))
```

This does not reliably apply changes to JavaScript that has already been
imported. Use a fresh development shell for code changes, or log out and back
in when ready to apply them to your normal desktop. Keep extension-version
validation enabled.

## Regression tests

With Node.js 18 or newer installed, run the **Run Extension Tests** VS Code task
or execute this from the checkout directory:

```sh
npm test
```

The tests use Node's built-in runner and mocked GNOME APIs, with no npm
runtime dependencies. They can also run without installing development tools:

```sh
node --experimental-vm-modules --test tests/extension.test.cjs
```

They cover closed-window churn, windows without compositor
actors, menu refresh, history limits, icon placement, activation, and cleanup.
Use the development shell for testing against real GNOME APIs.
