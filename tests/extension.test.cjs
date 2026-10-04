const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/** @typedef {'max-history-length' | 'display-limit'} SettingsKey */
/** @typedef {(emitter: SignalEmitter, ...args: (string | boolean)[]) => void} SignalHandler */
/** @typedef {{text?: string}} MenuChild */
/** @typedef {{reactive?: boolean}} MenuItemOptions */
/** @typedef {{create_icon_texture: (size: number) => MenuChild | null}} TestApp */
/**
 * Only the window behavior exercised by this fixture.
 * @typedef {object} TestWindow
 * @property {string} title
 * @property {TestApp | null} app
 * @property {boolean} [minimized]
 * @property {boolean} [hasActor]
 * @property {() => number} get_stable_sequence
 * @property {() => string} get_title
 * @property {() => boolean} is_override_redirect
 * @property {() => null} get_workspace
 * @property {(timestamp: number) => void} activate
 */
/**
 * @typedef {SignalEmitter & {
 *   get_int: (key: SettingsKey) => number,
 *   set_int: (key: SettingsKey, value: number) => void
 * }} TestSettings
 */
/**
 * @typedef {SignalEmitter & {
 *   focus_window: TestWindow | null,
 *   list_all_windows: () => TestWindow[]
 * }} TestDisplay
 */
/** @typedef {{menu: Menu, destroyed?: boolean, destroy: () => void}} TestIndicator */
/**
 * Structural boundary for the VM-loaded class, not the GNOME extension API.
 * @typedef {object} TestExtension
 * @property {() => void} enable
 * @property {() => void} disable
 * @property {TestIndicator | null} _indicator
 * @property {{id: number}[]} _recentHistory
 */
/**
 * @typedef {object} TestFixture
 * @property {TestExtension} extension
 * @property {TestSettings} settings
 * @property {TestDisplay} display
 * @property {Menu} menu
 * @property {(window: TestWindow) => void} focus
 * @property {(window: TestWindow) => void} close
 * @property {() => number[]} ids
 * @property {() => string[]} labels
 */

/** Signal payloads are limited to settings keys and menu-open booleans. */
class SignalEmitter {
    constructor() {
        /** @type {Map<number, {signal: string, handler: SignalHandler}>} */
        this.handlers = new Map();
        this.nextId = 1;
    }

    /**
     * @param {string} signal
     * @param {SignalHandler} handler
     * @returns {number}
     */
    connect(signal, handler) {
        const id = this.nextId++;
        this.handlers.set(id, {signal, handler});
        return id;
    }

    /** @param {number} id @returns {void} */
    disconnect(id) {
        assert.ok(this.handlers.delete(id), `Unknown signal ${id}`);
    }

    /** @param {string} signal @param {...(string | boolean)} args @returns {void} */
    emit(signal, ...args) {
        for (const entry of this.handlers.values()) {
            if (entry.signal === signal)
                entry.handler(this, ...args);
        }
    }
}

/** Standard popup menu; also supplies the runtime instanceof identity. */
class Menu extends SignalEmitter {
    constructor() {
        super();
        /** @type {PopupMenuItem[]} */
        this.items = [];
    }

    /** @returns {void} */
    removeAll() {
        this.items = [];
    }

    /** @param {PopupMenuItem} item @returns {void} */
    addMenuItem(item) {
        this.items.push(item);
    }
}

/** Minimal label, ornament and child ordering used by menu assertions. */
class PopupMenuItem extends SignalEmitter {
    /** @param {string} text @param {MenuItemOptions} [options] */
    constructor(text, options = {}) {
        super();
        this.label = {text};
        /** @type {MenuChild} */
        this.ornament = {};
        /** @type {MenuChild[]} */
        this.children = [this.ornament, this.label];
        this.options = options;
    }

    /** @param {MenuChild} child @returns {void} */
    add_child(child) {
        this.children.push(child);
    }

    /** @param {MenuChild} child @param {MenuChild} sibling @returns {void} */
    insert_child_below(child, sibling) {
        const index = this.children.indexOf(sibling);
        assert.notEqual(index, -1);
        this.children.splice(index, 0, child);
    }
}

