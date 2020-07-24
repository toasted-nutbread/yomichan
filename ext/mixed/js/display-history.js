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

class DisplayHistory extends EventDispatcher {
    constructor(clearable) {
        super();
        this._clearable = clearable;
        this._historyMap = new Map();
        this._current = this._createHistoryEntry(null, null, null);
    }

    get state() {
        return this._current.state;
    }

    get details() {
        return this._current.details;
    }

    prepare() {
        window.addEventListener('popstate', this._onPopState.bind(this), false);
    }

    hasNext() {
        return this._current.next !== null;
    }

    hasPrevious() {
        return this._current.previous !== null;
    }

    clear() {
        if (!this._clearable) { return; }
        this._historyMap.clear();
        this._historyMap.set(this._current.id, this._current);
        this._current.next = null;
        this._current.previous = null;
    }

    back() {
        if (!this.hasPrevious()) { return false; }
        window.history.back();
        return true;
    }

    forward() {
        if (!this.hasNext()) { return false; }
        window.history.forward();
        return true;
    }

    pushState(state, details, url) {
        const entry = this._createHistoryEntry(state, details, this._current);
        const id = entry.id;
        this._current.next = entry;
        this._current = entry;
        history.pushState({id, state}, '', url);
        this._triggerStateChanged(true);
    }

    replaceState(state, details, url) {
        const id = this._current.id;
        this._current.state = state;
        this._current.details = details;
        history.replaceState({id, state}, '', url);
        this._triggerStateChanged(true);
    }

    _onPopState() {
        this._updateStateFromHistory();
        this._triggerStateChanged(false);
    }

    _triggerStateChanged(synthetic) {
        this.trigger('stateChanged', {history: this, synthetic});
    }

    _updateStateFromHistory() {
        let state = history.state;
        if (isObject(state)) {
            const id = state.id;
            if (typeof id === 'string') {
                const entry = this._historyMap.get(id);
                if (typeof entry !== 'undefined') {
                    // Valid
                    this._current = entry;
                    return;
                }
            }
            // Partial state recovery
            state = state.state;
        } else {
            state = null;
        }

        // Fallback
        this.clear();
        this._current.state = state;
        this._current.details = null;
    }

    _createHistoryEntry(state, details, previous) {
        const id = yomichan.generateId(16);
        const entry = {
            id,
            next: null,
            previous,
            state,
            details
        };
        this._historyMap.set(id, entry);
        return entry;
    }
}
