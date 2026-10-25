/**
 * RRCharacterWardrobe - the Character Builder's garments and outfits.
 *
 * Soft procedural garments are one or more pieces cut by
 * RRCharacterOutfit from the body's clothing helpers (or its skin, for gloves
 * and hoods): where along the spine, arms and legs it starts and ends, how
 * far it stands off the body, how it drapes and flares, how it is colored. An outfit is a list
 * of garments, one per slot; Fantasy, Armor and Sci-fi pieces mix freely
 * with everyday ones. Medieval plate and power armor use formed rigid sheets
 * fitted around the body and underlying clothes. Modeled garments are MakeHuman's own meshes, fitted by
 * RRCharacterClothes.
 *
 * Chain positions (see RRCharacterOutfit.CHAINS), on any body:
 *   spine  crotch -0.65, hip joint 0, top of hips 0.6, navel 1, waist 1.2,
 *          ribs 2, bust 2.8, armpit 3, neck base 3.95, chin 4.55, eyes 5.25,
 *          brow 5.5, crown 6 (even steps up to the neck, about 13 cm each)
 *   arms   collarbone 0, shoulder 1, elbow 2, wrist 3, fingertips 4
 *   legs   hip 0, knee 1, ankle 2, toes 3, toe tips 4
 *   skirt  waistband 0 .. ankle 1 (the skirt helper)
 */
