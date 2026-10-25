/*
 * Example "starter pack". Files in this folder whose name starts with "_" are ignored by the app.
 *
 * To make a real pack:
 *   1. Copy this file and name it  yourname.js  (without a leading "_" and without the "topic-" prefix).
 *   2. Change the id, name, description and the sections (each section becomes a sub-deck).
 *   3. Restart the app. "Starter Packs" appears in the sidebar when at least one pack exists.
 *
 * Each card has: front, back, tags, and optionally sf / sb (the text that is read aloud for the
 * front / back; if left out, the visible text is read).
 * Cards are matched by their front text, so adding new cards to a pack later and pressing the
 * button again adds only the new ones.
 */
module.exports = {
  id: 'example',
  name: 'Example pack',
  description: 'A tiny pack that shows the file format.',
  decks: [
    {
      name: 'Section one',
      cards: [
        { front: 'hello\n~~interjection~~', back: 'سلام\n\nHello, how are you?', sf: 'hello', sb: 'Hello, how are you?', tags: ['example'] },
        { front: 'water\n~~noun~~', back: 'آب\n\nI drink water every day.', sf: 'water', sb: 'I drink water every day.', tags: ['example'] }
      ]
    }
  ]
};
