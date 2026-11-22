# Putting your game on Steam

RPG Reactor can connect a game you make to Steam under your own Steam app: its achievements unlock on the player's Steam account. This is your game's Steam app, set up by you in Steamworks; it has nothing to do with RPG Reactor's own Steam page.

## 1. In Steamworks

1. Make your app in Steamworks and note its **App ID** (a number).
2. In **Stats & Achievements > Achievements**, create each achievement. Give each an **API name** (letters, numbers and `_`, for example `FIRST_WIN`), a name, a description and two icons. Publish.

## 2. In RPG Reactor

1. **Database > System 2 > Steam:** tick **This game uses Steam** and enter the **Steam App ID**.
2. Wherever an achievement is earned (a boss beaten, a quest done), add the event command **Reactor > Game Flow > Steam Achievement** with its API name, exactly as in Steamworks.

Options on the same card:

- **Use Steam in playtests:** achievements unlock on your own Steam account while you test (Steam must be running, with the game in your library). Off, a playtest only notes each achievement in the console (F8).
- **Start through Steam:** a copy started outside Steam closes and Steam starts it again. Leave it off until the game is on Steam.

## 3. Build and upload

Build the game for Windows, macOS or Linux as usual (**Build**). A game that uses Steam gets what Steam needs (`package.nw/node_modules/steamworks.js`) in its folder. Upload that folder to your depot with SteamPipe. A web build plays without Steam.

## For scripters

`ReactorSteam.unlock('FIRST_WIN')`, `ReactorSteam.clear(name)`, `ReactorSteam.isUnlocked(name)`, `ReactorSteam.stat(name)`, `ReactorSteam.setStat(name, value)` (integer stats made in Steamworks), and `ReactorSteam.available()`. Every call does nothing when Steam is not connected.
