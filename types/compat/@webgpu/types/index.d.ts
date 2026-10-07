/// <reference path="../../lib.dom.generated.d.ts" />

/**
 * TypeScript 7.0.2 DOM / Pixi 8.20.0 compatibility boundary.
 *
 * Pixi's Shaders.d.ts references @webgpu/types, whose complete WebGPU globals
 * duplicate lib.dom. Resolve that type reference here via typeRoots instead.
 * The actual GPU interfaces/descriptors remain those of lib.dom; this file only
 * supplies missing canvas overloads and WebGPU flag namespaces. No runtime code,
 * catch-all types, or suppressed declaration diagnostics are involved.
 *
 * Compare editor/node_modules/@webgpu/types/dist/index.d.ts (0.1.72),
 * https://gpuweb.github.io/types/ and https://gpuweb.github.io/gpuweb/.
 * Recheck this adapter when TypeScript/Pixi change. It targets DOM, not workers.
 */
export {};

declare global {
    interface HTMLCanvasElement {
        getContext(contextId: "webgpu"): GPUCanvasContext | null;
    }
    interface OffscreenCanvas {
        getContext(contextId: "webgpu"): GPUCanvasContext | null;
    }
    const GPUBufferUsage: {
        readonly MAP_READ: 0x0001;
        readonly MAP_WRITE: 0x0002;
        readonly COPY_SRC: 0x0004;
        readonly COPY_DST: 0x0008;
        readonly INDEX: 0x0010;
        readonly VERTEX: 0x0020;
        readonly UNIFORM: 0x0040;
        readonly STORAGE: 0x0080;
        readonly INDIRECT: 0x0100;
        readonly QUERY_RESOLVE: 0x0200;
    };
    const GPUTextureUsage: {
        readonly COPY_SRC: 0x01;
        readonly COPY_DST: 0x02;
        readonly TEXTURE_BINDING: 0x04;
        readonly STORAGE_BINDING: 0x08;
        readonly RENDER_ATTACHMENT: 0x10;
        /** Experimental flag carried by the pinned @webgpu/types package. */
        readonly TRANSIENT_ATTACHMENT: GPUFlagsConstant;
    };
    const GPUShaderStage: {
        readonly VERTEX: 0x1;
        readonly FRAGMENT: 0x2;
        readonly COMPUTE: 0x4;
    };
    const GPUMapMode: { readonly READ: 0x1; readonly WRITE: 0x2 };
    const GPUColorWrite: {
        readonly RED: 0x1;
        readonly GREEN: 0x2;
        readonly BLUE: 0x4;
        readonly ALPHA: 0x8;
        readonly ALL: 0xF;
    };
}
