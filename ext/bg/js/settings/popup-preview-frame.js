/*
 * Copyright (C) 2019-2020  Yomichan Authors
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
 * Frontend
 * Popup
 * PopupFactory
 * TextSourceRange
 * api
 */

class SettingsPopupPreview {
    constructor() {
        this._frontend = null;
        this._apiOptionsGetOld = api.optionsGet.bind(api);
        this._popup = null;
        this._popupSetCustomOuterCssOld = null;
        this._popupShown = false;
        this._themeChangeTimeout = null;
        this._textSource = null;
        this._optionsContext = null;
        this._targetOrigin = chrome.runtime.getURL('/').replace(/\/$/, '');

        this._windowMessageHandlers = new Map([
            ['prepare', ({optionsContext}) => this.prepare(optionsContext)],
            ['setText', ({text}) => this.setText(text)],
            ['setCustomCss', ({css}) => this.setCustomCss(css)],
            ['setCustomOuterCss', ({css}) => this.setCustomOuterCss(css)],
            ['updateOptionsContext', ({optionsContext}) => this.updateOptionsContext(optionsContext)]
        ]);

        window.addEventListener('message', this.onMessage.bind(this), false);
    }

    async prepare(optionsContext) {
        this._optionsContext = optionsContext;

        // Setup events
        document.querySelector('#theme-dark-checkbox').addEventListener('change', this.onThemeDarkCheckboxChanged.bind(this), false);

        // Overwrite API functions
        api.optionsGet = this.apiOptionsGet.bind(this);

        // Overwrite frontend
        const {frameId} = await api.frameInformationGet();

        const popupFactory = new PopupFactory(frameId);
        await popupFactory.prepare();

        this._popup = popupFactory.getOrCreatePopup();
        this._popup.setChildrenSupported(false);

        this._popupSetCustomOuterCssOld = this._popup.setCustomOuterCss;
        this._popup.setCustomOuterCss = this.popupSetCustomOuterCss.bind(this);

        this._frontend = new Frontend(this._popup);
        this._frontend.getOptionsContext = async () => this._optionsContext;
        await this._frontend.prepare();
        this._frontend.setDisabledOverride(true);
        this._frontend.canClearSelection = false;

        // Update search
        this.updateSearch();
    }

    async apiOptionsGet(...args) {
        const options = await this._apiOptionsGetOld(...args);
        options.general.enable = true;
        options.general.debugInfo = false;
        options.general.popupWidth = 400;
        options.general.popupHeight = 250;
        options.general.popupHorizontalOffset = 0;
        options.general.popupVerticalOffset = 10;
        options.general.popupHorizontalOffset2 = 10;
        options.general.popupVerticalOffset2 = 0;
        options.general.popupHorizontalTextPosition = 'below';
        options.general.popupVerticalTextPosition = 'before';
        options.scanning.selectText = false;
        return options;
    }

    async popupSetCustomOuterCss(...args) {
        // This simulates the stylesheet priorities when injecting using the web extension API.
        const result = await this._popupSetCustomOuterCssOld.call(this._popup, ...args);

        const node = document.querySelector('#client-css');
        if (node !== null && result !== null) {
            node.parentNode.insertBefore(result, node);
        }

        return result;
    }

    onMessage(e) {
        if (e.origin !== this._targetOrigin) { return; }

        const {action, params} = e.data;
        const handler = this._windowMessageHandlers.get(action);
        if (typeof handler !== 'function') { return; }

        handler(params);
    }

    onThemeDarkCheckboxChanged(e) {
        document.documentElement.classList.toggle('dark', e.target.checked);
        if (this._themeChangeTimeout !== null) {
            clearTimeout(this._themeChangeTimeout);
        }
        this._themeChangeTimeout = setTimeout(() => {
            this._themeChangeTimeout = null;
            this._popup.updateTheme();
        }, 300);
    }

    setText(text) {
        const exampleText = document.querySelector('#example-text');
        if (exampleText === null) { return; }

        exampleText.textContent = text;
        this.updateSearch();
    }

    setInfoVisible(visible) {
        const node = document.querySelector('.placeholder-info');
        if (node === null) { return; }

        node.classList.toggle('placeholder-info-visible', visible);
    }

    setCustomCss(css) {
        if (this._frontend === null) { return; }
        this._popup.setCustomCss(css);
    }

    setCustomOuterCss(css) {
        if (this._frontend === null) { return; }
        this._popup.setCustomOuterCss(css, false);
    }

    async updateOptionsContext(optionsContext) {
        this._optionsContext = optionsContext;
        await this._frontend.updateOptions();
        await this.updateSearch();
    }

    async updateSearch() {
        const exampleText = document.querySelector('#example-text');
        if (exampleText === null) { return; }

        const textNode = exampleText.firstChild;
        if (textNode === null) { return; }

        const range = document.createRange();
        range.selectNode(textNode);
        const source = new TextSourceRange(range, range.toString(), null, null);

        try {
            await this._frontend.setTextSource(source);
        } finally {
            source.cleanup();
        }
        this._textSource = source;
        await this._frontend.showContentCompleted();

        if (this._popup.isVisibleSync()) {
            this._popupShown = true;
        }

        this.setInfoVisible(!this._popupShown);
    }
}
