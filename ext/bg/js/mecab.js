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
        this._listeners = new Map();
        this._sequence = 0;
        this._timeout = 5000;
        this._version = 1;
    }

    async checkVersion() {
        try {
            const {version} = await this._invoke('get_version', {});
            if (version !== this._version) {
                this.stopListener();
                throw new Error(`Unsupported MeCab native messenger version ${version}. Yomichan supports version ${this._version}.`);
            }
        } catch (error) {
            yomichan.logError(error);
        }
    }

    async parseText(text) {
        const rawResults = await this._invoke('parse_text', {text});
        return this._convertParseTextResults(rawResults);
    }

    startListener() {
        if (this._port !== null) { return; }
        this._port = chrome.runtime.connectNative('yomichan_mecab');
        this._port.onMessage.addListener(this._onNativeMessage.bind(this));
        this.checkVersion();
    }

    stopListener() {
        if (this._port === null) { return; }
        this._port.disconnect();
        this._port = null;
        this._listeners.clear();
        this._sequence = 0;
    }

    // Private

    _onNativeMessage({sequence, data}) {
        const listener = this._listeners.get(sequence);
        if (typeof listener === 'undefined') { return; }

        const {callback, timer} = listener;
        clearTimeout(timer);
        callback(data);
        this._listeners.delete(sequence);
    }

    _invoke(action, params) {
        if (this._port === null) {
            return Promise.resolve({});
        }
        return new Promise((resolve, reject) => {
            const sequence = this._sequence++;

            this._listeners.set(sequence, {
                callback: resolve,
                timer: setTimeout(() => {
                    this._listeners.delete(sequence);
                    reject(new Error(`Mecab invoke timed out in ${this._timeout} ms`));
                }, this._timeout)
            });

            this._port.postMessage({action, params, sequence});
        });
    }

    _convertParseTextResults(rawResults) {
        // {
        //     'mecab-name': [
        //         // line1
        //         [
        //             {str expression: 'expression', str reading: 'reading', str source: 'source'},
        //             {str expression: 'expression2', str reading: 'reading2', str source: 'source2'}
        //         ],
        //         line2,
        //         ...
        //     ],
        //     'mecab-name2': [...]
        // }
        const results = {};
        for (const [mecabName, parsedLines] of Object.entries(rawResults)) {
            const result = [];
            for (const parsedLine of parsedLines) {
                const line = [];
                for (const {expression, reading, source} of parsedLine) {
                    line.push({
                        expression: expression || '',
                        reading: reading || '',
                        source: source || ''
                    });
                }
                result.push(line);
            }
            results[mecabName] = result;
        }
        return results;
    }
}
