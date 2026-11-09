import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Award, BarChart3, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Clock3, Crown, Flame, Grid3X3,
  Lightbulb, Lock, Moon, Pause, Play, RotateCcw, Settings,
  ShieldCheck, Sparkles, Star, Sun, Trophy, Undo2, Redo2, Volume2, VolumeX,
  WandSparkles, X, Zap, Download, Upload, FileJson, Plus, Home as HomeIcon,
  CalendarDays, Target, BookOpen, Orbit, Info, RefreshCw
} from 'lucide-react';
import levelsData from './data/levels.json';
import type { Board } from './game/engine';
import { cloneBoard, countSolutions, formatPersianNumber, getForcedMove, isBoardSolved } from './game/engine';
import type { CellValue, Difficulty, Level, LevelResult, PlayerProgress } from './game/types';
import { EMPTY_PROGRESS } from './game/types';

type Screen = 'home' | 'map' | 'game' | 'stats' | 'admin' | 'settings';
interface SavedSession { levelId: number; board: Board; elapsed: number; hints: number; }

const baseLevels = levelsData as unknown as Level[];
const chapterMeta = [
  { name: 'طلوع', range: '۱ تا ۱۰', start: 1, end: 10, tone: 'gold', description: 'آشنایی با زبان خورشید و ماه' },
  { name: 'سپیده‌دم', range: '۱۱ تا ۲۵', start: 11, end: 25, tone: 'violet', description: 'قدم‌های اول در منطق مدار' },
  { name: 'مدار روشن', range: '۲۶ تا ۴۵', start: 26, end: 45, tone: 'blue', description: 'پیوندها و الگوهای تازه' },
  { name: 'کسوف', range: '۴۶ تا ۶۵', start: 46, end: 65, tone: 'rose', description: 'چالش‌هایی با چند لایه استدلال' },
  { name: 'نیمه تاریک', range: '۶۶ تا ۸۰', start: 66, end: 80, tone: 'purple', description: 'برای ذهن‌های دقیق و صبور' },
  { name: 'فراتر از مدار', range: '۸۱ تا ۱۰۰', start: 81, end: 100, tone: 'cyan', description: 'اوج چالش؛ تسلط کامل بر مدار' },
];

