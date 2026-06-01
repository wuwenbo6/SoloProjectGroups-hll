#include "crypto_logger.h"
#include <iostream>
#include <iomanip>
#include <sstream>
#include <sys/stat.h>
#include <algorithm>

CryptoLogger& CryptoLogger::instance() {
    static CryptoLogger inst;
    return inst;
}

CryptoLogger::CryptoLogger()
    : m_initialized(false), m_asyncEnabled(true), m_shutdownRequested(false),
      m_logLevel(LogLevel::INFO), m_maxFileSize(10 * 1024 * 1024),
      m_maxFileCount(10), m_currentFileSize(0), m_currentFileIndex(0),
      m_consoleOutput(false), m_entryCounter(0) {
    m_stats.totalOperations = 0;
    m_stats.successfulOperations = 0;
    m_stats.failedOperations = 0;
    m_stats.totalBytesEncrypted = 0;
    m_stats.totalBytesDecrypted = 0;
    m_stats.startTime = std::chrono::system_clock::now();
}

CryptoLogger::~CryptoLogger() {
    shutdown();
}

bool CryptoLogger::init(const std::string& logDirectory, bool async) {
    std::lock_guard<std::mutex> lock(m_fileMutex);
    if (m_initialized) {
        return true;
    }
    m_logDirectory = logDirectory;
    m_asyncEnabled = async;
    struct stat st;
    if (stat(m_logDirectory.c_str(), &st) != 0) {
        if (mkdir(m_logDirectory.c_str(), 0700) != 0) {
            return false;
        }
    }
    std::string logFile = getCurrentLogFileName();
    m_logFile.open(logFile, std::ios::app);
    if (!m_logFile) {
        return false;
    }
    m_currentFileSize = 0;
    m_initialized = true;
    if (m_asyncEnabled) {
        m_writerThread = std::thread(&CryptoLogger::asyncWriter, this);
    }
    return true;
}

void CryptoLogger::shutdown() {
    if (!m_initialized) {
        return;
    }
    m_shutdownRequested = true;
    if (m_asyncEnabled && m_writerThread.joinable()) {
        m_queueCond.notify_all();
        m_writerThread.join();
    }
    {
        std::lock_guard<std::mutex> lock(m_queueMutex);
        while (!m_logQueue.empty()) {
            writeEntry(m_logQueue.front());
            m_logQueue.pop();
        }
    }
    if (m_logFile.is_open()) {
        m_logFile.close();
    }
    m_initialized = false;
}

void CryptoLogger::setLogLevel(LogLevel level) {
    m_logLevel = level;
}

void CryptoLogger::asyncWriter() {
    while (!m_shutdownRequested) {
        std::unique_lock<std::mutex> lock(m_queueMutex);
        m_queueCond.wait(lock, [this] {
            return !m_logQueue.empty() || m_shutdownRequested;
        });
        while (!m_logQueue.empty() && !m_shutdownRequested) {
            CryptoLogEntry entry = m_logQueue.front();
            m_logQueue.pop();
            lock.unlock();
            writeEntry(entry);
            lock.lock();
        }
    }
}

void CryptoLogger::log(CryptoOperation op, const std::string& fileId, const std::string& filePath,
                        size_t dataSize, const std::string& algorithm, const std::string& keyId,
                        uint64_t durationUs, bool success, const std::string& errorMsg,
                        const std::string& callerInfo) {
    if (!m_initialized) {
        return;
    }
    CryptoLogEntry entry;
    entry.entryId = m_entryCounter.fetch_add(1);
    entry.timestamp = std::chrono::system_clock::now();
    entry.operation = op;
    entry.fileId = fileId;
    entry.filePath = filePath;
    entry.dataSize = dataSize;
    entry.algorithm = algorithm;
    entry.keyId = keyId;
    entry.durationUs = durationUs;
    entry.success = success;
    entry.errorMessage = errorMsg;
    entry.callerInfo = callerInfo;
    {
        std::lock_guard<std::mutex> lock(m_statsMutex);
        m_stats.totalOperations++;
        if (success) {
            m_stats.successfulOperations++;
        } else {
            m_stats.failedOperations++;
        }
        m_stats.operationCounts[op]++;
        if (op == CryptoOperation::ENCRYPT) {
            m_stats.totalBytesEncrypted += dataSize;
        } else if (op == CryptoOperation::DECRYPT) {
            m_stats.totalBytesDecrypted += dataSize;
        }
    }
    if (m_asyncEnabled) {
        std::lock_guard<std::mutex> lock(m_queueMutex);
        m_logQueue.push(entry);
        m_queueCond.notify_one();
    } else {
        writeEntry(entry);
    }
}

