const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const platformArg = args.find(arg => arg.startsWith('--platform='));
const outputArg = args.find(arg => arg.startsWith('--output='));
const projectArg = args.find(arg => arg.startsWith('--project='));
const nameArg = args.find(arg => arg.startsWith('--name='));

// Parse arguments
// nw-builder v4 takes one platform per build call
let platforms = ['win', 'linux', 'osx'];
if (platformArg) {
    const platform = platformArg.split('=')[1];
    if (platform === 'mac') {
        platforms = ['osx'];
    } else if (platform === 'win') {
        platforms = ['win'];
    } else if (platform === 'linux') {
        platforms = ['linux'];
    }
}

const outputDir = outputArg ? outputArg.split('=')[1] : path.join(__dirname, '../dist');
const projectPath = projectArg ? projectArg.split('=').slice(1).join('=') : null;
const appName = nameArg ? nameArg.split('=').slice(1).join('=') : null;

if (!projectPath) {
    console.error('ERROR: --project=<path> argument is required.');
    console.error('Usage: node build.js --project=/path/to/project [--name="Game Name"] [--platform=win|mac|linux] [--output=/path/to/output]');
    process.exit(1);
}

if (!fs.existsSync(projectPath)) {
    console.error(`ERROR: Project path does not exist: ${projectPath}`);
    process.exit(1);
}

// Read the project's package.json for app details
const projectPackagePath = path.join(projectPath, 'package.json');
if (!fs.existsSync(projectPackagePath)) {
    console.error(`ERROR: No package.json found in project directory: ${projectPath}`);
    process.exit(1);
}
const projectPackageJson = JSON.parse(fs.readFileSync(projectPackagePath, 'utf8'));

// Determine game name: CLI arg > package.json window.title > "Game"
const gameName = appName || (projectPackageJson.window && projectPackageJson.window.title) || 'Game';
// Safe name for file system (strip characters that cause issues in paths/executables)
const safeGameName = gameName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '');

console.log('========================================');
console.log('RPG Reactor - Game Build Script');
console.log('========================================');
console.log(`Game: ${gameName}`);
console.log(`Project: ${projectPath}`);
console.log(`Platform(s): ${platforms.join(', ')}`);
console.log(`Output directory: ${outputDir}`);
console.log('========================================\n');

// Paths/files to exclude when staging (relative to project root)
const EXCLUDED = new Set([
    'Backup',
    'Screenshots',
    'project.rpgreactor',
    'game.rmmzproject',
    path.join('js', 'REACTOR_CORE_DUMP_MIDDEV'),
    path.join('js', 'RMMZ_Corescript'),
    path.join('data', 'nul'),
]);

/**
 * Recursively copy a directory, skipping excluded paths.
 */
function copyDirFiltered(src, dest, relBase) {
    if (!fs.existsSync(src)) return;

    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const relPath = path.join(relBase, entry.name);

        if (EXCLUDED.has(relPath) || EXCLUDED.has(entry.name)) {
            console.log(`  [skip] ${relPath}`);
            continue;
        }

        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirFiltered(srcPath, destPath, relPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Create staging directory with clean game files
const stagingDir = path.join(os.tmpdir(), `rpgreactor-build-${Date.now()}`);
console.log('Creating staging directory...');
console.log(`  ${stagingDir}\n`);

console.log('Staging game files (excluding dev/backup files)...');
copyDirFiltered(projectPath, stagingDir, '');
console.log('\nStaging complete.\n');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function cleanupStaging() {
    try {
        console.log('Cleaning up staging directory...');
        fs.rmSync(stagingDir, { recursive: true, force: true });
        console.log('Staging directory cleaned up.');
    } catch (err) {
        console.warn(`Could not clean up staging directory: ${err.message}`);
    }
}

// nw-builder v4 is ESM — must use dynamic import()
(async () => {
    const { default: nwbuild } = await import('nw-builder');

    const gameVersion = projectPackageJson.version || '1.0.0';

    for (const platform of platforms) {
        console.log(`\n--- Building for ${platform} (x64) ---\n`);

        // Each platform gets its own output subdirectory
        // (nw-builder v4 wipes outDir at the start of each build)
        const platformOutDir = path.join(outputDir, `${safeGameName}-${platform}-x64`);

        // Platform-specific app configuration
        const appConfig = {
            name: safeGameName,
        };

        if (platform === 'win') {
            // Windows needs .ico for icon embedding; use false to skip if absent
            // (false is non-nullish so nw-builder won't override it from package.json)
            const icoPath = path.join(stagingDir, 'icon', 'icon.ico');
            appConfig.icon = fs.existsSync(icoPath) ? icoPath : false;
            // Required version fields (game package.json may lack "version")
            appConfig.version = gameVersion;
            appConfig.fileVersion = gameVersion;
            appConfig.productVersion = gameVersion;
        } else if (platform === 'osx') {
            // macOS needs .icns for icon embedding
            const icnsPath = path.join(stagingDir, 'icon', 'icon.icns');
            appConfig.icon = fs.existsSync(icnsPath) ? icnsPath : false;
            appConfig.CFBundleVersion = gameVersion;
            appConfig.CFBundleShortVersionString = gameVersion;
            appConfig.CFBundleDisplayName = gameName;
            appConfig.CFBundleName = gameName;
        }
        // For Linux: leave app.icon unset — nw-builder reads window.icon
        // from the game's package.json and resolves it from package.nw/

        await nwbuild({
            mode: 'build',
            version: 'latest',
            flavor: 'normal',
            platform: platform,
            arch: 'x64',
            srcDir: stagingDir,
            cacheDir: path.join(__dirname, '../.nw-cache'),
            outDir: platformOutDir,
            glob: false,
            app: appConfig,
        });

        console.log(`\nBuild for ${platform} complete: ${platformOutDir}`);
    }

    console.log('\n========================================');
    console.log('Build completed successfully!');
    console.log('========================================');
    console.log(`Output location: ${outputDir}`);
    console.log('\nBuild artifacts:');
    platforms.forEach(platform => {
        const label = platform === 'osx' ? 'MAC' : platform.toUpperCase();
        console.log(`  - ${label}: ${path.join(outputDir, `${safeGameName}-${platform}-x64`)}`);
    });
    console.log();

    cleanupStaging();
})().catch((error) => {
    console.error('\n========================================');
    console.error('Build failed!');
    console.error('========================================');
    console.error(error);
    cleanupStaging();
    process.exit(1);
});
