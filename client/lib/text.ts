/**
 * Count letters the way a reader does.
 *
 * A Sinhala or Tamil letter is often several code units - consonant, vowel
 * sign, joiner - so `.length` overcounts it two- or three-fold. The server
 * measures nicknames in graphemes; this keeps the phone's own check in step.
 */
const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

export function graphemeCount(text: string): number {
  if (segmenter) {
    let n = 0;
    for (const _ of segmenter.segment(text)) n++;
    return n;
  }
  return [...text].length;
}
