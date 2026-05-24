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
  averageResponseMs?: number;
};

export type StatsByWord = Record<string, WordStat>;

export type TrainingMode = "smart" | "mistakes" | "new" | "exam";

export type MemoryProfile = {
  mastery: number;
  priority: number;
  dueAt?: number;
  intervalMs: number;
  reason: string;
  bucket: "new" | "urgent" | "weak" | "learning" | "mastered";
};

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

export const recordAnswer = (stats: StatsByWord, wordId: string, isCorrect: boolean, responseMs?: number): StatsByWord => {
  const current = getWordStat(stats, wordId);
  const averageResponseMs =
    responseMs === undefined
      ? current.averageResponseMs
      : Math.round(current.averageResponseMs === undefined ? responseMs : current.averageResponseMs * 0.72 + responseMs * 0.28);

  return {
    ...stats,
    [wordId]: {
      attempts: current.attempts + 1,
      correct: current.correct + (isCorrect ? 1 : 0),
      wrong: current.wrong + (isCorrect ? 0 : 1),
      streak: isCorrect ? Math.max(0, current.streak) + 1 : Math.min(0, current.streak) - 1,
      lastAnsweredAt: Date.now(),
      lastCorrect: isCorrect,
      averageResponseMs,
    },
  };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const streakIntervals = [0, 6 * MINUTE, 28 * MINUTE, 3 * HOUR, 14 * HOUR, 2 * DAY, 5 * DAY, 12 * DAY, 24 * DAY];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getReviewInterval = (stat: WordStat) => {
  if (stat.attempts === 0) return 0;
  if (stat.lastCorrect === false || stat.streak <= 0) return 90_000;

  const wrongRate = stat.wrong / stat.attempts;
  const base = streakIntervals[Math.min(stat.streak, streakIntervals.length - 1)] ?? 45 * DAY;
  const penalty = clamp(1 - wrongRate * 0.62, 0.28, 1);

  return Math.round(base * penalty);
};

export const getMemoryProfile = (word: StressWord, stats: StatsByWord, recentIds: string[] = [], mode: TrainingMode = "smart", now = Date.now()): MemoryProfile => {
  const stat = getWordStat(stats, word.id);
  const wrongRate = stat.attempts === 0 ? 0 : stat.wrong / stat.attempts;
  const intervalMs = getReviewInterval(stat);
  const dueAt = stat.lastAnsweredAt === undefined ? undefined : stat.lastAnsweredAt + intervalMs;
  const overdueRatio = dueAt === undefined ? 0 : clamp((now - dueAt) / Math.max(intervalMs, MINUTE), -1, 3);
  const duePressure = dueAt === undefined ? 0 : dueAt <= now ? 20 + overdueRatio * 28 : Math.max(0, 12 * (1 + overdueRatio));
  const speedPenalty = stat.averageResponseMs === undefined ? 0 : clamp((stat.averageResponseMs - 2_800) / 140, 0, 26);
  const errorPressure = stat.wrong * 11 + wrongRate * 34 + (stat.lastCorrect === false ? 28 : 0);
  const newPressure = stat.attempts === 0 ? 56 : Math.max(0, 18 - stat.attempts * 8);
  const recencyPenalty = recentIds.includes(word.id) ? 0.22 : 1;
  const mastery = clamp(Math.round(stat.correct * 15 + Math.max(stat.streak, 0) * 12 - stat.wrong * 20 - wrongRate * 34 - speedPenalty), 0, 100);
  const weaknessPressure = clamp(80 - mastery, 0, 80);

  const modePressure = {
    smart: newPressure + duePressure + errorPressure + weaknessPressure * 0.48,
    mistakes: errorPressure * 1.75 + weaknessPressure * 0.9 + duePressure,
    new: newPressure * 2.2 + (stat.attempts === 0 ? 34 : 0) + duePressure * 0.25,
    exam: duePressure + weaknessPressure * 0.7 + errorPressure * 0.82 + Math.random() * 22,
  }[mode];

  const priority = clamp((8 + modePressure + speedPenalty) * recencyPenalty, 0.35, 220);
  const bucket =
    stat.attempts === 0
      ? "new"
      : dueAt !== undefined && dueAt <= now
        ? "urgent"
        : mastery < 45 || stat.lastCorrect === false
          ? "weak"
          : mastery >= 82
            ? "mastered"
            : "learning";

  const reason =
    bucket === "new"
      ? "новое слово"
      : bucket === "urgent"
        ? "пора повторить"
        : bucket === "weak"
          ? "слабое место"
          : bucket === "mastered"
            ? "закрепление"
            : "на этапе запоминания";

  return { mastery, priority, dueAt, intervalMs, reason, bucket };
};

export const pickNextWord = (words: StressWord[], stats: StatsByWord, recentIds: string[], mode: TrainingMode = "smart") => {
  const weighted = words.map((word) => ({ word, weight: getMemoryProfile(word, stats, recentIds, mode).priority }));
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

export const getPriorityQueue = (stats: StatsByWord, mode: TrainingMode = "smart", limit = 12) => {
  return stressWords
    .map((word) => ({ word, stat: getWordStat(stats, word.id), profile: getMemoryProfile(word, stats, [], mode) }))
    .sort((a, b) => b.profile.priority - a.profile.priority)
    .slice(0, limit);
};

export const getLearningSummary = (stats: StatsByWord) => {
  return stressWords.reduce(
    (summary, word) => {
      const profile = getMemoryProfile(word, stats);
      summary[profile.bucket] += 1;
      return summary;
    },
    { new: 0, urgent: 0, weak: 0, learning: 0, mastered: 0 },
  );
};

export const getLetterChoices = (word: StressWord) => {
  return Array.from(word.plain).map((char, index) => ({
    char,
    index,
    isVowel: isVowel(char),
  }));
};
