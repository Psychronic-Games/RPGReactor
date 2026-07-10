const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadRPGReactor({ search = '', wine = true } = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    const classSource = source.split('// Initialize the application')[0];
    const calls = { open: [], resize: [], close: [] };
    const currentWindow = {
        width: 1280,
        height: 720,
        setShowInTaskbar() {},
        resizeTo: (...args) => calls.resize.push(args),
        close: (...args) => calls.close.push(args)
    };
    const context = {
        console,
        URL,
        URLSearchParams,
        process: {
            platform: 'win32',
            env: wine ? { WINEPREFIX: 'C:\\wine' } : {}
        },
        require,
        window: {
            location: {
                search,
                href: `file:///editor/index.html${search}`
            }
        },
        document: {
            documentElement: { classList: { add() {} } }
        },
        nw: {
            Window: {
                get: () => currentWindow,
                open: (url, options, callback) => {
                    calls.open.push({ url, options });
                    if (callback) callback();
                }
            }
        }
    };
    const RPGReactor = vm.runInNewContext(`${classSource}\nRPGReactor;`, context);
    return { reactor: Object.create(RPGReactor.prototype), calls };
}

test('packaged frameless Windows startup does not resize or relaunch under Wine', () => {
    const { reactor, calls } = loadRPGReactor({ search: '?rrFrameless=1' });
    reactor.installCompatibilityTitlebar = () => {};

    assert.equal(reactor.relaunchFramelessForWine(), false);
    reactor.applyCompatibilityWindowFixes();
    assert.equal(calls.open.length, 0);
    assert.equal(calls.resize.length, 0);
});

test('a framed source launch under Wine relaunches frameless exactly once', () => {
    const { reactor, calls } = loadRPGReactor();

    assert.equal(reactor.relaunchFramelessForWine(), true);
    assert.equal(calls.open.length, 1);
    assert.match(calls.open[0].url, /rrFrameless=1/);
    assert.match(calls.open[0].url, /rrWineFrame=0/);
    assert.equal(calls.close.length, 1);
});
