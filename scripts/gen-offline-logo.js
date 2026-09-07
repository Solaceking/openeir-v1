// Injects Eir's round mascot (base64, tiny 128px variant) into public/offline.html
// so the offline page carries her even with zero network. Reproducible.
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const b64 = readFileSync('public/mascot/eir-round-128.png').toString('base64')
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenEir — offline</title>
<style>
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #FDFBF5; color: #134e4a;
         display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
  .card { text-align: center; max-width: 24rem; padding: 2rem; }
  .logo { width: 88px; height: 88px; margin: 0 auto 1rem; border-radius: 9999px; overflow: hidden;
          border: 1.5px solid rgba(15,118,110,.35); }
  .logo img { display: block; width: 100%; height: 100%; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { color: #4b7a75; font-size: .9rem; line-height: 1.55; }
  button { margin-top: 1.25rem; background: #0f766e; color: #fff; border: 0; border-radius: 10px;
           padding: .7rem 1.4rem; font-size: .95rem; cursor: pointer; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo" role="img" aria-label="OpenEir logo">
      <img src="data:image/png;base64,${b64}" alt="Eir" width="88" height="88">
    </div>
    <h1>You are offline</h1>
    <p>OpenEir could not reach your server. Any reading you record now is queued locally and will sync automatically the moment you are back online.</p>
    <button onclick="location.reload()">Try again</button>
  </div>
</body>
</html>
`
writeFileSync('public/offline.html', html)
console.log('offline.html rewritten with round Eir embed')
