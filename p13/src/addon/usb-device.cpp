#include "usb-monitor.h"
#include <sstream>
#include <iomanip>

std::string to_hex(uint16_t value) {
    std::stringstream ss;
    ss << "0x" << std::hex << std::setw(4) << std::setfill('0') << value;
    return ss.str();
}

std::string get_device_class_name(uint8_t device_class) {
    switch (device_class) {
        case 0x00: return "Interface-defined";
        case 0x01: return "Audio";
        case 0x02: return "Communications";
        case 0x03: return "HID";
        case 0x05: return "Physical";
        case 0x06: return "Image";
        case 0x07: return "Printer";
        case 0x08: return "Mass Storage";
        case 0x09: return "Hub";
        case 0x0a: return "Data";
        case 0x0b: return "Smart Card";
        case 0x0d: return "Content Security";
        case 0x0e: return "Video";
        case 0x0f: return "Personal Healthcare";
        case 0xdc: return "Diagnostic";
        case 0xe0: return "Wireless";
        case 0xef: return "Miscellaneous";
        case 0xfe: return "Application-specific";
        case 0xff: return "Vendor-specific";
        default: return "Unknown";
    }
}
