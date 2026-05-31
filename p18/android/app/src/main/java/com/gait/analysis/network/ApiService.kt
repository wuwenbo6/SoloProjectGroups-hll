package com.gait.analysis.network

import com.gait.analysis.bluetooth.IMUData
import com.gait.analysis.lstm.GaitPhase
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class GaitSession(
    val sessionId: String,
    val userId: String,
    val startTime: Long,
    val endTime: Long? = null,
    val totalSteps: Int = 0,
    val avgStanceTime: Float = 0f,
    val avgSwingTime: Float = 0f,
    val asymmetryIndex: Float = 0f
)

data class IMUDataPoint(
    val timestamp: Long,
    val accelX: Float,
    val accelY: Float,
    val accelZ: Float,
    val gyroX: Float,
    val gyroY: Float,
    val gyroZ: Float,
    val predictedPhase: String,
    val confidence: Float
)

data class UploadRequest(
    val sessionId: String,
    val userId: String,
    val data: List<IMUDataPoint>
)

data class UploadResponse(
    val success: Boolean,
    val message: String,
    val modelUpdated: Boolean = false
)

data class ModelInfo(
    val modelVersion: String,
    val lastUpdated: Long,
    val accuracy: Float
)

interface ApiService {

    @POST("/api/data/upload")
    fun uploadData(@Body request: UploadRequest): Call<UploadResponse>

    @GET("/api/model/download/{userId}")
    fun getLatestModel(@Path("userId") userId: String): Call<okhttp3.ResponseBody>

    @GET("/api/model/info/{userId}")
    fun getModelInfo(@Path("userId") userId: String): Call<ModelInfo>

    @POST("/api/session/start")
    fun startSession(@Body session: GaitSession): Call<GaitSession>

    @POST("/api/session/end")
    fun endSession(@Body session: GaitSession): Call<GaitSession>

    @GET("/api/session/list")
    fun getSessionList(@Query("userId") userId: String): Call<List<GaitSession>>
}
