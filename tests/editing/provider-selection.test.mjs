import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
const { structured, modelCapabilities, providerCredential, supportedEditingModel } = await import("../../server/dist/services/editing/providers.js");

const schema = z.strictObject({ label: z.string() });
function context() {
  return { signal: new AbortController().signal, job: { id: "provider-choice", usage: [] }, maxCalls: 3, persist() {} };
}

test("Gemini choice sends embedded images and validates JSON output", async () => {
  const original = globalThis.fetch;
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.equal(options.headers["x-goog-api-key"], "test-gemini-key");
    const body = JSON.parse(options.body);
    assert.equal(body.contents[0].parts[1].inline_data.data, "aW1hZ2U=");
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"label":"ready"}' }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3 } });
  };
  try {
    const ctx = context();
    assert.deepEqual(await structured(ctx, "analyze", "gemini-2.5-flash-lite", schema, {}, ["data:image/png;base64,aW1hZ2U="]), { label: "ready" });
    assert.equal(ctx.job.usage[0].prompt_tokens, 12);
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous;
  }
});

test("Groq and OpenCode choices use their own endpoints and credentials", async () => {
  const original = globalThis.fetch;
  const oldGroq = process.env.GROQ_API_KEY;
  const oldOpenCode = process.env.OPENCODE_API_KEY;
  process.env.GROQ_API_KEY = "test-groq-key";
  process.env.OPENCODE_API_KEY = "test-opencode-key";
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    const request = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, String(url).includes("groq") ? "Bearer test-groq-key" : "Bearer test-opencode-key");
    if (String(url).includes("groq") && request.model === "qwen/qwen3.8-27b")
      assert.equal(request.response_format.type, "json_object");
    if (String(url).endsWith("/responses")) {
      assert.equal(request.model, "muse-spark-1.3-contributor-free");
      return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: '{"label":"ready"}' }] }] });
    }
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"label":"ready"}' } }] });
  };
  try {
    for (const model of ["groq/openai/gpt-oss-120b", "groq/qwen/qwen3.8-27b", "opencode/mimo-v2.5-free", "opencode/muse-spark-1.3-contributor-free"])
      assert.deepEqual(await structured(context(), "analyze", model, schema, {}, ["data:image/png;base64,aW1hZ2U="]), { label: "ready" });
    assert.deepEqual(calls.map(url => new URL(url).host), ["api.groq.com", "api.groq.com", "opencode.ai", "opencode.ai"]);
    assert.equal(supportedEditingModel("opencode/not-a-model"), false);
    assert.equal(providerCredential("groq/openai/gpt-oss-120b"), "test-groq-key");
  } finally {
    globalThis.fetch = original;
    if (oldGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldGroq;
    if (oldOpenCode === undefined) delete process.env.OPENCODE_API_KEY; else process.env.OPENCODE_API_KEY = oldOpenCode;
  }
});

test("OpenCode free-tier denial explains why Artifacts cannot use that choice", async () => {
  const original = globalThis.fetch;
  const oldKey = process.env.OPENCODE_API_KEY;
  process.env.OPENCODE_API_KEY = "test-opencode-key";
  globalThis.fetch = async () => Response.json({ error: { type: "FreeTierError" } }, { status: 403 });
  try {
    await assert.rejects(
      structured(context(), "analyze", "opencode/mimo-v2.5-free", schema, {}),
      /restricts direct free-tier requests/,
    );
  } finally {
    globalThis.fetch = original;
    if (oldKey === undefined) delete process.env.OPENCODE_API_KEY; else process.env.OPENCODE_API_KEY = oldKey;
  }
});

test("Gemini overload reports a retryable provider failure", async () => {
  const original = globalThis.fetch;
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async () => Response.json({ error: { message: "high demand" } }, { status: 503 });
  try {
    await assert.rejects(
      structured(context(), "analyze", "gemini-3.6-flash", schema, {}),
      error => error.code === "PROVIDER_ERROR" && error.retryable && /temporarily overloaded/.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
    if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous;
  }
});
test("Artifacts rejects Groq text-only models and accepts its vision model", async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-groq-key";
  try {
    const textOnly = await modelCapabilities(undefined, "groq/openai/gpt-oss-120b");
    assert.equal(textOnly.ready, false);
    assert.match(textOnly.missing.join(" "), /lacks image input/);
    const vision = await modelCapabilities(undefined, "groq/qwen/qwen3.8-27b");
    assert.equal(vision.ready, true);
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous;
  }
});