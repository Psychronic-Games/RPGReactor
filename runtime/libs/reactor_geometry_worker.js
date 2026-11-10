// Runtime-only index levels. Original assets and vertex attributes stay intact.
import { MeshoptSimplifier } from './meshopt_simplifier.js';

self.onmessage = async ({ data: job }) => {
    try {
        await MeshoptSimplifier.ready;
        if (!MeshoptSimplifier.supported) throw new Error('Geometry simplifier unavailable');
        const scale = MeshoptSimplifier.getScale(job.positions, 3);
        const levels = [];
        const target = Math.floor(job.indices.length * 0.01 / 3) * 3;
        const simplify = (error, flags) => MeshoptSimplifier.simplifyWithAttributes(
            job.indices, job.positions, 3, job.attributes, job.stride, job.weights, null, target, error, flags);
        // A mesh cut into many texture islands (a scanned or baked prop) stops shrinking long before its
        // error does: every seam vertex is pinned, and a 488k-triangle prop never went below 128k at any
        // distance. Once doubling the error removes less than a fifth of what is left, the levels from
        // there on may collapse across seams (Permissive); the texture coordinates still count in the
        // error, so the result stays inside the same distance on screen. 128k -> 18.5k at the same error.
        let flags = ['LockBorder'], previous = job.indices.length;
        for (const error of [0.00025, 0.0005, 0.001, 0.002, 0.004, 0.008, 0.016]) {
            let [indices, achieved] = simplify(error, flags);
            if (flags.length === 1 && error >= 0.001 && indices.length > previous * 0.8) {
                const loose = simplify(error, ['LockBorder', 'Permissive']);
                if (loose[0].length < indices.length * 0.8) { [indices, achieved] = loose; flags = ['LockBorder', 'Permissive']; }
            }
            previous = indices.length;
            // A level that is barely smaller than the one before costs memory and buys nothing.
            const last = levels[levels.length - 1];
            if (indices.length < job.indices.length * 0.9 && (!last || indices.length < last.indices.length * 0.92)) levels.push({ indices, error: achieved * scale });
        }
        self.postMessage({ id: job.id, levels }, levels.map(level => level.indices.buffer));
    } catch (error) {
        self.postMessage({ id: job.id, error: String(error?.message || error) });
    }
};
