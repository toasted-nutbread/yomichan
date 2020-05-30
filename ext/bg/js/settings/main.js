/*
 * Copyright (C) 2016-2020  Yomichan Authors
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
 * AnkiController
 * AnkiTemplatesController
 * AudioController
 * ClipboardPopupsController
 * DictionaryController
 * GenericSettingController
 * PopupPreviewController
 * ProfileController
 * SettingsBackup
 * SettingsController
 * StorageController
 * api
 */

function getOptionsContext() {
    return settingsController.getOptionsContext();
}

function getProfileIndex() {
    return settingsController.profileIndex;
}

function setProfileIndex(value) {
    settingsController.profileIndex = value;
}


async function getOptionsMutable() {
    return await settingsController.getOptionsMutable();
}

async function getOptionsFullMutable() {
    return await settingsController.getOptionsFullMutable();
}


async function settingsSaveOptions() {
    await settingsController.save();
}

async function onOptionsUpdated() {
    const optionsContext = getOptionsContext();
    const options = await getOptionsMutable(optionsContext);

    if (ankiTemplatesController !== null) {
        ankiTemplatesController.updateValue();
    }
    if (dictionaryController !== null) {
        dictionaryController.optionsChanged();
    }
    if (ankiController !== null) {
        ankiController.optionsChanged();
    }

    if (genericSettingController !== null) {
        genericSettingController.optionsChanged(options);
    }
}


function showExtensionInformation() {
    const node = document.getElementById('extension-info');
    if (node === null) { return; }

    const manifest = chrome.runtime.getManifest();
    node.textContent = `${manifest.name} v${manifest.version}`;
}

async function settingsPopulateModifierKeys() {
    const scanModifierKeySelect = document.querySelector('#scan-modifier-key');
    scanModifierKeySelect.textContent = '';

    const environment = await api.getEnvironmentInfo();
    const modifierKeys = [
        {value: 'none', name: 'None'},
        ...environment.modifiers.keys
    ];
    for (const {value, name} of modifierKeys) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = name;
        scanModifierKeySelect.appendChild(option);
    }
}

async function setupEnvironmentInfo() {
    const {browser, platform} = await api.getEnvironmentInfo();
    document.documentElement.dataset.browser = browser;
    document.documentElement.dataset.operatingSystem = platform.os;
}

let settingsController = null;
let ankiController = null;
let ankiTemplatesController = null;
let dictionaryController = null;
let genericSettingController = null;

async function onReady() {
    api.forwardLogsToBackend();
    await yomichan.prepare();

    const optionsFull = await api.optionsGetFull();
    settingsController = new SettingsController(optionsFull.profileCurrent);
    settingsController.prepare();

    setupEnvironmentInfo();
    showExtensionInformation();
    settingsPopulateModifierKeys();

    const storageController = new StorageController();
    storageController.prepare();

    genericSettingController = new GenericSettingController();
    genericSettingController.prepare();
    new ClipboardPopupsController(settingsController).prepare();
    new PopupPreviewController(settingsController).prepare();
    new AudioController().prepare();
    new ProfileController().prepare();
    dictionaryController = new DictionaryController(storageController);
    dictionaryController.prepare();
    ankiController = new AnkiController();
    ankiController.prepare();
    ankiTemplatesController = new AnkiTemplatesController(ankiController);
    ankiTemplatesController.prepare();
    new SettingsBackup().prepare();

    settingsController.on('optionsChanged', onOptionsUpdated);
    onOptionsUpdated();
}

$(document).ready(() => onReady());
