/*
 * Copyright (C) 2019-2021  Yomichan Authors
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


class Mecab {
    constructor() {
        this._port = null;
        this._sequence = 0;
        this._invocations = new Map();
        this._eventListeners = new EventListenerCollection();
        this._timeout = 5000;
        this._version = 1;
        this._enabled = false;
        this._setupPortPromise = null;
    }

    async getVersion() {
        await this._setupPort();
        const {version} = await this._invoke('get_version', {});
        return version;
    }

    /**
     * Return value format:
     * ```js
     * [
     *     {
     *         name: (string),
     *         lines: [
     *             {expression: (string), reading: (string), source: (string)},
     *             ...
     *         ]
     *     },
     *     ...
     * ]
     * ```
     */
    async parseText(text) {
        await this._setupPort();
        const rawResults = await this._invoke('parse_text', {text});
        return this._convertParseTextResults(rawResults);
    }

    isEnabled() {
        return this._enabled;
    }

    setEnabled(enabled) {
        this._enabled = !!enabled;
        if (!this._enabled && this._port !== null) {
            this._clearPort();
        }
    }

    // Private

    _onMessage({sequence, data}) {
        const invocation = this._invocations.get(sequence);
        if (typeof invocation === 'undefined') { return; }

        const {resolve, timer} = invocation;
        clearTimeout(timer);
        resolve(data);
        this._invocations.delete(sequence);
    }

    _onDisconnect() {
        if (this._port === null) { return; }
        const e = chrome.runtime.lastError;
        const error = new Error(e ? e.message : 'MeCab disconnected');
        for (const {reject, timer} of this._invocations.values()) {
            clearTimeout(timer);
            reject(error);
        }
        this._clearPort();
    }

    _invoke(action, params) {
        return new Promise((resolve, reject) => {
            const sequence = this._sequence++;

            const timer = setTimeout(() => {
                this._invocations.delete(sequence);
                reject(new Error(`MeCab invoke timed out after ${this._timeout}ms`));
            }, this._timeout);

            this._invocations.set(sequence, {resolve, reject, timer}, this._timeout);

            this._port.postMessage({action, params, sequence});
        });
    }

    _convertParseTextResults(rawResults) {
        const results = [];
        for (const [name, rawLines] of Object.entries(rawResults)) {
            const lines = [];
            for (const rawLine of rawLines) {
                const line = [];
                for (let {expression, reading, source} of rawLine) {
                    if (typeof expression !== 'string') { expression = ''; }
                    if (typeof reading !== 'string') { reading = ''; }
                    if (typeof source !== 'string') { source = ''; }
                    line.push({expression, reading, source});
                }
                lines.push(line);
            }
            results.push({name, lines});
        }
        return results;
    }

    async _setupPort() {
        if (this._setupPortPromise === null) {
            this._setupPortPromise = this._setupPort2();
        }
        try {
            await this._setupPortPromise;
        } catch (e) {
            throw new Error(e.message);
        }
    }

    async _setupPort2() {
        const port = chrome.runtime.connectNative('yomichan_mecab');
        this._eventListeners.addListener(port.onMessage, this._onMessage.bind(this));
        this._eventListeners.addListener(port.onDisconnect, this._onDisconnect.bind(this));
        this._port = port;

        try {
            const {version} = await this._invoke('get_version', {});
            if (version !== this._version) {
                throw new Error(`Unsupported MeCab native messenger version ${version}. Yomichan supports version ${this._version}.`);
            }
        } catch (e) {
            if (this._port === port) {
                this._clearPort();
            }
            throw e;
        }
    }

    _clearPort() {
        this._port.disconnect();
        this._port = null;
        this._invocations.clear();
        this._eventListeners.removeAllEventListeners();
        this._sequence = 0;
    }
}
