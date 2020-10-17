/*
 * Copyright (C) 2020  Yomichan Authors
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

class SelectorObserver {
    constructor({selector, ignoreSelector=null, onAdded=null, onRemoved=null, onChildrenUpdated=null, isStale=null}) {
        this._selector = selector;
        this._ignoreSelector = ignoreSelector;
        this._onAdded = onAdded;
        this._onRemoved = onRemoved;
        this._onChildrenUpdated = onChildrenUpdated;
        this._isStale = isStale;
        this._observingElement = null;
        this._mutationObserver = new MutationObserver(this._onMutation.bind(this));
        this._elementMap = new Map(); // Map([element => observer]...)
        this._elementAncestorMap = new Map(); // Map([element => Set([observer]...)]...)
        this._isObserving = false;
    }

    get isObserving() {
        return this._observingElement !== null;
    }

    observe(element, attributes) {
        if (element === null) {
            throw new Error('Invalid element');
        }
        if (this.isObserving) {
            throw new Error('Instance is already observing an element');
        }

        this._observingElement = element;
        this._mutationObserver.observe(element, {
            attributes: attributes,
            attributeOldValue: attributes,
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
        if (!this.isObserving) { return; }

        this._mutationObserver.disconnect();
        this._observingElement = null;

        for (const observer of this._elementMap.values()) {
            this._removeObserver(observer);
        }
    }

    *entries() {
        for (const [key, {data}] of this._elementMap) {
            yield [key, data];
        }
    }

    *datas() {
        for (const {data} of this._elementMap.values()) {
            yield data;
        }
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
        const selector = this._selector;
        const ELEMENT_NODE = Node.ELEMENT_NODE;

        for (const node of removedNodes) {
            const observers = this._elementAncestorMap.get(node);
            if (typeof observers === 'undefined') { continue; }
            for (const observer of observers) {
                this._removeObserver(observer);
            }
        }

        for (const node of addedNodes) {
            if (node.nodeType !== ELEMENT_NODE) { continue; }
            if (node.matches(selector)) {
                this._createObserver(node);
            }
            for (const childNode of node.querySelectorAll(selector)) {
                this._createObserver(childNode);
            }
        }

        if (
            this._onChildrenUpdated !== null &&
            (addedNodes.length !== 0 || addedNodes.length !== 0)
        ) {
            for (let node = target; node !== null; node = node.parentNode) {
                const observer = this._elementMap.get(node);
                if (typeof observer !== 'undefined') {
                    this._onObserverChildrenUpdated(observer);
                }
            }
        }
    }

    _onAttributeMutation({target}) {
        const selector = this._selector;
        const observers = this._elementAncestorMap.get(target);
        if (typeof observers !== 'undefined') {
            for (const observer of observers) {
                const element = observer.element;
                if (
                    !element.matches(selector) ||
                    this._shouldIgnoreElement(element) ||
                    this._isObserverStale(observer)
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
        if (this._elementMap.has(element) || this._shouldIgnoreElement(element) || this._onAdded === null) { return; }

        const data = this._onAdded(element);
        const ancestors = this._getAncestors(element);
        const observer = {element, ancestors, data};

        this._elementMap.set(element, observer);

        for (const ancestor of ancestors) {
            let observers = this._elementAncestorMap.get(ancestor);
            if (typeof observers === 'undefined') {
                observers = new Set();
                this._elementAncestorMap.set(ancestor, observers);
            }
            observers.add(observer);
        }
    }

    _removeObserver(observer) {
        const {element, ancestors, data} = observer;

        this._elementMap.delete(element);

        for (const ancestor of ancestors) {
            const observers = this._elementAncestorMap.get(ancestor);
            if (typeof observers === 'undefined') { continue; }

            observers.delete(observer);
            if (observers.size === 0) {
                this._elementAncestorMap.delete(ancestor);
            }
        }

        if (this._onRemoved !== null) {
            this._onRemoved(element, data);
        }
    }

    _onObserverChildrenUpdated(observer) {
        this._onChildrenUpdated(observer.element, observer.data);
    }

    _isObserverStale(observer) {
        return (this._isStale !== null && this._isStale(observer.element, observer.data));
    }

    _shouldIgnoreElement(element) {
        return (this._ignoreSelector !== null && element.matches(this._ignoreSelector));
    }

    _getAncestors(node) {
        const root = this._observingElement;
        const results = [];
        while (true) {
            results.push(node);
            if (node === root) { break; }
            node = node.parentNode;
            if (node === null) { break; }
        }
        return results;
    }
}
