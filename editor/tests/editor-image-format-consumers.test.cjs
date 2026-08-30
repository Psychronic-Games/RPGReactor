const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const source = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');

test('full-image editor consumers use extension-aware asset references', () => {
    const project = source('src/ProjectController.js');
    assert.match(project, /listImageReferences\(bb1Folder\)/);
    assert.match(project, /listImageReferences\(parallaxFolder\)/);
    assert.match(project, /assets\.imageUrlFor\(folder, name\)/);

    const enemies = source('src/database/DatabaseEnemyEditor.js');
    assert.match(enemies, /findImage\([^\n]+battlerName\)/);
    assert.match(enemies, /listImageReferences\(dirPath\)/);

    const troops = source('src/database/DatabaseTroopEditor.js');
    assert.match(troops, /listImageReferences\(dir\)/);
    assert.equal((troops.match(/RRAssetFiles\.imageUrlFor\(/g) || []).length >= 2, true);

    const system = source('src/database/DatabaseSystem1Editor.js');
    assert.match(system, /listImageReferences\(titlesPath\)/);
    assert.match(system, /imageUrlFor\(titlesPath, fileName\)/);

    const tilemap = source('src/TilemapManager.js');
    assert.match(tilemap, /imageUrlFor\(parallaxRoot, parallaxName\)/);
    assert.doesNotMatch(tilemap, /parallaxName \+ '\.png'/);

    const map3d = source('src/MapEditor3D.js');
    assert.match(map3d, /imageUrlFor\(directory, name\)/);
    assert.doesNotMatch(map3d, /parallaxes[\s\S]{0,500}`\$\{name\}\.png`/);
});

test('sheet pickers and previews preserve explicit non-PNG extensions', () => {
    const animations = source('src/database/DatabaseAnimationEditor.js');
    assert.match(animations, /listImageReferences\(animDir\)/);
    assert.doesNotMatch(animations, /animation\.animation[12]Name \+ '\.png'/);

    const characters = source('src/event/CharacterGraphicPicker.js');
    assert.match(characters, /listImageReferences\(charactersPath\)/);
    assert.match(characters, /findImage\([\s\S]*characters[\s\S]*fullFilename\)/);

    const messages = source('src/event/commands/MessageCommandEditor.js');
    assert.match(messages, /listImageReferences\(facesFolder\)/);
    assert.match(messages, /findImage\(facesFolder, selectedFilename\)/);
    assert.doesNotMatch(messages, /this\.faceImage \+ '\.png'/);

    for (const file of [
        'src/EventManager.js',
        'src/event/EventPageEditor.js',
        'src/event/EventCommandList.js',
        'src/event/commands/ChangeActorImagesEditor.js',
        'src/event/commands/ShowBalloonIconEditor.js'
    ]) {
        assert.match(source(file), /RRAssetFiles\.imageUrlFor\(/, file);
    }
});

test('format-sensitive tileset and generated output paths remain PNG-specific', () => {
    assert.match(source('src/TilemapManager.js'), /name \+ '\.png'/);
    assert.match(source('src/MapEditor3D.js'), /`\$\{name\}\.png`/);
    assert.match(source('src/ProjectController.js'), /canvas\.toDataURL\('image\/png'\)/);
    assert.match(source('src/database/DatabaseTilesetEditor.js'), /fileName \+ '\.png'/);
});
