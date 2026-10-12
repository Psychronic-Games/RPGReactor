/** Gameplay-facing 3D API. Low-level Three.js renderer internals are intentionally not reproduced. */
declare namespace RPGReactor {
    type Vector3Tuple = [number, number, number];
    type CameraMode = "fixed" | "topDown" | "isometric" | "thirdPerson" | "firstPerson";
    type CameraFocus = "auto" | "display" | "player" | "event";
    interface CameraInput {
        mode?: CameraMode; pitch?: number | null; yaw?: number | null;
        distance?: number | null; fov?: number | null; focus?: CameraFocus; eventId?: number;
    }
    interface CameraState {
        mode: CameraMode; pitch: number | null; yaw: number | null;
        distance: number | null; fov: number | null; focus: CameraFocus; eventId: number;
    }
    interface ModelSpecInput {
        name: string; file?: string; ext?: string; size?: number; scale?: number;
        /** Authored angles are degrees. Normalized ModelSpec angles are radians. */
        yaw?: number; pitch?: number; roll?: number;
        stretch?: Vector3Tuple; offset?: Vector3Tuple;
        faces?: Partial<Record<"front" | "back" | "left" | "right", Vector3Tuple>>;
        texture?: string; view?: { zoom?: number; y?: number };
    }
    interface ModelSpec {
        name: string; file: string; ext: string; size: number; scale: number;
        yaw: number; pitch: number; roll: number; stretch: Vector3Tuple; offset: Vector3Tuple;
        faces: NonNullable<ModelSpecInput["faces"]> | null; texture: string;
        view: { zoom: number; y: number } | null;
    }
    type ModelCharacter = Game_CharacterBase | Game_Actor | Game_Enemy;
    type LightKind = "point" | "spot" | "beam" | "sun";
    interface LightInput {
        x: number; y: number; type?: LightKind; id?: string;
        height?: number; radius?: number; yaw?: number; pitch?: number; angle?: number; width?: number;
        color?: number | string; colour?: number | string; intensity?: number;
        shadow?: boolean; occlude?: boolean; on?: boolean; tag?: string;
        attach?: { player: true } | { event: number } | null;
        followFacing?: boolean; body?: boolean; flicker?: number;
        pulse?: { min: number; max: number; period: number } | null;
    }
    interface NativeLight extends LightInput {
        id: string; type: LightKind; height: number; radius: number;
        yaw: number; pitch: number; angle: number; width: number; color: number; intensity: number;
        shadow: boolean; occlude: boolean; on: boolean; tag: string;
        attach: { player: true } | { event: number } | null;
        followFacing: boolean; body: boolean; flicker: number;
        pulse: { min: number; max: number; period: number } | null;
    }
    interface LightTransform {
        x?: number; y?: number; height?: number; radius?: number;
        yaw?: number; pitch?: number; angle?: number; width?: number;
        intensity?: number; color?: string | number;
    }
    interface AmbientLight { intensity: number; colour: number }
    /** Selected sidecar fields; advanced materials/geometry remain future coverage. */
    interface Sidecar3D {
        version?: number; mode?: "2d" | "3d";
        width?: number; height?: number; elevation?: number[];
        camera?: CameraInput;
        terrain?: number[]; terrainWidth?: number;
        lights?: Array<Partial<LightInput>>;
        lighting?: { enabled?: boolean; mode?: "flat" | "volume"; ambient?: number; ambientColour?: number | string };
        objects?: Record<string, number[] | undefined>;
        objectGround?: Record<string, Array<boolean | number> | undefined>;
        events?: Record<string, Record<string, ModelSpecInput | undefined> | undefined>;
        eventZ?: Record<string, number | undefined>;
        eventSize?: Record<string, [number, number] | undefined>;
        mediaSurfaces?: MediaShowArgs[];
    }
    interface InitialSidecar3D extends Sidecar3D {
        version: 1; mode: "3d"; elevation: number[];
        camera: { pitch: number; yaw: number; distance: number; fov: number };
    }
    interface MediaShowArgs {
        id: number; file: string;
        target?: "map" | "event" | "this-event" | "player" | "screen";
        eventId?: number; x?: number; y?: number; z?: number;
        width?: number; height?: number;
        rotationX?: number; rotationY?: number; rotationZ?: number;
        scaleX?: number; scaleY?: number;
        /** Raw command opacity is 0..255 and volume is 0..100. */
        opacity?: number; alpha?: number; volume?: number;
        loop?: boolean; muted?: boolean; audio?: boolean; wait?: boolean;
        playbackRate?: number; currentTime?: number;
        layer?: number | "below" | "ground" | "characters" | "above" | "screen";
        depth?: number; cullDistance?: number; scanlines?: boolean | number;
        corners?: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    }
    interface MediaDescriptor {
        _reactorVideoDescriptor: 1;
        id: number; mapId: number; generation: number; file: string;
        target: "map" | "event" | "player" | "screen"; eventId: number;
        x: number; y: number; z: number; width: number; height: number;
        rotationX: number; rotationY: number; rotationZ: number; scaleX: number; scaleY: number;
        /** Normalized opacity and volume are 0..1. */
        opacity: number; volume: number;
        loop: boolean; muted: boolean; wait: boolean; waitReleased: boolean; ended: boolean;
        playbackRate: number; currentTime: number; layer: number; depth: number; cullDistance: number; scanlines: number;
        corners: Array<{ x: number; y: number }>;
        customCorners: boolean; worldCorners?: Array<{ x: number; y: number }>;
        anchor: { part: string; offset: Vector3Tuple; size: [number, number] | null } | null;
    }
}

