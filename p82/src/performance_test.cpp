#include "performance_test.h"
#include <iostream>
#include <iomanip>
#include <random>
#include <sstream>

PerformanceTest::PerformanceTest(GMCrypto& crypto) : m_crypto(crypto) {
}

template<typename Func>
double PerformanceTest::measureTime(Func func, int iterations) {
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < iterations; ++i) {
        func();
    }
    auto end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<double, std::milli> duration = end - start;
    return duration.count();
}

ByteArray PerformanceTest::generateTestData(size_t size) {
    ByteArray data(size);
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> dis(0, 255);
    for (size_t i = 0; i < size; ++i) {
        data[i] = static_cast<uint8_t>(dis(gen));
    }
    return data;
}

PerformanceResult PerformanceTest::testSM4Encrypt(size_t dataSize, int iterations) {
    ByteArray data = generateTestData(dataSize);
    ByteArray key = m_crypto.generateSM4Key();
    ByteArray iv = m_crypto.generateRandomIV();

    double duration = measureTime([&]() {
        m_crypto.sm4Encrypt(data, key, iv);
    }, iterations);

    PerformanceResult result;
    result.algorithm = "SM4";
    result.operation = "Encrypt";
    result.dataSize = dataSize;
    result.durationMs = duration / iterations;
    result.throughputMBs = (dataSize * iterations / (1024.0 * 1024.0)) / (duration / 1000.0);
    result.operationsPerSec = (iterations * 1000.0) / duration;

    return result;
}

PerformanceResult PerformanceTest::testSM4Decrypt(size_t dataSize, int iterations) {
    ByteArray data = generateTestData(dataSize);
    ByteArray key = m_crypto.generateSM4Key();
    ByteArray iv = m_crypto.generateRandomIV();
    ByteArray encrypted = m_crypto.sm4Encrypt(data, key, iv);

    double duration = measureTime([&]() {
        m_crypto.sm4Decrypt(encrypted, key, iv);
    }, iterations);

    PerformanceResult result;
    result.algorithm = "SM4";
    result.operation = "Decrypt";
    result.dataSize = dataSize;
    result.durationMs = duration / iterations;
    result.throughputMBs = (dataSize * iterations / (1024.0 * 1024.0)) / (duration / 1000.0);
    result.operationsPerSec = (iterations * 1000.0) / duration;

    return result;
}

PerformanceResult PerformanceTest::testSM3Hash(size_t dataSize, int iterations) {
    ByteArray data = generateTestData(dataSize);

    double duration = measureTime([&]() {
        m_crypto.sm3Hash(data);
    }, iterations);

    PerformanceResult result;
    result.algorithm = "SM3";
    result.operation = "Hash";
    result.dataSize = dataSize;
    result.durationMs = duration / iterations;
    result.throughputMBs = (dataSize * iterations / (1024.0 * 1024.0)) / (duration / 1000.0);
    result.operationsPerSec = (iterations * 1000.0) / duration;

    return result;
}

PerformanceResult PerformanceTest::testSM2Sign(size_t dataSize, int iterations) {
    ByteArray data = generateTestData(dataSize);

    double duration = measureTime([&]() {
        m_crypto.sm2Sign(data);
    }, iterations);

    PerformanceResult result;
    result.algorithm = "SM2";
    result.operation = "Sign";
    result.dataSize = dataSize;
    result.durationMs = duration / iterations;
    result.throughputMBs = (dataSize * iterations / (1024.0 * 1024.0)) / (duration / 1000.0);
    result.operationsPerSec = (iterations * 1000.0) / duration;

    return result;
}

PerformanceResult PerformanceTest::testSM2Verify(size_t dataSize, int iterations) {
    ByteArray data = generateTestData(dataSize);
    ByteArray signature = m_crypto.sm2Sign(data);

    double duration = measureTime([&]() {
        m_crypto.sm2Verify(data, signature);
    }, iterations);

    PerformanceResult result;
    result.algorithm = "SM2";
    result.operation = "Verify";
    result.dataSize = dataSize;
    result.durationMs = duration / iterations;
    result.throughputMBs = (dataSize * iterations / (1024.0 * 1024.0)) / (duration / 1000.0);
    result.operationsPerSec = (iterations * 1000.0) / duration;

    return result;
}

std::vector<PerformanceResult> PerformanceTest::runAllTests(size_t dataSizeKB, int iterations) {
    std::vector<PerformanceResult> results;
    size_t dataSize = dataSizeKB * 1024;

    results.push_back(testSM4Encrypt(dataSize, iterations));
    results.push_back(testSM4Decrypt(dataSize, iterations));
    results.push_back(testSM3Hash(dataSize, iterations));
    results.push_back(testSM2Sign(32, iterations * 10));
    results.push_back(testSM2Verify(32, iterations * 10));

    return results;
}

void PerformanceTest::printResults(const std::vector<PerformanceResult>& results) {
    std::cout << "\n=== 国密算法性能测试结果 ===\n\n";
    std::cout << std::left
              << std::setw(12) << "算法"
              << std::setw(12) << "操作"
              << std::setw(15) << "数据大小"
              << std::setw(15) << "平均耗时(ms)"
              << std::setw(15) << "吞吐量(MB/s)"
              << std::setw(15) << "操作/秒"
              << "\n";
    std::cout << std::string(80, '-') << "\n";

    for (const auto& r : results) {
        std::string dataSizeStr;
        if (r.dataSize >= 1024 * 1024) {
            dataSizeStr = std::to_string(r.dataSize / (1024 * 1024)) + " MB";
        } else if (r.dataSize >= 1024) {
            dataSizeStr = std::to_string(r.dataSize / 1024) + " KB";
        } else {
            dataSizeStr = std::to_string(r.dataSize) + " B";
        }

        std::cout << std::left
                  << std::setw(12) << r.algorithm
                  << std::setw(12) << r.operation
                  << std::setw(15) << dataSizeStr
                  << std::setw(15) << std::fixed << std::setprecision(4) << r.durationMs
                  << std::setw(15) << std::fixed << std::setprecision(4) << r.throughputMBs
                  << std::setw(15) << std::fixed << std::setprecision(2) << r.operationsPerSec
                  << "\n";
    }
    std::cout << "\n";
}

std::string PerformanceTest::resultsToJson(const std::vector<PerformanceResult>& results) {
    std::stringstream ss;
    ss << "[\n";
    for (size_t i = 0; i < results.size(); ++i) {
        const auto& r = results[i];
        ss << "  {\n";
        ss << "    \"algorithm\": \"" << r.algorithm << "\",\n";
        ss << "    \"operation\": \"" << r.operation << "\",\n";
        ss << "    \"dataSize\": " << r.dataSize << ",\n";
        ss << "    \"durationMs\": " << r.durationMs << ",\n";
        ss << "    \"throughputMBs\": " << r.throughputMBs << ",\n";
        ss << "    \"operationsPerSec\": " << r.operationsPerSec << "\n";
        ss << "  }" << (i < results.size() - 1 ? "," : "") << "\n";
    }
    ss << "]\n";
    return ss.str();
}
