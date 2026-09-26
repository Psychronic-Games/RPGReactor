'use strict';
// TheoAllen's The Art of Screenshake: shake_screen(duration, power).
module.exports = {
    key: 'theoScreenShake', detect: /theo_vlambeer_update_vport|def shake_screen\(duration, power\)/, plugin: 'RR_TheoScreenShake',
    event: { shake_screen: 'this.rrShakeScreen?.(%*)' }
};
