// Compile-only fixtures. Never loaded by the Runtime.
import type { Container, Point as PixiPoint, Sprite as PixiSprite, TextureSource } from "pixi.js";

const point: PixiPoint = new Point(3, 4);
point.set(5, 6);
const rect = new Rectangle(0, 0, 48, 48);
const contained: boolean = rect.contains(point.x, point.y);
const bitmap = new Bitmap(120, 40);
bitmap.fillAll("#222");
bitmap.drawText("HP", 0, 0, 120, 40, "center");
bitmap.blt(ImageManager.loadPicture("Status"), 0, 0, 32, 32, 0, 0);
bitmap.addLoadListener(loaded => { const width: number = loaded.width; });
const source: TextureSource | null | undefined = bitmap.baseTexture?.source;
bitmap.baseTexture?.update();
const image: HTMLImageElement | null = bitmap.image;
const sprite = new Sprite(bitmap);
sprite.bitmap = null;
sprite.bitmap = undefined;
sprite.bitmap = bitmap;
sprite.move(24, 48);
sprite.anchor.set(0.5);
sprite.scale.set(2);
sprite.opacity = 128;
sprite.blendMode = 1;
sprite.blendMode = "multiply";
sprite.setBlendColor([255, 0, 0, 128]);
sprite.setColorTone([0, 0, 0, 100]);
const tone: RPGReactor.ColorTone = sprite.getColorTone();
const pixiSprite: PixiSprite = sprite;
const stage = new Stage();
const container: Container = stage;
stage.addChild(sprite);
const snapshot: Bitmap = Bitmap.snap(stage);
Graphics.setStage(stage);
Graphics.setTickHandler(delta => { const dt: number = delta; });
const initialized: Promise<boolean> = Graphics.initialize();
Graphics.app?.stage.addChild(sprite);
const engine: "MZ" = Utils.RPGMAKER_NAME;
const corrected: string | null = Utils.correctFileCase("img/Foo.png");
const supported: boolean = Utils.isNwjs();

// @ts-expect-error Bitmap drawing needs a CSS color string.
bitmap.fillRect(0, 0, 10, 10, 123);
// @ts-expect-error Getter-only dimensions must be changed through resize().
bitmap.width = 32;
// @ts-expect-error A legacy base texture is not a Pixi TextureSource.
const wrongSource: TextureSource = bitmap.baseTexture!;
// @ts-expect-error Image can be null before loading.
const loadedImage: HTMLImageElement = bitmap.image;
// @ts-expect-error Public tuple describes all four channels.
sprite.setColorTone([1, 2, 3]);
// @ts-expect-error Unsupported Pixi mode.
sprite.blendMode = "invalid-blend-mode";
// @ts-expect-error Sprite inherits Pixi's actual child constraint.
stage.addChild(bitmap);
// @ts-expect-error Async initialization is not a synchronous boolean.
const syncInitialized: boolean = Graphics.initialize();
// @ts-expect-error Static managers cannot be constructed.
new Graphics();
// @ts-expect-error Coordinates are numeric.
new Point("3", 4);

const blankSnapshot: Bitmap = Bitmap.snap();
