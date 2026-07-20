/**
 * Character Generator part registry.
 *
 * Each part file pushes one or more descriptors here. The CharacterRenderer
 * iterates this list, filtered to the active character's selected parts.
 *
 * Descriptor shape:
 * {
 *   id:       string   — unique identifier, e.g. 'body-psychronic-body-male-01'
 *   category: string   — drawing layer group: 'body' | 'head' | 'face' |
 *                        'hair' | 'clothing' | 'hat' | 'equipment' | 'accessory'
 *   name:     string   — display name in the UI
 *   tags:     string[] — optional: ['male'|'female'|'neutral', 'human'|'beast'|...]
 *   params:   Param[]  — parameter schema (same shape as AnimationGenerator params)
 *   draw:     function(buf, W, H, direction, frame, params)
 *               buf:       Uint8ClampedArray (imageData.data), W×H RGBA
 *               W, H:      configured frame dimensions
 *               direction: 0=down(front) | 1=left | 2=right | 3=up(back)
 *               frame:     0-2 walk frame; 1 = idle/center
 *               params:    resolved parameter values { key: value }
 * }
 *
 * Layer draw order (back → front):
 *   body → clothing → head → face → hair → hat → equipment → accessory
 */

const RR_CHARACTER_REGISTRY = [];
