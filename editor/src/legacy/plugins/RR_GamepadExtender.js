/*:
 * @target MZ
 * @plugindesc Gamepad Extender (VX Ace), for imported games
 * @author Lone Wolf; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_GamepadExtender.js
 *
 * The game's questions to its gamepad driver: whether a pad is connected,
 * and force feedback. Buttons and sticks are read by the engine itself.
 *   window.rrGamepadConnected()                         true with a pad
 *   window.rrGamepadVibrate(left, right, frames, pad)   strengths 0-1
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param vibration
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_GamepadExtender');
    const VIBRATION = String(params.vibration) !== 'false';
    const pads = () => { try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(p => p && p.connected); } catch (_) { return []; } };
    window.rrGamepadConnected = () => pads().length > 0;
    window.rrGamepadVibrate = (left, right, frames, index = 0) => {
        if (!VIBRATION) return;
        const pad = pads()[Number(index) || 0];
        const actuator = pad && pad.vibrationActuator;
        if (!actuator || typeof actuator.playEffect !== 'function') return;
        const clamp = (v) => Math.min(Math.max(Number(v) || 0, 0), 1);
        actuator.playEffect('dual-rumble', { duration: Math.max(0, Number(frames) || 0) * 1000 / 60, strongMagnitude: clamp(left), weakMagnitude: clamp(right) }).catch(() => {});
    };
})();
