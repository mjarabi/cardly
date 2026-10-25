/*
 * Settings for building the Windows installer (npm run dist).
 *
 * Natural voice inside the installer:
 *   If a folder  bundled-voices/kokoro-en-v0_19  exists next to this file when you build,
 *   the voice model is packed into the installer and every user gets the natural voice
 *   without downloading anything. The installer is then about 400 MB bigger, and only the
 *   normal installer is built (a portable exe would unpack that much data on every start).
 *   Without that folder the installer stays small and users download the model themselves.
 */
const fs = require('fs');
const path = require('path');
const { findModelDir } = require('./src/tts-core');

const bundledVoices = path.join(__dirname, 'bundled-voices');
const withVoice = fs.existsSync(bundledVoices) && !!findModelDir(bundledVoices);
console.log(withVoice ? 'Natural voice model found: it will be included in the installer.' : 'No bundled voice model: building the small installer.');

const config = {
  appId: 'ir.cardly.app',
  productName: 'Cardly',
  copyright: 'Copyright © 2026 Mohammad Javad Arabi',
  files: ['main.js', 'preload.js', 'src/**/*', 'renderer/**/*', 'package.json'],
  asarUnpack: [
    'node_modules/sql.js/**/*',
    'node_modules/sherpa-onnx-node/**/*',
    'node_modules/sherpa-onnx-win-x64/**/*'
  ],
  win: {
    icon: 'build/icon.ico',
    target: withVoice ? [{ target: 'nsis', arch: ['x64'] }] : [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }],
    artifactName: '${productName}-Setup-${version}.${ext}'
  },
  portable: { artifactName: '${productName}-Portable-${version}.${ext}' },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Cardly',
    deleteAppDataOnUninstall: false
  }
};

// the license texts travel with the installed app
config.extraResources = [{ from: 'LICENSE', to: 'LICENSE.txt' }, { from: 'THIRD-PARTY-NOTICES.md', to: 'THIRD-PARTY-NOTICES.md' }];
if (withVoice) config.extraResources.push({ from: 'bundled-voices', to: 'voices', filter: ['**/*'] });

module.exports = config;
