//=============================================================================
// reactor_vehicles_hints.js - the label over the seat and the hint strip
//=============================================================================
//
// Loaded last of the four vehicle game files. Until the label and the strip
// are built this file holds only its namespace: boarding does not depend on
// it, and every caller asks `typeof ReactorVehicles.Hints.note === "function"`
// before it calls, so the game plays with no label drawn.
//=============================================================================

(function(root) {
    "use strict";

    const V = typeof ReactorVehicles !== "undefined" && ReactorVehicles
        ? ReactorVehicles : (root.ReactorVehicles = root.ReactorVehicles || {});
    if (!V.Hints) V.Hints = {};
})(typeof window !== "undefined" ? window : globalThis);
