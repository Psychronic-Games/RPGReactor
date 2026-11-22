/**
 * RPG Reactor's own Steam achievements: the list (API names as set up in Steamworks > Stats & Achievements, with the
 * English name and description given there; docs/steam/ACHIEVEMENTS.md says how to set them up) and `earn(id)`,
 * which the editor calls where each one is earned. Without Steam (RRSteam unavailable) earn does nothing.
 * Steam shows the names, descriptions and icons itself, in the player's language, so nothing here is translated.
 */
(function(root) {
    'use strict';
    const LIST = [
        { id: 'NEW_PROJECT', name: 'A Blank Page', description: 'Create a new project.' },
        { id: 'FIRST_PLAYTEST', name: 'It Runs!', description: 'Playtest your game.' },
        { id: 'MAP_3D', name: 'A New Dimension', description: 'Open a map in 3D.' },
        { id: 'PROJECT_IMPORT', name: 'Welcome Home', description: 'Import a project made in another editor.' },
        { id: 'FORGE_CHARACTER', name: 'Character Smith', description: 'Add a character from the Forge to your project.' },
        { id: 'FORGE_PROP', name: 'Set Dresser', description: 'Add a prop from the Forge to your project.' },
        { id: 'FORGE_SOUND', name: 'Sound Designer', description: 'Save a sound effect made in the Forge.' },
        { id: 'BUILD_GAME', name: 'Ship It', description: 'Build your game for players.' },
        { id: 'WORKSHOP_SHARE', name: 'Show and Tell', description: 'Share a design on the Steam Workshop.' },
        { id: 'WORKSHOP_ADD', name: 'Borrowed Brilliance', description: 'Add a design from the Steam Workshop to a project.' },
        { id: 'RUNTIME_INSTALL', name: 'Reactor Online', description: 'Install the Reactor Runtime in an existing project.' },
        { id: 'FIRST_EVENT', name: 'Something Happens', description: 'Create an event on a map.' },
        { id: 'BUILD_PIECE', name: 'Groundbreaking', description: 'Place a building piece with the Builder.' },
        { id: 'SHAPE_TERRAIN', name: 'Earthmover', description: 'Reshape the land with the Builder.' },
        { id: 'PLACE_LIGHT', name: 'Let There Be Light', description: 'Place a light on a map.' },
        { id: 'MEDIA_SURFACE', name: 'Now Showing', description: 'Put a media surface on a map.' },
        { id: 'BLUEPRINT', name: 'Architect', description: 'Save a building as a blueprint.' }
    ];
    const IDS = new Set(LIST.map(a => a.id));
    const earned = new Set();

    /** Unlock achievement `id` on Steam once per session. Answers whether Steam took it. */
    function earn(id) {
        if (!IDS.has(id) || earned.has(id)) return earned.has(id);
        const steam = root.RRSteam;
        if (!steam || !steam.available()) return false;
        if (steam.unlock(id)) earned.add(id);
        return earned.has(id);
    }

    const api = { LIST, earn };
    root.RRAchievements = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
