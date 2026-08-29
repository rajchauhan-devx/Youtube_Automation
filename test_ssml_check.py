import asyncio
import edge_tts

async def test():
    # If we pass SSML string to edge_tts.Communicate(text, voice)
    ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='en-US-BrianMultilingualNeural'>Hello world</voice></speak>"
    comm = edge_tts.Communicate(ssml, "en-US-BrianMultilingualNeural")
    await comm.save("test_out.mp3")
    print("Saved")

if __name__ == '__main__':
    asyncio.run(test())
