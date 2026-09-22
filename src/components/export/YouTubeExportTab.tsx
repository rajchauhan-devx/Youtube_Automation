import { useWorkspaceApi } from '../../services/workspaceApi';
import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Maximize,
  Download,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Youtube,
  UploadCloud,
  ExternalLink,
  RefreshCw,
  Sliders,
  Tag,
  FileText,
  Eye,
  Key,
  HelpCircle,
  Loader2,
  Film,
  Image as ImageIcon,
  CheckCircle,
} from 'lucide-react';
import { Field } from '../layout/Field';
import type { Script, GeneratedImage } from '../../data';

interface YouTubeChannelInfo {
  id?: string;
  title: string;
  avatar?: string;
  customUrl?: string;
  subscriberCount?: string;
  videoCount?: string;
}

interface YouTubeStatusResponse {
  configured: boolean;
  authenticated: boolean;
  channel: YouTubeChannelInfo | null;
  message?: string;
}

interface GeneratedMetadataResponse {
  titles: string[];
  description: string;
  tags: string[];
}

export function YouTubeExportTab({
  script,
  onUpdate,
  onNavigateToTimeline,
}: {
  script: Script | null;
  onUpdate: (patch: Partial<Script>) => void;
  onNavigateToTimeline?: () => void;
}) {
  // Video State
  const { fetch, profile, account } = useWorkspaceApi();
  const [renderedVideo, setRenderedVideo] = useState<string | null>(null);
  const [videoFilename, setVideoFilename] = useState<string | null>(null);
  const [videoResolution, setVideoResolution] = useState<string>(profile !== 'shorts' ? '1920x1080' : '1080x1920');
  const [checkingVideo, setCheckingVideo] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const oauthOrigin = useRef('');
  const oauthPopup = useRef<Window | null>(null);
  const oauthTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // YouTube OAuth & Connection State
  const [ytStatus, setYtStatus] = useState<YouTubeStatusResponse>({
    configured: false,
    authenticated: false,
    channel: null,
  });
  const [checkingYtStatus, setCheckingYtStatus] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  // Metadata Form State
  const initialData = script?.youtubeExport;
  const [title, setTitle] = useState(initialData?.title || script?.topicName || script?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [tagsText, setTagsText] = useState(initialData?.tags ? initialData.tags.join(', ') : '');
  const [privacyStatus, setPrivacyStatus] = useState<'public' | 'unlisted' | 'private'>(
    initialData?.privacyStatus || 'private'
  );
  const [categoryId] = useState(initialData?.categoryId || '22');
  const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<number>(
    initialData?.selectedThumbnailIndex ?? 0
  );

  // AI Generation State
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [generatingMetadata, setGeneratingMetadata] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generatingTags, setGeneratingTags] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Upload State
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState<{ videoId: string; videoUrl: string } | null>(
    initialData?.uploadedVideoId && initialData?.uploadedVideoUrl
      ? { videoId: initialData.uploadedVideoId, videoUrl: initialData.uploadedVideoUrl }
      : null
  );
  const [uploadError, setUploadError] = useState('');

  // 1. Fetch Rendered Video
  useEffect(() => {
    setRenderedVideo(null);
    setVideoFilename(null);
    if (!script?.id || !script.generatedImages?.length || !script.generatedAudio?.length) {
      setCheckingVideo(false);
      return;
    }
    const controller = new AbortController();
    setCheckingVideo(true);
    fetch(`/api/render/status/${script.id}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.videos && data.videos.length > 0) {
          const video = data.videos[0];
          setRenderedVideo(video.url);
          setVideoFilename(video.filename);
          if (video.resolution) {
            setVideoResolution(video.resolution);
          }
        } else {
          setRenderedVideo(null);
          setVideoFilename(null);
        }
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setCheckingVideo(false); });
    return () => controller.abort();
  }, [script?.id, script?.generatedImages?.length, script?.generatedAudio?.length]);

  // 2. Fetch YouTube Connection Status
  async function refreshYouTubeStatus() {
    setCheckingYtStatus(true);
    try {
      const res = await fetch('/api/youtube/status');
      const data: YouTubeStatusResponse = await res.json();
      setYtStatus(data);
    } catch {
      setYtStatus({ configured: false, authenticated: false, channel: null });
    } finally {
      setCheckingYtStatus(false);
    }
  }

  useEffect(() => {
    refreshYouTubeStatus();

    // Listen for OAuth popup success message
    function handleOAuthMessage(e: MessageEvent) {
      if (e.origin === oauthOrigin.current && e.source === oauthPopup.current && e.data?.type === 'youtube-connected' && e.data.accountId === account.id) {
        refreshYouTubeStatus();
      }
    }
    window.addEventListener('message', handleOAuthMessage);
    return () => { window.removeEventListener('message', handleOAuthMessage); if (oauthTimer.current) clearInterval(oauthTimer.current); };
  }, []);

  // Sync state to script prop
  function persistExportData(patch: Partial<NonNullable<typeof script>['youtubeExport']>) {
    if (!script?.id) return;
    const current = script.youtubeExport || {};
    const updated = { ...current, ...patch };
    onUpdate({ youtubeExport: updated });
  }

  // 3. Connect YouTube Account (Open Google OAuth window)
  async function handleConnectYouTube() {
    const popup = window.open('about:blank', `youtube-${account.id}`, 'width=600,height=700');
    if (!popup) { alert('Allow popups for this app to connect YouTube.'); return; }
    oauthPopup.current = popup;
    try {
      const res = await fetch('/api/youtube/auth-url');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get auth URL');
      oauthOrigin.current = data.callbackOrigin;
      popup.location.href = data.url;
      if (oauthTimer.current) clearInterval(oauthTimer.current);
      const started = Date.now();
      const interval = setInterval(() => {
        if (popup.closed || Date.now() - started > 10 * 60_000) {
          clearInterval(interval); oauthTimer.current = null;
          void refreshYouTubeStatus();
        }
      }, 1500);
      oauthTimer.current = interval;
    } catch (err) {
      popup.close();
      alert(err instanceof Error ? err.message : 'Could not connect YouTube account.');
    }
  }

  // Disconnect
  async function handleDisconnect() {
    if (!confirm('Disconnect your YouTube channel from TubeFlow?')) return;
    try {
      await fetch('/api/youtube/disconnect', { method: 'POST' });
      refreshYouTubeStatus();
    } catch (err) {
      console.error(err);
    }
  }

  // Save Client Credentials
  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!clientIdInput.trim() || !clientSecretInput.trim()) return;
    setSavingCreds(true);
    try {
      const res = await fetch('/api/youtube/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientIdInput, clientSecret: clientSecretInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save credentials');
      setShowConfigModal(false);
      refreshYouTubeStatus();
    } catch (err: any) {
      alert(err.message || 'Failed to save credentials');
    } finally {
      setSavingCreds(false);
    }
  }

  // 4. Generate AI Metadata (All or Per-Field)
  async function handleGenerateMetadata(field: 'all' | 'title' | 'description' | 'tags' = 'all') {
    if (!script) return;
    if (field === 'title') setGeneratingTitle(true);
    else if (field === 'description') setGeneratingDesc(true);
    else if (field === 'tags') setGeneratingTags(true);
    else setGeneratingMetadata(true);

    try {
      const res = await fetch('/api/youtube/generate-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: script.topicName || script.name || '',
          script: script.content || script.extractedScript || '',
          narration: script.narration || '',
          isShort: profile === 'shorts',
          field,
        }),
      });

      const data: GeneratedMetadataResponse = await res.json();
      if (!res.ok) throw new Error((data as any).error || 'Failed to generate metadata');

      if (data.titles && data.titles.length > 0) {
        setTitleOptions(data.titles);
        setTitle(data.titles[0]);
        persistExportData({ title: data.titles[0] });
      }

      if (data.description) {
        setDescription(data.description);
        persistExportData({ description: data.description });
      }

      if (data.tags && data.tags.length > 0) {
        const formatted = data.tags.join(', ');
        setTagsText(formatted);
        persistExportData({ tags: data.tags });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate YouTube SEO metadata');
    } finally {
      if (field === 'title') setGeneratingTitle(false);
      else if (field === 'description') setGeneratingDesc(false);
      else if (field === 'tags') setGeneratingTags(false);
      else setGeneratingMetadata(false);
    }
  }

  // Copy helper
  function copyToClipboard(text: string, fieldName: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  }

  // 5. Upload Video Directly
  async function handleUploadToYouTube() {
    if (!script?.id || !title.trim()) {
      alert('Please provide a video title before uploading.');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadProgress(10);
    setUploadStage('Preparing video payload and authenticating...');

    const images = script.generatedImages || [];
    const selectedImg = images.find((_, i) => i === selectedThumbnailIndex);
    const thumbnailFilename = selectedImg?.url ? selectedImg.url.split('/').pop() : undefined;

    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev < 40) {
          setUploadStage('Streaming high-definition video to YouTube...');
          return prev + 8;
        } else if (prev < 80) {
          setUploadStage('Processing title, description, and search tags...');
          return prev + 6;
        } else if (prev < 95) {
          setUploadStage('Applying custom thumbnail & setting privacy...');
          return prev + 2;
        }
        return prev;
      });
    }, 800);

    try {
      const parsedTags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptId: script.id,
          videoFilename: videoFilename || undefined,
          title,
          description,
          tags: parsedTags,
          privacyStatus,
          categoryId,
          thumbnailFilename,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setUploadProgress(100);
      setUploadStage('Upload Complete!');
      setUploadSuccess({ videoId: data.videoId, videoUrl: data.videoUrl });

      persistExportData({
        uploadedVideoId: data.videoId,
        uploadedVideoUrl: data.videoUrl,
        uploadedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setUploadError(err.message || 'YouTube upload failed');
    } finally {
      clearInterval(progressTimer);
      setUploading(false);
    }
  }

  // Ready images for thumbnail selection
  const readyImages = (script?.generatedImages || []).filter((img) => img.status === 'done' && img.url);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 md:p-6">
      {/* Top Banner: Status & Quick Actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-600/10 text-red-500 ring-1 ring-red-500/30">
            <Youtube className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              YouTube Export & Publishing Studio
              {renderedVideo && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  READY TO EXPORT
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400">
              Generate high-CTR titles and descriptions, package SEO tags, and publish directly to your channel.
            </p>
          </div>
        </div>

        {/* YouTube Channel Auth Status Pill */}
        <div className="flex items-center gap-3">
          {ytStatus.authenticated && ytStatus.channel ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
              {ytStatus.channel.avatar ? (
                <img
                  src={ytStatus.channel.avatar}
                  alt="Avatar"
                  className="h-6 w-6 rounded-full ring-1 ring-emerald-400"
                />
              ) : (
                <CheckCircle className="h-4 w-4 text-emerald-400" />
              )}
              <div className="text-left">
                <span className="block text-xs font-semibold text-emerald-200">
                  {ytStatus.channel.title}
                </span>
                <span className="block text-[10px] text-emerald-400/80">Channel Connected</span>
              </div>
              <button
                onClick={handleDisconnect}
                className="ml-2 text-[11px] text-gray-400 hover:text-red-300"
                title="Disconnect Channel"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {ytStatus.configured ? (
                <button
                  onClick={handleConnectYouTube}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition-colors hover:bg-red-700"
                >
                  <Youtube className="h-4 w-4" />
                  Connect YouTube Channel
                </button>
              ) : (
                <button
                  onClick={() => setShowConfigModal(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white"
                >
                  <Key className="h-3.5 w-3.5 text-amber-400" />
                  Setup Google OAuth
                </button>
              )}
              <button
                onClick={refreshYouTubeStatus}
                disabled={checkingYtStatus}
                className="rounded-lg border border-border p-2 text-gray-400 hover:bg-surface2 hover:text-white"
                title="Refresh Status"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checkingYtStatus ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (5 cols): Video Player, Details & Thumbnail Picker */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          {/* Video Preview Card */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <Film className="h-3.5 w-3.5 text-accent" />
                1. Rendered Video Preview
              </span>
              <span className="text-[11px] font-mono text-accent">
                {videoResolution === '1080x1920' ? '9:16 Shorts' : '16:9 Landscape'}
              </span>
            </div>

            <div className={`relative flex ${profile !== 'shorts' ? 'aspect-video' : 'aspect-[9/16] max-w-[290px]'} w-full mx-auto items-center justify-center overflow-hidden rounded-xl border border-border bg-black shadow-inner`}>
              {renderedVideo ? (
                <video
                  ref={videoRef}
                  src={renderedVideo}
                  controls
                  playsInline
                  className="h-full w-full object-contain"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center text-gray-500 bg-surface2/30">
                  <Film className="h-10 w-10 text-gray-600 mb-2" />
                  <p className="text-xs font-medium text-gray-300">No Rendered Video Found</p>
                  <p className="text-[11px] text-gray-500 mt-1 mb-3">
                    Render your final video first in the Timeline tab to preview and upload.
                  </p>
                  {onNavigateToTimeline && (
                    <button
                      onClick={onNavigateToTimeline}
                      className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30"
                    >
                      Go to Timeline & Render
                    </button>
                  )}
                </div>
              )}
            </div>

            {renderedVideo && (
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
                <span className="text-[11px] text-gray-400 truncate max-w-[180px]">
                  {videoFilename || 'video.mp4'}
                </span>
                <a
                  href={renderedVideo}
                  download={`youtube_${script?.id || 'video'}.mp4`}
                  className="flex items-center gap-1.5 rounded-md bg-surface2 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent transition-colors shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download MP4
                </a>
              </div>
            )}
          </div>

          {/* Thumbnail Selection Card */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <ImageIcon className="h-3.5 w-3.5 text-accent" />
                2. Video Thumbnail
              </span>
              <span className="text-[10px] text-gray-500">Select frame for cover</span>
            </div>

            {readyImages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-gray-500">
                No generated images available for thumbnail selection.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {readyImages.map((img, idx) => {
                  const isSelected = selectedThumbnailIndex === idx;
                  return (
                    <div
                      key={img.url || idx}
                      onClick={() => {
                        setSelectedThumbnailIndex(idx);
                        persistExportData({ selectedThumbnailIndex: idx });
                      }}
                      className={`group relative aspect-video cursor-pointer overflow-hidden rounded-lg border transition-all ${
                        isSelected
                          ? 'border-accent ring-2 ring-accent shadow-md'
                          : 'border-border opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img.url} alt={`Scene ${idx + 1}`} className="h-full w-full object-cover" />
                      {isSelected && (
                        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white shadow">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5 text-[9px] text-gray-200 truncate text-center">
                        Scene {idx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (7 cols): AI Metadata, SEO Suite & Publishing Actions */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          {/* Metadata Generator Box */}
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  3. YouTube SEO & Packaging Suite
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Algorithm-optimized title, description with hashtags, and search tags.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleGenerateMetadata()}
                disabled={generatingMetadata}
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow transition-all hover:opacity-90 disabled:opacity-40"
              >
                {generatingMetadata ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating SEO...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    ✨ Generate Viral Metadata with AI
                  </>
                )}
              </button>
            </div>

            {/* Video Title Input + AI Suggestions */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label className="font-semibold text-gray-300">Video Title</label>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] ${title.length > 90 ? 'text-amber-400' : 'text-gray-500'}`}>
                    {title.length}/100
                  </span>
                  <button
                    type="button"
                    onClick={() => handleGenerateMetadata('title')}
                    disabled={generatingTitle || generatingMetadata}
                    className="flex items-center gap-1 rounded bg-purple-600/20 px-2 py-0.5 text-[11px] font-medium text-purple-300 hover:bg-purple-600/30 disabled:opacity-50 transition-colors"
                    title="Generate viral title suggestions"
                  >
                    {generatingTitle ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-purple-400" />
                    )}
                    Auto-Generate
                  </button>
                  <button
                    onClick={() => copyToClipboard(title, 'title')}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
                  >
                    {copiedField === 'title' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={title}
                maxLength={100}
                onChange={(e) => {
                  setTitle(e.target.value);
                  persistExportData({ title: e.target.value });
                }}
                placeholder="Enter catchy YouTube video title..."
                className="w-full rounded-lg border border-border bg-bg px-3.5 py-2 text-sm text-white outline-none focus:border-accent"
              />

              {/* Title Options Pills if generated */}
              {titleOptions.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider">
                    AI Suggestions (Click to apply):
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {titleOptions.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setTitle(opt);
                          persistExportData({ title: opt });
                        }}
                        className={`text-left rounded-md border p-2 text-xs transition-colors flex items-center justify-between ${
                          title === opt
                            ? 'border-accent bg-accent/10 text-white font-medium'
                            : 'border-border/60 bg-surface2/40 text-gray-300 hover:bg-surface2'
                        }`}
                      >
                        <span className="truncate pr-2">{opt}</span>
                        {title === opt && <Check className="h-3 w-3 text-accent shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Video Description Textarea */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label className="font-semibold text-gray-300">Video Description & Hashtags</label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500">{description.length}/5000</span>
                  <button
                    type="button"
                    onClick={() => handleGenerateMetadata('description')}
                    disabled={generatingDesc || generatingMetadata}
                    className="flex items-center gap-1 rounded bg-purple-600/20 px-2 py-0.5 text-[11px] font-medium text-purple-300 hover:bg-purple-600/30 disabled:opacity-50 transition-colors"
                    title="Generate algorithm-optimized description"
                  >
                    {generatingDesc ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-purple-400" />
                    )}
                    Auto-Generate
                  </button>
                  <button
                    onClick={() => copyToClipboard(description, 'desc')}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
                  >
                    {copiedField === 'desc' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </button>
                </div>
              </div>
              <textarea
                rows={5}
                value={description}
                maxLength={5000}
                onChange={(e) => {
                  setDescription(e.target.value);
                  persistExportData({ description: e.target.value });
                }}
                placeholder="Include key hook, brief synopsis, timestamps, and hashtags like #shorts #history..."
                className="w-full rounded-lg border border-border bg-bg p-3 text-xs leading-relaxed text-white outline-none focus:border-accent font-sans"
              />
            </div>

            {/* Tags Input */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <label className="font-semibold text-gray-300">Video Tags (Comma Separated)</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerateMetadata('tags')}
                    disabled={generatingTags || generatingMetadata}
                    className="flex items-center gap-1 rounded bg-purple-600/20 px-2 py-0.5 text-[11px] font-medium text-purple-300 hover:bg-purple-600/30 disabled:opacity-50 transition-colors"
                    title="Generate high-volume search tags"
                  >
                    {generatingTags ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-purple-400" />
                    )}
                    Auto-Generate
                  </button>
                  <button
                    onClick={() => copyToClipboard(tagsText, 'tags')}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white"
                  >
                    {copiedField === 'tags' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    Copy Tags
                  </button>
                </div>
              </div>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => {
                  setTagsText(e.target.value);
                  const parsed = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                  persistExportData({ tags: parsed });
                }}
                placeholder="ancient mysteries, science, top 5, shorts, history"
                className="w-full rounded-lg border border-border bg-bg px-3.5 py-2 text-xs text-white outline-none focus:border-accent"
              />
            </div>

            {/* Publishing Settings (Privacy) */}
            <div className="pt-2 border-t border-border/50">
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">Privacy Status</label>
              <select
                value={privacyStatus}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setPrivacyStatus(val);
                  persistExportData({ privacyStatus: val });
                }}
                className="w-full sm:w-1/2 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
              >
                <option value="public">Public (Visible to Everyone)</option>
                <option value="unlisted">Unlisted (Anyone with link can view)</option>
                <option value="private">Private (Only you can view)</option>
              </select>
            </div>
          </div>

          {/* Publishing Execution Cards */}
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <UploadCloud className="h-3.5 w-3.5 text-accent" />
              4. Publish Video
            </span>

            {/* Upload Success Banner */}
            {uploadSuccess && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-white">Video Published to YouTube!</h4>
                    <p className="text-xs text-emerald-300">
                      Your video has been transferred directly to your YouTube channel.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <a
                    href={uploadSuccess.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Watch on YouTube: {uploadSuccess.videoUrl}
                  </a>
                  <a
                    href="https://studio.youtube.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/60"
                  >
                    Open YouTube Studio
                  </a>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {uploadError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Direct YouTube Upload Button */}
            <div className="flex flex-col gap-3">
              {ytStatus.authenticated ? (
                <button
                  onClick={handleUploadToYouTube}
                  disabled={uploading || !renderedVideo || !title.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 p-3.5 text-sm font-bold text-white shadow-lg hover:from-red-700 hover:to-rose-700 disabled:opacity-40 transition-all"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {uploadStage} ({uploadProgress}%)
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-5 w-5" />
                      Upload Directly to YouTube Channel ({ytStatus.channel?.title || 'Account'})
                    </>
                  )}
                </button>
              ) : (
                <div className="rounded-lg border border-border/80 bg-surface2/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white">Direct Upload Not Connected</span>
                    <p className="text-[11px] text-gray-400">
                      Connect your channel with Google OAuth to upload with one click.
                    </p>
                  </div>
                  <button
                    onClick={ytStatus.configured ? handleConnectYouTube : () => setShowConfigModal(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 shadow"
                  >
                    <Youtube className="h-4 w-4" />
                    {ytStatus.configured ? 'Connect Channel' : 'Configure Google OAuth'}
                  </button>
                </div>
              )}

              {/* Instant Manual Export Fallback (Always Available) */}
              <div className="rounded-lg border border-border/60 bg-surface2/20 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-gray-300">Fast Manual Upload via YouTube Studio</span>
                  <p className="text-[11px] text-gray-500">
                    Copies metadata and opens the YouTube Studio upload page in your browser.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      copyToClipboard(
                        `Title:\n${title}\n\nDescription:\n${description}\n\nTags:\n${tagsText}`,
                        'all'
                      );
                      window.open('https://studio.youtube.com/channel/videos/upload?d=pt', '_blank');
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface2 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-surface2/80 shadow-sm"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Copy All & Open YouTube Studio
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Google OAuth Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-400" />
                Configure YouTube OAuth Credentials
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-gray-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
              To upload directly from TubeFlow, create an OAuth 2.0 Client in your{' '}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                Google Cloud Console
              </a>{' '}
              with the <strong>YouTube Data API v3</strong> enabled, and set the Redirect URI to:{' '}
              <code className="text-gray-200 bg-surface2 px-1 rounded">
                http://localhost:3001/api/youtube/callback
              </code>
            </p>

            <form onSubmit={handleSaveCredentials} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Client ID</label>
                <input
                  type="text"
                  required
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  placeholder="xxxxx.apps.googleusercontent.com"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Client Secret</label>
                <input
                  type="password"
                  required
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                  placeholder="GOCSPX-xxxxx"
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCreds}
                  className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/80 disabled:opacity-40"
                >
                  {savingCreds ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
