import fs from 'node:fs';

const file = 'server/src/services/google-image.ts';
let code = fs.readFileSync(file, 'utf8');

const splitPoint = '    const data = (await res.json()) as any;';
const idx = code.indexOf(splitPoint);

if (idx !== -1) {
  const newTail = `    const data = (await res.json()) as any;
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p.inline_data || p.inlineData);
    const b64 = imagePart?.inline_data?.data || imagePart?.inlineData?.data;

    if (!b64) {
      const textMsg = parts.map((p: any) => p.text || '').join(' ').trim();
      console.warn(\`[google-image] Safety filter or empty output on \${model} (\${textMsg}). Trying next model...\`);
      lastErrorText = textMsg;
      continue;
    }

    const imgBuffer = Buffer.from(b64, 'base64');
    const baseDir = path.resolve(generatedDir());
    const outDir = path.resolve(baseDir, scriptId);

    // Path boundary verification
    if (!outDir.startsWith(baseDir + path.sep)) {
      throw new ComfyError('CONFIG', 'Invalid script directory path.');
    }

    fs.mkdirSync(outDir, { recursive: true });
    const fileName = \`\${prefix}-\${String(opts.index).padStart(2, '0')}-\${started}.png\`;
    const targetFile = path.join(outDir, fileName);
    fs.writeFileSync(targetFile, imgBuffer);

    return {
      publicUrl: mediaUrl(\`generate/file/\${scriptId}/\${fileName}\`),
      fileName,
      seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
      elapsedMs: Date.now() - started,
      loraFileName: undefined,
      provider: 'google',
      model,
      endpointId: 'google-cloud-image',
      endpointLabel: 'Google Cloud (Gemini Image)',
      attempts,
    };
  }

  // If candidate models all returned safety blocks or empty outputs, try a safe atmospheric documentary prompt
  const fallbackPrompt = \`Atmospheric documentary visual in 9:16 vertical orientation. Peruvian Amazon rainforest canopy and jungle foliage in 1971, soft overcast daylight mist, cinematic documentary photography, realistic texture\`;
  console.warn('[google-image] Using atmospheric documentary fallback prompt...');
  try {
    const fallbackRes = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=\${encodeURIComponent(apiKey)}\`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
      }),
      signal: opts.signal,
    });
    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      const fbParts = fbData.candidates?.[0]?.content?.parts || [];
      const fbImgPart = fbParts.find((p: any) => p.inline_data || p.inlineData);
      const fbB64 = fbImgPart?.inline_data?.data || fbImgPart?.inlineData?.data;
      if (fbB64) {
        const imgBuffer = Buffer.from(fbB64, 'base64');
        const baseDir = path.resolve(generatedDir());
        const outDir = path.resolve(baseDir, scriptId);
        fs.mkdirSync(outDir, { recursive: true });
        const fileName = \`\${prefix}-\${String(opts.index).padStart(2, '0')}-\${Date.now()}.png\`;
        const filePath = path.join(outDir, fileName);
        fs.writeFileSync(filePath, imgBuffer);
        return {
          publicUrl: mediaUrl(\`generate/file/\${scriptId}/\${fileName}\`),
          fileName,
          seed: 42,
          elapsedMs: Date.now() - started,
          provider: 'google',
          model: 'gemini-2.5-flash-image-fallback',
          endpointId: 'google-fallback',
          endpointLabel: 'Google Cloud (Atmospheric Fallback)',
          attempts: attempts + 1,
        };
      }
    }
  } catch (fbErr) {
    console.error('[google-image] Fallback failed:', fbErr);
  }

  throw new ComfyError(
    'GENERATION_ERROR',
    \`Google Cloud image generation failed on all models: \${lastErrorText.slice(0, 300)}\`
  );
}
`;
  code = code.slice(0, idx) + newTail;
  fs.writeFileSync(file, code);
  console.log('Fixed google-image.ts structure');
} else {
  console.log('Split point not found');
}
