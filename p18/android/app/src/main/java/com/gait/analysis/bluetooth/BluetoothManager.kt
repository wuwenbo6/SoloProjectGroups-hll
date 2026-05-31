package com.gait.analysis.bluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

data class IMUData(
    val timestamp: Long,
    val accelX: Float,
    val accelY: Float,
    val accelZ: Float,
    val gyroX: Float,
    val gyroY: Float,
    val gyroZ: Float
)

interface BluetoothCallback {
    fun onDeviceFound(device: BluetoothDevice)
    fun onConnected()
    fun onDisconnected()
    fun onReconnecting(attempt: Int, maxAttempts: Int)
    fun onReconnected()
    fun onDataReceived(data: IMUData)
    fun onDataLost(count: Int)
    fun onError(message: String)
}

class BluetoothManager(private val context: Context) {

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothManager.adapter
    }

    private var bluetoothGatt: BluetoothGatt? = null
    private var callback: BluetoothCallback? = null
    private var connectedDevice: BluetoothDevice? = null

    private val handler = Handler(Looper.getMainLooper())
    private val scanResults = mutableSetOf<BluetoothDevice>()

    private val isConnected = AtomicBoolean(false)
    private val isReconnecting = AtomicBoolean(false)

    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 10
    private var baseReconnectDelay = 1000L
    private val maxReconnectDelay = 30000L

    private val dataCache = ConcurrentLinkedQueue<IMUData>()
    private val maxCacheSize = 10000
    private var dataLostCount = 0

    private var connectionStartTime = 0L
    private var lastDataTime = 0L
    private val dataTimeout = 5000L

    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        val CHARACTERISTIC_UUID: UUID = UUID.fromString("6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
        val DESCRIPTOR_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    private val dataTimeoutRunnable = Runnable {
        if (isConnected.get() && System.currentTimeMillis() - lastDataTime > dataTimeout) {
            callback?.onError("数据接收超时，正在重连...")
            triggerReconnect()
        }
    }

    fun isBluetoothEnabled(): Boolean = bluetoothAdapter?.isEnabled == true

    fun isDeviceConnected(): Boolean = isConnected.get()

    fun startScan(callback: BluetoothCallback) {
        this.callback = callback
        scanResults.clear()

        if (!hasPermission()) {
            callback.onError("缺少蓝牙权限")
            return
        }

        bluetoothAdapter?.startLeScan(leScanCallback)

        handler.postDelayed({
            stopScan()
        }, 10000)
    }

    fun stopScan() {
        if (hasPermission()) {
            bluetoothAdapter?.stopLeScan(leScanCallback)
        }
    }

    private val leScanCallback = BluetoothAdapter.LeScanCallback { device, _, _ ->
        if (device.name != null && !scanResults.contains(device)) {
            scanResults.add(device)
            callback?.onDeviceFound(device)
        }
    }

    fun connect(device: BluetoothDevice, callback: BluetoothCallback) {
        this.callback = callback
        this.connectedDevice = device
        this.reconnectAttempts = 0
        this.dataLostCount = 0

        if (hasPermission()) {
            bluetoothGatt = device.connectGatt(context, false, gattCallback)
        }
    }

    private fun triggerReconnect() {
        if (isReconnecting.get() || reconnectAttempts >= maxReconnectAttempts) {
            if (reconnectAttempts >= maxReconnectAttempts) {
                callback?.onError("重连失败次数过多，请手动重连")
                isReconnecting.set(false)
            }
            return
        }

        isReconnecting.set(true)
        reconnectAttempts++

        val delay = min(
            maxReconnectDelay,
            baseReconnectDelay * (1L shl min(reconnectAttempts - 1, 5))
        )

        callback?.onReconnecting(reconnectAttempts, maxReconnectAttempts)

        handler.postDelayed({
            try {
                if (hasPermission()) {
                    bluetoothGatt?.close()
                    bluetoothGatt = null

                    connectedDevice?.let {
                        bluetoothGatt = it.connectGatt(context, false, gattCallback)
                    }
                }
            } catch (e: Exception) {
                isReconnecting.set(false)
                triggerReconnect()
            }
        }, delay)
    }

    fun disconnect() {
        isReconnecting.set(false)
        handler.removeCallbacks(dataTimeoutRunnable)
        handler.removeCallbacksAndMessages(null)

        if (hasPermission()) {
            bluetoothGatt?.disconnect()
            bluetoothGatt?.close()
            bluetoothGatt = null
        }

        isConnected.set(false)
        connectedDevice = null
        dataCache.clear()
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                isConnected.set(true)
                isReconnecting.set(false)
                reconnectAttempts = 0
                connectionStartTime = System.currentTimeMillis()

                if (dataLostCount > 0) {
                    callback?.onDataLost(dataLostCount)
                    dataLostCount = 0
                    callback?.onReconnected()
                } else {
                    callback?.onConnected()
                }

                if (hasPermission()) {
                    gatt.discoverServices()
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                val wasConnected = isConnected.get()
                isConnected.set(false)
                handler.removeCallbacks(dataTimeoutRunnable)

                if (wasConnected && connectedDevice != null) {
                    callback?.onDisconnected()
                    triggerReconnect()
                } else {
                    callback?.onDisconnected()
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(SERVICE_UUID)
                val characteristic = service?.getCharacteristic(CHARACTERISTIC_UUID)

                characteristic?.let {
                    gatt.setCharacteristicNotification(it, true)
                    val descriptor = it.getDescriptor(DESCRIPTOR_UUID)
                    descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    if (hasPermission()) {
                        gatt.writeDescriptor(descriptor)
                    }
                }
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            super.onCharacteristicChanged(gatt, characteristic)

            lastDataTime = System.currentTimeMillis()
            handler.removeCallbacks(dataTimeoutRunnable)
            handler.postDelayed(dataTimeoutRunnable, dataTimeout)

            parseIMUData(characteristic.value)?.let { data ->
                if (isConnected.get()) {
                    callback?.onDataReceived(data)
                } else {
                    cacheData(data)
                }
            }
        }

        override fun onDescriptorWrite(gatt: BluetoothGatt?, descriptor: BluetoothGattDescriptor?, status: Int) {
            super.onDescriptorWrite(gatt, descriptor, status)
            lastDataTime = System.currentTimeMillis()
            handler.postDelayed(dataTimeoutRunnable, dataTimeout)
        }
    }

    private fun cacheData(data: IMUData) {
        while (dataCache.size >= maxCacheSize) {
            dataCache.poll()
            dataLostCount++
        }
        dataCache.offer(data)
    }

    fun flushCachedData(): List<IMUData> {
        val cached = mutableListOf<IMUData>()
        while (dataCache.isNotEmpty()) {
            dataCache.poll()?.let { cached.add(it) }
        }
        return cached
    }

    fun getCachedDataCount(): Int = dataCache.size

    fun getConnectionDuration(): Long {
        return if (isConnected.get()) {
            System.currentTimeMillis() - connectionStartTime
        } else {
            0
        }
    }

    private fun parseIMUData(bytes: ByteArray): IMUData? {
        return try {
            if (bytes.size >= 24) {
                val buffer = java.nio.ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN)
                IMUData(
                    timestamp = System.currentTimeMillis(),
                    accelX = buffer.float,
                    accelY = buffer.float,
                    accelZ = buffer.float,
                    gyroX = buffer.float,
                    gyroY = buffer.float,
                    gyroZ = buffer.float
                )
            } else null
        } catch (e: Exception) {
            null
        }
    }

    private fun hasPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_SCAN
            ) == PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }
    }
}
