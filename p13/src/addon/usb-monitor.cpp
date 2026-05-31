#include "usb-monitor.h"
#include <cstring>
#include <chrono>
#include <random>
#include <iostream>

Nan::Persistent<v8::Function> USBMonitor::constructor;

NAN_MODULE_INIT(InitModule) {
    USBMonitor::Init(target);
}

NODE_MODULE(usb_monitor, InitModule)

NAN_MODULE_INIT(USBMonitor::Init) {
    v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
    tpl->SetClassName(Nan::New("USBMonitor").ToLocalChecked());
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    Nan::SetPrototypeMethod(tpl, "startCapture", StartCapture);
    Nan::SetPrototypeMethod(tpl, "stopCapture", StopCapture);
    Nan::SetPrototypeMethod(tpl, "getDeviceList", GetDeviceList);
    Nan::SetPrototypeMethod(tpl, "setBufferSize", SetBufferSize);

    constructor.Reset(Nan::GetFunction(tpl).ToLocalChecked());
    Nan::Set(target, Nan::New("USBMonitor").ToLocalChecked(), Nan::GetFunction(tpl).ToLocalChecked());
}

USBMonitor::USBMonitor() 
    : ctx_(nullptr), 
      is_capturing_(false), 
      packet_callback_(nullptr),
      buffer_size_(USB_BUFFER_SIZE) {
    libusb_init(&ctx_);
    libusb_set_option(ctx_, LIBUSB_OPTION_MAX_PACKET_SIZE, 0);
}

USBMonitor::~USBMonitor() {
    if (is_capturing_) {
        is_capturing_ = false;
        queue_cv_.notify_all();
        
        if (capture_thread_.joinable()) {
            capture_thread_.join();
        }
        if (callback_thread_.joinable()) {
            callback_thread_.join();
        }
    }
    if (packet_callback_) {
        delete packet_callback_;
    }
    if (ctx_) {
        libusb_exit(ctx_);
    }
}

NAN_METHOD(USBMonitor::New) {
    if (info.IsConstructCall()) {
        USBMonitor* obj = new USBMonitor();
        obj->Wrap(info.This());
        info.GetReturnValue().Set(info.This());
    } else {
        const int argc = 1;
        v8::Local<v8::Value> argv[argc] = { info[0] };
        v8::Local<v8::Function> cons = Nan::New<v8::Function>(constructor);
        info.GetReturnValue().Set(Nan::NewInstance(cons, argc, argv).ToLocalChecked());
    }
}

NAN_METHOD(USBMonitor::SetBufferSize) {
    USBMonitor* obj = ObjectWrap::Unwrap<USBMonitor>(info.Holder());
    
    if (info.Length() > 0 && info[0]->IsNumber()) {
        obj->buffer_size_ = static_cast<size_t>(Nan::To<uint32_t>(info[0]).FromJust());
    }
    
    info.GetReturnValue().Set(Nan::New(static_cast<uint32_t>(obj->buffer_size_)));
}

NAN_METHOD(USBMonitor::StartCapture) {
    USBMonitor* obj = ObjectWrap::Unwrap<USBMonitor>(info.Holder());
    
    if (obj->is_capturing_) {
        info.GetReturnValue().Set(Nan::False());
        return;
    }

    if (info.Length() > 0 && info[0]->IsFunction()) {
        std::lock_guard<std::mutex> lock(obj->callback_mutex_);
        if (obj->packet_callback_) {
            delete obj->packet_callback_;
        }
        obj->packet_callback_ = new Nan::Callback(info[0].As<v8::Function>());
    }

    obj->is_capturing_ = true;
    obj->capture_thread_ = std::thread(&USBMonitor::CaptureLoop, obj);
    obj->callback_thread_ = std::thread(&USBMonitor::CallbackLoop, obj);
    
    info.GetReturnValue().Set(Nan::True());
}

NAN_METHOD(USBMonitor::StopCapture) {
    USBMonitor* obj = ObjectWrap::Unwrap<USBMonitor>(info.Holder());
    
    obj->is_capturing_ = false;
    obj->queue_cv_.notify_all();
    
    if (obj->capture_thread_.joinable()) {
        obj->capture_thread_.join();
    }
    if (obj->callback_thread_.joinable()) {
        obj->callback_thread_.join();
    }
    
    info.GetReturnValue().Set(Nan::True());
}

