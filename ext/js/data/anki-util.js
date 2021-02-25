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

/**
 * This class has some general utility functions for working with Anki data.
 */
class AnkiUtil {
    /**
     * Gets the root deck name of a full deck name. If the deck is a root deck,
     * the same name is returned. Nested decks are separated using '::'.
     * @param deckName A string of the deck name.
     * @returns A string corresponding to the name of the root deck.
     */
    static getRootDeckName(deckName) {
        const index = deckName.indexOf('::');
        return index >= 0 ? deckName.substring(0, index) : deckName;
    }

    /**
     * Checks whether or not any marker is contained in a string.
     * @param string A string to check.
     * @return `true` if the text contains an Anki field marker, `false` otherwise.
     */
    static stringContainsAnyFieldMarker(string) {
        const result = this._markerPattern.test(string);
        this._markerPattern.lastIndex = 0;
        return result;
    }
}

// eslint-disable-next-line no-underscore-dangle
AnkiUtil._markerPattern = /\{([\w-]+)\}/g;
