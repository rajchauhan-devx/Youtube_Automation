package com.daylightwallpaper.wallpaper

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZonedDateTime

class DayScheduleTest {
    @Test fun allHoursUseTheCorrectWallpaper() {
        val expected = List(6) { "night" } + List(6) { "morning" } + List(6) { "afternoon" } + List(3) { "evening" } + List(3) { "night" }
        assertEquals(expected, (0..23).map { DaySchedule.slot(it) })
    }

    @Test fun boundariesAreExclusiveOfNowAndRollOverMidnight() {
        for ((time, next) in listOf(
            "2026-10-17T05:59:59+05:30[Asia/Kolkata]" to "2026-10-17T06:00+05:30[Asia/Kolkata]",
            "2026-10-17T06:00+05:30[Asia/Kolkata]" to "2026-10-17T12:00+05:30[Asia/Kolkata]",
            "2026-10-17T12:00+05:30[Asia/Kolkata]" to "2026-10-17T18:00+05:30[Asia/Kolkata]",
            "2026-10-17T18:00+05:30[Asia/Kolkata]" to "2026-10-17T21:00+05:30[Asia/Kolkata]",
            "2026-10-17T21:00+05:30[Asia/Kolkata]" to "2026-10-18T06:00+05:30[Asia/Kolkata]"
        )) assertEquals(ZonedDateTime.parse(next), DaySchedule.nextBoundary(ZonedDateTime.parse(time)))
    }

    @Test fun daylightSavingUsesLocalMorningInsteadOfFixedElapsedHours() {
        val before = ZonedDateTime.parse("2026-03-07T21:00-05:00[America/New_York]")
        assertEquals(ZonedDateTime.parse("2026-03-08T06:00-04:00[America/New_York]"), DaySchedule.nextBoundary(before))
        assertEquals(8 * 60 * 60 * 1000L, DaySchedule.delayMillis(before))
    }
}
