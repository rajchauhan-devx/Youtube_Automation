import sys
import json
import asyncio
import os
import re
import tempfile
import subprocess
import edge_tts

def clean_text_for_tts(text: str) -> str:
    if not text:
        return ""
    # Strip markdown headers
    text = re.sub(r"^#+\s+", "", text, flags=re.MULTILINE)
    # Strip bold and italics
    text = re.sub(r"(\*\*|__)(.*?)\1", r"\2", text)
    text = re.sub(r"(\*|_)(.*?)\1", r"\2", text)
    # Strip stage directions like [Narrator:...], [Voiceover:], etc.
    text = re.sub(r"\[\s*(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*|Sound|SFX|Music|Visual|Intro|Outro)[^\]]*\]:?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\(\s*(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*|Sound|SFX|Music|Visual|Intro|Outro)[^\)]*\):?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(?:Narrator|Voiceover|Host|Speaker\s*\d*|Scene\s*\d*):\s*", "", text, flags=re.MULTILINE | re.IGNORECASE)
    # Remove bullet points
    text = re.sub(r"^[\s*•-]+\s+", "", text, flags=re.MULTILINE)
    # Remove URLs
    text = re.sub(r"https?://\S+", "", text, flags=re.IGNORECASE)
    # Clean repeated punctuation
    text = re.sub(r"\?{2,}", "?", text)
    text = re.sub(r"!{2,}", "!", text)
    text = re.sub(r",{2,}", ", ", text)
    # Space after punctuation
    text = re.sub(r"([.!?])([A-Za-z\u0900-\u097F])", r"\1 \2", text)
    text = re.sub(r",\s*", ", ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

async def synthesize_single_chunk(text: str, voice: str, rate: str, pitch: str, volume: str, out_path: str):
    clean_chunk = clean_text_for_tts(text)
    if not clean_chunk:
        return
    comm = edge_tts.Communicate(clean_chunk, voice=voice, rate=rate, pitch=pitch, volume=volume)
    await comm.save(out_path)

def generate_silence_mp3(duration_sec: float, out_path: str):
    # Generates exact duration of pure acoustic silence using ffmpeg
    subprocess.run([
        'ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
        '-t', str(duration_sec), '-q:a', '9', '-acodec', 'libmp3lame', out_path
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

async def synthesize_with_pauses(text: str, voice: str, rate: str, pitch: str, volume: str, final_out: str):
    # Match pause tags: [pause 1s], [pause 500ms], [pause], (pause 1s), ...
    pattern = r'\[\s*(?:pause|break)\s*(?:(\d+(?:\.\d+)?)\s*(s|sec|seconds?|ms)?)?\s*\]|\(\s*pause\s*(?:(\d+(?:\.\d+)?)\s*(s|sec|seconds?|ms)?)?\s*\)|\.{3,}'
    
    parts = []
    last_idx = 0
    
    for match in re.finditer(pattern, text, re.IGNORECASE):
        start, end = match.span()
        segment_text = text[last_idx:start].strip()
        if segment_text:
            parts.append(('text', segment_text))
            
        num = match.group(1) or match.group(3)
        unit = match.group(2) or match.group(4)
        if num:
            val = float(num)
            duration = val if (not unit or unit.lower() != 'ms') else val / 1000.0
        else:
            duration = 0.5  # default 500ms
        duration = min(max(duration, 0.1), 5.0)
        parts.append(('pause', duration))
        last_idx = end
        
    remaining = text[last_idx:].strip()
    if remaining:
        parts.append(('text', remaining))
        
    has_pauses = any(p[0] == 'pause' for p in parts)
    
    if not has_pauses:
        # Direct synthesis of clean text without any extra process
        clean_text = clean_text_for_tts(text)
        await synthesize_single_chunk(clean_text, voice, rate, pitch, volume, final_out)
        return

    # Synthesize parts and stitch with true acoustic silence
    with tempfile.TemporaryDirectory() as tmp_dir:
        file_list = []
        for i, (kind, content) in enumerate(parts):
            if kind == 'text':
                chunk_clean = clean_text_for_tts(content)
                if chunk_clean:
                    p_out = os.path.join(tmp_dir, f'part_{i}.mp3')
                    await synthesize_single_chunk(chunk_clean, voice, rate, pitch, volume, p_out)
                    if os.path.exists(p_out) and os.path.getsize(p_out) > 50:
                        file_list.append(p_out)
            elif kind == 'pause':
                p_out = os.path.join(tmp_dir, f'pause_{i}.mp3')
                try:
                    generate_silence_mp3(content, p_out)
                    if os.path.exists(p_out):
                        file_list.append(p_out)
                except Exception:
                    pass
                
        if not file_list:
            clean_text = clean_text_for_tts(text)
            await synthesize_single_chunk(clean_text, voice, rate, pitch, volume, final_out)
            return

        list_file = os.path.join(tmp_dir, 'list.txt')
        with open(list_file, 'w', encoding='utf-8') as f:
            for fp in file_list:
                f.write(f"file '{fp.replace(os.sep, '/')}'\n")
                
        subprocess.run([
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', list_file, '-c', 'copy', final_out
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Missing config file argument"}))
        sys.exit(1)

    config_file = sys.argv[1]
    if not os.path.exists(config_file):
        print(json.dumps({"success": False, "error": f"Config file not found: {config_file}"}))
        sys.exit(1)

    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)

    voice = config.get('voice', 'en-US-BrianMultilingualNeural')
    output_path = config.get('output', '')
    text = config.get('text', '')
    rate = config.get('rate', '+0%')
    pitch = config.get('pitch', '+0Hz')
    volume = config.get('volume', '+0%')

    if not output_path:
        print(json.dumps({"success": False, "error": "output path is required"}))
        sys.exit(1)

    out_dir = os.path.dirname(os.path.abspath(output_path))
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    try:
        await synthesize_with_pauses(text, voice, rate, pitch, volume, output_path)

        if not os.path.exists(output_path) or os.path.getsize(output_path) < 100:
            print(json.dumps({"success": False, "error": "Generated audio file is empty or missing"}))
            sys.exit(1)

        print(json.dumps({"success": True, "output": output_path, "bytes": os.path.getsize(output_path)}))
    except Exception as err:
        print(json.dumps({"success": False, "error": str(err)}))
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
