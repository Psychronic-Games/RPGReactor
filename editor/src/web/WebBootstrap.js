(async function () {
    try {
        await window.RPGReactorWebHost.initialize();
        const script = document.createElement('script');
        script.src = 'web/main.js';
        script.onerror = () => { throw new Error('Could not load the RPG Reactor browser entry point.'); };
        document.body.appendChild(script);
    } catch (error) {
        console.error('RPG Reactor Web failed to start:', error);
        const message = document.createElement('div');
        message.style.cssText = 'position:fixed;inset:0;z-index:20000;display:grid;place-items:center;padding:30px;background:#171717;color:#f0d58a;font:16px sans-serif;text-align:center;';
        message.textContent = `RPG Reactor Web could not start: ${error.message || error}`;
        document.body.appendChild(message);
    }
})();
