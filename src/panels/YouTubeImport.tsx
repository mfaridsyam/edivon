import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  cancelDownload,
  checkHelper,
  dismissDownload,
  lookupVideo,
  retryDownload,
  startDownload,
  useYouTube,
  type HelperStatus,
  type YtFormat,
  type YtJob,
} from '../state/youtube';
import { parseYouTubeId, youTubeThumb } from '../state/youtubeLink';
import { formatShort } from '../timeline/time';
import { Button, IconButton } from '../ui/Button';
import { Input, Progress, Segmented } from '../ui/Controls';
import { IconClose, IconDownload } from '../ui/icons';

const FORMATS = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mp3', label: 'MP3' },
] as const satisfies readonly { value: YtFormat; label: string }[];

function Thumb({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="yt-thumb">
      {!failed && <img src={youTubeThumb(id)} alt="" draggable={false} onError={() => setFailed(true)} />}
    </span>
  );
}

function Command({ children }: { children: string }) {
  return <code className="yt-code">{children}</code>;
}

/** Petunjuk bila helper belum berjalan atau alatnya belum lengkap. */
function HelperNote({ helper, onRecheck }: { helper: HelperStatus; onRecheck: () => void }) {
  if (helper.state === 'unknown') return null;
  if (helper.state === 'checking') return <p className="t-caption">Menghubungi helper YouTube…</p>;

  let body;
  if (helper.state === 'offline') {
    body = (
      <>
        <p className="t-body">
          Helper YouTube belum berjalan. Buka terminal di folder proyek, jalankan <Command>npm run yt</Command>, lalu biarkan
          terminalnya terbuka.
        </p>
        <p className="t-caption">Jika browser meminta izin mengakses perangkat di jaringan lokal, pilih Izinkan.</p>
      </>
    );
  } else if (helper.ytdlp === null) {
    body = (
      <p className="t-body">
        yt-dlp belum terpasang. Jalankan <Command>winget install yt-dlp.yt-dlp</Command>, lalu mulai ulang helper.
      </p>
    );
  } else if (helper.outdated) {
    body = (
      <p className="t-body">
        yt-dlp {helper.ytdlp} terlalu lama untuk YouTube. Jalankan <Command>winget upgrade yt-dlp.yt-dlp</Command>, lalu mulai
        ulang helper.
      </p>
    );
  } else if (!helper.ffmpeg) {
    body = (
      <p className="t-body">
        ffmpeg belum terpasang. Jalankan <Command>winget install yt-dlp.FFmpeg</Command>, lalu mulai ulang helper.
      </p>
    );
  } else {
    return null;
  }
  return (
    <div className="yt-note" role="status">
      {body}
      <Button onClick={onRecheck}>Periksa lagi</Button>
    </div>
  );
}

function phaseText(job: YtJob): string {
  switch (job.phase) {
    case 'starting':
      return 'Menghubungi helper…';
    case 'queued':
      return 'Menunggu giliran…';
    case 'preparing':
      return 'Membaca info video…';
    case 'downloading':
      return `Mengunduh ${Math.round(job.progress * 100)}%`;
    case 'processing':
      return job.format === 'mp3' ? 'Mengubah ke MP3…' : 'Menggabungkan video dan audio…';
    case 'transferring':
      return 'Memasukkan ke Klip…';
    case 'error':
      return 'Gagal';
  }
}

function phaseProgress(job: YtJob): number {
  if (job.phase === 'downloading') return job.progress;
  if (job.phase === 'processing' || job.phase === 'transferring') return 1;
  return 0;
}

function DownloadRow({ job }: { job: YtJob }) {
  const title = job.title || 'Video YouTube';
  const status = phaseText(job);
  return (
    <li className="yt-job">
      <Thumb id={job.videoId} />
      <div className="yt-job-body">
        <span className="media-name" title={title}>
          {title}
        </span>
        <span className="t-caption">
          {job.format.toUpperCase()} · {status}
        </span>
        {job.phase === 'error' ? (
          <>
            <span className="media-note media-note-error">{job.error}</span>
            <Button variant="ghost" className="yt-retry" onClick={() => retryDownload(job.key)}>
              Coba lagi
            </Button>
          </>
        ) : (
          <Progress value={phaseProgress(job)} label={`Unduhan ${title}`} valueText={status} />
        )}
      </div>
      {job.phase === 'error' ? (
        <IconButton label="Tutup" size="sm" onClick={() => dismissDownload(job.key)}>
          <IconClose size={14} />
        </IconButton>
      ) : (
        <IconButton label="Batalkan unduhan" size="sm" onClick={() => cancelDownload(job.key)}>
          <IconClose size={14} />
        </IconButton>
      )}
    </li>
  );
}

