// Generates OpenEir PWA icons: white crossed pills + vitality node on a teal gradient tile.
import sharp from 'sharp'

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d9488"/>
      <stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${size === 512 ? 96 : 48}" fill="url(#bg)"/>
  <g>
    <rect x="216" y="80" width="80" height="352" rx="40" fill="#ffffff"/>
    <rect x="108" y="188" width="296" height="136" rx="68" fill="#ffffff" opacity="0.85"/>
    <circle cx="256" cy="256" r="34" fill="#0f766e"/>
  </g>
</svg>`

await sharp(Buffer.from(svg(512))).resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp(Buffer.from(svg(512))).resize(192, 192).png().toFile('public/icons/icon-192.png')
// maskable: all content inside the 80% safe zone, full-bleed background
const maskable = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d9488"/>
      <stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="0" fill="url(#bg)"/>
  <g transform="translate(256,256) scale(0.72) translate(-256,-256)">
    <rect x="216" y="80" width="80" height="352" rx="40" fill="#ffffff"/>
    <rect x="108" y="188" width="296" height="136" rx="68" fill="#ffffff" opacity="0.85"/>
    <circle cx="256" cy="256" r="34" fill="#0f766e"/>
  </g>
</svg>`
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icons/icon-512-maskable.png')
console.log('icons generated')
