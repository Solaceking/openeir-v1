// Prepares Eir's mascot from the founder's upload:
//   upload/pasted_image_1788801122797.png  (1024×1024 flat vector portrait)
// → public/mascot/eir-512.png        (hero / splash / empty states, full art)
// → public/mascot/eir-256.png        (avatars, voice overlay presence, full art)
// → public/mascot/eir-round-512.png  (tight circular crop, alpha outside — LOGO)
// → public/mascot/eir-round-256.png  (round logo at UI sizes: sidebar, bubbles)
import sharp from 'sharp'
import { existsSync } from 'node:fs'

const SRC = 'upload/pasted_image_1788801122797.png'
if (!existsSync(SRC)) {
  console.error('mascot source not found:', SRC)
  process.exit(1)
}

await sharp(SRC).resize(512, 512).png({ compressionLevel: 9, palette: true }).toFile('public/mascot/eir-512.png')
await sharp(SRC).resize(256, 256).png({ compressionLevel: 9, palette: true }).toFile('public/mascot/eir-256.png')

// Round logo: crop to the drawn circle (in 512² art: left 49, top 44, ⌀414),
// then mask everything outside the circle to transparency so the portrait
// reads as a clean round badge on any surface.
const CROP = { left: 49, top: 44, width: 414, height: 414 }
const circleMaskSvg = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  )

for (const dim of [512, 256]) {
  const cropped = await sharp(SRC).resize(512, 512).extract(CROP).toBuffer()
  const mask = await sharp(circleMaskSvg(CROP.width)).png().toBuffer()
  const masked = await sharp(cropped).composite([{ input: mask, blend: 'dest-in' }]).toBuffer()
  await sharp(masked).resize(dim, dim).png({ compressionLevel: 9, palette: true }).toFile(`public/mascot/eir-round-${dim}.png`)
}

// tiny round variant — offline.html inline embed (base64) and micro-badges
{
  const cropped = await sharp(SRC).resize(512, 512).extract(CROP).toBuffer()
  const mask = await sharp(circleMaskSvg(CROP.width)).png().toBuffer()
  const masked = await sharp(cropped).composite([{ input: mask, blend: 'dest-in' }]).toBuffer()
  await sharp(masked).resize(128, 128).png({ compressionLevel: 9, palette: true }).toFile('public/mascot/eir-round-128.png')
}
console.log('mascot generated (full + round)')
