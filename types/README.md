# Runtime types — Step 3

These declarations describe the existing global Runtime API. They add no Runtime
code, imports, loader changes or generated game JavaScript. Type checking uses
TypeScript 7.0.2 and the existing Pixi 8.20.0 declarations; players need no new tooling.

## Check the declarations

From the repository root:

```sh
npm ci --prefix editor --ignore-scripts
npm run typecheck --prefix editor
```

`typecheck` prepares an ignored DOM declaration file, runs `tsc --noEmit`, checks
the positive/negative fixtures in `types/tests/`, and verifies that an invalid
`.d.ts` still produces an error. It uses the compiler's public CLI, not the old
TypeScript compiler API. Native platform binaries install with `--ignore-scripts`.

To prepare the environment and invoke the compiler separately:

```sh
node types/tools/typecheck.cjs --prepare
./editor/node_modules/.bin/tsc --noEmit -p tsconfig.types.json
```

`types/tsconfig.json` extends the same configuration so IDEs can discover it for
declarations and fixtures under `types/`. Run `--prepare` first and use a TS7
language service. There is still no root `tsconfig.json`: plugin sources outside
this directory need an explicit project configuration until Step 4.

## Coverage and contracts

`globals.d.ts` references the declarations. This first batch covers:

- `Utils`, `Graphics`, `Bitmap`, `Sprite`, `Stage`, `Rectangle`, `Point`.
- Common `ImageManager`, `AudioManager`, `DataManager`, `SceneManager`,
  `PluginManager`, `StorageManager`, and `BattleManager` methods.
- All 29 database/game globals found in the initial survey, including
  `$dataMapInfos` and `$testEvent`.
- Supporting database shapes, game classes and audio instance contracts.

Step 3 adds game constructors/inheritance (battlers, actors/enemies, actions,
units/parties/troops, characters/player/events, map/interpreter and supporting
objects), the main Scene families, and common Window controls. Reactor3D now
covers map mode/elevation, viewport lifecycle, camera, native lights, event model
specs/playback, and media surfaces. The [plugin example](examples/ReactorTypesExample.ts)
extends Scene_MenuBase and Window_Command without hand-declaring game globals.
It is type-checked only; building/loading JS remains Steps 4–6.

Coverage is intentionally partial, not a measured percentage of all engine
members. `reactor-sprites.d.ts` still reserves the specialized Sprite_* families.
Less common scenes/windows, complete interpreter command tables, renderer
internals and the full sidecar schema are not covered. There are no empty
catch-all classes or broad `any` declarations. `PIXI` global namespace augmentation
is not included; use `import type` from `pixi.js` for external Pixi type names.
Three.js internals returned by the viewport remain `unknown` rather than
reconstructed fake Three types.
Window constructors expose the canonical MZ Rectangle form. MV-only overloads
(such as positional Window_Base arguments) continue to run in the unchanged
JavaScript compatibility layer but are not part of this declaration batch.

The contracts follow implementations rather than historical JSDoc:

- `$data*` and `$game*` start as `null`. Database entries may be null/missing even
  after loading, and `Game_Actors.actor(id)` may return `null`. Narrow at each
  use site; calling a loader does not provide a TypeScript assertion of readiness.
- `Graphics.initialize()` returns `Promise<boolean>`, and `SceneManager.run()`
  returns `Promise<void>`. `DataManager.loadGlobalInfo()` returns the cached array
  or `undefined`, not a Promise. Save/load game resolves a numeric result.
