/**
 * A struct field that declares no @default is optional: the editor must not
 * invent a value for it, because what it invents is written back on the next
 * save and a plugin cannot tell an invented 0 from a typed one.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const annotations = require(path.join(__dirname, '..', 'src', 'utils', 'PluginAnnotations.js'));
const codec = require(path.join(__dirname, '..', 'src', 'utils', 'PluginParamCodec.js'));

const PLUGIN_SOURCE = `
/*~struct~Sample:
 * @param named
 * @text Named
 * @type string
 * @default Unnamed
 *
 * @param withDefault
 * @text With Default
 * @type number
 * @min 2
 * @max 16
 * @default 4
 *
 * @param optionalNumber
 * @text Optional Number
 * @desc Blank inherits whatever the plugin decides.
 * @type number
 * @min 0
 * @max 100
 *
 * @param optionalFlag
 * @text Optional Flag
 * @type boolean
 *
 * @param optionalText
 * @text Optional Text
 * @type string
 */
`;

const schemaOf = () => annotations.parseStructDefinitions(PLUGIN_SOURCE).Sample;

test('a struct field with no @default is parsed as having none', () => {
    const schema = schemaOf();
    assert.strictEqual(schema.withDefault.default, '4');
    assert.strictEqual(schema.optionalNumber.default, null);
    assert.strictEqual(schema.optionalFlag.default, null);
    assert.strictEqual(schema.optionalText.default, null);
});

test('a new row leaves its optional fields unset and fills the rest', () => {
    const schema = schemaOf();
    const row = codec.createDefaultStructValue(schema, {});
    assert.strictEqual(row.named, 'Unnamed');
    assert.strictEqual(row.withDefault, '4');
    assert.strictEqual(row.optionalNumber, '');
    assert.strictEqual(row.optionalFlag, '');
    assert.strictEqual(row.optionalText, '');
});

test('saving a new row writes no invented zeros or falses', () => {
    const schema = schemaOf();
    const stored = codec.serializeStructValue(codec.createDefaultStructValue(schema, {}), schema, {});
    assert.strictEqual(stored.optionalNumber, '');
    assert.strictEqual(stored.optionalFlag, '');
    assert.strictEqual(stored.withDefault, '4');
    // The round trip is what mattered: an invented value survives one save and
    // is then indistinguishable from an authored one.
    const reloaded = codec.deserializeStructValue(JSON.stringify(stored), schema, {});
    assert.strictEqual(reloaded.optionalNumber, '');
    assert.strictEqual(reloaded.optionalFlag, '');
});

test('a value actually entered is kept, including a real zero and a real false', () => {
    const schema = schemaOf();
    const authored = { named: 'Mine', withDefault: '3', optionalNumber: '0',
        optionalFlag: 'false', optionalText: 'x' };
    const stored = codec.serializeStructValue(authored, schema, {});
    assert.strictEqual(stored.optionalNumber, '0');
    assert.strictEqual(stored.optionalFlag, 'false');
    const reloaded = codec.deserializeStructValue(JSON.stringify(stored), schema, {});
    assert.strictEqual(reloaded.optionalNumber, '0');
    assert.strictEqual(reloaded.optionalFlag, 'false');
    assert.strictEqual(reloaded.withDefault, '3');
});

test('a field that declares a default is unchanged when left empty', () => {
    const schema = schemaOf();
    assert.strictEqual(codec.deserializeStructFieldValue('', schema.withDefault, {}), '0');
    assert.strictEqual(codec.deserializeStructFieldValue(null, schema.withDefault, {}), '0');
    assert.strictEqual(codec.deserializeStructFieldValue('4', schema.withDefault, {}), '4');
});

test('every struct field kind labels an optional blank as (unset)', () => {
    const fs = require('node:fs');
    const manager = fs.readFileSync(path.join(__dirname, '..', 'src', 'PluginManager.js'), 'utf8');
    const widgets = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'utils', 'PluginParamWidgets.js'), 'utf8');
    // The number and text boxes are built in PluginManager, the colour row in
    // PluginParamWidgets; all three have to say the same thing.
    assert.strictEqual(
        manager.split("input.placeholder = this._tt('(unset)')").length - 1, 2,
        'both the number and the text struct fields should be labelled as unset');
    assert.ok(widgets.includes("raw.placeholder = text('(unset)', context.tt)"),
        'the colour field should be labelled as unset');
});
