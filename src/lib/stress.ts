import { stressEntrySeeds } from "../data/stressWords";

const VOWELS = new Set(["а", "е", "ё", "и", "о", "у", "ы", "э", "ю", "я"]);
const STORAGE_KEY = "stress-flashcards:v1";

export type StressWord = {
  id: string;
  letter: string;
  answer: string;
  plain: string;
  note?: string;
  stressLetterIndex: number;
};

export type WordStat = {
  attempts: number;
  correct: number;
  wrong: number;
  streak: number;
  lastAnsweredAt?: number;
  lastCorrect?: boolean;
};

export type StatsByWord = Record<string, WordStat>;

const isVowel = (char: string) => VOWELS.has(char.toLocaleLowerCase("ru-RU"));

const normalizeAnswer = (word: string) => word.toLocaleLowerCase("ru-RU");

const buildId = (letter: string, word: string, note?: string) => {
  const suffix = note ? `-${note.toLocaleLowerCase("ru-RU").replace(/[^а-яёa-z0-9]+/gi, "-")}` : "";
  return `${letter.toLocaleLowerCase("ru-RU")}-${normalizeAnswer(word)}${suffix}`;
};

const resolveStressIndex = (word: string) => {
  const chars = Array.from(word);
  const markedIndex = chars.findIndex((char) => char !== char.toLocaleLowerCase("ru-RU") && isVowel(char));

  if (markedIndex !== -1) {
    return markedIndex;
  }

  const vowelIndexes = chars.reduce<number[]>((indexes, char, index) => {
    if (isVowel(char)) indexes.push(index);
    return indexes;
  }, []);

  if (vowelIndexes.length === 1) {
    return vowelIndexes[0];
  }

  throw new Error(`Stress is not marked: ${word}`);
};

export const stressWords: StressWord[] = stressEntrySeeds
  .map((entry) => ({
    id: buildId(entry.letter, entry.word, entry.note),
    letter: entry.letter,
    answer: entry.word,
    plain: normalizeAnswer(entry.word),
    note: entry.note,
    stressLetterIndex: resolveStressIndex(entry.word),
  }))
  .filter((word, index, words) => words.findIndex((candidate) => candidate.id === word.id) === index);

export const getWordStat = (stats: StatsByWord, wordId: string): WordStat => {
  return stats[wordId] ?? { attempts: 0, correct: 0, wrong: 0, streak: 0 };
};

export const accuracy = (stat: WordStat) => {
  if (stat.attempts === 0) return null;
  return Math.round((stat.correct / stat.attempts) * 100);
};

export const loadStats = (): StatsByWord => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StatsByWord;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const saveStats = (stats: StatsByWord) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
};

export const recordAnswer = (stats: StatsByWord, wordId: string, isCorrect: boolean): StatsByWord => {
  const current = getWordStat(stats, wordId);
  return {
    ...stats,
    [wordId]: {
      attempts: current.attempts + 1,
      correct: current.correct + (isCorrect ? 1 : 0),
      wrong: current.wrong + (isCorrect ? 0 : 1),
      streak: isCorrect ? Math.max(0, current.streak) + 1 : Math.min(0, current.streak) - 1,
      lastAnsweredAt: Date.now(),
      lastCorrect: isCorrect,
    },
  };
};

const wordWeight = (word: StressWord, stats: StatsByWord, recentIds: string[]) => {
  const stat = getWordStat(stats, word.id);
  const wrongRate = stat.attempts === 0 ? 0 : stat.wrong / stat.attempts;
  const unseenBoost = stat.attempts === 0 ? 3.5 : 0;
  const mistakeBoost = stat.wrong * 2.4 + wrongRate * 6;
  const streakPenalty = Math.min(Math.max(stat.streak, 0) * 0.65, 4);
  const recentPenalty = recentIds.includes(word.id) ? 0.18 : 1;
  const lastWrongBoost = stat.lastCorrect === false ? 3 : 0;

  return Math.max(0.35, 1 + unseenBoost + mistakeBoost + lastWrongBoost - streakPenalty) * recentPenalty;
};

export const pickNextWord = (words: StressWord[], stats: StatsByWord, recentIds: string[]) => {
  const weighted = words.map((word) => ({ word, weight: wordWeight(word, stats, recentIds) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;

  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.word;
  }

  return weighted[weighted.length - 1].word;
};

export const getTopMistakes = (stats: StatsByWord, limit = 6) => {
  return stressWords
    .map((word) => ({ word, stat: getWordStat(stats, word.id) }))
    .filter(({ stat }) => stat.wrong > 0)
    .sort((a, b) => {
      const aRate = a.stat.wrong / a.stat.attempts;
      const bRate = b.stat.wrong / b.stat.attempts;
      return b.stat.wrong * 10 + bRate - (a.stat.wrong * 10 + aRate);
    })
    .slice(0, limit);
};

export const getLetterChoices = (word: StressWord) => {
  return Array.from(word.plain).map((char, index) => ({
    char,
    index,
    isVowel: isVowel(char),
  }));
};