void CryptoLogger::logEncrypt(const std::string& fileId, const std::string& filePath,
                               size_t dataSize, const std::string& keyId, uint64_t durationUs,
                               bool success, const std::string& errorMsg) {
    log(CryptoOperation::ENCRYPT, fileId, filePath, dataSize, "SM4", keyId, durationUs, success, errorMsg);
}

void CryptoLogger::logDecrypt(const std::string& fileId, const std::string& filePath,
                            size_t dataSize, const std::string& keyId, uint64_t durationUs,
                            bool success, const std::string& errorMsg) {
    log(CryptoOperation::DECRYPT, fileId, filePath, dataSize, "SM4", keyId, durationUs, success, errorMsg);
}

void CryptoLogger::logSign(const std::string& fileId, size_t dataSize, uint64_t durationUs,
                          bool success, const std::string& errorMsg) {
    log(CryptoOperation::SIGN, fileId, "", dataSize, "SM2", "", durationUs, success, errorMsg);
}

void CryptoLogger::logKeyWrap(const std::string& fileId, const std::string& keyId,
                              uint64_t durationUs, bool success) {
    log(CryptoOperation::KEY_WRAP, fileId, "", 0, "SM4-KW", keyId, durationUs, success);
}

void CryptoLogger::logKeyUnwrap(const std::string& fileId, const std::string& keyId,
                                uint64_t durationUs, bool success) {
    log(CryptoOperation::KEY_UNWRAP, fileId, "", 0, "SM4-KW", keyId, durationUs, success);
}

void CryptoLogger::logFileCreate(const std::string& fileId, const std::string& filePath) {
    log(CryptoOperation::FILE_CREATE, fileId, filePath, 0, "", "", 0, true);
}

void CryptoLogger::logFileDelete(const std::string& fileId, const std::string& filePath) {
    log(CryptoOperation::FILE_DELETE, fileId, filePath, 0, "", "", 0, true);
}

void CryptoLogger::logFileRead(const std::string& fileId, size_t offset, size_t size) {
    log(CryptoOperation::FILE_READ, fileId, "", size, "", "", 0, true);
}

void CryptoLogger::logFileWrite(const std::string& fileId, size_t offset, size_t size) {
    log(CryptoOperation::FILE_WRITE, fileId, "", size, "", "", 0, true);
}

void CryptoLogger::writeEntry(const CryptoLogEntry& entry) {
    std::string line = formatEntry(entry);
    {
        std::lock_guard<std::mutex> lock(m_fileMutex);
        if (m_logFile.is_open()) {
            m_logFile << line << std::endl;
            m_currentFileSize += line.size() + 1;
            if (m_currentFileSize >= m_maxFileSize) {
                rotateLogFile();
            }
        }
        if (m_consoleOutput) {
            std::cout << line << std::endl;
        }
    }
}

std::string CryptoLogger::formatEntry(const CryptoLogEntry& entry) {
    std::stringstream ss;
    auto timeT = std::chrono::system_clock::to_time_t(entry.timestamp);
    auto ms = std::chrono::duration_cast<std::chrono::microseconds>(
        entry.timestamp.time_since_epoch()) % 1000000;
    ss << "[" << std::put_time(std::localtime(&timeT), "%Y-%m-%d %H:%M:%S")
       << "." << std::setw(6) << std::setfill('0') << ms.count() << "] ";
    ss << "ID=" << entry.entryId << " ";
    ss << "OP=" << opToString(entry.operation) << " ";
    if (!entry.fileId.empty()) {
        ss << "FILE_ID=" << entry.fileId << " ";
    }
    if (!entry.filePath.empty()) {
        ss << "PATH=" << entry.filePath << " ";
    }
    if (entry.dataSize > 0) {
        ss << "SIZE=" << entry.dataSize << " ";
    }
    if (!entry.algorithm.empty()) {
        ss << "ALG=" << entry.algorithm << " ";
    }
    if (!entry.keyId.empty()) {
        ss << "KEY_ID=" << entry.keyId << " ";
    }
    if (entry.durationUs > 0) {
        ss << "DUR=" << entry.durationUs << "us ";
    }
    ss << "SUCCESS=" << (entry.success ? "YES" : "NO");
    if (!entry.errorMessage.empty()) {
        ss << " ERR=\"" << entry.errorMessage << "\"";
    }
    return ss.str();
}

