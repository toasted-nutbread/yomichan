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


async function formRead() {
    const optionsOld = await optionsLoad();
    const optionsNew = $.extend(true, {}, optionsOld);

    optionsNew.general.showGuide = $('#show-usage-guide').prop('checked');
    optionsNew.general.compactTags = $('#compact-tags').prop('checked');
    optionsNew.general.compactGlossaries = $('#compact-glossaries').prop('checked');
    optionsNew.general.autoPlayAudio = $('#auto-play-audio').prop('checked');
    optionsNew.general.resultOutputMode = $('#result-output-mode').val();
    optionsNew.general.audioSource = $('#audio-playback-source').val();
    optionsNew.general.audioVolume = parseFloat($('#audio-playback-volume').val());
    optionsNew.general.debugInfo = $('#show-debug-info').prop('checked');
    optionsNew.general.showAdvanced = $('#show-advanced-options').prop('checked');
    optionsNew.general.maxResults = parseInt($('#max-displayed-results').val(), 10);
    optionsNew.general.popupDisplayMode = $('#popup-display-mode').val();
    optionsNew.general.popupWidth = parseInt($('#popup-width').val(), 10);
    optionsNew.general.popupHeight = parseInt($('#popup-height').val(), 10);
    optionsNew.general.popupHorizontalOffset = parseInt($('#popup-horizontal-offset').val(), 0);
    optionsNew.general.popupVerticalOffset = parseInt($('#popup-vertical-offset').val(), 10);
    optionsNew.general.customPopupCss = $('#custom-popup-css').val();

    optionsNew.scanning.middleMouse = $('#middle-mouse-button-scan').prop('checked');
    optionsNew.scanning.touchInputEnabled = $('#touch-input-enabled').prop('checked');
    optionsNew.scanning.selectText = $('#select-matched-text').prop('checked');
    optionsNew.scanning.alphanumeric = $('#search-alphanumeric').prop('checked');
    optionsNew.scanning.autoHideResults = $('#auto-hide-results').prop('checked');
    optionsNew.scanning.delay = parseInt($('#scan-delay').val(), 10);
    optionsNew.scanning.length = parseInt($('#scan-length').val(), 10);
    optionsNew.scanning.modifier = $('#scan-modifier-key').val();
    optionsNew.scanning.popupNestingMaxDepth = parseInt($('#popup-nesting-max-depth').val(), 10);

    optionsNew.anki.enable = $('#anki-enable').prop('checked');
    optionsNew.anki.tags = $('#card-tags').val().split(/[,; ]+/);
    optionsNew.anki.sentenceExt = parseInt($('#sentence-detection-extent').val(), 10);
    optionsNew.anki.server = $('#interface-server').val();
    optionsNew.anki.screenshot.format = $('#screenshot-format').val();
    optionsNew.anki.screenshot.quality = parseInt($('#screenshot-quality').val(), 10);
    optionsNew.anki.fieldTemplates = $('#field-templates').val();

    if (optionsOld.anki.enable && !ankiErrorShown()) {
        optionsNew.anki.terms.deck = $('#anki-terms-deck').val();
        optionsNew.anki.terms.model = $('#anki-terms-model').val();
        optionsNew.anki.terms.fields = ankiFieldsToDict($('#terms .anki-field-value'));
        optionsNew.anki.kanji.deck = $('#anki-kanji-deck').val();
        optionsNew.anki.kanji.model = $('#anki-kanji-model').val();
        optionsNew.anki.kanji.fields = ankiFieldsToDict($('#kanji .anki-field-value'));
    }

    optionsNew.general.mainDictionary = $('#dict-main').val();
    $('.dict-group').each((index, element) => {
        const dictionary = $(element);
        optionsNew.dictionaries[dictionary.data('title')] = {
            priority: parseInt(dictionary.find('.dict-priority').val(), 10),
            enabled: dictionary.find('.dict-enabled').prop('checked'),
            allowSecondarySearches: dictionary.find('.dict-allow-secondary-searches').prop('checked')
        };
    });

    return {optionsNew, optionsOld};
}

