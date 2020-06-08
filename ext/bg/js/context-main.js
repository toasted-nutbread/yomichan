/*
 * Copyright (C) 2017-2020  Yomichan Authors
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
 * api
 */

function showExtensionInfo() {
    const node = document.getElementById('extension-info');
    if (node === null) { return; }

    const manifest = chrome.runtime.getManifest();
    node.textContent = `${manifest.name} v${manifest.version}`;
}

function setupButtonEvents(selector, command, url) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
        node.addEventListener('click', (e) => {
            if (e.button !== 0) { return; }
            api.commandExec(command, {mode: e.ctrlKey ? 'newTab' : 'existingOrNewTab'});
            e.preventDefault();
        }, false);
        node.addEventListener('auxclick', (e) => {
            if (e.button !== 1) { return; }
            api.commandExec(command, {mode: 'newTab'});
            e.preventDefault();
        }, false);

        if (typeof url === 'string') {
            node.href = url;
            node.target = '_blank';
            node.rel = 'noopener';
        }
    }
}

async function mainInner() {
    api.forwardLogsToBackend();
    await yomichan.prepare();

    await api.logIndicatorClear();

    showExtensionInfo();

    api.getEnvironmentInfo().then(({browser}) => {
        // Firefox mobile opens this page as a full webpage.
        document.documentElement.dataset.mode = (browser === 'firefox-mobile' ? 'full' : 'mini');
    });

    const manifest = chrome.runtime.getManifest();

    setupButtonEvents('.action-open-search', 'search', chrome.runtime.getURL('/bg/search.html'));
    setupButtonEvents('.action-open-options', 'options', chrome.runtime.getURL(manifest.options_ui.page));
    setupButtonEvents('.action-open-help', 'help', 'https://foosoft.net/projects/yomichan/');

    const optionsContext = {
        depth: 0,
        url: window.location.href
    };
    api.optionsGet(optionsContext).then((options) => {
        const toggle = document.querySelector('#enable-search');
        toggle.checked = options.general.enable;
        toggle.addEventListener('change', () => api.commandExec('toggle'), false);

        const toggle2 = document.querySelector('#enable-search2');
        toggle2.checked = options.general.enable;
        toggle2.addEventListener('change', () => api.commandExec('toggle'), false);

        setTimeout(() => {
            document.body.dataset.loaded = 'true';
        }, 10);
    });
}

(async () => {
    window.addEventListener('DOMContentLoaded', mainInner, false);
})();