declare namespace Reactor3D {
    const MODE_2D: "2d"; const MODE_3D: "3d";
    const LIGHT_POINT: "point"; const LIGHT_SPOT: "spot"; const LIGHT_BEAM: "beam"; const LIGHT_SUN: "sun";
    let LIB_URL: string;
    const SIDECAR_SUFFIX: string;
    const EXTENSIONS: Array<{ file: string; namespace: string }>;
    function extensionsLoaded(): boolean;
    function isLoaded(): boolean;
    /** Resolves false rather than rejecting when Three.js cannot be loaded. */
    function ensureLoaded(): Promise<boolean>;
    function isSupported(): boolean;
    function unsupportedReason(): string | null;
    function mapMode(mapData: RPGReactor.MapData | null | undefined): "2d" | "3d";
    function isMap3D(mapData: RPGReactor.MapData | null | undefined): boolean;
    function shouldRender3D(mapData: RPGReactor.MapData | null | undefined): boolean;
    function renderBlocker(mapData: RPGReactor.MapData | null | undefined): string | null;
    function createSidecar(width: number, height: number): RPGReactor.InitialSidecar3D;
    function elevationAt(mapData: RPGReactor.MapData | null | undefined, x: number, y: number): number;
    function deriveElevation(mapData: RPGReactor.MapData | null, flags: number[], options?: { wallHeight?: number }): number[] | null;
    function objectIdAt(mapData: RPGReactor.MapData | null, x: number, y: number, layer: number): number;
    function hasPaintedObjects(mapData: RPGReactor.MapData | null): boolean;
    function terrainOf(mapData: RPGReactor.MapData | null): number[] | null;
    function hasTerrain(mapData: RPGReactor.MapData | null): boolean;
    function terrainHeightAt(mapData: RPGReactor.MapData | null, x: number, z: number): number;
    function groundHeightAt(mapData: RPGReactor.MapData | null, x: number, z: number, near?: number): number;
    function viewport(): Viewport | null;
    function acquireViewport(): Viewport | null;
    function releaseViewport(): void;
    class Viewport {
        constructor(); initialize(): void;
        isShared(): boolean; scale(): number; setRenderScale(scale: number): void;
        targetSize(): { width: number; height: number };
        generation(): number; resize(): void; canvas(): HTMLCanvasElement | null;
        setVisible(visible: boolean): void; isDetached(): boolean; detachFromPage(): void; destroy(): void;
        /** Three.js internals are opaque until their own types are explicitly integrated. */
        renderer(): unknown; scene(): unknown; camera(): unknown;
    }
    function setLights(lights: RPGReactor.LightInput[]): void;
    function lights(): RPGReactor.LightInput[];
    function setAmbient(ambient: RPGReactor.AmbientLight | null): void;
    function ambient(): RPGReactor.AmbientLight | null;
    function parseColour(value: unknown): number;
    function readMapLights(mapData: RPGReactor.MapData | null): RPGReactor.NativeLight[];
    function ambientFor(mapData: RPGReactor.MapData | null): RPGReactor.AmbientLight;
    function lightModeFor(mapData?: RPGReactor.MapData | null): "flat" | "volume";
    function lightsTargeted(target: string): RPGReactor.NativeLight[];
    function setLightOn(key: string, on: boolean): void;
    function switchLight(target: string, state?: "on" | "off" | "toggle"): void;
    function transformLight(target: string, values: RPGReactor.LightTransform | null, duration?: number): void;
    function setMapAmbient(values: { intensity?: number; color?: string | number } | null, duration?: number): void;
    function splitModelRef(name: string): { name: string; ext: string } | null;
    function normalizeModelSpec(spec: RPGReactor.ModelSpecInput | null | undefined): RPGReactor.ModelSpec | null;
    function eventModelSpec(mapData: RPGReactor.MapData | null, eventId: number, pageIndex?: number): RPGReactor.ModelSpec | null;
    function setEventModelSpec(mapData: RPGReactor.MapData | null, eventId: number, pageIndex: number,
        spec: RPGReactor.ModelSpecInput | null): RPGReactor.ModelSpecInput | null;
    function hasEventModels(mapData: RPGReactor.MapData | null): boolean;
    function eventZAt(mapData: RPGReactor.MapData | null, eventId: number): number;
    function setEventZ(mapData: RPGReactor.MapData | null, eventId: number, z: number): void;
    function eventSizeAt(mapData: RPGReactor.MapData | null, eventId: number): [number, number];
    function setEventSize(mapData: RPGReactor.MapData | null, eventId: number, size: [number, number]): void;
    function modelAnimationSpeed(character: RPGReactor.ModelCharacter | null): number;
    function setModelAnimationSpeed(character: RPGReactor.ModelCharacter | null, percent: number): void;
    function playModelAnimation(character: RPGReactor.ModelCharacter, name: string, options?: { repeat?: boolean; sequence?: string[] | null }): void;
    function playModelSequence(character: RPGReactor.ModelCharacter, names: string | string[], repeat?: boolean): void;
    function playModelEffect(character: RPGReactor.ModelCharacter, name: string): void;
    function modelAnimationsBusy(character?: RPGReactor.ModelCharacter | null): boolean;
    function setModelEffectLight(character: RPGReactor.ModelCharacter, name: string, on: boolean): boolean;
    namespace Camera {
        const DEFAULT_MODE: "fixed";
        function modeName(value: unknown): RPGReactor.CameraMode;
        function normalizeState(raw: unknown): RPGReactor.CameraState;
        function isDefaultState(state: unknown): boolean;
        function mapDefault(mapData: RPGReactor.MapData | null): RPGReactor.CameraState;
        function normalizeArgs(args: unknown, context?: Game_Interpreter | null): {
            state: RPGReactor.CameraState; duration: number; wait: boolean; keep: boolean;
        };
        function currentState(): RPGReactor.CameraState;
        function change(state: RPGReactor.CameraInput | null, duration?: number, keep?: boolean): void;
        function hidesPlayer(): boolean;
        function isMoving(): boolean;
    }
}
/** Runtime exports the very same camera object under this compatibility name. */
declare var RPGReactorCamera3D: typeof Reactor3D.Camera;