const difficultyLabel: Record<Difficulty, string> = {
  easy: 'آسان', medium: 'متوسط', hard: 'سخت', expert: 'پیشرفته', master: 'استاد',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (fallback === null || Array.isArray(fallback)) return parsed;
    return { ...fallback as object, ...parsed as object } as T;
  } catch { return fallback; }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function previousDay(key: string) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${formatPersianNumber(m).padStart(2, '۰')}:${formatPersianNumber(s).padStart(2, '۰')}`;
}

// Stars are based only on a measurable, player-controlled action: using hints.
// Completion always grants one star; zero hints grants three, one hint grants two.
function starsFor(hints: number) {
  if (hints === 0) return 3;
  if (hints === 1) return 2;
  return 1;
}

function readProgress(): PlayerProgress {
  const stored = readStorage<PlayerProgress>('madar-progress-v1', EMPTY_PROGRESS) as PlayerProgress & { totalMistakes?: number };
  const { totalMistakes: _legacyTotalMistakes, ...cleanProgress } = stored;
  // Migrate older saves to the transparent hint-only star rules and drop obsolete mistake counters.
  const completed = Object.fromEntries(
    Object.entries(cleanProgress.completed ?? {}).map(([id, result]) => {
      const { mistakes: _legacyMistakes, ...cleanResult } = result as LevelResult & { mistakes?: number };
      return [id, {
        ...cleanResult,
        stars: Math.max(result.stars ?? 0, starsFor(result.hints ?? 0)),
      }];
    }),
  );
  return { ...cleanProgress, completed };
}

function createEmptyBoard(size: number): Board {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => -1 as CellValue));
}

function Stars({ count, small = false }: { count: number; small?: boolean }) {
  return <span className={`stars-earned ${small ? 'small' : ''}`}>{[1, 2, 3].map((n) => <Star key={n} size={small ? 11 : 15} fill={n <= count ? 'currentColor' : 'none'} className={n <= count ? 'earned' : 'empty'} />)}</span>;
}

function SymbolIcon({ value, size = 24 }: { value: number; size?: number }) {
  return value === 0 ? <Sun size={size} strokeWidth={2.2} className="sun-symbol" /> : <Moon size={size} strokeWidth={2.2} className="moon-symbol" />;
}

function App() {
  const [progress, setProgress] = useState<PlayerProgress>(() => readProgress());
  const [customLevels, setCustomLevels] = useState<Level[]>(() => readStorage('madar-custom-levels-v1', [] as Level[]));
  const [savedSession, setSavedSession] = useState<SavedSession | null>(() => readStorage<SavedSession | null>('madar-session-v1', null));
  const [screen, setScreen] = useState<Screen>('home');
  const [activeLevelId, setActiveLevelId] = useState(savedSession?.levelId ?? 1);
  const [board, setBoard] = useState<Board>(() => savedSession?.board ? cloneBoard(savedSession.board) : cloneBoard(baseLevels[0].initialBoard));
  const [elapsed, setElapsed] = useState(savedSession?.elapsed ?? 0);
  const [hintCount, setHintCount] = useState(savedSession?.hints ?? 0);
  const [undoStack, setUndoStack] = useState<Board[]>([]);
  const [redoStack, setRedoStack] = useState<Board[]>([]);
  const [hintMove, setHintMove] = useState<ReturnType<typeof getForcedMove>>(null);
  const [hintStage, setHintStage] = useState(0);
  const [toast, setToast] = useState('');
  const [showWin, setShowWin] = useState(false);
  const [introOpen, setIntroOpen] = useState(() => !localStorage.getItem('madar-intro-seen'));
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialBoard, setTutorialBoard] = useState<Board>(() => [[-1, 0, -1, 1], [1, -1, 0, -1], [-1, 1, -1, 0], [0, -1, 1, -1]]);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('madar-sound') !== 'false');
  const [musicOn, setMusicOn] = useState(() => localStorage.getItem('madar-music') === 'true');
  const [hapticsOn, setHapticsOn] = useState(() => localStorage.getItem('madar-haptics') !== 'false');
  const [jsonInput, setJsonInput] = useState('');
  const [adminFeedback, setAdminFeedback] = useState('');
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const winProcessed = useRef(false);
  const currentLevel = useMemo(() => [...baseLevels, ...customLevels].find((level) => level.id === activeLevelId) ?? baseLevels[0], [customLevels, activeLevelId]);
  const allLevels = useMemo(() => [...baseLevels, ...customLevels].sort((a, b) => a.id - b.id), [customLevels]);
  const completedCount = Object.keys(progress.completed).length;
  const totalStars = Object.values(progress.completed).reduce((sum, item) => sum + item.stars, 0);
  const activeStreak = progress.lastPlayedDate === todayKey() || progress.lastPlayedDate === previousDay(todayKey()) ? progress.currentStreak : 0;
  const streakDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - i));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { key, label: date.toLocaleDateString('fa-IR', { weekday: 'short' }), active: (progress.activeDays ?? []).includes(key) };
  }), [progress.activeDays]);
  const filledCount = board.flat().filter((v) => v !== -1).length;
  const totalCells = currentLevel.gridSize * currentLevel.gridSize;

  useEffect(() => { localStorage.setItem('madar-progress-v1', JSON.stringify(progress)); }, [progress]);
  useEffect(() => { localStorage.setItem('madar-custom-levels-v1', JSON.stringify(customLevels)); }, [customLevels]);
  useEffect(() => {
    if (screen === 'game' && !showWin) {
      const session = { levelId: activeLevelId, board, elapsed, hints: hintCount };
      setSavedSession(session); localStorage.setItem('madar-session-v1', JSON.stringify(session));
    } else if (showWin) {
      setSavedSession(null); localStorage.removeItem('madar-session-v1');
    }
  }, [screen, activeLevelId, board, elapsed, hintCount, showWin]);
  useEffect(() => { localStorage.setItem('madar-sound', String(soundOn)); }, [soundOn]);
  useEffect(() => { localStorage.setItem('madar-music', String(musicOn)); }, [musicOn]);
  useEffect(() => { localStorage.setItem('madar-haptics', String(hapticsOn)); }, [hapticsOn]);
  useEffect(() => {
    if (!musicOn) return;
    let context: AudioContext | null = null;
    const oscillators: OscillatorNode[] = [];
    try {
      context = new AudioContext();
      const master = context.createGain(); master.gain.value = 0.035; master.connect(context.destination);
      [110, 164.81, 220].forEach((frequency, index) => {
        const oscillator = context!.createOscillator(); const gain = context!.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency; gain.gain.value = index === 0 ? 0.16 : 0.055;
        oscillator.connect(gain); gain.connect(master); oscillator.start(); oscillators.push(oscillator);
      });
      void context.resume().catch(() => undefined);
    } catch { /* Ambient audio is optional. */ }
    return () => { oscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* Already stopped. */ } }); if (context) void context.close(); };
  }, [musicOn]);
  useEffect(() => {
    if (screen !== 'game' || showWin) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen, showWin, activeLevelId]);
  useEffect(() => {
    if (screen === 'game' && isBoardSolved(board, currentLevel) && !winProcessed.current) {
      winProcessed.current = true;
      const stars = starsFor(hintCount);
      const today = todayKey();
      setProgress((prev) => {
        const old = prev.completed[currentLevel.id];
        const improved = !old || stars > old.stars || (stars === old.stars && elapsed < old.time);
        const last = prev.lastPlayedDate;
        const streak = last === today ? prev.currentStreak : last === previousDay(today) ? prev.currentStreak + 1 : 1;
        const result: LevelResult = { stars: Math.max(stars, old?.stars ?? 0), time: old && old.time < elapsed ? old.time : elapsed, hints: hintCount, completedAt: today };
        return {
          ...prev,
          completed: { ...prev.completed, [currentLevel.id]: result },
          unlockedLevel: Math.max(prev.unlockedLevel, currentLevel.id + 1),
          xp: prev.xp + (improved ? 50 + stars * 20 : 10),
          currentStreak: streak,
          longestStreak: Math.max(prev.longestStreak, streak),
          lastPlayedDate: today,
          totalTime: prev.totalTime + elapsed,
          gamesPlayed: prev.gamesPlayed + 1,
          totalHints: prev.totalHints + hintCount,
          activeDays: [...new Set([...(prev.activeDays ?? []), today])].slice(-90),
        };
      });
      setShowWin(true);
      if (hapticsOn && 'vibrate' in navigator) navigator.vibrate([18, 45, 18]);
      if (soundOn) playTone(740, 0.16);
    }
  }, [board, currentLevel, elapsed, hintCount, screen, soundOn, hapticsOn]);

  const startLevel = useCallback((id: number) => {
    const level = [...baseLevels, ...customLevels].find((item) => item.id === id);
    if (!level) return;
    setActiveLevelId(id);
    setBoard(cloneBoard(level.initialBoard));
    setSavedSession({ levelId: id, board: cloneBoard(level.initialBoard), elapsed: 0, hints: 0 });
    setElapsed(0);
    setHintCount(0);
    setUndoStack([]);
    setRedoStack([]);
    setHintMove(null);
    setHintStage(0);
    setShowWin(false);
    winProcessed.current = false;
    setScreen('game');
  }, [customLevels]);

  const resumeSession = () => {
    if (savedSession && [...baseLevels, ...customLevels].some((level) => level.id === savedSession.levelId)) {
      setActiveLevelId(savedSession.levelId); setBoard(cloneBoard(savedSession.board)); setElapsed(savedSession.elapsed); setHintCount(savedSession.hints);
      setUndoStack([]); setRedoStack([]); setShowWin(false); winProcessed.current = false; setScreen('game');
    } else startLevel(Math.min(progress.unlockedLevel, allLevels.length));
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  };

  const updateCell = (r: number, c: number) => {
    if (currentLevel.initialBoard[r][c] !== -1 || showWin) return;
    const nextValue = board[r][c] === -1 ? 0 : board[r][c] === 0 ? 1 : -1;
    const next = cloneBoard(board);
    next[r][c] = nextValue;
    setUndoStack((prev) => [...prev.slice(-80), cloneBoard(board)]);
    setRedoStack([]);
    setBoard(next);
    if (hintMove) { setHintMove(null); setHintStage(0); }
    if (hapticsOn && 'vibrate' in navigator) navigator.vibrate(8);
    // No per-cell correctness feedback: choosing a temporary symbol is part of solving.
    if (soundOn && nextValue !== -1) playTone(nextValue === 0 ? 540 : 430, 0.07);
  };

  const undo = () => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, cloneBoard(board)]);
    setUndoStack((prev) => prev.slice(0, -1));
    setBoard(cloneBoard(previous));
    setHintMove(null); setHintStage(0);
  };
  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, cloneBoard(board)]);
    setRedoStack((prev) => prev.slice(0, -1));
    setBoard(cloneBoard(next));
    setHintMove(null); setHintStage(0);
  };
  const resetLevel = () => {
    setBoard(cloneBoard(currentLevel.initialBoard));
    setUndoStack([]); setRedoStack([]); setHintCount(0); setElapsed(0); setShowWin(false); winProcessed.current = false;
    setHintMove(null); setHintStage(0);
  };

  const openHint = () => {
    const move = getForcedMove(board, currentLevel);
    if (!move) { setHintMove(null); setHintStage(0); showToast('از وضعیت فعلی جدول سرنخ قطعی پیدا نشد؛ یکی از انتخاب‌هایت را دوباره بررسی کن.'); return; }
    setHintMove(move);
    setHintStage(0);
  };
  const applyHint = () => {
    if (!hintMove) return;
    const next = cloneBoard(board);
    next[hintMove.row][hintMove.col] = hintMove.value;
    setUndoStack((prev) => [...prev, cloneBoard(board)]);
    setRedoStack([]);
    setBoard(next);
    setHintMove(null); setHintStage(0);
    showToast('یک خانه با کمک راهنما کامل شد.');
  };

  const completeIntro = () => {
    localStorage.setItem('madar-intro-seen', 'true');
    setIntroOpen(false);
    if (!localStorage.getItem('madar-tutorial-seen')) { setTutorialOpen(true); setTutorialStep(0); }
  };
  const finishTutorial = () => {
    localStorage.setItem('madar-tutorial-seen', 'true');
    setTutorialOpen(false);
    setScreen('home');
  };

  const importLevels = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const incoming: Level[] = Array.isArray(parsed) ? parsed : [parsed];
      if (!incoming.length) throw new Error('فایلی برای افزودن پیدا نشد.');
      const valid: Level[] = [];
      let nextNewId = Math.max(100, ...allLevels.map((item) => item.id)) + 1;
      for (const raw of incoming) {
        const level = raw as Level;
        if (!level.gridSize || level.gridSize < 4 || level.gridSize % 2 !== 0 || !Array.isArray(level.initialBoard) || !Array.isArray(level.solution) || !Array.isArray(level.constraints)) throw new Error('ساختار مرحله کامل نیست؛ اندازه جدول باید عددی زوج و حداقل ۴ باشد.');
        if (level.initialBoard.length !== level.gridSize || level.solution.length !== level.gridSize || !level.initialBoard.every((row) => Array.isArray(row) && row.length === level.gridSize) || !level.solution.every((row) => Array.isArray(row) && row.length === level.gridSize)) throw new Error('اندازه جدول با داده‌ها هماهنگ نیست.');
        if (!level.initialBoard.every((row) => row.every((v) => v === -1 || v === 0 || v === 1)) || !level.solution.every((row) => row.every((v) => v === 0 || v === 1))) throw new Error('مقدار خانه‌ها باید فقط ۱-، ۰ یا ۱ باشد.');
        for (const edge of level.constraints) {
          if (!Array.isArray(edge.a) || !Array.isArray(edge.b) || edge.a.length !== 2 || edge.b.length !== 2 || !['same', 'different'].includes(edge.type)) throw new Error('ساختار یکی از نشانه‌های ارتباطی معتبر نیست.');
          const [ar, ac] = edge.a, [br, bc] = edge.b;
          if (![ar, ac, br, bc].every(Number.isInteger) || ar < 0 || ac < 0 || br < 0 || bc < 0 || ar >= level.gridSize || br >= level.gridSize || ac >= level.gridSize || bc >= level.gridSize || Math.abs(ar - br) + Math.abs(ac - bc) !== 1) throw new Error('نشانه‌های ارتباطی باید بین دو خانه مجاور باشند.');
        }
        if (countSolutions(level.initialBoard, level.constraints, 2) !== 1) throw new Error(`مرحله ${level.id ?? ''} باید دقیقاً یک پاسخ داشته باشد.`);
        if (!level.solution.every((row) => Array.isArray(row) && row.length === level.gridSize) || !isBoardSolved(level.solution as Board, level) || !level.initialBoard.every((row, r) => row.every((v, c) => v === -1 || v === level.solution[r][c]))) throw new Error(`پاسخ ثبت‌شدهٔ مرحله ${level.id ?? ''} با قوانین یا جدول اولیه سازگار نیست.`);
        const requestedId = Number(level.id);
        const existingCustom = customLevels.some((item) => item.id === requestedId) || valid.some((item) => item.id === requestedId && customLevels.some((old) => old.id === requestedId));
        const id = existingCustom ? requestedId : nextNewId++;
        valid.push({ ...level, id, isPublished: true, hints: level.hints ?? [] });
      }
      setCustomLevels((prev) => [...prev.filter((item) => !valid.some((v) => v.id === item.id)), ...valid].sort((a, b) => a.id - b.id));
      setAdminFeedback(`${formatPersianNumber(valid.length)} مرحله با موفقیت اعتبارسنجی و اضافه شد.`);
      setJsonInput('');
    } catch (error) {
      setAdminFeedback(error instanceof Error ? error.message : 'ساختار JSON معتبر نیست.');
    }
  };
  const exportLevels = () => {
    const blob = new Blob([JSON.stringify([...baseLevels, ...customLevels], null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'madar-levels.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  const downloadProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'madar-progress.json'; anchor.click(); URL.revokeObjectURL(url);
  };
  const resetProgress = () => {
    if (!window.confirm('تمام پیشرفت، ستاره‌ها و رکوردها پاک شوند؟ این کار قابل بازگشت نیست.')) return;
    setProgress(EMPTY_PROGRESS); setSavedSession(null); localStorage.removeItem('madar-session-v1'); setScreen('home'); showToast('پیشرفت بازی پاک شد.');
  };

  const navTo = (target: Screen) => { setScreen(target); setShowWin(false); setHintMove(null); setHintStage(0); };
  const continueLevel = savedSession?.levelId ?? Math.min(progress.unlockedLevel, allLevels.length);
  const levelResult = progress.completed[currentLevel.id];

  return (
    <div className="app-shell" dir="rtl">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <div className="star-field" aria-hidden="true">{Array.from({ length: 38 }, (_, i) => <i key={i} style={{ left: `${(i * 37 + 11) % 100}%`, top: `${(i * 53 + 7) % 100}%`, animationDelay: `${(i % 9) * -0.7}s`, opacity: 0.25 + (i % 5) * 0.12 }} />)}</div>

      <header className="topbar">
        <button className="brand" onClick={() => navTo('home')} aria-label="صفحه اصلی">
          <span className="brand-mark"><Orbit size={23} /><span /></span>
          <span className="brand-copy"><b>مدار</b><small>M A D A R</small></span>
        </button>
        <nav className="desktop-nav">
          <button className={screen === 'home' ? 'active' : ''} onClick={() => navTo('home')}><HomeIcon size={16} /> خانه</button>
          <button className={screen === 'map' ? 'active' : ''} onClick={() => navTo('map')}><Grid3X3 size={16} /> مراحل</button>
          <button className={screen === 'stats' ? 'active' : ''} onClick={() => navTo('stats')}><BarChart3 size={16} /> آمار من</button>
        </nav>
        <div className="top-actions">
          <div className="streak-chip"><Flame size={16} fill="#ffad5c" /> <b>{formatPersianNumber(activeStreak)}</b><span>روز</span></div>
          <button className="icon-button" onClick={() => navTo('settings')} aria-label="تنظیمات"><Settings size={18} /></button>
        </div>
      </header>

      <main className="main-content">
        <AnimatePresence mode="wait">
          {screen === 'home' && <motion.div key="home" className="screen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>
            <section className="hero-card">
              <div className="hero-orbit orbit-a" /><div className="hero-orbit orbit-b" />
              <div className="hero-copy">
                <div className="eyebrow"><Sparkles size={14} /> سفری در جهان منطق</div>
                <h1>هر خانه یک راز،<br /><em>هر حرکت یک کشف</em></h1>
                <p>خورشیدها و ماه‌ها را در مدار درستشان قرار بده.<br />آرام فکر کن، دقیق انتخاب کن و مدار را کامل کن.</p>
                <button className="primary-button hero-cta" onClick={resumeSession}><Play size={17} fill="currentColor" /> {savedSession ? 'ادامه بازی' : completedCount ? 'ادامه مسیر' : 'شروع ماجراجویی'} <ArrowLeft size={17} /></button>
                <div className="hero-progress"><span>پیشرفت سفر</span><b>{formatPersianNumber(completedCount)} از {formatPersianNumber(100)}</b><div className="progress-track"><i style={{ width: `${Math.min(100, completedCount)}%` }} /></div></div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="planet-glow" /><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
                <div className="hero-sun"><Sun size={74} strokeWidth={1.25} /></div>
                <div className="hero-moon"><Moon size={48} strokeWidth={1.3} /></div>
                <span className="tiny-star star-a">✦</span><span className="tiny-star star-b">✧</span><span className="tiny-star star-c">✦</span>
              </div>
            </section>

            <section className="quick-stats">
              <div className="quick-stat"><span className="stat-icon gold"><Trophy size={18} /></span><div><small>ستاره‌های من</small><b>{formatPersianNumber(totalStars)}</b></div></div>
              <div className="quick-stat"><span className="stat-icon violet"><Flame size={18} /></span><div><small>استریک فعلی</small><b>{formatPersianNumber(activeStreak)} روز</b></div></div>
              <div className="quick-stat"><span className="stat-icon blue"><Clock3 size={18} /></span><div><small>زمان بازی</small><b>{formatPersianNumber(Math.floor(progress.totalTime / 60))} دقیقه</b></div></div>
              <div className="quick-stat"><span className="stat-icon rose"><Zap size={18} /></span><div><small>امتیاز تجربه</small><b>{formatPersianNumber(progress.xp)} XP</b></div></div>
            </section>

            <section className="home-lower">
              <div className="section-card continue-card">
                <div className="card-heading"><div><span className="eyebrow muted">نقطه بعدی سفر</span><h2>آماده‌ای ادامه بدی؟</h2></div><span className="chapter-orb"><Sun size={22} /></span></div>
                <div className="continue-level"><div className="level-number">{formatPersianNumber(continueLevel)}</div><div className="level-copy"><b>مرحله {formatPersianNumber(continueLevel)}</b><span>{allLevels.find((l) => l.id === continueLevel)?.title ?? 'فراتر از مدار'} · {difficultyLabel[allLevels.find((l) => l.id === continueLevel)?.difficulty ?? 'easy']}</span></div><button className="round-arrow" onClick={resumeSession}><ArrowLeft size={18} /></button></div>
                <div className="mini-progress"><div className="progress-track"><i style={{ width: `${Math.min(100, completedCount)}%` }} /></div><small>{completedCount ? `${formatPersianNumber(completedCount)} مرحله را پشت سر گذاشتی` : 'اولین مرحله منتظر توست'}</small></div>
              </div>
              <div className="section-card daily-card">
                <div className="daily-top"><span className="daily-icon"><CalendarDays size={20} /></span><span className="daily-tag">چالش روزانه</span></div>
                <h2>یک حرکت تا روشنایی</h2><p>هر روز یک مرحله را کامل کن و زنجیرهٔ درخششت را زنده نگه دار.</p>
                <div className="daily-bottom"><span><Flame size={15} /> {formatPersianNumber(activeStreak)} روز پیاپی</span><button onClick={resumeSession}>بزن بریم <ArrowLeft size={15} /></button></div>
              </div>
            </section>

            <section className="section-heading"><div><span className="eyebrow muted">جهان مدار</span><h2>شش فصل، صد چالش</h2></div><button className="text-link" onClick={() => navTo('map')}>دیدن همه مراحل <ArrowLeft size={16} /></button></section>
            <div className="chapter-preview">{chapterMeta.slice(0, 3).map((chapter) => <button key={chapter.start} className={`chapter-tile ${chapter.tone}`} onClick={() => navTo('map')}><span className="chapter-symbol">{chapter.start === 1 ? <Sun /> : chapter.start === 11 ? <Moon /> : <Orbit />}</span><span><b>{chapter.name}</b><small>{chapter.range} مرحله</small></span><ChevronLeft size={17} /></button>)}</div>
          </motion.div>}

          {screen === 'map' && <motion.div key="map" className="screen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="page-heading"><div><span className="eyebrow muted">نقشه سفر</span><h1>مسیر مدار</h1><p>هر مرحله را کامل کن تا راه مرحله بعد روشن شود.</p></div><div className="map-total"><b>{formatPersianNumber(completedCount)}<small>/{formatPersianNumber(allLevels.length)}</small></b><span>تکمیل شده</span></div></div>
            <div className="map-overview"><div className="map-overview-icon"><Trophy size={21} /></div><div><b>{formatPersianNumber(totalStars)} ستاره جمع کردی</b><span>هر مرحله را دوباره بازی کن تا رکوردت را بهتر کنی.</span></div><div className="map-progress-track"><i style={{ width: `${Math.min(100, completedCount)}%` }} /></div></div>
            <div className="chapters-list">{chapterMeta.map((chapter, index) => <section className={`chapter-section ${chapter.tone}`} key={chapter.start}>
              <div className="chapter-header"><div className="chapter-icon-large">{index === 0 ? <Sun /> : index === 1 ? <Moon /> : index === 2 ? <Orbit /> : index === 3 ? <Sparkles /> : index === 4 ? <Moon /> : <Crown />}</div><div><span>فصل {formatPersianNumber(index + 1)} · مراحل {chapter.range}</span><h2>{chapter.name}</h2><p>{chapter.description}</p></div><div className="chapter-completion">{formatPersianNumber(Array.from({ length: chapter.end - chapter.start + 1 }, (_, i) => chapter.start + i).filter((id) => !!progress.completed[id]).length)}<small> / {formatPersianNumber(chapter.end - chapter.start + 1)}</small></div></div>
              <div className="level-nodes">{allLevels.filter((level) => level.id >= chapter.start && level.id <= chapter.end).map((level) => {
                const result = progress.completed[level.id]; const locked = level.id > progress.unlockedLevel;
                return <button key={level.id} disabled={locked} onClick={() => startLevel(level.id)} className={`level-node ${result ? 'done' : ''} ${locked ? 'locked' : ''} ${level.id === progress.unlockedLevel ? 'current' : ''}`} title={locked ? 'ابتدا مرحله قبلی را کامل کن' : `مرحله ${level.id}`}>
                  {locked ? <Lock size={15} /> : result ? <Check size={17} /> : <span>{formatPersianNumber(level.id)}</span>}
                  {result && <span className="node-stars"><Stars count={result.stars} small /></span>}
                </button>;
              })}</div>
            </section>) }
              {allLevels.some((level) => level.id > 100) && <section className="chapter-section cyan"><div className="chapter-header"><div className="chapter-icon-large"><Plus /></div><div><span>مراحل افزوده‌شده</span><h2>افق‌های تازه</h2><p>مرحله‌هایی که بعداً به جهان مدار اضافه شده‌اند.</p></div><div className="chapter-completion">{formatPersianNumber(allLevels.filter((level) => level.id > 100 && progress.completed[level.id]).length)}<small> / {formatPersianNumber(allLevels.filter((level) => level.id > 100).length)}</small></div></div><div className="level-nodes">{allLevels.filter((level) => level.id > 100).map((level) => { const result = progress.completed[level.id]; const locked = level.id > progress.unlockedLevel; return <button key={level.id} disabled={locked} onClick={() => startLevel(level.id)} className={`level-node ${result ? 'done' : ''} ${locked ? 'locked' : ''} ${level.id === progress.unlockedLevel ? 'current' : ''}`}>{locked ? <Lock size={15} /> : result ? <Check size={17} /> : <span>{formatPersianNumber(level.id)}</span>}{result && <span className="node-stars"><Stars count={result.stars} small /></span>}</button>; })}</div></section>}
            </div>
          </motion.div>}

          {screen === 'game' && <motion.div key={`game-${activeLevelId}`} className="screen game-screen" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="game-topline"><button className="back-link" onClick={() => navTo('map')}><ArrowRight size={17} /> بازگشت به نقشه</button><div className="game-level-title"><span>فصل {formatPersianNumber(chapterMeta.findIndex((c) => activeLevelId >= c.start && activeLevelId <= c.end) + 1)}</span><b>مرحله {formatPersianNumber(activeLevelId)}</b><i className={`difficulty-dot ${currentLevel.difficulty}`} /> <small>{difficultyLabel[currentLevel.difficulty]}</small></div><div className="timer-pill"><Clock3 size={15} /> {formatTime(elapsed)}</div></div>
            <div className="game-layout">
              <section className="board-panel">
                <div className="board-heading"><div><span className="eyebrow muted">معمای امروز تو</span><h1>{currentLevel.title}</h1></div><div className="board-progress"><span>{formatPersianNumber(filledCount)} / {formatPersianNumber(totalCells)}</span><div className="progress-track"><i style={{ width: `${filledCount / totalCells * 100}%` }} /></div></div></div>
                <div className="symbol-legend"><span><Sun size={15} className="sun-symbol" /> خورشید</span><span><Moon size={15} className="moon-symbol" /> ماه</span><span className="legend-hint">برای تغییر نماد، روی خانه بزن</span></div>
                <div className={`board-wrap size-${currentLevel.gridSize}`}>
                  <div className="puzzle-board" style={{ gridTemplateColumns: `repeat(${currentLevel.gridSize}, minmax(0, 1fr))` }}>
                    {board.map((row, r) => row.map((value, c) => {
                      const fixed = currentLevel.initialBoard[r][c] !== -1;
                      const key = `${r}-${c}`;
                      const isHint = hintMove && hintStage >= 1 && hintMove.row === r && hintMove.col === c;
                      return <button key={key} className={`puzzle-cell ${fixed ? 'fixed' : ''} ${isHint ? 'hinted' : ''} ${value === 0 ? 'has-sun' : value === 1 ? 'has-moon' : ''}`} onClick={() => updateCell(r, c)} disabled={fixed || showWin} aria-label={`ردیف ${r + 1} ستون ${c + 1}`}>
                        {value !== -1 && <motion.span key={`${key}-${value}`} initial={{ scale: 0.55, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }}><SymbolIcon value={value} size={currentLevel.gridSize === 8 ? 19 : currentLevel.gridSize === 6 ? 23 : 28} /></motion.span>}
                        {fixed && <span className="fixed-dot" />}
                      </button>;
                    }))}
                  </div>
                  <div className="constraint-layer" aria-hidden="true">{currentLevel.constraints.map((edge, i) => {
                    const [ar, ac] = edge.a, [br, bc] = edge.b;
                    const horizontal = ar === br;
                    const left = horizontal ? ((Math.min(ac, bc) + 1) / currentLevel.gridSize) * 100 : ((ac + 0.5) / currentLevel.gridSize) * 100;
                    const top = horizontal ? ((ar + 0.5) / currentLevel.gridSize) * 100 : ((Math.min(ar, br) + 1) / currentLevel.gridSize) * 100;
                    return <span key={i} className="constraint-mark" style={{ left: `${left}%`, top: `${top}%` }}>{edge.type === 'same' ? '=' : '×'}</span>;
                  })}</div>
                </div>
                <div className="board-footnote"><Info size={14} /> هر ردیف و ستون باید تعداد مساوی خورشید و ماه داشته باشد.</div>
                <AnimatePresence>
                  {hintMove && screen === 'game' && <motion.div className="hint-inline-panel" role="region" aria-live="polite" aria-label="راهنمای هوشمند" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                    <div className="hint-inline-head">
                      <div className="hint-orb"><Lightbulb size={22} /></div>
                      <div className="hint-inline-copy"><div className="modal-eyebrow">راهنمای هوشمند</div><h2>{hintStage === 0 ? 'یک سرنخ کوچک؟' : hintStage === 1 ? 'به منطق جدول دقت کن' : 'خانهٔ پیشنهادی پیدا شد'}</h2></div>
                      <button className="hint-inline-close" onClick={() => { setHintMove(null); setHintStage(0); }} aria-label="بستن راهنمایی"><X size={17} /></button>
                    </div>
                    <p>{hintStage === 0 ? 'می‌توانیم قدم‌به‌قدم کمکت کنیم، بدون اینکه جواب کل معما را لو بدهیم.' : hintStage === 1 ? 'خانهٔ مشخص‌شده در جدول را ببین. با توجه به تعادل ردیف و ستون و نشانه‌های اطراف، می‌توانی انتخاب درست را پیدا کنی.' : `ردیف ${formatPersianNumber(hintMove.row + 1)}، ستون ${formatPersianNumber(hintMove.col + 1)}: ${hintMove.reason}`}</p>
                    {hintStage >= 1 && <div className="hint-location"><span>ردیف {formatPersianNumber(hintMove.row + 1)}</span><span>ستون {formatPersianNumber(hintMove.col + 1)}</span>{hintStage === 2 && <span className="hint-answer"><SymbolIcon value={hintMove.value} size={16} /> {hintMove.value === 0 ? 'خورشید' : 'ماه'}</span>}</div>}
                    <div className="hint-inline-actions">
                      <button className="text-link" onClick={() => { setHintMove(null); setHintStage(0); }}>بستن</button>
                      {hintStage === 0 ? <button className="primary-button" onClick={() => { setHintCount((v) => v + 1); setHintStage(1); }}>دیدن سرنخ <ArrowLeft size={16} /></button> : hintStage === 1 ? <button className="primary-button" onClick={() => setHintStage(2)}>نمایش نماد <ArrowLeft size={16} /></button> : <button className="primary-button" onClick={applyHint}>قرار دادن نماد <Check size={16} /></button>}
                    </div>
                  </motion.div>}
                </AnimatePresence>
                {filledCount === totalCells && !isBoardSolved(board, currentLevel) && <div className="final-check-row"><button className="outline-button small" onClick={() => showToast('جدول کامل شده، اما پاسخ هنوز با همه قوانین معما سازگار نیست. بدون نمایش خانه‌های خطادار، یک بار دیگر بررسی کن.')}><Check size={15} /> بررسی پاسخ نهایی</button></div>}
              </section>
              <aside className="game-sidebar">
                <div className="side-card side-progress"><div className="side-card-title"><span>وضعیت مرحله</span><Sparkles size={17} /></div><div className="side-progress-main"><div className="donut-progress" style={{ '--progress': `${filledCount / totalCells * 100}%` } as CSSProperties}><b>{Math.round(filledCount / totalCells * 100)}٪</b></div><div><b>{formatPersianNumber(filledCount)} خانه</b><small>از {formatPersianNumber(totalCells)} خانه</small></div></div><div className="side-stats"><span><small>خانه‌های خالی</small><b>{formatPersianNumber(totalCells - filledCount)}</b></span><span><small>راهنمایی</small><b>{formatPersianNumber(hintCount)}</b></span></div></div>
                <div className="side-card tools-card"><div className="side-card-title"><span>ابزارهای تو</span><WandSparkles size={17} /></div><div className="tool-grid"><button onClick={undo} disabled={!undoStack.length}><Undo2 size={18} /><span>بازگشت</span></button><button onClick={redo} disabled={!redoStack.length}><Redo2 size={18} /><span>دوباره</span></button><button onClick={openHint} className="hint-tool"><Lightbulb size={18} /><span>راهنمایی</span></button><button onClick={resetLevel}><RotateCcw size={18} /><span>شروع مجدد</span></button></div></div>
                <div className="side-quote"><span>✦</span><p>«گاهی پاسخ درست، از دلِ صبر و نگاه دوباره پیدا می‌شود.»</p></div>
              </aside>
            </div>
          </motion.div>}

          {screen === 'stats' && <motion.div key="stats" className="screen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="page-heading"><div><span className="eyebrow muted">ردپای تو در مدار</span><h1>آمار و دستاوردها</h1><p>هر حرکت، نشانه‌ای از پیشرفت توست.</p></div><div className="rank-badge"><Crown size={20} /><span>رتبهٔ تو</span><b>{progress.xp >= 3000 ? 'استاد مدار' : progress.xp >= 1000 ? 'کاوشگر' : progress.xp >= 300 ? 'جوینده' : 'تازه‌وارد'}</b></div></div>
            <div className="stats-grid"><div className="stat-card"><span className="stat-icon gold"><Trophy /></span><small>مرحله‌های کامل‌شده</small><b>{formatPersianNumber(completedCount)}</b><span>از {formatPersianNumber(allLevels.length)} مرحله</span></div><div className="stat-card"><span className="stat-icon violet"><Star /></span><small>مجموع ستاره‌ها</small><b>{formatPersianNumber(totalStars)}</b><span>از {formatPersianNumber(allLevels.length * 3)} ستاره</span></div><div className="stat-card"><span className="stat-icon blue"><Clock3 /></span><small>زمان بازی</small><b>{formatPersianNumber(Math.floor(progress.totalTime / 60))}</b><span>دقیقه</span></div><div className="stat-card"><span className="stat-icon rose"><Flame /></span><small>بهترین استریک</small><b>{formatPersianNumber(progress.longestStreak)}</b><span>روز متوالی</span></div></div>
            <section className="section-card streak-calendar-card"><div className="section-card-title"><h2>تقویم استریک</h2><span>۷ روز اخیر</span></div><div className="streak-calendar">{streakDays.map((day) => <div key={day.key} className={day.active ? 'active' : ''}><span>{day.label}</span><i>{day.active ? <Flame size={16} fill="currentColor" /> : <span>·</span>}</i></div>)}</div></section>
            <div className="stats-panels"><section className="section-card stats-progress-card"><div className="section-card-title"><h2>پیشرفت در فصل‌ها</h2><span>۱۰۰ مرحله</span></div>{chapterMeta.map((chapter) => { const count = Object.keys(progress.completed).filter((id) => Number(id) >= chapter.start && Number(id) <= chapter.end).length; const total = chapter.end - chapter.start + 1; return <div className="chapter-stat" key={chapter.start}><div><b>{chapter.name}</b><span>{formatPersianNumber(count)} / {formatPersianNumber(total)}</span></div><div className="progress-track"><i style={{ width: `${count / total * 100}%` }} /></div></div>; })}</section>
              <section className="section-card record-card"><div className="section-card-title"><h2>رکوردهای تو</h2><Award size={19} /></div><div className="record-row"><span><Target size={16} /> مجموع تجربه</span><b>{formatPersianNumber(progress.xp)} XP</b></div><div className="record-row"><span><Lightbulb size={16} /> راهنمایی استفاده‌شده</span><b>{formatPersianNumber(progress.totalHints)}</b></div><div className="record-row"><span><RefreshCw size={16} /> دفعات تکمیل</span><b>{formatPersianNumber(progress.gamesPlayed)}</b></div></section></div>
            <div className="section-card recent-card"><div className="section-card-title"><h2>آخرین دستاوردها</h2><span>مرحله‌های تکمیل‌شده</span></div>{Object.entries(progress.completed).length ? <div className="recent-list">{Object.entries(progress.completed).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 6).map(([id, result]) => <div className="recent-item" key={id}><span className="recent-level">{formatPersianNumber(Number(id))}</span><div><b>مرحله {formatPersianNumber(Number(id))}</b><small>{formatTime(result.time)} · {formatPersianNumber(result.hints)} راهنمایی</small></div><Stars count={result.stars} /></div>)}</div> : <div className="empty-state"><Orbit size={28} /><b>هنوز دستاوردی ثبت نشده</b><span>اولین مرحله را حل کن تا اینجا روشن شود.</span><button className="text-link" onClick={() => startLevel(1)}>شروع مرحله اول <ArrowLeft size={15} /></button></div>}</div>
          </motion.div>}

          {screen === 'settings' && <motion.div key="settings" className="screen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="page-heading"><div><span className="eyebrow muted">شخصی‌سازی تجربه</span><h1>تنظیمات</h1><p>مدار را مطابق سلیقه‌ات تنظیم کن.</p></div><div className="settings-orb"><Settings size={25} /></div></div>
            <div className="settings-layout"><section className="section-card settings-card"><h2>تجربه بازی</h2><div className="setting-row"><span className="setting-icon"><Volume2 /></span><div><b>افکت‌های صوتی</b><small>بازخورد صوتی برای حرکت‌ها و موفقیت‌ها</small></div><button className={`toggle ${soundOn ? 'on' : ''}`} onClick={() => setSoundOn((v) => !v)}><i /></button></div><div className="setting-row"><span className="setting-icon"><VolumeX /></span><div><b>موسیقی پس‌زمینه</b><small>صدای فضایی ملایم هنگام بازی</small></div><button className={`toggle ${musicOn ? 'on' : ''}`} onClick={() => setMusicOn((v) => !v)}><i /></button></div><div className="setting-row"><span className="setting-icon"><Zap /></span><div><b>بازخورد لرزشی</b><small>لرزش کوتاه روی دستگاه‌های پشتیبانی‌شده</small></div><button className={`toggle ${hapticsOn ? 'on' : ''}`} onClick={() => setHapticsOn((v) => !v)}><i /></button></div><div className="setting-row"><span className="setting-icon"><BookOpen /></span><div><b>آموزش بازی</b><small>مرور دوباره قوانین و شیوه بازی</small></div><button className="outline-button small" onClick={() => { setTutorialStep(0); setTutorialOpen(true); }}>نمایش آموزش</button></div><div className="setting-row"><span className="setting-icon"><Sparkles /></span><div><b>مقدمه بازی</b><small>تماشای دوباره معرفی دنیای مدار</small></div><button className="outline-button small" onClick={() => setIntroOpen(true)}>نمایش مقدمه</button></div></section>
              <section className="section-card settings-card"><h2>داده‌های بازی</h2><div className="setting-row"><span className="setting-icon"><Download /></span><div><b>پشتیبان پیشرفت</b><small>ذخیره یک نسخه از رکوردها و ستاره‌ها</small></div><button className="outline-button small" onClick={downloadProgress}>خروجی گرفتن</button></div><div className="setting-row danger-row"><span className="setting-icon"><RotateCcw /></span><div><b>شروع از ابتدا</b><small>پاک کردن تمام پیشرفت‌های ذخیره‌شده</small></div><button className="outline-button small danger-button" onClick={resetProgress}>پاک کردن</button></div></section>
              <section className="section-card settings-card admin-entry"><div><span className="eyebrow muted">برای سازنده</span><h2>مدیریت مراحل</h2><p>مرحله‌های تازه را وارد کن، اعتبارسنجی کن و خروجی بگیر.</p></div><button className="primary-button" onClick={() => navTo('admin')}>ورود به پنل مدیریت <ArrowLeft size={16} /></button></section></div>
          </motion.div>}

          {screen === 'admin' && <motion.div key="admin" className="screen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className="page-heading"><div><span className="eyebrow muted">ابزار سازنده</span><h1>مدیریت مراحل</h1><p>مرحله‌ها به‌صورت داده‌ای نگهداری می‌شوند؛ مرحله‌های تازه به‌ترتیب از ۱۰۱ شماره‌گذاری می‌شوند و بدون تغییر موتور بازی قابل اضافه‌کردن هستند.</p></div><button className="outline-button" onClick={exportLevels}><Download size={16} /> خروجی همه مراحل</button></div>
            <div className="admin-summary"><div><b>{formatPersianNumber(allLevels.length)}</b><span>مرحله در بازی</span></div><div><b>{formatPersianNumber(customLevels.length)}</b><span>مرحله سفارشی</span></div><div><b>۱</b><span>پاسخ یکتا برای هر مرحلهٔ اولیه</span></div></div>
            <section className="section-card admin-import"><div className="section-card-title"><div><h2>افزودن مرحله با JSON</h2><p>یک شیء مرحله یا آرایه‌ای از مرحله‌ها را وارد کن.</p></div><FileJson size={21} /></div><textarea value={jsonInput} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setJsonInput(e.target.value)} placeholder={'[\n  {\n    "id": 101,\n    "title": "افق تازه",\n    "gridSize": 4,\n    "difficulty": "easy",\n    "initialBoard": [[-1,0,-1,1],[1,-1,0,-1],[-1,1,-1,0],[0,-1,1,-1]],\n    "constraints": [],\n    "solution": [[0,0,1,1],[1,1,0,0],[0,1,0,1],[1,0,1,0]],\n    "hints": [],\n    "isPublished": true\n  }\n]'} dir="ltr" spellCheck={false} /><div className="admin-actions"><button className="primary-button" onClick={importLevels}><Upload size={16} /> اعتبارسنجی و افزودن</button><button className="outline-button" onClick={() => setJsonInput('')}>پاک کردن کادر</button></div>{adminFeedback && <div className={`admin-feedback ${adminFeedback.includes('موفقیت') ? 'success' : 'error'}`}>{adminFeedback.includes('موفقیت') ? <Check size={16} /> : <Info size={16} />}{adminFeedback}</div>}<div className="admin-note"><ShieldCheck size={16} /> موتور بازی هنگام ورود، تعداد پاسخ‌ها را می‌شمارد و فقط مرحله‌هایی با دقیقاً یک پاسخ را می‌پذیرد.</div></section>
            <section className="section-card admin-list"><div className="section-card-title"><h2>مرحله‌های اضافه‌شده</h2><span>{formatPersianNumber(customLevels.length)} مورد</span></div>{customLevels.length ? customLevels.map((level) => <div className="admin-level-row" key={level.id}><span className="recent-level">{formatPersianNumber(level.id)}</span><div><b>{level.title}</b><small>{formatPersianNumber(level.gridSize)}×{formatPersianNumber(level.gridSize)} · {difficultyLabel[level.difficulty]}</small></div><button className="icon-button" onClick={() => setCustomLevels((prev) => prev.filter((item) => item.id !== level.id))} aria-label="حذف مرحله"><X size={16} /></button></div>) : <div className="empty-state compact"><Plus size={24} /><span>هنوز مرحله سفارشی اضافه نکرده‌ای.</span></div>}</section>
          </motion.div>}
        </AnimatePresence>
      </main>

      {screen === 'game' && <div className="mobile-game-actions"><button onClick={undo} disabled={!undoStack.length}><Undo2 size={18} /><span>بازگشت</span></button><button onClick={redo} disabled={!redoStack.length}><Redo2 size={18} /><span>دوباره</span></button><button className="mobile-hint" onClick={openHint}><Lightbulb size={18} /><span>راهنمایی</span></button><button onClick={resetLevel}><RotateCcw size={18} /><span>شروع مجدد</span></button></div>}

      <footer className="footer"><span>© MADAR · مدار</span><span>با آرامش فکر کن، با دقت حل کن <span className="footer-star">✦</span></span><button onClick={() => navTo('settings')}>تنظیمات</button></footer>

      <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><Info size={16} /> {toast}</motion.div>}</AnimatePresence>

      <AnimatePresence>{introOpen && <motion.div className="overlay intro-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div className="intro-stars">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ left: `${(i * 41) % 100}%`, top: `${(i * 67) % 100}%` }} />)}</div><motion.div className="intro-content" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}><div className="intro-emblem"><div className="intro-orbit" /><Sun size={54} /><Moon size={31} /></div><div className="intro-brand">M A D A R</div><h1>مدار</h1><p>هر خانه یک راز،<br /><span>هر حرکت یک کشف</span></p><button className="primary-button intro-button" onClick={completeIntro}>ورود به مدار <ArrowLeft size={18} /></button><small>یک تجربه معمایی در سکوت کیهان</small></motion.div></motion.div>}</AnimatePresence>

      <AnimatePresence>{tutorialOpen && <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="modal tutorial-modal" initial={{ y: 18, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, opacity: 0 }}><button className="modal-close" onClick={finishTutorial}><X size={18} /></button><div className="modal-eyebrow">آموزش کوتاه · {formatPersianNumber(tutorialStep + 1)} از ۳</div><div className="tutorial-progress"><i style={{ width: `${(tutorialStep + 1) / 3 * 100}%` }} /></div>{tutorialStep === 0 ? <><div className="tutorial-visual mini-sun-moon"><Sun /><Moon /></div><h2>خورشید یا ماه؟</h2><p>روی هر خانه بزن تا نمادش تغییر کند: بار اول خورشید، بار دوم ماه و بار سوم خانه خالی می‌شود.</p><div className="practice-grid">{tutorialBoard.map((row, r) => row.map((value, c) => <button key={`${r}-${c}`} onClick={() => setTutorialBoard((prev) => { const next = cloneBoard(prev); next[r][c] = next[r][c] === -1 ? 0 : next[r][c] === 0 ? 1 : -1; return next; })}>{value === -1 ? '' : <SymbolIcon value={value} size={18} />}</button>))}</div><small className="tutorial-caption">امتحانش کن؛ چند خانه را تغییر بده.</small></> : tutorialStep === 1 ? <><div className="tutorial-visual"><Grid3X3 size={45} /></div><h2>تعادل را حفظ کن</h2><p>در هر ردیف و ستون باید دقیقاً به یک اندازه خورشید و ماه داشته باشی. همچنین سه نماد یکسان نباید کنار هم قرار بگیرند و هیچ دو ردیف یا ستونی نباید الگوی کاملاً یکسان داشته باشند.</p><div className="rule-pills"><span><Sun size={15} /> ۲ خورشید</span><span><Moon size={15} /> ۲ ماه</span><span>≠ سه‌تایی</span></div></> : <><div className="tutorial-visual"><span className="relation-demo">=</span><span className="relation-demo different">×</span></div><h2>نشانه‌ها را بخوان</h2><p>علامت مساوی (=) یعنی دو خانه باید یکسان باشند. علامت ضربدر (×) یعنی باید نمادهای متفاوتی داشته باشند.</p><div className="rule-pills"><span> = یکسان</span><span> × متفاوت</span></div></>}<div className="modal-actions"><button className="text-link" onClick={finishTutorial}>رد کردن آموزش</button><button className="primary-button" onClick={() => tutorialStep < 2 ? setTutorialStep((v) => v + 1) : finishTutorial()}>{tutorialStep < 2 ? 'بعدی' : 'شروع بازی'} <ArrowLeft size={16} /></button></div></motion.div></motion.div>}</AnimatePresence>

      <AnimatePresence>{showWin && screen === 'game' && <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="modal win-modal" initial={{ y: 22, scale: 0.94 }} animate={{ y: 0, scale: 1 }} exit={{ y: 14, opacity: 0 }}><div className="win-confetti">✦　✧　✦</div><div className="win-emblem"><Sun size={43} /><Moon size={27} /></div><div className="modal-eyebrow">یک مدار دیگر کامل شد</div><h2>آفرین! مدار کامل شد</h2><p>با تمرکز و دقت، این چالش را پشت سر گذاشتی.</p><Stars count={starsFor(hintCount)} /><div className="win-metrics"><div><Clock3 size={16} /><b>{formatTime(elapsed)}</b><small>زمان حل</small></div><div><Lightbulb size={16} /><b>{formatPersianNumber(hintCount)}</b><small>راهنمایی</small></div><div><Zap size={16} /><b>+{formatPersianNumber(50 + starsFor(hintCount) * 20)}</b><small>XP</small></div></div><div className="star-criteria">بدون راهنمایی: ۳ ستاره <span>·</span> یک راهنمایی: ۲ ستاره <span>·</span> دو راهنمایی یا بیشتر: ۱ ستاره</div><div className="win-streak"><Flame size={17} fill="#ffad5c" /> استریک {formatPersianNumber(progress.currentStreak)} روزه‌ات ادامه دارد!</div><div className="modal-actions win-actions"><button className="outline-button" onClick={() => navTo('map')}>نقشه مراحل</button><button className="primary-button" onClick={() => activeLevelId < allLevels.length ? startLevel(activeLevelId + 1) : navTo('map')}>{activeLevelId < allLevels.length ? 'مرحله بعد' : 'پایان مسیر'} <ArrowLeft size={16} /></button></div></motion.div></motion.div>}</AnimatePresence>
    </div>
  );
}

function playTone(frequency: number, duration: number) {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass(); const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration); oscillator.onended = () => context.close();
  } catch { /* Audio is optional. */ }
}

export default App;
