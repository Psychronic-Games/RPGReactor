//=============================================================================
// reactor_online_party.js: other players as your party
//=============================================================================
// A party is a list of names the server keeps, led by whoever asked first. It
// gives its members a chat channel and a shared side in battles
// (reactor_online_battle.js). Everyone keeps their own game, actors and save.
//
// /invite Name, /accept, /decline, /leave, /party, /follow [Name], /stop. An
// invitation also asks on screen. Switches and variables a project lists under
// Shared with a party go between its members through the ordinary setValue.
// Design: docs/DESIGN-ONLINE.md.
//=============================================================================

const ReactorOnlineParty = {
    NEWS_MS: 3000,
    FOLLOW_GAP: 2,

    party: null,
    invite: "",
    asked: "",
    following: "",
    changes: new Map(),

    identity() {
        return { s: ReactorOnline.slot, g: ReactorOnline.nonce, t: ReactorOnline.token };
    },

    myName() {
        return ReactorOnline.myName || "";
    },

    has(name) {
        return !!this.party?.members.some(member => member.name === name);
    },

    /** Called on the beat: only every few seconds does anyone ask. */
    keepUp() {
        const now = performance.now();
        if (now < (this._next || 0) || this._asking || ReactorOnline.slot < 0 || !$gameMap?.mapId()) return;
        this._next = now + this.NEWS_MS;
        this._asking = true;
        ReactorOnline.post("news", {}, Object.assign(this.identity(), { m: $gameMap.mapId() }))
            .then(news => this.apply(news), () => null).finally(() => { this._asking = false; });
    },

    apply(news) {
        const before = this.party;
        this.party = news.party || null;
        if (!before && this.party) ReactorOnlineChat.note("You are in a party. Its chat is the Party channel beside the chat box.");
        else if (before && !this.party) ReactorOnlineChat.note("You are no longer in a party.");
        if (!this.party) this.following = "";
        this.showList();
        ReactorOnlineChat.showChannel?.();
        this.applyValues(this.party?.values);
        this.onInvite(news.invite || "");
        this.onChallenge(news.challenge || "");
        if (news.duel) ReactorOnlineBattle.startDuel(news.duel);
        ReactorOnlineBattle.onNews(news.battles || []);
    },

    // ---- Values the party shares ----

    shares(kind, id) {
        const world = ReactorOnline.config()?.world;
        if (!world) return false;
        const text = kind === "s" ? world.partySwitches : world.partyVariables;
        if (!text) return false;
        // The list is read into a set once and kept while its text is the same: this is asked at every switch and variable write.
        const kept = this._shared || (this._shared = { s: { text: null, ids: null }, v: { text: null, ids: null } }), list = kept[kind === "s" ? "s" : "v"];
        if (list.text !== text) { list.text = text; list.ids = ReactorWorldState.ids(text); }
        return list.ids.has(id);
    },

    /** Whether a change to this switch or variable is shared with the party now (so worth reading back). */
    takesValue(kind, id) {
        return !this.applying && !!this.party && this.shares(kind, id);
    },

    noteValue(kind, id, value) {
        if (!this.takesValue(kind, id)) return;
        this.changes.set(kind + ":" + id, { kind, id: String(id), value });
        clearTimeout(this._valuesSoon);
        this._valuesSoon = setTimeout(() => this.flushValues(), 100);
    },

    flushValues() {
        if (!this.changes.size || ReactorOnline.slot < 0) return;
        const changes = [...this.changes.values()];
        this.changes.clear();
        this.send({ do: "set", changes }, "");
    },

    /** What the party holds, through the same calls an event uses, so pages respond as usual. A change on its way here wins for now. */
    applyValues(values) {
        if (!values || typeof $gameSwitches === "undefined" || !$gameSwitches) return;
        this.applying = true;
        try {
            for (const [id, value] of Object.entries(values.s || {})) if (!this.changes.has("s:" + id) && $gameSwitches.value(Number(id)) !== value) $gameSwitches.setValue(Number(id), value);
            for (const [id, value] of Object.entries(values.v || {})) if (!this.changes.has("v:" + id) && $gameVariables.value(Number(id)) !== value) $gameVariables.setValue(Number(id), value);
        } finally {
            this.applying = false;
        }
    },

    // ---- Following ----

    /** The party's leader by default. Walking by hand or /stop ends it; a battle or an event only pauses it. */
    follow(name) {
        const wanted = name || this.party?.leader || "";
        const member = this.party?.members.find(entry => entry.name.toLowerCase() === wanted.toLowerCase());
        if (!member || member.name === this.myName()) { ReactorOnlineChat.note(this.party ? "Follow whom? /follow Name, someone in your party." : "You are not in a party."); return; }
        this.following = member.name;
        ReactorOnlineChat.note("Following " + member.name + ". Walk or type /stop to stop.");
    },

    unfollow(quiet) {
        if (this.following && !quiet) ReactorOnlineChat.note("You stopped following " + this.following + ".");
        this.following = "";
        $gameTemp.clearDestination?.();
    },

    /** Called on the beat: toward them on this map, and after them to any other. */
    followOn() {
        if (!this.following || !(SceneManager._scene instanceof Scene_Map) || $gameMap.isEventRunning() || $gamePlayer.isTransferring() || $gameMessage.isBusy() || $gameFight?.isActive?.()) return;
        if (Input.dir4 !== 0) { this.unfollow(false); return; }
        const member = this.party?.members.find(entry => entry.name === this.following);
        if (!member?.online) return;
        const place = member.place;
        if (place?.map > 0 && place.map !== $gameMap.mapId()) {
            // A map this game does not have (another version of it, or a wrong report) would stop the game on loading it.
            if (!$dataMapInfos[place.map]) { this.unfollow(false); return; }
            $gamePlayer.reserveTransfer(place.map, place.x, place.y, $gamePlayer.direction(), 0);
            return;
        }
        const peer = [...ReactorOnline.peers.values()].find(entry => entry.playerName === member.name);
        if (peer && Math.hypot(peer._x - $gamePlayer.x, peer._y - $gamePlayer.y) > this.FOLLOW_GAP) $gameTemp.setDestination(peer._x, peer._y);
    },

    /** Someone asks: on screen, when nothing else is, and once for each invitation. */
    onInvite(from) {
        this.invite = from;
        if (!from) { this.asked = ""; return; }
        if (from === this.asked || !ReactorOnlineBattle.canAsk()) return;
        this.asked = from;
        $gameMessage.setChoices(["Join " + from + "'s party", "Not now"], 0, 1);
        $gameMessage.setChoiceCallback(choice => this.command(choice === 0 ? "/accept" : "/decline"));
        $gameMessage.add(from + " invites you to their party.");
    },

    /** Someone wants to fight: asked on screen, once. Yes, and their battle is joined on the other side when it starts. */
    onChallenge(from) {
        if (!from) { this.challenged = ""; return; }
        if (from === this.challenged || !ReactorOnlineBattle.canAsk()) return;
        this.challenged = from;
        $gameMessage.setChoices(["Fight " + from, "Not now"], 0, 1);
        $gameMessage.setChoiceCallback(choice => {
            if (choice === 0) ReactorOnlineBattle.expectDuel(from);
            this.send({ do: "answerChallenge", yes: choice === 0 }, choice === 0 ? "" : "You turned down " + from + ".");
        });
        $gameMessage.add(from + " challenges you to a fight.");
    },

    /** A chat line that is a party command. True if it was one. */
    command(text) {
        const invite = /^\/invite\s+(.+)$/i.exec(text);
        const word = /^\/(accept|decline|leave|party)\s*$/i.exec(text)?.[1].toLowerCase();
        const follow = /^\/follow(?:\s+(.+))?$/i.exec(text);
        const duel = /^\/(?:duel|challenge)\s+(.+)$/i.exec(text);
        if (duel) { this.send({ do: "challenge", name: duel[1].trim() }, "You challenged " + duel[1].trim() + "."); return true; }
        if (/^\/stop\s*$/i.test(text)) this.unfollow(false);
        else if (follow) this.follow(follow[1]?.trim());
        else if (invite) this.send({ do: "invite", name: invite[1].trim() }, "Invited " + invite[1].trim() + ".");
        else if (word === "party") ReactorOnlineChat.note(this.party ? "Your party: " + this.party.members.map(member => member.name).join(", ") : "You are not in a party. /invite Name asks someone.");
        else if (word) this.send({ do: word }, word === "leave" ? "You left the party." : "");
        else return false;
        return true;
    },

    async send(body, done) {
        try {
            await ReactorOnline.post("party", body, this.identity());
            if (done) ReactorOnlineChat.note(done);
            this._next = 0;
            this.keepUp();
        } catch (error) {
            ReactorOnlineChat.note(error.message || "That could not be done.");
        }
    },

    /** Who is with you, under the connection label. */
    showList() {
        if (typeof document === "undefined") return;
        let list = this._list;
        if (!list) {
            list = this._list = document.createElement("div");
            list.id = "reactorOnlineParty";
            list.style.cssText = "position:fixed;right:8px;top:34px;z-index:1000;padding:3px 8px;border-radius:4px;background:rgba(0,0,0,.55);color:#bff5c4;font:12px sans-serif;pointer-events:none;white-space:pre";
            document.body.appendChild(list);
        }
        const members = this.party?.members || [];
        list.style.display = members.length ? "" : "none";
        list.textContent = "Party\n" + members.map(member => (member.name === this.party.leader ? "★ " : "") + member.name + (member.online ? "" : " (away)")).join("\n");
    },

    stop() {
        this.party = null;
        this.following = "";
        this.showList();
    }
};
