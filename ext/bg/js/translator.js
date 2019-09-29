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


class Translator {
    constructor() {
        this.database = null;
        this.deinflector = null;
    }

    async prepare() {
        if (!this.database) {
            this.database = new Database();
            await this.database.prepare();
        }

        if (!this.deinflector) {
            const url = chrome.extension.getURL('/bg/lang/deinflect.json');
            const reasons = await requestJson(url, 'GET');
            this.deinflector = new Deinflector(reasons);
        }
    }

    async findTermsGrouped(text, dictionaries, alphanumeric, options) {
        const t = Timer.create('findTermsGrouped');
        const titles = Object.keys(dictionaries);
        t.sample('findTerms');
        const {length, definitions} = await this.findTerms(text, dictionaries, alphanumeric);

        t.sample('dictTermsGroup');
        const definitionsGrouped = dictTermsGroup(definitions, dictionaries);
        t.sample(`buildTermFrequencies[${definitionsGrouped.length}]`);
        await this.buildTermFrequencies(definitionsGrouped, titles);

        if (options.general.compactTags) {
            t.sample('dictTermsCompressTags');
            for (const definition of definitionsGrouped) {
                dictTermsCompressTags(definition.definitions);
            }
        }

        t.complete();
        return {length, definitions: definitionsGrouped};
    }

    async findTermsMerged(text, dictionaries, alphanumeric, options) {
        const secondarySearchTitles = Object.keys(options.dictionaries).filter(dict => options.dictionaries[dict].allowSecondarySearches);
        const titles = Object.keys(dictionaries);
        const {length, definitions} = await this.findTerms(text, dictionaries, alphanumeric);

        const definitionsBySequence = dictTermsMergeBySequence(definitions, options.general.mainDictionary);

        const definitionsMerged = [];
        const mergedByTermIndices = new Set();
        for (const sequence in definitionsBySequence) {
            if (sequence < 0) {
                continue;
            }

            const result = definitionsBySequence[sequence];

            const rawDefinitionsBySequence = await this.database.findTermsBySequence(Number(sequence), options.general.mainDictionary);

            for (const definition of rawDefinitionsBySequence) {
                const definitionTags = await this.expandTags(definition.definitionTags, definition.dictionary);
                definitionTags.push(dictTagBuildSource(definition.dictionary));
                definition.definitionTags = definitionTags;
                const termTags = await this.expandTags(definition.termTags, definition.dictionary);
                definition.termTags = termTags;
            }

            const definitionsByGloss = dictTermsMergeByGloss(result, rawDefinitionsBySequence);

            const secondarySearchResults = [];
            if (secondarySearchTitles.length > 0) {
                for (const expression of result.expressions.keys()) {
                    if (expression === text) {
                        continue;
                    }

                    for (const reading of result.expressions.get(expression).keys()) {
                        for (const definition of await this.database.findTermsExact(expression, reading, secondarySearchTitles)) {
                            const definitionTags = await this.expandTags(definition.definitionTags, definition.dictionary);
                            definitionTags.push(dictTagBuildSource(definition.dictionary));
                            definition.definitionTags = definitionTags;
                            const termTags = await this.expandTags(definition.termTags, definition.dictionary);
                            definition.termTags = termTags;
                            secondarySearchResults.push(definition);
                        }
                    }
                }
            }

            dictTermsMergeByGloss(result, definitionsBySequence['-1'].concat(secondarySearchResults), definitionsByGloss, mergedByTermIndices);

            for (const gloss in definitionsByGloss) {
                const definition = definitionsByGloss[gloss];
                dictTagsSort(definition.definitionTags);
                result.definitions.push(definition);
            }

            dictTermsSort(result.definitions, dictionaries);

            const expressions = [];
            for (const expression of result.expressions.keys()) {
                for (const reading of result.expressions.get(expression).keys()) {
                    const termTags = result.expressions.get(expression).get(reading);
                    expressions.push({
                        expression: expression,
                        reading: reading,
                        termTags: dictTagsSort(termTags),
                        termFrequency: (score => {
                            if (score > 0) {
                                return 'popular';
                            } else if (score < 0) {
                                return 'rare';
                            } else {
                                return 'normal';
                            }
                        })(termTags.map(tag => tag.score).reduce((p, v) => p + v, 0))
                    });
                }
            }

            result.expressions = expressions;

            result.expression = Array.from(result.expression);
            result.reading = Array.from(result.reading);

            definitionsMerged.push(result);
        }

        const strayDefinitions = definitionsBySequence['-1'].filter((definition, index) => !mergedByTermIndices.has(index));
        for (const groupedDefinition of dictTermsGroup(strayDefinitions, dictionaries)) {
            groupedDefinition.expressions = [{expression: groupedDefinition.expression, reading: groupedDefinition.reading}];
            definitionsMerged.push(groupedDefinition);
        }

        await this.buildTermFrequencies(definitionsMerged, titles);

        if (options.general.compactTags) {
            for (const definition of definitionsMerged) {
                dictTermsCompressTags(definition.definitions);
            }
        }

        return {length, definitions: dictTermsSort(definitionsMerged)};
    }

