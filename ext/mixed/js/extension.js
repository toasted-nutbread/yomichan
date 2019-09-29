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


// toIterable is required on Edge for cross-window origin objects.
function toIterable(value) {
    if (typeof Symbol !== 'undefined' && typeof value[Symbol.iterator] !== 'undefined') {
        return value;
    }

    if (value !== null && typeof value === 'object') {
        const length = value.length;
        if (typeof length === 'number' && Number.isFinite(length)) {
            const array = [];
            for (let i = 0; i < length; ++i) {
                array.push(value[i]);
            }
            return array;
        }
    }

    throw 'Could not convert to iterable';
}

function extensionHasChrome() {
    try {
        return typeof chrome === 'object' && chrome !== null;
    } catch (e) {
        return false;
    }
}

function extensionHasBrowser() {
    try {
        return typeof browser === 'object' && browser !== null;
    } catch (e) {
        return false;
    }
}

const EXTENSION_IS_BROWSER_EDGE = (
    extensionHasBrowser() &&
    (!extensionHasChrome() || (typeof chrome.runtime === 'undefined' && typeof browser.runtime !== 'undefined'))
);

if (EXTENSION_IS_BROWSER_EDGE) {
    // Edge does not have chrome defined.
    chrome = browser;
}


class Timer {
    constructor() {
        this.samples = [];
        this.parent = null;
    }

    sample(name) {
        const time = performance.now();
        this.samples.push({
            name,
            time,
            children: []
        });
    }

    complete(skip) {
        this.sample('complete');

        Timer.current = this.parent;
        if (this.parent === null) {
            if (!skip) {
                console.log(this.toString());
            }
        } else {
            if (skip) {
                const sample = this.parent.samples[this.parent.samples.length - 1];
                sample.children.splice(sample.children.length - 1, 1);
            }
        }
    }

    duration(sampleIndex) {
        const sampleIndexIsValid = (typeof sampleIndex === 'number');
        const startIndex = (sampleIndexIsValid ? sampleIndex : 0);
        const endIndex = (sampleIndexIsValid ? sampleIndex + 1 : this.times.length - 1);
        return (this.times[endIndex].time - this.times[startIndex].time);
    }

    toString() {
        const indent = '  ';
        const name = this.samples[0].name;
        const duration = this.samples[this.samples.length - 1].time - this.samples[0].time;
        const extensionName = chrome.runtime.getManifest().name;
        return `${name} took ${duration.toFixed(8)}ms  [${extensionName}]` + Timer.indent(this.getSampleString(), indent);
    }

    getSampleString() {
        const indent = '  ';
        const duration = this.samples[this.samples.length - 1].time - this.samples[0].time;
        let message = '';

        for (let i = 0, ii = this.samples.length - 1; i < ii; ++i) {
            const sample = this.samples[i];
            const sampleDuration = this.samples[i + 1].time - sample.time;
            message += `\nSample[${i}] took ${sampleDuration.toFixed(8)}ms (${((sampleDuration / duration) * 100.0).toFixed(1)}%)  [${sample.name}]`;
            for (const child of sample.children) {
                message += Timer.indent(child.getSampleString(), indent);
            }
        }

        return message;
    }

    static create(name) {
        const t = new Timer();
        t.sample(name);
        const current = Timer.current;
        if (current !== null) {
            current.samples[current.samples.length - 1].children.push(t);
            t.parent = current;
        }
        Timer.current = t;
        return t;
    }

    static indent(message, indent) {
        return message.replace(/\n/g, `\n${indent}`);
    }
}

Timer.current = null;
