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

async function getLogString() {
    try {
        const logs = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({action: 'getLogs'}, (result) => {
                const error = chrome.runtime.lastError;
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
        return `${JSON.stringify(logs, null, 4)}`;
    } catch (e) {
        return `${e}`;
    }
}

(async () => {
    const textarea = document.querySelector('#logs');
    const copy = document.querySelector('#copy');
    const select = document.querySelector('#select');

    textarea.value = await getLogString();

    copy.addEventListener('click', () => {
        textarea.select();
        document.execCommand('copy');
        textarea.blur();
    });
    select.addEventListener('click', () => {
        textarea.select();
    });
})();