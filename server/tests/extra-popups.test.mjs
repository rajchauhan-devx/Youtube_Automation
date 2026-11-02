import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  enhanceMacroPrompt,
  detectPopupsForScript,
  addCustomPopupAsset,
  updatePopupAsset,
  deletePopupAsset,
  compileExtraPopupToMotionGraphic,
} from '../dist/services/extra-popups-engine.js';
import { store } from '../dist/services/store.js';

describe('Extra Popups Architecture & Engine', () => {
  const testScriptId = `test_popups_script_${Date.now()}`;

  before(() => {
    store.add('scripts', {
      id: testScriptId,
      name: 'Ancient Dharma Test Script',
      scenePlan: {
        scenes: [
          {
            narration: 'The ancient sanctum was carved from monolithic black granite stone.',
            imagePrompt: 'Ancient temple sanctum with black granite walls',
            duration: 5,
          },
          {
            narration: 'Lord Rama wielded the divine golden arrow of celestial light.',
            imagePrompt: 'Mythological divine warrior aiming golden glowing bow and arrow',
            duration: 6,
          },
        ],
      },
    });
  });

  after(() => {
    const scripts = store.get('scripts');
    store.set('scripts', scripts.filter(s => s.id !== testScriptId));
  });

  test('enhanceMacroPrompt creates studio macro prompt with lighting directives', () => {
    const prompt = enhanceMacroPrompt('Monolithic Black Granite', 'ancient-dharma');
    assert.match(prompt, /macro studio close-up/i);
    assert.match(prompt, /monolithic black granite/i);
    assert.match(prompt, /8k/i);
  });

  test('detectPopupsForScript extracts popups for each scene and saves to script', async () => {
    const popups = await detectPopupsForScript(testScriptId);
    assert.ok(Array.isArray(popups));
    assert.equal(popups.length, 2);
    assert.equal(popups[0].sceneIndex, 0);
    assert.ok(popups[0].prompt.length > 10);
    assert.ok(popups[0].cueWord);
    assert.ok(
      ['circle_medallion', 'museum_glass_card', 'tactical_hexagon', 'magnifying_loupe', 'cutout_relic'].includes(
        popups[0].shape
      )
    );

    const reloaded = store.getById('scripts', testScriptId);
    assert.equal(reloaded.extraPopups?.length, 2);
  });

  test('addCustomPopupAsset adds a new popup to the script', () => {
    const added = addCustomPopupAsset(testScriptId, {
      sceneIndex: 1,
      title: 'Sacred Diya Flame',
      shape: 'circle_medallion',
      placement: 'top-left',
    });

    assert.equal(added.title, 'Sacred Diya Flame');
    assert.equal(added.shape, 'circle_medallion');
    assert.equal(added.placement, 'top-left');

    const reloaded = store.getById('scripts', testScriptId);
    assert.equal(reloaded.extraPopups?.length, 3);
  });

  test('updatePopupAsset modifies an existing popup', () => {
    const script = store.getById('scripts', testScriptId);
    const firstPopup = script.extraPopups[0];

    const updated = updatePopupAsset(testScriptId, {
      id: firstPopup.id,
      title: 'Polished Black Granite Slabs',
      sfx: 'sacred_bell',
      scalePercent: 35,
    });

    assert.equal(updated.title, 'Polished Black Granite Slabs');
    assert.equal(updated.sfx, 'sacred_bell');
    assert.equal(updated.scalePercent, 35);
  });

  test('compileExtraPopupToMotionGraphic compiles popup into executable GSAP render spec', () => {
    const script = store.getById('scripts', testScriptId);
    const firstPopup = script.extraPopups[0];

    const graphic = compileExtraPopupToMotionGraphic(firstPopup);
    assert.equal(graphic.type, 'extra_popup');
    assert.equal(graphic.title, firstPopup.title);
    assert.ok(graphic.render.html.includes(firstPopup.title));
    assert.ok(graphic.render.css.includes('ep-card'));
    assert.ok(graphic.render.js.includes('back.out(1.8)'));
    assert.equal(graphic.sfx?.kind, 'sacred_bell');
  });

  test('deletePopupAsset removes the popup from the script', () => {
    const script = store.getById('scripts', testScriptId);
    const firstPopup = script.extraPopups[0];

    deletePopupAsset(testScriptId, firstPopup.id);

    const reloaded = store.getById('scripts', testScriptId);
    assert.equal(reloaded.extraPopups?.length, 2);
    assert.ok(!reloaded.extraPopups.some(p => p.id === firstPopup.id));
  });
});
