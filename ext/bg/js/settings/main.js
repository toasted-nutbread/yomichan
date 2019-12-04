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


class MainSettingsAssigner {
    constructor() {
        this._source = null;
        this._onMessageListener = null;
        this._currentProfileIndex = 0;
        this._eventDispatcher = new EventDispatcher();
        this._settingsObserver = new SettingsObserver();
        this._settingsObserver.onElementValueChanged = (...args) => this._onElementValueChanged(...args);
        this._settingsObserver.setElementValue = (...args) => this._setElementValue(...args);
        this.options = null;
        this.optionsFull = null;
        this.hasOptions = false;
    }

    async prepare(source, element) {
        this._source = source;
        if (this._onMessageListener === null) {
            this._onMessageListener = (...args) => this._onMessage(...args);
            chrome.runtime.onMessage.addListener(this._onMessageListener);
        }
        this._settingsObserver.observe(element);
        await this._updateOptions(false);
    }

    cleanup() {
        if (this._onMessageListener !== null) {
            chrome.runtime.onMessage.removeListener(this._onMessageListener);
            this._onMessageListener = null;
        }
        this._settingsObserver.disconnect();
    }

    async setCurrentProfileIndex(value) {
        this._currentProfileIndex = value;
        await this._updateOptions(false);
    }

    getOptionsContext() {
        return {
            index: this._currentProfileIndex
        };
    }

    on(...args) { return this._eventDispatcher.on(...args); }
    off(...args) { return this._eventDispatcher.off(...args); }

    async _updateOptions(sourceIsSelf) {
        const optionsContext = this.getOptionsContext();
        const [options, optionsFull] = await Promise.all([apiOptionsGet(optionsContext), apiOptionsGetFull()]);
        this.options = options;
        this.optionsFull = optionsFull;
        this.hasOptions = true;
        if (!sourceIsSelf) {
            this._settingsObserver.setOptions(options, {
                profile: options,
                global: optionsFull
            });
        }
        this._onOptionsUpdated(options, optionsFull, sourceIsSelf);
    }

    async _onElementValueChanged(elementObserver) {
        const value = this._transformValue(elementObserver.value, elementObserver.element, false);
        const newValue = await this._setOptionValue(elementObserver.pathArray, value, elementObserver.scope);
        if (newValue !== value) {
            elementObserver.value = newValue;
        }
        await this._updateOptions(true);
    }

    _setElementValue(elementObserver, value) {
        value = this._transformValue(value, elementObserver.element, true);
        elementObserver.value = value;
    }

    async _setOptionValue(path, value, scope) {
        try {
            const target = {path, value};
            if (scope !== 'global') {
                target.optionsContext = this.getOptionsContext();
            }
            const [{result, error}] = await apiOptionsSet(this._source, [target]);
            if (error !== null) {
                this._onError(jsonToError(error));
            }
            return result;
        } catch (e) {
            this._onError(e);
            return value;
        }
    }

    _transformValue(value, element, toHtml) {
        const transforms = MainSettingsAssigner._transforms;
        const transformName = element.dataset.optionTransform;
        if (typeof transformName === 'string' && transformName.length > 0 && hasOwn(transforms, transformName)) {
            let transform = transforms[transformName];
            transform = toHtml ? transform.toHtml : transform.fromHtml;
            value = transform(value, element);
        }
        return value;
    }

    _onError(error) {
        // TODO : show error
        logError(error);
    }

    _onSingleOptionUpdated() {
        if (!this.hasOptions) { return; }

    }

    _onOptionsUpdated(options, optionsFull, sourceIsSelf) {
        const data = document.documentElement.dataset;
        data.optionsAnkiEnable = `${!!options.anki.enable}`;
        data.optionsGeneralDebugInfo = `${!!options.general.debugInfo}`;
        data.optionsGeneralShowAdvanced = `${!!options.general.showAdvanced}`;
        data.optionsGeneralResultOutputMode = `${options.general.resultOutputMode}`;

        if (options.general.debugInfo) {
            const temp = utilIsolate(options);
            temp.anki.fieldTemplates = '...';
            const text = JSON.stringify(temp, null, 4);
            $('#debug').text(text);
        }

        this._eventDispatcher.trigger('optionsUpdated', {options, optionsFull, sourceIsSelf});
    }

    _onMessage({action, params}) {
        switch (action) {
            case 'optionsUpdate':
                this._onRemoteOptionsUpdate(params);
                break;
        }
    }

    async _onRemoteOptionsUpdate({source}) {
        if (source === this._source) { return; }
        await this._updateOptions(false);
    }
}

MainSettingsAssigner._transforms = {
    stringArray: {
        toHtml(value, element) {
            const {joiner} = JSON.parse(element.dataset.optionTransformData);
            return value.join(joiner);
        },
        fromHtml(value, element) {
            const {regex, regexFlags=''} = JSON.parse(element.dataset.optionTransformData);
            const r = new RegExp(regex, regexFlags);
            return value.split(r).filter((v) => v.length > 0);
        }
    },
    stringToNumber: {
        toHtml(value) {
            return `${value}`;
        },
        fromHtml(value) {
            return parseFloat(value);
        }
    }
};

const settings = new MainSettingsAssigner();


// TODO : Remove
async function getOptionsArray() {
    const optionsFull = await apiOptionsGetFull();
    return optionsFull.profiles.map((profile) => profile.options);
}


function settingsGetSource() {
    return new Promise((resolve) => {
        chrome.tabs.getCurrent((tab) => resolve(`settings${tab ? tab.id : ''}`));
    });
}

// TODO : Remove
async function settingsSaveOptions() {
    const source = await settingsGetSource();
    await apiOptionsSave(source);
}

function onMessage({action}, sender, callback) {
    switch (action) {
        case 'getUrl':
            callback({url: window.location.href});
            break;
    }
}


function showExtensionInformation() {
    const node = document.getElementById('extension-info');
    if (node === null) { return; }

    const manifest = chrome.runtime.getManifest();
    node.textContent = `${manifest.name} v${manifest.version}`;
}


async function onReady() {
    const source = await settingsGetSource();
    settings.prepare(source, document.body);

    showExtensionInformation();

    appearanceInitialize();
    await audioSettingsInitialize();
    await profileOptionsSetup();
    await dictSettingsInitialize();
    ankiInitialize();
    ankiTemplatesInitialize();

    storageInfoInitialize();

    chrome.runtime.onMessage.addListener(onMessage);
}

$(document).ready(() => onReady());
