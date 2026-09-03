/**
 * End-to-end load harness: spins up N student sockets plus a host, plays the
 * sample quiz through to the analytics screen, and reports answer latency.
 *
 *   node scripts/loadtest.js            # 100 students
 *   PLAYERS=250 node scripts/loadtest.js
 *
 * Requires the server to be running on SERVER_URL (default http://localhost:4000).
 */
import { io } from 'socket.io-client';
import { sampleQuiz } from '../src/game/sampleQuiz.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:4000';
const PLAYERS = Number(process.env.PLAYERS || 100);

const connect = () =>
  io(SERVER_URL, { transports: ['websocket'], reconnection: false, forceNew: true });

const emit = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout on ' + event)), 15000);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });

const percentile = (arr, p) => {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const health = async () => (await fetch(SERVER_URL + '/api/health')).json();

async function main() {
  console.log('Load test: ' + PLAYERS + ' students against ' + SERVER_URL);
  const before = await health();
  const wallStart = Date.now();

  const host = connect();
  await new Promise((r) => host.on('connect', r));

  const created = await emit(host, 'host:create', {
    quiz: sampleQuiz,
    settings: { shuffleAnswers: true, speedBonus: true, strikeLimit: 3 },
  });
  if (!created.ok) throw new Error('host:create failed: ' + created.message);
  const pin = created.pin;
  console.log('Room PIN ' + pin);

  const latencies = [];
  const students = [];
  let questionsSeen = 0;
  let revealsSeen = 0;
  // Bytes the server pushed OUT to students. On a self-hosted laptop this is
  // the number that has to fit down a home upload link.
  let bytesToStudents = 0;
  let bytesToHost = 0;

  const sizeOf = (payload) => Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8');
  host.onAny((_e, payload) => {
    bytesToHost += sizeOf(payload);
  });

  const connectStart = Date.now();
  await Promise.all(
    Array.from({ length: PLAYERS }, async (_, i) => {
      const socket = connect();
      await new Promise((r) => socket.on('connect', r));
      const res = await emit(socket, 'player:join', { pin, nickname: 'Student' + (i + 1) });
      if (!res.ok) throw new Error('join failed for ' + i + ': ' + res.message);

      socket.on('game:question', async ({ question }) => {
        questionsSeen++;
        // Random think-time so answers arrive spread out, like a real class.
        const think = 300 + Math.random() * 2500;
        setTimeout(async () => {
          // Mirror a real class: mostly answers, with a few skips, and typed
          // text on short-answer questions.
          let payload;
          if (Math.random() < 0.08) {
            payload = { skipped: true };
          } else if (question.type === 'short') {
            payload = { text: Math.random() < 0.5 ? 'Tokyo' : 'Osaka' };
          } else {
            const pick = question.options[Math.floor(Math.random() * question.options.length)];
            payload = { optionId: pick.id };
          }

          const t0 = Date.now();
          try {
            const ack = await emit(socket, 'player:answer', payload);
            if (ack.ok) latencies.push(Date.now() - t0);
          } catch {
            /* question closed first - fine */
          }
        }, think);
      });

      socket.on('game:reveal', () => revealsSeen++);
      socket.onAny((_e, payload) => {
        bytesToStudents += sizeOf(payload);
      });
      students.push(socket);
    })
  );
  console.log(PLAYERS + ' students joined in ' + (Date.now() - connectStart) + 'ms');

  const finished = new Promise((resolve) => host.on('game:over', resolve));

  host.on('game:reveal', async (payload) => {
    await new Promise((r) => setTimeout(r, 400));
    await emit(host, 'host:next', {}); // reveal -> leaderboard
    await new Promise((r) => setTimeout(r, 200));
    await emit(host, 'host:next', {}); // leaderboard -> next question / end
    void payload;
  });

  await emit(host, 'host:start', {});
  const analytics = await finished;

  const after = await health();
  const wallSec = (Date.now() - wallStart) / 1000;
  const cpuMs = after.cpuMs - before.cpuMs;

  console.log('\n--- results ---');
  console.log('questions delivered to students: ' + questionsSeen);
  console.log('reveals delivered to students:   ' + revealsSeen);
  console.log('answers acked:                   ' + latencies.length);
  console.log(
    'answer ack latency  p50 ' +
      percentile(latencies, 50) +
      'ms  p95 ' +
      percentile(latencies, 95) +
      'ms  max ' +
      Math.max(0, ...latencies) +
      'ms'
  );
  console.log('players scored:      ' + analytics.playerCount);
  console.log('overall accuracy:    ' + (analytics.overallAccuracy * 100).toFixed(1) + '%');
  console.log('hardest question:    ' + (analytics.hardestQuestions[0]?.text || 'n/a'));
  console.log('podium:              ' + analytics.podium.map((p) => p.nickname).join(', '));

  console.log('\n--- server cost ---');
  console.log('wall time:           ' + wallSec.toFixed(1) + 's');
  console.log('server CPU used:     ' + cpuMs + 'ms');
  // The decisive number for a small instance: what fraction of ONE core the
  // server needed while the quiz was running.
  console.log('avg CPU load:        ' + ((cpuMs / 1000 / wallSec) * 100).toFixed(1) + '% of one core');
  console.log('CPU per player:      ' + (cpuMs / PLAYERS).toFixed(1) + 'ms');
  console.log('memory (rss):        ' + after.rssMb + 'MB');

  const totalKb = (bytesToStudents + bytesToHost) / 1024;
  console.log('\n--- upload from the server ---');
  console.log('to all students:     ' + (bytesToStudents / 1024).toFixed(0) + ' KB');
  console.log('to the host:         ' + (bytesToHost / 1024).toFixed(0) + ' KB');
  console.log('total for the quiz:  ' + totalKb.toFixed(0) + ' KB');
  console.log('average upload:      ' + ((totalKb * 8) / wallSec / 1024).toFixed(2) + ' Mbps');
  // The spike that matters: one question opening pushes a payload to everyone
  // at once, and that burst is what a slow uplink chokes on.
  console.log('per-question burst:  ' + (bytesToStudents / 1024 / 6).toFixed(0) + ' KB to students');

  students.forEach((s) => s.close());
  host.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('load test failed:', err);
  process.exit(1);
});
