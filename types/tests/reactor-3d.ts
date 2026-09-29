export {};

const sidecar = Reactor3D.createSidecar(10, 10);
sidecar.elevation[0] = 2;
sidecar.lights = [{id:"torch", type:"point", x:2, y:3, radius:4, color:"#ff8844"}];
const map: RPGReactor.MapData = {width:10, height:10, scrollType:0, data:[], events:[], note:"<3d>", reactor3d:sidecar};
const mapMode: "2d" | "3d" = Reactor3D.mapMode(map);
const height: number = Reactor3D.elevationAt(map, 0, 0);
Reactor3D.ensureLoaded().then(loaded => {
    if (loaded && Reactor3D.isSupported()) {
        const viewport = Reactor3D.acquireViewport();
        viewport?.setRenderScale(0.75);
        const canvas: HTMLCanvasElement | null | undefined = viewport?.canvas();
    }
});
Reactor3D.switchLight("#torches", "toggle");
Reactor3D.transformLight("torch", {radius:6, intensity:1.5, color:"#ffeecc"}, 60);
Reactor3D.setMapAmbient({intensity:0.4}, 30);
Reactor3D.setEventModelSpec(map, 1, 0, {name:"Props/Tree", size:2, yaw:90});
const spec = Reactor3D.eventModelSpec(map, 1, 0);
if (spec) { const radians: number = spec.yaw; }
Reactor3D.setEventZ(map, 1, 2);
Reactor3D.setEventSize(map, 1, [2, 3]);
if ($gamePlayer) {
    Reactor3D.playModelAnimation($gamePlayer, "Wave", {repeat:false});
    Reactor3D.playModelSequence($gamePlayer, ["Wave", "Idle"]);
    Reactor3D.setModelAnimationSpeed($gamePlayer, 125);
}
RPGReactorCamera3D.change({mode:"thirdPerson", focus:"player", distance:8}, 60, true);
$gameMap?.setReactorCamera3D({mode:"fixed", yaw:45});
const camera: RPGReactor.CameraState = Reactor3D.Camera.currentState();
const descriptor = RPGReactorMediaSurfaces.manager.show({id:1, file:"Poster.png", target:"map", x:2, y:3, layer:"characters"});
if (descriptor) {
    const alpha: number = descriptor.opacity;
    RPGReactorVideoSurfaces.manager.transform({id:descriptor.id, width:640});
    RPGReactorMediaSurfaces.manager.stop(descriptor.id);
}
const validated = RPGReactorMediaSurfaces.normalizeShowArgs(PluginManager.parameters("MyPlugin"));
if (validated) RPGReactorMediaSurfaces.manager.show(validated);

// @ts-expect-error Lazy loading and unsupported GPUs mean the viewport can be absent.
const viewport: Reactor3D.Viewport = Reactor3D.viewport();
// @ts-expect-error Camera mode must be one of the actual supported modes.
RPGReactorCamera3D.change({mode:"orbit"});
// @ts-expect-error Wrong name must not be hidden by an index signature.
Reactor3D.transformLight("torch", {brightness:1});
// @ts-expect-error Model offsets need three axes.
Reactor3D.setEventModelSpec(map, 1, 0, {name:"Tree", offset:[1, 2]});
// @ts-expect-error Normalized model lookup can fail.
const requiredModel: RPGReactor.ModelSpec = Reactor3D.normalizeModelSpec(null);
// @ts-expect-error Descriptor can be rejected or lack an active map.
const requiredSurface: RPGReactor.MediaDescriptor = RPGReactorMediaSurfaces.manager.show({id:1,file:"Clip.webm"});
// @ts-expect-error Use an actual supported layer name.
RPGReactorMediaSurfaces.manager.show({id:1,file:"Clip.webm",layer:"normal"});
