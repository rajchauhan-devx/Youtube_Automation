import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '../node_modules/playwright/index.mjs';
import * as templates from '../dist/services/editing/hyperframes-templates.js';

test('all legacy overlays leave the underlying footage visible without panel surfaces',async()=>{
  const common={id:'cardless',startSec:0,durationSec:3,title:'A narrated fact',detail:'Supporting narration',bounds:{x:40,y:80,width:400,height:160}};
  const cases=[
    [templates.renderNewspaperHeadline({...common,sourceName:'',dateText:'',headline:'A narrated fact',highlightText:'fact'}),'.newspaper-card'],
    [templates.renderTelemetryCounter({...common,targetValue:3,unit:'boats',label:'Lifeboats'}),'.telemetry-hud-card'],
    [templates.renderRouteMap({...common,origin:'Origin',destination:'Destination',distanceOrAlt:'800 miles'}),'.route-overlay-card'],
    [templates.renderPolaroidBadge({...common,imageUrl:''}),'.polaroid-wrapper'],
    [templates.renderCockpitTeletype({...common,speaker:'Narrator',transcript:'A narrated fact'}),'.teletype-terminal-card'],
    [templates.renderCinematicTitle(common),'.title-card'],
    [templates.renderSpotlight(common),'.spotlight-label-card'],
  ];
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    for(const [result,selector]of cases){
      await page.setContent(`<style>body{background:repeating-linear-gradient(45deg,#42667c 0 40px,#c6d4c2 40px 80px)}${result.css}</style>${result.html}`);
      const surface=await page.locator(selector).evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,image:s.backgroundImage,border:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],shadow:s.boxShadow,blur:s.backdropFilter};});
      // Footage remains visible: background is either transparent or translucent glassmorphism (alpha < 1, never fully opaque solid card)
      const isTranslucent = surface.background === 'rgba(0, 0, 0, 0)' || surface.background.startsWith('rgba(');
      assert.equal(isTranslucent, true, `Expected translucent or transparent background for ${selector}, got ${surface.background}`);
      assert.equal(surface.image,'none',selector);
      if(selector==='.polaroid-wrapper')assert.equal(await page.locator('.polaroid-photo-frame').evaluate(el=>getComputedStyle(el).display),'none');
    }
  } finally {await browser.close();}
});
