package com.daylightwallpaper.wallpaper

import android.content.Context
import android.graphics.*
import java.io.File
import java.time.ZonedDateTime

class WallpaperStore(private val context: Context) {
    val prefs = context.getSharedPreferences("daylight", Context.MODE_PRIVATE)
    val automatic: Boolean get() = prefs.getBoolean("automatic", true)
    fun currentSlot(): String = if (automatic) DaySchedule.slot(ZonedDateTime.now().hour)
        else prefs.getString("frozenSlot", "morning") ?: "morning"
    fun customFile(slot: String): File? = prefs.getString(slot, null)?.let { File(context.filesDir, it) }?.takeIf { it.exists() }
    fun imageFile(slot: String): File = customFile(slot) ?: sampleFile(slot)

    // Offline vector-like dune studies, rendered once and cached locally.
    private fun sampleFile(slot: String): File = synchronized(sampleLock) { sampleFileLocked(slot) }

    private fun sampleFileLocked(slot: String): File {
        val file = File(context.filesDir, "sample_dunes_v2_$slot.png")
        if (file.exists()) return file
        val palettes = mapOf(
            "morning" to intArrayOf(0xffB38A92.toInt(), 0xffF8C9A4.toInt(), 0xffD19B8D.toInt(), 0xffAA776D.toInt(), 0xff795A58.toInt()),
            "afternoon" to intArrayOf(0xffA5BCC3.toInt(), 0xffF2D4AF.toInt(), 0xffD8AC87.toInt(), 0xffBB8568.toInt(), 0xff825C50.toInt()),
            "evening" to intArrayOf(0xff645877.toInt(), 0xffE7A38B.toInt(), 0xffC48480.toInt(), 0xff8D677C.toInt(), 0xff4B4360.toInt()),
            "night" to intArrayOf(0xff111E35.toInt(), 0xff63728D.toInt(), 0xff4E607D.toInt(), 0xff31425F.toInt(), 0xff1E2D45.toInt())
        )
        val colors = palettes.getValue(slot)
        val bitmap = Bitmap.createBitmap(1080, 1920, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = LinearGradient(0f, 0f, 0f, 1560f, colors[0], colors[1], Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, 1080f, 1920f, paint)
        paint.shader = RadialGradient(730f, 650f, 460f, intArrayOf(0x28FFF1C9, 0x00FFF1C9), null, Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, 1080f, 1500f, paint)
        paint.shader = null
        paint.color = if (slot == "night") 0xffF2F1D8.toInt() else 0xffFFE8BB.toInt()
        canvas.drawCircle(730f, 650f, if (slot == "night") 48f else 98f, paint)
        if (slot == "night") {
            val random = java.util.Random(17)
            for (i in 1..80) {
                paint.alpha = 60 + random.nextInt(150)
                canvas.drawCircle(random.nextFloat() * 1080, 80 + random.nextFloat() * 940, 1 + random.nextFloat() * 1.4f, paint)
            }
            paint.alpha = 255
        }
        // Layered Bezier silhouettes stay crisp at every screen size.
        paint.shader = LinearGradient(0f, 1080f, 0f, 1700f, colors[2], colors[3], Shader.TileMode.CLAMP)
        canvas.drawPath(Path().apply {
            moveTo(-80f, 1400f); cubicTo(220f, 1140f, 390f, 1080f, 580f, 1140f)
            cubicTo(790f, 1205f, 850f, 970f, 1160f, 1040f)
            lineTo(1160f, 1920f); lineTo(-80f, 1920f); close()
        }, paint)
        paint.shader = LinearGradient(100f, 1360f, 700f, 1800f, colors[3], colors[4], Shader.TileMode.CLAMP)
        canvas.drawPath(Path().apply {
            moveTo(-80f, 1260f); cubicTo(210f, 1240f, 360f, 1430f, 620f, 1470f)
            cubicTo(850f, 1505f, 930f, 1380f, 1160f, 1490f)
            lineTo(1160f, 1920f); lineTo(-80f, 1920f); close()
        }, paint)
        paint.shader = LinearGradient(0f, 1600f, 0f, 1920f, colors[4], blend(colors[4], 0xff0D1726.toInt(), .25f), Shader.TileMode.CLAMP)
        canvas.drawPath(Path().apply {
            moveTo(-80f, 1810f); cubicTo(210f, 1680f, 330f, 1800f, 580f, 1690f)
            cubicTo(830f, 1580f, 990f, 1610f, 1160f, 1510f)
            lineTo(1160f, 1920f); lineTo(-80f, 1920f); close()
        }, paint)
        paint.shader = null
        paint.color = 0x10FFFFFF
        paint.strokeWidth = 1.2f
        paint.style = Paint.Style.STROKE
        canvas.drawPath(Path().apply {moveTo(-80f, 1260f); cubicTo(210f, 1240f, 360f, 1430f, 620f, 1470f); cubicTo(850f, 1505f, 930f, 1380f, 1160f, 1490f)}, paint)
        paint.style = Paint.Style.FILL
        val random = java.util.Random(42)
        for (i in 0..18000) {
            paint.color = if (i % 2 == 0) 0x08FFFFFF else 0x08000000
            canvas.drawCircle(random.nextFloat() * 1080, random.nextFloat() * 1920, .7f, paint)
        }
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        return file
    }

    companion object { private val sampleLock = Any() }

    private fun blend(from: Int, to: Int, amount: Float): Int = Color.rgb(
        (Color.red(from) * (1 - amount) + Color.red(to) * amount).toInt(),
        (Color.green(from) * (1 - amount) + Color.green(to) * amount).toInt(),
        (Color.blue(from) * (1 - amount) + Color.blue(to) * amount).toInt()
    )
}
