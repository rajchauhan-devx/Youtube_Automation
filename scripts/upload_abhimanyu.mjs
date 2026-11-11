import fs from 'node:fs';

async function upload() {
  const payload = {
    scriptId: 'shorts_video_nov11_evening',
    videoFilename: 'final_334a2a31-56ae-44cb-9c92-6bf1b04d98ec.mp4',
    autoPilot: true,
    isShort: true,
    title: "अभिमन्यु और चक्रव्यूह का धर्मयुद्ध | Abhimanyu's Great Sacrifice #Shorts",
    description: 'महाभारत के १३वें दिन जब गुरु द्रोण ने अभेद्य चक्रव्यूह रचा, तब १६ वर्ष के वीर अभिमन्यु ने धर्म की रक्षा के लिए अकेले प्रवेश किया। जानिए अभिमन्यु और कौरव महारथियों का वह ऐतिहासिक संवाद।\n\n#Shorts #Mahabharat #Abhimanyu #Chakravyuha #AncientDharma #Krishna',
    tags: ['Abhimanyu', 'Chakravyuha', 'Mahabharat', 'Ancient Dharma', 'Mahabharat Stories', 'Shorts', 'Hindi Stories', 'Krishna', 'Dronacharya', 'Duryodhana'],
    privacyStatus: 'private',
    categoryId: '22',
    publishAt: '2026-11-11T12:30:00.000Z',
  };

  console.log('Uploading to YouTube API...');
  const res = await fetch('http://localhost:3001/api/youtube/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log('Upload response status:', res.status, data);

  if (res.ok && data.success) {
    const scripts = JSON.parse(fs.readFileSync('server/data/scripts.json', 'utf8'));
    const s = scripts.find((x) => x.id === 'shorts_video_nov11_evening');
    s.youtubeExport = {
      title: data.title || payload.title,
      description: payload.description,
      tags: payload.tags,
      publishMode: 'schedule',
      scheduledPublishAt: '2026-11-11T12:30:00.000Z',
      privacyStatus: data.privacyStatus,
      uploadedVideoId: data.videoId,
      uploadedVideoUrl: data.videoUrl,
      uploadedAt: data.uploadedAt,
    };
    fs.writeFileSync('server/data/scripts.json', JSON.stringify(scripts, null, 2), 'utf8');
    console.log('🎉 Successfully saved youtubeExport for shorts_video_nov11_evening:', data.videoUrl);
  } else {
    throw new Error(data.error || 'Upload failed');
  }
}

upload().catch((err) => {
  console.error('Upload script error:', err);
  process.exit(1);
});
