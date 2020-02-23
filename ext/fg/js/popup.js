/*
 * Copyright (C) 2016-2020  Alex Yatskov <alex@foosoft.net>
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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*global apiInjectStylesheet, apiGetMessageToken*/

class Popup {
    constructor(id, depth, frameIdPromise) {
        this._id = id;
        this._depth = depth;
        this._frameIdPromise = frameIdPromise;
        this._frameId = null;
        this._parent = null;
        this._child = null;
        this._childrenSupported = true;
        this._visible = false;
        this._visibleOverride = null;
        this._options = null;
        this._contentScale = 1.0;
        this._containerSizeContentScale = null;
        this._targetOrigin = chrome.runtime.getURL('/').replace(/\/$/, '');
        this._messageToken = null;

        this._container = document.createElement('iframe');
        this._container.className = 'yomichan-float';
        this._container.addEventListener('mousedown', (e) => e.stopPropagation());
        this._container.addEventListener('scroll', (e) => e.stopPropagation());
        this._container.style.width = '0px';
        this._container.style.height = '0px';

        this._fullscreenEventListeners = new EventListenerCollection();
        this._injectPromise = null;
        this._injectPromiseReject = null;
        this._stylesInjected = false;
        this._onContainerReload = null;

        this._updateVisibility();
    }

    // Public properties

    get id() {
        return this._id;
    }

    get parent() {
        return this._parent;
    }

    get child() {
        return this._child;
    }

    get depth() {
        return this._depth;
    }

    get url() {
        return window.location.href;
    }

    // Public functions

    isProxy() {
        return false;
    }

    async setOptions(options) {
        this._options = options;
        this.updateTheme();
    }

    hide(changeFocus) {
        if (!this.isVisibleSync()) {
            return;
        }

        this._setVisible(false);
        if (this._child !== null) {
            this._child.hide(false);
        }
        if (changeFocus) {
            this._focusParent();
        }
    }

    async isVisible() {
        return this.isVisibleSync();
    }

    setVisibleOverride(visible) {
        this._visibleOverride = visible;
        this._updateVisibility();
    }

    async containsPoint(x, y) {
        for (let popup = this; popup !== null && popup.isVisibleSync(); popup = popup._child) {
            const rect = popup._container.getBoundingClientRect();
            if (x >= rect.left && y >= rect.top && x < rect.right && y < rect.bottom) {
                return true;
            }
        }
        return false;
    }

    async showContent(elementRect, writingMode, type=null, details=null) {
        if (this._options === null) { throw new Error('Options not assigned'); }
        await this._show(elementRect, writingMode);
        if (type === null) { return; }
        this._invokeApi('setContent', {type, details});
    }

    async setCustomCss(css) {
        this._invokeApi('setCustomCss', {css});
    }

    clearAutoPlayTimer() {
        this._invokeApi('clearAutoPlayTimer');
    }

    setContentScale(scale) {
        this._contentScale = scale;
        this._invokeApi('setContentScale', {scale});
    }

    // Popup-only public functions

    setParent(parent) {
        if (parent === null) {
            throw new Error('Cannot set popup parent to null');
        }
        if (this._parent !== null) {
            throw new Error('Popup already has a parent');
        }
        if (parent._child !== null) {
            throw new Error('Cannot parent popup to another popup which already has a child');
        }
        this._parent = parent;
        parent._child = this;
    }

    isVisibleSync() {
        return (this._visibleOverride !== null ? this._visibleOverride : this._visible);
    }

    updateTheme() {
        this._container.dataset.yomichanTheme = this._options.general.popupOuterTheme;
        this._container.dataset.yomichanSiteColor = this._getSiteColor();
    }

    async setCustomOuterCss(css, useWebExtensionApi) {
        return await Popup._injectStylesheet(
            'yomichan-popup-outer-user-stylesheet',
            'code',
            css,
            useWebExtensionApi
        );
    }

    setChildrenSupported(value) {
        this._childrenSupported = value;
    }

    getContainer() {
        return this._container;
    }

    getContainerRect() {
        return this._container.getBoundingClientRect();
    }

    // Private functions

    _inject() {
        if (this._injectPromise === null) {
            this._injectPromise = this._injectInternal();
        }
        return this._injectPromise;
    }

