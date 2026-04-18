declare module 'imagetracerjs' {
  interface ImageTracerOptions {
    numberofcolors?: number;
    pathomit?: number;
    ltres?: number;
    qtres?: number;
    scale?: number;
    strokewidth?: number;
    [k: string]: unknown;
  }
  const ImageTracer: {
    imagedataToSVG(imageData: ImageData, options?: ImageTracerOptions): string;
  };
  export default ImageTracer;
}
