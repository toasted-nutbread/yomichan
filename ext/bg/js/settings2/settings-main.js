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
 * GenericSettingController
 * SettingsController
 * api
 */

(async () => {
    api.forwardLogsToBackend();
    await yomichan.prepare();

    const optionsFull = await api.optionsGetFull();

    const preparePromises = [];

    const settingsController = new SettingsController(optionsFull.profileCurrent);
    settingsController.prepare();

    const genericSettingController = new GenericSettingController(settingsController);
    preparePromises.push(genericSettingController.prepare());

    await Promise.all(preparePromises);

    document.documentElement.dataset.loaded = 'true';

    const onScroll = (e) => {
        const content = e.currentTarget;
        const topLink = document.querySelector('.sidebar-top-link');
        const scrollTop = content.scrollTop;
        topLink.hidden = (scrollTop < 100);
    };
    document.querySelector('.content').addEventListener('scroll', onScroll, {passive: true});

    // TODO : This can be done as soon as advanced is set, which can be done immediately after optionsFull
    const updateScrollTarget = () => {
        const hash = window.location.hash;
        if (!hash.startsWith('#!')) { return; }

        const content = document.querySelector('.content');
        const target = document.getElementById(hash.substring(2));
        if (content !== null && target !== null) {
            const rect1 = content.getBoundingClientRect();
            const rect2 = target.getBoundingClientRect();
            content.scrollTop += rect2.top - rect1.top;
            onScroll({currentTarget: content});
        }
    };
    window.addEventListener('popstate', updateScrollTarget, false);
    updateScrollTarget();

    document.querySelector('.fab-button').addEventListener('click', () => {
        document.body.classList.toggle('sidebar-visible');
    }, false);
})();

for (const node of document.querySelectorAll('.test')) {
    node.addEventListener('click', () => {
        document.querySelector('.modal-container').classList.toggle('modal-container-open');
        document.querySelector('.modal-container').focus();
    });
}

document.querySelector('#show-preview-checkbox').addEventListener('change', (e) => {
    document.querySelector('.preview-frame-container').classList.toggle('preview-frame-container-visible', e.checked);
});

function getMoreContainer(link) {
    const v = link.dataset.parentDistance;
    const distance = v ? parseInt(v, 10) : 1;
    if (Number.isNaN(distance)) { return null; }

    for (let i = 0; i < distance; ++i) {
        link = link.parentNode;
        if (link === null) { break; }
    }
    return link;
}

for (const node of document.querySelectorAll('.more-toggle')) {
    node.addEventListener('click', (e) => {
        const container = getMoreContainer(e.currentTarget);
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
    });
}

document.querySelector('#content-scroll-focus').focus();
