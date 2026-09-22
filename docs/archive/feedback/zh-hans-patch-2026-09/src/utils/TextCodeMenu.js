/**
 * RRTextCodeMenu - the right-click menu and the reference panel for any field
 * that accepts message control characters.
 *
 * MZ attaches one shared popup (its Qt context is `TextEditPopupMenuEx`) to
 * every such field, with four items above the standard edit commands: Insert
 * Color Index, Insert Icon Index, Insert Control Character, and Plugin Help.
 * This is the same idea as one attachable helper, so a second surface costs a
 * single `attach` call rather than a copy of the menu.
 *
 * Two details worth knowing before editing this file:
 *
 *   NW.js gives a textarea no context menu of its own. Chromium's default menu
 *   is absent in an app window, and the editor's global handler (main.js:441)
 *   only suppresses the canvas. So Cut/Copy/Paste/Select All are ours to
 *   provide - leaving them out would make right-click *remove* capability from
 *   the field rather than add it.
 *
 *   Insertion has to survive the field losing focus. Opening a picker moves
 *   focus into the modal, and a textarea reports selectionStart 0 once blurred,
 *   so the caret is captured when the menu opens and restored before writing.
 *   Without that, every picker-driven insert lands at the start of the text.
 */
(function (root) {
    'use strict';

    const tt = text => (root.I18n ? root.I18n.tText(text) : text);


// --- Round 4: zh-Hans reference detail for the text-code panel ---
const TEXT_DETAIL_ZH = {
    'Replaced with the value of the nth variable.': '替换为第 n 个变量的值。',
    'Replaced with the name of the nth actor.': '替换为第 n 位角色的名称。',
    'Replaced with the name of the nth party member, in marching order.': '替换为第 n 位队伍成员的名称（按队伍顺序）。',
    'Replaced with the currency unit.': '替换为货币单位。',
    'Draws the subsequent text in colour n, sampled from the windowskin.': '将后续文字显示为从窗口皮肤取样的第 n 种颜色。',
    'Draws icon n from img/system/IconSet.png.': '绘制 img/system/IconSet.png 中的第 n 个图标。',
    'Increases the text size by one step.': '将文字大小增加一级。',
    'Decreases the text size by one step.': '将文字大小减小一级。',
    'Changes the text size to exactly n.': '将文字大小精确设为 n。',
    'Sets the X position, with the top left of the window as the origin.': '以窗口左上角为原点设置 X 坐标。',
    'Sets the Y position, with the top left of the window as the origin.': '以窗口左上角为原点设置 Y 坐标。',
    'Opens the gold window.': '打开金钱窗口。',
    'Waits a quarter second before continuing.': '等待 1/4 秒后继续。',
    'Waits a full second before continuing.': '等待 1 秒后继续。',
    'Waits for button input before continuing.': '等待按键输入后继续。',
    'Displays the rest of the line all at once.': '一次性显示本行剩余内容。',
    'Cancels the display-all-at-once effect.': '取消一次性显示效果。',
    'Moves on after displaying the text without waiting for input.': '显示文字后立即继续，无需等待输入。',
    'Prints a literal backslash character.': '显示一个反斜杠字符。',
    'Makes subsequent text bold.': '使后续文字加粗。',
    'Removes bold from subsequent text.': '取消后续文字的加粗。',
    'Makes subsequent text italic.': '使后续文字变为斜体。',
    'Removes italic from subsequent text.': '取消后续文字的斜体。',
    'Removes the colour lock.': '解除颜色锁定。',
    'Enables word wrap for this window. Cannot be combined with alignment codes.': '为本窗口启用自动换行。不能与对齐代码同时使用。',
    'Disables word wrap for this window.': '为本窗口禁用自动换行。',
    'Disables word wrap for this window; same effect as </WordWrap>.': '为本窗口禁用自动换行；效果与 </WordWrap> 相同。',
    'Adds a line break. Requires word wrap.': '插入换行。需要启用自动换行。',
    'Adds a line break. Requires word wrap. The spaced form <line break> does not work.': '插入换行。需要启用自动换行。带空格的 <line break> 形式无效。',
    'Left-aligns subsequent text. Use at line start; not compatible with word wrap.': '将后续文字左对齐。请在行首使用；与自动换行不兼容。',
    'Removes left alignment.': '取消左对齐。',
    'Centres subsequent text. Use at line start; not compatible with word wrap.': '将后续文字居中。请在行首使用；与自动换行不兼容。',
    'Removes centre alignment.': '取消居中对齐。',
    'Right-aligns subsequent text. Use at line start; not compatible with word wrap.': '将后续文字右对齐。请在行首使用；与自动换行不兼容。',
    'Removes right alignment.': '取消右对齐。',
    'Capitalises all following text.': '将后续文字全部转为大写。',
    'Turns off auto text-casing.': '关闭自动大小写转换。',
    'Capitalises the first letter of each word.': '将每个单词的首字母大写。',
    'Lowercases all following text.': '将后续文字全部转为小写。',
    'Alternates upper and lower case, "HeLlO".': '交替使用大小写，例如“HeLlO”。',
    'Randomises upper and lower case per character.': '逐字符随机使用大小写。',
    'Draws picture x (a filename) at the current text position. Prefer \\I[n] in a description - a picture loads with a delay.': '在当前文字位置绘制图片 x（文件名）。描述中建议使用 \\I[n]——图片加载会有延迟。',
    'Draws picture x centred in the window. Prefer \\I[n] in a description - a picture loads with a delay.': '在窗口中央绘制图片 x。描述中建议使用 \\I[n]——图片加载会有延迟。',
    'Runs common event x when the code is reached.': '执行到该代码时运行公共事件 x。',
    'Waits x frames before continuing.': '等待 x 帧后继续。',
    'Ends the current message page at this line. Used when the window has five or more rows.': '在本行结束当前消息页。当窗口有 5 行或更多行时使用。',
    'Resizes the window to fit the text. Resets window settings; no word wrap.': '调整窗口大小以容纳文字。重置窗口设置；不支持自动换行。',
    'Resizes the window width to fit the text.': '调整窗口宽度以容纳文字。',
    'Resizes the window height to fit the text.': '调整窗口高度以容纳文字。',
    'Resizes and positions the window over actor x.': '调整窗口大小并将其定位到角色 x 上方。',
    'Resizes and positions the window over party member x.': '调整窗口大小并将其定位到队伍成员 x 上方。',
    'Map only. Positions the window over the player sprite.': '仅限地图。将窗口定位到玩家精灵上方。',
    'Map only. Positions the window over event x.': '仅限地图。将窗口定位到事件 x 上方。',
    'Battle only. Positions the window over enemy x.': '仅限战斗。将窗口定位到敌人 x 上方。',
    'Forces exact coordinates and dimensions. Not compatible with word wrap.': '强制使用精确坐标和尺寸。与自动换行不兼容。',
    'Forces exact coordinates. Not compatible with word wrap.': '强制使用精确坐标。与自动换行不兼容。',
    'Forces an exact window size. Not compatible with word wrap.': '强制使用精确的窗口尺寸。与自动换行不兼容。',
    'Adjusts the window offset, replacing any previous offset.': '调整窗口偏移量，替换之前的偏移。',
    'Replaced with the currently active battler. Empty outside battle.': '替换为当前行动的战斗者。战斗外为空。',
    'Choice is always shown.': '该选项始终显示。',
    'Shown if switch x is ON.': '当开关 x 为 ON 时显示。',
    'Shown if all the listed switches are ON.': '当列出的所有开关均为 ON 时显示。',
    'Shown if any listed switch is ON.': '当列出的任一开关为 ON 时显示。',
    'Choice is always hidden.': '该选项始终隐藏。',
    'Hidden if switch x is ON.': '当开关 x 为 ON 时隐藏。',
    'Hidden if all the listed switches are ON.': '当列出的所有开关均为 ON 时隐藏。',
    'Hidden if any listed switch is ON.': '当列出的任一开关为 ON 时隐藏。',
    'Choice is always enabled.': '该选项始终可用。',
    'Enabled if switch x is ON.': '当开关 x 为 ON 时可用。',
    'Enabled if all the listed switches are ON.': '当列出的所有开关均为 ON 时可用。',
    'Enabled if any listed switch is ON.': '当列出的任一开关为 ON 时可用。',
    'Choice is always disabled.': '该选项始终禁用。',
    'Disabled if switch x is ON.': '当开关 x 为 ON 时禁用。',
    'Sets the minimum text area width for the whole choice window.': '设置整个选择窗口的最小文字区域宽度。',
    'Sets the indent for this choice only.': '仅设置该选项的缩进。',
    'Shows a help window with the given text while this choice is selected.': '选中该选项时显示包含指定文字的帮助窗口。',
    'Shuffles the order of all choices.': '随机打乱所有选项的顺序。',
    'Shuffles all choices and shows only x of them.': '随机打乱所有选项并仅显示其中 x 个。',
    'Background image from img/pictures/, stretched across the choice rect.': '来自 img/pictures/ 的背景图片，拉伸覆盖选项区域。',
    'Foreground image from img/pictures/, drawn under the text.': '来自 img/pictures/ 的前景图片，绘制在文字下方。',
    'Positions the name box to the left.': '将姓名框定位到左侧。',
    'Positions the name box to the centre.': '将姓名框定位到中间。',
    'Positions the name box to the right.': '将姓名框定位到右侧。',
    'Positions the name box by a value from 0 to 10.': '根据 0 到 10 之间的值定位姓名框。',
    'Aligns the map name to the left of the screen.': '将地图名称对齐到屏幕左侧。',
    'Centres the map name horizontally.': '将地图名称水平居中。',
    'Aligns the map name to the right of the screen.': '将地图名称对齐到屏幕右侧。',
    'Aligns the map name to the top of the screen.': '将地图名称对齐到屏幕顶部。',
    'Centres the map name vertically.': '将地图名称垂直居中。',
    'Aligns the map name to the bottom of the screen.': '将地图名称对齐到屏幕底部。',
    'Adjusts the horizontal position of the map name.': '调整地图名称的水平位置。',
    'Adjusts the vertical position of the map name.': '调整地图名称的垂直位置。',
    'The name of the battler using the skill.': '使用该技能的战斗者名称。',
    'The name of the skill being used.': '正在使用的技能名称。',
    'The name of the affected battler. %2 is not replaced here.': '受影响的战斗者名称。此处的 %2 不会被替换。',
    'Prevents text codes from changing the text colour for subsequent text.': '阻止文本代码更改后续文字的颜色。',
    'Replaced with the current action\'s target. Empty outside battle.': '替换为当前行动的目标。战斗外为空。',
    'Replaced with the current action\'s name, with its icon.': '替换为当前行动的名称及其图标。',
    'Replaced with the current action\'s name, without an icon.': '替换为当前行动的名称（不含图标）。',
    'Sets this choice\'s background to text colour x.': '将该选项的背景设为文字颜色 x。',
    'Sets this choice\'s background to a hex colour.': '将该选项的背景设为十六进制颜色。',
    'Shows the Up button\'s assist text from CoreEngine.': '显示 CoreEngine 中「上」按键的辅助文字。',
    'Shows the Left button\'s assist text from CoreEngine.': '显示 CoreEngine 中「左」按键的辅助文字。',
    'Shows the Right button\'s assist text from CoreEngine.': '显示 CoreEngine 中「右」按键的辅助文字。',
    'Shows the Down button\'s assist text from CoreEngine.': '显示 CoreEngine 中「下」按键的辅助文字。',
    'Shows the OK button\'s assist text from CoreEngine.': '显示 CoreEngine 中「确定」按键的辅助文字。',
    'Shows the Cancel button\'s assist text from CoreEngine.': '显示 CoreEngine 中「取消」按键的辅助文字。',
    'Shows the Shift button\'s assist text from CoreEngine.': '显示 CoreEngine 中「Shift」按键的辅助文字。',
    'Shows the Menu button\'s assist text from CoreEngine.': '显示 CoreEngine 中「菜单」按键的辅助文字。',
    'Shows the Page Up button\'s assist text from CoreEngine.': '显示 CoreEngine 中「Page Up」按键的辅助文字。',
    'Shows the Page Down button\'s assist text from CoreEngine.': '显示 CoreEngine 中「Page Down」按键的辅助文字。',
};

    // ------------------------------------------------------------ insertion
    /**
     * Write `template` at the caret, replacing any selection.
     *
     * `{n}` marks the argument. When present, the inserted text lands with that
     * placeholder selected, so typing a number replaces it - which is what
     * makes `\V[{n}]` usable without a picker. `value` fills it in when a
     * picker already produced one.
     */
    const DEFAULT_ARGUMENT = '1';

    function insertAtCaret(field, template, value, literal) {
        if (!field) return;
        const text = String(template || '');
        // `literal` is how pasted text gets in without a `{n}` inside it being
        // mistaken for a placeholder. Clipboard content is data, not a template.
        const placeholderAt = literal ? -1 : text.indexOf('{n}');
        const supplied = value !== undefined && value !== null;
        const argument = supplied ? String(value) : DEFAULT_ARGUMENT;
        const filled = placeholderAt === -1
            ? text
            : text.slice(0, placeholderAt) + argument + text.slice(placeholderAt + 3);

        const start = Number.isFinite(field._rrCaretStart) ? field._rrCaretStart : field.selectionStart;
        const end = Number.isFinite(field._rrCaretEnd) ? field._rrCaretEnd : field.selectionEnd;
        const before = field.value.slice(0, start);
        const after = field.value.slice(end);

        field.value = before + filled + after;

        // When the argument was left at its default, leave it selected so the
        // next keystroke replaces it - that is what makes `\V[{n}]` usable
        // without going through a picker. The offset is the placeholder's index
        // in the template, which is exact; deriving it from the filled string by
        // hunting for a bracket is not, because several codes contain more than
        // one.
        if (placeholderAt !== -1 && !supplied) {
            const argumentStart = before.length + placeholderAt;
            field.setSelectionRange(argumentStart, argumentStart + argument.length);
        } else {
            const caret = before.length + filled.length;
            field.setSelectionRange(caret, caret);
        }

        field._rrCaretStart = field.selectionStart;
        field._rrCaretEnd = field.selectionEnd;
        field.focus();
        field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function rememberCaret(field) {
        field._rrCaretStart = field.selectionStart;
        field._rrCaretEnd = field.selectionEnd;
    }

    // ----------------------------------------------------------------- menu
    let openMenu = null;

    function closeMenu() {
        if (!openMenu) return;
        const { element, onDocument, onKey } = openMenu;
        document.removeEventListener('mousedown', onDocument, true);
        document.removeEventListener('keydown', onKey, true);
        if (element.parentNode) element.parentNode.removeChild(element);
        openMenu = null;
    }

    function menuItem(entry) {
        if (entry.separator) {
            const rule = document.createElement('div');
            rule.style.cssText = 'height:1px;margin:4px 0;background:var(--color-border);';
            return rule;
        }

        const item = document.createElement('div');
        item.textContent = entry.label + (entry.submenu ? '  ▸' : '');
        item.style.cssText = `
            padding: 5px 14px; font-size: 12px; white-space: nowrap; cursor: ${entry.disabled ? 'default' : 'pointer'};
            color: var(--color-text${entry.disabled ? '-muted' : ''});
        `;
        if (!entry.disabled) {
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = 'var(--color-bg-selected)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = 'transparent';
            });
            item.addEventListener('click', event => {
                event.stopPropagation();
                if (entry.submenu) return;
                closeMenu();
                entry.action();
            });
        }
        return item;
    }

    /**
     * A flat popup at (x, y), nudged back on screen when it would overflow.
     * Submenus are rendered as their own popup rather than nested hover panels;
     * a hover-tracked cascade over a modal is a lot of machinery for a list an
     * author opens occasionally, and it fights touchpads.
     */
    function showMenu(x, y, entries) {
        closeMenu();

        const element = document.createElement('div');
        element.className = 'rr-text-code-menu';
        element.style.cssText = `
            position: fixed; z-index: 10012; min-width: 200px; padding: 4px 0;
            background: var(--color-bg-menubar); border: 1px solid var(--color-border);
            border-radius: 4px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
            max-height: 70vh; overflow-y: auto;
        `;
        for (const entry of entries) element.appendChild(menuItem(entry));
        document.body.appendChild(element);

        const rect = element.getBoundingClientRect();
        const left = Math.max(4, Math.min(x, window.innerWidth - rect.width - 4));
        const top = Math.max(4, Math.min(y, window.innerHeight - rect.height - 4));
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;

        const onDocument = event => {
            if (!element.contains(event.target)) closeMenu();
        };
        const onKey = event => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                closeMenu();
            }
        };
        document.addEventListener('mousedown', onDocument, true);
        document.addEventListener('keydown', onKey, true);

        openMenu = { element, onDocument, onKey };
        return element;
    }

    // ------------------------------------------------------------ clipboard
    function canCut(field) {
        return field.selectionStart !== field.selectionEnd;
    }

    async function paste(field) {
        rememberCaret(field);
        let text = '';
        try {
            text = await navigator.clipboard.readText();
        } catch (error) {
            // Clipboard permission is not always granted in an app window;
            // execCommand still works on the focused field.
            field.focus();
            document.execCommand('paste');
            return;
        }
        if (text) insertAtCaret(field, text, null, true);
    }

    function copySelection(field) {
        field.focus();
        document.execCommand('copy');
    }

    function cutSelection(field) {
        field.focus();
        document.execCommand('cut');
        field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ------------------------------------------------------------ preview
    /**
     * Draw `text` into `element` the way drawTextEx would read it.
     *
     * The insert menu above is the authoring half; this is the reading half.
     * A field that accepts control characters showed its author raw markup --
     * `\I[64]Fire`, `\C[16]Label` -- with no way to see what that meant short
     * of launching the game. Icons become real cells out of the project's
     * IconSet, `\C[n]` recolours the run that follows it from the project's
     * own windowskin palette, and every other code is dropped, which is what
     * leaves the text reading as the player will read it.
     *
     * Deliberately not a renderer: no word wrap, no `\{` size changes, no
     * variable substitution. It answers "what does this line say, and in what
     * colour", which is the question an author has while typing.
     */
    const PREVIEW_CODE = /\\([A-Za-z]{1,8})\[([^\]]*)\]|\\([{}|.^!><$])/g;

    function renderPreview(element, text, options) {
        if (!element) return element;
        const settings = options || {};
        const raw = String(text == null ? '' : text);
        const url = typeof settings.iconSetUrl === 'function'
            ? settings.iconSetUrl()
            : (settings.iconSetUrl || '');
        const skin = typeof settings.skin === 'function' ? settings.skin() : (settings.skin || null);
        const colorFor = index => (root.RRWindowskin ? root.RRWindowskin.textColor(skin, index) : '');

        element.textContent = '';
        let color = '';
        let buffer = '';
        const flush = () => {
            if (!buffer) return;
            const span = document.createElement('span');
            span.textContent = buffer;
            if (color) span.style.color = color;
            element.appendChild(span);
            buffer = '';
        };

        PREVIEW_CODE.lastIndex = 0;
        let last = 0;
        let match;
        while ((match = PREVIEW_CODE.exec(raw)) !== null) {
            buffer += raw.slice(last, match.index);
            last = PREVIEW_CODE.lastIndex;
            const name = String(match[1] || '').toUpperCase();
            if (name === 'I') {
                flush();
                const cell = root.RRIconCodes ? root.RRIconCodes.cell(Number(match[2]), { url }) : null;
                if (cell) element.appendChild(cell);
            } else if (name === 'C') {
                // A colour code applies to everything after it, so the run
                // before it has to be committed at its old colour first.
                flush();
                const index = Number(match[2]);
                color = Number.isFinite(index) && index > 0 ? colorFor(index) : '';
            }
            // Everything else -- \V[n], \N[n], \{, \} -- is markup the player
            // never sees, so it leaves no trace here either.
        }
        buffer += raw.slice(last);
        flush();
        return element;
    }

    /** Does `text` carry anything renderPreview would draw differently? */
    function hasPreviewableCode(text) {
        PREVIEW_CODE.lastIndex = 0;
        return PREVIEW_CODE.test(String(text == null ? '' : text));
    }

    // ------------------------------------------------------------- pickers
    function pickColor(field, options) {
        const skin = typeof options.skin === 'function' ? options.skin() : null;
        if (!root.RRColorPickerModal) return;
        root.RRColorPickerModal.open({
            skin,
            current: -1,
            onPick: index => insertAtCaret(field, '\\C[{n}]', index)
        });
    }

    /**
     * The editor's one IconSet grid (RRIconPicker), above the message modal.
     * It takes the sheet's path, and the project it belongs to is what the
     * menu was opened with.
     */
    function pickIcon(field, options, insert) {
        if (!root.RRIconPicker) return;
        const projectPath = typeof options.projectPath === 'function' ? options.projectPath() : '';
        const sheet = root.RRIconPicker.iconSetPathFor ? root.RRIconPicker.iconSetPathFor(projectPath) : '';
        root.RRIconPicker.show(0, index => insertAtCaret(field, insert || '\\I[{n}]', index), sheet, { zIndex: 10009 });
    }

    /**
     * Insert one catalogue entry, routing to a picker when the argument has one.
     * An entry with no argument goes straight in.
     */
    function insertEntry(field, entry, options) {
        if (!entry.insert) {
            insertAtCaret(field, entry.code);
            return;
        }
        if (entry.param === 'color' && root.RRColorPickerModal) {
            const skin = typeof options.skin === 'function' ? options.skin() : null;
            root.RRColorPickerModal.open({
                skin,
                current: -1,
                onPick: index => insertAtCaret(field, entry.insert, index)
            });
            return;
        }
        if (entry.param === 'icon' && root.RRIconPicker) {
            pickIcon(field, options, entry.insert);
            return;
        }
        if (entry.param === 'variable' && typeof options.pickVariable === 'function') {
            options.pickVariable(id => insertAtCaret(field, entry.insert, id));
            return;
        }
        insertAtCaret(field, entry.insert);
    }

    // ---------------------------------------------------------- plugin help
    /**
     * MZ's [Plugin Help], which its own string table calls
     * `Dialog_PluginHelpEverywhere` - the plugin help, reachable from wherever
     * a code might be typed rather than only from the Plugin Manager.
     *
     * The parsing, searching and match highlighting all belong to the editor's
     * PluginManager already, so this borrows those methods rather than growing
     * a second help implementation. Opening the Plugin Manager window itself
     * would work too, but it would bury the dialog the author is editing.
     */
    function openPluginHelp(options) {
        const manager = root.reactor && root.reactor.pluginManager;
        const plugins = (typeof options.plugins === 'function' ? options.plugins() : []) || [];
        const projectPath = typeof options.projectPath === 'function' ? options.projectPath() : '';

        // Manifest entries carry no help text - the Plugin Manager attaches it
        // when it loads, and it may never have been opened. getPluginMetadata
        // is the same mtime-cached parser it uses, and works without the window
        // ever being shown, so the help is read here on demand instead.
        const withHelp = plugins
            .filter(plugin => plugin && plugin.status === true)
            .map(plugin => {
                if (plugin.help) return plugin;
                if (!manager || typeof manager.getPluginMetadata !== 'function'
                    || !manager.path || !projectPath) return plugin;
                try {
                    const meta = manager.getPluginMetadata(
                        manager.path.join(projectPath, 'js', 'plugins', `${plugin.name}.js`));
                    return meta && meta.help ? { ...plugin, help: meta.help } : plugin;
                } catch (error) {
                    return plugin;
                }
            });
        const enabled = withHelp.filter(plugin => plugin.help);

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.8); z-index: 10011;
            display: flex; justify-content: center; align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'rr-modal';
        container.style.cssText = 'width: min(1000px, calc(100vw - 24px)); height: min(760px, 88vh);';

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.textContent = tt('Plugin Help');
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.style.cssText =
            'background:none;border:none;color:var(--color-text-strong);font-size:20px;cursor:pointer;';
        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.style.cssText = 'flex:1; display:flex; min-height:0;';

        const list = document.createElement('div');
        list.style.cssText = `
            width: 260px; overflow-y: auto; border-right: 1px solid var(--color-border);
            flex-shrink: 0;
        `;

        const right = document.createElement('div');
        right.style.cssText = 'flex:1; display:flex; flex-direction:column; min-width:0;';

        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = tt('Search help');
        search.style.cssText = `
            margin: 8px; padding: 6px 8px; background: var(--color-bg-input);
            color: var(--color-text); border: 1px solid var(--color-border-input);
            border-radius: 3px; font-size: 12px;
        `;

        const content = document.createElement('pre');
        content.style.cssText = `
            flex: 1; overflow: auto; margin: 0; padding: 0 12px 12px 12px;
            white-space: pre-wrap; word-break: break-word;
            font-family: monospace; font-size: 12px; color: var(--color-text);
        `;

        let active = null;

        const render = () => {
            if (!active) {
                content.textContent = enabled.length
                    ? tt('Select a plugin to read its help.')
                    : tt('No enabled plugin in this project ships help text.');
                return;
            }
            const query = search.value.trim();
            const help = active.help || '';
            if (!query || !manager || typeof manager.findPluginHelpMatches !== 'function') {
                content.textContent = help;
                return;
            }
            const matches = manager.findPluginHelpMatches(help, query);
            manager.renderPluginHelpMatches(content, help, matches, matches.length ? 0 : -1);
        };

        enabled.forEach(plugin => {
            const row = document.createElement('div');
            row.textContent = plugin.name;
            row.style.cssText = `
                padding: 6px 10px; font-size: 12px; cursor: pointer;
                color: var(--color-text); border-bottom: 1px solid var(--color-border);
                overflow: hidden; text-overflow: ellipsis;
            `;
            row.addEventListener('click', () => {
                active = plugin;
                for (const sibling of list.children) {
                    sibling.style.backgroundColor = 'transparent';
                }
                row.style.backgroundColor = 'var(--color-bg-selected)';
                render();
            });
            list.appendChild(row);
        });

        // The message plugins are what a Show Text field is most likely asking
        // about, so open on one when it is present instead of an empty pane.
        const preferred = enabled.find(plugin => plugin.name === 'VisuMZ_1_MessageCore');
        if (preferred) {
            active = preferred;
            const index = enabled.indexOf(preferred);
            const row = list.children[index];
            if (row) {
                row.style.backgroundColor = 'var(--color-bg-selected)';
                // A highlighted row 40 entries down a scrolling list is not
                // visibly selected; the reader sees help they did not ask for.
                setTimeout(() => row.scrollIntoView({ block: 'nearest' }), 0);
            }
        }

        search.addEventListener('input', render);

        right.appendChild(search);
        right.appendChild(content);
        body.appendChild(list);
        body.appendChild(right);
        container.appendChild(header);
        container.appendChild(body);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        const close = () => {
            document.removeEventListener('keydown', onKey, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };
        function onKey(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                close();
            }
        }
        document.addEventListener('keydown', onKey, true);
        closeButton.addEventListener('click', close);
        overlay.addEventListener('click', event => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });

        render();
        search.focus();
    }

    /**
     * The catalogue for one surface. `scope` and `inBattle` are both read at
     * call time, so a dialog reused for a map event and then a troop page shows
     * the right set each time rather than whichever it opened with first.
     */
    function groupsFor(options) {
        if (!root.RRTextCodes) return [];
        return root.RRTextCodes.forScope(
            options.scope || 'message',
            typeof options.plugins === 'function' ? options.plugins() : [],
            {
                inBattle: typeof options.inBattle === 'function' ? options.inBattle() : !!options.inBattle,
                formatArgs: options.formatArgs || ''
            }
        );
    }

    // --------------------------------------------------------------- attach
    function controlCharacterEntries(field, options) {
        const groups = groupsFor(options);

        const entries = [];
        for (const group of groups) {
            entries.push({ separator: true });
            entries.push({
                label: `— ${group.plugin ? `${tt(group.title)} (${group.plugin.replace(/^VisuMZ_\d+_/, '')})` : tt(group.title)} —`,
                disabled: true
            });
            for (const code of group.codes) {
                entries.push({
                    label: code.label ? `${code.code}    ${tt(code.label)}` : code.code,
                    action: () => insertEntry(field, code, options)
                });
            }
        }
        // The leading separator before the first heading is noise.
        return entries.slice(1);
    }

    /**
     * Give a field the menu. Returns a detach function.
     *
     * options:
     *   scope        'message' | 'choice' | 'namebox' - which codes apply
     *   plugins      () => manifest entries, for gating and for Plugin Help
     *   skin         () => RRWindowskin record, for real palette colours
     *   iconSetUrl   () => url of img/system/IconSet.png
     *   pickVariable (cb) => void, optional, opens the variable picker
     */
    function attach(field, options) {
        if (!field) return () => {};
        const settings = options || {};

        const onContextMenu = event => {
            event.preventDefault();
            event.stopPropagation();
            rememberCaret(field);

            showMenu(event.clientX, event.clientY, [
                { label: tt('Cut'), disabled: !canCut(field), action: () => cutSelection(field) },
                { label: tt('Copy'), disabled: !canCut(field), action: () => copySelection(field) },
                { label: tt('Paste'), action: () => paste(field) },
                { label: tt('Select All'), action: () => { field.focus(); field.select(); } },
                { separator: true },
                { label: tt('Insert Color Index'), action: () => pickColor(field, settings) },
                { label: tt('Insert Icon Index'), action: () => pickIcon(field, settings) },
                {
                    label: tt('Insert Control Character'),
                    action: () => showMenu(event.clientX + 12, event.clientY + 12,
                        controlCharacterEntries(field, settings))
                },
                { separator: true },
                { label: tt('Plugin Help'), action: () => openPluginHelp(settings) }
            ]);
        };

        const track = () => rememberCaret(field);

        field.addEventListener('contextmenu', onContextMenu);
        field.addEventListener('keyup', track);
        field.addEventListener('mouseup', track);
        field.addEventListener('blur', track);

        return () => {
            field.removeEventListener('contextmenu', onContextMenu);
            field.removeEventListener('keyup', track);
            field.removeEventListener('mouseup', track);
            field.removeEventListener('blur', track);
        };
    }

    // ------------------------------------------------------ reference panel
    /**
     * The always-readable half of the feature: every code that applies here,
     * with what it does, click to insert.
     *
     * A hover menu was the other option and is worse over a textarea - it
     * would open while the author is selecting text, and it cannot be read
     * while typing, which is exactly when the reference is wanted.
     */
    function createReferencePanel(fieldOrGetter, options) {
        const settings = options || {};
        // The dialog rebuilds its DOM on every open, so a panel that captured
        // the textarea once would insert into a detached element after the
        // second open. Resolve it per click instead.
        const resolveField = typeof fieldOrGetter === 'function'
            ? fieldOrGetter
            : () => fieldOrGetter;
        const panel = document.createElement('div');
        panel.className = 'rr-text-code-panel';
        panel.style.cssText = `
            border: 1px solid var(--color-border); border-radius: 3px;
            background: var(--color-bg-panel); display: flex; flex-direction: column;
            min-height: 0;
        `;

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.style.cssText = `
            all: unset; padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: bold;
            color: var(--color-text-strong); display: flex; justify-content: space-between;
        `;

        const listing = document.createElement('div');
        listing.style.cssText = 'overflow-y: auto; padding: 0 6px 6px 6px; max-height: 320px;';

        const filter = document.createElement('input');
        filter.type = 'text';
        filter.placeholder = tt('Filter codes');
        // The panel is a flex column, so the input fills the width between
        // its margins. That has to be said inline: a database form gives
        // every text input `width: 100%`, and 100% plus 6px of margin a side
        // runs 12px past the card.
        filter.style.cssText = `
            margin: 0 6px 6px 6px; padding: 4px 6px; background: var(--color-bg-input);
            color: var(--color-text); border: 1px solid var(--color-border-input);
            border-radius: 3px; font-size: 11px;
            width: auto; align-self: stretch; box-sizing: border-box; min-width: 0;
        `;

        // Selecting without inserting is only obvious once you know it, and a
        // click that appears to do nothing reads as broken. Say what inserts.
        const hint = document.createElement('div');
        hint.textContent = tt('Double-click a code to insert it.');
        hint.style.cssText =
            'padding: 4px 8px 6px 8px; font-size: 10px; color: var(--color-text-muted);';

        let expanded = !settings.collapsed;
        const applyExpanded = () => {
            toggle.textContent = '';
            const label = document.createElement('span');
            label.textContent = tt('Text Codes');
            const chevron = document.createElement('span');
            chevron.textContent = expanded ? '▾' : '▸';
            toggle.appendChild(label);
            toggle.appendChild(chevron);
            filter.style.display = expanded ? '' : 'none';
            listing.style.display = expanded ? '' : 'none';
            if (hint) hint.style.display = expanded ? '' : 'none';
        };

        // Click selects, double click inserts. A single click that wrote into
        // the message was too easy to fire while reading the list - the panel
        // is a reference first and a palette second, and selecting is how you
        // read a description without committing to it.
        let selectedRow = null;
        let selectedCode = null;

        const paintRow = (row, selected) => {
            row.style.backgroundColor = selected ? 'var(--color-bg-selected)' : 'transparent';
            row.style.outline = selected ? '1px solid var(--color-accent)' : 'none';
            row.style.outlineOffset = '-1px';
        };

        const select = (row, code) => {
            if (selectedRow) paintRow(selectedRow, false);
            selectedRow = row;
            selectedCode = code;
            paintRow(row, true);
        };

        const insertSelected = () => {
            if (!selectedCode) return;
            const target = resolveField();
            if (target) insertEntry(target, selectedCode, settings);
        };

        const render = () => {
            listing.innerHTML = '';
            // A re-render replaces every row, so the old node is gone; keeping
            // a reference to it would leave a highlight nothing can clear.
            selectedRow = null;
            selectedCode = null;
            const groups = groupsFor(settings);
            const needle = filter.value.trim().toLowerCase();

            for (const group of groups) {
                const codes = needle
                    ? group.codes.filter(code =>
                        code.code.toLowerCase().includes(needle) ||
                        String(code.detail || '').toLowerCase().includes(needle) ||
                        String(code.label || '').toLowerCase().includes(needle))
                    : group.codes;
                if (!codes.length) continue;

                const heading = document.createElement('div');
                heading.textContent = group.plugin
                    ? `${tt(group.title)} — ${group.plugin.replace(/^VisuMZ_\d+_/, '')}`
                    : tt(group.title);
                heading.style.cssText = `
                    position: sticky; top: 0; padding: 5px 4px 3px 4px; font-size: 10px;
                    text-transform: uppercase; letter-spacing: 0.5px;
                    color: var(--color-text-muted); background: var(--color-bg-panel);
                `;
                listing.appendChild(heading);

                for (const code of codes) {
                    const row = document.createElement('div');
                    // Marks this child as a code row rather than a heading, and
                    // carries what keyboard navigation would otherwise re-derive.
                    row._rrCode = code;
                    row.style.cssText = `
                        display: grid; grid-template-columns: minmax(90px, auto) 1fr; gap: 8px;
                        padding: 3px 4px; border-radius: 2px; cursor: pointer; align-items: baseline;
                    `;
                    const name = document.createElement('code');
                    name.textContent = code.code;
                    name.style.cssText = 'font-size: 11px; color: var(--color-syntax-type); white-space: nowrap;';
                    const detail = document.createElement('div');
                    detail.textContent = TEXT_DETAIL_ZH[code.detail] || code.detail || '';
                    detail.style.cssText = 'font-size: 11px; color: var(--color-text-muted);';
                    row.appendChild(name);
                    row.appendChild(detail);
                    // Hover must not fight the selection highlight, so it only
                    // paints rows that are not the selected one.
                    row.addEventListener('mouseenter', () => {
                        if (row !== selectedRow) row.style.backgroundColor = 'var(--color-bg-hover, var(--color-bg-selected))';
                    });
                    row.addEventListener('mouseleave', () => {
                        if (row !== selectedRow) row.style.backgroundColor = 'transparent';
                    });
                    row.addEventListener('click', () => select(row, code));
                    row.addEventListener('dblclick', event => {
                        // Without this the second click of the double also
                        // lands as a text selection in the panel.
                        event.preventDefault();
                        select(row, code);
                        insertSelected();
                    });
                    listing.appendChild(row);
                }
            }

            if (!listing.children.length) {
                const empty = document.createElement('div');
                empty.textContent = tt('No matching text codes.');
                empty.style.cssText = 'padding: 8px 4px; font-size: 11px; color: var(--color-text-muted);';
                listing.appendChild(empty);
            }
        };

        // Arrow keys move the selection and Enter inserts, so the panel is
        // usable without going back to the mouse for every code.
        listing.tabIndex = 0;
        listing.style.outline = 'none';
        listing.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                insertSelected();
                return;
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const rows = Array.from(listing.children).filter(child => child._rrCode);
            if (!rows.length) return;
            const current = rows.indexOf(selectedRow);
            const next = event.key === 'ArrowDown'
                ? Math.min(rows.length - 1, current + 1)
                : Math.max(0, current <= 0 ? 0 : current - 1);
            const row = rows[next];
            if (row && row._rrCode) {
                select(row, row._rrCode);
                row.scrollIntoView({ block: 'nearest' });
            }
        });

        toggle.addEventListener('click', () => {
            expanded = !expanded;
            applyExpanded();
        });
        filter.addEventListener('input', render);
        // Enter in the filter inserts whatever is selected, so a
        // type-then-select-then-insert pass never needs the mouse.
        filter.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                insertSelected();
            }
        });

        panel.appendChild(toggle);
        panel.appendChild(filter);
        panel.appendChild(hint);
        panel.appendChild(listing);
        applyExpanded();
        render();

        panel.refresh = render;
        return panel;
    }

    const api = {
        attach,
        insertAtCaret,
        createReferencePanel,
        renderPreview,
        hasPreviewableCode,
        openPluginHelp,
        showMenu,
        closeMenu
    };

    root.RRTextCodeMenu = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
