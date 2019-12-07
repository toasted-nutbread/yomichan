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


class Backend {
    constructor() {
        this.translator = new Translator();
        this.anki = new AnkiNull();
        this.mecab = new Mecab();
        this.options = null;
        this.optionsRaw = null;
        this.optionsSchema = null;
        this.optionsContext = {
            depth: 0,
            url: window.location.href
        };

        this.isPreparedResolve = null;
        this.isPreparedPromise = new Promise((resolve) => (this.isPreparedResolve = resolve));

        this.clipboardPasteTarget = document.querySelector('#clipboard-paste-target');

        this.apiForwarder = new BackendApiForwarder();
    }

    async prepare() {
        await this.translator.prepare();

        this.optionsSchema = await requestJson(chrome.runtime.getURL('/bg/data/options-schema.json'), 'GET');
        this.optionsRaw = await optionsLoad();
        this.optionsRaw = JsonSchema.getValidValueOrDefault(this.optionsSchema, this.optionsRaw);
        this.options = JsonSchema.createProxy(this.optionsRaw, this.optionsSchema);

        this.onOptionsUpdated('background');

        if (chrome.commands !== null && typeof chrome.commands === 'object') {
            chrome.commands.onCommand.addListener(this.onCommand.bind(this));
        }
        chrome.runtime.onMessage.addListener(this.onMessage.bind(this));

        const options = this.getOptionsSync(this.optionsContext);
        if (options.general.showGuide) {
            chrome.tabs.create({url: chrome.runtime.getURL('/bg/guide.html')});
        }

        this.isPreparedResolve();
        this.isPreparedResolve = null;
        this.isPreparedPromise = null;
    }

    onOptionsUpdated(source) {
        this.applyOptions();

        const callback = () => this.checkLastError(chrome.runtime.lastError);
        chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {action: 'optionsUpdate', params: {source}}, callback);
            }
        });
    }

    onCommand(command) {
        apiCommandExec(command);
    }

    onMessage({action, params}, sender, callback) {
        const handlers = Backend.messageHandlers;
        if (hasOwn(handlers, action)) {
            const handler = handlers[action];
            const promise = handler(params, sender);
            promise.then(
                (result) => callback({result}),
                (error) => callback({error: errorToJson(error)})
            );
        }

        return true;
    }

    applyOptions() {
        const options = this.getOptionsSync(this.optionsContext);
        if (!options.general.enable) {
            this.setExtensionBadgeBackgroundColor('#555555');
            this.setExtensionBadgeText('off');
        } else if (!dictConfigured(options)) {
            this.setExtensionBadgeBackgroundColor('#f0ad4e');
            this.setExtensionBadgeText('!');
        } else {
            this.setExtensionBadgeText('');
        }

        this.anki = options.anki.enable ? new AnkiConnect(options.anki.server) : new AnkiNull();

        if (options.parsing.enableMecabParser) {
            this.mecab.startListener();
        } else {
            this.mecab.stopListener();
        }
    }

    async getFullOptions() {
        if (this.isPreparedPromise !== null) {
            await this.isPreparedPromise;
        }
        return this.options;
    }

    async getOptions(optionsContext) {
        if (this.isPreparedPromise !== null) {
            await this.isPreparedPromise;
        }
        return this.getOptionsSync(optionsContext);
    }

    getOptionsSync(optionsContext) {
        return this.getProfileSync(optionsContext).options;
    }

    getProfileSync(optionsContext) {
        const profiles = this.options.profiles;
        if (typeof optionsContext.index === 'number') {
            return profiles[optionsContext.index];
        }
        const profile = this.getProfileFromContext(optionsContext);
        return profile !== null ? profile : this.options.profiles[this.options.profileCurrent];
    }

    getProfileFromContext(optionsContext) {
        for (const profile of this.options.profiles) {
            const conditionGroups = profile.conditionGroups;
            if (conditionGroups.length > 0 && Backend.testConditionGroups(conditionGroups, optionsContext)) {
                return profile;
            }
        }
        return null;
    }

    static testConditionGroups(conditionGroups, data) {
        if (conditionGroups.length === 0) { return false; }

        for (const conditionGroup of conditionGroups) {
            const conditions = conditionGroup.conditions;
            if (conditions.length > 0 && Backend.testConditions(conditions, data)) {
                return true;
            }
        }

        return false;
    }

    static testConditions(conditions, data) {
        for (const condition of conditions) {
            if (!conditionsTestValue(profileConditionsDescriptor, condition.type, condition.operator, condition.value, data)) {
                return false;
            }
        }
        return true;
    }

    setExtensionBadgeBackgroundColor(color) {
        if (typeof chrome.browserAction.setBadgeBackgroundColor === 'function') {
            chrome.browserAction.setBadgeBackgroundColor({color});
        }
    }

    setExtensionBadgeText(text) {
        if (typeof chrome.browserAction.setBadgeText === 'function') {
            chrome.browserAction.setBadgeText({text});
        }
    }

    checkLastError() {
        // NOP
    }
}

Backend.messageHandlers = {
    optionsGet: ({optionsContext}) => apiOptionsGet(optionsContext),
    optionsSet: ({source, targets}) => apiOptionsSet(source, targets),
    kanjiFind: ({text, optionsContext}) => apiKanjiFind(text, optionsContext),
    termsFind: ({text, details, optionsContext}) => apiTermsFind(text, details, optionsContext),
    textParse: ({text, optionsContext}) => apiTextParse(text, optionsContext),
    textParseMecab: ({text, optionsContext}) => apiTextParseMecab(text, optionsContext),
    definitionAdd: ({definition, mode, context, optionsContext}) => apiDefinitionAdd(definition, mode, context, optionsContext),
    definitionsAddable: ({definitions, modes, optionsContext}) => apiDefinitionsAddable(definitions, modes, optionsContext),
    noteView: ({noteId}) => apiNoteView(noteId),
    templateRender: ({template, data, dynamic}) => apiTemplateRender(template, data, dynamic),
    commandExec: ({command, params}) => apiCommandExec(command, params),
    audioGetUrl: ({definition, source, optionsContext}) => apiAudioGetUrl(definition, source, optionsContext),
    screenshotGet: ({options}, sender) => apiScreenshotGet(options, sender),
    forward: ({action, params}, sender) => apiForward(action, params, sender),
    frameInformationGet: (params, sender) => apiFrameInformationGet(sender),
    injectStylesheet: ({css}, sender) => apiInjectStylesheet(css, sender),
    getEnvironmentInfo: () => apiGetEnvironmentInfo(),
    clipboardGet: () => apiClipboardGet()
};

window.yomichan_backend = new Backend();
window.yomichan_backend.prepare();
