/*
 * Copyright (C) 2020-2021  Yomichan Authors
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

class KeyboardMouseInputField extends EventDispatcher {
    constructor(inputNode, mouseButton, os, isPointerTypeSupported=null) {
        super();
        this._inputNode = inputNode;
        this._mouseButton = mouseButton;
        this._isPointerTypeSupported = isPointerTypeSupported;
        this._keySeparator = ' + ';
        this._inputNameMap = new Map(DocumentUtil.getModifierKeys(os));
        this._modifierPriorities = new Map([
            ['meta', -4],
            ['ctrl', -3],
            ['alt', -2],
            ['shift', -1]
        ]);
        this._mouseInputNamePattern = /^mouse(\d+)$/;
        this._eventListeners = new EventListenerCollection();
        this._modifiers = [];
        this._type = null;
        this._penPointerIds = new Set();
    }

    get modifiers() {
        return this._modifiers;
    }

    prepare(modifiers, type) {
        this.cleanup();

        this._modifiers = this._sortModifiers(modifiers);
        this._type = type;
        this._updateDisplayString();
        const events = [
            [this._inputNode, 'keydown', this._onModifierKeyDown.bind(this), false]
        ];
        if (type === 'modifierInputs' && this._mouseButton !== null) {
            events.push(
                [this._mouseButton, 'mousedown', this._onMouseButtonMouseDown.bind(this), false],
                [this._mouseButton, 'pointerdown', this._onMouseButtonPointerDown.bind(this), false],
                [this._mouseButton, 'pointerover', this._onMouseButtonPointerOver.bind(this), false],
                [this._mouseButton, 'pointerout', this._onMouseButtonPointerOut.bind(this), false],
                [this._mouseButton, 'pointercancel', this._onMouseButtonPointerCancel.bind(this), false],
                [this._mouseButton, 'mouseup', this._onMouseButtonMouseUp.bind(this), false],
                [this._mouseButton, 'contextmenu', this._onMouseButtonContextMenu.bind(this), false]
            );
        }
        for (const args of events) {
            this._eventListeners.addEventListener(...args);
        }
    }

    cleanup() {
        this._eventListeners.removeAllEventListeners();
        this._modifiers = [];
        this._type = null;
        this._penPointerIds.clear();
    }

    clearInputs() {
        this._updateModifiers([]);
    }

    // Private

    _sortModifiers(modifiers) {
        const pattern = this._mouseInputNamePattern;
        const keyPriorities = this._modifierPriorities;
        const modifierInfos = modifiers.map((modifier, index) => {
            const match = pattern.exec(modifier);
            if (match !== null) {
                return [modifier, 1, Number.parseInt(match[1], 10), index];
            } else {
                let priority = keyPriorities.get(modifier);
                if (typeof priority === 'undefined') { priority = 0; }
                return [modifier, 0, priority, index];
            }
        });
        modifierInfos.sort((a, b) => {
            let i = a[1] - b[1];
            if (i !== 0) { return i; }

            i = a[2] - b[2];
            if (i !== 0) { return i; }

            i = a[0].localeCompare(b[0], 'en-US'); // Ensure an invariant culture
            if (i !== 0) { return i; }

            i = a[3] - b[3];
            return i;
        });
        return modifierInfos.map(([modifier]) => modifier);
    }

    _updateDisplayString() {
        let displayValue = '';
        let first = true;
        for (const modifier of this._modifiers) {
            const {name} = this._getModifierName(modifier);
            if (first) {
                first = false;
            } else {
                displayValue += this._keySeparator;
            }
            displayValue += name;
        }
        this._inputNode.value = displayValue;
    }

    _getModifierName(modifier) {
        const pattern = this._mouseInputNamePattern;
        const match = pattern.exec(modifier);
        if (match !== null) {
            return {name: `Mouse ${match[1]}`, type: 'mouse'};
        }

        let name = this._inputNameMap.get(modifier);
        if (typeof name === 'undefined') { name = modifier; }
        return {name, type: 'key'};
    }

    _getModifierKeys(e) {
        const modifiers = new Set(DocumentUtil.getActiveModifiers(e));
        // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey
        // https://askubuntu.com/questions/567731/why-is-shift-alt-being-mapped-to-meta
        // It works with mouse events on some platforms, so try to determine if metaKey is pressed.
        // This is a hack and only works when both Shift and Alt are not pressed.
        if (
            !modifiers.has('meta') &&
            DocumentUtil.getKeyFromEvent(e) === 'Meta' &&
            !(
                modifiers.size === 2 &&
                modifiers.has('shift') &&
                modifiers.has('alt')
            )
        ) {
            modifiers.add('meta');
        }
        return modifiers;
    }

    _onModifierKeyDown(e) {
        e.preventDefault();

        const key = DocumentUtil.getKeyFromEvent(e);
        switch (key) {
            case 'Escape':
            case 'Backspace':
                this.clearInputs();
                break;
            default:
                this._addModifiers(this._getModifierKeys(e));
                break;
        }
    }

    _onMouseButtonMouseDown(e) {
        e.preventDefault();
        this._addModifiers(DocumentUtil.getActiveButtons(e));
    }

    _onMouseButtonPointerDown(e) {
        if (!e.isPrimary) { return; }

        let {pointerType, pointerId} = e;
        // Workaround for Firefox bug not detecting certain 'touch' events as 'pen' events.
        if (this._penPointerIds.has(pointerId)) { pointerType = 'pen'; }

        if (
            typeof this._isPointerTypeSupported !== 'function' ||
            !this._isPointerTypeSupported(pointerType)
        ) {
            return;
        }
        e.preventDefault();
        this._addModifiers(DocumentUtil.getActiveButtons(e));
    }

    _onMouseButtonPointerOver(e) {
        const {pointerType, pointerId} = e;
        if (pointerType === 'pen') {
            this._penPointerIds.add(pointerId);
        }
    }

    _onMouseButtonPointerOut(e) {
        const {pointerId} = e;
        this._penPointerIds.delete(pointerId);
    }

    _onMouseButtonPointerCancel(e) {
        this._onMouseButtonPointerOut(e);
    }

    _onMouseButtonMouseUp(e) {
        e.preventDefault();
    }

    _onMouseButtonContextMenu(e) {
        e.preventDefault();
    }

    _addModifiers(newModifiers) {
        const modifiers = new Set(this._modifiers);
        for (const modifier of newModifiers) {
            modifiers.add(modifier);
        }
        this._updateModifiers([...modifiers]);
    }

    _updateModifiers(modifiers) {
        modifiers = this._sortModifiers(modifiers);

        let changed = false;
        if (!this._areArraysEqual(this._modifiers, modifiers)) {
            this._modifiers = modifiers;
            changed = true;
        }

        this._updateDisplayString();
        if (changed) {
            this.trigger('change', {modifiers});
        }
    }

    _areArraysEqual(array1, array2) {
        const length = array1.length;
        if (length !== array2.length) { return false; }

        for (let i = 0; i < length; ++i) {
            if (array1[i] !== array2[i]) { return false; }
        }

        return true;
    }
}
