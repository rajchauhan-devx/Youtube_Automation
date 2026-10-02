# Colab image and video generation

Keep the existing local models and workflow. To generate media on your Colab GPU:

1. Run your Colab model and API server, then start its Cloudflare tunnel.
2. In **Setup → Colab media API**, paste the public `https://…trycloudflare.com` URL and the API server's key. Click **Save on this browser**, then **Test connection**.
3. Open **Generation** and select **Colab API** in the media provider menu.
4. In **Mixed Media** or **Shorts**, generate missing images or videos, or generate one scene. Shorts video scenes require enabling **Use video imports**. **Long Video** supports image generation.

Scripts, narration, music, editing, and export continue using their existing providers. Select **Local model** to use the existing local image workflow. Colab settings are used only by the remote media requests.

## Worker protocol

The app uses the same protocol as your `generate.py`:

```text
POST /generate       X-API-Key: <key>
{"prompt":"A golden retriever running along a beach at sunset","num_frames":33,"steps":20}
→ {"job_id":"…"}

GET /status/<job_id>  X-API-Key: <key>
→ {"status":"queued"} / {"status":"running"} / {"status":"done"}
→ {"status":"error","error":"…"} on failure

GET /result/<job_id>  X-API-Key: <key>
→ binary MP4 or still image
```

Video defaults to 33 frames and 20 steps. Images request one frame; if the worker returns a video, FFmpeg extracts its first frame. A native still-image response retains its PNG, JPEG, or WebP format. Image capability depends on the model running in Colab; the app does not install or switch that model.

For a worker requiring more frames even for a still, set `COLAB_IMAGE_FRAMES` in `server/.env` to a supported value. Restart the server after changing environment variables.

```dotenv
COLAB_MEDIA_API_URL=https://your-tunnel.trycloudflare.com
COLAB_MEDIA_API_KEY=your_key
COLAB_VIDEO_FRAMES=33
COLAB_IMAGE_FRAMES=1
COLAB_STEPS=20
```

Browser settings override the server values. Clearing the browser fields and saving restores the server fallback. Do not commit real API keys. Tunnel addresses can change when Colab restarts; save the new URL in Setup.

## Connection checks and cancellation

Testing the connection asks for a nonexistent job's status; it does not generate media. The worker should return a JSON job-not-found error for that request. Rejected keys, tunnel errors, and incompatible responses are shown as failed checks. A reachable status endpoint does not guarantee that the GPU model is loaded; generation performs the actual submission and authentication.

**Cancel** in Long Video stops the app's polling/download. **Stop after current job** in Mixed Media/Shorts lets the current asset finish and stops the remaining queue. Clearing or deleting a script stops its active Colab requests before removing output files.

Your supplied protocol has no worker cancellation endpoint, so cancelling in the app cannot stop a job already executing on the Colab GPU. Stop that job in Colab if needed. Keep the app's server and Colab running while generating; jobs are not recovered after a server restart.
