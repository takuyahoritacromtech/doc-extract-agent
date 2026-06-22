/** Media types we can send to the model, and how we recognise them from a path. */

export const SUPPORTED_MEDIA_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

/** Lower-cased file extension → media type. Single source of truth for both. */
export const EXTENSION_TO_MEDIA_TYPE: Readonly<Record<string, SupportedMediaType>> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * A document loaded into memory, ready to send to the extractor.
 * `base64` is the raw file bytes; it is treated as sensitive and never logged.
 */
export interface LoadedDocument {
  fileName: string;
  mediaType: SupportedMediaType;
  base64: string;
  sizeBytes: number;
}
