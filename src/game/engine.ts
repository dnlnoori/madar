import type { CellValue, Constraint, Level } from './types';

export type Board = CellValue[][];
export interface ForcedMove { row: number; col: number; value: 0 | 1; reason: string; }

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

function relationMatches(a: number, b: number, type: Constraint['type']) {
  return type === 'same' ? a === b : a !== b;
}

function isPartialValid(board: Board, constraints: Constraint[]): boolean {
  const n = board.length;
  const half = n / 2;
  for (let r = 0; r < n; r++) {
    const row = board[r];
    if (row.filter((v) => v === 0).length > half || row.filter((v) => v === 1).length > half) return false;
    for (let c = 0; c < n - 2; c++) {
      const a = row[c], b = row[c + 1], d = row[c + 2];
      if (a !== -1 && a === b && b === d) return false;
    }
  }
  for (let c = 0; c < n; c++) {
    const col = board.map((row) => row[c]);
    if (col.filter((v) => v === 0).length > half || col.filter((v) => v === 1).length > half) return false;
    for (let r = 0; r < n - 2; r++) {
      const a = col[r], b = col[r + 1], d = col[r + 2];
      if (a !== -1 && a === b && b === d) return false;
    }
  }
  // Completed rows and columns must be unique.
  const completeRows = board.filter((row) => row.every((v) => v !== -1));
  if (new Set(completeRows.map((row) => row.join(''))).size !== completeRows.length) return false;
  const completeCols: string[] = [];
  for (let c = 0; c < n; c++) {
    const col = board.map((row) => row[c]);
    if (col.every((v) => v !== -1)) completeCols.push(col.join(''));
  }
  if (new Set(completeCols).size !== completeCols.length) return false;

  for (const constraint of constraints) {
    const [ar, ac] = constraint.a;
    const [br, bc] = constraint.b;
    const a = board[ar]?.[ac], b = board[br]?.[bc];
    if (a !== undefined && b !== undefined && a !== -1 && b !== -1 && !relationMatches(a, b, constraint.type)) return false;
  }
  return true;
}

export function countSolutions(input: Board, constraints: Constraint[], limit = 2): number {
  const board = cloneBoard(input);
  const n = board.length;
  if (!isPartialValid(board, constraints)) return 0;
  let count = 0;

  const candidatesFor = (r: number, c: number): (0 | 1)[] => {
    const values: (0 | 1)[] = [];
    for (const value of [0, 1] as const) {
      board[r][c] = value;
      if (isPartialValid(board, constraints)) values.push(value);
    }
    board[r][c] = -1;
    return values;
  };

  const solve = (): void => {
    if (count >= limit) return;
    let best: [number, number] | null = null;
    let bestValues: (0 | 1)[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (board[r][c] !== -1) continue;
        const values = candidatesFor(r, c);
        if (values.length === 0) return;
        if (!best || values.length < bestValues.length) {
          best = [r, c];
          bestValues = values;
          if (values.length === 1) break;
        }
      }
      if (bestValues.length === 1) break;
    }
    if (!best) { count++; return; }
    const [r, c] = best;
    for (const value of bestValues) {
      board[r][c] = value;
      if (isPartialValid(board, constraints)) solve();
      board[r][c] = -1;
      if (count >= limit) return;
    }
  };

  solve();
  return count;
}

export function validateBoard(board: Board, constraints: Constraint[]): string[] {
  const errors: string[] = [];
  const n = board.length;
  const half = n / 2;
  for (let r = 0; r < n; r++) {
    const row = board[r];
    const suns = row.filter((v) => v === 0).length;
    const moons = row.filter((v) => v === 1).length;
    if (suns > half || moons > half) errors.push(`تعداد نمادها در ردیف ${r + 1} از حد مجاز بیشتر است.`);
    for (let c = 0; c < n - 2; c++) if (row[c] !== -1 && row[c] === row[c + 1] && row[c + 1] === row[c + 2]) errors.push(`سه نماد یکسان در ردیف ${r + 1} کنار هم قرار گرفته‌اند.`);
  }
  for (let c = 0; c < n; c++) {
    const col = board.map((row) => row[c]);
    const suns = col.filter((v) => v === 0).length;
    const moons = col.filter((v) => v === 1).length;
    if (suns > half || moons > half) errors.push(`تعداد نمادها در ستون ${c + 1} از حد مجاز بیشتر است.`);
    for (let r = 0; r < n - 2; r++) if (col[r] !== -1 && col[r] === col[r + 1] && col[r + 1] === col[r + 2]) errors.push(`سه نماد یکسان در ستون ${c + 1} کنار هم قرار گرفته‌اند.`);
  }
  for (const constraint of constraints) {
    const [ar, ac] = constraint.a, [br, bc] = constraint.b;
    const a = board[ar][ac], b = board[br][bc];
    if (a !== -1 && b !== -1 && !relationMatches(a, b, constraint.type)) errors.push('یکی از نشانه‌های ارتباطی رعایت نشده است.');
  }
  return [...new Set(errors)];
}

