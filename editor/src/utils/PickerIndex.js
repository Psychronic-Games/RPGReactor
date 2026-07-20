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

    const sectionOffset = (container, target) => {
        let top = 0;
        for (const child of Array.from(container?.children || [])) {
            if (child === target) return top;
            top += child.offsetHeight || 0;
        }
        return 0;
    };

    const createBrowser = options => {
        const files = options.files || [];
        let selectedName = options.selectedName || '';

        const element = document.createElement('div');
        element.className = 'rr-picker-browser';
        element.style.cssText = 'height:100%;min-height:0;display:flex;flex-direction:column;background:var(--color-bg-list-item);';

        const searchWrap = document.createElement('div');
        searchWrap.className = 'rr-picker-search';
        searchWrap.style.cssText = 'position:relative;margin:8px;background:var(--color-bg-deep);border:1px solid var(--color-accent-border-strong);border-radius:4px;box-shadow:0 0 0 1px var(--color-accent-tint-10),inset 0 1px 3px rgba(0,0,0,0.35);transition:border-color 0.15s,box-shadow 0.15s;';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = options.searchPlaceholder || 'Search files...';
        searchInput.style.cssText = 'width:100%;padding:8px 34px 8px 10px;background:transparent;color:var(--color-text-strong);border:0;outline:0;border-radius:3px;font-size:12px;box-sizing:border-box;';

        const clearSearch = document.createElement('button');
        clearSearch.type = 'button';
        clearSearch.className = 'rr-picker-search-clear';
        clearSearch.textContent = '×';
        clearSearch.title = 'Clear search';
        clearSearch.setAttribute('aria-label', 'Clear search');
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

        const setSelected = name => {
            selectedName = name || '';
            list.querySelectorAll('.rr-picker-file-item').forEach(item => {
                const selected = item.dataset.fileName === selectedName;
                item.classList.toggle('selected', selected);
                item.setAttribute('aria-selected', String(selected));
                item.style.backgroundColor = selected ? 'var(--color-selection-deep)' : '';
                item.style.color = selected ? 'var(--color-accent-bright)' : 'var(--color-text)';
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

        const render = () => {
            rail.innerHTML = '';
            list.innerHTML = '';
            const sections = group(files, searchInput.value);

            if (!sections.length && options.emptyText) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:16px;color:var(--color-text-muted);font-size:12px;text-align:center;';
                empty.textContent = options.emptyText;
                list.appendChild(empty);
                return;
            }

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
                    const item = document.createElement('div');
                    item.className = `rr-picker-file-item${options.itemClass ? ` ${options.itemClass}` : ''}`;
                    item.dataset.fileName = name;
                    item.textContent = name;
                    item.tabIndex = 0;
                    item.setAttribute('role', 'option');
                    item.style.cssText = 'padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--color-bg-menubar);font-size:12px;color:var(--color-text);';
                    item.addEventListener('mouseenter', () => {
                        if (item.dataset.fileName !== selectedName) item.style.backgroundColor = 'var(--color-bg-button)';
                    });
                    item.addEventListener('mouseleave', () => {
                        if (item.dataset.fileName !== selectedName) item.style.backgroundColor = '';
                    });
                    item.addEventListener('click', () => {
                        setSelected(name);
                        if (options.onSelect) options.onSelect(name, item);
                    });
                    item.addEventListener('keydown', event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        item.click();
                    });
                    list.appendChild(item);
                });
            });

            setSelected(selectedName);
            if (sections[0]) setActiveSection(sections[0].key);
        };

        list.addEventListener('scroll', () => {
            let active = null;
            const listTop = list.getBoundingClientRect().top;
            list.querySelectorAll('.rr-picker-section').forEach(section => {
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
            }
        };
    };

    const api = { compareNames, compareSectionKeys, createBrowser, group, matches, searchKey, sectionKey, sectionOffset };
    root.RRPickerIndex = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
