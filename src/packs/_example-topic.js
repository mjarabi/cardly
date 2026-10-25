/*
 * Example "word topic". Files in this folder whose name starts with "_" are ignored by the app.
 *
 * To make a real topic:
 *   1. Copy this file and name it  topic-yourname.js  (it must start with "topic-").
 *   2. Change the id, name, description and the sections.
 *   3. Restart the app. "Word Topics" appears in the sidebar when at least one topic exists.
 *
 * One row is one word:
 *   [word, part of speech, Persian meaning, definition, example 1, example 2, example 3]
 * The definition may also be an array of two short definitions when the word has two common meanings.
 */
const { topicPack } = require('../topicpack');

module.exports = topicPack('example', 'Example topic', 'A tiny topic that shows the file format.', [
  {
    name: 'First section',
    words: [
      ['apple', 'noun', 'سیب', 'a round fruit with red, green or yellow skin', 'She ate an apple after lunch.', 'This apple is very sweet.', 'He bought a bag of apples.'],
      ['bread', 'noun', 'نان', 'a food made from flour and water and baked in an oven', 'I buy fresh bread every morning.', 'He cut the bread into thick slices.', 'We had bread and cheese for lunch.']
    ]
  },
  {
    name: 'Second section',
    words: [
      ['river', 'noun', 'رود، رودخانه', 'a long natural stream of water that flows into the sea', 'The river is very wide here.', 'They walked along the river.', 'This river flows into the sea.'],
      ['mountain', 'noun', 'کوه', 'a very high hill', 'We climbed the mountain in two days.', 'The mountain is covered with snow.', 'They live in a small village near the mountain.']
    ]
  }
]);
