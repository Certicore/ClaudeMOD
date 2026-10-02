import { DEFAULT_COLOR, type Rgb } from './palette'

/** One Raster cell: a width-1 glyph, its color and its ground. */
export type Cell = {
  glyph: string
  fg: Rgb
  bg: Rgb
}

/** A cell with the terminal's own ground. */
export function cellOf(glyph: string, fg: Rgb, bg: Rgb = DEFAULT_COLOR): Cell {
  return { glyph, fg, bg }
}

/** A blank cell: a space on the terminal's own ground. */
export const BLANK: Cell = cellOf(' ', DEFAULT_COLOR)

/** `text` as cells, one per character, all in one color and ground. */
export function textCells(text: string, fg: Rgb, bg: Rgb = DEFAULT_COLOR): Cell[] {
  return [...text].map(glyph => cellOf(glyph, fg, bg))
}

/** `cells` cut or padded with blanks to exactly `width`. */
export function fitted(cells: readonly Cell[], width: number): Cell[] {
  const out = cells.slice(0, width)

  while (out.length < width) {
    out.push(BLANK)
  }

  return out
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 of `bytes`. */
export function base64Of(bytes: Uint8Array): string {
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    const left = bytes.length - i

    out += ALPHABET[(n >> 18) & 63]
    out += ALPHABET[(n >> 12) & 63]
    out += left > 1 ? ALPHABET[(n >> 6) & 63] : '='
    out += left > 2 ? ALPHABET[n & 63] : '='
  }

  return out
}

/**
 * The `cells` prop of a Raster for `rows` (row-major, each row as wide as
 * the first): little-endian u32 triplets `[codePoint, fg, bg]`, base64.
 */
export function encodeRows(rows: readonly (readonly Cell[])[]): string {
  const count = rows.reduce((sum, row) => sum + row.length, 0)
  const view = new DataView(new ArrayBuffer(count * 12))
  let offset = 0

  for (const row of rows) {
    for (const cell of row) {
      view.setUint32(offset, cell.glyph.codePointAt(0) ?? 0x20, true)
      view.setUint32(offset + 4, cell.fg >>> 0, true)
      view.setUint32(offset + 8, cell.bg >>> 0, true)
      offset += 12
    }
  }

  return base64Of(new Uint8Array(view.buffer))
}

/** The text a Raster's `cells` draw, row by row: what a test reads back. */
export function decodeText(cells: string, columns: number): string[] {
  const binary = atobBytes(cells)
  const view = new DataView(binary.buffer)
  const rows: string[] = []
  let row = ''

  for (let offset = 0; offset + 12 <= binary.length; offset += 12) {
    row += String.fromCodePoint(view.getUint32(offset, true))

    if ([...row].length === columns) {
      rows.push(row)
      row = ''
    }
  }

  return rows
}

function atobBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0
  let value = 0
  let index = 0

  for (const char of clean) {
    value = (value << 6) | ALPHABET.indexOf(char)
    bits += 6

    if (bits >= 8) {
      bits -= 8
      bytes[index] = (value >> bits) & 0xff
      index += 1
    }
  }

  return bytes
}
