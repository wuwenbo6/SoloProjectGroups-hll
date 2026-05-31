package com.gait.analysis.network

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class NetworkManager(private val context: Context) {

    private val baseUrl = "http://your-server-url.com"
    
    private val okHttpClient: OkHttpClient by lazy {
        val logging = HttpLoggingInterceptor()
        logging.level = HttpLoggingInterceptor.Level.BASIC
        
        OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    val apiService: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }

    private val dataBuffer = mutableListOf<IMUDataPoint>()
    private val bufferSize = 100

    fun addDataPoint(
        timestamp: Long,
        accelX: Float, accelY: Float, accelZ: Float,
        gyroX: Float, gyroY: Float, gyroZ: Float,
        predictedPhase: String,
        confidence: Float
    ) {
        dataBuffer.add(
            IMUDataPoint(
                timestamp, accelX, accelY, accelZ,
                gyroX, gyroY, gyroZ, predictedPhase, confidence
            )
        )

        if (dataBuffer.size >= bufferSize) {
            flushBuffer()
        }
    }

    fun flushBuffer(sessionId: String = "default", userId: String = "user1") {
        if (dataBuffer.isEmpty()) return

        val request = UploadRequest(
            sessionId = sessionId,
            userId = userId,
            data = dataBuffer.toList()
        )

        try {
            apiService.uploadData(request).enqueue(object : retrofit2.Callback<UploadResponse> {
                override fun onResponse(
                    call: retrofit2.Call<UploadResponse>,
                    response: retrofit2.Response<UploadResponse>
                ) {
                    if (response.isSuccessful && response.body()?.success == true) {
                        dataBuffer.clear()
                    }
                }

                override fun onFailure(call: retrofit2.Call<UploadResponse>, t: Throwable) {
                }
            })
        } catch (e: Exception) {
        }
    }

    fun clearBuffer() {
        dataBuffer.clear()
    }
}