/** Hooks installed by reactor_3d.js during normal Runtime boot. */
interface Game_Map {
    reactorCamera3D(): RPGReactor.CameraState;
    setReactorCamera3D(state: RPGReactor.CameraInput | null, duration?: number, keep?: boolean): void;
}

declare namespace RPGReactorMediaSurfaces {
    const PLUGIN_NAME: "RPGReactor";
    const STORE_KEY: "_reactorVideoSurfaces";
    const WAIT_MODE: "reactorVideoSurface";
    function sanitizeMoviePath(value: unknown): string | null;
    function movieUrl(path: string): string;
    function pictureUrl(path: string): string;
    function isImageFile(path: unknown): boolean;
    /** Parsers accept raw serialized command data and may reject it. */
    function normalizeShowArgs(raw: unknown, interpreter?: Game_Interpreter | null): RPGReactor.MediaDescriptor | null;
    function normalizeTransformArgs(raw: unknown, current: RPGReactor.MediaDescriptor | null, interpreter?: Game_Interpreter | null): RPGReactor.MediaDescriptor | null;
    function normalizeStopArgs(raw: unknown): number | null;
    class MediaSurfaceManager {
        constructor();
        descriptor(id: number): RPGReactor.MediaDescriptor | null;
        isCurrent(id: number, generation: number): boolean;
        show(raw: RPGReactor.MediaShowArgs | RPGReactor.MediaDescriptor | string, interpreter?: Game_Interpreter | null): RPGReactor.MediaDescriptor | null;
        transform(raw: (Partial<RPGReactor.MediaShowArgs> & { id: number }) | string, interpreter?: Game_Interpreter | null): RPGReactor.MediaDescriptor | null;
        stop(raw: number | { id: number } | string): boolean;
        armWait(interpreter: Game_Interpreter | null, descriptor: RPGReactor.MediaDescriptor | null): boolean;
        isWaiting(interpreter: Game_Interpreter | null): boolean;
        hasActiveMapSpriteset(): boolean;
        retryPendingPlayback(): void;
        seedMapSurfaces(mapData: RPGReactor.MapData): void;
    }
    const VideoSurfaceManager: typeof MediaSurfaceManager;
    const manager: MediaSurfaceManager;
    function registerCommands(): void;
    function installHooks(): void;
}
declare var RPGReactorVideoSurfaces: typeof RPGReactorMediaSurfaces;
