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


let dictionaryUI = null;


class SettingsDictionaryListUI {
    constructor(container, template, extraContainer, extraTemplate) {
        this.container = container;
        this.template = template;
        this.extraContainer = extraContainer;
        this.extraTemplate = extraTemplate;
        this.optionsDictionaries = null;
        this.dictionaries = null;
        this.dictionaryEntries = [];
        this.extra = null;

        document.querySelector('#dict-delete-confirm').addEventListener('click', (e) => this.onDictionaryConfirmDelete(e), false);
    }

    setOptionsDictionaries(optionsDictionaries) {
        this.optionsDictionaries = optionsDictionaries;
        if (this.dictionaries !== null) {
            this.setDictionaries(this.dictionaries);
        }
    }

    setDictionaries(dictionaries) {
        for (const dictionaryEntry of this.dictionaryEntries) {
            dictionaryEntry.cleanup();
        }

        this.dictionaryEntries = [];
        this.dictionaries = toIterable(dictionaries);

        if (this.optionsDictionaries === null) {
            return;
        }

        let changed = false;
        for (const dictionaryInfo of this.dictionaries) {
            if (this.createEntry(dictionaryInfo)) {
                changed = true;
            }
        }

        this.updateDictionaryOrder();

        const titles = this.dictionaryEntries.map((e) => e.dictionaryInfo.title);
        const removeKeys = Object.keys(this.optionsDictionaries).filter((key) => titles.indexOf(key) < 0);
        if (removeKeys.length > 0) {
            for (const key of toIterable(removeKeys)) {
                delete this.optionsDictionaries[key]; // TODO
            }
            changed = true;
        }

        if (changed) {
            this.save();
        }
    }

    createEntry(dictionaryInfo) {
        const title = dictionaryInfo.title;
        let changed = false;
        let optionsDictionary;
        const optionsDictionaries = this.optionsDictionaries;
        if (hasOwn(optionsDictionaries, title)) {
            optionsDictionary = optionsDictionaries[title];
        } else {
            optionsDictionary = SettingsDictionaryListUI.createDictionaryOptions();
            optionsDictionaries[title] = optionsDictionary; // TODO
            changed = true;
        }

        const content = document.importNode(this.template.content, true).firstChild;

        this.dictionaryEntries.push(new SettingsDictionaryEntryUI(this, dictionaryInfo, content, optionsDictionary));

        return changed;
    }

    static createDictionaryOptions() {
        return utilBackgroundIsolate({
            priority: 0,
            enabled: false,
            allowSecondarySearches: false
        });
    }

    createExtra(totalCounts, remainders, totalRemainder) {
        const content = document.importNode(this.extraTemplate.content, true).firstChild;
        this.extraContainer.appendChild(content);
        return new SettingsDictionaryExtraUI(this, totalCounts, remainders, totalRemainder, content);
    }

    setCounts(dictionaryCounts, totalCounts) {
        const remainders = Object.assign({}, totalCounts);
        const keys = Object.keys(remainders);

        for (let i = 0, ii = Math.min(this.dictionaryEntries.length, dictionaryCounts.length); i < ii; ++i) {
            const counts = dictionaryCounts[i];
            this.dictionaryEntries[i].setCounts(counts);

            for (const key of keys) {
                remainders[key] -= counts[key];
            }
        }

        let totalRemainder = 0;
        for (const key of keys) {
            totalRemainder += remainders[key];
        }

        if (this.extra !== null) {
            this.extra.cleanup();
            this.extra = null;
        }

        if (totalRemainder > 0) {
            this.extra = this.createExtra(totalCounts, remainders, totalRemainder);
        }
    }

    updateDictionaryOrder() {
        const sortInfo = this.dictionaryEntries.map((e, i) => [e, i]);
        sortInfo.sort((a, b) => {
            return a[1] - b[1];
            // TODO
            //const i = b[0].optionsDictionary.priority - a[0].optionsDictionary.priority;
            //return (i !== 0 ? i : a[1] - b[1]);
        });

        for (const [e] of sortInfo) {
            this.container.appendChild(e.content);
        }
    }

