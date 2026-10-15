import {
  DEFAULT_ADJUST,
  DEFAULT_CROP,
  DEFAULT_TRANSFORM,
  createProject,
  type AudioClip,
  type ImageClip,
  type Project,
  type VideoClip,
} from './model';

export function video(id: string, start: number, duration: number, extra: Partial<VideoClip> = {}): VideoClip {
  return {
    id,
    type: 'video',
    trackId: 'track-video-1',
    start,
    duration,
    mediaId: 'm1',
    name: `${id}.mp4`,
    in: 0,
    sourceDuration: 10,
    speed: 1,
    volume: 1,
    hasAudio: true,
    transform: DEFAULT_TRANSFORM,
    adjust: DEFAULT_ADJUST,
    crop: DEFAULT_CROP,
    ...extra,
  };
}

export function image(id: string, start: number, duration: number, extra: Partial<ImageClip> = {}): ImageClip {
  return {
    id,
    type: 'image',
    trackId: 'track-video-1',
    start,
    duration,
    mediaId: 'img',
    name: `${id}.png`,
    transform: DEFAULT_TRANSFORM,
    adjust: DEFAULT_ADJUST,
    crop: DEFAULT_CROP,
    ...extra,
  };
}

export function audio(id: string, start: number, duration: number, extra: Partial<AudioClip> = {}): AudioClip {
  return {
    id,
    type: 'audio',
    trackId: 'track-audio-1',
    start,
    duration,
    mediaId: 'a1',
    name: `${id}.mp3`,
    in: 0,
    sourceDuration: 60,
    speed: 1,
    volume: 1,
    ...extra,
  };
}

export function projectWith(...clips: Project['clips']): Project {
  return { ...createProject(), clips };
}

/** Ringkasan [id, start, duration] per lajur, terurut, untuk asersi yang mudah dibaca. */
export function layout(project: Project, trackId = 'track-video-1'): [string, number, number][] {
  return project.clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start)
    .map((c) => [c.id, c.start, c.duration]);
}
