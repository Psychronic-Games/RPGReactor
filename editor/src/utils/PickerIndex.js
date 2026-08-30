/**
 * Unicode-aware search, sections, and file-list UI shared by asset pickers.
 */
(function(root) {
    const sectionKey = name => {
        const normalized = String(name || '').normalize('NFC');
        if (!normalized) return '#';

        let firstGrapheme = Array.from(normalized)[0];
        if (typeof Intl !== 'undefined' && Intl.Segmenter) {
            const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(normalized);
            firstGrapheme = segments[Symbol.iterator]().next().value?.segment || firstGrapheme;
        }

        return firstGrapheme && /\p{L}/u.test(firstGrapheme)
            ? firstGrapheme.toLocaleUpperCase().normalize('NFC')
            : '#';
    };

    const compareSectionKeys = (a, b) => {
        if (a === '#') return b === '#' ? 0 : -1;
        if (b === '#') return 1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' })
            || a.localeCompare(b, undefined, { sensitivity: 'variant' });
    };

    const compareNames = (a, b) => {
        const sectionOrder = compareSectionKeys(sectionKey(a), sectionKey(b));
        return sectionOrder || a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
            || a.localeCompare(b, undefined, { sensitivity: 'variant', numeric: true });
    };

    const searchKey = value => String(value || '')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toUpperCase();

    const matches = (name, query) => !query || searchKey(name).includes(searchKey(query));

    const group = (names, query = '') => {
        const sections = new Map();
        [...new Set(names || [])]
            .filter(name => matches(name, query))
            .sort(compareNames)
            .forEach(name => {
                const key = sectionKey(name);
                if (!sections.has(key)) sections.set(key, []);
                sections.get(key).push(name);
            });
        return Array.from(sections, ([key, values]) => ({ key, names: values }));
    };

    const fileName = name => String(name || '').split('/').pop() || '';

    const buildFolderTree = names => {
        const root = { files: [], folders: [], _folders: new Map() };
        for (const fullName of new Set((names || []).map(name => String(name)))) {
            const parts = fullName.split('/');
            if (parts.length < 2) {
                root.files.push(fullName);
                continue;
            }

            let node = root;
            let folderPath = '';
            for (const name of parts.slice(0, -1)) {
                folderPath = folderPath ? `${folderPath}/${name}` : name;
                if (!node._folders.has(name)) {
                    node._folders.set(name, {
                        name,
                        path: folderPath,
                        files: [],
                        folders: [],
                        total: 0,
                        _folders: new Map()
                    });
                }
                node = node._folders.get(name);
                node.total += 1;
            }
            node.files.push(fullName);
        }

        const finish = node => {
            node.files.sort((a, b) => compareNames(fileName(a), fileName(b)));
            node.folders = Array.from(node._folders.values())
                .sort((a, b) => compareNames(a.name, b.name));
            for (const folder of node.folders) finish(folder);
            delete node._folders;
            return node;
        };
        return finish(root);
    };

    const foldersLeadingTo = name => {
        const parts = String(name || '').split('/');
        parts.pop();
        const folders = [];
        let folderPath = '';
        for (const part of parts) {
            folderPath = folderPath ? `${folderPath}/${part}` : part;
            folders.push(folderPath);
        }
        return folders;
    };

    const sectionOffset = (container, target) => {
        let top = 0;
        for (const child of Array.from(container?.children || [])) {
            if (child === target) return top;
            top += child.offsetHeight || 0;
        }
        return 0;
    };

    const createBrowser = options => {
        const tt = text => root.I18n ? root.I18n.tText(text) : text;
        const files = options.files || [];
        let selectedName = options.selectedName || '';
        const openFolders = new Set(options.openSelectedFolders === false
            ? [] : foldersLeadingTo(selectedName));

        const element = document.createElement('div');
        element.className = 'rr-picker-browser';
        element.style.cssText = 'height:100%;min-height:0;display:flex;flex-direction:column;background:var(--color-bg-list-item);';

        const searchWrap = document.createElement('div');
        searchWrap.className = 'rr-picker-search';
        searchWrap.style.cssText = 'position:relative;margin:8px;background:var(--color-bg-deep);border:1px solid var(--color-accent-border-strong);border-radius:4px;box-shadow:0 0 0 1px var(--color-accent-tint-10),inset 0 1px 3px rgba(0,0,0,0.35);transition:border-color 0.15s,box-shadow 0.15s;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = options.searchPlaceholder || tt('Search files...');
        searchInput.style.cssText = 'width:100%;padding:8px 34px 8px 10px;background:transparent;color:var(--color-text-strong);border:0;outline:0;border-radius:3px;font-size:12px;box-sizing:border-box;';

        const clearSearch = document.createElement('button');
        clearSearch.type = 'button';
        clearSearch.className = 'rr-picker-search-clear';
        clearSearch.textContent = '×';
        clearSearch.title = tt('Clear search');
        clearSearch.setAttribute('aria-label', tt('Clear search'));
        clearSearch.style.cssText = 'display:none;position:absolute;right:5px;top:50%;transform:translateY(-50%);width:22px;height:22px;padding:0;background:var(--color-accent-tint-15);color:var(--color-accent-bright);border:1px solid var(--color-accent-border-strong);border-radius:3px;cursor:pointer;font-size:17px;font-weight:bold;line-height:18px;';
        searchWrap.appendChild(searchInput);
        searchWrap.appendChild(clearSearch);

        const body = document.createElement('div');
        body.style.cssText = 'flex:1;min-height:0;display:flex;overflow:hidden;border-top:1px solid var(--color-border);';

        const rail = document.createElement('div');
        rail.className = 'rr-picker-index-rail';
        rail.style.cssText = 'width:42px;flex:0 0 42px;padding:3px 2px;box-sizing:border-box;overflow-y:auto;background:var(--color-bg-list-item);border-right:1px solid var(--color-border);display:flex;flex-direction:column;gap:1px;';

        const list = document.createElement('div');
        list.className = 'rr-picker-index-list';
        list.setAttribute('role', 'listbox');
        list.style.cssText = 'flex:1;min-width:0;overflow-y:auto;background:var(--color-bg-surface);';

        const setSelected = (name, revealAncestors = true) => {
            selectedName = name || '';
            if (revealAncestors) {
                for (const folder of foldersLeadingTo(selectedName)) openFolders.add(folder);
            }
            list.querySelectorAll('.rr-picker-file-item').forEach(item => {
                const selected = item.dataset.fileName === selectedName;
                item.classList.toggle('selected', selected);
                item.setAttribute('aria-selected', String(selected));
                item.style.backgroundColor = selected ? 'var(--color-selection-deep)' : '';
                item.style.color = selected ? 'var(--color-text-strong)' : 'var(--color-text)';
            });
        };

        const setActiveSection = key => {
            rail.querySelectorAll('button').forEach(button => {
                const active = button.dataset.letter === key;
                button.classList.toggle('active', active);
                button.style.backgroundColor = active ? 'var(--color-accent)' : 'var(--color-bg-input-alt)';
                button.style.color = active ? 'var(--color-bg-deep)' : 'var(--color-text-strong)';
            });
        };

        const makeItem = (name, displayText, depth = 0) => {
            const item = document.createElement('div');
            item.className = `rr-picker-file-item${options.itemClass ? ` ${options.itemClass}` : ''}`;
            item.dataset.fileName = name;
            item.textContent = displayText;
            item.tabIndex = 0;
            item.setAttribute('role', 'option');
            item.style.cssText = `padding:7px 10px 7px ${10 + depth * 14}px;cursor:pointer;`
                + 'border-bottom:1px solid var(--color-bg-menubar);font-size:12px;color:var(--color-text);';
            item.addEventListener('mouseenter', () => {
                if (item.dataset.fileName !== selectedName) item.style.backgroundColor = 'var(--color-bg-button)';
            });
            item.addEventListener('mouseleave', () => {
                if (item.dataset.fileName !== selectedName) item.style.backgroundColor = '';
            });
            item.addEventListener('click', event => {
                setSelected(name);
                if (options.onSelect) options.onSelect(name, item, event);
            });
            item.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                item.click();
            });
            return item;
        };

        const render = () => {
            rail.innerHTML = '';
            list.innerHTML = '';

            const query = searchInput.value;
            const visibleFiles = files.filter(name => matches(name, query));
            const tree = options.folders
                ? buildFolderTree(visibleFiles)
                : { files: visibleFiles, folders: [] };
            const sections = group(tree.files);

            // An action row pinned to the top of the list — "(None)" and
            // friends — rendered ahead of the files, search or no search.
            if (options.leadingItem) {
                const lead = document.createElement('div');
                lead.className = 'rr-picker-file-item rr-picker-leading';
                lead.dataset.fileName = '';
                lead.textContent = options.leadingItem.label;
                lead.tabIndex = 0;
                lead.setAttribute('role', 'option');
                lead.style.cssText = 'padding:7px 10px;cursor:pointer;font-size:12px;'
                    + 'color:var(--color-text-muted);font-style:italic;'
                    + 'border-bottom:1px solid var(--color-border);';
                lead.addEventListener('mouseenter', () => {
                    if (selectedName !== '') lead.style.backgroundColor = 'var(--color-bg-button)';
                });
                lead.addEventListener('mouseleave', () => {
                    if (selectedName !== '') lead.style.backgroundColor = '';
                });
                lead.addEventListener('click', () => {
                    setSelected('');
                    options.leadingItem.onClick();
                });
                if (options.leadingItem.onDoubleClick) {
                    lead.addEventListener('dblclick', () => options.leadingItem.onDoubleClick());
                }
                lead.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    lead.click();
                });
                list.appendChild(lead);
            }

            if (!sections.length && !tree.folders.length && options.emptyText) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:16px;color:var(--color-text-muted);font-size:12px;text-align:center;';
                empty.textContent = options.emptyText;
                list.appendChild(empty);
                setSelected(selectedName, false);
                return;
            }

            const renderFolder = (folder, depth) => {
                const open = !!query || openFolders.has(folder.path);
                const header = document.createElement('div');
                header.className = 'rr-picker-section folder-section';
                header.dataset.folder = folder.path;
                header.tabIndex = 0;
                header.setAttribute('role', 'button');
                header.setAttribute('aria-expanded', String(open));
                header.setAttribute('data-rr-i18n-skip', '1');
                header.textContent = `${open ? '▾' : '▸'} ${folder.name} (${folder.total})`;
                header.style.cssText = `padding:6px 10px 6px ${10 + depth * 14}px;background:var(--color-bg-panel);`
                    + 'color:var(--color-accent-hover);border-bottom:1px solid var(--color-border);'
                    + 'font-size:11px;font-weight:bold;cursor:pointer;';
                const setOpen = nextOpen => {
                    if (nextOpen) openFolders.add(folder.path);
                    else openFolders.delete(folder.path);
                    render();
                    Array.from(list.querySelectorAll('.folder-section'))
                        .find(candidate => candidate.dataset.folder === folder.path)
                        ?.focus({ preventScroll: true });
                };
                header.addEventListener('click', () => setOpen(!openFolders.has(folder.path)));
                header.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setOpen(!openFolders.has(folder.path));
                    } else if (event.key === 'ArrowRight' && !open) {
                        event.preventDefault();
                        setOpen(true);
                    } else if (event.key === 'ArrowLeft' && open) {
                        event.preventDefault();
                        setOpen(false);
                    }
                });
                list.appendChild(header);
                if (open) {
                    for (const child of folder.folders) renderFolder(child, depth + 1);
                    for (const name of folder.files) {
                        list.appendChild(makeItem(name, fileName(name), depth + 1));
                    }
                }
            };
            for (const folder of tree.folders) renderFolder(folder, 0);

            sections.forEach(section => {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.letter = section.key;
                button.textContent = section.key;
                button.style.cssText = 'height:20px;min-height:20px;padding:1px 3px;background:var(--color-bg-input-alt);color:var(--color-text-strong);border:0;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;line-height:18px;';
                button.addEventListener('click', () => {
                    const header = Array.from(list.querySelectorAll('.rr-picker-section'))
                        .find(item => item.dataset.letter === section.key);
                    if (header) {
                        // Sticky headers report their painted position rather
                        // than a reliable document offset in Chromium. Sum the
                        // normal-flow rows so jumps work in both directions.
                        list.scrollTop = sectionOffset(list, header);
                    }
                    setActiveSection(section.key);
                });
                rail.appendChild(button);

                const header = document.createElement('div');
                header.className = 'rr-picker-section letter-section';
                header.dataset.letter = section.key;
                header.textContent = section.key;
                header.style.cssText = 'position:sticky;top:0;padding:5px 10px;background:var(--color-bg-panel);color:var(--color-accent-hover);border-bottom:1px solid var(--color-border);font-size:11px;font-weight:bold;z-index:1;';
                list.appendChild(header);

                section.names.forEach(name => {
                    list.appendChild(makeItem(name, name));
                });
            });

            setSelected(selectedName, false);
            if (sections[0]) setActiveSection(sections[0].key);
            if (options.onRender) options.onRender(list);
        };

        /**
         * Arrow keys walk the files one at a time instead of scrolling the
         * pane: the native behaviour scrolled the selection out from under
         * the reader. The list only scrolls when the selection reaches its
         * edge, and the sticky section header is compensated for so an
         * upward step is never hidden beneath it.
         */
        const moveSelection = step => {
            const items = Array.from(list.querySelectorAll('.rr-picker-file-item'));
            if (!items.length) return;
            const at = items.findIndex(item => item.dataset.fileName === selectedName);
            const next = at < 0
                ? (step > 0 ? 0 : items.length - 1)
                : Math.max(0, Math.min(items.length - 1, at + step));
            const item = items[next];
            if (!item) return;
            const changed = item.dataset.fileName !== selectedName;
            if (changed) setSelected(item.dataset.fileName);
            item.scrollIntoView({ block: 'nearest' });
            const header = list.querySelector('.rr-picker-section');
            if (header) {
                const covered = (header.offsetHeight || 0)
                    - (item.getBoundingClientRect().top - list.getBoundingClientRect().top);
                if (covered > 0) list.scrollTop -= covered;
            }
            if (document.activeElement !== searchInput) item.focus({ preventScroll: true });
            if (changed && options.onSelect) options.onSelect(item.dataset.fileName, item);
        };

        element.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                moveSelection(event.key === 'ArrowDown' ? 1 : -1);
            } else if ((event.key === 'Home' || event.key === 'End')
                && document.activeElement !== searchInput) {
                event.preventDefault();
                moveSelection(event.key === 'Home' ? -Infinity : Infinity);
            }
        });

        list.addEventListener('scroll', () => {
            let active = null;
            const listTop = list.getBoundingClientRect().top;
            list.querySelectorAll('.letter-section').forEach(section => {
                if (section.getBoundingClientRect().top - listTop <= 8) active = section.dataset.letter;
            });
            if (active) setActiveSection(active);
        });
        searchInput.addEventListener('focus', () => {
            searchWrap.style.borderColor = 'var(--color-accent-bright)';
            searchWrap.style.boxShadow = '0 0 0 2px var(--color-accent-shadow), inset 0 1px 3px rgba(0,0,0,0.35)';
        });
        searchInput.addEventListener('blur', () => {
            searchWrap.style.borderColor = 'var(--color-accent-border-strong)';
            searchWrap.style.boxShadow = '0 0 0 1px var(--color-accent-tint-10), inset 0 1px 3px rgba(0,0,0,0.35)';
        });
        searchInput.addEventListener('input', () => {
            clearSearch.style.display = searchInput.value ? 'block' : 'none';
            render();
        });
        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            clearSearch.style.display = 'none';
            render();
            searchInput.focus();
        });
        clearSearch.addEventListener('mouseenter', () => {
            clearSearch.style.background = 'var(--color-accent-tint-25)';
        });
        clearSearch.addEventListener('mouseleave', () => {
            clearSearch.style.background = 'var(--color-accent-tint-15)';
        });

        body.appendChild(rail);
        body.appendChild(list);
        element.appendChild(searchWrap);
        element.appendChild(body);
        render();

        return {
            element,
            list,
            rail,
            searchInput,
            render,
            setSelected,
            scrollTo(name) {
                const item = Array.from(list.querySelectorAll('.rr-picker-file-item'))
                    .find(candidate => candidate.dataset.fileName === name);
                item?.scrollIntoView({ block: 'center' });
            },
            /** Put the keyboard on the list so the arrows work immediately. */
            focusSelected() {
                const items = Array.from(list.querySelectorAll('.rr-picker-file-item'));
                const item = items.find(candidate => candidate.dataset.fileName === selectedName)
                    || items[0];
                item?.focus({ preventScroll: true });
            }
        };
    };

    const api = {
        buildFolderTree,
        compareNames,
        compareSectionKeys,
        createBrowser,
        foldersLeadingTo,
        group,
        matches,
        searchKey,
        sectionKey,
        sectionOffset
    };
    root.RRPickerIndex = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
