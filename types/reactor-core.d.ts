import type * as Pixi from "pixi.js";

declare global {
    /** Partial runtime declarations; sources: reactor_core.js and libs/pixi_compat.js. */
    namespace RPGReactor {
        type ColorTone = [red: number, green: number, blue: number, gray: number];
        type BlendColor = [red: number, green: number, blue: number, alpha: number];
        type LegacyBlendMode = 0 | 1 | 2 | 3;

        /** Reactor's legacy BaseTexture shim, NOT a Pixi 8 TextureSource. */
        interface BaseTexture {
            width: number;
            height: number;
            valid: boolean;
            scaleMode: Pixi.SCALE_MODE;
            mipmap: boolean;
            readonly source: Pixi.TextureSource | null;
            resource: {
                source: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;
                update(): void;
            } | null;
            update(): void;
            setSize(width: number, height: number): void;
            destroy(): void;
        }
    }

    namespace Utils {
        const RPGMAKER_NAME: "MZ";
        const REACTOR_NAME: "Reactor";
        const RPGMAKER_VERSION: string;
        function checkRMVersion(version: string): boolean;
        function isOptionValid(name: string): boolean;
        function isNwjs(): boolean;
        function isMobileDevice(): boolean;
        function isMobileSafari(): boolean;
        function isAndroidChrome(): boolean;
        function isLocal(): boolean;
        function canUseWebGL(): boolean;
        function canUseWebAudioAPI(): boolean;
        function canUseCssFontLoading(): boolean;
        function canUseIndexedDB(): boolean;
        function canPlayOgg(): boolean;
        function canPlayWebm(): boolean;
        function encodeURI(str: string): string;
        function extractFileName(filename: string): string;
        function escapeHtml(str: string): string;
        function containsArabic(str: string): boolean;
        function setEncryptionInfo(hasImages: boolean, hasAudio: boolean, key: string): void;
        /** Undefined until encryption settings have been supplied. */
        function hasEncryptedImages(): boolean | undefined;
        function hasEncryptedAudio(): boolean | undefined;
        function correctFileCase(url: string): string | null;
        function correctFileCaseFromIndex(url: string): string | null;
        function resolveFileCase(url: string, suffix: string): string;
        function resolveAudioExtension(url: string, suffix: string): string;
        function decryptArrayBuffer(source: ArrayBuffer): ArrayBuffer;
    }

    namespace Graphics {
        let width: number;
        let height: number;
        let boxWidth: number;
        let boxHeight: number;
        let defaultScale: number;
        let frameCount: number;
        const app: Pixi.Application | null | undefined;
        /** Effekseer is optional; its API is outside Step 2. */
        const effekseer: unknown;
        /** Runtime implementation is async despite historical boolean JSDoc. */
        function initialize(): Promise<boolean>;
        function setTickHandler(handler: ((deltaTime: number) => void) | null): void;
        function startGameLoop(): void;
        function stopGameLoop(): void;
        function setStage(stage: Stage): void;
        function startLoading(): void;
        function endLoading(): boolean;
        function printError(name: string, message: string, error?: Error | null): void;
        function showRetryButton(retry: () => void): void;
        function eraseError(): void;
        function pageToCanvasX(x: number): number;
        function pageToCanvasY(y: number): number;
        function isInsideCanvas(x: number, y: number): boolean;
        function showScreen(): void;
        function hideScreen(): void;
        function resize(width: number, height: number): void;
    }

    class Point extends Pixi.Point {
        constructor(x?: number, y?: number);
        initialize(x?: number, y?: number): void;
    }

    class Rectangle extends Pixi.Rectangle {
        constructor(x?: number, y?: number, width?: number, height?: number);
        initialize(x?: number, y?: number, width?: number, height?: number): void;
    }

    class Bitmap {
        constructor(width?: number, height?: number);
        static load(url: string, fallbackUrls?: string[]): Bitmap;
        static snap(stage?: Pixi.Container | null): Bitmap;
        static defaultOutlineWidth(): number;
        static textShadow(): boolean;
        fontFace: string;
        fontSize: number;
        fontBold: boolean;
        fontItalic: boolean;
        textColor: string;
        outlineColor: string;
        outlineWidth: number;
        smooth: boolean;
        paintOpacity: number;
        readonly url: string;
        /** Null before an image is loaded or after destruction. */
        readonly baseTexture: RPGReactor.BaseTexture | null;
        readonly image: HTMLImageElement | null;
        /** Access lazily creates the canvas/context. */
        readonly canvas: HTMLCanvasElement;
        readonly context: CanvasRenderingContext2D;
        readonly width: number;
        readonly height: number;
        readonly rect: Rectangle;
        readonly animationFrameCount: number;
        readonly animationFrame: number;
        initialize(width?: number, height?: number): void;
        isReady(): boolean;
        isError(): boolean;
        destroy(): void;
        resize(width: number, height: number): void;
        blt(source: Bitmap, sx: number, sy: number, sw: number, sh: number,
            dx: number, dy: number, dw?: number, dh?: number): void;
        getPixel(x: number, y: number): string;
        getAlphaPixel(x: number, y: number): number;
        clearRect(x: number, y: number, width: number, height: number): void;
        clear(): void;
        fillRect(x: number, y: number, width: number, height: number, color: string): void;
        fillAll(color: string): void;
        strokeRect(x: number, y: number, width: number, height: number, color: string): void;
        gradientFillRect(x: number, y: number, width: number, height: number,
            color1: string, color2: string, vertical?: boolean): void;
        drawCircle(x: number, y: number, radius: number, color: string): void;
        drawText(text: string | number, x: number, y: number, maxWidth: number,
            lineHeight: number, align?: "left" | "center" | "right"): void;
        measureTextWidth(text: string): number;
        addLoadListener(listener: (bitmap: Bitmap) => void): void;
        retry(): void;
        isAnimated(): boolean;
        pauseAnimation(): void;
        playAnimation(): void;
        isAnimationPaused(): boolean;
        seekAnimation(index: number): void;
        restartAnimation(): void;
        setAnimationLoopCount(count: number): void;
    }

    class Sprite extends Pixi.Sprite {
        constructor(bitmap?: Bitmap | null);
        initialize(bitmap?: Bitmap | null): void;
        bitmap: Bitmap | null | undefined;
        spriteId: number;
        opacity: number;
        /** Numeric MZ modes 0..3 are normalized to Pixi 8 string modes. */
        get blendMode(): Pixi.BLEND_MODES;
        set blendMode(value: Pixi.BLEND_MODES | RPGReactor.LegacyBlendMode);
        destroy(): void;
        update(): void;
        hide(): void;
        show(): void;
        updateVisibility(): void;
        move(x: number, y: number): void;
        setFrame(x: number, y: number, width: number, height: number): void;
        setHue(hue: number): void;
        getBlendColor(): RPGReactor.BlendColor;
        setBlendColor(color: RPGReactor.BlendColor): void;
        getColorTone(): RPGReactor.ColorTone;
        setColorTone(tone: RPGReactor.ColorTone): void;
    }

    class Stage extends Pixi.Container {
        constructor();
        addChild<T extends (Pixi.Container | RPGReactor.RuntimeWindow)[]>(...children: T): T[0];
        addChildAt<T extends Pixi.Container | RPGReactor.RuntimeWindow>(child: T, index: number): T;
        removeChild<T extends (Pixi.Container | RPGReactor.RuntimeWindow)[]>(...children: T): T[0];
        initialize(): void;
        destroy(): void;
    }

    /** Instance surface returned by AudioManager; constructor coverage is deferred. */
    interface WebAudio {
        /** Set by AudioManager.createBuffer, absent on a directly constructed WebAudio. */
        name?: string;
        frameCount?: number;
        readonly url: string;
        volume: number;
        pitch: number;
        pan: number;
        isReady(): boolean;
        isError(): boolean;
        isPlaying(): boolean;
        play(loop: boolean, offset?: number): void;
        stop(): void;
        destroy(): void;
        fadeIn(duration: number): void;
        fadeOut(duration: number): void;
        seek(): number;
        addLoadListener(listener: () => void): void;
        addStopListener(listener: () => void): void;
        retry(): void;
    }
}
