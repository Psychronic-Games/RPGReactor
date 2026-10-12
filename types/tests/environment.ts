import type { Container, Texture, WebGLRenderer } from "pixi.js";

// Pixi's real declarations and TS7's GPU descriptors must stay fully checked.
declare const device: GPUDevice;
const texture: GPUTexture = device.createTexture({
    size:[16,16], format:"rgba8unorm", usage:GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});
const buffer: GPUBuffer = device.createBuffer({size:256, usage:GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
const canvas: HTMLCanvasElement = document.createElement("canvas");
const context: GPUCanvasContext | null = canvas.getContext("webgpu");
const offscreen: GPUCanvasContext | null = new OffscreenCanvas(1, 1).getContext("webgpu");
const context2d: CanvasRenderingContext2D | null = canvas.getContext("2d");
const webgl: WebGLRenderingContext | null = canvas.getContext("webgl");
const storageEstimate: Promise<StorageEstimate> = navigator.storage.estimate();
const runtimeStorage: Promise<unknown> = StorageManager.loadObject("settings");
declare const renderer: WebGLRenderer;
renderer.render({container:new Stage()});
const gpuFlags: number[] = [GPUShaderStage.VERTEX, GPUMapMode.READ, GPUColorWrite.ALL];
const last: number | undefined = [1, 2, 3].at(-1);

// @ts-expect-error GPU descriptors are real DOM types, not any.
device.createTexture({size:[16,16], format:"not-a-format", usage:4});
// @ts-expect-error Canvas context stays nullable.
const requiredContext: GPUCanvasContext = canvas.getContext("webgpu");
// @ts-expect-error Runtime save API does not leak into the browser's storage instance.
navigator.storage.loadObject("settings");
// @ts-expect-error No implicit Node.js ambient declarations.
process.cwd();
// @ts-expect-error No catch-all properties on Pixi types.
const bogus: Texture = new Stage().missingTexture;