function formUpdateVisibility(options) {
    const general = $('#anki-general');
    if (options.anki.enable) {
        general.show();
    } else {
        general.hide();
    }

    const advanced = $('.options-advanced');
    if (options.general.showAdvanced) {
        advanced.show();
    } else {
        advanced.hide();
    }

    const mainGroup = $('#dict-main-group');
    if (options.general.resultOutputMode === 'merge') {
        mainGroup.show();
    } else {
        mainGroup.hide();
    }

    const debug = $('#debug');
    if (options.general.debugInfo) {
        const temp = utilIsolate(options);
        temp.anki.fieldTemplates = '...';
        const text = JSON.stringify(temp, null, 4);
        debug.html(handlebarsEscape(text));
        debug.show();
    } else {
        debug.hide();
    }
}

async function formMainDictionaryOptionsPopulate(options) {
    const select = $('#dict-main').empty();
    select.append($('<option class="text-muted" value="">Not selected</option>'));

    let mainDictionary = '';
    for (const dictRow of await utilDatabaseSummarize()) {
        if (dictRow.sequenced) {
            select.append($(`<option value="${dictRow.title}">${dictRow.title}</option>`));
            if (dictRow.title === options.general.mainDictionary) {
                mainDictionary = dictRow.title;
            }
        }
    }

    select.val(mainDictionary);
}

async function onFormOptionsChanged(e) {
    if (!e.originalEvent && !e.isTrigger) {
        return;
    }

    const {optionsNew, optionsOld} = await formRead();
    await optionsSave(optionsNew);
    formUpdateVisibility(optionsNew);

    try {
        const ankiUpdated =
            optionsNew.anki.enable !== optionsOld.anki.enable ||
            optionsNew.anki.server !== optionsOld.anki.server;

        if (ankiUpdated) {
            ankiSpinnerShow(true);
            await ankiDeckAndModelPopulate(optionsNew);
            ankiErrorShow();
        }
    } catch (e) {
        ankiErrorShow(e);
    } finally {
        ankiSpinnerShow(false);
    }
}

async function onReady() {
    const options = await optionsLoad();

    $('#show-usage-guide').prop('checked', options.general.showGuide);
    $('#compact-tags').prop('checked', options.general.compactTags);
    $('#compact-glossaries').prop('checked', options.general.compactGlossaries);
    $('#auto-play-audio').prop('checked', options.general.autoPlayAudio);
    $('#result-output-mode').val(options.general.resultOutputMode);
    $('#audio-playback-source').val(options.general.audioSource);
    $('#audio-playback-volume').val(options.general.audioVolume);
    $('#show-debug-info').prop('checked', options.general.debugInfo);
    $('#show-advanced-options').prop('checked', options.general.showAdvanced);
    $('#max-displayed-results').val(options.general.maxResults);
    $('#popup-display-mode').val(options.general.popupDisplayMode);
    $('#popup-width').val(options.general.popupWidth);
    $('#popup-height').val(options.general.popupHeight);
    $('#popup-horizontal-offset').val(options.general.popupHorizontalOffset);
    $('#popup-vertical-offset').val(options.general.popupVerticalOffset);
    $('#custom-popup-css').val(options.general.customPopupCss);

    $('#middle-mouse-button-scan').prop('checked', options.scanning.middleMouse);
    $('#touch-input-enabled').prop('checked', options.scanning.touchInputEnabled);
    $('#select-matched-text').prop('checked', options.scanning.selectText);
    $('#search-alphanumeric').prop('checked', options.scanning.alphanumeric);
    $('#auto-hide-results').prop('checked', options.scanning.autoHideResults);
    $('#scan-delay').val(options.scanning.delay);
    $('#scan-length').val(options.scanning.length);
    $('#scan-modifier-key').val(options.scanning.modifier);
    $('#popup-nesting-max-depth').val(options.scanning.popupNestingMaxDepth);

    $('#dict-purge-link').click(utilAsync(onDictionaryPurge));
    $('#dict-file').change(utilAsync(onDictionaryImport));

    $('#anki-enable').prop('checked', options.anki.enable);
    $('#card-tags').val(options.anki.tags.join(' '));
    $('#sentence-detection-extent').val(options.anki.sentenceExt);
    $('#interface-server').val(options.anki.server);
    $('#screenshot-format').val(options.anki.screenshot.format);
    $('#screenshot-quality').val(options.anki.screenshot.quality);
    $('#field-templates').val(options.anki.fieldTemplates);
    $('#field-templates-reset').click(utilAsync(onAnkiFieldTemplatesReset));
    $('input, select, textarea').not('.anki-model').change(utilAsync(onFormOptionsChanged));
    $('.anki-model').change(utilAsync(onAnkiModelChanged));

    try {
        await dictionaryGroupsPopulate(options);
        await formMainDictionaryOptionsPopulate(options);
    } catch (e) {
        dictionaryErrorsShow([e]);
    }

    try {
        await ankiDeckAndModelPopulate(options);
    } catch (e) {
        ankiErrorShow(e);
    }

    formUpdateVisibility(options);

    storageInfoInitialize();
}

