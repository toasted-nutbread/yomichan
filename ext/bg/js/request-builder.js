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
        this._extraHeadersSupported = null;
        this._onBeforeSendHeadersExtraInfoSpec = ['blocking', 'requestHeaders', 'extraHeaders'];
    }

    async fetchAnonymous(url, init) {
        if (isObject(chrome.declarativeWebRequest)) {
            return await this._fetchAnonymousDeclarative(url, init);
        }
        const originURL = this._getOriginURL(url);
        const modifications = [
            ['cookie', null],
            ['origin', {name: 'Origin', value: originURL}]
        ];
        return await this._fetchModifyHeaders(url, init, modifications);
    }

    // Private

    async _fetchModifyHeaders(url, init, modifications) {
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

        let needsCleanup = false;
        try {
            this._onBeforeSendHeadersAddListener(callback, filter);
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

    _onBeforeSendHeadersAddListener(callback, filter) {
        const extraInfoSpec = this._onBeforeSendHeadersExtraInfoSpec;
        for (let i = 0; i < 2; ++i) {
            try {
                chrome.webRequest.onBeforeSendHeaders.addListener(callback, filter, extraInfoSpec);
                if (this._extraHeadersSupported === null) {
                    this._extraHeadersSupported = true;
                }
                break;
            } catch (e) {
                // Firefox doesn't support the 'extraHeaders' option and will throw the following error:
                // Type error for parameter extraInfoSpec (Error processing 2: Invalid enumeration value "extraHeaders") for webRequest.onBeforeSendHeaders.
                if (this._extraHeadersSupported !== null || !`${e.message}`.includes('extraHeaders')) {
                    throw e;
                }
            }

            // addListener failed; remove 'extraHeaders' from extraInfoSpec.
            this._extraHeadersSupported = false;
            const index = extraInfoSpec.indexOf('extraHeaders');
            if (index >= 0) { extraInfoSpec.splice(index, 1); }
        }
    }

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

    async _fetchAnonymousDeclarative(url, init) {
        const originUrl = this._getOriginURL(url);
        const rules = [{
            priority: 0,
            conditions: [
                new chrome.declarativeWebRequest.RequestMatcher({
                    url: {urlEquals: url},
                    resourceType: ['xmlhttprequest'],
                    stages: ['onBeforeSendHeaders']
                })
            ],
            actions: [
                new chrome.declarativeWebRequest.RemoveRequestHeader({name: 'Cookie'}),
                new chrome.declarativeWebRequest.SetRequestHeader({name: 'Origin', value: originUrl})
            ]
        }];

        const registeredRules = await new Promise((resolve, reject) => {
            chrome.declarativeWebRequest.onRequest.addRules(rules, (result) => {
                const e = chrome.runtime.lastError;
                if (e) {
                    reject(new Error(e.message));
                } else {
                    resolve(result);
                }
            });
        });
        const registeredIds = registeredRules.map(({id}) => id);

        try {
            return await fetch(url, init);
        } finally {
            await new Promise((resolve) => {
                chrome.declarativeWebRequest.onRequest.removeRules(registeredIds, () => resolve());
            });
        }
    }
}