SetupPacket USBMonitor::ParseSetupPacket(const uint8_t* data) {
    SetupPacket setup;
    setup.bmRequestType = data[0];
    setup.bRequest = data[1];
    setup.wValue = data[2] | (data[3] << 8);
    setup.wIndex = data[4] | (data[5] << 8);
    setup.wLength = data[6] | (data[7] << 8);
    return setup;
}

std::string USBMonitor::GetDirectionFromSetup(uint8_t bmRequestType) {
    const uint8_t USB_DIR_MASK = 0x80;
    const uint8_t USB_DIR_OUT = 0x00;
    const uint8_t USB_DIR_IN = 0x80;
    
    if ((bmRequestType & USB_DIR_MASK) == USB_DIR_IN) {
        return "in";
    } else {
        return "out";
    }
}

void USBMonitor::CaptureLoop() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> type_dist(0, 2);
    std::uniform_int_distribution<> dir_dist(0, 1);
    std::uniform_int_distribution<> ep_dist(0, 15);
    std::uniform_int_distribution<> len_dist(0, 4096);
    std::uniform_int_distribution<> data_len_dist(0, 512);
    std::uniform_int_distribution<> byte_dist(0, 255);
    std::uniform_int_distribution<> status_dist(0, 20);
    std::uniform_int_distribution<> control_dist(0, 10);

    const char* types[] = {"URB_SUBMIT", "URB_COMPLETE", "URB_ERROR"};

    while (is_capturing_) {
        USBPacket packet;
        packet.timestamp = std::chrono::duration_cast<std::chrono::microseconds>(
            std::chrono::system_clock::now().time_since_epoch()
        ).count();
        packet.type = types[type_dist(gen)];
        packet.endpoint = static_cast<uint8_t>(ep_dist(gen));
        packet.length = static_cast<uint32_t>(len_dist(gen));
        packet.is_control_transfer = (control_dist(gen) == 0);
        
        if (packet.is_control_transfer && packet.length >= 8) {
            uint8_t setup_data[8];
            for (int i = 0; i < 8; ++i) {
                setup_data[i] = static_cast<uint8_t>(byte_dist(gen));
            }
            
            SetupPacket setup = ParseSetupPacket(setup_data);
            packet.bmRequestType = setup.bmRequestType;
            packet.bRequest = setup.bRequest;
            packet.wValue = setup.wValue;
            packet.wIndex = setup.wIndex;
            packet.wLength = setup.wLength;
            
            packet.direction = GetDirectionFromSetup(setup.bmRequestType);
            
            int data_len = std::min(static_cast<int>(setup.wLength), data_len_dist(gen));
            packet.data.reserve(8 + data_len);
            for (int i = 0; i < 8; ++i) {
                packet.data.push_back(setup_data[i]);
            }
            for (int i = 0; i < data_len; ++i) {
                packet.data.push_back(static_cast<uint8_t>(byte_dist(gen)));
            }
            packet.length = 8 + data_len;
        } else {
            packet.direction = dir_dist(gen) ? "in" : "out";
            packet.bmRequestType = 0;
            packet.bRequest = 0;
            packet.wValue = 0;
            packet.wIndex = 0;
            packet.wLength = 0;
            
            int data_len = data_len_dist(gen);
            packet.data.reserve(data_len);
            for (int i = 0; i < data_len; ++i) {
                packet.data.push_back(static_cast<uint8_t>(byte_dist(gen)));
            }
        }
        
        packet.status = (status_dist(gen) == 0) ? "error" : "success";

        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            if (packet_queue_.size() < MAX_QUEUE_SIZE) {
                packet_queue_.push(packet);
                queue_cv_.notify_one();
            }
        }

        std::this_thread::sleep_for(std::chrono::microseconds(100 + (rand() % 1000)));
    }
}

void USBMonitor::CallbackLoop() {
    while (is_capturing_) {
        std::unique_lock<std::mutex> lock(queue_mutex_);
        queue_cv_.wait(lock, [this] { return !packet_queue_.empty() || !is_capturing_; });
        
        while (!packet_queue_.empty()) {
            USBPacket packet = packet_queue_.front();
            packet_queue_.pop();
            lock.unlock();
            
            OnPacket(packet);
            
            lock.lock();
        }
    }
}

