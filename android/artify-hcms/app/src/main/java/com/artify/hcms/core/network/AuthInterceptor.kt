package com.artify.hcms.core.network

import com.artify.hcms.core.storage.SessionManager
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val sessionManager: SessionManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        val token = sessionManager.getAuthToken()

        val requestBuilder = originalRequest.newBuilder()
            .header("Accept", "application/json")

        if (!token.isNullOrEmpty() && originalRequest.header("Authorization") == null) {
            requestBuilder.header("Authorization", "Bearer $token")
        }

        val response = chain.proceed(requestBuilder.build())

        // If 401 Unauthorized occurs on an authenticated route, clear session
        if (response.code == 401 && !token.isNullOrEmpty()) {
            sessionManager.clearSession()
        }

        return response
    }
}