    save() {
        // Overwrite
    }

    onDictionaryConfirmDelete(e) {
        e.preventDefault();
        const n = document.querySelector('#dict-delete-modal');
        const title = n.dataset.dict;
        delete n.dataset.dict;
        $(n).modal('hide');

        const index = this.dictionaryEntries.findIndex((e) => e.dictionaryInfo.title === title);
        if (index >= 0) {
            this.dictionaryEntries[index].deleteDictionary();
        }
    }
}

class SettingsDictionaryEntryUI {
    constructor(parent, dictionaryInfo, content) {
        this.parent = parent;
        this.dictionaryInfo = dictionaryInfo;
        this.counts = null;
        this.eventListeners = [];
        this.isDeleting = false;

        this.content = content;
        this.enabledCheckbox = this.content.querySelector('.dict-enabled');
        this.allowSecondarySearchesCheckbox = this.content.querySelector('.dict-allow-secondary-searches');
        this.priorityInput = this.content.querySelector('.dict-priority');
        this.deleteButton = this.content.querySelector('.dict-delete-button');

        this.enabledCheckbox.dataset.optionTarget = getPropertyPathString(['dictionaries', dictionaryInfo.title, 'enabled']);
        this.allowSecondarySearchesCheckbox.dataset.optionTarget = getPropertyPathString(['dictionaries', dictionaryInfo.title, 'allowSecondarySearches']);
        this.priorityInput.dataset.optionTarget = getPropertyPathString(['dictionaries', dictionaryInfo.title, 'priority']);

        if (this.dictionaryInfo.version < 3) {
            this.content.querySelector('.dict-outdated').hidden = false;
        }

        this.content.querySelector('.dict-title').textContent = this.dictionaryInfo.title;
        this.content.querySelector('.dict-revision').textContent = `rev.${this.dictionaryInfo.revision}`;

        this.addEventListener(this.priorityInput, 'change', (e) => this.onPriorityChanged(e), false);
        this.addEventListener(this.deleteButton, 'click', (e) => this.onDeleteButtonClicked(e), false);
    }

    cleanup() {
        if (this.content !== null) {
            if (this.content.parentNode !== null) {
                this.content.parentNode.removeChild(this.content);
            }
            this.content = null;
        }
        this.dictionaryInfo = null;
        this.clearEventListeners();
    }

    setCounts(counts) {
        this.counts = counts;
        const node = this.content.querySelector('.dict-counts');
        node.textContent = JSON.stringify({
            info: this.dictionaryInfo,
            counts
        }, null, 4);
        node.removeAttribute('hidden');
    }

    save() {
        this.parent.save();
    }

    addEventListener(node, type, listener, options) {
        node.addEventListener(type, listener, options);
        this.eventListeners.push([node, type, listener, options]);
    }

    clearEventListeners() {
        for (const [node, type, listener, options] of this.eventListeners) {
            node.removeEventListener(type, listener, options);
        }
        this.eventListeners = [];
    }

    async deleteDictionary() {
        if (this.isDeleting) {
            return;
        }

        const progress = this.content.querySelector('.progress');
        progress.hidden = false;
        const progressBar = this.content.querySelector('.progress-bar');
        this.isDeleting = true;

        const prevention = new PageExitPrevention();
        try {
            prevention.start();

            const onProgress = ({processed, count, storeCount, storesProcesed}) => {
                let percent = 0.0;
                if (count > 0 && storesProcesed > 0) {
                    percent = (processed / count) * (storesProcesed / storeCount) * 100.0;
                }
                progressBar.style.width = `${percent}%`;
            };

            await utilDatabaseDeleteDictionary(this.dictionaryInfo.title, onProgress, {rate: 1000});
        } catch (e) {
            dictionaryErrorsShow([e]);
        } finally {
            prevention.end();
            this.isDeleting = false;
            progress.hidden = true;

            const optionsContext = getOptionsContext();
            const options = await apiOptionsGet(optionsContext);
            onDatabaseUpdated(options);
        }
    }

