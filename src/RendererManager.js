// RPG Reactor - Renderer Manager
// Handles Pixi.js initialization and rendering

class RendererManager {
    constructor() {
        this.app = null;
    }

    async initPixi() {
        this.app = new PIXI.Application();

        const container = document.getElementById('canvas-container');

        await this.app.init({
            width: 800,
            height: 600,
            backgroundColor: 0x111111,  // Dark gray/black background
            backgroundAlpha: 1,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            resizeTo: container,  // Automatically resize to fill the container
            preference: 'webgl'  // Ensure WebGL rendering for better alpha support
        });

        container.appendChild(this.app.canvas);

        // Set canvas to fill container
        this.app.canvas.style.display = 'block';
        this.app.canvas.style.imageRendering = 'pixelated'; // Crisp pixel art scaling

        // Don't force 100% - let it size naturally so scrollbars can work
        // Grid removed - clean canvas background only
    }

    drawGrid() {
        const graphics = new PIXI.Graphics();
        const tileSize = 32;
        const cols = Math.floor(this.app.screen.width / tileSize);
        const rows = Math.floor(this.app.screen.height / tileSize);

        // Draw grid lines
        graphics.lineStyle(1, 0x3e3e42, 0.5);

        for (let x = 0; x <= cols; x++) {
            graphics.moveTo(x * tileSize, 0);
            graphics.lineTo(x * tileSize, rows * tileSize);
        }

        for (let y = 0; y <= rows; y++) {
            graphics.moveTo(0, y * tileSize);
            graphics.lineTo(cols * tileSize, y * tileSize);
        }

        graphics.stroke();
        this.app.stage.addChild(graphics);

        // Add some placeholder text
        const style = new PIXI.TextStyle({
            fontFamily: 'Arial',
            fontSize: 24,
            fill: '#999999',
            align: 'center'
        });

        const text = new PIXI.Text({
            text: 'Map Editor\n\nClick "New Project" to get started',
            style: style
        });

        text.x = this.app.screen.width / 2;
        text.y = this.app.screen.height / 2;
        text.anchor.set(0.5);

        this.app.stage.addChild(text);
    }

    getApp() {
        return this.app;
    }
}
