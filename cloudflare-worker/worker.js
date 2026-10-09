/**
 * Upgraded Cloudflare Workers AI Image Generation Endpoint
 * Compatible with saurav-z/free-image-generation-api + FLUX.1 Schnell (12B)
 *
 * Setup in Cloudflare Dashboard:
 * 1. Create a Worker and paste this code into worker.js
 * 2. Bind Workers AI to variable name: AI
 * 3. Add secret/variable: API_KEY = your-secret-key
 */
const ALLOWED_MODELS = new Set([
  "@cf/black-forest-labs/flux-1-schnell",
  "@cf/leonardo/phoenix-1.0",
  "@cf/stabilityai/stable-diffusion-xl-base-1.0",
  "@cf/bytedance/stable-diffusion-xl-lightning",
  "@cf/lykon/dreamshaper-8-lcm",
]);

const DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export default {
  async fetch(request, env) {
    const authHeader = request.headers.get("Authorization") || "";
    const expectedAuth = `Bearer ${env.API_KEY}`;
    if (!env.API_KEY || authHeader !== expectedAuth) {
      return json({ error: "Unauthorized: Invalid or missing Bearer API_KEY" }, 401);
    }

    if (request.method === "GET") {
      return json({ ok: true, service: "cloudflare-workers-ai-image", defaultModel: DEFAULT_MODEL });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const body = await request.json();
      if (body && body.action === "ping") {
        return json({ ok: true, model: DEFAULT_MODEL });
      }

      const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        return json({ error: "Prompt is required" }, 400);
      }

      const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
      const isFlux = model.includes("flux");

      const aiInput = isFlux
        ? {
            prompt,
            steps: Math.min(8, Math.max(1, Number(body.steps) || 6)),
            ...(typeof body.seed === "number" ? { seed: body.seed } : {}),
          }
        : {
            prompt,
            width: Math.min(1536, Math.max(512, Number(body.width) || 1024)),
            height: Math.min(1536, Math.max(512, Number(body.height) || 1024)),
            num_steps: Math.min(40, Math.max(4, Number(body.num_steps || body.steps) || 20)),
            ...(typeof body.seed === "number" ? { seed: body.seed } : {}),
          };

      const result = await env.AI.run(model, aiInput);

      // FLUX models on Cloudflare Workers AI return { image: "<base64>" }
      if (result && typeof result === "object" && typeof result.image === "string") {
        const binaryStr = atob(result.image);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return new Response(bytes, {
          headers: { "Content-Type": "image/png", "X-Model-Used": model },
        });
      }

      // SDXL models return a binary ReadableStream
      return new Response(result, {
        headers: { "Content-Type": "image/png", "X-Model-Used": model },
      });
    } catch (err) {
      return json({ error: "Failed to generate image", details: err?.message || String(err) }, 500);
    }
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
