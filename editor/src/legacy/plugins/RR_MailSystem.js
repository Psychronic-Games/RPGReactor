/*:
 * @target MZ
 * @plugindesc Mail System (VX Ace), for imported games
 * @author ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MailSystem.js
 *
 * A mailbox kept with the save, and a menu screen to read it: contacts on
 * the left, a contact's messages on the right (unread marked [!]), and a
 * message opened full screen, scrolled with up and down.
 *   this.rrAddMail(sender, title, body, [pictures])
 * With the toast add-on, a new message plays a sound and shows a notice.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param menuName
 * @default Comms
 *
 * @param toast
 * @text Notice for new mail
 * @type boolean
 * @default false
 *
 * @param toastSound
 * @default radio
 * @desc Played from the sound effects folder.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_MailSystem');
    const MENU_NAME = String(params.menuName || 'Comms');
    const TOAST = String(params.toast) === 'true';
    const TOAST_SOUND = String(params.toastSound || '');

    const mailbox = () => {
        if (!$gameSystem._rrMailbox) $gameSystem._rrMailbox = [];
        return $gameSystem._rrMailbox;
    };
    const contacts = () => [...new Set(mailbox().map(m => m.sender))];
    const byContact = (sender) => mailbox().filter(m => m.sender === sender);

    Game_Interpreter.prototype.rrAddMail = function(sender, title, body, attachments = []) {
        mailbox().push({ sender: String(sender), title: String(title), body: String(body), read: false, attachments: Array.isArray(attachments) ? attachments.map(String) : [] });
        if (!TOAST) return;
        // The add-on played the sound through the ME channel, from the sound effects folder.
        if (TOAST_SOUND) {
            const buffer = AudioManager.createBuffer('se/', TOAST_SOUND);
            AudioManager.updateSeParameters(buffer, { name: TOAST_SOUND, volume: 100, pitch: 100, pan: 0 });
            buffer.play(false);
            AudioManager._seBuffers.push(buffer);
        }
        if (window.rrCscaToast) window.rrCscaToast('text', 'NEW COMMS ALERT', `${sender}: ${title}`);
    };

    function Window_RRMailHeader() { this.initialize(...arguments); }
    Window_RRMailHeader.prototype = Object.create(Window_Base.prototype);
    Window_RRMailHeader.prototype.constructor = Window_RRMailHeader;
    Window_RRMailHeader.prototype.initialize = function(rect, text) {
        Window_Base.prototype.initialize.call(this, rect);
        this.drawText(text, 0, 4, this.innerWidth, 'center');
    };

    function Window_RRMailList() { this.initialize(...arguments); }
    Window_RRMailList.prototype = Object.create(Window_Selectable.prototype);
    Window_RRMailList.prototype.constructor = Window_RRMailList;
    Window_RRMailList.prototype.initialize = function(rect) {
        this._items = [];
        Window_Selectable.prototype.initialize.call(this, rect);
    };
    Window_RRMailList.prototype.maxItems = function() { return this._items.length; };
    Window_RRMailList.prototype.setItems = function(items) { this._items = items; this.refresh(); };
    Window_RRMailList.prototype.item = function() { return this._items[this.index()] ?? null; };
    Window_RRMailList.prototype.drawItem = function(index) {
        const rect = this.itemRect(index);
        const { text, unread } = this.label(this._items[index]);
        this.changeTextColor(unread ? ColorManager.textColor(10) : ColorManager.normalColor());
        this.drawText(unread ? '[!] ' + text : text, rect.x, rect.y, rect.width);
        this.resetTextColor();
    };

    function Window_RRMailContacts() { this.initialize(...arguments); }
    Window_RRMailContacts.prototype = Object.create(Window_RRMailList.prototype);
    Window_RRMailContacts.prototype.constructor = Window_RRMailContacts;
    Window_RRMailContacts.prototype.label = function(sender) { return { text: sender, unread: byContact(sender).some(m => !m.read) }; };

    function Window_RRMailTitles() { this.initialize(...arguments); }
    Window_RRMailTitles.prototype = Object.create(Window_RRMailList.prototype);
    Window_RRMailTitles.prototype.constructor = Window_RRMailTitles;
    Window_RRMailTitles.prototype.label = function(m) { return { text: m.title, unread: !m.read }; };

    function Window_RRMailView() { this.initialize(...arguments); }
    Window_RRMailView.prototype = Object.create(Window_Base.prototype);
    Window_RRMailView.prototype.constructor = Window_RRMailView;
    Window_RRMailView.prototype.initialize = function(rect, mail) {
        this._mail = mail;
        this._scroll = 0;
        this._velocity = 0;
        Window_Base.prototype.initialize.call(this, rect);
        const lh = this.lineHeight();
        const body = this.textSizeEx(mail.body).height;
        this._pictures = mail.attachments.map(name => ImageManager.loadPicture(name));
        this._contentHeight = Math.max(lh * 3 + body + lh + 24, this.innerHeight);
        this.contents = new Bitmap(this.innerWidth, this._contentHeight);
        this.draw();
    };
    Window_RRMailView.prototype.draw = function() {
        const lh = this.lineHeight();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText('FROM: ' + this._mail.sender, 0, 0, this.innerWidth);
        this.drawText('SUBJECT: ' + this._mail.title, 0, lh, this.innerWidth);
        this.resetTextColor();
        let y = lh * 3;
        const bodyHeight = this.textSizeEx(this._mail.body).height;
        this.drawTextEx(this._mail.body, 0, y, this.innerWidth);
        y += bodyHeight;
        y += lh;
        for (const bitmap of this._pictures) {
            const at = y;
            bitmap.addLoadListener(() => this.contents.blt(bitmap, 0, 0, bitmap.width, bitmap.height, 0, at));
            y += 8 + (bitmap.isReady() ? bitmap.height : lh);
        }
    };
    // Up and down push the page, which glides and slows, as the original's did.
    Window_RRMailView.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        const max = Math.max(this._contentHeight - this.innerHeight, 0);
        if (Input.isPressed('down')) this._velocity += 2.5;
        else if (Input.isPressed('up')) this._velocity -= 2.5;
        this._scroll += this._velocity;
        this._velocity *= 0.85;
        if (Math.abs(this._velocity) < 0.1) this._velocity = 0;
        if (this._scroll < 0) { this._scroll = 0; this._velocity = 0; }
        else if (this._scroll > max) { this._scroll = max; this._velocity = 0; }
        this.origin.y = Math.floor(this._scroll);
    };

    function Scene_RRMail() { this.initialize(...arguments); }
    Scene_RRMail.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRMail.prototype.constructor = Scene_RRMail;
    window.Scene_RRMail = Scene_RRMail;
    Scene_RRMail.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        const w = Graphics.boxWidth, h = Graphics.boxHeight, third = Math.floor(w / 3);
        const headH = this.calcWindowHeight(1, false);
        this.addWindow(new Window_RRMailHeader(new Rectangle(0, 0, third, headH), 'Contacts'));
        this.addWindow(new Window_RRMailHeader(new Rectangle(third, 0, w - third, headH), 'Communication'));
        this._contacts = new Window_RRMailContacts(new Rectangle(0, headH, third, h - headH));
        this._titles = new Window_RRMailTitles(new Rectangle(third, headH, w - third, h - headH));
        this._contacts.setHandler('ok', () => { this._titles.activate(); this._titles.select(0); });
        this._contacts.setHandler('cancel', this.popScene.bind(this));
        this._titles.setHandler('ok', this.openMail.bind(this));
        this._titles.setHandler('cancel', () => { this._titles.deselect(); this._contacts.activate(); });
        this.addWindow(this._contacts);
        this.addWindow(this._titles);
        this._contacts.setItems(contacts());
        if (mailbox().length) {
            this._contacts.select(0);
            this._contacts.activate();
            this._titles.setItems(byContact(this._contacts.item()));
        } else {
            this._titles.drawText('No messages.', 0, 0, this._titles.innerWidth, 'center');
        }
        this._lastContact = this._contacts.index();
    };
    Scene_RRMail.prototype.openMail = function() {
        const mail = this._titles.item();
        if (!mail) return this._titles.activate();
        mail.read = true;
        this._view = new Window_RRMailView(new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight), mail);
        this.addWindow(this._view);
    };
    Scene_RRMail.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (this._view) {
            if (Input.isTriggered('cancel') || Input.isTriggered('ok')) {
                this._windowLayer.removeChild(this._view);
                this._view.destroy();
                this._view = null;
                this._titles.refresh();
                this._contacts.refresh();
                this._titles.activate();
            }
            return;
        }
        if (!mailbox().length) { if (Input.isTriggered('cancel')) this.popScene(); return; }
        if (this._contacts.active && this._lastContact !== this._contacts.index()) {
            this._lastContact = this._contacts.index();
            this._titles.setItems(byContact(this._contacts.item()));
        }
    };

    // "Comms" joins the menu's own commands.
    const _addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function() {
        _addOriginalCommands.call(this);
        this.addCommand(MENU_NAME, 'rrMail', true);
    };
    const _createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _createCommandWindow.call(this);
        this._commandWindow.setHandler('rrMail', () => SceneManager.push(Scene_RRMail));
    };
})();