    async findTermsSplit(text, dictionaries, alphanumeric) {
        const titles = Object.keys(dictionaries);
        const {length, definitions} = await this.findTerms(text, dictionaries, alphanumeric);

        await this.buildTermFrequencies(definitions, titles);

        return {length, definitions};
    }

    async findTerms(text, dictionaries, alphanumeric) {
        const t = Timer.create('findTerms');
        if (!alphanumeric && text.length > 0) {
            const c = text[0];
            if (!jpIsKana(c) && !jpIsKanji(c)) {
                t.complete(true);
                return {length: 0, definitions: []};
            }
        }

        t.sample('findTermDeinflections');
        const textHiragana = jpKatakanaToHiragana(text);
        const titles = Object.keys(dictionaries);
        const deinflections = await this.findTermDeinflections(text, textHiragana, titles);

        t.sample('expandTags');
        let definitions = [];
        for (const deinflection of deinflections) {
            for (const definition of deinflection.definitions) {
                const definitionTags = await this.expandTags(definition.definitionTags, definition.dictionary);
                definitionTags.push(dictTagBuildSource(definition.dictionary));
                const termTags = await this.expandTags(definition.termTags, definition.dictionary);

                definitions.push({
                    source: deinflection.source,
                    reasons: deinflection.reasons,
                    score: definition.score,
                    id: definition.id,
                    dictionary: definition.dictionary,
                    expression: definition.expression,
                    reading: definition.reading,
                    glossary: definition.glossary,
                    definitionTags: dictTagsSort(definitionTags),
                    termTags: dictTagsSort(termTags),
                    sequence: definition.sequence
                });
            }
        }

        t.sample('dictTermsUndupe');
        definitions = dictTermsUndupe(definitions);
        definitions = dictTermsSort(definitions, dictionaries);

        let length = 0;
        for (const definition of definitions) {
            length = Math.max(length, definition.source.length);
        }

        t.complete();
        return {length, definitions};
    }

    async findTermDeinflections(text, text2, titles) {
        const deinflections = (text === text2 ? this.getDeinflections(text) : this.getDeinflections2(text, text2));

        if (deinflections.length === 0) {
            return [];
        }

        const definitions = await this.database.findTermsBulk(deinflections.map(e => e.term), titles);

        for (const d of definitions) {
            deinflections[d.index].definitions.push(d);
        }

        return deinflections.filter(e => e.definitions.length > 0);
    }

    getDeinflections(text) {
        const deinflections = [];
        const deinflectionsKeys = {};

        for (let i = text.length; i > 0; --i) {
            const textSlice = text.slice(0, i);
            Translator.addUniqueDeinflections(this.deinflector.deinflect(textSlice), deinflections, deinflectionsKeys);
        }

        return deinflections;
    }

