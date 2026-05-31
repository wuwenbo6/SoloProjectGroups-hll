// Smart Pillbox Arduino Firmware (for ESP32)
// Zigbee Coordination: Use Zigbee2MQTT or similar gateway

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#define HALL_SENSOR_PIN 4
#define IR_SENSOR_PIN 5
#define DEVICE_ID "pillbox_001"
#define MAX_CACHE_SIZE 200

#define IR_DEBOUNCE_COUNT 2
#define IR_DEBOUNCE_WINDOW 500

const char* WIFI_SSID = "your_wifi";
const char* WIFI_PASSWORD = "your_password";
const char* MQTT_SERVER = "your_mqtt_broker";
const char* API_SERVER = "http://your-server:8000";

struct SensorData {
  char sensor_type[10];
  int value;
  unsigned long timestamp;
};

SensorData sensorCache[MAX_CACHE_SIZE];
int cacheHead = 0;
int cacheTail = 0;
int cacheCount = 0;

IRDetector irDetector(IR_DEBOUNCE_COUNT, IR_DEBOUNCE_WINDOW);

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

class IRDetector {
private:
  int minCount;
  int windowMs;
  unsigned long detections[10];
  int detectionCount;
  int lastSentValue;

public:
  IRDetector(int minCount, int windowMs) 
    : minCount(minCount), windowMs(windowMs), detectionCount(0), lastSentValue(1) {}

  bool check(int currentValue, int& outputValue) {
    unsigned long now = millis();
    
    int validCount = 0;
    for (int i = 0; i < detectionCount; i++) {
      if (now - detections[i] <= windowMs) {
        detections[validCount++] = detections[i];
      }
    }
    detectionCount = validCount;

    if (currentValue == 0) {
      if (detectionCount < 10) {
        detections[detectionCount++] = now;
      }

      if (detectionCount >= minCount && lastSentValue == 1) {
        lastSentValue = 0;
        outputValue = 0;
        return true;
      }
    } else {
      if (lastSentValue == 0) {
        lastSentValue = 1;
        detectionCount = 0;
        outputValue = 1;
        return true;
      }
    }

    return false;
  }
};

void cacheAdd(const char* sensorType, int value) {
  if (cacheCount >= MAX_CACHE_SIZE) {
    cacheHead = (cacheHead + 1) % MAX_CACHE_SIZE;
    cacheCount--;
  }
  
  strncpy(sensorCache[cacheTail].sensor_type, sensorType, sizeof(sensorCache[cacheTail].sensor_type) - 1);
  sensorCache[cacheTail].value = value;
  sensorCache[cacheTail].timestamp = millis();
  
  cacheTail = (cacheTail + 1) % MAX_CACHE_SIZE;
  cacheCount++;
}

bool cacheGetBatch(SensorData* batch, int maxSize, int& count) {
  count = min(maxSize, cacheCount);
  for (int i = 0; i < count; i++) {
    batch[i] = sensorCache[(cacheHead + i) % MAX_CACHE_SIZE];
  }
  return count > 0;
}

void cacheRemoveBatch(int count) {
  cacheHead = (cacheHead + count) % MAX_CACHE_SIZE;
  cacheCount -= count;
}

bool sendMQTT(const char* sensorType, int value, unsigned long timestamp) {
  if (!mqttClient.connected()) {
    return false;
  }
  
  char topic[64];
  snprintf(topic, sizeof(topic), "smart_pillbox/%s/%s", DEVICE_ID, sensorType);
  
  StaticJsonDocument<128> doc;
  doc["value"] = value;
  doc["timestamp"] = timestamp;
  doc["device_id"] = DEVICE_ID;
  
  char payload[128];
  serializeJson(doc, payload);
  
  return mqttClient.publish(topic, payload);
}

bool sendBatchHTTP() {
  if (cacheCount == 0) return true;
  if (WiFi.status() != WL_CONNECTED) return false;
  
  SensorData batch[50];
  int batchSize;
  cacheGetBatch(batch, 50, batchSize);
  
  HTTPClient http;
  http.begin(String(API_SERVER) + "/sensor-data/batch");
  http.addHeader("Content-Type", "application/json");
  
  DynamicJsonDocument doc(1024 + batchSize * 100);
  doc["device_id"] = DEVICE_ID;
  doc["is_offline_data"] = true;
  
  JsonArray dataArray = doc.createNestedArray("data");
  for (int i = 0; i < batchSize; i++) {
    JsonObject obj = dataArray.createNestedObject();
    obj["sensor_type"] = batch[i].sensor_type;
    obj["value"] = batch[i].value;
    obj["timestamp"] = batch[i].timestamp;
  }
  
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  http.end();
  
  if (httpCode == 200) {
    cacheRemoveBatch(batchSize);
    Serial.printf("Synced %d records\n", batchSize);
    return true;
  }
  
  return false;
}

void processSensorData(const char* sensorType, int value) {
  unsigned long timestamp = millis();
  
  if (sendMQTT(sensorType, value, timestamp)) {
    if (cacheCount > 0) {
      sendBatchHTTP();
    }
  } else {
    cacheAdd(sensorType, value);
    Serial.printf("Cached %s=%d, cache size: %d\n", sensorType, value, cacheCount);
  }
}

void setup() {
  Serial.begin(115200);
  
  pinMode(HALL_SENSOR_PIN, INPUT);
  pinMode(IR_SENSOR_PIN, INPUT);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  mqttClient.setServer(MQTT_SERVER, 1883);
  
  Serial.println("Smart Pillbox started");
}

int lastHallValue = -1;

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
  }
  
  if (!mqttClient.connected() && WiFi.status() == WL_CONNECTED) {
    mqttClient.connect(DEVICE_ID);
  }
  mqttClient.loop();
  
  int hallValue = digitalRead(HALL_SENSOR_PIN);
  if (hallValue != lastHallValue) {
    Serial.printf("Hall sensor: %d -> %d\n", lastHallValue, hallValue);
    processSensorData("hall", hallValue);
    lastHallValue = hallValue;
  }
  
  int irValue = digitalRead(IR_SENSOR_PIN);
  int outputIrValue;
  if (irDetector.check(irValue, outputIrValue)) {
    Serial.printf("IR sensor (debounced): %d\n", outputIrValue);
    processSensorData("ir", outputIrValue);
  }
  
  static unsigned long lastSync = 0;
  if (millis() - lastSync > 10000 && cacheCount > 0) {
    sendBatchHTTP();
    lastSync = millis();
  }
  
  delay(50);
}
