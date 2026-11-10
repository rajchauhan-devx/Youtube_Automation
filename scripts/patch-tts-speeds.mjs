import fs from 'fs';

const file = 'server/src/services/conversational-types.ts';
let content = fs.readFileSync(file, 'utf8');

// Update ancient_dharma speeds
content = content.replace(/narrator:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Charon',\s*speed:\s*[\d.]+/g, "narrator: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.86");
content = content.replace(/सूत्रधार:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Charon',\s*speed:\s*[\d.]+/g, "सूत्रधार: { voiceId: 'hi-IN-Chirp3-HD-Charon', speed: 0.86");
content = content.replace(/krishna:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Alnilam',\s*speed:\s*[\d.]+/g, "krishna: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85");
content = content.replace(/कृष्ण:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Alnilam',\s*speed:\s*[\d.]+/g, "कृष्ण: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85");
content = content.replace(/श्रीकृष्ण:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Alnilam',\s*speed:\s*[\d.]+/g, "श्रीकृष्ण: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85");
content = content.replace(/karna:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Orus',\s*speed:\s*[\d.]+/g, "karna: { voiceId: 'hi-IN-Chirp3-HD-Orus', speed: 0.86");
content = content.replace(/कर्ण:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Orus',\s*speed:\s*[\d.]+/g, "कर्ण: { voiceId: 'hi-IN-Chirp3-HD-Orus', speed: 0.86");
content = content.replace(/ram:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Alnilam',\s*speed:\s*[\d.]+/g, "ram: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85");
content = content.replace(/राम:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Alnilam',\s*speed:\s*[\d.]+/g, "राम: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85");
content = content.replace(/shri_ram:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Alnilam',\s*speed:\s*[\d.]+/g, "shri_ram: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85");
content = content.replace(/श्रीराम:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Alnilam',\s*speed:\s*[\d.]+/g, "श्रीराम: { voiceId: 'hi-IN-Chirp3-HD-Alnilam', speed: 0.85");
content = content.replace(/lakshman:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Fenrir',\s*speed:\s*[\d.]+/g, "lakshman: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 0.88");
content = content.replace(/लक्ष्मण:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Fenrir',\s*speed:\s*[\d.]+/g, "लक्ष्मण: { voiceId: 'hi-IN-Chirp3-HD-Fenrir', speed: 0.88");
content = content.replace(/sita:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Aoede',\s*speed:\s*[\d.]+/g, "sita: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 0.86");
content = content.replace(/सीता:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Aoede',\s*speed:\s*[\d.]+/g, "सीता: { voiceId: 'hi-IN-Chirp3-HD-Aoede', speed: 0.86");
content = content.replace(/hanuman:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Enceladus',\s*speed:\s*[\d.]+/g, "hanuman: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 0.86");
content = content.replace(/हनुमान:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Enceladus',\s*speed:\s*[\d.]+/g, "हनुमान: { voiceId: 'hi-IN-Chirp3-HD-Enceladus', speed: 0.86");
content = content.replace(/ravana:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Schedar',\s*speed:\s*[\d.]+/g, "ravana: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.84");
content = content.replace(/रावण:\s*\{\s*voiceId:\s*'hi-IN-Chirp3-HD-Schedar',\s*speed:\s*[\d.]+/g, "रावण: { voiceId: 'hi-IN-Chirp3-HD-Schedar', speed: 0.84");

// Update preferredSpeed fallback in CharacterVoiceSession
content = content.replace(/let preferredSpeed = 1\.0;/g, "let preferredSpeed = isHindi ? 0.86 : 1.0;");

fs.writeFileSync(file, content, 'utf8');
console.log('conversational-types.ts updated with measured natural speeds');