/** @param {number} [limit] @returns {Promise<TestFixture>} */
async function fixture(limit = 15) {
    /** @type {Record<SettingsKey, number>} */
    const values = {'max-history-length': limit, 'display-limit': 60};
    /** @type {TestSettings} */
    const settings = Object.assign(new SignalEmitter(), {
        /** @param {SettingsKey} key @returns {number} */
        get_int: key => {
            assert.ok(Object.hasOwn(values, key));
            return values[key];
        },
        /** @param {SettingsKey} key @param {number} value @returns {void} */
        set_int: (key, value) => {
            values[key] = value;
            settings.emit('changed', key);
        },
    });

    /** @type {TestWindow[]} */
    let windows = [];
    /** @type {TestDisplay} */
    const display = Object.assign(new SignalEmitter(), {
        focus_window: null,
        /** @returns {TestWindow[]} */
        list_all_windows: () => windows,
    });
    const context = vm.createContext({
        global: {
            display,
            /** @returns {{get_meta_window: () => TestWindow}[]} */
            get_window_actors: () => windows
                .filter(window => window.hasActor !== false)
                .map(window => ({get_meta_window: () => window})),
            /** @returns {number} */
            get_current_time: () => 123,
        },
    });
    /** Settings provider exported as the VM's extension base class. */
    class Extension {
        constructor() {
            this.uuid = 'recent-windows@local';
            this.metadata = {name: 'Recent Windows Focus'};
        }

        /** @returns {TestSettings} */
        getSettings() {
            return settings;
        }
    }
    /** Panel indicator with the standard popup menu and teardown state. */
    class Button {
        constructor() {
            this.menu = new Menu();
        }

        /** @param {Icon} _child @returns {void} */
        add_child(_child) {}

        /** @returns {void} */
        destroy() {
            this.destroyed = true;
            this.menu.handlers.clear();
        }
    }
    /** The panel icon needs no rendering behavior in Node. */
    class Icon {
        /** @param {{icon_name: string, style_class: string}} _options */
        constructor(_options) {}
    }
    /**
     * Exact mock export shapes consumed by extension.js inside the VM.
     * @typedef {{default: {Icon: typeof Icon}} |
     *   {default: {WindowTracker: {get_default: () => {
     *     get_window_app: (window: TestWindow) => TestApp | null
     *   }}}} |
     *   {default: Record<string, never>} |
     *   {Extension: typeof Extension} |
     *   {panel: {addToStatusArea: (uuid: string, indicator: Button) => void}} |
     *   {Button: typeof Button} |
     *   {PopupMenu: typeof Menu, PopupMenuItem: typeof PopupMenuItem}} MockModuleExports
     */
    /** @type {[string, MockModuleExports][]} */
    const mockModules = [
        ['gi://St', {default: {Icon}}],
        ['gi://Shell', {default: {WindowTracker: {
            /** @returns {{get_window_app: (window: TestWindow) => TestApp | null}} */
            get_default: () => ({get_window_app: window => window.app}),
        }}}],
        ['gi://Meta', {default: {}}],
        ['resource:///org/gnome/shell/extensions/extension.js', {Extension}],
        ['resource:///org/gnome/shell/ui/main.js', {panel: {addToStatusArea() {}}}],
        ['resource:///org/gnome/shell/ui/panelMenu.js', {Button}],
        ['resource:///org/gnome/shell/ui/popupMenu.js', {PopupMenu: Menu, PopupMenuItem}],
    ];
    const imports = new Map(mockModules);
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8');
    const module = new vm.SourceTextModule(source, {context});
    /** @param {string} specifier @returns {vm.SyntheticModule} */
    const linkMock = specifier => {
        assert.ok(imports.has(specifier), `Unexpected import ${specifier}`);
        const exports = imports.get(specifier);
        assert.ok(exports);
        const evaluateMock = /** @this {vm.SyntheticModule} @returns {void} */ function () {
            for (const [key, value] of Object.entries(exports))
                this.setExport(key, value);
        };
        return new vm.SyntheticModule(Object.keys(exports), evaluateMock, {context});
    };
    await module.link(linkMock);
    await module.evaluate();
    // Node cannot infer the ESM class evaluated in a separate VM context.
    const namespace = /** @type {{default: new () => TestExtension}} */ (module.namespace);
    const extension = new namespace.default();
    extension.enable();
    assert.ok(extension._indicator);
    const menu = extension._indicator.menu;

    return {
        extension, settings, display, menu,
        /** @param {TestWindow} window @returns {void} */
        focus(window) {
            if (!windows.includes(window))
                windows.push(window);
            display.focus_window = window;
            display.emit('notify::focus-window');
        },
        /** @param {TestWindow} window @returns {void} */
        close(window) {
            windows = windows.filter(candidate => candidate !== window);
        },
        /** @returns {number[]} */
        ids() {
            return Array.from(extension._recentHistory, item => item.id);
        },
        /** @returns {string[]} */
        labels() {
            return menu.items.map(item => item.label.text);
        },
    };
}

