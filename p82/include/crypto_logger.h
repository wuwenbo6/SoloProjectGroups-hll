#ifndef CRYPTO_LOGGER_H
#define CRYPTO_LOGGER_H

#include "common.h"
#include <string>
#include <fstream>
#include <mutex>
#include <queue>
#include <thread>
#include <atomic>
#include <condition_variable>
#include <memory>
#include <chrono>
#include <vector>
#include <map>

enum class CryptoOperation {
    ENCRYPT,
    DECRYPT,
    SIGN,
    VERIFY,
    HASH,
    KEY_WRAP,
    KEY_UNWRAP,
    KEY_ROTATE,
    FILE_CREATE,
    FILE_DELETE,
    FILE_READ,
    FILE_WRITE
};

struct CryptoLogEntry {
    uint64_t entryId;
    std::chrono::system_clock::time_point timestamp;
    CryptoOperation operation;
    std::string fileId;
    std::string filePath;
    size_t dataSize;
    std::string algorithm;
    std::string keyId;
    uint64_t durationUs;
    bool success;
    std::string errorMessage;
    std::string callerInfo;
};

enum class LogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR,
    AUDIT
};

class CryptoLogger {
public:
    static CryptoLogger& instance();

    bool init(const std::string& logDirectory, bool async = true);
    void shutdown();

    void setLogLevel(LogLevel level);
    LogLevel getLogLevel() const { return m_logLevel; }

    void log(CryptoOperation op, const std::string& fileId, const std::string& filePath,
             size_t dataSize, const std::string& algorithm, const std::string& keyId,
             uint64_t durationUs, bool success, const std::string& errorMsg = "",
             const std::string& callerInfo = "");

    void logEncrypt(const std::string& fileId, const std::string& filePath,
                    size_t dataSize, const std::string& keyId, uint64_t durationUs,
                    bool success, const std::string& errorMsg = "");

    void logDecrypt(const std::string& fileId, const std::string& filePath,
                    size_t dataSize, const std::string& keyId, uint64_t durationUs,
                    bool success, const std::string& errorMsg = "");

    void logSign(const std::string& fileId, size_t dataSize, uint64_t durationUs,
                 bool success, const std::string& errorMsg = "");

    void logKeyWrap(const std::string& fileId, const std::string& keyId,
                    uint64_t durationUs, bool success);

    void logKeyUnwrap(const std::string& fileId, const std::string& keyId,
                      uint64_t durationUs, bool success);

    void logFileCreate(const std::string& fileId, const std::string& filePath);
    void logFileDelete(const std::string& fileId, const std::string& filePath);
    void logFileRead(const std::string& fileId, size_t offset, size_t size);
    void logFileWrite(const std::string& fileId, size_t offset, size_t size);

    std::vector<CryptoLogEntry> queryLogs(const std::string& fileId = "",
                                           CryptoOperation op = static_cast<CryptoOperation>(-1),
                                           size_t limit = 1000);

    bool exportLogs(const std::string& exportFile, const std::string& format = "json");
    bool exportLogsCSV(const std::string& exportFile);
    bool exportLogsJSON(const std::string& exportFile);

    void setMaxFileSize(size_t bytes);
    void setMaxFileCount(size_t count);
    void enableConsoleOutput(bool enable);

    struct Statistics {
        uint64_t totalOperations;
        uint64_t successfulOperations;
        uint64_t failedOperations;
        uint64_t totalBytesEncrypted;
        uint64_t totalBytesDecrypted;
        std::map<CryptoOperation, uint64_t> operationCounts;
        std::chrono::system_clock::time_point startTime;
    };

    Statistics getStatistics();
    void resetStatistics();

private:
    CryptoLogger();
    ~CryptoLogger();

    CryptoLogger(const CryptoLogger&) = delete;
    CryptoLogger& operator=(const CryptoLogger&) = delete;

    void asyncWriter();
    void writeEntry(const CryptoLogEntry& entry);
    void rotateLogFile();
    std::string formatEntry(const CryptoLogEntry& entry);
    std::string opToString(CryptoOperation op);
    std::string getCurrentLogFileName();

    std::string m_logDirectory;
    std::ofstream m_logFile;
    std::atomic<bool> m_initialized;
    std::atomic<bool> m_asyncEnabled;
    std::atomic<bool> m_shutdownRequested;

    std::queue<CryptoLogEntry> m_logQueue;
    std::mutex m_queueMutex;
    std::condition_variable m_queueCond;
    std::thread m_writerThread;

    LogLevel m_logLevel;
    size_t m_maxFileSize;
    size_t m_maxFileCount;
    size_t m_currentFileSize;
    size_t m_currentFileIndex;
    bool m_consoleOutput;

    std::atomic<uint64_t> m_entryCounter;

    Statistics m_stats;
    std::mutex m_statsMutex;

    mutable std::mutex m_fileMutex;
};

#define CRYPTO_LOG(op, fileId, filePath, size, alg, keyId, dur, success, err) \
    CryptoLogger::instance().log(op, fileId, filePath, size, alg, keyId, dur, success, err, __FUNCTION__)

#define CRYPTO_LOG_ENCRYPT(fileId, filePath, size, keyId, dur, success, err) \
    CryptoLogger::instance().logEncrypt(fileId, filePath, size, keyId, dur, err)

#define CRYPTO_LOG_DECRYPT(fileId, filePath, size, keyId, dur, success, err) \
    CryptoLogger::instance().logDecrypt(fileId, filePath, size, keyId, dur, err)

#endif