    onPriorityChanged() {
        // TODO
        this.parent.updateDictionaryOrder();
    }

    onDeleteButtonClicked(e) {
        e.preventDefault();

        if (this.isDeleting) {
            return;
        }

        const title = this.dictionaryInfo.title;
        const n = document.querySelector('#dict-delete-modal');
        n.dataset.dict = title;
        document.querySelector('#dict-remove-modal-dict-name').textContent = title;
        $(n).modal('show');
    }
}

class SettingsDictionaryExtraUI {
    constructor(parent, totalCounts, remainders, totalRemainder, content) {
        this.parent = parent;
        this.content = content;

        this.content.querySelector('.dict-total-count').textContent = `${totalRemainder} item${totalRemainder !== 1 ? 's' : ''}`;

        const node = this.content.querySelector('.dict-counts');
        node.textContent = JSON.stringify({
            counts: totalCounts,
            remainders: remainders
        }, null, 4);
        node.removeAttribute('hidden');
    }

    cleanup() {
        if (this.content !== null) {
            if (this.content.parentNode !== null) {
                this.content.parentNode.removeChild(this.content);
            }
            this.content = null;
        }
    }
}


async function dictSettingsInitialize() {
    dictionaryUI = new SettingsDictionaryListUI(
        document.querySelector('#dict-groups'),
        document.querySelector('#dict-template'),
        document.querySelector('#dict-groups-extra'),
        document.querySelector('#dict-extra-template')
    );
    dictionaryUI.save = () => settingsSaveOptions();

    document.querySelector('#dict-purge-button').addEventListener('click', (e) => onDictionaryPurgeButtonClick(e), false);
    document.querySelector('#dict-purge-confirm').addEventListener('click', (e) => onDictionaryPurge(e), false);
    document.querySelector('#dict-file-button').addEventListener('click', (e) => onDictionaryImportButtonClick(e), false);
    document.querySelector('#dict-file').addEventListener('change', (e) => onDictionaryImport(e), false);
    document.querySelector('#dict-main').addEventListener('change', (e) => onDictionaryMainChanged(e), false);

    const optionsContext = getOptionsContext();
    const options = await apiOptionsGet(optionsContext);
    onDictionaryOptionsChanged(options);
    onDatabaseUpdated(options);
}

async function onDictionaryOptionsChanged(options) {
    if (dictionaryUI === null) { return; }
    dictionaryUI.setOptionsDictionaries(options.dictionaries);
}

async function onDatabaseUpdated(options) {
    try {
        const dictionaries = await utilDatabaseGetDictionaryInfo();
        dictionaryUI.setDictionaries(dictionaries);

        document.querySelector('#dict-warning').hidden = (dictionaries.length > 0);

        updateMainDictionarySelect(options, dictionaries);

        const {counts, total} = await utilDatabaseGetDictionaryCounts(dictionaries.map((v) => v.title), true);
        dictionaryUI.setCounts(counts, total);
    } catch (e) {
        dictionaryErrorsShow([e]);
    }
}

async function updateMainDictionarySelect(options, dictionaries) {
    const select = document.querySelector('#dict-main');
    select.textContent = ''; // Empty

    let option = document.createElement('option');
    option.className = 'text-muted';
    option.value = '';
    option.textContent = 'Not selected';
    select.appendChild(option);

    let value = '';
    const currentValue = options.general.mainDictionary;
    for (const {title, sequenced} of toIterable(dictionaries)) {
        if (!sequenced) { continue; }

        option = document.createElement('option');
        option.value = title;
        option.textContent = title;
        select.appendChild(option);

        if (title === currentValue) {
            value = title;
        }
    }

    select.value = value;

    if (options.general.mainDictionary !== value) {
        options.general.mainDictionary = value;
        settingsSaveOptions();
    }
}

