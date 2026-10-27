/// <reference lib="es2022.intl" />
import type { MotionTemplate } from './motionTemplates';

export const escapeSvgText = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => 1 - (1 - clamp(n)) ** 3;

type Kind = 'lower_third' | 'title_reveal' | 'pull_quote' | 'keyword_underline' | 'marker_highlight' | 'typewriter' | 'bullet_recap' | 'numbered_steps' | 'chapter_marker' | 'source_credit' | 'location_pin' | 'date_stamp' | 'number_counter' | 'progress_bar' | 'bar_chart' | 'donut_chart' | 'line_chart' | 'cycle_loop' | 'branch_diagram' | 'end_prompt';
type Definition = { kind: Kind; name: string; category: string; description: string; effect: string; params: Record<string, string | number>; keywords: string[] };
const definitions: Definition[] = [
  { kind: 'lower_third', name: 'Speaker lower third', category: 'titles', description: 'Introduce a speaker, historical figure, author or object with a name and short context.', effect: 'Accent rule draws, then name and role slide in.', params: { title: 'Name or subject', subtitle: 'Role or context' }, keywords: ['speaker', 'author', 'introduced', 'व्यक्ति'] },
  { kind: 'title_reveal', name: 'Cinematic title reveal', category: 'titles', description: 'Open an episode, topic or section with a centered title.', effect: 'Title rises gently as two framing rules extend.', params: { title: 'A story worth exploring', subtitle: 'History · ideas · discovery' }, keywords: ['title', 'opening', 'परिचय'] },
  { kind: 'pull_quote', name: 'Pull quote', category: 'text', description: 'Emphasize a short quotation with editable attribution.', effect: 'Quotation mark scales in before the quote and attribution fade up.', params: { title: 'Place an exact quotation here', subtitle: 'Speaker or source' }, keywords: ['quote', 'said', 'उद्धरण'] },
  { kind: 'keyword_underline', name: 'Keyword underline', category: 'emphasis', description: 'Emphasize a definition, name or key phrase without covering the scene.', effect: 'A hand-drawn underline sweeps beneath the phrase.', params: { title: 'The key idea' }, keywords: ['keyword', 'important', 'मुख्य'] },
  { kind: 'marker_highlight', name: 'Marker highlight', category: 'emphasis', description: 'Highlight a short phrase for explainers, lessons and recaps.', effect: 'A translucent marker stroke sweeps behind the text.', params: { title: 'Remember this detail' }, keywords: ['remember', 'highlight', 'ध्यान'] },
  { kind: 'typewriter', name: 'Typewriter reveal', category: 'text', description: 'Reveal a short question, definition or discovery one character at a time.', effect: 'Grapheme-aware typing with a blinking cursor and reading hold.', params: { title: 'What can we learn from this?', subtitle: 'A question to explore' }, keywords: ['question', 'definition', 'प्रश्न'] },
  { kind: 'bullet_recap', name: 'Bullet-point recap', category: 'lists', description: 'Summarize up to four takeaways, features or observations.', effect: 'Bullets and phrases enter in a staggered sequence.', params: { title: 'Key takeaways', items: 'First key point\nSecond key point\nThird key point' }, keywords: ['takeaways', 'recap', 'सार'] },
  { kind: 'numbered_steps', name: 'Numbered steps', category: 'lists', description: 'Explain a workflow, method, recipe or ordered sequence in up to four steps.', effect: 'Numbered circles connect as each step appears.', params: { title: 'How it works', items: 'Prepare\nExplore\nReflect' }, keywords: ['steps', 'method', 'चरण'] },
  { kind: 'chapter_marker', name: 'Chapter marker', category: 'titles', description: 'Mark a chapter or lesson with an editable number and heading.', effect: 'Oversized chapter number settles before the heading arrives.', params: { title: 'A new perspective', subtitle: 'CHAPTER', value: 1 }, keywords: ['chapter', 'lesson', 'अध्याय'] },
  { kind: 'source_credit', name: 'Source credit', category: 'labels', description: 'Credit a real book, archive, photograph or data source in a compact footer.', effect: 'Fine rule draws above a two-line source credit.', params: { title: 'Source or archive name', subtitle: 'Author · edition · page' }, keywords: ['source', 'reference', 'स्रोत'] },
  { kind: 'location_pin', name: 'Location pin', category: 'labels', description: 'Introduce a place with a pin and label; position it manually over your footage.', effect: 'Pin drops, a small ring expands, and the location label appears.', params: { title: 'Place name', subtitle: 'Region or context' }, keywords: ['location', 'place', 'स्थान'] },
  { kind: 'date_stamp', name: 'Date stamp', category: 'labels', description: 'Show an event date, era or time reference supplied by your script.', effect: 'Calendar outline draws and the date slides into place.', params: { title: 'Date or era', subtitle: 'Event or context' }, keywords: ['date', 'event', 'तिथि'] },
  { kind: 'number_counter', name: 'Number count-up', category: 'data', description: 'Emphasize a supplied total, milestone or quantity. Example values are editable.', effect: 'Number eases up to the exact target, then holds.', params: { title: 'Example total', value: 120, unit: 'items' }, keywords: ['total', 'count', 'कुल'] },
  { kind: 'progress_bar', name: 'Progress bar', category: 'data', description: 'Show a supplied completion rate or percentage from 0 to 100.', effect: 'A horizontal bar fills while the percentage counts up.', params: { title: 'Example progress', value: 65 }, keywords: ['progress', 'complete', 'प्रगति'] },
  { kind: 'bar_chart', name: 'Bar comparison', category: 'data', description: 'Compare up to four nonnegative values on a shared zero-based scale.', effect: 'Horizontal bars grow in sequence with labels and final values.', params: { title: 'Example comparison', items: 'Group A\nGroup B\nGroup C', values: '40, 70, 55', unit: 'units' }, keywords: ['compare', 'ranking', 'तुलना'] },
  { kind: 'donut_chart', name: 'Donut percentage', category: 'data', description: 'Show one supplied share of a whole, with the remainder visible.', effect: 'A ring draws clockwise and the central percentage settles.', params: { title: 'Example share', value: 72 }, keywords: ['share', 'percentage', 'प्रतिशत'] },
  { kind: 'line_chart', name: 'Trend line', category: 'data', description: 'Plot two to four supplied nonnegative values with evenly spaced observations and a zero baseline.', effect: 'Line traces across the observations, followed by point labels.', params: { title: 'Example trend', items: 'Start\nMiddle\nEnd', values: '20, 45, 80', unit: 'units' }, keywords: ['trend', 'growth', 'बदलाव'] },
  { kind: 'cycle_loop', name: 'Cycle loop', category: 'diagrams', description: 'Explain three or four recurring stages, habits or repeating processes.', effect: 'A circular path draws with a moving marker and staggered stage labels.', params: { title: 'A repeating process', items: 'Observe\nLearn\nApply' }, keywords: ['cycle', 'repeat', 'चक्र'] },
  { kind: 'branch_diagram', name: 'Branching diagram', category: 'diagrams', description: 'Connect one parent concept to two to four categories or outcomes.', effect: 'Branches draw from the parent before child labels appear.', params: { title: 'Main concept', items: 'First branch\nSecond branch\nThird branch' }, keywords: ['branches', 'categories', 'शाखा'] },
  { kind: 'end_prompt', name: 'End-screen prompt', category: 'titles', description: 'Invite the next action at the end of a lesson, episode or presentation.', effect: 'A directional arrow draws beside a gently rising prompt.', params: { title: 'Explore the next story', subtitle: 'Learn · reflect · share' }, keywords: ['next', 'subscribe', 'अगला'] },
];

