import fs from 'node:fs';

const file = 'server/src/services/editing/renderer.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replaceAll(
  'const cacheKey = objectHash({ project, rendererVersion: "hyperframes-v1" });',
  'const cacheKey = objectHash({ project, rendererVersion: "hyperframes-v1" }).slice(0, 32);'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed renderer.ts paths successfully!');
