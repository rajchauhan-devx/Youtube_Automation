import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Send,
  Sparkles,
  Square,
  User,
} from 'lucide-react';
import type { PipelineStep, Script } from '../../data';

interface PreviewTabProps {
  pipeline: PipelineStep[];
  script: Script | null;
  onGenerate?: (prompt: string) => void;
  onStop?: () => void;
  onExtractAssets?: () => void;
}

export function PreviewTab({
  pipeline,
  script,
  onGenerate,
  onStop,
  onExtractAssets,
}: PreviewTabProps) {
  const responseEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [script?.aiResponse]);

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
    navigator.clipboard.writeText(script.aiResponse).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!script) {
    return <div className="flex h-full items-center justify-center text-gray-500">No script selected.</div>;
  }

  const responseStage = pipeline.find((step) => step.id === 'response') || ({} as PipelineStep);
  const isDone = responseStage.status === 'done';
  const isGenerating = responseStage.status === 'running';
  const hasResponse = Boolean(script.aiResponse?.trim());
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
            <p className="text-xs text-gray-500">{isGenerating ? 'Generating a live response…' : 'Ready'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDone && onExtractAssets && (
            <button
              onClick={onExtractAssets}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
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

      <div className="thin-scrollbar flex-1 overflow-y-auto px-4 py-7 sm:px-8">
        {!hasPrompt && !hasResponse && !isGenerating ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Sparkles className="h-6 w-6" />
            </div>
            <h4 className="text-base font-semibold">What should the next video be about?</h4>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-500">
              Enter a topic or a detailed request below. The response will appear here live as it is generated.
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

            {(hasResponse || isGenerating || responseStage.status === 'error' || responseStage.status === 'warning') && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0 max-w-[88%] flex-1">
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
                    {isGenerating && <span className="text-accent">{responseStage.summary || 'Generating…'}</span>}
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
            placeholder={isGenerating ? 'Generating response…' : 'Describe the video you want to create…'}
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
