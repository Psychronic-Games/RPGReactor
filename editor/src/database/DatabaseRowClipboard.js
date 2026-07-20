// Portable clipboard support for database trait and effect rows.
class DatabaseRowClipboard {
    static localPayloads = {};

    static clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    static clipboardType(kind) {
        return kind === 'trait' ? 'databaseTrait' : 'databaseEffect';
    }

    static referenceCategory(kind, row) {
        const code = Number(row?.code);
        const dataId = Number(row?.dataId);

        if (kind === 'trait') {
            if (code === 11 || code === 31) return 'elements';
            if (code === 13 || code === 14 || code === 32) return 'states';
            if (code === 35 || code === 43 || code === 44) return 'skills';
            if (code === 41 || code === 42) return 'skillTypes';
            if (code === 51) return 'weaponTypes';
            if (code === 52) return 'armorTypes';
            if (code === 53 || code === 54) return 'equipTypes';
            return null;
        }

        if (code === 21) return dataId === 0 ? null : 'states';
        if (code === 22) return 'states';
        if (code === 43) return 'skills';
        if (code === 44) return 'commonEvents';
        return null;
    }

    static entries(databaseManager, category) {
        const systemCategories = ['elements', 'skillTypes', 'weaponTypes', 'armorTypes', 'equipTypes'];
        if (systemCategories.includes(category)) {
            const values = databaseManager.getSystem?.()?.[category]
                || databaseManager.data?.system?.[category]
                || [];
            return values.map((name, id) => ({ id, name }));
        }

        const getterNames = {
            states: 'getStates',
            skills: 'getSkills',
            commonEvents: 'getCommonEvents'
        };
        const values = databaseManager.data?.[category]
            || databaseManager[getterNames[category]]?.()
            || [];
        return values.map((entry, index) => entry && ({ id: Number.isInteger(entry.id) ? entry.id : index, name: entry.name }));
    }

    static createPayload(kind, row, databaseManager) {
        const copiedRow = DatabaseRowClipboard.clone(row);
        const category = DatabaseRowClipboard.referenceCategory(kind, copiedRow);
        let reference = null;

        if (category) {
            const sourceId = Number(copiedRow.dataId);
            const sourceEntry = DatabaseRowClipboard.entries(databaseManager, category)
                .find(entry => entry && entry.id === sourceId);
            reference = {
                category,
                sourceId,
                name: typeof sourceEntry?.name === 'string' && sourceEntry.name ? sourceEntry.name : null
            };
        }

        return {
            version: 1,
            kind,
            sourceProjectPath: databaseManager.projectPath || null,
            row: copiedRow,
            reference
        };
    }

    static write(kind, row, databaseManager) {
        const payload = DatabaseRowClipboard.createPayload(kind, row, databaseManager);
        DatabaseRowClipboard.localPayloads[kind] = payload;
        let writePromise = Promise.resolve(true);
        if (typeof ReactorClipboard !== 'undefined') {
            writePromise = Promise.resolve(ReactorClipboard.write(DatabaseRowClipboard.clipboardType(kind), payload));
        }
        Object.defineProperty(payload, '_writePromise', { value: writePromise });
        return payload;
    }

    static async confirmCut(payload) {
        const wrote = await (payload?._writePromise || true);
        if (!wrote) DatabaseRowClipboard.showError({ error: 'writeFailed' });
        return wrote;
    }

    static resolvePayload(kind, payload, databaseManager) {
        if (!payload || payload.version !== 1 || payload.kind !== kind || !payload.row) {
            return { error: 'incompatible' };
        }

        const row = DatabaseRowClipboard.clone(payload.row);
        if (payload.sourceProjectPath && payload.sourceProjectPath === databaseManager.projectPath) return { row };

        const category = DatabaseRowClipboard.referenceCategory(kind, row);
        if (!category) return { row };
        if (payload.reference?.category !== category || !payload.reference.name) {
            return { error: 'unresolved', reference: payload.reference };
        }

        const matches = DatabaseRowClipboard.entries(databaseManager, category)
            .filter(entry => entry && entry.id > 0 && entry.name === payload.reference.name);
        if (matches.length !== 1) {
            return { error: 'unresolved', reference: payload.reference };
        }

        row.dataId = matches[0].id;
        return { row };
    }

    static async read(kind, databaseManager, localPayload = null) {
        if (typeof ReactorClipboard !== 'undefined') {
            if (ReactorClipboard.readDetailed) {
                const result = await ReactorClipboard.readDetailed();
                if (result.available) {
                    if (result.envelope?.type !== DatabaseRowClipboard.clipboardType(kind)) return { error: 'incompatible' };
                    return DatabaseRowClipboard.resolvePayload(kind, result.envelope.payload, databaseManager);
                }
            } else {
                const envelope = await ReactorClipboard.read();
                if (envelope) {
                    if (envelope.type !== DatabaseRowClipboard.clipboardType(kind)) return { error: 'incompatible' };
                    return DatabaseRowClipboard.resolvePayload(kind, envelope.payload, databaseManager);
                }
            }
        }

        const fallback = DatabaseRowClipboard.localPayloads[kind] || localPayload;
        return DatabaseRowClipboard.resolvePayload(kind, fallback, databaseManager);
    }

    static capturePasteTarget(parentEditor, projectManager, databaseManager, rows, selectedIndex = null) {
        return {
            generation: parentEditor?._detailGeneration ?? null,
            project: projectManager?.getCurrentProject?.(),
            databaseGeneration: databaseManager?.dataGeneration ?? null,
            rows,
            length: rows?.length || 0,
            selectedIndex,
            selectedRow: selectedIndex !== null ? rows?.[selectedIndex] : null
        };
    }

    static isPasteTargetCurrent(target, parentEditor, projectManager, databaseManager, rows) {
        if (target.generation !== null && parentEditor?._detailGeneration !== target.generation) return false;
        if (projectManager?.getCurrentProject && projectManager.getCurrentProject() !== target.project) return false;
        if (target.databaseGeneration !== null && databaseManager?.dataGeneration !== target.databaseGeneration) return false;
        if (rows !== target.rows || (rows?.length || 0) !== target.length) return false;
        if (target.selectedIndex !== null && rows?.[target.selectedIndex] !== target.selectedRow) return false;
        return true;
    }

    static showError(result) {
        const key = result?.error === 'unresolved'
            ? 'db.unresolvedClipboardReference'
            : result?.error === 'writeFailed'
                ? 'db.clipboardWriteFailed'
                : 'db.noCompatibleRowClipboard';
        const name = result?.reference?.name || `#${result?.reference?.sourceId ?? '?'}`;
        const message = window.I18n?.t
            ? window.I18n.t(key, { name })
            : key === 'db.unresolvedClipboardReference'
                ? `Cannot paste because "${name}" is missing or duplicated in the target project.`
                : key === 'db.clipboardWriteFailed'
                    ? 'Could not write the trait or effect to the clipboard.'
                    : 'No compatible trait or effect in the clipboard.';
        alert(message);
    }
}
