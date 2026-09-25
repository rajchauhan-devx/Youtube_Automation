import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
process.env.EDITING_PLANNER_MODEL = "ollama/fixture-vision";
process.env.EDITING_VISION_MODEL = "ollama/fixture-vision";
process.env.EDITING_REVIEW_MODEL = "ollama/fixture-vision";
delete process.env.OPENROUTER_API_KEY;
const { structured, modelCapabilities } = await import(
  "../../server/dist/services/editing/providers.js"
);
const { presenterState } = await import(
  "../../server/dist/services/presenter-state.js"
);
const { streamLocal } = await import("../../server/dist/services/ollama.js");
const schema = z.strictObject({ color: z.string() });
const context = (signal = new AbortController().signal) => ({
  signal,
  job: { id: "local-fixture", usage: [] },
  maxCalls: 3,
  persist: () => {},
});
function fakeProvider(reply, { vision = true } = {}) {
  const original = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    assert.ok(
      String(url).startsWith("http://127.0.0.1:11434/"),
      "all local requests stay on loopback",
    );
    assert.equal(options.headers?.Authorization, undefined);
    if (String(url).endsWith("/api/show"))
      return Response.json({
        capabilities: ["completion", ...(vision ? ["vision"] : [])],
      });
    if (String(url).endsWith("/api/generate"))
      return Response.json({ done: true });
    return reply(url, options);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
test("local vision sends raw image bytes and strict schema without an API key, records usage and unloads", async () => {
  const fake = fakeProvider(async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.messages[1].images, ["aW1hZ2U="]);
    assert.equal(body.format.additionalProperties, false);
    assert.equal(body.think, false);
    assert.equal(body.keep_alive, 0);
    assert.equal(presenterState.editingRequests, 1);
    return Response.json({
      done: true,
      done_reason: "stop",
      message: { content: '{"color":"blue"}' },
      prompt_eval_count: 20,
      eval_count: 8,
    });
  });
  try {
    const ctx = context();
    assert.deepEqual(
      await structured(
        ctx,
        "analyze",
        "ollama/fixture-vision",
        schema,
        { purpose: "fixture" },
        ["data:image/png;base64,aW1hZ2U="],
      ),
      { color: "blue" },
    );
    assert.equal(ctx.job.usage[0].prompt_tokens, 20);
    assert.equal(ctx.job.usage[0].completion_tokens, 8);
    assert.ok(fake.calls.at(-1).url.endsWith("/api/generate"));
    assert.equal(presenterState.editingRequests, 0);
    assert.equal((await modelCapabilities()).ready, true);
  } finally {
    fake.restore();
  }
});
test("nonvision models and oversized local input fail before inference", async () => {
  const fake = fakeProvider(
    () => {
      throw new Error("inference must not run");
    },
    { vision: false },
  );
  try {
    assert.equal((await modelCapabilities()).ready, false);
    await assert.rejects(
      structured(context(), "analyze", "ollama/fixture-vision", schema, {}, [
        "data:image/png;base64,aW1hZ2U=",
      ]),
      /does not support image/,
    );
    await assert.rejects(
      structured(context(), "plan", "ollama/fixture-vision", schema, {
        text: "x".repeat(100000),
      }),
      /context budget/,
    );
    assert.ok(fake.calls.every((call) => call.url.endsWith("/api/show")));
    assert.equal(presenterState.editingRequests, 0);
  } finally {
    fake.restore();
  }
});
test("local cancellation aborts inference, unloads the model and releases the GPU reservation", async () => {
  const controller = new AbortController();
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const fake = fakeProvider(async (_url, options) => {
    entered();
    return new Promise((_, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(new Error("aborted")),
        { once: true },
      ),
    );
  });
  try {
    const run = structured(
      context(controller.signal),
      "plan",
      "ollama/fixture-vision",
      schema,
      {},
    );
    await started;
    controller.abort();
    await assert.rejects(run, /cancelled/);
    assert.ok(fake.calls.at(-1).url.endsWith("/api/generate"));
    assert.equal(presenterState.editingRequests, 0);
  } finally {
    fake.restore();
  }
});
test("local malformed and truncated responses cannot become validated compositions", async () => {
  for (const [content, reason] of [
    ['{"wrong":true}', "stop"],
    ['{"color":"blue"}', "length"],
  ]) {
    const fake = fakeProvider(async () =>
      Response.json({ done: true, done_reason: reason, message: { content } }),
    );
    try {
      await assert.rejects(
        structured(context(), "plan", "ollama/fixture-vision", schema, {}),
      );
      assert.equal(presenterState.editingRequests, 0);
    } finally {
      fake.restore();
    }
  }
});
test("existing local script generation cannot overlap artifact GPU work", async () => {
  presenterState.editingRequests++;
  try {
    await assert.rejects(async () => {
      for await (const event of streamLocal({
        model: "ollama/qwen3.5:4b",
        messages: [],
      }))
        void event;
    }, /Wait for/);
  } finally {
    presenterState.editingRequests--;
  }
  assert.equal(presenterState.localRequests, 0);
});
