/**
 * Shared HTML escaping for template-literal markup.
 *
 * Database editors interpolate user-entered strings (names, notes,
 * descriptions, messages) into `value="…"` attributes and <textarea>
 * bodies. Unescaped, a name containing `"` truncates the attribute, `&`
 * corrupts on round-trip, and `</textarea>` breaks out of the element —
 * the mangled value is then read back from the DOM and saved, so the
 * project data itself degrades. Every string interpolation goes through
 * rrEscapeHtml (attributes and element bodies alike; it escapes the
 * superset both need).
 */
function rrEscapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

if (typeof window !== 'undefined') {
    window.rrEscapeHtml = rrEscapeHtml;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = rrEscapeHtml;
}
