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
 * isColorTransparent
 * isStyleSelectable
 */

// \u200c (Zero-width non-joiner) appears on Google Docs from Chrome 76 onwards
const REGEX_IGNORE_CHARACTER = /\u200c/;
const REGEX_DISPLAY = /^\s*([\w-]+)/;


/*
 * TextSourceRange
 */

class TextSourceRange {
    constructor(range, content, imposterContainer, imposterSourceElement) {
        this.range = range;
        this.rangeStartOffset = range.startOffset;
        this.content = content;
        this.imposterContainer = imposterContainer;
        this.imposterSourceElement = imposterSourceElement;
    }

    clone() {
        return new TextSourceRange(this.range.cloneRange(), this.content, this.imposterContainer, this.imposterSourceElement);
    }

    cleanup() {
        if (this.imposterContainer !== null && this.imposterContainer.parentNode !== null) {
            this.imposterContainer.parentNode.removeChild(this.imposterContainer);
        }
    }

    text() {
        return this.content;
    }

    setEndOffset(length) {
        const state = TextSourceRange.seek(this.range.startContainer, this.range.startOffset, length);
        this.range.setEnd(state.node, state.offset);
        this.content = state.content;
    }

    setStartOffset(length) {
        const state = TextSourceRange.seek(this.range.startContainer, this.range.startOffset, -length);
        this.range.setStart(state.node, state.offset);
        this.rangeStartOffset = this.range.startOffset;
        this.content = `${state.content}${this.content}`;
    }

    getRect() {
        return this.range.getBoundingClientRect();
    }

    getWritingMode() {
        return TextSourceRange._getElementWritingMode(TextSourceRange._getParentElement(this.range.startContainer));
    }

    select() {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(this.range);
    }

    deselect() {
        const selection = window.getSelection();
        selection.removeAllRanges();
    }

    equals(other) {
        if (!(
            typeof other === 'object' &&
            other !== null &&
            other instanceof TextSourceRange
        )) {
            return false;
        }
        if (this.imposterSourceElement !== null) {
            return (
                this.imposterSourceElement === other.imposterSourceElement &&
                this.rangeStartOffset === other.rangeStartOffset
            );
        } else {
            return this.range.compareBoundaryPoints(Range.START_TO_START, other.range) === 0;
        }
    }

    static seek(node, offset, length) {
        const forward = (length >= 0);
        const state = {
            node,
            offset,
            content: '',
            remainder: (forward ? length : -length)
        };
        if (length === 0) {
            return state;
        }

        const TEXT_NODE = Node.TEXT_NODE;
        const ELEMENT_NODE = Node.ELEMENT_NODE;

        const seekTextNode = forward ? TextSourceRange._seekForwardTextNode : TextSourceRange._seekBackwardTextNode;
        const getNextNode = forward ? TextSourceRange._getNextNode : TextSourceRange._getPreviousNode;
        const getElementSeekInfo = TextSourceRange._getElementSeekInfo;
        const shouldSeekTextNode = TextSourceRange._shouldSeekTextNode;
        const addLineBreak = TextSourceRange._addLineBreak;

        let first = true;

        const ruby = TextSourceRange._getRubyElement(node);
        if (ruby !== null) {
            node = ruby;
            first = false;
        }

        let lineBreak = false;
        let lineBreak2;
        while (node !== null) {
            let visitChildren = true;
            const nodeType = node.nodeType;

            if (nodeType === TEXT_NODE) {
                state.node = node;
                if (first || shouldSeekTextNode(node)) {
                    if (!first) {
                        state.offset = forward ? 0 : node.nodeValue.length;
                    }
                    if (lineBreak) {
                        if (addLineBreak(state, forward)) {
                            break;
                        }
                        lineBreak = false;
                    }
                    if (seekTextNode(state)) {
                        break;
                    }
                } else {
                    state.offset = forward ? 0 : node.nodeValue.length;
                }
            } else if (nodeType === ELEMENT_NODE) {
                [visitChildren, lineBreak2] = getElementSeekInfo(node);
                if (lineBreak2) { lineBreak = true; }
            }

            const exitedNodes = [];
            node = getNextNode(node, visitChildren, exitedNodes);

            if (!lineBreak) {
                for (const exitedNode of exitedNodes) {
                    if (exitedNode.nodeType !== ELEMENT_NODE) { continue; }
                    if (getElementSeekInfo(exitedNode)[1]) {
                        lineBreak = true;
                        break;
                    }
                }
            }

            first = false;
        }

        return state;
    }

