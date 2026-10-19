package com.daylightwallpaper.wallpaper

import android.content.*
import android.graphics.*
import android.os.Handler
import android.os.Looper
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder
import java.time.ZonedDateTime

/** Static canvas: no animation loop, network, alarms, wake locks or JS runtime. */
class DaylightWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = DaylightEngine()

    inner class DaylightEngine : Engine(), SharedPreferences.OnSharedPreferenceChangeListener {
        private val store = WallpaperStore(this@DaylightWallpaperService)
        private val handler = Handler(Looper.getMainLooper())
        private var bitmap: Bitmap? = null
        private var bitmapPath: String? = null
        private var surfaceReady = false
        private val boundary = Runnable { redrawAndSchedule() }
        private val clockReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) { redrawAndSchedule() }
        }

        override fun onCreate(holder: SurfaceHolder) {
            super.onCreate(holder)
            setTouchEventsEnabled(false)
            setOffsetNotificationsEnabled(false)
            store.prefs.registerOnSharedPreferenceChangeListener(this)
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_TIME_CHANGED)
                addAction(Intent.ACTION_TIMEZONE_CHANGED)
                addAction(Intent.ACTION_DATE_CHANGED)
            }
            if (android.os.Build.VERSION.SDK_INT >= 33) {
                registerReceiver(clockReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                registerReceiver(clockReceiver, filter)
            }
        }

        override fun onVisibilityChanged(visible: Boolean) {
            if (visible) redrawAndSchedule() else handler.removeCallbacks(boundary)
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            super.onSurfaceChanged(holder, format, width, height)
            surfaceReady = true
            drawWallpaper()
            schedule()
        }

        override fun onSurfaceRedrawNeeded(holder: SurfaceHolder) { drawWallpaper() }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            surfaceReady = false
            handler.removeCallbacks(boundary)
            clearBitmap()
            super.onSurfaceDestroyed(holder)
        }

        override fun onSharedPreferenceChanged(prefs: SharedPreferences?, key: String?) {
            if (isVisible) redrawAndSchedule()
        }

        private fun redrawAndSchedule() {
            if (surfaceReady && isVisible) drawWallpaper()
            schedule()
        }

        private fun schedule() {
            handler.removeCallbacks(boundary)
            if (surfaceReady && isVisible && store.automatic) {
                handler.postDelayed(boundary, DaySchedule.delayMillis(ZonedDateTime.now()))
            }
        }

        private fun clearBitmap() {
            bitmap?.recycle()
            bitmap = null
            bitmapPath = null
        }

        private fun drawWallpaper() {
            if (!surfaceReady) return
            val file = store.imageFile(store.currentSlot())
            if (bitmapPath != file.absolutePath || bitmap == null) {
                clearBitmap()
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(file.absolutePath, bounds)
                var sample = 1
                while (bounds.outWidth / sample > 2048 || bounds.outHeight / sample > 2048) sample *= 2
                bitmap = BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample })
                bitmapPath = file.absolutePath
            }
            val canvas = try { surfaceHolder.lockCanvas() } catch (_: Exception) { null } ?: return
            try {
                canvas.drawColor(Color.rgb(18, 38, 64))
                bitmap?.let { image ->
                    val scale = maxOf(canvas.width.toFloat() / image.width, canvas.height.toFloat() / image.height)
                    val w = image.width * scale
                    val h = image.height * scale
                    canvas.drawBitmap(image, null, RectF((canvas.width - w) / 2, (canvas.height - h) / 2,
                        (canvas.width + w) / 2, (canvas.height + h) / 2), Paint(Paint.FILTER_BITMAP_FLAG))
                }
            } finally { surfaceHolder.unlockCanvasAndPost(canvas) }
        }

        override fun onDestroy() {
            handler.removeCallbacksAndMessages(null)
            store.prefs.unregisterOnSharedPreferenceChangeListener(this)
            unregisterReceiver(clockReceiver)
            clearBitmap()
            super.onDestroy()
        }
    }
}
