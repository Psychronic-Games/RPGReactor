/**
 * Database3DBindings - actor and enemy 3D model bindings, stored in
 * `data/Database.r3d.json` beside the MZ database files rather than in
 * them, so an RPG Maker editor opening the project never sees a field
 * it doesn't know. Shape:
 *   { "version": 1,
 *     "actors":  { "<actorId>": spec },
 *     "enemies": { "<enemyId>": spec } }
 * with spec exactly what the map sidecar stores per event (name, file,
 * ext, size, scale, yaw/pitch/roll in degrees, faces).
 */
(function(root) {
    'use strict';

    function filePath(projectPath) {
        const path = require('path');
        return path.join(projectPath, 'data', 'Database.r3d.json');
    }

    function writeFile(fs, destination, data) {
        const atomic = typeof root.RRWriteFileAtomicSync === 'function'
            ? root.RRWriteFileAtomicSync
            : null;
        if (atomic && typeof fs.renameSync === 'function') atomic(fs, destination, data, 'utf8');
        else fs.writeFileSync(destination, data, 'utf8');
    }

    function read(projectPath) {
        const fs = require('fs');
        const destination = filePath(projectPath);
        try {
            const parsed = JSON.parse(fs.readFileSync(destination, 'utf8'));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('Database.r3d.json must contain a JSON object');
            }
            return parsed;
        } catch (error) {
            if (error?.code === 'ENOENT') return {};
            error.filePath = destination;
            throw error;
        }
    }

    /**
     * Actors bind per surface: { character, face, battler } slots. A flat
     * legacy actor entry (spec at the top level) reads as its character
     * slot and migrates to slots on the next write.
     */
    function slotsOf(entry) {
        if (!entry || typeof entry !== 'object') return {};
        if (entry.name) return { character: entry };
        return entry;
    }

    function get(projectPath, section, id, slot) {
        const data = read(projectPath);
        const entry = data[section] && data[section][String(id)];
        if (slot) {
            const spec = slotsOf(entry)[slot];
            return spec && spec.name ? spec : null;
        }
        return entry && entry.name ? entry : null;
    }

    function set(projectPath, section, id, spec, slot) {
        const fs = require('fs');
        const data = read(projectPath);
        if (slot) {
            const existing = slotsOf(data[section] && data[section][String(id)]);
            const entry = {};
            for (const key of Object.keys(existing)) {
                if (existing[key] && existing[key].name) entry[key] = existing[key];
            }
            if (spec && spec.name) entry[slot] = spec;
            else delete entry[slot];
            if (Object.keys(entry).length) {
                if (!data[section] || typeof data[section] !== 'object') data[section] = {};
                data[section][String(id)] = entry;
            } else if (data[section]) {
                delete data[section][String(id)];
                if (!Object.keys(data[section]).length) delete data[section];
            }
        } else if (spec && spec.name) {
            if (!data[section] || typeof data[section] !== 'object') data[section] = {};
            data[section][String(id)] = spec;
        } else if (data[section]) {
            delete data[section][String(id)];
            if (!Object.keys(data[section]).length) delete data[section];
        }
        const sections = Object.keys(data).filter(key => key !== 'version');
        if (!sections.length) {
            // Nothing bound: the absent file is the clean state.
            try { fs.rmSync(filePath(projectPath), { force: true }); } catch (error) {}
            return;
        }
        data.version = 1;
        writeFile(fs, filePath(projectPath), JSON.stringify(data, null, 2) + '\n');
    }

    /**
     * The "3D Model" row shared by the actor/enemy/weapon/armor/item
     * editors: checkbox, current model name, Change Model button. Checking
     * opens the model picker; the picker's cancel path never calls back, so
     * the row watches for the modal leaving the DOM and resyncs to what the
     * sidecar actually holds.
     */
    function attachRow(host, options) {
        const projectManager = options.projectManager;
        const project = projectManager && (projectManager.getCurrentProject
            ? projectManager.getCurrentProject()
            : projectManager.currentProject);
        if (!project || !project.path || typeof document === 'undefined') return null;
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const section = options.section;
        const id = options.id;

        const row = document.createElement('div');
        row.className = 'form-row rr-3d-binding-row';
        row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;';
        row.innerHTML = `
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-text);cursor:pointer;">
                <input type="checkbox" class="rr-3d-binding-check">${tt('3D Model')}
            </label>
            <span class="rr-3d-binding-name database-field-value" style="display:inline-block;max-width:170px;padding:4px 6px;background:var(--color-bg-menubar);border:1px solid var(--color-border-input);border-radius:3px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" data-rr-i18n-skip></span>
            <button type="button" class="rr-btn-chip rr-3d-binding-change">${tt('Change Model')}</button>
        `;
        const check = row.querySelector('.rr-3d-binding-check');
        const name = row.querySelector('.rr-3d-binding-name');
        const change = row.querySelector('.rr-3d-binding-change');

        // A mini render of the bound model under the icon: the icon stays
        // for menus, the model is visible right there in General.
        let pane = null;
        let thumb = null;
        if (options.previewHost && options.thumbnail) {
            pane = document.createElement('div');
            pane.style.cssText = 'display:none;flex-direction:column;align-items:center;gap:4px;margin-top:8px;';
            thumb = document.createElement('img');
            thumb.style.cssText = 'box-sizing:border-box;width:74px;height:100px;object-fit:contain;'
                + 'background:var(--color-bg-deep);border:1px solid var(--color-border);border-radius:4px;';
            pane.appendChild(thumb);
            options.previewHost.appendChild(pane);
            // Symmetry with the icon above: the model preview copies the
            // icon's bordered .database-preview footprint once it renders.
            const matchIcon = tries => {
                const iconBox = options.previewHost.querySelector('.database-preview');
                if (iconBox) {
                    const rect = iconBox.getBoundingClientRect();
                    if (rect.width >= 24 && rect.height >= 24) {
                        const style = getComputedStyle(iconBox);
                        thumb.style.width = Math.round(rect.width) + 'px';
                        thumb.style.height = Math.round(rect.height) + 'px';
                        thumb.style.border = style.border;
                        thumb.style.borderRadius = style.borderRadius;
                        thumb.style.backgroundColor = style.backgroundColor;
                        return;
                    }
                }
                if (tries > 0) setTimeout(() => matchIcon(tries - 1), 400);
            };
            matchIcon(5);
        }

        const sync = () => {
            const spec = get(project.path, section, id);
            check.checked = !!spec;
            name.textContent = spec ? spec.name : tt('(None)');
            name.style.display = spec ? '' : 'none';
            change.style.display = spec ? '' : 'none';
            if (pane) {
                pane.style.display = spec ? 'flex' : 'none';
                if (spec) {
                    thumb.style.opacity = '0.35';
                    const render = () => Promise.resolve().then(() => options.thumbnail(spec)).then(url => {
                        const still = get(project.path, section, id);
                        if (url && still && still.name === spec.name) {
                            thumb.src = url;
                            thumb.style.opacity = '1';
                        }
                    }).catch(() => {});
                    render().then(() => setTimeout(render, 2500));
                }
            }
        };

        const resyncWhenClosed = () => {
            const watcher = new MutationObserver(() => {
                if (!document.getElementById('model-picker-modal')) {
                    watcher.disconnect();
                    sync();
                }
            });
            watcher.observe(document.body, { childList: true, subtree: true });
        };

        const openPicker = () => {
            // The picker's preview loads three.js through mapEditor3D, which
            // the database editors' bare {getCurrentProject} shim lacks —
            // without it the model list shows over a black preview.
            const mapEditor3D = (projectManager && projectManager.mapEditor3D)
                || (typeof window !== 'undefined' && window.reactor
                    && window.reactor.projectController
                    && window.reactor.projectController.mapEditor3D)
                || null;
            const picker = new ModelGraphicPicker({
                getCurrentProject: () => project,
                mapEditor3D
            });
            picker.show(get(project.path, section, id), result => {
                set(project.path, section, id, result);
                if (options.onChange) options.onChange(result);
            });
            resyncWhenClosed();
        };

        check.addEventListener('change', () => {
            if (check.checked) {
                openPicker();
            } else {
                set(project.path, section, id, null);
                if (options.onChange) options.onChange(null);
                sync();
            }
        });
        change.addEventListener('click', openPicker);

        sync();
        host.appendChild(row);
        return row;
    }

    /**
     * A model's thumbnail as a data URL, cached on the Database 3D
     * section's editor (shared with its model list). Rendered once per
     * model — a re-render per detail refresh stalled the page — with one
     * delayed refresh because embedded textures decode after the model.
     */
    function modelThumbnail(reactor3dEditor, spec) {
        const ed = reactor3dEditor;
        if (!ed || !ed._renderThumbnail || !spec) return null;
        if (!ed._thumbs) ed._thumbs = {};
        if (ed._thumbs[spec.name]) return ed._thumbs[spec.name];
        if (!ed.projectController.mapEditor3D && typeof window !== 'undefined'
            && window.reactor && window.reactor.projectController
            && window.reactor.projectController.mapEditor3D) {
            ed.projectController = {
                getCurrentProject: ed.projectController.getCurrentProject,
                mapEditor3D: window.reactor.projectController.mapEditor3D
            };
        }
        const entry = { name: spec.name, ext: spec.ext, file: spec.file };
        return ed._renderThumbnail(entry).then(url => {
            if (url) {
                ed._thumbs[spec.name] = url;
                setTimeout(() => {
                    Promise.resolve(ed._renderThumbnail(entry)).then(settled => {
                        if (settled) ed._thumbs[spec.name] = settled;
                    }).catch(() => {});
                }, 1800);
            }
            return url;
        });
    }

    function pickerController(projectManager, project) {
        const mapEditor3D = (projectManager && projectManager.mapEditor3D)
            || (typeof window !== 'undefined' && window.reactor
                && window.reactor.projectController
                && window.reactor.projectController.mapEditor3D)
            || null;
        return { getCurrentProject: () => project, mapEditor3D };
    }

    /**
     * The 3D corner checkbox on one of an actor's graphic boxes
     * (character sprite / face / SV battler). Checked, the box shows the
     * bound model — retitled, thumbnailed — and its button changes the
     * model; unchecked, the original 2D content and picker are untouched.
     */
    function decorateSlot(box, options) {
        const projectManager = options.projectManager;
        const project = projectManager && (projectManager.getCurrentProject
            ? projectManager.getCurrentProject()
            : projectManager.currentProject);
        if (!box || !project || !project.path) return null;
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const id = options.id;
        const slot = options.slot;
        const label = box.querySelector('.graphic-preview-label');
        const canvasBox = box.querySelector('.graphic-canvas-container');
        const button = box.querySelector('.graphic-selector-button');
        if (!label || !canvasBox || !button) return null;
        const label2d = label.textContent;
        const button2d = button.textContent;

        // The 3D toggle sits beside the change button it re-aims — picking
        // a sprite or a model is one decision, made in one place — and the
        // title above keeps its full width.
        // Three columns keep the button itself dead centre; the checkbox
        // rides in the right column instead of pushing the button left.
        const bottomRow = document.createElement('div');
        bottomRow.style.cssText = 'display:grid;grid-template-columns:1fr auto 1fr;'
            + 'align-items:center;width:100%;';
        button.parentNode.insertBefore(bottomRow, button);
        bottomRow.appendChild(document.createElement('span'));
        bottomRow.appendChild(button);
        const corner = document.createElement('label');
        corner.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;'
            + 'color:var(--color-text-muted);cursor:pointer;white-space:nowrap;'
            + 'justify-self:start;padding-left:10px;';
        corner.setAttribute('data-rr-i18n-skip', '1');
        const check = document.createElement('input');
        check.type = 'checkbox';
        corner.appendChild(check);
        corner.appendChild(document.createTextNode('3D'));
        bottomRow.appendChild(corner);

        const pane = document.createElement('div');
        pane.style.cssText = 'display:none;flex-direction:column;align-items:center;justify-content:center;'
            + 'gap:6px;min-height:160px;';
        const thumb = document.createElement('img');
        thumb.style.cssText = 'width:140px;height:140px;object-fit:contain;image-rendering:auto;'
            + 'background:var(--color-bg-deep);border:1px solid var(--color-border);border-radius:4px;';
        const nameTag = document.createElement('div');
        nameTag.setAttribute('data-rr-i18n-skip', '1');
        nameTag.style.cssText = 'font-size:11px;color:var(--color-text);max-width:150px;'
            + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        pane.appendChild(thumb);
        pane.appendChild(nameTag);
        canvasBox.parentNode.insertBefore(pane, canvasBox.nextSibling);

        const bound = () => get(project.path, 'actors', id, slot);
        const sync = () => {
            const spec = bound();
            check.checked = !!spec;
            label.textContent = spec ? tt(options.label) : label2d;
            canvasBox.style.display = spec ? 'none' : '';
            pane.style.display = spec ? 'flex' : 'none';
            button.textContent = spec ? tt('Change Model') : button2d;
            if (spec) {
                nameTag.textContent = spec.name;
                thumb.style.opacity = '0.35';
                if (options.thumbnail) {
                    const render = () => Promise.resolve().then(() => options.thumbnail(spec)).then(url => {
                        if (url && bound() && bound().name === spec.name) {
                            thumb.src = url;
                            thumb.style.opacity = '1';
                        }
                    }).catch(() => {});
                    // Twice: a first render can land before the model's
                    // embedded textures decode and bake a silhouette. The
                    // provider refreshes its cache at ~1.8s; read it after.
                    render().then(() => setTimeout(render, 2500));
                }
            }
        };

        const resyncWhenClosed = () => {
            const watcher = new MutationObserver(() => {
                if (!document.getElementById('model-picker-modal')) {
                    watcher.disconnect();
                    sync();
                }
            });
            watcher.observe(document.body, { childList: true, subtree: true });
        };

        const openPicker = () => {
            const picker = new ModelGraphicPicker(pickerController(projectManager, project));
            picker.show(bound(), result => {
                set(project.path, 'actors', id, result, slot);
                sync();
            }, options.framing ? { framing: true } : undefined);
            resyncWhenClosed();
        };

        check.addEventListener('change', () => {
            if (check.checked) openPicker();
            else {
                set(project.path, 'actors', id, null, slot);
                sync();
            }
        });
        // When the slot is 3D, the box's button belongs to the model
        // picker; capture beats the 2D handler already attached.
        button.addEventListener('click', event => {
            if (!bound()) return;
            event.stopImmediatePropagation();
            event.preventDefault();
            openPicker();
        }, true);

        sync();
        return { sync };
    }

    const api = { filePath, read, get, set, attachRow, decorateSlot, modelThumbnail };
    root.RRDatabase3DBindings = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
