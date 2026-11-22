# Uploading a build to Steam

1. App 4817110; depots 4817111 Windows, 4817112 macOS, 4817113 Linux (set up and published 2026-11-21, in all three packages). They are already in `app_build.vdf` and `depot_*.vdf`; put the version in `Desc`.
2. Launch options (published): `RPGReactor/RPG Reactor.exe`, `RPGReactor/RPG Reactor.app`, `RPGReactor/RPGReactor.sh`, so each depot keeps the release zip's `RPGReactor/` folder at its root. The first build went up as the 0.99.6 zips through Steamworks > SteamPipe > Upload Depots via HTTP (2 GB a zip at most).
3. Build the editor packages: `node editor/build-scripts/release-editor.cjs --target windows` and `--target linux`.
4. Lay them out next to this folder:

   ```
   steam/
     scripts/   (this folder's .vdf files)
     content/windows/   (the Windows package, RPG Reactor.exe at its root)
     content/macos/     (RPG Reactor.app)
     content/linux/     (the Linux package, its launcher at its root)
     output/
   ```

5. Upload: `steamcmd +login <steamworks account> +run_app_build ../scripts/app_build.vdf +quit` (Steam Guard asks for a code the first time).
6. In Steamworks > SteamPipe > Builds, set the new build live on the `default` branch (after build review for the first release). Launch options: Windows `RPG Reactor.exe`; macOS `RPG Reactor.app`; Linux the package's launcher.
