import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubeflow-editorial-test-'));
process.env.TUBEFLOW_DATA_DIR = testDir;

const {
  identifyDocumentaryChannel,
  vetHighRetentionTopic,
} = await import('../dist/services/editorial/documentary-topic-vetter.js');

const {
  auditScriptRetention,
  runIterativeScriptDoctor,
} = await import('../dist/services/editorial/professional-script-doctor.js');

const {
  editForRetention,
  createRetentionPlan,
} = await import('../dist/services/retention.js');

after(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('identifyDocumentaryChannel accurately classifies channel profiles', () => {
  assert.equal(identifyDocumentaryChannel('Against the Odds', 'True survival documentaries'), 'against-the-odds');
  assert.equal(identifyDocumentaryChannel('Expedition Disaster Survival', 'Rescue in the arctic'), 'against-the-odds');
  assert.equal(identifyDocumentaryChannel('Ancient Dharma', 'Sanatana dharma and Vedic lore'), 'ancient-dharma');
  assert.equal(identifyDocumentaryChannel('Ramayana & Mahabharata Stories', 'Sacred epics'), 'ancient-dharma');
  assert.equal(identifyDocumentaryChannel('Space Mysteries', 'Cosmic discoveries and physics'), 'general-documentary');
});

test('vetHighRetentionTopic evaluates retention gates and builds 5-Act story map', async () => {
  const originalFetch = globalThis.fetch;
  const mockVettingResponse = {
    topic: '1972 Andes Flight 571: The 72-Day Glacial Siege',
    angle: 'A minute-by-minute survival autopsy of the impossible 72 days in the high cordillera',
    scorecard: {
      hookCuriosityScore: 24,
      pacingDensityScore: 23,
      stakesAndConflictScore: 25,
      sourceAndCanonDepthScore: 24,
      strengths: ['Immediate life-or-death predicament', 'Archival flight telemetry', 'Severe weather constraints'],
      weaknesses: [],
    },
    storyMap: {
      coreViewerPromise: 'Reveal how two untrained youths traversed 38 miles of glacial peaks with zero mountaineering gear',
      act1_hook: {
        timeframe: '0:00 - 1:30',
        name: 'The Impact and the Sub-Zero Trap',
        description: 'Aircraft shears wings at 11,000 feet, plunging into the Valley of Tears at -30°C.',
        retentionTrigger: 'Opening scene establishes depleting oxygen and freezing temperatures within 12 seconds.',
      },
      act2_escalation: {
        timeframe: '1:30 - 4:30',
        name: 'The Radio Silence and the Avalanche',
        description: 'On Day 11, a transistor radio reveals search teams have called off the search. Then an avalanche strikes.',
        retentionTrigger: 'Survivors realize no one is coming; nature removes their remaining shelter.',
      },
      act3_midpoint_reversal: {
        timeframe: '4:30 - 7:00',
        name: 'The False Summit of Mount Seler',
        description: 'Parrado climbs what he believes is the final ridge to Chile, only to see endless ice peaks.',
        retentionTrigger: 'Catastrophic complication at 5:30: the rescue route was completely wrong.',
      },
      act4_climax: {
        timeframe: '7:00 - 9:15',
        name: 'The Descent into Los Maitenes',
        description: 'After 10 days of marching, spotting Chilean arriero Sergio Catalan across the raging river.',
        retentionTrigger: 'Final physical exhaustion; message written on a stone tied with handkerchief.',
      },
      act5_payoff_outro: {
        timeframe: '9:15 - End',
        name: 'The Ledger of Survival and Ethical Reckoning',
        description: 'The return of the helicopters and the enduring human endurance lesson.',
        retentionTrigger: 'Honest historical reflection on the impossible decisions made.',
      },
      curiosityLoops: [
        {
          timestampApprox: '1:15',
          openQuestion: 'Why did the co-pilot falsely report passing Curicó?',
          promisedPayoff: 'Explained through cloud navigation logs at 3:45.',
        },
        {
          timestampApprox: '4:45',
          openQuestion: 'What allowed two starving men to scale a vertical 15,000-foot ice face?',
          promisedPayoff: 'The customized sleeping bag stitched from aircraft insulation revealed at 7:20.',
        },
      ],
    },
    searchTitleCandidates: [
      '72 Days in the Andes: The Survival Telemetry of Flight 571',
      'The Glacial Siege: How Flight 571 Defied Death in 1972',
    ],
    thumbnailVisualHook: 'Two figures in torn parkas staring across endless jagged Andean glaciers from a sheared fuselage.',
    reason: 'Documented archival telemetry with high-stakes survival dilemmas and verifiable timeline.',
  };

  globalThis.fetch = async () =>
    Response.json({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify(mockVettingResponse) }] },
        },
      ],
    });

  try {
    const result = await vetHighRetentionTopic({
      topic: '1972 Andes Flight 571',
      channelName: 'Against the Odds',
      channelGuidance: 'True survival and disaster resilience documentaries',
      duration: 600,
      model: 'gemini-3.6-flash',
      apiKey: 'test-api-key',
    });

    assert.equal(result.channel, 'against-the-odds');
    assert.equal(result.topic, mockVettingResponse.topic);
    assert.equal(result.scorecard.totalScore, 96);
    assert.equal(result.scorecard.verdict, 'exceptional');
    assert.equal(result.storyMap.act1_hook.timeframe, '0:00 - 1:30');
    assert.equal(result.storyMap.act3_midpoint_reversal.timeframe, '4:30 - 7:00');
    assert.equal(result.storyMap.curiosityLoops.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('auditScriptRetention detects flaws and assesses all 4 YouTube Retention Gates', async () => {
  const originalFetch = globalThis.fetch;

  const mockAuditReport = {
    gate1_hook: {
      score: 18,
      findings: ['Scene 1 opens with generic historical throat-clearing instead of immediate peril.'],
      flawedSceneIds: ['scene_001'],
    },
    gate2_curiosityChain: {
      score: 20,
      findings: ['Dead zone between scenes 3 and 4 where narrative tension stalls for 50 seconds.'],
      flawedSceneIds: ['scene_003', 'scene_004'],
    },
    gate3_dictionAndCadence: {
      score: 19,
      findings: ['Sentences in Scene 2 contain fabricated survivor thoughts not in official logs.'],
      flawedSceneIds: ['scene_002'],
    },
    gate4_climaxAndOutro: {
      score: 22,
      findings: ['Climax is well-placed, but outro uses an abrupt sign-off.'],
      flawedSceneIds: ['scene_006'],
    },
    deadZonesDetected: [
      {
        startSceneId: 'scene_003',
        endSceneId: 'scene_004',
        reason: 'Static background narration without forward obstacle or new telemetry.',
      },
    ],
    rewritePrescription:
      'Cut throat-clearing intro from scene_001; introduce altimeter telemetry directly in scene_002; eliminate dead zone in scenes 3-4 by adding radio failure.',
    scenesToRepair: ['scene_001', 'scene_002', 'scene_003', 'scene_004', 'scene_006'],
  };

  globalThis.fetch = async () =>
    Response.json({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify(mockAuditReport) }] },
        },
      ],
    });

  const testScenePlan = {
    version: 1,
    title: 'Andes Disaster',
    thumbnailPrompt: 'Fuselage in snow',
    scenes: [
      { id: 'scene_001', chapter: 'Act 1', role: 'story', mediaType: 'image', narration: 'Welcome back. Today we take a look at flight 571.', imagePrompt: 'Plane flying', duration: 10 },
      { id: 'scene_002', chapter: 'Act 1', role: 'story', mediaType: 'image', narration: 'The pilot thought he was having a terrible feeling.', imagePrompt: 'Cockpit', duration: 10 },
      { id: 'scene_003', chapter: 'Act 2', role: 'story', mediaType: 'image', narration: 'Snow was falling outside the mountains.', imagePrompt: 'Mountains', duration: 25 },
      { id: 'scene_004', chapter: 'Act 2', role: 'story', mediaType: 'image', narration: 'It was very cold and quiet for days.', imagePrompt: 'Cold snow', duration: 30 },
      { id: 'scene_005', chapter: 'Act 3', role: 'story', mediaType: 'image', narration: 'They decided to hike east.', imagePrompt: 'Hikers', duration: 15 },
      { id: 'scene_006', chapter: 'Act 5', role: 'story', mediaType: 'image', narration: 'In conclusion, they survived. Bye.', imagePrompt: 'Helicopter', duration: 10 },
    ],
  };

  try {
    const report = await auditScriptRetention({
      scenePlan: testScenePlan,
      channelName: 'Against the Odds',
      channelGuidance: 'True survival documentaries',
      model: 'gemini-3.6-flash',
      apiKey: 'test-api-key',
    });

    assert.equal(report.passNumber, 1);
    assert.equal(report.totalScore, 79);
    assert.equal(report.passed, false);
    assert.equal(report.deadZonesDetected.length, 1);
    assert.ok(report.scenesToRepair.includes('scene_001'));
    assert.ok(report.scenesToRepair.includes('scene_003'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runIterativeScriptDoctor executes multi-pass audit and repair loop until high retention perfection (score >= 90)', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  const pass1Audit = {
    gate1_hook: { score: 19, findings: ['Opening scene needs sharper hook'], flawedSceneIds: ['scene_001'] },
    gate2_curiosityChain: { score: 20, findings: ['Scene 2 pacing lags'], flawedSceneIds: ['scene_002'] },
    gate3_dictionAndCadence: { score: 20, findings: ['Word count too heavy in scene 1'], flawedSceneIds: ['scene_001'] },
    gate4_climaxAndOutro: { score: 21, findings: ['Outro CTA needs seamless transition'], flawedSceneIds: ['scene_003'] },
    deadZonesDetected: [],
    rewritePrescription: 'Sharpen scene 1 hook, punch up scene 2 telemetry, streamline scene 3 outro.',
    scenesToRepair: ['scene_001', 'scene_002', 'scene_003'],
  };

  const pass1Repairs = {
    repairedScenes: [
      {
        id: 'scene_001',
        narration: 'At 15:34, Flight 571 vanishes from radar into an impenetrable Andean blizzard.',
        imagePrompt: 'A radar screen blinking with lost transponder signal over jagged Andean peaks, documentary realism.',
        explanationOfFix: 'Eliminated fluff and opened directly with radar loss timestamp.',
      },
      {
        id: 'scene_002',
        narration: 'Inside the fuselage, cabin pressure plummets as the right wing shears against the glacial ridge.',
        imagePrompt: 'Severe turbulence inside passenger cabin with sheared aluminum fuselage in blizzard wind.',
        explanationOfFix: 'Added physical constraints and immediate kinetic tension.',
      },
      {
        id: 'scene_003',
        narration: 'After 72 days on the ice, how would you decide when the wait for rescue becomes a death sentence?',
        imagePrompt: 'Rescue helicopter approaching snowfield with survivors waving, cinematic documentary photography.',
        explanationOfFix: 'Replaced abrupt sign-off with engaging case-specific viewer question.',
      },
    ],
  };

  const pass2Audit = {
    gate1_hook: { score: 24, findings: ['Compelling immediate timestamp hook'], flawedSceneIds: [] },
    gate2_curiosityChain: { score: 24, findings: ['Flawless escalation and pacing continuity'], flawedSceneIds: [] },
    gate3_dictionAndCadence: { score: 24, findings: ['Clinical present-tense documentary diction'], flawedSceneIds: [] },
    gate4_climaxAndOutro: { score: 23, findings: ['Seamless outro with thought-provoking ethical question'], flawedSceneIds: [] },
    deadZonesDetected: [],
    rewritePrescription: 'None. Master script verified.',
    scenesToRepair: [],
  };

  globalThis.fetch = async () => {
    callCount++;
    // Call 1: Pass 1 Audit (score: 80)
    if (callCount === 1) {
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(pass1Audit) }] } }],
      });
    }
    // Call 2: Repair Flawed Scenes
    if (callCount === 2) {
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(pass1Repairs) }] } }],
      });
    }
    // Call 3: Pass 2 Audit (score: 95)
    return Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(pass2Audit) }] } }],
    });
  };

  const initialPlan = {
    version: 1,
    title: 'Flight 571',
    thumbnailPrompt: 'Fuselage in snow',
    scenes: [
      { id: 'scene_001', chapter: 'Act 1', role: 'story', mediaType: 'image', narration: 'Welcome to this documentary about flight 571.', imagePrompt: 'Plane', duration: 10 },
      { id: 'scene_002', chapter: 'Act 2', role: 'story', mediaType: 'image', narration: 'It was very dangerous for the passengers.', imagePrompt: 'Inside', duration: 10 },
      { id: 'scene_003', chapter: 'Act 5', role: 'story', mediaType: 'image', narration: 'Thanks for watching. Don’t forget to subscribe.', imagePrompt: 'Rescue', duration: 10 },
    ],
  };

  try {
    const doctorResult = await runIterativeScriptDoctor({
      scenePlan: initialPlan,
      channelName: 'Against the Odds',
      channelGuidance: 'True survival documentaries',
      maxIterations: 3,
      model: 'gemini-3.6-flash',
      apiKey: 'test-api-key',
    });

    assert.equal(doctorResult.success, true);
    assert.equal(doctorResult.iterationsCount, 2);
    assert.equal(doctorResult.initialScore, 80);
    assert.equal(doctorResult.finalScore, 95);
    assert.equal(doctorResult.scoreProgression.length, 2);
    assert.deepEqual(doctorResult.scoreProgression, [
      { pass: 1, score: 80 },
      { pass: 2, score: 95 },
    ]);

    // Check that repaired scenes were incorporated
    assert.match(doctorResult.finalScenePlan.scenes[0].narration, /At 15:34, Flight 571 vanishes/);
    assert.match(doctorResult.finalScenePlan.scenes[1].narration, /cabin pressure plummets/);
    assert.match(doctorResult.finalScenePlan.scenes[2].narration, /how would you decide/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('editForRetention integrates the Script Doctor for documentary and long-form channels', async () => {
  const originalFetch = globalThis.fetch;
  let callIndex = 0;

  const mockEditOutput = {
    notes: ['Refined camera motions to push-in for suspense.'],
    scenes: [
      { sceneId: 'scene_001', narration: 'The Himalayas stand silent as wind screams at 40 knots.', imagePrompt: 'Mountain pass', purpose: 'Establish severe weather', motion: 'push-in', transition: 'cut' },
      { sceneId: 'scene_002', narration: 'Oxygen reserves drop below critical levels.', imagePrompt: 'Oxygen gauge', purpose: 'Telemetry constraint', motion: 'drift-in', transition: 'cut' },
    ],
  };

  const mockPass1Audit = {
    gate1_hook: { score: 23, findings: ['Strong visual opening'], flawedSceneIds: [] },
    gate2_curiosityChain: { score: 24, findings: ['Immediate escalation'], flawedSceneIds: [] },
    gate3_dictionAndCadence: { score: 23, findings: ['Tight cadence'], flawedSceneIds: [] },
    gate4_climaxAndOutro: { score: 22, findings: ['Clear focus'], flawedSceneIds: [] },
    deadZonesDetected: [],
    rewritePrescription: 'None. Meets standard.',
    scenesToRepair: [],
  };

  globalThis.fetch = async () => {
    callIndex++;
    if (callIndex === 1) {
      // 1. Initial edit
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(mockEditOutput) }] } }],
      });
    }
    // 2. Script Doctor Audit
    return Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(mockPass1Audit) }] } }],
    });
  };

  const plan = {
    version: 1,
    topic: 'K2 Winter Ascent',
    createdAt: new Date().toISOString(),
    structure: 'Predicament → Escalation → Payoff',
    hooks: [{ openingLine: 'The Himalayas stand silent.', openingVisual: 'K2 ridge', curiosity: 'Can they survive?', payoff: 'Descent to safety', reason: 'High stakes' }],
    selectedHookIndex: 0,
    titles: ['K2 at -50°C'],
    thumbnailConcept: 'K2 peak in storm',
    description: 'Documentary of K2 winter survival',
    tags: ['K2', 'Mountaineering'],
    musicMood: 'cinematic',
    memoryEvidence: '',
  };

  const rawScript = JSON.stringify({
    version: 1,
    title: 'K2 Winter',
    thumbnailPrompt: 'K2 peak',
    scenes: [
      { id: 'scene_001', chapter: 'Act 1', role: 'story', mediaType: 'image', narration: 'Initial scene 1', imagePrompt: 'K2 initial', duration: 15 },
      { id: 'scene_002', chapter: 'Act 2', role: 'story', mediaType: 'image', narration: 'Initial scene 2', imagePrompt: 'K2 climb', duration: 15 },
    ],
  });

  try {
    const edit = await editForRetention({
      raw: rawScript,
      template: 'Factual true survival documentary for Against the Odds',
      research: 'Documented K2 winter climb telemetry',
      plan,
      model: 'gemini-3.6-flash',
      apiKey: 'test-api-key',
      duration: 600,
    });

    assert.ok(edit.auditReport);
    assert.equal(edit.auditReport.totalScore, 92);
    assert.ok(edit.scriptDoctorSummary);
    assert.equal(edit.scriptDoctorSummary.finalScore, 92);
    assert.equal(edit.scriptDoctorSummary.iterationsCount, 1);
    assert.ok(edit.notes.some(n => n.includes('[Script Doctor] Retention Score: 92/100')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Ancient Dharma: Script Doctor detects banned street slang and repairs into elevated Sanskriti Hindi', async () => {
  const originalFetch = globalThis.fetch;
  let callNumber = 0;

  const dharmaPass1Audit = {
    gate1_hook: { score: 22, findings: ['High-stakes divine dilemma at the seashore'], flawedSceneIds: [] },
    gate2_curiosityChain: { score: 23, findings: ['Good narrative escalation'], flawedSceneIds: [] },
    gate3_dictionAndCadence: {
      score: 16,
      findings: ['Banned street slang detected: Scene 2 uses "तू" and "तेरा" instead of dignified sacred diction'],
      flawedSceneIds: ['scene_002'],
    },
    gate4_climaxAndOutro: { score: 22, findings: ['Devout outro'], flawedSceneIds: [] },
    deadZonesDetected: [],
    rewritePrescription: 'Rewrite scene_002: replace cheap street slang with noble Sanskriti Hindi and danda (।) breath pauses.',
    scenesToRepair: ['scene_002'],
  };

  const dharmaRepairs = {
    repairedScenes: [
      {
        id: 'scene_002',
        narration: 'हे समुद्र! जब तक मर्यादा पुरुषोत्तम श्री राम का मार्ग प्रशस्त नहीं होता, तब तक यह धनुष शांत नहीं होगा।',
        imagePrompt: 'Lord Rama drawing the celestial Kodanda bow at the turbulent ocean shore, divine glowing aura.',
        explanationOfFix: 'Removed colloquial street slang; elevated to majestic scriptural Sanskriti Hindi with danda pause.',
      },
    ],
  };

  const dharmaPass2Audit = {
    gate1_hook: { score: 24, findings: ['Majestic divine confrontation hook'], flawedSceneIds: [] },
    gate2_curiosityChain: { score: 24, findings: ['Pacing sustains sacred tension'], flawedSceneIds: [] },
    gate3_dictionAndCadence: { score: 25, findings: ['Noble, faultless Sanskriti Hindi diction with poetic breath pauses'], flawedSceneIds: [] },
    gate4_climaxAndOutro: { score: 24, findings: ['Deeply moving spiritual payoff'], flawedSceneIds: [] },
    deadZonesDetected: [],
    rewritePrescription: 'Master Ancient Dharma script verified.',
    scenesToRepair: [],
  };

  globalThis.fetch = async () => {
    callNumber++;
    if (callNumber === 1) {
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(dharmaPass1Audit) }] } }],
      });
    }
    if (callNumber === 2) {
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(dharmaRepairs) }] } }],
      });
    }
    return Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(dharmaPass2Audit) }] } }],
    });
  };

  const dharmaPlan = {
    version: 1,
    title: 'Ram Setu Nirman',
    thumbnailPrompt: 'Lord Ram at ocean',
    scenes: [
      { id: 'scene_001', chapter: 'Act 1', role: 'story', mediaType: 'image', narration: 'समुद्र तट पर तीन दिवस बीत चुके थे, किंतु सागर ने मार्ग नहीं दिया।', imagePrompt: 'Sea shore', duration: 10 },
      { id: 'scene_002', chapter: 'Act 2', role: 'story', mediaType: 'image', narration: 'तू सुन ले, तेरा घमंड अब टूटेगा!', imagePrompt: 'Bow drawn', duration: 10 },
      { id: 'scene_003', chapter: 'Act 5', role: 'story', mediaType: 'image', narration: 'सागर ने नतमस्तक होकर नल और नील की शिल्पकला का रहस्य उद्घाटित किया।', imagePrompt: 'Ocean deity bowing', duration: 10 },
    ],
  };

  try {
    const result = await runIterativeScriptDoctor({
      scenePlan: dharmaPlan,
      channelName: 'Ancient Dharma',
      channelGuidance: 'Sanatana dharma sacred epic lore from Ramayana and Mahabharata',
      maxIterations: 3,
      model: 'gemini-3.6-flash',
      apiKey: 'test-api-key',
    });

    assert.equal(result.success, true);
    assert.equal(result.initialScore, 83); // 22 + 23 + 16 + 22 = 83
    assert.equal(result.finalScore, 97);   // 24 + 24 + 25 + 24 = 97
    assert.equal(result.iterationsCount, 2);
    assert.match(result.finalScenePlan.scenes[1].narration, /हे समुद्र!/);
    assert.doesNotMatch(result.finalScenePlan.scenes[1].narration, /तू सुन ले/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

