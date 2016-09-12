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


class Client {
    constructor() {
        this.popup = new Popup();
        this.audio = {};
        this.lastMousePos = null;
        this.lastTextSource = null;
        this.pendingLookup = false;
        this.enabled = false;
        this.options = {};
        this.definitions = null;
        this.sequence = 0;
        this.fgRoot = chrome.extension.getURL('fg');

        chrome.runtime.onMessage.addListener(this.onBgMessage.bind(this));
        window.addEventListener('message', this.onFrameMessage.bind(this));
        window.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('scroll', e => this.hidePopup());
        window.addEventListener('resize', e => this.hidePopup());
    }

    onKeyDown(e) {
        if (this.enabled && this.lastMousePos !== null && (e.keyCode === 16 || e.charCode === 16)) {
            this.searchAt(this.lastMousePos);
        }
    }

    onMouseMove(e) {
        this.lastMousePos = {x: e.clientX, y: e.clientY};
        if (this.enabled && (e.shiftKey || e.which === 2)) {
            this.searchAt(this.lastMousePos);
        }
    }

    onMouseDown(e) {
        this.lastMousePos = {x: e.clientX, y: e.clientY};
        if (this.enabled && (e.shiftKey || e.which === 2)) {
            this.searchAt(this.lastMousePos);
        } else {
            this.hidePopup();
        }
    }

    onBgMessage({action, params}, sender, callback) {
        const method = this['api_' + action];
        if (typeof(method) === 'function') {
            method.call(this, params);
        }

        callback();
    }

    onFrameMessage(e) {
        const {action, params} = e.data, method = this['api_' + action];
        if (typeof(method) === 'function') {
            method.call(this, params);
        }
    }

    searchAt(point) {
        if (this.pendingLookup) {
            return;
        }

        const textSource = textSourceFromPoint(point);
        if (textSource === null || !textSource.containsPoint(point)) {
            this.hidePopup();
            return;
        }

        if (this.lastTextSource !== null && this.lastTextSource.equals(textSource)) {
            return;
        }

        textSource.setEndOffset(this.options.scanLength);

        this.pendingLookup = true;
        findTerm(textSource.text()).then(({definitions, length}) => {
            if (length === 0) {
                this.pendingLookup = false;
                this.hidePopup();
            } else {
                textSource.setEndOffset(length);

                const sentence = extractSentence(textSource, this.options.sentenceExtent);
                definitions.forEach(definition => {
                    definition.url = window.location.href;
                    definition.sentence = sentence;
                });

                const sequence = ++this.sequence;
                return renderText({definitions, sequence, root: this.fgRoot, options: this.options}, 'term-list.html').then(content => {
                    this.definitions = definitions;
                    this.pendingLookup = false;
                    this.showPopup(textSource, content);
                    return canAddDefinitions(definitions, ['term_kanji', 'term_kana']);
                }).then(states => {
                    if (states !== null) {
                        states.forEach((state, index) => this.popup.sendMessage('setActionState', {index, state, sequence }));
                    }
                });
            }
        });
    }

    showPopup(textSource, content) {
        this.popup.showNextTo(textSource.getRect(), content);

        if (this.options.selectMatchedText) {
            textSource.select();
        }

        this.lastTextSource = textSource;
    }

    hidePopup() {
        this.popup.hide();

        if (this.options.selectMatchedText && this.lastTextSource !== null) {
            this.lastTextSource.deselect();
        }

        this.lastTextSource = null;
        this.definitions = null;
    }

    api_setOptions(opts) {
        this.options = opts;
    }

    api_setEnabled(enabled) {
        if (!(this.enabled = enabled)) {
            this.hidePopup();
        }
    }

    api_addNote({index, mode}) {
        const state = {[mode]: false};
        addDefinition(this.definitions[index], mode).then(success => {
            if (success) {
                this.popup.sendMessage('setActionState', {index, state, sequence: this.sequence});
            } else {
                alert('Note could not be added');
            }
        });
    }

    api_playAudio(index) {
        const definition = this.definitions[index];

        let url = `https://assets.languagepod101.com/dictionary/japanese/audiomp3.php?kanji=${encodeURIComponent(definition.expression)}`;
        if (definition.reading) {
            url += `&kana=${encodeURIComponent(definition.reading)}`;
        }

        for (const key in this.audio) {
            this.audio[key].pause();
        }

        const audio = this.audio[url] || new Audio(url);
        audio.currentTime = 0;
        audio.play();

        this.audio[url] = audio;
    }

    api_displayKanji(kanji) {
        findKanji(kanji).then(definitions => {
            definitions.forEach(definition => definition.url = window.location.href);

            const sequence = ++this.sequence;
            return renderText({definitions, sequence, root: this.fgRoot, options: this.options}, 'kanji-list.html').then(content => {
                this.definitions = definitions;
                this.popup.setContent(content, definitions);
                return canAddDefinitions(definitions, ['kanji']);
            }).then(states => {
                if (states !== null) {
                    states.forEach((state, index) => this.popup.sendMessage('setActionState', {index, state, sequence}));
                }
            });
        });
    }
}

window.yomiClient = new Client();
