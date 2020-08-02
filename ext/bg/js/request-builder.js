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

class RequestBuilder {
    constructor() {
    }

    async fetchAnonymous(url, init) {
        const originURL = this._getOriginURL(url);
        const modifications = [
            ['cookie', null],
            ['origin', {name: 'Origin', value: originURL}]
        ];
        return this.fetchModifyHeaders(url, init, modifications);
    }

    async fetchModifyHeaders(url, init, modifications) {
        const matchURL = this._getMatchURL(url);

        let done = false;
        const callback = (details) => {
            if (done || details.url !== url) { return {}; }
            done = true;

            const requestHeaders = details.requestHeaders;
            this._modifyHeaders(requestHeaders, modifications);
            return {requestHeaders};
        };
        const filter = {
            urls: [matchURL],
            types: ['xmlhttprequest']
        };
        const extraInfoSpec = ['blocking', 'requestHeaders', 'extraHeaders'];

        let needsCleanup = false;
        try {
            chrome.webRequest.onBeforeSendHeaders.addListener(callback, filter, extraInfoSpec);
            needsCleanup = true;
        } catch (e) {
            // NOP
        }

        try {
            return await fetch(url, init);
        } finally {
            if (needsCleanup) {
                try {
                    chrome.webRequest.onBeforeSendHeaders.removeListener(callback);
                } catch (e) {
                    // NOP
                }
            }
        }
    }

    // Private

    _getMatchURL(url) {
        const url2 = new URL(url);
        return `${url2.protocol}//${url2.host}${url2.pathname}`;
    }

    _getOriginURL(url) {
        const url2 = new URL(url);
        return `${url2.protocol}//${url2.host}`;
    }

    _modifyHeaders(headers, modifications) {
        modifications = new Map(modifications);

        for (let i = 0, ii = headers.length; i < ii; ++i) {
            const header = headers[i];
            const name = header.name.toLowerCase();
            const modification = modifications.get(name);
            if (typeof modification === 'undefined') { continue; }

            modifications.delete(name);

            if (modification === null) {
                headers.splice(i, 1);
                --i;
                --ii;
            } else {
                headers[i] = modification;
            }
        }

        for (const header of modifications.values()) {
            if (header !== null) {
                headers.push(header);
            }
        }
    }
}
