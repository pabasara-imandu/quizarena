import { normalizeQuiz } from './quizSchema.js';

/**
 * Topic -> quiz question generation.
 *
 * Two paths, chosen automatically:
 *
 *  1. `GEMINI_API_KEY` is set -> a real call to Gemini with a response schema
 *     constraining the shape, so the result is guaranteed to parse into our
 *     quiz format. Gemini is used because it writes natural Sinhala and Tamil,
 *     which is what a national tool needs, and its free tier covers a school.
 *  2. Otherwise -> a deterministic scaffold. Every question is a real, editable
 *     row with the topic filled in and the answer left obviously blank, so the
 *     endpoint is useful offline and in CI without pretending to know facts it
 *     does not.
 *
 * The scaffold is honest on purpose: it never invents plausible-looking
 * answers, because a teacher skim-reading generated content would have no way
 * to tell a real fact from a fabricated one.
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export const LANGUAGES = {
  en: 'English',
  si: 'Sinhala (සිංහල)',
  ta: 'Tamil (தமிழ்)',
};

export async function generateQuiz({
  topic,
  count = 5,
  difficulty = 'mixed',
  gradeLevel = '',
  language = 'en',
}) {
  const safeCount = Math.min(Math.max(Math.round(Number(count) || 5), 1), 20);
  const cleanTopic = String(topic || '').trim().slice(0, 200);
  const lang = Object.hasOwn(LANGUAGES, language) ? language : 'en';
  if (!cleanTopic) {
    const err = new Error('Give the generator a topic to work from.');
    err.status = 400;
    throw err;
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await generateWithGemini({
        topic: cleanTopic,
        count: safeCount,
        difficulty,
        gradeLevel,
        language: lang,
      });
    } catch (err) {
      // Never fail the request because the model was unavailable - fall back
      // to the scaffold and tell the caller what happened.
      return {
        ...buildScaffold({ topic: cleanTopic, count: safeCount }),
        source: 'scaffold',
        notice: 'The AI was unreachable (' + err.message + '), so this is an editable scaffold.',
      };
    }
  }

  return {
    ...buildScaffold({ topic: cleanTopic, count: safeCount }),
    source: 'scaffold',
    notice: 'Set GEMINI_API_KEY on the server to generate real questions. This is an editable scaffold.',
  };
}

async function generateWithGemini({ topic, count, difficulty, gradeLevel, language }) {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            type: {
              type: Type.STRING,
              format: 'enum',
              enum: ['multiple', 'multiselect', 'truefalse', 'short', 'numeric'],
            },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  correct: { type: Type.BOOLEAN },
                },
                required: ['text', 'correct'],
              },
            },
            acceptedAnswers: { type: Type.ARRAY, items: { type: Type.STRING } },
            answer: { type: Type.NUMBER },
            tolerance: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            explanation: { type: Type.STRING },
            timeLimitSec: { type: Type.INTEGER },
            points: { type: Type.INTEGER },
          },
          required: ['text', 'type', 'options', 'acceptedAnswers', 'explanation', 'timeLimitSec', 'points'],
        },
      },
    },
    required: ['title', 'questions'],
  };

  const audience = gradeLevel ? ' The students are ' + gradeLevel + '.' : '';
  const languageLine =
    language === 'en'
      ? ''
      : ' Write EVERYTHING - the title, every question, every option, every accepted answer and' +
        ' every explanation - in ' +
        LANGUAGES[language] +
        '. Use natural, correct ' +
        LANGUAGES[language].split(' ')[0] +
        ' as a teacher in Sri Lanka would write it, not a word-for-word translation from English.' +
        ' Keep numbers as digits.';

  const response = await ai.models.generateContent({
    model: MODEL,
    contents:
      'Write ' + count + ' quiz questions about: ' + topic + '.' + audience +
      ' Difficulty: ' + difficulty + '.' +
      ' Mostly multiple-choice (4 options, exactly one correct). Include one or two' +
      ' true/false, at most one multiselect (4-5 options, two or three correct), and if' +
      ' the topic has a clear numeric fact, one numeric question (give `answer`, a sensible' +
      ' `tolerance`, and a `unit` if there is one). At most one short-answer question.' +
      ' For tile questions put the options in `options` and leave `acceptedAnswers` empty.' +
      ' For short-answer leave `options` empty and list every spelling you would accept in' +
      ' `acceptedAnswers`. For every question write a one- or two-sentence `explanation` of' +
      ' why the answer is correct, as you would say it to the class after revealing it.' +
      ' Use timeLimitSec between 15 and 45, and points of 1000 (1500 for harder questions).' +
      languageLine,
    config: {
      systemInstruction:
        'You write classroom quiz questions for school teachers. Every graded question must' +
        ' have an unambiguously correct answer that a well-prepared student could defend from' +
        ' a textbook. Distractors must be plausible but clearly wrong on inspection - never a' +
        ' second defensible answer. Prefer questions that test understanding over recall of' +
        ' trivia. If you are not confident a fact is correct, choose a different question' +
        ' rather than guessing.',
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.7,
    },
  });

  const parsed = JSON.parse(response.text);

  return {
    quiz: normalizeQuiz({ title: parsed.title || topic, questions: parsed.questions }),
    source: 'gemini',
    model: MODEL,
    language,
    notice: 'AI-generated draft. Review every answer before you run this with a class.',
  };
}

/**
 * Deterministic, offline scaffold. Produces valid, editable questions with the
 * answers left blank - a starting structure, never invented facts.
 */
function buildScaffold({ topic, count }) {
  const angles = [
    'Which of these best describes TOPIC?',
    'What is the main purpose of TOPIC?',
    'Which statement about TOPIC is correct?',
    'TOPIC is most closely associated with which of the following?',
    'Which is NOT true of TOPIC?',
    'What problem does TOPIC solve?',
    'Which example best illustrates TOPIC?',
    'What is a common misconception about TOPIC?',
  ];

  const questions = Array.from({ length: count }, (_, i) => {
    if (i > 0 && i % 4 === 3) {
      return {
        id: 'gen' + i,
        type: 'truefalse',
        text: angles[i % angles.length].replace('TOPIC', topic).replace(/\?$/, '') + ' (edit me)',
        timeLimitSec: 15,
        points: 800,
        correctBoolean: true,
      };
    }
    return {
      id: 'gen' + i,
      type: 'multiple',
      text: angles[i % angles.length].replace('TOPIC', topic),
      timeLimitSec: 25,
      points: 1000,
      options: [
        { id: 'gen' + i + 'a', text: 'Replace with the correct answer', correct: true },
        { id: 'gen' + i + 'b', text: 'Replace with a plausible distractor' },
        { id: 'gen' + i + 'c', text: 'Replace with a plausible distractor' },
        { id: 'gen' + i + 'd', text: 'Replace with a plausible distractor' },
      ],
    };
  });

  return { quiz: normalizeQuiz({ title: topic, questions }) };
}
