# PSYCHRONIC Plugin GitHub Sync

This workflow publishes private/external PSYCHRONIC RPG Maker MZ plugins as standalone GitHub repositories under `Psychronic-Games`.

These notes exist because the plugins were originally maintained inside a Complex project/template used for RPG Reactor compatibility testing. That Complex template and the plugin source files inside it are not part of the public RPG Reactor GitHub repository and should not be uploaded wholesale. Only selected `PSYCHRONIC_*.js` plugin files are published to their own standalone plugin repositories.

## Source Plugins

- Source folder: maintainer-local Complex template/plugin workspace, usually a path shaped like `template/Complex/js/plugins/` in the private working copy
- Include files matching: `PSYCHRONIC_*.js`
- Exclude backup or fossil files, such as `*BACKUP*` or `*FOSSIL*`
- Each plugin should become its own standalone repository named after the plugin file without `.js`
- Do not assume this source folder exists in a clean public RPG Reactor checkout

Example:

```text
<external-complex-template>/js/plugins/PSYCHRONIC_MegaItemsMZ.js
-> Psychronic-Games/PSYCHRONIC_MegaItemsMZ
```

## Repository Contents

Each standalone plugin repository should include:

- The latest plugin `.js` file
- `README.md` identifying it as an RPG Maker MZ plugin
- A clear `What It Does` section based on the plugin metadata/help text
- Installation instructions for `js/plugins/`
- `LICENSE`

Recommended GitHub repository metadata:

- Description prefix: `RPG Maker MZ plugin:`
- Topics: `rpg-maker-mz`, `rpg-maker-plugin`, `javascript`, `psychronic`, `mz-plugin`

## Public Repo Boundary

- The RPG Reactor public repository contains the editor/runtime source, not the private Complex template plugin workspace.
- Do not add the Complex template folder or generated upload staging folders to this repository.
- If a plugin fix is also needed for RPG Reactor runtime compatibility, make the runtime/editor change in this repository and publish the standalone plugin update through its plugin repository.

## Local Staging Repos

If sync scripts prepare temporary standalone plugin repositories, keep them outside this repository. Temporary staging folders are not project source and should be regenerated from the maintainer-local Complex template plugin folder whenever a fresh upload batch is needed.
