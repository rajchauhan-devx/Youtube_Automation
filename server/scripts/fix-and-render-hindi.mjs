import fs from 'fs';
import path from 'path';

const HINDI_SCENES = [
  "अश्वत्थामा के मस्तक पर एक गहरा घाव आज भी रिसता है, जिससे रक्त और पीप की दुर्गंध आती है।",
  "शास्त्रों के अनुसार, यह कोई साधारण घाव नहीं, बल्कि बिना मृत्यु के मिलने वाला अनंत दंड है।",
  "हमारी धरती पर सात ऐसे अमर चिरंजीवी हैं, जिन्हें कलयुग के अंत तक जीवित रहना है।",
  "इस भयानक गाथा की शुरुआत महाभारत युद्ध की अट्ठारहवीं रात को हुई थी।",
  "अट्ठारह दिनों के भीषण नरसंहार के बाद कुरुक्षेत्र का मैदान आधी रात में शांत पड़ा था।",
  "हजारों योद्धाओं के शव और उनके लोहे के कवच ठंडी चांदनी में चमक रहे थे।",
  "अपने पिता द्रोणाचार्य के वध से क्रोधित अश्वत्थामा बदले की आग में जल रहा था।",
  "रात के अंधेरे में उल्लू को शिकार करते देख उसने युद्ध के सारे नियम तोड़ दिए।",
  "पांडवों के सोते हुए शिविर में घुसकर उसने द्रौपदी के पांच मासूम पुत्रों का वध कर दिया।",
  "सुबह होते ही इस जघन्य पाप को देखकर पांडव और श्रीकृष्ण अत्यंत क्रोधित हो उठे।",
  "गंगा तट पर जब अर्जुन और श्रीकृष्ण ने अश्वत्थामा को घेरा, तो उसके बचने का कोई मार्ग न था।",
  "घबराकर अश्वत्थामा ने तिनके को अभिमंत्रित कर प्रलयंकारी ब्रह्माशिरा अस्त्र छोड़ दिया।",
  "इस अस्त्र की प्रचंड ज्वाला पूरी सृष्टि को भस्म करने के लिए आगे बढ़ी।",
  "सृष्टि की रक्षा के लिए अर्जुन ने भी अपना ब्रह्माशिरा अस्त्र प्रकट कर दिया।",
  "तभी महर्षि व्यास और नारद जी ने बीच में आकर दोनों को अस्त्र वापस लेने का आदेश दिया।",
  "अर्जुन ने अपने अस्त्र को तुरंत शांत कर वापस अपने गांडीव में समेट लिया।",
  "लेकिन अस्त्र लौटाने में असमर्थ अश्वत्थामा ने उसे उत्तरा के गर्भ की ओर मोड़ दिया।",
  "उस दिव्य अस्त्र के तेज से उत्तरा के गर्भ में पल रहा बालक परीक्षित निष्प्राण हो गया।",
  "तब भगवान श्रीकृष्ण ने अपने सत्य और योगबल से उस मृत बालक को पुनः जीवन दिया।",
  "इसके बाद श्रीकृष्ण ने अश्वत्थामा की ओर मुड़कर एक ऐसा ऐतिहासिक न्याय सुनाया।",
  "उन्होंने अश्वत्थामा को मृत्यु नहीं दी, बल्कि तीन हजार वर्षों तक निर्जन भटकने का शाप दिया।",
  "बिना किसी साथी के, वह दुर्गम जंगलों में लहूलुहान होकर भटकता रहेगा।",
  "श्रीकृष्ण के आदेश पर अश्वत्थामा के मस्तक से उसकी जन्मजात दिव्य शिरोमणि छीन ली गई।",
  "यह मणि उसे भूख, प्यास, रोग और अस्त्र-शस्त्रों से सुरक्षित रखती थी।",
  "मणि निकलते ही उसके माथे का घाव हमेशा के लिए रिसता हुआ नासूर बन गया।",
  "महाभारत के सौप्तिक पर्व में स्पष्ट लिखा है कि उसका यह घाव कभी नहीं भरेगा।",
  "आज भी मध्य प्रदेश के असीरगढ़ किले और नर्मदा तट पर उसके देखे जाने के दावे किए जाते हैं।",
  "विद्वान इन स्थानीय कथाओं और मूल संस्कृत ग्रंथों के अंतर को स्पष्ट करते हैं।",
  "लेकिन अश्वत्थामा उन सात अमर विभूतियों में से केवल एक है।",
  "चिरंजीवी श्लोक में अश्वत्थामा, बलि, व्यास, हनुमान, विभीषण, कृपाचार्य और परशुराम का नाम आता है।",
  "अश्वत्थामा के अलावा बाकी छह चिरंजीवी कलयुग में धर्म और ज्ञान की रक्षा करते हैं।",
  "दानवीर राजा बलि ने अपने न्यायप्रिय शासन से तीनों लोकों में अपार कीर्ति प्राप्त की थी।",
  "तब भगवान वामन ने बटुक रूप धरकर राजा बलि से तीन पग भूमि का दान मांगा।",
  "वामन देव ने विराट रूप धारण कर दो ही पगों में पूरी पृथ्वी और आकाश नाप लिया।",
  "तीसरे पग के लिए राजा बलि ने विनम्रता से अपना मस्तक आगे कर दिया।",
  "उनकी दानशीलता से प्रसन्न होकर प्रभु ने उन्हें सुतल लोक का अमर स्वामी बना दिया।",
  "भविष्य के सावर्णि मन्वंतर में राजा बलि स्वर्ग के देवराज इंद्र बनेंगे।",
  "महर्षि वेदव्यास ने मानवता के कल्याण के लिए वेदों का चार भागों में विभाजन किया।",
  "उन्होंने अट्ठारह पुराण और अमर महाकाव्य महाभारत की रचना कर ज्ञान को सुरक्षित किया।",
  "परंपरा मानती है कि बद्रीनाथ के निकट माणा गांव की व्यास गुफा में वे आज भी उपस्थित हैं।",
  "हिमालय की इन पावन कंदराओं में उनकी तपस्या का प्रभाव आज भी महसूस किया जाता है।",
  "पवनपुत्र हनुमान जी ने प्रभु श्रीराम के बैकुंठ गमन के समय पृथ्वी पर ही रहना चुना।",
  "मान्यता है कि जहां भी रामकथा का गुणगान होता है, वहां हनुमान जी सशरीर उपस्थित रहते हैं।",
  "गंधमादन पर्वत पर ध्यानमग्न रहकर वे कलयुग के अंत तक भक्तों की रक्षा करते हैं।",
  "लंकापति रावण के अधर्म का विरोध कर विभीषण ने श्रीराम की शरण स्वीकार की थी।",
  "रावण के वध के बाद श्रीराम ने विभीषण को लंका का अमर राजा घोषित किया।",
  "विभीषण ने कुल मोह छोड़कर केवल सत्य और सनातन धर्म का साथ दिया था।",
  "वरदान के अनुसार, विभीषण कल्प के अंत तक धर्मपूर्वक लंका पर शासन करते रहेंगे।",
  "कौरवों और पांडवों के कुलगुरु कृपाचार्य परम तपस्वी और अजेय धनुर्धर रहे हैं।",
  "शास्त्रों के अनुसार, कलयुग के अंत में वे भगवान कल्कि को दिव्य अस्त्र-शस्त्रों की दीक्षा देंगे।",
  "भगवान परशुराम भगवान विष्णु के छठे आवेशावतार हैं, जिनका तेज आज भी असीम है।",
  "उन्होंने अपने दिव्य फरसे से इक्कीस बार अत्याचारी राजाओं का मानमर्दन किया था।",
  "वर्तमान में वे महेंद्रगिरि पर्वत की गुप्त गुफाओं में तपस्यारत हैं।",
  "कलयुग के अंत में वे पुनः प्रकट होकर भगवान कल्कि के मुख्य मार्गदर्शक और गुरु बनेंगे।",
  "ये सभी चिरंजीवी सनातन सत्य और ईश्वरीय विधान को बनाए रखने के लिए धरती पर स्थित हैं।",
  "महामृत्युंजय मंत्र के ज्ञाता ऋषि मार्कंडेय ने भी शिव भक्ति से काल को पराजित किया था।",
  "जहाँ छह चिरंजीवी सेवा और तपस्या का प्रतीक हैं, वहीं अश्वत्थामा अहंकार के दुष्परिणाम का प्रमाण है।",
  "अमरता यदि वरदान हो तो कल्याणकारी है, पर शाप बन जाए तो घोर पीड़ा बन जाती है।",
  "यदि शरीर अमर हो जाए लेकिन शाप कभी न मिटे, तो क्या आप ऐसी अमरता स्वीकार करेंगे?"
];

