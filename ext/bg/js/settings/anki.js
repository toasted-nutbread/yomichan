/*
 * Copyright (C) 2019  Alex Yatskov <alex@foosoft.net>
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


// Private

let _ankiDataPopulated = false;


function _ankiSpinnerShow(show) {
    const spinner = $('#anki-spinner');
    if (show) {
        spinner.show();
    } else {
        spinner.hide();
    }
}

function _ankiSetError(error) {
    const node = document.querySelector('#anki-error');
    if (!node) { return; }
    if (error) {
        node.hidden = false;
        node.textContent = `${error}`;
    }
    else {
        node.hidden = true;
        node.textContent = '';
    }
}

function _ankiSetDropdownOptions(dropdown, optionValues) {
    const fragment = document.createDocumentFragment();
    for (const optionValue of optionValues) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        fragment.appendChild(option);
    }
    dropdown.textContent = '';
    dropdown.appendChild(fragment);
}

async function _ankiDeckAndModelPopulate(options) {
    const termsDeck = {value: options.anki.terms.deck, selector: '#anki-terms-deck'};
    const kanjiDeck = {value: options.anki.kanji.deck, selector: '#anki-kanji-deck'};
    const termsModel = {value: options.anki.terms.model, selector: '#anki-terms-model'};
    const kanjiModel = {value: options.anki.kanji.model, selector: '#anki-kanji-model'};
    try {
        _ankiSpinnerShow(true);
        const [deckNames, modelNames] = await Promise.all([utilAnkiGetDeckNames(), utilAnkiGetModelNames()]);
        deckNames.sort();
        modelNames.sort();
        termsDeck.values = deckNames;
        kanjiDeck.values = deckNames;
        termsModel.values = modelNames;
        kanjiModel.values = modelNames;
        _ankiSetError(null);
    } catch (error) {
        _ankiSetError(error);
    } finally {
        _ankiSpinnerShow(false);
    }

    for (const {value, values, selector} of [termsDeck, kanjiDeck, termsModel, kanjiModel]) {
        const node = document.querySelector(selector);
        _ankiSetDropdownOptions(node, Array.isArray(values) ? values : [value]);
        node.value = value;
    }
}

function _ankiCreateFieldTemplate(name, value, pathString, markers) {
    const template = document.querySelector('#anki-field-template').content;
    const content = document.importNode(template, true).firstChild;

    content.querySelector('.anki-field-name').textContent = name;

    const field = content.querySelector('.anki-field-value');
    field.dataset.optionTarget = pathString;
    field.dataset.field = name;
    field.value = value;

    content.querySelector('.anki-field-marker-list').appendChild(ankiGetFieldMarkersHtml(markers));

    return content;
}

async function _ankiFieldsPopulate(tabId, options) {
    const tab = document.querySelector(`.tab-pane[data-anki-card-type=${tabId}]`);
    const container = tab.querySelector('tbody');
    const markers = ankiGetFieldMarkers(tabId);

    const fragment = document.createDocumentFragment();
    const fields = options.anki[tabId].fields;
    const pathArray = ['anki', tabId, 'fields', null];
    for (const name of Object.keys(fields)) {
        pathArray[pathArray.length - 1] = name;
        const pathString = getPropertyPathString(pathArray);
        const value = fields[name];
        const html = _ankiCreateFieldTemplate(name, value, pathString, markers);
        fragment.appendChild(html);
    }

    container.textContent = '';
    container.appendChild(fragment);

    for (const node of container.querySelectorAll('.marker-link')) {
        node.addEventListener('click', (e) => _onAnkiMarkerClicked(e), false);
    }
}

function _onAnkiMarkerClicked(e) {
    e.preventDefault();
    const link = e.currentTarget;
    const input = $(link).closest('.input-group').find('.anki-field-value')[0];
    input.value = `{${link.textContent}}`;
    input.dispatchEvent(new Event('change'));
}

async function _onAnkiModelChanged(e) {
    const node = e.currentTarget;
    let fieldNames;
    try {
        const modelName = node.value;
        fieldNames = await utilAnkiGetModelFieldNames(modelName);
        _ankiSetError(null);
    } catch (error) {
        _ankiSetError(error);
        return;
    } finally {
        _ankiSpinnerShow(false);
    }

    const tabId = node.dataset.ankiCardType;
    if (tabId !== 'terms' && tabId !== 'kanji') { return; }

    const fields = {};
    for (const name of fieldNames) {
        fields[name] = '';
    }

    const optionsContext = getOptionsContext();
    const options = await apiOptionsGet(optionsContext);
    options.anki[tabId].fields = utilBackgroundIsolate(fields);
    await settingsSaveOptions();

    await _ankiFieldsPopulate(tabId, options);
}

async function _onAnkiOptionsChanged(options) {
    if (!options.anki.enable) {
        _ankiDataPopulated = false;
        return;
    }

    if (_ankiDataPopulated) { return; }

    await _ankiDeckAndModelPopulate(options);
    _ankiDataPopulated = true;
    await Promise.all([_ankiFieldsPopulate('terms', options), _ankiFieldsPopulate('kanji', options)]);
}


// Public

function ankiGetFieldMarkersHtml(markers) {
    const template = document.querySelector('#anki-field-marker-template').content;
    const fragment = document.createDocumentFragment();
    for (const marker of markers) {
        const markerNode = document.importNode(template, true).firstChild;
        markerNode.querySelector('.marker-link').textContent = marker;
        fragment.appendChild(markerNode);
    }
    return fragment;
}

function ankiGetFieldMarkers(type) {
    switch (type) {
        case 'terms':
            return [
                'audio',
                'cloze-body',
                'cloze-prefix',
                'cloze-suffix',
                'dictionary',
                'expression',
                'furigana',
                'furigana-plain',
                'glossary',
                'glossary-brief',
                'reading',
                'screenshot',
                'sentence',
                'tags',
                'url'
            ];
        case 'kanji':
            return [
                'character',
                'dictionary',
                'glossary',
                'kunyomi',
                'onyomi',
                'screenshot',
                'sentence',
                'tags',
                'url'
            ];
        default:
            return [];
    }
}


function ankiInitialize() {
    for (const node of document.querySelectorAll('#anki-terms-model,#anki-kanji-model')) {
        node.addEventListener('change', (e) => _onAnkiModelChanged(e), false);
    }

    settings.on('optionsUpdated', ({options}) => _onAnkiOptionsChanged(options));
    if (settings.hasOptions) {
        _onAnkiOptionsChanged(settings.options);
    }
}
