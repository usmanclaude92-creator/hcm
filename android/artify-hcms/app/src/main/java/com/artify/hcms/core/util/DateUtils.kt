package com.artify.hcms.core.util

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object DateUtils {

    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private val displayDateTime = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.US)
    private val displayDate = SimpleDateFormat("dd MMM yyyy", Locale.US)
    private val displayTime = SimpleDateFormat("hh:mm a", Locale.US)
    private val dateOnlyFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    private val monthOnlyFormat = SimpleDateFormat("yyyy-MM", Locale.US)

    fun getCurrentIsoTimestamp(): String = isoFormat.format(Date())

    fun getTodayDateString(): String = dateOnlyFormat.format(Date())

    fun getCurrentMonthString(): String = monthOnlyFormat.format(Date())

    fun formatDateTime(isoString: String?): String {
        if (isoString.isNullOrBlank()) return "--"
        return try {
            val date = parseIso(isoString)
            displayDateTime.format(date)
        } catch (e: Exception) {
            isoString
        }
    }

    fun formatTime(isoString: String?): String {
        if (isoString.isNullOrBlank()) return "--"
        return try {
            val date = parseIso(isoString)
            displayTime.format(date)
        } catch (e: Exception) {
            isoString
        }
    }

    fun formatDate(dateString: String?): String {
        if (dateString.isNullOrBlank()) return "--"
        return try {
            if (dateString.length == 10 && dateString.contains("-")) {
                val date = dateOnlyFormat.parse(dateString) ?: return dateString
                displayDate.format(date)
            } else {
                val date = parseIso(dateString)
                displayDate.format(date)
            }
        } catch (e: Exception) {
            dateString
        }
    }

    private fun parseIso(iso: String): Date {
        return try {
            isoFormat.parse(iso) ?: Date()
        } catch (e: Exception) {
            val simple = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            simple.parse(iso.substringBefore('.')) ?: Date()
        }
    }
}
