// Prepares Eir's mascot from the founder's upload:
//   upload/pasted_image_1788801122797.png  (1024×1024 flat vector portrait)
// → public/mascot/eir-512.png  (hero / splash / empty states)
// → public/mascot/eir-256.png  (avatars, voice overlay presence)
import sharp from 'sharp'
import { existsSync } from 'node:fs'

const SRC = 'upload/pasted_image_1788801122797.png'
if (!existsSync(SRC)) {
  console.error('mascot source not found:', SRC)
  process.exit(1)
}
await sharp(SRC).resize(512, 512).png({ compressionLevel: 9, palette: true }).toFile('public/mascot/eir-512.png')
await sharp(SRC).resize(256, 256).png({ compressionLevel: 9, palette: true }).toFile('public/mascot/eir-256.png')
console.log('mascot generated')
