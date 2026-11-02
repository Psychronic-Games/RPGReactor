/**
 * Character Creation as an event command: a mirror, a barber, a tailor. It has
 * nothing to set, so it goes straight into the list. Stored as an MZ plugin command
 * (code 357, plugin "RPGReactor"), read by runtime/reactor_character_creator.js.
 */
class CharacterCommandEditor {
    static NAMES = ['CharacterCreation'];
    static LABELS = { CharacterCreation: 'Character Creation' };

    static supports(name) {
        return CharacterCommandEditor.NAMES.includes(name);
    }

    static build(indent = 0) {
        return { code: 357, indent, parameters: ['RPGReactor', 'CharacterCreation', 'Character Creation', {}] };
    }

    show(command, callback) {
        callback(CharacterCommandEditor.build((command && command.indent) || 0));
    }
}

if (typeof window !== 'undefined') window.CharacterCommandEditor = CharacterCommandEditor;
