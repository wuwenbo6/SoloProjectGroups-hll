#include "parallel_crypto.h"
#include "crypto_logger.h"
#include <chrono>
#include <iostream>
#include <algorithm>

static inline uint64_t getCurrentTimeUs() {
    return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count());
}

ParallelCrypto& ParallelCrypto::instance() {
    static ParallelCrypto inst;
    return inst;
}

ParallelCrypto::ParallelCrypto()
    : m_shutdown(false), m_activeTasks(0), m_maxQueueSize(10000),
      m_initialized(false) {
    m_stats.totalTasks = 0;
    m_stats.completedTasks = 0;
    m_stats.failedTasks = 0;
    m_stats.totalBytesProcessed = 0;
    m_stats.totalTimeUs = 0;
}

ParallelCrypto::~ParallelCrypto() {
    shutdown();
}

size_t ParallelCrypto::getOptimalThreadCount() {
    size_t numCores = std::thread::hardware_concurrency();
    if (numCores == 0) {
        numCores = 4;
    }
    return std::max(size_t(1), numCores);
}

bool ParallelCrypto::init(size_t numThreads) {
    std::lock_guard<std::mutex> lock(m_initMutex);
    if (m_initialized) {
        return true;
    }
    if (numThreads == 0) {
        numThreads = getOptimalThreadCount();
    }
    m_shutdown = false;
    for (size_t i = 0; i < numThreads; ++i) {
        m_threads.emplace_back(&ParallelCrypto::workerThread, this);
    }
    m_initialized = true;
    return true;
}

void ParallelCrypto::shutdown() {
    if (!m_initialized) {
        return;
    }
    m_shutdown = true;
    m_queueCond.notify_all();
    for (auto& thread : m_threads) {
        if (thread.joinable()) {
            thread.join();
        }
    }
    m_threads.clear();
    m_initialized = false;
}

CryptoTaskPtr ParallelCrypto::submitEncrypt(uint64_t blockIndex, const ByteArray& plainData,
                                            const ByteArray& key, const ByteArray& iv) {
    auto task = std::make_shared<CryptoTask>();
    task->blockIndex = blockIndex;
    task->plainData = plainData;
    task->key = key;
    task->iv = iv;
    task->isEncrypt = true;
    task->success = false;
    return submitTask(task);
}

CryptoTaskPtr ParallelCrypto::submitDecrypt(uint64_t blockIndex, const ByteArray& encryptedData,
                                            const ByteArray& key, const ByteArray& iv) {
    auto task = std::make_shared<CryptoTask>();
    task->blockIndex = blockIndex;
    task->encryptedData = encryptedData;
    task->key = key;
    task->iv = iv;
    task->isEncrypt = false;
    task->success = false;
    return submitTask(task);
}

CryptoTaskPtr ParallelCrypto::submitTask(CryptoTaskPtr task) {
    if (!m_initialized) {
        init();
    }
    task->startTimeUs = getCurrentTimeUs();
    std::unique_lock<std::mutex> lock(m_queueMutex);
    if (m_maxQueueSize > 0 && m_taskQueue.size() >= m_maxQueueSize) {
        lock.unlock();
        processTask(task);
        return task;
    }
    m_taskQueue.push(task);
    m_stats.totalTasks++;
    lock.unlock();
    m_queueCond.notify_one();
    return task;
}

void ParallelCrypto::workerThread() {
    while (!m_shutdown) {
        std::unique_lock<std::mutex> lock(m_queueMutex);
        m_queueCond.wait(lock, [this] {
            return !m_taskQueue.empty() || m_shutdown;
        });
        if (m_shutdown && m_taskQueue.empty()) {
            break;
        }
        if (!m_taskQueue.empty()) {
            CryptoTaskPtr task = m_taskQueue.front();
            m_taskQueue.pop();
            lock.unlock();
            m_activeTasks++;
            processTask(task);
            m_activeTasks--;
        }
    }
}

void ParallelCrypto::processTask(CryptoTaskPtr task) {
    uint64_t startTime = getCurrentTimeUs();
    try {
        if (task->isEncrypt) {
            task->encryptedData = m_crypto.sm4Encrypt(task->plainData, task->key, task->iv);
            task->success = !task->encryptedData.empty();
            if (task->success) {
                m_stats.totalBytesProcessed += task->plainData.size();
            }
        } else {
            task->plainData = m_crypto.sm4Decrypt(task->encryptedData, task->key, task->iv);
            task->success = !task->plainData.empty();
            if (task->success) {
                m_stats.totalBytesProcessed += task->plainData.size();
            }
        }
        if (task->success) {
            m_stats.completedTasks++;
        } else {
            m_stats.failedTasks++;
            task->errorMessage = "Crypto operation failed";
        }
    } catch (const std::exception& e) {
        task->success = false;
        task->errorMessage = e.what();
        m_stats.failedTasks++;
    }
    task->endTimeUs = getCurrentTimeUs();
    uint64_t duration = task->endTimeUs - startTime;
    m_stats.totalTimeUs += duration;
    if (task->success) {
        auto& logger = CryptoLogger::instance();
        if (task->isEncrypt) {
            logger.logEncrypt("block_" + std::to_string(task->blockIndex), "",
                             task->plainData.size(), "", duration, true, "");
        } else {
            logger.logDecrypt("block_" + std::to_string(task->blockIndex), "",
                             task->encryptedData.size(), "", duration, true, "");
        }
    }
}

