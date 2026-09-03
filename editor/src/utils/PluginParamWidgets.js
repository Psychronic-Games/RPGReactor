/**
 * Typed widgets shared by plugin parameters, struct fields, and command args.
 */
(function(root) {
    let pickerSequence = 0;

    const choiceItems = schema => (schema.options || []).map((label, index) => ({
        label: String(label ?? ''),
        value: String(Array.isArray(schema.values) && index in schema.values
            ? schema.values[index]
            : label ?? '')
    }));

    const text = (value, tt) => tt ? tt(value) : value;

    const inputCss = style => style || 'width:100%;padding:6px 10px;background-color:var(--color-bg-input);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;font-size:12px;box-sizing:border-box;';

    const buildContext = options => {
        const source = options || {};
        const controller = source.projectController;
        const project = source.project || (controller && typeof controller.getCurrentProject === 'function'
            ? controller.getCurrentProject()
            : controller && controller.currentProject) || null;
        const projectPath = source.projectPath || project?.path || '';
        const iconSetPath = source.iconSetPath || (projectPath && root.RRIconPicker
            ? root.RRIconPicker.iconSetPathFor(projectPath)
            : '');
        const database = source.database || controller?.databaseManager || null;
        const labelMode = root.reactor?.optionsManager?.getDatabaseListLabels?.() || 'editorFirst';
        const editorName = source.editorName || (details => {
            if (labelMode === 'gameOnly' || !root.RREditorNames) return '';
            return root.RREditorNames.get(database?.data?.editorNames, details?.source, details?.id);
        });
        const editorNameFirst = Object.prototype.hasOwnProperty.call(source, 'editorNameFirst')
            ? source.editorNameFirst
            : labelMode === 'editorFirst';
        return {
            ...source,
            project,
            projectPath,
            iconSetPath,
            database,
            editorName,
            editorNameFirst
        };
    };

    const refOptions = context => ({
        editorName: context?.editorName,
        editorNameFirst: context?.editorNameFirst
    });

    const iconSetUrl = context => {
        if (!context?.iconSetPath) return '';
        if (root.RRIconPicker?.imageUrl) return root.RRIconPicker.imageUrl(context.iconSetPath);
        return encodeURI('file://' + String(context.iconSetPath).replace(/\\/g, '/'))
            .replace(/#/g, '%23').replace(/\?/g, '%3F');
    };

    const isImageDir = dir => /^\.?[\\/]?img([\\/]|$)/i.test(String(dir || '').trim());

    const imageRecords = (schema, context) => {
        if (!isImageDir(schema?.dir) || !context?.projectPath || !context.fs || !context.path
                || !root.RRAssetFiles) return [];
        try {
            const parts = String(schema.dir).split(/[\\/]+/).filter(Boolean);
            const directory = context.path.join(context.projectPath, ...parts);
            if (!context.fs.existsSync(directory)) return [];
            return root.RRAssetFiles.listUnique(directory, ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.apng']);
        } catch (error) {
            return [];
        }
    };

    const canBrowseImages = (schema, context) => {
        if (!isImageDir(schema?.dir) || !context?.projectPath || !context.fs || !context.path
                || !root.RRAssetFiles || !root.RRPickerIndex) return false;
        try {
            const parts = String(schema.dir).split(/[\\/]+/).filter(Boolean);
            return context.fs.existsSync(context.path.join(context.projectPath, ...parts));
        } catch (error) {
            return false;
        }
    };

    const createIconCrop = (iconIndex, context) => {
        const icon = root.document.createElement('span');
        const url = iconSetUrl(context);
        const index = Number(iconIndex);
        icon.className = 'rr-plugin-ref-icon';
        icon.style.cssText = 'width:20px;height:20px;flex:0 0 20px;display:inline-block;image-rendering:pixelated;';
        if (url && Number.isInteger(index) && index > 0) {
            icon.style.backgroundImage = `url("${url}")`;
            icon.style.backgroundSize = '320px auto';
            icon.style.backgroundPosition = `-${(index % 16) * 20}px -${Math.floor(index / 16) * 20}px`;
        }
        return icon;
    };

    const showChoicePicker = ({ items, current, onPick, tt, zIndex }) => {
        const document = root.document;
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'rr-plugin-choice-overlay plugin-manager-child-modal';
        overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:${zIndex || 10010};display:flex;align-items:center;justify-content:center;`;

        const modal = document.createElement('div');
        modal.className = 'rr-modal rr-plugin-choice-picker';
        modal.style.cssText = 'width:min(520px,calc(100vw - 24px));height:min(620px,80vh);display:flex;flex-direction:column;';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.id = `rr-plugin-choice-title-${++pickerSequence}`;
        title.textContent = text('Select', tt);
        modal.setAttribute('aria-labelledby', title.id);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'rr-modal-close';
        close.textContent = 'x';
        close.setAttribute('aria-label', text('Close', tt));
        header.appendChild(title);
        header.appendChild(close);

        const search = document.createElement('input');
        search.type = 'text';
        search.placeholder = text('Search...', tt);
        search.setAttribute('aria-label', text('Search...', tt));
        search.className = 'rr-plugin-choice-search';
        search.style.cssText = 'margin:8px;padding:8px 10px;background:var(--color-bg-deep);color:var(--color-text-strong);border:1px solid var(--color-accent-border-strong);border-radius:4px;outline:none;';

        const list = document.createElement('div');
        list.className = 'rr-plugin-choice-list';
        list.style.cssText = 'flex:1;min-height:0;overflow-y:auto;padding:4px 8px;background:var(--color-bg-surface);border-top:1px solid var(--color-border);';
        let selected = String(current ?? '');

        const dismiss = () => {
            overlay.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
        };
        const finish = value => {
            onPick(value);
            dismiss();
        };
        const render = () => {
            list.replaceChildren();
            const query = search.value;
            const matches = root.RRPickerIndex && root.RRPickerIndex.matches
                ? value => root.RRPickerIndex.matches(value, query)
                : value => String(value).toLocaleLowerCase().includes(String(query).toLocaleLowerCase());
            items.forEach(item => {
                if (!matches(`${item.label} ${item.value}`)) return;
                const row = document.createElement('button');
                row.type = 'button';
                row.className = 'rr-plugin-choice-item';
                const label = item.label || text('(None)', tt);
                if (item.iconIndex > 0 && item.context?.iconSetPath) {
                    row.appendChild(createIconCrop(item.iconIndex, item.context));
                    const caption = document.createElement('span');
                    caption.textContent = label;
                    row.appendChild(caption);
                } else {
                    row.textContent = label;
                }
                row.dataset.value = item.value;
                row.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;padding:8px 10px;text-align:left;background:var(--color-bg-list-item);color:var(--color-text);border:0;border-bottom:1px solid var(--color-border-subtle);cursor:pointer;font-size:12px;';
                row.setAttribute('aria-label', label);
                if (item.value === selected) {
                    row.style.background = 'var(--color-selection-deep)';
                    row.style.color = 'var(--color-text-strong)';
                }
                row.addEventListener('click', () => {
                    selected = item.value;
                    finish(item.value);
                });
                list.appendChild(row);
            });
        };
        search.addEventListener('input', render);
        close.addEventListener('click', dismiss);
        overlay.addEventListener('mousedown', event => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });
        overlay.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                dismiss();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = Array.from(modal.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(element => element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });

        modal.appendChild(header);
        modal.appendChild(search);
        modal.appendChild(list);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        render();
        search.focus();
        return overlay;
    };

    const createSelect = ({ schema, value, onChange, inputStyle }) => {
        const select = root.document.createElement('select');
        select.className = 'rr-plugin-choice-select';
        select.style.cssText = inputCss(inputStyle);
        const items = choiceItems(schema);
        const current = String(value ?? '');
        if (!items.some(item => item.value === current)) {
            const option = root.document.createElement('option');
            option.value = current;
            option.textContent = current;
            option.selected = true;
            option.disabled = true;
            select.appendChild(option);
        }
        items.forEach(item => {
            const option = root.document.createElement('option');
            option.value = item.value;
            option.textContent = item.label;
            option.selected = item.value === current;
            select.appendChild(option);
        });
        select.addEventListener('change', event => onChange(event.target.value));
        return select;
    };

    const createCombo = ({ schema, value, onChange, inputStyle, context = {} }) => {
        const row = root.document.createElement('div');
        row.className = 'rr-plugin-choice-combo';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;min-width:0;width:100%;';
        const input = root.document.createElement('input');
        input.type = 'text';
        input.value = String(value ?? '');
        input.style.cssText = `${inputCss(inputStyle)}flex:1;min-width:0;`;
        input.addEventListener('input', event => onChange(event.target.value));
        const browse = root.document.createElement('button');
        browse.type = 'button';
        browse.className = 'rr-btn-browse';
        browse.textContent = text('Browse...', context.tt);
        browse.addEventListener('click', () => showChoicePicker({
            items: choiceItems(schema),
            current: input.value,
            tt: context.tt,
            zIndex: context.zIndex,
            onPick: next => {
                input.value = next;
                onChange(next);
                const placeholder = input.value.match(/\bx\b/i);
                if (placeholder && typeof input.setSelectionRange === 'function') {
                    input.focus();
                    input.setSelectionRange(placeholder.index, placeholder.index + placeholder[0].length);
                }
            }
        }));
        row.appendChild(input);
        row.appendChild(browse);
        return row;
    };

    const createRef = ({ schema, value, onChange, inputStyle, context = {} }) => {
        const refs = root.RRPluginDataRefs;
        const row = root.document.createElement('div');
        row.className = 'rr-plugin-data-ref';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;min-width:0;width:100%;';

        const input = root.document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.value = String(value ?? '');
        input.className = 'rr-plugin-data-ref-id';
        input.setAttribute('aria-label', text('Value', context.tt));
        input.style.cssText = `${inputCss(inputStyle)}flex:0 0 74px;width:74px;min-width:0;`;

        const resolved = root.document.createElement('div');
        resolved.className = 'rr-plugin-data-ref-label';
        resolved.style.cssText = 'flex:1;min-width:0;display:flex;align-items:center;gap:5px;color:var(--color-text-muted);font-size:11px;overflow:hidden;';
        const labels = {
            none: text('(None)', context.tt),
            unnamed: text('Unnamed', context.tt),
            missing: text('(missing)', context.tt)
        };

        const refresh = () => {
            const label = refs.describe(schema.type, context.database, input.value, {
                ...labels,
                ...refOptions(context)
            });
            const entry = refs.resolve(schema.type, context.database, input.value, refOptions(context));
            resolved.replaceChildren();
            if (entry?.iconIndex > 0 && context.iconSetPath) {
                resolved.appendChild(createIconCrop(entry.iconIndex, context));
            }
            const caption = root.document.createElement('span');
            caption.textContent = label;
            caption.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            resolved.appendChild(caption);
            resolved.title = label;
        };

        input.addEventListener('input', event => {
            onChange(event.target.value);
            refresh();
        });

        const browse = root.document.createElement('button');
        browse.type = 'button';
        browse.className = 'rr-btn-browse rr-plugin-data-ref-browse';
        browse.textContent = text('Browse...', context.tt);
        browse.addEventListener('click', () => {
            if (refs.baseType(schema.type) === 'animation' && context.database && context.projectPath
                    && root.AnimationPickerModal?.open) {
                root.AnimationPickerModal.open({
                    databaseManager: context.database,
                    projectPath: context.projectPath,
                    currentId: Number(input.value) || 0,
                    allowNormalAttack: false,
                    // A plugin may declare several animation parameters, and
                    // every Browse button opened the same anonymous dialog.
                    // Its own @text is what tells them apart.
                    title: schema && schema.text
                        ? `${text('Select Animation', context.tt)} — ${schema.text}`
                        : '',
                    onPick: next => {
                        input.value = String(next);
                        onChange(input.value);
                        refresh();
                    }
                });
                return;
            }
            const items = [{ label: labels.none, value: '0' }];
            for (const entry of refs.entriesFor(schema.type, context.database, refOptions(context))) {
                items.push({
                    label: refs.labelForEntry(entry, labels.unnamed),
                    value: String(entry.id),
                    iconIndex: entry.iconIndex,
                    context
                });
            }
            showChoicePicker({
                items,
                current: input.value,
                tt: context.tt,
                zIndex: context.zIndex,
                onPick: next => {
                    input.value = next;
                    onChange(next);
                    refresh();
                }
            });
        });

        refresh();
        row.appendChild(input);
        row.appendChild(resolved);
        row.appendChild(browse);
        return row;
    };

    const createColor = ({ value, onChange, inputStyle, context = {} }) => {
        const row = root.document.createElement('div');
        row.className = 'rr-plugin-color';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;min-width:0;width:100%;';
        const raw = root.document.createElement('input');
        raw.type = 'text';
        raw.value = String(value ?? '');
        raw.className = 'rr-plugin-color-raw';
        raw.style.cssText = `${inputCss(inputStyle)}flex:1;min-width:0;`;
        const swatch = root.document.createElement('input');
        swatch.type = 'color';
        swatch.className = 'rr-plugin-color-swatch';
        swatch.setAttribute('aria-label', text('Color', context.tt));
        swatch.style.cssText = 'width:38px;height:30px;padding:2px;flex:0 0 38px;';
        const isNativeColor = candidate => /^#[0-9a-f]{6}$/i.test(candidate);
        const refresh = () => {
            const valid = isNativeColor(raw.value);
            swatch.disabled = !valid;
            if (valid) swatch.value = raw.value;
        };
        raw.addEventListener('input', event => {
            onChange(event.target.value);
            refresh();
        });
        swatch.addEventListener('input', event => {
            if (!isNativeColor(raw.value)) return;
            raw.value = event.target.value;
            onChange(raw.value);
        });
        refresh();
        row.appendChild(raw);
        row.appendChild(swatch);
        return row;
    };

    const showImagePicker = ({ schema, current, context, onPick }) => {
        const document = root.document;
        const previousFocus = document.activeElement;
        const records = imageRecords(schema, context);
        const byName = new Map(records.map(record => [record.name, record]));
        let selected = String(current ?? '');

        const overlay = document.createElement('div');
        overlay.className = 'rr-plugin-image-overlay plugin-manager-child-modal';
        overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:${context.zIndex || 10010};display:flex;align-items:center;justify-content:center;`;
        const modal = document.createElement('div');
        modal.className = 'rr-modal rr-plugin-image-picker';
        modal.style.cssText = 'width:min(900px,calc(100vw - 24px));height:min(680px,85vh);display:flex;flex-direction:column;';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.id = `rr-plugin-image-title-${++pickerSequence}`;
        title.textContent = text('Select File', context.tt);
        modal.setAttribute('aria-labelledby', title.id);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'rr-modal-close';
        close.textContent = 'x';
        close.setAttribute('aria-label', text('Close', context.tt));
        header.appendChild(title);
        header.appendChild(close);

        const body = document.createElement('div');
        body.className = 'rr-plugin-image-picker-body';
        body.style.cssText = 'display:grid;grid-template-columns:minmax(260px,0.9fr) minmax(280px,1.1fr);flex:1;min-height:0;overflow:hidden;';
        const browserHost = document.createElement('div');
        browserHost.style.cssText = 'min-width:0;min-height:0;border-right:1px solid var(--color-border);';
        const preview = document.createElement('div');
        preview.className = 'rr-plugin-image-preview';
        preview.style.cssText = 'min-width:0;min-height:0;padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:auto;background:var(--color-bg-deep);';

        let previewGeneration = 0;
        let currentPreviewImage = null;
        const renderPreview = name => {
            const generation = ++previewGeneration;
            if (currentPreviewImage) currentPreviewImage.src = '';
            currentPreviewImage = null;
            selected = String(name ?? '');
            preview.replaceChildren();
            const caption = document.createElement('div');
            caption.style.cssText = 'color:var(--color-text-muted);font-size:12px;text-align:center;word-break:break-word;';
            if (!selected) {
                caption.textContent = text('(None)', context.tt);
                preview.appendChild(caption);
                return;
            }
            const record = byName.get(selected);
            if (!record) {
                caption.textContent = text('(Image not found)', context.tt);
                preview.appendChild(caption);
                return;
            }
            const image = document.createElement('img');
            currentPreviewImage = image;
            image.alt = '';
            image.style.cssText = 'display:block;max-width:100%;max-height:calc(100% - 32px);object-fit:contain;image-rendering:auto;';
            image.addEventListener('load', () => {
                if (generation !== previewGeneration) return;
                const width = image.naturalWidth || image.width || 0;
                const height = image.naturalHeight || image.height || 0;
                caption.textContent = `${selected} - ${width} x ${height}`;
            });
            image.addEventListener('error', () => {
                if (generation !== previewGeneration) return;
                image.remove();
                caption.textContent = text('(Image not found)', context.tt);
            });
            caption.textContent = selected;
            preview.appendChild(image);
            preview.appendChild(caption);
            const asyncResolver = root.RPGReactorHost
                && root.RREncryptedAssets?.resolveAssetUrlAsync;
            if (asyncResolver) {
                asyncResolver(record.absolutePath).then(url => {
                    if (generation === previewGeneration) image.src = url;
                });
            } else {
                image.src = root.RRAssetFiles.toUrl(record.absolutePath);
            }
        };

        const dismiss = () => {
            previewGeneration += 1;
            if (currentPreviewImage) currentPreviewImage.src = '';
            currentPreviewImage = null;
            document.removeEventListener('keydown', onDocumentKeyDown);
            overlay.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
        };
        const finish = () => {
            onPick(selected);
            dismiss();
        };
        const browser = root.RRPickerIndex.createBrowser({
            files: records.map(record => record.name),
            selectedName: selected,
            openSelectedFolders: byName.has(selected),
            folders: true,
            searchPlaceholder: text('Search files...', context.tt),
            emptyText: text('No files found in:', context.tt) + ' ' + schema.dir,
            onSelect: renderPreview,
            leadingItem: {
                label: text('(None)', context.tt),
                onClick: () => renderPreview(''),
                onDoubleClick: () => {
                    renderPreview('');
                    finish();
                }
            }
        });
        browserHost.appendChild(browser.element);
        body.appendChild(browserHost);
        body.appendChild(preview);

        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'rr-btn-secondary';
        cancel.textContent = text('Cancel', context.tt);
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'rr-button-primary';
        ok.textContent = text('OK', context.tt);
        cancel.addEventListener('click', dismiss);
        ok.addEventListener('click', finish);
        close.addEventListener('click', dismiss);
        browser.list.addEventListener('dblclick', event => {
            const item = event.target.closest?.('.rr-picker-file-item');
            if (item?.dataset.fileName) {
                renderPreview(item.dataset.fileName);
                finish();
            }
        });
        overlay.addEventListener('mousedown', event => {
            // A click on the backdrop no longer closes the dialog: an accidental
            // click beside it must never cost in-progress work. Close deliberately.
        });
        const onDocumentKeyDown = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                dismiss();
            } else if (event.key === 'Tab') {
                const focusable = Array.from(modal.querySelectorAll(
                    'button:not([disabled]),input:not([disabled]),[tabindex="0"]'));
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', onDocumentKeyDown);
        footer.appendChild(cancel);
        footer.appendChild(ok);
        modal.appendChild(header);
        modal.appendChild(body);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        renderPreview(selected);
        browser.focusSelected();
        return overlay;
    };

    const createImageFile = ({ schema, value, onChange, inputStyle, context = {} }) => {
        const row = root.document.createElement('div');
        row.className = 'rr-plugin-image-file';
        row.style.cssText = 'display:flex;gap:6px;align-items:center;min-width:0;width:100%;';
        const input = root.document.createElement('input');
        input.type = 'text';
        input.value = String(value ?? '');
        input.style.cssText = `${inputCss(inputStyle)}flex:1;min-width:0;`;
        input.addEventListener('input', event => onChange(event.target.value));
        const browse = root.document.createElement('button');
        browse.type = 'button';
        browse.className = 'rr-btn-browse rr-plugin-image-browse';
        browse.textContent = text('Browse...', context.tt);
        browse.addEventListener('click', () => showImagePicker({
            schema,
            current: input.value,
            context,
            onPick: next => {
                input.value = next;
                onChange(next);
            }
        }));
        row.appendChild(input);
        row.appendChild(browse);
        return row;
    };

    const createScalar = options => {
        const type = String(options.schema.type || '').replace(/\[\]$/, '');
        if (root.RRPluginDataRefs?.isRefType(type)) return createRef(options);
        if (type === 'color') return createColor(options);
        if (type === 'file' && isImageDir(options.schema.dir)) return createImageFile(options);
        return type === 'select' ? createSelect(options) : createCombo(options);
    };

    const createArray = options => {
        const { schema, value, onChange, context = {} } = options;
        const returnsArray = Array.isArray(value);
        let entries;
        if (returnsArray) {
            entries = value.slice();
        } else {
            try {
                entries = JSON.parse(String(value || '[]'));
            } catch (error) {
                entries = null;
            }
        }
        if (!Array.isArray(entries)) {
            const input = root.document.createElement('input');
            input.type = 'text';
            input.value = String(value ?? '');
            input.style.cssText = inputCss(options.inputStyle);
            input.addEventListener('input', event => onChange(event.target.value));
            return input;
        }

        const container = root.document.createElement('div');
        container.className = 'rr-plugin-choice-array';
        container.style.cssText = 'display:flex;flex-direction:column;gap:5px;width:100%;';
        const scalarType = String(schema.type).replace(/\[\]$/, '');
        const emit = () => onChange(returnsArray ? entries.slice() : JSON.stringify(entries));
        const render = () => {
            container.replaceChildren();
            entries.forEach((entry, index) => {
                const row = root.document.createElement('div');
                row.className = 'rr-plugin-choice-array-row';
                row.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:4px;align-items:center;';
                row.appendChild(createScalar({
                    schema: { ...schema, type: scalarType },
                    value: entry,
                    context,
                    onChange: next => {
                        entries[index] = next;
                        emit();
                    }
                }));
                const action = (label, disabled, handler) => {
                    const button = root.document.createElement('button');
                    button.type = 'button';
                    button.className = 'rr-btn-chip';
                    button.textContent = text(label, context.tt);
                    button.disabled = disabled;
                    button.addEventListener('click', handler);
                    return button;
                };
                row.appendChild(action('Move Up', index === 0, () => {
                    [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]];
                    emit();
                    render();
                }));
                row.appendChild(action('Move Down', index === entries.length - 1, () => {
                    [entries[index], entries[index + 1]] = [entries[index + 1], entries[index]];
                    emit();
                    render();
                }));
                row.appendChild(action('Remove', false, () => {
                    entries.splice(index, 1);
                    emit();
                    render();
                }));
                container.appendChild(row);
            });
            const add = root.document.createElement('button');
            add.type = 'button';
            add.className = 'rr-btn-chip rr-plugin-choice-add';
            add.textContent = text('Add', context.tt);
            add.addEventListener('click', () => {
                const isRef = root.RRPluginDataRefs?.isRefType(scalarType);
                entries.push(isRef ? '0' : '');
                emit();
                render();
            });
            container.appendChild(add);
        };
        render();
        return container;
    };

    const create = options => {
        const type = String(options?.schema?.type || '');
        const context = buildContext(options?.context);
        const isRef = Boolean(root.RRPluginDataRefs?.isRefType(type));
        const isColor = type === 'color' || type === 'color[]';
        const isImage = (type === 'file' || type === 'file[]') && canBrowseImages(options.schema, context);
        if (isRef && (!context.database || !root.RRPluginDataRefs.hasEntries(type, context.database))) return null;
        if (isRef || isColor || isImage) {
            const normalized = { ...options, context, onChange: options.onChange || (() => {}) };
            return type.endsWith('[]') ? createArray(normalized) : createScalar(normalized);
        }
        if (!['combo', 'select', 'combo[]', 'select[]'].includes(type)) return null;
        if (!Array.isArray(options.schema.options) || options.schema.options.length === 0) return null;
        const normalized = { ...options, context, onChange: options.onChange || (() => {}) };
        return type.endsWith('[]') ? createArray(normalized) : createScalar(normalized);
    };

    const api = {
        buildContext,
        canBrowseImages,
        choiceItems,
        create,
        imageRecords,
        isImageDir,
        showChoicePicker,
        showImagePicker
    };
    root.RRPluginParamWidgets = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
