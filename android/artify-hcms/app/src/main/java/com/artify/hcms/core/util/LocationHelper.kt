package com.artify.hcms.core.util

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class WorksiteGeofence(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Double
)

object LocationHelper {

    // Default reference work locations in the Sultanate of Oman
    val DEFAULT_WORKSITES = listOf(
        WorksiteGeofence(
            id = "proj-hq",
            name = "Artify Corporate HQ - Muscat",
            latitude = 23.5880,
            longitude = 58.3829,
            radiusMeters = 500.0
        ),
        WorksiteGeofence(
            id = "proj-sohar",
            name = "Sohar Industrial Zone Substation",
            latitude = 24.3644,
            longitude = 56.7468,
            radiusMeters = 800.0
        ),
        WorksiteGeofence(
            id = "proj-salalah",
            name = "Salalah Port Logistics Facility",
            latitude = 17.0151,
            longitude = 54.0924,
            radiusMeters = 1000.0
        ),
        WorksiteGeofence(
            id = "proj-duqm",
            name = "Duqm Special Economic Zone (SEZAD)",
            latitude = 19.6644,
            longitude = 57.7036,
            radiusMeters = 1200.0
        )
    )

    /**
     * Calculates great-circle distance between two geographic points using Haversine formula.
     * Returns distance in meters.
     */
    fun calculateDistanceMeters(
        lat1: Double, lon1: Double,
        lat2: Double, lon2: Double
    ): Double {
        val r = 6371000.0 // Earth radius in meters
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }

    /**
     * Checks if coordinates fall within any recognized project geofence.
     * If not within boundary, returns exception details without blocking attendance submission.
     */
    fun evaluateGeofence(
        latitude: Double?,
        longitude: Double?,
        worksites: List<WorksiteGeofence> = DEFAULT_WORKSITES
    ): GeofenceResult {
        if (latitude == null || longitude == null) {
            return GeofenceResult(
                isException = true,
                exceptionReason = "GPS coordinates unavailable at check-in",
                matchedSite = null,
                nearestDistanceMeters = null
            )
        }

        var nearestSite: WorksiteGeofence? = null
        var minDistance = Double.MAX_VALUE

        for (site in worksites) {
            val dist = calculateDistanceMeters(latitude, longitude, site.latitude, site.longitude)
            if (dist < minDistance) {
                minDistance = dist
                nearestSite = site
            }
        }

        return if (nearestSite != null && minDistance <= nearestSite.radiusMeters) {
            GeofenceResult(
                isException = false,
                exceptionReason = null,
                matchedSite = nearestSite,
                nearestDistanceMeters = minDistance
            )
        } else {
            val nearestName = nearestSite?.name ?: "Designated Site"
            val distKm = if (minDistance < Double.MAX_VALUE) String.format("%.2f km", minDistance / 1000.0) else "Unknown"
            GeofenceResult(
                isException = true,
                exceptionReason = "Check-in at $distKm from $nearestName (outside ${nearestSite?.radiusMeters?.toInt()}m perimeter)",
                matchedSite = nearestSite,
                nearestDistanceMeters = minDistance
            )
        }
    }
}

data class GeofenceResult(
    val isException: Boolean,
    val exceptionReason: String?,
    val matchedSite: WorksiteGeofence?,
    val nearestDistanceMeters: Double?
)
