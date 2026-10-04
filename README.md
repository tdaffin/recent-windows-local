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

### 3. Compile the settings schemas

From the checkout directory:

```sh
glib-compile-schemas schemas/
```

The compiled schema is generated locally and is not tracked in Git.

## Debugging without logging out

Open the checkout in VS Code, select **Launch Nested GNOME Shell** in
**Run and Debug**, and launch it. The configuration in
[.vscode/launch.json](.vscode/launch.json) compiles the schemas first and
selects the appropriate launch command.

Alternatively, launch from a terminal:

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
[.vscode/tasks.json](.vscode/tasks.json) compiles schemas and toggles the
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
node --experimental-vm-modules --test tests/extension.test.cjs
```

The tests use Node's built-in runner and mocked GNOME APIs, with no npm
dependencies. They cover closed-window churn, windows without compositor
actors, menu refresh, history limits, icon placement, activation, and cleanup.
Use the development shell for testing against real GNOME APIs.
