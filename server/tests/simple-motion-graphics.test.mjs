import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIMPLE_MOTION_GRAPHICS_CATALOG,
  getMotionGraphicsCatalog,
  searchMotionGraphicsCatalog,
} from '@tubeflow/editing-contracts';
import {
  compileMotionTemplate,
  decideTemplateMotionGraphics,
} from '../dist/services/dynamic-motion-engine.js';

test('100+ Simple Motion Graphics Catalog: Full 100-item Structure & Categories', () => {
  assert.equal(SIMPLE_MOTION_GRAPHICS_CATALOG.length, 100, 'Catalog must contain exactly 100 items');

  const categories = [
    'questions',
    'arrows',
    'highlighters',
    'targets',
    'alerts',
    'reactions',
    'metrics',
    'archival',
    'dharma',
    'cinematic',
  ];

  for (const cat of categories) {
    const items = getMotionGraphicsCatalog(cat);
    assert.equal(items.length, 10, `Category "${cat}" must have exactly 10 motion graphics`);
    for (const item of items) {
      assert.ok(item.id, `Item in "${cat}" must have an id`);
      assert.ok(item.name, `Item ${item.id} must have a name`);
      assert.ok(item.description, `Item ${item.id} must have a description`);
      assert.ok(item.icon, `Item ${item.id} must have an icon`);
      assert.ok(item.defaultPlacement, `Item ${item.id} must have defaultPlacement`);
      assert.ok(Array.isArray(item.tags) && item.tags.length > 0, `Item ${item.id} must have tags`);
    }
  }
});

test('Catalog search matches user queries: question, arrow, highlight, circle, lightbulb', () => {
  const questions = searchMotionGraphicsCatalog('question');
  assert.ok(questions.some((i) => i.id === 'question_head'), 'Finds question mark in head');
  assert.ok(questions.some((i) => i.id === 'triple_question'), 'Finds triple questions');

  const arrows = searchMotionGraphicsCatalog('arrow');
  assert.ok(arrows.some((i) => i.id === 'bouncing_arrow'), 'Finds bouncing arrow');
  assert.ok(arrows.some((i) => i.id === 'arrow_callout'), 'Finds curved arrow callout');

  const highlights = searchMotionGraphicsCatalog('highlight');
  assert.ok(highlights.some((i) => i.id === 'highlighter'), 'Finds highlighter pen');
  assert.ok(highlights.some((i) => i.id === 'box_highlight'), 'Finds box highlight frame');

  const circles = searchMotionGraphicsCatalog('circle');
  assert.ok(circles.some((i) => i.id === 'red_circle'), 'Finds viral red circle');

  const lightbulbs = searchMotionGraphicsCatalog('lightbulb');
  assert.ok(lightbulbs.some((i) => i.id === 'idea_lightbulb'), 'Finds idea lightbulb');
});

test('compileMotionTemplate compiles Question Mark in Head (? mark in head)', () => {
  const result = compileMotionTemplate({
    templateId: 'question_head',
    sceneIndex: 1,
    title: 'क्या था असली रहस्य?',
    detail: 'गहन चिंतन और जिज्ञासा',
    badge: 'MYSTERY QUESTION',
    placement: 'top',
  });

  assert.ok(result.id, 'Has graphic id');
  assert.equal(result.type, 'question_head');
  assert.ok(result.render.html.includes('question-mark-callout'), 'Contains question mark HTML wrapper');
  assert.ok(result.render.html.includes('?'), 'Renders question mark character');
  assert.ok(result.render.html.includes('क्या था असली रहस्य?'), 'Includes question title');
  assert.ok(result.render.css.includes('top: 18%'), 'Respects top placement');
  assert.ok(result.render.js.includes('gsap'), 'Contains GSAP animation sequence');
  assert.ok(result.render.js.includes('bounce.out') || result.render.js.includes('back.out'), 'Includes dynamic bounce easing');
});

