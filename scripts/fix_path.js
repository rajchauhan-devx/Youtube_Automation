import fs from 'node:fs';

const file = 'server/src/services/render-graphics.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "const cacheKey = objectHash({ project, legacyCameras, rendererVersion: 'hyperframes-v3' });",
  "const cacheKey = objectHash({ project, legacyCameras, rendererVersion: 'hyperframes-v3' }).slice(0, 32);"
);

content = content.replace(
  "const pending = path.join(cache, `${cacheKey}-${randomUUID()}.partial.webm`);",
  "const pending = path.join(cache, `p-${randomUUID().slice(0, 8)}.webm`);"
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed render-graphics.ts paths successfully!');
