/*
 * Copyright (C) 2021  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* global
 * DocumentUtil
 */

/**
 * Class which handles hotkey events and actions.
 */
class HotkeyHandler extends EventDispatcher {
    /**
     * Creates a new instance of the class.
     * @param scope The scope required for hotkey definitions.
     * @param canForward Whether or not hotkeys for different scopes can be forwarded.
     */
    constructor(scope, canForward) {
        super();
        this._scope = scope;
        this._canForward = canForward;
        this._hotkeys = new Map();
        this._actions = new Map();
        this._eventListeners = new EventListenerCollection();
        this._isPrepared = false;
        this._hasEventListeners = false;
    }

    /**
     * Gets the scope required for the hotkey definitions.
     */
    get scope() {
        return this._scope;
    }

    /**
     * Gets whether or not this handler can forward hotkeys.
     */
    get canForward() {
        return this._canForward;
    }

    /**
     * Begins listening to key press events in order to detect hotkeys.
     */
    prepare() {
        this._isPrepared = true;
        this._updateEventHandlers();
    }

    /**
     * Stops listening to key press events.
     */
    cleanup() {
        this._isPrepared = false;
        this._updateEventHandlers();
    }

    /**
     * Registers a set of actions that this hotkey handler supports.
     * @param actions An array of `[name, handler]` entries, where `name` is a string and `handler` is a function.
     */
    registerActions(actions) {
        for (const [name, handler] of actions) {
            this._actions.set(name, handler);
        }
    }

    /**
     * Registers a set of hotkeys
     * @param hotkeys An array of hotkey definitions of the format `{action, key, modifiers, scopes, enabled}`.
     * * `action` - a string indicating which action to perform.
     * * `key` - a keyboard key code indicating which key needs to be pressed.
     * * `modifiers` - an array of keyboard modifiers which also need to be pressed. Supports: `'alt', 'ctrl', 'shift', 'meta'`.
     * * `scopes` - an array of scopes for which the hotkey is valid. If this array does not contain `this.scope`, the hotkey will not be registered.
     * * `enabled` - a boolean indicating whether the hotkey is currently enabled.
     */
    registerHotkeys(hotkeys) {
        for (const {action, key, modifiers, scopes, enabled} of hotkeys) {
            if (enabled && key !== null && action !== '') {
                const correctScope = scopes.includes(this._scope);
                if (!correctScope && !this._canForward) { continue; }
                this._registerHotkey(key, modifiers, action, correctScope);
            }
        }
        this._updateEventHandlers();
    }

    /**
     * Removes all registered hotkeys.
     */
    clearHotkeys() {
        this._hotkeys.clear();
    }

    /**
     * Adds a single event listener to a specific event.
     * @param eventName The string representing the event's name.
     * @param callback The event listener callback to add.
     */
    on(eventName, callback) {
        const result = super.on(eventName, callback);
        this._updateHasEventListeners();
        this._updateEventHandlers();
        return result;
    }

    /**
     * Removes a single event listener from a specific event.
     * @param eventName The string representing the event's name.
     * @param callback The event listener callback to add.
     * @returns `true` if the callback was removed, `false` otherwise.
     */
    off(eventName, callback) {
        const result = super.off(eventName, callback);
        this._updateHasEventListeners();
        this._updateEventHandlers();
        return result;
    }

    /**
     * Attempts to simulate an action for a given combination of key and modifiers.
     * @param key A keyboard key code indicating which key needs to be pressed.
     * @param modifiers An array of keyboard modifiers which also need to be pressed. Supports: `'alt', 'ctrl', 'shift', 'meta'`.
     * @returns `true` if an action was performed, `false` otherwise.
     */
    simulate(key, modifiers) {
        const handlers = this._hotkeys.get(key);
        return (
            typeof handlers !== 'undefined' &&
            this._invokeHandlers(key, modifiers, handlers, false)
        );
    }

    // Private

    _onKeyDown(e) {
        const key = e.code;
        const handlers = this._hotkeys.get(key);
        if (typeof handlers !== 'undefined') {
            const eventModifiers = DocumentUtil.getActiveModifiers(e);
            if (this._invokeHandlers(key, eventModifiers, handlers, this._canForward)) {
                e.preventDefault();
                return;
            }
        }
        this.trigger('keydownNonHotkey', e);
    }

    _invokeHandlers(key, modifiers, handlers, canForward) {
        let any = false;
        for (const {modifiers: handlerModifiers, action, correctScope} of handlers) {
            if (!this._areSame(handlerModifiers, modifiers)) { continue; }

            any = true;
            if (!correctScope) { continue; }

            const actionHandler = this._actions.get(action);
            if (typeof actionHandler !== 'undefined') {
                const result = actionHandler();
                if (result !== false) {
                    return true;
                }
            }
        }

        if (any && canForward) {
            const e = {key, modifiers, result: false};
            this.trigger('hotkeyForward', e);
            if (e.result !== false) {
                return true;
            }
        }

        return false;
    }

    _registerHotkey(key, modifiers, action, correctScope) {
        let handlers = this._hotkeys.get(key);
        if (typeof handlers === 'undefined') {
            handlers = [];
            this._hotkeys.set(key, handlers);
        }
        handlers.push({modifiers: new Set(modifiers), action, correctScope});
    }

    _areSame(set, array) {
        if (set.size !== array.length) { return false; }
        for (const value of array) {
            if (!set.has(value)) {
                return false;
            }
        }
        return true;
    }

    _updateHasEventListeners() {
        this._hasEventListeners = (
            this.hasListeners('keydownNonHotkey') ||
            this.hasListeners('hotkeyForward')
        );
    }

    _updateEventHandlers() {
        if (this._isPrepared && (this._hotkeys.size > 0 || this._hasEventListeners)) {
            if (this._eventListeners.size !== 0) { return; }
            this._eventListeners.addEventListener(document, 'keydown', this._onKeyDown.bind(this), false);
        } else {
            this._eventListeners.removeAllEventListeners();
        }
    }
}
