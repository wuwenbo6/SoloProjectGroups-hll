#include "common.h"
#include <iostream>
#include <fstream>
#include <cmath>

void write_wav(const std::string& filename, const std::vector<int16_t>& samples, int sample_rate) {
    std::ofstream file(filename, std::ios::binary);

    int32_t chunk_size = 36 + samples.size() * 2;
    int32_t subchunk1_size = 16;
    int16_t audio_format = 1;
    int16_t num_channels = 1;
    int32_t byte_rate = sample_rate * num_channels * 2;
    int16_t block_align = num_channels * 2;
    int16_t bits_per_sample = 16;
    int32_t subchunk2_size = samples.size() * 2;

    file.write("RIFF", 4);
    file.write(reinterpret_cast<char*>(&chunk_size), 4);
    file.write("WAVE", 4);
    file.write("fmt ", 4);
    file.write(reinterpret_cast<char*>(&subchunk1_size), 4);
    file.write(reinterpret_cast<char*>(&audio_format), 2);
    file.write(reinterpret_cast<char*>(&num_channels), 2);
    file.write(reinterpret_cast<char*>(&sample_rate), 4);
    file.write(reinterpret_cast<char*>(&byte_rate), 4);
    file.write(reinterpret_cast<char*>(&block_align), 2);
    file.write(reinterpret_cast<char*>(&bits_per_sample), 2);
    file.write("data", 4);
    file.write(reinterpret_cast<char*>(&subchunk2_size), 4);
    file.write(reinterpret_cast<const char*>(samples.data()), samples.size() * 2);
}

int main() {
    std::cout << "G.729 Codec Simulation Test" << std::endl;
    std::cout << "============================" << std::endl;

    int duration_ms = 3000;
    auto original = generate_test_signal(duration_ms);
    std::cout << "Generated test signal: " << original.size() << " samples, "
              << duration_ms << " ms" << std::endl;

    G729Encoder encoder;
    auto frames = encoder.encode_buffer(original);
    std::cout << "Encoded: " << frames.size() << " frames" << std::endl;

    PacketLossSimulator loss_sim(0.05);
    auto frames_with_loss = loss_sim.simulate(frames);

    int lost = 0;
    for (const auto& f : frames_with_loss) {
        if (f.lost) lost++;
    }
    std::cout << "After packet loss simulation: " << lost << " frames lost ("
              << (100.0 * lost / frames_with_loss.size()) << "%)" << std::endl;

    G729Decoder decoder;
    auto no_plc = decoder.decode_buffer(frames_with_loss, false);
    std::cout << "Decoded without PLC: " << no_plc.size() << " samples" << std::endl;

    decoder.reset();
    auto with_plc = decoder.decode_buffer(frames_with_loss, true);
    std::cout << "Decoded with PLC: " << with_plc.size() << " samples" << std::endl;

    write_wav("original.wav", original, SAMPLE_RATE);
    write_wav("no_plc.wav", no_plc, SAMPLE_RATE);
    write_wav("with_plc.wav", with_plc, SAMPLE_RATE);

    std::cout << "\nOutput files:" << std::endl;
    std::cout << "  - original.wav" << std::endl;
    std::cout << "  - no_plc.wav" << std::endl;
    std::cout << "  - with_plc.wav" << std::endl;

    double mse_no_plc = 0, mse_with_plc = 0;
    size_t compare_len = std::min({original.size(), no_plc.size(), with_plc.size()});
    for (size_t i = 0; i < compare_len; i++) {
        double diff_no = original[i] - no_plc[i];
        double diff_with = original[i] - with_plc[i];
        mse_no_plc += diff_no * diff_no;
        mse_with_plc += diff_with * diff_with;
    }
    mse_no_plc /= compare_len;
    mse_with_plc /= compare_len;

    double snr_no_plc = 10 * std::log10(32768.0 * 32768.0 / mse_no_plc);
    double snr_with_plc = 10 * std::log10(32768.0 * 32768.0 / mse_with_plc);

    std::cout << "\nQuality metrics:" << std::endl;
    std::cout << "  No PLC:  MSE = " << mse_no_plc << ", SNR = " << snr_no_plc << " dB" << std::endl;
    std::cout << "  With PLC: MSE = " << mse_with_plc << ", SNR = " << snr_with_plc << " dB" << std::endl;
    std::cout << "  SNR improvement: " << (snr_with_plc - snr_no_plc) << " dB" << std::endl;

    return 0;
}
