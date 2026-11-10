const fs = require('fs');
const data = JSON.parse(fs.readFileSync('server/data/scripts.json', 'utf8'));
const s = data.find(x => x.id === 'usr_dharma_conversational_dialogue');
const scenes = s.scenePlan?.scenes || [];

console.log('Total scenes in scenePlan:', scenes.length);
for (let i = 0; i < scenes.length; i++) {
  const sc = scenes[i];
  const scenePrompt = sc.imagePrompt || 'cinematic scene visual';
  const videoPrompt = sc.videoPrompt || scenePrompt;
  const asset = s.generatedImages?.find(a => a.index === i);
  console.log(`Scene ${i+1}:`);
  console.log('  sc.mediaType:', sc.mediaType);
  console.log('  asset mediaType:', asset?.mediaType, 'status:', asset?.status, 'url:', asset?.url?.slice(0, 50));
  console.log('  asset prompt === videoPrompt:', asset?.prompt === videoPrompt);
  console.log('  asset prompt === scenePrompt:', asset?.prompt === scenePrompt);
  if (asset && asset.prompt !== videoPrompt && asset.prompt !== scenePrompt) {
    console.log('  asset.prompt:', asset.prompt?.slice(0, 60));
    console.log('  videoPrompt :', videoPrompt?.slice(0, 60));
  }
}
