# Recovering results from a host tab

Use this when the results screen is still open in the teacher's browser but the
server says **"That room is no longer active."**

The whole results payload — every score, every answer, and any re-marking you
did by hand — was sent to the browser when the quiz ended. It is still in that
tab. Only the *server-side* export needs the room to exist.

> **Do not close or reload that tab.** A reload throws the results away for
> good. Everything below runs against the page as it stands.

---

## 1. The one-click route (try this first)

On the results screen, click **Summary (CSV)**.

That button builds its file inside the browser and never touches the server, so
it still works. It gives you rank, nickname, score, answered, correct, skipped,
accuracy, average time, best streak and integrity flags for every student —
including any short answers you re-marked.

If that is the gradebook you need, you are done.

---

## 2. The full export, including per-question answers

For the question-by-question grid, run this in the browser console:

1. Press **F12** (or `Ctrl` + `Shift` + `I`) and open the **Console** tab.
2. If the console warns you about pasting, type `allow pasting` and press Enter.
3. Paste the whole snippet below and press Enter.

It searches the page for the results object and saves two files to your
Downloads folder: a `.json` with everything, and a `.csv` gradebook.

```js
(() => {
  const isResults = (v) =>
    v && typeof v === 'object' && Array.isArray(v.perQuestion) &&
    Array.isArray(v.players) && v.matrix && typeof v.quizTitle === 'string';

  // React keeps component state on a "fiber" tree hanging off the DOM root.
  // Walk it and pull out the first thing shaped like a results payload.
  const findInFiber = (fiber, depth = 0) => {
    if (!fiber || depth > 6000) return null;
    let hook = fiber.memoizedState, guard = 0;
    while (hook && guard++ < 500) {
      if (isResults(hook.memoizedState)) return hook.memoizedState;
      hook = hook.next;
    }
    if (isResults(fiber.memoizedProps?.data)) return fiber.memoizedProps.data;
    return findInFiber(fiber.child, depth + 1) || findInFiber(fiber.sibling, depth + 1);
  };

  let found = null;
  for (const el of document.querySelectorAll('body *')) {
    const key = Object.keys(el).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$')
    );
    if (!key) continue;
    let root = el[key];
    while (root.return) root = root.return;
    found = findInFiber(root);
    if (found) break;
  }

  if (!found) {
    console.error('No results found on this page. Is the final results screen still showing?');
    return;
  }

  const save = (name, text, type) => {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const cell = (v) => {
    const s = String(v ?? '');
    // Neutralise anything a spreadsheet would run as a formula.
    const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return '"' + safe.replace(/"/g, '""') + '"';
  };

  const m = found.matrix;
  const head = ['Rank', 'Student', 'Total score'];
  m.questions.forEach((q, i) => head.push('Q' + (i + 1) + ' result', 'Q' + (i + 1) + ' answer', 'Q' + (i + 1) + ' points'));
  const rows = [head, ...m.rows.map((r) => {
    const line = [r.rank, r.nickname, r.score];
    r.cells.forEach((c) => line.push(c.status, c.response ?? '', c.points ?? 0));
    return line;
  })];

  const stamp = (found.pin || 'quiz') + '-' + new Date(found.finishedAt || Date.now())
    .toISOString().slice(0, 16).replace(/[:T]/g, '-');

  save('quizarena-' + stamp + '.json', JSON.stringify(found, null, 2), 'application/json');
  save('quizarena-' + stamp + '-gradebook.csv', rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv');

  console.log('Recovered "' + found.quizTitle + '" — ' + m.rows.length + ' students, ' +
              m.questions.length + ' questions. Two files saved to Downloads.');
  return found;
})();
```

If it prints **"No results found on this page"**, the tab is no longer showing
the final results screen and there is nothing left in it to recover.

---

## 3. Loading a recovered file back into the app

Open the host page, choose **Past results**, and pick **Open a results file**.
The recovered `.json` renders as a full results screen — every tab, every
export, re-marking included.

---

## Why this happened, and why it cannot happen again

An ended room was treated as litter. Once the last student closed their tab and
the host's socket dropped for a moment — a Wi-Fi blip, a sleeping laptop, a
backgrounded tab — the room counted as *abandoned* and was swept five minutes
later, results and all, while the teacher was still looking at the screen.

Three things changed:

- **Results are archived in the browser the moment a quiz ends**, and again
  after every re-mark. They survive a reload, a closed tab and a dead server.
- **The full gradebook is now built client-side**, so no export depends on the
  room still existing.
- **A finished room is no longer treated as abandoned.** It is kept for its
  full lifetime whether or not anyone is still connected.
