/*
 * Copyright (C) 2019 Alex Yatskov <alex@foosoft.net>
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


class PopupProxy {
    constructor(parentId, parentFrameId) {
        this.parentId = parentId;
        this.parentFrameId = parentFrameId;
        this.id = null;
        this.idPromise = null;
        this.parent = null;
        this.children = [];
        this.depth = 0;

        this.container = null;

        this.apiSender = new FrontendApiSender();
    }

    getPopupId() {
        if (this.idPromise === null) {
            this.idPromise = this.getPopupIdAsync();
        }
        return this.idPromise;
    }

    async getPopupIdAsync() {
        const id = await this.invokeHostApi('createNestedPopup', {parentId: this.parentId});
        this.id = id;
        return id;
    }

    async show(elementRect, options) {
        const id = await this.getPopupId();
        elementRect = PopupProxy.DOMRectToJson(elementRect);
        return await this.invokeHostApi('show', {id, elementRect, options});
    }

    async showOrphaned(elementRect, options) {
        const id = await this.getPopupId();
        elementRect = PopupProxy.DOMRectToJson(elementRect);
        return await this.invokeHostApi('showOrphaned', {id, elementRect, options});
    }

    async hide() {
        if (this.id === null) {
            return;
        }
        return await this.invokeHostApi('hide', {id: this.id});
    }

    async setVisible(visible) {
        const id = await this.getPopupId();
        return await this.invokeHostApi('setVisible', {id, visible});
    }

    async containsPoint(point) {
        if (this.id === null) {
            return false;
        }
        return await this.invokeHostApi('containsPoint', {id: this.id, point});
    }

    async termsShow(elementRect, definitions, options, context) {
        const id = await this.getPopupId();
        elementRect = PopupProxy.DOMRectToJson(elementRect);
        return await this.invokeHostApi('termsShow', {id, elementRect, definitions, options, context});
    }

    async kanjiShow(elementRect, definitions, options, context) {
        const id = await this.getPopupId();
        elementRect = PopupProxy.DOMRectToJson(elementRect);
        return await this.invokeHostApi('kanjiShow', {id, elementRect, definitions, options, context});
    }

    async clearAutoPlayTimer() {
        if (this.id === null) {
            return;
        }
        return await this.invokeHostApi('clearAutoPlayTimer', {id: this.id});
    }

    invokeHostApi(action, params={}) {
        if (typeof this.parentFrameId !== 'number') {
            return Promise.reject('Invalid frame');
        }
        return this.apiSender.invoke(action, params, `popup-proxy-host#${this.parentFrameId}`);
    }

    static DOMRectToJson(domRect) {
        return {
            x: domRect.x,
            y: domRect.y,
            width: domRect.width,
            height: domRect.height
        };
    }
}