/** @param {number} id @param {string} [title] @returns {TestWindow} */
function window(id, title = `Window ${id}`) {
    return {
        title,
        app: null,
        get_stable_sequence: () => id,
        get_title() { return this.title; },
        is_override_redirect: () => false,
        get_workspace: () => null,
        activate() {},
    };
}

test('closed-window churn does not evict still-open history entries', async () => {
    const f = await fixture(3);
    const first = window(1);
    const second = window(2);
    f.focus(first);
    f.focus(second);
    for (let id = 3; id < 30; id++) {
        const temporary = window(id);
        f.focus(temporary);
        f.close(temporary);
        f.focus(second);
    }
    assert.deepEqual(f.ids(), [2, 1]);
    assert.deepEqual(f.labels(), ['1. Window 2', '2. Window 1']);
});

test('managed windows remain visible without compositor actors', async () => {
    const f = await fixture();
    const minimized = window(1);
    minimized.minimized = true;
    minimized.hasActor = false;
    f.focus(minimized);
    f.focus(window(2));
    assert.deepEqual(f.labels(), ['1. Window 2', '2. Window 1']);
});

test('opening the menu prunes closed windows and refreshes titles', async () => {
    const f = await fixture();
    const first = window(1);
    const second = window(2);
    f.focus(first);
    f.focus(second);
    f.close(second);
    first.title = 'Updated title';
    f.display.focus_window = null;
    f.menu.emit('open-state-changed', true);
    assert.deepEqual(f.ids(), [1]);
    assert.deepEqual(f.labels(), ['1. Updated title']);
    f.close(first);
    f.menu.emit('open-state-changed', true);
    assert.deepEqual(f.ids(), []);
    assert.deepEqual(f.labels(), ['No recent windows']);
    assert.equal(f.menu.items[0].options.reactive, false);
});

test('the configured limit still caps genuinely open windows without duplicates', async () => {
    const f = await fixture(3);
    const windows = [1, 2, 3, 4].map(id => window(id));
    for (const candidate of windows)
        f.focus(candidate);
    assert.deepEqual(f.ids(), [4, 3, 2]);
    f.focus(windows[2]);
    assert.deepEqual(f.ids(), [3, 4, 2]);
    f.settings.set_int('max-history-length', 1);
    assert.deepEqual(f.ids(), [3]);
    assert.deepEqual(f.labels(), ['1. Window 3']);
});

test('icons, truncation and activation are preserved', async () => {
    const f = await fixture();
    const first = window(1, 'Application window title');
    const icon = {};
    first.app = {create_icon_texture: size => {
        assert.equal(size, 16);
        return icon;
    }};
    /** @type {number | undefined} */
    let activationTime;
    first.activate = timestamp => { activationTime = timestamp; };
    f.focus(first);
    f.settings.set_int('display-limit', 12);
    const item = f.menu.items[0];
    assert.deepEqual(item.children, [item.ornament, icon, item.label]);
    assert.equal(item.label.text, '1. Applicati...');
    item.emit('activate');
    assert.equal(activationTime, 123);
});

test('disable disconnects listeners and clears history', async () => {
    const f = await fixture();
    f.focus(window(1));
    const indicator = f.extension._indicator;
    assert.ok(indicator);
    f.extension.disable();
    assert.equal(f.display.handlers.size, 0);
    assert.equal(f.settings.handlers.size, 0);
    assert.equal(f.menu.handlers.size, 0);
    assert.equal(indicator.destroyed, true);
    assert.deepEqual(f.ids(), []);
});

test('override-redirect windows do not enter the history', async () => {
    const f = await fixture();
    f.focus(window(1));
    const panel = window(2);
    panel.is_override_redirect = () => true;
    f.focus(panel);
    assert.deepEqual(f.ids(), [1]);
    assert.deepEqual(f.labels(), ['1. Window 1']);
});
