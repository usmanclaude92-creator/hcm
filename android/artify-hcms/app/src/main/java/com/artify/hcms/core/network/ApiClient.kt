package com.artify.hcms.core.network

import com.artify.hcms.BuildConfig
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.data.remote.HcmsApiService
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {

    private var currentBaseUrl: String? = null
    private var cachedRetrofit: Retrofit? = null
    private var cachedApiService: HcmsApiService? = null

    fun getApiService(sessionManager: SessionManager): HcmsApiService {
        val baseUrl = sessionManager.getCustomBaseUrl() ?: BuildConfig.DEFAULT_API_BASE_URL
        val formattedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

        if (cachedApiService != null && currentBaseUrl == formattedBaseUrl) {
            return cachedApiService!!
        }

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(sessionManager))
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(formattedBaseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        currentBaseUrl = formattedBaseUrl
        cachedRetrofit = retrofit
        val service = retrofit.create(HcmsApiService::class.java)
        cachedApiService = service
        return service
    }

    fun invalidate() {
        currentBaseUrl = null
        cachedRetrofit = null
        cachedApiService = null
    }
}
