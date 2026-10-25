/** Media attached to a flat model. Videos and Effekseer effects share the
 * model render target/depth; MV sprite animations retain their 2D overlay. */
class ModelPropEffects2D {
    /** The preview's video planes of one file share one video and texture, played while any of them shows. */
    static SHARE_VIDEO = true;

    constructor(preview, entry, effects) {
        this.preview = preview;
        this.entry = entry;
        this.plays = [];
        const project = preview.manager.project();
        const records = window.reactor?.databaseManager?.data?.animations || [];
        for (const effect of effects) {
            if (effect.type === 'light') continue;
            if (effect.type === 'video' && effect.video?.file) {
                const owner = ModelPropEffects2D.SHARE_VIDEO ? preview : MapEditor3D.prototype;
                const plane = MapEditor3D.prototype._videoEffectPlane.call(owner, effect, project, entry.object.userData.glbSize);
                if (!plane) continue;
                plane.userData.__reactorOverlay = true;
                entry.object.add(plane);
                plane.geometry.computeBoundingBox();
                entry.bounds.push({ mesh: plane, box: plane.geometry.boundingBox });
                // media.showing counts the planes showing this video, across every prop of the preview.
                const play = { effect, plane, video: plane.userData.video, media: plane.userData.effectMedia?.entry || {}, dirty: true };
                this.plays.push(play);
            } else if (records[effect.animation] && typeof RRAnimationPreviewLayer !== 'undefined') {
                const parent = preview.app.canvas.parentElement;
                const layer = new RRAnimationPreviewLayer(parent);
                // The map canvas clips at the viewport edges, as do its effects.
                const clip = document.createElement('div');
                clip.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:4;';
                parent.appendChild(clip); clip.appendChild(layer.wrap);
                const play = { effect, layer, clip, record: records[effect.animation], project: project.path };
                if (play.record.effectName) {
                    play.quad = Reactor3D.EffekseerScene.quadFor(layer.fxCanvas);
                    play.quad.texture.flipY = false;
                    play.quad.material.uniforms.flip.value = 1;
                    play.quad.mesh.userData.__reactorOverlay = true;
                    entry.scene.add(play.quad.mesh);
                    clip.style.display = 'none';
                }
                this.plays.push(play);
            }
        }
    }

    suspend() {
        for (const play of this.plays) {
            this.showVideo(play, false);
            if (play.layer?.active) play.layer.stop();
            if (play.clip) play.clip.style.display = 'none';
            if (play.quad) { play.quad.mesh.visible = false; this.entry.dirty = true; }
            play.visible = false;
        }
    }

    update(visible) {
        const entry = this.entry, preview = this.preview;
        const point = this.point || (this.point = new THREE.Vector3());
        let dirty = false;
        for (const play of this.plays) {
            const effect = play.effect;
            if (play.plane) {
                const world = Reactor3D.effectAnchorWorld(entry.object, effect, point);
                play.plane.position.copy(entry.object.worldToLocal(world.clone()));
                const rotate = effect.rotate || [0, 0, 0];
                play.plane.rotation.set(...rotate.map(value => value * Math.PI / 180), 'YXZ');
                const pose = Reactor3D.effectAnchorQuaternion(entry.object, effect, new THREE.Quaternion());
                const root = entry.object.getWorldQuaternion(new THREE.Quaternion());
                play.plane.quaternion.premultiply(root.clone().invert().multiply(pose).multiply(root));
                const video = play.video;
                if (video) {
                    this.showVideo(play, visible);
                    const frame = video.getVideoPlaybackQuality?.().totalVideoFrames ?? Math.floor(video.currentTime * 30);
                    if (visible && video.readyState >= 2 && frame !== play.frame) {
                        play.frame = frame; dirty = true;
                    }
                }
            } else if (play.quad) {
                if (!visible) {
                    if (play.layer.active) play.layer.stop();
                    if (play.quad.mesh.visible) dirty = true;
                    play.quad.mesh.visible = false;
                } else {
                    // Establish world mode before starting playback, so the
                    // layer borrows this renderer instead of drawing on top.
                    this.placeEffect(play);
                    if (!play.visible) play.layer.play(play.record, play.project, {
                        loop: effect.loop !== false, transform: { rotate: effect.rotate, scale: effect.scale }
                    });
                    dirty = dirty || play.layer.active || play.quad.mesh.visible;
                }
                play.clip.style.display = 'none';
            } else if (play.layer) {
                if (!visible) {
                    if (play.layer.active) play.layer.stop();
                    play.clip.style.display = 'none';
                } else {
                    if (!play.visible) play.layer.play(play.record, play.project, {
                        loop: effect.loop !== false, transform: { rotate: effect.rotate, scale: effect.scale }
                    });
                    play.clip.style.display = '';
                    Reactor3D.effectAnchorWorld(entry.object, effect, point).project(entry.camera);
                    const at = preview.manager.container.toGlobal(new PIXI.Point(
                        entry.sprite.x + point.x * entry.radius * entry.tw,
                        entry.sprite.y - point.y * entry.radius * entry.tw));
                    const canvas = preview.app.canvas.getBoundingClientRect();
                    const parent = play.clip.getBoundingClientRect();
                    const scale = canvas.width / preview.app.screen.width;
                    play.layer.setSpan(Reactor3D.modelSpanTiles(entry.object));
                    play.layer.moveTo(at.x * scale + canvas.left - parent.left,
                        at.y * scale + canvas.top - parent.top,
                        entry.tw * 8 * Math.abs(preview.manager.container.worldTransform.a) * scale);
                    play.clip.style.display = '';
                }
            }
            play.visible = visible;
        }
        return dirty;
    }

