declare module 'omggif' {
  export class GifWriter {
    constructor(buf: Uint8Array, width: number, height: number, options?: {
      palette?: number[]
      loop?: number
      background?: number
    })
    addFrame(
      x: number,
      y: number,
      w: number,
      h: number,
      indexed: Uint8Array | number[],
      opts?: { delay?: number; transparent?: number; disposal?: number; palette?: number[] },
    ): number
    end(): number
  }

  export class GifReader {
    constructor(buf: Uint8Array)
    width: number
    height: number
    numFrames(): number
    frameInfo(index: number): { delay: number; width: number; height: number; transparent_index: number | null }
    decodeAndBlitFrameRGBA(index: number, pixels: Uint8Array): void
  }
}