    async _injectInternal() {
        try {
            const {frameId} = await this._frameIdPromise;
            if (typeof frameId === 'number') {
                this._frameId = frameId;
            }
        } catch (e) {
            // NOP
        }

        if (this._messageToken === null) {
            this._messageToken = await apiGetMessageToken();
        }

        return new Promise((resolve, reject) => {
            this._injectPromiseReject = reject;

            const iframe = this._container;
            const parentFrameId = (typeof this._frameId === 'number' ? this._frameId : null);

            const onNextLoad = () => {
                iframe.removeEventListener('load', onNextLoad, false);

                const uniqueId = yomichan.generateId(32);
                Popup._listenForDisplayPrepareCompleted(uniqueId, () => {
                    this._injectPromiseReject = null;
                    resolve();
                });

                this._invokeApi('prepare', {
                    options: this._options,
                    popupInfo: {
                        id: this._id,
                        depth: this._depth,
                        parentFrameId
                    },
                    url: this.url,
                    childrenSupported: this._childrenSupported,
                    scale: this._contentScale,
                    uniqueId
                });

                this._observeContainerReload(true);
            };

            try {
                this._observeContainerReload(false);
                iframe.addEventListener('load', onNextLoad, false);

                this._observeFullscreen(true);
                this._onFullscreenChanged();

                if (!this._stylesInjected) {
                    this._injectStyles();
                    this._stylesInjected = true;
                }

                // Note: changing the URL this way will cause the iframe's content to be reverted to about:blank
                // whenever a hierarchy change for the iframe DOM node occurs. This includes changes such as
                // addition, removal, or movement of the iframe node or any of its ancestors.
                // The load event will be fired when this occurs.
                iframe.contentDocument.location.href = chrome.runtime.getURL('/fg/float.html');
            } catch (e) {
                this._injectPromiseReject = null;
                this._observeContainerReload(true);
                reject(e);
            }
        });
    }

    _uninject() {
        if (this._injectPromiseReject !== null) {
            this._injectPromiseReject(new Error('Frame has been reloaded'));
            this._injectPromiseReject = null;
        }
        this._injectPromise = null;
        this._observeFullscreen(false);
        if (this._container.parentNode !== null) {
            this._container.parentNode.removeChild(this._container);
        }
    }

    _observeContainerReload(observe) {
        if (observe) {
            if (this._onContainerReload !== null) { return; }
            this._onContainerReload = () => this._uninject();
            this._container.addEventListener('load', this._onContainerReload, false);
        } else {
            if (this._onContainerReload === null) { return; }
            this._container.removeEventListener('load', this._onContainerReload, false);
            this._onContainerReload = null;
        }
    }

    async _injectStyles() {
        try {
            await Popup._injectStylesheet('yomichan-popup-outer-stylesheet', 'file', '/fg/css/client.css', true);
        } catch (e) {
            // NOP
        }

        try {
            await this.setCustomOuterCss(this._options.general.customPopupOuterCss, true);
        } catch (e) {
            // NOP
        }
    }

    _observeFullscreen(observe) {
        if (!observe) {
            this._fullscreenEventListeners.removeAllEventListeners();
            return;
        }

        if (this._fullscreenEventListeners.size > 0) {
            // Already observing
            return;
        }

        const fullscreenEvents = [
            'fullscreenchange',
            'MSFullscreenChange',
            'mozfullscreenchange',
            'webkitfullscreenchange'
        ];
        const onFullscreenChanged = () => this._onFullscreenChanged();
        for (const eventName of fullscreenEvents) {
            this._fullscreenEventListeners.addEventListener(document, eventName, onFullscreenChanged, false);
        }
    }

    _onFullscreenChanged() {
        const parent = (Popup._getFullscreenElement() || document.body || null);
        if (parent !== null && this._container.parentNode !== parent) {
            parent.appendChild(this._container);
        }
    }

    async _show(elementRect, writingMode) {
        await this._inject();

        const optionsGeneral = this._options.general;
        const container = this._container;
        const containerRect = container.getBoundingClientRect();
        const getPosition = (
            writingMode === 'horizontal-tb' || optionsGeneral.popupVerticalTextPosition === 'default' ?
            Popup._getPositionForHorizontalText :
            Popup._getPositionForVerticalText
        );

        const viewport = Popup._getViewport(optionsGeneral.popupScaleRelativeToVisualViewport);
        const scale = this._contentScale;
        const scaleRatio = this._containerSizeContentScale === null ? 1.0 : scale / this._containerSizeContentScale;
        this._containerSizeContentScale = scale;
        let [x, y, width, height, below] = getPosition(
            elementRect,
            Math.max(containerRect.width * scaleRatio, optionsGeneral.popupWidth * scale),
            Math.max(containerRect.height * scaleRatio, optionsGeneral.popupHeight * scale),
            viewport,
            scale,
            optionsGeneral,
            writingMode
        );

        const fullWidth = (optionsGeneral.popupDisplayMode === 'full-width');
        container.classList.toggle('yomichan-float-full-width', fullWidth);
        container.classList.toggle('yomichan-float-above', !below);

        if (optionsGeneral.popupDisplayMode === 'full-width') {
            x = viewport.left;
            y = below ? viewport.bottom - height : viewport.top;
            width = viewport.right - viewport.left;
        }

        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;

        this._setVisible(true);
        if (this._child !== null) {
            this._child.hide(true);
        }
    }

