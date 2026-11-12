import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-safety-'));
process.env.TUBEFLOW_DATA_DIR = tmpDir;

const {
  hasSpeakerDialogueTags,
  extractSpeakerName,
  isConversationalScript,
} = await import('../dist/services/conversational-types.js');
const {
  stripChannelEditorial,
  hasExplicitConversationalDirective,
  isConversationalVideoMode,
} = await import('../dist/services/channel-editorial.js');
const { SHORTS_MEDIA_TEMPLATE } = await import('../dist/services/shorts-production-template.js');
const { ancientDharmaEditorial } = await import('../dist/services/ancient-dharma-editorial.js');
const { buildFreePrompt, buildGenerationPrompt } = await import('../dist/services/script-generation.js');
const { buildResearchMessages } = await import('../dist/services/script-research.js');
const { parseSimpleTagPackage, isImageOnlyTemplate } = await import('../dist/services/simple-tag-package.js');
const { defaultAutoPilotSettings, AutoPilotSettingsSchema } = await import('../dist/services/autopilot-settings.js');
const { store } = await import('../dist/services/store.js');
const { startFlowJob } = await import('../dist/services/flow/jobs.js');
const { llmRouter } = await import('../dist/routes/llm.js');
const accounts = await import('../dist/services/accounts.js');
const topicNotes = await import('../dist/services/topic-notes.js');
const { editForRetention } = await import('../dist/services/retention.js');

test('hasSpeakerDialogueTags and extractSpeakerName ignore template/formatting labels and bracket headers', () => {
  assert.equal(hasSpeakerDialogueTags('[SCENE TITLE]\n[IMAGE or VIDEO]\n[कथा का भावपूर्ण समापन]'), false);
  assert.equal(hasSpeakerDialogueTags('Title: Karna Oath\nDuration: 8s\nEmotion: Grief\nContent: Story\nTone: Solemn\nText: Line\n- Sri Rama: "Demo line"'), false);
  assert.equal(hasSpeakerDialogueTags(ancientDharmaEditorial('shorts')), false);
  assert.equal(hasSpeakerDialogueTags(SHORTS_MEDIA_TEMPLATE), false);
  assert.equal(extractSpeakerName('[SCENE TITLE]\nTitle: Abhimanyu\nनदी तट पर युद्ध आरंभ हुआ।'), undefined);

  assert.equal(hasSpeakerDialogueTags('[राम]: हे लक्ष्मण, धीरज रखो।'), true);
  assert.equal(hasSpeakerDialogueTags('लक्ष्मण: भैया, यह कैसा अन्याय है!'), true);
  assert.equal(extractSpeakerName('[नताशा]: सुनो विक्रम!'), 'नताशा');
});

test('editorial rules and normal mixed scripts never trigger conversational video mode', () => {
  assert.equal(hasExplicitConversationalDirective(SHORTS_MEDIA_TEMPLATE, ''), false);
  assert.equal(hasExplicitConversationalDirective(SHORTS_MEDIA_TEMPLATE, 'NEVER invent dialogue from scripture'), false);
  assert.equal(isImageOnlyTemplate(SHORTS_MEDIA_TEMPLATE), false);
  assert.equal(stripChannelEditorial(SHORTS_MEDIA_TEMPLATE).includes('[ANCIENT DHARMA EDITORIAL RULES]'), false);

  const contaminatedMixedScript = {
    id: 'shorts_images_videos',
    name: 'Shorts · Images & Videos',
    prompts: [{ content: SHORTS_MEDIA_TEMPLATE }],
    narration: '[कुंती]: कर्ण, युद्ध रोकने से पहले यह सत्य सुनो।',
    autoPilotSettings: {
      voice: { provider: 'google', language: 'hi', voiceId: 'hi-IN-Chirp3-HD-Despina', rate: 0, pitch: 0, speed: 1 },
      media: { flowEnabled: true, videoOnly: false },
    },
  };
  assert.equal(isConversationalVideoMode({ script: contaminatedMixedScript }), false);

  const documentaryNamedDiscourse = {
    name: 'Krishna Gita Discourse',
    prompts: [{ content: SHORTS_MEDIA_TEMPLATE }],
    narration: 'कुरुक्षेत्र के मैदान में श्रीकृष्ण ने अर्जुन को गीता का उपदेश दिया।',
  };
  assert.equal(isConversationalScript(documentaryNamedDiscourse), false);

  const realScripts = JSON.parse(fs.readFileSync('server/data/scripts.json', 'utf8'));
  const dharmaConv = realScripts.find(s => s.id === 'usr_dharma_conversational_dialogue');
  const talevoraConv = realScripts.find(s => s.id === 'usr_talevora_conversational_dialogue');
  assert.equal(isConversationalVideoMode({ script: dharmaConv }), true);
  assert.equal(isConversationalVideoMode({ script: talevoraConv }), true);
  assert.equal(isConversationalScript(talevoraConv), true);
});

