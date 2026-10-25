/**
 * RRCharacterModel - a whole character from its recipe: the body, its skin
 * and eyes, the outfit, the hair, accessories and species features; or a
 * four-legged creature. The builder page draws what this returns and Save
 * writes it to a GLB; the node tests check it.
 *
 * A recipe: { plan: 'human' | 'quadruped', name?, seed?, ...body sliders,
 * species, features, skinPattern, eyes, hair, outfit, props } for a human
 * (see RRHumanBody, RRCharacterSpecies, RRCharacterSkin, RRCharacterHair,
 * RRCharacterWardrobe, RRCharacterProps), or RRCreatureBody's recipe.
 *
 * Results: { parts, bones, height, textures: { name: {width, height, data} },
 * clips, sidecar? }. Pictures depend on their settings only and are kept in
 * the cache between builds, so moving a body slider repaints nothing.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Body = need('RRHumanBody', './HumanBody.js');
    const Glb = need('RRCharacterGlb', './CharacterGlb.js');
    const Hair = need('RRCharacterHair', './CharacterHair.js');
    const Wardrobe = need('RRCharacterWardrobe', './CharacterWardrobe.js');
    const Props = need('RRCharacterProps', './CharacterProps.js');
    const Species = need('RRCharacterSpecies', './CharacterSpecies.js');
    const Skin = need('RRCharacterSkin', './CharacterSkin.js');
    const Creature = need('RRCreatureBody', './CreatureBody.js');
    const Shading = need('RRCharacterShading', './CharacterShading.js');
    const Detail = need('RRCharacterDetail', './CharacterDetail.js');
    const Cloth = need('RRCharacterCloth', './CharacterCloth.js');
    // Expressions hook (RRCharacterExpressions): the teeth and tongue, the mouth's inside, the saved face morphs.
    const Expressions = (() => { try { return need('RRCharacterExpressions', './CharacterExpressions.js'); } catch (_) { return null; } })();
    // Slimefolk hook (RRSlimeBody): a body plan of goo of its own.
    const Slime = (() => { try { return need('RRSlimeBody', './SlimeBody.js'); } catch (_) { return null; } })();
    const slimeSpecies = id => !!Slime && (Species.BY_ID.get(id) || {}).plan === 'slime';
    // Merfolk hook (RRMerfolkBody): a fish's tail in place of the legs, its fins, its clips.
    const Merfolk = (() => { try { return need('RRMerfolkBody', './MerfolkBody.js'); } catch (_) { return null; } })();

    /** A full recipe from a partial one; the plan decides which half it is. */
    function normalize(input) {
        const r = input || {};
        if (r.plan === 'quadruped') return Object.assign(Creature.normalizeRecipe(r), { plan: 'quadruped' });
        // Slimefolk hook: a goo recipe of its own.
        if (Slime && (r.plan === 'slime' || (r.plan == null && slimeSpecies(r.species)))) return Slime.normalizeRecipe(r);
        const body = Body.normalizeRecipe(r);
        const out = Object.assign(body, {
            plan: 'human',
            species: Species.BY_ID.has(r.species) && !Species.BY_ID.get(r.species).plan ? r.species : 'human',
            features: Species.normalizeFeatures(r.features),
            skinPattern: Skin.normalizeSkin(r.skinPattern),
            eyes: Skin.normalizeEyes(r.eyes),
            // A pattern without regions of its own: a woman's Natural and Light are a woman's.
            bodyHair: Skin.normalizeBodyHair(r.bodyHair && !r.bodyHair.regions && Body.sexOf(body) === 'female' && Skin.HAIR_PRESETS[(r.bodyHair.pattern || 'natural') + 'Female']
                ? Object.assign({}, r.bodyHair, { regions: Skin.HAIR_PRESETS[(r.bodyHair.pattern || 'natural') + 'Female'] }) : r.bodyHair),
            hair: Hair.normalizeHair(r.hair || (r.bald ? { style: 'bald', brows: { style: 'none' } } : undefined)),
            outfit: Wardrobe.normalizeOutfit(r.outfit),
            props: Props.normalizeProps(r.props),
            // A Head choice (`headId`, from the picker) sets the head anew; otherwise the recipe's own head.
            head: normalizeHead(typeof r.headId === 'string' ? Species.headPreset(r.headId) : r.head)
        });
        // Human headwear has one shell/face opening and cannot fit a forked neck.
        out.outfit=out.outfit.filter(item=>fitsGarment(out,item.id));
        out.props=out.props.filter(item=>fitsProp(out,item.id));
        // Merfolk hook: the tail's settings, and nothing a tail cannot wear.
        return Merfolk ? Merfolk.normalizeRecipe(out, r) : out;
    }

    function fitsGarment(r,id){return r.head?.heads!==2||Wardrobe.BY_ID.get(id)?.slot!=='head';}
    function fitsProp(r,id){return r.head?.heads!==2||!['eyes','hat','halo','earrings','mask','headset'].includes(Props.BY_ID.get(id)?.slot);}

    /**
     * An animal head in place of the human one: { kind } of a four-legged
     * creature, with any of its head settings (snout, ears, mane, pattern,
     * horns, colors) over the kind's own; null for the human head.
     */
    function normalizeHead(h) {
        if (!h || !Creature.KINDS.concat(Creature.HEAD_KINDS || []).some(k => !k.form && k.kind === h.kind)) return null;
        const out = { id: Species.headId(h), kind: h.kind };
        if(h.heads===2)out.heads=2;
        for (const s of Creature.SLIDERS) if (Number.isFinite(+h[s.key]) && h[s.key] !== '' && h[s.key] != null) out[s.key] = +h[s.key];
        for (const o of Creature.OPTIONS) if (o.choices.some(c => c.id === h[o.key])) out[o.key] = h[o.key];
        if (h.beak === 'hooked' || h.beak === 'straight') out.beak = h.beak;
        if (h.colors) { out.colors = {}; for (const c of Creature.COLORS) if (/^#[0-9a-f]{6}$/i.test(h.colors[c.key] || '')) out.colors[c.key] = h.colors[c.key]; }
        return out;
    }

    /**
     * A species applied to a recipe: the species' preset over the average
     * body, the old recipe's gender, age, ancestry, outfit and accessories
     * kept. Hair follows the species when it is bald by nature. What the old
     * species brought (its accessories, skin, markings, eyes, age, coat) goes
     * with it; what was chosen for a species without its own is kept.
     */
    function withSpecies(recipe, id) {
        // Slimefolk hook: becoming goo starts from the Slimefolk's own recipe; leaving it, from the new species' own.
        if (slimeSpecies(id)) return Slime.normalizeRecipe(recipe && recipe.seed != null ? { seed: recipe.seed } : {});
        if (recipe && recipe.plan === 'slime') recipe = recipe.seed != null ? { seed: recipe.seed } : {};
        const old = normalize(recipe);
        const preset = Species.speciesRecipe(id);
        const was = (Species.BY_ID.get(old.species) || {}).recipe || {};
        // A species' beard is a man's: a woman keeps her own face.
        if (preset.hair && preset.hair.facial && old.gender < 0.5) preset.hair = Object.assign({}, preset.hair, { facial: old.hair.facial });
        const own = key => (preset[key] != null ? preset[key] : was[key] != null ? undefined : old[key]);
        const brought = new Set((was.props || []).map(p => p.id));
        const hairBase = was.bald || was.hair ? Hair.randomHair(((old.seed ?? 1) ^ 0x5bd1e995) >>> 0, { gender: old.gender > 0.5 ? 'male' : 'female' }) : old.hair;
        const next = Object.assign({}, preset, {
            plan: 'human', gender: old.gender, age: own('age'), ancestry: old.ancestry,
            skin: own('skin'), skinPattern: own('skinPattern'), eyes: own('eyes'), head: own('head') || null,
            bodyHair: preset.bodyHair || was.bodyHair ? (preset.bodyHair || {}) : old.bodyHair,
            anatomy: { ...old.anatomy, paired: id === 'klingon' },
            outfit: old.outfit, props: (preset.props || []).concat(old.props.filter(p => !brought.has(p.id) && !(preset.props || []).some(q => q.id === p.id))),
            // Hair follows a species bald by nature; leaving one, or one with its own hair or beard, the person's own grows back.
            hair: preset.bald ? { style: 'bald', brows: { style: 'none' }, lashes: false } : Object.assign({}, hairBase, preset.hair)
        });
        if (old.seed != null) next.seed = old.seed;
        return normalize(next);
    }

    const HAIR_COVERS = new Set(['helm', 'greathelm', 'visorhelm', 'powerhelm', 'hood', 'hoodie']);
    const FACE_COVERS = new Set(['greathelm', 'visorhelm', 'powerhelm']);

    function textureKey(name, settings) { return name + ':' + JSON.stringify(settings); }

    /**
     * Builds a character. `cache` (an object kept by the caller) holds the
     * outfit's cut and picture and the painted skin and eyes; `options`:
     * { quality: 'preview'|'save', eyeSource: {width, height, data} (the
     * eye picture's RGBA), skinSize, atlasSize }.
     */
    function build(pack, recipe, cache, options) {
        cache = cache || {};
        const o = options || {};
        const r = normalize(recipe);
        // Slimefolk hook: the goo body, its eyes, bubbles and hats (RRSlimeBody.build).
        if (r.plan === 'slime') return Slime.build(r, cache, o);
        if (r.plan === 'quadruped') {
            const built = Creature.build(r, { quality: o.quality || 'save', hairBudget: o.hairBudget, static: o.static, draft: o.draft });
            if (o.quality === 'save' || o.quality == null || o.shade) shade(built.parts);
            return { recipe: r, parts: built.parts, bones: built.bones, height: built.height, textures: built.textures || {}, clips: built.clips, sidecar: Creature.sidecar(built), plan: 'quadruped' };
        }
        const built = Body.build(pack, r);
        const textures = {};
        const graftKind = r.head ? r.head.kind : null;
        let strandHidden = null;
        if (graftKind) {
            strandHidden = new Set();
            const head = built.bones.findIndex(b => b.name === 'Head');
            for (const v of pack.body.source) { let w = 0; for (let k = 0; k < 4; k++) if (pack.skinJoints[v * 4 + k] === head) w += pack.skinWeights[v * 4 + k]; if (w > 0.45) strandHidden.add(v); }
        }
        // Merfolk hook: the skin below the scale line is the tail's, and grows no hair.
        const mer = Merfolk && r.species === 'merfolk' ? Merfolk.cutOf(pack) : null;
        if (mer) strandHidden = new Set([...(strandHidden || []), ...mer.hidden]);

        // The outfit, and the skin it covers left out.
        cache.wardrobe = cache.wardrobe || {};
        cache.wardrobe.pictureSize = o.static ? o.atlasSize || 256 : 1024;
        cache.wardrobe.atlasSize = o.atlasSize || (o.static?256:2048);
        const outfit = Wardrobe.build(pack, built, r.outfit, cache.wardrobe);
        if (outfit.texture) textures[outfit.texture.name] = outfit.texture;
        for (const t of outfit.textures || []) textures[t.name] = t;

        // The body: its painted skin, the covered triangles dropped.
        const body = Object.assign({}, built.parts[0]);
        if (outfit.hidden.size || mer) {
            const keep = [];
            const src = pack.body.source, I = body.index;
            const gone = v => outfit.hidden.has(v) || (!!mer && mer.hidden.has(v));
            for (let t = 0; t < I.length; t += 3) {
                if (gone(src[I[t]]) && gone(src[I[t + 1]]) && gone(src[I[t + 2]])) continue;
                keep.push(I[t], I[t + 1], I[t + 2]);
            }
            body.index = Uint32Array.from(keep);
        }
        // The skin picture: 1024 in the view (painted once per skin setting), 2048 in a saved file.
        const skinSize = o.skinSize || (o.quality === 'preview' ? 1024 : 2048);
        // A man's shaved beard shadows his jaw, unless his species has no hair.
        const beard = r.gender > 0.6 && r.age > 16 && !(Species.BY_ID.get(r.species)?.recipe || {}).bald ? Math.round((r.gender - 0.6) * 2.5 * 10) / 10 : 0;
        const sex = Body.sexOf(r);
        const anatomy = { detail: r.anatomy.detail, female: sex === 'female', cup: 0, areola: r.anatomy.areola, areolaColor: r.anatomy.areolaColor, fold: r.anatomy.fold };
        const bodyHair = Object.assign({}, r.bodyHair, { color: r.bodyHair.color || r.hair.color });
        const earHoles = r.morph.earsAway > 0.6 && r.morph.earHoles > 0;
        // A style with hair over the scalp colors the scalp under it (not for the shortest crops or a bald head).
        const scalp = r.hair.style !== 'bald' && !r.outfit.some(i => HAIR_COVERS.has(i.id)) ? { color: r.hair.color, recede: r.hair.hairline || 0, style: r.hair.style } : null;
        // Facial hair paints its zone into the skin under it (not under a closed helmet).
        const facial = r.hair.facial.style !== 'none' && !r.outfit.some(i => FACE_COVERS.has(i.id)) ? { style: r.hair.facial.style, color: r.hair.facial.color || r.hair.color } : null;
        const skinKey = textureKey('skin', [r.skin, r.skinPattern, skinSize, beard, anatomy, bodyHair, earHoles, scalp, Skin.ageStep(r.age), facial]);
        if (cache.skinKey !== skinKey) {
            const args = { skin: r.skin, pattern: r.skinPattern, options: { size: skinSize, beard, anatomy, bodyHair, earHoles, scalp, age: Skin.ageStep(r.age), facial } };
            // A painter off the page (the builder's worker) answers later; until then the last skin stays.
            const painted = o.paintSkin ? o.paintSkin(skinKey, args) : Skin.paint(pack, args.skin, args.pattern, args.options);
            if (painted) { cache.skin = painted; cache.skinKey = skinKey; }
            else if (!cache.skin) cache.skin = flatPicture(r.skin);
        }
        textures['skin.png'] = cache.skin;
        body.texture = 'skin.png';
        if(cache.skin.normal&&r.skinPattern.type==='scales'){textures['skin-scales-normal.png']=cache.skin.normal;body.normalTexture='skin-scales-normal.png';body.normalScale=.55;}
        // Scales and panels shine; skin under a coat is as matte as the fur painted on it.
        body.roughness = r.skinPattern.type === 'scales' || r.skinPattern.type === 'panels' ? 0.45 : r.bodyHair.fur > 0.3 ? 0.85 : 0.62;
        if (r.features.machinery.type === 'android') { body.roughness = 0.42; body.metalness = 0.15; }

        const eyes = Object.assign({}, built.parts[1], { roughness: 0.25, cutout: true });
        if (o.eyeSource) {
            const eyeKey = textureKey('eyes', [r.eyes, o.eyeSource.width, o.eyeSource.height]);
            if (cache.eyeKey !== eyeKey) {
                cache.eyes = { width: o.eyeSource.width, height: o.eyeSource.height, data: Skin.paintEyes(o.eyeSource.data, o.eyeSource.width, r.eyes), name: 'eyes.png' };
                cache.eyeKey = eyeKey;
            }
            textures['eyes.png'] = cache.eyes;
            eyes.texture = 'eyes.png';
        }

        // An animal head brings its own eyes.
        const parts = graftKind ? [body] : [body, eyes];
        if (!graftKind && !o.static && (r.morph.cranialRidges > 0 || r.morph.foreheadSpoon > 0 || r.morph.noseFolds > 0)) {
            const forehead = Detail.cranialPart(pack, built, r, body);
            if (forehead) parts.push(forehead);
        }
        // Body hair and fur: strands grown out of the uncovered skin.
        const skinNormals = Body.vertexNormals(pack, built.shaped);
        // Body hair: single strands where it grows; fur: dense tufts over it.
        const budget = o.hairBudget || 1;
        if (bodyHair.amount > 0.01 && bodyHair.fur <= 0.05) {
            // In clumps of fine hairs, like locks of head hair: many hairs to a card.
            const strands = Detail.hairStrands(pack, Object.assign({}, bodyHair, { budget }), strandHidden ? new Set([...(outfit.noHair || outfit.hidden), ...strandHidden]) : (outfit.noHair || outfit.hidden), 'clump');
            if (strands.length) {
                textures['bodyhair.png'] = cache.bodyHairTex || (cache.bodyHairTex = Detail.bodyHairTexture(256));
                parts.push(Detail.hairPart(pack, built.shaped, skinNormals, strands, bodyHair.color, { mode: 'clump', skin: r.skin }));
            }
        }
        if (bodyHair.fur > 0.05) {
            // A painted undercoat plus one fur layer supplies the coverage.
            // Stacking full body-hair clumps beneath full fur tripled the
            // geometry on beastfolk without improving their silhouette.
            const furBudget=budget*.55;
            const tufts = Detail.hairStrands(pack, Object.assign({}, bodyHair, { amount: Math.max(bodyHair.amount, bodyHair.fur), budget:furBudget }), strandHidden ? new Set([...(outfit.noHair || outfit.hidden), ...strandHidden]) : (outfit.noHair || outfit.hidden), 'tuft');
            if (tufts.length) {
                textures['bodyhair.png'] = cache.bodyHairTex || (cache.bodyHairTex = Detail.bodyHairTexture(256));
                parts.push(Detail.hairPart(pack, built.shaped, skinNormals, tufts, bodyHair.color, { width: (1 + bodyHair.fur)/Math.sqrt(.55), name: 'Fur', skin: r.skin, picture:cache.skin }));
            }
        }
        // The areolas: their own patch with its own picture, sharp at any distance.
        if (r.anatomy.detail && !outfit.hidden.has(Body.anatomyFields(pack).nipples[0].v)) {
            const reach = (sex === 'female' ? 0.026 : 0.014) * r.anatomy.areola;
            const nip = Body.anatomyFields(pack).nipples[0].v;
            const cover = bodyHair.amount > 0.01 || bodyHair.fur > 0.05 ? Skin.hairCover(bodyHair, Skin.hairField(pack, bodyHair.regions)[nip]) : 0;
            const size = o.static ? 256 : o.quality === 'save' ? 1024 : 512;
            const areolaKey = textureKey('areola', [r.skin, r.anatomy.areolaColor, r.anatomy.areola, r.anatomy.nipple, sex, cover.toFixed(3), bodyHair.color, size]);
            if (cache.areolaKey !== areolaKey) { cache.areola = Detail.areolaTexture(r.skin, { size, relief: !o.static, color: r.anatomy.areolaColor, areolaScale: r.anatomy.areola, nippleScale: Math.sqrt(r.anatomy.nipple), male: sex === 'male', under: bodyHair.color, cover }); cache.areolaKey = areolaKey; }
            textures['areola.png'] = cache.areola;
            const chest = o.static ? null : Detail.chestParts(pack, built, r, body, reach);
            if (chest) parts.push(chest.base);
            const patch = chest ? chest.overlay : Detail.areolaPart(pack, built.shaped, skinNormals, reach, body);
            if (cache.areola.normal) { textures['areola_n.png'] = cache.areola.normal; patch.normalTexture = 'areola_n.png'; patch.normalScale = 0.4; }
            parts.push(patch);
        }
        // Local anatomical geometry and relief; left out under covering garments.
        if (r.anatomy.detail && !mer && !outfit.hidden.has(Body.anatomyFields(pack).low)) {
            const size = o.static ? 128 : o.quality === 'preview' ? 512 : 1024;
            const pigment = sex === 'female' ? [r.anatomy.fold, r.anatomy.innerLabia, r.anatomy.clitoris] : r.anatomy.foreskin;
            const key = textureKey('genital', [r.skin, r.skinPattern, sex, size, pigment, bodyHair]);
            if (cache.genitalKey !== key) {
                cache.genital = Detail.genitalTexture(pack, r.skin, r.skinPattern, { size, anatomy: { ...r.anatomy, female: sex === 'female' }, bodyHair, relief: !o.static }, sex === 'female');
                cache.genitalKey = key;
            }
            textures['genital.png'] = cache.genital;
            if (cache.genital.normal) textures['genital_n.png'] = cache.genital.normal;
            if (sex === 'female') Detail.replaceGenitalSurface(pack, body);
            parts.push(Detail.genitalPart(pack, built, body, sex === 'female', { static: !!o.static, anatomy: r.anatomy }));
        }
        // Under a helmet or a hood the hair is not drawn; under a closed helmet the beard neither.
        const covers = r.outfit.map(i => i.id);
        let hairRecipe = r.hair;
        if (covers.some(id => HAIR_COVERS.has(id))) {
            const closed = covers.some(id => FACE_COVERS.has(id));
            hairRecipe = Object.assign({}, r.hair, { style: 'bald', facial: closed ? Object.assign({}, r.hair.facial, { style: 'none' }) : r.hair.facial });
        }
        if (graftKind) hairRecipe = Object.assign({}, hairRecipe, { style: 'bald', brows: { style: 'none' }, lashes: false, facial: Object.assign({}, r.hair.facial, { style: 'none' }) });
        // Merfolk hook: wet hair lies flat.
        if (mer && r.merfolk.wetHair) hairRecipe = Object.assign({}, hairRecipe, { volume: Math.min(hairRecipe.volume, 0.12) });
        const hair = Hair.build(pack, built, hairRecipe, { seed: r.seed, skin: r.skin, budget: o.hairBudget, gender: r.gender, outfitParts: outfit.parts });
        if (mer && r.merfolk.wetHair) Merfolk.wetHair(hair);
        if (hair.some(p => p.texture === 'lashes.png')) textures['lashes.png'] = cache.lashes || (cache.lashes = Hair.lashTexture(128));
        if (hair.some(p => p.texture === 'hair.png')) textures['hair.png'] = cache.hairStrands || (cache.hairStrands = Hair.hairTexture(256));
        if (hair.some(p => p.texture === 'brows.png')) {
            const browKey = JSON.stringify([hairRecipe.brows, hairRecipe.color]);
            if (cache.browKey !== browKey) { cache.brows = Hair.browTexture(Hair.normalizeHair(hairRecipe).brows, (hairRecipe.brows && hairRecipe.brows.color) || hairRecipe.color); cache.browKey = browKey; }
            textures['brows.png'] = cache.brows;
        }
        const L = Props.landmarks(pack, built);
        const coveredHands = r.outfit.some(item => Wardrobe.BY_ID.get(item.id)?.slot === 'hands' && item.id !== 'fingerlessGloves');
        const props = Props.build(pack, built, coveredHands ? r.props.filter(item => item.id !== 'nails' && item.id !== 'claws') : r.props, hair, { outfitParts: outfit.parts });
        // Furred features grow the body's coat when it has one (its length and color), a coat of their own when not.
        const furred = bodyHair.fur > 0.05;
        const features = Species.build(pack, built, graftKind ? headless(r.features) : r.features, L, { body, coat: { length: furred ? bodyHair.length || 1 : 1, color: furred ? bodyHair.color : null, budget } });
        for (const g of features.fur) {
            const part = Detail.furCards(g.roots, { name: 'Feature fur', seed: 31 });
            part.source = new Int32Array(part.positions.length / 3).fill(g.anchor);
            features.parts.push(part);
            textures['bodyhair.png'] = cache.bodyHairTex || (cache.bodyHairTex = Detail.bodyHairTexture(256));
        }
        if (features.parts.some(p => p.texture === 'scales.png')) textures['scales.png'] = cache.scales || (cache.scales = Species.scaleTexture());
        // What each part is, for the view's materials: skin, eyes, cloth, metal, hair, a prop.
        body.kind = 'skin'; eyes.kind = 'eye';
        for (const p of outfit.parts) p.kind = p.metalness > 0.5 ? 'metal' : 'cloth';
        for (const p of hair) p.kind = 'hair';
        for (const p of props.parts) p.kind = p.kind==='cloth'?'cloth':p.opacity != null && p.opacity < 1 ? 'glass' : p.metalness > 0.5 ? 'metal' : 'prop';
        for (const p of features.parts) p.kind = p.kind || 'feature';
        if (features.parts.some(p => p.texture === 'feather.png')) textures['feather.png'] = cache.feather || (cache.feather = Species.featherTexture());
        if (features.parts.some(p => p.texture === 'fairywing.png')) textures['fairywing.png'] = cache.fairyWing || (cache.fairyWing = Species.fairyWingTexture());
        if (graftKind) {
            let g = graftHead(pack, built, L, r, body, eyes, cache, budget, skinNormals, o.quality === 'preview' && o.skinSize && o.skinSize <= 512 ? 'preview' : 'save');
            if(r.head.heads===2)g=pairedHeads(g,built,L,features,r);
            for (const [k, t] of Object.entries(g.textures)) textures[k] = t;
            // Closed helmets already hide a human face. Their animal-head
            // replacements must follow the same rule: muzzles, eyes and fur
            // otherwise protrude through the visor and solid shell.
            const enclosed = covers.some(id => FACE_COVERS.has(id));
            features.parts.push(...g.parts.filter(p => !enclosed || p.name === 'Head neck'));
        }
        // Merfolk hook: the tail, its fins and the loose scales above the scale line, on a chain of bones of its own.
        if (mer) {
            const tail = Merfolk.build(pack, built, r, L, { skinNormals, outfitHidden: outfit.hidden, boneBase: built.bones.length + features.bones.length });
            features.parts.push(...tail.parts);
            features.bones.push(...tail.bones);
            Object.assign(textures, tail.textures);
        }
        // Expressions hook: the teeth and the tongue behind the lips, the mouth's inside darkened in the body's colors;
        // under a covering that hides the lips (a full-face helmet) none of the mouth is left.
        if (Expressions && !graftKind) {
            if (Expressions.mouthCovered(pack, outfit.hidden)) Expressions.hideMouth(pack, built, body, outfit.hidden);
            else { Expressions.tintMouth(pack, built, body); parts.push(...Expressions.mouthParts(pack, built, r)); }
        }
        Object.assign(textures,props.textures);
        parts.push(...outfit.parts, ...hair, ...props.parts, ...features.parts);
        const bones = built.bones.concat(features.bones.map(b => ({ ...b })));
        // Merfolk hook: the leg bones carry no skin; what they held, the hips hold.
        if (mer) parts.splice(0, parts.length, ...Merfolk.liftLegs(parts, bones));
        // The floor: shoes and boots stand on it.
        let floor = 0;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) floor = Math.min(floor, p.positions[i]);
        if (floor < -1e-4) {
            for (let k = 0; k < parts.length; k++) {
                const q = parts[k] = Object.assign({}, parts[k], { positions: Float32Array.from(parts[k].positions) });
                for (let i = 1; i < q.positions.length; i += 3) q.positions[i] -= floor;
                if(q.sewnRoots){q.sewnRoots=Float32Array.from(q.sewnRoots);for(let i=1;i<q.sewnRoots.length;i+=3)q.sewnRoots[i]-=floor;}
            }
            for (const b of bones) { b.head = [b.head[0], b.head[1] - floor, b.head[2]]; if (b.tail) b.tail = [b.tail[0], b.tail[1] - floor, b.tail[2]]; }
        }
        // Loose cloth (a cape, a skirt, a robe, a coat's tails) on cloth bones of its own, the cape settled where it hangs.
        const hung = Cloth ? { plan: 'human', parts, bones } : null;
        if (hung && Cloth.rig(hung)) parts.splice(0, parts.length, ...hung.parts);
        let height = 0;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) height = Math.max(height, p.positions[i]);
        // Occlusion in the vertex colors: always in a file, in the view once the sliders rest (`shade`).
        if (o.quality === 'save' || o.shade) shade(parts);
        const result = { recipe: r, parts, bones, height, bodyHeight: built.height - Math.min(0, floor), textures, clips: o.static ? [] : clipsFor(bones, r, built, pack), plan: 'human', built, cloth: hung ? hung.cloth : null };
        // Expressions hook: a saved file carries the expressions and visemes as named morph targets.
        if (Expressions && (o.quality === 'save' || o.quality == null || o.morphs)) result.morphs = Expressions.morphTargets(pack, result);
        return result;
    }

    /**
     * Fur shells: the body's triangles where fur grows (alpha in the picture
     * at any of their corners), lifted along the skin's normals.
     */
    function furShells(pack, built, body, bodyHair, picture) {
        const P = body.positions, N = body.normals, U = body.uvs, I = body.index;
        const size = picture.width;
        const alphaAt = i => picture.data[((Math.min(size - 1, Math.floor(U[i * 2 + 1] * size)) * size) + Math.min(size - 1, Math.floor(U[i * 2] * size))) * 4 + 3];
        // Not on the head: the face's fur is partial by nature (clear round the eyes, nose and mouth), and
        // shells there break into patches; it stays painted.
        const an = (root.RRCharacterOutfit || require('./CharacterOutfit.js')).anatomy(pack), src = pack.body.source;
        const onHead = i => an.member[src[i] * 5] > 0.6 && an.s[src[i] * 5] > 4.3;
        const keep = [];
        for (let t = 0; t < I.length; t += 3) {
            if (onHead(I[t]) || onHead(I[t + 1]) || onHead(I[t + 2])) continue;
            if (alphaAt(I[t]) > 20 || alphaAt(I[t + 1]) > 20 || alphaAt(I[t + 2]) > 20) keep.push(I[t], I[t + 1], I[t + 2]);
        }
        if (!keep.length) return [];
        const reach = 0.004 + 0.008 * bodyHair.fur * bodyHair.length;
        return [[0.45, 0.3], [1, 0.62]].map(([at, cut], k) => {
            const positions = new Float32Array(P.length);
            for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) positions[i + c] = P[i + c] + N[i + c] * reach * at;
            return { name: 'Fur ' + (k + 1), positions, normals: N, uvs: U, index: Uint32Array.from(keep), joints: body.joints, weights: body.weights, texture: 'fur.png', cutout: true, alphaCutoff: cut, roughness: 0.8, kind: 'hair', doubleSided: true };
        });
    }

    /** Features set on the human head left out under an animal's, which brings its own; a back ridge stays. */
    function headless(features) {
        const f = JSON.parse(JSON.stringify(features));
        for (const k of ['ears', 'whiskers', 'beak', 'tusks', 'horns', 'alienEyes', 'antennae', 'fangs']) if (f[k]) f[k].type = 'none';
        if (f.spines && f.spines.type === 'crest') f.spines.type = 'none';
        if (f.spines && f.spines.type === 'both') f.spines.type = 'ridge';
        return f;
    }

    /**
     * An animal's head on the body in place of the human one: the head of
     * the four-legged creature of that kind (its skin weighed to its Head
     * bone, its eyes, horns and fur), in the species' own colors, turned to
     * look ahead, scaled to the human skull's width and set on the top of the
     * neck where the human head sat; the human head's skin, eyes, brows and
     * lashes left out. Its rim is drawn onto the neck's skin so the two meet
     * without a seam, and a furred head hides the join under a collar of fur.
     */
    function graftHead(pack, built, L, r, body, eyes, cache, budget, skinNormals, quality) {
        const h = r.head, base = Creature.kindRecipe(h.kind), furred = r.bodyHair.fur > 0.05;
        const coat = furred ? r.bodyHair.color || r.skin : r.skin;
        const colors = Object.assign({}, base.colors, { coat, mane: coat, eye: r.eyes.color }, r.skinPattern.color ? { marking: r.skinPattern.color } : {},
            r.skinPattern.belly ? { light: r.skinPattern.belly } : {}, r.skinPattern.nose ? { nose: r.skinPattern.nose } : {}, h.colors || {});
        const rec = Object.assign({ plan: 'quadruped' }, base, h, { colors });
        const key = JSON.stringify([rec, quality, budget]);
        // The last few heads kept: switching back and forth builds none again.
        cache.graft = cache.graft instanceof Map ? cache.graft : new Map();
        let cr = cache.graft.get(key);
        if (!cr) {
            cr = Creature.build(rec, { quality, hairBudget: budget, headOnly: true });
            cache.graft.set(key, cr);
            if (cache.graft.size > 6) cache.graft.delete(cache.graft.keys().next().value);
        }
        const hb = cr.bones.findIndex(b => b.name === 'Head'), nb = cr.bones.findIndex(b => b.name === 'Neck');
        const headW = (p, v) => { let w = 0; for (let k = 0; k < 4; k++) { const j = p.joints[v * 4 + k]; if (j === hb) w += p.weights[v * 4 + k]; else if (j === nb) w += 0.3 * p.weights[v * 4 + k]; } return w; };
        const eyePart = cr.parts.find(p => p.name === 'Eyes'), bodyPart = cr.parts.find(p => p.name === 'Body');
        const sideMean = sd => { const c = [0, 0, 0]; let n = 0; for (let i = 0; i < eyePart.positions.length; i += 3) if (Math.sign(eyePart.positions[i]) === sd) { c[0] += eyePart.positions[i]; c[1] += eyePart.positions[i + 1]; c[2] += eyePart.positions[i + 2]; n++; } return c.map(x => x / (n || 1)); };
        const eL = sideMean(1), eR = sideMean(-1), Ec = Props.vec.lerp(eL, eR, 0.5), spread = Math.abs(eL[0] - eR[0]);
        const A = cr.bones[hb].head, T = cr.bones[hb].tail;
        // Turned about the across axis so the muzzle points ahead and a little down.
        const ang = Math.atan2(-0.12, 1) - Math.atan2(T[1] - A[1], T[2] - A[2]), ca = Math.cos(ang), sa = Math.sin(ang);
        const turn = d => [d[0], d[1] * ca + d[2] * sa, -d[1] * sa + d[2] * ca];
        // The creature's skull across at its eyes, behind them (not the ears or the muzzle).
        let cw = 0;
        for (let v = 0; v < bodyPart.positions.length / 3; v++) {
            if (headW(bodyPart, v) < 0.9) continue;
            const d = turn([bodyPart.positions[v * 3] - Ec[0], bodyPart.positions[v * 3 + 1] - Ec[1], bodyPart.positions[v * 3 + 2] - Ec[2]]);
            if (Math.abs(d[1]) < spread * 0.35 && d[2] < -spread * 0.15) cw = Math.max(cw, Math.abs(d[0]));
        }
        const ring = L.ring(L.eyeY, 0.015), headBone = built.bones.find(b => b.name === 'Head');
        // A little broader than the human skull, as an animal's head sits on a person's neck.
        const s = ring && cw ? (ring.rx / cw) * 1.3 : 1;
        // Its skull's base on the top of the neck, a little toward the human eyes.
        const At = turn(A), Et = turn(Ec), Eh = Props.vec.lerp(L.eyeL.center, L.eyeR.center, 0.5);
        const anchor = Props.vec.lerp(headBone.head, Eh, 0.3), from = Props.vec.lerp(At, Et, 0.3);
        // The skull stays rigid; the cut neck is fitted to the human neck below, without folding skull faces through it.
        const placeNormal = (p, n) => turn(n);
        const place = p => { const d = turn(p); return [anchor[0] + (d[0] - from[0]) * s, anchor[1] + (d[1] - from[1]) * s, anchor[2] + (d[2] - from[2]) * s]; };
        const Ah = anchor;
        const head = L.boneIndex('Head'), neck = L.boneIndex('Neck');
        // The human head left out: its skin above the neck, its eyes.
        const src = pack.body.source, I = body.index, SW = pack.skinWeights, SJ = pack.skinJoints, P = built.shaped, keepTri = [];
        const hw = v => { let w = 0; for (let k = 0; k < 4; k++) if (SJ[v * 4 + k] === head) w += SW[v * 4 + k]; return w; };
        // Where the animal head is cut from its own neck: level under the jaw, sloping up behind it.
        const cutY = L.chin - 0.005, eyeAt = place(Ec), cutAt = q => cutY + Math.min(0.03, Math.max(0, eyeAt[2] - q[2] - 0.03) * 0.5);
        // The human head goes above that cut, a little under it, so the human neck runs up inside the animal's and no gap opens.
        const gone = v => cr.headOnly ? hw(v) > 0.08 && P[v * 3 + 1] > cutY - 0.025
            : hw(v) > 0.5 && P[v * 3 + 1] > cutAt([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]) - 0.012;
        for (let t = 0; t < I.length; t += 3) {
            if (cr.headOnly ? gone(src[I[t]]) || gone(src[I[t + 1]]) || gone(src[I[t + 2]]) : gone(src[I[t]]) && gone(src[I[t + 1]]) && gone(src[I[t + 2]])) continue;
            keepTri.push(I[t], I[t + 1], I[t + 2]);
        }
        body.index = Uint32Array.from(keepTri);
        // The neck's top: the skin the head's rim is drawn onto.
        const rim = [];
        // Kept skin next to the hidden head.
        const visible = new Set(Array.from(body.index, v => src[v]));
        for (const v of visible) {
            let neckShare = 0;
            for (let k = 0; k < 4; k++) if (SJ[v * 4 + k] === neck) neckShare += SW[v * 4 + k];
            if ((hw(v) > 0.05 || neckShare > 0.3) && P[v * 3 + 1] > cutY - 0.16 && P[v * 3 + 1] < cutY + 0.04) rim.push(v);
        }
        const parts = [], collar = [], headRoots = [],neckTextures={};
        // The coat over the head, behind the eyes (the face stays short-furred, as painted): tufts like the
        // body's, of the coat's own color where it grows, combed back over the skull and down the neck.
        const fwdDir = Props.vec.norm(Props.vec.sub(place(T), place(A)));
        // The skull's round, not the ears or horns standing off it.
        const skullC = Props.vec.lerp(place(A), eyeAt, 0.5), skullR = cw * s * 1.85;
        const coatRoots = (pos, nrm, idx, ownOf) => {
            const rgbCoat = (root.RRCharacterOutfit || require('./CharacterOutfit.js')).linear(coat);
            // Two coats: the skull's and neck's, combed back; and the ears' (standing off the skull, above the
            // eyes), a short dense velvet combed up toward their tips.
            const groups = [{ tris: [], total: 0, cap: 2600, density: 90000, len: 0.012 + 0.016 * Math.min(1.6, r.bodyHair.length || 1), width: 0.0034, ear: false },
                { tris: [], total: 0, cap: 2200, density: 160000, len: 0.007 + 0.004 * Math.min(1.6, r.bodyHair.length || 1), width: 0.0026, ear: true }];
            for (let t = 0; t < idx.length; t += 3) {
                const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
                const cx = (pos[a] + pos[b] + pos[c]) / 3, cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
                const ahead = (cx - eyeAt[0]) * fwdDir[0] + (cy - eyeAt[1]) * fwdDir[1] + (cz - eyeAt[2]) * fwdDir[2];
                const far = Math.hypot(cx - skullC[0], cy - skullC[1], cz - skullC[2]) > skullR;
                // Off the skull above the eyes: the ears; below them, behind the jaw: the neck, coated as the skull.
                const g = far ? (cy > eyeAt[1] ? groups[1] : ahead < -0.03 ? groups[0] : null) : ahead > -0.012 ? null : groups[0];
                if (!g) continue;
                const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], w = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
                g.total += 0.5 * Props.vec.len(Props.vec.cross(u, w));
                g.tris.push([t, g.total]);
            }
            let q = 77;
            const rand = () => { q ^= q << 13; q >>>= 0; q ^= q >> 17; q ^= q << 5; q >>>= 0; return q / 4294967296; };
            for (const g of groups) {
                if (!g.tris.length) continue;
                const count = Math.min(Math.round(g.cap * budget), Math.round(g.total * g.density * budget));
                for (let k = 0; k < count; k++) {
                    const x = rand() * g.total;
                    let lo = 0, hi = g.tris.length - 1;
                    while (lo < hi) { const mid = (lo + hi) >> 1; if (g.tris[mid][1] < x) lo = mid + 1; else hi = mid; }
                    const t = g.tris[lo][0];
                    let s1 = rand(), s2 = rand();
                    if (s1 + s2 > 1) { s1 = 1 - s1; s2 = 1 - s2; }
                    const ws = [1 - s1 - s2, s1, s2], vs = [idx[t], idx[t + 1], idx[t + 2]];
                    const pt = [0, 1, 2].map(i => vs.reduce((a, v, j) => a + pos[v * 3 + i] * ws[j], 0));
                    const nn = Props.vec.norm([0, 1, 2].map(i => vs.reduce((a, v, j) => a + nrm[v * 3 + i] * ws[j], 0)));
                    const c = rgbCoat.map(x => x * (0.88 + 0.2 * rand()));
                    const toNeck = Math.max(0, Math.min(1, (0.75 - ownOf[vs[0]]) / 0.3));
                    const flow = g.ear ? Props.vec.norm(Props.vec.sub(pt, skullC)) : Props.vec.add(Props.vec.mul(fwdDir, -1), [0, -0.5, 0]);
                    headRoots.push({ p: pt, n: nn, flow, len: g.len * (h.kind === 'cat' ? 0.25 : 1) * (0.7 + 0.6 * rand()), width: g.width * (h.kind === 'cat' ? 0.5 : 1), color: c.map(x => x * 0.95), tip: c,
                        lift: g.ear ? 0.2 : 0.3, droop: g.ear ? 0 : 0.1, joints: [head, neck, 0, 0], weights: [1 - toNeck * 0.6, toNeck * 0.6, 0, 0] });
                }
            }
        };
        // The neck's girth by height and bearing round it, from the person's neck skin that stays: where the
        // animal's neck is drawn to. Above the highest kept skin the top ring holds.
        const BINS = 32, LEVEL = 0.01, levels = new Map();
        for (const v of rim) {
            const lv = Math.round(P[v * 3 + 1] / LEVEL);
            if (!levels.has(lv)) levels.set(lv, { c: [0, 0], n: 0, ids: [] });
            const L2 = levels.get(lv); L2.c[0] += P[v * 3]; L2.c[1] += P[v * 3 + 2]; L2.n++; L2.ids.push(v);
        }
        for (const L2 of levels.values()) {
            L2.c = [L2.c[0] / L2.n, L2.c[1] / L2.n]; L2.r = new Float32Array(BINS);
            for (const v of L2.ids) {
                const a = Math.atan2(P[v * 3] - L2.c[0], P[v * 3 + 2] - L2.c[1]), b = ((Math.round((a / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS;
                L2.r[b] = Math.max(L2.r[b], Math.hypot(P[v * 3] - L2.c[0], P[v * 3 + 2] - L2.c[1]));
            }
            for (let pass = 0; pass < 4; pass++) for (let b = 0; b < BINS; b++) if (!L2.r[b]) L2.r[b] = Math.max(L2.r[(b + 1) % BINS], L2.r[(b + BINS - 1) % BINS]);
        }
        const keys = [...levels.keys()].filter(k => levels.get(k).n >= 12).sort((a, b) => a - b);
        const levelAt = y => { const k = Math.round(y / LEVEL); let best = keys[0]; for (const q of keys) if (Math.abs(q - k) < Math.abs(best - k)) best = q; return levels.get(best); };
        const neckTopY = keys.length ? keys[keys.length - 1] * LEVEL : 0;
        const neckAxis = y => { const L2 = levelAt(y); return [L2.c[0], y, L2.c[1]]; };
        const neckGirth = (y, a) => { const L2 = levelAt(y); return L2.r[((Math.round((a / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS]; };
        for (const p of cr.parts) {
            // Of the creature's strand fur (a mane, a crest) only whole locks on the head come along: cut at the
            // neck they would end in stubs.
            const locks = p.name === 'Fur' || p.name === 'Coat fur';
            const n = p.positions.length / 3, own = new Float32Array(n);
            // How much each vertex is the head's, smoothed over the skin so the cut behind the skull runs clean;
            // nothing below the chin.
            for (let v = 0; v < n; v++) own[v] = headW(p, v);
            // The neck comes along (bent down into the person's), cut where it meets theirs; the chest stays behind.
            const keepW = v => { let w = 0; for (let k = 0; k < 4; k++) { const j = p.joints[v * 4 + k]; if (j === hb || j === nb) w += p.weights[v * 4 + k]; } return w; };
            if (p === bodyPart) {
                const nb2 = Array.from({ length: n }, () => []);
                for (let t = 0; t < p.index.length; t += 3) for (const [a, b] of [[p.index[t], p.index[t + 1]], [p.index[t + 1], p.index[t + 2]], [p.index[t + 2], p.index[t]]]) { nb2[a].push(b); nb2[b].push(a); }
                for (let pass = 0; pass < 6; pass++) {
                    const next = Float32Array.from(own);
                    for (let v = 0; v < n; v++) if (nb2[v].length) { let t = 0; for (const u of nb2[v]) t += own[u]; next[v] = 0.5 * own[v] + 0.5 * t / nb2[v].length; }
                    own.set(next);
                }
            }
            // The cut slopes up behind the jaw, so the back of the head ends under the skull, on the neck.
            // The whole skull is the head's, however the creature's rig weighs the back of it to its neck.
            for (let v = 0; v < n; v++) {
                const q = place([p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]]);
                if (Math.hypot(q[0] - skullC[0], q[1] - skullC[1], q[2] - skullC[2]) < skullR * 0.75) own[v] = Math.max(own[v], 0.9);
                // The continuous skin above the neck cut stays whole; source skinning weights only blend its motion.
                if (p === bodyPart) own[v] = 1;
                else if (!locks && keepW(v) > 0.5) own[v] = Math.max(own[v], 0.5);
                if (p !== bodyPart && q[1] < cutAt(q) + (locks ? 0.03 : 0)) own[v] = 0;
            }
            // A lock (eight vertices, root first) stays whole or goes whole, by its root.
            if (locks) for (let v = 0; v < n; v += 8) { const keep = own[v] >= 0.7 && own.subarray(v, v + 8).every(x => x > 0); own.fill(keep ? 1 : 0, v, v + 8); }
            const map = new Int32Array(n).fill(-1), pos = [], nrm = [], col = [], uv = [], idx = [], jn = [], wt = [], ownOf = [];
            for (let t = 0; t < p.index.length; t += 3) {
                const a = p.index[t], b = p.index[t + 1], c = p.index[t + 2];
                if (own[a] < 0.45 || own[b] < 0.45 || own[c] < 0.45) continue;
                for (const v of [a, b, c]) {
                    if (map[v] < 0) {
                        map[v] = pos.length / 3;
                        pos.push(...place([p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]]));
                        nrm.push(...placeNormal([p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]], [p.normals[v * 3], p.normals[v * 3 + 1], p.normals[v * 3 + 2]]));
                        if (p.colors) col.push(p.colors[v * 3], p.colors[v * 3 + 1], p.colors[v * 3 + 2]);
                        if (p.uvs) uv.push(p.uvs[v * 2], p.uvs[v * 2 + 1]);
                        ownOf.push(p === bodyPart ? (cr.headOnly ? 1 : headW(p, v)) : own[v]);
                    }
                    idx.push(map[v]);
                }
            }
            if (!idx.length) continue;
            const m = pos.length / 3;
            if (p === bodyPart && keys.length && !cr.headOnly) {
                // The cut edge (edges of one face only) drawn onto the nearest skin of the neck, the skin near it
                // following less and less, so the head runs on into the neck.
                const edges = new Map();
                for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[idx[t], idx[t + 1]], [idx[t + 1], idx[t + 2]], [idx[t + 2], idx[t]]]) { const k = a < b ? a * m + b : b * m + a; edges.set(k, (edges.get(k) || 0) + 1); }
                const edge = new Set();
                for (const [k, c] of edges) if (c === 1) for (const v of [Math.floor(k / m), k % m]) if (ownOf[v] < 0.95) edge.add(v);
                // The animal's neck flows into the person's: from the skull's base down to the cut, each point is
                // drawn round the neck's axis to the neck's own girth at that height and bearing, more the lower it
                // lies, so the two necks meet at one thickness with no step from any side.
                // The back and sides of the head round down into the neck as a person's do: behind the eyes, from
                // the cut up to the skull's middle, each point is drawn round the neck's axis toward the neck's own
                // girth there, fully at the cut and less and less up to the skull's middle; the face, the jaw
                // and the muzzle in front keep their shape.
                const BAND = Math.max(0.05, skullC[1] - cutY);
                for (let v = 0; v < m; v++) {
                    const q = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], low = cutAt(q);
                    const t = 1 - (q[1] - low) / BAND;
                    if (t <= 0) continue;
                    const behind = Math.min(1, Math.max(0, (eyeAt[2] - q[2] - 0.01) / 0.05));
                    const tt = Math.min(1, t), k = tt * tt * (3 - 2 * tt) * Math.max(behind, tt > 0.85 ? 1 : 0);
                    if (!k) continue;
                    const c = neckAxis(Math.min(q[1], neckTopY)), dx = q[0] - c[0], dz = q[2] - c[2], rr = Math.hypot(dx, dz) || 1e-6;
                    const want = neckGirth(Math.min(q[1], neckTopY), Math.atan2(dx, dz)) + 0.003;
                    // Only drawn in (never pushed out past where it lies).
                    if (rr <= want) continue;
                    const to = rr + (want - rr) * k;
                    pos[v * 3] = c[0] + dx / rr * to; pos[v * 3 + 2] = c[2] + dz / rr * to;
                }
                for (const v of edge) if (furred && collar.length < 1400) collar.push({ q: [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]] });
                // Normals again over the reshaped neck.
                const fn = new Float32Array(m * 3);
                for (let t = 0; t < idx.length; t += 3) {
                    const i0 = idx[t] * 3, i1 = idx[t + 1] * 3, i2 = idx[t + 2] * 3;
                    const u = [pos[i1] - pos[i0], pos[i1 + 1] - pos[i0 + 1], pos[i1 + 2] - pos[i0 + 2]], w = [pos[i2] - pos[i0], pos[i2 + 1] - pos[i0 + 1], pos[i2 + 2] - pos[i0 + 2]];
                    const n3 = Props.vec.cross(u, w);
                    for (const i of [i0, i1, i2]) { fn[i] += n3[0]; fn[i + 1] += n3[1]; fn[i + 2] += n3[2]; }
                }
                for (let v = 0; v < m; v++) {
                    if (pos[v * 3 + 1] > skullC[1] + 0.02) continue;
                    const l = Math.hypot(fn[v * 3], fn[v * 3 + 1], fn[v * 3 + 2]);
                    if (!l) continue;
                    let n3 = [fn[v * 3] / l, fn[v * 3 + 1] / l, fn[v * 3 + 2] / l];
                    // Face normals follow the winding; keep the creature's outward sense.
                    if (n3[0] * nrm[v * 3] + n3[1] * nrm[v * 3 + 1] + n3[2] * nrm[v * 3 + 2] < 0) n3 = n3.map(x => -x);
                    nrm[v * 3] = n3[0]; nrm[v * 3 + 1] = n3[1]; nrm[v * 3 + 2] = n3[2];
                }
            }
            for (let v = 0; v < m; v++) { const toNeck = Math.max(0, Math.min(1, (0.75 - ownOf[v]) / 0.3)); jn.push(head, neck, 0, 0); wt.push(1 - toNeck * 0.6, toNeck * 0.6, 0, 0); }
            if (p === bodyPart && furred) coatRoots(pos, nrm, idx, ownOf);
            parts.push(Object.assign({}, p, { name: 'Head ' + p.name, positions: Float32Array.from(pos), normals: Float32Array.from(nrm), colors: p.colors ? Float32Array.from(col) : undefined,
                uvs: p.uvs ? Float32Array.from(uv) : undefined, index: Uint32Array.from(idx), joints: Uint8Array.from(jn), weights: Float32Array.from(wt), kind: p.name === 'Eyes' ? 'eye' : p.kind,
                // The head casts no shadow onto the body: a muzzle's would fall as a long dark band down the chest.
                onSkin: true }));
        }
        if (cr.headOnly) {
            // Join the actual open human neck edge to an inset ring inside the closed skull.
            // Reusing each boundary vertex keeps the shoulder/neck surface continuous in motion.
            // Find the boundary introduced by the head cut in the complete
            // skin topology. Clothing also removes faces; its collar/sleeve
            // openings must never be sewn upward into the animal's skull.
            const edges = new Map(), sourceIndex = pack.body.index;
            for (let i = 0; i < sourceIndex.length; i += 3) {
                const ids = [src[sourceIndex[i]], src[sourceIndex[i + 1]], src[sourceIndex[i + 2]]];
                const kept = !ids.some(gone);
                for (let k = 0; k < 3; k++) {
                    const a = ids[k], b = ids[(k + 1) % 3], key = a < b ? a + ':' + b : b + ':' + a;
                    let edge = edges.get(key);
                    if (!edge) { edge = { count:0, kept:0, a, b }; edges.set(key,edge); }
                    edge.count++;
                    if (kept) { edge.kept++; edge.a=a; edge.b=b; }
                }
            }
            const links = new Map();
            for (const edge of edges.values()) if (edge.count === 2 && edge.kept === 1) {
                if (!links.has(edge.a)) links.set(edge.a,[]);
                if (!links.has(edge.b)) links.set(edge.b,[]);
                links.get(edge.a).push(edge.b); links.get(edge.b).push(edge.a);
            }
            // Walk actual adjacent edges, preserving a closed neck loop even
            // when a face shape makes the opening non-circular.
            const seen = new Set(), loops=[];
            for (const first of links.keys()) if (!seen.has(first)) {
                const loop=[]; let current=first,previous=-1;
                while (!seen.has(current)) {
                    seen.add(current);loop.push(current);
                    const next=(links.get(current)||[]).find(v=>v!==previous);
                    if (next == null) break;
                    previous=current; current=next;
                }
                if (current === first && loop.length > 2) loops.push(loop);
            }
            const base = loops.sort((a,b)=>b.length-a.length)[0] || [], center=[0,0,0], inside=[0,0,0];
            let area=0;
            for(let i=0;i<base.length;i++){const a=base[i],b=base[(i+1)%base.length];area+=P[a*3]*P[b*3+2]-P[b*3]*P[a*3+2];}
            if(area>0)base.reverse();
            for (const v of base) for (let k=0;k<3;k++) center[k]+=P[v*3+k]/base.length;
            for (let v = 0; v < bodyPart.positions.length; v += 3) {
                const q = place(Array.from(bodyPart.positions.subarray(v, v + 3)));
                for (let k = 0; k < 3; k++) inside[k] += q[k] / (bodyPart.positions.length / 3);
            }
            const scaledNeck=h.kind==='drake';
            if(scaledNeck&&cr.skullAnchor)inside.splice(0,3,...place(cr.skullAnchor));
            if (base.length > 2) {
                const cols = base.length, rows = 12, pos = [], normal = [], uv = [], joints = [], weights = [], index = [];
                for (let row = 0; row <= rows; row++) {
                    const t = row / rows, eased = t * t * (3 - 2 * t);
                    for (let col = 0; col <= cols; col++) {
                        const v = base[col % cols], angle = Math.atan2(P[v * 3] - center[0], P[v * 3 + 2] - center[2]);
                        const endRadius=scaledNeck?cr.skullRadius*s*.40:.012;
                        const end = [inside[0] + Math.sin(angle) * endRadius, inside[1], inside[2] + Math.cos(angle) * endRadius];
                        for (let k = 0; k < 3; k++) {
                            const blend = k === 1 ? t : eased;
                            pos.push(P[v * 3 + k] * (1 - blend) + end[k] * blend);
                        }
                        normal.push(Math.sin(angle), 0, Math.cos(angle));
                        const render = src.indexOf(v);
                        uv.push(...(scaledNeck?[col/cols,t]:[render >= 0 ? body.uvs[render * 2] : 0, render >= 0 ? body.uvs[render * 2 + 1] : 0]));
                        const influence = new Map([[head, eased]]);
                        for (let k = 0; k < 4; k++) { const joint = SJ[v * 4 + k]; influence.set(joint, (influence.get(joint) || 0) + SW[v * 4 + k] * (1 - eased)); }
                        const top = [...influence].sort((a, b) => b[1] - a[1]).slice(0, 4), total = top.reduce((sum, [, w]) => sum + w, 0) || 1;
                        for (let k = 0; k < 4; k++) { joints.push(top[k]?.[0] || 0); weights.push(top[k] ? top[k][1] / total : 0); }
                    }
                }
                for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
                    const a = row * (cols + 1) + col, b = a + cols + 1;
                    index.push(a, a + 1, b, a + 1, b + 1, b);
                }
                normal.fill(0);
                for (let i = 0; i < index.length; i += 3) {
                    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
                    const u = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], w = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
                    const n = Props.vec.cross(u, w);
                    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) normal[v + k] += n[k];
                }
                for (let row = 0; row <= rows; row++) {
                    const a = row * (cols + 1) * 3, b = a + cols * 3;
                    for (let k = 0; k < 3; k++) normal[a + k] = normal[b + k] = normal[a + k] + normal[b + k];
                }
                for (let v = 0; v < pos.length / 3; v++) {
                    const row = Math.floor(v / (cols + 1)), source = src.indexOf(base[v % (cols + 1) % cols]);
                    const blend = Math.min(1, row / 2), n = Props.vec.norm(normal.slice(v * 3, v * 3 + 3));
                    const joined = Props.vec.norm(n.map((x, k) => x * blend + body.normals[source * 3 + k] * (1 - blend)));
                    for (let k = 0; k < 3; k++) normal[v * 3 + k] = joined[k];
                }
                parts.push({ name: 'Head neck', positions: Float32Array.from(pos), normals: Float32Array.from(normal), uvs: Float32Array.from(uv), index: Uint32Array.from(index),
                    joints: Uint8Array.from(joints), weights: Float32Array.from(weights), texture: body.texture, roughness: body.roughness, metalness: 0, onSkin: true });
                if(scaledNeck){
                    const part=parts.at(-1),pictures=Species.neckSurface(),main=(root.RRCharacterOutfit||require('./CharacterOutfit.js')).linear(r.skin),light=(root.RRCharacterOutfit||require('./CharacterOutfit.js')).linear(r.skinPattern.belly||r.skin);
                    Object.assign(part,{texture:'neck-scales.png',normalTexture:'neck-scales-normal.png',normalScale:.35,keepColors:true,colors:new Float32Array(pos.length),roughness:.65});
                    for(let i=0;i<pos.length/3;i++){const angle=2*Math.PI*uv[i*2],belly=Math.max(0,Math.cos(angle))**6*.6;part.colors.set(main.map((v,k)=>v+(light[k]-v)*belly),i*3);}
                    Object.assign(neckTextures,pictures);
                }
            }
        }
        // A furred head's join hidden under a collar of fur, combed down the neck.
        let fur = null;
        if (collar.length || headRoots.length) {
            const rgb = (root.RRCharacterOutfit || require('./CharacterOutfit.js')).linear(coat), roots = headRoots;
            for (let k = 0; k < collar.length; k++) {
                const c = collar[k].q, out = Props.vec.norm([c[0], 0, c[2] - Ah[2]]);
                for (let j = 0; j < 2; j++) roots.push({ p: Props.vec.add(c, [0, 0.006 * j, 0]), n: out, flow: [out[0] * 0.3, -1, out[2] * 0.3], len: 0.016 + 0.01 * ((k * 7 + j * 3) % 5) / 5, width: 0.0045, color: rgb.map(x => x * 0.92), tip: rgb, lift: 0.2, droop: 0.1, joints: [neck, head, 0, 0], weights: [0.7, 0.3, 0, 0] });
            }
            fur = Detail.furCards(roots, { name: 'Head fur', seed: 17 });
            parts.push(fur);
        }
        return { parts, textures: Object.assign({}, cr.textures || {},neckTextures, fur ? { 'bodyhair.png': cache.bodyHairTex || (cache.bodyHairTex = Detail.bodyHairTexture(256)) } : {}) };
    }

    /** Two complete dragon skulls, each with its own articulated neck and head.
     * Both neck bases reuse the existing sewn body's edge and its exact bindings.
     * They fork above that shared collar; they never copy a human face between them.
     */
    function pairedHeads(g,built,L,features,r){
        const V=Props.vec,hub=L.boneIndex('Head'),neck=L.boneIndex('Neck'),pivot=built.bones[hub].head;
        const scale=.86,spacing=Math.max(.12,(L.ring(L.eyeY)?.rx||.075)*1.65),parts=[];
        for(const s of [-1,1]){
            const label=s>0?'Left':'Right',yaw=s*.48,cs=Math.cos(yaw),sn=Math.sin(yaw);
            const rotate=v=>[v[0]*cs+v[2]*sn,v[1],-v[0]*sn+v[2]*cs];
            const place=p=>V.add(V.add(pivot,[s*spacing,.055,-.025]),V.mul(rotate(V.sub(p,pivot)),scale));
            const ni=built.bones.length+features.bones.length,hi=ni+1,top=place(pivot),base=V.add(pivot,[s*.026,-.11,-.015]);
            features.bones.push({name:'Hydrata'+label+'Neck',parent:neck,head:base,tail:top},
                {name:'Hydrata'+label+'Head',parent:ni,head:top,tail:place(built.bones[hub].tail),motionSource:'Head'});
            for(const p of g.parts){
                const fork=p.name==='Head neck',positions=new Float32Array(p.positions.length),normals=new Float32Array(p.normals.length),joints=new Uint8Array(p.joints.length),weights=new Float32Array(p.weights.length);
                const rows=12,cols=fork?p.positions.length/3/(rows+1):0;
                const start=[0,0,0],end=[0,0,0],uvs=fork?new Float32Array(p.positions.length/3*2):p.uvs,colors=fork?new Float32Array(p.positions.length):p.colors;
                if(fork)for(let col=0;col<cols-1;col++)for(let k=0;k<3;k++){start[k]+=p.positions[col*3+k]/(cols-1);end[k]+=p.positions[(rows*cols+col)*3+k]/(cols-1);}
                const goal=fork?place(end):null,main=fork?(root.RRCharacterOutfit||require('./CharacterOutfit.js')).linear(r.skin):null,light=fork?(root.RRCharacterOutfit||require('./CharacterOutfit.js')).linear(r.skinPattern.belly||r.skin):null;
                for(let i=0;i<p.positions.length/3;i++){
                    const original=Array.from(p.positions.subarray(i*3,i*3+3)),turned=place(original),u=fork?Math.floor(i/cols)/rows:1,w=u*u*(3-2*u);
                    positions.set(V.lerp(original,turned,w),i*3);
                    normals.set(V.norm(V.lerp(Array.from(p.normals.subarray(i*3,i*3+3)),rotate(Array.from(p.normals.subarray(i*3,i*3+3))),w)),i*3);
                    if(fork){
                        const column=i%cols,bp=Array.from(p.positions.subarray(column*3,column*3+3)),angle=Math.atan2(bp[0]-start[0],bp[2]-start[2]);
                        const ep=Array.from(p.positions.subarray((rows*cols+column)*3,(rows*cols+column)*3+3)),endRadius=Math.hypot(ep[0]-end[0],ep[2]-end[2])*scale;
                        const center=V.lerp(start,goal,w),radius=Math.hypot(bp[0]-start[0],bp[2]-start[2])*(1-u)+endRadius*u+.004*Math.sin(u*Math.PI);
                        positions.set([center[0]+Math.sin(angle)*radius,center[1]+(bp[1]-start[1])*(1-u),center[2]+Math.cos(angle)*radius],i*3);
                        uvs.set([column/(cols-1),u],i*2);
                        const belly=Math.max(0,Math.cos(angle))**5*.8;
                        colors.set(main.map((v,k)=>v+(light[k]-v)*belly),i*3);
                        const rise=Math.min(1,u/.40),tip=Math.max(0,(u-.6)/.4),influences=new Map([[ni,rise*(1-tip)],[hi,rise*tip]]);
                        for(let k=0;k<4;k++){const bone=p.joints[column*4+k];influences.set(bone,(influences.get(bone)||0)+p.weights[column*4+k]*(1-rise));}
                        const top=[...influences].filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=top.reduce((n,[,v])=>n+v,0);
                        for(let k=0;k<4;k++){joints[i*4+k]=top[k]?.[0]||0;weights[i*4+k]=(top[k]?.[1]||0)/sum;}
                    }else{joints[i*4]=hi;weights[i*4]=1;}
                }
                if(fork){const m=new Props.Mesh();m.p=Array.from(positions);m.i=Array.from(p.index);m.computeNormals();normals.set(m.n);}
                parts.push({...p,name:'Head '+label+' '+p.name.replace(/^Head /,''),positions,normals,joints,weights,...(fork?{uvs,colors,texture:'neck-scales.png',normalTexture:'neck-scales-normal.png',normalScale:.35,keepColors:true}: {})});
            }
        }
        return {...g,parts,textures:{...g.textures,...Species.neckSurface()}};
    }

    /** A tiny picture of one color: the skin before its own is painted. */
    function flatPicture(hex) {
        const n = parseInt(String(hex || '#c69c7f').slice(1), 16), data = new Uint8Array(4 * 4 * 4);
        for (let i = 0; i < 16; i++) { data[i * 4] = (n >> 16) & 255; data[i * 4 + 1] = (n >> 8) & 255; data[i * 4 + 2] = n & 255; data[i * 4 + 3] = 255; }
        return { width: 4, height: 4, data, name: 'skin.png' };
    }

    /** Bakes ambient occlusion into the parts' colors, in place. */
    function shade(parts) {
        const ao = Shading.ambientOcclusion(parts);
        // The eyes sit inside the lids: occlusion would black them out, so they keep their own light.
        parts.forEach((p, k) => { if (p.kind === 'eye' || p.name === 'Eyes') delete ao[k]; });
        const shaded = Shading.applyOcclusion(parts, ao);
        for (let k = 0; k < parts.length; k++) parts[k] = shaded[k];
        return parts;
    }

    /**
     * How far off vertical the arms hang at rest: enough that the upper arm,
     * swung down from the shoulder, clears the widest part of the trunk below
     * it (a heavy or very strong body, bulky armor), never less than a relaxed
     * hang.
     */
    function armAngle(r, built, pack) {
        const relaxed = 0.16 + 0.22 * Math.min(1, r.weight) + 0.1 * Math.min(1, r.muscle);
        if (!built || !pack) return relaxed;
        const P = built.shaped, an = (root.RRCharacterOutfit || require('./CharacterOutfit.js')).anatomy(pack);
        const arm = built.bones.find(b => b.name === 'LeftArm'), fore = built.bones.find(b => b.name === 'LeftForeArm');
        const upper = Math.hypot(fore.head[0] - arm.head[0], fore.head[1] - arm.head[1], fore.head[2] - arm.head[2]);
        let trunk = 0;
        for (const v of pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)])) {
            const y = P[v * 3 + 1];
            if (an.member[v * 5] > 0.8 && y < arm.head[1] - 0.05 && y > arm.head[1] - upper * 1.6) trunk = Math.max(trunk, Math.abs(P[v * 3]));
        }
        // The upper arm's own thickness: half the span of its cross-section across the body.
        let mn = Infinity, mx = -Infinity;
        const midY = (arm.head[1] + fore.head[1]) / 2;
        for (const v of pack._bodyIds) if (an.member[v * 5 + 1] > 0.8 && Math.abs(P[v * 3 + 1] - midY) < 0.02 && P[v * 3] > 0) { mn = Math.min(mn, P[v * 3 + 2]); mx = Math.max(mx, P[v * 3 + 2]); }
        const radius = isFinite(mn) ? (mx - mn) / 2 : 0.04;
        const need = (trunk + radius * 1.1 - arm.head[0]) / (upper * 0.85);
        const clear = need > 0 ? Math.asin(Math.min(1, need)) : 0;
        const armor = (r.outfit || []).some(i => i.id === 'powerarmor') ? 0.2 : 0;
        return Math.min(1.25, Math.max(relaxed, clear) + armor);
    }

    /** The humanoid Idle, with a tail swaying when there is one. */
    function clipsFor(bones, r, built, pack) {
        // Merfolk hook: the tail's own clips (Idle first).
        if (Merfolk && r.species === 'merfolk') return Merfolk.clips(bones, r, built, pack, armAngle(r, built, pack));
        const idle = Glb.idleClip(bones, { armAngle: armAngle(r, built, pack) });
        if (!idle) return [];
        const steps = idle.times.length;
        bones.forEach((b, i) => {
            if (!/^Tail\d*$/.test(b.name)) return;
            const k = b.name === 'Tail' ? 1 : +b.name.slice(4);
            const values = new Float32Array(steps * 4);
            for (let s = 0; s < steps; s++) {
                const w = Math.sin((2 * Math.PI * s) / (steps - 1) + k * 0.6);
                values.set(Glb.axisAngle(0, 1, 0, 0.12 * w), s * 4);
            }
            idle.tracks.push({ bone: i, values });
        });
        return [Species.followMotion(bones, Object.assign({ name: 'Idle' }, idle))];
    }

    /**
     * The GLB of a build. `encode(texture)` turns a picture into PNG bytes
     * (the page uses a canvas, node tests use pngjs); `images` holds files
     * already encoded ({name: bytes}).
     */
    async function toGlb(result, name, encode, images) {
        const files = Object.assign({}, images || {});
        for (const [key, tex] of Object.entries(result.textures || {})) if (!files[key]) files[key] = await encode(tex);
        const parts = result.parts.map(p => {
            const out = Object.assign({}, p);
            // A part with a picture shows it; its own colors are left for parts that have none.
            if (out.texture && !files[out.texture]) delete out.texture;
            if (!out.texture && !out.colors && !out.color) out.color = '#bbbbbb';
            // Colors on a part with a picture are its baked shading, multiplied with the picture.
            if (out.texture && !out.shaded && !out.keepColors) delete out.colors;
            return out;
        });
        // Every clip with its cloth worked out (RRCharacterCloth): the game only plays the keys.
        const clips = Cloth && result.cloth && result.clips ? await Cloth.bakeAllAsync(result, result.clips, { quality: 'save' }) : result.clips;
        return Glb.toGlb({ parts, bones: result.bones, morphs: result.morphs }, { name, clips, images: files });
    }

    /** A seeded random character: a body, then a fitting outfit, hair and maybe accessories. */
    function random(seed, options) {
        // Neighboring seeds scrambled apart: xorshift's first draws from a small seed are all near zero.
        const scramble = x => { x = Math.imul((x >>> 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) || 1; };
        let s = scramble(seed);
        const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
        const pick = list => list[Math.floor(rand() * list.length)];
        const o = options || {};
        // Slimefolk hook: a random goo.
        if (slimeSpecies(o.species)) return Slime.randomRecipe(seed);
        const body = Body.randomRecipe(scramble(seed + 1));
        const r = Object.assign({}, body);
        if (o.species && o.species !== 'human') Object.assign(r, withSpecies(r, o.species));
        const tones = Species.skinTones(r.species);
        if (tones.length) r.skin = pick(tones);
        const theme = o.theme || pick(['Everyday', 'Everyday', 'Fantasy', 'Armor', 'Sci-fi']);
        // An outfit of the setting in its colors, with an accessory that belongs to it.
        const dressed = Wardrobe.dressRandom(rand, theme, Body.sexOf(body) === 'female');
        r.outfit = dressed.outfit;
        const gender = r.gender > 0.5 ? 'male' : 'female';
        const bald = o.species && (Species.BY_ID.get(o.species)?.recipe || {}).bald;
        r.hair = bald ? { style: 'bald', brows: { style: 'none' }, lashes: false } : Hair.randomHair(scramble(seed + 2), { gender, people: body.ancestry.people, age: body.age });
        // Under a hat, hair that lies close.
        if (dressed.hat && !bald) r.hair = Wardrobe.hairUnderHat(r.hair, rand, gender === 'male');
        if (o.species === 'andorian') {
            r.hair.color = '#f3f2ec'; r.hair.tipColor = ''; r.hair.highlights = 0;
            r.hair.brows = { ...r.hair.brows, color: '#e5e7e5' };
            r.hair.facial = { ...r.hair.facial, color: '#f3f2ec' };
        }
        r.props = dressed.props;
        const skinTones = ['#f1d3bd', '#e5b897', '#c69c7f', '#a8795a', '#8a5a3c', '#5e3b26', '#3f2618'];
        if (!o.species || o.species === 'human') r.skin = body.skin || pick(skinTones);
        // Eye colors as they occur in the character's people.
        r.eyes = Object.assign({}, r.eyes, { color: Body.irisFor(r.ancestry && r.ancestry.people, rand()) });
        r.seed = seed >>> 0;
        return normalize(r);
    }

    /** Small framing metadata for static previews; skin arrays stay in the worker. */
    function previewBounds(result) {
        const bones = result.bones || [], head = bones.findIndex(b => b.name === 'Head');
        if (head < 0) return {};
        const feet = new Set(), hands = new Set();
        bones.forEach((b, i) => {
            if (/^(Left|Right)(Leg|Foot|ToeBase)$/.test(b.name)) feet.add(i);
            if (/^LeftHand/.test(b.name)) hands.add(i);
        });
        const bounds = Object.fromEntries(['head', 'feet', 'hands'].map(k => [k, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }]));
        for (const part of result.parts) {
            const accessory = ['Felt and cloth', 'Leather', 'Accessories', 'Plastic', 'Lenses'].includes(part.name);
            for (let v = 0; v < part.positions.length / 3; v++) {
                let wh = 0, wf = 0, wa = 0;
                for (let k = 0; k < 4; k++) {
                    const j = part.joints[v * 4 + k], w = part.weights[v * 4 + k];
                    if (j === head) wh += w;
                    if (feet.has(j)) wf += w;
                    if (hands.has(j)) wa += w;
                }
                for (const key of ['head', 'feet', 'hands']) {
                    if (!(key === 'head' ? accessory || wh >= 0.75 : key === 'feet' ? wf >= 0.75 : wa >= 0.75)) continue;
                    const b = bounds[key];
                    for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], part.positions[v * 3 + k]); b.max[k] = Math.max(b.max[k], part.positions[v * 3 + k]); }
                }
            }
        }
        return Object.fromEntries(Object.entries(bounds).filter(([, b]) => Number.isFinite(b.min[0])));
    }

    const api = { normalize, withSpecies, build, shade, toGlb, random, armAngle, clipsFor, previewBounds, fitsGarment, fitsProp };
    root.RRCharacterModel = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