    /** A video plays from the first of its planes shown and pauses when the last one is hidden. */
    showVideo(play, on) {
        const video = play.video;
        if (!video) return;
        if (on !== !!play.showing) {
            play.showing = on;
            play.media.showing = Math.max(0, (play.media.showing || 0) + (on ? 1 : -1));
            if (on && !video.ended) video.play().catch(() => {});
        }
        if (!play.media.showing && !video.paused) video.pause();
    }

    placeEffect(play) {
        const entry = this.entry, camera = entry.camera;
        const renderer = this.preview.ensureViewport()?.renderer();
        if (!renderer) return;
        camera.updateMatrixWorld(true);
        const world = Reactor3D.effectAnchorWorld(entry.object, play.effect, this.point || (this.point = new THREE.Vector3()));
        const record = play.record, rotate = play.effect.rotate || [0, 0, 0];
        const rotation = record.rotation || { x: 0, y: 0, z: 0 };
        const axes = Reactor3D.scaleAxes(play.effect.scale);
        const unit = Reactor3D.modelSpanTiles(entry.object) / 26 * ((record.scale || 100) / 100);
        const r = Math.PI / 180;
        const pixels = entry.size * entry.size;
        const scale = pixels > MapEditor3D.EFFECT_PIXELS ? Math.sqrt(MapEditor3D.EFFECT_PIXELS / pixels) : 1;
        play.layer.setWorld({ renderer, projection: camera.projectionMatrix.elements,
            view: camera.matrixWorldInverse.elements, position: [world.x, world.y, world.z],
            scale: axes.map(axis => axis * unit),
            rotation: [(rotation.x + rotate[0]) * r,
                (rotation.y + rotate[1]) * r + entry.object.rotation.y, (rotation.z + rotate[2]) * r],
            rect: { x: 0, y: 0, w: entry.size, h: entry.size, scale },
            viewWidth: entry.size, viewHeight: entry.size });
        const uniforms = play.quad.material.uniforms;
        uniforms.resolution.value.set(entry.size, entry.size);
        uniforms.rectMin.value.set(0, 0); uniforms.rectSize.value.set(1, 1);
        Reactor3D.EffekseerScene.standQuad(play.quad.mesh, world, camera);
    }

    /** Resolve effects at the model target's final size, before its draw. */
    paint() {
        for (const play of this.plays) {
            if (!play.quad || !play.visible) continue;
            this.placeEffect(play);
            if (play.layer.fx.gpu) {
                play.quad.mesh.visible = play.layer.drawGpuQuad(play.quad);
                play.gpuTexture = true;
            } else {
                // The fallback canvas is still sampled in the model's depth
                // pass, never placed over the map as a DOM overlay.
                const drawn = play.layer.drawNow();
                const canvas = play.layer.fxCanvas;
                if (play.width !== canvas.width || play.height !== canvas.height) {
                    play.quad.texture.dispose(); play.width = canvas.width; play.height = canvas.height;
                }
                play.quad.texture.needsUpdate = true;
                play.quad.mesh.visible = !!drawn;
            }
        }
    }

    dispose() {
        for (const play of this.plays) {
            play.layer?.dispose(); play.clip?.remove();
            if (play.quad) {
                play.quad.mesh.removeFromParent();
                play.quad.mesh.geometry.dispose(); play.quad.material.dispose();
                if (!play.gpuTexture) play.quad.texture.dispose();
            }
            if (play.plane) {
                play.plane.removeFromParent();
                this.showVideo(play, false);
                play.plane.geometry.dispose(); play.plane.material.dispose();
                // Frees the video and texture with the last plane that holds them.
                MapEditor3D.releaseEffectPlane(play.plane);
            }
        }
        this.plays = [];
    }
}
if (typeof module !== 'undefined' && module.exports) module.exports = ModelPropEffects2D;
