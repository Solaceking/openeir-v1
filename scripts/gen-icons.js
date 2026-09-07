// Generates OpenEir PWA icons from the founder's app icon art:
// cream rounded tile + teal-gradient cross pills + cream vitality circle.
import sharp from 'sharp'

const svgWrap = (inner) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0d9488"/>
      <stop offset="1" stop-color="#0f766e"/>
    </linearGradient>
  </defs>
  ${inner}
</svg>`

// The 80×80 cross mark, centered by mapping its midpoint (40,40) to (256,256).
// Founder's proportion: cross is 60/80 of the tile → scale 3.2 keeps it.
const crossAt = (scale) => `
  <g transform="translate(256,256) scale(${scale}) translate(-40,-40)">
    <rect x="30" y="10" width="20" height="60" rx="10" fill="url(#g)"/>
    <rect x="10" y="30" width="60" height="20" rx="10" fill="url(#g)" opacity="0.8"/>
    <circle cx="40" cy="40" r="6" fill="#FDFBF5"/>
  </g>`

// standard icon — cream tile with rounded corners
const iconSvg = () => svgWrap(`
  <rect width="512" height="512" rx="96" fill="#FDFBF5"/>
  ${crossAt(3.2)}`)

await sharp(Buffer.from(iconSvg())).resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp(Buffer.from(iconSvg())).resize(192, 192).png().toFile('public/icons/icon-192.png')

// maskable: full-bleed cream background, cross inside the 80% safe zone
const maskable = svgWrap(`
  <rect width="512" height="512" fill="#FDFBF5"/>
  ${crossAt(2.6)}`)
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile('public/icons/icon-512-maskable.png')
console.log('icons generated')
