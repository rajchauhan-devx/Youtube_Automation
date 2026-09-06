import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
VOICE_DIR = ROOT / "data" / "voices"
VOICE_DIR.mkdir(parents=True, exist_ok=True)

PRESETS = [
    {
        "id": "preset_brian_storyteller",
        "name": "Brian — Cinematic Storyteller",
        "description": "Deep, authoritative cinematic tone for essays and dramatic storytelling.",
        "gender": "male",
        "language": "en",
        "edge_voice": "en-US-BrianMultilingualNeural",
        "reference_text": "Across centuries and forgotten civilizations, humanity has always looked toward the stars, wondering what hidden truths lie beyond the horizon of time.",
        "sampleText": "Deep inside the forgotten ruins of history, a mystery was waiting to redefine our understanding of the world.",
        "tags": ["Cinematic", "Storyteller", "Deep"],
    },
    {
        "id": "preset_ava_creator",
        "name": "Ava — Vibrant & Engaging",
        "description": "Warm, lively, energetic narrator with natural breath inflection. Ideal for top-tier YouTube content.",
        "gender": "female",
        "language": "en",
        "edge_voice": "en-US-AvaMultilingualNeural",
        "reference_text": "Welcome back to the channel. Today we are exploring five incredible breakthroughs in science that are quietly revolutionizing our everyday lives.",
        "sampleText": "Welcome back! Today we are exploring five incredible discoveries in science that will completely change how you see the world.",
        "tags": ["Vibrant", "Engaging", "YouTube"],
    },
    {
        "id": "preset_christopher_doc",
        "name": "Christopher — Documentary Anchor",
        "description": "Calm, intellectual, measured documentary narrator for history, science, and deep essays.",
        "gender": "male",
        "language": "en",
        "edge_voice": "en-US-ChristopherNeural",
        "reference_text": "In the silent archives of forgotten history, the evidence remained untouched, waiting for modern archaeology to finally uncover the truth.",
        "sampleText": "In the heart of the ancient city, the silent monoliths stood as witnesses to an era long lost to the sands of time.",
        "tags": ["Documentary", "Formal", "Measured"],
    },
    {
        "id": "preset_swara_hindi",
        "name": "Swara — Expressive Storyteller",
        "description": "Warm, emotive female voice for Hindi stories, mythology, and educational videos.",
        "gender": "female",
        "language": "hi",
        "edge_voice": "hi-IN-SwaraNeural",
        "reference_text": "इतिहास के पन्नों में कई ऐसे गहरे रहस्य छुपे हुए हैं, जो आज भी हमारे वैज्ञानिकों और इतिहासकारों को पूरी तरह हैरान कर देते हैं।",
        "sampleText": "इतिहास के पन्नों में कई ऐसे रहस्य छुपे हैं, जो आज भी वैज्ञानिकों को हैरान कर देते हैं।",
        "tags": ["Storyteller", "Emotional", "Hindi"],
    },
    {
        "id": "preset_madhur_hindi",
        "name": "Madhur — Deep Authoritative",
        "description": "Deep, powerful, rich male Hindi narrator for documentaries, history, and mysteries.",
        "gender": "male",
        "language": "hi",
        "edge_voice": "hi-IN-MadhurNeural",
        "reference_text": "क्या आपने कभी सोचा है कि हमारे इस विशाल ब्रह्मांड की सबसे रहस्यमय और शक्तिशाली शक्तियों के पीछे आखिर कौन सा गहरा सच छिपा है?",
        "sampleText": "क्या आपने कभी सोचा है कि हमारे ब्रह्मांड की सबसे रहस्यमय शक्तियों के पीछे क्या छिपा है?",
        "tags": ["Authoritative", "Documentary", "Hindi"],
    },
    {
        "id": "preset_neerja_hinglish",
        "name": "Neerja — Modern Conversational",
        "description": "Natural, contemporary Indian English / Hinglish conversational tone. Perfect for modern creator content.",
        "gender": "female",
        "language": "hi",
        "edge_voice": "en-IN-NeerjaExpressiveNeural",
        "reference_text": "Welcome! If you are looking to discover something fresh, exciting, and truly remarkable, this journey was crafted just for you.",
        "sampleText": "अगर आप भी कुछ नया और रोमांचक जानना चाहते हैं, तो यह कहानी आपके लिए ही है।",
        "tags": ["Conversational", "Hinglish", "Modern"],
    },
    {
        "id": "preset_prabhat_doc",
        "name": "Prabhat — Indian English Anchor",
        "description": "Deep, calm, and cultured Indian English narrator tone for documentary and history videos.",
        "gender": "male",
        "language": "en",
        "edge_voice": "en-IN-PrabhatNeural",
        "reference_text": "Across decades of research and exploration, the silent monuments of our heritage continue to tell stories of wonder and resilience.",
        "sampleText": "Across decades of research and exploration, these silent monuments continue to tell stories of wonder.",
        "tags": ["Documentary", "Indian English", "Deep"],
    },
]

async def generate_voice(preset: dict):
    voice_id = preset["id"]
    wav_path = VOICE_DIR / f"{voice_id}.wav"
    json_path = VOICE_DIR / f"{voice_id}.json"
    temp_mp3 = VOICE_DIR / f"{voice_id}_temp.mp3"

    print(f"Generating reference audio for {preset['name']}...")
    communicate = edge_tts.Communicate(preset["reference_text"], preset["edge_voice"])
    await communicate.save(str(temp_mp3))

    ffmpeg_cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", str(temp_mp3),
        "-ar", "24000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(wav_path),
    ]
    subprocess.run(ffmpeg_cmd, check=True)
    if temp_mp3.exists():
        temp_mp3.unlink()

    metadata = {
        "id": voice_id,
        "name": preset["name"],
        "description": preset["description"],
        "gender": preset["gender"],
        "language": preset["language"],
        "sampleText": preset["sampleText"],
        "tags": preset["tags"],
        "deletable": False,
        "createdAt": "2026-09-06T12:00:00.000Z",
    }
    json_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Successfully created {preset['name']} ({wav_path.name})")

async def main():
    for p in PRESETS:
        await generate_voice(p)
    print("\nAll preset voices generated successfully!")

if __name__ == "__main__":
    asyncio.run(main())
