#include "SignalingParser.h"
#include "MacHeaderParser.h"
#include <bitset>
#include <sstream>
#include <iomanip>

static std::string formatMacAddress(const uint8_t* addr) {
    std::ostringstream oss;
    for (int i = 0; i < 6; i++) {
        if (i > 0) oss << ":";
        oss << std::hex << std::uppercase << std::setw(2) << std::setfill('0') << static_cast<int>(addr[i]);
    }
    return oss.str();
}

SignalingInfo SignalingParser::parse(const uint8_t* data, size_t len, size_t& offset, const MacHeader& macHdr) {
    SignalingInfo info;
    info.sack = {false, "", {}};
    info.ccoInfo = {false, 0, "", "", "", "", 0, 0};
    info.beacon = {false, "", 0, "", 0, "", 0, 0};

    if (MacHeaderParser::isSackFrame(macHdr)) {
        info.sack.present = true;

        if (offset < len) {
            uint8_t sackCtrl = data[offset++];

            int numBitmapBytes = std::min((int)(sackCtrl & 0x1F), (int)(len - offset));
            std::string bitmap;
            for (int i = 0; i < numBitmapBytes && offset < len; i++) {
                uint8_t byte = data[offset++];
                std::bitset<8> bits(byte);
                bitmap += bits.to_string();

                for (int bit = 7; bit >= 0; bit--) {
                    if (bits[bit]) {
                        info.sack.acknowledgedSegments.push_back(i * 8 + (7 - bit));
                    }
                }
            }
            info.sack.ackBitmap = bitmap;
        }
    }

    if (MacHeaderParser::isBeaconFrame(macHdr)) {
        info.beacon.present = true;
        info.ccoInfo.present = true;

        if (offset + 7 <= len) {
            std::string nid;
            for (int i = 0; i < 7 && offset < len; i++) {
                char hex[3];
                snprintf(hex, sizeof(hex), "%02X", data[offset++]);
                nid += hex;
            }
            info.beacon.nidHex = nid;
            info.ccoInfo.networkId = nid;

            info.beacon.nidVersion = (uint8_t)((std::stoi(nid.substr(0, 2), nullptr, 16) >> 2) & 0x3F);

            std::ostringstream nidFmt;
            nidFmt << nid.substr(0, 2) << ":" << nid.substr(2, 2) << ":"
                   << nid.substr(4, 2) << ":" << nid.substr(6, 4) << ":"
                   << nid.substr(10, 4);
            info.beacon.nidHex = nidFmt.str();
            info.ccoInfo.nidFormatted = nidFmt.str();
        }

        if (offset + 6 <= len) {
            info.beacon.ccoMacAddress = formatMacAddress(data + offset);
            info.ccoInfo.ccoMacAddress = formatMacAddress(data + offset);
            offset += 6;
        }

        if (offset < len) {
            info.beacon.ccoTEI = data[offset];
            info.ccoInfo.ccoTEI = data[offset];
            offset++;
        }

        if (offset < len) {
            uint8_t roleByte = data[offset++];
            switch (roleByte & 0x03) {
                case 0: info.beacon.stationRole = "CCo"; info.ccoInfo.stationRole = "CCo"; break;
                case 1: info.beacon.stationRole = "Proxy"; info.ccoInfo.stationRole = "Proxy"; break;
                case 2: info.beacon.stationRole = "Station"; info.ccoInfo.stationRole = "Station"; break;
                default: info.beacon.stationRole = "Unknown"; info.ccoInfo.stationRole = "Unknown"; break;
            }
        }

        if (offset + 1 < len) {
            info.beacon.beaconPeriod = data[offset] | (data[offset + 1] << 8);
            info.ccoInfo.beaconPeriod = info.beacon.beaconPeriod;
            offset += 2;
        }

        if (offset + 3 < len) {
            info.beacon.beaconTimeStamp = data[offset] | (data[offset + 1] << 8) |
                                          (data[offset + 2] << 16) | (data[offset + 3] << 24);
            info.ccoInfo.beaconTimeStamp = info.beacon.beaconTimeStamp;
            offset += 4;
        }
    }

    if (!info.sack.present && !info.beacon.present && offset + 2 <= len) {
        uint8_t sigType = data[offset];
        if (sigType == 0x01 || sigType == 0x02) {
            info.sack.present = true;
            offset++;
            if (offset < len) {
                int numBitmapBytes = std::min((int)data[offset], (int)(len - offset - 1));
                offset++;
                std::string bitmap;
                for (int i = 0; i < numBitmapBytes && offset < len; i++) {
                    uint8_t byte = data[offset++];
                    std::bitset<8> bits(byte);
                    bitmap += bits.to_string();
                    for (int bit = 7; bit >= 0; bit--) {
                        if (bits[bit]) {
                            info.sack.acknowledgedSegments.push_back(i * 8 + (7 - bit));
                        }
                    }
                }
                info.sack.ackBitmap = bitmap;
            }
        }

        if (sigType == 0x03 || sigType == 0x04) {
            info.ccoInfo.present = true;
            info.beacon.present = true;
            offset++;
            if (offset + 7 <= len) {
                std::string nid;
                for (int i = 0; i < 7 && offset < len; i++) {
                    char hex[3];
                    snprintf(hex, sizeof(hex), "%02X", data[offset++]);
                    nid += hex;
                }
                info.ccoInfo.networkId = nid;
                info.beacon.nidHex = nid;
            }
            if (offset + 6 <= len) {
                info.beacon.ccoMacAddress = formatMacAddress(data + offset);
                info.ccoInfo.ccoMacAddress = formatMacAddress(data + offset);
                offset += 6;
            }
            if (offset < len) {
                info.beacon.ccoTEI = data[offset];
                info.ccoInfo.ccoTEI = data[offset];
                offset++;
            }
            if (offset < len) {
                uint8_t roleByte = data[offset++];
                switch (roleByte & 0x03) {
                    case 0: info.ccoInfo.stationRole = "CCo"; info.beacon.stationRole = "CCo"; break;
                    case 1: info.ccoInfo.stationRole = "Proxy"; info.beacon.stationRole = "Proxy"; break;
                    case 2: info.ccoInfo.stationRole = "Station"; info.beacon.stationRole = "Station"; break;
                    default: info.ccoInfo.stationRole = "Unknown"; info.beacon.stationRole = "Unknown"; break;
                }
            }
            if (offset + 1 < len) {
                info.ccoInfo.beaconPeriod = data[offset] | (data[offset + 1] << 8);
                info.beacon.beaconPeriod = info.ccoInfo.beaconPeriod;
                offset += 2;
            }
            if (offset + 3 < len) {
                info.beacon.beaconTimeStamp = data[offset] | (data[offset + 1] << 8) |
                                              (data[offset + 2] << 16) | (data[offset + 3] << 24);
                info.ccoInfo.beaconTimeStamp = info.beacon.beaconTimeStamp;
                offset += 4;
            }
        }
    }

    return info;
}
