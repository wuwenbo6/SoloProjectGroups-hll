#ifndef PERFORMANCE_TEST_H
#define PERFORMANCE_TEST_H

#include "gm_crypto.h"
#include <chrono>
#include <string>
#include <vector>

struct PerformanceResult {
    std::string algorithm;
    std::string operation;
    size_t dataSize;
    double durationMs;
    double throughputMBs;
    double operationsPerSec;
};

class PerformanceTest {
public:
    PerformanceTest(GMCrypto& crypto);

    std::vector<PerformanceResult> runAllTests(size_t dataSizeKB = 1024, int iterations = 10);

    PerformanceResult testSM4Encrypt(size_t dataSize, int iterations);
    PerformanceResult testSM4Decrypt(size_t dataSize, int iterations);
    PerformanceResult testSM3Hash(size_t dataSize, int iterations);
    PerformanceResult testSM2Sign(size_t dataSize, int iterations);
    PerformanceResult testSM2Verify(size_t dataSize, int iterations);

    void printResults(const std::vector<PerformanceResult>& results);
    std::string resultsToJson(const std::vector<PerformanceResult>& results);

private:
    GMCrypto& m_crypto;

    template<typename Func>
    double measureTime(Func func, int iterations);

    ByteArray generateTestData(size_t size);
};

#endif
