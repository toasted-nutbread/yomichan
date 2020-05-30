/*
 * Copyright (C) 2019-2020  Yomichan Authors
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
 * AnkiNoteBuilder
 * api
 */

class AnkiTemplatesController {
    constructor(settingsController, ankiController) {
        this._settingsController = settingsController;
        this._ankiController = ankiController;
        this._cachedDefinitionValue = null;
        this._cachedDefinitionText = null;
        this._defaultFieldTemplates = null;
    }

    async prepare() {
        this._defaultFieldTemplates = await api.getDefaultAnkiFieldTemplates();

        const markers = new Set([
            ...this._ankiController.getFieldMarkers('terms'),
            ...this._ankiController.getFieldMarkers('kanji')
        ]);
        const fragment = this._ankiController.getFieldMarkersHtml(markers);

        const list = document.querySelector('#field-templates-list');
        list.appendChild(fragment);
        for (const node of list.querySelectorAll('.marker-link')) {
            node.addEventListener('click', this._onMarkerClicked.bind(this), false);
        }

        $('#field-templates').on('change', this._onChanged.bind(this));
        $('#field-template-render').on('click', this._onRender.bind(this));
        $('#field-templates-reset').on('click', this._onReset.bind(this));
        $('#field-templates-reset-confirm').on('click', this._onResetConfirm.bind(this));

        this._settingsController.on('optionsChanged', this._onOptionsChanged.bind(this));

        const options = await this._settingsController.getOptions();
        this._onOptionsChanged({options});
    }

    // Private

    _onOptionsChanged({options}) {
        let templates = options.anki.fieldTemplates;
        if (typeof templates !== 'string') { templates = this._defaultFieldTemplates; }
        $('#field-templates').val(templates);

        this._onValidateCompile();
    }

    _onReset(e) {
        e.preventDefault();
        $('#field-template-reset-modal').modal('show');
    }

    async _onResetConfirm(e) {
        e.preventDefault();

        $('#field-template-reset-modal').modal('hide');

        const value = await api.getDefaultAnkiFieldTemplates();

        const element = document.querySelector('#field-templates');
        element.value = value;
        element.dispatchEvent(new Event('change'));
    }

    async _onChanged(e) {
        // Get value
        let templates = e.currentTarget.value;
        if (templates === await api.getDefaultAnkiFieldTemplates()) {
            // Default
            templates = null;
        }

        // Overwrite
        const options = await this._settingsController.getOptionsMutable();
        options.anki.fieldTemplates = templates;
        await this._settingsController.save();

        // Compile
        this._onValidateCompile();
    }

    _onValidateCompile() {
        const infoNode = document.querySelector('#field-template-compile-result');
        this._validate(infoNode, '{expression}', 'term-kanji', false, true);
    }

    _onMarkerClicked(e) {
        e.preventDefault();
        document.querySelector('#field-template-render-text').value = `{${e.target.textContent}}`;
    }

    _onRender(e) {
        e.preventDefault();

        const field = document.querySelector('#field-template-render-text').value;
        const infoNode = document.querySelector('#field-template-render-result');
        infoNode.hidden = true;
        this._validate(infoNode, field, 'term-kanji', true, false);
    }

    async _getDefinition(text, optionsContext) {
        if (this._cachedDefinitionText !== text) {
            const {definitions} = await api.termsFind(text, {}, optionsContext);
            if (definitions.length === 0) { return null; }

            this._cachedDefinitionValue = definitions[0];
            this._cachedDefinitionText = text;
        }
        return this._cachedDefinitionValue;
    }

    async _validate(infoNode, field, mode, showSuccessResult, invalidateInput) {
        const text = document.querySelector('#field-templates-preview-text').value || '';
        const exceptions = [];
        let result = `No definition found for ${text}`;
        try {
            const optionsContext = this._settingsController.getOptionsContext();
            const definition = await this._getDefinition(text, optionsContext);
            if (definition !== null) {
                const options = await api.optionsGet(optionsContext);
                const context = {
                    document: {
                        title: document.title
                    }
                };
                let templates = options.anki.fieldTemplates;
                if (typeof templates !== 'string') { templates = await api.getDefaultAnkiFieldTemplates(); }
                const ankiNoteBuilder = new AnkiNoteBuilder({renderTemplate: api.templateRender.bind(api)});
                result = await ankiNoteBuilder.formatField(field, definition, mode, context, options, templates, exceptions);
            }
        } catch (e) {
            exceptions.push(e);
        }

        const hasException = exceptions.length > 0;
        infoNode.hidden = !(showSuccessResult || hasException);
        infoNode.textContent = hasException ? exceptions.map((e) => `${e}`).join('\n') : (showSuccessResult ? result : '');
        infoNode.classList.toggle('text-danger', hasException);
        if (invalidateInput) {
            const input = document.querySelector('#field-templates');
            input.classList.toggle('is-invalid', hasException);
        }
    }
}
