#include "performance_test.h"
#include <iostream>

int main() {
    std::cout << "=== 国密算法性能测试 ===\n\n";

    GMCrypto crypto;
    crypto.init();

    if (!crypto.generateSM2KeyPair("/tmp/perf_test_key.pem", "/tmp/perf_test_pub.pem")) {
        std::cerr << "密钥生成失败!\n";
        return 1;
    }

    PerformanceTest pt(crypto);
    auto results = pt.runAllTests(1024, 10);
    pt.printResults(results);

    std::cout << "JSON 格式输出:\n";
    std::cout << pt.resultsToJson(results) << "\n";

    return 0;
}
