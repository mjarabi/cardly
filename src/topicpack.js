/* Builds a "word topic" pack (for example Animals) from compact rows.
 * A row is:  [word, part of speech, Persian meaning, definition, example 1, example 2, example 3]
 * The definition may be an array of two short definitions when the word has two common meanings.
 * The back of the card looks like a small dictionary entry: Persian, simple English meaning(s), three examples. */

function toCard(topicId, subName, row, langTag) {
  const [word, pos, fa, def, ...examples] = row;
  const defs = Array.isArray(def) ? def : [def];
  const meaning = defs.length > 1 ? defs.map((d, i) => i + 1 + '. ' + d).join('\n') : defs[0];
  const back = [fa, meaning, examples.map((e) => '- ' + e).join('\n')].join('\n\n');
  return {
    front: word + '\n~~' + pos + '~~',
    back,
    sf: word, // the word is read aloud from the front; the English lines of the back are read as usual
    tags: [langTag || 'english', 'topic', topicId, subName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')].filter(Boolean)
  };
}

/** subs: [{ name, words: [row, ...] }] */
function topicPack(id, name, description, subs) {
  return {
    id: 'topic-' + id,
    kind: 'topic',
    name,
    description,
    decks: subs.map((s) => ({ name: s.name, cards: s.words.map((r) => toCard(id, s.name, r)) }))
  };
}

module.exports = { topicPack, toCard };
