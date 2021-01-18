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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global
 * HotkeyUtil
 * api
 */

class HotkeyHelpController {
    constructor() {
        this._hotkeyUtil = new HotkeyUtil();
        this._localActionHotseys = new Map();
        this._globalActionHotkeys = new Map();
        this._replacementPattern = /\{0\}/g;
    }

    async prepare() {
        const {platform: {os}} = await api.getEnvironmentInfo();
        this._hotkeyUtil.os = os;
        await this._setupGlobalCommands(this._globalActionHotkeys);
    }

    setOptions(options) {
        const hotkeys = options.inputs.hotkeys;
        const hotkeyMap = this._localActionHotseys;
        hotkeyMap.clear();
        for (const {enabled, action, key, modifiers} of hotkeys) {
            if (!enabled || key === null || action === '' || hotkeyMap.has(action)) { continue; }
            hotkeyMap.set(action, this._hotkeyUtil.getInputDisplayValue(key, modifiers));
        }
    }

    setupNode(node) {
        const globalPrexix = 'global:';
        for (const node2 of node.querySelectorAll('[data-hotkey]')) {
            let [action, attributes, values] = JSON.parse(node2.dataset.hotkey);
            if (!Array.isArray(attributes)) { attributes = [attributes]; }
            const multipleValues = Array.isArray(values);

            const actionIsGlobal = action.startsWith(globalPrexix);
            if (actionIsGlobal) { action = action.substring(globalPrexix.length); }

            const hotkey = (actionIsGlobal ? this._globalActionHotkeys : this._localActionHotseys).get(action);
            if (typeof hotkey === 'undefined') { continue; }

            for (let i = 0, ii = attributes.length; i < ii; ++i) {
                const attribute = attributes[i];
                let value = (multipleValues ? values[i] : values);

                value = value.replace(this._replacementPattern, hotkey);

                node2.setAttribute(attribute, value);
            }
        }
    }

    // Private

    async _setupGlobalCommands(commandMap) {
        const commands = await new Promise((resolve, reject) => {
            chrome.commands.getAll((result) => {
                const e = chrome.runtime.lastError;
                if (e) {
                    reject(new Error(e.message));
                } else {
                    resolve(result);
                }
            });
        });

        commandMap.clear();
        for (const {name, shortcut} of commands) {
            if (shortcut.length === 0) { continue; }
            const {key, modifiers} = this._hotkeyUtil.convertCommandToInput(shortcut);
            commandMap.set(name, this._hotkeyUtil.getInputDisplayValue(key, modifiers));
        }
        return commandMap;
    }
}
