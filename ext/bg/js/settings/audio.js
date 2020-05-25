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
 * AudioSourceUI
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
        this.audioSourceUI = new AudioSourceUI.Container(
            options.audio.sources,
            document.querySelector('.audio-source-list'),
            document.querySelector('.audio-source-add')
        );
        this.audioSourceUI.save = settingsSaveOptions;

        this._prepareTextToSpeech();
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
