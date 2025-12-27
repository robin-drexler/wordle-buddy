import { createRequire } from "module";
// @ts-ignore
const require = createRequire(import.meta.url);

const words = require("./words.json");

/**
 * @typedef {Map<string,number[]>} LetterPositions
 */

/**
 *
 * @param {string[]} absent
 * @param {LetterPositions} correct
 * @param {LetterPositions} present
 * @param {string[]} bannedWords
 */
export function suggestWord(absent, correct, present, bannedWords) {
  const wordLength = 5;

  const suggestions = words.filter((word) => {
    if (word.length !== wordLength) {
      return false;
    }

    if (bannedWords.includes(word)) {
      return false;
    }

    for (const [letter, positions] of correct.entries()) {
      if (positions.some((pos) => word[pos] != letter)) {
        return false;
      }
    }

    if (absent.some((letter) => word.includes(letter))) {
      return false;
    }

    for (const [letter, exceptInPositions] of present.entries()) {
      const indexes = getAllIndexes(word, letter);

      if (!indexes.length) {
        return false;
      }

      if (indexes.some((pos) => exceptInPositions.includes(pos))) {
        return false;
      }
    }

    return true;
  });

  // prefer words with more unique letters to gain more information
  suggestions.sort((a, b) => {
    const aUniqueLetters = new Set(a).size;
    const bUniqueLetters = new Set(b).size;

    return bUniqueLetters - aUniqueLetters;
  });

  return suggestions[0];
}

/**
 *
 * @param {string} word
 * @param {string} val
 * @returns
 */
function getAllIndexes(word, val) {
  const indexes = [];

  for (let i = 0; i < word.length; i++) {
    if (word[i] === val) {
      indexes.push(i);
    }
  }

  return indexes;
}