bool ParallelCrypto::waitForAll(const std::vector<CryptoTaskPtr>& tasks, uint64_t timeoutMs) {
    uint64_t startTime = getCurrentTimeUs();
    uint64_t timeoutUs = timeoutMs * 1000;
    while (true) {
        bool allDone = true;
        for (const auto& task : tasks) {
            if (!task->success && task->errorMessage.empty()) {
                allDone = false;
                break;
            }
        }
        if (allDone) {
            return true;
        }
        uint64_t elapsed = getCurrentTimeUs() - startTime;
        if (timeoutMs > 0 && elapsed >= timeoutUs) {
            return false;
        }
        std::this_thread::sleep_for(std::chrono::microseconds(100));
    }
}

bool ParallelCrypto::submitAndWaitBatch(std::vector<CryptoTaskPtr>& tasks, uint64_t timeoutMs) {
    for (auto& task : tasks) {
        submitTask(task);
    }
    return waitForAll(tasks, timeoutMs);
}

std::vector<CryptoTaskPtr> ParallelCrypto::encryptBlocks(const std::map<uint64_t, ByteArray>& blocks,
                                                         const ByteArray& key) {
    std::vector<CryptoTaskPtr> tasks;
    for (const auto& entry : blocks) {
        ByteArray iv = m_crypto.generateRandomIV();
        auto task = submitEncrypt(entry.first, entry.second, key, iv);
        tasks.push_back(task);
    }
    waitForAll(tasks);
    return tasks;
}

std::map<uint64_t, ByteArray> ParallelCrypto::decryptBlocks(
    const std::map<uint64_t, std::pair<ByteArray, ByteArray>>& blocks,
    const ByteArray& key) {
    std::map<uint64_t, ByteArray> result;
    std::vector<CryptoTaskPtr> tasks;
    for (const auto& entry : blocks) {
        uint64_t blockIndex = entry.first;
        const ByteArray& encrypted = entry.second.first;
        const ByteArray& iv = entry.second.second;
        auto task = submitDecrypt(blockIndex, encrypted, key, iv);
        tasks.push_back(task);
    }
    waitForAll(tasks);
    for (const auto& task : tasks) {
        if (task->success) {
            result[task->blockIndex] = task->plainData;
        }
    }
    return result;
}

void ParallelCrypto::setMaxQueueSize(size_t size) {
    m_maxQueueSize = size;
}

size_t ParallelCrypto::getQueueSize() const {
    std::lock_guard<std::mutex> lock(m_queueMutex);
    return m_taskQueue.size();
}

ParallelCrypto::Stats ParallelCrypto::getStatistics() {
    Stats result;
    result.totalTasks = m_stats.totalTasks.load();
    result.completedTasks = m_stats.completedTasks.load();
    result.failedTasks = m_stats.failedTasks.load();
    result.totalBytesProcessed = m_stats.totalBytesProcessed.load();
    result.totalTimeUs = m_stats.totalTimeUs.load();
    if (result.totalTimeUs > 0) {
        result.avgThroughputMBps = static_cast<double>(result.totalBytesProcessed) /
                                   (1024.0 * 1024.0) /
                                   (static_cast<double>(result.totalTimeUs) / 1000000.0);
    } else {
        result.avgThroughputMBps = 0.0;
    }
    return result;
}

void ParallelCrypto::resetStatistics() {
    m_stats.totalTasks = 0;
    m_stats.completedTasks = 0;
    m_stats.failedTasks = 0;
    m_stats.totalBytesProcessed = 0;
    m_stats.totalTimeUs = 0;
}

BatchCryptoProcessor::BatchCryptoProcessor(size_t maxBatchSize)
    : m_maxBatchSize(maxBatchSize) {
}

BatchCryptoProcessor::~BatchCryptoProcessor() {
}

void BatchCryptoProcessor::addEncryptTask(uint64_t blockIndex, const ByteArray& plainData,
                                           const ByteArray& key, const ByteArray& iv) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_tasks.size() >= m_maxBatchSize) {
        return;
    }
    auto task = std::make_shared<CryptoTask>();
    task->blockIndex = blockIndex;
    task->plainData = plainData;
    task->key = key;
    task->iv = iv;
    task->isEncrypt = true;
    task->success = false;
    m_tasks.push_back(task);
}

void BatchCryptoProcessor::addDecryptTask(uint64_t blockIndex, const ByteArray& encryptedData,
                                           const ByteArray& key, const ByteArray& iv) {
    std::lock_guard<std::mutex> lock(m_mutex);
    if (m_tasks.size() >= m_maxBatchSize) {
        return;
    }
    auto task = std::make_shared<CryptoTask>();
    task->blockIndex = blockIndex;
    task->encryptedData = encryptedData;
    task->key = key;
    task->iv = iv;
    task->isEncrypt = false;
    task->success = false;
    m_tasks.push_back(task);
}

bool BatchCryptoProcessor::process() {
    return ParallelCrypto::instance().submitAndWaitBatch(m_tasks);
}

size_t BatchCryptoProcessor::getCompletedCount() const {
    size_t count = 0;
    for (const auto& task : m_tasks) {
        if (task->success) {
            count++;
        }
    }
    return count;
}

size_t BatchCryptoProcessor::getFailedCount() const {
    size_t count = 0;
    for (const auto& task : m_tasks) {
        if (!task->success && !task->errorMessage.empty()) {
            count++;
        }
    }
    return count;
}

void BatchCryptoProcessor::clear() {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_tasks.clear();
}
