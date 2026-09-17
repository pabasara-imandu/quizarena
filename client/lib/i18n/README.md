# Languages

Every string a student or teacher can read lives in `en.ts`, keyed by screen.
Components read them through `useT()`:

```tsx
const t = useT();
t('join.enter');                        // "Enter"
t('quiz.questionOf', { n: 3, total: 10 }); // "Question 3 of 10"
t.n('hl.ready', players.length);        // picks hl.ready_one / hl.ready_other
t.rich('reveal.answerWas', { answer: <b>Saturn</b> });
t.ordinal(3);                           // "3rd", or the language's own form
```

A second language is a second file with the same keys (`si.ts`, `ta.ts`). A
key it lacks falls back to English, so a partial dictionary is safe. The
language menu appears automatically once a dictionary has any strings in it;
the choice is per device, remembered, and defaults to the phone's own language.

## Editing words on the live site

`/admin` → Translations shows every key with its English and its translation and
lets an admin change it. Edits are saved through `app/api/i18n/[lang]` into
Netlify Blobs (a JSON file under `client/.data/` when running locally) and laid
over the built-in dictionary at runtime by `LanguageProvider`. Every entry is
checked by `overrides.ts` both when saved and when read, so nothing stored can
break a page. **Export edits** on that page, then
`node scripts/translation-import.mjs si edits.json`, makes them permanent in
`si.ts`.

## Adding a language

1. `node scripts/translation-prompt.mjs Tamil` writes two prompt files in
   `scripts/`. Paste each into a capable model as one message.
2. Save each reply to a file, then
   `node scripts/translation-import.mjs ta reply1.txt reply2.txt`.
   It checks every key and placeholder against `en.ts`, writes `ta.ts`, and
   lists anything still missing so it can be asked for.
3. Register the dictionary in `index.tsx` (`DICTS` and `LANGUAGES`), and if
   the script needs a font the app does not ship, add it in `app/layout.tsx`
   the way Noto Sans Sinhala is.

Sinhala and Tamil both depend on the zero-width joiner (U+200D) inside words;
the server's anti-spoofing filter deliberately keeps it.
