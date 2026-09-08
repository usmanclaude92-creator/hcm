package com.artify.hcms.core.storage

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SessionManager(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "artify_hcms_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        context.getSharedPreferences("artify_hcms_fallback_prefs", Context.MODE_PRIVATE)
    }

    companion object {
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USERNAME = "username"
        private const val KEY_ROLE = "role"
        private const val KEY_EMPLOYEE_ID = "employee_id"
        private const val KEY_COMPANY_SCOPE = "company_scope"
        private const val KEY_BASE_URL = "api_base_url"
    }

    fun saveAuthSession(
        token: String,
        userId: String,
        username: String,
        role: String,
        employeeId: String?,
        companyScope: String?
    ) {
        prefs.edit()
            .putString(KEY_AUTH_TOKEN, token)
            .putString(KEY_USER_ID, userId)
            .putString(KEY_USERNAME, username)
            .putString(KEY_ROLE, role)
            .putString(KEY_EMPLOYEE_ID, employeeId ?: "")
            .putString(KEY_COMPANY_SCOPE, companyScope ?: "ALL")
            .apply()
    }

    fun getAuthToken(): String? = prefs.getString(KEY_AUTH_TOKEN, null)

    fun getUserId(): String? = prefs.getString(KEY_USER_ID, null)

    fun getUsername(): String? = prefs.getString(KEY_USERNAME, null)

    fun getRole(): String? = prefs.getString(KEY_ROLE, null)

    fun getEmployeeId(): String? = prefs.getString(KEY_EMPLOYEE_ID, null)?.takeIf { it.isNotEmpty() }

    fun getCompanyScope(): String = prefs.getString(KEY_COMPANY_SCOPE, "ALL") ?: "ALL"

    fun isLoggedIn(): Boolean = !getAuthToken().isNullOrEmpty()

    fun getCustomBaseUrl(): String? = prefs.getString(KEY_BASE_URL, null)

    fun setCustomBaseUrl(url: String?) {
        if (url.isNullOrBlank()) {
            prefs.edit().remove(KEY_BASE_URL).apply()
        } else {
            prefs.edit().putString(KEY_BASE_URL, url.trim().trimEnd('/')).apply()
        }
    }

    fun clearSession() {
        prefs.edit()
            .remove(KEY_AUTH_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_USERNAME)
            .remove(KEY_ROLE)
            .remove(KEY_EMPLOYEE_ID)
            .remove(KEY_COMPANY_SCOPE)
            .apply()
    }
}
