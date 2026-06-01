#include <napi.h>
#include <libusb-1.0/libusb.h>
#include <vector>
#include <thread>
#include <mutex>
#include <atomic>
#include <cstring>
#include <iostream>
#include <array>
#include <condition_variable>

#define HANTEK_VID 0x04b5
#define HANTEK_PID 0x2030
#define EP_IN 0x86
#define EP_OUT 0x02
#define BUFFER_SIZE 65536
#define RING_BUFFER_SIZE 1048576
#define TRANSFER_COUNT 4

class RingBuffer {
public:
    RingBuffer(size_t size) : buffer(size), writePos(0), readPos(0), available(0) {}
    
    size_t Write(const uint8_t* data, size_t len) {
        std::unique_lock<std::mutex> lock(mutex);
        size_t written = 0;
        
        while (written < len && available < buffer.size()) {
            buffer[writePos] = data[written];
            writePos = (writePos + 1) % buffer.size();
            written++;
            available++;
        }
        
        lock.unlock();
        cv.notify_one();
        return written;
    }
    
    size_t Read(uint8_t* data, size_t len, int timeoutMs = 100) {
        std::unique_lock<std::mutex> lock(mutex);
        
        if (available == 0) {
            cv.wait_for(lock, std::chrono::milliseconds(timeoutMs), 
                       [this] { return available > 0; });
        }
        
        size_t toRead = std::min(len, available.load());
        size_t read = 0;
        
        while (read < toRead) {
            data[read] = buffer[readPos];
            readPos = (readPos + 1) % buffer.size();
            read++;
            available--;
        }
        
        return read;
    }
    
    size_t Available() const { return available.load(); }
    void Clear() { 
        std::lock_guard<std::mutex> lock(mutex);
        writePos = readPos = 0; 
        available = 0; 
    }
    
private:
    std::vector<uint8_t> buffer;
    size_t writePos;
    size_t readPos;
    std::atomic<size_t> available;
    std::mutex mutex;
    std::condition_variable cv;
};

class Oscilloscope : public Napi::ObjectWrap<Oscilloscope> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    Oscilloscope(const Napi::CallbackInfo& info);
    ~Oscilloscope();

private:
    static Napi::FunctionReference constructor;
    
    Napi::Value Open(const Napi::CallbackInfo& info);
    Napi::Value Close(const Napi::CallbackInfo& info);
    Napi::Value StartCapture(const Napi::CallbackInfo& info);
    Napi::Value StopCapture(const Napi::CallbackInfo& info);
    Napi::Value SetVoltageScale(const Napi::CallbackInfo& info);
    Napi::Value SetTimeScale(const Napi::CallbackInfo& info);
    Napi::Value SetTrigger(const Napi::CallbackInfo& info);
    Napi::Value IsConnected(const Napi::CallbackInfo& info);
    Napi::Value ReadData(const Napi::CallbackInfo& info);

    libusb_device_handle* deviceHandle;
    libusb_context* usbContext;
    std::thread captureThread;
    std::unique_ptr<RingBuffer> ringBuffer;
    std::atomic<bool> isCapturing;
    std::atomic<bool> isConnected;
    std::atomic<bool> shouldStop;
    int voltageScale;
    int timeScale;
    int triggerLevel;
    bool triggerEdge;

    void CaptureLoop();
    std::vector<int16_t> ProcessData(const uint8_t* rawData, int length);
};

Napi::FunctionReference Oscilloscope::constructor;

Napi::Object Oscilloscope::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "Oscilloscope", {
        InstanceMethod("open", &Oscilloscope::Open),
        InstanceMethod("close", &Oscilloscope::Close),
        InstanceMethod("startCapture", &Oscilloscope::StartCapture),
        InstanceMethod("stopCapture", &Oscilloscope::StopCapture),
        InstanceMethod("setVoltageScale", &Oscilloscope::SetVoltageScale),
        InstanceMethod("setTimeScale", &Oscilloscope::SetTimeScale),
        InstanceMethod("setTrigger", &Oscilloscope::SetTrigger),
        InstanceMethod("isConnected", &Oscilloscope::IsConnected),
        InstanceMethod("readData", &Oscilloscope::ReadData)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("Oscilloscope", func);
    return exports;
}

