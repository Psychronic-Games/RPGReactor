/** Data shapes used by Step 2 APIs, not a complete MV/MZ JSON schema. */
declare namespace RPGReactor {
    /** Database slot 0 is null; IDs may also refer to missing/deleted records. */
    type Database<T> = Array<T | null | undefined>;
    type Metadata = Record<string, string | true | undefined>;
    interface NamedData { id: number; name: string }
    interface NotedData { note: string; meta?: Metadata }
    interface Trait { code: number; dataId: number; value: number }
    interface Effect { code: number; dataId: number; value1: number; value2: number }
    interface Damage {
        type: number; elementId: number; formula: string; variance: number; critical: boolean;
        elementIds?: number[];
    }
    interface AudioFile {
        name: string; volume: number; pitch: number;
        /** Absent in AudioManager.makeEmptyAudioObject(). */
        pan?: number;
        pos?: number;
        sequence?: string | number;
        looped?: boolean;
        variants?: AudioFile[];
        pitchRandom?: { min: number | string; max: number | string };
    }
    interface ActorData extends NamedData, NotedData {
        nickname: string; profile: string; classId: number; initialLevel: number; maxLevel: number;
        characterName: string; characterIndex: number; faceName: string; faceIndex: number;
        battlerName: string; equips: number[]; traits: Trait[];
    }
    interface ClassData extends NamedData, NotedData {
        expParams: number[]; params: number[][]; traits: Trait[];
        learnings: Array<{ level: number; skillId: number; note: string }>;
    }
    interface UsableData extends NamedData, NotedData {
        description: string; iconIndex: number; animationId: number; damage: Damage;
        effects: Effect[]; hitType: number; occasion: number; repeats: number;
        scope: number; speed: number; successRate: number; tpGain: number;
    }
    interface SkillData extends UsableData {
        stypeId: number; mpCost: number; tpCost: number;
        message1: string; message2: string; messageType?: number;
        requiredWtypeId1: number; requiredWtypeId2: number;
    }
    interface ItemData extends UsableData { itypeId: number; price: number; consumable: boolean }
    interface EquipmentData extends NamedData, NotedData {
        description: string; iconIndex: number; etypeId: number;
        price: number; params: number[]; traits: Trait[];
    }
    interface WeaponData extends EquipmentData { wtypeId: number; animationId: number }
    interface ArmorData extends EquipmentData { atypeId: number }
    type InventoryItem = ItemData | WeaponData | ArmorData;
    interface EnemyData extends NamedData, NotedData {
        battlerName: string; battlerHue: number; exp: number; gold: number;
        params: number[]; traits: Trait[];
        actions: Array<{
            skillId: number; rating: number; conditionType: number;
            conditionParam1: number; conditionParam2: number;
        }>;
        dropItems: Array<{ kind: number; dataId: number; denominator: number }>;
    }
    interface EventCommand { code: number; indent: number; parameters: unknown[] }
    interface TroopData extends NamedData {
        members: Array<{ enemyId: number; x: number; y: number; hidden: boolean }>;
        /** Event-page conditions will be expanded with Game_Interpreter in Step 3. */
        pages: Array<{ conditions: Record<string, unknown>; span: number; list: EventCommand[] }>;
    }
    interface StateData extends NamedData, NotedData {
        iconIndex: number; priority: number; restriction: number; traits: Trait[];
        autoRemovalTiming: number; minTurns: number; maxTurns: number;
        message1: string; message2: string; message3: string; message4: string;
        description?: string;
    }
    interface AnimationData extends NamedData {
        /** MZ effect fields are absent in MV sprite-sheet animations. */
        effectName?: string; displayType?: number; scale?: number; speed?: number;
        offsetX?: number; offsetY?: number;
        rotation?: { x: number; y: number; z: number };
        flashTimings?: Array<{ frame: number; duration: number; color: BlendColor }>;
        soundTimings?: Array<{ frame: number; se: AudioFile }>;
        animation1Name?: string; animation2Name?: string;
        animation1Hue?: number; animation2Hue?: number;
        position?: number; frames?: number[][][];
        timings?: Array<{
            frame: number; flashScope: number; flashColor: BlendColor;
            flashDuration: number; se: AudioFile;
        }>;
    }
    interface TilesetData extends NamedData, NotedData { mode: number; tilesetNames: string[]; flags: number[] }
    interface CommonEventData extends NamedData { trigger: number; switchId: number; list: EventCommand[] }
    interface MapInfoData extends NamedData {
        parentId: number; order: number; expanded: boolean; scrollX: number; scrollY: number;
    }
    interface MapEventData extends NamedData, NotedData {
        x: number; y: number;
        pages: EventPage[];
    }
    /** Also describes DataManager.makeEmptyMap(), which only sets five fields. */
    interface MapData {
        width: number; height: number; scrollType: number; data: number[];
        events: Database<MapEventData>;
        displayName?: string; note?: string; meta?: Metadata; tilesetId?: number;
        autoplayBgm?: boolean; autoplayBgs?: boolean; bgm?: AudioFile; bgs?: AudioFile;
        encounterStep?: number; encounterList?: Array<{ troopId: number; weight: number; regionSet: number[] }>;
        disableDashing?: boolean; specifyBattleback?: boolean;
        battleback1Name?: string; battleback2Name?: string;
        parallaxName?: string; parallaxLoopX?: boolean; parallaxLoopY?: boolean;
        parallaxSx?: number; parallaxSy?: number; parallaxShow?: boolean;
        /** Selected gameplay-facing sidecar fields; see reactor-3d.d.ts. */
        reactor3d?: Sidecar3D | null;
    }
    interface SystemData {
        gameTitle: string; currencyUnit: string; locale: string; versionId: number;
        switches: string[]; variables: string[]; partyMembers: number[];
        elements: string[]; skillTypes: string[]; weaponTypes: string[]; armorTypes: string[]; equipTypes: string[];
        startMapId: number; startX: number; startY: number;
        title1Name: string; title2Name: string;
        battleBgm: AudioFile; titleBgm: AudioFile; victoryMe: AudioFile; defeatMe: AudioFile; gameoverMe: AudioFile;
        sounds: AudioFile[]; windowTone: ColorTone;
        optSideView: boolean; optDisplayTp: boolean;
        rrSkipMissingImages?: boolean; rrSkipMissingAudio?: boolean;
        battleSystem?: number; tileSize?: number; faceSize?: number; iconSize?: number;
        advanced?: {
            gameId?: number;
            screenWidth: number; screenHeight: number; uiAreaWidth: number; uiAreaHeight: number;
            fallbackFonts: string; fontSize?: number; windowPadding?: number; lineHeight?: number;
            windowOpacity?: number; textOutlineWidth?: number; pixelatedRendering?: boolean;
        };
    }
    interface PluginData { name: string; status: boolean; description?: string; parameters: Record<string, string> }
    /** Missing parameter/argument keys are undefined, not arbitrary strings. */
    type PluginParameters = Record<string, string | undefined>;
    interface SavefileInfo {
        title: string; characters: Array<[string, number]>; faces: Array<[string, number]>;
        playtime: string; timestamp: number;
    }
    interface SaveContents {
        system: Game_System; screen: Game_Screen; timer: Game_Timer;
        switches: Game_Switches; variables: Game_Variables; selfSwitches: Game_SelfSwitches;
        actors: Game_Actors; party: Game_Party; map: Game_Map; player: Game_Player;
    }
}

declare namespace RPGReactor {
    interface MoveCommand { code: number; parameters?: unknown[] }
    interface MoveRoute { list: MoveCommand[]; repeat: boolean; skippable: boolean; wait: boolean }
    interface EventPage {
        conditions: Record<string, unknown>;
        image: Record<string, unknown>;
        list: EventCommand[]; trigger: number; priorityType: number;
        moveType?: number; moveSpeed?: number; moveFrequency?: number; moveRoute?: MoveRoute;
    }
}
