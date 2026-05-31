#ifndef USB_MONITOR_H
#define USB_MONITOR_H

#include <nan.h>
#include <libusb.h>
#include <vector>
#include <thread>
#include <mutex>
#include <atomic>
#include <queue>
#include <condition_variable>

#define USB_BUFFER_SIZE (16 * 1024 * 1024)
#define MAX_QUEUE_SIZE 100000

struct USBPacket {
    std::string type;
    std::string direction;
    uint8_t endpoint;
    uint32_t length;
    std::vector<uint8_t> data;
    std::string status;
    uint64_t timestamp;
    uint8_t bmRequestType;
    uint8_t bRequest;
    uint16_t wValue;
    uint16_t wIndex;
    uint16_t wLength;
    bool is_control_transfer;
};

struct SetupPacket {
    uint8_t bmRequestType;
    uint8_t bRequest;
    uint16_t wValue;
    uint16_t wIndex;
    uint16_t wLength;
};

class USBMonitor : public Nan::ObjectWrap {
public:
    static NAN_MODULE_INIT(Init);
    static NAN_METHOD(New);
    static NAN_METHOD(StartCapture);
    static NAN_METHOD(StopCapture);
    static NAN_METHOD(GetDeviceList);
    static NAN_METHOD(SetBufferSize);

private:
    USBMonitor();
    ~USBMonitor();

    static Nan::Persistent<v8::Function> constructor;
    
    libusb_context* ctx_;
    std::thread capture_thread_;
    std::thread callback_thread_;
    std::atomic<bool> is_capturing_;
    Nan::Callback* packet_callback_;
    std::mutex callback_mutex_;
    
    std::queue<USBPacket> packet_queue_;
    std::mutex queue_mutex_;
    std::condition_variable queue_cv_;
    
    size_t buffer_size_;

    void CaptureLoop();
    void CallbackLoop();
    void OnPacket(const USBPacket& packet);
    SetupPacket ParseSetupPacket(const uint8_t* data);
    std::string GetDirectionFromSetup(uint8_t bmRequestType);
};

#endif
