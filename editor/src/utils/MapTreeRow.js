/**
 * RRMapTreeRow - one row of a map tree, as the Maps panel draws it and every map picker does too (Transfer Player, the starting
 * positions, …: TransferPlayerEditor.buildMapTreeForPicker): indented by its depth (a full step for each of the
 * first six levels, with a guide line, a small one past them, so a map twenty levels down still has room for its
 * name on one line), a fold triangle or its space, a small map, its name on one line with its whole path on hover,
 * and how many maps a parent holds. The caller adds what a click does.
 */
function RRMapTreeRow({ map, name, depth = 0, trail = [], childCount = 0, open = false, onToggle = null }) {
    const FULL_LEVELS = 6, STEP = 14, DEEP_STEP = 3;
    const row = document.createElement('div');
    row.className = 'tree-item rr-map-row' + (depth > FULL_LEVELS ? ' is-deep' : '');
    row.setAttribute('data-map-id', map.id);
    row.style.paddingLeft = `${6 + Math.min(depth, FULL_LEVELS) * STEP + Math.max(0, depth - FULL_LEVELS) * DEEP_STEP}px`;
    row.style.setProperty?.('--rr-guides', `${Math.min(depth, FULL_LEVELS) * STEP}px`);
    if (childCount) {
        // One triangle, turned when open: the two arrow characters were drawn at different sizes.
        const icon = document.createElement('span');
        icon.className = 'tree-icon rr-tree-fold' + (open ? ' is-open' : '');
        icon.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M3 1.5 8 5 3 8.5Z" fill="currentColor"/></svg>';
        icon.addEventListener('click', event => { event.stopPropagation(); onToggle?.(); });
        row.appendChild(icon);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'rr-tree-fold-space';
        row.appendChild(spacer);
    }
    const glyph = document.createElement('span');
    glyph.className = 'rr-map-glyph';
    glyph.innerHTML = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.5 3.5 5.5 2l5 1.5 4-1.5v10.5l-4 1.5-5-1.5-4 1.5Z M5.5 2v10.5 M10.5 3.5V14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    row.appendChild(glyph);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'rr-map-name';
    nameSpan.textContent = name;
    row.appendChild(nameSpan);
    row.title = `${String(map.id).padStart(3, '0')}: ${trail.concat(name).join(' › ')}`;
    if (childCount) {
        const count = document.createElement('span');
        count.className = 'rr-map-count';
        count.textContent = String(childCount);
        row.appendChild(count);
    }
    return row;
}

if (typeof window !== 'undefined') window.RRMapTreeRow = RRMapTreeRow;
if (typeof module !== 'undefined' && module.exports) module.exports = RRMapTreeRow;
