// RPG Reactor - Project Manager
// Handles project creation, loading, and saving

class ProjectManager {
    constructor() {
        this.fs = null;
        this.path = null;

        // Initialize Node.js modules if running in NW.js
        if (typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    getEngineVersion() {
        if (!this.fs || !this.path || typeof process === 'undefined') {
            return '0.0.0';
        }

        try {
            const packagePath = this.path.join(process.cwd(), 'package.json');
            const packageData = JSON.parse(this.fs.readFileSync(packagePath, 'utf8'));
            return packageData.version || '0.0.0';
        } catch (error) {
            console.warn('Could not read RPG Reactor version from package.json:', error);
            return '0.0.0';
        }
    }

    async createNewProject(targetPath, projectName) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return false;
        }

        try {
            console.log(`Creating new project: ${projectName} at ${targetPath}`);

            // Get the template path (relative to current working directory in NW.js)
            const cwd = process.cwd();
            const templatePath = this.path.join(cwd, 'template', 'Demo');
            const engineVersion = this.getEngineVersion();

            console.log('Looking for template at:', templatePath);

            // Check if template exists
            if (!this.fs.existsSync(templatePath)) {
                console.error('Template directory not found:', templatePath);
                console.error('Current working directory:', cwd);
                return false;
            }

            // Create target directory if it doesn't exist
            if (!this.fs.existsSync(targetPath)) {
                this.fs.mkdirSync(targetPath, { recursive: true });
            }

            // Copy template to target
            await this.copyDirectory(templatePath, targetPath);

            // Create RPG Reactor project file
            const projectData = {
                name: projectName,
                version: engineVersion,
                engine: 'RPG Reactor',
                engineVersion: engineVersion,
                created: new Date().toISOString(),
                modified: new Date().toISOString()
            };

            const projectFilePath = this.path.join(targetPath, 'project.rpgreactor');
            this.fs.writeFileSync(projectFilePath, JSON.stringify(projectData, null, 2));

            // Update package.json with project name
            const packagePath = this.path.join(targetPath, 'package.json');
            if (this.fs.existsSync(packagePath)) {
                const packageData = JSON.parse(this.fs.readFileSync(packagePath, 'utf8'));
                packageData.window.title = projectName;
                this.fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2));
            }

            console.log('Project created successfully!');
            return true;
        } catch (error) {
            console.error('Error creating project:', error);
            return false;
        }
    }

    async copyDirectory(source, target) {
        if (!this.fs || !this.path) return;

        // Create target directory
        if (!this.fs.existsSync(target)) {
            this.fs.mkdirSync(target, { recursive: true });
        }

        // Read source directory
        const files = this.fs.readdirSync(source);

        for (const file of files) {
            const sourcePath = this.path.join(source, file);
            const targetPath = this.path.join(target, file);
            const stat = this.fs.statSync(sourcePath);

            if (stat.isDirectory()) {
                // Recursively copy subdirectories
                await this.copyDirectory(sourcePath, targetPath);
            } else {
                // Copy file
                this.fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }

    async loadProject(projectPath) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return null;
        }

        try {
            // Look for RPG Reactor project file
            const projectFilePath = this.path.join(projectPath, 'project.rpgreactor');

            let projectData;
            if (this.fs.existsSync(projectFilePath)) {
                // Load RPG Reactor project
                projectData = JSON.parse(this.fs.readFileSync(projectFilePath, 'utf8'));
                projectData.path = projectPath;
            } else {
                // Check if it's an RPG Maker project
                const rmmzFile = this.path.join(projectPath, 'game.rmmzproject');
                if (this.fs.existsSync(rmmzFile)) {
                    // Import RPG Maker project
                    const engineVersion = this.getEngineVersion();
                    projectData = {
                        name: this.path.basename(projectPath),
                        version: engineVersion,
                        engine: 'RPG Reactor',
                        engineVersion: engineVersion,
                        imported: true,
                        importedFrom: 'RPG Maker MZ',
                        path: projectPath
                    };
                } else {
                    console.error('No valid project file found');
                    return null;
                }
            }

            // Load map list
            const mapInfosPath = this.path.join(projectPath, 'data', 'MapInfos.json');
            if (this.fs.existsSync(mapInfosPath)) {
                projectData.maps = JSON.parse(this.fs.readFileSync(mapInfosPath, 'utf8'));
            }

            return projectData;
        } catch (error) {
            console.error('Error loading project:', error);
            return null;
        }
    }

    async saveProject(projectData) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return false;
        }

        try {
            const projectFilePath = this.path.join(projectData.path, 'project.rpgreactor');
            projectData.modified = new Date().toISOString();

            // Don't save the path in the file
            const { path, maps, ...dataToSave } = projectData;

            this.fs.writeFileSync(projectFilePath, JSON.stringify(dataToSave, null, 2));

            // Save MapInfos.json if maps data exists
            if (maps) {
                this.saveMapInfos(projectData.path, maps);
            }

            console.log('Project saved successfully!');
            return true;
        } catch (error) {
            console.error('Error saving project:', error);
            return false;
        }
    }

    saveMapInfos(projectPath, mapsData) {
        if (!this.fs || !this.path) {
            console.error('File system not available');
            return false;
        }

        try {
            const mapInfosPath = this.path.join(projectPath, 'data', 'MapInfos.json');
            this.fs.writeFileSync(mapInfosPath, JSON.stringify(mapsData, null, 0)); // No formatting for RPG Maker compatibility
            console.log('MapInfos.json saved successfully!');
            return true;
        } catch (error) {
            console.error('Error saving MapInfos.json:', error);
            return false;
        }
    }
}
