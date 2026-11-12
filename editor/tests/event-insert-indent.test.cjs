const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const listPath = path.join(editorRoot, 'src', 'event', 'EventCommandList.js');
const listSource = fs.readFileSync(listPath, 'utf8');

function loadEventCommandList() {
    return vm.runInNewContext(`${listSource}\nEventCommandList;`, {
        console, process, require, nw: {}, window: {},
        document: { createElement: () => ({ style: {}, dataset: {} }), getElementById: () => null }
    });
}

const EventCommandList = loadEventCommandList();

// if (cond)        0  111  indent 0
//   showText       1  101  indent 1
// end              2  412  indent 0
function branchList() {
    return [
        { code: 111, indent: 0, parameters: [] },
        { code: 101, indent: 1, parameters: [] },
        { code: 412, indent: 0, parameters: [] }
    ];
}

test('the insertion point inside a branch body is one level deeper', () => {
    const list = branchList();
    // Directly after the Conditional Branch header: inside the body.
    assert.equal(EventCommandList.insertionIndent(list, 1), 1);
    // After the body command, still inside the body.
    assert.equal(EventCommandList.insertionIndent(list, 2), 1);
});

test('a command built at indent 0 is rebased onto the insertion point', () => {
    // Every command editor in this family returns indent 0 and relies on the
    // insertion path to place it.
    const built = [{ code: 250, indent: 0, parameters: [{ name: 'Cat', volume: 90 }] }];
    EventCommandList.rebaseInsertIndent(built, 1);
    assert.equal(built[0].indent, 1);
});

test('rebasing keeps the relative shape of a multi-command insert', () => {
    const built = [
        { code: 101, indent: 0, parameters: [] },
        { code: 401, indent: 0, parameters: [] }
    ];
    EventCommandList.rebaseInsertIndent(built, 2);
    assert.deepEqual(built.map(cmd => cmd.indent), [2, 2]);
});

test('an indent-0 command inside a branch body would defeat the runtime skip', () => {
    // reactor_objects.js: skipBranch is
    //   while (this._list[this._index + 1].indent > this._indent) this._index++;
    // so a body command at the branch's own indent halts the skip and runs
    // even when the condition is false. This models why the rebase matters.
    const skipBranch = (list, startIndex, branchIndent) => {
        let index = startIndex;
        while (list[index + 1] && list[index + 1].indent > branchIndent) index++;
        return index;
    };

    const correct = [
        { code: 111, indent: 0 }, { code: 250, indent: 1 }, { code: 412, indent: 0 }
    ];
    assert.equal(skipBranch(correct, 0, 0), 1, 'a correctly indented body is skipped entirely');

    const flattened = [
        { code: 111, indent: 0 }, { code: 250, indent: 0 }, { code: 412, indent: 0 }
    ];
    assert.equal(skipBranch(flattened, 0, 0), 0,
        'an indent-0 audio command stops the skip, so it would play regardless');
});

test('the audio insert path rebases, like every other insertion', () => {
    const at = listSource.indexOf('[132, 133, 139, 241, 242, 245, 246, 249, 250, 251].includes(code)');
    assert.ok(at >= 0, 'the audio insertion branch is locatable');
    const block = listSource.slice(at, at + 900);
    assert.match(block, /_rebaseInsertIndent\(\[editedCommand\], baseIndent\)/);
    assert.doesNotMatch(block, /splice\(insertIndex, 0, editedCommand\)/);
});

test('no insertion site places a command without establishing its indent', () => {
    const lines = listSource.split('\n');
    const offenders = [];
    lines.forEach((line, index) => {
        if (!line.includes('page.list.splice(insertIndex')) return;
        const window = lines.slice(Math.max(0, index - 8), index + 3).join('\n');
        if (!/rebaseInsertIndent/.test(window) && !/indent: baseIndent/.test(window)) {
            offenders.push(index + 1);
        }
    });
    assert.deepEqual(offenders, [],
        `these insertions leave the command at whatever indent the editor built: ${offenders.join(', ')}`);
});