void USBMonitor::OnPacket(const USBPacket& packet) {
    std::lock_guard<std::mutex> lock(callback_mutex_);
    if (!packet_callback_) return;

    Nan::HandleScope scope;

    v8::Local<v8::Object> obj = Nan::New<v8::Object>();
    Nan::Set(obj, Nan::New("type").ToLocalChecked(), Nan::New(packet.type).ToLocalChecked());
    Nan::Set(obj, Nan::New("direction").ToLocalChecked(), Nan::New(packet.direction).ToLocalChecked());
    Nan::Set(obj, Nan::New("endpoint").ToLocalChecked(), Nan::New(packet.endpoint));
    Nan::Set(obj, Nan::New("length").ToLocalChecked(), Nan::New(packet.length));
    Nan::Set(obj, Nan::New("status").ToLocalChecked(), Nan::New(packet.status).ToLocalChecked());
    Nan::Set(obj, Nan::New("timestamp").ToLocalChecked(), Nan::New(static_cast<double>(packet.timestamp) / 1000.0));
    Nan::Set(obj, Nan::New("isControlTransfer").ToLocalChecked(), Nan::New(packet.is_control_transfer));
    
    if (packet.is_control_transfer) {
        Nan::Set(obj, Nan::New("bmRequestType").ToLocalChecked(), Nan::New(packet.bmRequestType));
        Nan::Set(obj, Nan::New("bRequest").ToLocalChecked(), Nan::New(packet.bRequest));
        Nan::Set(obj, Nan::New("wValue").ToLocalChecked(), Nan::New(packet.wValue));
        Nan::Set(obj, Nan::New("wIndex").ToLocalChecked(), Nan::New(packet.wIndex));
        Nan::Set(obj, Nan::New("wLength").ToLocalChecked(), Nan::New(packet.wLength));
    }

    v8::Local<v8::Array> data_arr = Nan::New<v8::Array>(packet.data.size());
    for (size_t i = 0; i < packet.data.size(); ++i) {
        Nan::Set(data_arr, i, Nan::New(packet.data[i]));
    }
    Nan::Set(obj, Nan::New("data").ToLocalChecked(), data_arr);

    const int argc = 1;
    v8::Local<v8::Value> argv[argc] = { obj };
    packet_callback_->Call(argc, argv);
}

NAN_METHOD(USBMonitor::GetDeviceList) {
    USBMonitor* obj = ObjectWrap::Unwrap<USBMonitor>(info.Holder());
    
    libusb_device** devices;
    ssize_t count = libusb_get_device_list(obj->ctx_, &devices);
    
    if (count < 0) {
        info.GetReturnValue().Set(Nan::New<v8::Array>());
        return;
    }

    v8::Local<v8::Array> result = Nan::New<v8::Array>(static_cast<int>(count));
    
    for (ssize_t i = 0; i < count; ++i) {
        libusb_device* dev = devices[i];
        struct libusb_device_descriptor desc;
        
        v8::Local<v8::Object> device_obj = Nan::New<v8::Object>();
        
        if (libusb_get_device_descriptor(dev, &desc) == 0) {
            Nan::Set(device_obj, Nan::New("vendorId").ToLocalChecked(), Nan::New(desc.idVendor));
            Nan::Set(device_obj, Nan::New("productId").ToLocalChecked(), Nan::New(desc.idProduct));
            Nan::Set(device_obj, Nan::New("busNumber").ToLocalChecked(), Nan::New(libusb_get_bus_number(dev)));
            Nan::Set(device_obj, Nan::New("deviceAddress").ToLocalChecked(), Nan::New(libusb_get_device_address(dev)));
            Nan::Set(device_obj, Nan::New("deviceClass").ToLocalChecked(), Nan::New(desc.bDeviceClass));
            Nan::Set(device_obj, Nan::New("deviceSpeed").ToLocalChecked(), Nan::New(libusb_get_device_speed(dev)));
        }
        
        Nan::Set(result, static_cast<int>(i), device_obj);
    }

    libusb_free_device_list(devices, 1);
    info.GetReturnValue().Set(result);
}
