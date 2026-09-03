import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { roomStore } from '../state/roomStore.js';
import { imageStore } from '../state/imageStore.js';
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
    ...imageStore.stats,
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
/* Image upload                                                               */
/* -------------------------------------------------------------------------- */

const imageUpload = multer({
  storage: multer.memoryStorage(),
  // A little above the store's own ceiling so an oversized file is rejected
  // with a useful message rather than a truncated stream.
  limits: { fileSize: 1.5 * 1024 * 1024, files: 1 },
});

/**
 * The absolute base URL clients should use to fetch images back.
 *
 * It must be absolute: with split hosting (client on Netlify, server on
 * Render) a relative /api/images/... would resolve against the Netlify
 * origin, where nothing is listening. Derived from the request so it works on
 * any domain without configuration; PUBLIC_URL overrides it if you sit behind
 * something that mangles the headers.
 */
function publicBase(req) {
  const configured = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return req.protocol + '://' + req.get('host');
}

api.post('/images', imageUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });

  const result = imageStore.put(req.file.buffer);
  if (!result.ok) {
    const message =
      result.reason === 'too_large'
        ? 'That image is too large. Keep it under ' +
          Math.round(result.limit / 1024) +
          ' KB - the picker normally shrinks it for you.'
        : 'That file is not a JPEG, PNG, WebP or GIF image.';
    return res.status(400).json({ error: message });
  }

  res.json({
    id: result.id,
    url: publicBase(req) + '/api/images/' + result.id,
    bytes: result.bytes,
    mime: result.mime,
    deduped: result.deduped,
  });
});

api.get('/images/:id', (req, res) => {
  const entry = imageStore.get(String(req.params.id));
  if (!entry) {
    return res.status(404).json({ error: 'That image has expired or was never uploaded.' });
  }

  // Content-addressed, so the bytes behind a URL can never change: cache it
  // hard. This is what stops 300 students re-downloading the same picture.
  res.set({
    'Content-Type': entry.mime,
    'Content-Length': String(entry.bytes),
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Belt and braces alongside helmet: never let a browser reinterpret these
    // bytes as anything but the image type we detected.
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    // Helmet defaults every response to same-origin, which is right for an API
    // but fatal here: the app is served from another origin (localhost:3000 in
    // dev, Netlify in production), so the browser refused to render these in an
    // <img> while still showing them fine on a direct visit - a top-level
    // navigation is not subject to CORP. Images are the one thing on this
    // server that exists to be embedded elsewhere.
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.end(entry.buffer);
});

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

/**
 * A human-readable status page at the server root.
 *
 * There is deliberately no app here - the browser client is deployed
 * separately and this process only serves /api and the WebSocket endpoint.
 * But an anonymous "Cannot GET /" reads like a broken deployment to anyone
 * checking whether the server came up, so say what this is instead.
 */
export function rootStatusPage(_req, res) {
  res.type('html').send(
    '<!doctype html><meta charset="utf-8">' +
      '<title>QuizArena server</title>' +
      '<style>body{font:16px/1.6 system-ui,sans-serif;background:#0b0b12;color:#e8e8ee;' +
      'display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:2rem}' +
      'code{background:#1f1f2e;padding:.15em .4em;border-radius:.3em}' +
      'a{color:#9484ff}</style>' +
      '<div><h1>QuizArena server is running ✅</h1>' +
      '<p>This is the game server, not the app. There is no page here by design.</p>' +
      '<p>Status: <a href="/api/health"><code>/api/health</code></a></p>' +
      '<p style="opacity:.6;font-size:.9em">Players and hosts use the web app, ' +
      'which is deployed separately.</p></div>'
  );
}

