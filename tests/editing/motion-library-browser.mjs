import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(new URL('../../server/package.json',import.meta.url));
const express=require('express'),{chromium}=require('playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'motion-gallery-browser-'));
process.env.TUBEFLOW_DATA_DIR=directory;
fs.writeFileSync(path.join(directory,'accounts.json'),JSON.stringify([{id:'default',name:'Ancient Dharma',color:'#C59B52',avatar:'AD'}]));
for (const name of ['motionTemplates','reusableMotionTemplates']) {
  const source=fs.readFileSync(`src/services/${name}.ts`,'utf8').replace("from './reusableMotionTemplates'","from './reusableMotionTemplates.mjs'");
  fs.writeFileSync(path.join(directory,`${name}.mjs`),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
const {workspacesRouter}=await import('../../server/dist/routes/workspaces.js');
const {accountsRouter}=await import('../../server/dist/routes/accounts.js');
const app=express();app.use(express.json());
app.use('/api/accounts/:accountId/profiles/:profile',workspacesRouter);app.use('/api/accounts',accountsRouter);
app.use('/test-modules',express.static(directory));app.use(express.static(path.resolve('dist')));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const executablePath=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',process.env.EDITING_BROWSER_EXECUTABLE].find(file=>file&&fs.existsSync(file));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Motion Templates',exact:true}).first().click();
  await page.getByText('30 motions · 20 new',{exact:true}).waitFor();
  assert.equal(await page.locator('[aria-label="Motion template catalog"] button').count(),30);
  await page.getByRole('button',{name:/Speaker lower third/}).click();
  await page.getByLabel('Pause preview',{exact:true}).click();
  await page.getByLabel('Title',{exact:true}).fill('धर्म & संस्कृति <test>');
  await page.getByLabel('Subtitle',{exact:true}).fill('Ancient Dharma');
  await page.getByLabel('Timeline scrubber',{exact:true}).fill('90');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Motion template preview"]').textContent.includes('धर्म & संस्कृति <test>'));
  assert.equal(await page.locator('[aria-label="Motion template preview"] test').count(),0);
  assert.equal(await page.locator('img[alt="Sample documentary background"]').evaluate(el=>el.complete&&el.naturalWidth>0),true);
  await page.getByLabel('Preview duration',{exact:true}).selectOption('8');
  await page.getByLabel('Timeline scrubber',{exact:true}).fill('120');
  const output=path.resolve('artifacts/motion-gallery-proof');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,'landscape.png'),fullPage:true});
  await page.getByLabel('Preview aspect ratio',{exact:true}).selectOption('9:16');
  await page.getByLabel('Timeline scrubber',{exact:true}).fill('120');
  assert.equal(await page.locator('[aria-label="Motion template preview"] svg').getAttribute('viewBox'),'0 0 1080 1920');
  await page.screenshot({path:path.join(output,'portrait.png'),fullPage:true});
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download current frame (SVG)',exact:true}).click();
  const download=await downloadPromise;assert.match(download.suggestedFilename(),/ad_lower_third-frame-120.svg/);
  await page.getByLabel('Search motion templates',{exact:true}).fill('cycle');
  assert.ok(await page.getByRole('button',{name:/Cycle loop/}).count());
  await page.getByLabel('Search motion templates',{exact:true}).fill('no-such-motion-xyz');
  await page.getByText('No motions match. Try another search or category.').waitFor();
  await page.getByLabel('Search motion templates',{exact:true}).fill('');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  // Parse and measure every template in a real SVG engine, including early frames.
  const rendering=await page.evaluate(async()=>{
    const {getTemplatesForProfile}=await import('/test-modules/motionTemplates.mjs');
    const failures=[];const host=document.createElement('div');document.body.append(host);
    for(const [w,h] of [[1920,1080],[1080,1920]])for(const template of getTemplatesForProfile('default'))for(const frame of [0,1,45,90,179]){
      const svg=template.renderSvg(frame,180,w,h);
      const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
      if(parsed.querySelector('parsererror'))failures.push(`${template.id}: invalid XML`);
      host.style.cssText=`width:${w}px;height:${h}px;position:absolute;left:0;top:0`;host.innerHTML=svg;
      if(frame===90){
        const bounds=host.querySelector('svg').getBoundingClientRect();
        for(const text of host.querySelectorAll('text')){
          const rect=text.getBoundingClientRect();
          if(rect.left<bounds.left-1||rect.right>bounds.right+1||rect.top<bounds.top-1||rect.bottom>bounds.bottom+1)failures.push(`${template.id}: text outside ${w}x${h}: ${text.textContent.trim()}`);
        }
      }
    }
    host.remove();return failures;
  });
  assert.deepEqual(rendering,[]);
  assert.deepEqual(errors,[]);
  await page.setViewportSize({width:1600,height:1300});
  await page.evaluate(async()=>{
    const {getTemplatesForProfile}=await import('/test-modules/motionTemplates.mjs');
    const sheet=document.createElement('div');
    sheet.id='motion-contact-sheet';
    sheet.style.cssText='position:fixed;inset:0;z-index:99999;display:grid;grid-template-columns:repeat(4,1fr);background:#100f13;color:#fff;padding:16px;gap:12px';
    for(const template of getTemplatesForProfile('default').filter(t=>t.collection==='essentials')){
      const card=document.createElement('div');card.style.cssText='background:#1d1a22;border:1px solid #645331;border-radius:10px;overflow:hidden';
      const heading=document.createElement('p');heading.textContent=template.name;heading.style.cssText='font:14px sans-serif;padding:10px 12px;color:#c9bdab';
      const graphic=document.createElement('div');graphic.style.cssText='aspect-ratio:16/9;width:100%';graphic.innerHTML=template.renderSvg(90,180,1920,1080);
      card.append(heading,graphic);sheet.append(card);
    }
    document.body.append(sheet);
  });
  await page.screenshot({path:path.join(output,'twenty-new-motions.png')});
  console.log('MOTION_GALLERY_BROWSER_PASSED: 30 templates, XML and text bounds in both formats, Hindi editing, duration, SVG download, search and mobile layout');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