$(document).ready(utilAsync(onReady));


/*
 * Dictionary
 */

function dictionaryErrorToString(error) {
    if (error.toString) {
        error = error.toString();
    } else {
        error = `${error}`;
    }

    for (const [match, subst] of dictionaryErrorToString.overrides) {
        if (error.includes(match)) {
            error = subst;
            break;
        }
    }

    return error;
}
dictionaryErrorToString.overrides = [
    [
        'A mutation operation was attempted on a database that did not allow mutations.',
        'Access to IndexedDB appears to be restricted. Firefox seems to require that the history preference is set to "Remember history" before IndexedDB use of any kind is allowed.'
    ],
    [
        'The operation failed for reasons unrelated to the database itself and not covered by any other error code.',
        'Unable to access IndexedDB due to a possibly corrupt user profile. Try using the "Refresh Firefox" feature to reset your user profile.'
    ],
    [
        'BulkError',
        'Unable to finish importing dictionary data into IndexedDB. This may indicate that you do not have sufficient disk space available to complete this operation.'
    ]
];

function dictionaryErrorsShow(errors) {
    const dialog = $('#dict-error');
    dialog.show().text('');

    if (errors !== null && errors.length > 0) {
        const uniqueErrors = {};
        for (let e of errors) {
            e = dictionaryErrorToString(e);
            uniqueErrors[e] = uniqueErrors.hasOwnProperty(e) ? uniqueErrors[e] + 1 : 1;
        }

        for (const e in uniqueErrors) {
            const count = uniqueErrors[e];
            const div = document.createElement('p');
            if (count > 1) {
                div.textContent = `${e} `;
                const em = document.createElement('em');
                em.textContent = `(${count})`;
                div.appendChild(em);
            } else {
                div.textContent = `${e}`;
            }
            dialog.append($(div));
        }

        dialog.show();
    } else {
        dialog.hide();
    }
}

function dictionarySpinnerShow(show) {
    const spinner = $('#dict-spinner');
    if (show) {
        spinner.show();
    } else {
        spinner.hide();
    }
}

function dictionaryGroupsSort() {
    const dictGroups = $('#dict-groups');
    const dictGroupChildren = dictGroups.children('.dict-group').sort((ca, cb) => {
        const pa = parseInt($(ca).find('.dict-priority').val(), 10);
        const pb = parseInt($(cb).find('.dict-priority').val(), 10);
        if (pa < pb) {
            return 1;
        } else if (pa > pb) {
            return -1;
        } else {
            return 0;
        }
    });

    dictGroups.append(dictGroupChildren);
}

async function dictionaryGroupsPopulate(options) {
    const dictGroups = $('#dict-groups').empty();
    const dictWarning = $('#dict-warning').hide();

    const dictRows = await utilDatabaseSummarize();
    if (dictRows.length === 0) {
        dictWarning.show();
    }

    for (const dictRow of dictRowsSort(dictRows, options)) {
        const dictOptions = options.dictionaries[dictRow.title] || {
            enabled: false,
            priority: 0,
            allowSecondarySearches: false
        };

        const dictHtml = await apiTemplateRender('dictionary.html', {
            enabled: dictOptions.enabled,
            priority: dictOptions.priority,
            allowSecondarySearches: dictOptions.allowSecondarySearches,
            title: dictRow.title,
            version: dictRow.version,
            revision: dictRow.revision,
            outdated: dictRow.version < 3
        });

        dictGroups.append($(dictHtml));
    }

    formUpdateVisibility(options);

    $('.dict-enabled, .dict-priority, .dict-allow-secondary-searches').change(e => {
        dictionaryGroupsSort();
        onFormOptionsChanged(e);
    });
}