(function(root) {
    'use strict';

    const front = a => Math.max(0, Math.cos(a));

    /** Necklines: the top edge of a garment on the trunk, by angle about it (0 in front). */
    const NECKLINES = {
        crew: (a) => 4.05 - 0.12 * front(a) ** 2,
        scoop: (a) => 4.0 - 0.45 * front(a) ** 2,
        v: (a) => 4.05 - 0.75 * front(a) ** 8,
        deepv: (a) => 4.05 - 1.4 * front(a) ** 10,
        boat: (a) => 3.92 + 0.04 * front(a),
        high: (a) => 4.42 - 0.08 * front(a),
        turtle: (a) => 4.6 - 0.05 * front(a),
        strapless: (a) => 3.3 - 0.05 * front(a)
    };
    const NECKLINE_CHOICES = [['crew', 'Round'], ['scoop', 'Scoop'], ['v', 'V'], ['deepv', 'Deep V'], ['boat', 'Wide'], ['high', 'High collar'], ['turtle', 'Turtleneck'], ['strapless', 'Strapless']];

    // Materials: [roughness, metalness]
    const MATERIAL = { cloth: [0.9, 0], silk: [0.45, 0], leather: [0.55, 0], metal: [0.32, 0.85], gold: [0.28, 0.95], plastic: [0.35, 0], rubber: [0.7, 0] };

    const PATTERNS = [['solid', 'Solid'], ['stripes', 'Stripes'], ['pinstripes', 'Pinstripes'], ['vstripes', 'Vertical stripes'], ['checker', 'Checks'], ['plaid', 'Plaid'], ['gradient', 'Fade'], ['halves', 'Two halves'], ['camo', 'Camouflage'], ['panels', 'Panel lines'], ['mail', 'Chain mail'], ['scales', 'Scales'], ['quilted', 'Quilted'], ['studs', 'Studded'], ['floral', 'Floral'], ['paisley', 'Paisley'], ['emblem', 'Emblem']];

    PATTERNS.push(['fleet', 'Fleet panels'], ['officer', 'Officer panels'], ['technical', 'Technical seams'], ['expedition', 'Expedition panels'], ['pressure', 'Pressure-suit panels']);

    /**
     * Knobs a garment shows: `length` (0..1, garment's own reach), `sleeves`
     * (0 none .. 1 full), `neckline`, `fit` (0 tight .. 1 loose), `open`.
     */
    const top = (item, extra) => {
        const sleeves = item.sleeves ?? 1;
        const length = item.length ?? 0.5;
        // Sleeves: none (0) keeps a strap over the collarbone, short at 0.35, elbow 0.6, full at 1.
        const armHi = sleeves <= 0.02 ? 0.55 : 0.85 + sleeves * 2.12;
        const lo = 2.2 - length * 2.4;
        return Object.assign({
            surface: 'tights',
            rules: { spine: a => [lo, NECKLINES[item.neckline || 'crew'](a)], arms: [-1, armHi], open: item.open ? 0.12 + item.open * 0.5 : 0 },
            lift: 0.006 + (item.fit ?? 0.3) * 0.012,
            drape: Math.round(3 + (item.fit ?? 0.3) * 10)
        }, extra);
    };

    const skirtPiece = (item, extra) => {
        const length = item.length ?? 0.6, flare = item.flare ?? 0.3, open = item.open || 0;
        return Object.assign({
            surface: 'skirt',
            value: (an, v) => {
                let c = Math.min(1, (length - an.skirtU[v]) * 4);
                if (open) c = Math.min(c, (Math.abs(an.angle[v * 5]) - open) * 0.8);
                if (item.slits) c = Math.min(c, Math.max(an.skirtU[v] - (1 - item.slits) * length, (Math.abs(Math.abs(an.angle[v * 5]) - Math.PI / 2) - 0.12) * 2));
                return c;
            },
            lift: 0.012,
            drape: 2,
            flare: f => flare * 0.35 * Math.pow(Math.max(0, f.u), 1.4),
            collide: true,
            // Its hem folds back a few millimeters, not all the way in to the legs.
            rimReach: f => (f.u > 0.3 ? 0.006 : Infinity)
        }, extra);
    };

    const legs = (item, extra) => {
        const length = item.length ?? 1;
        return Object.assign({
            surface: 'tights',
            rules: { spine: [-3, 0.9 + (item.rise ?? 0.3) * 0.8], legs: [-1, 0.25 + length * 1.72] },
            lift: 0.008 + (item.fit ?? 0.3) * 0.012,
            drape: Math.round(2 + (item.fit ?? 0.3) * 8),
            liftAt: item.flare ? (f => (f.fam >= 3 ? Math.max(0, f.s - 1) * item.flare * 0.05 : 0)) : null
        }, extra);
    };

    /**
     * Footwear is built round the foot (RRCharacterOutfit.shoes): a style per
     * kind, its collar or shaft from the item's length, standing further off
     * the foot with its bulk.
     */
    const SHOE_KINDS = {
        dress: { collar: { front: 0.95, side: 0.62, back: 0.92 }, toe: 0.014, point: 0.35, sole: 0.011, welt: 0.004, heel: 1, spring: 0.006, gap: 0.003, wall: 0.02 },
        sneaker: { collar: { front: 1.32, side: 0.88, back: 1.08 }, toe: 0.01, point: 0, width: 0.004, sole: 0.022, welt: 0.003, heel: 0, spring: 0.01, gap: 0.005, wall: 0.028, laces: true },
        boot: { toe: 0.012, point: 0.1, sole: 0.016, welt: 0.005, heel: 1, spring: 0.007, gap: 0.004, wall: 0.026, margin: 0.012 },
        sabaton: { toe: 0.022, point: 0.6, sole: 0.012, welt: 0.003, heel: 0.6, spring: 0.012, gap: 0.009, wall: 0.03, lames: 2, margin: 0.012 },
        mag: { toe: 0.009, point: 0, width: 0.004, sole: 0.021, welt: 0.004, heel: 0, spring: 0.006, gap: 0.014, wall: 0.022, margin: 0.008, rigidFoot: true },
        sandal: { sandal: true, toe: 0.006, point: 0.15, sole: 0.014, welt: 0.002, heel: 0.4, spring: 0.004, gap: 0.002 }
    };
    const shoe = (kind, item, extra) => {
        const style = Object.assign({}, SHOE_KINDS[kind], extra);
        style.gap = Math.round(((style.gap || 0) + (item.bulk ?? 0) * 0.008) * 1e4) / 1e4;
        if (kind !== 'dress' && kind !== 'sneaker' && kind !== 'sandal') style.top = Math.round((1.98 - (item.length ?? 0.35) * 1.6) * 100) / 100;
        // Short boots lace up the front; tall ones pull on.
        if (kind === 'boot') style.laces = (item.length ?? 0.35) <= 0.6;
        return { shoe: style, kind };
    };

    const hands = (item, extra) => Object.assign({
        surface: 'body',
        hideMargin: 0.12,
        rules: { arms: [3.0 - (item.length ?? 0.15) * 1.0, 9] },
        lift: 0.003 + (item.bulk ?? 0) * 0.02,
        drape: 0,
        rim: (item.length ?? 0.15) > 0.05
    }, extra);

    /** A head covering cut from the skin: everything above `from` on the head, the face left open unless `face`. */
    const headPiece = (item, extra) => {
        const from = 5 + (1 - (item.length ?? 0.5)) * 0.9;
        const face = item.face ?? 0;
        return Object.assign({
            surface: 'body',
            value: (an, v) => {
                const sv = an.s[v * 5], a = an.angle[v * 5], m = an.member[v * 5];
                if (m < 0.5) return -1;
                let c = sv - from;
                // The face opening: in front, between the chin and the brow.
                const open = (0.95 - face * 0.6) - Math.abs(a);
                const band = Math.min(sv - (4.4 + face * 0.4), 5.62 - face * 0.25 - sv);
                if (face < 1) c = Math.min(c, -Math.min(open * 1.2, band));
                return Math.max(-1, Math.min(1, c));
            },
            lift: 0.006,
            drape: 6
        }, extra);
    };

    const plates = (base, bands) => Object.assign(base, { bands });

    // A top worn with a skirt piece of its own: its hem (spine 0.4) under the skirt's waistband (0.7 in front,
    // 0.9 behind), so no skin shows between them on any body.
    const BODICE = 0.75;

    // ── the catalog ───────────────────────────────────────────────────────
    // slot: one garment per slot. group: where the picker lists it.
    const GARMENTS = [
        // Everyday
        { id: 'tshirt', label: 'T-shirt', slot: 'top', group: 'Everyday', knobs: ['sleeves', 'length', 'neckline', 'fit'], defaults: { color: '#3d6fb6', sleeves: 0.3, length: 0.62, neckline: 'crew', fit: 0.35, material: 'cloth', trimWidth: 0.05 },
            pieces: i => [top(i)] },
        { id: 'tanktop', label: 'Tank top', slot: 'top', group: 'Everyday', knobs: ['length', 'neckline', 'fit'], defaults: { color: '#e8e2d4', sleeves: 0, length: 0.5, neckline: 'scoop', fit: 0.2, material: 'cloth' },
            pieces: i => [top(Object.assign({}, i, { sleeves: 0 }))] },
        { id: 'shirt', label: 'Button shirt', slot: 'top', group: 'Everyday', knobs: ['sleeves', 'length', 'neckline', 'fit'], defaults: { color: '#f2f0ea', color2: '#c8d4e4', sleeves: 1, length: 0.55, neckline: 'crew', fit: 0.4, material: 'cloth', pattern: 'solid', trim: '#ffffff', trimWidth: 0.06 },
            pieces: i => [top({...i,neckline:i.neckline==='high'?'crew':i.neckline}), { collar: { open: i.neckline === 'high' ? 0.06 : 0.24 } }] },
        { id: 'sweater', label: 'Sweater', slot: 'top', group: 'Everyday', knobs: ['sleeves', 'length', 'neckline', 'fit'], defaults: { color: '#7a3b3b', color2: '#5a2a2a', sleeves: 1, length: 0.6, neckline: 'turtle', fit: 0.6, material: 'cloth', pattern: 'stripes', scale: 0.6, trimWidth: 0.12 },
            pieces: i => [top(i, { lift: 0.014 + (i.fit ?? 0.5) * 0.012 })] },
        { id: 'hoodie', label: 'Hoodie', slot: 'top', group: 'Everyday', knobs: ['length', 'fit'], defaults: { color: '#4a4f58', sleeves: 1, length: 0.65, neckline: 'crew', fit: 0.7, material: 'cloth', trim: '#3a3e46', trimWidth: 0.1 },
            pieces: i => [top(Object.assign({}, i, { sleeves: 1 }), { lift: 0.016 }), hood(i)] },
        { id: 'jeans', label: 'Trousers', slot: 'bottom', group: 'Everyday', knobs: ['length', 'fit'], defaults: { color: '#2f4468', length: 1, fit: 0.3, material: 'cloth', trim: '#22314b', trimWidth: 0.05 },
            pieces: i => [legs(i)] },
        { id: 'shorts', label: 'Shorts', slot: 'bottom', group: 'Everyday', knobs: ['length', 'fit'], defaults: { color: '#7a6a4f', length: 0.18, fit: 0.45, material: 'cloth', trimWidth: 0.05 },
            pieces: i => [legs(i)] },
        { id: 'leggings', label: 'Leggings', slot: 'bottom', group: 'Everyday', knobs: ['length'], defaults: { color: '#1f1f24', length: 0.95, fit: 0, material: 'cloth' },
            pieces: i => [legs(Object.assign({}, i, { fit: 0 }), { lift: 0.004, drape: 1 })] },
        { id: 'skirt', label: 'Skirt', slot: 'bottom', group: 'Everyday', knobs: ['length', 'flare'], defaults: { color: '#5b3a6e', length: 0.35, flare: 0.35, material: 'cloth', trimWidth: 0.04 },
            pieces: i => [skirtPiece(i)] },
        { id: 'dress', label: 'Dress', slot: 'dress', group: 'Everyday', knobs: ['sleeves', 'length', 'flare', 'neckline'], defaults: { color: '#a8324a', sleeves: 0.25, length: 0.7, flare: 0.5, neckline: 'scoop', material: 'silk', trimWidth: 0.04 },
            pieces: i => [top(Object.assign({}, i, { length: BODICE }), { lift: 0.006, drape: 3 }), skirtPiece(i)] },
        { id: 'suitjacket', label: 'Suit jacket', slot: 'over', group: 'Everyday', knobs: ['length', 'fit'], defaults: { color: '#2b2e36', length: 0.75, fit: 0.4, material: 'cloth', open: 0.25, neckline: 'deepv', trimWidth: 0.04, trim: '#1e2026' },
            pieces: i => [top(Object.assign({}, i, { sleeves: 1, neckline: 'deepv' }), { lift: 0.022, drape: 6 })] },
        { id: 'trenchcoat', label: 'Long coat', slot: 'over', group: 'Everyday', knobs: ['length', 'fit', 'flare'], defaults: { color: '#7b6345', length: 0.85, flare: 0.25, fit: 0.5, material: 'leather', open: 0.2, trimWidth: 0.05, trim: '#5e4a32' },
            pieces: i => [top(Object.assign({}, i, { sleeves: 1, length: BODICE, neckline: 'crew' }), { lift: 0.024, drape: 6 }), skirtPiece(Object.assign({}, i, { open: 0.25 }), { lift: 0.03 }),{collar:{stand:.04,fall:.035,open:.30,gap:.012}}] },
        { id: 'sneakers', label: 'Sneakers', slot: 'feet', group: 'Everyday', knobs: ['color2'], defaults: { color: '#f4f4f4', color2: '#d03a3a', bulk: 0, material: 'rubber', trim: '#e8e8e8' },
            pieces: i => [shoe('sneaker', i)] },
        { id: 'shoes', label: 'Dress shoes', slot: 'feet', group: 'Everyday', defaults: { color: '#1b1612', bulk: 0, material: 'leather' },
            pieces: i => [shoe('dress', i)] },
        { id: 'boots', label: 'Boots', slot: 'feet', group: 'Everyday', knobs: ['length'], defaults: { color: '#4a3020', length: 0.35, bulk: 0, material: 'leather', trim: '#2c1c12' },
            pieces: i => [shoe('boot', i)] },
        { id: 'gloves', label: 'Gloves', slot: 'hands', group: 'Everyday', knobs: ['length'], defaults: { color: '#2a2420', length: 0.2, material: 'leather' },
            pieces: i => [hands(i)] },
        { id: 'beanie', label: 'Beanie', slot: 'head', group: 'Everyday', defaults: { color: '#b84a2e', length: 0.45, material: 'cloth', pattern: 'stripes', color2: '#e8d8b8', trimWidth: 0.12 },
            pieces: i => [headPiece(Object.assign({ length: 0.5 }, i), { lift: 0.012, drape: 8, value: beanieValue })] },

        // Fantasy and medieval
        { id: 'gambeson', label: 'Gambeson', slot: 'top', group: 'Armor', knobs: ['sleeves', 'length', 'fit'], defaults: { color: '#b5a381', color2: '#776548', trim: '#59452f', sleeves: .9, length: .65, fit: .4, neckline: 'high', material: 'cloth', pattern: 'quilted', trimWidth: .045 },
            pieces: i => [top(Object.assign({},i,{length:BODICE}),{lift:.018,drape:5}),skirtPiece({length:i.length*.7,flare:.22},{lift:.032,rimReach:()=>.006,look:'same'})] },
        { id: 'tabard', label: 'Heraldic tabard', slot: 'over', group: 'Fantasy', knobs: ['length'], defaults: { color: '#284b7e', color2: '#d5b767', trim: '#d5b767', length: .7, sleeves: 0, neckline: 'crew', material: 'cloth', pattern: 'emblem', trimWidth: .055 },
            pieces: i => [top(Object.assign({},i,{length:BODICE,sleeves:0}),{lift:.028,drape:5}),skirtPiece(i,{lift:.03,rimReach:()=>.006,value:(an,v)=>Math.min((i.length-an.skirtU[v])*4,(an.height*.13-Math.abs(an.rest[v*3]))*4),look:'same'})] },
        { id: 'tunic', label: 'Tunic', slot: 'top', group: 'Fantasy', knobs: ['sleeves', 'length', 'neckline', 'fit'], defaults: { color: '#6b7a3a', sleeves: 0.85, length: 0.55, neckline: 'v', fit: 0.6, material: 'cloth', trim: '#c9a35a', trimWidth: 0.07 },
            pieces: i => [top(Object.assign({}, i, { length: BODICE }), { lift: 0.014 }), skirtPiece({ length: (i.length ?? 0.55) * 0.55, flare: 0.25, slits: 0.5 }, { lift: 0.018, look: 'same' })] },
        { id: 'peasant', label: 'Peasant blouse', slot: 'top', group: 'Fantasy', knobs: ['sleeves', 'length'], defaults: { color: '#ece3cf', sleeves: 0.9, length: 0.45, neckline: 'boat', fit: 0.8, material: 'cloth', bell: 0.5 },
            pieces: i => [top(Object.assign({}, i, { neckline: 'boat' }), { liftAt: bellSleeves(i.bell ?? 0.5) })] },
        { id: 'robe', label: 'Robe', slot: 'dress', group: 'Fantasy', knobs: ['length', 'flare', 'bell', 'neckline'], defaults: { color: '#2e3f8a', length: 1, flare: 0.45, bell: 0.8, neckline: 'v', material: 'cloth', trim: '#d4af37', trimWidth: 0.08 },
            pieces: i => [top(Object.assign({}, i, { sleeves: 1, length: BODICE, fit: 0.7 }), { liftAt: bellSleeves(i.bell ?? 0.8) }), skirtPiece(i, { lift: 0.02 })] },
        { id: 'gown', label: 'Gown', slot: 'dress', group: 'Fantasy', knobs: ['sleeves', 'flare', 'neckline'], defaults: { color: '#7c2a6b', color2: '#d8b4d0', sleeves: 0, length: 1, flare: 0.9, neckline: 'strapless', material: 'silk', trim: '#e8d39a', trimWidth: 0.05, pattern: 'gradient', from: 0.5, to: -3 },
            pieces: i => [top(Object.assign({}, i, { length: BODICE, fit: 0.05 }), { lift: 0.005, drape: 2 }), skirtPiece(Object.assign({}, i, { length: 1 }), { lift: 0.02 })] },
        { id: 'vest', label: 'Vest', slot: 'over', group: 'Fantasy', knobs: ['length', 'open'], defaults: { color: '#5a3d22', length: 0.45, open: 0.1, material: 'leather', neckline: 'deepv', trim: '#3a2614', trimWidth: 0.06 },
            pieces: i => [top(Object.assign({}, i, { sleeves: 0, neckline: 'deepv', fit: 0.3 }), { lift: 0.02, drape: 5 })] },
        { id: 'corset', label: 'Corset', slot: 'waist', group: 'Fantasy', defaults: { color: '#3a1e2a', color2: '#5a3040', material: 'leather', pattern: 'vstripes', scale: 1.5, trim: '#c9a35a', trimWidth: 0.08 },
            pieces: i => [{ surface: 'tights', rules: { spine: a => [0.55, 2.75 - 0.25 * front(a)] }, lift: 0.024, drape: 6 }] },
        { id: 'sash', label: 'Belt', slot: 'waist', group: 'Fantasy', knobs: [], defaults: { color: '#3a2618', material: 'leather', trim: '#2a1a10', trimWidth: 0 },
            pieces: i => [{ band: { from: 0.88, to: 1.25 } }] },
        { id: 'kilt', label: 'Kilt', slot: 'bottom', group: 'Fantasy', knobs: ['length'], defaults: { color: '#2f5a3a', color2: '#8a2a2a', length: 0.32, flare: 0.25, material: 'cloth', pattern: 'plaid', scale: 1.4 },
            pieces: i => [skirtPiece(i)] },
        { id: 'loincloth', label: 'Loincloth', slot: 'bottom', group: 'Fantasy', knobs: ['length'], defaults: { color: '#6a4a2a', length: 0.4, material: 'leather' },
            pieces: i => [{ apronPanels: true }, { surface: 'tights', rules: { spine: [-3, .85], legs: [-1, 0.05] }, lift: 0.008, drape: 2 }] },
        { id: 'hood', label: 'Hood', slot: 'head', group: 'Fantasy', knobs: ['face'], defaults: { color: '#3b3b46', length: 0.95, face: 0, material: 'cloth' },
            pieces: i => [hood(i)] },
        { id: 'sandals', label: 'Sandals', slot: 'feet', group: 'Fantasy', defaults: { color: '#7a5636', material: 'leather' },
            pieces: i => [shoe('sandal', i), { surface: 'body', value: sandalStraps, smoothCut: 1, lift: 0.003, drape: 0, hides: false, look: 'same' }] },
        { id: 'wraps', label: 'Arm wraps', slot: 'wrists', group: 'Fantasy', knobs: ['length'], defaults: { color: '#d8ccb0', length: 0.5, material: 'cloth', pattern: 'pinstripes', color2: '#b8ac90' },
            pieces: i => [{ surface: 'tights', rules: { arms: [2.95 - (i.length ?? 0.5) * 0.9, 3.05] }, lift: 0.01, drape: 1 }] },

        // Armor
        { id: 'leatherarmor', label: 'Leather armor', slot: 'armor', group: 'Armor', defaults: { color: '#6a4426', color2: '#4e301a', material: 'leather', pattern: 'stripes', scale: 0.7, trim: '#3a2414', trimWidth: 0.06 },
            pieces: i => [{ surface: 'tights', rules: { spine: a => [0.45, NECKLINES.crew(a) - 0.05], arms: [-1, 1.05] }, lift: 0.024, drape: 8 }] },
        { id: 'chainmail', label: 'Chain mail', slot: 'mail', group: 'Armor', knobs: ['sleeves', 'length'], defaults: { color: '#8c9198', color2: '#6d7278', sleeves: 0.6, length: 0.7, material: 'metal', pattern: 'mail', neckline: 'crew' },
            pieces: i => [top(Object.assign({}, i, { length: BODICE, fit: 0.5 }), { lift: 0.018 }), skirtPiece({ length: (i.length ?? 0.7) * 0.5, flare: 0.2, slits: 0.6 }, { lift: 0.022, look: 'same' })] },
        { id: 'breastplate', label: 'Breastplate', slot: 'armor', group: 'Armor', defaults: { color: '#b6bcc4', color2: '#8e949c', material: 'metal', trim: '#d4af37', trimWidth: 0.05 },
            pieces: () => [{ plateArmor: 'breastplate' }] },
        { id: 'pauldrons', label: 'Pauldrons', slot: 'shoulders', group: 'Armor', knobs: ['bulk'], defaults: { color: '#b6bcc4', material: 'metal', bulk: 0.5, trim: '#d4af37', trimWidth: 0.08 },
            pieces: () => [{ plateArmor: 'pauldrons' }] },
        { id: 'vambraces', label: 'Bracers', slot: 'wrists', group: 'Armor', defaults: { color: '#9aa0a8', material: 'metal', trim: '#6a7078', trimWidth: 0.1 },
            pieces: () => [{ plateArmor: 'vambraces' }] },
        { id: 'gauntlets', label: 'Gauntlets', slot: 'hands', group: 'Armor', defaults: { color: '#9aa0a8', length: 0.25, bulk: 0.5, material: 'metal' },
            pieces: i => [hands(i, { lift: 0.004, drape: 1 }), { plateArmor: 'gauntlets' }] },
        { id: 'tassets', label: 'Tassets', slot: 'hips', group: 'Armor', defaults: { color: '#a8aeb6', length: 0.3, flare: 0.3, material: 'metal', trim: '#d4af37', trimWidth: 0.06 },
            pieces: () => [{ plateArmor: 'tassets' }] },
        { id: 'greaves', label: 'Leg armor', slot: 'legarmor', group: 'Armor', defaults: { color: '#a8aeb6', material: 'metal', trim: '#7a8088', trimWidth: 0.05 },
            pieces: () => [{ plateArmor: 'greaves' }] },
        { id: 'sabatons', label: 'Armored boots', slot: 'feet', group: 'Armor', defaults: { color: '#9aa0a8', length: 0.3, bulk: 0.5, material: 'metal' },
            pieces: i => [shoe('dress', i, Object.assign({}, SHOE_KINDS.sabaton, { collar: { front: 1.35 + (i.length ?? 0.3), side: 1.2 + (i.length ?? 0.3), back: 1.25 + (i.length ?? 0.3) }, wall: 0.012, sole: 0.009, lames: 4 }))] },
        { id: 'helm', label: 'Helmet', slot: 'head', group: 'Armor', knobs: ['face'], defaults: { color: '#b0b6be', length: 0.9, face: 0.2, material: 'metal', trim: '#d4af37', trimWidth: 0.05 },
            pieces: i => [{ helm: { square: 2.2, flat: 0.15, gap: 0.011, bottom: 0.6, window: { half: Math.round((1.15 - (i.face ?? 0.2) * 0.45) * 100) / 100, low: Math.round((-0.2 + (i.face ?? 0.2) * 0.1) * 1000) / 1000, high: 0.028, open: true } } }] },
        { id: 'greathelm', label: 'Great helm', slot: 'head', group: 'Armor', defaults: { color: '#a0a6ae', trim: '#7a8088', length: 1, face: 1, material: 'metal' },
            pieces: i => [{ helm: { square: 3.6, flat: 0.85, gap: 0.014, bottom: 0.15, slit: true } }] },

        // Sci-fi
        { id: 'starshipUniform', label: 'Starship uniform', slot: 'dress', group: 'Sci-fi', knobs: ['fit', 'neckline'], defaults: { color: '#202734', color2: '#a32c3c', trim: '#d8c793', fit: 0.18, neckline: 'high', material: 'cloth', pattern: 'fleet', lightStyle: 'badge', lightColor: '#81dfff', lightIntensity: 0.25, lightWidth: 1 },
            pieces: i => [{ surface: 'tights', rules: { spine: a => [-3, NECKLINES[i.neckline || 'high'](a)], arms: [-1, 2.98], legs: [-1, 9] }, lift: 0.008 + i.fit * 0.008, drape: 4 }, { scifiGear: 'uniform' }] },
        { id: 'officerJacket', label: 'Officer jacket', slot: 'over', group: 'Sci-fi', knobs: ['fit', 'sleeves', 'neckline', 'open'], defaults: { color: '#e0e4e9', color2: '#28384f', trim: '#c9a85c', fit: 0.25, sleeves: 1, length: 0.58, neckline: 'high', open: 0, material: 'cloth', pattern: 'officer', lightStyle: 'badge', lightColor: '#77caff', lightIntensity: 0.3, lightWidth: 1 },
            pieces: i => [top(i, { lift: 0.02, drape: 5 }), { scifiGear: 'uniform' }] },
        { id: 'techSuit', label: 'Technical undersuit', slot: 'under', group: 'Sci-fi', knobs: ['fit', 'neckline'], defaults: { color: '#141c27', color2: '#354453', trim: '#5f7987', fit: 0.1, neckline: 'turtle', material: 'rubber', pattern: 'technical', lightStyle: 'circuits', lightColor: '#34dbdc', lightIntensity: 0.3, lightWidth: 0.8 },
            pieces: i => [{ surface: 'tights', rules: { spine: a => [-3, NECKLINES[i.neckline || 'turtle'](a)], arms: [-1, 3.04], legs: [-1, 9] }, lift: 0.005 + i.fit * 0.006, drape: 2 }, { scifiGear: 'utility' }] },
        { id: 'explorerSuit', label: 'Planetary exploration suit', slot: 'dress', group: 'Sci-fi', knobs: ['bulk', 'fit'], defaults: { color: '#bbc7cc', color2: '#28587d', trim: '#303f4c', bulk: 0.35, fit: 0.3, material: 'cloth', pattern: 'solid', lightStyle: 'badge', lightColor: '#71cfff', lightIntensity: 0.3, lightWidth: 0.8 },
            pieces: i => [{ surface: 'tights', rules: { spine: [-3, 4.48], arms: [-1, 3.02], legs: [-1, 9] }, lift: 0.014 + i.bulk * 0.018 + i.fit * 0.008, drape: 7 }, { scifiGear: 'utility' }] },
        { id: 'evaSuit', label: 'EVA pressure suit', slot: 'dress', group: 'Sci-fi', knobs: ['bulk', 'fit'], defaults: { color: '#e6e8e4', color2: '#cb692c', trim: '#303b47', bulk: 0.6, fit: 0.4, material: 'cloth', pattern: 'solid', lightStyle: 'badge', lightColor: '#82e5ff', lightIntensity: 0.35, lightWidth: 0.8 },
            pieces: i => [{ surface: 'tights', rules: { spine: [-3, 4.65], arms: [-1, 3.08], legs: [-1, 9] }, lift: 0.022 + i.bulk * 0.02 + i.fit * 0.008, drape: 9 }, { scifiGear: 'pressure' }] },
        { id: 'reconArmor', label: 'Recon armor', slot: 'armor', group: 'Sci-fi', knobs: ['bulk'], defaults: { color: '#465a68', color2: '#a8764d', trim: '#1b2832', bulk: 0.35, material: 'plastic', pattern: 'expedition', lightStyle: 'strips', lightColor: '#48caff', lightIntensity: 0.8, lightWidth: 1 },
            pieces: i => [{ scifiGear: 'recon' }] },
        { id: 'bodysuit', label: 'Bodysuit', slot: 'under', group: 'Sci-fi', knobs: ['color2'], defaults: { color: '#20242c', color2: '#36c2ff', material: 'rubber', pattern: 'panels', neckline: 'high' },
            pieces: i => [{ surface: 'tights', rules: { spine: a => [-3, NECKLINES[i.neckline || 'high'](a)], arms: [-1, 2.98], legs: [-1, 9] }, lift: 0.004, drape: 1 }, { scifiGear: 'utility' }] },
        { id: 'spacesuit', label: 'Space suit', slot: 'dress', group: 'Sci-fi', defaults: { color: '#e9ebee', color2: '#d86a2a', material: 'cloth', pattern: 'solid', lightStyle: 'badge', lightColor: '#82e5ff', lightIntensity: 0.25, lightWidth: 0.8, trim: '#303b47', trimWidth: 0.02 },
            pieces: i => [{ surface: 'tights', rules: { spine: a => [-3, 4.3], arms: [-1, 2.95], legs: [-1, 9] }, lift: 0.035, drape: 14 }, { scifiGear: 'pressure' }] },
        { id: 'tacvest', label: 'Tactical vest', slot: 'armor', group: 'Sci-fi', defaults: { color: '#3c4436', color2: '#2c3228', material: 'cloth', pattern: 'camo', trim: '#22281e', trimWidth: 0.05 },
            pieces: i => [{ scifiGear: 'vest' }] },
        { id: 'powerarmor', label: 'Power armor', slot: 'armor', group: 'Sci-fi', knobs: ['bulk', 'color2'], defaults: { color: '#606d70', color2: '#e5ad55', bulk: 0.6, material: 'metal', pattern: 'solid', trim: '#273137', trimWidth: 0 },
            pieces: i => powerArmor(i) },
        // [outfit transfer] RRCharacterPowerArmor's armored hands alone: a glove with a rigid plate over the back of each hand.
        { id: 'powergauntlets', label: 'Power gauntlets', slot: 'hands', group: 'Sci-fi', knobs: ['color2'], defaults: { color: '#606d70', color2: '#e5ad55', bulk: 0.6, material: 'metal', pattern: 'solid', trim: '#273137', trimWidth: 0 },
            pieces: () => [{ poweredArmor: true, only: 'hands' }] },
        { id: 'powerhelm', label: 'Power armor helmet', slot: 'head', group: 'Sci-fi', knobs: ['color2'], defaults: { color: '#606d70', color2: '#e5ad55', trim: '#273137', material: 'metal' }, pieces: () => [{ poweredHelmet: true }] },
        { id: 'cyberjacket', label: 'Neon jacket', slot: 'over', group: 'Sci-fi', defaults: { color: '#16141c', color2: '#ff2bd6', length: 0.55, material: 'plastic', open: 0.35, neckline: 'high', trim: '#ff2bd6', trimWidth: 0.05 },
            pieces: i => [top(Object.assign({}, i, { sleeves: 1, neckline: 'high' }), { lift: 0.02, drape: 5 })] },
        { id: 'visorhelm', label: 'Visor helmet', slot: 'head', group: 'Sci-fi', defaults: { color: '#e4e7eb', color2: '#1a2a40', trim: '#9aa0a8', length: 1.1, face: 1, material: 'plastic' },
            pieces: i => [{ helm: { square: 2.1, flat: 0, gap: 0.018, bottom: 0.2, window: { half: 1.05, low: -0.055, high: 0.035, visor: true } } }] },
        { id: 'magboots', label: 'Mag boots', slot: 'feet', group: 'Sci-fi', defaults: { color: '#5a606a', color2: '#36c2ff', length: 0.32, bulk: 0.45, material: 'plastic', pattern: 'panels', trim: '#2a2e34', trimWidth: 0.08 },
            pieces: i => [shoe('mag', i)] },

        // Generated cuts: no external garment mesh or texture is needed for these.
        ...generatedGarments(),

        // Modeled: MakeHuman's own garments (RRCharacterClothes), fitted to the body, in their own colors until one is chosen.
        modeled('mh_tee_jeans', 'T-shirt and jeans', 'dress'),
        modeled('mh_fitted_jeans', 'Fitted tee and jeans', 'dress'),
        modeled('mh_tee_shorts', 'Tee and denim shorts', 'dress'),
        modeled('mh_jacket_jeans', 'Jacket and jeans', 'dress'),
        modeled('mh_sport', 'Crop top and leggings', 'dress'),
        modeled('mh_overalls', 'Overalls', 'dress'),
        modeled('mh_suit', 'Suit and tie', 'dress'),
        modeled('mh_skirtsuit', 'Blouse and pencil skirt', 'dress'),
        modeled('mh_sundress', 'Sundress', 'dress'),
        modeled('mh_uniform', 'Star uniform', 'dress'),
        modeled('mh_sweater', 'Knit sweater', 'top'),
        modeled('mh_viking_tunic', 'Viking tunic', 'top'),
        modeled('mh_viking_trousers', 'Viking trousers', 'bottom'),
        modeled('mh_loafers', 'Loafers', 'feet', 'leather', 0),
        modeled('mh_sneakers', 'Running shoes', 'feet', 'rubber', 0),
        modeled('mh_boots', 'Tall boots', 'feet', 'leather', 2),
        modeled('mh_viking_boots', 'Viking boots', 'feet', 'leather', 2),

        // [outfit transfer] Taken from the Star Shift actors' own 3D models (RRCharacterOutfitTransfer, data/outfits).
        taken('ss_carol_uniform', "Captain's uniform (Carol)", 'dress', 'carol', 'uniform', [0.55, 0]),
        taken('ss_jolt_armor', 'Power armor (Jolt)', 'armor', 'jolt', 'armor', [0.45, 0.2]),
        taken('ss_jolt_legs', 'Leg armor (Jolt)', 'legarmor', 'jolt', 'legs', [0.45, 0.2]),
        taken('ss_jolt_boots', 'Armored boots (Jolt)', 'feet', 'jolt', 'boots', [0.45, 0.2]),
        taken('ss_max_armor', 'Power armor (Max)', 'armor', 'max', 'armor', [0.45, 0.2]),
        taken('ss_max_legs', 'Leg armor (Max)', 'legarmor', 'max', 'legs', [0.45, 0.2]),
        taken('ss_max_boots', 'Armored boots (Max)', 'feet', 'max', 'boots', [0.45, 0.2]),
        taken('ss_vay_robes', 'Royal robes (Vay)', 'dress', 'vay', 'robes', [0.6, 0]),
        taken('ss_vay_boots', 'Royal boots (Vay)', 'feet', 'vay', 'boots', [0.5, 0.15])
    ];

    /**
     * A modeled garment: no pieces to cut; `color` and `color2` recolor its own
     * picture when set. `rank`: shoes 0 (under trouser hems), clothes 1, tall
     * boots 2 (over them).
     */
    function modeled(id, label, slot, material, rank) {
        return { id, label, slot, group: id==='mh_uniform'?'Sci-fi':id.startsWith('mh_viking')?'Fantasy':id==='mh_suit'||id==='mh_skirtsuit'?'Formal':'Everyday', modeled: true, rank: rank ?? 1, knobs: [], defaults: { material: material || 'cloth' }, pieces: () => [] };
    }

    /**
     * [outfit transfer] A garment taken from a model: part `part` of outfit `outfit`
     * (RRCharacterOutfitTransfer), shown in its own picture until a color is
     * chosen; `finish` is its [roughness, metalness].
     */
    function taken(id, label, slot, outfit, part, finish, group) {
        return { id, label, slot, group: group || 'Sci-fi', transfer: outfit, part, roughness: finish[0], metalness: finish[1], knobs: [], defaults: { material: 'cloth' }, pieces: () => [] };
    }

    function hood(i) {
        // Use a sewn opening on a smooth head envelope. Offsetting the face
        // mesh made the lip/eyelid topology into jagged folds inside the hood.
        const face = i.face ?? 0;
        return { helm: { clothHood:true, square:2, flat:0, gap:.028, bottom:.25,
            window:{half:1.25-face*.45,low:-.17+face*.08,high:.045,open:true} } };
    }
    /** A plate standing well off the chest closes in to the neck at its top edge, rather than flaring round it. */
    function closeAtNeck(lift) {
        return f => (f.fam === 0 ? -Math.max(0, lift - 0.028) * (f.s > 3.0 ? Math.min(1, (f.s - 3.0) / 1.0) ** 2 : 0) : 0);
    }
    function bellSleeves(amount) {
        return f => (f.fam === 1 || f.fam === 2 ? Math.max(0, f.s - 1.8) ** 1.6 * amount * 0.07 : 0);
    }
    function beanieValue(an, v) {
        if (an.member[v * 5] < 0.5) return -1;
        return Math.max(-1, Math.min(1, an.s[v * 5] - 5.5 + 0.3 * Math.max(0, -Math.cos(an.angle[v * 5]))));
    }
    /**
     * A sandal's straps on the skin of the foot: across the toes, over the
     * instep, round the ankle and down behind the heel, in the foot's own
     * frame on the average body.
     */
    function sandalStraps(an, v) {
        const fam = an.member[v * 5 + 3] >= an.member[v * 5 + 4] ? 3 : 4;
        if (an.member[v * 5 + fam] < 0.5 || an.s[v * 5 + fam] < 1.7) return -1;
        const ch = an.chains[fam === 3 ? 'legL' : 'legR'], ankle = ch[2], tip = ch[4];
        let fx = tip[0] - ankle[0], fz = tip[2] - ankle[2];
        const l = Math.hypot(fx, fz); fx /= l; fz /= l;
        const x = an.rest[v * 3] - ankle[0], z = an.rest[v * 3 + 2] - ankle[2], y = an.rest[v * 3 + 1];
        const f = x * fx + z * fz, side = Math.abs(x * fz - z * fx);
        if (y < 0.007) return -1;
        const strip = (c, w) => (w - Math.abs(f - c)) * 150;
        const toes = strip(0.102, 0.0075), instep = strip(0.05, 0.007);
        const ankleRing = f < 0.065 ? (0.0055 - Math.abs(y - ankle[1] * 1.02)) * 150 : -1;
        const heel = Math.min((0.0065 - side) * 150, (ankle[1] * 1.02 - y) * 150, -f * 150 - 1.5);
        return Math.max(-1, Math.min(1, Math.max(toes, instep, ankleRing, heel)));
    }
    function powerArmor(i) {
        return [
            { poweredArmor: true },
            // The rubber undersuit stands 9 mm off the skin. Leave room for
            // that layer and the ankle's mixed shin/foot bend inside the boot.
            Object.assign(shoe('mag', { length: 0.4, bulk: (i.bulk ?? 0.6) * 0.6 }, { lames: 3 }), { armorFeet: true })
        ];
    }

    const BY_ID = new Map(GARMENTS.map(g => [g.id, g]));
    function generatedGarments() {
        const garment = (id, label, slot, group, defaults, pieces, knobs) => ({ id, label, slot, group,
            defaults: Object.assign({ color: '#536781', color2: '#ddd6c8', material: 'cloth', trimWidth: 0.04 }, defaults), pieces, knobs });
        const allInOne = i => [{ surface: 'tights', rules: { spine: [-3, 4.0], arms: [-1, 0.85 + (i.sleeves ?? 1) * 2.12], legs: [-1, 0.25 + (i.length ?? 1) * 1.72] }, lift: 0.012, drape: 5 }];
        const stocking = i => [{ surface: 'body', rules: { legs: [1.95 - (i.length ?? 0.2) * 1.9, 9] }, lift: 0.0025, drape: 0 }];
        const brief = i => [legs(Object.assign({}, i, { length: 0, fit: 0, rise: 0 }), { lift: 0.003, drape: 0, rules: { spine: [-3, 0.85], legs: [-1, 0.12] } })];
        // Triangle swimwear has its own cut; the bandeau bra/brief templates are separate garments.
        const swimPiece = value => ({ surface: 'body', lift: 0.002, drape: 0, smoothCut: 0,
            edgeSmooth: 0, rimReach: () => 0.001, closeFit: true, value });
        const bikiniTop = i => {
            const cup = side => swimPiece((an, v) => {
                if (an.member[v * 5] < 0.55) return -1;
                const x = an.rest[v * 3] * side, y = an.rest[v * 3 + 1], z = an.rest[v * 3 + 2];
                const low = 1.170, high = 1.300, t = (y - low) / (high - low);
                const center = 0.104 - 0.026 * t, half = 0.081 * (1 - t);
                return Math.min(y - low, high - y, half - Math.abs(x - center), z - 0.045) * 12;
            });
            return [cup(1), cup(-1), { swimStraps: 'top' }];
        };
        const bikiniBottom = i => [Object.assign(swimPiece((an, v) => {
            if (an.member[v * 5 + 1] > 0.4 || an.member[v * 5 + 2] > 0.4) return -1;
            const hip = an.chains.spine[0], x = Math.abs(an.rest[v * 3]), y = an.rest[v * 3 + 1], z = an.rest[v * 3 + 2];
            const angle = Math.atan2(an.rest[v * 3] - hip[0], z - hip[2] - 0.035);
            const side = Math.abs(Math.sin(angle));
            const stringY = hip[1] + 0.018 + 0.045 * side ** 1.3;
            const low = hip[1] - 0.102, high = stringY;
            const width = 0.018 + (y - low) * (Math.cos(angle) >= 0 ? 0.78 : 0.86);
            let panel = Math.min(y - low, high - y, width - x);
            for (const leg of [3, 4]) if (an.member[v * 5 + leg] > 0.6) panel = Math.min(panel, (0.10 - an.s[v * 5 + leg]) * 0.13);
            return panel * 12;
        }), { lift: 0.002 + (i.fit || 0) * 0.002 }), { swimStraps: 'bottom' }];
        const bra = i => [top(i, { rules: { spine: [2.05, 3.3], arms: [-1, 0.25] }, lift: 0.004, drape: 1 })];
        const gown = i => [top(Object.assign({}, i, { length: BODICE }), { lift: 0.008 }), skirtPiece(i)];
        return [
            garment('polo', 'Polo shirt', 'top', 'Everyday', { sleeves: 0.3, length: 0.6, fit: 0.35, neckline: 'v' }, i => [top(i), { collar: { open: 0.16 } }], ['sleeves', 'length', 'fit']),
            garment('cardigan', 'Cardigan', 'over', 'Everyday', { color: '#8a6558', sleeves: 1, length: 0.7, fit: 0.7, open: 0.3, neckline: 'deepv' }, i => [top(i, { lift: 0.02 })], ['length', 'fit', 'open']),
            garment('cropTop', 'Crop top', 'top', 'Everyday', { length: 0.05, sleeves: 0, neckline: 'scoop', fit: 0.1 }, i => [top(i)], ['sleeves', 'length', 'neckline']),
            garment('offShoulder', 'Off-shoulder blouse', 'top', 'Everyday', { color: '#e0c8b8', length: 0.5, sleeves: 0.6, neckline: 'boat', fit: 0.6 }, i => [top(i, { rules: { spine: [1, 3.35], arms: [1.15, 0.85 + i.sleeves * 2.12] } })], ['sleeves', 'fit']),
            garment('flaredTrousers', 'Flared trousers', 'bottom', 'Everyday', { length: 1, flare: 0.8, fit: 0.4 }, i => [legs(i)], ['length', 'fit', 'flare']),
            garment('capri', 'Capri trousers', 'bottom', 'Everyday', { length: 0.7, fit: 0.25 }, i => [legs(i)], ['length', 'fit']),
            garment('pleatedSkirt', 'Pleated skirt', 'bottom', 'Everyday', { length: 0.45, flare: 0.5, pattern: 'vstripes' }, i => [skirtPiece(i, { flare: f => (i.flare * 0.3 + 0.014 * Math.cos(f.ang * 16)) * Math.max(0, f.u) ** 1.4 })], ['length', 'flare']),
            garment('pencilSkirt', 'Pencil skirt', 'bottom', 'Formal', { color: '#30333c', length: 0.6, flare: 0.02, slits: 0.2 }, i => [skirtPiece(i)], ['length', 'flare']),
            garment('ballGown', 'Ball gown', 'dress', 'Formal', { color: '#623c8a', neckline: 'strapless', sleeves: 0, length: 1, flare: 1.2, material: 'silk' }, gown, ['neckline', 'length', 'flare']),
            garment('eveningGown', 'Evening gown', 'dress', 'Formal', { color: '#962f48', neckline: 'deepv', sleeves: 0, length: 1, flare: 0.15, slits: 0.5, material: 'silk' }, gown, ['neckline', 'sleeves', 'length', 'flare']),
            garment('tailcoat', 'Tailcoat', 'over', 'Formal', { color: '#24242c', sleeves: 1, neckline: 'deepv', length: 0.75, fit: 0.3, open: 0.35 }, i => [top(Object.assign({}, i, { length: BODICE }), { lift: 0.025 }), skirtPiece(Object.assign({}, i, { open: 1.7, flare: 0.15 }), { lift: 0.03 })], ['length', 'fit']),
            garment('fieldCoat', 'Field coat', 'over', 'Sci-fi', { color: '#4c4940', color2: '#242e37', trim: '#a68e65', material: 'leather', pattern: 'solid', sleeves: 1, neckline: 'v', length: .72, fit: .3, open: .28 }, i => [top(Object.assign({},i,{length:BODICE}),{lift:.023}),skirtPiece(Object.assign({},i,{open:.25,flare:.14}),{lift:.028}),{collar:{open:.35,stand:.028,fall:.025,point:.016}}], ['length','fit','open']),
            garment('apron', 'Apron', 'over', 'Workwear', { color: '#e8dfc8', length: 0.7 }, i => [top(i, { rules: { spine: [0.5, 3.2], open: 0 }, value: (an, v) => an.member[v * 5] > 0.7 ? Math.min(an.s[v * 5] - 0.5, 3.2 - an.s[v * 5], (0.85 - Math.abs(an.angle[v * 5])) * 2) : -1, lift: 0.022 }), skirtPiece(Object.assign({}, i, { flare: 0.2 }), { value: (an, v) => Math.min((i.length - an.skirtU[v]) * 4, (0.95 - Math.abs(an.angle[v * 5])) * 2), lift: 0.025 })], ['length']),
            garment('coveralls', 'Coveralls', 'dress', 'Workwear', { color: '#405a78', color2: '#2e4359', sleeves: 1, length: 1, pattern: 'panels' }, allInOne, ['sleeves', 'length']),
            garment('scrubs', 'Medical scrubs', 'dress', 'Workwear', { color: '#54a29a', sleeves: 0.3, length: 1 }, allInOne, ['sleeves', 'length']),
            garment('uniform', 'Service uniform', 'dress', 'Workwear', { color: '#34445e', sleeves: 1, length: 1, pattern: 'panels', trim: '#d4af37' }, i => [...allInOne(i), { collar: { open: 0.12 } }], ['sleeves', 'length']),
            garment('swimBriefs', 'Swim briefs', 'underwearBottom', 'Swimwear', { color: '#367cad', material: 'rubber' }, brief),
            garment('swimTrunks', 'Swim trunks', 'bottom', 'Swimwear', { color: '#dc6a32', length: 0.18, fit: 0.5, pattern: 'halves' }, i => [legs(i)], ['length', 'fit']),
            garment('bikiniTop', 'Bikini top', 'underwearTop', 'Swimwear', { color: '#be3f72', material: 'rubber', trimWidth: 0 }, bikiniTop),
            garment('bikiniBottom', 'Bikini bottom', 'underwearBottom', 'Swimwear', { color: '#be3f72', material: 'rubber', fit: 0, trimWidth: 0 }, bikiniBottom, ['fit']),
            garment('swimsuit', 'One-piece swimsuit', 'under', 'Swimwear', { color: '#327a9a', material: 'rubber' }, i => [{ surface: 'tights', rules: { spine: [-3, 3.35], arms: [-1, 0.25], legs: [-1, 0.12] }, lift: 0.004, drape: 1 }]),
            garment('briefs', 'Briefs', 'underwearBottom', 'Underwear', { color: '#e4ded6' }, brief),
            garment('boxers', 'Boxer shorts', 'underwearBottom', 'Underwear', { color: '#748aa4', length: 0.08, fit: 0.4 }, i => [legs(i, { lift: 0.005 })]),
            garment('bra', 'Bandeau bra', 'underwearTop', 'Underwear', { color: '#e4d6ca', material: 'silk' }, bra),
            garment('sportsBra', 'Sports bra', 'underwearTop', 'Underwear', { color: '#4f426e', length: 0.05, sleeves: 0, neckline: 'scoop', fit: 0 }, i => [top(i, { rules: { spine: [2.1, 3.7], arms: [-1, 0.45] }, lift: 0.004 })]),
            garment('socks', 'Socks', 'hosiery', 'Hosiery', { color: '#e8e4dc', length: 0.18 }, stocking, ['length']),
            garment('stockings', 'Stockings', 'hosiery', 'Hosiery', { color: '#26212c', length: 0.8, material: 'silk' }, stocking, ['length']),
            garment('tights', 'Tights', 'hosiery', 'Hosiery', { color: '#303038' }, i => [{ surface: 'body', rules: { spine: [-3, 0.75], legs: [-1, 9] }, lift: 0.0025, drape: 0 }]),
            garment('operaGloves', 'Opera gloves', 'hands', 'Formal', { color: '#e4d9cc', length: 0.95, material: 'silk' }, i => [hands(i)], ['length']),
            garment('fingerlessGloves', 'Fingerless gloves', 'hands', 'Everyday', { color: '#302a26', length: 0.2, material: 'leather' }, i => [hands(i, { rules: { arms: [2.8 - i.length * 0.5, 3.25] } })], ['length']),
            garment('qipao', 'High-collar slit dress', 'dress', 'Formal', { color: '#a32f40', neckline: 'high', sleeves: 0.15, length: 0.85, flare: 0.08, slits: 0.7, material: 'silk' }, gown, ['sleeves', 'length', 'flare']),
            garment('balletDress', 'Ballet dress', 'dress', 'Performance', { color: '#e8dce8', neckline: 'scoop', sleeves: 0, length: 0.15, flare: 1.5, material: 'silk' }, gown, ['length', 'flare']),
            garment('tennisDress', 'Tennis dress', 'dress', 'Sportswear', { color: '#e4e7ea', neckline: 'v', sleeves: 0, length: 0.25, flare: 0.35 }, gown, ['length', 'flare']),
            garment('wetsuit', 'Wetsuit', 'dress', 'Sportswear', { color: '#252c35', color2: '#3b8ca2', sleeves: 1, length: 1, material: 'rubber', pattern: 'panels' }, i => allInOne(i).map(p => Object.assign({}, p, { lift: 0.004, drape: 1 })), ['sleeves', 'length']),
            garment('triathlonSuit', 'Triathlon suit', 'dress', 'Sportswear', { color: '#3d4c8b', color2: '#e5dbcf', sleeves: 0, length: 0.35, material: 'rubber', pattern: 'halves' }, i => allInOne(i).map(p => Object.assign({}, p, { lift: 0.004, drape: 1 })), ['sleeves', 'length']),
            garment('cargoTrousers', 'Cargo trousers', 'bottom', 'Workwear', { color: '#747653', color2: '#53573c', length: 1, fit: 0.6, pattern: 'panels' }, i => [legs(i)], ['length', 'fit'])
        ];
    }

    const SLOTS = [...new Set(GARMENTS.map(g => g.slot))];
    // Outward order: a later slot is laid over an earlier one.
    // Leg armor goes over trousers and under the skirt of a tunic, a dress or a robe.
    // A mail shirt goes over a top and under plate.
    const LAYER = { under: 0, underwearBottom: -0.2, underwearTop: -0.1, hosiery: 0.2, bottom: 1, legarmor: 1.5, top: 2, dress: 2, mail: 2.5, feet: 3, hands: 2, waist: 3, wrists: 3, armor: 4, hips: 4, over: 5, shoulders: 6, head: 6 };

    /** A full outfit item: catalog defaults under what the recipe chose. */
    function normalizeItem(item) {
        const g = BY_ID.get(item && item.id);
        if (!g) return null;
        const out = Object.assign({ id: g.id }, g.defaults, item);
        for (const k of ['sleeves', 'length', 'fit', 'flare', 'bell', 'open', 'face', 'bulk']) if (out[k] != null) out[k] = Math.max(0, Math.min(k === 'length' ? 1.4 : 1.5, +out[k] || 0));
        for (const k of ['color', 'color2', 'trim']) if (out[k] && !/^#[0-9a-f]{6}$/i.test(out[k])) delete out[k];
        if (g.defaults.lightStyle != null) {
            if (!['none', 'badge', 'strips', 'circuits'].includes(out.lightStyle)) out.lightStyle = g.defaults.lightStyle;
            out.lightColor = /^#[0-9a-f]{6}$/i.test(out.lightColor || '') ? out.lightColor.toLowerCase() : g.defaults.lightColor;
            out.lightIntensity = Number.isFinite(+out.lightIntensity) ? Math.max(0, Math.min(1, +out.lightIntensity)) : g.defaults.lightIntensity;
            out.lightWidth = Number.isFinite(+out.lightWidth) ? Math.max(0.4, Math.min(2.5, +out.lightWidth)) : 1;
        }
        if (out.neckline && !NECKLINES[out.neckline]) out.neckline = 'crew';
        if (out.emblemPicture != null) {
            const ref = out.emblemPicture, ext = typeof ref === 'string' && /\.([^.\\/]+)$/.exec(ref);
            if (typeof ref !== 'string' || !ref.trim() || /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-z][a-z0-9+.-]*:|[\u0000-\u001f]/i.test(ref) || (ext && !/^(png|jpe?g|webp|svg|gif|apng)$/i.test(ext[1]))) delete out.emblemPicture;
        }
        if (!MATERIAL[out.material]) out.material = 'cloth';
        return out;
    }

    /** One garment per slot, the later one winning; ordered from the skin outward. */
    function normalizeOutfit(list) {
        const bySlot = new Map();
        for (const raw of Array.isArray(list) ? list : []) {
            const item = normalizeItem(raw);
            if (!item) continue;
            const slot = BY_ID.get(item.id).slot;
            // A dress takes the top and bottom slots; a top or bottom replaces a dress.
            if (slot === 'dress') { bySlot.delete('top'); bySlot.delete('bottom'); }
            if (slot === 'top' || slot === 'bottom') bySlot.delete('dress');
            bySlot.set(slot, item);
        }
        return [...bySlot.values()].sort((a, b) => (LAYER[BY_ID.get(a.id).slot] ?? 3) - (LAYER[BY_ID.get(b.id).slot] ?? 3));
    }

    // ── outfits ───────────────────────────────────────────────────────────
    const PRESETS = [
        { id: 'courier', label: 'Courier', group: 'Sci-fi', items: [{ id:'techSuit',color:'#2c3036',color2:'#48515a',lightIntensity:.12 },{ id:'fieldCoat' },{ id:'boots',color:'#292523',length:.55 },{ id:'gloves',color:'#292523' }] },
        { id: 'pathfinder', label: 'Pathfinder', group: 'Sci-fi', items: [{ id:'explorerSuit',color:'#b9b5a0',color2:'#4d6860',trim:'#313b35',lightIntensity:.15 },{ id:'fieldCoat',color:'#344c49',color2:'#263b38',trim:'#b9a370',length:.48 },{ id:'magboots',color:'#34403a',color2:'#a79568' },{ id:'gloves',color:'#34403a' }] },
        { id: 'starshipCrew', label: 'Starship crew', group: 'Sci-fi', items: [{ id: 'starshipUniform' }, { id: 'boots', color: '#18202b', length: 0.3 }] },
        { id: 'commandOfficer', label: 'Command officer', group: 'Sci-fi', items: [{ id: 'starshipUniform', color2: '#36495e', lightIntensity: 0 }, { id: 'officerJacket' }, { id: 'boots', color: '#202936', length: 0.3 }] },
        { id: 'surveyTeam', label: 'Survey team', group: 'Sci-fi', items: [{ id: 'explorerSuit' }, { id: 'magboots', color: '#263d50', length: 0.30 }, { id: 'gloves', color: '#263d50', length: 0.25 }] },
        { id: 'reconTeam', label: 'Recon team', group: 'Sci-fi', items: [{ id:'officerJacket',color:'#424e4d',color2:'#2c383b',trim:'#899892',pattern:'solid',material:'cloth',lightStyle:'badge',lightColor:'#c09b66',lightIntensity:.3,neckline:'crew',fit:.6 },{ id:'cargoTrousers',color:'#414d48',color2:'#303b37',pattern:'solid',fit:.65 },{ id:'reconArmor' },{ id:'magboots',color:'#263331',color2:'#9c987b',length:.30 },{ id:'gloves',color:'#27332f',length:.3 }] },
        { id: 'evaCrew', label: 'EVA crew', group: 'Sci-fi', items: [{ id: 'evaSuit' }, { id: 'visorhelm' }, { id: 'magboots', color: '#d6dcd9', length: 0.35 }, { id: 'gloves', color: '#d6dcd9', length: 0.35 }] },
        { id:'flightCrew',label:'Flight crew',group:'Sci-fi',items:[{ id:'officerJacket',color:'#334353',color2:'#47586a',trim:'#b19a6e',material:'cloth',pattern:'solid',fit:.55,neckline:'high',lightColor:'#ffb85a',lightStyle:'badge',lightIntensity:.4 },{ id:'cargoTrousers',color:'#303d4a',color2:'#202d36',pattern:'solid',fit:.6 },{ id:'boots',color:'#1e2831',length:.35 },{ id:'gloves',color:'#1e2831',length:.2 }] },
        { id: 'none', label: 'Nothing', group: 'Basics', items: [] },
        { id: 'generatedUndergarments', label: 'Underwear separates', group: 'Basics', items: [{ id: 'briefs' }, { id: 'bra' }] },
        { id: 'generatedSwimmer', label: 'Swimmer', group: 'Swimwear', items: [{ id: 'swimsuit' }] },
        { id: 'bikini', label: 'Bikini', group: 'Swimwear', items: [{ id: 'bikiniTop' }, { id: 'bikiniBottom' }] },
        { id: 'generatedBeach', label: 'Beachwear', group: 'Swimwear', items: [{ id: 'bikiniTop' }, { id: 'swimBriefs' }, { id: 'sandals' }] },
        { id: 'generatedWorker', label: 'Workshop coveralls', group: 'Workwear', items: [{ id: 'coveralls' }, { id: 'boots' }, { id: 'fingerlessGloves' }] },
        { id: 'generatedMedic', label: 'Medic', group: 'Workwear', items: [{ id: 'scrubs' }, { id: 'socks' }, { id: 'sneakers' }] },
        { id: 'generatedChef', label: 'Kitchen worker', group: 'Workwear', items: [{ id: 'shirt' }, { id: 'jeans', color: '#303039' }, { id: 'apron' }, { id: 'shoes' }] },
        { id: 'generatedGala', label: 'Gala gown', group: 'Formal', items: [{ id: 'ballGown' }, { id: 'operaGloves' }, { id: 'shoes' }] },
        { id: 'generatedEvening', label: 'Evening dress', group: 'Formal', items: [{ id: 'eveningGown' }, { id: 'stockings' }, { id: 'shoes' }] },
        { id: 'generatedTailcoat', label: 'Evening tailcoat', group: 'Formal', items: [{ id: 'shirt' }, { id: 'jeans', color: '#24242c' }, { id: 'tailcoat' }, { id: 'shoes' }] },
        { id: 'underwear', label: 'Underwear', group: 'Basics', items: [{ id: 'shorts', color: '#e6e1d8', length: 0, fit: 0 }, { id: 'tanktop', color: '#e6e1d8', length: 0.15, neckline: 'scoop' }] },
        { id: 'casual', label: 'Casual', group: 'Everyday', items: [{ id: 'tshirt' }, { id: 'jeans' }, { id: 'sneakers' }] },
        { id: 'office', label: 'Office', group: 'Everyday', items: [{ id: 'shirt' }, { id: 'jeans', color: '#2b2e36' }, { id: 'suitjacket' }, { id: 'shoes' }] },
        { id: 'winter', label: 'Winter', group: 'Everyday', items: [{ id: 'sweater' }, { id: 'jeans' }, { id: 'boots' }, { id: 'beanie' }, { id: 'gloves' }] },
        { id: 'detective', label: 'Detective', group: 'Everyday', items: [{ id: 'shirt', color: '#e8e4d8' }, { id: 'jeans', color: '#3a3530' }, { id: 'trenchcoat' }, { id: 'shoes' }] },
        { id: 'sporty', label: 'Athlete', group: 'Everyday', items: [{ id: 'tanktop', color: '#d03a3a' }, { id: 'shorts', color: '#1f1f24', length: 0.25 }, { id: 'sneakers' }] },
        { id: 'summerdress', label: 'Summer dress', group: 'Everyday', items: [{ id: 'dress', color: '#f0c040', sleeves: 0, length: 0.45, flare: 0.6 }, { id: 'sandals' }] },
        { id: 'peasantf', label: 'Villager', group: 'Fantasy', items: [{ id: 'peasant' }, { id: 'skirt', color: '#6a4a32', length: 0.95, flare: 0.5 }, { id: 'sash', color: '#8a3a2a' }, { id: 'shoes', color: '#4a3020' }] },
        { id: 'farmer', label: 'Farmer', group: 'Fantasy', items: [{ id: 'tunic', color: '#8a7a5a', sleeves: 0.7 }, { id: 'jeans', color: '#5a4a32', fit: 0.6 }, { id: 'sash' }, { id: 'boots', length: 0.2 }] },
        { id: 'ranger', label: 'Ranger', group: 'Fantasy', items: [{ id: 'tunic', color: '#3e5a32' }, { id: 'leggings', color: '#3a3024' }, { id: 'vest', color: '#4a3220' }, { id: 'sash' }, { id: 'boots', length: 0.5 }, { id: 'hood', color: '#2f4a2a' }, { id: 'wraps' }] },
        { id: 'rogue', label: 'Rogue', group: 'Fantasy', items: [{ id: 'shirt', color: '#2a2a30' }, { id: 'leggings', color: '#1a1a1e' }, { id: 'leatherarmor', color: '#2e2620', color2: '#221c18' }, { id: 'boots', color: '#1e1814', length: 0.55 }, { id: 'gloves', color: '#1e1814' }, { id: 'hood', color: '#1c1c22' }] },
        { id: 'mage', label: 'Mage', group: 'Fantasy', items: [{ id: 'robe' }, { id: 'sash', color: '#d4af37' }, { id: 'shoes', color: '#2a1e3a' }] },
        { id: 'priest', label: 'Priest', group: 'Fantasy', items: [{ id: 'robe', color: '#ece8dc', trim: '#c9a35a', bell: 0.5, neckline: 'high' }, { id: 'sash', color: '#c9a35a' }, { id: 'sandals' }] },
        { id: 'noble', label: 'Noble', group: 'Fantasy', items: [{ id: 'gown' }, { id: 'gloves', color: '#f2ede4', length: 0.8 }] },
        { id: 'prince', label: 'Prince', group: 'Fantasy', items: [{ id: 'shirt', color: '#f4f0e6', neckline: 'high' }, { id: 'leggings', color: '#ece6da' }, { id: 'trenchcoat', color: '#6a1a2a', trim: '#d4af37', length: 0.6, open: 0.25 }, { id: 'boots', color: '#1a1410', length: 0.75 }, { id: 'sash', color: '#d4af37' }] },
        { id: 'barbarian', label: 'Barbarian', group: 'Fantasy', items: [{ id: 'loincloth' }, { id: 'sash', color: '#4a3020' }, { id: 'wraps', color: '#6a4a2a' }, { id: 'boots', color: '#5a4030', length: 0.45 }] },
        { id: 'pirate', label: 'Pirate', group: 'Fantasy', items: [{ id: 'peasant', color: '#f0ebe0', neckline: 'v', bell: 0.3 }, { id: 'jeans', color: '#2e2a40', length: 0.8, fit: 0.7 }, { id: 'vest', color: '#7a1e1e', length: 0.6 }, { id: 'sash', color: '#c03030' }, { id: 'boots', color: '#1e1610', length: 0.7 }] },
        { id: 'monk', label: 'Monk', group: 'Fantasy', items: [{ id: 'robe', color: '#b8641e', trim: '#8a4a14', bell: 0.3, neckline: 'v' }, { id: 'sash', color: '#7a3e10' }, { id: 'sandals' }] },
        { id: 'knight', label: 'Knight', group: 'Armor', items: [{ id: 'chainmail', length: 0.26 }, { id: 'leggings', color: '#414750' }, { id: 'breastplate' }, { id: 'pauldrons' }, { id: 'vambraces' }, { id: 'gauntlets' }, { id: 'tassets' }, { id: 'greaves' }, { id: 'sabatons' }, { id: 'helm' }] },
        { id: 'paladin', label: 'Paladin', group: 'Armor', items: [{ id: 'shirt', color: '#ece8dc', trim: '#d4af37', neckline: 'high', fit: .15, sleeves: 1 }, { id: 'leggings', color: '#3a3e46' }, { id: 'breastplate', color: '#e8d9a0', color2: '#c8b070', trim: '#ffffff' }, { id: 'pauldrons', color: '#e8d9a0', bulk: 0.9, trim: '#ffffff' }, { id: 'vambraces', color: '#e8d9a0' }, { id: 'greaves', color: '#e8d9a0' }, { id: 'sabatons', color: '#e8d9a0' }, { id: 'gauntlets', color: '#e8d9a0' }] },
        { id: 'gladiator', label: 'Gladiator', group: 'Armor', items: [{ id: 'loincloth', color: '#8a2a2a' }, { id: 'pauldrons', color: '#8d806a', material: 'metal', bulk: 0.15 }, { id: 'vambraces', color: '#6b4b31', material:'leather',bulk:.12 }, { id: 'sandals' }, { id: 'sash', color: '#5a3a1a' }] },
        { id: 'darkknight', label: 'Dark knight', group: 'Armor', items: [{ id: 'chainmail', color: '#3a3a40', length: 0.32 }, { id: 'leggings', color: '#1a1a1e' }, { id: 'breastplate', color: '#2a2a30', color2: '#1a1a20', trim: '#8a1a1a' }, { id: 'pauldrons', color: '#2a2a30', bulk: 1.2, trim: '#8a1a1a' }, { id: 'vambraces', color: '#2a2a30' }, { id: 'gauntlets', color: '#2a2a30' }, { id: 'tassets', color: '#2a2a30', trim: '#8a1a1a' }, { id: 'greaves', color: '#2a2a30' }, { id: 'sabatons', color: '#2a2a30' }, { id: 'greathelm', color: '#2a2a30' }] },
        { id: 'pilot', label: 'Space pilot', group: 'Sci-fi', items: [{ id: 'bodysuit', color: '#d8dce2', color2: '#d86a2a' }, { id: 'tacvest', color: '#3a4250', color2: '#2a3240', pattern: 'solid' }, { id: 'magboots', color: '#3a4250' }, { id: 'gloves', color: '#3a4250' }] },
        { id: 'astronaut', label: 'Astronaut', group: 'Sci-fi', items: [{ id: 'spacesuit' }, { id: 'magboots', color: '#e9ebee', color2: '#d86a2a' }, { id: 'gloves', color: '#e9ebee', bulk: 0.6 }, { id: 'visorhelm', color: '#f2f4f6', color2: '#c89a2a' }] },
        { id: 'trooper', label: 'Power armor', group: 'Sci-fi', items: [{ id: 'powerarmor' }, { id: 'powerhelm' }] },
        { id: 'marine', label: 'Space marine', group: 'Sci-fi', items: [{ id: 'powerarmor', color: '#344e70', color2: '#ccd7dd', bulk: 1.1, trim: '#202a34' }, { id: 'powerhelm', color: '#344e70', color2: '#ccd7dd', trim: '#202a34' }] },
        { id: 'cyberpunk', label: 'Cyberpunk', group: 'Sci-fi', items: [{ id: 'tanktop', color: '#1a1a20' }, { id: 'leggings', color: '#16141c' }, { id: 'cyberjacket' }, { id: 'boots', color: '#16141c', length: 0.6 }, { id: 'gloves', color: '#ff2bd6', length: 0.05 }] },
        { id: 'soldier', label: 'Soldier', group: 'Sci-fi', items: [{ id: 'shirt', color: '#4a5240', pattern: 'camo', color2: '#353b2e' }, { id: 'jeans', color: '#4a5240', pattern: 'camo', color2: '#353b2e', fit: 0.5 }, { id: 'tacvest' }, { id: 'boots', color: '#2a2620', length: 0.4 }, { id: 'gloves', color: '#2a2620', length: 0.1 }] },
        { id: 'mhcasual', label: 'Jeans and tee', group: 'Everyday', items: [{ id: 'mh_tee_jeans' }, { id: 'mh_sneakers' }] },
        { id: 'mhbusiness', label: 'Business suit', group: 'Formal', items: [{ id: 'mh_suit' }, { id: 'mh_loafers' }] },
        { id: 'mhskirtsuit', label: 'Skirt suit', group: 'Formal', items: [{ id: 'mh_skirtsuit' }, { id: 'mh_loafers', color: '#1b1612' }] },
        { id: 'mhsundress', label: 'Sundress', group: 'Everyday', items: [{ id: 'mh_sundress' }, { id: 'mh_sneakers' }] },
        { id: 'mhviking', label: 'Viking', group: 'Fantasy', items: [{ id: 'mh_viking_tunic' }, { id: 'mh_viking_trousers' }, { id: 'mh_viking_boots' }] },
        { id: 'mhstarcrew', label: 'Star crew', group: 'Sci-fi', items: [{ id: 'mh_uniform' }, { id: 'mh_boots' }] },
        // [outfit transfer] The Star Shift actors' outfits; gloves, gauntlets and heeled boots are the builder's own, in their colors.
        { id: 'ss_carol', label: "Captain's Uniform (Carol Everson)", group: 'Sci-fi', items: [{ id: 'ss_carol_uniform' }, { id: 'gloves', color: '#141b2e', length: 0.12, material: 'leather' }, { id: 'boots', color: '#131b31', trim: '#8c96a6', length: 0.42, material: 'leather' }] },
        { id: 'ss_jolt', label: 'Power Armor (Jolt Eagle)', group: 'Sci-fi', items: [{ id: 'ss_jolt_armor' }, { id: 'ss_jolt_legs' }, { id: 'ss_jolt_boots' }, { id: 'powergauntlets', color: '#1d2d5e', trim: '#1c2028', color2: '#3ccaff' }] },
        { id: 'ss_max', label: 'Power Armor (Max Triton)', group: 'Sci-fi', items: [{ id: 'ss_max_armor' }, { id: 'ss_max_legs' }, { id: 'ss_max_boots' }, { id: 'powergauntlets', color: '#8c1c1c', trim: '#26262b', color2: '#ff7a30' }] },
        { id: 'ss_vay', label: 'Royal Robes (Vay Drokan)', group: 'Sci-fi', items: [{ id: 'ss_vay_robes' }, { id: 'ss_vay_boots' }] }
    ];

    // ── building ──────────────────────────────────────────────────────────
    /** The color look of a piece: the item's colors, or the trim for a trim piece. */
    function lookOf(item, spec, cache) {
        // Without a trim color of its own, an edge is bound in the garment's own color, a shade darker.
        const look = { color: item.color, color2: item.color2, trim: item.trim || (item.color ? shadeHex(item.color, 0.8) : undefined), pattern: item.pattern || 'solid', trimWidth: item.trimWidth || 0, scale: item.scale, from: item.from, to: item.to };
        for (const key of ['lightStyle', 'lightColor', 'lightIntensity', 'lightWidth']) if (item[key] != null) look[key] = item[key];
        if (item.emblemPicture && cache?.emblemPictures) look.emblemPicture = cache.emblemPictures.get(item.emblemPicture);
        if (spec.look === 'trim') return { color: item.trim || item.color2 || item.color, pattern: 'solid' };
        return look;
    }

    /**
     * Parts for an outfit on a built body (RRHumanBody.build), and the body
     * vertices its opaque pieces cover (`hidden`, a Set of pack vertex ids)
     * so the skin under them is left out.
     */
    function build(pack, built, outfit, cache) {
        const O = root.RRCharacterOutfit || require('./CharacterOutfit.js');
        const Details=root.RRCharacterGarmentDetails||(typeof require==='function'?require('./CharacterGarmentDetails.js'):null);
        cache = cache || {};
        const items = normalizeOutfit(outfit);
        const entries = [];
        // What laying needs of this body (its normals, the tights on its skin, a lookup of its vertices)
        // is worked out once per build and never kept: the next build is another body.
        const frame = {};
        const covered = new Float32Array(pack.vertexCount).fill(-1);
        const modeledItems = [], shoeParts = [], shoeTextures = [], takenItems = [], fieldGear = [], aprons = [];
        const under = underLayers(), belts = [];
        // The coarse clothing helper cannot follow a very full bust or deep body folds.
        // Use the actual skin topology for soft fitted cuts there, with the same authored
        // cut, lift and drape. This preserves breasts and the crotch's connected surface.
        const an = O.anatomy(pack), P = built.shaped, hip = built.bones.find(b => b.name === 'Hips').head;
        const ids = pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)]);
        const detailedCuts = ids.some(v => an.member[v * 5] > 0.8 && an.s[v * 5] > 0.4 && an.s[v * 5] < 3.3 &&
            (Math.abs(P[v * 3]) > built.height * 0.15 || Math.abs(P[v * 3 + 2] - hip[2]) > built.height * 0.18));
        const shod = items.some(i => BY_ID.get(i.id).slot === 'feet');
        const rigidFeet=!shod||items.some(i=>BY_ID.get(i.id).slot==='feet'&&BY_ID.get(i.id).pieces(i).some(p=>p.shoe?.rigidFoot));
        // With anything on the feet, a suit's legs end at the ankle (inside a boot, over a shoe's collar).
        const anyShoes = shod || items.some(i => BY_ID.get(i.id).pieces(i).some(p => p.shoe));
        items.forEach((item, layer) => {
            const g = BY_ID.get(item.id);
            // [outfit transfer] Garments taken from models are fitted by RRCharacterOutfitTransfer.
            if (g.transfer) { takenItems.push(item); return; }
            if (g.modeled) { modeledItems.push(item); return; }
            const specs = g.pieces(item);
            // Joined dresses have a sewn inner yoke over the pelvis. The
            // free outer skirt can lift in a seated pose without exposing
            // bare skin through the gap beneath its fitted bodice.
            if(g.slot==='dress'&&!item.open&&specs.some(p=>p.surface==='skirt')&&specs.some(p=>p.surface==='tights')){
                specs.unshift({surface:'tights',rules:{spine:[detailedCuts?-3:-.25,detailedCuts?2.4:1.0],legs:[-1,detailedCuts?1.4:.15]},lift:detailedCuts?.009:.005,drape:2,lining:true});
            }
            specs.forEach((raw, pi) => {
                if (raw.apronPanels) {
                    aprons.push(item);return;
                }
                if (raw.scifiGear) { fieldGear.push({ item, kind: raw.scifiGear }); return; }
                if (raw.swimStraps) {
                    const made = O.swimStraps(pack, built, raw.swimStraps, frame);
                    const color = O.linear(item.color), colors = new Float32Array(made.positions.length);
                    for (let k = 0; k < colors.length; k += 3) colors.set(color, k);
                    const [roughness, metalness] = MATERIAL[item.material] || MATERIAL.rubber;
                    shoeParts.push(Object.assign({ name: g.label + ' ties', colors, roughness, metalness }, made));
                    return;
                }
                if (raw.plateArmor) {
                    const Armor = root.RRCharacterPowerArmor || require('./CharacterPowerArmor.js');
                    const made = Armor.medieval(pack, built, item, raw.plateArmor, entries.map(e => e.laid));
                    const [roughness, metalness] = MATERIAL[item.material] || MATERIAL.metal;
                    for (const part of made.parts) Object.assign(part, { roughness, metalness });
                    shoeParts.push(...made.parts);
                    return;
                }
                if (raw.poweredArmor || raw.poweredHelmet) {
                    const Power = root.RRCharacterPowerArmor || require('./CharacterPowerArmor.js');
                    const made = raw.poweredHelmet ? Power.helmet(pack, built, item) : Power.build(pack, built, Object.assign({},item,{rigidFeet},raw.only?{only:raw.only}:{}));
                    shoeParts.push(...made.parts);
                    for (const v of made.hidden) covered[v] = 1;
                    return;
                }
                if (raw.collar) {
                    // Over the shirt's own neckline.
                    const pts = [];
                    for (const e of entries) { const P = e.laid.positions; for (let k = 0; k < P.length; k += 3) if (P[k + 1] > 1.2) pts.push(P[k], P[k + 1], P[k + 2]); }
                    const made = O.collarBand(pack, built, raw.collar, Float32Array.from(pts));
                    const c = O.linear(item.color), n = made.positions.length / 3, colors = new Float32Array(n * 3);
                    // The collar's underside, toward the neck, in shade; a stitched edge along the fall.
                    for (let i = 0; i < n; i++) { const r = Math.floor(i / (made.cols + 1)); const k = r === 0 ? 0.7 : r === 4 ? 0.88 : 1; colors.set([c[0] * k, c[1] * k, c[2] * k], i * 3); }
                    const [roughness, metalness] = MATERIAL[item.material] || MATERIAL.cloth;
                    shoeParts.push({ name: g.label + ' collar', positions: made.positions, normals: made.normals, index: made.index, joints: made.joints, weights: made.weights, colors, roughness, metalness, doubleSided: true });
                    // A jacket or a coat laid later goes over it: its points, facing out from the neck.
                    const B = built.bones.find(b => b.name === 'Neck').head, n3 = made.positions.length;
                    const faceOut = new Float32Array(n3), axis = new Float32Array(n3);
                    for (let k = 0; k < n3; k += 3) {
                        const dx = made.positions[k] - B[0], dz = made.positions[k + 2] - B[2], l = Math.hypot(dx, dz) || 1;
                        faceOut[k] = dx / l; faceOut[k + 2] = dz / l;
                        axis[k] = B[0]; axis[k + 1] = made.positions[k + 1]; axis[k + 2] = B[2];
                    }
                    under.add({ positions: made.positions, normals: faceOut, base: axis, rimStart: n3 / 3 }, layer);
                    return;
                }
                if (raw.pauldron) {
                    const pts = [];
                    for (const e of entries) { const P = e.laid.positions; for (let k = 0; k < P.length; k += 3) if (P[k + 1] > 1.0) pts.push(P[k], P[k + 1], P[k + 2]); }
                    const made = O.pauldrons(pack, built, raw.pauldron, Float32Array.from(pts));
                    const Atlas = root.RRCharacterAtlas || require('./CharacterAtlas.js');
                    const look = { color: item.color, trim: item.trim };
                    const store = cache.shoes || (cache.shoes = new Map()), pkey = JSON.stringify(['plates', look]);
                    let picture = store.get(pkey);
                    if (!picture) { picture = Object.assign(Atlas.platePicture(look, raw.pauldron.plates || 3, 256), { name: 'plates.png' }); store.set(pkey, picture); }
                    const [roughness, metalness] = MATERIAL[item.material] || MATERIAL.cloth;
                    shoeParts.push({ name: g.label, positions: made.positions, normals: made.normals, uvs: made.uvs, index: made.index, joints: made.joints, weights: made.weights, texture: 'plates.png', roughness, metalness, doubleSided: true });
                    shoeTextures.push(picture);
                    return;
                }
                if (raw.helm) {
                    const made = helmFor(pack, built, O, item, g, raw, cache, frame);
                    shoeParts.push(...made.parts); shoeTextures.push(made.texture);
                    for (const v of made.hidden) covered[v] = 1;
                    return;
                }
                if (raw.band) {
                    const made = beltFor(pack, built, O, item, g, raw, entries, cache);
                    shoeParts.push(made.part); shoeTextures.push(made.texture);
                    // A coat laid after it goes over it.
                    belts.push({ cover: made.cover, layer });
                    return;
                }
                if (raw.shoe) {
                    // Armor's own boots give way to footwear chosen for the feet.
                    if (raw.armorFeet && shod) return;
                    const made = shoesFor(pack, built, O, item, g, raw, entries, cache, shoeParts.length, frame);
                    shoeParts.push(made.part); shoeTextures.push(made.texture);
                    for (const v of made.hidden) covered[v] = 1;
                    return;
                }
                const spec = Object.assign({}, raw);
                if (detailedCuts && spec.surface === 'tights' && !spec.hard) {spec.surface = 'body';if(spec.rules)spec.rules={...spec.rules,tailoredHem:true};}
                const footed = anyShoes && spec.rules && spec.rules.legs && !spec.shoe && (typeof spec.rules.legs === 'function' || spec.rules.legs[1] > 2.05);
                if (footed) spec.rules = Object.assign({}, spec.rules, { legs: [Array.isArray(spec.rules.legs) ? spec.rules.legs[0] : -1, 2.0] });
                spec.cutKey = [item.id, pi, cutSettings(item), spec.bands || null, footed ? 'ankle' : null, spec.surface];
                if (spec.bands) spec.value = bandedValue(spec, O);
                // Each layer out stands a little further off the body.
                spec.lift = (spec.lift ?? 0.006) + (spec.closeFit ? 0 : layer * 0.0035);
                const piece = O.cutFor(pack, spec);
                if (!piece.index.length) return;
                const laid = O.lay(pack, built, piece, spec, frame);
                laid.layer = layer;
                laid.tailored=!!frame.tailorNeeded&&!spec.hard;
                laid.tailorFloor=hip[1]-.10*built.height/1.7;
                laid.fabricEntry=entries.length;
                if(spec.surface==='skirt'){
                    const bodice=entries.find(e=>e.garment===item.id&&!e.skirt&&!e.lining);
                    if(bodice&&laid.tailored)joinWaist(bodice.laid,laid,built,O);
                }
                // Loose cloth (a skirt, a robe, a coat's tails) hangs as cloth: each vertex's reach down the skirt (RRCharacterCloth).
                if (spec.surface === 'skirt' && !spec.hard) laid.hang = Float32Array.from(laid.field, f => Math.max(0,f.u-(laid.sewnWaist?.12:0)));
                // Over what an earlier garment already wears there: a belt over a robe at a heavy belly's fold,
                // a skirt over trouser legs, a jacket over a sweater.
                if (under.count) overlay(laid, under, O);
                for (const b of belts) if (b.layer < layer && b.cover(laid.positions)) laid.normals = O.triangleNormals(laid.positions, laid.index);
                under.add(laid, layer);
                const look = Object.assign(lookOf(item, spec, cache), { material: item.material });
                const [roughness, metalness] = MATERIAL[item.material] || MATERIAL.cloth;
                if(spec.surface === 'skirt'){
                    const bodice=entries.find(e=>e.garment===item.id&&!e.skirt&&!e.lining);
                    if(bodice){const seam=waistSeam(bodice.laid,laid,item,g.label,O,built);if(seam)shoeParts.push(seam);}
                }
                entries.push({ laid, look, garment:item.id, lining:!!spec.lining, skirt: spec.surface === 'skirt', name: g.label+(spec.lining?' lining':''), roughness, metalness, doubleSided: spec.surface === 'skirt' });
                // The skin a tight piece covers is not drawn (a skirt hangs free of the legs).
                if (spec.surface !== 'skirt' && spec.hides !== false) markCovered(pack, O, spec, covered);
            });
        });
        if(Details){Details.tailor(entries,built);for(const item of aprons)shoeParts.push(...Details.apronPanels(pack,built,item,entries.map(e=>e.laid),entries.filter(e=>e.garment===item.id).map(e=>e.laid)));}
        // Hardware is fitted after the fabric layers, so badges, pouches and
        // rigid plates sit on the finished clothing rather than inside it.
        for (const [i, gear] of fieldGear.entries()) {
            if (fieldGear.slice(i + 1).some(g => g.kind === gear.kind)) continue;
            if (gear.kind === 'utility' && fieldGear.some(g => g.kind === 'recon' || g.kind === 'vest' || g.kind === 'pressure' || g.kind === 'uniform')) continue;
            if(gear.kind==='uniform'&&fieldGear.some(g=>g.kind==='recon'||g.kind==='vest'))continue;
            const Armor = root.RRCharacterPowerArmor || require('./CharacterPowerArmor.js');
            const made = Armor.fieldGear(pack, built, gear.item, gear.kind, entries.map(e => e.laid));
            shoeParts.push(...made.parts);
            shoeTextures.push(...(made.textures || []));
        }
        const hidden = new Set();
        for (let v = 0; v < covered.length; v++) if (covered[v] > 0.1) hidden.add(v);
        // Modeled garments: each its own part and picture, hiding the skin it covers.
        const modeledParts = [], textures = [];
        if (modeledItems.length) {
            const Clothes = root.RRCharacterClothes || require('./CharacterClothes.js');
            const wear = modeledItems.map(item => {
                const g = BY_ID.get(item.id), [roughness, metalness] = MATERIAL[item.material] || MATERIAL.cloth;
                return { item, rank: g.rank, look: { name: g.label, roughness, metalness } };
            });
            for (const made of Clothes.buildAll(pack, built, wear, frame)) {
                modeledParts.push(made.part);
                textures.push(made.texture);
                for (const v of made.hidden) hidden.add(v);
            }
        }
        // [outfit transfer] Garments taken from models: each its part, in its outfit's picture.
        if (takenItems.length) {
            const Taken = root.RRCharacterOutfitTransfer || require('./CharacterOutfitTransfer.js');
            for (const made of Taken.buildAll(pack, built, takenItems, frame, item => BY_ID.get(item.id))) {
                modeledParts.push(made.part);
                if (!textures.some(t => t.name === made.texture.name)) textures.push(made.texture);
                for (const v of made.hidden) hidden.add(v);
            }
        }
        modeledParts.push(...shoeParts, ...garmentFasteners(entries,built), ...boundEdges(entries,built), ...(Details?Details.build(pack,built,entries):[])); textures.push(...shoeTextures);
        if(Details)textures.push(...Details.armorFinish(modeledParts,built),...Details.leatherFinish(modeledParts,built));
        // The cut garments' parts, their picture kept while the body changes (it depends on the outfit only).
        let cutParts = [], atlasTexture = null, key = null;
        if (entries.length) {
            const Atlas = root.RRCharacterAtlas || require('./CharacterAtlas.js');
            key = JSON.stringify([items.filter(i => !BY_ID.get(i.id).modeled && !BY_ID.get(i.id).transfer), cache.atlasSize || 1024, detailedCuts]);
            const store = cache.atlas || (cache.atlas = { key: null, layout: null });
            if (store.key !== key) { store.layout = Atlas.layout(pack, entries, { size: cache.atlasSize || 1024 }); store.key = key; }
            cutParts = Atlas.apply(store.layout, entries);
            atlasTexture = store.layout.texture;
            if (store.layout.emission) textures.push(store.layout.emission);
            if (store.layout.normal) textures.push(store.layout.normal);
        }
        // Only skin a garment really covers stays hidden: none is left out under a slit, an opening or a tear.
        for (const v of O.uncovered(pack, built, cutParts.concat(modeledParts), hidden, frame)) hidden.delete(v);
        // Skin under a garment and just past its edge, where no body hair or fur grows (it would poke out under a
        // cuff or over a boot's top).
        const noHair = new Set(hidden);
        if (hidden.size) {
            const { offsets, flat } = (root.RRHumanBody || require('./HumanBody.js')).neighbors(pack);
            let ring = [...hidden];
            for (let pass = 0; pass < 2; pass++) {
                const next = [];
                for (const v of ring) for (let k = offsets[v]; k < offsets[v + 1]; k++) { const u = flat[k]; if (!noHair.has(u)) { noHair.add(u); next.push(u); } }
                ring = next;
            }
        }
        if (!entries.length) return { parts: modeledParts, hidden, noHair, items, texture: null, textures };
        return { parts: cutParts.concat(modeledParts), hidden, noHair, items, texture: atlasTexture, textureKey: key, textures };
    }

    /** A narrow rolled binding follows each cut boundary. Unlike painted
     * trim it retains a crisp, lit edge at cuffs, necklines and open hems. */
    function boundEdges(entries,built) {
        const Props=root.RRCharacterProps||require('./CharacterProps.js'),O=root.RRCharacterOutfit||require('./CharacterOutfit.js'),m=new Props.Mesh(),hang=[],sewnRoots=[],sewnRefs=[];
        const {add,sub,mul,norm,cross}=Props.vec,scale=built.height/1.7,radius=.00065*scale;
        for(const entry of entries){
            if(entry.lining)continue;
            const laid=entry.laid,edges=laid.piece.border.filter(([a,b])=>!(laid.internalHem?.[a]&&laid.internalHem?.[b]));if(!edges.length)continue;
            const adjacent=new Map(),unused=new Set(edges.map((_,i)=>i));
            edges.forEach(([a,b],i)=>{for(const v of [a,b]){if(!adjacent.has(v))adjacent.set(v,[]);adjacent.get(v).push(i);}});
            const at=v=>Array.from(laid.positions.subarray(v*3,v*3+3)),color=O.linear(entry.look.trimWidth>.02?entry.look.trim||entry.look.color:entry.look.color).map(v=>v*.84);
            while(unused.size){
                const first=unused.values().next().value,path=[edges[first][0]];let edge=first,current=path[0];
                while(edge!==undefined){unused.delete(edge);const pair=edges[edge];current=pair[0]===current?pair[1]:pair[0];path.push(current);if(current===path[0])break;edge=adjacent.get(current)?.find(e=>unused.has(e));}
                if(path.length<3)continue;const closed=path[0]===path.at(-1),rows=[];
                for(let i=0;i<path.length;i++){
                    const id=path[i],p=at(id),before=at(path[i?i-1:closed?path.length-2:0]),after=at(path[i+1<path.length?i+1:closed?1:i]);
                    const tangent=norm(sub(after,before)),n=norm(Array.from(laid.normals.subarray(id*3,id*3+3))),x=norm(sub(n,mul(tangent,n.reduce((s,v,k)=>s+v*tangent[k],0)))),y=cross(tangent,x),center=add(p,mul(n,radius*1.2)),skin={joints:Array.from(laid.joints.subarray(id*4,id*4+4)),weights:Array.from(laid.weights.subarray(id*4,id*4+4))};
                    rows.push(Array.from({length:6},(_,k)=>{const angle=k/6*Math.PI*2,normal=add(mul(x,Math.cos(angle)),mul(y,Math.sin(angle)));hang.push(laid.hang?.[id]??-1);sewnRoots.push(...p);sewnRefs.push(laid.fabricEntry,id);return m.vertex(add(center,mul(normal,radius)),normal,color,skin);}));
                }
                for(let i=0;i+1<rows.length;i++)for(let k=0;k<6;k++){const a=rows[i][k],b=rows[i][(k+1)%6],c=rows[i+1][k],d=rows[i+1][(k+1)%6];m.tri(a,c,b);m.tri(b,c,d);}
            }
        }
        if(m.empty)return [];
        return[m.part('Sewn garment edges',{roughness:.88,metalness:0,onSkin:true,clothDetail:true,sewnRefs:Int32Array.from(sewnRefs),sewnRoots:Float32Array.from(sewnRoots),...(hang.some(h=>h>=0)?{hang:Float32Array.from(hang)}:{})})];
    }

    /** Small construction details sampled from the finished fabric, with its
     * own skin weights. They move with the shirt rather than a guessed torso. */
    function garmentFasteners(entries,built) {
        const styles={shirt:[0],polo:[0],cardigan:[0],vest:[0],gambeson:[0],suitjacket:[-.04,.04],trenchcoat:[-.045,.045],tailcoat:[-.035,.035],officerJacket:[-.035,.035]};
        const selected=entries.filter(e=>!e.skirt&&!e.lining&&styles[e.garment]);if(!selected.length)return [];
        const Props=root.RRCharacterProps||require('./CharacterProps.js'),O=root.RRCharacterOutfit||require('./CharacterOutfit.js');
        const mesh=new Props.Mesh(),compute=mesh.computeNormals.bind(mesh);mesh.computeNormals=()=>{};
        const scale=built.height/1.7,hip=built.bones.find(b=>b.name==='Hips').head[1],neck=built.bones.find(b=>b.name==='Neck').head[1];
        const hit=(laid,x,y)=>{
            const P=laid.positions;let best=null;
            for(let t=0;t<laid.index.length;t+=3){
                const ids=Array.from(laid.index.subarray(t,t+3)),[a,b,c]=ids.map(v=>v*3),d=(P[b+1]-P[c+1])*(P[a]-P[c])+(P[c]-P[b])*(P[a+1]-P[c+1]);
                if(Math.abs(d)<1e-12)continue;
                const u=((P[b+1]-P[c+1])*(x-P[c])+(P[c]-P[b])*(y-P[c+1]))/d,v=((P[c+1]-P[a+1])*(x-P[c])+(P[a]-P[c])*(y-P[c+1]))/d,w=1-u-v;
                if(Math.min(u,v,w)<0)continue;
                const z=P[a+2]*u+P[b+2]*v+P[c+2]*w;if(best&&z<=best.z)continue;
                const weights=[u,v,w],normal=[0,1,2].map(k=>ids.reduce((s,id,j)=>s+laid.normals[id*3+k]*weights[j],0)),length=Math.hypot(...normal)||1,sum=new Map();
                ids.forEach((id,j)=>{for(let k=0;k<4;k++){const b=laid.joints[id*4+k],weight=laid.weights[id*4+k]*weights[j];if(weight>0)sum.set(b,(sum.get(b)||0)+weight);}});
                const skin=[...sum].sort((a,b)=>b[1]-a[1]).slice(0,4),total=skin.reduce((s,v)=>s+v[1],0)||1;
                best={z,p:[x,y,z],n:normal.map(v=>v/length),skin:{joints:Array.from({length:4},(_,i)=>skin[i]?.[0]||0),weights:Array.from({length:4},(_,i)=>(skin[i]?.[1]||0)/total)}};
            }
            return best&&best.n[2]>.35?best:null;
        };
        const {add,mul,norm,cross}=Props.vec;
        for(const entry of selected){
            const count=entry.garment==='polo'?3:7,upper=neck-.065*scale,lower=entry.garment==='polo'?upper-.11*scale:hip+.055*scale;
            const color=O.linear(entry.look.trim||'#b9afa0'),thread=O.linear(entry.look.color||'#ddd7ca'),dark=color.map(v=>v*.15);
            for(const offset of styles[entry.garment])for(let row=0;row<count;row++){
                const x=offset*scale,y=upper+(lower-upper)*(row+.5)/count,s=hit(entry.laid,x,y);if(!s)continue;
                if(entries.some(e=>e.laid.layer>entry.laid.layer&&(hit(e.laid,x,y)?.z||-Infinity)>s.z+.001*scale))continue;
                const center=add(s.p,mul(s.n,.0015*scale)),a=norm(cross([0,1,0],s.n)),b=cross(s.n,a),radius=.0034*scale;
                mesh.loft(3,(_,t)=>({center:add(center,mul(s.n,t*.0011*scale)),x:a,y:b,rx:radius*(t===0?.90:1),ry:radius*(t===0?.90:1)}),12,color,s.skin,true);
                for(const side of [-1,1]){
                    const hole=add(add(center,mul(s.n,.0012*scale)),mul(a,side*radius*.4));mesh.disk(hole,s.n,radius*.18,dark,s.skin,8);
                    mesh.tube([add(hole,mul(b,-radius*.25)),add(add(hole,mul(s.n,.0002*scale)),mul(b,radius*.25))],.00025*scale,4,thread,s.skin);
                }
            }
        }
        if(mesh.empty)return [];compute();return[mesh.part('Garment fasteners',{roughness:.66,metalness:.12,onSkin:true})];
    }

    /**
     * The garments laid so far, for laying the next one over them: their
     * surface points and outward normals in a grid, by the layer each is in.
     */
    function underLayers() {
        const cell = 0.03, map = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
        const pts = [],sections=new Map(),faces=[];
        let pieces = 0;
        return {
            count: 0,
            add(laid, layer) {
                const P = laid.positions, N = laid.normals, piece = ++pieces;
                for (let i = 0; i < laid.rimStart; i++) {
                    const k = key(Math.floor(P[i * 3] / cell), Math.floor(P[i * 3 + 1] / cell), Math.floor(P[i * 3 + 2] / cell));
                    let list = map.get(k); if (!list) map.set(k, list = []);
                    list.push(pts.length);
                    // Outward: the way the piece was lifted off the body (a skirt's faces may turn either way).
                    const B = laid.base, out = (P[i * 3] - B[i * 3]) * N[i * 3] + (P[i * 3 + 1] - B[i * 3 + 1]) * N[i * 3 + 1] + (P[i * 3 + 2] - B[i * 3 + 2]) * N[i * 3 + 2];
                    const s = out < 0 ? -1 : 1;
                    pts.push({ p: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], n: [N[i * 3] * s, N[i * 3 + 1] * s, N[i * 3 + 2] * s], layer, piece,fam:laid.field?.[i]?.fam });
                    this.count++;
                }
                if(laid.index&&laid.field)for(let t=0;t<laid.index.length;t+=3){
                    const ids=Array.from(laid.index.subarray(t,t+3));if(ids.some(v=>v>=laid.rimStart||laid.field[v].fam===1||laid.field[v].fam===2))continue;
                    const points=ids.map(v=>Array.from(P.subarray(v*3,v*3+3))),lo=Math.floor(Math.min(...points.map(p=>p[1]))/cell),hi=Math.floor(Math.max(...points.map(p=>p[1]))/cell);
                    if(hi-lo>512)continue;
                    const face={points,layer};faces.push(face);for(let k=lo;k<=hi;k++){if(!sections.has(k))sections.set(k,[]);sections.get(k).push(face);}
                }
            },
            *probes(layer){
                for(const p of pts)if(p.layer<layer&&p.fam!==1&&p.fam!==2)yield p.p;
                for(const face of faces)if(face.layer<layer)yield[0,1,2].map(k=>face.points.reduce((s,p)=>s+p[k],0)/3);
            },
            radius(nx,nz,y,layer){
                let radius=0;
                for(const face of sections.get(Math.floor(y/cell))||[]){if(face.layer>=layer)continue;const hits=[];
                    for(let k=0;k<3;k++){const a=face.points[k],b=face.points[(k+1)%3];if(y<Math.min(a[1],b[1])||y>Math.max(a[1],b[1])||Math.abs(a[1]-b[1])<1e-9)continue;const t=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t]);}
                    if(hits.length<2)continue;const[a,b]=hits,dx=b[0]-a[0],dz=b[1]-a[1],den=nx*dz-nz*dx;if(Math.abs(den)<1e-9)continue;
                    const r=(a[0]*dz-a[1]*dx)/den,u=(a[0]*nz-a[1]*nx)/den;if(r>0&&u>=0&&u<=1)radius=Math.max(radius,r);
                }return radius;
            },
            /** The nearest point of each garment piece under `layer` within 4 cm. */
            near(x, y, z, layer) {
                const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
                const best = new Map();
                for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
                    for (const q of map.get(key(cx + i, cy + j, cz + k)) || []) {
                        const e = pts[q];
                        if (e.layer >= layer) continue;
                        const d = (e.p[0] - x) ** 2 + (e.p[1] - y) ** 2 + (e.p[2] - z) ** 2;
                        if (d > 0.0016) continue;
                        const b = best.get(e.piece);
                        if (!b || d < b.d) best.set(e.piece, { d, e });
                    }
                }
                return [...best.values()].map(b => b.e);
            }
        };
    }

    /** Tailor the upper skirt to the actual sewn bodice, rather than leaving
     * a second, unrelated helper waistband floating far outside a short torso. */
    function joinWaist(top,skirt,built,O){
        const edges=top.piece.border.filter(e=>e.every(v=>top.field[v].fam!==1&&top.field[v].fam!==2));
        if(!edges.length)return;
        const low=Math.min(...edges.flatMap(e=>e.map(v=>top.field[v].y)));
        const ids=[...new Set(edges.filter(e=>e.every(v=>top.field[v].y<low+.025)).flat())];if(ids.length<8)return;
        const points=ids.map(v=>Array.from(top.positions.subarray(v*3,v*3+3))),cx=(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,cz=(Math.min(...points.map(p=>p[2]))+Math.max(...points.map(p=>p[2])))/2;
        const tau=Math.PI*2,angle=p=>(Math.atan2(p[0]-cx,p[2]-cz)+tau)%tau;
        const loop=points.map((p,i)=>({p,a:angle(p),id:ids[i]})).sort((a,b)=>a.a-b.a),start=Math.min(...skirt.field.slice(0,skirt.rimStart).map(f=>f.u)),scale=built.height/1.7;
        const roots=[...new Set(skirt.piece.border.filter(e=>e.every(v=>skirt.field[v].u<start+.08)).flat())].map(id=>{
            const p=Array.from(skirt.positions.subarray(id*3,id*3+3));return{p,a:angle(p),u:skirt.field[id].u};
        }).sort((a,b)=>a.a-b.a);if(roots.length<8)return;
        const end=Math.max(...skirt.field.slice(0,skirt.rimStart).map(f=>f.u));
        const sample=(list,a)=>{let hi=list.findIndex(q=>q.a>=a);if(hi<0)hi=0;const b=list[hi],previous=list[(hi+list.length-1)%list.length],aa=previous.a-(hi===0?tau:0),at=a-(hi===0&&a>previous.a?tau:0),mix=Math.max(0,Math.min(1,(at-aa)/(b.a-aa)));return{b,previous,mix,p:previous.p.map((q,k)=>q+(b.p[k]-q)*mix),u:previous.u+(b.u-previous.u)*mix};};
        const delta=new Float32Array(skirt.rimStart*3);
        for(let v=0;v<skirt.rimStart;v++){
            const p=Array.from(skirt.positions.subarray(v*3,v*3+3)),a=angle(p);
            const root=sample(roots,a),{b,previous,mix,p:target}=sample(loop,a),u=skirt.field[v].u-root.u,t=Math.max(0,Math.min(1,u/.30)),blend=1-t*t*(3-2*t);
            target[1]+=.01*scale;
            const rho=Math.hypot(target[0]-cx,target[2]-cz)||1;target[0]-=(target[0]-cx)/rho*.003*scale;target[2]-=(target[2]-cz)/rho*.003*scale;
            for(let k=0;k<3;k++)delta[v*3+k]=(target[k]-root.p[k])*blend;
            // Distribute a lowered waist over the full panel, not just its
            // first rows. A local correction can turn those rows inside out
            // and compress a coat tail until it no longer has a cloth rig.
            const reach=Math.max(0,Math.min(1,u/(end-root.u||1))),drop=Math.min(.38*scale,(end-root.u)*built.height*.8);
            const nextY=Math.max(.015*scale,Math.min(p[1]+(target[1]-root.p[1])*(1-reach),target[1]-drop*reach));
            delta[v*3+1]=nextY-p[1];
            const skin=new Map(),addSkin=(part,id,weight)=>{for(let k=0;k<4;k++){const j=part.joints[id*4+k];skin.set(j,(skin.get(j)||0)+part.weights[id*4+k]*weight);}};
            addSkin(skirt,v,1-blend);addSkin(top,previous.id,blend*(1-mix));addSkin(top,b.id,blend*mix);
            const best=[...skin].sort((a,b)=>b[1]-a[1]).slice(0,4),total=best.reduce((s,p)=>s+p[1],0)||1;
            for(let k=0;k<4;k++){skirt.joints[v*4+k]=best[k]?.[0]||0;skirt.weights[v*4+k]=(best[k]?.[1]||0)/total;}
        }
        for(let v=0;v<skirt.positions.length/3;v++){
            for(let k=0;k<3;k++)skirt.positions[v*3+k]+=delta[skirt.origin[v]*3+k];
            if(v>=skirt.rimStart)for(let k=0;k<4;k++){skirt.joints[v*4+k]=skirt.joints[skirt.origin[v]*4+k];skirt.weights[v*4+k]=skirt.weights[skirt.origin[v]*4+k];}
        }
        for(let k=0;k<skirt.base.length;k++)skirt.base[k]+=delta[k];
        skirt.sewnWaist=true;
        // A sewn waist is an internal join, not two separately rolled and
        // gold-trimmed openings. Remove their turned-under returns as well.
        top.internalHem=new Uint8Array(top.positions.length/3);for(const id of ids)top.internalHem[id]=1;
        skirt.internalHem=Uint8Array.from(skirt.field,f=>f.u<start+.03?1:0);
        top.internalTrim=Uint8Array.from(top.field,f=>f.fam!==1&&f.fam!==2&&f.y<low+.07?1:0);
        skirt.internalTrim=Uint8Array.from(skirt.field,f=>f.u<start+.16?1:0);
        for(const part of [top,skirt]){
            const index=[];
            for(let t=0;t<part.index.length;t+=3){const face=Array.from(part.index.subarray(t,t+3));if(face.some(v=>v>=part.rimStart)&&face.every(v=>part.internalHem[part.origin[v]]))continue;index.push(...face);}
            part.index=Uint32Array.from(index);part.normals=O.triangleNormals(part.positions,part.index);
        }
        skirt.normals=O.triangleNormals(skirt.positions,skirt.index);
    }

    /** Close an actual gap between two pieces of one sewn garment. The
     * boundary points retain both pieces' exact skinning, including folds. */
    function waistSeam(top, skirt, item, label, O, built) {
        const tau=Math.PI*2;let center=[0,0];
        const angle=(p,i)=>((Math.atan2(p.positions[i*3]-center[0],p.positions[i*3+2]-center[1])%tau)+tau)%tau;
        const boundary=(part,isSkirt)=>{
            const candidates=part.piece.border.filter(e=>isSkirt||e.every(v=>part.field[v].fam!==1&&part.field[v].fam!==2));
            if(!candidates.length)return null;
            const value=i=>isSkirt?part.field[i].u:part.field[i].y;
            const low=Math.min(...candidates.flatMap(([a,b])=>[value(a),value(b)]));
            const edges=candidates.filter(([a,b])=>Math.max(value(a),value(b))<low+.025);
            const ids=[...new Set(edges.flat())];if(ids.length<8)return null;
            const degree=new Map();for(const[a,b]of edges){degree.set(a,(degree.get(a)||0)+1);degree.set(b,(degree.get(b)||0)+1);}
            return{ids,closed:ids.every(i=>degree.get(i)===2)};
        };
        const A=boundary(top,false),B=boundary(skirt,true);if(!A||!B)return null;
        const points=A.ids.map(i=>[top.positions[i*3],top.positions[i*3+2]]).concat(B.ids.map(i=>[skirt.positions[i*3],skirt.positions[i*3+2]]));
        center=[0,1].map(k=>(Math.min(...points.map(p=>p[k]))+Math.max(...points.map(p=>p[k])))/2);
        A.ids.sort((a,b)=>angle(top,a)-angle(top,b));B.ids.sort((a,b)=>angle(skirt,a)-angle(skirt,b));
        const loops=[A,B],sources=[top,skirt],positions=[],roots=[],joints=[],weights=[],uvs=[],sewnRefs=[],index=[],color=O.linear(item.color),scale=built.height/1.7;
        const facing=top.tailored?scale:0;
        for(let side=0;side<2;side++)for(const i of loops[side].ids){const p=sources[side],root=Array.from(p.positions.subarray(i*3,i*3+3)),a=angle(p,i);roots.push(...root);positions.push(root[0]+Math.sin(a)*.004*facing,root[1]+(side?-.025:.012)*facing,root[2]+Math.cos(a)*.004*facing);joints.push(...p.joints.subarray(i*4,i*4+4));weights.push(...p.weights.subarray(i*4,i*4+4));uvs.push(a/tau,side);sewnRefs.push(p.fabricEntry,i);}
        const na=A.ids.length,nb=B.ids.length,closed=A.closed&&B.closed,limitA=closed?na:na-1,limitB=closed?nb:nb-1;
        const add=(a,b,c)=>{
            const ids=[a,b,c],upper=ids.filter(i=>i<na),lower=ids.filter(i=>i>=na);
            if(!upper.length||!lower.length)return;
            if(!top.tailored){const mean=vs=>vs.reduce((sum,i)=>sum+positions[i*3+1],0)/vs.length;if(mean(upper)<mean(lower)+.001)return;}
            const p=i=>positions.slice(i*3,i*3+3),x=p(a),y=p(b),z=p(c),u=y.map((v,k)=>v-x[k]),v=z.map((v,k)=>v-x[k]);
            const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
            const radial=[(x[0]+y[0]+z[0])/3,0,(x[2]+y[2]+z[2])/3];
            if(n[0]*radial[0]+n[2]*radial[2]<0)index.push(a,c,b);else index.push(a,b,c);
        };
        let i=0,j=0;
        while(i<limitA||j<limitB){
            const a=i%na,b=na+j%nb,nextA=i<limitA?angle(top,A.ids[(i+1)%na])+((i+1)>=na?tau:0):Infinity,nextB=j<limitB?angle(skirt,B.ids[(j+1)%nb])+((j+1)>=nb?tau:0):Infinity;
            if(nextA<=nextB){add(a,b,(i+1)%na);i++;}else{add(a,b,na+(j+1)%nb);j++;}
        }
        if(!index.length)return null;
        const used=[...new Set(index)],map=new Map(used.map((v,i)=>[v,i])),gather=(src,n)=>Float32Array.from(used.flatMap(v=>src.slice(v*n,v*n+n)));
        const P=gather(positions,3),I=Uint32Array.from(index,i=>map.get(i)),[roughness,metalness]=MATERIAL[item.material]||MATERIAL.cloth;
        return{name:label+' waist seam',doubleSided:true,positions:P,sewnRefs:Int32Array.from(gather(sewnRefs,2)),sewnRoots:gather(roots,3),normals:O.triangleNormals(P,I),index:I,uvs:gather(uvs,2),joints:Uint8Array.from(gather(joints,4)),weights:gather(weights,4),colors:Float32Array.from({length:P.length},(_,i)=>color[i%3]),roughness,metalness};
    }

    /** A laid piece pushed out to stand a few millimeters over the garments under it; its rim follows. */
    function overlay(laid, under, O, layer) {
        const P = laid.positions, gap = 0.003, n = laid.rimStart;
        const push = new Float32Array(n * 3);
        let moved = false;
        for (let i = 0; i < n; i++) {
            // Over each piece under it near here, by as much as the deepest one asks.
            let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
            for (const e of under.near(x, y, z, laid.layer)) {
                const d = (x - e.p[0]) * e.n[0] + (y - e.p[1]) * e.n[1] + (z - e.p[2]) * e.n[2];
                if (d >= gap || d < -0.045) continue;
                const k = gap - d;
                x += e.n[0] * k; y += e.n[1] * k; z += e.n[2] * k;
            }
            if(laid.tailored&&(laid.hang||laid.field[i].fam!==1&&laid.field[i].fam!==2&&y>laid.tailorFloor)){
                const r=Math.hypot(x,z);if(r>1e-6){const radius=under.radius(x/r,z/r,y,laid.layer);if(radius&&r<radius+.020){const grow=(radius+.020)/r;x*=grow;z*=grow;}}
            }
            if (x === P[i * 3] && y === P[i * 3 + 1] && z === P[i * 3 + 2]) continue;
            push[i * 3] = x - P[i * 3]; push[i * 3 + 1] = y - P[i * 3 + 1]; push[i * 3 + 2] = z - P[i * 3 + 2];
            moved = true;
        }
        if(laid.tailored){
            // Clear actual inner surfaces between the outer mesh's corners.
            // A nearest-vertex test misses a shirt crossing a broad coat face.
            const cell=.04,grid=new Map(),at=(v,k)=>P[v*3+k]+push[v*3+k];
            for(let t=0;t<laid.index.length;t+=3){
                const ids=Array.from(laid.index.subarray(t,t+3));if(ids.some(v=>v>=n||laid.field[v].fam===1||laid.field[v].fam===2))continue;
                const lo=[0,1].map(k=>Math.floor(Math.min(...ids.map(v=>at(v,k)))/cell)),hi=[0,1].map(k=>Math.floor(Math.max(...ids.map(v=>at(v,k)))/cell));
                if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)>4096)continue;
                for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(ids);}
            }
            for(const point of under.probes(laid.layer)){
                const[x,y,z]=point;if(y<laid.tailorFloor)continue;const side=z<0?-1:1;let front=-Infinity,face=null,bary=null;
                for(const ids of grid.get(Math.floor(x/cell)+','+Math.floor(y/cell))||[]){
                    const[a,b,c]=ids,d=(at(b,1)-at(c,1))*(at(a,0)-at(c,0))+(at(c,0)-at(b,0))*(at(a,1)-at(c,1));if(d*side<1e-10)continue;
                    const u=((at(b,1)-at(c,1))*(x-at(c,0))+(at(c,0)-at(b,0))*(y-at(c,1)))/d,v=((at(c,1)-at(a,1))*(x-at(c,0))+(at(a,0)-at(c,0))*(y-at(c,1)))/d;if(u<0||v<0||u+v>1)continue;
                    const hit=side*(at(a,2)*u+at(b,2)*v+at(c,2)*(1-u-v));if(hit>front){front=hit;face=ids;bary=[u,v,1-u-v];}
                }
                if(!face||front<0)continue;const amount=side*z+.020-front;if(amount<=0)continue;
                // Each corner moves outward on its own side of the garment.
                // Translating a shared side corner forward, then backward for
                // the next probe, can stretch a coat into horizontal spikes.
                const directions=face.map(v=>at(v,2)/(Math.hypot(at(v,0),at(v,2))||1)),gain=side*directions.reduce((s,d,i)=>s+d*bary[i],0);if(gain<.15)continue;
                const step=Math.min(.04,amount/gain);face.forEach((v,i)=>push[v*3+2]+=directions[i]*step);moved=true;
            }
        }
        if (!moved) return;
        const count = P.length / 3;
        for (let i = 0; i < count; i++) {
            const o = laid.origin[i];
            P[i * 3] += push[o * 3]; P[i * 3 + 1] += push[o * 3 + 1]; P[i * 3 + 2] += push[o * 3 + 2];
        }
        laid.normals = O.triangleNormals(P, laid.index);
    }

    /**
     * A pair of shoes for a footwear item: the part (both feet, its own
     * picture, kept per look) and the skin it covers. A boot's shaft goes over
     * the trouser legs already laid.
     */
    function shoesFor(pack, built, O, item, g, raw, entries, cache, n, frame) {
        let extra = null;
        if (raw.shoe.top != null) {
            const pts = [];
            for (const e of entries) {
                if (e.skirt) continue;
                const P = e.laid.positions;
                for (let i = 0; i < P.length; i += 3) if (P[i + 1] < 0.75) pts.push(P[i], P[i + 1], P[i + 2]);
            }
            extra = Float32Array.from(pts);
        }
        const made = O.shoes(pack, built, raw.shoe, extra, frame);
        // Trouser legs that bulge between the shaft's rings are kept inside it.
        if (extra) for (const e of entries) if (!e.skirt && made.tuck(e.laid.positions)) e.laid.normals = O.triangleNormals(e.laid.positions, e.laid.index);
        const Atlas = root.RRCharacterAtlas || require('./CharacterAtlas.js');
        const look = { kind: raw.kind, color: item.color, color2: item.color2, trim: item.trim, material: item.material, laces: !!raw.shoe.laces, lames: raw.shoe.lames };
        const pictureSize = cache.pictureSize || 512;
        const key = JSON.stringify([made.template.key, look, pictureSize]);
        const store = cache.shoes || (cache.shoes = new Map());
        const name = 'shoes' + (n ? n + 1 : '') + '.png';
        let picture = store.get(key);
        if (!picture) {
            picture = Object.assign(Atlas.shoePicture(made.template, look, pictureSize), { name });
            if (store.size > 6) store.clear();
            store.set(key, picture);
        }
        if (picture.name !== name) picture = Object.assign({}, picture, { name });
        const [roughness, metalness] = MATERIAL[item.material] || MATERIAL.cloth;
        return {
            part: { name: g.label, positions: made.positions, normals: made.normals, uvs: made.uvs, index: made.index, joints: made.joints, weights: made.weights, source: made.source,
                texture: name, roughness, metalness, doubleSided: true },
            texture: picture, hidden: made.hidden
        };
    }

    /** A helmet for a head item: its shell in its own picture, a visor of glossy tinted glass where it has one. */
    function helmFor(pack, built, O, item, g, raw, cache, frame) {
        const made = O.helmet(pack, built, raw.helm, frame);
        const Atlas = root.RRCharacterAtlas || require('./CharacterAtlas.js');
        const look = { color: item.color, trim: item.trim, material: item.material };
        const textureName = raw.helm.clothHood ? 'hood-' + item.id + '.png' : 'helmet.png';
        const key = JSON.stringify([made.template.key, look]);
        const store = cache.shoes || (cache.shoes = new Map());
        let picture = store.get(key);
        if (!picture) { picture = Object.assign(Atlas.helmPicture(made.template, look, 256), { name: textureName }); store.set(key, picture); }
        const [roughness, metalness] = MATERIAL[item.material] || MATERIAL.cloth;
        const s = made.shell;
        const parts = [{ name: g.label, positions: s.positions, normals: s.normals, uvs: s.uvs, index: s.index, joints: s.joints, weights: s.weights, texture: textureName, roughness, metalness, doubleSided: true }];
        if (made.visor) {
            // The visor's tint, a little lighter toward its top where it catches the sky.
            const v = made.visor, n = v.positions.length / 3, colors = new Float32Array(n * 3), tint = O.linear(item.color2 || '#1a2a40');
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < n; i++) { lo = Math.min(lo, v.positions[i * 3 + 1]); hi = Math.max(hi, v.positions[i * 3 + 1]); }
            for (let i = 0; i < n; i++) { const k = 0.8 + 0.4 * (v.positions[i * 3 + 1] - lo) / ((hi - lo) || 1); colors.set([tint[0] * k, tint[1] * k, tint[2] * k], i * 3); }
            parts.push({ name: g.label + ' visor', positions: v.positions, normals: v.normals, index: v.index, joints: v.joints, weights: v.weights, colors, roughness: 0.06, metalness: 0.9, doubleSided: true });
        }
        return { parts, texture: picture, hidden: made.hidden };
    }

    /** A belt for a waist item: a band over what is worn under it, its own picture kept per look. */
    function beltFor(pack, built, O, item, g, raw, entries, cache) {
        const pts = [];
        for (const e of entries) {
            const P = e.laid.positions;
            for (let i = 0; i < P.length; i += 3) pts.push(P[i], P[i + 1], P[i + 2]);
        }
        const made = O.band(pack, built, raw.band, Float32Array.from(pts));
        const Atlas = root.RRCharacterAtlas || require('./CharacterAtlas.js');
        const look = { color: item.color, buckle: item.color2, material: item.material };
        const key = JSON.stringify(['belt', look]);
        const store = cache.shoes || (cache.shoes = new Map());
        let picture = store.get(key);
        if (!picture) { picture = Object.assign(Atlas.beltPicture(look, 1024), { name: 'belt.png' }); store.set(key, picture); }
        const [roughness, metalness] = MATERIAL[item.material] || MATERIAL.cloth;
        return {
            part: { name: g.label, positions: made.positions, normals: made.normals, uvs: made.uvs, index: made.index, joints: made.joints, weights: made.weights, source: made.source,
                texture: 'belt.png', roughness, metalness },
            texture: picture, cover: made.cover
        };
    }

    function cutSettings(item) {
        const out = {};
        for (const k of ['sleeves', 'length', 'fit', 'flare', 'bell', 'open', 'face', 'bulk', 'neckline', 'slits']) if (item[k] != null) out[k] = typeof item[k] === 'number' ? Math.round(item[k] * 100) / 100 : item[k];
        return out;
    }

    /** A piece split into plates: gaps across a chain at even steps. */
    function bandedValue(spec, O) {
        const inner = spec.value;
        return (an, v) => {
            let c = inner ? inner(an, v) : O.coverage(an, v, spec.rules);
            for (const key in spec.bands) {
                const [from, to, count, gap] = spec.bands[key];
                const fams = key === 'spine' ? [0] : key === 'arms' ? [1, 2] : key === 'legs' ? [3, 4] : [];
                if (key === 'skirt') {
                    const u = an.skirtU[v];
                    if (u > from && u < to) {
                        const x = (u - from) / (to - from) * count, f = x - Math.floor(x);
                        c = Math.min(c, (Math.min(f, 1 - f) - gap * count / (to - from) / 2) * 0.5);
                    }
                    continue;
                }
                for (const fi of fams) {
                    if (an.member[v * 5 + fi] < 0.5) continue;
                    const sv = an.s[v * 5 + fi];
                    if (sv <= from || sv >= to) continue;
                    const x = (sv - from) / (to - from) * count, f = x - Math.floor(x);
                    if (Math.floor(x) === 0 && f < 0.5) continue;
                    c = Math.min(c, (Math.min(f, 1 - f) * (to - from) / count - gap / 2) * 2);
                }
            }
            return c;
        };
    }

    /**
     * The skin a piece covers. A piece with an opening that is looked into (`hideMargin`) leaves the
     * skin a little way in under its edge, measured on the coverage smoothed over the skin as the
     * piece's own cut is over its surface.
     */
    function markCovered(pack, O, spec, covered) {
        const an = O.anatomy(pack);
        const ids = pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)]);
        const raw = new Float32Array(pack.vertexCount).fill(-1);
        for (const v of ids) raw[v] = spec.value ? spec.value(an, v) : O.coverage(an, v, spec.rules);
        const eased = spec.hideMargin ? O.relaxScalar(pack.body, raw, (spec.smoothCut ?? 3) + 2) : raw;
        for (const v of ids) {
            const c = Math.min(raw[v], eased[v]) - (spec.hideMargin || 0);
            if (c > covered[v]) covered[v] = c;
        }
    }

    /**
     * A preset's garments for a body: a woman dressed in a set that leaves the
     * chest bare (a barbarian's, a gladiator's) gets a cropped leather top.
     */
    const CHEST = new Set(['top', 'dress', 'armor', 'under', 'underwearTop', 'mail']);
    function dressFor(items, female) {
        if (!items.length || !female || items.some(i => CHEST.has((BY_ID.get(i.id) || {}).slot))) return items;
        return items.concat([{ id: 'tanktop', color: '#5a3d22', material: 'leather', length: 0.32 }]);
    }

    // ── random outfits ────────────────────────────────────────────────────
    /**
     * Colors a costume designer would pick for each setting, by what a piece
     * is: tops in the setting's colors, trousers and skirts in its quieter
     * ones, coats and vests in deeper ones, footwear, belts and gloves in
     * leather or rubber.
     */
    const THEME_COLORS = {
        Everyday: { top: ['#2f4468', '#7a3b3b', '#3e5a32', '#d8d0c0', '#3a6a8a', '#e8e4dc', '#5a5e66', '#8a2a3a', '#c8a040', '#1f1f24'],
            bottom: ['#2f4468', '#22252b', '#5a4a38', '#8a7a5a', '#1f1f24', '#3a3e46'], over: ['#2b2e36', '#5a3d22', '#7b6345', '#3a4250', '#1f1f24', '#5a2a2a'],
            feet: ['#1b1612', '#3a2618', '#5a3d22', '#22252b'], head: ['#b84a2e', '#2f4468', '#3e5a32', '#5a5e66', '#d8d0c0'] },
        Fantasy: { top: ['#ece3cf', '#6b7a3a', '#7a3b3b', '#2e3f8a', '#8a6a44', '#3e5a32', '#5a2a4a', '#d8c8a0'],
            bottom: ['#3a3024', '#5a4a32', '#2a2620', '#4a3a2a', '#3e4a32'], over: ['#5a3d22', '#3a2614', '#2f4a2a', '#6a1a2a', '#3b3b46', '#4a3220'],
            feet: ['#3a2618', '#4a3020', '#2a1e14', '#5a3d22'], head: ['#2f4a2a', '#3b3b46', '#5a3d22', '#6a1a2a'] },
        Armor: { top: ['#ece8dc', '#3a3e46', '#6a1a2a', '#2e3f8a', '#3e5a32', '#5a3d22'], bottom: ['#3a3e46', '#2a2620', '#5a5e66'], over: ['#6a1a2a', '#2e3f8a', '#1f1f24'],
            feet: ['#3a2618', '#2a1e14'], head: ['#3b3b46'] },
        'Sci-fi': { top: ['#20242c', '#d8dce2', '#3a4250', '#1a2030', '#4a5240', '#5a606a'], bottom: ['#20242c', '#3a4250', '#16141c', '#4a5240'], over: ['#16141c', '#3a4250', '#2a3240'],
            feet: ['#20242c', '#3a4250', '#16141c'], head: ['#3a4250'], accent: ['#36c2ff', '#ff2bd6', '#d86a2a', '#ffb020', '#30d070', '#ff3030'] }
    };
    const ROLE = { under: 'top', top: 'top', dress: 'top', mail: 'top', bottom: 'bottom', over: 'over', armor: 'over', feet: 'feet', hands: 'feet', waist: 'feet', wrists: 'bottom', head: 'head' };
    /** Accessories that belong with each outfit (none for some). */
    const PRESET_PROPS = {
        casual: ['cap', 'sunglasses', 'glasses', 'studs', 'backpack'], office: ['glasses', 'studs', 'necklace'], winter: ['scarf', 'glasses'], detective: ['fedora', 'glasses'],
        sporty: ['cap', 'headband', 'sunglasses'], summerdress: ['sunglasses', 'hoops', 'necklace', 'studs'], underwear: [],
        peasantf: ['headband', 'necklace'], farmer: ['cowboy', 'scarf'], ranger: ['quiver', 'scarf'], rogue: ['quiver', 'eyepatch'], mage: ['wizardhat', 'circlet', 'necklace'],
        priest: ['necklace', 'circlet'], noble: ['crown', 'circlet', 'necklace', 'choker', 'hoops'], prince: ['crown', 'circlet', 'cape'], barbarian: ['vikinghelm', 'bracelets', 'necklace'],
        pirate: ['tricorn', 'eyepatch', 'hoops'], monk: ['necklace'], knight: ['cape'], paladin: ['cape'], gladiator: ['bracelets', 'headband'], darkknight: ['cape'],
        pilot: ['goggles', 'jetpack', 'backpack'], astronaut: ['jetpack'], trooper: ['jetpack'], marine: ['jetpack'], cyberpunk: ['visor', 'sunglasses', 'choker', 'studs'], soldier: ['backpack', 'sunglasses', 'cap'],
        courier: ['utilityHarness', 'goggles'], pathfinder: ['utilityHarness', 'backpack']
    };
    const HATS = new Set(['wizardhat', 'witchhat', 'tophat', 'fedora', 'cowboy', 'bowler', 'tricorn', 'cap', 'crown', 'circlet', 'vikinghelm', 'headband', 'halo']);
    const FACE = new Set(['glasses', 'sunglasses', 'monocle', 'eyepatch', 'goggles', 'visor']);

    /**
     * A random outfit and its accessories for a setting (`theme`), drawn with
     * `rand`: one of the setting's outfits, recolored by role in the setting's
     * colors (or kept as designed), with an accessory that belongs to it. A
     * helmet or hood leaves no room for a hat; a closed helmet none for
     * glasses. Returns { outfit, props, hat } (hat: a hat was chosen).
     */
    function dressRandom(rand, theme, female) {
        const pick = list => list[Math.floor(rand() * list.length)];
        const presets = PRESETS.filter(p => p.group === theme && p.items.length);
        const preset = pick(presets.length ? presets : PRESETS.filter(p => p.items.length));
        const colors = THEME_COLORS[preset.group] || THEME_COLORS.Everyday;
        const designed = rand() < 0.3;
        const chosen = {};
        const outfit = dressFor(preset.items, female).map(item => {
            const def = BY_ID.get(item.id);
            const material = item.material || (def && def.defaults.material);
            if (designed || material === 'metal' || material === 'gold' || !def || def.modeled) return Object.assign({}, item);
            // Gloves keep the outfit's own; sneakers come in white, black or a bright color.
            if (def.slot === 'hands') return Object.assign({}, item);
            const role = material === 'rubber' && def.slot === 'feet' ? 'rubber' : ROLE[def.slot] || 'top';
            const list = role === 'rubber' ? ['#f4f4f4', '#e8e8e8', '#22252b', '#c03030', '#2f4468'] : colors[role] || colors.top;
            // Pieces of one role share a color (a hood and a cloak, both boots and gloves).
            const color = chosen[role] || (chosen[role] = pick(list));
            const out = Object.assign({}, item, { color });
            // A bright accent goes on panel lines only; a print (camouflage, stripes) keeps to a darker shade of its own color.
            const pattern = item.pattern || def.defaults.pattern;
            if (colors.accent && def.defaults.color2 && pattern === 'panels') out.color2 = chosen.accent || (chosen.accent = pick(colors.accent));
            else if (pattern && pattern !== 'solid') out.color2 = shadeHex(color, 0.7);
            return out;
        });
        const covers = outfit.map(i => BY_ID.get(i.id).slot === 'head' ? i.id : null).filter(Boolean);
        let options = (PRESET_PROPS[preset.id] || []).filter(id => !(covers.length && HATS.has(id)) && !(covers.some(id2 => id2 === 'greathelm' || id2 === 'visorhelm' || id2 === 'powerhelm') && FACE.has(id)));
        // Earrings and necklaces are mostly a woman's choice here; a man keeps the rest.
        if (!female) options = options.filter(id => !['hoops', 'choker'].includes(id));
        const props = options.length && rand() < 0.5 ? [{ id: pick(options) }] : [];
        return { outfit, props, preset: preset.id, hat: props.some(p => HATS.has(p.id) && p.id !== 'halo' && p.id !== 'headband' && p.id !== 'circlet') };
    }

    /** A color darker (k < 1) or lighter by a factor, as hex. */
    function shadeHex(hex, k) {
        const n = parseInt(hex.slice(1), 16), c = x => Math.max(0, Math.min(255, Math.round(x * k)));
        return '#' + ((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0');
    }

    /** Hair that fits under a hat: a full or tall style traded for a close one of the same length. */
    const UNDER_HAT = { male: ['crew', 'buzz', 'sidePart', 'slickBack', 'messy'], female: ['ponytailLow', 'bunLow', 'braid', 'bob', 'shoulder', 'long'] };
    const FLAT_ENOUGH = new Set(['bald', 'buzz', 'crew', 'sidePart', 'slickBack', 'messy', 'bob', 'shoulder', 'long', 'ponytailLow', 'bunLow', 'braid', 'twinBraids', 'longWavy', 'undercut']);
    function hairUnderHat(hair, rand, male) {
        if (FLAT_ENOUGH.has(hair.style)) return Object.assign({}, hair, { volume: Math.min(hair.volume ?? 0.5, 0.3) });
        const list = UNDER_HAT[male ? 'male' : 'female'];
        return Object.assign({}, hair, { style: list[Math.floor(rand() * list.length)], volume: 0.2 });
    }

    const api = { GARMENTS, BY_ID, SLOTS, PRESETS, PATTERNS, NECKLINE_CHOICES, MATERIAL, normalizeItem, normalizeOutfit, dressFor, build, dressRandom, hairUnderHat };
    root.RRCharacterWardrobe = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
