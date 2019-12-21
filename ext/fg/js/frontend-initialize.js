/*
 * Copyright (C) 2019-2020  Alex Yatskov <alex@foosoft.net>
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

/*global apiOptionsGet, apiFrameInformationGet, PopupProxyHost, PopupProxy, Frontend*/

async function main() {
    const data = window.frontendInitializationData || {};
    const {id, depth=0, parentFrameId, ignoreNodes, url, proxy=false} = data;

    let inIframe = false;
    if (!proxy) {
        const {frameId} = await apiFrameInformationGet();
        if (typeof frameId === 'number' && frameId !== 0) {
            const optionsContext = {
                depth,
                url: window.location.href
            };
            const options = await apiOptionsGet(optionsContext);
            if (options.general.showIframePopupInRootFrame) {
                inIframe = true;
            }
        }
    }

    const rootId = 'root';
    let popup;
    if (inIframe) {
        // TODO : Due to timing issues, the root frame may not be loaded before this proxy
        // is used. There needs to be some operation here which awaits for the frame to be loaded.
        popup = new PopupProxy(rootId, 0, null, 0, url);
    } else if (proxy) {
        popup = new PopupProxy(null, depth + 1, id, parentFrameId, url);
    } else {
        const popupHost = new PopupProxyHost();
        await popupHost.prepare();

        popup = popupHost.getOrCreatePopup(rootId);
    }

    const frontend = new Frontend(popup, ignoreNodes);
    await frontend.prepare();
}

main();
