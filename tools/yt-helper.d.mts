// Tipe untuk bagian helper yang diuji dari src/state/youtube.test.ts.
export const PORT: number;
export const PROGRESS_TEMPLATE: string;

export type LineEvent =
  | { type: 'streams'; count: number }
  | { type: 'stream' }
  | { type: 'progress'; fraction: number }
  | { type: 'processing' }
  | { type: 'error'; message: string };

export function parseLine(line: string): LineEvent | null;
export function friendlyError(raw: string): string;
export function versionAtLeast(version: string, min: string): boolean;