    getDeinflections2(text, text2) {
        const deinflections = [];
        const deinflectionsKeys = {};

        for (let i = text.length; i > 0; --i) {
            const textSlice = text.slice(0, i);
            const text2Slice = text2.slice(0, i);
            Translator.addUniqueDeinflections(this.deinflector.deinflect(textSlice), deinflections, deinflectionsKeys);
            if (textSlice !== text2Slice) {
                Translator.addUniqueDeinflections(this.deinflector.deinflect(text2Slice), deinflections, deinflectionsKeys);
            }
        }

        return deinflections;
    }

    static addUniqueDeinflections(newValues, deinflections, deinflectionsKeys) {
        for (const value of newValues) {
            const key = value.term;
            if (!deinflectionsKeys.hasOwnProperty(key)) {
                deinflections.push(value);
                deinflectionsKeys[key] = true;
            }
        }
    }

    async findKanji(text, dictionaries) {
        let definitions = [];
        const processed = {};
        const titles = Object.keys(dictionaries);
        for (const c of text) {
            if (!processed[c]) {
                definitions.push(...await this.database.findKanji(c, titles));
                processed[c] = true;
            }
        }

        for (const definition of definitions) {
            const tags = await this.expandTags(definition.tags, definition.dictionary);
            tags.push(dictTagBuildSource(definition.dictionary));

            definition.tags = dictTagsSort(tags);
            definition.stats = await this.expandStats(definition.stats, definition.dictionary);

            definition.frequencies = [];
            for (const meta of await this.database.findKanjiMeta(definition.character, titles)) {
                if (meta.mode === 'freq') {
                    definition.frequencies.push({
                        character: meta.character,
                        frequency: meta.data,
                        dictionary: meta.dictionary
                    });
                }
            }
        }

        return definitions;
    }

    async buildTermFrequencies(definitions, titles) {
        const terms = [];
        for (const definition of definitions) {
            if (definition.expressions) {
                terms.push(...definition.expressions);
            } else {
                terms.push(definition);
            }
        }

        if (terms.length === 0) {
            return;
        }

        // Create mapping of unique terms
        const expressionsUnique = [];
        const termsUnique = [];
        const termsUniqueMap = {};
        for (let i = 0, ii = terms.length; i < ii; ++i) {
            const term = terms[i];
            const expression = term.expression;
            term.frequencies = [];

            if (termsUniqueMap.hasOwnProperty(expression)) {
                termsUniqueMap[expression].push(term);
            } else {
                const termList = [term];
                expressionsUnique.push(expression);
                termsUnique.push(termList);
                termsUniqueMap[expression] = termList;
            }
        }

        const metas = await this.database.findTermMetaBulk(expressionsUnique, titles);
        for (const meta of metas) {
            if (meta.mode !== 'freq') {
                continue;
            }

            for (const term of termsUnique[meta.index]) {
                term.frequencies.push({
                    expression: meta.expression,
                    frequency: meta.data,
                    dictionary: meta.dictionary
                });
            }
        }
    }

    async expandTags(names, title) {
        const tags = [];
        for (const name of names) {
            const base = Translator.getNameBase(name);
            let meta = this.database.findTagForTitleCached(base, title);
            if (typeof meta === 'undefined') {
                meta = await this.database.findTagForTitle(base, title);
            }

            const tag = Object.assign({}, meta !== null ? meta : {}, {name});

            tags.push(dictTagSanitize(tag));
        }

        return tags;
    }

    async expandStats(items, title) {
        const stats = {};
        for (const name in items) {
            const base = Translator.getNameBase(name);
            let meta = this.database.findTagForTitleCached(base, title);
            if (typeof meta === 'undefined') {
                meta = await this.database.findTagForTitle(base, title);
                if (meta === null) {
                    continue;
                }
            }

            const group = stats[meta.category] = stats[meta.category] || [];

            const stat = Object.assign({}, meta, {name, value: items[name]});

            group.push(dictTagSanitize(stat));
        }

        for (const category in stats) {
            stats[category].sort((a, b) => {
                if (a.notes < b.notes) {
                    return -1;
                } else if (a.notes > b.notes) {
                    return 1;
                } else {
                    return 0;
                }
            });
        }

        return stats;
    }

    static getNameBase(name) {
        const pos = name.indexOf(':');
        return (pos >= 0 ? name.substr(0, pos) : name);
    }
}
