import { mediaKindOf, probeAudio, probeImage, probeVideo } from '../engine/probe';
import { audioThumbnail, imageThumbnail, videoThumbnail } from '../engine/thumbnail';
import { newId } from '../timeline/model';
import type { MediaItem } from './media';
import { editor } from './store';

/**
 * Mengimpor berkas dari input atau seret-lepas. Berkas tetap di memori sebagai File dan
 * object URL; metadata dan thumbnail dibuat di perangkat ini.
 */
export function importFiles(files: Iterable<File>): void {
  const s = editor.get();
  const rejected: string[] = [];
  let firstKind: MediaItem['kind'] | null = null;
  let count = 0;

  for (const file of files) {
    const kind = mediaKindOf(file);
    if (!kind) {
      rejected.push(file.name);
      continue;
    }
    firstKind ??= kind;
    count += 1;
    const item: MediaItem = {
      id: newId('media'),
      kind,
      name: file.name,
      file,
      url: URL.createObjectURL(file),
      status: 'loading',
      duration: 0,
      width: 0,
      height: 0,
      hasAudio: kind !== 'image',
      thumbnail: null,
      exportable: true,
    };
    s.addMedia(item);
    void analyze(item);
  }

  if (firstKind) s.setLeftTab(firstKind === 'audio' ? 'audio' : 'media');
  const parts: string[] = [];
  if (count > 0) parts.push(count === 1 ? 'Satu berkas sedang dibaca.' : `${count} berkas sedang dibaca.`);
  if (rejected.length > 0) parts.push(`Tidak didukung: ${rejected.join(', ')}.`);
  if (parts.length > 0) s.announce(parts.join(' '));
}

async function analyze(item: MediaItem): Promise<void> {
  const { updateMedia, announce } = editor.get();
  try {
    if (item.kind === 'image') {
      const { bitmap, ...meta } = await probeImage(item.file);
      const thumbnail = await imageThumbnail(bitmap).catch(() => null);
      bitmap.close();
      updateMedia(item.id, { ...meta, thumbnail, status: 'ready' });
    } else if (item.kind === 'video') {
      const meta = await probeVideo(item.file, item.url);
      updateMedia(item.id, { ...meta, status: 'ready' });
      const thumbnail = await videoThumbnail(item.url, meta.duration).catch(() => null);
      updateMedia(item.id, { thumbnail });
    } else {
      const meta = await probeAudio(item.file, item.url);
      updateMedia(item.id, { ...meta, status: 'ready' });
      const thumbnail = await audioThumbnail(item.file);
      updateMedia(item.id, { thumbnail });
    }
    announce(`${item.name} siap dipakai.`);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Berkas tidak bisa dibaca.';
    updateMedia(item.id, { status: 'error', error: message });
    announce(`${item.name}: ${message}`);
  }
}
