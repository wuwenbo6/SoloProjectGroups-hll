package com.indoorpositioning;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.SensorManager;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;
import android.net.wifi.rtt.RangingRequest;
import android.net.wifi.rtt.RangingResult;
import android.net.wifi.rtt.RangingResultCallback;
import android.net.wifi.rtt.WifiRttManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.method.ScrollingMovementMethod;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.gson.Gson;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQUEST_CODE = 100;
    private static final String[] REQUIRED_PERMISSIONS = {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.CHANGE_WIFI_STATE,
            Manifest.permission.INTERNET,
            Manifest.permission.POST_NOTIFICATIONS
    };

    private WifiManager wifiManager;
    private WifiRttManager wifiRttManager;
    private OkHttpClient httpClient;
    private Gson gson;
    private Executor executor;

    private String deviceId;
    private String serverUrl = "http://192.168.1.100:3000";
    private boolean isScanning = false;
    private boolean isRanging = false;

    private TextView rttStatus;
    private TextView wifiStatus;
    private TextView locationStatus;
    private TextView positionDisplay;
    private TextView accuracyDisplay;
    private TextView apCount;
    private TextView apList;
    private TextView serverUrlInput;
    private Button btnStart;
    private Button btnStop;
    private Button btnConnect;

    private List<ScanResult> scanResults = new ArrayList<>();
    private Map<String, Integer> apDistances = new HashMap<>();
    private Map<String, Integer> rawDistances = new HashMap<>();
    private MeasurementFilter measurementFilter;
    
    private StepDetector stepDetector;
    private PdrEngine pdrEngine;
    private TextView stepCountDisplay;
    private TextView directionDisplay;
    private TextView pdrPositionDisplay;
    private int stepCount = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        deviceId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        if (deviceId == null || deviceId.isEmpty()) {
            deviceId = UUID.randomUUID().toString();
        }

        wifiManager = (WifiManager) getSystemService(Context.WIFI_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            wifiRttManager = (WifiRttManager) getSystemService(Context.WIFI_RTT_RANGING_SERVICE);
        }
        httpClient = new OkHttpClient();
        gson = new Gson();
        executor = Executors.newSingleThreadExecutor();
        measurementFilter = new MeasurementFilter();
        
        SensorManager sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        stepDetector = new StepDetector(sensorManager);
        pdrEngine = new PdrEngine();

        initViews();
        checkPermissions();
        checkRttSupport();
        checkWifiStatus();
    }

    private void initViews() {
        rttStatus = findViewById(R.id.rttStatus);
        wifiStatus = findViewById(R.id.wifiStatus);
        locationStatus = findViewById(R.id.locationStatus);
        positionDisplay = findViewById(R.id.positionDisplay);
        accuracyDisplay = findViewById(R.id.accuracyDisplay);
        apCount = findViewById(R.id.apCount);
        apList = findViewById(R.id.apList);
        serverUrlInput = findViewById(R.id.serverUrl);
        btnStart = findViewById(R.id.btnStart);
        btnStop = findViewById(R.id.btnStop);
        btnConnect = findViewById(R.id.btnConnect);
        stepCountDisplay = findViewById(R.id.stepCountDisplay);
        directionDisplay = findViewById(R.id.directionDisplay);
        pdrPositionDisplay = findViewById(R.id.pdrPositionDisplay);

        apList.setMovementMethod(new ScrollingMovementMethod());

        btnStart.setOnClickListener(v -> startRanging());
        btnStop.setOnClickListener(v -> stopRanging());
        btnConnect.setOnClickListener(v -> {
            String url = serverUrlInput.getText().toString().trim();
            if (!url.isEmpty()) {
                serverUrl = url;
                Toast.makeText(this, "服务器地址已更新", Toast.LENGTH_SHORT).show();
            }
        });

        stepDetector.setStepListener(new StepDetector.OnStepListener() {
            @Override
            public void onStep(int count, float direction, float stepLength) {
                stepCount = count;
                runOnUiThread(() -> {
                    stepCountDisplay.setText(String.valueOf(count));
                    directionDisplay.setText(String.format("%.1f°", direction));
                });
                
                pdrEngine.updateWithStep(direction, stepLength);
                updatePdrDisplay();
            }

            @Override
            public void onAccelerationUpdate(float x, float y, float z) {
            }
        });
    }

    private void checkPermissions() {
        List<String> missingPermissions = new ArrayList<>();
        for (String permission : REQUIRED_PERMISSIONS) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                missingPermissions.add(permission);
            }
        }

        if (!missingPermissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, missingPermissions.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (allGranted) {
                Toast.makeText(this, "所有权限已授予", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "部分权限被拒绝，功能可能受限", Toast.LENGTH_LONG).show();
            }
        }
    }

    private void checkRttSupport() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager pm = getPackageManager();
            if (pm.hasSystemFeature(PackageManager.FEATURE_WIFI_RTT) && wifiRttManager != null) {
                rttStatus.setText("支持");
                rttStatus.setTextColor(0xFF00ff88);
            } else {
                rttStatus.setText("不支持");
                rttStatus.setTextColor(0xFFff6b6b);
            }
        } else {
            rttStatus.setText("需要Android 9+");
            rttStatus.setTextColor(0xFFff6b6b);
        }
    }

    private void checkWifiStatus() {
        if (wifiManager.isWifiEnabled()) {
            wifiStatus.setText("已开启");
            wifiStatus.setTextColor(0xFF00ff88);
        } else {
            wifiStatus.setText("已关闭");
            wifiStatus.setTextColor(0xFFff6b6b);
        }
    }

    private void startRanging() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || wifiRttManager == null) {
            Toast.makeText(this, "设备不支持Wi-Fi RTT", Toast.LENGTH_LONG).show();
            return;
        }

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "需要位置权限", Toast.LENGTH_SHORT).show();
            return;
        }

        isRanging = true;
        btnStart.setEnabled(false);
        btnStop.setEnabled(true);
        locationStatus.setText("运行中");
        locationStatus.setTextColor(0xFF00ff88);

        stepDetector.start();
        pdrEngine.reset();
        startWifiScan();
        startRangingLoop();
    }

    private void stopRanging() {
        isRanging = false;
        isScanning = false;
        btnStart.setEnabled(true);
        btnStop.setEnabled(false);
        locationStatus.setText("已停止");
        locationStatus.setTextColor(0xFFff6b6b);
        measurementFilter.clearAll();
        apDistances.clear();
        rawDistances.clear();
        stepDetector.stop();
        stepDetector.resetStepCount();
        stepCount = 0;
        runOnUiThread(() -> {
            stepCountDisplay.setText("0");
            directionDisplay.setText("--°");
            pdrPositionDisplay.setText("PDR: 已停止");
        });
    }

    private void updatePdrDisplay() {
        if (pdrEngine.isInitialized()) {
            PdrEngine.Position pos = pdrEngine.getPosition();
            runOnUiThread(() -> {
                pdrPositionDisplay.setText(String.format("PDR: (%.2f, %.2f, %.2f)", pos.x, pos.y, pos.z));
            });
        } else {
            runOnUiThread(() -> {
                pdrPositionDisplay.setText("PDR: 等待Wi-Fi定位初始化...");
            });
        }
    }

    private void startWifiScan() {
        isScanning = true;
        IntentFilter filter = new IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION);
        registerReceiver(wifiScanReceiver, filter);
        wifiManager.startScan();
    }

    private final BroadcastReceiver wifiScanReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (WifiManager.SCAN_RESULTS_AVAILABLE_ACTION.equals(intent.getAction())) {
                if (ActivityCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    scanResults = wifiManager.getScanResults();
                    updateApDisplay();
                }

                if (isScanning) {
                    wifiManager.startScan();
                }
            }
        }
    };

    private void updateApDisplay() {
        runOnUiThread(() -> {
            int measuredCount = apDistances.size();
            apCount.setText("已发现: " + scanResults.size() + " 个AP | 已测距: " + measuredCount);

            StringBuilder sb = new StringBuilder();
            sb.append(String.format("%-15s %-5s %-5s %-6s\n", "SSID", "原始", "滤波", "RSSI"));
            sb.append("----------------------------------------\n");
            
            List<ScanResult> sortedResults = new ArrayList<>(scanResults);
            sortedResults.sort((a, b) -> b.level - a.level);
            
            for (int i = 0; i < Math.min(sortedResults.size(), 15); i++) {
                ScanResult result = sortedResults.get(i);
                String bssid = result.BSSID;
                String rawDist = rawDistances.containsKey(bssid) ? rawDistances.get(bssid) + "m" : "--";
                String filteredDist = apDistances.containsKey(bssid) ? apDistances.get(bssid) + "m" : "--";
                String ssid = result.SSID != null && !result.SSID.isEmpty() ? 
                    result.SSID.substring(0, Math.min(12, result.SSID.length())) : "Hidden";
                sb.append(String.format("%-15s %-5s %-5s %ddBm\n",
                        ssid, rawDist, filteredDist, result.level));
            }
            if (sortedResults.size() > 15) {
                sb.append("... 还有").append(sortedResults.size() - 15).append("个AP");
            }
            apList.setText(sb.toString());
        });
    }

    @androidx.annotation.RequiresApi(api = Build.VERSION_CODES.P)
    private void startRangingLoop() {
        executor.execute(() -> {
            while (isRanging) {
                try {
                    performRanging();
                    Thread.sleep(2000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                    break;
                }
            }
        });
    }

    @androidx.annotation.RequiresApi(api = Build.VERSION_CODES.P)
    private void performRanging() {
        if (scanResults.isEmpty()) {
            return;
        }

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        List<ScanResult> candidates = new ArrayList<>();
        for (ScanResult result : scanResults) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && result.is80211mcResponder()) {
                candidates.add(result);
            }
            if (candidates.size() >= 15) break;
        }

        if (candidates.size() < 3) {
            for (ScanResult result : scanResults) {
                if (!candidates.contains(result)) {
                    candidates.add(result);
                    if (candidates.size() >= 15) break;
                }
            }
        }

        if (candidates.isEmpty()) {
            return;
        }

        RangingRequest.Builder builder = new RangingRequest.Builder();
        for (ScanResult candidate : candidates.subList(0, Math.min(candidates.size(), 10))) {
            builder.addAccessPoint(candidate);
        }

        RangingRequest request = builder.build();

        try {
            wifiRttManager.startRanging(request, getMainExecutor(), new RangingResultCallback() {
                @Override
                public void onRangingResults(@NonNull List<RangingResult> results) {
                    List<Measurement> measurements = new ArrayList<>();
                    for (RangingResult result : results) {
                        if (result.getStatus() == RangingResult.STATUS_SUCCESS) {
                            String bssid = result.getMacAddress().toString();
                            int rawDistanceMm = result.getDistanceMm();
                            double rawDistance = rawDistanceMm / 1000.0;

                            rawDistances.put(bssid, (int) rawDistance);

                            double filteredDistance = measurementFilter.filter(bssid, rawDistance);
                            apDistances.put(bssid, (int) filteredDistance);

                            measurements.add(new Measurement(
                                    bssid,
                                    filteredDistance,
                                    result.getRssi()
                            ));
                        }
                    }

                    updateApDisplay();

                    if (!measurements.isEmpty()) {
                        sendLocationData(measurements);
                    }
                }

                @Override
                public void onRangingFailure(int code) {
                }
            });
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void sendLocationData(List<Measurement> measurements) {
        executor.execute(() -> {
            try {
                boolean pdrActive = pdrEngine.isInitialized();
                PdrEngine.Position pdrPos = null;
                if (pdrActive) {
                    pdrPos = pdrEngine.getPosition();
                }

                LocateRequest request = new LocateRequest(deviceId, measurements, 1);
                if (pdrActive && pdrPos != null) {
                    request.pdr_x = pdrPos.x;
                    request.pdr_y = pdrPos.y;
                    request.pdr_z = pdrPos.z;
                    request.step_count = stepCount;
                }

                String json = gson.toJson(request);

                RequestBody body = RequestBody.create(json, MediaType.get("application/json"));
                Request httpRequest = new Request.Builder()
                        .url(serverUrl + "/api/locate")
                        .post(body)
                        .build();

                Response response = httpClient.newCall(httpRequest).execute();
                if (response.isSuccessful() && response.body() != null) {
                    String responseBody = response.body().string();
                    LocateResponse location = gson.fromJson(responseBody, LocateResponse.class);
                    
                    pdrEngine.updateWithWifiPosition(location.x, location.y, location.z);
                    updatePdrDisplay();
                    
                    runOnUiThread(() -> {
                        positionDisplay.setText(String.format("X: %.2f  Y: %.2f  Z: %.2f",
                                location.x, location.y, location.z));
                        
                        String source = location.source != null ? location.source : "unknown";
                        int apUsed = location.ap_used > 0 ? location.ap_used : measurements.size();
                        String fusion = pdrActive ? " + PDR" : "";
                        accuracyDisplay.setText(String.format("精度: %.2fm | 楼层: %d | AP: %d | %s%s",
                                location.accuracy, location.floor, apUsed, source, fusion));
                    });
                } else {
                    runOnUiThread(() -> {
                        accuracyDisplay.setText(String.format("使用 %d 个AP (需在服务器配置AP坐标)", measurements.size()));
                    });
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopRanging();
        try {
            unregisterReceiver(wifiScanReceiver);
        } catch (Exception e) {
        }
    }

    static class Measurement {
        String bssid;
        double distance;
        int rssi;

        Measurement(String bssid, double distance, int rssi) {
            this.bssid = bssid;
            this.distance = distance;
            this.rssi = rssi;
        }
    }

    static class LocateRequest {
        String device_id;
        List<Measurement> measurements;
        int floor;
        Double pdr_x;
        Double pdr_y;
        Double pdr_z;
        Integer step_count;

        LocateRequest(String device_id, List<Measurement> measurements, int floor) {
            this.device_id = device_id;
            this.measurements = measurements;
            this.floor = floor;
        }
    }

    static class LocateResponse {
        double x;
        double y;
        double z;
        int floor;
        double accuracy;
        String source;
        int ap_used;
    }
}
