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
 * DOM
 * DOMTextScanner
 * TextSourceElement
 * TextSourceRange
 */

class DocumentUtil {
    constructor() {
        this.REGEX_TRANSPARENT_COLOR = /rgba\s*\([^)]*,\s*0(?:\.0+)?\s*\)/;
    }

    docSetImposterStyle(style, propertyName, value) {
        style.setProperty(propertyName, value, 'important');
    }

    docImposterCreate(element, isTextarea) {
        const body = document.body;
        if (body === null) { return [null, null]; }

        const elementStyle = window.getComputedStyle(element);
        const elementRect = element.getBoundingClientRect();
        const documentRect = document.documentElement.getBoundingClientRect();
        let left = elementRect.left - documentRect.left;
        let top = elementRect.top - documentRect.top;

        // Container
        const container = document.createElement('div');
        const containerStyle = container.style;
        this.docSetImposterStyle(containerStyle, 'all', 'initial');
        this.docSetImposterStyle(containerStyle, 'position', 'absolute');
        this.docSetImposterStyle(containerStyle, 'left', '0');
        this.docSetImposterStyle(containerStyle, 'top', '0');
        this.docSetImposterStyle(containerStyle, 'width', `${documentRect.width}px`);
        this.docSetImposterStyle(containerStyle, 'height', `${documentRect.height}px`);
        this.docSetImposterStyle(containerStyle, 'overflow', 'hidden');
        this.docSetImposterStyle(containerStyle, 'opacity', '0');

        this.docSetImposterStyle(containerStyle, 'pointer-events', 'none');
        this.docSetImposterStyle(containerStyle, 'z-index', '2147483646');

        // Imposter
        const imposter = document.createElement('div');
        const imposterStyle = imposter.style;

        let value = element.value;
        if (value.endsWith('\n')) { value += '\n'; }
        imposter.textContent = value;

        for (let i = 0, ii = elementStyle.length; i < ii; ++i) {
            const property = elementStyle[i];
            this.docSetImposterStyle(imposterStyle, property, elementStyle.getPropertyValue(property));
        }
        this.docSetImposterStyle(imposterStyle, 'position', 'absolute');
        this.docSetImposterStyle(imposterStyle, 'top', `${top}px`);
        this.docSetImposterStyle(imposterStyle, 'left', `${left}px`);
        this.docSetImposterStyle(imposterStyle, 'margin', '0');
        this.docSetImposterStyle(imposterStyle, 'pointer-events', 'auto');

        if (isTextarea) {
            if (elementStyle.overflow === 'visible') {
                this.docSetImposterStyle(imposterStyle, 'overflow', 'auto');
            }
        } else {
            this.docSetImposterStyle(imposterStyle, 'overflow', 'hidden');
            this.docSetImposterStyle(imposterStyle, 'white-space', 'nowrap');
            this.docSetImposterStyle(imposterStyle, 'line-height', elementStyle.height);
        }

        container.appendChild(imposter);
        body.appendChild(container);

        // Adjust size
        const imposterRect = imposter.getBoundingClientRect();
        if (imposterRect.width !== elementRect.width || imposterRect.height !== elementRect.height) {
            const width = parseFloat(elementStyle.width) + (elementRect.width - imposterRect.width);
            const height = parseFloat(elementStyle.height) + (elementRect.height - imposterRect.height);
            this.docSetImposterStyle(imposterStyle, 'width', `${width}px`);
            this.docSetImposterStyle(imposterStyle, 'height', `${height}px`);
        }
        if (imposterRect.x !== elementRect.x || imposterRect.y !== elementRect.y) {
            left += (elementRect.left - imposterRect.left);
            top += (elementRect.top - imposterRect.top);
            this.docSetImposterStyle(imposterStyle, 'left', `${left}px`);
            this.docSetImposterStyle(imposterStyle, 'top', `${top}px`);
        }

        imposter.scrollTop = element.scrollTop;
        imposter.scrollLeft = element.scrollLeft;

        return [imposter, container];
    }

    docElementsFromPoint(x, y, all) {
        if (all) {
            // document.elementsFromPoint can return duplicates which must be removed.
            const elements = document.elementsFromPoint(x, y);
            return elements.filter((e, i) => elements.indexOf(e) === i);
        }

        const e = document.elementFromPoint(x, y);
        return e !== null ? [e] : [];
    }

    docRangeFromPoint(x, y, deepDomScan) {
        const elements = this.docElementsFromPoint(x, y, deepDomScan);
        let imposter = null;
        let imposterContainer = null;
        let imposterSourceElement = null;
        if (elements.length > 0) {
            const element = elements[0];
            switch (element.nodeName.toUpperCase()) {
                case 'IMG':
                case 'BUTTON':
                    return new TextSourceElement(element);
                case 'INPUT':
                    imposterSourceElement = element;
                    [imposter, imposterContainer] = this.docImposterCreate(element, false);
                    break;
                case 'TEXTAREA':
                    imposterSourceElement = element;
                    [imposter, imposterContainer] = this.docImposterCreate(element, true);
                    break;
            }
        }

        const range = this.caretRangeFromPointExt(x, y, deepDomScan ? elements : []);
        if (range !== null) {
            if (imposter !== null) {
                this.docSetImposterStyle(imposterContainer.style, 'z-index', '-2147483646');
                this.docSetImposterStyle(imposter.style, 'pointer-events', 'none');
            }
            return new TextSourceRange(range, '', imposterContainer, imposterSourceElement);
        } else {
            if (imposterContainer !== null) {
                imposterContainer.parentNode.removeChild(imposterContainer);
            }
            return null;
        }
    }

    docSentenceExtract(source, extent, layoutAwareScan) {
        const quotesFwd = {'「': '」', '『': '』', "'": "'", '"': '"'};
        const quotesBwd = {'」': '「', '』': '『', "'": "'", '"': '"'};
        const terminators = '…。．.？?！!';

        const sourceLocal = source.clone();
        const position = sourceLocal.setStartOffset(extent, layoutAwareScan);
        sourceLocal.setEndOffset(extent * 2 - position, layoutAwareScan, true);
        const content = sourceLocal.text();

        let quoteStack = [];

        let startPos = 0;
        for (let i = position; i >= startPos; --i) {
            const c = content[i];

            if (c === '\n') {
                startPos = i + 1;
                break;
            }

            if (quoteStack.length === 0 && (terminators.includes(c) || c in quotesFwd)) {
                startPos = i + 1;
                break;
            }

            if (quoteStack.length > 0 && c === quoteStack[0]) {
                quoteStack.pop();
            } else if (c in quotesBwd) {
                quoteStack.unshift(quotesBwd[c]);
            }
        }

        quoteStack = [];

        let endPos = content.length;
        for (let i = position; i <= endPos; ++i) {
            const c = content[i];

            if (c === '\n') {
                endPos = i + 1;
                break;
            }

            if (quoteStack.length === 0) {
                if (terminators.includes(c)) {
                    endPos = i + 1;
                    break;
                } else if (c in quotesBwd) {
                    endPos = i;
                    break;
                }
            }

            if (quoteStack.length > 0 && c === quoteStack[0]) {
                quoteStack.pop();
            } else if (c in quotesFwd) {
                quoteStack.unshift(quotesFwd[c]);
            }
        }

        const text = content.substring(startPos, endPos);
        const padding = text.length - text.replace(/^\s+/, '').length;

        return {
            text: text.trim(),
            offset: position - startPos - padding
        };
    }

    isPointInRange(x, y, range) {
        // Require a text node to start
        if (range.startContainer.nodeType !== Node.TEXT_NODE) {
            return false;
        }

        // Scan forward
        const nodePre = range.endContainer;
        const offsetPre = range.endOffset;
        try {
            const {node, offset, content} = new DOMTextScanner(range.endContainer, range.endOffset, true, false).seek(1);
            range.setEnd(node, offset);

            if (!this.isWhitespace(content) && DOM.isPointInAnyRect(x, y, range.getClientRects())) {
                return true;
            }
        } finally {
            range.setEnd(nodePre, offsetPre);
        }

        // Scan backward
        const {node, offset, content} = new DOMTextScanner(range.startContainer, range.startOffset, true, false).seek(-1);
        range.setStart(node, offset);

        if (!this.isWhitespace(content) && DOM.isPointInAnyRect(x, y, range.getClientRects())) {
            // This purposefully leaves the starting offset as modified and sets the range length to 0.
            range.setEnd(node, offset);
            return true;
        }

        // No match
        return false;
    }

    isWhitespace(string) {
        return string.trim().length === 0;
    }

    caretRangeFromPoint(x, y) {
        if (typeof document.caretRangeFromPoint === 'function') {
            // Chrome, Edge
            return document.caretRangeFromPoint(x, y);
        }

        if (typeof document.caretPositionFromPoint === 'function') {
            // Firefox
            return this._caretPositionFromPoint(x, y);
        }

        // No support
        return null;
    }

    _caretPositionFromPoint(x, y) {
        const position = document.caretPositionFromPoint(x, y);
        if (position === null) {
            return null;
        }
        const node = position.offsetNode;
        if (node === null) {
            return null;
        }

        const range = document.createRange();
        const offset = (node.nodeType === Node.TEXT_NODE ? position.offset : 0);
        try {
            range.setStart(node, offset);
            range.setEnd(node, offset);
        } catch (e) {
            // Firefox throws new DOMException("The operation is insecure.")
            // when trying to select a node from within a ShadowRoot.
            return null;
        }
        return range;
    }

    caretRangeFromPointExt(x, y, elements) {
        const modifications = [];
        try {
            let i = 0;
            let startContinerPre = null;
            while (true) {
                const range = this.caretRangeFromPoint(x, y);
                if (range === null) {
                    return null;
                }

                const startContainer = range.startContainer;
                if (startContinerPre !== startContainer) {
                    if (this.isPointInRange(x, y, range)) {
                        return range;
                    }
                    startContinerPre = startContainer;
                }

                i = this.disableTransparentElement(elements, i, modifications);
                if (i < 0) {
                    return null;
                }
            }
        } finally {
            if (modifications.length > 0) {
                this.restoreElementStyleModifications(modifications);
            }
        }
    }

    disableTransparentElement(elements, i, modifications) {
        while (true) {
            if (i >= elements.length) {
                return -1;
            }

            const element = elements[i++];
            if (this.isElementTransparent(element)) {
                const style = element.hasAttribute('style') ? element.getAttribute('style') : null;
                modifications.push({element, style});
                element.style.setProperty('pointer-events', 'none', 'important');
                return i;
            }
        }
    }

    restoreElementStyleModifications(modifications) {
        for (const {element, style} of modifications) {
            if (style === null) {
                element.removeAttribute('style');
            } else {
                element.setAttribute('style', style);
            }
        }
    }

    isElementTransparent(element) {
        if (
            element === document.body ||
            element === document.documentElement
        ) {
            return false;
        }
        const style = window.getComputedStyle(element);
        return (
            parseFloat(style.opacity) <= 0 ||
            style.visibility === 'hidden' ||
            (style.backgroundImage === 'none' && this.isColorTransparent(style.backgroundColor))
        );
    }

    isColorTransparent(cssColor) {
        return this.REGEX_TRANSPARENT_COLOR.test(cssColor);
    }
}

// Temporary public exports for compatibility
function docRangeFromPoint(...args) {
    return new DocumentUtil().docRangeFromPoint(...args);
}

function docSentenceExtract(...args) {
    return new DocumentUtil().docSentenceExtract(...args);
}
