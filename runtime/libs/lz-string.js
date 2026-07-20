// LZ-based compression algorithm, version 1.4.1.
// Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>
// Distributed under the WTFPL, Version 2: http://www.wtfpl.net/
var LZString = (function() {
    "use strict";

    var base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

    function compressToBase64(input) {
        if (input == null) return "";
        var output = "";
        var compressed = compressRaw(input);
        var position = 0;
        while (position < compressed.length * 2) {
            var first;
            var second;
            var third;
            if (position % 2 === 0) {
                first = compressed.charCodeAt(position / 2) >> 8;
                second = compressed.charCodeAt(position / 2) & 255;
                third = position / 2 + 1 < compressed.length ? compressed.charCodeAt(position / 2 + 1) >> 8 : NaN;
            } else {
                first = compressed.charCodeAt((position - 1) / 2) & 255;
                if ((position + 1) / 2 < compressed.length) {
                    second = compressed.charCodeAt((position + 1) / 2) >> 8;
                    third = compressed.charCodeAt((position + 1) / 2) & 255;
                } else {
                    second = third = NaN;
                }
            }
            position += 3;
            var a = first >> 2;
            var b = ((first & 3) << 4) | (second >> 4);
            var c = ((second & 15) << 2) | (third >> 6);
            var d = third & 63;
            if (isNaN(second)) c = d = 64;
            else if (isNaN(third)) d = 64;
            output += base64.charAt(a) + base64.charAt(b) + base64.charAt(c) + base64.charAt(d);
        }
        return output;
    }

    function decompressFromBase64(input) {
        if (input == null) return "";
        var compressed = "";
        var carry = 0;
        var block = 0;
        var position = 0;
        input = input.replace(/[^A-Za-z0-9+/=]/g, "");
        while (position < input.length) {
            var a = base64.indexOf(input.charAt(position++));
            var b = base64.indexOf(input.charAt(position++));
            var c = base64.indexOf(input.charAt(position++));
            var d = base64.indexOf(input.charAt(position++));
            var first = (a << 2) | (b >> 4);
            var second = ((b & 15) << 4) | (c >> 2);
            var third = ((c & 3) << 6) | d;
            if (block % 2 === 0) {
                carry = first << 8;
                if (c !== 64) compressed += String.fromCharCode(carry | second);
                if (d !== 64) carry = third << 8;
            } else {
                compressed += String.fromCharCode(carry | first);
                if (c !== 64) carry = second << 8;
                if (d !== 64) compressed += String.fromCharCode(carry | third);
            }
            block += 3;
        }
        return decompressRaw(compressed);
    }

    function compressToUTF16(input) {
        if (input == null) return "";
        var output = "";
        var carry;
        var status = 0;
        var compressed = compressRaw(input);
        for (var index = 0; index < compressed.length; index++) {
            var value = compressed.charCodeAt(index);
            switch (status++) {
                case 0: output += String.fromCharCode((value >> 1) + 32); carry = (value & 1) << 14; break;
                case 1: output += String.fromCharCode(carry + (value >> 2) + 32); carry = (value & 3) << 13; break;
                case 2: output += String.fromCharCode(carry + (value >> 3) + 32); carry = (value & 7) << 12; break;
                case 3: output += String.fromCharCode(carry + (value >> 4) + 32); carry = (value & 15) << 11; break;
                case 4: output += String.fromCharCode(carry + (value >> 5) + 32); carry = (value & 31) << 10; break;
                case 5: output += String.fromCharCode(carry + (value >> 6) + 32); carry = (value & 63) << 9; break;
                case 6: output += String.fromCharCode(carry + (value >> 7) + 32); carry = (value & 127) << 8; break;
                case 7: output += String.fromCharCode(carry + (value >> 8) + 32); carry = (value & 255) << 7; break;
                case 8: output += String.fromCharCode(carry + (value >> 9) + 32); carry = (value & 511) << 6; break;
                case 9: output += String.fromCharCode(carry + (value >> 10) + 32); carry = (value & 1023) << 5; break;
                case 10: output += String.fromCharCode(carry + (value >> 11) + 32); carry = (value & 2047) << 4; break;
                case 11: output += String.fromCharCode(carry + (value >> 12) + 32); carry = (value & 4095) << 3; break;
                case 12: output += String.fromCharCode(carry + (value >> 13) + 32); carry = (value & 8191) << 2; break;
                case 13: output += String.fromCharCode(carry + (value >> 14) + 32); carry = (value & 16383) << 1; break;
                case 14:
                    output += String.fromCharCode(carry + (value >> 15) + 32, (value & 32767) + 32);
                    status = 0;
                    break;
            }
        }
        return output + String.fromCharCode(carry + 32);
    }

    function decompressFromUTF16(input) {
        if (input == null) return "";
        var compressed = "";
        var carry;
        var status = 0;
        for (var index = 0; index < input.length; index++) {
            var value = input.charCodeAt(index) - 32;
            switch (status++) {
                case 0: carry = value << 1; break;
                case 1: compressed += String.fromCharCode(carry | (value >> 14)); carry = (value & 16383) << 2; break;
                case 2: compressed += String.fromCharCode(carry | (value >> 13)); carry = (value & 8191) << 3; break;
                case 3: compressed += String.fromCharCode(carry | (value >> 12)); carry = (value & 4095) << 4; break;
                case 4: compressed += String.fromCharCode(carry | (value >> 11)); carry = (value & 2047) << 5; break;
                case 5: compressed += String.fromCharCode(carry | (value >> 10)); carry = (value & 1023) << 6; break;
                case 6: compressed += String.fromCharCode(carry | (value >> 9)); carry = (value & 511) << 7; break;
                case 7: compressed += String.fromCharCode(carry | (value >> 8)); carry = (value & 255) << 8; break;
                case 8: compressed += String.fromCharCode(carry | (value >> 7)); carry = (value & 127) << 9; break;
                case 9: compressed += String.fromCharCode(carry | (value >> 6)); carry = (value & 63) << 10; break;
                case 10: compressed += String.fromCharCode(carry | (value >> 5)); carry = (value & 31) << 11; break;
                case 11: compressed += String.fromCharCode(carry | (value >> 4)); carry = (value & 15) << 12; break;
                case 12: compressed += String.fromCharCode(carry | (value >> 3)); carry = (value & 7) << 13; break;
                case 13: compressed += String.fromCharCode(carry | (value >> 2)); carry = (value & 3) << 14; break;
                case 14: compressed += String.fromCharCode(carry | (value >> 1)); carry = (value & 1) << 15; break;
                case 15: compressed += String.fromCharCode(carry | value); status = 0; break;
            }
        }
        return decompressRaw(compressed);
    }

    function compressToUint8Array(input) {
        var compressed = compressRaw(input);
        var buffer = new Uint8Array(compressed.length * 2);
        for (var index = 0; index < compressed.length; index++) {
            var value = compressed.charCodeAt(index);
            buffer[index * 2] = value >>> 8;
            buffer[index * 2 + 1] = value % 256;
        }
        return buffer;
    }

    function decompressFromUint8Array(input) {
        if (input == null) return decompressRaw(input);
        var chars = [];
        for (var index = 0; index < input.length; index += 2) {
            chars.push(String.fromCharCode(input[index] * 256 + input[index + 1]));
        }
        return decompressRaw(chars.join(""));
    }

    function compressToEncodedURIComponent(input) {
        return compressToBase64(input).replace(/=/g, "$").replace(/\//g, "-");
    }

    function decompressFromEncodedURIComponent(input) {
        if (input) input = input.replace(/\$/g, "=").replace(/-/g, "/");
        return decompressFromBase64(input);
    }

    function compressRaw(input) {
        return compress(input, 16, function(value) { return String.fromCharCode(value); });
    }

    function decompressRaw(input) {
        if (input == null) return "";
        if (input === "") return null;
        return decompress(input.length, 32768, function(index) { return input.charCodeAt(index); });
    }

    function compress(uncompressed, bitsPerChar, getCharFromInt) {
        if (uncompressed == null) return "";
        var dictionary = {};
        var dictionaryToCreate = {};
        var contextC = "";
        var contextWc = "";
        var contextW = "";
        var enlargeIn = 2;
        var dictSize = 3;
        var numBits = 2;
        var data = [];
        var dataValue = 0;
        var dataPosition = 0;
        var i;
        var value;

        function writeBit(bit) {
            dataValue = (dataValue << 1) | bit;
            if (dataPosition === bitsPerChar - 1) {
                dataPosition = 0;
                data.push(getCharFromInt(dataValue));
                dataValue = 0;
            } else {
                dataPosition++;
            }
        }

        function writeValue(bitCount, number) {
            for (var bit = 0; bit < bitCount; bit++) {
                writeBit(number & 1);
                number >>= 1;
            }
        }

        for (var position = 0; position < uncompressed.length; position++) {
            contextC = uncompressed.charAt(position);
            if (!Object.prototype.hasOwnProperty.call(dictionary, contextC)) {
                dictionary[contextC] = dictSize++;
                dictionaryToCreate[contextC] = true;
            }

            contextWc = contextW + contextC;
            if (Object.prototype.hasOwnProperty.call(dictionary, contextWc)) {
                contextW = contextWc;
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, contextW)) {
                if (contextW.charCodeAt(0) < 256) {
                    writeValue(numBits, 0);
                    writeValue(8, contextW.charCodeAt(0));
                } else {
                    writeValue(numBits, 1);
                    writeValue(16, contextW.charCodeAt(0));
                }
                enlargeIn--;
                if (enlargeIn === 0) {
                    enlargeIn = Math.pow(2, numBits);
                    numBits++;
                }
                delete dictionaryToCreate[contextW];
            } else {
                value = dictionary[contextW];
                writeValue(numBits, value);
            }

            enlargeIn--;
            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits++;
            }
            dictionary[contextWc] = dictSize++;
            contextW = contextC;
        }

        if (contextW !== "") {
            if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, contextW)) {
                if (contextW.charCodeAt(0) < 256) {
                    writeValue(numBits, 0);
                    writeValue(8, contextW.charCodeAt(0));
                } else {
                    writeValue(numBits, 1);
                    writeValue(16, contextW.charCodeAt(0));
                }
                enlargeIn--;
                if (enlargeIn === 0) {
                    enlargeIn = Math.pow(2, numBits);
                    numBits++;
                }
                delete dictionaryToCreate[contextW];
            } else {
                writeValue(numBits, dictionary[contextW]);
            }

            enlargeIn--;
            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits++;
            }
        }

        writeValue(numBits, 2);
        while (true) {
            dataValue <<= 1;
            if (dataPosition === bitsPerChar - 1) {
                data.push(getCharFromInt(dataValue));
                break;
            }
            dataPosition++;
        }
        return data.join("");
    }

    function decompress(length, resetValue, getNextValue) {
        var dictionary = [];
        var enlargeIn = 4;
        var dictSize = 4;
        var numBits = 3;
        var entry = "";
        var result = [];
        var w;
        var c;
        var data = { value: getNextValue(0), position: resetValue, index: 1 };

        for (var index = 0; index < 3; index++) dictionary[index] = index;

        function readBits(bitCount) {
            var bits = 0;
            var power = 1;
            var maxPower = Math.pow(2, bitCount);
            while (power !== maxPower) {
                var resultBit = data.value & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                    data.position = resetValue;
                    data.value = getNextValue(data.index++);
                }
                bits |= (resultBit > 0 ? 1 : 0) * power;
                power <<= 1;
            }
            return bits;
        }

        var next = readBits(2);
        switch (next) {
            case 0:
                c = String.fromCharCode(readBits(8));
                break;
            case 1:
                c = String.fromCharCode(readBits(16));
                break;
            case 2:
                return "";
        }
        dictionary[3] = c;
        w = c;
        result.push(c);

        while (true) {
            if (data.index > length) return "";
            var bits = readBits(numBits);
            switch (bits) {
                case 0:
                    dictionary[dictSize++] = String.fromCharCode(readBits(8));
                    bits = dictSize - 1;
                    enlargeIn--;
                    break;
                case 1:
                    dictionary[dictSize++] = String.fromCharCode(readBits(16));
                    bits = dictSize - 1;
                    enlargeIn--;
                    break;
                case 2:
                    return result.join("");
            }

            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits++;
            }

            if (dictionary[bits]) {
                entry = dictionary[bits];
            } else if (bits === dictSize) {
                entry = w + w.charAt(0);
            } else {
                return null;
            }
            result.push(entry);
            dictionary[dictSize++] = w + entry.charAt(0);
            enlargeIn--;
            w = entry;

            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits++;
            }
        }
    }

    return {
        _keyStr: base64,
        _f: String.fromCharCode,
        compressToBase64: compressToBase64,
        decompressFromBase64: decompressFromBase64,
        compressToUTF16: compressToUTF16,
        decompressFromUTF16: decompressFromUTF16,
        compressToUint8Array: compressToUint8Array,
        decompressFromUint8Array: decompressFromUint8Array,
        compressToEncodedURIComponent: compressToEncodedURIComponent,
        decompressFromEncodedURIComponent: decompressFromEncodedURIComponent,
        compress: compressRaw,
        decompress: decompressRaw
    };
})();

if (typeof module !== "undefined" && module.exports) module.exports = LZString;
