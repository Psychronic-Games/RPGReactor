# Third-Party Notices

RPG Reactor-owned code is licensed under the repository's MIT License. The
following bundled components are not relicensed by RPG Reactor. Complete
license texts for the two header-stripped runtime bundles resolved below are
also shipped in `THIRD_PARTY_LICENSES/`.

## PixiJS

- Component: PixiJS 8.14.0
- Bundled file: `runtime/libs/pixi.js`
- Header: "PixiJS is licensed under the MIT License."
- Upstream license URL in header: <http://www.opensource.org/licenses/mit-license>

The same bundle identifies `tiny-lru` 11.4.5, copyright 2025 Jason Mulligan,
under BSD-3-Clause.

## Effekseer for WebGL

- Component: Effekseer for WebGL 1.70b
- Bundled files: `editor/libs/effekseer.min.js`, `editor/libs/effekseer.wasm`, `runtime/libs/effekseer.min.js`, and `runtime/libs/effekseer.wasm`
- Upstream: <https://github.com/effekseer/EffekseerForWebGL>
- Header: "This software is licensed under the MIT License."
- Upstream license URL in header: <http://www.opensource.org/licenses/mit-license>

## localForage

- Component: localForage 1.7.3
- Bundled file: `runtime/libs/localforage.min.js`
- Header: "(c) 2013-2017 Mozilla, Apache License 2.0"
- Upstream URL in header: <https://localforage.github.io/localForage>

## LZ-String

- Component: LZ-based compression algorithm 1.4.1
- Bundled file: `runtime/libs/lz-string.js`
- Header: "Copyright (c) 2013 Pieroxy" and "Distributed under the WTFPL, Version 2"
- License URL in header: <http://www.wtfpl.net/>

## pako

- Component: pako, a JavaScript zlib implementation
- Bundled file: `runtime/libs/pako.min.js`
- Upstream: <https://github.com/nodeca/pako>
- License: MIT
- Copyright: Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn
- Full text: [`THIRD_PARTY_LICENSES/pako-MIT.txt`](THIRD_PARTY_LICENSES/pako-MIT.txt)

The bundled minified file does not retain its upstream banner. The upstream
pako license requires preservation of the copyright and permission notice;
the full notice is included with every staged distribution.

## stb_vorbis Basis

- Component: `stb_vorbis`, the Ogg Vorbis decoder on which the bundled decoder is based
- Bundled file: `runtime/libs/vorbisdecoder.js` 1.0.1
- Upstream source: <https://github.com/nothings/stb/blob/master/stb_vorbis.c>
- Upstream license: dual MIT or Unlicense, at the recipient's option
- Copyright: Copyright (c) 2017 Sean Barrett
- Full text: [`THIRD_PARTY_LICENSES/stb-MIT-or-Unlicense.txt`](THIRD_PARTY_LICENSES/stb-MIT-or-Unlicense.txt)

The bundled file identifies `stb_vorbis` as its basis but does not reproduce
the upstream terms in its header. The complete dual-license notice from the
upstream stb repository is included with every staged distribution.

Package-manager dependencies retain the licenses recorded by their packages
and lockfile.
