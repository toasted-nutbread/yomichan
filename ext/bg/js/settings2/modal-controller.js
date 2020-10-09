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
 * Modal
 */

class ModalController {
    constructor() {
        this._modals = [];
        this._modalMap = new Map();
    }

    prepare() {
        for (const node of document.querySelectorAll('.modal-container')) {
            const {id} = node;
            const modal = new Modal(node);
            this._modalMap.set(id, modal);
            this._modals.push(modal);
            node.addEventListener('click', this._onModalContainerClick.bind(this, modal), false);
        }

        const onModalAction = this._onModalAction.bind(this);
        for (const node of document.querySelectorAll('[data-modal-action]')) {
            node.addEventListener('click', onModalAction, false);
        }

        window.addEventListener('keydown', this._onKeyDown.bind(this), false);
    }

    getModal(name) {
        return this._modalMap.get(name);
    }

    // Private

    _onKeyDown(e) {
        switch (e.code) {
            case 'Escape':
                this._closeTopModal();
                e.preventDefault();
                break;
        }
    }

    _onModalContainerClick(modal, e) {
        if (e.currentTarget !== e.target) { return; }
        modal.setVisible(false);
    }

    _onModalAction(e) {
        const node = e.currentTarget;
        const {modalAction} = node.dataset;
        if (typeof modalAction !== 'string') { return; }

        let [action, target] = modalAction.split(',');
        if (typeof target === 'undefined') {
            const currentModal = node.closest('.modal-container');
            if (currentModal === null) { return; }
            target = currentModal.id;
        }

        const modal = this._modalMap.get(target);
        if (typeof modal === 'undefined') { return; }

        switch (action) {
            case 'show':
                modal.setVisible(true);
                break;
            case 'hide':
                modal.setVisible(false);
                break;
            case 'toggle':
                modal.setVisible(!modal.isVisible());
                break;
        }

        e.preventDefault();
    }

    _closeTopModal() {
        for (let i = this._modals.length - 1; i >= 0; --i) {
            const modal = this._modals[i];
            if (modal.isVisible()) {
                modal.setVisible(false);
                return;
            }
        }
    }
}