test('prompt builders do not inject FULL VIDEO ONLY into SHORTS_MEDIA_TEMPLATE or standard scripts', () => {
  const freePrompt = buildFreePrompt(SHORTS_MEDIA_TEMPLATE, 'Karna charity test', '', 60);
  const genPrompt = buildGenerationPrompt(SHORTS_MEDIA_TEMPLATE, 'Karna charity test', '', 60, 'shorts');
  const research = buildResearchMessages({
    topic: 'Karna charity test',
    template: SHORTS_MEDIA_TEMPLATE,
    instructions: 'Avoid inventing dialogue from scripture.',
    duration: 60,
  });

  for (const text of [freePrompt, genPrompt, research[1].content]) {
    assert.doesNotMatch(text, /FORCE FULL MULTI-CHARACTER CONVERSATION/i);
    assert.doesNotMatch(text, /FULL VIDEO MANDATE/i);
    assert.doesNotMatch(text, /FULL VIDEO ONLY/i);
    assert.doesNotMatch(text, /MULTI-CHARACTER CONVERSATIONAL DRAMA/i);
  }
});

test('parseSimpleTagPackage preserves mixed image scenes even if narration contains character quotes', () => {
  const mixedRaw = `
<script>
[कुंती]: कर्ण, तुम मेरे ज्येष्ठ पुत्र हो।
नदी के किनारे सूर्योदय की लालिमा फैल रही थी।
[कर्ण]: माता, आज यह सत्य बहुत देर से आया।
</script>
<video_prompt1>Slow cinematic push-in across misty Ganga riverbank at dawn, somber golden light, 9:16.</video_prompt1>
<image_prompt2>Sacred Vedic riverbank landscape at sunrise with oil lamps floating, wide establishing still shot.</image_prompt2>
<image_prompt3>Close-up of bronze armor plates gleaming in morning mist, stoic silent still portrait.</image_prompt3>
`;

  const mixedPlan = parseSimpleTagPackage(mixedRaw);
  assert.equal(mixedPlan.scenes.length, 3);
  assert.equal(mixedPlan.scenes[0].mediaType, 'video');
  assert.equal(mixedPlan.scenes[1].mediaType, 'image');
  assert.equal(mixedPlan.scenes[1].videoPrompt, undefined);
  assert.equal(mixedPlan.scenes[2].mediaType, 'image');
  assert.equal(mixedPlan.scenes[2].videoPrompt, undefined);

  const explicitConvPlan = parseSimpleTagPackage(mixedRaw, { forceAllVideo: true });
  assert.equal(explicitConvPlan.scenes.every(s => s.mediaType === 'video'), true);

  const imageOnlyPlan = parseSimpleTagPackage(mixedRaw, { isImageOnly: true, forceAllVideo: true });
  assert.equal(imageOnlyPlan.scenes.every(s => s.mediaType === 'image'), true);
});