async function onDictionaryMainChanged(e) {
    const value = e.target.value;
    const optionsContext = getOptionsContext();
    const options = await apiOptionsGet(optionsContext);
    options.general.mainDictionary = value;
    settingsSaveOptions();
}


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
    const dialog = document.querySelector('#dict-error');
    dialog.textContent = '';

    if (errors !== null && errors.length > 0) {
        const uniqueErrors = {};
        for (let e of errors) {
            console.error(e);
            e = dictionaryErrorToString(e);
            uniqueErrors[e] = hasOwn(uniqueErrors, e) ? uniqueErrors[e] + 1 : 1;
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
            dialog.appendChild(div);
        }

        dialog.hidden = false;
    } else {
        dialog.hidden = true;
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

function onDictionaryImportButtonClick() {
    const dictFile = document.querySelector('#dict-file');
    dictFile.click();
}

function onDictionaryPurgeButtonClick(e) {
    e.preventDefault();
    $('#dict-purge-modal').modal('show');
}

async function onDictionaryPurge(e) {
    e.preventDefault();

    $('#dict-purge-modal').modal('hide');

    const dictControls = $('#dict-importer, #dict-groups, #dict-groups-extra, #dict-main-group').hide();
    const dictProgress = document.querySelector('#dict-purge');
    dictProgress.hidden = false;

    const prevention = new PageExitPrevention();

    try {
        prevention.start();
        dictionaryErrorsShow(null);
        dictionarySpinnerShow(true);

        await utilDatabasePurge();
        for (const options of toIterable(await getOptionsArray())) {
            options.dictionaries = utilBackgroundIsolate({});
            options.general.mainDictionary = '';
        }
        await settingsSaveOptions();

        const optionsContext = getOptionsContext();
        const options = await apiOptionsGet(optionsContext);
        onDatabaseUpdated(options);
    } catch (err) {
        dictionaryErrorsShow([err]);
    } finally {
        prevention.end();

        dictionarySpinnerShow(false);

        dictControls.show();
        dictProgress.hidden = true;

        if (storageEstimate.mostRecent !== null) {
            storageUpdateStats();
        }
    }
}

async function onDictionaryImport(e) {
    const dictFile = $('#dict-file');
    const dictControls = $('#dict-importer').hide();
    const dictProgress = $('#dict-import-progress').show();
    const dictImportInfo = document.querySelector('#dict-import-info');

    const prevention = new PageExitPrevention();

    try {
        prevention.start();
        dictionaryErrorsShow(null);
        dictionarySpinnerShow(true);

        const setProgress = (percent) => dictProgress.find('.progress-bar').css('width', `${percent}%`);
        const updateProgress = (total, current) => {
            setProgress(current / total * 100.0);
            if (storageEstimate.mostRecent !== null && !storageUpdateStats.isUpdating) {
                storageUpdateStats();
            }
        };

        const exceptions = [];
        const files = [...e.target.files];

        for (let i = 0, ii = files.length; i < ii; ++i) {
            setProgress(0.0);
            if (ii > 1) {
                dictImportInfo.hidden = false;
                dictImportInfo.textContent = `(${i + 1} of ${ii})`;
            }

            const summary = await utilDatabaseImport(files[i], updateProgress, exceptions);
            for (const options of toIterable(await getOptionsArray())) {
                const dictionaryOptions = SettingsDictionaryListUI.createDictionaryOptions();
                dictionaryOptions.enabled = true;
                options.dictionaries[summary.title] = dictionaryOptions;
                if (summary.sequenced && options.general.mainDictionary === '') {
                    options.general.mainDictionary = summary.title;
                }
            }

            await settingsSaveOptions();

            if (exceptions.length > 0) {
                exceptions.push(`Dictionary may not have been imported properly: ${exceptions.length} error${exceptions.length === 1 ? '' : 's'} reported.`);
                dictionaryErrorsShow(exceptions);
            }

            const optionsContext = getOptionsContext();
            const options = await apiOptionsGet(optionsContext);
            onDatabaseUpdated(options);
        }
    } catch (err) {
        dictionaryErrorsShow([err]);
    } finally {
        prevention.end();
        dictionarySpinnerShow(false);

        dictImportInfo.hidden = false;
        dictImportInfo.textContent = '';
        dictFile.val('');
        dictControls.show();
        dictProgress.hide();
    }
}