    static getNodesInRange(range) {
        const end = range.endContainer;
        const nodes = [];
        for (let node = range.startContainer; node !== null; node = TextSourceRange._getNextNode(node, true, null)) {
            nodes.push(node);
            if (node === end) { break; }
        }
        return nodes;
    }

    static anyNodeMatchesSelector(nodeList, selector) {
        for (const node of nodeList) {
            if (TextSourceRange.nodeMatchesSelector(node, selector)) {
                return true;
            }
        }
        return false;
    }

    static nodeMatchesSelector(node, selector) {
        for (; node !== null; node = node.parentNode) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                return node.matches(selector);
            }
        }
        return false;
    }

    // Private functions

    static _addLineBreak(state, forward) {
        state.content = (forward ? state.content + '\n' : '\n' + state.content);
        return (--state.remainder <= 0);
    }

    static _seekForwardTextNode(state) {
        const node = state.node;
        const nodeValue = node.nodeValue;
        const nodeValueLength = nodeValue.length;
        let content = state.content;
        let offset = state.offset;
        let remainder = state.remainder;
        let result = false;

        let lineBreaks = false;
        let lineBreaksDetected = false;

        while (offset < nodeValueLength) {
            let c = nodeValue[offset];
            ++offset;
            if (REGEX_IGNORE_CHARACTER.test(c)) { continue; }

            if (c === '\n') {
                if (!lineBreaksDetected) {
                    lineBreaks = TextSourceRange._getLineBreakMode(node);
                    lineBreaksDetected = true;
                }
                if (!lineBreaks) { c = ' '; }
            }

            content += c;

            if (--remainder <= 0) {
                result = true;
                break;
            }
        }

        state.offset = offset;
        state.content = content;
        state.remainder = remainder;
        return result;
    }

    static _seekBackwardTextNode(state) {
        const node = state.node;
        const nodeValue = node.nodeValue;
        let content = state.content;
        let offset = state.offset;
        let remainder = state.remainder;
        let result = false;

        let lineBreaks = false;
        let lineBreaksDetected = false;

        while (offset > 0) {
            --offset;
            let c = nodeValue[offset];
            if (REGEX_IGNORE_CHARACTER.test(c)) { continue; }

            if (c === '\n') {
                if (!lineBreaksDetected) {
                    lineBreaks = TextSourceRange._getLineBreakMode(node);
                    lineBreaksDetected = true;
                }
                if (!lineBreaks) { c = ' '; }
            }

            content = c + content;

            if (--remainder <= 0) {
                result = true;
                break;
            }
        }

        state.offset = offset;
        state.content = content;
        state.remainder = remainder;
        return result;
    }

    static _getNextNode(node, visitChildren, exitedNodes) {
        let next = visitChildren ? node.firstChild : null;
        if (next === null) {
            while (true) {
                if (exitedNodes !== null) {
                    exitedNodes.push(node);
                }

                next = node.nextSibling;
                if (next !== null) { break; }

                next = node.parentNode;
                if (next === null) { break; }

                node = next;
            }
        }
        return next;
    }

    static _getPreviousNode(node, visitChildren, exitedNodes) {
        let next = visitChildren ? node.lastChild : null;
        if (next === null) {
            while (true) {
                if (exitedNodes !== null) {
                    exitedNodes.push(node);
                }

                next = node.previousSibling;
                if (next !== null) { break; }

                next = node.parentNode;
                if (next === null) { break; }

                node = next;
            }
        }
        return next;
    }

    static _shouldSeekTextNode(node) {
        const element = TextSourceRange._getParentElement(node);
        if (element === null) { return true; }

        const style = window.getComputedStyle(element);
        return !(
            style.visibility === 'hidden' ||
            parseFloat(style.opacity) <= 0 ||
            parseFloat(style.fontSize) <= 0 ||
            (
                !isStyleSelectable(style) &&
                (isColorTransparent(style.color) || isColorTransparent(style.webkitTextFillColor))
            )
        );
    }

    static _getElementSeekInfo(element) {
        // returns: [shouldEnter: boolean, lineBreak: boolean]
        let shouldEnter = true;
        let lineBreak = false;
        switch (element.nodeName.toUpperCase()) {
            case 'RT':
            case 'SCRIPT':
            case 'STYLE':
                shouldEnter = false;
                break;
            case 'BR':
                lineBreak = true;
                break;
        }

        const style = window.getComputedStyle(element);
        const display = style.display;
        if (display === 'none') {
            shouldEnter = false;
        }

        const m = REGEX_DISPLAY.exec(display);
        if (m !== null && m[1] === 'block') {
            lineBreak = true;
        }
        switch (style.position) {
            case 'absolute':
            case 'fixed':
                lineBreak = true;
                break;
        }

        return [shouldEnter, lineBreak && shouldEnter];
    }

    static _getRubyElement(node) {
        node = TextSourceRange._getParentElement(node);
        if (node !== null && node.nodeName.toUpperCase() === 'RT') {
            node = node.parentNode;
            return (node !== null && node.nodeName.toUpperCase() === 'RUBY') ? node : null;
        }
        return null;
    }

    static _getParentElement(node) {
        while (node !== null && node.nodeType !== Node.ELEMENT_NODE) {
            node = node.parentNode;
        }
        return node;
    }

    static _getElementWritingMode(element) {
        if (element !== null) {
            const style = window.getComputedStyle(element);
            const writingMode = style.writingMode;
            if (typeof writingMode === 'string') {
                return TextSourceRange._normalizeWritingMode(writingMode);
            }
        }
        return 'horizontal-tb';
    }

    static _normalizeWritingMode(writingMode) {
        switch (writingMode) {
            case 'lr':
            case 'lr-tb':
            case 'rl':
                return 'horizontal-tb';
            case 'tb':
                return 'vertical-lr';
            case 'tb-rl':
                return 'vertical-rl';
            default:
                return writingMode;
        }
    }

    static _getLineBreakMode(textNode) {
        const element = TextSourceRange._getParentElement(textNode);
        if (element === null) { return false; }

        const style = window.getComputedStyle(element);
        switch (style.whiteSpace) {
            case 'pre':
            case 'pre-wrap':
            case 'pre-line':
            case 'break-spaces':
                return true;
        }
        return false;
    }
}


