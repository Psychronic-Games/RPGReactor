import type * as Pixi from "pixi.js";

declare global {
    namespace RPGReactor {
        /**
         * The game window instance. The bare Window TYPE remains the DOM interface.
         * pixi_compat.js removes the inherited name/origin accessors, and MZ stores
         * its own scrolling Point. updateTransform() returns void, unlike Pixi 8's fluent setter. Keep that
         * distinction instead of falsely claiming full Pixi.Container substitutability.
         */
        interface RuntimeWindow extends Omit<Pixi.Container, "updateTransform" | "origin" | "name"> {
            initialize(...args: unknown[]): void;
            name?: string;
            get windowskin(): Bitmap | null;
            set windowskin(value: Bitmap);
            contents: Bitmap | null | undefined;
            contentsBack: Bitmap | null | undefined;
            origin: Point;
            active: boolean;
            frameVisible: boolean;
            cursorVisible: boolean;
            downArrowVisible: boolean;
            upArrowVisible: boolean;
            pause: boolean;
            padding: number;
            margin: number;
            opacity: number;
            backOpacity: number;
            contentsOpacity: number;
            openness: number;
            readonly innerWidth: number;
            readonly innerHeight: number;
            readonly innerRect: Rectangle;
            destroy(): void;
            update(): void;
            updateTransform(): void;
            move(x: number, y: number, width: number, height: number): void;
            isOpen(): boolean;
            isClosed(): boolean;
            setCursorRect(x: number, y: number, width: number, height: number): void;
            moveCursorBy(x: number, y: number): void;
            moveInnerChildrenBy(x: number, y: number): void;
            setTone(red: number, green: number, blue: number): void;
            addChildToBack<T extends Pixi.Container | RuntimeWindow>(child: T): T;
            addInnerChild<T extends Pixi.Container | RuntimeWindow>(child: T): T;
        }
        interface WindowConstructor {
            new (): RuntimeWindow;
            prototype: RuntimeWindow;
            clipWithMask: boolean;
            defaultMargin(): number;
        }
        interface TextState {
            text: string; index: number; x: number; y: number;
            width: number | undefined; height: number; startX: number; startY: number;
            rtl: boolean; buffer: string; drawing: boolean; outputWidth: number; outputHeight: number;
        }
        interface WindowCommand { name: string; symbol: string; enabled: boolean; ext: unknown }
    }

    /** Runtime constructor VALUE; does not change the DOM Window interface TYPE. */
    var Window: RPGReactor.WindowConstructor;

    class WindowLayer extends Pixi.Container {
        constructor(); initialize(): void; update(): void;
        addChild<T extends (Pixi.Container | RPGReactor.RuntimeWindow)[]>(...children: T): T[0];
        removeChild<T extends (Pixi.Container | RPGReactor.RuntimeWindow)[]>(...children: T): T[0];
    }

    class Window_Base extends Window {
        constructor(rect: Rectangle);
        initialize(rect: Rectangle): void;
        contents: Bitmap;
        contentsBack: Bitmap;
        destroy(options?: Pixi.DestroyOptions): void;
        lineHeight(): number;
        itemWidth(): number;
        itemHeight(): number;
        itemPadding(): number;
        baseTextRect(): Rectangle;
        fittingHeight(numLines: number): number;
        loadWindowskin(): void;
        updatePadding(): void;
        updateBackOpacity(): void;
        updateTone(): void;
        createContents(): void;
        destroyContents(): void;
        contentsWidth(): number;
        contentsHeight(): number;
        resetFontSettings(): void;
        resetTextColor(): void;
        open(): void;
        close(): void;
        isOpening(): boolean;
        isClosing(): boolean;
        show(): void;
        hide(): void;
        activate(): void;
        deactivate(): void;
        systemColor(): string;
        translucentOpacity(): number;
        changeTextColor(color: string): void;
        changeOutlineColor(color: string): void;
        changePaintOpacity(enabled: boolean): void;
        drawRect(x: number, y: number, width: number, height: number): void;
        drawText(text: string | number, x: number, y: number, maxWidth: number, align?: "left" | "center" | "right"): void;
        textWidth(text: string): number;
        drawTextEx(text: string, x: number, y: number, width?: number): number;
        textSizeEx(text: string): { width: number; height: number };
        createTextState(text: string, x: number, y: number, width?: number): RPGReactor.TextState;
        processAllText(textState: RPGReactor.TextState): void;
        convertEscapeCharacters(text: string): string;
        processEscapeCharacter(code: string, textState: RPGReactor.TextState): void;
        obtainEscapeCode(textState: RPGReactor.TextState): string;
        obtainEscapeParam(textState: RPGReactor.TextState): number | "";
        actorName(actorId: number): string;
        partyMemberName(index: number): string;
        drawIcon(iconIndex: number, x: number, y: number): void;
        drawFace(faceName: string, faceIndex: number, x: number, y: number, width?: number, height?: number): void;
        drawCharacter(characterName: string, characterIndex: number, x: number, y: number): void;
        drawItemName(item: RPGReactor.InventoryItem | RPGReactor.SkillData | null, x: number, y: number, width: number): void;
        drawCurrencyValue(value: number, unit: string, x: number, y: number, width: number): void;
        setBackgroundType(type: number): void;
    }

    class Window_Scrollable extends Window_Base {
        constructor(rect: Rectangle);
        scrollX(): number;
        scrollY(): number;
        scrollBaseX(): number;
        scrollBaseY(): number;
        scrollTo(x: number, y: number): void;
        scrollBy(x: number, y: number): void;
        smoothScrollTo(x: number, y: number): void;
        smoothScrollBy(x: number, y: number): void;
        smoothScrollDown(rows: number): void;
        smoothScrollUp(rows: number): void;
        overallWidth(): number;
        overallHeight(): number;
        maxScrollX(): number;
        maxScrollY(): number;
        isScrollEnabled(): boolean;
        paint(): void;
    }

    class Window_Selectable extends Window_Scrollable {
        constructor(rect: Rectangle);
        index(): number;
        maxCols(): number;
        maxItems(): number;
        maxRows(): number;
        maxPageRows(): number;
        maxPageItems(): number;
        colSpacing(): number;
        rowSpacing(): number;
        row(): number;
        topRow(): number;
        topIndex(): number;
        setTopRow(row: number): void;
        select(index: number): void;
        forceSelect(index: number): void;
        smoothSelect(index: number): void;
        deselect(): void;
        reselect(): void;
        cursorFixed(): boolean;
        setCursorFixed(fixed: boolean): void;
        cursorAll(): boolean;
        setCursorAll(all: boolean): void;
        itemRect(index: number): Rectangle;
        itemRectWithPadding(index: number): Rectangle;
        itemLineRect(index: number): Rectangle;
        setHelpWindow(helpWindow: Window_Help): void;
        setHelpWindowItem(item: RPGReactor.InventoryItem | RPGReactor.SkillData | null): void;
        setHandler(symbol: string, method: () => void): void;
        isHandled(symbol: string): boolean;
        callHandler(symbol: string): void;
        isOpenAndActive(): boolean;
        isCurrentItemEnabled(): boolean;
        isOkEnabled(): boolean;
        isCancelEnabled(): boolean;
        cursorDown(wrap?: boolean): void;
        cursorUp(wrap?: boolean): void;
        cursorLeft(wrap?: boolean): void;
        cursorRight(wrap?: boolean): void;
        ensureCursorVisible(smooth?: boolean): void;
        hitTest(x: number, y: number): number;
        processOk(): void;
        processCancel(): void;
        updateHelp(): void;
        drawAllItems(): void;
        drawItem(index: number): void;
        redrawItem(index: number): void;
        redrawCurrentItem(): void;
        refresh(): void;
    }

    class Window_Command extends Window_Selectable {
        constructor(rect: Rectangle);
        clearCommandList(): void;
        makeCommandList(): void;
        addCommand(name: string, symbol: string, enabled?: boolean, ext?: unknown): void;
        commandName(index: number): string;
        commandSymbol(index: number): string;
        isCommandEnabled(index: number): boolean;
        currentData(): RPGReactor.WindowCommand | null | undefined;
        currentSymbol(): string | null;
        currentExt(): unknown;
        findSymbol(symbol: string): number;
        selectSymbol(symbol: string): void;
        findExt(ext: unknown): number;
        selectExt(ext: unknown): void;
        itemTextAlign(): "left" | "center" | "right";
    }

    class Window_Help extends Window_Base {
        constructor(rect: Rectangle);
        setText(text: string): void;
        clear(): void;
        setItem(item: { description: string } | null): void;
        refresh(): void;
    }

    class Window_StatusBase extends Window_Selectable {
        constructor(rect: Rectangle);
        loadFaceImages(): void;
        hideAdditionalSprites(): void;
        placeActorName(actor: Game_Actor, x: number, y: number): void;
        placeStateIcon(actor: Game_Actor, x: number, y: number): void;
        placeGauge(actor: Game_Actor, type: "hp" | "mp" | "tp" | "time", x: number, y: number): void;
        placeTimeGauge(actor: Game_Actor, x: number, y: number): void;
        placeBasicGauges(actor: Game_Actor, x: number, y: number): void;
        drawActorCharacter(actor: Game_Actor, x: number, y: number): void;
        drawActorFace(actor: Game_Actor, x: number, y: number, width?: number, height?: number): void;
        drawActorName(actor: Game_Actor, x: number, y: number, width?: number): void;
        drawActorClass(actor: Game_Actor, x: number, y: number, width?: number): void;
        drawActorNickname(actor: Game_Actor, x: number, y: number, width?: number): void;
        drawActorLevel(actor: Game_Actor, x: number, y: number): void;
        drawActorIcons(actor: Game_Actor, x: number, y: number, width?: number): void;
        drawActorSimpleStatus(actor: Game_Actor, x: number, y: number): void;
        actorSlotName(actor: Game_Actor, index: number): string | undefined;
    }

    class Window_Message extends Window_Base {
        constructor(rect: Rectangle);
        _textState: RPGReactor.TextState | null;
        initMembers(): void;
        clearFlags(): void;
        canStart(): boolean;
        startMessage(): void;
        terminateMessage(): void;
        newLineX(textState: RPGReactor.TextState): number;
        updateWait(): boolean;
        updateLoading(): boolean;
        updateInput(): boolean;
        updateMessage(): boolean;
        updatePlacement(): void;
        updateBackground(): void;
        isTriggered(): boolean;
        startWait(count: number): void;
        startPause(): void;
    }
}