export function getCellErrorKeys(board: Board, constraints: Constraint[]): Set<string> {
  const bad = new Set<string>();
  const n = board.length;
  const half = n / 2;
  for (let r = 0; r < n; r++) {
    const row = board[r];
    if (row.filter((v) => v === 0).length > half || row.filter((v) => v === 1).length > half) row.forEach((v, c) => { if (v !== -1) bad.add(`${r}-${c}`); });
    for (let c = 0; c < n - 2; c++) if (row[c] !== -1 && row[c] === row[c + 1] && row[c + 1] === row[c + 2]) { bad.add(`${r}-${c}`); bad.add(`${r}-${c + 1}`); bad.add(`${r}-${c + 2}`); }
  }
  for (let c = 0; c < n; c++) {
    const col = board.map((row) => row[c]);
    if (col.filter((v) => v === 0).length > half || col.filter((v) => v === 1).length > half) col.forEach((v, r) => { if (v !== -1) bad.add(`${r}-${c}`); });
    for (let r = 0; r < n - 2; r++) if (col[r] !== -1 && col[r] === col[r + 1] && col[r + 1] === col[r + 2]) { bad.add(`${r}-${c}`); bad.add(`${r + 1}-${c}`); bad.add(`${r + 2}-${c}`); }
  }
  for (let r1 = 0; r1 < n; r1++) for (let r2 = r1 + 1; r2 < n; r2++) {
    if (board[r1].every((v) => v !== -1) && board[r2].every((v) => v !== -1) && board[r1].join('') === board[r2].join('')) {
      board[r1].forEach((_, c) => { bad.add(`${r1}-${c}`); bad.add(`${r2}-${c}`); });
    }
  }
  for (let c1 = 0; c1 < n; c1++) for (let c2 = c1 + 1; c2 < n; c2++) {
    const a = board.map((row) => row[c1]), b = board.map((row) => row[c2]);
    if (a.every((v) => v !== -1) && b.every((v) => v !== -1) && a.join('') === b.join('')) {
      a.forEach((_, r) => { bad.add(`${r}-${c1}`); bad.add(`${r}-${c2}`); });
    }
  }
  for (const edge of constraints) {
    const [ar, ac] = edge.a, [br, bc] = edge.b;
    const a = board[ar][ac], b = board[br][bc];
    if (a !== -1 && b !== -1 && !relationMatches(a, b, edge.type)) { bad.add(`${ar}-${ac}`); bad.add(`${br}-${bc}`); }
  }
  return bad;
}

export function getForcedMove(board: Board, level: Level): ForcedMove | null {
  if (countSolutions(board, level.constraints, 1) === 0) return null;
  const n = board.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (board[r][c] !== -1) continue;
      const testSun = cloneBoard(board); testSun[r][c] = 0;
      const sunCount = countSolutions(testSun, level.constraints, 1);
      const testMoon = cloneBoard(board); testMoon[r][c] = 1;
      const moonCount = countSolutions(testMoon, level.constraints, 1);
      if (sunCount > 0 && moonCount === 0) return { row: r, col: c, value: 0, reason: explainForcedCell(board, level.constraints, r, c, 0) };
      if (moonCount > 0 && sunCount === 0) return { row: r, col: c, value: 1, reason: explainForcedCell(board, level.constraints, r, c, 1) };
    }
  }
  return null;
}

function explainForcedCell(board: Board, constraints: Constraint[], r: number, c: number, value: 0 | 1): string {
  const n = board.length, half = n / 2;
  const row = board[r], col = board.map((line) => line[c]);
  const label = value === 0 ? 'خورشید' : 'ماه';
  if (row.filter((v) => v === value).length === half) return `در ردیف ${r + 1} تعداد کافی ${label === 'خورشید' ? 'خورشید' : 'ماه'} قرار گرفته؛ پس این خانه باید ${value === 0 ? 'ماه' : 'خورشید'} باشد.`;
  if (col.filter((v) => v === value).length === half) return `در ستون ${c + 1} سهم ${label} کامل شده است؛ بنابراین این خانه باید نماد مقابل باشد.`;
  for (const edge of constraints) {
    const [ar, ac] = edge.a, [br, bc] = edge.b;
    const other = ar === r && ac === c ? board[br][bc] : br === r && bc === c ? board[ar][ac] : -1;
    if (other !== -1 && ((edge.type === 'same' && other === value) || (edge.type === 'different' && other !== value))) return `با توجه به نشانهٔ ${edge.type === 'same' ? '=' : '×'} کنار این خانه، نماد ${label} با خانهٔ مرتبط سازگار است.`;
  }
  if (c >= 2 && board[r][c - 1] !== -1 && board[r][c - 2] === board[r][c - 1] && value !== board[r][c - 1]) return 'اگر این خانه نماد دیگری بگیرد، سه نماد یکسان پشت سر هم شکل می‌گیرد.';
  if (r >= 2 && board[r - 1][c] !== -1 && board[r - 2][c] === board[r - 1][c] && value !== board[r - 1][c]) return 'با توجه به دو خانهٔ بالایی، این انتخاب از تشکیل سه نماد یکسان جلوگیری می‌کند.';
  return 'با در نظر گرفتن تعادل ردیف‌ها و ستون‌ها و یکتا بودن الگوی آن‌ها، فقط این انتخاب با تمام قوانین سازگار است.';
}

export function isBoardSolved(board: Board, level: Level): boolean {
  if (board.some((row) => row.some((v) => v === -1))) return false;
  if (!isPartialValid(board, level.constraints)) return false;
  return board.every((row, r) => row.every((v, c) => v === level.solution[r][c]));
}

export function formatPersianNumber(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}
