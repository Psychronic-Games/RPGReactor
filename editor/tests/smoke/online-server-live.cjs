#!/usr/bin/env node
'use strict';
// Checks a deployed online server from the outside, as players and the owner reach it.
//   node tests/smoke/online-server-live.cjs https://example.com <admin password>
// It creates test accounts and chat messages on that server, so use a test world.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const base = String(process.argv[2] || '').replace(/\/+$/, '') + '/reactor-online', adminKey = process.argv[3];
const api = base + '/api.php';
const random = crypto.randomBytes(4).toString('hex');
const results = [];
const check = async (name, run) => { try { await run(); results.push('ok   ' + name); } catch (error) { results.push('FAIL ' + name + ': ' + error.message.split('\n')[0]); process.exitCode = 1; } };
const post = (action, body, query = '') => fetch(`${api}?a=${action}${query}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain' } });
const answer = async (response, status) => { const text = await response.text(); assert.equal(response.status, status, text.slice(0, 120)); return text.startsWith('{') ? JSON.parse(text) : text; };
const sleep = ms => new Promise(done => setTimeout(done, ms));

(async () => {
    const name = 'Test' + random, password = 'correct-horse-' + random;
    let account, player, other;

    await check('info answers', async () => assert.equal((await answer(await fetch(api), 200)).engine, 'RPG Reactor'));
    await check('internals print nothing', async () => {
        for (const file of ['common.php', 'config.php']) assert.equal(await answer(await fetch(base + '/' + file), 200), '');
    });
    await check('a weak password is refused', async () => answer(await post('register', { username: name, password: 'x' }), 422));
    await check('a bad name is refused', async () => answer(await post('register', { username: '<script>', password }), 422));
    await check('a blocked word cannot be a name', async () => answer(await post('register', { username: 'heck', password }), 422));
    await check('an account can be made', async () => {
        account = await answer(await post('register', { username: name, password }), 200);
        assert.equal(account.name, name);
        assert.equal('password' in account, false, 'the hash stays on the server');
    });
    await check('a name can be taken once, in any case', async () => answer(await post('register', { username: name.toUpperCase(), password }), 409));
    await check('the right password signs in', async () => assert.equal((await answer(await post('login', { username: name, password }), 200)).name, name));
    await check('a wrong password does not, and says nothing more', async () => {
        const wrong = await answer(await post('login', { username: name, password: 'nope-nope' }), 401);
        const unknown = await answer(await post('login', { username: 'Nobody' + random, password: 'nope-nope' }), 401);
        assert.equal(wrong, unknown);
    });
    await check('a pass is checked', async () => {
        await answer(await post('me', { session: account.session }), 200);
        await answer(await post('me', { session: account.session.slice(0, -2) + 'zz' }), 401);
    });
    await check('repeated failures are locked out', async () => {
        const target = 'Lock' + random;
        await answer(await post('register', { username: target, password }), 200);
        for (let i = 0; i < 8; i++) await answer(await post('login', { username: target, password: 'wrong-wrong' }), 401);
        await answer(await post('login', { username: target, password }), 429);
    });
    await check('players join', async () => {
        player = await answer(await post('join', { session: account.session }, '&n=' + name + '&c=1'), 200);
        other = await answer(await post('join', {}, '&n=' + name + '&c=1'), 200);
        assert.notEqual(player.slot, other.slot);
    });
    const auth = who => `&s=${who.slot}&g=${who.nonce}&t=${who.token}`;
    await check('a guest cannot wear an account\'s name', async () => {
        const seen = await answer(await fetch(`${api}?a=who&ids=${other.slot}`), 200);
        assert.match(seen.players[other.slot].name, /\(guest\)/);
    });
    await check('addresses stay private', async () => {
        const seen = await answer(await fetch(`${api}?a=who&ids=${player.slot}`), 200);
        assert.equal('ip' in seen.players[player.slot], false);
        assert.equal('account' in seen.players[player.slot], false);
    });
    let firstCount = 0;
    await check('a message is posted, and blocked words become stars', async () => {
        firstCount = player.chat;
        const said = await answer(await post('say', { text: 'well HECK that is <b>fun</b>' }, auth(player) + '&m=7'), 200);
        assert.equal(said.text, 'well **** that is <b>fun</b>');
    });
    await check('nobody can say anything too quickly', async () => answer(await post('say', { text: 'again' }, auth(player) + '&m=7'), 429));
    await check('a stranger cannot post', async () => answer(await post('say', { text: 'hi' }, '&s=0&g=a&t=b&m=7'), 401));
    await check('a sync reports new messages without another request', async () => {
        const buffer = await (await fetch(`${api}?a=sync${auth(other)}&m=7&x=32&y=32&f=2&c=1`)).arrayBuffer();
        assert.ok(new DataView(buffer).getUint32(2, true) > firstCount);
    });
    await check('map chat reaches its map only', async () => {
        const here = await answer(await fetch(`${api}?a=chat&after=${firstCount}&m=7`), 200);
        const there = await answer(await fetch(`${api}?a=chat&after=${firstCount}&m=8`), 200);
        assert.ok(here.messages.some(message => message.text.includes('fun')));
        assert.equal(there.messages.some(message => message.text.includes('fun')), false);
    });
    await check('world chat reaches every map', async () => {
        await sleep(100);
        await answer(await post('say', { text: 'hello world ' + random, world: true }, auth(other) + '&m=7'), 200);
        assert.ok((await answer(await fetch(`${api}?a=chat&after=${firstCount}&m=8`), 200)).messages.some(message => message.text.includes(random)));
    });
    await check('an account keeps its character', async () => {
        await answer(await post('profile', { session: account.session, character: { actorId: 2, id: '', name: 'Ada' } }), 200);
        assert.equal((await answer(await post('login', { username: name, password }), 200)).character.actorId, 2);
    });

    if (adminKey) {
        let cookie = '', csrf = '';
        const page = async () => { const response = await fetch(base + '/admin.php', { headers: { Cookie: cookie } }); return response.text(); };
        const form = (fields, withCookie = cookie) => fetch(base + '/admin.php', { method: 'POST', redirect: 'manual', headers: { Cookie: withCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
        await check('the admin page needs its password', async () => {
            assert.equal((await page()).includes('Playing now'), false);
            assert.match(await (await form({ do: 'signin', password: 'wrong' }, '')).text(), /not the password/);
        });
        await check('the owner can sign in', async () => {
            const response = await form({ do: 'signin', password: adminKey }, '');
            assert.equal(response.status, 303);
            cookie = response.headers.get('set-cookie').split(';')[0];
            const html = await page();
            assert.match(html, /Playing now/);
            csrf = /name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
        });
        await check('text on the admin page is escaped', async () => assert.equal((await page()).includes('<b>fun</b>'), false));
        await check('an action needs the page\'s token', async () => assert.equal((await form({ do: 'remove', slot: other.slot, csrf: 'bad' })).status, 403));
        await check('a removed player is told so', async () => {
            await form({ do: 'remove', slot: other.slot, csrf });
            await answer(await fetch(`${api}?a=sync${auth(other)}&m=7&x=32&y=32&f=2&c=1`), 403);
        });
        await check('a reset password replaces the old one and ends old passes', async () => {
            const html = await page();
            const key = crypto.createHash('sha256').update(name.toLowerCase()).digest('hex');
            assert.ok(html.includes(key));
            const done = await (await form({ do: 'reset', key, csrf })).text();
            const fresh = /New password for [^:]+: ([0-9a-f]+)/.exec(done)[1];
            await answer(await post('login', { username: name, password }), 401);
            await answer(await post('login', { username: name, password: fresh }), 200);
            await answer(await post('me', { session: account.session }), 401);
        });
        await check('a banned account cannot sign in', async () => {
            const key = crypto.createHash('sha256').update(name.toLowerCase()).digest('hex');
            await form({ do: 'ban-account', key, csrf });
            await answer(await post('login', { username: name, password: 'whatever-x' }), 401);
            await form({ do: 'delete-account', key, csrf });
            await form({ do: 'delete-account', key: crypto.createHash('sha256').update(('Lock' + random).toLowerCase()).digest('hex'), csrf });
        });
        await check('the owner can take down a message', async () => {
            const said = await answer(await post('join', {}, '&n=Tmp&c=1'), 200);
            await sleep(2500);     // the slot may carry its last player's wait
            const message = await answer(await post('say', { text: 'remove me ' + random }, auth(said) + '&m=9'), 200);
            await form({ do: 'delete-message', id: message.id, csrf });
            const chat = await answer(await fetch(`${api}?a=chat&after=0&m=9`), 200);
            assert.equal(chat.messages.some(item => item.id === message.id), false);
            assert.ok(chat.gone.includes(message.id));
            await answer(await post('leave', {}, auth(said) + '&m=9'), 200);
        });
    }
    console.log(results.join('\n'));
})();
