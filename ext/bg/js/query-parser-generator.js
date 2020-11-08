/*
 * Copyright (C) 2020  Yomichan Authors
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
 * HtmlTemplateCollection
 * api
 */

class QueryParserGenerator {
    constructor() {
        this._templates = null;
    }

    async prepare() {
        const html = await api.getQueryParserTemplatesHtml();
        this._templates = new HtmlTemplateCollection(html);
    }

    createParseResult(terms, preview=false) {
        const fragment = document.createDocumentFragment();
        for (const term of terms) {
            const termContainer = this._templates.instantiate(preview ? 'term-preview' : 'term');
            for (const segment of term) {
                if (!segment.text.trim()) { continue; }
                if (!segment.reading.trim()) {
                    termContainer.appendChild(this.createSegmentText(segment.text));
                } else {
                    termContainer.appendChild(this.createSegment(segment));
                }
            }
            fragment.appendChild(termContainer);
        }
        return fragment;
    }

    createSegment(segment) {
        const segmentContainer = this._templates.instantiate('segment');
        const segmentTextContainer = segmentContainer.querySelector('.query-parser-segment-text');
        const segmentReadingContainer = segmentContainer.querySelector('.query-parser-segment-reading');
        segmentTextContainer.appendChild(this.createSegmentText(segment.text));
        segmentReadingContainer.textContent = segment.reading;
        return segmentContainer;
    }

    createSegmentText(text) {
        const fragment = document.createDocumentFragment();
        for (const chr of text) {
            const charContainer = this._templates.instantiate('char');
            charContainer.textContent = chr;
            fragment.appendChild(charContainer);
        }
        return fragment;
    }

    createParserSelect(parseResults, selectedParser) {
        const select = document.createElement('select');
        select.className = 'query-parser-select form-control';
        for (const parseResult of parseResults) {
            const option = document.createElement('option');
            option.className = 'query-parser-select-option';
            option.value = parseResult.id;
            switch (parseResult.source) {
                case 'scanning-parser':
                    option.textContent = 'Scanning parser';
                    break;
                case 'mecab':
                    option.textContent = `MeCab: ${parseResult.dictionary}`;
                    break;
                default:
                    option.textContent = 'Unrecognized dictionary';
                    break;
            }
            option.defaultSelected = selectedParser === parseResult.id;
            select.appendChild(option);
        }
        return select;
    }
}
