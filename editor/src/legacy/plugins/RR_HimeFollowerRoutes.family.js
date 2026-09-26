'use strict';
// Hime's Follower Move Routes: <move character: -n> comments pick a follower (read by the plugin at run time),
// and three move-route calls.
module.exports = {
    key: 'himeFollowerRoutes', detect: /TH_FollowerMoveRoutes/, plugin: 'RR_HimeFollowerRoutes',
    route: { sync_to_leader: 'this.rrSyncToLeader?.()', unsync_from_leader: 'this.rrUnsyncFromLeader?.()', chase_leader: 'this.rrChaseLeader?.(%0)' }
};
