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
 * AudioSystem
 * getOptionsContext
 * getOptionsMutable
 * settingsSaveOptions
 */

class AudioController {
    constructor() {
        this.audioSourceUI = null;
        this.audioSystem = null;
    }

    async prepare() {
        this.audioSystem = new AudioSystem({
            audioUriBuilder: null,
            useCache: true
        });

        const optionsContext = getOptionsContext();
        const options = await getOptionsMutable(optionsContext);
        this.audioSourceUI = new AudioSourceContainer(
            options.audio.sources,
            document.querySelector('.audio-source-list'),
            document.querySelector('.audio-source-add')
        );
        this.audioSourceUI.save = settingsSaveOptions;

        this._prepareTextToSpeech();
    }

    static instantiateTemplate(templateSelector) {
        const template = document.querySelector(templateSelector);
        const content = document.importNode(template.content, true);
        return content.firstChild;
    }

    // Private

    _prepareTextToSpeech() {
        if (typeof speechSynthesis === 'undefined') { return; }

        speechSynthesis.addEventListener('voiceschanged', this._updateTextToSpeechVoices.bind(this), false);
        this._updateTextToSpeechVoices();

        document.querySelector('#text-to-speech-voice').addEventListener('change', this._onTextToSpeechVoiceChange.bind(this), false);
        document.querySelector('#text-to-speech-voice-test').addEventListener('click', this._testTextToSpeech.bind(this), false);
    }

    _updateTextToSpeechVoices() {
        const voices = Array.prototype.map.call(speechSynthesis.getVoices(), (voice, index) => ({voice, index}));
        voices.sort(this._textToSpeechVoiceCompare.bind(this));

        document.querySelector('#text-to-speech-voice-container').hidden = (voices.length === 0);

        const fragment = document.createDocumentFragment();

        let option = document.createElement('option');
        option.value = '';
        option.textContent = 'None';
        fragment.appendChild(option);

        for (const {voice} of voices) {
            option = document.createElement('option');
            option.value = voice.voiceURI;
            option.textContent = `${voice.name} (${voice.lang})`;
            fragment.appendChild(option);
        }

        const select = document.querySelector('#text-to-speech-voice');
        select.textContent = '';
        select.appendChild(fragment);
        select.value = select.dataset.value;
    }

    _textToSpeechVoiceCompare(a, b) {
        const aIsJapanese = this._languageTagIsJapanese(a.voice.lang);
        const bIsJapanese = this._languageTagIsJapanese(b.voice.lang);
        if (aIsJapanese) {
            if (!bIsJapanese) { return -1; }
        } else {
            if (bIsJapanese) { return 1; }
        }

        const aIsDefault = a.voice.default;
        const bIsDefault = b.voice.default;
        if (aIsDefault) {
            if (!bIsDefault) { return -1; }
        } else {
            if (bIsDefault) { return 1; }
        }

        return a.index - b.index;
    }

    _languageTagIsJapanese(languageTag) {
        return (
            languageTag.startsWith('ja-') ||
            languageTag.startsWith('jpn-')
        );
    }

    _testTextToSpeech() {
        try {
            const text = document.querySelector('#text-to-speech-voice-test').dataset.speechText || '';
            const voiceUri = document.querySelector('#text-to-speech-voice').value;

            const audio = this.audioSystem.createTextToSpeechAudio(text, voiceUri);
            audio.volume = 1.0;
            audio.play();
        } catch (e) {
            // NOP
        }
    }

    _onTextToSpeechVoiceChange(e) {
        e.currentTarget.dataset.value = e.currentTarget.value;
    }
}

class AudioSourceContainer {
    constructor(audioSources, container, addButton) {
        this.audioSources = audioSources;
        this.container = container;
        this.addButton = addButton;
        this.children = [];

        this.container.textContent = '';

        for (const audioSource of toIterable(audioSources)) {
            this.children.push(new AudioSourceEntry(this, audioSource, this.children.length));
        }

        this._clickListener = this.onAddAudioSource.bind(this);
        this.addButton.addEventListener('click', this._clickListener, false);
    }

    cleanup() {
        for (const child of this.children) {
            child.cleanup();
        }

        this.addButton.removeEventListener('click', this._clickListener, false);
        this.container.textContent = '';
        this._clickListener = null;
    }

    save() {
        // Override
    }

    remove(child) {
        const index = this.children.indexOf(child);
        if (index < 0) {
            return;
        }

        child.cleanup();
        this.children.splice(index, 1);
        this.audioSources.splice(index, 1);

        for (let i = index; i < this.children.length; ++i) {
            this.children[i].index = i;
        }
    }

    onAddAudioSource() {
        const audioSource = this.getUnusedAudioSource();
        this.audioSources.push(audioSource);
        this.save();
        this.children.push(new AudioSourceEntry(this, audioSource, this.children.length));
    }

    getUnusedAudioSource() {
        const audioSourcesAvailable = [
            'jpod101',
            'jpod101-alternate',
            'jisho',
            'custom'
        ];
        for (const source of audioSourcesAvailable) {
            if (this.audioSources.indexOf(source) < 0) {
                return source;
            }
        }
        return audioSourcesAvailable[0];
    }
}

class AudioSourceEntry {
    constructor(parent, audioSource, index) {
        this.parent = parent;
        this.audioSource = audioSource;
        this.index = index;

        this.container = AudioController.instantiateTemplate('#audio-source-template');
        this.select = this.container.querySelector('.audio-source-select');
        this.removeButton = this.container.querySelector('.audio-source-remove');

        this.select.value = audioSource;

        this._selectChangeListener = this.onSelectChanged.bind(this);
        this._removeClickListener = this.onRemoveClicked.bind(this);

        this.select.addEventListener('change', this._selectChangeListener, false);
        this.removeButton.addEventListener('click', this._removeClickListener, false);

        parent.container.appendChild(this.container);
    }

    cleanup() {
        this.select.removeEventListener('change', this._selectChangeListener, false);
        this.removeButton.removeEventListener('click', this._removeClickListener, false);

        if (this.container.parentNode !== null) {
            this.container.parentNode.removeChild(this.container);
        }
    }

    save() {
        this.parent.save();
    }

    onSelectChanged() {
        this.audioSource = this.select.value;
        this.parent.audioSources[this.index] = this.audioSource;
        this.save();
    }

    onRemoveClicked() {
        this.parent.remove(this);
        this.save();
    }
}
