'use strict';
// Plugin parameters for RR_MailSystem from the game's copy of the Mail System (MAIL_SYSTEM::MENU_NAME) and
// whether its toast add-on (and the sound it plays) was in the game.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const addon = scripts.map(text).find(s => /mail_toast_add_mail_original/.test(s)) || '';
    const sound = /Audio\.me_play\("Audio\/SE\/([^"]+)"/.exec(addon);
    return { menuName: String(constants['MAIL_SYSTEM::MENU_NAME'] || 'Comms'), toast: String(!!addon), toastSound: sound ? sound[1] : '' };
}

module.exports = { extract };
