#ifndef PARALLEL_CRYPTO_H
#define PARALLEL_CRYPTO_H

#include "common.h"
#include "gm_crypto.h"
#include <vector>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <functional>
#include <future>
#include <memory>
#include <atomic>
#include <map>

struct CryptoTask {
    uint64_t blockIndex;
    ByteArray plainData;
    ByteArray encryptedData;
    ByteArray key;
    ByteArray iv;
    bool isEncrypt;
    bool success;
    std::string errorMessage;
    uint64_t startTimeUs;
    uint64_t endTimeUs;
};

using CryptoTaskPtr = std::shared_ptr<CryptoTask>;

class ParallelCrypto {
public:
    static ParallelCrypto& instance();

    bool init(size_t numThreads = 0);
    void shutdown();

    size_t getThreadCount() const { return m_threads.size(); }

    CryptoTaskPtr submitEncrypt(uint64_t blockIndex, const ByteArray& plainData,
                                 const ByteArray& key, const ByteArray& iv);

    CryptoTaskPtr submitDecrypt(uint64_t blockIndex, const ByteArray& encryptedData,
                                 const ByteArray& key, const ByteArray& iv);

    bool waitForAll(const std::vector<CryptoTaskPtr>& tasks, uint64_t timeoutMs = 0);

    bool submitAndWaitBatch(std::vector<CryptoTaskPtr>& tasks, uint64_t timeoutMs = 0);

    std::vector<CryptoTaskPtr> encryptBlocks(const std::map<uint64_t, ByteArray>& blocks,
                                               const ByteArray& key);

    std::map<uint64_t, ByteArray> decryptBlocks(const std::map<uint64_t, std::pair<ByteArray, ByteArray>>& blocks,
                                                 const ByteArray& key);

    void setMaxQueueSize(size_t size);
    size_t getQueueSize() const;
    size_t getActiveTasks() const { return m_activeTasks; }

    struct Stats {
        uint64_t totalTasks;
        uint64_t completedTasks;
        uint64_t failedTasks;
        uint64_t totalBytesProcessed;
        uint64_t totalTimeUs;
        double avgThroughputMBps;
    };

    Stats getStatistics();
    void resetStatistics();

    size_t getOptimalThreadCount();

private:
    ParallelCrypto();
    ~ParallelCrypto();

    ParallelCrypto(const ParallelCrypto&) = delete;
    ParallelCrypto& operator=(const ParallelCrypto&) = delete;

    void workerThread();
    CryptoTaskPtr submitTask(CryptoTaskPtr task);
    void processTask(CryptoTaskPtr task);

    std::vector<std::thread> m_threads;
    std::queue<CryptoTaskPtr> m_taskQueue;
    std::mutex m_queueMutex;
    std::condition_variable m_queueCond;
    std::atomic<bool> m_shutdown;
    std::atomic<size_t> m_activeTasks;

    size_t m_maxQueueSize;

    GMCrypto m_crypto;

    struct InternalStats {
        std::atomic<uint64_t> totalTasks;
        std::atomic<uint64_t> completedTasks;
        std::atomic<uint64_t> failedTasks;
        std::atomic<uint64_t> totalBytesProcessed;
        std::atomic<uint64_t> totalTimeUs;
    };

    InternalStats m_stats;

    bool m_initialized;
    std::mutex m_initMutex;
};

class BatchCryptoProcessor {
public:
    explicit BatchCryptoProcessor(size_t maxBatchSize = 1024);
    ~BatchCryptoProcessor();

    void addEncryptTask(uint64_t blockIndex, const ByteArray& plainData,
                        const ByteArray& key, const ByteArray& iv);

    void addDecryptTask(uint64_t blockIndex, const ByteArray& encryptedData,
                        const ByteArray& key, const ByteArray& iv);

    bool process();

    std::vector<CryptoTaskPtr> getResults() const { return m_tasks; }
    size_t getCompletedCount() const;
    size_t getFailedCount() const;

    void clear();

private:
    size_t m_maxBatchSize;
    std::vector<CryptoTaskPtr> m_tasks;
    std::mutex m_mutex;
};

#endif
