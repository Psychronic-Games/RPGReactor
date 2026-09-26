'use strict';
// DiamondandPlatinum3's Actor Voices in Battle: voice tables, note tags and the call naming an actor's folder.
module.exports = {
    key: 'dp3ActorVoices', detect: /\[:BattleVoices\]\s*=\s*true/, plugin: 'RR_DP3ActorVoices',
    event: { set_actor_voice_name: 'this.rrSetActorVoiceName?.(%0, %1)' }
};