test('llm /extract keeps mixed image scenes as images for Shorts Images & Videos', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/llm', llmRouter);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    store.add('scripts', {
      id: 'mixed_extract_check',
      name: 'Shorts · Images & Videos',
      prompts: [{ content: SHORTS_MEDIA_TEMPLATE }],
    });
    const rawText = `
<script>
[कुंती]: सुनो पुत्र, एक गंभीर सत्य है।
गंगा की लहरें शांत बह रही थीं।
</script>
<video_prompt1>Slow aerial dolly over misty Ganga waters at dawn, 9:16.</video_prompt1>
<image_prompt2>Ancient stone ghat steps in soft morning glow, still frame.</image_prompt2>
`;
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/llm/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId: 'mixed_extract_check', rawText, template: SHORTS_MEDIA_TEMPLATE }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.scenePlan.scenes[0].mediaType, 'video');
    assert.equal(data.scenePlan.scenes[1].mediaType, 'image');
    assert.equal(data.scenePlan.scenes[1].videoPrompt, undefined);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('startFlowJob never injects Hindi lip-sync voice prompts for non-conversational scripts using external TTS', async () => {
  const bRollPrompt = 'Slow dolly push-in across misty ancient stone temple courtyard at golden sunrise, drifting incense smoke, no text.';
  store.add('scripts', {
    id: 'mixed_broll_only',
    name: 'Shorts · Images & Videos',
    prompts: [{ content: SHORTS_MEDIA_TEMPLATE }],
    narration: '[कुंती]: कर्ण, यह कवच तुम्हारे प्राणों की रक्षा करेगा।',
    autoPilotSettings: {
      voice: { provider: 'google', language: 'hi', voiceId: 'hi-IN-Chirp3-HD-Despina', rate: 0, pitch: 0, speed: 1 },
      media: { flowEnabled: true, videoOnly: false },
    },
    scenePlan: {
      scenes: [{
        id: 'scene_001',
        chapter: 'Scene 1',
        role: 'story',
        narration: '[कुंती]: कर्ण, यह कवच तुम्हारे प्राणों की रक्षा करेगा।',
        speaker: 'कुंती',
        mediaType: 'video',
        imagePrompt: bRollPrompt,
        videoPrompt: bRollPrompt,
      }],
    },
  });

  const nonConvJob = await startFlowJob({
    scriptId: 'mixed_broll_only',
    sceneIndex: 0,
    prompt: bRollPrompt,
    model: 'veo-3.1-fast',
    duration: 8,
    dryRun: true,
  });
  assert.doesNotMatch(nonConvJob.preview.promptWrapped, /natural lip-sync|delivering the spoken Hindi dialogue/i);

  store.add('scripts', {
    id: 'explicit_lip_sync',
    name: 'Short — Conversational Dialogue',
    conversational: true,
    isConversational: true,
    scenePlan: {
      scenes: [{
        id: 'scene_001',
        chapter: 'Scene 1',
        role: 'story',
        narration: '[लक्ष्मण]: भैया, मैं इस अन्याय को सहन नहीं करूँगा।',
        speaker: 'लक्ष्मण',
        mediaType: 'video',
        imagePrompt: bRollPrompt,
        videoPrompt: bRollPrompt,
      }],
    },
  });

  const convJob = await startFlowJob({
    scriptId: 'explicit_lip_sync',
    sceneIndex: 0,
    prompt: bRollPrompt,
    model: 'veo-3.1-fast',
    duration: 8,
    dryRun: true,
  });
  assert.match(convJob.preview.promptWrapped, /natural lip-sync, delivering the spoken Hindi dialogue/i);
});

test('defaultAutoPilotSettings and schema leave paid Flow and Flow Music opt-in by default', () => {
  const freshShorts = defaultAutoPilotSettings({ name: 'New Shorts Script', section: 'shorts' });
  const freshLong = defaultAutoPilotSettings({ name: 'New Long Script', section: 'long' });
  const parsed = AutoPilotSettingsSchema.parse(freshShorts);

  assert.equal(freshShorts.media.flowEnabled, false);
  assert.equal(freshShorts.media.videoOnly, false);
  assert.equal(freshShorts.flowMusic.enabled, false);
  assert.equal(freshLong.media.flowEnabled, false);
  assert.equal(freshLong.flowMusic.enabled, false);
  assert.equal(parsed.flowMusic.enabled, false);

  const convDefaults = defaultAutoPilotSettings({ name: 'Conv Short', section: 'shorts', conversational: true });
  assert.equal(convDefaults.media.flowEnabled, true);
  assert.equal(convDefaults.flowMusic.enabled, false);
});

test('startFlowJob strips accidental lip-sync articulation phrases from non-conversational prompts', async () => {
  const dirtyPrompt = 'Medium shot of sage Gautama looking calmly toward Ahilya, her lips moving in clear lip-sync articulation delivering the speech "हे प्रिये". Natural mouth and jaw movements in sync with the spoken Hindi words, clean vocal dialogue audio, ambient room tone, no background music. Golden morning rays filter through the ashram.';
  const nonConvStripped = await startFlowJob({
    scriptId: 'mixed_broll_only',
    sceneIndex: 0,
    prompt: dirtyPrompt,
    model: 'veo-3.1-fast',
    duration: 8,
    dryRun: true,
  });
  assert.doesNotMatch(nonConvStripped.prompt, /lip[-\s]?sync|delivering the (?:speech|spoken)|mouth and jaw movements|vocal dialogue audio/i);
  assert.doesNotMatch(nonConvStripped.preview.promptWrapped, /lip[-\s]?sync|delivering the (?:speech|spoken)|mouth and jaw movements|vocal dialogue audio/i);
  assert.match(nonConvStripped.prompt, /Medium shot of sage Gautama/i);
  assert.match(nonConvStripped.prompt, /Golden morning rays filter through the ashram/i);
  assert.match(nonConvStripped.prompt, /no speaking or mouth movement/i);
});

