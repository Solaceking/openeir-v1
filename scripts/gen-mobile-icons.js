// OpenEir — generate Android launcher icons (adaptive layers + legacy) and the
// splash image from the Eir mascot. Run from the repo root: bun scripts/gen-mobile-icons.js
// Output lands in mobile/android/app/src/main/res/*.

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'public', 'mascot', 'eir-round-512.png')
const RES = path.join(__dirname, '..', 'mobile', 'android', 'app', 'src', 'main', 'res')
const BG = '#f7f2e9'

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const FG_DENSITIES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

async function main() {
  if (!fs.existsSync(SRC)) throw new Error('mascot source not found: ' + SRC)
  const mascot = sharp(SRC)

  for (const [dpi, px] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, 'mipmap-' + dpi)
    fs.mkdirSync(dir, { recursive: true })
    // legacy launcher icon: mascot on cream square (rounded corners come from masking)
    await sharp({ create: { width: px, height: px, channels: 4, background: BG } })
      .composite([{ input: await resize(SRC, Math.round(px * 0.82)), gravity: 'center' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'))
    await sharp({ create: { width: px, height: px, channels: 4, background: BG } })
      .composite([{ input: await resize(SRC, Math.round(px * 0.82)), gravity: 'center' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'))
  }

  // adaptive icon foreground: mascot at ~62% of the safe zone (108dp canvas)
  for (const [dpi, px] of Object.entries(FG_DENSITIES)) {
    const dir = path.join(RES, 'mipmap-' + dpi)
    fs.mkdirSync(dir, { recursive: true })
    await sharp({ create: { width: px, height: px, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await resize(SRC, Math.round(px * 0.62)), gravity: 'center' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'))
  }

  // adaptive icon background color + splash (centered logo on cream)
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`)
  const splashSize = 512
  const splash = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } })
    .composite([{ input: await resize(SRC, splashSize), gravity: 'center' }])
    .png()
    .toBuffer()
  const drawable = path.join(RES, 'drawable')
  fs.mkdirSync(drawable, { recursive: true })
  fs.writeFileSync(path.join(drawable, 'splash.png'), splash)

  console.log('mobile icons generated into', RES)
}

function resize(src, px) {
  return sharp(src).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
}

main().catch((e) => { console.error(e); process.exit(1) })
