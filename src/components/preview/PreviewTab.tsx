import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  Copy,
  ExternalLink,
  Search,
  Send,
  Sparkles,
  Square,
  User,
} from 'lucide-react';
import type { PipelineStep, Script } from '../../data';
import { copyTextToClipboard } from '../../lib/safe';

interface PreviewTabProps {
  pipeline: PipelineStep[];
  script: Script | null;
  onGenerate?: (prompt: string) => void;
  onStop?: () => void;
  onExtractAssets?: () => void;
  onExtractTimelineAssets?: () => void;
  onImportResponse?: (response: string, extract: boolean) => Promise<void>;
}

export function PreviewTab({
  pipeline,
  script,
  onGenerate,
  onStop,
  onExtractAssets,
  onImportResponse,
}: PreviewTabProps) {
  const responseEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [pastedResponse, setPastedResponse] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  async function importResponse(extract: boolean) {
    if (!pastedResponse.trim() || !onImportResponse || importing) return;
    setImporting(true);
    setImportError('');
    try {
      await onImportResponse(pastedResponse.trim(), extract);
      setShowImport(false);
      setPastedResponse('');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not save the response. Please try again.');
    } finally { setImporting(false); }
  }

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [script?.aiResponse, script?.researchData]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = prompt.trim();
    if (!value || !onGenerate) return;
    setPrompt('');
    onGenerate(value);
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  function handleCopy() {
    if (!script?.aiResponse) return;
    copyTextToClipboard(script.aiResponse).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!script) {
    return <div className="flex h-full items-center justify-center text-gray-500">No script selected.</div>;
  }

  const researchStage = pipeline.find((step) => step.id === 'research');
  const responseStage = pipeline.find((step) => step.id === 'response') || ({} as PipelineStep);
  const isResearching = researchStage?.status === 'running';
  const isDone = responseStage.status === 'done';
  const isGenerating = isResearching || responseStage.status === 'running';
  const extractionFailed = responseStage.status === 'error' && responseStage.summary === 'Asset extraction needs attention';
  const hasResponse = Boolean(script.aiResponse?.trim());
  const hasResearch = Boolean(script.researchData?.trim());
  const researchSources = Array.isArray(script.researchSources) ? script.researchSources : [];
  const hasPrompt = Boolean(script.topicName?.trim());

  return (
    <div className="mx-auto flex min-h-[calc(100vh-154px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface/40">
      <div className="flex items-center justify-between border-b border-border bg-surface/80 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Script Assistant</h3>
            <p className="text-xs text-gray-500">
              {isResearching
                ? 'Researching topic & script data…'
                : isGenerating
                  ? 'Generating a live response from researched data…'
                  : 'Ready'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {onImportResponse && <button type="button" onClick={() => setShowImport(!showImport)} disabled={isGenerating || importing}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2 disabled:opacity-40">
            Paste AI Response
          </button>}
          {(isDone || extractionFailed || hasResponse) && onExtractAssets && (
            <button
              onClick={onExtractAssets}
              disabled={isGenerating}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80 disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Extract Assets
            </button>
          )}
          <button
            onClick={handleCopy}
            disabled={!hasResponse}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {showImport && <div className="space-y-3 border-b border-border bg-bg/60 px-5 py-4">
        <label htmlFor="external-ai-response" className="block text-sm font-medium text-white">Response from another AI</label>
        <p className="text-xs text-gray-400">Paste the complete response from your browser AI, keeping the script, image prompts, scene tags and timeline format from your template.</p>
        {hasResponse && <p className="text-xs text-amber-400">Saving replaces the current response and resets its extracted assets and generated media.</p>}
        <textarea id="external-ai-response" value={pastedResponse} onChange={event => setPastedResponse(event.target.value)} disabled={importing} rows={12}
          placeholder="Paste the full AI response here…" className="w-full rounded-lg border border-border bg-bg p-3 text-sm text-white outline-none focus:border-accent" />
        {importError && <p role="alert" className="text-sm text-red-400">{importError}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setShowImport(false)} disabled={importing} className="rounded-md border border-border px-3 py-2 text-xs text-gray-300">Cancel</button>
          <button type="button" onClick={() => importResponse(false)} disabled={importing || isGenerating || !pastedResponse.trim()} className="rounded-md border border-border px-3 py-2 text-xs text-gray-300 disabled:opacity-40">Save Response</button>
          <button type="button" onClick={() => importResponse(true)} disabled={importing || isGenerating || !pastedResponse.trim()} className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-40">{importing ? 'Importing…' : 'Save & Extract Assets'}</button>
        </div>
      </div>}

      <div className="thin-scrollbar flex-1 overflow-y-auto px-4 py-7 sm:px-8">
        {!hasPrompt && !hasResponse && !isGenerating ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Sparkles className="h-6 w-6" />
            </div>
            <h4 className="text-base font-semibold">What should the next video be about?</h4>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">
              Enter a topic or a detailed request below. The AI will research the topic and script requirements first, then generate the live response using that data.
            </p>
          </div>
        ) : (
          <div className="space-y-7">
            {hasPrompt && (
              <div className="flex justify-end gap-3">
                <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-sm leading-relaxed text-white shadow-lg shadow-accent/5">
                  <p className="whitespace-pre-wrap">{script.topicName}</p>
                  {script.aiInstructions && (
                    <p className="mt-2 border-t border-white/20 pt-2 text-white/75">{script.aiInstructions}</p>
                  )}
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700 text-gray-200">
                  <User className="h-4 w-4" />
                </div>
              </div>
            )}

            {(hasResponse || hasResearch || isGenerating || responseStage.status === 'error' || responseStage.status === 'warning') && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0 max-w-[88%] flex-1">
                  {isResearching && (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-xs text-gray-200">
                      <Search className="h-4 w-4 shrink-0 animate-pulse text-accent" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">Researching topic &amp; script requirements first…</p>
                        <p className="mt-0.5 text-gray-400">
                          {researchStage?.summary || 'Gathering verified facts, chronology, story beats, and visual references before generating the script.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {hasResearch && (
                    <details className="mb-4 rounded-xl border border-border bg-bg/70 px-4 py-3 text-xs">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-gray-200">
                        <span className="flex items-center gap-2">
                          <BookOpen className="h-3.5 w-3.5 text-accent" />
                          <span>Researched Topic &amp; Script Data</span>
                          {researchSources.length > 0 && (
                            <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                              {researchSources.length} source{researchSources.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                          <Check className="h-3 w-3" /> Used in generation
                        </span>
                      </summary>
                      <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
                        {researchSources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {researchSources.map((src, idx) => {
                              const safeHref = typeof src.url === 'string' && /^https?:\/\//i.test(src.url) ? src.url : undefined;
                              return safeHref ? (
                                <a
                                  key={`${src.title}-${idx}`}
                                  href={safeHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-gray-300 hover:border-accent/50 hover:text-white"
                                >
                                  <span>{src.title}</span>
                                  <ExternalLink className="h-2.5 w-2.5 text-gray-500" />
                                </a>
                              ) : (
                                <span
                                  key={`${src.title}-${idx}`}
                                  className="inline-flex items-center rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-gray-300"
                                >
                                  {src.title}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-300">
                          {script.researchData}
                        </div>
                      </div>
                    </details>
                  )}

                  <div className="whitespace-pre-wrap text-sm leading-7 text-gray-200">
                    {script.aiResponse}
                    {isGenerating && !hasResponse && (
                      <span className="inline-flex items-center gap-1 py-2">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                      </span>
                    )}
                    {isGenerating && hasResponse && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-accent align-middle" />
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs">
                    {isGenerating && (
                      <span className="text-accent">
                        {isResearching
                          ? researchStage?.summary || 'Researching topic & script data…'
                          : responseStage.summary || 'Generating…'}
                      </span>
                    )}
                    {isDone && (
                      <span className="flex items-center gap-1 text-green-400">
                        <Check className="h-3 w-3" /> Complete
                      </span>
                    )}
                    {responseStage.status === 'warning' && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> {responseStage.summary}
                      </span>
                    )}
                    {responseStage.status === 'error' && (
                      <span className="flex items-center gap-1 text-red-400">
                        <AlertCircle className="h-3 w-3" /> {responseStage.outputPreview || responseStage.summary}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={responseEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border bg-surface/80 p-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-bg p-2 pl-4 shadow-xl focus-within:border-accent/70">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            disabled={isGenerating}
            rows={1}
            aria-label="Message AI Script Assistant"
            placeholder={
              isResearching
                ? 'Researching topic & script data…'
                : isGenerating
                  ? 'Generating response…'
                  : 'Describe the video you want to create…'
            }
            className="max-h-36 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-white outline-none placeholder:text-gray-600 disabled:cursor-not-allowed"
          />
          {isGenerating ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-black transition-colors hover:bg-gray-200"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!prompt.trim() || !onGenerate}
              title="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-gray-600">Press Enter to send · Shift+Enter for a new line</p>
      </form>
    </div>
  );
}
