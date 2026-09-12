const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
require('../src/utils/AssetFiles.js');
const source = fs.readFileSync(path.join(__dirname, '../src/event/commands/MessageCommandEditor.js'), 'utf8');

test('Show Text previews sample the selected face and fit the preview at every supported size', () => {
    for (const size of [32,40,48,96,144,288]) {
        const calls = [];
        const ctx = { clearRect() {}, drawImage(...args) { calls.push(args.slice(1)); } };
        const canvas = { width:144, height:144, getContext:()=>ctx };
        class Image {
            constructor() { this.naturalHeight = size * 2; this.complete = true; }
            set src(value) { this.onload(); }
        }
        const face = { sourceRect:(index,image)=>globalThis.RRFaceSheet.sourceRect(index,image,{faceSize:size}) };
        const Editor = vm.runInNewContext(source + '\nMessageCommandEditor;', {
            require, console, Image, RRFaceSheet:face,
            RRAssetFiles:{imageUrlFor:()=>'/faces.png'},
            window:{RRFaceSheet:face,RRAssetFiles:{},RRWindowskin:{METRICS:{FACE_SIZE:144}}}
        });
        const editor = Object.create(Editor.prototype);
        Object.assign(editor, {
            modal:{querySelector:()=>canvas}, faceImage:'Faces', faceIndex:5,
            projectController:{currentProject:{path:'/fixture'}},
            _projectPath:()=>'/fixture',_faceCache:{name:'Faces',image:new Image()}
        });
        editor.updateFacePreview();
        assert.deepEqual(calls.pop(),[size,size,size,size,0,0,144,144],`${size}px selection preview`);
        editor.drawPreviewFace(ctx,{faceName:'Faces',faceIndex:5},12,24);
        assert.deepEqual(calls.pop(),[size,size,size,size,12,24,144,144],`${size}px message preview`);
    }
});