async function onDictionaryPurge(e) {
    e.preventDefault();

    const dictControls = $('#dict-importer, #dict-groups, #dict-main-group').hide();
    const dictProgress = $('#dict-purge').show();

    try {
        dictionaryErrorsShow(null);
        dictionarySpinnerShow(true);

        await utilDatabasePurge();
        const options = await optionsLoad();
        options.dictionaries = {};
        options.general.mainDictionary = '';
        await optionsSave(options);

        await dictionaryGroupsPopulate(options);
        await formMainDictionaryOptionsPopulate(options);
    } catch (e) {
        dictionaryErrorsShow([e]);
    } finally {
        dictionarySpinnerShow(false);

        dictControls.show();
        dictProgress.hide();

        if (storageEstimate.mostRecent !== null) {
            storageUpdateStats();
        }
    }
}

async function onDictionaryImport(e) {
    const dictFile = $('#dict-file');
    const dictControls = $('#dict-importer').hide();
    const dictProgress = $('#dict-import-progress').show();

    try {
        dictionaryErrorsShow(null);
        dictionarySpinnerShow(true);

        const setProgress = percent => dictProgress.find('.progress-bar').css('width', `${percent}%`);
        const updateProgress = (total, current) => {
            setProgress(current / total * 100.0);
            if (storageEstimate.mostRecent !== null && !storageUpdateStats.isUpdating) {
                storageUpdateStats();
            }
        };
        setProgress(0.0);

        const exceptions = [];
        const options = await optionsLoad();
        const summary = await utilDatabaseImport(e.target.files[0], updateProgress, exceptions);
        options.dictionaries[summary.title] = {enabled: true, priority: 0, allowSecondarySearches: false};
        if (summary.sequenced && options.general.mainDictionary === '') {
            options.general.mainDictionary = summary.title;
        }

        if (exceptions.length > 0) {
            exceptions.push(`Dictionary may not have been imported properly: ${exceptions.length} error${exceptions.length === 1 ? '' : 's'} reported.`);
            dictionaryErrorsShow(exceptions);
        }

        await optionsSave(options);

        await dictionaryGroupsPopulate(options);
        await formMainDictionaryOptionsPopulate(options);
    } catch (e) {
        dictionaryErrorsShow([e]);
    } finally {
        dictionarySpinnerShow(false);

        dictFile.val('');
        dictControls.show();
        dictProgress.hide();
    }
}


/*
 * Anki
 */

function ankiSpinnerShow(show) {
    const spinner = $('#anki-spinner');
    if (show) {
        spinner.show();
    } else {
        spinner.hide();
    }
}

function ankiErrorShow(error) {
    const dialog = $('#anki-error');
    if (error) {
        dialog.show().text(error);
    }
    else {
        dialog.hide();
    }
}

function ankiErrorShown() {
    return $('#anki-error').is(':visible');
}

function ankiFieldsToDict(selection) {
    const result = {};
    selection.each((index, element) => {
        result[$(element).data('field')] = $(element).val();
    });

    return result;
}

async function ankiDeckAndModelPopulate(options) {
    const ankiFormat = $('#anki-format').hide();

    const deckNames = await utilAnkiGetDeckNames();
    const ankiDeck = $('.anki-deck');
    ankiDeck.find('option').remove();
    deckNames.sort().forEach(name => ankiDeck.append($('<option/>', {value: name, text: name})));

    const modelNames = await utilAnkiGetModelNames();
    const ankiModel = $('.anki-model');
    ankiModel.find('option').remove();
    modelNames.sort().forEach(name => ankiModel.append($('<option/>', {value: name, text: name})));

    $('#anki-terms-deck').val(options.anki.terms.deck);
    await ankiFieldsPopulate($('#anki-terms-model').val(options.anki.terms.model), options);

    $('#anki-kanji-deck').val(options.anki.kanji.deck);
    await ankiFieldsPopulate($('#anki-kanji-model').val(options.anki.kanji.model), options);

    ankiFormat.show();
}