/**
 * Tempel link YouTube, pilih MP4 atau MP3, lalu unduh lewat helper lokal. Hasilnya masuk ke panel
 * sebagai media biasa yang bisa diseret ke timeline.
 */
export function YouTubeImport({ defaultFormat }: { defaultFormat: YtFormat }) {
  const [link, setLink] = useState('');
  const [format, setFormat] = useState<YtFormat>(defaultFormat);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const helper = useYouTube((s) => s.helper);
  const jobs = useYouTube((s) => s.jobs);
  const videoId = parseYouTubeId(link);
  const lookup = useYouTube((s) => (videoId ? s.lookups[videoId] : undefined));
  const ids = useId();
  const headingId = `${ids}-heading`;
  const hintId = `${ids}-hint`;

  useEffect(() => {
    if (videoId) void lookupVideo(videoId);
  }, [videoId]);

  const invalid = link.trim() !== '' && videoId === null;
  const live = lookup?.state === 'ready' && lookup.video.isLive;
  const blocked = lookup?.state === 'error' || live;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!videoId || blocked || busy) return;
    setBusy(true);
    const started = await startDownload(videoId, format);
    setBusy(false);
    if (started) {
      setLink('');
      setTouched(false);
    }
  };

  const recheck = async () => {
    if ((await checkHelper()) && videoId) void lookupVideo(videoId);
  };

  let hint = null;
  if (invalid && touched) {
    hint = <p className="media-note media-note-error">Tempel link satu video YouTube, misalnya youtube.com/watch?v=… atau youtu.be/….</p>;
  } else if (lookup?.state === 'loading') {
    hint = <p className="t-caption">Membaca info video…</p>;
  } else if (lookup?.state === 'error') {
    hint = <p className="media-note media-note-error">{lookup.error}</p>;
  } else if (lookup?.state === 'ready' && videoId) {
    const v = lookup.video;
    hint = (
      <div className="yt-preview">
        <Thumb id={videoId} />
        <div className="yt-job-body">
          <span className="media-name" title={v.title}>
            {v.title}
          </span>
          <span className="t-caption">
            {[v.channel, live ? 'Siaran langsung' : v.duration > 0 ? formatShort(v.duration) : ''].filter(Boolean).join(' · ')}
          </span>
          {live && <span className="media-note media-note-error">Siaran langsung belum bisa diunduh.</span>}
        </div>
      </div>
    );
  }

  return (
    <section className="bin-section yt" aria-labelledby={headingId}>
      <h3 id={headingId} className="t-label">
        Dari YouTube
      </h3>
      <form className="yt-form" noValidate onSubmit={(e) => void submit(e)}>
        <Input
          type="url"
          inputMode="url"
          placeholder="Tempel link YouTube"
          aria-label="Link YouTube"
          aria-invalid={(invalid && touched) || blocked || undefined}
          aria-describedby={hint ? hintId : undefined}
          autoComplete="off"
          spellCheck={false}
          value={link}
          onChange={(e) => setLink(e.currentTarget.value)}
          onPaste={() => setTouched(true)}
          onBlur={() => setTouched(true)}
        />
        {hint && <div id={hintId}>{hint}</div>}
        <div className="yt-actions">
          <Segmented label="Format unduhan" options={FORMATS} value={format} onChange={setFormat} />
          <Button type="submit" icon={<IconDownload />} disabled={!videoId || blocked || busy}>
            Unduh
          </Button>
        </div>
      </form>
      <HelperNote helper={helper} onRecheck={() => void recheck()} />
      {jobs.length > 0 && (
        <ul className="yt-jobs" aria-label="Unduhan YouTube">
          {jobs.map((job) => (
            <DownloadRow key={job.key} job={job} />
          ))}
        </ul>
      )}
    </section>
  );
}
