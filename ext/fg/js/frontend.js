/*
 * Copyright (C) 2016-2017  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


class Frontend {
    constructor(popup, ignoreNodes) {
        this.popup = popup;
        this.popupTimerPromise = null;
        this.textSourceCurrent = null;
        this.pendingLookup = false;
        this.options = null;
        this.ignoreNodes = (Array.isArray(ignoreNodes) && ignoreNodes.length > 0 ? ignoreNodes.join(',') : null);

        this.optionsContext = {
            depth: popup.depth,
            url: popup.url
        };

        this.primaryTouchIdentifier = null;
        this.preventNextContextMenu = false;
        this.preventNextMouseDown = false;
        this.preventNextClick = false;
        this.preventScroll = false;

        this.enabled = false;
        this.eventListeners = [];

        this.isPreparedPromiseResolve = null;
        this.isPreparedPromise = new Promise((resolve) => { this.isPreparedPromiseResolve = resolve; });

        this.lastShowPromise = Promise.resolve();
    }

    static create() {
        const data = window.frontendInitializationData || {};
        const {id, depth=0, parentFrameId, ignoreNodes, url, proxy=false} = data;

        const popup = proxy ? new PopupProxy(depth + 1, id, parentFrameId, url) : PopupProxyHost.instance.createPopup(null, depth);
        const frontend = new Frontend(popup, ignoreNodes);
        frontend.prepare();
        return frontend;
    }

    async prepare() {
        try {
            await this.updateOptions();

            chrome.runtime.onMessage.addListener(this.onRuntimeMessage.bind(this));
            this.isPreparedPromiseResolve();
        } catch (e) {
            this.onError(e);
        }
    }

    isPrepared() {
        return this.isPreparedPromise;
    }

    onMouseOver(e) {
        if (e.target === this.popup.container) {
            this.popupTimerClear();
        }
    }

    onMouseMove(e) {
        this.popupTimerClear();

        if (this.pendingLookup || Frontend.isMouseButtonDown('primary', e)) {
            return;
        }

        const scanningOptions = this.options.scanning;
        const scanningModifier = scanningOptions.modifier;
        if (!(
            Frontend.isScanningModifierPressed(scanningModifier, e) ||
            (scanningOptions.middleMouse && Frontend.isMouseButtonDown('auxiliary', e))
        )) {
            return;
        }

        const search = async () => {
            if (scanningModifier === 'none') {
                if (!await this.popupTimerWait()) {
                    // Aborted
                    return;
                }
            }

            await this.searchAt(e.clientX, e.clientY, 'mouse');
        };

        search();
    }

    onMouseDown(e) {
        if (this.preventNextMouseDown) {
            this.preventNextMouseDown = false;
            this.preventNextClick = true;
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        if (e.button === 0) {
            this.popupTimerClear();
            this.searchClear(true);
        }
    }

    onMouseOut(e) {
        this.popupTimerClear();
    }

    onClick(e) {
        if (this.preventNextClick) {
            this.preventNextClick = false;
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    onAuxClick(e) {
        this.preventNextContextMenu = false;
    }

    onContextMenu(e) {
        if (this.preventNextContextMenu) {
            this.preventNextContextMenu = false;
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }

    onTouchStart(e) {
        if (this.primaryTouchIdentifier !== null || e.changedTouches.length === 0) {
            return;
        }

        this.onPrimaryTouchStart(e.changedTouches[0]);
    }

    onTouchEnd(e) {
        if (
            this.primaryTouchIdentifier === null ||
            this.getIndexOfTouch(e.changedTouches, this.primaryTouchIdentifier) < 0
        ) {
            return;
        }

        this.onPrimaryTouchEnd();
    }

    onTouchCancel(e) {
        this.onTouchEnd(e);
    }

    onTouchMove(e) {
        if (!this.preventScroll || !e.cancelable || this.primaryTouchIdentifier === null) {
            return;
        }

        const touches = e.changedTouches;
        const index = this.getIndexOfTouch(touches, this.primaryTouchIdentifier);
        if (index < 0) {
            return;
        }

        const primaryTouch = touches[index];
        this.searchAt(primaryTouch.clientX, primaryTouch.clientY, 'touchMove');

        e.preventDefault(); // Disable scroll
    }


    onPrimaryTouchStart(primaryTouch) {
        this.preventScroll = false;
        this.preventNextContextMenu = false;
        this.preventNextMouseDown = false;
        this.preventNextClick = false;

        if (Frontend.selectionContainsPoint(window.getSelection(), primaryTouch.clientX, primaryTouch.clientY)) {
            return;
        }

        this.primaryTouchIdentifier = primaryTouch.identifier;

        if (this.pendingLookup) {
            return;
        }

        const textSourceCurrentPrevious = this.textSourceCurrent !== null ? this.textSourceCurrent.clone() : null;

        this.searchAt(primaryTouch.clientX, primaryTouch.clientY, 'touchStart')
        .then(() => {
            if (
                this.textSourceCurrent === null ||
                this.textSourceCurrent.equals(textSourceCurrentPrevious)
            ) {
                return;
            }

            this.preventScroll = true;
            this.preventNextContextMenu = true;
            this.preventNextMouseDown = true;
        });
    }

    onPrimaryTouchEnd() {
        this.primaryTouchIdentifier = null;
        this.preventScroll = false;
        this.preventNextClick = false;
        // Don't revert context menu and mouse down prevention,
        // since these events can occur after the touch has ended.
        // this.preventNextContextMenu = false;
        // this.preventNextMouseDown = false;
    }


    onPointerOver(e) {
        if (!e.isPrimary) { return; }
        switch (e.pointerType) {
            case 'mouse': return this.onMousePointerOver(e);
            case 'touch': return this.onTouchPointerOver(e);
        }
    }

    onPointerDown(e) {
        if (!e.isPrimary) { return; }
        switch (e.pointerType) {
            case 'mouse': return this.onMousePointerDown(e);
            case 'touch': return this.onTouchPointerDown(e);
        }
    }

    onPointerMove(e) {
        if (!e.isPrimary) { return; }
        switch (e.pointerType) {
            case 'mouse': return this.onMousePointerMove(e);
            case 'touch': return this.onTouchPointerMove(e);
        }
    }

    onPointerUp(e) {
        if (!e.isPrimary) { return; }
        switch (e.pointerType) {
            case 'mouse': return this.onMousePointerUp(e);
            case 'touch': return this.onTouchPointerUp(e);
        }
    }

    onPointerCancel(e) {
        if (!e.isPrimary) { return; }
        switch (e.pointerType) {
            case 'mouse': return this.onMousePointerCancel(e);
            case 'touch': return this.onTouchPointerCancel(e);
        }
    }

    onPointerOut(e) {
        if (!e.isPrimary) { return; }
        switch (e.pointerType) {
            case 'mouse': return this.onMousePointerOut(e);
            case 'touch': return this.onTouchPointerOut(e);
        }
    }


    onMousePointerOver(e) {
        return this.onMouseOver(e);
    }

    onMousePointerDown(e) {
        return this.onMouseDown(e);
    }

    onMousePointerMove(e) {
        return this.onMouseMove(e);
    }

    onMousePointerUp(e) {
        // NOP
    }

    onMousePointerCancel(e) {
        return this.onMouseOut(e);
    }

    onMousePointerOut(e) {
        return this.onMouseOut(e);
    }


    onTouchPointerOver(e) {
        // NOP
    }

    onTouchPointerDown(e) {
        return this.onPrimaryTouchStart(e);
    }

    onTouchPointerMove(e) {
        if (!this.preventScroll || !e.cancelable) {
            return;
        }

        this.searchAt(e.clientX, e.clientY, 'touchMove');
    }

    onTouchPointerUp(e) {
        return this.onPrimaryTouchEnd();
    }

    onTouchPointerCancel(e) {
        if (this.preventScroll) {
        }
        return this.onPrimaryTouchEnd();
    }

    onTouchPointerOut(e) {
        // NOP
    }

    onTouchMovePreventScroll(e) {
        if (!this.preventScroll) { return; }

        if (e.cancelable) {
            e.preventDefault();
        } else {
            this.preventScroll = false;
        }
    }


    async onResize() {
        if (this.textSourceCurrent !== null && await this.popup.isVisibleAsync()) {
            const textSource = this.textSourceCurrent;
            this.lastShowPromise = this.popup.showContent(
                textSource.getRect(),
                textSource.getWritingMode()
            );
        }
    }

    onWindowMessage(e) {
        const action = e.data;
        const handlers = Frontend.windowMessageHandlers;
        if (handlers.hasOwnProperty(action)) {
            const handler = handlers[action];
            handler(this);
        }
    }

    onRuntimeMessage({action, params}, sender, callback) {
        const handlers = Frontend.runtimeMessageHandlers;
        if (handlers.hasOwnProperty(action)) {
            const handler = handlers[action];
            const result = handler(this, params);
            callback(result);
        }
    }

    onError(error) {
        logError(error, false);
    }

    setEnabled(enabled) {
        if (enabled) {
            if (!this.enabled) {
                this.hookEvents();
                this.enabled = true;
            }
        } else {
            if (this.enabled) {
                this.clearEventListeners();
                this.enabled = false;
            }
            this.searchClear(false);
        }
    }

    hookEvents() {
        if (typeof window.PointerEvent === 'function') {
            this.addEventListener(window, 'pointerover', this.onPointerOver.bind(this));
            this.addEventListener(window, 'pointerdown', this.onPointerDown.bind(this));
            this.addEventListener(window, 'pointermove', this.onPointerMove.bind(this));
            this.addEventListener(window, 'pointerup', this.onPointerUp.bind(this));
            this.addEventListener(window, 'pointercancel', this.onPointerCancel.bind(this));
            this.addEventListener(window, 'pointerout', this.onPointerOut.bind(this));
            this.addEventListener(window, 'touchmove', this.onTouchMovePreventScroll.bind(this), {passive: false});
            this.addEventListener(window, 'mousedown', this.onMouseDown.bind(this));
            this.addEventListener(window, 'click', this.onClick.bind(this));
            this.addEventListener(window, 'auxclick', this.onAuxClick.bind(this));
        } else {
            this.addEventListener(window, 'message', this.onWindowMessage.bind(this));
            this.addEventListener(window, 'mousedown', this.onMouseDown.bind(this));
            this.addEventListener(window, 'mousemove', this.onMouseMove.bind(this));
            this.addEventListener(window, 'mouseover', this.onMouseOver.bind(this));
            this.addEventListener(window, 'mouseout', this.onMouseOut.bind(this));
            this.addEventListener(window, 'resize', this.onResize.bind(this));

            if (this.options.scanning.touchInputEnabled) {
                this.addEventListener(window, 'click', this.onClick.bind(this));
                this.addEventListener(window, 'auxclick', this.onAuxClick.bind(this));
                this.addEventListener(window, 'touchstart', this.onTouchStart.bind(this));
                this.addEventListener(window, 'touchend', this.onTouchEnd.bind(this));
                this.addEventListener(window, 'touchcancel', this.onTouchCancel.bind(this));
                this.addEventListener(window, 'touchmove', this.onTouchMove.bind(this), {passive: false});
                this.addEventListener(window, 'contextmenu', this.onContextMenu.bind(this));
            }
        }
    }

    addEventListener(node, type, listener, options) {
        node.addEventListener(type, listener, options);
        this.eventListeners.push([node, type, listener, options]);
    }

    clearEventListeners() {
        for (const [node, type, listener, options] of this.eventListeners) {
            node.removeEventListener(type, listener, options);
        }
        this.eventListeners = [];
    }

    async updateOptions() {
        this.options = await apiOptionsGet(this.getOptionsContext());
        this.setEnabled(this.options.general.enable);
        await this.popup.setOptions(this.options);
    }

    async popupTimerWait() {
        const delay = this.options.scanning.delay;
        const promise = promiseTimeout(delay, true);
        this.popupTimerPromise = promise;
        try {
            return await promise;
        } finally {
            if (this.popupTimerPromise === promise) {
                this.popupTimerPromise = null;
            }
        }
    }

    popupTimerClear() {
        if (this.popupTimerPromise !== null) {
            this.popupTimerPromise.resolve(false);
            this.popupTimerPromise = null;
        }
    }

    async searchAt(x, y, cause) {
        try {
            this.popupTimerClear();

            if (this.pendingLookup || await this.popup.containsPoint(x, y)) {
                return;
            }

            const textSource = docRangeFromPoint(x, y, this.options);
            if (this.textSourceCurrent !== null && this.textSourceCurrent.equals(textSource)) {
                return;
            }

            try {
                await this.searchSource(textSource, cause);
            } finally {
                if (textSource !== null) {
                    textSource.cleanup();
                }
            }
        } catch (e) {
            this.onError(e);
        }
    }

    async searchSource(textSource, cause) {
        let results = null;

        try {
            this.pendingLookup = true;
            if (textSource !== null) {
                results = (
                    await this.findTerms(textSource) ||
                    await this.findKanji(textSource)
                );
                if (results !== null) {
                    const focus = (cause === 'mouse');
                    this.showContent(textSource, focus, results.definitions, results.type);
                }
            }
        } catch (e) {
            if (window.yomichan_orphaned) {
                if (textSource !== null && this.options.scanning.modifier !== 'none') {
                    this.lastShowPromise = this.popup.showContent(
                        textSource.getRect(),
                        textSource.getWritingMode(),
                        'orphaned'
                    );
                }
            } else {
                this.onError(e);
            }
        } finally {
            if (results === null && this.options.scanning.autoHideResults) {
                this.searchClear(true);
            }

            this.pendingLookup = false;
        }

        return results;
    }

    showContent(textSource, focus, definitions, type) {
        const sentence = docSentenceExtract(textSource, this.options.anki.sentenceExt);
        const url = window.location.href;
        this.lastShowPromise = this.popup.showContent(
            textSource.getRect(),
            textSource.getWritingMode(),
            type,
            {definitions, context: {sentence, url, focus}}
        );

        this.textSourceCurrent = textSource;
        if (this.options.scanning.selectText) {
            textSource.select();
        }
    }

    async findTerms(textSource) {
        this.setTextSourceScanLength(textSource, this.options.scanning.length);

        const searchText = textSource.text();
        if (searchText.length === 0) { return null; }

        const {definitions, length} = await apiTermsFind(searchText, {}, this.getOptionsContext());
        if (definitions.length === 0) { return null; }

        textSource.setEndOffset(length);

        return {definitions, type: 'terms'};
    }

    async findKanji(textSource) {
        this.setTextSourceScanLength(textSource, 1);

        const searchText = textSource.text();
        if (searchText.length === 0) { return null; }

        const definitions = await apiKanjiFind(searchText, this.getOptionsContext());
        if (definitions.length === 0) { return null; }

        return {definitions, type: 'kanji'};
    }

    searchClear(changeFocus) {
        this.popup.hide(changeFocus);
        this.popup.clearAutoPlayTimer();

        if (this.textSourceCurrent !== null) {
            if (this.options.scanning.selectText) {
                this.textSourceCurrent.deselect();
            }

            this.textSourceCurrent = null;
        }
    }

    getIndexOfTouch(touchList, identifier) {
        for (let i in touchList) {
            let t = touchList[i];
            if (t.identifier === identifier) {
                return i;
            }
        }
        return -1;
    }

    static selectionContainsPoint(selection, x, y) {
        for (let i = 0; i < selection.rangeCount; ++i) {
            const range = selection.getRangeAt(i);
            for (const rect of range.getClientRects()) {
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return true;
                }
            }
        }
        return false;
    }

    setTextSourceScanLength(textSource, length) {
        textSource.setEndOffset(length);
        if (this.ignoreNodes === null || !textSource.range) {
            return;
        }

        length = textSource.text().length;
        while (textSource.range && length > 0) {
            const nodes = TextSourceRange.getNodesInRange(textSource.range);
            if (!TextSourceRange.anyNodeMatchesSelector(nodes, this.ignoreNodes)) {
                break;
            }
            --length;
            textSource.setEndOffset(length);
        }
    }

    getOptionsContext() {
        this.optionsContext.url = this.popup.url;
        return this.optionsContext;
    }

    static isScanningModifierPressed(scanningModifier, mouseEvent) {
        switch (scanningModifier) {
            case 'alt': return mouseEvent.altKey;
            case 'ctrl': return mouseEvent.ctrlKey;
            case 'shift': return mouseEvent.shiftKey;
            case 'none': return true;
            default: return false;
        }
    }

    static isMouseButton(button, mouseEvent) {
        switch (mouseEvent.type) {
            case 'mouseup':
            case 'mousedown':
            case 'click':
                return Frontend.isMouseButtonPressed(button, mouseEvent);
            default:
                return Frontend.isMouseButtonDown(button, mouseEvent);
        }
    }

    static isMouseButtonPressed(button, mouseEvent) {
        const mouseEventButton = mouseEvent.button;
        switch (button) {
            case 'primary': return mouseEventButton === 0;
            case 'secondary': return mouseEventButton === 2;
            case 'auxiliary': return mouseEventButton === 1;
            default: return false;
        }
    }

    static isMouseButtonDown(button, mouseEvent) {
        const mouseEventButtons = mouseEvent.buttons;
        switch (button) {
            case 'primary': return (mouseEventButtons & 0x1) !== 0x0;
            case 'secondary': return (mouseEventButtons & 0x2) !== 0x0;
            case 'auxiliary': return (mouseEventButtons & 0x4) !== 0x0;
            default: return false;
        }
    }
}

Frontend.windowMessageHandlers = {
    popupClose: (self) => {
        self.searchClear(true);
    },

    selectionCopy: () => {
        document.execCommand('copy');
    }
};

Frontend.runtimeMessageHandlers = {
    optionsUpdate: (self) => {
        self.updateOptions();
    },

    popupSetVisibleOverride: (self, {visible}) => {
        self.popup.setVisibleOverride(visible);
    },

    getUrl: () => {
        return {url: window.location.href};
    }
};
