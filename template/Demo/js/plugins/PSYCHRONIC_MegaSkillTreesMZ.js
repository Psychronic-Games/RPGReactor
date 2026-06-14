/*:
 * @target MZ
 * @plugindesc v1.0 - Complete Skill Tree System with Visual Builder
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @param builderMode
 * @text Builder Mode Enabled
 * @type boolean
 * @default false
 * @desc Enable tree builder interface (only for development/testing)
 *
 * @param autoOpenBuilder
 * @text Auto-Open Builder
 * @type boolean
 * @default false
 * @desc Automatically open builder in browser when game starts
 *
 * @param openBuilderInSystemBrowser
 * @text Open Builder in System Browser
 * @type boolean
 * @default false
 * @desc Force builder to open in system browser instead of NW.js window (fixes Linux click offset)
 *
 * @param useExpAsKnowledge
 * @text Use EXP as Knowledge Points
 * @type boolean
 * @default false
 * @desc Use actor's total EXP instead of a variable for knowledge points
 *
 * @param expDisplayName
 * @text EXP Display Name
 * @type text
 * @default Experience Points
 * @desc Custom name for EXP when using EXP mode (e.g., "Skill Points", "Training XP")
 *
 * @param knowledgeVariableId
 * @text Knowledge Variable ID
 * @type variable
 * @default 1
 * @desc Variable that stores knowledge points (ignored if Use EXP is enabled)
 *
 * @param knowledgeDisplayName
 * @text Knowledge Display Name
 * @type text
 * @default Knowledge Points
 * @desc Custom name for knowledge variable mode (e.g., "Skill Points", "Ability Points")
 *
 * @param showLevel
 * @text Show Actor Level
 * @type boolean
 * @default true
 * @desc Show actor level in the character info bar
 *
 * @param knowledgeIconIndex
 * @text Knowledge Cost Icon
 * @type number
 * @default 0
 * @desc Icon to display next to knowledge cost on nodes (0 = no icon)
 *
 * @param goldIconIndex
 * @text Gold Cost Icon
 * @type number
 * @default 0
 * @desc Icon to display next to gold cost on nodes (0 = no icon)
 *
 * @param menuCommandName
 * @text Menu Command Name
 * @type text
 * @default Learn Skills
 * @desc Name shown in the main menu
 *
 * @param menuCommandShow
 * @text Show in Menu
 * @type boolean
 * @default true
 * @desc Show "Learn Skills" command in main menu
 *
 * @param classColorIndex
 * @text Class Name Color
 * @type number
 * @default 0
 * @desc Message color code for class name (0-31, use \c[x] colors)
 *
 * @param subclassColorIndex
 * @text Subclass Name Color
 * @type number
 * @default 23
 * @desc Message color code for subclass name (0-31, use \c[x] colors)
 *
 * @param skillTrees
 * @text Skill Trees
 * @type struct<SkillTree>[]
 * @default []
 * @desc Define all available skill trees
 *
 * @param classBasedTrees
 * @text Class-Based Trees
 * @type struct<ClassTreeMapping>[]
 * @default []
 * @desc Automatically assign trees to actors based on their class
 *
 * @command assignTreeToActor
 * @text Assign Tree to Actor
 * @desc Give one or more skill trees to an actor
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc The actor to receive the tree(s)
 *
 * @arg treeIds
 * @text Tree IDs
 * @type text
 * @desc Tree IDs to assign (comma-separated, e.g., "1,3,5" or single "2")
 *
 * @command removeTreeFromActor
 * @text Remove Tree from Actor
 * @desc Remove a skill tree from an actor
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc The actor to remove tree from
 *
 * @arg treeId
 * @text Tree ID
 * @type number
 * @min 1
 * @desc ID of the tree to remove
 *
 * @command grantKnowledge
 * @text Grant Knowledge Points
 * @desc Add knowledge points to the party
 *
 * @arg amount
 * @text Amount
 * @type number
 * @min -999999
 * @max 999999
 * @desc Amount of knowledge to add (negative to subtract)
 *
 * @command resetSkillTree
 * @text Reset Skill Tree
 * @desc Reset all learned skills in a tree for an actor
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc The actor whose tree to reset
 *
 * @arg treeId
 * @text Tree ID
 * @type number
 * @min 1
 * @desc ID of the tree to reset
 *
 * @arg refundKnowledge
 * @text Refund Knowledge
 * @type boolean
 * @default true
 * @desc Refund spent knowledge points
 *
 * @command openSkillTreeScene
 * @text Open Skill Tree Scene
 * @desc Open the skill tree scene for a specific actor
 *
 * @arg actorId
 * @text Actor ID
 * @type actor
 * @desc The actor whose trees to show (0 = current leader)
 * @default 0
 *
 * @command openSkillTreeBuilder
 * @text Open Skill Tree Builder
 * @desc Open the tree builder interface (Builder Mode must be enabled)
 *
 * @help
 * ============================================================================
 * MEGA SKILL TREES MZ - Complete Skill Tree System
 * ============================================================================
 *
 * This plugin provides a complete skill tree system with:
 * - Visual node-based skill trees
 * - Knowledge point system for learning skills
 * - Tree builder interface for easy creation
 * - Multiple trees per character
 * - Prerequisites and skill connections
 *
 * ============================================================================
 * How to Use
 * ============================================================================
 *
 * 1. Set the Knowledge Variable ID in plugin parameters
 * 2. Create skill trees using the builder (enable Builder Mode)
 * 3. Assign trees to actors using plugin commands
 * 4. Grant knowledge points to players
 * 5. Players can access "Learn Skills" from the menu
 *
 * ============================================================================
 * Tree Builder (Development Mode)
 * ============================================================================
 *
 * When Builder Mode is enabled:
 * - Press Shift+PageUp to open the builder from menu or skill tree scene
 * - OR use the plugin command "Open Skill Tree Builder"
 * - Click to place skill nodes
 * - Use TAB to switch between modes (Select/Add/Connect)
 * - Arrow keys to move selected nodes
 * - Press PageDown to export tree data to console
 *
 * ============================================================================
 * Terms of Use
 * ============================================================================
 * Free for commercial and non-commercial use.
 */

/*~struct~SkillTree:
 * @param id
 * @text Tree ID
 * @type number
 * @min 1
 * @desc Unique ID for this skill tree
 *
 * @param name
 * @text Tree Name
 * @type text
 * @desc Display name of the skill tree
 *
 * @param iconIndex
 * @text Icon Index
 * @type number
 * @default 0
 * @desc Icon to display for this tree
 *
 * @param nodes
 * @text Skill Nodes
 * @type struct<SkillNode>[]
 * @default []
 * @desc All nodes in this skill tree
 */

/*~struct~SkillNode:
 * @param id
 * @text Node ID
 * @type number
 * @min 1
 * @desc Unique ID within this tree
 *
 * @param skillId
 * @text Skill ID
 * @type skill
 * @desc The skill learned from this node
 *
 * @param x
 * @text X Position
 * @type number
 * @default 0
 * @desc X coordinate in the tree (pixels)
 *
 * @param y
 * @text Y Position
 * @type number
 * @default 0
 * @desc Y coordinate in the tree (pixels)
 *
 * @param knowledgeCost
 * @text Knowledge Cost
 * @type number
 * @min 0
 * @default 100
 * @desc Knowledge points required to learn
 *
 * @param prerequisites
 * @text Prerequisites
 * @type number[]
 * @desc Node IDs that must be learned first
 * @default []
 *
 * @param connections
 * @text Visual Connections
 * @type number[]
 * @desc Node IDs to draw lines to (for visual tree)
 * @default []
 */

