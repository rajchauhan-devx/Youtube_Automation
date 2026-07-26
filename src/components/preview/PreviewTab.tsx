import { useState, useEffect, useRef } from 'react';
import { Sparkles, Copy, Check, AlertCircle, X } from 'lucide-react';
import type { Script, PipelineStep } from '../../data';

export function PreviewTab({ pipeline, script, onExtractAssets }: { pipeline: PipelineStep[]; script: Script | null; onExtractAssets?: () => void }) {
  const responseEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [script?.aiResponse]);

  function handleCopy() {
    if (script?.aiResponse) {
      navigator.clipboard.writeText(script.aiResponse).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  if (!script) {
    return <div className="flex h-full items-center justify-center text-gray-500">No script selected.</div>;
  }

  const responseStage = pipeline.find((p) => p.id === 'response') || ({} as PipelineStep);
  const isDone = responseStage.status === 'done';
  const hasAssets = (script.imagePrompts?.length ?? 0) > 0 || script.narration;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold">Preview</h3>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-gray-600" />
            <span className="text-xs text-gray-500">Topic:</span>
            <span className="text-xs text-white">{script.topicName || 'Not set'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDone && !hasAssets && onExtractAssets && (
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
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-gray-300 hover:bg-surface2"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy Response'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="rounded-lg bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-400">AI Response</h4>
            {responseStage.status === 'running' && (
              <span className="flex items-center gap-2 text-xs text-accent">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                Streaming...
              </span>
            )}
            {responseStage.status === 'done' && (
              <span className="flex items-center gap-2 text-xs text-green-400">
                <Check className="h-3 w-3" />
                Complete
              </span>
            )}
            {responseStage.status === 'error' && (
              <span className="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                Error
              </span>
            )}
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
            {script.aiResponse || responseStage?.outputPreview || (
              <span className="text-gray-500 italic">No response generated yet. Run a script to begin.</span>
            )}
            <div ref={responseEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
