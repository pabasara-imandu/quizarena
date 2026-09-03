'use client';

import { useEffect, useState } from 'react';
import { QuestionList, isIncomplete } from '@/components/host/QuestionList';
import { QuestionEditor } from '@/components/host/QuestionEditor';
import { SettingsPanel } from '@/components/host/SettingsPanel';
import { StartFromModal } from '@/components/host/StartFromModal';
import type { Question, Quiz, RoomSettings } from '@/lib/types';
import { serverUrl } from '@/lib/serverUrl';

const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * The first question is rendered on the server too, so its ids must be
 * deterministic - random ids would differ between the SSR pass and hydration
 * and React would tear the form down. Everything added after mount is a
 * client-only interaction and can use random ids safely.
 */
const FIRST_QUESTION: Question = {
  id: 'q-1',
  type: 'multiple',
  text: '',
  image: null,
  timeLimitSec: 20,
  points: 1000,
  options: [
    { id: 'q-1-a', text: '', correct: true },
    { id: 'q-1-b', text: '', correct: false },
    { id: 'q-1-c', text: '', correct: false },
    { id: 'q-1-d', text: '', correct: false },
  ],
};

function blank(type: Question['type']): Question {
  const base = { id: uid(), text: '', image: null as string | null };
  if (type === 'truefalse') {
    return {
      ...base,
      type,
      timeLimitSec: 15,
      points: 800,
      options: [
        { id: 'true', text: 'True', correct: true },
        { id: 'false', text: 'False', correct: false },
      ],
    };
  }
  if (type === 'short') {
    return {
      ...base,
      type,
      timeLimitSec: 30,
      points: 1200,
      options: [],
      acceptedAnswers: [''],
      caseSensitive: false,
    };
  }
  return {
    ...base,
    type: 'multiple',
    timeLimitSec: 20,
    points: 1000,
    options: [
      { id: uid(), text: '', correct: true },
      { id: uid(), text: '', correct: false },
      { id: uid(), text: '', correct: false },
      { id: uid(), text: '', correct: false },
    ],
  };
}

const DEFAULT_SETTINGS: RoomSettings = {
  shuffleAnswers: true,
  shuffleQuestions: false,
  speedBonus: true,
  requireFullscreen: true,
  allowLateJoin: false,
  showLeaderboardBetweenQuestions: true,
  allowSkip: true,
  allowReactions: true,
  strikeLimit: 3,
};

interface Props {
  onLaunch: (quiz: Quiz, settings: RoomSettings) => Promise<void>;
  busy: boolean;
  error: string | null;
}

/**
 * The quiz workspace: a rail of questions on the left, one editor on the right,
 * and a sticky action bar on top. Settings and the import/generate flows live
 * in overlays, so the page you look at while writing a quiz contains only the
 * question you are writing.
 */
export function QuizCreator({ onLaunch, busy, error }: Props) {
  const [title, setTitle] = useState('My live quiz');
  const [questions, setQuestions] = useState<Question[]>([FIRST_QUESTION]);
  const [selected, setSelected] = useState(0);
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startFromOpen, setStartFromOpen] = useState(false);

  // Deleting the last question must never leave the editor pointing past the end.
  useEffect(() => {
    if (selected > questions.length - 1) setSelected(Math.max(0, questions.length - 1));
  }, [questions.length, selected]);

  const patchQuestion = (index: number, patch: Partial<Question>) =>
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    setQuestions((qs) => {
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelected(target);
  };

  const add = (type: Question['type']) => {
    setQuestions((qs) => [...qs, blank(type)]);
    setSelected(questions.length);
  };

  const remove = (index: number) => {
    if (questions.length === 1) return;
    setQuestions((qs) => qs.filter((_, i) => i !== index));
    setSelected((s) => Math.max(0, s > index ? s - 1 : s === index ? Math.min(s, questions.length - 2) : s));
  };

  const loadSample = async () => {
    const base = serverUrl();
    const res = await fetch(base + '/api/sample-quiz');
    const sample: Quiz = await res.json();
    setTitle(sample.title);
    setQuestions(sample.questions);
    setSelected(0);
  };

  const incompleteCount = questions.filter(isIncomplete).length;
  const totalSeconds = questions.reduce((s, q) => s + q.timeLimitSec, 0);
  const current = questions[Math.min(selected, questions.length - 1)];

  return (
    <>
      {/* --------------------------------------------------------- action bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-white/[0.06] bg-ink-950/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Quiz title"
            className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1.5 font-display text-xl font-bold text-slate-100 transition placeholder:text-slate-600 hover:border-white/10 focus:border-brand-500/60 focus:bg-ink-900 focus:outline-none sm:text-2xl"
            value={title}
            maxLength={120}
            placeholder="Name your quiz"
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStartFromOpen(true)}>
              <span aria-hidden>📄</span>
              <span className="hidden sm:inline">Import / Generate</span>
            </button>
            <button type="button" className="btn-secondary" onClick={() => setSettingsOpen(true)}>
              <span aria-hidden>⚙</span>
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              type="button"
              className="btn-primary btn-lg"
              disabled={busy || incompleteCount > 0}
              onClick={() => onLaunch({ title, questions }, settings)}
            >
              {busy ? 'Opening…' : 'Launch'}
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[13px]">
          {incompleteCount > 0 ? (
            <span className="text-amber-300">
              {incompleteCount} question{incompleteCount > 1 ? 's' : ''} need
              {incompleteCount > 1 ? '' : 's'} text and an answer
            </span>
          ) : (
            <span className="text-emerald-300">Ready to launch</span>
          )}
          <span className="text-slate-600">
            {questions.length} question{questions.length > 1 ? 's' : ''} ·{' '}
            {Math.floor(totalSeconds / 60)}m {totalSeconds % 60}s of question time
          </span>
          <button
            type="button"
            onClick={loadSample}
            className="ml-auto text-slate-500 transition hover:text-brand-300"
          >
            Load sample quiz
          </button>
        </div>

        {error && <p className="mt-2 px-2 text-sm text-rose-300">{error}</p>}
      </div>

      {/* ---------------------------------------------------------- workspace */}
      <div className="grid gap-5 lg:grid-cols-[290px_1fr] lg:items-start">
        {/* On a narrow screen the rail stacks above the editor, so it is capped
            short - a full-height list would push the editor off the page. */}
        <aside className="surface min-w-0 max-h-[19rem] p-3 lg:sticky lg:top-[7.5rem] lg:max-h-[calc(100vh-11rem)]">
          <QuestionList
            questions={questions}
            selectedIndex={selected}
            onSelect={setSelected}
            onMove={move}
            onDelete={remove}
            onAdd={add}
          />
        </aside>

        <section className="surface min-w-0 p-5 sm:p-7">
          {current && (
            <QuestionEditor
              key={current.id}
              question={current}
              index={selected}
              total={questions.length}
              onPatch={(patch) => patchQuestion(selected, patch)}
            />
          )}
        </section>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
      />

      <StartFromModal
        open={startFromOpen}
        onClose={() => setStartFromOpen(false)}
        onQuizLoaded={(quiz) => {
          setTitle(quiz.title);
          setQuestions(quiz.questions);
          setSelected(0);
        }}
      />
    </>
  );
}
