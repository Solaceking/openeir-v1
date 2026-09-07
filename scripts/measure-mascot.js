// Measures the drawn circle bounds in the mascot art (non-cream pixel bbox)
import sharp from 'sharp'

const img = sharp('public/mascot/eir-512.png')
const { width, height } = await img.metadata()
const raw = await img.raw().toBuffer()
const ch = 3 // channels

let minX = width, minY = height, maxX = 0, maxY = 0
const isCream = (r, g, b) => r > 235 && g > 232 && b > 220 // cream bg tolerance

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * ch
    const r = raw[i], g = raw[i + 1], b = raw[i + 2]
    if (!isCream(r, g, b)) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
}
console.log({ width, height, minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 })
