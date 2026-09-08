package com.artify.hcms.core.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BusinessLogicTest {

    @Test
    fun testCurrencyUtils_roundsToThreeDecimals() {
        assertEquals(500.000, CurrencyUtils.roundOMR(500.0), 0.0001)
        assertEquals(123.457, CurrencyUtils.roundOMR(123.4567), 0.0001)
        assertEquals("500.000 OMR", CurrencyUtils.formatOMR(500.0))
        assertEquals("1,250.500 OMR", CurrencyUtils.formatOMR(1250.5))
        assertEquals("0.000 OMR", CurrencyUtils.formatOMR(null))
    }

    @Test
    fun testLocationHelper_muscatGeofenceWithinBoundary() {
        // Muscat HQ: 23.5880, 58.3829
        // A coordinate 50 meters away:
        val nearbyLat = 23.5882
        val nearbyLon = 58.3831

        val eval = LocationHelper.evaluateGeofence(nearbyLat, nearbyLon)
        assertFalse(eval.isException)
        assertEquals("PRJ-HQ", eval.matchedSite?.id)
        assertTrue(eval.distanceMeters < 500.0)
    }

    @Test
    fun testLocationHelper_outsideGeofenceExceptionNonBlocking() {
        // Coordinate in Nizwa (far from Muscat HQ, Sohar, Salalah, Duqm)
        val nizwaLat = 22.9333
        val nizwaLon = 57.5333

        val eval = LocationHelper.evaluateGeofence(nizwaLat, nizwaLon)
        assertTrue(eval.isException)
        assertTrue(eval.exceptionReason?.contains("exception") == true)
    }

    @Test
    fun testDateUtils_formatting() {
        val iso = "2026-09-08T08:30:00.000Z"
        val formattedDate = DateUtils.formatDate(iso)
        assertTrue(formattedDate.contains("2026"))

        val formattedTime = DateUtils.formatTime(iso)
        assertTrue(formattedTime.contains(":"))
    }
}
