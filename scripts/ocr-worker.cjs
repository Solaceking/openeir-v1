// OpenEir — tesseract.js worker, run as an ISOLATED child process.
// Rationale: the WASM engine + traineddata costs several hundred MB of RAM;
// loading it inside the Next.js server process OOM-kills small hosts
// (observed on 4 GB sandboxes). A short-lived child keeps the server's
// memory flat and contains any native crash. Prints one JSON line:
//   {"ok":true,"text":"..."}   |   {"ok":false,"error":"..."}
'use strict';

process.on('uncaughtException', (err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message || err) }) + '\n');
  process.exit(0);
});
process.on('unhandledRejection', (err) => {
  process.stdout.write(JSON.stringify({ ok: false, error: String(err && err.message || err) }) + '\n');
  process.exit(0);
});

const IMAGE_PATH = process.argv[2];
if (!IMAGE_PATH) {
  process.stdout.write(JSON.stringify({ ok: false, error: 'missing image path argument' }) + '\n');
  process.exit(0);
}

(async () => {
  const { createWorker } = require('tesseract.js');
  const os = require('node:os');
  const path = require('node:path');
  const fs = require('node:fs');
  // keep the traineddata cache out of the project dir (survives across scans,
  // ignored by git, overridable for offline pre-seeding)
  const cachePath = process.env.OPENEIR_TESSDATA_CACHE
    || path.join(os.homedir(), '.cache', 'openeir', 'tessdata');
  fs.mkdirSync(cachePath, { recursive: true });
  const worker = await createWorker('eng', 1, { cachePath });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789/.,:mgdlbpmMGDLBPMLosvuer ',
      tessedit_pageseg_mode: '6',
    });
    const { data } = await worker.recognize(IMAGE_PATH);
    process.stdout.write(JSON.stringify({ ok: true, text: (data && data.text) || '' }) + '\n');
  } finally {
    await worker.terminate();
  }
  process.exit(0);
})();
