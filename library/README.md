# Cardly online library

The files in this folder are the decks that people see on the **Online Library** page inside the app.
The app downloads them from GitHub when someone opens that page, so a new file shows up for every user without a new installer.

```
library/
  index.json           list of all files (built automatically, do not edit by hand)
  english/animals.json
  german/tiere.json     one file = one topic
  _examples/            examples; folders and files starting with "_" are ignored
```

Use one folder per language. The folder name is up to you.

## Adding a topic

1. Copy `_examples/example-english.json` (or `example-german.json`) into a language folder and rename it.
2. Change `id`, `name`, `language`, `lang`, `description` and the sections.
3. Check it:

```
node tools/build-library-index.js --check
```

4. Commit and push to the `main` branch. A GitHub workflow rebuilds `index.json` for you. (If you work offline, run `node tools/build-library-index.js` instead and commit the new `index.json` too.)

Changes are visible in the app after a few minutes (GitHub caches files for a short time). Users press **Refresh** on the Online Library page.

The repository must be public, and the `repository` field in `package.json` must point to it, for example `"repository": "github:yourname/cardly"`.

## File format

```json
{
  "id": "german-animals",
  "name": "Tiere",
  "language": "German",
  "lang": "de",
  "description": "Words about animals.",
  "sections": [
    {
      "name": "Haustiere",
      "words": [
        ["der Hund", "noun", "سگ", "ein Tier, das Menschen als Haustier halten",
         "Unser Hund bellt, wenn jemand kommt.",
         "Ich gehe jeden Abend mit dem Hund spazieren.",
         "Hunde sind sehr treue Tiere."]
      ]
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Short name made of letters, numbers and dashes. It must be different in every file and must never change later (cards remember it, so nothing is added twice). |
| `name` | The title users see. |
| `language` | The language name shown in the language filter, for example `English` or `German`. |
| `lang` | The language code used to read the cards aloud: `en`, `de`, `fr`, `es`, ... Users need a Windows voice for that language. The natural offline voice is English only. |
| `description` | One short sentence. |
| `sections` | One or more sections. Each becomes a sub-deck, and users add them one at a time. |

A **word** is a list: `[word, type, meaning, definition, example 1, example 2, example 3]`.
The definition may be a list of two or three short definitions when the word has more than one common meaning.
The back of the card shows the meaning, the definition and the examples. The meaning can be in any language.

If you want full control of a card, use `cards` instead of `words` in a section:

```json
{ "name": "Phrases", "cards": [ { "front": "Guten Morgen", "back": "صبح بخیر", "tags": ["greeting"] } ] }
```

Card text can use the normal Cardly markup (`**bold**`, `~~label~~`, `- list item`). Images and sound files are not supported in the library.

Limits: 300 files, 80 sections per file, 600 cards per section, 2000 characters per text.
A section name must not repeat inside a file, and a word must not repeat inside a section.

## Working together (for example a friend who writes German)

- **Give your friend access:** in the repository go to *Settings › Collaborators* and add them. They can then add files in the `german` folder directly on github.com (*Add file › Create new file*).
- **Or use a pull request:** your friend makes a copy (a fork), adds the file and sends a pull request. A check runs automatically and tells them if the file has a mistake. You press *Merge* when it looks good.

## What the app does with these files

- It only reads files; nothing from the user's own cards is sent anywhere.
- Every file is checked before it is shown. A file with a mistake is skipped, and the page lists what was skipped.
- The last downloaded copy is kept, so the page still works without internet.
