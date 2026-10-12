/**
 * MapHistory - one undo history for the map view.
 *
 * Each map tool (tiles, events, the builder, terrain, lighting, media
 * surfaces) keeps the steps it took and knows how to take one back. This
 * keeps the order they were taken in across all of them, so Ctrl+Z undoes
 * the last thing done whatever tool did it and whatever tool is in hand.
 *
 * A tool is registered with the two arrays it keeps its steps in. From then
 * on those arrays are watched: a step pushed is noted here in order (and
 * drops every tool's redo, as a new step does), a step a tool drops by
 * itself (its own limit, a stroke that moved nothing, another map) is
 * forgotten here too. The tool's own undo, redo, canUndo and canRedo answer
 * for the whole history, so its panel buttons and keys step the same one.
 * Undoing calls back into the tool that took the step.
 */
(function(root) {
    'use strict';

    class MapHistory {
        /**
         * `onChange(canUndo, canRedo)` after anything changes; `onStep({ kind, owner, label })`
         * after a step is undone or redone; `limit` the steps kept in all.
         */
        constructor(options = {}) {
            this.limit = options.limit > 0 ? options.limit : 300;
            this.onChange = options.onChange || null;
            this.onStep = options.onStep || null;
            this.owners = new Map();
            // Owner ids in the order their steps were taken, oldest first.
            this.undoList = [];
            this.redoList = [];
            // Above zero while this moves a tool's steps itself: what the arrays do then is not news.
            this._quiet = 0;
        }

        /**
         * A tool joins: `object` holds its steps under `undoKey` and `redoKey`; `undo()` and `redo()`
         * take one of its own steps back or forward; `settle()` closes a stroke still being drawn so it
         * is a step; `label(entry, kind)` names the step for the status line. `methods` names the
         * object's undo, redo, canUndo and canRedo, which from now on step and answer for the whole
         * history (false leaves one alone).
         */
        register(id, config) {
            const known = this.owners.get(id);
            if (known && known.object === config.object) return known;
            if (known) this.unregister(id);
            const object = config.object;
            const owner = { id, object, undoKey: config.undoKey || 'undoStack', redoKey: config.redoKey || 'redoStack',
                settle: config.settle || null, label: config.label || null, restore: [] };
            const names = Object.assign({ undo: 'undo', redo: 'redo', canUndo: 'canUndo', canRedo: 'canRedo' }, config.methods);
            const history = this;
            const own = name => (name && typeof object[name] === 'function' ? object[name] : null);
            const originalUndo = own(names.undo), originalRedo = own(names.redo);
            owner.undo = config.undo || (() => originalUndo && originalUndo.call(object));
            owner.redo = config.redo || (() => originalRedo && originalRedo.call(object));
            const redirect = (name, through) => {
                const original = own(name);
                if (!original) return;
                const had = Object.prototype.hasOwnProperty.call(object, name);
                owner.restore.push(() => { if (had) object[name] = original; else delete object[name]; });
                object[name] = function() { return history._quiet ? original.apply(this, arguments) : through(); };
            };
            redirect(names.undo, () => history.undo());
            redirect(names.redo, () => history.redo());
            redirect(names.canUndo, () => history.canUndo());
            redirect(names.canRedo, () => history.canRedo());
            owner.steps = { undo: this._watch(owner, 'undo', owner.undoKey), redo: this._watch(owner, 'redo', owner.redoKey) };
            this.owners.set(id, owner);
            this._sync();
            this._emit();
            return owner;
        }

        unregister(id) {
            const owner = this.owners.get(id);
            if (!owner) return;
            for (const undo of owner.restore) undo();
            for (const which of ['undo', 'redo']) owner.steps[which].release();
            this.owners.delete(id);
            this.undoList = this.undoList.filter(other => other !== id);
            this.redoList = this.redoList.filter(other => other !== id);
            this._emit();
        }

        /** Watch one of a tool's arrays: every change of its length, and the array being replaced. */
        _watch(owner, which, key) {
            const history = this, object = owner.object;
            const proxies = new WeakMap();
            let array = Array.isArray(object[key]) ? object[key] : [];
            const wrap = target => {
                const proxy = new Proxy(target, {
                    set(inner, property, value) {
                        const done = Reflect.set(inner, property, value);
                        if (property === 'length') history._changed(owner, which);
                        return done;
                    }
                });
                proxies.set(proxy, target);
                return proxy;
            };
            let proxy = wrap(array);
            const state = { first: array[0], array: () => array, release: null };
            Object.defineProperty(object, key, {
                configurable: true, enumerable: true,
                get() { return proxy; },
                set(next) {
                    array = proxies.get(next) || (Array.isArray(next) ? next : []);
                    proxy = wrap(array);
                    history._changed(owner, which);
                }
            });
            state.release = () => { Object.defineProperty(object, key, { configurable: true, enumerable: true, writable: true, value: array }); };
            return state;
        }

        _count(list, id) {
            let count = 0;
            for (const other of list) if (other === id) count++;
            return count;
        }

        /** Forget `count` of a tool's steps in a list: its oldest, or its newest. */
        _forget(list, id, count, oldest) {
            if (oldest) { for (let i = 0; i < list.length && count > 0; i++) if (list[i] === id) { list.splice(i--, 1); count--; } }
            else for (let i = list.length - 1; i >= 0 && count > 0; i--) if (list[i] === id) { list.splice(i, 1); count--; }
        }

        /** One of a tool's arrays changed length by the tool's own doing. */
        _changed(owner, which) {
            if (this._quiet) return;
            const list = which === 'undo' ? this.undoList : this.redoList, state = owner.steps && owner.steps[which];
            if (!state) return;
            const array = state.array(), have = this._count(list, owner.id), want = array.length;
            if (want > have) {
                for (let i = have; i < want; i++) list.push(owner.id);
                // A new step: what was undone, in any tool, can no longer be redone.
                if (which === 'undo') this._dropRedoOfOthers(owner);
            } else if (want < have) {
                // Its first step went and others stayed: the tool's own limit dropped its oldest.
                const shifted = want > 0 && array[0] !== state.first;
                this._forget(list, owner.id, have - want, shifted);
            }
            state.first = array[0];
            this._trim();
            this._emit();
        }

        _empty(owner, which) {
            const array = owner.steps[which].array();
            if (!array.length) return;
            this._quiet++;
            try { owner.object[which === 'undo' ? owner.undoKey : owner.redoKey].length = 0; } finally { this._quiet--; }
            owner.steps[which].first = undefined;
        }

        _dropRedoOfOthers(owner) {
            for (const other of this.owners.values()) if (other !== owner) this._empty(other, 'redo');
            this.redoList = this.redoList.filter(id => id === owner.id);
        }

        /** Over the limit: the oldest step of all goes, from the tool that holds it. */
        _trim() {
            while (this.undoList.length > this.limit) {
                const owner = this.owners.get(this.undoList.shift());
                if (!owner) continue;
                this._quiet++;
                try { owner.object[owner.undoKey].shift(); } finally { this._quiet--; }
                owner.steps.undo.first = owner.steps.undo.array()[0];
            }
        }

        /** Make the lists agree with what the tools hold: steps a tool lost are forgotten (its oldest), ones it gained come last. */
        _sync() {
            for (const owner of this.owners.values()) {
                for (const which of ['undo', 'redo']) {
                    const list = which === 'undo' ? this.undoList : this.redoList, state = owner.steps[which];
                    const array = state.array(), have = this._count(list, owner.id), want = array.length;
                    if (have > want) this._forget(list, owner.id, have - want, true);
                    else for (let i = have; i < want; i++) list.push(owner.id);
                    state.first = array[0];
                }
            }
            for (const list of [this.undoList, this.redoList]) for (let i = list.length - 1; i >= 0; i--) if (!this.owners.has(list[i])) list.splice(i, 1);
        }

        _emit() {
            if (this.onChange) this.onChange(this.canUndo(), this.canRedo());
        }

        canUndo() { return this.undoList.length > 0; }
        canRedo() { return this.redoList.length > 0; }

        /** Strokes still being drawn in any tool close, so each is a step in its place. */
        settle() {
            for (const owner of this.owners.values()) if (owner.settle) owner.settle();
        }

        undo() { return this._step('undo'); }
        redo() { return this._step('redo'); }

        _step(kind) {
            if (this._quiet) return false;
            this.settle();
            const from = kind === 'undo' ? this.undoList : this.redoList, to = kind === 'undo' ? this.redoList : this.undoList;
            while (from.length) {
                const id = from[from.length - 1], owner = this.owners.get(id);
                const before = owner ? owner.steps[kind].array().length : 0;
                if (!before) { from.pop(); continue; }
                const entry = owner.steps[kind].array()[before - 1];
                let label = '';
                if (owner.label) { try { label = owner.label(entry, kind) || ''; } catch (error) { label = ''; } }
                this._quiet++;
                try { owner[kind](); } finally { this._quiet--; }
                // The tool would not (no map, a dialog in the way): the step stays where it is.
                if (owner.steps[kind].array().length >= before) { this._sync(); this._emit(); return false; }
                from.pop();
                to.push(id);
                this._sync();
                this._emit();
                if (this.onStep) this.onStep({ kind, owner: id, label });
                return true;
            }
            this._emit();
            return false;
        }

        /** Another map: every tool's steps were the last map's. */
        mapChanged() {
            for (const owner of this.owners.values()) { this._empty(owner, 'undo'); this._empty(owner, 'redo'); }
            this.undoList.length = 0;
            this.redoList.length = 0;
            this._emit();
        }
    }

    root.RRMapHistory = MapHistory;
    if (typeof module !== 'undefined' && module.exports) module.exports = MapHistory;
})(typeof window !== 'undefined' ? window : globalThis);