async function ankiFieldsPopulate(element, options) {
    const modelName = element.val();
    if (!modelName) {
        return;
    }

    const tab = element.closest('.tab-pane');
    const tabId = tab.attr('id');
    const container = tab.find('tbody').empty();

    const markers = {
        'terms': [
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
            'sentence',
            'tags',
            'url',
            'screenshot'
        ],
        'kanji': [
            'character',
            'dictionary',
            'glossary',
            'kunyomi',
            'onyomi',
            'sentence',
            'tags',
            'url'
        ]
    }[tabId] || {};

    for (const name of await utilAnkiGetModelFieldNames(modelName)) {
        const value = options.anki[tabId].fields[name] || '';
        const html = Handlebars.templates['model.html']({name, markers, value});
        container.append($(html));
    }

    tab.find('.anki-field-value').change(utilAsync(onFormOptionsChanged));
    tab.find('.marker-link').click(onAnkiMarkerClicked);
}

function onAnkiMarkerClicked(e) {
    e.preventDefault();
    const link = e.target;
    $(link).closest('.input-group').find('.anki-field-value').val(`{${link.text}}`).trigger('change');
}

async function onAnkiModelChanged(e) {
    try {
        if (!e.originalEvent) {
            return;
        }

        const element = $(this);
        const tab = element.closest('.tab-pane');
        const tabId = tab.attr('id');

        const {optionsNew, optionsOld} = await formRead();
        optionsNew.anki[tabId].fields = {};
        await optionsSave(optionsNew);

        ankiSpinnerShow(true);
        await ankiFieldsPopulate(element, optionsNew);
        ankiErrorShow();
    } catch (e) {
        ankiErrorShow(e);
    } finally {
        ankiSpinnerShow(false);
    }
}

async function onAnkiFieldTemplatesReset(e) {
    try {
        e.preventDefault();
        const options = await optionsLoad();
        $('#field-templates').val(options.anki.fieldTemplates = optionsFieldTemplates());
        await optionsSave(options);
    } catch (e) {
        ankiErrorShow(e);
    }
}


/*
 * Storage
 */

async function getBrowser() {
    if (typeof chrome !== "undefined") {
        if (typeof browser !== "undefined") {
            try {
                const info = await browser.runtime.getBrowserInfo();
                if (info.name === "Fennec") {
                    return "firefox-mobile";
                }
            } catch (e) { }
            return "firefox";
        } else {
            return "chrome";
        }
    } else {
        return "edge";
    }
}

function storageBytesToLabeledString(size) {
    const base = 1000;
    const labels = ["bytes", "KB", "MB", "GB"];
    let labelIndex = 0;
    while (size >= base) {
        size /= base;
        ++labelIndex;
    }
    const label = size.toFixed(1);
    return `${label}${labels[labelIndex]}`;
}

async function storageEstimate() {
    try {
        return (storageEstimate.mostRecent = await navigator.storage.estimate());
    } catch (e) { }
    return null;
}
storageEstimate.mostRecent = null;

async function storageInfoInitialize() {
    const browser = await getBrowser();
    const container = document.querySelector("#storage-info");
    container.setAttribute("data-browser", browser);

    await storageShowInfo();

    container.classList.remove("storage-hidden");

    document.querySelector("#storage-refresh").addEventListener('click', () => storageShowInfo(), false);
}

async function storageUpdateStats() {
    storageUpdateStats.isUpdating = true;

    const estimate = await storageEstimate();
    const valid = (estimate !== null);

    if (valid) {
        document.querySelector("#storage-usage").textContent = storageBytesToLabeledString(estimate.usage);
        document.querySelector("#storage-quota").textContent = storageBytesToLabeledString(estimate.quota);
    }

    storageUpdateStats.isUpdating = false;
    return valid;
}
storageUpdateStats.isUpdating = false;

async function storageShowInfo() {
    storageSpinnerShow(true);

    const valid = await storageUpdateStats();
    document.querySelector("#storage-use").classList.toggle("storage-hidden", !valid);
    document.querySelector("#storage-error").classList.toggle("storage-hidden", valid);

    storageSpinnerShow(false);
}

function storageSpinnerShow(show) {
    const spinner = $('#storage-spinner');
    if (show) {
        spinner.show();
    } else {
        spinner.hide();
    }
}
