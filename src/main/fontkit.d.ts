declare module 'fontkit' {
  interface FontCollection { fonts?: Array<{ familyName?: string }>; familyName?: string }
  interface Font { familyName: string; unitsPerEm: number; layout(text: string): { advanceWidth: number; glyphs: Array<{ xOffset: number; yOffset: number; path: { toSVG(): string } }> } }
  const fontkit: { openSync(path: string): Font | FontCollection }
  export default fontkit
}
