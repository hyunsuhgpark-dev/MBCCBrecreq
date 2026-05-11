import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// CRC32 table
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  crcTable[i] = c
}
function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function uint32be(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const d = Buffer.from(data)
  const crc = uint32be(crc32(Buffer.concat([t, d])))
  return Buffer.concat([uint32be(d.length), t, d, crc])
}

// MBC 브랜드 블루 #004F9A → R:0 G:79 B:154
function makePng(size, r, g, b) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const p = row + 1 + x * 3
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b
    }
  }
  const idat = deflateSync(raw)

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8  // bit depth
  ihdrData[9] = 2  // RGB (no alpha, smaller file)
  // compression=0, filter=0, interlace=0 already 0

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

writeFileSync(join(outDir, 'icon-192.png'), makePng(192, 0, 79, 154))
writeFileSync(join(outDir, 'icon-512.png'), makePng(512, 0, 79, 154))

console.log('✓ icon-192.png, icon-512.png 생성 완료 (MBC 블루 #004F9A)')
