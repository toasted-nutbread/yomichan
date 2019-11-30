/*
 * Copyright (C) 2019  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


class SettingsObserver {
    constructor() {
        this._mutationObserver = new MutationObserver((e) => this._onMutation(e));
        this._observingElement = null;
        this._optionsObserversElementMap = new Map();
        this._optionsObserversElementAncestorMap = new Map();
        this._ignoreSelectors = [];
        this._matchSelector = '[data-option-target]';
        this._options = null;
        this._namedOptions = null;
        this._hasOptions = false;
        this._onElementValueChanged = (obj) => this.onElementValueChanged(obj);
    }

    observe(element) {
        if (this._isObserving) { return; }

        this._observingElement = element;
        this._mutationObserver.observe(element, {
            attributes: true,
            attributeOldValue: true,
            childList: true,
            subtree: true
        });
        this._onMutation([{
            type: 'childList',
            target: element.parentNode,
            addedNodes: [element],
            removedNodes: []
        }]);
    }

    disconnect() {
        if (!this._isObserving) { return; }

        this._mutationObserver.disconnect();
        this._observingElement = null;

        for (const observer of this._optionsObserversElementMap.values()) {
            this._removeObserver(observer);
        }
    }

    setOptions(options, namedOptions) {
        this._options = options;
        this._namedOptions = namedOptions;
        this._hasOptions = true;
        for (const observer of this._optionsObserversElementMap.values()) {
            this._updateObserverValue(observer);
        }
    }

    // Overridable

    onElementValueChanged(_elementObserver) {
        // Override
    }

    setElementValue(elementObserver, value) {
        // Override
        elementObserver.value = value;
    }

    onError(error) {
        // Override
        logError(error);
    }

    // Private

    _onMutation(mutationList) {
        for (const mutation of mutationList) {
            switch (mutation.type) {
                case 'childList':
                    this._onChildListMutation(mutation);
                    break;
                case 'attributes':
                    this._onAttributeMutation(mutation);
                    break;
              }
        }
    }

    _onChildListMutation({addedNodes, removedNodes, target}) {
        const selector = this._matchSelector;
        for (const node of removedNodes) {
            const observers = this._optionsObserversElementAncestorMap.get(node);
            if (typeof observers === 'undefined') { continue; }
            for (const observer of observers) {
                this._removeObserver(observer);
            }
        }
        if (addedNodes.length > 0) {
            const observer = this._optionsObserversElementMap.get(target);
            if (typeof observer !== 'undefined') {
                observer.updateChildren();
            }

            for (const node of addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) { continue; }
                if (node.matches(selector)) {
                    this._createObserver(node);
                }
                for (const node2 of node.querySelectorAll(selector)) {
                    this._createObserver(node2);
                }
            }
        }
    }

    _onAttributeMutation({target}) {
        const selector = this._matchSelector;
        const observers = this._optionsObserversElementAncestorMap.get(target);
        if (typeof observers !== 'undefined') {
            for (const observer of observers) {
                const element = observer.element;
                if (
                    !element.matches(selector) ||
                    !this._canObserveElement(element) ||
                    observer.needsUpdate()
                ) {
                    this._removeObserver(observer);
                }
            }
        }

        if (target.matches(selector)) {
            this._createObserver(target);
        }
    }

    _createObserver(element) {
        if (!this._canObserveElement(element)) { return; }

        let observer = this._optionsObserversElementMap.get(element);
        if (typeof observer !== 'undefined') { return; }

        const ancestors = this._getAncestors(element);
        observer = new SettingsElementObserver(this, element, ancestors, this._onElementValueChanged);

        this._optionsObserversElementMap.set(element, observer);

        for (const ancestor of ancestors) {
            let observers = this._optionsObserversElementAncestorMap.get(ancestor);
            if (typeof observers === 'undefined') {
                observers = new Set();
                this._optionsObserversElementAncestorMap.set(ancestor, observers);
            }
            observers.add(observer);
        }

        if (this._hasOptions) {
            this._updateObserverValue(observer);
        }
    }

    _removeObserver(observer) {
        const element = observer.element;
        const ancestors = observer.ancestors;

        this._optionsObserversElementMap.delete(element);

        for (const ancestor of ancestors) {
            const observers = this._optionsObserversElementAncestorMap.get(ancestor);
            if (typeof observers === 'undefined') { continue; }

            observers.delete(observer);
            if (observers.length === 0) {
                this._optionsObserversElementAncestorMap.delete(ancestor);
            }
        }

        observer.cleanup();
    }

    _canObserveElement(element) {
        for (const selector of this._ignoreSelectors) {
            if (element.matches(selector)) {
                return false;
            }
        }
        return true;
    }

    _getAncestors(element) {
        const root = this._observingElement;
        const results = [];
        while (true) {
            results.push(element);
            if (element === root) { break; }
            element = element.parentNode;
            if (element === null) { break; }
        }
        return results;
    }

    _updateObserverValue(observer) {
        try {
            const scope = observer.scope;
            const root = scope && hasOwn(this._namedOptions, scope) ? this._namedOptions[scope] : this._options;
            if (root === null || typeof(root) !== 'object') { return; }

            const value = getPropertyValue(root, observer.pathArray);
            this.setElementValue(observer, value);
        } catch (e) {
            this.onError(e);
        }
    }
}

class SettingsElementObserver {
    constructor(parent, element, ancestors, onChange) {
        element.style.outline = '4px solid orange'; // TODO : Remove
        this._parent = parent;
        this._element = element;
        this._ancestors = ancestors;
        this._scope = element.dataset.optionScope;
        this._pathString = element.dataset.optionTarget;
        this._pathArray = getPropertyPathArray(this._pathString);
        this._nodeName = element.nodeName.toUpperCase();
        this._type = (this._nodeName === 'INPUT' ? element.type : null);
        this._value = null;
        this._hasValue = false;
        this._changeEventListener = () => this._onElementChange(onChange);
        element.addEventListener('change', this._changeEventListener, false);
    }

    cleanup() {
        if (this._element === null) { return; }

        this._element.style.outline = ''; // TODO : Remove
        this._element.removeEventListener('change', this._changeEventListener, false);
        this._changeEventListener = null;
        this._element = null;
    }

    needsUpdate() {
        const element = this._element;
        return (
            this._scope !== element.dataset.optionScope ||
            this._pathString !== element.dataset.optionTarget ||
            this._type !== (this._nodeName === 'INPUT' ? element.type : null)
        );
    }

    updateChildren() {
        if (this._hasValue) {
            this.value = this._value;
        }
    }

    get element() { return this._element; }
    get ancestors() { return this._ancestors; }
    get scope() { return this._scope; }
    get value() { return this._value; }
    get pathString() { return this._pathString; }
    get pathArray() { return this._pathArray; }

    set value(value) {
        this._value = value;
        this._hasValue = true;
        this._setElementValue(value);
    }

    _setElementValue(value) {
        switch (this._nodeName) {
            case 'INPUT':
                switch (this._type) {
                    case 'checkbox':
                        this._element.checked = value;
                        break;
                    case 'text':
                    case 'number':
                        this._element.value = value;
                        break;
                }
                break;
            case 'TEXTAREA':
            case 'SELECT':
                this._element.value = value;
                break;
        }
    }

    _getElementValue() {
        switch (this._nodeName) {
            case 'INPUT':
                switch (this._type) {
                    case 'checkbox':
                        return !!this._element.checked;
                    case 'text':
                        return `${this._element.value}`;
                    case 'number':
                        return SettingsElementObserver._getInputNumberValue(this._element);
                }
                break;
            case 'TEXTAREA':
                return this._element.value;
            case 'SELECT':
                return this._element.value;
        }
        return null;
    }

    _onElementChange(onChange) {
        this._value = this._getElementValue();
        onChange(this);
    }

    static _getInputNumberValue(element) {
        let value = parseFloat(element.value);
        if (!Number.isFinite(value)) { return 0; }

        const {min, max, step} = element;
        if (typeof min === 'number') { value = Math.max(value, min); }
        if (typeof max === 'number') { value = Math.min(value, max); }
        if (typeof step === 'number' && step !== 0) { value = Math.round(value / step) * step; }
        return value;
    }
}
