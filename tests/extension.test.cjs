const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class SignalEmitter {
    constructor() {
        this.handlers = new Map();
        this.nextId = 1;
    }

    connect(signal, handler) {
        const id = this.nextId++;
        this.handlers.set(id, {signal, handler});
        return id;
    }

    disconnect(id) {
        assert.ok(this.handlers.delete(id), `Unknown signal ${id}`);
    }

    emit(signal, ...args) {
        for (const entry of this.handlers.values()) {
            if (entry.signal === signal)
                entry.handler(this, ...args);
        }
    }
}

class Menu extends SignalEmitter {
    constructor() {
        super();
        this.items = [];
    }

    removeAll() {
        this.items = [];
    }

    addMenuItem(item) {
        this.items.push(item);
    }
}

class PopupMenuItem extends SignalEmitter {
    constructor(text, options = {}) {
        super();
        this.label = {text};
        this.ornament = {};
        this.children = [this.ornament, this.label];
        this.options = options;
    }

    add_child(child) {
        this.children.push(child);
    }

    insert_child_below(child, sibling) {
        const index = this.children.indexOf(sibling);
        assert.notEqual(index, -1);
        this.children.splice(index, 0, child);
    }
}

async function fixture(limit = 15) {
    const settings = new SignalEmitter();
    const values = {'max-history-length': limit, 'display-limit': 60};
    settings.get_int = key => {
        assert.ok(Object.hasOwn(values, key));
        return values[key];
    };
    settings.set_int = (key, value) => {
        values[key] = value;
        settings.emit('changed', key);
    };

    const display = new SignalEmitter();
    display.focus_window = null;
    let windows = [];
    display.list_all_windows = () => windows;
    const context = vm.createContext({
        global: {
            display,
            get_window_actors: () => windows
                .filter(window => window.hasActor !== false)
                .map(window => ({get_meta_window: () => window})),
            get_current_time: () => 123,
        },
    });
    class Extension {
        constructor() {
            this.uuid = 'recent-windows@local';
            this.metadata = {name: 'Recent Windows Focus'};
        }

        getSettings() {
            return settings;
        }
    }
    class Button {
        constructor() {
            this.menu = new Menu();
        }

        add_child() {}

        destroy() {
            this.destroyed = true;
            this.menu.handlers.clear();
        }
    }
    const imports = new Map([
        ['gi://St', {default: {Icon: class {}}}],
        ['gi://Shell', {default: {WindowTracker: {
            get_default: () => ({get_window_app: window => window.app}),
        }}}],
        ['gi://Meta', {default: {}}],
        ['resource:///org/gnome/shell/extensions/extension.js', {Extension}],
        ['resource:///org/gnome/shell/ui/main.js', {panel: {addToStatusArea() {}}}],
        ['resource:///org/gnome/shell/ui/panelMenu.js', {Button}],
        ['resource:///org/gnome/shell/ui/popupMenu.js', {PopupMenuItem}],
    ]);
    const source = fs.readFileSync(path.join(__dirname, '..', 'extension.js'), 'utf8');
    const module = new vm.SourceTextModule(source, {context});
    await module.link(specifier => {
        assert.ok(imports.has(specifier), `Unexpected import ${specifier}`);
        const exports = imports.get(specifier);
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports))
                this.setExport(key, value);
        }, {context});
    });
    await module.evaluate();
    const extension = new module.namespace.default();
    extension.enable();
    const menu = extension._indicator.menu;

    return {
        extension, settings, display, menu,
        focus(window) {
            if (!windows.includes(window))
                windows.push(window);
            display.focus_window = window;
            display.emit('notify::focus-window');
        },
        close(window) {
            windows = windows.filter(candidate => candidate !== window);
        },
        ids() {
            return Array.from(extension._recentHistory, item => item.id);
        },
        labels() {
            return menu.items.map(item => item.label.text);
        },
    };
}

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
