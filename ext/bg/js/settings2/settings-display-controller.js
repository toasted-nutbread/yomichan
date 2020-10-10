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

class SettingsDisplayController {
    constructor() {
        this._contentNode = null;
        this._previewFrameContainer = null;
    }

    prepare() {
        this._contentNode = document.querySelector('.content');
        this._previewFrameContainer = document.querySelector('.preview-frame-container');

        for (const fabButton of document.querySelectorAll('.fab-button')) {
            fabButton.addEventListener('click', this._onFabButtonClick.bind(this), false);
        }

        for (const node of document.querySelectorAll('.more-toggle')) {
            node.addEventListener('click', this._onMoreToggleClick.bind(this), false);
        }

        this._contentNode.addEventListener('scroll', this._onScroll.bind(this), {passive: true});
        document.querySelector('#show-preview-checkbox').addEventListener('change', this._onShowPreviewCheckboxChange.bind(this), false);

        window.addEventListener('popstate', this._onPopState.bind(this), false);
        this._updateScrollTarget();
    }

    // Private

    _onScroll(e) {
        const content = e.currentTarget;
        const topLink = document.querySelector('.sidebar-top-link');
        const scrollTop = content.scrollTop;
        topLink.hidden = (scrollTop < 100);
    }

    _onFabButtonClick(e) {
        const action = e.currentTarget.dataset.action;
        switch (action) {
            case 'toggle-sidebar':
                document.body.classList.toggle('sidebar-visible');
                break;
            case 'toggle-preview-sidebar':
                document.body.classList.toggle('preview-sidebar-visible');
                break;
        }
    }

    _onShowPreviewCheckboxChange(e) {
        this._previewFrameContainer.classList.toggle('preview-frame-container-visible', e.checked);
    }

    _onMoreToggleClick(e) {
        const container = this._getMoreContainer(e.currentTarget);
        if (container === null) { return; }

        const more = container.querySelector('.more');
        if (more === null) { return; }

        const moreVisible = more.hidden;
        more.hidden = !moreVisible;
        for (const moreToggle of container.querySelectorAll('.more-toggle')) {
            moreToggle.dataset.expanded = `${moreVisible}`;
        }

        e.preventDefault();
        return false;
    }

    _onPopState() {
        this._updateScrollTarget();
    }

    _updateScrollTarget() {
        const hash = window.location.hash;
        if (!hash.startsWith('#!')) { return; }

        const content = this._contentNode;
        const target = document.getElementById(hash.substring(2));
        if (content === null || target === null) { return; }

        const rect1 = content.getBoundingClientRect();
        const rect2 = target.getBoundingClientRect();
        content.scrollTop += rect2.top - rect1.top;
        this._onScroll({currentTarget: content});
    }

    _getMoreContainer(link) {
        const v = link.dataset.parentDistance;
        const distance = v ? parseInt(v, 10) : 1;
        if (Number.isNaN(distance)) { return null; }

        for (let i = 0; i < distance; ++i) {
            link = link.parentNode;
            if (link === null) { break; }
        }
        return link;
    }
}