test('compileMotionTemplate compiles Energetic Bouncing Arrow (a arrow)', () => {
  const result = compileMotionTemplate({
    templateId: 'bouncing_arrow',
    sceneIndex: 2,
    title: 'यहाँ ध्यान दें',
    detail: 'महत्वपूर्ण साक्ष्य विवरण',
    badge: 'POINTER',
    placement: 'center-right',
  });

  assert.ok(result.id);
  assert.equal(result.type, 'bouncing_arrow');
  assert.ok(result.render.html.includes('bouncing-arrow-callout'), 'Contains bouncing arrow wrapper');
  assert.ok(result.render.html.includes('polygon points='), 'Contains arrow polygon shape');
  assert.ok(result.render.html.includes('यहाँ ध्यान दें'), 'Contains arrow title');
  assert.ok(result.render.js.includes('yoyo: true'), 'Has spring bounce yoyo animation');
});

test('compileMotionTemplate compiles Box Highlight & Neon Focus Frame (highlight)', () => {
  const result = compileMotionTemplate({
    templateId: 'box_highlight',
    sceneIndex: 3,
    title: 'अति महत्वपूर्ण दस्तावेज',
    detail: 'प्राचीन अभिलेख संख्या ४',
    badge: 'CRUCIAL EVIDENCE',
    placement: 'center',
  });

  assert.ok(result.id);
  assert.equal(result.type, 'box_highlight');
  assert.ok(result.render.html.includes('box-highlight-callout'), 'Contains box highlight wrapper');
  assert.ok(result.render.html.includes('rect'), 'Contains SVG rect border');
  assert.ok(result.render.html.includes('अति महत्वपूर्ण दस्तावेज'), 'Contains title');
  assert.ok(result.render.js.includes('strokeDashoffset'), 'Draws glowing border with dashoffset');
});

test('compileMotionTemplate compiles Hand-Drawn Red Circle (viral YouTube encircle)', () => {
  const result = compileMotionTemplate({
    templateId: 'red_circle',
    sceneIndex: 4,
    title: 'चेहरे का भाव देखें',
    detail: 'सूक्ष्म मनोवैज्ञानिक संकेत',
    badge: 'LOOK CLOSELY',
    placement: 'center',
  });

  assert.ok(result.id);
  assert.equal(result.type, 'red_circle');
  assert.ok(result.render.html.includes('red-circle-callout'), 'Contains red circle wrapper');
  assert.ok(result.render.html.includes('#EF4444'), 'Contains YouTube red stroke');
  assert.ok(result.render.html.includes('चेहरे का भाव देखें'), 'Contains title');
});

test('compileMotionTemplate compiles Alert Exclamation (!)', () => {
  const result = compileMotionTemplate({
    templateId: 'alert_exclamation',
    sceneIndex: 5,
    title: 'गंभीर चेतावनी',
    detail: 'उच्च जोखिम स्तर',
    badge: 'CRITICAL ALERT',
  });

  assert.ok(result.id);
  assert.equal(result.type, 'alert_exclamation');
  assert.ok(result.render.html.includes('alert-exclamation'), 'Contains alert exclamation wrapper');
  assert.ok(result.render.html.includes('⚠️'), 'Contains warning icon');
});

test('compileMotionTemplate compiles Eureka Lightbulb (💡)', () => {
  const result = compileMotionTemplate({
    templateId: 'idea_lightbulb',
    sceneIndex: 6,
    title: 'अचानक उपाय मिला',
    detail: 'रणनीतिक विजय का मार्ग',
    badge: 'EUREKA',
    placement: 'top',
  });

  assert.ok(result.id);
  assert.equal(result.type, 'idea_lightbulb');
  assert.ok(result.render.html.includes('idea-lightbulb'), 'Contains lightbulb wrapper');
  assert.ok(result.render.html.includes('dm-bulb-ray'), 'Contains light rays');
});

