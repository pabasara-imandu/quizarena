import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { roomStore } from '../state/roomStore.js';
import { sampleQuiz } from '../game/sampleQuiz.js';
import { parseQuizWorkbook } from '../game/importQuiz.js';
import { generateQuiz } from '../game/generateQuiz.js';
import { buildMatrixCsv } from '../game/exportCsv.js';
import { ValidationError } from '../game/quizSchema.js';

export const api = Router();

/**
 * Uploads stay in memory: a quiz spreadsheet is a few KB, and never touching
 * disk means no temp files to clean up and nothing to path-traverse.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv|tsv)$/i.test(file.originalname || '');
    cb(ok ? null : new Error('Upload a .xlsx, .xls or .csv file.'), ok);
  },
});

api.get('/health', (_req, res) => {
  const cpu = process.cpuUsage();
  res.json({
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    memoryMb: Math.round(process.memoryUsage().heapUsed / 1048576),
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    // Cumulative CPU milliseconds. Sample this before and after a load run to
    // see what a quiz actually costs - which is the number that decides
    // whether a 0.1-vCPU instance can carry a given class size.
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    ...roomStore.stats,
  });
});

/**
 * Cheap pre-flight so the join screen can say "no such PIN" before it opens a
 * socket. Deliberately leaks nothing beyond existence and joinability.
 */
api.get('/rooms/:pin', (req, res) => {
  const room = roomStore.get(req.params.pin);
  if (!room) return res.status(404).json({ found: false });
  res.json({
    found: true,
    quizTitle: room.quiz.title,
    phase: room.phase,
    playerCount: room.players.size,
    acceptingJoins: room.phase === 'lobby' || room.settings.allowLateJoin,
    requireFullscreen: room.settings.requireFullscreen,
  });
});

api.get('/sample-quiz', (_req, res) => res.json(sampleQuiz));

/* -------------------------------------------------------------------------- */
/* Spreadsheet import                                                         */
/* -------------------------------------------------------------------------- */

api.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });
  try {
    // A CSV's sheet is always called "Sheet1", which is a useless quiz title -
    // the filename the teacher chose is far more likely to be meaningful.
    const fromFilename = (req.file.originalname || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    const result = parseQuizWorkbook(req.file.buffer, {
      title: req.body?.title || fromFilename,
    });
    res.json(result);
  } catch (err) {
    res.status(err instanceof ValidationError ? 400 : 500).json({
      error: err instanceof ValidationError ? err.message : 'Could not read that file.',
    });
  }
});

/** A blank template so a teacher can see the expected columns before importing. */
api.get('/import/template.csv', (_req, res) => {
  const rows = [
    [
      'Question Text',
      'Question Type',
      'Option 1',
      'Option 2',
      'Option 3',
      'Option 4',
      'Option 5',
      'Correct Answer',
      'Time Limit',
      'Points',
      'Image Link',
    ],
    [
      'Which planet has the most moons?',
      'multiple',
      'Jupiter',
      'Saturn',
      'Neptune',
      'Uranus',
      '',
      'B',
      '20',
      '1000',
      '',
    ],
    ['The Great Wall is visible from the Moon.', 'truefalse', '', '', '', '', '', 'FALSE', '15', '800', ''],
    [
      'What does HTTP stand for?',
      'short',
      '',
      '',
      '',
      '',
      '',
      'HyperText Transfer Protocol | Hypertext Transfer Protocol',
      '30',
      '1200',
      '',
    ],
  ];
  res.type('text/csv').attachment('quizarena-template.csv');
  res.send(rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n'));
});

/* -------------------------------------------------------------------------- */
/* AI generation                                                              */
/* -------------------------------------------------------------------------- */

// Generation is the one endpoint that can cost real money per call, so it gets
// its own much tighter limit on top of the global one.
const generateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many generation requests. Wait a minute and try again.' },
});

api.post('/generate', generateLimiter, async (req, res) => {
  try {
    const result = await generateQuiz({
      topic: req.body?.topic,
      count: req.body?.count,
      difficulty: req.body?.difficulty,
      gradeLevel: req.body?.gradeLevel,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Generation failed.' });
  }
});

/* -------------------------------------------------------------------------- */
/* Deep export                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Full student-by-question matrix as CSV.
 *
 * Gated on the host token: the results of a whole class are not something a
 * student who knows the PIN should be able to download.
 */
api.get('/rooms/:pin/export.csv', (req, res) => {
  const room = roomStore.get(req.params.pin);
  if (!room) return res.status(404).json({ error: 'That room is no longer active.' });

  const token = req.query.hostToken || req.get('x-host-token');
  if (!token || token !== room.hostToken) {
    return res.status(403).json({ error: 'Host credentials required.' });
  }

  const csv = buildMatrixCsv(room.buildAnalytics());
  res.type('text/csv').attachment('quizarena-' + room.pin + '-results.csv');
  res.send(csv);
});

/** Same data as JSON, for anyone wiring this into a gradebook. */
api.get('/rooms/:pin/export.json', (req, res) => {
  const room = roomStore.get(req.params.pin);
  if (!room) return res.status(404).json({ error: 'That room is no longer active.' });

  const token = req.query.hostToken || req.get('x-host-token');
  if (!token || token !== room.hostToken) {
    return res.status(403).json({ error: 'Host credentials required.' });
  }
  res.json(room.buildAnalytics());
});
