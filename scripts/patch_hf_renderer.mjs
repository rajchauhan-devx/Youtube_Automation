import fs from 'node:fs';

const filePath = 'server/src/services/editing/hyperframes-renderer.ts';
let content = fs.readFileSync(filePath, 'utf8');

const target = `function resolveHyperFramesCli(): string {
  const localBin = path.resolve('node_modules/hyperframes/bin/hyperframes.mjs');
  if (fs.existsSync(localBin)) return localBin;

  const parentBin = path.resolve('../node_modules/hyperframes/bin/hyperframes.mjs');
  if (fs.existsSync(parentBin)) return parentBin;

  return 'hyperframes';
}`;

const targetLF = target.replace(/\r\n/g, '\n');
const targetCRLF = target.replace(/(?<!\r)\n/g, '\r\n');

const actual = content.includes(targetCRLF) ? targetCRLF : targetLF;
const eol = content.includes('\r\n') ? '\r\n' : '\n';

const replacement = [
  `function resolveHyperFramesCli(): string {`,
  `  const localBin = path.resolve('node_modules/hyperframes/bin/hyperframes.mjs');`,
  `  if (fs.existsSync(localBin)) return localBin;`,
  ``,
  `  const serverBin = path.resolve('server/node_modules/hyperframes/bin/hyperframes.mjs');`,
  `  if (fs.existsSync(serverBin)) return serverBin;`,
  ``,
  `  const parentBin = path.resolve('../node_modules/hyperframes/bin/hyperframes.mjs');`,
  `  if (fs.existsSync(parentBin)) return parentBin;`,
  ``,
  `  return 'hyperframes';`,
  `}`
].join(eol);

if (!content.includes(actual)) {
  console.error('Target not found in hyperframes-renderer.ts');
  process.exit(1);
}

content = content.replace(actual, replacement);
fs.writeFileSync(filePath, content, 'utf8');
console.log('hyperframes-renderer.ts patched successfully!');