test('topic-notes profileGuidance and ancientDharmaEditorial do not force lip-sync or full-video mandates', () => {
  const dharmaAcct = accounts.createAccount('Ancient Dharma Copy');
  const talevoraAcct = accounts.createAccount('Talevora Suspense');
  const dharmaNotes = topicNotes.readTopicNotes(dharmaAcct.id);
  const talevoraNotes = topicNotes.readTopicNotes(talevoraAcct.id);

  assert.doesNotMatch(dharmaNotes.guidance, /multi-character conversation|pure story and character dialogue/i);
  assert.doesNotMatch(talevoraNotes.guidance, /STRICT LIP-SYNC MANDATE|ZERO NARRATOR|100% full video|<video_prompt>/i);

  for (const profile of ['shorts', 'long']) {
    const editorial = ancientDharmaEditorial(profile);
    assert.doesNotMatch(editorial, /Goosebumps|IMAGE-ONLY GRAPHIC NOVEL|GOOGLE FLOW MUSIC|DIALOGUE PHASE|Hanuman’s vow/i);
    assert.match(editorial, /For conversational multi-character episodes: dramatize the episode faithfully through living character dialogue/i);
    assert.match(editorial, /strictly NEVER include modern science, satellite imagery, or archaeology/i);
  }
});

test('editForRetention does not escalate all-video quoted non-conversational scripts into Flow lip-sync mode', async () => {
  const originalFetch = globalThis.fetch;
  const capturedBodies = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    capturedBodies.push(body);
    return Response.json({
      candidates: [{
        finishReason: 'STOP',
        content: {
          parts: [{
            text: JSON.stringify({
              notes: ['Tightened opening'],
              scenes: [{
                sceneId: 'scene_001',
                narration: '[कुंती]: कर्ण, यह सत्य सुन लो।',
                imagePrompt: 'Sunrise on Ganga riverbank.',
                videoPrompt: 'Slow dolly push-in across misty Ganga riverbank at sunrise, silent visual.',
                purpose: 'Reveal secret',
                motion: 'push-in',
                transition: 'cut',
              }],
            }),
          }],
        },
      }],
    });
  };
  try {
    const rawAllVideo = `
<script>
[कुंती]: कर्ण, यह सत्य सुन लो।
</script>
<video_prompt1>Slow dolly push-in across misty Ganga riverbank at sunrise.</video_prompt1>
`;
    const plan = {
      version: 1,
      topic: 'Karna and Kunti',
      createdAt: '2026-11-11T00:00:00.000Z',
      memoryEvidence: 'none',
      structure: 'Hook -> Reveal',
      viewerPromise: 'Truth at dawn',
      hooks: [{ openingLine: 'कर्ण, यह सत्य सुन लो।', openingVisual: 'Ganga', curiosity: 'What secret?', payoff: 'Oath', reason: 'Direct' }],
      selectedHookIndex: 0,
      titles: ['Karna and Kunti #Shorts', 'Kunti Truth #Shorts', 'River Oath #Shorts'],
      thumbnailConcept: 'Kunti and Karna by Ganga',
      description: 'Sacred episode #Shorts',
      tags: ['Shorts', 'Dharma'],
      musicMood: 'calm',
    };
    await editForRetention({
      raw: rawAllVideo,
      template: SHORTS_MEDIA_TEMPLATE,
      research: 'Mahabharata Udyoga Parva.',
      plan,
      model: 'gemini-2.5-flash',
      apiKey: 'test-key',
    });
    assert.equal(capturedBodies.length, 1);
    const joined = JSON.stringify(capturedBodies[0]);
    assert.doesNotMatch(joined, /STRICT ZERO NARRATOR MANDATE|FULL VIDEO ONLY|Google Flow character speech and natural lip-sync/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('persisted workspace scripts.json and topic-notes.json have safe opt-in defaults for non-conversational scripts', () => {
  const walk = (dir, match, out = []) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('accounts-test-')) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p, match, out);
      else if (ent.name === match) out.push(p);
    }
    return out;
  };

  for (const file of walk('server/data', 'topic-notes.json')) {
    const notes = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.doesNotMatch(notes.guidance || '', /STRICT LIP-SYNC MANDATE|ZERO NARRATOR|100% full video|through living multi-character conversation/i, `unsafe guidance in ${file}`);
  }

  for (const file of walk('server/data', 'scripts.json')) {
    const scripts = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const s of scripts) {
      if (isConversationalVideoMode({ script: s })) continue;
      assert.notEqual(s.autoPilotSettings?.media?.flowEnabled, true, `flowEnabled must be false on non-conv script ${s.id} in ${file}`);
      assert.notEqual(s.autoPilotSettings?.media?.videoOnly, true, `videoOnly must be false on non-conv script ${s.id} in ${file}`);
      assert.notEqual(s.autoPilotSettings?.flowMusic?.enabled, true, `flowMusic must be false on non-conv script ${s.id} in ${file}`);
    }
  }
});

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
