'use strict';
// Yanfly's Shown Skills Fix as Thrall edited it (overdrive and weapon skills first, Resuscitate while someone is down).
module.exports = {
    key: 'thrallShownSkills', detect: /\$imported\["ShownSkillsFix"\] = true[\s\S]*def overdrive_skill\?\(obj\)/, plugin: 'RR_ThrallShownSkills'
};
