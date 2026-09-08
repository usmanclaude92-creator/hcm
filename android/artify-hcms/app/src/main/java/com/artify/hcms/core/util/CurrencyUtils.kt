package com.artify.hcms.core.util

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale

object CurrencyUtils {

    private val omrFormat = DecimalFormat("#,##0.000", DecimalFormatSymbols(Locale.US))

    fun formatOMR(amount: Double?): String {
        if (amount == null || amount.isNaN() || amount.isInfinite()) {
            return "OMR 0.000"
        }
        return "OMR ${omrFormat.format(roundOMR(amount))}"
    }

    fun formatOMRRaw(amount: Double?): String {
        if (amount == null || amount.isNaN() || amount.isInfinite()) {
            return "0.000"
        }
        return omrFormat.format(roundOMR(amount))
    }

    fun roundOMR(value: Double?): Double {
        if (value == null || value.isNaN() || value.isInfinite()) return 0.0
        return BigDecimal.valueOf(value)
            .setScale(3, RoundingMode.HALF_UP)
            .toDouble()
    }
}