Oscilloscope::Oscilloscope(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<Oscilloscope>(info),
      deviceHandle(nullptr),
      usbContext(nullptr),
      ringBuffer(std::make_unique<RingBuffer>(RING_BUFFER_SIZE)),
      isCapturing(false),
      isConnected(false),
      shouldStop(false),
      voltageScale(1),
      timeScale(1),
      triggerLevel(128),
      triggerEdge(true) {
}

Oscilloscope::~Oscilloscope() {
    StopCapture(Napi::CallbackInfo());
    Close(Napi::CallbackInfo());
}

Napi::Value Oscilloscope::Open(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    int ret = libusb_init(&usbContext);
    if (ret < 0) {
        return Napi::Boolean::New(env, false);
    }

    deviceHandle = libusb_open_device_with_vid_pid(usbContext, HANTEK_VID, HANTEK_PID);
    if (!deviceHandle) {
        libusb_exit(usbContext);
        usbContext = nullptr;
        return Napi::Boolean::New(env, false);
    }

    ret = libusb_claim_interface(deviceHandle, 0);
    if (ret < 0) {
        libusb_close(deviceHandle);
        libusb_exit(usbContext);
        deviceHandle = nullptr;
        usbContext = nullptr;
        return Napi::Boolean::New(env, false);
    }

    isConnected = true;
    return Napi::Boolean::New(env, true);
}

Napi::Value Oscilloscope::Close(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    isCapturing = false;
    if (captureThread.joinable()) {
        captureThread.join();
    }

    if (deviceHandle) {
        libusb_release_interface(deviceHandle, 0);
        libusb_close(deviceHandle);
        deviceHandle = nullptr;
    }

    if (usbContext) {
        libusb_exit(usbContext);
        usbContext = nullptr;
    }

    isConnected = false;
    return Napi::Boolean::New(env, true);
}

Napi::Value Oscilloscope::StartCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!isConnected || isCapturing) {
        return Napi::Boolean::New(env, false);
    }

    ringBuffer->Clear();
    shouldStop = false;
    isCapturing = true;
    captureThread = std::thread(&Oscilloscope::CaptureLoop, this);
    
    return Napi::Boolean::New(env, true);
}

Napi::Value Oscilloscope::StopCapture(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    shouldStop = true;
    isCapturing = false;
    if (captureThread.joinable()) {
        captureThread.join();
    }
    ringBuffer->Clear();
    
    return Napi::Boolean::New(env, true);
}

void Oscilloscope::CaptureLoop() {
    std::vector<uint8_t> transferBuffer(BUFFER_SIZE);
    int transferred;

    while (!shouldStop) {
        int ret = libusb_bulk_transfer(
            deviceHandle,
            EP_IN,
            transferBuffer.data(),
            BUFFER_SIZE,
            &transferred,
            50
        );

        if (ret == 0 && transferred > 0) {
            size_t written = ringBuffer->Write(transferBuffer.data(), transferred);
            if (written < (size_t)transferred) {
            }
        }
    }
}

Napi::Value Oscilloscope::ReadData(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    const size_t maxRead = 262144;
    std::vector<uint8_t> tempBuffer(maxRead);
    
    size_t bytesRead = ringBuffer->Read(tempBuffer.data(), maxRead, 10);
    
    if (bytesRead == 0) {
        return Napi::ArrayBuffer::New(env, 0);
    }

    auto processed = ProcessData(tempBuffer.data(), bytesRead);
    
    size_t byteLength = processed.size() * sizeof(int16_t);
    auto arrayBuffer = Napi::ArrayBuffer::New(env, byteLength);
    int16_t* dataPtr = static_cast<int16_t*>(arrayBuffer.Data());
    
    std::memcpy(dataPtr, processed.data(), byteLength);
    
    return arrayBuffer;
}

std::vector<int16_t> Oscilloscope::ProcessData(const uint8_t* rawData, int length) {
    std::vector<int16_t> result;
    result.reserve(length / 2);

    for (int i = 0; i < length - 1; i += 2) {
        int16_t value = (rawData[i] << 8) | rawData[i + 1];
        value = value - 0x8000;
        result.push_back(value);
    }

    return result;
}

Napi::Value Oscilloscope::SetVoltageScale(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        return Napi::Boolean::New(env, false);
    }
    voltageScale = info[0].As<Napi::Number>().Int32Value();
    return Napi::Boolean::New(env, true);
}

Napi::Value Oscilloscope::SetTimeScale(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1) {
        return Napi::Boolean::New(env, false);
    }
    timeScale = info[0].As<Napi::Number>().Int32Value();
    return Napi::Boolean::New(env, true);
}

Napi::Value Oscilloscope::SetTrigger(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
        return Napi::Boolean::New(env, false);
    }
    triggerLevel = info[0].As<Napi::Number>().Int32Value();
    triggerEdge = info[1].As<Napi::Boolean>().Value();
    return Napi::Boolean::New(env, true);
}

Napi::Value Oscilloscope::IsConnected(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), isConnected.load());
}

NODE_API_MODULE(oscilloscope, Oscilloscope::Init)