std::string CryptoLogger::opToString(CryptoOperation op) {
    switch (op) {
        case CryptoOperation::ENCRYPT: return "ENCRYPT";
        case CryptoOperation::DECRYPT: return "DECRYPT";
        case CryptoOperation::SIGN: return "SIGN";
        case CryptoOperation::VERIFY: return "VERIFY";
        case CryptoOperation::HASH: return "HASH";
        case CryptoOperation::KEY_WRAP: return "KEY_WRAP";
        case CryptoOperation::KEY_UNWRAP: return "KEY_UNWRAP";
        case CryptoOperation::KEY_ROTATE: return "KEY_ROTATE";
        case CryptoOperation::FILE_CREATE: return "FILE_CREATE";
        case CryptoOperation::FILE_DELETE: return "FILE_DELETE";
        case CryptoOperation::FILE_READ: return "FILE_READ";
        case CryptoOperation::FILE_WRITE: return "FILE_WRITE";
        default: return "UNKNOWN";
    }
}

std::string CryptoLogger::getCurrentLogFileName() {
    std::stringstream ss;
    ss << m_logDirectory << "/crypto_" << m_currentFileIndex << ".log";
    return ss.str();
}

void CryptoLogger::rotateLogFile() {
    if (m_logFile.is_open()) {
        m_logFile.close();
    }
    m_currentFileIndex = (m_currentFileIndex + 1) % m_maxFileCount;
    std::string logFile = getCurrentLogFileName();
    m_logFile.open(logFile, std::ios::trunc);
    m_currentFileSize = 0;
}

std::vector<CryptoLogEntry> CryptoLogger::queryLogs(const std::string& fileId,
                                                   CryptoOperation op,
                                                   size_t limit) {
    return std::vector<CryptoLogEntry>();
}

bool CryptoLogger::exportLogs(const std::string& exportFile, const std::string& format) {
    if (format == "csv") {
        return exportLogsCSV(exportFile);
    } else {
        return exportLogsJSON(exportFile);
    }
}

bool CryptoLogger::exportLogsCSV(const std::string& exportFile) {
    std::lock_guard<std::mutex> lock(m_fileMutex);
    if (!m_logFile.is_open()) {
        return false;
    }
    m_logFile.flush();
    std::ifstream srcLog(m_logDirectory + "/crypto_0.log");
    if (!srcLog) {
        return false;
    }
    std::ofstream dst(exportFile);
    if (!dst) {
        return false;
    }
    dst << "entry_id,timestamp,operation,file_id,file_path,data_size,algorithm,key_id,duration_us,success,error_message\n";
    std::string line;
    while (std::getline(srcLog, line)) {
        dst << line << "\n";
    }
    return true;
}

bool CryptoLogger::exportLogsJSON(const std::string& exportFile) {
    std::lock_guard<std::mutex> lock(m_fileMutex);
    if (!m_logFile.is_open()) {
        return false;
    }
    m_logFile.flush();
    std::ifstream srcLog(m_logDirectory + "/crypto_0.log");
    if (!srcLog) {
        return false;
    }
    std::ofstream dst(exportFile);
    if (!dst) {
        return false;
    }
    dst << "[\n";
    std::string line;
    bool first = true;
    while (std::getline(srcLog, line)) {
        if (!first) {
            dst << ",\n";
        }
        dst << "  \"" << line << "\"";
        first = false;
    }
    dst << "\n]\n";
    return true;
}

void CryptoLogger::setMaxFileSize(size_t bytes) {
    m_maxFileSize = bytes;
}

void CryptoLogger::setMaxFileCount(size_t count) {
    m_maxFileCount = count;
}

void CryptoLogger::enableConsoleOutput(bool enable) {
    m_consoleOutput = enable;
}

CryptoLogger::Statistics CryptoLogger::getStatistics() {
    std::lock_guard<std::mutex> lock(m_statsMutex);
    return m_stats;
}

void CryptoLogger::resetStatistics() {
    std::lock_guard<std::mutex> lock(m_statsMutex);
    m_stats.totalOperations = 0;
    m_stats.successfulOperations = 0;
    m_stats.failedOperations = 0;
    m_stats.totalBytesEncrypted = 0;
    m_stats.totalBytesDecrypted = 0;
    m_stats.operationCounts.clear();
    m_stats.startTime = std::chrono::system_clock::now();
}
