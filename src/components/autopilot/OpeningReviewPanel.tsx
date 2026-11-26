import { useRef, useState, type FormEvent } from 'react';
import type { OpeningApproval, OpeningReview } from '../../services/autoPilotTypes';

function localDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function OpeningReviewPanel({ review, onApprove, onEdit }: {
  review: OpeningReview;
  onApprove: (approval: OpeningApproval) => void;
  onEdit: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [title, setTitle] = useState(review.title);
  const initialSchedule = localDateTime(review.publishAt || '');
  const [schedule, setSchedule] = useState(initialSchedule);
  const [watched, setWatched] = useState(false);
  const [error, setError] = useState('');
  const scheduled = review.publishAt !== undefined;
  const approvedTitle = title.trim() && (/#shorts\b/i.test(title) ? title.trim() : `${title.trim()} #Shorts`);

  function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!watched || !approvedTitle || approvedTitle.length > 100) return;
    const time = Date.parse(schedule === initialSchedule ? review.publishAt || '' : schedule);
    if (scheduled && (!Number.isFinite(time) || time <= Date.now() + 5 * 60_000)) {
      setError('Choose a new publish time at least five minutes from now.');
      return;
    }
    onApprove({ title: approvedTitle, ...(scheduled ? { publishAt: new Date(time).toISOString() } : {}) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md">
      <form onSubmit={approve} role="dialog" aria-modal="true" aria-labelledby="opening-review-title"
        className="studio-card max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto border-borderSoft p-4 shadow-2xl sm:p-6">
        <h2 id="opening-review-title" className="text-lg font-bold text-white">Review your Short before upload</h2>
        <p className="mt-1 text-sm text-muted">Check that the first shot shows what the title promises and the opening gives viewers part of the answer.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <div className="space-y-2">
            <video ref={videoRef} src={review.videoUrl} controls playsInline preload="metadata" aria-label="Rendered opening preview"
              className="mx-auto aspect-[9/16] max-h-[50dvh] w-full max-w-[240px] rounded-xl border border-white/10 bg-black object-contain"
              onTimeUpdate={event => {
                const video = event.currentTarget;
                if (!Number.isFinite(video.duration) || video.seeking || video.currentTime < Math.min(10, video.duration)) return;
                video.pause();
                setWatched(true);
              }}
              onEnded={() => setWatched(true)}
              onError={() => setError('The preview could not load. Return to the timeline and check the render.')} />
            <button type="button" className="studio-btn-ghost w-full justify-center" onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.currentTime = 0;
              void video.play().catch(() => setError('The preview could not play. Try the video controls.'));
            }}>{watched ? 'Replay first 10 seconds' : 'Play first 10 seconds'}</button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="studio-label" htmlFor="opening-review-video-title">YouTube title</label>
              <input id="opening-review-video-title" className="studio-input" value={title} maxLength={100}
                onChange={event => setTitle(event.target.value)} />
              <p className={`mt-1 text-xs ${approvedTitle.length > 100 ? 'text-red-300' : 'text-muted'}`}>
                {approvedTitle.length > 100 ? 'Shorten the title to fit #Shorts.' : `${approvedTitle.length}/100 characters including #Shorts`}
              </p>
            </div>
            {scheduled ? (
              <div>
                <label className="studio-label" htmlFor="opening-review-schedule">Publish time (local)</label>
                <input id="opening-review-schedule" className="studio-input" type="datetime-local" required value={schedule}
                  onChange={event => { setSchedule(event.target.value); setError(''); }} />
              </div>
            ) : <p className="text-sm text-muted">Upload visibility <strong className="capitalize text-white">{review.visibility}</strong></p>}
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="studio-btn-primary disabled:opacity-50"
                disabled={!watched || !approvedTitle || approvedTitle.length > 100}>
                {scheduled ? 'Approve and schedule' : 'Approve and upload'}
              </button>
              <button type="button" className="studio-btn-ghost" onClick={onEdit}>Return to timeline</button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
