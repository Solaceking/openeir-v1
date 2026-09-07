// Generates OpenEir PWA icons + logo.svg from Eir's round mascot portrait
// (public/mascot/eir-round-512.png — founder's art, circular alpha crop).
// Flat composition: cream tile, centered round portrait, no shadows.
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'

const MASCOT = 'public/mascot/eir-round-512.png'

const creamTile = (rx) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="#FDFBF5"/></svg>`
  )

// centered round portrait at a given diameter
const portraitAt = async (diameter) => sharp(MASCOT).resize(diameter, diameter).png().toBuffer()

async function buildIcon({ rx, mascotDiameter, size, out }) {
  const base = await sharp(creamTile(rx)).png().toBuffer()
  const portrait = await portraitAt(mascotDiameter)
  const inset = (512 - mascotDiameter) / 2
  const composed = await sharp(base)
    .composite([{ input: portrait, left: Math.round(inset), top: Math.round(inset) }])
    .png()
    .toBuffer()
  await sharp(composed).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
}

// standard icon — cream rounded tile, portrait at 78%
await buildIcon({ rx: 96, mascotDiameter: 400, size: 512, out: 'public/icons/icon-512.png' })
await buildIcon({ rx: 96, mascotDiameter: 400, size: 192, out: 'public/icons/icon-192.png' })

// maskable — full-bleed cream, portrait inside the 80% safe zone (410px circle)
await buildIcon({ rx: 0, mascotDiameter: 340, size: 512, out: 'public/icons/icon-512-maskable.png' })

// logo.svg — round mascot on the cream tile pad (README + generic embeds)
const b64 = readFileSync('public/mascot/eir-round-256.png').toString('base64')
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="100%" height="100%">
  <rect width="160" height="160" rx="28" fill="#FDFBF5" />
  <image x="16" y="16" width="128" height="128" href="data:image/png;base64,${b64}" />
</svg>
`
writeFileSync('public/logo.svg', logoSvg)

console.log('icons + logo.svg generated from Eir mascot')
