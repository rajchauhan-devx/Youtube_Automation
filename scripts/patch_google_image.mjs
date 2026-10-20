import fs from 'node:fs';

const file = 'server/src/services/google-image.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace the NO_OUTPUT throw so that it falls back to candidate models and then a safe atmospheric prompt
const searchIndex = code.indexOf('if (!b64) {');
if (searchIndex !== -1) {
  const endIndex = code.indexOf('const imgBuffer = Buffer.from(b64', searchIndex);
  if (endIndex !== -1) {
    const originalBlock = code.slice(searchIndex, endIndex);
    const replacement = `if (!b64) {
      const textMsg = parts.map((p: any) => p.text || '').join(' ').trim();
      console.warn(\`[google-image] Safety filter or empty output on \${model} (\${textMsg}). Trying next model...\`);
      lastErrorText = textMsg;
      continue;
    }
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

  throw new ComfyError('NO_OUTPUT', lastErrorText || 'Google Cloud image generation returned no image data.');
`;
    code = code.slice(0, searchIndex) + replacement + code.slice(endIndex);
    fs.writeFileSync(file, code);
    console.log('Successfully applied safety fallback patch to google-image.ts');
  }
}