async function run() {
  const accountId = 'acct_620a1d5e-bb1a-4b7e-8662-37acafaecbab';
  const profile = 'long';
  const scriptId = 'usr_25f6fa73-4649-4a4c-a52a-a999e3c7cde5';

  const scriptPath = path.resolve(`server/data/accounts/${accountId}/profiles/${profile}/scripts.json`);
  const scripts = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const script = scripts.find(s => s.id === scriptId);

  if (!script) {
    throw new Error(`Script ${scriptId} not found in ${scriptPath}`);
  }

  console.log(`[Fix] Found script: ${script.id}`);
  console.log(`[Fix] Existing scene count: ${script.scenePlan?.scenes?.length}`);
  console.log(`[Fix] Existing images count: ${script.generatedImages?.length}`);

  // 1. Update each scene's narration with the high-quality conversational Hindi line
  for (let i = 0; i < script.scenePlan.scenes.length; i++) {
    if (HINDI_SCENES[i]) {
      script.scenePlan.scenes[i].narration = HINDI_SCENES[i];
    }
  }

  // 2. Combine full Hindi narration
  const fullHindiNarration = HINDI_SCENES.join('\n\n');
  script.narration = fullHindiNarration;
  script.extractedScript = fullHindiNarration;

  // 3. Set Voice to Google Cloud Hindi or Edge Hindi
  script.autoPilotSettings = script.autoPilotSettings || {};
  script.autoPilotSettings.voice = {
    provider: 'google',
    language: 'hi',
    voiceId: 'hi-IN-Chirp3-HD-Despina',
    rate: 0,
    pitch: 0,
    speed: 1
  };

  // 4. DISABLE AI Avatar (Presenter)
  script.presenter = {
    enabled: false
  };

  // 5. Ensure Subtitles are enabled
  script.enableSubtitles = true;

  // 6. Save updated script to scripts.json
  fs.writeFileSync(scriptPath, JSON.stringify(scripts, null, 2), 'utf8');
  console.log(`[Fix] scripts.json updated successfully with pure Hindi narration and presenter disabled.`);

  // 7. Trigger synchronized Long Narration synthesis via HTTP to local server
  const apiBase = `http://localhost:3001/api/accounts/${accountId}/profiles/${profile}`;
  console.log(`[Fix] Starting synchronized Hindi TTS generation on ${apiBase}/tts/long/start...`);
  const ttsRes = await fetch(`${apiBase}/tts/long/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scriptId,
      language: 'hi',
      voice: 'hi-IN-Chirp3-HD-Despina',
      provider: 'google',
      speed: 1,
      rate: 0,
      pitch: 0
    })
  });

  const ttsData = await ttsRes.json();
  console.log('[Fix] TTS start response:', ttsData);

  if (!ttsRes.ok) {
    throw new Error(`TTS start failed: ${JSON.stringify(ttsData)}`);
  }

  // 8. Poll for narration completion
  console.log('[Fix] Polling narration progress...');
  let status = ttsData;
  while (status.status === 'running') {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(`${apiBase}/tts/long/status/${scriptId}`);
    if (pollRes.ok) {
      status = await pollRes.json();
      console.log(`[Fix] Narration progress: ${status.completed || 0}/${status.total || 59} scenes completed...`);
    }
  }

  if (status.status !== 'done') {
    throw new Error(`Narration failed with status: ${status.status} (${status.error})`);
  }

  console.log('[Fix] Synced Hindi Narration COMPLETE!');

  // Refresh script to get new synced audio path
  const updatedScripts = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const updatedScript = updatedScripts.find(s => s.id === scriptId);
  const audioPath = updatedScript.generatedAudio[0]?.url;
  const imagePaths = updatedScript.generatedImages.map(img => img.url);

  console.log(`[Fix] Audio path: ${audioPath}`);
  console.log(`[Fix] Image paths count: ${imagePaths.length}`);

  // 9. Now start video render (Image-only with dynamic camera motion, auto-ducked BGM, and zero AI avatar)
  console.log('[Fix] Triggering video render...');
  const renderRes = await fetch(`${apiBase}/render/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scriptId,
      imagePaths,
      audioPath,
      resolution: { width: 1920, height: 1080 },
      enableSubtitles: true,
      zoomFactor: 1.12,
      transitionDuration: 0.5,
      bgmTrack: 'devotional_calm',
      bgmVolume: 0.08,
      ttsVolume: 1.0,
      polishAudio: true
    })
  });

  const renderData = await renderRes.json();
  console.log('[Fix] Render start response:', renderData);

  if (!renderRes.ok) {
    throw new Error(`Render start failed: ${JSON.stringify(renderData)}`);
  }

  // 10. Poll for render completion
  console.log('[Fix] Polling render progress...');
  let renderStatus = renderData;
  while (renderStatus.status === 'running') {
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await fetch(`${apiBase}/render/status/${scriptId}`);
    if (pollRes.ok) {
      renderStatus = await pollRes.json();
      console.log(`[Fix] Render progress: ${renderStatus.progress || 0}% (${renderStatus.stage || 'rendering'})...`);
    }
  }

  if (renderStatus.status !== 'done') {
    throw new Error(`Render failed with status: ${renderStatus.status} (${renderStatus.error})`);
  }

  console.log('[Fix] ALL DONE! Final video rendered successfully:');
  console.log(renderStatus.videoUrl);
}

run().catch(err => {
  console.error('[Fix] Fatal Error:', err);
  process.exit(1);
});
