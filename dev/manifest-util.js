/*
 * Copyright (C) 2021  Yomichan Authors
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

const fs = require('fs');
const path = require('path');


function clone(value) {
    return JSON.parse(JSON.stringify(value));
}


class ManifestUtil {
    constructor() {
        const fileName = path.join(__dirname, 'data', 'manifest-variants.json');
        const {manifest, variants, defaultVariant} = JSON.parse(fs.readFileSync(fileName));
        this._manifest = manifest;
        this._variants = variants;
        this._defaultVariant = defaultVariant;
    }

    get manifest() {
        return this._manifest;
    }

    get variants() {
        return this._variants;
    }

    get defaultVariant() {
        return this._defaultVariant;
    }

    getDefaultManifest() {
        return clone(this._manifest);
    }

    static createManifestString(manifest) {
        return JSON.stringify(manifest, null, 4) + '\n';
    }
}


module.exports = {
    ManifestUtil
};
