/*
 * Copyright (C) 2021  Yomichan Authors
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

class DisplayResizer {
    constructor(display) {
        this._display = display;
        this._frameResizeToken = null;
        this._frameResizeHandle = null;
        this._frameResizeTouchIdentifier = null;
        this._frameResizeStartSize = null;
        this._frameResizeStartOffset = null;
        this._frameResizeEventListeners = new EventListenerCollection();
    }

    prepare() {
        this._frameResizeHandle = document.querySelector('#frame-resizer-handle');
        if (this._frameResizeHandle === null) { return; }

        this._frameResizeHandle.addEventListener('mousedown', this._onFrameResizerMouseDown.bind(this), false);
        this._frameResizeHandle.addEventListener('touchstart', this._onFrameResizerTouchStart.bind(this), false);
    }

    // Private

    _onFrameResizerMouseDown(e) {
        if (e.button !== 0) { return; }
        // Don't do e.preventDefault() here; this allows mousemove events to be processed
        // if the pointer moves out of the frame.
        this._startFrameResize(e);
    }

    _onFrameResizerTouchStart(e) {
        e.preventDefault();
        this._startFrameResizeTouch(e);
    }

    _onFrameResizerMouseUp() {
        this._stopFrameResize();
    }

    _onFrameResizerWindowBlur() {
        this._stopFrameResize();
    }

    _onFrameResizerMouseMove(e) {
        if ((e.buttons & 0x1) === 0x0) {
            this._stopFrameResize();
        } else {
            if (this._frameResizeStartSize === null) { return; }
            const {clientX: x, clientY: y} = e;
            this._updateFrameSize(x, y);
        }
    }

    _onFrameResizerTouchEnd(e) {
        if (this._getTouch(e.changedTouches, this._frameResizeTouchIdentifier) === null) { return; }
        this._stopFrameResize();
    }

    _onFrameResizerTouchCancel(e) {
        if (this._getTouch(e.changedTouches, this._frameResizeTouchIdentifier) === null) { return; }
        this._stopFrameResize();
    }

    _onFrameResizerTouchMove(e) {
        if (this._frameResizeStartSize === null) { return; }
        const primaryTouch = this._getTouch(e.changedTouches, this._frameResizeTouchIdentifier);
        if (primaryTouch === null) { return; }
        const {clientX: x, clientY: y} = primaryTouch;
        this._updateFrameSize(x, y);
    }

    _startFrameResize(e) {
        if (this._frameResizeToken !== null) { return; }

        const {clientX: x, clientY: y} = e;
        const token = {};
        this._frameResizeToken = token;
        this._frameResizeStartOffset = {x, y};
        this._frameResizeEventListeners.addEventListener(window, 'mouseup', this._onFrameResizerMouseUp.bind(this), false);
        this._frameResizeEventListeners.addEventListener(window, 'blur', this._onFrameResizerWindowBlur.bind(this), false);
        this._frameResizeEventListeners.addEventListener(window, 'mousemove', this._onFrameResizerMouseMove.bind(this), false);

        const {documentElement} = document;
        if (documentElement !== null) {
            documentElement.dataset.isResizing = 'true';
        }

        this._initializeFrameResize(token);
    }

    _startFrameResizeTouch(e) {
        if (this._frameResizeToken !== null) { return; }

        const {clientX: x, clientY: y, identifier} = e.changedTouches[0];
        const token = {};
        this._frameResizeToken = token;
        this._frameResizeStartOffset = {x, y};
        this._frameResizeTouchIdentifier = identifier;
        this._frameResizeEventListeners.addEventListener(window, 'touchend', this._onFrameResizerTouchEnd.bind(this), false);
        this._frameResizeEventListeners.addEventListener(window, 'touchcancel', this._onFrameResizerTouchCancel.bind(this), false);
        this._frameResizeEventListeners.addEventListener(window, 'blur', this._onFrameResizerWindowBlur.bind(this), false);
        this._frameResizeEventListeners.addEventListener(window, 'touchmove', this._onFrameResizerTouchMove.bind(this), false);

        const {documentElement} = document;
        if (documentElement !== null) {
            documentElement.dataset.isResizing = 'true';
        }

        this._initializeFrameResize(token);
    }

    async _initializeFrameResize(token) {
        const size = await this._invokeContentOrigin('getFrameSize');
        if (this._frameResizeToken !== token) { return; }
        this._frameResizeStartSize = size;
    }

    _stopFrameResize() {
        if (this._frameResizeToken === null) { return; }

        this._frameResizeEventListeners.removeAllEventListeners();
        this._frameResizeStartSize = null;
        this._frameResizeStartOffset = null;
        this._frameResizeTouchIdentifier = null;
        this._frameResizeToken = null;

        const {documentElement} = document;
        if (documentElement !== null) {
            delete documentElement.dataset.isResizing;
        }
    }

    async _updateFrameSize(x, y) {
        const handleSize = this._frameResizeHandle.getBoundingClientRect();
        let {width, height} = this._frameResizeStartSize;
        width += x - this._frameResizeStartOffset.x;
        height += y - this._frameResizeStartOffset.y;
        width = Math.max(Math.max(0, handleSize.width), width);
        height = Math.max(Math.max(0, handleSize.height), height);
        await this._invokeContentOrigin('setFrameSize', {width, height});
    }

    _getTouch(touchList, identifier) {
        for (const touch of touchList) {
            if (touch.identifier === identifier) {
                return touch;
            }
        }
        return null;
    }

    async _invokeContentOrigin(action, params={}) {
        return await this._display.invokeContentOrigin(action, params);
    }
}
