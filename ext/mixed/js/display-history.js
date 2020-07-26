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
    constructor({clearable=true, useBrowserHistory=false}) {
        super();
        this._clearable = clearable;
        this._useBrowserHistory = useBrowserHistory;
        this._historyMap = new Map();
        this._current = this._createHistoryEntry(location.href, history.state, null, null);
    }

    get state() {
        return this._current.state;
    }

    get details() {
        return this._current.details;
    }

    get useBrowserHistory() {
        return this._useBrowserHistory;
    }

    set useBrowserHistory(value) {
        this._useBrowserHistory = value;
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
        return this._go(false);
    }

    forward() {
        return this._go(true);
    }

    pushState(state, details, url) {
        if (typeof url === 'undefined') { url = location.href; }

        const entry = this._createHistoryEntry(url, state, details, this._current);
        this._current.next = entry;
        this._current = entry;
        this._updateHistoryFromCurrent(!this._useBrowserHistory);
    }

    replaceState(state, details, url) {
        if (typeof url === 'undefined') { url = location.href; }

        this._current.url = url;
        this._current.state = state;
        this._current.details = details;
        this._updateHistoryFromCurrent(true);
    }

    _onPopState() {
        this._updateStateFromHistory();
        this._triggerStateChanged(false);
    }

    _go(forward) {
        const target = forward ? this._current.next : this._current.previous;
        if (target === null) {
            return false;
        }

        if (this._useBrowserHistory) {
            if (forward) {
                history.forward();
            } else {
                history.back();
            }
        } else {
            this._current = target;
            this._updateHistoryFromCurrent(true);
        }

        return true;
    }

    _triggerStateChanged(synthetic) {
        this.trigger('stateChanged', {history: this, synthetic});
    }

    _updateHistoryFromCurrent(replace) {
        const {id, state, url} = this._current;
        if (replace) {
            history.replaceState({id, state}, '', url);
        } else {
            history.pushState({id, state}, '', url);
        }
        this._triggerStateChanged(true);
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

    _createHistoryEntry(url, state, details, previous) {
        const id = yomichan.generateId(16);
        const entry = {
            id,
            url,
            next: null,
            previous,
            state,
            details
        };
        this._historyMap.set(id, entry);
        return entry;
    }
}
