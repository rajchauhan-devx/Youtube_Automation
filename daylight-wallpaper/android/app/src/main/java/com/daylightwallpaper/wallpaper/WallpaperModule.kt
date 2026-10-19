package com.daylightwallpaper.wallpaper

import android.app.Activity
import android.app.WallpaperManager
import android.app.WallpaperInfo
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import com.facebook.react.bridge.*
import java.io.File
import java.util.concurrent.Executors

class WallpaperModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    private val store = WallpaperStore(context)
    private val worker = Executors.newSingleThreadExecutor()
    private var pending: Promise? = null
    private var pendingSlot: String? = null
    private val listener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != PICK_IMAGE) return
            val promise = pending ?: return
            val slot = pendingSlot ?: return
            pending = null
            pendingSlot = null
            val uri = data?.data
            if (resultCode != Activity.RESULT_OK || uri == null) { promise.resolve(null); return }
            worker.execute {
                var temp: File? = null
                var output: File? = null
                var bitmap: Bitmap? = null
                try {
                    temp = File.createTempFile("import", ".image", context.cacheDir)
                    context.contentResolver.openInputStream(uri)?.use { input ->
                        temp.outputStream().use { out ->
                            val buffer = ByteArray(8192)
                            var total = 0L
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                total += count
                                require(total <= 50L * 1024 * 1024) { "Please choose an image smaller than 50 MB." }
                                out.write(buffer, 0, count)
                            }
                        }
                    } ?: error("Cannot open this image. Please choose another photo.")
                    bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(temp)) { decoder, info, _ ->
                        val size = info.size
                        val scale = minOf(1.0, 2560.0 / maxOf(size.width, size.height))
                        decoder.setTargetSize(maxOf(1, (size.width * scale).toInt()), maxOf(1, (size.height * scale).toInt()))
                        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    }
                    output = File(context.filesDir, "${slot}_${System.nanoTime()}.jpg")
                    output.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it)) }
                    val previous = store.customFile(slot)
                    check(store.prefs.edit().putString(slot, output.name).commit()) { "Could not save this wallpaper." }
                    previous?.delete()
                    promise.resolve(config())
                } catch (e: Exception) {
                    output?.delete()
                    promise.reject("IMAGE_ERROR", e.message ?: "Could not read this photo.", e)
                } finally {
                    bitmap?.recycle()
                    temp?.delete()
                }
            }
        }
    }

    init { context.addActivityEventListener(listener) }
    override fun getName() = "DaylightWallpaper"

    private fun config(): WritableMap = Arguments.createMap().apply {
        putBoolean("automatic", store.automatic)
        putString("currentSlot", store.currentSlot())
        val info = WallpaperManager.getInstance(context).wallpaperInfo
        putBoolean("active", info?.packageName == context.packageName && info.serviceName == DaylightWallpaperService::class.java.name)
        putArray("slots", Arguments.createArray().apply {
            DaySchedule.keys.forEach { slot ->
                pushMap(Arguments.createMap().apply {
                    putString("key", slot)
                    putString("uri", Uri.fromFile(store.imageFile(slot)).toString())
                    putBoolean("custom", store.customFile(slot) != null)
                })
            }
        })
    }

    @ReactMethod fun getConfig(promise: Promise) {
        worker.execute { try { promise.resolve(config()) } catch (e: Exception) { promise.reject("CONFIG_ERROR", e) } }
    }

    @ReactMethod fun pickImage(slot: String, promise: Promise) {
        if (slot !in DaySchedule.keys) { promise.reject("INVALID_SLOT", "Unknown time of day"); return }
        val activity = reactApplicationContext.currentActivity
        if (activity == null) { promise.reject("NO_ACTIVITY", "Open the app to choose an image."); return }
        if (pending != null) { promise.reject("PICKER_BUSY", "The image picker is already open."); return }
        pending = promise
        pendingSlot = slot
        try {
            activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                type = "image/*"
                addCategory(Intent.CATEGORY_OPENABLE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }, PICK_IMAGE)
        } catch (e: Exception) {
            pending = null; pendingSlot = null
            promise.reject("PICKER_ERROR", "No photo picker is available on this device.", e)
        }
    }

    @ReactMethod fun resetImage(slot: String, promise: Promise) {
        if (slot !in DaySchedule.keys) { promise.reject("INVALID_SLOT", "Unknown time of day"); return }
        worker.execute {
            try {
                val previous = store.customFile(slot)
                check(store.prefs.edit().remove(slot).commit())
                previous?.delete()
                promise.resolve(config())
            } catch (e: Exception) { promise.reject("SAVE_ERROR", e) }
        }
    }

    @ReactMethod fun setAutomatic(enabled: Boolean, promise: Promise) {
        val edit = store.prefs.edit()
        if (!enabled) edit.putString("frozenSlot", store.currentSlot())
        edit.putBoolean("automatic", enabled).apply()
        getConfig(promise)
    }

    private fun isDaylight(info: WallpaperInfo?): Boolean =
        info?.packageName == context.packageName && info.serviceName == DaylightWallpaperService::class.java.name

    @ReactMethod fun disableWallpaper(promise: Promise) {
        worker.execute {
            try {
                val slot = store.currentSlot()
                // Persist the stop first so existing engines immediately cancel their timers.
                check(store.prefs.edit().putString("frozenSlot", slot)
                    .putBoolean("automatic", false).commit()) { "Could not stop automatic changes." }
                val manager = WallpaperManager.getInstance(context)
                var flags = 0
                if (isDaylight(manager.wallpaperInfo)) flags = WallpaperManager.FLAG_SYSTEM
                if (android.os.Build.VERSION.SDK_INT >= 34) {
                    if (isDaylight(manager.getWallpaperInfo(WallpaperManager.FLAG_LOCK))) {
                        flags = flags or WallpaperManager.FLAG_LOCK
                    }
                } else if (flags != 0 && manager.getWallpaperId(WallpaperManager.FLAG_LOCK) == -1) {
                    flags = flags or WallpaperManager.FLAG_LOCK
                }
                // Replace only screens currently using Daylight; leave other apps' wallpapers alone.
                if (flags != 0) {
                    store.imageFile(slot).inputStream().use { manager.setStream(it, null, false, flags) }
                }
                promise.resolve(config())
            } catch (e: Exception) {
                promise.reject("DISABLE_ERROR", "Automatic changes are paused, but Android could not switch to a still wallpaper. Choose another wallpaper in Android settings.", e)
            }
        }
    }

    @ReactMethod fun openWallpaperPicker(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) { promise.reject("NO_ACTIVITY", "Open the app to set your wallpaper."); return }
        try {
            activity.startActivity(Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER).apply {
                putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, ComponentName(context, DaylightWallpaperService::class.java))
            })
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WALLPAPER_UNAVAILABLE", "This device does not support the live wallpaper preview.", e)
        }
    }

    override fun invalidate() {
        context.removeActivityEventListener(listener)
        pending?.reject("APP_CLOSED", "The image picker was interrupted. Please try again.")
        pending = null
        worker.shutdown()
        super.invalidate()
    }

    companion object { private const val PICK_IMAGE = 4410 }
}
