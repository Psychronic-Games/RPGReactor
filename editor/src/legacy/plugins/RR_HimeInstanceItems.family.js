'use strict';
// Hime's Instance Items (with its Yanfly Equip Engine patch, which the port carries): the InstanceManager calls
// and the copy-aware methods a Script command may make.

module.exports = {
    key: 'himeInstanceItems', detect: /\$imported\["TH_InstanceItems"\]\s*=\s*true/, plugin: 'RR_HimeInstanceItems',
    modules: {
        InstanceManager: {
            get_instance: '(window.RRInstanceItems?.getInstance(%0) ?? %0)',
            get_template: '(window.RRInstanceItems?.templateOf(%0) ?? %0)',
            'instance_enabled?': ['(window.RRInstanceItems?.isEnabled(%0) ?? false)', 'bool']
        }
    },
    objects: {
        party: {
            find_instance_item: '$.rrFindInstanceItem?.(%0)',
            get_instance: '(window.RRInstanceItems?.getInstance(%0) ?? %0)',
            get_template: '(window.RRInstanceItems?.templateOf(%0) ?? %0)'
        },
        actor: {
            'instance_weapons_include?': '($.rrInstanceWeaponsInclude?.(%0) ?? false)',
            'instance_armors_include?': '($.rrInstanceArmorsInclude?.(%0) ?? false)'
        },
        record: {
            template_id: '(window.RRInstanceItems?.templateId($) ?? $.id)',
            'is_template?': '(window.RRInstanceItems?.isTemplate($) ?? true)',
            refresh: 'window.RRInstanceItems?.refresh($)'
        }
    }
};
