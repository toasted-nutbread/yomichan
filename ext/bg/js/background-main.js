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

/* global
 * Backend
 */

(() => {
    const logs = [];
    chrome.runtime.onMessage.addListener((message, sender, callback) => {
        try {
            const {action, params} = message;
            switch (action) {
                case 'log':
                    logs.push(params);
                    break;
                case 'getLogs':
                    callback(logs);
                    break;
            }
        } catch (e) {
            // NOP
        }
    });
    yomichan.on('log', ({error, level, context}) => logs.push({error: errorToJson(error), level, context}));
})();

(async () => {
    try {
        window.yomichanBackend = new Backend();
        await window.yomichanBackend.prepare();
    } catch (e) {
        yomichan.logError(e);
    }
})();
