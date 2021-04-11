/*
 * Copyright (C) 2020-2021  Yomichan Authors
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
const assert = require('assert');
const readline = require('readline');
const childProcess = require('child_process');
const util = require('./util');
const {getAllFiles, getDefaultManifestAndVariants, createManifestString, getArgs, testMain} = util;


function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

async function createZip(directory, excludeFiles, outputFileName, sevenZipExes, onUpdate, dryRun) {
    try {
        fs.unlinkSync(outputFileName);
    } catch (e) {
        // NOP
    }

    if (!dryRun) {
        for (const exe of sevenZipExes) {
            try {
                const excludeArguments = excludeFiles.map((excludeFilePath) => `-x!${excludeFilePath}`);
                childProcess.execFileSync(
                    exe,
                    [
                        'a',
                        outputFileName,
                        '.',
                        ...excludeArguments
                    ],
                    {
                        cwd: directory
                    }
                );
                return;
            } catch (e) {
                // NOP
            }
        }
    }
    return await createJSZip(directory, excludeFiles, outputFileName, onUpdate, dryRun);
}

async function createJSZip(directory, excludeFiles, outputFileName, onUpdate, dryRun) {
    const JSZip = util.JSZip;
    const files = getAllFiles(directory);
    removeItemsFromArray(files, excludeFiles);
    const zip = new JSZip();
    for (const fileName of files) {
        zip.file(
            fileName.replace(/\\/g, '/'),
            fs.readFileSync(path.join(directory, fileName), {encoding: null, flag: 'r'}),
            {}
        );
    }

    if (typeof onUpdate !== 'function') {
        onUpdate = () => {}; // NOP
    }

    const data = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: {level: 9}
    }, onUpdate);
    process.stdout.write('\n');

    if (!dryRun) {
        fs.writeFileSync(outputFileName, data, {encoding: null, flag: 'w'});
    }
}

function removeItemsFromArray(array, removeItems) {
    for (const item of removeItems) {
        const index = getIndexOfFilePath(array, item);
        if (index >= 0) {
            array.splice(index, 1);
        }
    }
}

function getIndexOfFilePath(array, item) {
    const pattern = /\\/g;
    const separator = '/';
    item = item.replace(pattern, separator);
    for (let i = 0, ii = array.length; i < ii; ++i) {
        if (array[i].replace(pattern, separator) === item) {
            return i;
        }
    }
    return -1;
}

function applyModifications(manifest, modifications) {
    if (Array.isArray(modifications)) {
        for (const modification of modifications) {
            const {action, path: path2} = modification;
            switch (action) {
                case 'set':
                    {
                        const {value, before, after} = modification;
                        const object = getObjectProperties(manifest, path2, path2.length - 1);
                        const key = path2[path2.length - 1];

                        let {index} = modification;
                        if (typeof index !== 'number') {
                            index = -1;
                        }
                        if (typeof before === 'string') {
                            index = getObjectKeyIndex(object, before);
                        }
                        if (typeof after === 'string') {
                            index = getObjectKeyIndex(object, after);
                            if (index >= 0) { ++index; }
                        }

                        setObjectKeyAtIndex(object, key, value, index);
                    }
                    break;
                case 'replace':
                    {
                        const {pattern, patternFlags, replacement} = modification;
                        const value = getObjectProperties(manifest, path2, path2.length - 1);
                        const regex = new RegExp(pattern, patternFlags);
                        const last = path2[path2.length - 1];
                        let value2 = value[last];
                        value2 = `${value2}`.replace(regex, replacement);
                        value[last] = value2;
                    }
                    break;
                case 'delete':
                    {
                        const value = getObjectProperties(manifest, path2, path2.length - 1);
                        const last = path2[path2.length - 1];
                        delete value[last];
                    }
                    break;
                case 'remove':
                    {
                        const {item} = modification;
                        const value = getObjectProperties(manifest, path2, path2.length);
                        const index = value.indexOf(item);
                        if (index >= 0) { value.splice(index, 1); }
                    }
                    break;
                case 'splice':
                    {
                        const {start, deleteCount, items} = modification;
                        const value = getObjectProperties(manifest, path2, path2.length);
                        const itemsNew = items.map((v) => clone(v));
                        value.splice(start, deleteCount, ...itemsNew);
                    }
                    break;
                case 'copy':
                case 'move':
                    {
                        const {newPath, before, after} = modification;
                        const oldKey = path2[path2.length - 1];
                        const newKey = newPath[newPath.length - 1];
                        const oldObject = getObjectProperties(manifest, path2, path2.length - 1);
                        const newObject = getObjectProperties(manifest, newPath, newPath.length - 1);
                        const oldObjectIsNewObject = arraysAreSame(path2, newPath, -1);
                        const value = oldObject[oldKey];

                        let {index} = modification;
                        if (typeof index !== 'number' || index < 0) {
                            index = (oldObjectIsNewObject && action !== 'copy') ? getObjectKeyIndex(oldObject, oldKey) : -1;
                        }
                        if (typeof before === 'string') {
                            index = getObjectKeyIndex(newObject, before);
                        }
                        if (typeof after === 'string') {
                            index = getObjectKeyIndex(newObject, after);
                            if (index >= 0) { ++index; }
                        }

                        setObjectKeyAtIndex(newObject, newKey, value, index);
                        if (action !== 'copy' && (!oldObjectIsNewObject || oldKey !== newKey)) {
                            delete oldObject[oldKey];
                        }
                    }
                    break;
                case 'add':
                    {
                        const {items} = modification;
                        const value = getObjectProperties(manifest, path2, path2.length);
                        const itemsNew = items.map((v) => clone(v));
                        value.push(...itemsNew);
                    }
                    break;
            }
        }
    }

    return manifest;
}

function arraysAreSame(array1, array2, lengthOffset) {
    let ii = array1.length;
    if (ii !== array2.length) { return false; }
    ii += lengthOffset;
    for (let i = 0; i < ii; ++i) {
        if (array1[i] !== array2[i]) { return false; }
    }
    return true;
}

function getObjectKeyIndex(object, key) {
    return Object.keys(object).indexOf(key);
}

function setObjectKeyAtIndex(object, key, value, index) {
    if (index < 0 || typeof key === 'number' || Object.prototype.hasOwnProperty.call(object, key)) {
        object[key] = value;
        return;
    }

    const entries = Object.entries(object);
    index = Math.min(index, entries.length);
    for (let i = index, ii = entries.length; i < ii; ++i) {
        const [key2] = entries[i];
        delete object[key2];
    }
    entries.splice(index, 0, [key, value]);
    for (let i = index, ii = entries.length; i < ii; ++i) {
        const [key2, value2] = entries[i];
        object[key2] = value2;
    }
}

function getObjectProperties(object, path2, count) {
    for (let i = 0; i < count; ++i) {
        object = object[path2[i]];
    }
    return object;
}

function getInheritanceChain(variant, variantMap) {
    const visited = new Set();
    const inheritance = [];
    while (true) {
        const {name, inherit} = variant;
        if (visited.has(name)) { break; }

        visited.add(name);
        inheritance.unshift(variant);

        if (typeof inherit !== 'string') { break; }

        const nextVariant = variantMap.get(inherit);
        if (typeof nextVariant === 'undefined') { break; }

        variant = nextVariant;
    }
    return inheritance;
}

function createVariantManifest(manifest, variant, variantMap) {
    let modifiedManifest = clone(manifest);
    for (const {modifications} of getInheritanceChain(variant, variantMap)) {
        modifiedManifest = applyModifications(modifiedManifest, modifications);
    }
    return modifiedManifest;
}

async function build(manifest, buildDir, extDir, manifestPath, variantMap, variantNames, dryRun, dryRunBuildZip) {
    const sevenZipExes = ['7za', '7z'];

    // Create build directory
    if (!fs.existsSync(buildDir) && !dryRun) {
        fs.mkdirSync(buildDir, {recursive: true});
    }

    const dontLogOnUpdate = !process.stdout.isTTY;
    const onUpdate = (metadata) => {
        if (dontLogOnUpdate) { return; }

        let message = `Progress: ${metadata.percent.toFixed(2)}%`;
        if (metadata.currentFile) {
            message += ` (${metadata.currentFile})`;
        }

        readline.clearLine(process.stdout);
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(message);
    };

    for (const variantName of variantNames) {
        const variant = variantMap.get(variantName);
        if (typeof variant === 'undefined') { continue; }

        const {name, fileName, fileCopies} = variant;
        let {excludeFiles} = variant;
        if (!Array.isArray(excludeFiles)) { excludeFiles = []; }

        process.stdout.write(`Building ${name}...\n`);

        const modifiedManifest = createVariantManifest(manifest, variant, variantMap);

        ensureFilesExist(extDir, excludeFiles);

        if (typeof fileName === 'string') {
            const fileNameSafe = path.basename(fileName);
            const fullFileName = path.join(buildDir, fileNameSafe);
            if (!dryRun) {
                fs.writeFileSync(manifestPath, createManifestString(modifiedManifest));
            }

            if (!dryRun || dryRunBuildZip) {
                await createZip(extDir, excludeFiles, fullFileName, sevenZipExes, onUpdate, dryRun);
            }

            if (!dryRun) {
                if (Array.isArray(fileCopies)) {
                    for (const fileName2 of fileCopies) {
                        const fileName2Safe = path.basename(fileName2);
                        fs.copyFileSync(fullFileName, path.join(buildDir, fileName2Safe));
                    }
                }
            }
        }

        process.stdout.write('\n');
    }
}

function ensureFilesExist(directory, files) {
    for (const file of files) {
        assert.ok(fs.existsSync(path.join(directory, file)));
    }
}


async function main(argv) {
    const args = getArgs(argv, new Map([
        ['all', false],
        ['default', false],
        ['manifest', null],
        ['dry-run', false],
        ['dry-run-build-zip', false],
        [null, []]
    ]));

    const dryRun = args.get('dry-run');
    const dryRunBuildZip = args.get('dry-run-build-zip');

    const {manifest, variants} = getDefaultManifestAndVariants();

    const rootDir = path.join(__dirname, '..');
    const extDir = path.join(rootDir, 'ext');
    const buildDir = path.join(rootDir, 'builds');
    const manifestPath = path.join(extDir, 'manifest.json');

    const variantMap = new Map();
    for (const variant of variants) {
        variantMap.set(variant.name, variant);
    }

    try {
        const variantNames = (argv.length === 0 || args.get('all') ? variants.map(({name}) => name) : args.get(null));
        await build(manifest, buildDir, extDir, manifestPath, variantMap, variantNames, dryRun, dryRunBuildZip);
    } finally {
        // Restore manifest
        let restoreManifest = manifest;
        if (!args.get('default') && args.get('manifest') !== null) {
            const variant = variantMap.get(args.get('manifest'));
            if (typeof variant !== 'undefined') {
                restoreManifest = createVariantManifest(manifest, variant, variantMap);
            }
        }
        process.stdout.write('Restoring manifest...\n');
        if (!dryRun) {
            fs.writeFileSync(manifestPath, createManifestString(restoreManifest));
        }
    }
}


if (require.main === module) {
    testMain(main, process.argv.slice(2));
}


module.exports = {
    main
};
