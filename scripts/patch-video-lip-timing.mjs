import fs from 'fs';

const file = 'server/src/services/video.ts';
let content = fs.readFileSync(file, 'utf8');

const oldStretch = `        // Trim longer footage; slow shorter footage gently (up to 25%), then hold
        // the final frame cleanly until the narration scene completes. Never repeat an action.
        const stretch = Math.min(1.25, Math.max(1, targetDuration / sourceDuration));
        holdDuration = Math.max(2.1, (targetDuration - sourceDuration * stretch) + 1.0);
        videoTiming = \`setpts=(PTS-STARTPTS)*\${stretch}\`;`;

const newStretch = `        // Dynamically retime lip articulation footage to match speech duration.
        // Compressing down to 0.80 or expanding up to 1.25 allows natural lip motion to span
        // the entire dialogue line from the opening syllable to the concluding pause.
        const ratio = targetDuration / sourceDuration;
        const stretch = Math.min(1.25, Math.max(0.80, ratio));
        holdDuration = Math.max(2.1, (targetDuration - sourceDuration * stretch) + 1.0);
        videoTiming = \`setpts=(PTS-STARTPTS)*\${stretch.toFixed(4)}\`;`;

content = content.replace(oldStretch, newStretch);
fs.writeFileSync(file, content, 'utf8');
console.log('video.ts updated with dynamic lip articulation retiming');
