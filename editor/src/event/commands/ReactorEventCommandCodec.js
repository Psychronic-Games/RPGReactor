/**
 * Canonical metadata wrapper for generated event-command JavaScript.
 * The first line is a valid JavaScript comment and the remaining text is the
 * executable expression or script body.
 */
class ReactorEventCommandCodec {
    static get VERSION() {
        return 1;
    }

    static createText(kind, data, body) {
        if (typeof kind !== 'string' || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(kind)) {
            throw new TypeError('Generated text kind must be a simple identifier');
        }
        if (typeof body !== 'string') {
            throw new TypeError('Generated text body must be a string');
        }
        try {
            Function(body);
        } catch (error) {
            throw new SyntaxError(`Generated text body must be valid JavaScript: ${error.message}`);
        }

        let json;
        try {
            json = JSON.stringify(data);
        } catch (error) {
            throw new TypeError(`Generated text data must be JSON-safe: ${error.message}`);
        }
        if (json === undefined) {
            throw new TypeError('Generated text data must be JSON-safe');
        }

        let decoded;
        try {
            decoded = JSON.parse(json);
        } catch (_error) {
            throw new TypeError('Generated text data must be valid JSON');
        }
        if (JSON.stringify(decoded) !== json) {
            throw new TypeError('Generated text data must have a canonical JSON representation');
        }

        const encodedKind = encodeURIComponent(kind);
        const encodedData = encodeURIComponent(json);
        return `/*@RPG_REACTOR_EVENT:${this.VERSION}:${encodedKind}:${encodedData}*/\n${body}`;
    }

    static parseText(text, expectedKind) {
        if (typeof text !== 'string') return null;

        const match = /^\/\*@RPG_REACTOR_EVENT:(\d+):([^:\r\n]+):([^:\r\n]+)\*\/\n([\s\S]*)$/.exec(text);
        if (!match || Number(match[1]) !== this.VERSION) return null;

        let kind;
        let json;
        let data;
        try {
            kind = decodeURIComponent(match[2]);
            json = decodeURIComponent(match[3]);
            data = JSON.parse(json);
        } catch (_error) {
            return null;
        }

        if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(kind)) return null;
        if (expectedKind !== undefined && kind !== expectedKind) return null;
        if (encodeURIComponent(kind) !== match[2]) return null;
        if (encodeURIComponent(json) !== match[3]) return null;
        if (JSON.stringify(data) !== json) return null;

        const result = { version: this.VERSION, kind, data, body: match[4] };
        if (this.createText(kind, data, result.body) !== text) return null;
        return result;
    }

    static createScriptCommand(kind, data, body) {
        return {
            code: 355,
            indent: 0,
            parameters: [this.createText(kind, data, body)]
        };
    }

    static createPictureBody(data) {
        const payload = JSON.stringify(data);
        if (!payload) throw new TypeError('Picture command data must be JSON-safe');
        const helpers = 'var rrRef=function(r,z){var v=r.source==="variable"?$gameVariables.value(r.value):r.value;v=Number(v);return Number.isFinite(v)&&Math.floor(v)===v&&v>=(z?0:1)?v:null;};' +
            'var rrPoint=function(v){var x=v.source==="variable"?$gameVariables.value(v.x):v.x;var y=v.source==="variable"?$gameVariables.value(v.y):v.y;x=Number(x);y=Number(y);return Number.isFinite(x)&&Number.isFinite(y)?{x:x,y:y}:null;};';
        const fallback = 'var id,point,duration,end,low,high,max=$gameScreen.maxPictures();' +
            'if(p.operation==="show"){id=rrRef(p.pictureId,false);point=rrPoint(p.position);if(id!==null&&id<=max&&point)$gameScreen.showPicture(id,p.name,p.origin,point.x,point.y,p.scaleX,p.scaleY,p.opacity,p.blend==="overlay"?0:p.blend);}' +
            'else if(p.operation==="move"){id=rrRef(p.pictureId,false);duration=rrRef(p.duration,true);point=rrPoint(p.position);if(id!==null&&id<=max&&duration!==null&&point){$gameScreen.movePicture(id,p.origin,point.x,point.y,p.scaleX,p.scaleY,p.opacity,p.blend==="overlay"?0:p.blend,duration,p.easing);if(p.wait)this.wait(duration);}}' +
            'else if(p.operation==="erase"){if(p.mode==="all"){for(id=1;id<=max;id++)$gameScreen.erasePicture(id);}else{id=rrRef(p.pictureId,false);if(id!==null&&id<=max){if(p.mode==="one")$gameScreen.erasePicture(id);else{end=rrRef(p.endPictureId,false);if(end!==null&&end<=max){low=Math.min(id,end);high=Math.max(id,end);for(id=low;id<=high;id++)$gameScreen.erasePicture(id);}}}}}';
        return `var p=${payload};if(typeof this.reactorPictureCommand==="function"){this.reactorPictureCommand(p);}else{${helpers}${fallback}}`;
    }

    static parseCommand(command, expectedKind) {
        if (!command || !Array.isArray(command.parameters)) return null;

        let text;
        let parameterIndex;
        if (command.code === 355 && command.parameters.length === 1) {
            text = command.parameters[0];
            parameterIndex = 0;
        } else if (command.code === 111 && command.parameters.length === 2 && command.parameters[0] === 12) {
            text = command.parameters[1];
            parameterIndex = 1;
        } else if (command.code === 122 && command.parameters.length >= 5 &&
                   command.parameters.length <= 7 && command.parameters[3] === 4) {
            text = command.parameters[4];
            parameterIndex = 4;
        } else {
            return null;
        }

        const parsed = this.parseText(text, expectedKind);
        if (!parsed) return null;
        return Object.assign({ commandCode: command.code, parameterIndex }, parsed);
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.ReactorEventCommandCodec = ReactorEventCommandCodec;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReactorEventCommandCodec;
}
