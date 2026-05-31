package com.gait.analysis.ui

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.gait.analysis.R
import com.gait.analysis.bluetooth.BluetoothManager
import com.gait.analysis.bluetooth.IMUData
import com.gait.analysis.databinding.ActivityMainBinding
import com.gait.analysis.lstm.FallDetector
import com.gait.analysis.lstm.FallRisk
import com.gait.analysis.lstm.GaitPhase
import com.gait.analysis.lstm.GaitPhaseClassifier
import com.gait.analysis.network.NetworkManager
import com.gait.analysis.vibration.VibrationFeedback
import com.github.mikephil.charting.components.YAxis
import com.github.mikephil.charting.data.Entry
import com.github.mikephil.charting.data.LineData
import com.github.mikephil.charting.data.LineDataSet
import java.util.UUID

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var bluetoothManager: BluetoothManager
    private lateinit var gaitClassifier: GaitPhaseClassifier
    private lateinit var vibrationFeedback: VibrationFeedback
    private lateinit var networkManager: NetworkManager
    private lateinit var fallDetector: FallDetector

    private val deviceList = mutableListOf<BluetoothDevice>()
    private val deviceNames = mutableListOf<String>()
    private lateinit var deviceAdapter: ArrayAdapter<String>

    private val permissions = mutableListOf<String>().apply {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.VIBRATE)
        add(Manifest.permission.INTERNET)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(Manifest.permission.BLUETOOTH_SCAN)
            add(Manifest.permission.BLUETOOTH_CONNECT)
        }
    }.toTypedArray()

    private val REQUEST_PERMISSIONS = 1001
    private val sessionId = UUID.randomUUID().toString()
    private val userId = "demo_user_001"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        initializeManagers()
        setupUI()
        setupChart()
        checkPermissions()
    }

    private fun initializeManagers() {
        bluetoothManager = BluetoothManager(this)
        gaitClassifier = GaitPhaseClassifier(this)
        vibrationFeedback = VibrationFeedback(this)
        networkManager = NetworkManager(this)
        fallDetector = FallDetector(object : com.gait.analysis.lstm.FallDetectionCallback {
            override fun onFallDetected(result: com.gait.analysis.lstm.FallDetectionResult) {
                runOnUiThread {
                    vibrationFeedback.triggerFeedback(VibrationFeedback.FeedbackType.PHASE_ERROR)
                    Toast.makeText(this@MainActivity, "检测到摔倒！请确认安全", Toast.LENGTH_LONG).show()
                }
            }

            override fun onRiskLevelChanged(risk: FallRisk) {
                runOnUiThread {
                    updateFallRiskUI(risk)
                }
            }
        })

        gaitClassifier.initialize()
    }

    private fun setupUI() {
        deviceAdapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, deviceNames)
        binding.deviceList.adapter = deviceAdapter

        binding.btnScan.setOnClickListener {
            startBluetoothScan()
        }

        binding.deviceList.setOnItemClickListener { _, _, position, _ ->
            if (position < deviceList.size) {
                connectToDevice(deviceList[position])
            }
        }

        binding.btnStart.setOnClickListener {
            startGaitAnalysis()
        }

        binding.btnStop.setOnClickListener {
            stopGaitAnalysis()
        }

        binding.switchVibration.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked && !vibrationFeedback.hasVibrator()) {
                Toast.makeText(this, "设备不支持振动", Toast.LENGTH_SHORT).show()
                binding.switchVibration.isChecked = false
            }
        }
    }

    private fun setupChart() {
        binding.chart.apply {
            setTouchEnabled(true)
            isDragEnabled = true
            setScaleEnabled(true)
            setPinchZoom(true)
            description.isEnabled = false
        }

        val leftAxis = binding.chart.axisLeft
        leftAxis.setDrawGridLines(true)

        val rightAxis = binding.chart.axisRight
        rightAxis.isEnabled = false

        val data = LineData()
        binding.chart.data = data
    }

    private fun checkPermissions() {
        val missingPermissions = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                missingPermissions.toTypedArray(),
                REQUEST_PERMISSIONS
            )
        }
    }

    private fun startBluetoothScan() {
        if (!bluetoothManager.isBluetoothEnabled()) {
            Toast.makeText(this, "请先开启蓝牙", Toast.LENGTH_SHORT).show()
            return
        }

        deviceList.clear()
        deviceNames.clear()
        deviceAdapter.notifyDataSetChanged()

        binding.scanStatus.text = "正在扫描..."

        bluetoothManager.startScan(object : com.gait.analysis.bluetooth.BluetoothCallback {
            override fun onDeviceFound(device: BluetoothDevice) {
                runOnUiThread {
                    if (!deviceList.contains(device)) {
                        deviceList.add(device)
                        deviceNames.add("${device.name ?: "未知设备"} - ${device.address}")
                        deviceAdapter.notifyDataSetChanged()
                    }
                }
            }

            override fun onConnected() {
                runOnUiThread {
                    binding.connectionStatus.text = "已连接"
                    binding.connectionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.green))
                    vibrationFeedback.triggerFeedback(VibrationFeedback.FeedbackType.CONNECTION_SUCCESS)
                }
            }

            override fun onDisconnected() {
                runOnUiThread {
                    binding.connectionStatus.text = "已断开"
                    binding.connectionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.red))
                }
            }

            override fun onReconnecting(attempt: Int, maxAttempts: Int) {
                runOnUiThread {
                    binding.connectionStatus.text = "重连中 ($attempt/$maxAttempts)"
                    binding.connectionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.orange))
                }
            }

            override fun onReconnected() {
                runOnUiThread {
                    binding.connectionStatus.text = "已重连"
                    binding.connectionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.green))
                    vibrationFeedback.triggerFeedback(VibrationFeedback.FeedbackType.CONNECTION_SUCCESS)
                }
            }

            override fun onDataLost(count: Int) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "断线期间丢失 $count 条数据", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onDataReceived(data: IMUData) {
                processIMUData(data)
            }

            override fun onError(message: String) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, message, Toast.LENGTH_SHORT).show()
                }
            }
        })
    }

    private fun connectToDevice(device: BluetoothDevice) {
        binding.scanStatus.text = "连接中..."
        bluetoothManager.stopScan()

        bluetoothManager.connect(device, object : com.gait.analysis.bluetooth.BluetoothCallback {
            override fun onDeviceFound(device: BluetoothDevice) {}

            override fun onConnected() {
                runOnUiThread {
                    binding.connectionStatus.text = "已连接"
                    binding.connectionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.green))
                    binding.scanStatus.text = "已连接到 ${device.name}"
                    vibrationFeedback.triggerFeedback(VibrationFeedback.FeedbackType.CONNECTION_SUCCESS)
                }
            }

            override fun onDisconnected() {
                runOnUiThread {
                    binding.connectionStatus.text = "已断开"
                    binding.connectionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.red))
                }
            }

            override fun onReconnecting(attempt: Int, maxAttempts: Int) {
                runOnUiThread {
                    binding.connectionStatus.text = "重连中 ($attempt/$maxAttempts)"
                    binding.connectionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.orange))
                }
            }

            override fun onReconnected() {
                runOnUiThread {
                    binding.connectionStatus.text = "已重连"
                    binding.connectionStatus.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.green))
                    binding.scanStatus.text = "已重连到 ${device.name}"
                    vibrationFeedback.triggerFeedback(VibrationFeedback.FeedbackType.CONNECTION_SUCCESS)
                }
            }

            override fun onDataLost(count: Int) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "断线期间丢失 $count 条数据", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onDataReceived(data: IMUData) {
                processIMUData(data)
            }

            override fun onError(message: String) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, message, Toast.LENGTH_SHORT).show()
                    binding.scanStatus.text = "连接失败"
                }
            }
        })
    }

    private var isAnalyzing = false
    private var entryCount = 0

    private fun startGaitAnalysis() {
        isAnalyzing = true
        binding.btnStart.isEnabled = false
        binding.btnStop.isEnabled = true
        entryCount = 0
        
        binding.chart.data.clearValues()
        binding.chart.notifyDataSetChanged()
    }

    private fun stopGaitAnalysis() {
        isAnalyzing = false
        binding.btnStart.isEnabled = true
        binding.btnStop.isEnabled = false
        
        networkManager.flushBuffer(sessionId, userId)
        bluetoothManager.disconnect()
    }

    private fun processIMUData(data: IMUData) {
        val prediction = gaitClassifier.predict(
            data.accelX, data.accelY, data.accelZ,
            data.gyroX, data.gyroY, data.gyroZ
        )

        val fallResult = fallDetector.detect(data.accelX, data.accelY, data.accelZ)

        runOnUiThread {
            updateUI(prediction.phase, prediction.confidence)
            updateFallRiskUI(fallResult.risk)
            updateChart(data)
        }

        if (isAnalyzing) {
            networkManager.addDataPoint(
                data.timestamp,
                data.accelX, data.accelY, data.accelZ,
                data.gyroX, data.gyroY, data.gyroZ,
                prediction.phase.name,
                prediction.confidence
            )

            checkAndTriggerFeedback(prediction.phase)
        }
    }

    private fun updateFallRiskUI(risk: FallRisk) {
        val riskText = when (risk) {
            FallRisk.LOW -> "摔倒风险: 低"
            FallRisk.MEDIUM -> "摔倒风险: 中"
            FallRisk.HIGH -> "摔倒风险: 高"
            FallRisk.FALL_DETECTED -> "摔倒风险: 检测到摔倒！"
        }
        binding.fallRiskText.text = riskText

        val colorRes = when (risk) {
            FallRisk.LOW -> R.color.green
            FallRisk.MEDIUM -> R.color.orange
            FallRisk.HIGH -> R.color.orange
            FallRisk.FALL_DETECTED -> R.color.red
        }
        binding.fallRiskIndicator.setBackgroundColor(ContextCompat.getColor(this, colorRes))
    }

    private fun updateUI(phase: GaitPhase, confidence: Float) {
        val phaseText = when (phase) {
            GaitPhase.STANCE -> "支撑相"
            GaitPhase.SWING -> "摆动相"
            GaitPhase.UNKNOWN -> "未知"
        }
        binding.phaseText.text = phaseText
        
        val colorRes = when (phase) {
            GaitPhase.STANCE -> R.color.blue
            GaitPhase.SWING -> R.color.orange
            GaitPhase.UNKNOWN -> R.color.gray
        }
        binding.phaseIndicator.setBackgroundColor(ContextCompat.getColor(this, colorRes))
        
        binding.confidenceText.text = "置信度: %.1f%%".format(confidence * 100)
    }

    private fun updateChart(data: IMUData) {
        val lineData = binding.chart.data ?: return

        val accelMag = Math.sqrt(
            (data.accelX * data.accelX + 
             data.accelY * data.accelY + 
             data.accelZ * data.accelZ).toDouble()
        ).toFloat()

        if (lineData.dataSetCount == 0) {
            val setAccel = LineDataSet(null, "加速度").apply {
                axisDependency = YAxis.AxisDependency.LEFT
                color = ContextCompat.getColor(this@MainActivity, R.color.blue)
                setDrawCircles(false)
                setDrawValues(false)
                lineWidth = 2f
            }
            lineData.addDataSet(setAccel)
        }

        lineData.addEntry(Entry(entryCount.toFloat(), accelMag), 0)
        lineData.notifyDataChanged()

        binding.chart.notifyDataSetChanged()
        binding.chart.setVisibleXRangeMaximum(100f)
        binding.chart.moveViewToX(entryCount.toFloat())

        entryCount++
    }

    private var lastPhase: GaitPhase = GaitPhase.UNKNOWN
    private var phaseStartTime = System.currentTimeMillis()

    private fun checkAndTriggerFeedback(currentPhase: GaitPhase) {
        if (!binding.switchVibration.isChecked) return

        val currentTime = System.currentTimeMillis()
        val duration = currentTime - phaseStartTime

        val expectedDurationRange = when (lastPhase) {
            GaitPhase.STANCE -> 600..800
            GaitPhase.SWING -> 300..400
            else -> return
        }

        if (currentPhase != lastPhase && currentPhase != GaitPhase.UNKNOWN) {
            if (duration < expectedDurationRange.first * 0.7 || 
                duration > expectedDurationRange.last * 1.3) {
                vibrationFeedback.triggerFeedback(VibrationFeedback.FeedbackType.PHASE_ERROR)
            }
            lastPhase = currentPhase
            phaseStartTime = currentTime
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_PERMISSIONS) {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (!allGranted) {
                Toast.makeText(this, "需要所有权限才能正常使用", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        bluetoothManager.disconnect()
        gaitClassifier.close()
        vibrationFeedback.stop()
    }
}