    _setVisible(visible) {
        this._visible = visible;
        this._updateVisibility();
    }

    _updateVisibility() {
        this._container.style.setProperty('visibility', this.isVisibleSync() ? 'visible' : 'hidden', 'important');
    }

    _focusParent() {
        if (this._parent !== null) {
            // Chrome doesn't like focusing iframe without contentWindow.
            const contentWindow = this._parent._container.contentWindow;
            if (contentWindow !== null) {
                contentWindow.focus();
            }
        } else {
            // Firefox doesn't like focusing window without first blurring the iframe.
            // this.container.contentWindow.blur() doesn't work on Firefox for some reason.
            this._container.blur();
            // This is needed for Chrome.
            window.focus();
        }
    }

    _getSiteColor() {
        const color = [255, 255, 255];
        Popup._addColor(color, Popup._getColorInfo(window.getComputedStyle(document.documentElement).backgroundColor));
        Popup._addColor(color, Popup._getColorInfo(window.getComputedStyle(document.body).backgroundColor));
        const dark = (color[0] < 128 && color[1] < 128 && color[2] < 128);
        return dark ? 'dark' : 'light';
    }

    _invokeApi(action, params={}) {
        const token = this._messageToken;
        const contentWindow = this._container.contentWindow;
        if (token === null || contentWindow === null) { return; }

        contentWindow.postMessage({action, params, token}, this._targetOrigin);
    }

    static _getFullscreenElement() {
        return (
            document.fullscreenElement ||
            document.msFullscreenElement ||
            document.mozFullScreenElement ||
            document.webkitFullscreenElement ||
            null
        );
    }

    static _listenForDisplayPrepareCompleted(uniqueId, resolve) {
        const runtimeMessageCallback = ({action, params}, sender, callback) => {
            if (
                action === 'popupPrepareCompleted' &&
                typeof params === 'object' &&
                params !== null &&
                params.uniqueId === uniqueId
            ) {
                chrome.runtime.onMessage.removeListener(runtimeMessageCallback);
                callback();
                resolve();
                return false;
            }
        };
        chrome.runtime.onMessage.addListener(runtimeMessageCallback);
    }

    static _getPositionForHorizontalText(elementRect, width, height, viewport, offsetScale, optionsGeneral) {
        const preferBelow = (optionsGeneral.popupHorizontalTextPosition === 'below');
        const horizontalOffset = optionsGeneral.popupHorizontalOffset * offsetScale;
        const verticalOffset = optionsGeneral.popupVerticalOffset * offsetScale;

        const [x, w] = Popup._getConstrainedPosition(
            elementRect.right - horizontalOffset,
            elementRect.left + horizontalOffset,
            width,
            viewport.left,
            viewport.right,
            true
        );
        const [y, h, below] = Popup._getConstrainedPositionBinary(
            elementRect.top - verticalOffset,
            elementRect.bottom + verticalOffset,
            height,
            viewport.top,
            viewport.bottom,
            preferBelow
        );
        return [x, y, w, h, below];
    }

    static _getPositionForVerticalText(elementRect, width, height, viewport, offsetScale, optionsGeneral, writingMode) {
        const preferRight = Popup._isVerticalTextPopupOnRight(optionsGeneral.popupVerticalTextPosition, writingMode);
        const horizontalOffset = optionsGeneral.popupHorizontalOffset2 * offsetScale;
        const verticalOffset = optionsGeneral.popupVerticalOffset2 * offsetScale;

        const [x, w] = Popup._getConstrainedPositionBinary(
            elementRect.left - horizontalOffset,
            elementRect.right + horizontalOffset,
            width,
            viewport.left,
            viewport.right,
            preferRight
        );
        const [y, h, below] = Popup._getConstrainedPosition(
            elementRect.bottom - verticalOffset,
            elementRect.top + verticalOffset,
            height,
            viewport.top,
            viewport.bottom,
            true
        );
        return [x, y, w, h, below];
    }

    static _isVerticalTextPopupOnRight(positionPreference, writingMode) {
        switch (positionPreference) {
            case 'before':
                return !Popup._isWritingModeLeftToRight(writingMode);
            case 'after':
                return Popup._isWritingModeLeftToRight(writingMode);
            case 'left':
                return false;
            case 'right':
                return true;
        }
    }

    static _isWritingModeLeftToRight(writingMode) {
        switch (writingMode) {
            case 'vertical-lr':
            case 'sideways-lr':
                return true;
            default:
                return false;
        }
    }