/*
 * TextSourceElement
 */

class TextSourceElement {
    constructor(element, content='') {
        this.element = element;
        this.content = content;
    }

    clone() {
        return new TextSourceElement(this.element, this.content);
    }

    cleanup() {
        // NOP
    }

    text() {
        return this.content;
    }

    setEndOffset(length) {
        switch (this.element.nodeName.toUpperCase()) {
            case 'BUTTON':
                this.content = this.element.textContent;
                break;
            case 'IMG':
                this.content = this.element.getAttribute('alt');
                break;
            default:
                this.content = this.element.value;
                break;
        }

        let consumed = 0;
        let content = '';
        for (const currentChar of this.content || '') {
            if (consumed >= length) {
                break;
            } else if (!currentChar.match(REGEX_IGNORE_CHARACTER)) {
                consumed++;
                content += currentChar;
            }
        }

        this.content = content;
    }

    setStartOffset() {
        // NOP
    }

    getRect() {
        return this.element.getBoundingClientRect();
    }

    getWritingMode() {
        return 'horizontal-tb';
    }

    select() {
        // NOP
    }

    deselect() {
        // NOP
    }

    equals(other) {
        return (
            typeof other === 'object' &&
            other !== null &&
            other instanceof TextSourceElement &&
            other.element === this.element &&
            other.content === this.content
        );
    }
}
