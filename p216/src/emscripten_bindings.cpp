#include "common.h"
#include <emscripten.h>
#include <emscripten/bind.h>

using namespace emscripten;

class G729CodecWrapper {
public:
    G729CodecWrapper()
        : encoder_()
        , decoder_()
        , loss_sim_(0.05) {
    }

    void set_loss_rate(double rate) {
        loss_sim_.set_loss_rate(rate);
    }

    double get_loss_rate() const {
        return loss_sim_.get_loss_rate();
    }

    void set_loss_pattern(int pattern) {
        LossPattern lp = static_cast<LossPattern>(pattern);
        loss_sim_.set_loss_pattern(lp);
    }

    val encode_to_frames(const val& input_samples) {
        std::vector<int16_t> samples = convert_js_array<int16_t>(input_samples);
        auto frames = encoder_.encode_buffer(samples);
        auto with_loss = loss_sim_.simulate(frames);
        return frames_to_js(with_loss);
    }

    val decode_no_plc(const val& frames) {
        auto cpp_frames = js_to_frames(frames);
        auto output = decoder_.decode_buffer(cpp_frames, false);
        return convert_cpp_array(output);
    }

    val decode_with_plc(const val& frames) {
        decoder_.reset();
        auto cpp_frames = js_to_frames(frames);
        auto output = decoder_.decode_buffer(cpp_frames, true);
        return convert_cpp_array(output);
    }

    val generate_signal(int duration_ms) {
        auto signal = generate_test_signal(duration_ms);
        return convert_cpp_array(signal);
    }

    val process_full_pipeline(int duration_ms) {
        auto original = generate_test_signal(duration_ms);
        auto frames = encoder_.encode_buffer(original);
        auto frames_with_loss = loss_sim_.simulate(frames);

        decoder_.reset();
        auto no_plc = decoder_.decode_buffer(frames_with_loss, false);

        decoder_.reset();
        auto with_plc = decoder_.decode_buffer(frames_with_loss, true);

        int lost_count = 0;
        int max_burst = 0;
        int current_burst = 0;
        for (const auto& f : frames_with_loss) {
            if (f.lost) {
                lost_count++;
                current_burst++;
                max_burst = std::max(max_burst, current_burst);
            } else {
                current_burst = 0;
            }
        }

        auto mos_result = MosEstimator::estimate(original, no_plc, with_plc);

        val result = val::object();
        result.set("original", convert_cpp_array(original));
        result.set("no_plc", convert_cpp_array(no_plc));
        result.set("with_plc", convert_cpp_array(with_plc));
        result.set("frames_with_loss", frames_to_js(frames_with_loss));
        result.set("lost_count", val(lost_count));
        result.set("total_frames", val(static_cast<int>(frames_with_loss.size())));
        result.set("max_burst_length", val(max_burst));
        result.set("mos_no_plc", val(mos_result.mos_no_plc));
        result.set("mos_with_plc", val(mos_result.mos_with_plc));
        result.set("seg_snr_no_plc", val(mos_result.seg_snr_no_plc));
        result.set("seg_snr_with_plc", val(mos_result.seg_snr_with_plc));
        result.set("pesq_like_no_plc", val(mos_result.pesq_like_no_plc));
        result.set("pesq_like_with_plc", val(mos_result.pesq_like_with_plc));
        return result;
    }

    int get_frame_size() const { return FRAME_SIZE; }
    int get_sample_rate() const { return SAMPLE_RATE; }
    int get_frame_duration_ms() const { return FRAME_DURATION_MS; }

private:
    G729Encoder encoder_;
    G729Decoder decoder_;
    PacketLossSimulator loss_sim_;

    template<typename T>
    std::vector<T> convert_js_array(const val& js_array) {
        size_t length = js_array["length"].as<size_t>();
        std::vector<T> cpp_vector(length);
        for (size_t i = 0; i < length; i++) {
            cpp_vector[i] = js_array[i].as<T>();
        }
        return cpp_vector;
    }

    template<typename T>
    val convert_cpp_array(const std::vector<T>& cpp_vector) {
        val js_array = val::array();
        for (size_t i = 0; i < cpp_vector.size(); i++) {
            js_array.set(i, val(cpp_vector[i]));
        }
        return js_array;
    }

    val frames_to_js(const std::vector<G729Frame>& frames) {
        val js_frames = val::array();
        for (size_t i = 0; i < frames.size(); i++) {
            val f = val::object();
            val lsp_arr = val::array();
            for (int j = 0; j < 10; j++) {
                lsp_arr.set(j, val(frames[i].lsp[j]));
            }
            f.set("lsp", lsp_arr);
            f.set("fixed_codebook_index", val(frames[i].fixed_codebook_index));
            f.set("fixed_codebook_gain", val(frames[i].fixed_codebook_gain));
            f.set("adaptive_codebook_lag", val(frames[i].adaptive_codebook_lag));
            f.set("adaptive_codebook_gain", val(frames[i].adaptive_codebook_gain));
            f.set("lost", val(frames[i].lost));
            js_frames.set(i, f);
        }
        return js_frames;
    }

    std::vector<G729Frame> js_to_frames(const val& js_frames) {
        size_t length = js_frames["length"].as<size_t>();
        std::vector<G729Frame> frames(length);
        for (size_t i = 0; i < length; i++) {
            val f = js_frames[i];
            val lsp_arr = f["lsp"];
            for (int j = 0; j < 10; j++) {
                frames[i].lsp[j] = lsp_arr[j].as<uint8_t>();
            }
            frames[i].fixed_codebook_index = f["fixed_codebook_index"].as<uint8_t>();
            frames[i].fixed_codebook_gain = f["fixed_codebook_gain"].as<uint8_t>();
            frames[i].adaptive_codebook_lag = f["adaptive_codebook_lag"].as<uint8_t>();
            frames[i].adaptive_codebook_gain = f["adaptive_codebook_gain"].as<uint8_t>();
            frames[i].lost = f["lost"].as<bool>();
        }
        return frames;
    }
};

EMSCRIPTEN_BINDINGS(g729_module) {
    class_<G729CodecWrapper>("G729Codec")
        .constructor<>()
        .function("setLossRate", &G729CodecWrapper::set_loss_rate)
        .function("getLossRate", &G729CodecWrapper::get_loss_rate)
        .function("setLossPattern", &G729CodecWrapper::set_loss_pattern)
        .function("encodeToFrames", &G729CodecWrapper::encode_to_frames)
        .function("decodeNoPlc", &G729CodecWrapper::decode_no_plc)
        .function("decodeWithPlc", &G729CodecWrapper::decode_with_plc)
        .function("generateSignal", &G729CodecWrapper::generate_signal)
        .function("processFullPipeline", &G729CodecWrapper::process_full_pipeline)
        .function("getFrameSize", &G729CodecWrapper::get_frame_size)
        .function("getSampleRate", &G729CodecWrapper::get_sample_rate)
        .function("getFrameDurationMs", &G729CodecWrapper::get_frame_duration_ms);
}