/*~struct~ClassTreeMapping:
 * @param classId
 * @text Class ID
 * @type class
 * @desc The class to assign trees to
 *
 * @param treeIds
 * @text Tree IDs
 * @type text
 * @desc Comma-separated tree IDs (e.g., "3,7,9")
 */

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_MegaSkillTreesMZ';
    const parameters = PluginManager.parameters(pluginName);

    const builderMode = parameters['builderMode'] === 'true';
    const autoOpenBuilder = parameters['autoOpenBuilder'] === 'true';
    const openBuilderInSystemBrowser = parameters['openBuilderInSystemBrowser'] === 'true';
    const useExpAsKnowledge = parameters['useExpAsKnowledge'] === 'true';
    const expDisplayName = parameters['expDisplayName'] || 'Experience Points';
    const knowledgeVariableId = parseInt(parameters['knowledgeVariableId']) || 1;
    const knowledgeDisplayName = parameters['knowledgeDisplayName'] || 'Knowledge Points';
    const showLevel = parameters['showLevel'] !== 'false';
    const knowledgeIconIndex = parseInt(parameters['knowledgeIconIndex']) || 0;
    const goldIconIndex = parseInt(parameters['goldIconIndex']) || 0;
    const menuCommandName = parameters['menuCommandName'] || 'Learn Skills';
    const menuCommandShow = parameters['menuCommandShow'] !== 'false';
    const classColorIndex = parseInt(parameters['classColorIndex']) || 0;
    const subclassColorIndex = parseInt(parameters['subclassColorIndex']) || 23;

    // Parse class-based trees
    let classBasedTreesData = [];
    try {
        const classTreesParam = parameters['classBasedTrees'];
        if (classTreesParam) {
            const parsed = JSON.parse(classTreesParam);
            classBasedTreesData = parsed.map(mapping => {
                const mappingData = JSON.parse(mapping);
                return {
                    classId: parseInt(mappingData.classId) || 0,
                    treeIds: mappingData.treeIds.split(',').map(id => parseInt(id.trim())).filter(id => id > 0)
                };
            });
        }
    } catch (e) {
    }

    // Load skill trees from SkillTrees.json
    let skillTreesData = [];

    function loadSkillTreesData() {
        const fs = require('fs');
        const path = require('path');
        const treesPath = path.join(process.cwd(), 'data', 'SkillTrees.json');

        try {
            if (fs.existsSync(treesPath)) {
                const data = fs.readFileSync(treesPath, 'utf8');
                skillTreesData = JSON.parse(data);
            } else {
                skillTreesData = [];
            }
        } catch (e) {
            console.error('Failed to load SkillTrees.json:', e);
            skillTreesData = [];
        }
    }

    // Load trees on plugin initialization
    loadSkillTreesData();

    //=============================================================================
    // Game_System - Store Learned Skills Data
    //=============================================================================

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._skillTreeData = {};  // actorId => { treeId => [learned node IDs] }
        this._actorTreeAssignments = {};  // actorId => [tree IDs]
    };

    Game_System.prototype.getActorTrees = function(actorId) {
        if (!this._actorTreeAssignments) this._actorTreeAssignments = {};

        // Get actor-specific trees
        const actorTrees = this._actorTreeAssignments[actorId] || [];

        // Get class-based trees
        const actor = $gameActors.actor(actorId);
        const classTrees = [];
        if (actor && actor._classId) {
            for (const mapping of classBasedTreesData) {
                if (mapping.classId === actor._classId) {
                    classTrees.push(...mapping.treeIds);
                }
            }
        }

        // Merge and deduplicate
        const allTrees = [...actorTrees, ...classTrees];
        return [...new Set(allTrees)]; // Remove duplicates
    };

    Game_System.prototype.assignTreeToActor = function(actorId, treeId) {
        if (!this._actorTreeAssignments) this._actorTreeAssignments = {};
        if (!this._actorTreeAssignments[actorId]) {
            this._actorTreeAssignments[actorId] = [];
        }
        if (!this._actorTreeAssignments[actorId].includes(treeId)) {
            this._actorTreeAssignments[actorId].push(treeId);
        }
    };

    Game_System.prototype.removeTreeFromActor = function(actorId, treeId) {
        if (!this._actorTreeAssignments) this._actorTreeAssignments = {};
        if (this._actorTreeAssignments[actorId]) {
            const index = this._actorTreeAssignments[actorId].indexOf(treeId);
            if (index >= 0) {
                this._actorTreeAssignments[actorId].splice(index, 1);
            }
        }
    };

    Game_System.prototype.getLearnedNodes = function(actorId, treeId) {
        if (!this._skillTreeData) this._skillTreeData = {};
        if (!this._skillTreeData[actorId]) this._skillTreeData[actorId] = {};
        return this._skillTreeData[actorId][treeId] || [];
    };

    Game_System.prototype.learnSkillNode = function(actorId, treeId, nodeId) {
        if (!this._skillTreeData) this._skillTreeData = {};
        if (!this._skillTreeData[actorId]) this._skillTreeData[actorId] = {};
        if (!this._skillTreeData[actorId][treeId]) {
            this._skillTreeData[actorId][treeId] = [];
        }
        if (!this._skillTreeData[actorId][treeId].includes(nodeId)) {
            this._skillTreeData[actorId][treeId].push(nodeId);
        }
    };

    Game_System.prototype.isNodeLearned = function(actorId, treeId, nodeId) {
        const learned = this.getLearnedNodes(actorId, treeId);
        return learned.includes(nodeId);
    };

    Game_System.prototype.resetSkillTree = function(actorId, treeId, refund) {
        if (!this._skillTreeData) this._skillTreeData = {};
        if (!this._skillTreeData[actorId]) return;

        if (refund) {
            // Calculate total knowledge spent in this tree
            const tree = skillTreesData.find(t => t.id === treeId);
            if (tree) {
                const learnedNodes = this.getLearnedNodes(actorId, treeId);
                let totalCost = 0;
                for (const nodeId of learnedNodes) {
                    const node = tree.nodes.find(n => n.id === nodeId);
                    if (node) {
                        const costs = node.costs || { knowledge: node.knowledgeCost || 0 };
                        totalCost += costs.knowledge || 0;
                        // Remove the skill from actor
                        const actor = $gameActors.actor(actorId);
                        if (actor) {
                            actor.forgetSkill(node.skillId);
                        }
                    }
                }
                addKnowledge(totalCost, actorId);
            }
        }

        this._skillTreeData[actorId][treeId] = [];
    };

    //=============================================================================
    // Knowledge Point System
    //=============================================================================

    function getKnowledge(actorId = null) {
        if (useExpAsKnowledge && actorId) {
            const actor = $gameActors.actor(actorId);
            return actor ? actor.currentExp() : 0;
        }
        return $gameVariables.value(knowledgeVariableId);
    }

    function setKnowledge(value, actorId = null) {
        if (useExpAsKnowledge && actorId) {
            const actor = $gameActors.actor(actorId);
            if (actor) {
                actor.changeExp(value - actor.currentExp(), false);
            }
        } else {
            $gameVariables.setValue(knowledgeVariableId, value);
        }
    }

    function addKnowledge(amount, actorId = null) {
        if (useExpAsKnowledge && actorId) {
            const actor = $gameActors.actor(actorId);
            if (actor) {
                const beforeExp = actor.currentExp();
                const newTotal = beforeExp + amount; // Calculate new total
                actor.changeExp(newTotal, false); // changeExp expects the NEW TOTAL, not delta
                const afterExp = actor.currentExp();
            }
        } else {
            const before = getKnowledge();
            setKnowledge(getKnowledge() + amount);
            const after = getKnowledge();
        }
    }

    //=============================================================================
    // Plugin Commands
    //=============================================================================

    PluginManager.registerCommand(pluginName, 'assignTreeToActor', args => {
        const actorId = parseInt(args.actorId);
        const treeIdsStr = args.treeIds || args.treeId || ''; // Support both new and old format

        // Parse comma-separated tree IDs
        const treeIds = treeIdsStr.split(',')
            .map(id => parseInt(id.trim()))
            .filter(id => !isNaN(id) && id > 0);

        // Assign each tree to the actor
        for (const treeId of treeIds) {
            $gameSystem.assignTreeToActor(actorId, treeId);
        }
    });

    PluginManager.registerCommand(pluginName, 'removeTreeFromActor', args => {
        const actorId = parseInt(args.actorId);
        const treeId = parseInt(args.treeId);
        $gameSystem.removeTreeFromActor(actorId, treeId);
    });

    PluginManager.registerCommand(pluginName, 'grantKnowledge', args => {
        const amount = parseInt(args.amount);
        addKnowledge(amount);
    });

    PluginManager.registerCommand(pluginName, 'resetSkillTree', args => {
        const actorId = parseInt(args.actorId);
        const treeId = parseInt(args.treeId);
        const refund = args.refundKnowledge === 'true';
        $gameSystem.resetSkillTree(actorId, treeId, refund);
    });

    PluginManager.registerCommand(pluginName, 'openSkillTreeScene', args => {
        const actorId = parseInt(args.actorId) || $gameParty.leader().actorId();
        SceneManager.push(Scene_SkillTree);
        SceneManager.prepareNextScene(actorId);
    });

    PluginManager.registerCommand(pluginName, 'openSkillTreeBuilder', args => {
        if (builderMode) {
            openSkillTreeBuilder();
        } else {
        }
    });

    //=============================================================================
    // Window_MenuCommand - Add "Learn Skills" to Menu
    //=============================================================================

    if (menuCommandShow) {
        const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
        Window_MenuCommand.prototype.addOriginalCommands = function() {
            _Window_MenuCommand_addOriginalCommands.call(this);
            this.addCommand(menuCommandName, 'skillTree', true);
        };

        const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
        Scene_Menu.prototype.createCommandWindow = function() {
            _Scene_Menu_createCommandWindow.call(this);
            this._commandWindow.setHandler('skillTree', this.commandSkillTree.bind(this));
        };

        Scene_Menu.prototype.commandSkillTree = function() {
            SceneManager.push(Scene_SkillTree);
        };
    }

    //=============================================================================
    // Scene_SkillTree - Main Skill Tree Scene
    //=============================================================================

    function Scene_SkillTree() {
        this.initialize(...arguments);
    }

    Scene_SkillTree.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_SkillTree.prototype.constructor = Scene_SkillTree;

    Scene_SkillTree.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._actorId = null;
    };

    Scene_SkillTree.prototype.prepare = function(actorId) {
        this._actorId = actorId || $gameParty.leader().actorId();
    };

    Scene_SkillTree.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);

        if (!this._actorId) {
            this._actorId = $gameParty.leader().actorId();
        }

        this.createCharacterWindow();
        this.createSkillDetailWindow();
        this.createCostsWindow();  // New costs window on right
        this.createTreeListWindow();
        this.createTreeGraphWindow();

        // Show the first tree as preview automatically
        if (this._treeListWindow && this._treeListWindow.maxItems() > 0) {
            const firstTree = this._treeListWindow.currentTree();
            if (firstTree && this._treeGraphWindow) {
                this._treeGraphWindow.setTree(firstTree);
                this._treeGraphWindow.deselect();
            }
        }
    };

    Scene_SkillTree.prototype.createCharacterWindow = function() {
        const rect = this.characterWindowRect();
        this._characterWindow = new Window_SkillTreeCharacter(rect);
        this._characterWindow.setActor(this._actorId);
        this.addWindow(this._characterWindow);
    };

    Scene_SkillTree.prototype.characterWindowRect = function() {
        const ww = Graphics.boxWidth;  // Full width
        const wh = 144;  // Face height
        const wx = 0;
        const wy = 0;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_SkillTree.prototype.calculateTreeListWidth = function() {
        // Calculate optimal width based on tree names
        const actorTreeIds = $gameSystem.getActorTrees(this._actorId);
        const trees = skillTreesData.filter(tree => actorTreeIds.includes(tree.id));

        if (trees.length === 0) return 280; // Default minimum

        // Measure the longest tree name
        const bitmap = new Bitmap(1, 1);
        let maxWidth = 200; // Minimum width

        for (const tree of trees) {
            const textWidth = bitmap.measureTextWidth(tree.name);
            const totalWidth = 48 + textWidth + 48; // Icon + text + padding + completion stats
            maxWidth = Math.max(maxWidth, totalWidth);
        }

        bitmap.destroy();

        // Cap at reasonable limits
        return Math.min(Math.max(maxWidth, 200), 400);
    };

    Scene_SkillTree.prototype.createTreeListWindow = function() {
        const rect = this.treeListWindowRect();
        this._treeListWindow = new Window_SkillTreeList(rect);
        this._treeListWindow.setActor(this._actorId);
        this._treeListWindow.setHandler('ok', this.onTreeOk.bind(this));
        this._treeListWindow.setHandler('cancel', this.popScene.bind(this));
        this._treeListWindow.activate();
        this._treeListWindow.select(0);
        this.addWindow(this._treeListWindow);
    };

    Scene_SkillTree.prototype.treeListWindowRect = function() {
        const ww = this.calculateTreeListWidth();
        const wh = Graphics.boxHeight - 144 - 150;  // Below char window, above detail
        const wx = 0;
        const wy = 144;  // Start after character window
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_SkillTree.prototype.createTreeGraphWindow = function() {
        const rect = this.treeGraphWindowRect();
        this._treeGraphWindow = new Window_SkillTreeGraph(rect);
        this._treeGraphWindow.setActor(this._actorId);
        this._treeGraphWindow.setHandler('ok', this.onNodeOk.bind(this));
        this._treeGraphWindow.setHandler('cancel', this.onNodeCancel.bind(this));
        this._treeGraphWindow.setHelpWindow(this._skillDetailWindow);
        this._treeGraphWindow.setCostsWindow(this._costsWindow);
        this.addWindow(this._treeGraphWindow);
    };

    Scene_SkillTree.prototype.treeGraphWindowRect = function() {
        const listWidth = this.calculateTreeListWidth();
        const costsWidth = 300;
        const ww = Graphics.boxWidth - listWidth - costsWidth;  // Center area
        const wh = Graphics.boxHeight - 144 - 150;  // Below char window, above detail
        const wx = listWidth;
        const wy = 144;  // Start below character window
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_SkillTree.prototype.createCostsWindow = function() {
        const rect = this.costsWindowRect();
        this._costsWindow = new Window_SkillTreeCosts(rect);
        this.addWindow(this._costsWindow);
    };

    Scene_SkillTree.prototype.costsWindowRect = function() {
        const ww = 300;  // Costs panel width
        const wh = Graphics.boxHeight - 144 - 150;  // Same height as graph
        const wx = Graphics.boxWidth - ww;  // Right side
        const wy = 144;  // Below character window
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_SkillTree.prototype.createSkillDetailWindow = function() {
        const rect = this.skillDetailWindowRect();
        this._skillDetailWindow = new Window_SkillTreeDetail(rect);
        this.addWindow(this._skillDetailWindow);
    };

    Scene_SkillTree.prototype.skillDetailWindowRect = function() {
        const ww = Graphics.boxWidth;  // Full width
        const wh = 150;  // Horizontal bar height
        const wx = 0;
        const wy = Graphics.boxHeight - wh;  // Bottom of screen
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_SkillTree.prototype.onTreeOk = function() {
        const tree = this._treeListWindow.currentTree();
        this._treeGraphWindow.setTree(tree);
        this._treeGraphWindow.activate();
        this._treeGraphWindow.select(0);
        this._treeListWindow.deactivate();
    };

    Scene_SkillTree.prototype.onNodeOk = function() {
        const node = this._treeGraphWindow.currentNode();
        const tree = this._treeListWindow.currentTree();

        if (this.canLearnNode(node, tree)) {
            this.learnNode(node, tree);
            this._treeGraphWindow.refresh();
            this._characterWindow.refresh();
            this._skillDetailWindow.refresh();
            this._treeGraphWindow.activate();
            SoundManager.playUseSkill();
        } else {
            SoundManager.playBuzzer();
            this._treeGraphWindow.activate();
        }
    };

    Scene_SkillTree.prototype.onNodeCancel = function() {
        this._treeGraphWindow.deselect();
        this._treeListWindow.activate();
    };

    Scene_SkillTree.prototype.changeActor = function(newActorId) {
        this._actorId = newActorId;
        this._characterWindow.setActor(newActorId);

        // Recalculate and reposition windows based on new actor's tree list width
        const newListWidth = this.calculateTreeListWidth();
        const listRect = this.treeListWindowRect();
        const graphRect = this.treeGraphWindowRect();

        // Update tree list window position/size
        this._treeListWindow.move(listRect.x, listRect.y, listRect.width, listRect.height);
        // Ensure selection is at index 0 after move
        this._treeListWindow.select(0);
        this._treeListWindow.refresh();

        // Update graph window position/size
        this._treeGraphWindow.move(graphRect.x, graphRect.y, graphRect.width, graphRect.height);
        this._treeGraphWindow.setActor(newActorId);

        // Show first tree as preview
        if (this._treeListWindow && this._treeListWindow.maxItems() > 0) {
            const firstTree = this._treeListWindow.currentTree();
            if (firstTree && this._treeGraphWindow) {
                this._treeGraphWindow.setTree(firstTree);
                this._treeGraphWindow.deselect();
            }
        } else {
            // No trees for this actor
            this._treeGraphWindow.setTree(null);
            this._treeGraphWindow.deselect();
        }

        // Clear detail and costs windows since no node is selected
        this._skillDetailWindow.setNode(null, null, newActorId, null);
        this._costsWindow.setNode(null, null, newActorId, null);
    };

    Scene_SkillTree.prototype.canLearnNode = function(node, tree) {
        if (!node || !tree) return false;

        // Check if already learned
        if ($gameSystem.isNodeLearned(this._actorId, tree.id, node.id)) {
            return false;
        }

        // Check costs
        const costs = node.costs || { knowledge: node.knowledgeCost || 0 };

        // Knowledge cost
        if (costs.knowledge && getKnowledge(this._actorId) < costs.knowledge) {
            return false;
        }

        // Gold cost
        if (costs.gold && $gameParty.gold() < costs.gold) {
            return false;
        }

        // Variable cost
        if (costs.variable && costs.variableId) {
            if ($gameVariables.value(costs.variableId) < costs.variable) {
                return false;
            }
        }

        // Switch requirement
        if (costs.switch && costs.switchId) {
            if (!$gameSwitches.value(costs.switchId)) {
                return false;
            }
        }

        // Check prerequisites
        for (const prereqId of node.prerequisites) {
            if (!$gameSystem.isNodeLearned(this._actorId, tree.id, prereqId)) {
                return false;
            }
        }

        return true;
    };

    Scene_SkillTree.prototype.learnNode = function(node, tree) {
        const costs = node.costs || { knowledge: node.knowledgeCost || 0 };

        // Deduct all costs
        if (costs.knowledge && costs.knowledge > 0) {
            const currentKP = getKnowledge(this._actorId);
            addKnowledge(-costs.knowledge, this._actorId);
            const newKP = getKnowledge(this._actorId);
        }

        if (costs.gold) {
            $gameParty.loseGold(costs.gold);
        }

        if (costs.variable && costs.variableId) {
            const currentValue = $gameVariables.value(costs.variableId);
            $gameVariables.setValue(costs.variableId, currentValue - costs.variable);
        }

        // Mark as learned
        $gameSystem.learnSkillNode(this._actorId, tree.id, node.id);

        // Teach the skill to the actor
        const actor = $gameActors.actor(this._actorId);
        if (actor) {
            actor.learnSkill(node.skillId);
        }
    };

    //=============================================================================
    // Window_SkillTreeCharacter - Shows Actor Info and Knowledge Points
    //=============================================================================

    function Window_SkillTreeCharacter() {
        this.initialize(...arguments);
    }

    Window_SkillTreeCharacter.prototype = Object.create(Window_Base.prototype);
    Window_SkillTreeCharacter.prototype.constructor = Window_SkillTreeCharacter;

    Window_SkillTreeCharacter.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._actorId = null;
    };

    Window_SkillTreeCharacter.prototype.setActor = function(actorId) {
        if (this._actorId !== actorId) {
            this._actorId = actorId;
            this.refresh();
        }
    };

    Window_SkillTreeCharacter.prototype.refresh = function() {
        this.contents.clear();
        if (!this._actorId) return;

        const actor = $gameActors.actor(this._actorId);
        if (!actor) return;

        const lineHeight = this.lineHeight();
        const padding = this.itemPadding();

        // Draw actor face on the left
        const faceWidth = 144;
        const faceHeight = 144;
        this.drawActorFace(actor, padding, padding - 12, faceWidth, faceHeight);

        // Info section starts after face
        let x = faceWidth + padding * 3;
        let y = padding;

        // Draw actor name (large)
        this.contents.fontSize = 28;
        this.changeTextColor(ColorManager.hpColor(actor));
        this.drawText(actor.name(), x, y, 300, 'left');
        this.resetTextColor();
        this.contents.fontSize = this.standardFontSize();
        y += 32;

        // Draw class and subclass together
        const className = actor.currentClass().name;
        const classWidth = this.textWidth(className);
        this.changeTextColor(ColorManager.textColor(classColorIndex));
        this.drawText(className, x, y, classWidth);
        this.resetTextColor();

        // Draw subclass if SubclassMZ plugin is active
        if (typeof actor.subclass === 'function' && actor.subclass()) {
            const subClassName = actor.subclass().name;
            this.changeTextColor(ColorManager.textColor(subclassColorIndex));
            this.drawText(subClassName, x + classWidth + 12, y, 200);
            this.resetTextColor();
        }

        // Draw level (optional) - to the right of class/subclass
        if (showLevel) {
            const levelX = x + 450;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText("Lv.", levelX, y, 40);
            this.resetTextColor();
            this.drawText(actor.level, levelX + 40, y, 60);
        }
        y += lineHeight;

        // Draw knowledge/EXP underneath class/subclass
        const knowledge = getKnowledge(this._actorId);
        const labelText = useExpAsKnowledge ? expDisplayName : knowledgeDisplayName;

        // Draw label
        this.changeTextColor(ColorManager.systemColor());
        const labelWidth = this.textWidth(labelText + ": ");
        this.drawText(labelText + ": ", x, y, labelWidth, 'left');

        // Draw value immediately after (same line, larger and gold)
        const valueX = x + labelWidth;
        this.contents.fontSize = 24;
        this.changeTextColor(ColorManager.textColor(17)); // Gold
        this.drawText(knowledge.toString(), valueX, y - 2, 200, 'left');
        this.contents.fontSize = this.standardFontSize();
        this.resetTextColor();
    };

    //=============================================================================
    // Window_SkillTreeList - Horizontal List of Available Trees
    //=============================================================================

    function Window_SkillTreeList() {
        this.initialize(...arguments);
    }

    Window_SkillTreeList.prototype = Object.create(Window_Selectable.prototype);
    Window_SkillTreeList.prototype.constructor = Window_SkillTreeList;

    Window_SkillTreeList.prototype.initialize = function(rect) {
        this._actorId = null;
        this._trees = [];
        this._userNavigated = false; // Track if user has navigated within tree list
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_SkillTreeList.prototype.setActor = function(actorId) {
        if (this._actorId !== actorId) {
            this._actorId = actorId;
            this.loadTrees();
            this.select(0); // Reset selection when changing actors
            this._userNavigated = false; // Reset navigation flag
            this.refresh();
        }
    };

    Window_SkillTreeList.prototype.loadTrees = function() {
        if (!this._actorId) {
            this._trees = [];
            return;
        }

        const actorTreeIds = $gameSystem.getActorTrees(this._actorId);
        this._trees = skillTreesData.filter(tree => actorTreeIds.includes(tree.id));
    };

    Window_SkillTreeList.prototype.maxCols = function() {
        return 1;  // Single column for vertical list
    };

    Window_SkillTreeList.prototype.maxItems = function() {
        return this._trees ? this._trees.length : 0;
    };

    Window_SkillTreeList.prototype.itemWidth = function() {
        return this.innerWidth;
    };

    Window_SkillTreeList.prototype.itemHeight = function() {
        return ImageManager.iconHeight + 4;  // Just icon height + minimal padding
    };

    Window_SkillTreeList.prototype.drawItem = function(index) {
        const tree = this._trees[index];
        if (!tree) return;

        const rect = this.itemRectWithPadding(index);
        const isSelected = index === this.index();

        // Draw selection background
        if (isSelected) {
            this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, ColorManager.dimColor1());
        }

        // Draw icon
        if (tree.iconIndex > 0) {
            this.drawIcon(tree.iconIndex, rect.x + 4, rect.y + 2);
        }

        // Draw tree name
        const textX = rect.x + (tree.iconIndex > 0 ? ImageManager.iconWidth + 12 : 8);
        const textWidth = rect.width - textX + rect.x - 8;

        // Highlight selected tree only when window is active AND user has navigated
        if (isSelected && this.active && this._userNavigated) {
            this.changeTextColor(ColorManager.textColor(17)); // Gold
        }

        this.drawText(tree.name, textX, rect.y + 2, textWidth, 'left');
        this.resetTextColor();
    };

    Window_SkillTreeList.prototype.currentTree = function() {
        return this._trees[this.index()];
    };

    Window_SkillTreeList.prototype.processCursorMove = function() {
        if (this.isCursorMovable()) {
            const lastIndex = this.index();

            // Handle actor cycling with left/right or pageup/pagedown
            if (Input.isRepeated('right') || Input.isRepeated('pagedown')) {
                this.cycleActor(1); // Next actor
                return;
            }
            if (Input.isRepeated('left') || Input.isRepeated('pageup')) {
                this.cycleActor(-1); // Previous actor
                return;
            }

            // Regular cursor movement (up/down)
            Window_Selectable.prototype.processCursorMove.call(this);

            // Update tree preview if cursor moved
            if (this.index() !== lastIndex) {
                this._userNavigated = true; // User has navigated within tree list
                this.updateTreePreview();
            }
        }
    };

    Window_SkillTreeList.prototype.updateTreePreview = function() {
        // Update the graph window to show the currently highlighted tree
        if (SceneManager._scene instanceof Scene_SkillTree) {
            const tree = this.currentTree();
            if (tree && SceneManager._scene._treeGraphWindow) {
                SceneManager._scene._treeGraphWindow.setTree(tree);
                SceneManager._scene._treeGraphWindow.deselect();
            }
        }
    };

    Window_SkillTreeList.prototype.cycleActor = function(direction) {
        const members = $gameParty.members();
        if (members.length <= 1) return;

        let currentIndex = -1;
        for (let i = 0; i < members.length; i++) {
            if (members[i].actorId() === this._actorId) {
                currentIndex = i;
                break;
            }
        }

        if (currentIndex === -1) return;

        // Cycle to next/previous actor that has at least one skill tree
        let attempts = 0;
        let newIndex = currentIndex;
        let newActorId = null;

        while (attempts < members.length) {
            newIndex = (newIndex + direction + members.length) % members.length;
            newActorId = members[newIndex].actorId();

            // Check if this actor has any skill trees
            const actorTreeIds = $gameSystem.getActorTrees(newActorId);
            if (actorTreeIds.length > 0) {
                // Found an actor with trees!
                break;
            }

            attempts++;
        }

        // If we cycled through everyone and nobody has trees, or we're back to the same actor
        if (attempts >= members.length || newActorId === this._actorId) {
            SoundManager.playBuzzer();
            return;
        }

        // Update this window
        this.setActor(newActorId);
        // setActor already calls select(0) and refresh()
        this.activate();

        // Update other windows via scene
        if (SceneManager._scene instanceof Scene_SkillTree) {
            SceneManager._scene.changeActor(newActorId);
        }

        SoundManager.playCursor();
    };

    //=============================================================================
    // Window_SkillTreeGraph - Main Visual Tree Display
    //=============================================================================

    function Window_SkillTreeGraph() {
        this.initialize(...arguments);
    }

    Window_SkillTreeGraph.prototype = Object.create(Window_Selectable.prototype);
    Window_SkillTreeGraph.prototype.constructor = Window_SkillTreeGraph;

    Window_SkillTreeGraph.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._actorId = null;
        this._tree = null;
        this._offsetX = 0;
        this._offsetY = 0;
        this._nodes = [];
        this._dragging = false;
        this._lastTouchX = 0;
        this._lastTouchY = 0;
        this._builderMode = builderMode;
        this._pulseFrame = 0; // For pulsing animation
    };

    Window_SkillTreeGraph.prototype.setActor = function(actorId) {
        if (this._actorId !== actorId) {
            this._actorId = actorId;
            // Refresh to show the correct learned status for this actor
            this.refresh();
        }
    };

    Window_SkillTreeGraph.prototype.setTree = function(tree) {
        if (this._tree !== tree) {
            this._tree = tree;
            this._nodes = tree ? tree.nodes : [];
            this.centerTree();
            this.refresh();
        }
    };

    Window_SkillTreeGraph.prototype.centerTree = function() {
        if (!this._tree || this._nodes.length === 0) {
            this._offsetX = 0;
            this._offsetY = 0;
            return;
        }

        // Find bounds of all nodes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const node of this._nodes) {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
        }

        const treeWidth = maxX - minX + 100;  // Add node size
        const treeHeight = maxY - minY + 100;

        // Center in window
        this._offsetX = Math.floor((this.innerWidth - treeWidth) / 2) - minX + 50;
        this._offsetY = Math.floor((this.innerHeight - treeHeight) / 2) - minY + 50;
    };

    Window_SkillTreeGraph.prototype.maxItems = function() {
        return this._nodes.length;
    };

    Window_SkillTreeGraph.prototype.itemHeight = function() {
        return 80;  // Node size
    };

    // Disable default cursor rectangle drawing
    Window_SkillTreeGraph.prototype.drawItemBackground = function(index) {
        // Don't draw background - we handle selection visually in drawNode
    };

    Window_SkillTreeGraph.prototype.drawBackgroundRect = function(rect) {
        // Don't draw background rectangles
    };

    Window_SkillTreeGraph.prototype.itemRect = function(index) {
        // Return empty rect to prevent cursor drawing
        return new Rectangle(0, 0, 0, 0);
    };

    Window_SkillTreeGraph.prototype.itemRectWithPadding = function(index) {
        // Return empty rect to prevent cursor drawing
        return new Rectangle(0, 0, 0, 0);
    };

    Window_SkillTreeGraph.prototype.currentNode = function() {
        return this._nodes[this.index()];
    };

    Window_SkillTreeGraph.prototype.update = function() {
        Window_Selectable.prototype.update.call(this);
        this.updateDragging();
        this.updateKeyboardScroll();
        this.updatePulseAnimation();
    };

    Window_SkillTreeGraph.prototype.updatePulseAnimation = function() {
        this._pulseFrame++;
        if (this._pulseFrame >= 40) { // Faster cycle (40 frames instead of 60)
            this._pulseFrame = 0;
        }
        // Refresh to show animation (only if something is selected)
        if (this.index() >= 0) {
            this.refresh();
        }
    };

    Window_SkillTreeGraph.prototype.updateDragging = function() {
        if (TouchInput.isPressed()) {
            const x = TouchInput.x - this.x;
            const y = TouchInput.y - this.y;

            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
                if (!this._dragging) {
                    this._dragging = true;
                    this._lastTouchX = TouchInput.x;
                    this._lastTouchY = TouchInput.y;
                } else {
                    const dx = TouchInput.x - this._lastTouchX;
                    const dy = TouchInput.y - this._lastTouchY;
                    this._offsetX += dx;
                    this._offsetY += dy;
                    this._lastTouchX = TouchInput.x;
                    this._lastTouchY = TouchInput.y;
                    this.refresh();
                }
            }
        } else {
            this._dragging = false;
        }
    };

    Window_SkillTreeGraph.prototype.updateKeyboardScroll = function() {
        // Scroll with shift key, otherwise move cursor spatially
        if (this.active && Input.isPressed('shift')) {
            const scrollSpeed = 8;
            if (Input.isPressed('up')) {
                this._offsetY += scrollSpeed;
                this.refresh();
            }
            if (Input.isPressed('down')) {
                this._offsetY -= scrollSpeed;
                this.refresh();
            }
            if (Input.isPressed('left')) {
                this._offsetX += scrollSpeed;
                this.refresh();
            }
            if (Input.isPressed('right')) {
                this._offsetX -= scrollSpeed;
                this.refresh();
            }
        }
    };

    // Override cursor movement for spatial selection
    Window_SkillTreeGraph.prototype.cursorDown = function(wrap) {
        this.selectNearestNode(0, 1); // Down
    };

    Window_SkillTreeGraph.prototype.cursorUp = function(wrap) {
        this.selectNearestNode(0, -1); // Up
    };

    Window_SkillTreeGraph.prototype.cursorRight = function(wrap) {
        this.selectNearestNode(1, 0); // Right
    };

    Window_SkillTreeGraph.prototype.cursorLeft = function(wrap) {
        this.selectNearestNode(-1, 0); // Left
    };

    Window_SkillTreeGraph.prototype.selectNearestNode = function(dx, dy) {
        if (!this._tree || !this._tree.nodes || this._tree.nodes.length === 0) return;

        const currentNode = this._tree.nodes[this._index];
        if (!currentNode) return;

        let nearest = null;
        let nearestIndex = -1;
        let minDistance = Infinity;

        for (let i = 0; i < this._tree.nodes.length; i++) {
            if (i === this._index) continue;

            const node = this._tree.nodes[i];
            const diffX = node.x - currentNode.x;
            const diffY = node.y - currentNode.y;

            // Check if node is in the desired direction
            if (dx > 0 && diffX <= 0) continue; // Looking right, but node is left/same
            if (dx < 0 && diffX >= 0) continue; // Looking left, but node is right/same
            if (dy > 0 && diffY <= 0) continue; // Looking down, but node is up/same
            if (dy < 0 && diffY >= 0) continue; // Looking up, but node is down/same

            // Calculate distance with directional weighting
            let distance;
            if (dx !== 0) {
                // Horizontal movement - weight X distance more
                distance = Math.abs(diffX) + Math.abs(diffY) * 2;
            } else {
                // Vertical movement - weight Y distance more
                distance = Math.abs(diffX) * 2 + Math.abs(diffY);
            }

            if (distance < minDistance) {
                minDistance = distance;
                nearest = node;
                nearestIndex = i;
            }
        }

        if (nearestIndex >= 0) {
            this.select(nearestIndex);
            this.ensureNodeVisible(nearest);
            SoundManager.playCursor();
        }
    };

    Window_SkillTreeGraph.prototype.ensureNodeVisible = function(node) {
        if (!node) return;

        const nodeX = node.x + this._offsetX;
        const nodeY = node.y + this._offsetY;
        const margin = 100;
        const nodeSize = 60;

        // Adjust offset to keep node visible
        if (nodeX < margin) {
            this._offsetX += (margin - nodeX);
        } else if (nodeX + nodeSize > this.innerWidth - margin) {
            this._offsetX -= (nodeX + nodeSize - (this.innerWidth - margin));
        }

        if (nodeY < margin) {
            this._offsetY += (margin - nodeY);
        } else if (nodeY + nodeSize > this.innerHeight - margin) {
            this._offsetY -= (nodeY + nodeSize - (this.innerHeight - margin));
        }

        this.refresh();
    };

    Window_SkillTreeGraph.prototype.paint = function() {
        Window_Selectable.prototype.paint.call(this);
        this.drawTree();
    };

    Window_SkillTreeGraph.prototype.drawTree = function() {
        if (!this._tree) return;

        const ctx = this.contents.context;

        // Draw connections first (behind nodes)
        for (const node of this._nodes) {
            this.drawNodeConnections(node);
        }

        // Draw nodes
        for (let i = 0; i < this._nodes.length; i++) {
            this.drawNode(this._nodes[i], i === this.index());
        }
    };

    Window_SkillTreeGraph.prototype.drawNodeConnections = function(node) {
        if (!node.connections || node.connections.length === 0) return;

        const nodeX = node.x + this._offsetX;
        const nodeY = node.y + this._offsetY;
        const iconSize = ImageManager.iconWidth; // 32x32

        // Center of the source icon
        const startX = nodeX + iconSize / 2;
        const startY = nodeY + iconSize / 2;

        for (const targetId of node.connections) {
            const targetNode = this._nodes.find(n => n.id === targetId);
            if (!targetNode) continue;

            const targetNodeX = targetNode.x + this._offsetX;
            const targetNodeY = targetNode.y + this._offsetY;

            // Center of the target icon
            const targetCenterX = targetNodeX + iconSize / 2;
            const targetCenterY = targetNodeY + iconSize / 2;

            const ctx = this.contents.context;
            ctx.save();

            // Calculate angle and distance
            const angle = Math.atan2(targetCenterY - startY, targetCenterX - startX);
            const distance = Math.sqrt(
                Math.pow(targetCenterX - startX, 2) +
                Math.pow(targetCenterY - startY, 2)
            );

            // Arrow settings
            const arrowSize = 14; // Longer arrow for pointier look
            const arrowWidth = Math.PI / 8; // Narrower angle for sharper point

            // Arrowhead tip position (stop before reaching the icon edge)
            const arrowTipDistance = distance - (iconSize / 2) - 7; // Stop 7px before icon edge
            const arrowTipX = startX + arrowTipDistance * Math.cos(angle);
            const arrowTipY = startY + arrowTipDistance * Math.sin(angle);

            // Calculate arrowhead base points
            const arrowBase1X = arrowTipX - arrowSize * Math.cos(angle - arrowWidth);
            const arrowBase1Y = arrowTipY - arrowSize * Math.sin(angle - arrowWidth);
            const arrowBase2X = arrowTipX - arrowSize * Math.cos(angle + arrowWidth);
            const arrowBase2Y = arrowTipY - arrowSize * Math.sin(angle + arrowWidth);

            // Calculate center of arrow base
            const arrowBaseCenterX = (arrowBase1X + arrowBase2X) / 2;
            const arrowBaseCenterY = (arrowBase1Y + arrowBase2Y) / 2;

            // Draw WHITE OUTLINE LAYER (thicker)
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 9; // Increased from 7
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.fillStyle = '#ffffff';

            // Draw line to arrow base
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(arrowBaseCenterX, arrowBaseCenterY);
            ctx.stroke();

            // Draw white arrow triangle with stroke AND fill for consistent border
            ctx.lineWidth = 9; // Same as line
            ctx.beginPath();
            ctx.moveTo(arrowTipX, arrowTipY);
            ctx.lineTo(arrowBase1X, arrowBase1Y);
            ctx.lineTo(arrowBase2X, arrowBase2Y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke(); // Add stroke to match line thickness

            // Draw BLACK CORE LAYER (thicker)
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 6; // Increased from 5 for thicker black core
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.fillStyle = '#000000';

            // Draw line to arrow base
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(arrowBaseCenterX, arrowBaseCenterY);
            ctx.stroke();

            // Draw black arrow triangle with stroke AND fill for consistent border
            ctx.lineWidth = 6; // Same as line
            ctx.beginPath();
            ctx.moveTo(arrowTipX, arrowTipY);
            ctx.lineTo(arrowBase1X, arrowBase1Y);
            ctx.lineTo(arrowBase2X, arrowBase2Y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke(); // Add stroke to match line thickness

            ctx.restore();
        }
    };

    Window_SkillTreeGraph.prototype.drawNode = function(node, selected) {
        const nodeX = node.x + this._offsetX;
        const nodeY = node.y + this._offsetY;
        const iconSize = ImageManager.iconWidth; // 32x32

        const skill = $dataSkills[node.skillId];
        if (!skill) return;

        const isLearned = $gameSystem.isNodeLearned(this._actorId, this._tree.id, node.id);
        const canLearn = this.canLearnNode(node);

        const ctx = this.contents.context;

        // Draw skill icon
        if (skill.iconIndex > 0) {
            this.drawIcon(skill.iconIndex, nodeX, nodeY);

            // Draw colored overlay on icon based on status
            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            ctx.globalAlpha = 0.4; // Semi-transparent overlay

            if (isLearned) {
                ctx.fillStyle = '#44ff44'; // Bright green
            } else if (canLearn) {
                ctx.fillStyle = '#4488ff'; // Blue
            } else {
                ctx.fillStyle = '#888888'; // Gray
            }
            ctx.fillRect(nodeX, nodeY, iconSize, iconSize);
            ctx.restore();

            // Draw border around icon
            ctx.save();
            if (selected) {
                // Pulsing yellow border for selected node
                const pulseValue = Math.sin(this._pulseFrame * Math.PI / 20); // Faster oscillation (40 frame cycle / 2)
                const alpha = 0.7 + (pulseValue * 0.3); // Oscillates between 0.4 and 1.0
                const lineWidth = 3 + (pulseValue * 0.2); // Smaller variation: 2.8 to 3.2

                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#ffff00'; // Yellow
                ctx.lineWidth = lineWidth;
                ctx.strokeRect(nodeX, nodeY, iconSize, iconSize);

                // Add outer glow effect
                ctx.globalAlpha = alpha * 0.5;
                ctx.lineWidth = lineWidth + 2;
                ctx.strokeRect(nodeX - 1, nodeY - 1, iconSize + 2, iconSize + 2);
            } else if (isLearned) {
                ctx.strokeStyle = '#44ff44'; // Green
                ctx.lineWidth = 2;
                ctx.strokeRect(nodeX, nodeY, iconSize, iconSize);
            } else if (canLearn) {
                ctx.strokeStyle = '#4488ff'; // Blue
                ctx.lineWidth = 2;
                ctx.strokeRect(nodeX, nodeY, iconSize, iconSize);
            } else {
                ctx.strokeStyle = '#666666'; // Dark gray
                ctx.lineWidth = 2;
                ctx.strokeRect(nodeX, nodeY, iconSize, iconSize);
            }
            ctx.restore();
        }

        // Draw costs below icon with optional cost icons
        const costs = node.costs || { knowledge: node.knowledgeCost || 0 };
        let costY = nodeY + iconSize + 4; // More spacing after icon
        this.contents.fontSize = 14;

        // Knowledge cost with icon
        if (costs.knowledge > 0) {
            let costX = nodeX + iconSize/2;

            // Draw small 16x16 icon if configured
            if (knowledgeIconIndex > 0) {
                this.drawSmallIcon(knowledgeIconIndex, costX - 20, costY);
                costX += 2; // Small offset after icon
            } else {
                costX -= this.textWidth(costs.knowledge.toString()) / 2;
            }

            this.changeTextColor(ColorManager.textColor(17));
            this.drawText(costs.knowledge.toString(), costX, costY, 50, 'left');
            this.resetTextColor();
            costY += 14;
        }

        // Gold cost with icon
        if (costs.gold > 0) {
            let costX = nodeX + iconSize/2;

            // Draw small 16x16 icon if configured
            if (goldIconIndex > 0) {
                this.drawSmallIcon(goldIconIndex, costX - 20, costY);
                costX += 2;
            } else {
                costX -= this.textWidth(costs.gold.toString()) / 2;
            }

            this.changeTextColor(ColorManager.textColor(14));
            this.drawText(costs.gold.toString(), costX, costY, 50, 'left');
            this.resetTextColor();
            costY += 14;
        }

        this.contents.fontSize = this.standardFontSize();
    };

    // Draw a smaller 16x16 icon (half size of normal 32x32)
    Window_SkillTreeGraph.prototype.drawSmallIcon = function(iconIndex, x, y) {
        const bitmap = ImageManager.loadSystem('IconSet');
        const pw = ImageManager.iconWidth;
        const ph = ImageManager.iconHeight;
        const sx = (iconIndex % 16) * pw;
        const sy = Math.floor(iconIndex / 16) * ph;
        const dw = 16; // Destination width (half size)
        const dh = 16; // Destination height (half size)
        this.contents.blt(bitmap, sx, sy, pw, ph, x, y, dw, dh);
    };

    Window_SkillTreeGraph.prototype.canLearnNode = function(node) {
        if (!this._actorId || !this._tree) return false;

        // Check if already learned
        if ($gameSystem.isNodeLearned(this._actorId, this._tree.id, node.id)) {
            return false;
        }

        // Check knowledge cost
        const costs = node.costs || { knowledge: node.knowledgeCost || 0 };
        if (costs.knowledge && getKnowledge(this._actorId) < costs.knowledge) {
            return false;
        }

        // Check prerequisites
        for (const prereqId of node.prerequisites) {
            if (!$gameSystem.isNodeLearned(this._actorId, this._tree.id, prereqId)) {
                return false;
            }
        }

        return true;
    };

    Window_SkillTreeGraph.prototype.processTouch = function() {
        if (this.isOpenAndActive()) {
            if (TouchInput.isTriggered() && this.isTouchedInsideFrame()) {
                this.onTouchSelect();
            }
        }
    };

    Window_SkillTreeGraph.prototype.onTouchSelect = function() {
        // Convert touch coordinates to local window coordinates
        const x = TouchInput.x - this.x - this.padding;
        const y = TouchInput.y - this.y - this.padding;
        const nodeIndex = this.hitTest(x, y);

        if (nodeIndex >= 0) {
            this.select(nodeIndex);
            this.updateInputData();
            if (TouchInput.isTriggered()) {
                this.processOk();
            }
        }
    };

    Window_SkillTreeGraph.prototype.hitTest = function(x, y) {
        const nodeSize = 60;
        for (let i = 0; i < this._nodes.length; i++) {
            const node = this._nodes[i];
            const nodeX = node.x + this._offsetX;
            const nodeY = node.y + this._offsetY;

            if (x >= nodeX && x < nodeX + nodeSize && y >= nodeY && y < nodeY + nodeSize) {
                return i;
            }
        }
        return -1;
    };

    Window_SkillTreeGraph.prototype.setCostsWindow = function(costsWindow) {
        this._costsWindow = costsWindow;
    };

    Window_SkillTreeGraph.prototype.updateHelp = function() {
        const node = this.currentNode();
        if (node) {
            const skill = $dataSkills[node.skillId];

            // Update detail window (bottom bar)
            if (this._helpWindow) {
                this._helpWindow.setNode(node, this._tree, this._actorId, skill);
            }

            // Update costs window (right panel)
            if (this._costsWindow) {
                this._costsWindow.setNode(node, this._tree, this._actorId, skill);
            }
        }
    };

    //=============================================================================
    // Window_SkillTreeDetail - Shows Detailed Skill Information
    //=============================================================================

    function Window_SkillTreeDetail() {
        this.initialize(...arguments);
    }

    Window_SkillTreeDetail.prototype = Object.create(Window_Base.prototype);
    Window_SkillTreeDetail.prototype.constructor = Window_SkillTreeDetail;

    Window_SkillTreeDetail.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._node = null;
        this._tree = null;
        this._actorId = null;
        this._skill = null;
    };

    Window_SkillTreeDetail.prototype.setNode = function(node, tree, actorId, skill) {
        this._node = node;
        this._tree = tree;
        this._actorId = actorId;
        this._skill = skill;
        this.refresh();
    };

    Window_SkillTreeDetail.prototype.refresh = function() {
        this.contents.clear();

        if (!this._node || !this._skill) {
            const y = (this.innerHeight - this.lineHeight()) / 2;
            this.changeTextColor(ColorManager.dimColor1());
            this.drawText("Select a skill node to view details...", 0, y, this.innerWidth, 'center');
            this.resetTextColor();
            return;
        }

        const padding = this.itemPadding();
        let x = padding;
        let y = padding;

        // Description only (skill name is already shown in the costs window on the right)
        const descText = this._skill.description || "No description available.";
        const descY = y;
        const descX = padding;

        this.resetTextColor();
        this.contents.fontSize = 18;
        this.drawTextEx(descText, descX, descY, this.innerWidth - padding * 2);
        this.contents.fontSize = this.standardFontSize();
    };

    //=============================================================================
    // Window_SkillTreeCosts - Costs Panel on Right Side
    //=============================================================================

    function Window_SkillTreeCosts() {
        this.initialize(...arguments);
    }

    Window_SkillTreeCosts.prototype = Object.create(Window_Base.prototype);
    Window_SkillTreeCosts.prototype.constructor = Window_SkillTreeCosts;

    Window_SkillTreeCosts.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._node = null;
        this._tree = null;
        this._actorId = null;
        this._skill = null;
    };

    Window_SkillTreeCosts.prototype.setNode = function(node, tree, actorId, skill) {
        this._node = node;
        this._tree = tree;
        this._actorId = actorId;
        this._skill = skill;
        this.refresh();
    };

    Window_SkillTreeCosts.prototype.refresh = function() {
        this.contents.clear();

        if (!this._node || !this._skill) {
            const y = (this.innerHeight - this.lineHeight()) / 2;
            this.changeTextColor(ColorManager.dimColor1());
            this.drawText("Select a skill", 0, y, this.innerWidth, 'center');
            this.resetTextColor();
            return;
        }

        const lineHeight = this.lineHeight();
        const padding = this.itemPadding();
        let y = padding;

        // Draw skill icon and name at the top
        let x = padding;
        if (this._skill.iconIndex > 0) {
            this.drawIcon(this._skill.iconIndex, x, y);
            x += ImageManager.iconWidth + 8;
        }

        // Skill name (large, prominent)
        this.contents.fontSize = 22;
        this.changeTextColor(ColorManager.textColor(17));
        this.drawText(this._skill.name, x, y + 4, this.innerWidth - x - padding);
        this.resetTextColor();
        this.contents.fontSize = this.standardFontSize();
        y += ImageManager.iconHeight + 8;

        // Separator
        this.contents.fillRect(padding, y, this.innerWidth - padding * 2, 2, ColorManager.dimColor1());
        y += 8;

        const costs = this._node.costs || { knowledge: this._node.knowledgeCost || 0 };
        const labelWidth = 120;
        const valueWidth = this.innerWidth - padding * 2 - labelWidth - 10;

        // Knowledge/EXP cost
        if (costs.knowledge > 0) {
            const labelText = useExpAsKnowledge ? expDisplayName : knowledgeDisplayName;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(labelText + ":", padding, y, labelWidth);
            this.changeTextColor(ColorManager.textColor(17));
            this.drawText(costs.knowledge.toString(), padding + labelWidth, y, valueWidth, 'right');
            this.resetTextColor();
            y += lineHeight;
        }

        // Gold cost
        if (costs.gold > 0) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText("Gold:", padding, y, labelWidth);
            this.changeTextColor(ColorManager.textColor(14));
            this.drawText(costs.gold.toString(), padding + labelWidth, y, valueWidth, 'right');
            this.resetTextColor();
            y += lineHeight;
        }

        // Variable cost
        if (costs.variable > 0 && costs.variableId > 0) {
            const varName = $dataSystem.variables[costs.variableId] || `Var ${costs.variableId}`;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(varName + ":", padding, y, labelWidth);
            this.changeTextColor(ColorManager.textColor(3));
            this.drawText(costs.variable.toString(), padding + labelWidth, y, valueWidth, 'right');
            this.resetTextColor();
            y += lineHeight;
        }

        // Switch requirement
        if (costs.switch && costs.switchId > 0) {
            const switchName = $dataSystem.switches[costs.switchId] || `Switch ${costs.switchId}`;
            this.changeTextColor(ColorManager.systemColor());
            this.contents.fontSize = 16;
            this.drawText("Requires:", padding, y, labelWidth);
            this.resetTextColor();
            this.contents.fontSize = 14;
            this.changeTextColor(ColorManager.textColor(18));
            this.drawText(switchName, padding, y + lineHeight, this.innerWidth - padding * 2);
            this.contents.fontSize = this.standardFontSize();
            this.resetTextColor();
            y += lineHeight * 2;
        }

        // Spacing before status
        y += 8;

        // Status label
        this.resetTextColor(); // Default white
        this.contents.fontSize = 18;
        this.drawText("Skill Status:", padding, y, this.innerWidth - padding * 2, 'center');
        this.contents.fontSize = this.standardFontSize();
        y += lineHeight;

        // Status value
        const isLearned = $gameSystem.isNodeLearned(this._actorId, this._tree.id, this._node.id);

        if (isLearned) {
            this.changeTextColor(ColorManager.textColor(3)); // Green
            this.contents.fontSize = 18;
            this.drawText("✓ LEARNED", padding, y, this.innerWidth - padding * 2, 'center');
            this.contents.fontSize = this.standardFontSize();
            this.resetTextColor();
            y += lineHeight + 8;
        } else {
            const canLearn = this.canLearnNode(this._node);
            if (canLearn) {
                this.changeTextColor(ColorManager.textColor(1)); // Blue
                this.contents.fontSize = 18;
                this.drawText("AVAILABLE", padding, y, this.innerWidth - padding * 2, 'center');
                this.contents.fontSize = this.standardFontSize();
                this.resetTextColor();
                y += lineHeight + 8;
            } else {
                this.changeTextColor(ColorManager.textColor(2)); // Red
                this.contents.fontSize = 18;
                this.drawText("LOCKED", padding, y, this.innerWidth - padding * 2, 'center');
                this.contents.fontSize = this.standardFontSize();
                this.resetTextColor();
                y += lineHeight + 4;

                // Show why it's locked
                const reasons = this.getLockedReasons(this._node);
                if (reasons.length > 0) {
                    this.contents.fontSize = 14; // Increased from 10 for better readability
                    this.changeTextColor(ColorManager.textColor(18)); // Light yellow/orange
                    for (const reason of reasons) {
                        this.drawText(reason, padding, y, this.innerWidth - padding * 2, 'center');
                        y += this.lineHeight() - 2; // Adjusted spacing
                    }
                    this.resetTextColor();
                    this.contents.fontSize = this.standardFontSize();
                }
                y += 8;
            }
        }

        // Prerequisites
        if (this._node.prerequisites && this._node.prerequisites.length > 0) {
            this.contents.fillRect(padding, y, this.innerWidth - padding * 2, 1, ColorManager.dimColor1());
            y += 8;

            this.changeTextColor(ColorManager.systemColor());
            this.contents.fontSize = 18; // Increased from 16 for better visibility
            this.drawText("Prerequisites", padding, y, this.innerWidth - padding * 2, 'center');
            this.resetTextColor();
            this.contents.fontSize = this.standardFontSize();
            y += lineHeight + 4;

            for (const prereqId of this._node.prerequisites) {
                const prereqNode = this._tree.nodes.find(n => n.id === prereqId);
                if (prereqNode) {
                    const prereqSkill = $dataSkills[prereqNode.skillId];
                    if (prereqSkill) {
                        const prereqLearned = $gameSystem.isNodeLearned(this._actorId, this._tree.id, prereqId);

                        // Draw small icon
                        if (prereqSkill.iconIndex > 0) {
                            this.drawIcon(prereqSkill.iconIndex, padding, y - 2);
                        }

                        // Draw prerequisite name with status
                        if (prereqLearned) {
                            this.changeTextColor(ColorManager.textColor(3)); // Green
                        } else {
                            this.changeTextColor(ColorManager.textColor(2)); // Red
                        }
                        this.contents.fontSize = 14;
                        const textX = padding + (prereqSkill.iconIndex > 0 ? 38 : 0);
                        this.drawText(prereqSkill.name, textX, y, this.innerWidth - padding * 2 - 38);
                        this.contents.fontSize = this.standardFontSize();
                        this.resetTextColor();
                        y += lineHeight;
                    }
                }
            }
        }
    };

    Window_SkillTreeCosts.prototype.canLearnNode = function(node) {
        if (!this._actorId || !this._tree) return false;

        if ($gameSystem.isNodeLearned(this._actorId, this._tree.id, node.id)) {
            return false;
        }

        const costs = node.costs || { knowledge: node.knowledgeCost || 0 };
        if (costs.knowledge && getKnowledge(this._actorId) < costs.knowledge) {
            return false;
        }

        for (const prereqId of node.prerequisites) {
            if (!$gameSystem.isNodeLearned(this._actorId, this._tree.id, prereqId)) {
                return false;
            }
        }

        return true;
    };

    Window_SkillTreeCosts.prototype.getLockedReasons = function(node) {
        const reasons = [];
        if (!this._actorId || !this._tree) return reasons;

        const costs = node.costs || { knowledge: node.knowledgeCost || 0 };

        // Check knowledge/exp
        if (costs.knowledge > 0) {
            const current = getKnowledge(this._actorId);
            if (current < costs.knowledge) {
                const label = useExpAsKnowledge ? expDisplayName : knowledgeDisplayName;
                reasons.push(`Not enough ${label} (${current}/${costs.knowledge})`);
            }
        }

        // Check gold
        if (costs.gold > 0) {
            const current = $gameParty.gold();
            if (current < costs.gold) {
                reasons.push(`Not enough Gold (${current}/${costs.gold})`);
            }
        }

        // Check variable
        if (costs.variable > 0 && costs.variableId > 0) {
            const current = $gameVariables.value(costs.variableId);
            const varName = $dataSystem.variables[costs.variableId] || `Var ${costs.variableId}`;
            if (current < costs.variable) {
                reasons.push(`Not enough ${varName} (${current}/${costs.variable})`);
            }
        }

        // Check switch
        if (costs.switch && costs.switchId > 0) {
            if (!$gameSwitches.value(costs.switchId)) {
                const switchName = $dataSystem.switches[costs.switchId] || `Switch ${costs.switchId}`;
                reasons.push(`Requires: ${switchName}`);
            }
        }

        // Check prerequisites - just indicate they exist, details shown below
        let hasUnmetPrereqs = false;
        for (const prereqId of node.prerequisites) {
            if (!$gameSystem.isNodeLearned(this._actorId, this._tree.id, prereqId)) {
                hasUnmetPrereqs = true;
                break;
            }
        }

        if (hasUnmetPrereqs) {
            reasons.push("Prerequisites not met");
        }

        return reasons;
    };

    //=============================================================================
    // Scene_SkillTreeBuilder - Builder Mode for Creating Trees
    //=============================================================================

    // Helper function to open builder
    function openSkillTreeBuilder() {

        if (typeof nw !== 'undefined') {
            // NW.js (RPG Maker MZ playtest mode)
            const path = require('path');
            const fs = require('fs');
            const builderPath = path.join(process.cwd(), 'SkillTreeBuilder.html');
            const projectRoot = process.cwd();


            // Load all the data files HERE in the parent window
            let gameData = {
                skills: null,
                system: null,
                trees: null,
                projectRoot: projectRoot
            };

            // Load Skills.json
            try {
                const skillsPath = path.join(projectRoot, 'data', 'Skills.json');
                gameData.skills = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
            } catch (e) {
                console.error('❌ Failed to load Skills.json:', e.message);
            }

            // Load System.json
            try {
                const systemPath = path.join(projectRoot, 'data', 'System.json');
                gameData.system = JSON.parse(fs.readFileSync(systemPath, 'utf8'));
            } catch (e) {
            }

            // Load SkillTrees.json
            try {
                const treesPath = path.join(projectRoot, 'data', 'SkillTrees.json');
                gameData.trees = JSON.parse(fs.readFileSync(treesPath, 'utf8'));
            } catch (e) {
            }

            // Convert to file:// URL for NW.js
            const fileUrl = 'file://' + builderPath;

            // Open in NW.js window
            nw.Window.open(fileUrl, {
                width: 1600,
                height: 900,
                title: 'PSYCHRONIC Skill Tree Builder',
                icon: 'icon/icon.png',
                frame: true,
                show: false,
                focus: true
            }, function(newWin) {

                // Pass the data AND Node.js functions to the child window
                newWin.on('loaded', function() {

                    try {
                        // Inject the preloaded data
                        newWin.window.PRELOADED_GAME_DATA = gameData;

                        // Inject Node.js functions for saving
                        newWin.window.NODE_SAVE_FILE = function(filename, content) {
                            try {
                                const savePath = path.join(projectRoot, 'data', filename);
                                fs.writeFileSync(savePath, content, 'utf8');
                                return { success: true, path: savePath };
                            } catch (error) {
                                console.error('❌ Save error:', error);
                                return { success: false, error: error.message };
                            }
                        };


                        // Verify injection

                        // Enter fullscreen to avoid title bar offset issues
                        newWin.show();
                        // TEMPORARILY DISABLED: Testing if fullscreen causes the ERR_FILE_NOT_FOUND issue
                        // newWin.enterFullscreen();
                        // console.log('🖥️ Builder entered fullscreen mode');
                    } catch (error) {
                        console.error('❌ Error during injection:', error);
                    }
                });

                // Also try listening to document-end event as backup
                newWin.on('document-end', function() {
                });
            });
        } else if (typeof require !== 'undefined') {
            // Electron or other Node.js environment
            const { shell } = require('electron');
            shell.openExternal('http://localhost:8000/SkillTreeBuilder.html');
        } else {
            // Browser fallback
            window.open('SkillTreeBuilder.html', 'SkillTreeBuilder', 'width=1600,height=900');
        }
    }

    //=============================================================================
    // Override EXP Display Name in Default Menus
    //=============================================================================

    if (useExpAsKnowledge) {
        // Override TextManager to replace EXP terminology
        const _TextManager_basic = TextManager.basic;
        TextManager.basic = function(basicId) {
            const original = _TextManager_basic.call(this, basicId);
            // basicId 8 is "EXP" and 9 is "EXP A" (EXP abbreviation)
            if (basicId === 8 || basicId === 9) {
                return expDisplayName;
            }
            return original;
        };

        // Override exp-related term displays
        Object.defineProperty(TextManager, 'exp', {
            get: function() {
                return expDisplayName;
            },
            configurable: true
        });

        Object.defineProperty(TextManager, 'expA', {
            get: function() {
                return expDisplayName;
            },
            configurable: true
        });
    }

    // Auto-open builder at game start
    if (builderMode && autoOpenBuilder) {
        const _Scene_Boot_start = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function() {
            _Scene_Boot_start.call(this);
            // Open builder after a short delay to ensure game is ready
            setTimeout(() => {
                openSkillTreeBuilder();
            }, 1000);
        };
    }

    if (builderMode) {
        // Add Shift+PageUp handler to open external builder
        const _Scene_SkillTree_update = Scene_SkillTree.prototype.update;
        Scene_SkillTree.prototype.update = function() {
            _Scene_SkillTree_update.call(this);
            if (Input.isTriggered('pageup') && Input.isPressed('shift')) {  // Shift+PageUp
                openSkillTreeBuilder();
            }
        };

        // Also add to Scene_Menu for easy access
        const _Scene_Menu_update = Scene_Menu.prototype.update;
        Scene_Menu.prototype.update = function() {
            _Scene_Menu_update.call(this);
            if (Input.isTriggered('pageup') && Input.isPressed('shift') && builderMode) {  // Shift+PageUp
                openSkillTreeBuilder();
            }
        };
    }

    function Scene_SkillTreeBuilder() {
        this.initialize(...arguments);
    }

    Scene_SkillTreeBuilder.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_SkillTreeBuilder.prototype.constructor = Scene_SkillTreeBuilder;

    Scene_SkillTreeBuilder.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._currentTree = this.createEmptyTree();
        this._selectedNodeIndex = -1;
        this._mode = 'select'; // 'select', 'add', 'connect'
        this._connectingFrom = -1;
    };

    Scene_SkillTreeBuilder.prototype.createEmptyTree = function() {
        return {
            id: 1,
            name: 'New Skill Tree',
            iconIndex: 0,
            nodes: []
        };
    };

    Scene_SkillTreeBuilder.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createTreeEditWindow();
        this.createNodeListWindow();
        this.createNodeEditWindow();
        this.updateHelpText();
    };

    Scene_SkillTreeBuilder.prototype.createHelpWindow = function() {
        const rect = new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false));
        this._helpWindow = new Window_Help(rect);
        this.addWindow(this._helpWindow);
    };

    Scene_SkillTreeBuilder.prototype.createTreeEditWindow = function() {
        const rect = new Rectangle(0, this._helpWindow.height, Graphics.boxWidth * 0.7, Graphics.boxHeight - this._helpWindow.height);
        this._treeEditWindow = new Window_SkillTreeBuilderCanvas(rect);
        this._treeEditWindow.setTree(this._currentTree);
        this._treeEditWindow.setHandler('ok', this.onNodeSelect.bind(this));
        this._treeEditWindow.activate();
        this.addWindow(this._treeEditWindow);
    };

    Scene_SkillTreeBuilder.prototype.createNodeListWindow = function() {
        const rect = new Rectangle(
            Graphics.boxWidth * 0.7,
            this._helpWindow.height,
            Graphics.boxWidth * 0.3,
            200
        );
        this._nodeListWindow = new Window_SkillTreeBuilderNodeList(rect);
        this._nodeListWindow.setTree(this._currentTree);
        this.addWindow(this._nodeListWindow);
    };

    Scene_SkillTreeBuilder.prototype.createNodeEditWindow = function() {
        const rect = new Rectangle(
            Graphics.boxWidth * 0.7,
            this._helpWindow.height + 200,
            Graphics.boxWidth * 0.3,
            Graphics.boxHeight - this._helpWindow.height - 200
        );
        this._nodeEditWindow = new Window_SkillTreeBuilderEdit(rect);
        this.addWindow(this._nodeEditWindow);
    };

    Scene_SkillTreeBuilder.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);

        // Mode switching
        if (Input.isTriggered('tab')) {
            this.cycleMode();
        }

        // Export tree
        if (Input.isTriggered('pagedown')) {
            this.exportTree();
        }

        // Load tree
        if (Input.isTriggered('pageup')) {
            this.promptLoadTree();
        }

        this.updateHelpText();
    };

    Scene_SkillTreeBuilder.prototype.cycleMode = function() {
        const modes = ['select', 'add', 'connect'];
        const currentIndex = modes.indexOf(this._mode);
        this._mode = modes[(currentIndex + 1) % modes.length];
        this._treeEditWindow.setMode(this._mode);
        this._connectingFrom = -1;
        SoundManager.playCursor();
    };

    Scene_SkillTreeBuilder.prototype.updateHelpText = function() {
        let text = `[${this._currentTree.name}] `;
        text += `Mode: ${this._mode.toUpperCase()} | `;
        text += `TAB: Change Mode | `;
        text += `PgDn: Export | `;
        text += `ESC: Exit\n`;

        if (this._mode === 'select') {
            text += 'DRAG nodes with mouse. Arrow keys for fine adjustment. SHIFT/CTRL+Drag to pan. DEL to delete.';
        } else if (this._mode === 'add') {
            text += 'CLICK empty space to add nodes. SHIFT/CTRL+Drag to pan canvas.';
        } else if (this._mode === 'connect') {
            text += 'CLICK two nodes to draw connection line. SHIFT/CTRL+Drag to pan.';
        }

        this._helpWindow.setText(text);
    };

    Scene_SkillTreeBuilder.prototype.onNodeSelect = function() {
        const node = this._treeEditWindow.currentNode();
        if (node) {
            this._nodeEditWindow.setNode(node, this._currentTree);
        }
    };

    Scene_SkillTreeBuilder.prototype.exportTree = function() {
        const json = JSON.stringify(this._currentTree, null, 2);
        SoundManager.playOk();

        // Try to copy to clipboard if available
        if (navigator.clipboard) {
            navigator.clipboard.writeText(json).then(() => {
            }).catch(err => {
            });
        }
    };

    Scene_SkillTreeBuilder.prototype.promptLoadTree = function() {
        // In a real implementation, this would open a file picker or prompt
        // For now, just log instructions
        SoundManager.playOk();
    };

    Scene_SkillTreeBuilder.prototype.loadTreeFromJSON = function(treeData) {
        this._currentTree = treeData;
        this._treeEditWindow.setTree(this._currentTree);
        this._nodeListWindow.setTree(this._currentTree);
        this._treeEditWindow.refresh();
        this._nodeListWindow.refresh();
        SoundManager.playOk();
    };

    //=============================================================================
    // Window_SkillTreeBuilderCanvas - Interactive Tree Canvas
    //=============================================================================

    function Window_SkillTreeBuilderCanvas() {
        this.initialize(...arguments);
    }

    Window_SkillTreeBuilderCanvas.prototype = Object.create(Window_Selectable.prototype);
    Window_SkillTreeBuilderCanvas.prototype.constructor = Window_SkillTreeBuilderCanvas;

    Window_SkillTreeBuilderCanvas.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._tree = null;
        this._mode = 'select';
        this._offsetX = 0;
        this._offsetY = 0;
        this._dragging = false;
        this._draggingNode = false;
        this._draggedNodeIndex = -1;
        this._lastTouchX = 0;
        this._lastTouchY = 0;
        this._nextNodeId = 1;
        this._connectingFrom = -1;
    };

    Window_SkillTreeBuilderCanvas.prototype.setTree = function(tree) {
        this._tree = tree;
        if (tree.nodes.length > 0) {
            this._nextNodeId = Math.max(...tree.nodes.map(n => n.id)) + 1;
        }
        this.refresh();
    };

    Window_SkillTreeBuilderCanvas.prototype.setMode = function(mode) {
        this._mode = mode;
        this.refresh();
    };

    Window_SkillTreeBuilderCanvas.prototype.maxItems = function() {
        return this._tree ? this._tree.nodes.length : 0;
    };

    Window_SkillTreeBuilderCanvas.prototype.currentNode = function() {
        if (!this._tree) return null;
        return this._tree.nodes[this.index()];
    };

    Window_SkillTreeBuilderCanvas.prototype.update = function() {
        Window_Selectable.prototype.update.call(this);
        this.updateMouseInput();
        this.updateKeyboardShortcuts();
    };

    Window_SkillTreeBuilderCanvas.prototype.updateMouseInput = function() {
        if (!this.isTouchedInsideFrame()) return;

        const mouseX = TouchInput.x - this.x - this.padding;
        const mouseY = TouchInput.y - this.y - this.padding;

        // Handle mouse wheel zoom (optional feature)
        if (TouchInput.wheelY !== 0) {
            // Could add zoom here if desired
        }

        // Middle mouse or Space+Drag to pan canvas
        if (TouchInput.isPressed() && (Input.isPressed('control') || Input.isPressed('shift'))) {
            if (!this._dragging) {
                this._dragging = true;
                this._lastTouchX = TouchInput.x;
                this._lastTouchY = TouchInput.y;
            } else {
                const dx = TouchInput.x - this._lastTouchX;
                const dy = TouchInput.y - this._lastTouchY;
                this._offsetX += dx;
                this._offsetY += dy;
                this._lastTouchX = TouchInput.x;
                this._lastTouchY = TouchInput.y;
                this.refresh();
            }
            return;
        } else {
            this._dragging = false;
        }

        // Drag nodes directly with mouse
        if (this._mode === 'select' && TouchInput.isPressed()) {
            if (!this._draggingNode) {
                const nodeIndex = this.hitTestMouse(mouseX, mouseY);
                if (nodeIndex >= 0) {
                    this._draggingNode = true;
                    this._draggedNodeIndex = nodeIndex;
                    this.select(nodeIndex);
                }
            } else {
                const node = this._tree.nodes[this._draggedNodeIndex];
                if (node) {
                    // Snap to grid
                    node.x = Math.round((mouseX - this._offsetX) / 10) * 10;
                    node.y = Math.round((mouseY - this._offsetY) / 10) * 10;
                    this.refresh();
                }
            }
        } else {
            this._draggingNode = false;
            this._draggedNodeIndex = -1;
        }
    };

    Window_SkillTreeBuilderCanvas.prototype.updateKeyboardShortcuts = function() {
        // Delete selected node
        if (Input.isTriggered('delete') || Input.isTriggered('escape')) {
            if (this.index() >= 0 && Input.isTriggered('delete')) {
                if (confirm('Delete this node?')) {
                    this._tree.nodes.splice(this.index(), 1);
                    this.select(-1);
                    this.refresh();
                }
            }
        }

        // Arrow keys for fine adjustment
        if (this._mode === 'select' && this.index() >= 0) {
            const node = this.currentNode();
            if (!node) return;

            let moved = false;
            const moveSpeed = Input.isPressed('shift') ? 10 : 1;

            if (Input.isPressed('up')) {
                node.y -= moveSpeed;
                moved = true;
            }
            if (Input.isPressed('down')) {
                node.y += moveSpeed;
                moved = true;
            }
            if (Input.isPressed('left')) {
                node.x -= moveSpeed;
                moved = true;
            }
            if (Input.isPressed('right')) {
                node.x += moveSpeed;
                moved = true;
            }

            if (moved) {
                this.refresh();
            }
        }
    };

    Window_SkillTreeBuilderCanvas.prototype.processTouch = function() {
        if (this.isOpenAndActive() && !this._dragging && !this._draggingNode) {
            if (TouchInput.isTriggered() && this.isTouchedInsideFrame()) {
                this.onTouch();
            }
        }
    };

    Window_SkillTreeBuilderCanvas.prototype.onTouch = function() {
        const mouseX = TouchInput.x - this.x - this.padding;
        const mouseY = TouchInput.y - this.y - this.padding;

        if (this._mode === 'add') {
            // Add node at mouse position
            const worldX = mouseX - this._offsetX;
            const worldY = mouseY - this._offsetY;
            this.addNodeAt(worldX, worldY);
        } else if (this._mode === 'select') {
            const nodeIndex = this.hitTestMouse(mouseX, mouseY);
            if (nodeIndex >= 0) {
                this.select(nodeIndex);
                this.processOk();
            }
        } else if (this._mode === 'connect') {
            const nodeIndex = this.hitTestMouse(mouseX, mouseY);
            if (nodeIndex >= 0) {
                if (this._connectingFrom < 0) {
                    this._connectingFrom = nodeIndex;
                    SoundManager.playCursor();
                } else {
                    this.connectNodes(this._connectingFrom, nodeIndex);
                    this._connectingFrom = -1;
                }
                this.refresh();
            }
        }
    };

    Window_SkillTreeBuilderCanvas.prototype.addNodeAt = function(x, y) {
        const newNode = {
            id: this._nextNodeId++,
            skillId: 1,
            x: Math.floor(x / 10) * 10,  // Snap to grid
            y: Math.floor(y / 10) * 10,
            knowledgeCost: 100,
            prerequisites: [],
            connections: []
        };
        this._tree.nodes.push(newNode);
        this.select(this._tree.nodes.length - 1);
        this.refresh();
        SoundManager.playOk();
    };

    Window_SkillTreeBuilderCanvas.prototype.connectNodes = function(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;

        const fromNode = this._tree.nodes[fromIndex];
        const toNode = this._tree.nodes[toIndex];

        if (!fromNode.connections.includes(toNode.id)) {
            fromNode.connections.push(toNode.id);
            SoundManager.playOk();
        }
    };

    Window_SkillTreeBuilderCanvas.prototype.hitTestMouse = function(mouseX, mouseY) {
        const nodeSize = 60;
        const nodeRadius = nodeSize / 2;

        // Test from last to first (top to bottom in drawing order)
        for (let i = this._tree.nodes.length - 1; i >= 0; i--) {
            const node = this._tree.nodes[i];
            const nodeX = node.x + this._offsetX;
            const nodeY = node.y + this._offsetY;
            const centerX = nodeX + nodeRadius;
            const centerY = nodeY + nodeRadius;

            // Circle hit test for better accuracy
            const dx = mouseX - centerX;
            const dy = mouseY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= nodeRadius) {
                return i;
            }
        }
        return -1;
    };

    Window_SkillTreeBuilderCanvas.prototype.paint = function() {
        Window_Selectable.prototype.paint.call(this);
        this.drawGrid();
        this.drawTree();
    };

    Window_SkillTreeBuilderCanvas.prototype.drawGrid = function() {
        const ctx = this.contents.context;
        ctx.save();
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;

        const gridSize = 50;
        const startX = this._offsetX % gridSize;
        const startY = this._offsetY % gridSize;

        for (let x = startX; x < this.innerWidth; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.innerHeight);
            ctx.stroke();
        }

        for (let y = startY; y < this.innerHeight; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.innerWidth, y);
            ctx.stroke();
        }
        ctx.restore();
    };

    Window_SkillTreeBuilderCanvas.prototype.drawTree = function() {
        if (!this._tree) return;

        // Draw connections
        for (const node of this._tree.nodes) {
            this.drawNodeConnections(node);
        }

        // Draw nodes
        for (let i = 0; i < this._tree.nodes.length; i++) {
            this.drawNode(this._tree.nodes[i], i === this.index(), i === this._connectingFrom);
        }
    };

    Window_SkillTreeBuilderCanvas.prototype.drawNodeConnections = function(node) {
        if (!node.connections || node.connections.length === 0) return;

        const nodeX = node.x + this._offsetX;
        const nodeY = node.y + this._offsetY;
        const nodeSize = 60;
        const centerX = nodeX + nodeSize / 2;
        const centerY = nodeY + nodeSize / 2;

        const ctx = this.contents.context;
        for (const targetId of node.connections) {
            const targetNode = this._tree.nodes.find(n => n.id === targetId);
            if (!targetNode) continue;

            const targetX = targetNode.x + this._offsetX + nodeSize / 2;
            const targetY = targetNode.y + this._offsetY + nodeSize / 2;

            ctx.save();
            ctx.strokeStyle = '#888888';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(targetX, targetY);
            ctx.stroke();
            ctx.restore();
        }
    };

    Window_SkillTreeBuilderCanvas.prototype.drawNode = function(node, selected, connecting) {
        const nodeX = node.x + this._offsetX;
        const nodeY = node.y + this._offsetY;
        const nodeSize = 60;

        const skill = $dataSkills[node.skillId];
        const ctx = this.contents.context;

        // Draw node background
        ctx.save();
        ctx.beginPath();
        ctx.arc(nodeX + nodeSize/2, nodeY + nodeSize/2, nodeSize/2, 0, Math.PI * 2);

        if (connecting) {
            ctx.fillStyle = '#ffaa00';
        } else {
            ctx.fillStyle = '#4488ff';
        }
        ctx.fill();

        // Draw border
        if (selected) {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 4;
        } else {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
        }
        ctx.stroke();
        ctx.restore();

        // Draw skill icon
        if (skill && skill.iconIndex > 0) {
            const iconSize = ImageManager.iconWidth;
            const iconX = nodeX + (nodeSize - iconSize) / 2;
            const iconY = nodeY + (nodeSize - iconSize) / 2;
            this.drawIcon(skill.iconIndex, iconX, iconY);
        }

        // Draw node ID
        this.contents.fontSize = 12;
        const idText = `#${node.id}`;
        this.drawText(idText, nodeX, nodeY - 16, nodeSize, 'center');
        this.contents.fontSize = this.standardFontSize();
    };

    //=============================================================================
    // Window_SkillTreeBuilderNodeList - List of Nodes
    //=============================================================================

    function Window_SkillTreeBuilderNodeList() {
        this.initialize(...arguments);
    }

    Window_SkillTreeBuilderNodeList.prototype = Object.create(Window_Selectable.prototype);
    Window_SkillTreeBuilderNodeList.prototype.constructor = Window_SkillTreeBuilderNodeList;

    Window_SkillTreeBuilderNodeList.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._tree = null;
    };

    Window_SkillTreeBuilderNodeList.prototype.setTree = function(tree) {
        this._tree = tree;
        this.refresh();
    };

    Window_SkillTreeBuilderNodeList.prototype.maxItems = function() {
        return this._tree ? this._tree.nodes.length : 0;
    };

    Window_SkillTreeBuilderNodeList.prototype.drawItem = function(index) {
        const node = this._tree.nodes[index];
        const rect = this.itemLineRect(index);
        const skill = $dataSkills[node.skillId];

        this.drawText(`Node ${node.id}: ${skill ? skill.name : 'Unknown'}`, rect.x, rect.y, rect.width);
    };

    //=============================================================================
    // Window_SkillTreeBuilderEdit - Node Property Editor
    //=============================================================================

    function Window_SkillTreeBuilderEdit() {
        this.initialize(...arguments);
    }

    Window_SkillTreeBuilderEdit.prototype = Object.create(Window_Base.prototype);
    Window_SkillTreeBuilderEdit.prototype.constructor = Window_SkillTreeBuilderEdit;

    Window_SkillTreeBuilderEdit.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._node = null;
        this._tree = null;
    };

    Window_SkillTreeBuilderEdit.prototype.setNode = function(node, tree) {
        this._node = node;
        this._tree = tree;
        this.refresh();
    };

    Window_SkillTreeBuilderEdit.prototype.refresh = function() {
        this.contents.clear();

        if (!this._node) {
            this.drawText('No node selected', 0, 0, this.innerWidth, 'center');
            return;
        }

        let y = 0;
        const lineHeight = this.lineHeight();

        this.changeTextColor(ColorManager.systemColor());
        this.drawText(`Node ID: ${this._node.id}`, 0, y, this.innerWidth);
        this.resetTextColor();
        y += lineHeight;

        this.drawText(`Skill ID: ${this._node.skillId}`, 0, y, this.innerWidth);
        y += lineHeight;

        this.drawText(`Position: (${this._node.x}, ${this._node.y})`, 0, y, this.innerWidth);
        y += lineHeight;

        this.drawText(`Cost: ${this._node.knowledgeCost}`, 0, y, this.innerWidth);
        y += lineHeight;

        this.drawText(`Prerequisites: [${this._node.prerequisites.join(', ')}]`, 0, y, this.innerWidth);
        y += lineHeight;

        this.drawText(`Connections: [${this._node.connections.join(', ')}]`, 0, y, this.innerWidth);
        y += lineHeight;

        y += 8;
        this.contents.fontSize = 12;
        this.drawText('Edit properties in console:', 0, y, this.innerWidth);
        y += lineHeight - 4;
        this.drawText('node.skillId = X', 0, y, this.innerWidth);
        y += lineHeight - 4;
        this.drawText('node.knowledgeCost = X', 0, y, this.innerWidth);
        y += lineHeight - 4;
        this.drawText('node.prerequisites = [id1, id2]', 0, y, this.innerWidth);
        this.contents.fontSize = this.standardFontSize();

        y += lineHeight;
        y += 8;
        this.changeTextColor(ColorManager.systemColor());
        this.drawText('Quick Edit:', 0, y, this.innerWidth);
        this.resetTextColor();
        y += lineHeight;

        // Export node to console for easy editing
        if (!window._editNode || window._editNode !== this._node) {
        }
        window._editNode = this._node;
    };

    //=============================================================================
    // Export to Global Scope
    //=============================================================================

    window.Scene_SkillTree = Scene_SkillTree;
    window.Scene_SkillTreeBuilder = Scene_SkillTreeBuilder;
    window.Window_SkillTreeCharacter = Window_SkillTreeCharacter;
    window.Window_SkillTreeList = Window_SkillTreeList;
    window.Window_SkillTreeGraph = Window_SkillTreeGraph;
    window.Window_SkillTreeDetail = Window_SkillTreeDetail;
    window.Window_SkillTreeBuilderCanvas = Window_SkillTreeBuilderCanvas;
    window.Window_SkillTreeBuilderNodeList = Window_SkillTreeBuilderNodeList;
    window.Window_SkillTreeBuilderEdit = Window_SkillTreeBuilderEdit;
    window.getKnowledge = getKnowledge;
    window.addKnowledge = addKnowledge;
    window.skillTreesData = skillTreesData;

})();