test('compileMotionTemplate compiles Verified Stamp (✓) and Failed Stamp (✗)', () => {
  const checkResult = compileMotionTemplate({
    templateId: 'check_verified',
    sceneIndex: 7,
    title: 'साक्ष्य प्रमाणित',
    badge: 'VERIFIED',
  });
  assert.ok(checkResult.render.html.includes('✓'), 'Renders checkmark icon');
  assert.ok(checkResult.render.html.includes('#10B981'), 'Uses emerald green for verified');

  const crossResult = compileMotionTemplate({
    templateId: 'cross_failed',
    sceneIndex: 8,
    title: 'दावा खारिज',
    badge: 'REJECTED',
  });
  assert.ok(crossResult.render.html.includes('✗'), 'Renders rejection cross');
  assert.ok(crossResult.render.html.includes('#EF4444'), 'Uses crimson red for rejected');
});

test('compileMotionTemplate compiles Speech Bubble, Location Pin, and Gauge Needle', () => {
  const speech = compileMotionTemplate({
    templateId: 'speech_bubble',
    sceneIndex: 9,
    title: 'सत्य की सदा ही विजय होती है',
    detail: 'महर्षि वाल्मीकि',
  });
  assert.ok(speech.render.html.includes('speech-bubble-callout'));
  assert.ok(speech.render.html.includes('dm-bubble-tail'));

  const pin = compileMotionTemplate({
    templateId: 'location_pin',
    sceneIndex: 10,
    title: 'अयोध्या धाम',
    detail: 'सरयू तट',
  });
  assert.ok(pin.render.html.includes('location-pin-callout'));
  assert.ok(pin.render.html.includes('📍'));

  const gauge = compileMotionTemplate({
    templateId: 'gauge_needle',
    sceneIndex: 11,
    title: 'संकट तीव्रता',
    detail: 'चरम सीमा पर',
  });
  assert.ok(gauge.render.html.includes('gauge-needle-callout'));
  assert.ok(gauge.render.html.includes('dm-gauge-needle'));
});

test('decideTemplateMotionGraphics automatically detects questions, arrows and highlights in narration', () => {
  const scenes = [
    {
      sceneIndex: 0,
      narration: 'यह गाथा है उस अलौकिक रहस्य की जो आज तक अनसुलझा है।',
      visualPrompt: 'Ancient mysterious temple',
      durationSec: 6.0,
    },
    {
      sceneIndex: 1,
      narration: 'परंतु क्या किसी को पता था कि यह भयानक भूल क्यों हुई थी?',
      visualPrompt: 'Questioning warrior standing in shadow',
      durationSec: 6.0,
    },
    {
      sceneIndex: 2,
      narration: 'यहाँ ध्यान दें, इस प्राचीन नक्शे के कोने पर एक गुप्त संकेत छुपा हुआ है।',
      visualPrompt: 'Pointing to the map corner',
      durationSec: 6.0,
    },
    {
      sceneIndex: 3,
      narration: 'अचानक एक नया विचार और युक्ति सामने आई जिसने युद्ध का रुख बदल दिया।',
      visualPrompt: 'Eureka breakthrough moment',
      durationSec: 6.0,
    },
    {
      sceneIndex: 4,
      narration: 'साक्ष्यों से प्रमाणित सत्य है कि यह ऐतिहासिक तथ्य पूर्णतः सिद्ध है।',
      visualPrompt: 'Sealed verified document',
      durationSec: 6.0,
    },
  ];

  const graphics = decideTemplateMotionGraphics(scenes, 'Ancient Dharma');
  assert.equal(graphics.length, 5, 'Every scene gets a motion graphic');

  // Scene 0: Hook template
  assert.ok(graphics[0].type, 'Scene 0 has hook template');

  // Scene 1: Question narration -> question_head
  assert.equal(graphics[1].type, 'question_head', 'Scene 1 with question narration picks question_head');

  // Scene 2: Directional pointer narration -> bouncing_arrow
  assert.equal(graphics[2].type, 'bouncing_arrow', 'Scene 2 with directional pointer picks bouncing_arrow');

  // Scene 3: Idea / Eureka narration -> idea_lightbulb
  assert.equal(graphics[3].type, 'idea_lightbulb', 'Scene 3 with idea narration picks idea_lightbulb');

  // Scene 4: Verified narration -> check_verified
  assert.equal(graphics[4].type, 'check_verified', 'Scene 4 with verified truth picks check_verified');
});
