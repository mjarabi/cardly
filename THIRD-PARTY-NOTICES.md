# Third-party notices

Cardly is built with the following software and data. Each part stays under its own license.
The full license texts come with each package (in `node_modules`, in the installer's `resources` folder, and inside the voice model folder).
This list is a summary and is not legal advice.

| Component | Used for | License |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) (includes Chromium) | the application window and runtime | MIT, and the licenses listed in `LICENSES.chromium.html` inside the installed app |
| [electron-builder](https://www.electron.build/) | building the installer (not part of the app) | MIT |
| [KaTeX](https://katex.org/) | showing math formulas | MIT |
| [sql.js](https://github.com/sql-js/sql.js) | reading the Anki database | MIT |
| [JSZip](https://stuk.github.io/jszip/) | reading Anki package files | used under the MIT license (JSZip is dual licensed MIT or GPL-3.0) |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | running the natural offline voice | Apache-2.0 |
| Kokoro English voice model (v0.19, packaged for sherpa-onnx) | the natural offline voice | Apache-2.0 (the `LICENSE` file is inside the model folder) |
| [eSpeak NG](https://github.com/espeak-ng/espeak-ng) data (`espeak-ng-data`, part of the voice package) | turning words into sounds for the natural voice | GPL-3.0-or-later |

Notes

- The voice model and its data are separate files. They are not part of Cardly's own source code and are not covered by the Cardly license.
- The Online Library content written by other people stays their work; see the "Contributions" part of `LICENSE`.
- Exact versions are in `package-lock.json`.