- Actor/enemy constructors require valid, loaded database IDs. Actor `actor()` /
  `currentClass()`, enemy `enemy()` and party member lists assume those references
  remain valid (and the engine's invalid-member cleanup has run). They are not
  validators for corrupt saves or deliberately invalidated database records.
  By contrast, `Game_Actors.actor(id)`, targeting an empty unit and an event's
  absent active page retain their actual null/undefined results.
- A forced `Game_Action.isValid()` can return its item object, not just a boolean.
  Use a condition or `Boolean(...)` if a boolean value is needed.
- `StorageManager.loadObject()` returns `Promise<unknown>`; arbitrary game
  variables are also `unknown`. The browser and NW.js storage branches have
  different save/remove return values, which are reflected in their signatures.
- `AudioFile.sequence` may be a numeric map ID or a string library key.
  AudioManager's `createBuffer` result always has `name` / `frameCount`; these
  fields remain optional on a raw WebAudio instance. `Bitmap.snap()` accepts an
  omitted stage, which creates a blank snapshot.
- Plugin parameters are strings or absent. `registerCommand` callbacks receive
  `Game_Interpreter` as `this`; ordinary functions preserve that binding.
- Core geometry/display classes inherit the actual Pixi declarations.
  `Bitmap.baseTexture` is instead Reactor's legacy compatibility wrapper, whose
  `source` is a Pixi `TextureSource` or null. It is not itself a `TextureSource`.
- Database shapes cover the fields used by this batch, not every editor schema.
  Declaration merging can describe plugin fields without weakening the defaults.
  `DataManager.makeEmptyMap()` is represented by optional nonessential map fields.

For example, this script type-checks against the entry point (it is not built or
loaded as part of this step):

```ts
/// <reference path="./types/globals.d.ts" />

PluginManager.registerCommand("MyPlugin", "Heal", function(args) {
    const actor = $gameActors?.actor(1);
    if (actor) actor.gainHp(Number(args.amount ?? "10"));
    this.wait(10);
});

const portrait = new Sprite(ImageManager.loadPicture("Portrait"));
portrait.anchor.set(0.5);
Graphics.app?.stage.addChild(portrait);
```

## Strict DOM / Pixi compatibility

`strict: true`, `noEmit: true`, `types: []` and `skipLibCheck: false` remain in
force. The config uses `ES2022` plus the generated DOM declarations below.
Everything in `types/**/*.ts`, including dependency declarations reached through
imports, is checked. The explicit Pixi `paths` mapping resolves the repository's
existing `editor/node_modules` install without `baseUrl` or a new root package.

Three conflicts are handled explicitly in the pinned type environment:

1. Pixi references `@webgpu/types`, which duplicates TS7's DOM WebGPU declarations
   (182 diagnostics). `typeRoots` redirects that specific type reference to
   `compat/@webgpu/types/index.d.ts`. The DOM library remains the provider of GPU
   interfaces and descriptors; the adapter only adds missing canvas `getContext`
   overloads and flag namespaces. This is a DOM environment, not a worker SDK.
   It does not patch `node_modules`, suppress diagnostics, or supply fake GPU
   interfaces. See [WebGPU's type definitions](https://gpuweb.github.io/types/).
2. DOM declares a browser `StorageManager` constructor, while the game replaces
   that global with its static save manager. `tools/typecheck.cjs` uses the
   installed compiler to locate its DOM library, copies it to
   `compat/lib.dom.generated.d.ts`, and removes that constructor value.
   The browser instance interface remains, so `navigator.storage.estimate()`
   retains its real DOM type. The adapter requires TS 7.0.2 and the exact expected declaration
   shape; a change fails explicitly rather than silently patching another symbol.
3. The Runtime also owns the `Window` constructor value. The generated DOM copy
   removes that constructor value while retaining the DOM `Window` interface.
   Thus `window`, UI event views, and Pixi's `resizeTo: Window` still refer to the
   browser; `new Window()` creates a game window. Its instance type is
   `RPGReactor.RuntimeWindow` or `InstanceType<typeof Window>`, not bare `Window`.
   Window_Base and its descendants extend that real global constructor value.
   Positive/negative fixtures cover this separation, including Pixi consumers.

`pixi_compat.js` removes Pixi's `name` and `origin` accessors. Game windows supply
their own scrolling `origin` Point; an instance name need not be set. Their
`updateTransform()` is also a no-argument, void-returning legacy update. The
instance contract omits these three Pixi members and describes them separately.
It is intentionally not directly assignable to
an arbitrary Pixi.Container parameter. Use `Scene_Base.addWindow` and the
window-aware Stage/WindowLayer child helpers for normal game UI; no false fluent
return or fake ObservablePoint is used to force assignability.

The generated `.d.ts` is ignored and recreated by `typecheck`; do not hand-edit
or commit it. It contains no Runtime code. `--prepare` is sufficient to restore
it after a clean checkout. No duplicate standard DOM library should be added to
this environment. Apart from the two removed constructor-value declarations,
the copied upstream DOM declarations and license text are unchanged.

The fixtures check Pixi assignability, valid/invalid GPU descriptors, canvas
nullability, the two storage APIs, game lifecycle nullability, callback binding,
async returns, game inheritance, Window type/value separation, scenes, and 3D/media
contracts. The additional failing-declaration guard prevents a future
`skipLibCheck: true` change from silently disabling declaration validation.

## Using the declarations without the Editor

When installing the declarations into a nested vendor directory, the DOM
preparation tool can use the consuming workspace's compiler:

```sh
node src/vendor/rpgreactor/types/tools/typecheck.cjs --prepare --compiler-root ./src
```

`--compiler-root` selects the directory containing `node_modules/typescript`.
The generated DOM file stays beside the installed declarations under
`types/compat/`. This option does not rewrite the consumer's tsconfig or install
dependencies. The consumer must include `types/globals.d.ts` and the generated
DOM file, use `lib: ["ES2022"]`, point `typeRoots` at the installed `types/compat`,
and resolve `pixi.js` from its own dependencies. Keep Node build-tool configs
separate from the game's global declarations. Use `--prepare` followed by the
consumer's own typecheck command; the tool's default full check still targets
this repository's `tsconfig.types.json` and fixtures.

The declarations import only Pixi types and reference other declaration files;
they do not import Editor modules. An independent project can:

1. Copy `types/`, excluding the generated DOM file and `types/tests/` (the example is optional).
2. Install `typescript@7.0.2` and `pixi.js@8.20.0` as development dependencies.
3. Copy `tsconfig.types.json`, remove its repository-specific `paths` mapping
   (Pixi now resolves from the project's own `node_modules`), and add its plugin
   `.ts` sources to `include`.
4. Run `node types/tools/typecheck.cjs` from that project, or use `--prepare`
   followed by its local `tsc --noEmit -p tsconfig.types.json`.

This checks TS sources only. Building/loading new JS belongs to Steps 4–6.

## Gameplay 3D boundaries

The 3D scripts and their hooks are assumed loaded in normal Runtime order.
`ensureLoaded()` still resolves false on a failed Three.js load; viewport access
stays nullable. No type annotation guarantees a usable GPU or performs a load.
Model input angles are degrees while normalized model angles are radians. Media
command opacity/volume use 0..255 / 0..100; parsed descriptors use 0..1. Parsers
accept raw input as `unknown` and return a descriptor or null; manager calls use
the documented command fields and also retain nullable results.

## Survey provenance and existing repository baseline

The [API inventory](RUNTIME-API-INVENTORY.md) was initially scanned with TS 5.9.3
at `1d95290479b7bdc507b6aa98c162ea2b07e99d3b`, then manually corrected during
review. It is a snapshot, not a maintained generated artifact. The old scanner in
ignored `tmp/` uses compiler APIs unavailable through TS7's `require("typescript")`.
A future maintained refresh needs a compatible parser in version control.

The accepted pre-existing JS test baseline is 3885 tests: 3864 pass, 10 fail,
11 skip. This is not a green suite. Repository syntax checking also fails on the
unchanged `evidence` redeclaration in `editor/tests/smoke/nw-sequence-expansion.cjs`.
Its temporary fix was verified and restored to HEAD; the patch and diagnostics
are recorded in ignored `tmp/`. These issues are separate from type checking.

Configuration references: TypeScript's [typeRoots](https://www.typescriptlang.org/tsconfig/typeRoots.html),
[noEmit](https://www.typescriptlang.org/tsconfig/noEmit.html), and
[skipLibCheck](https://www.typescriptlang.org/tsconfig/skipLibCheck.html).