    static _getConstrainedPosition(positionBefore, positionAfter, size, minLimit, maxLimit, after) {
        size = Math.min(size, maxLimit - minLimit);

        let position;
        if (after) {
            position = Math.max(minLimit, positionAfter);
            position = position - Math.max(0, (position + size) - maxLimit);
        } else {
            position = Math.min(maxLimit, positionBefore) - size;
            position = position + Math.max(0, minLimit - position);
        }

        return [position, size, after];
    }

    static _getConstrainedPositionBinary(positionBefore, positionAfter, size, minLimit, maxLimit, after) {
        const overflowBefore = minLimit - (positionBefore - size);
        const overflowAfter = (positionAfter + size) - maxLimit;

        if (overflowAfter > 0 || overflowBefore > 0) {
            after = (overflowAfter < overflowBefore);
        }

        let position;
        if (after) {
            size -= Math.max(0, overflowAfter);
            position = Math.max(minLimit, positionAfter);
        } else {
            size -= Math.max(0, overflowBefore);
            position = Math.min(maxLimit, positionBefore) - size;
        }

        return [position, size, after];
    }

    static _addColor(target, color) {
        if (color === null) { return; }

        const a = color[3];
        if (a <= 0.0) { return; }

        const aInv = 1.0 - a;
        for (let i = 0; i < 3; ++i) {
            target[i] = target[i] * aInv + color[i] * a;
        }
    }

    static _getColorInfo(cssColor) {
        const m = /^\s*rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)\s*$/.exec(cssColor);
        if (m === null) { return null; }

        const m4 = m[4];
        return [
            Number.parseInt(m[1], 10),
            Number.parseInt(m[2], 10),
            Number.parseInt(m[3], 10),
            m4 ? Math.max(0.0, Math.min(1.0, Number.parseFloat(m4))) : 1.0
        ];
    }

    static _getViewport(useVisualViewport) {
        const visualViewport = window.visualViewport;
        if (visualViewport !== null && typeof visualViewport === 'object') {
            const left = visualViewport.offsetLeft;
            const top = visualViewport.offsetTop;
            const width = visualViewport.width;
            const height = visualViewport.height;
            if (useVisualViewport) {
                return {
                    left,
                    top,
                    right: left + width,
                    bottom: top + height
                };
            } else {
                const scale = visualViewport.scale;
                return {
                    left: 0,
                    top: 0,
                    right: Math.max(left + width, width * scale),
                    bottom: Math.max(top + height, height * scale)
                };
            }
        }

        return {
            left: 0,
            top: 0,
            right: document.body.clientWidth,
            bottom: window.innerHeight
        };
    }

    static _isOnExtensionPage() {
        try {
            const url = chrome.runtime.getURL('/');
            return window.location.href.substring(0, url.length) === url;
        } catch (e) {
            // NOP
        }
    }

    static async _injectStylesheet(id, type, value, useWebExtensionApi) {
        const injectedStylesheets = Popup._injectedStylesheets;

        if (Popup._isOnExtensionPage()) {
            // Permissions error will occur if trying to use the WebExtension API to inject
            // into an extension page.
            useWebExtensionApi = false;
        }

        let styleNode = injectedStylesheets.get(id);
        if (typeof styleNode !== 'undefined') {
            if (styleNode === null) {
                // Previously injected via WebExtension API
                throw new Error(`Stylesheet with id ${id} has already been injected using the WebExtension API`);
            }
        } else {
            styleNode = null;
        }

        if (useWebExtensionApi) {
            // Inject via WebExtension API
            if (styleNode !== null && styleNode.parentNode !== null) {
                styleNode.parentNode.removeChild(styleNode);
            }

            await apiInjectStylesheet(type, value);

            injectedStylesheets.set(id, null);
            return null;
        }

        // Create node in document
        const parentNode = document.head;
        if (parentNode === null) {
            throw new Error('No parent node');
        }

        // Create or reuse node
        const isFile = (type === 'file');
        const tagName = isFile ? 'link' : 'style';
        if (styleNode === null || styleNode.nodeName.toLowerCase() !== tagName) {
            if (styleNode !== null && styleNode.parentNode !== null) {
                styleNode.parentNode.removeChild(styleNode);
            }
            styleNode = document.createElement(tagName);
            styleNode.id = id;
        }

        // Update node style
        if (isFile) {
            styleNode.rel = value;
        } else {
            styleNode.textContent = value;
        }

        // Update parent
        if (styleNode.parentNode !== parentNode) {
            parentNode.appendChild(styleNode);
        }

        // Add to map
        injectedStylesheets.set(id, styleNode);
        return styleNode;
    }
}

Popup._injectedStylesheets = new Map();
