/*
 * Copyright (C) 2016  Alex Yatskov <alex@foosoft.net>
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


class Yomichan {
    constructor() {
        Handlebars.partials = Handlebars.templates;
        Handlebars.registerHelper('kanjiLinks', kanjiLinks);

        this.translator = new Translator();
        this.anki = new AnkiConnect();
        this.options = null;
        this.importTabId = null;
        this.setState('disabled');

        chrome.runtime.onMessage.addListener(this.onMessage.bind(this));
        chrome.browserAction.onClicked.addListener(this.onBrowserAction.bind(this));

        loadOptions().then(opts => {
            this.setOptions(opts);
            if (this.options.activateOnStartup) {
                this.setState('loading');
            }
        });
    }

    onImport({state, progress}) {
        if (state === 'begin') {
            chrome.tabs.create({url: chrome.extension.getURL('bg/import.html')}, tab => this.importTabId = tab.id);
        }

        if (this.importTabId !== null) {
            this.tabInvoke(this.importTabId, 'setProgress', progress);
        }

        if (state === 'end') {
            this.importTabId = null;
        }
    }

    onMessage(request, sender, callback) {
        const {action, params} = request, method = this['api_' + action];

        if (typeof(method) === 'function') {
            params.callback = callback;
            method.call(this, params);
        }

        return true;
    }

    onBrowserAction() {
        switch (this.state) {
            case 'disabled':
                this.setState('loading');
                break;
            case 'enabled':
                this.setState('disabled');
                break;
        }
    }

    setState(state) {
        if (this.state === state) {
            return;
        }

        this.state = state;

        switch (state) {
            case 'disabled':
                chrome.browserAction.setBadgeText({text: 'off'});
                break;
            case 'enabled':
                chrome.browserAction.setBadgeText({text: ''});
                break;
            case 'loading':
                chrome.browserAction.setBadgeText({text: '...'});
                this.translator.loadData(this.onImport.bind(this)).then(() => this.setState('enabled'));
                break;
        }

        this.tabInvokeAll('setEnabled', this.state === 'enabled');
    }

    setOptions(options) {
        this.options = options;
        this.tabInvokeAll('setOptions', this.options);
    }

    tabInvokeAll(action, params) {
        chrome.tabs.query({}, tabs => {
            for (const tab of tabs) {
                this.tabInvoke(tab.id, action, params);
            }
        });
    }

    tabInvoke(tabId, action, params) {
        chrome.tabs.sendMessage(tabId, {action, params}, () => null);
    }

    formatField(field, definition, mode) {
        const markers = [
            'audio',
            'character',
            'expression',
            'expression-furigana',
            'glossary',
            'glossary-list',
            'kunyomi',
            'onyomi',
            'reading',
            'sentence',
            'tags',
            'url',
        ];

        for (const marker of markers) {
            let value = definition[marker] || null;
            switch (marker) {
                case 'audio':
                    value = '';
                    break;
                case 'expression':
                    if (mode === 'term_kana' && definition.reading) {
                        value = definition.reading;
                    }
                    break;
                case 'expression-furigana':
                    if (mode === 'term_kana' && definition.reading) {
                        value = definition.reading;
                    } else {
                        value = `<ruby>${definition.expression}<rt>${definition.reading}</rt></ruby>`;
                    }
                    break;
                case 'reading':
                    if (mode === 'term_kana') {
                        value = null;
                    }
                    break;
                case 'glossary-list':
                    if (definition.glossary) {
                        value = '<ol>';
                        for (const gloss of definition.glossary) {
                            value += `<li>${gloss}</li>`;
                        }
                        value += '</ol>';
                    }
                    break;
                case 'tags':
                    if (definition.tags) {
                        value = definition.tags.map(t => t.name);
                    }
                    break;
            }

            if (value !== null && typeof(value) !== 'string') {
                value = value.join(', ');
            }

            field = field.replace(`{${marker}}`, value || '');
        }

        return field;
    }

    formatNote(definition, mode) {
        const note = {fields: {}, tags: this.options.ankiCardTags};

        let fields = [];
        if (mode === 'kanji') {
            fields = this.options.ankiKanjiFields;
            note.deckName = this.options.ankiKanjiDeck;
            note.modelName = this.options.ankiKanjiModel;
        } else {
            fields = this.options.ankiTermFields;
            note.deckName = this.options.ankiTermDeck;
            note.modelName = this.options.ankiTermModel;

            const audio = {
                kanji:  definition.expression,
                kana:   definition.reading,
                fields: []
            };

            for (const name in fields) {
                if (fields[name].includes('{audio}')) {
                    audio.fields.push(name);
                }
            }

            if (audio.fields.length > 0) {
                note.audio = audio;
            }
        }

        for (const name in fields) {
            note.fields[name] = this.formatField(fields[name], definition, mode);
        }

        return note;
    }

    api_getEnabled({callback}) {
        callback(this.state === 'enabled');
    }

    api_getOptions({callback}) {
        loadOptions().then(opts => callback(opts));
    }

    api_findKanji({text, callback}) {
        this.translator.findKanji(text).then(result => callback(result));
    }

    api_findTerm({text, callback}) {
        this.translator.findTerm(text).then(result => callback(result));
    }

    api_renderText({template, data, callback}) {
        callback(Handlebars.templates[template](data));
    }

    api_addDefinition({definition, mode, callback}) {
        const note = this.formatNote(definition, mode);
        this.anki.addNote(note).then(callback);
    }

    api_canAddDefinitions({definitions, modes, callback}) {
        const notes = [];
        for (const definition of definitions) {
            for (const mode of modes) {
                notes.push(this.formatNote(definition, mode));
            }
        }

        this.anki.canAddNotes(notes).then(results => {
            const states = [];
            if (results !== null) {
                for (let resultBase = 0; resultBase < results.length; resultBase += modes.length) {
                    const state = {};
                    for (let modeOffset = 0; modeOffset < modes.length; ++modeOffset) {
                        state[modes[modeOffset]] = results[resultBase + modeOffset];
                    }

                    states.push(state);
                }
            }

            callback(states);
        });
    }

    api_getDeckNames({callback}) {
        this.anki.getDeckNames().then(callback);
    }

    api_getModelNames({callback}) {
        this.anki.getModelNames().then(callback);
    }

    api_getModelFieldNames({modelName, callback}) {
        this.anki.getModelFieldNames(modelName).then(callback);
    }
}

window.yomichan = new Yomichan();
