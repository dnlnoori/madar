export type CellValue = -1 | 0 | 1;
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';
export type ConstraintType = 'same' | 'different';

export interface Constraint {
  a: [number, number];
  b: [number, number];
  type: ConstraintType;
}

export interface Level {
  id: number;
  title: string;
  gridSize: number;
  difficulty: Difficulty;
  initialBoard: CellValue[][];
  constraints: Constraint[];
  solution: (0 | 1)[][];
  hints: string[];
  isPublished: boolean;
}

export interface LevelResult {
  stars: number;
  time: number;
  hints: number;
  mistakes: number;
  completedAt: string;
}

export interface PlayerProgress {
  completed: Record<number, LevelResult>;
  unlockedLevel: number;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
  totalTime: number;
  gamesPlayed: number;
  totalHints: number;
  totalMistakes: number;
  activeDays: string[];
}

export const EMPTY_PROGRESS: PlayerProgress = {
  completed: {},
  unlockedLevel: 1,
  xp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastPlayedDate: null,
  totalTime: 0,
  gamesPlayed: 0,
  totalHints: 0,
  totalMistakes: 0,
  activeDays: [],
};
