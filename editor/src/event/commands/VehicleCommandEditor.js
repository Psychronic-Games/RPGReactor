/** Reactor vehicles use MZ plugin commands; stock vehicle opcodes retain their meaning. */
class VehicleCommandEditor {
    static LABELS = { GetOnVehicle: 'Get On Reactor Vehicle', GetOffVehicle: 'Get Off Reactor Vehicle' };
    static NEAREST = 'nearest';
    static supports(name) { return Object.hasOwn(VehicleCommandEditor.LABELS, name); }
    static build(name, args, indent = 0) {
        return { code: 357, indent, parameters: ['RPGReactor', name, VehicleCommandEditor.LABELS[name], { ...args }] };
    }
    /** The Database's vehicles as `{ value, label }`, each copy of one its own entry: a command names one by its identity. */
    static vehicleChoices(vehicles) {
        return RRVehicles.placedVehicles(vehicles).map(entry => ({ value: entry.value, label: entry.label }));
    }
    static STOCK = [['boat', 'Boat'], ['ship', 'Ship'], ['airship', 'Airship']];
    /** The events of a map that are vehicles (the Event Editor's Vehicle row), as `{ value, label }`: named by their event number. */
    static eventChoices(map, vehicles) {
        const list = [];
        for (const event of (map && Array.isArray(map.events) ? map.events : [])) {
            const row = event && typeof RRVehicles !== 'undefined' ? RRVehicles.vehicleOf(event) : null;
            if (row) list.push({ value: String(event.id), label: 'EV' + String(event.id).padStart(3, '0') + ': ' + (event.name || (vehicles && vehicles[row.type] && vehicles[row.type].name) || '') });
        }
        return list;
    }
    /**
     * What the dropdown offers for a stored target: the nearest vehicle; this event, when it is one; the boat, the
     * ship and the airship; each vehicle of the Vehicles page; each vehicle event of the map; and the stored one
     * when it is none of these. `context`: `{ map, event }`, the map and the event the command is edited in.
     */
    static choices(stored, vehicles, t = key => key, context = null) {
        const tt = text => (typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text);
        const list = [{ value: VehicleCommandEditor.NEAREST, label: t('vehicle.nearest') }];
        const own = context && context.event && typeof RRVehicles !== 'undefined' && RRVehicles.vehicleOf(context.event);
        const value = String(stored ?? '').trim();
        if (own || value === 'this') list.push({ value: 'this', label: t('vehicle.thisEvent') });
        for (const [name, word] of VehicleCommandEditor.STOCK) list.push({ value: name, label: tt(word) });
        list.push(...VehicleCommandEditor.vehicleChoices(vehicles));
        list.push(...VehicleCommandEditor.eventChoices(context && context.map, vehicles));
        if (value && !list.some(choice => choice.value === value)) list.push({ value, label: value });
        return list;
    }
    static summary(name, args = {}, vehicles, t, context) {
        if (name !== 'GetOnVehicle') return '';
        const say = t || (key => window.I18n ? window.I18n.t(key) : key);
        const list = vehicles || (typeof window !== 'undefined' ? window.reactor?.databaseManager?.data?.vehicles : null);
        const around = context || (typeof window !== 'undefined' ? { map: window.reactor?.eventManager?.currentMap || null, event: null } : null);
        const value = String(args.vehicle || 'this');
        return VehicleCommandEditor.choices(value, list, say, around).find(choice => choice.value === value).label;
    }
    constructor(databaseManager, context) { this.databaseManager = databaseManager || null; this.context = typeof context === 'function' ? context : () => null; }
    show(command, callback, hint) {
        const name = VehicleCommandEditor.supports(command?.parameters?.[1]) ? command.parameters[1] : hint;
        const args = command?.parameters?.[3] || {};
        const t = key => window.I18n ? window.I18n.t(key) : key;
        const e = rrEscapeHtml, modal = document.createElement('div');
        // A stored command without a target reads "this" in the game; a new one starts on the nearest vehicle.
        const stored = command ? String(args.vehicle || 'this') : VehicleCommandEditor.NEAREST;
        const options = VehicleCommandEditor.choices(stored, this.databaseManager?.data?.vehicles, t, this.context())
            .map(choice => `<option value="${e(choice.value)}" ${choice.value === stored ? 'selected' : ''}>${e(choice.label)}</option>`).join('');
        modal.className = 'rr-modal-overlay'; modal.style.zIndex = '21000';
        modal.innerHTML = `<div class="rr-modal" style="width:min(460px,90vw)"><div class="rr-modal-header"><div class="rr-modal-title">${e(t(name === 'GetOnVehicle' ? 'vehicle.getOn' : 'vehicle.getOff'))}</div><button class="rr-modal-close vc-cancel">&times;</button></div><div class="rr-modal-body fc-body">
            ${name === 'GetOnVehicle' ? `<div class="fc-row"><span class="fc-label">${e(t('vehicle.target'))}</span><div class="fc-field"><select class="vc-target database-field-value" data-rr-i18n-skip>${options}</select></div></div>` : ''}
            <label class="fc-check fc-wide"><input class="vc-instant system-checkbox" type="checkbox" ${String(args.instant) === 'true' ? 'checked' : ''}><span>${e(t('vehicle.instant'))}</span></label>
            <label class="fc-check fc-wide"><input class="vc-wait system-checkbox" type="checkbox" ${String(args.wait) !== 'false' ? 'checked' : ''}><span>${e(t('vehicle.wait'))}</span></label>
            </div><div class="rr-modal-footer"><button class="rr-btn-secondary vc-cancel">${e(t('common.cancel'))}</button><button class="rr-button-primary vc-ok">${e(t('common.ok'))}</button></div></div>`;
        document.body.appendChild(modal);
        const close = () => { document.removeEventListener('keydown', onKey, true); modal.remove(); };
        const cancel = () => { close(); callback(null); };
        const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancel(); } };
        document.addEventListener('keydown', onKey, true);
        modal.querySelectorAll('.vc-cancel').forEach(button => button.addEventListener('click', cancel));
        modal.querySelector('.vc-ok').addEventListener('click', () => {
            const built = { ...args, instant: String(modal.querySelector('.vc-instant').checked), wait: String(modal.querySelector('.vc-wait').checked) };
            if (name === 'GetOnVehicle') built.vehicle = modal.querySelector('.vc-target').value || VehicleCommandEditor.NEAREST;
            close(); callback(VehicleCommandEditor.build(name, built, command?.indent || 0));
        });
        (modal.querySelector('.vc-target') || modal.querySelector('.vc-ok')).focus();
    }
}
if (typeof globalThis !== 'undefined') globalThis.VehicleCommandEditor = VehicleCommandEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = VehicleCommandEditor;
