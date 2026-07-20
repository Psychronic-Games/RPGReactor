// RPG Reactor - Cross-window clipboard helpers
// Stores typed JSON on the system clipboard and a shared file fallback so separate
// editor instances with separate NW.js profiles can exchange data reliably.

class ReactorClipboard {
    static marker = 'RPG_REACTOR_CLIPBOARD';

    static serialize(type, payload) {
        return JSON.stringify({
            marker: ReactorClipboard.marker,
            version: 1,
            type,
            payload
        });
    }

    static parse(text, expectedType = null) {
        if (!text) return null;

        try {
            const data = JSON.parse(text);
            if (!data || data.marker !== ReactorClipboard.marker) return null;
            if (expectedType && data.type !== expectedType) return null;
            return data;
        } catch (error) {
            return null;
        }
    }

    static getClipboardFilePath() {
        try {
            if (typeof require === 'function') {
                const os = require('os');
                const path = require('path');
                return path.join(os.tmpdir(), 'rpg-reactor-clipboard.json');
            }
        } catch (error) {
            console.warn('Could not resolve shared clipboard file path:', error);
        }

        return null;
    }

    static getNwClipboard() {
        try {
            if (typeof nw !== 'undefined' && nw.Clipboard) {
                return nw.Clipboard.get();
            }

            if (typeof require === 'function') {
                const nwGui = require('nw.gui');
                if (nwGui && nwGui.Clipboard) {
                    return nwGui.Clipboard.get();
                }
            }
        } catch (error) {
            console.warn('Could not access NW.js clipboard:', error);
        }

        return null;
    }

    static writeSharedFile(text) {
        const filePath = ReactorClipboard.getClipboardFilePath();
        if (!filePath) return false;

        try {
            const fs = require('fs');
            fs.writeFileSync(filePath, text, 'utf8');
            return true;
        } catch (error) {
            console.warn('Shared clipboard file write failed:', error);
            return false;
        }
    }

    static readSharedFile(expectedType = null) {
        return ReactorClipboard.readSharedFileDetailed(expectedType).envelope;
    }

    static readSharedFileDetailed(expectedType = null) {
        const filePath = ReactorClipboard.getClipboardFilePath();
        if (!filePath) return { available: false, envelope: null };

        try {
            const fs = require('fs');
            if (!fs.existsSync(filePath)) return { available: false, envelope: null };
            const text = fs.readFileSync(filePath, 'utf8');
            return { available: !!text, envelope: ReactorClipboard.parse(text, expectedType) };
        } catch (error) {
            console.warn('Shared clipboard file read failed:', error);
            return { available: false, envelope: null };
        }
    }

    static async write(type, payload) {
        const text = ReactorClipboard.serialize(type, payload);
        let wrote = ReactorClipboard.writeSharedFile(text);

        try {
            const nwClipboard = ReactorClipboard.getNwClipboard();
            if (nwClipboard) {
                nwClipboard.set(text, 'text');
                wrote = true;
            }

            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                wrote = true;
            }
        } catch (error) {
            console.warn('System clipboard write failed:', error);
        }

        try {
            localStorage.setItem('rpg-reactor.clipboard', text);
            wrote = true;
        } catch (error) {
            console.warn('Fallback clipboard write failed:', error);
        }

        return wrote;
    }

    static async read(expectedType = null) {
        return (await ReactorClipboard.readDetailed(expectedType)).envelope;
    }

    static async readDetailed(expectedType = null) {
        let text = '';

        try {
            const nwClipboard = ReactorClipboard.getNwClipboard();
            if (nwClipboard) {
                text = nwClipboard.get('text') || '';
                if (text) return { available: true, envelope: ReactorClipboard.parse(text, expectedType) };
            }

            if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
                text = await navigator.clipboard.readText();
                if (text) return { available: true, envelope: ReactorClipboard.parse(text, expectedType) };
            }
        } catch (error) {
            console.warn('System clipboard read failed:', error);
        }

        const sharedFileData = ReactorClipboard.readSharedFileDetailed(expectedType);
        if (sharedFileData.available) return sharedFileData;

        try {
            text = localStorage.getItem('rpg-reactor.clipboard') || '';
            return { available: !!text, envelope: ReactorClipboard.parse(text, expectedType) };
        } catch (error) {
            console.warn('Fallback clipboard read failed:', error);
            return { available: false, envelope: null };
        }
    }
}
