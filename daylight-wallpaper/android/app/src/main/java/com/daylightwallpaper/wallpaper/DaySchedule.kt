package com.daylightwallpaper.wallpaper

import java.time.Duration
import java.time.ZonedDateTime

/** Local wall-clock boundaries; the system timezone is read anew on each draw. */
object DaySchedule {
    val keys = listOf("morning", "afternoon", "evening", "night")
    fun slot(hour: Int): String = when (hour) {
        in 6..11 -> "morning"
        in 12..17 -> "afternoon"
        in 18..20 -> "evening"
        else -> "night"
    }

    fun nextBoundary(now: ZonedDateTime): ZonedDateTime {
        val today = now.toLocalDate()
        return (0L..1L).flatMap { day ->
            listOf(6, 12, 18, 21).map { hour ->
                today.plusDays(day).atTime(hour, 0).atZone(now.zone)
            }
        }.first { it.isAfter(now) }
    }

    fun delayMillis(now: ZonedDateTime): Long =
        Duration.between(now, nextBoundary(now)).toMillis().coerceAtLeast(1000)
}