// Each template uses final-frame dimensions and a deterministic clock: seeking and export agree.
export function createReusableTemplates(profileId: string, profileName: string, primary: string, secondary: string, prefix: string): MotionTemplate[] {
  return definitions.map(d => ({
    id: `${prefix}${d.kind}`, name: d.name, category: d.category, profileId, profileName,
    description: d.description, emergingEffect: d.effect, durationFrames: 180, fps: 30,
    aspectRatio: '16:9', triggerKeywords: d.keywords, soundCue: '', defaultParams: d.params, collection: 'essentials',
    renderSvg: (frame, totalFrames, w, h, supplied) => {
      const p = { ...d.params, ...supplied };
      const str = (key: string) => String(p[key] ?? '');
      const number = (key: string) => { const n = Number(p[key]); return Number.isFinite(n) ? Math.max(0, Math.min(1e9, n)) : 0; };
      const time = clamp(frame / Math.max(1, totalFrames - 1));
      const enter = ease(time / 0.16), exit = ease((1 - time) / 0.12);
      const stagger = (i: number) => ease((time - i * 0.055) / 0.16);
      const portrait = h > w, s = Math.min(w, h), x = w * 0.12, right = w * 0.88, cw = right - x;
      const size = s * 0.045, small = size * 0.62;
      const title = str('title'), sub = str('subtitle');
      const items = str('items').split('\n').map(v => v.trim()).filter(Boolean).slice(0, 4);
      const values = str('values').split(',').map(v => Math.max(0, Math.min(1e9, Number(v) || 0)));
      const max = Math.max(1, ...values.slice(0, items.length));
      const color = '#FFF3DF';
      const line = (x1: number, y1: number, x2: number, y2: number, progress = enter, stroke = primary, weight = 3) => `<path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="${stroke}" stroke-width="${weight}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1-progress}" stroke-linecap="round"/>`;
      const circle = (cx: number, cy: number, r: number, fill = 'none', stroke = primary) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
      const text = (value: string, tx: number, ty: number, font = size, anchor = 'start', fill = color, available = cw) => {
        // Bound each line, preserving combining marks and avoiding clipping long labels.
        const chars = Array.from(value).length;
        const fitted = Math.min(font, available / Math.max(1, chars * 0.72));
        return `<text x="${tx}" y="${ty}" font-size="${fitted}" text-anchor="${anchor}" fill="${fill}" font-weight="600">${escapeSvgText(value)}</text>`;
      };
      const group = (markup: string, progress = enter, offset = size * 0.5) => `<g opacity="${progress}" transform="translate(0,${(1-progress)*offset})">${markup}</g>`;
      const header = () => group(text(title, x, h * 0.24));
      let body = '';
      switch (d.kind) {
        case 'lower_third':
        case 'source_credit': {
          const y = h * 0.70, credit = d.kind === 'source_credit';
          body = line(x, y-size*1.4, x+cw*(credit ? 0.55 : 0.3), y-size*1.4) + group(text(title, x, y, credit ? size*0.8 : size) + text(sub, x, y+size, small, 'start', primary), stagger(1));
          break;
        }
        case 'title_reveal':
          body = line(w/2-cw*0.2, h*0.36, w/2+cw*0.2, h*0.36) + group(text(title,w/2,h*0.48,size*1.3,'middle')+text(sub,w/2,h*0.56,small,'middle',primary)) + line(w/2-cw*0.2,h*0.63,w/2+cw*0.2,h*0.63); break;
        case 'pull_quote':
          body = group(text('“',x,h*0.36,size*3,'start',primary))+group(text(title,x,h*0.48)+text(sub,x,h*0.60,small,'start',primary),stagger(2)); break;
        case 'keyword_underline':
          body = group(text(title,x,h*0.49)) + `<path d="M${x},${h*0.52} Q${w/2},${h*0.54} ${right},${h*0.52}" fill="none" stroke="${primary}" stroke-width="5" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1-stagger(2)}"/>`; break;
        case 'marker_highlight':
          body = `<rect x="${x-size*0.1}" y="${h*0.49-size}" width="${(cw+size*0.2)*stagger(1)}" height="${size*1.4}" fill="${primary}" opacity="0.27"/>` + group(text(title,x,h*0.49)); break;
        case 'typewriter': {
          // Intl.Segmenter preserves Hindi conjuncts and emoji while typing.
          const segments = Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(title), v => v.segment);
          const count = Math.floor(segments.length * clamp(time/0.50));
          const visible = segments.slice(0,count).join('');
          const font = Math.min(size,cw/Math.max(1,(Array.from(title).length+1)*0.72));
          body = text(visible + (time<0.65 && Math.floor(time*24)%2===0 ? '│' : ''),x,h*0.48,font) + group(text(sub,x,h*0.59,small,'start',primary),stagger(3)); break;
        }
        case 'bullet_recap':
        case 'numbered_steps':
          body = header() + items.map((item,i) => {
            const y = h*(0.35+i*0.105), cx = x+size*0.4, progress = stagger(i+1), numbered = d.kind==='numbered_steps';
            return (numbered && i<items.length-1 ? line(cx,y,cx,y+h*0.105,progress,secondary) : '') + group(circle(cx,y-size*0.25,numbered?size*0.45:size*0.1,numbered?'none':primary) + (numbered ? text(String(i+1),cx,y-size*0.05,small,'middle',primary) : '') + text(item,x+size*1.4,y,size*0.78,'start',color,cw-size*1.4),progress);
          }).join(''); break;
        case 'chapter_marker':
          body = group(text(String(Math.floor(number('value'))).padStart(2,'0'),x,h*0.46,size*3,'start',primary)) + group(text(sub,x,h*0.55,small,'start',primary)+text(title,x,h*0.64),stagger(2)); break;
        case 'location_pin': {
          const cx=w/2, cy=h*0.37, r=size*0.8;
          body = group(`<path d="M${cx},${cy+r*1.7} C${cx-r*2.2},${cy-r*0.3} ${cx-r},${cy-r*1.8} ${cx},${cy-r*1.8} C${cx+r},${cy-r*1.8} ${cx+r*2.2},${cy-r*0.3} ${cx},${cy+r*1.7}Z" fill="none" stroke="${primary}" stroke-width="4"/>`+circle(cx,cy-r*0.6,r*0.35),enter,-size*1.5)+group(text(title,cx,h*0.56,size,'middle')+text(sub,cx,h*0.63,small,'middle',primary),stagger(2)); break;
        }
        case 'date_stamp': {
          const bx=x, by=h*0.36, side=size*1.6;
          body = group(`<rect x="${bx}" y="${by}" width="${side}" height="${side}" rx="6" fill="none" stroke="${primary}" stroke-width="3"/>`+line(bx,by+side*0.3,bx+side,by+side*0.3)+line(bx+side*0.25,by-size*0.2,bx+side*0.25,by+size*0.2)+line(bx+side*0.75,by-size*0.2,bx+side*0.75,by+size*0.2))+group(text(title,x,h*0.55)+text(sub,x,h*0.63,small,'start',primary),stagger(2)); break;
        }
        case 'number_counter':
          body = header()+group(text(`${Math.round(number('value')*ease(time/0.4)).toLocaleString('en-US')} ${str('unit')}`,x,h*0.51,size*1.8)); break;
        case 'progress_bar': {
          const value = Math.min(100,number('value'))*ease(time/0.4), y=h*0.47;
          body = header()+line(x,y,right,y,1,secondary,size*0.28)+line(x,y,x+cw*value/100,y,1,primary,size*0.28)+text(`${Math.round(value)}%`,x,h*0.59,size*1.6); break;
        }
        case 'bar_chart':
          body = header()+items.map((item,i)=>{
            const y=h*(0.35+i*0.115), progress=stagger(i+1), value=values[i]||0;
            return group(text(`${item} · ${value} ${str('unit')}`,x,y,small),progress)+`<rect x="${x}" y="${y+size*0.25}" width="${cw*value/max*progress}" height="${size*0.45}" rx="3" fill="${i%2?secondary:primary}"/>`;
          }).join(''); break;
        case 'donut_chart': {
          const r=s*0.16,cx=w/2,cy=h*0.48, value=Math.min(100,number('value'))*ease(time/0.4);
          body = group(text(title,cx,h*0.22,size,'middle')) + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${secondary}" stroke-width="${size*0.35}" opacity="0.4"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${primary}" stroke-width="${size*0.35}" pathLength="100" stroke-dasharray="${value} ${100-value}" transform="rotate(-90 ${cx} ${cy})"/>`+text(`${Math.round(value)}%`,cx,cy+size*0.3,size*1.4,'middle'); break;
        }
        case 'line_chart': {
          const top=h*0.35,bottom=h*0.62, left=x+size, plotWidth=cw-size*2;
          const points=items.map((_,i)=>({x:left+plotWidth*i/Math.max(1,items.length-1),y:bottom-(values[i]||0)/max*(bottom-top)}));
          body=header()+line(left,bottom,left+plotWidth,bottom,1,secondary)+line(left,top,left,bottom,1,secondary)+text('0',x,bottom,small,'start',primary)+text(`${max} ${str('unit')}`,left,top-size*0.6,small,'start',primary)+`<path d="${points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')}" fill="none" stroke="${primary}" stroke-width="4" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1-ease(time/0.4)}"/>`+points.map((p,i)=>group(circle(p.x,p.y,5,primary)+text(String(values[i]||0),p.x,p.y-size*0.3,small,'middle')+text(items[i],p.x,bottom+size,small,'middle',color,plotWidth/Math.max(1,items.length)),stagger(i+2))).join(''); break;
        }
        case 'cycle_loop': {
          const cx=w/2,cy=h*0.49,r=s*(portrait?0.22:0.20),angle=time*Math.PI*2-Math.PI/2;
          body=header()+`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${secondary}" stroke-width="3" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${1-enter}"/>`+circle(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r,7,primary)+items.map((item,i)=>{
            const a=i/Math.max(1,items.length)*Math.PI*2-Math.PI/2,px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;
            return group(circle(px,py,6,primary)+text(item,px,py+size*0.9,small,'middle',color,cw*0.32),stagger(i+1));
          }).join(''); break;
        }
        case 'branch_diagram':
          body=header()+items.map((item,i)=>{
            const y=h*(0.36+i*0.10),progress=stagger(i+1);
            return line(x+size*0.3,h*0.27,x+size*0.3,y,progress,secondary)+line(x+size*0.3,y,x+size*1.4,y,progress)+group(text(item,x+size*1.8,y+size*0.25,size*0.8,'start',color,cw-size*1.8),progress);
          }).join(''); break;
        case 'end_prompt':
          body=group(text(title,x,h*0.44)+text(sub,x,h*0.54,small,'start',primary))+line(x,h*0.64,x+cw*0.3,h*0.64,stagger(2))+line(x+cw*0.3-size*0.4,h*0.64-size*0.4,x+cw*0.3,h*0.64,stagger(2))+line(x+cw*0.3-size*0.4,h*0.64+size*0.4,x+cw*0.3,h*0.64,stagger(2)); break;
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%"><g font-family="Noto Sans Devanagari, Noto Sans, sans-serif" opacity="${exit}">${body}</g></svg>`;
    },
  }));
}
