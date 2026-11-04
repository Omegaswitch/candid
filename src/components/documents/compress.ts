"use client";

/**
 * Shrinks photos and screenshots in the browser before upload (browser-image-compression, in a
 * web worker): at most 2560 px on the long side, re-encoded at good quality, same format and name.
 * PDF, DOCX, XLSX and CSV are already compressed formats and are uploaded as they are.
 * The smaller of the original and the result is kept, so compression never makes a file worse.
 */
export async function compressForUpload(file: File, onProgress: (pct: number) => void): Promise<File> {
  if (!/^image\/(png|jpeg)$/.test(file.type) || file.size < 200 * 1024) return file;
  try {
    const { default: imageCompression } = await import("browser-image-compression");
    const out = await imageCompression(file, {
      maxWidthOrHeight: 2560,
      maxSizeMB: 2,
      initialQuality: 0.82,
      useWebWorker: true,
      // Served from our own origin (public/), so the worker needs no third-party CDN and fits the CSP.
      libURL: "/browser-image-compression.js",
      fileType: file.type,
      preserveExif: false, // drops GPS and camera data from photos
      onProgress,
    });
    return out.size < file.size ? new File([out], file.name, { type: file.type, lastModified: file.lastModified }) : file;
  } catch {
    return file; // compression is a bonus: on any failure the original uploads
  }
}
