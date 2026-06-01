#include "gm_crypto.h"
#include <iostream>
#include <fstream>
#include <cstring>
#include <sstream>
#include <iomanip>

GMCrypto::GMCrypto() 
    : m_privKey(nullptr), m_pubKey(nullptr), m_cert(nullptr), m_initialized(false),
      m_signCacheSize(DEFAULT_SIGN_CACHE_SIZE) {
}

GMCrypto::~GMCrypto() {
    cleanup();
}

bool GMCrypto::init() {
    if (m_initialized) {
        return true;
    }
    m_initialized = true;
    return true;
}

void GMCrypto::cleanup() {
    if (m_privKey) {
        EVP_PKEY_free(m_privKey);
        m_privKey = nullptr;
    }
    if (m_pubKey) {
        EVP_PKEY_free(m_pubKey);
        m_pubKey = nullptr;
    }
    if (m_cert) {
        X509_free(m_cert);
        m_cert = nullptr;
    }
    clearSignCache();
    m_initialized = false;
}

std::string GMCrypto::makeCacheKey(const ByteArray& data) const {
    if (data.size() <= 64) {
        return std::string(reinterpret_cast<const char*>(data.data()), data.size());
    }
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (size_t i = 0; i < 16 && i < data.size(); ++i) {
        ss << std::setw(2) << static_cast<int>(data[i]);
    }
    ss << "_" << data.size();
    for (size_t i = data.size() - 16; i < data.size(); ++i) {
        ss << std::setw(2) << static_cast<int>(data[i]);
    }
    return ss.str();
}

bool GMCrypto::getFromSignCache(const std::string& key, ByteArray& signature) const {
    std::lock_guard<std::mutex> lock(m_cacheMutex);
    auto it = m_signCache.find(key);
    if (it != m_signCache.end()) {
        signature = it->second;
        m_signCacheOrder.erase(std::find(m_signCacheOrder.begin(), m_signCacheOrder.end(), key));
        m_signCacheOrder.push_front(key);
        return true;
    }
    return false;
}

void GMCrypto::addToSignCache(const std::string& key, const ByteArray& signature) const {
    std::lock_guard<std::mutex> lock(m_cacheMutex);
    if (m_signCache.find(key) != m_signCache.end()) {
        return;
    }

    while (m_signCache.size() >= m_signCacheSize) {
        std::string last = m_signCacheOrder.back();
        m_signCacheOrder.pop_back();
        m_signCache.erase(last);
    }

    m_signCache[key] = signature;
    m_signCacheOrder.push_front(key);
}

void GMCrypto::setSignCacheSize(size_t size) {
    std::lock_guard<std::mutex> lock(m_cacheMutex);
    m_signCacheSize = size;
    while (m_signCache.size() > m_signCacheSize) {
        std::string last = m_signCacheOrder.back();
        m_signCacheOrder.pop_back();
        m_signCache.erase(last);
    }
}

void GMCrypto::clearSignCache() {
    std::lock_guard<std::mutex> lock(m_cacheMutex);
    m_signCache.clear();
    m_signCacheOrder.clear();
}

bool GMCrypto::generateSM2KeyPair(const std::string& privKeyFile, const std::string& pubKeyFile) {
    EVP_PKEY_CTX* pctx = EVP_PKEY_CTX_new_id(NID_sm2, nullptr);
    if (!pctx) {
        return false;
    }

    if (EVP_PKEY_keygen_init(pctx) <= 0) {
        EVP_PKEY_CTX_free(pctx);
        return false;
    }

    EVP_PKEY* pkey = nullptr;
    if (EVP_PKEY_keygen(pctx, &pkey) <= 0) {
        EVP_PKEY_CTX_free(pctx);
        return false;
    }

    EVP_PKEY_CTX_free(pctx);

    FILE* privFile = fopen(privKeyFile.c_str(), "wb");
    if (!privFile) {
        EVP_PKEY_free(pkey);
        return false;
    }
    PEM_write_PrivateKey(privFile, pkey, nullptr, nullptr, 0, nullptr, nullptr);
    fclose(privFile);

    FILE* pubFile = fopen(pubKeyFile.c_str(), "wb");
    if (!pubFile) {
        EVP_PKEY_free(pkey);
        return false;
    }
    PEM_write_PUBKEY(pubFile, pkey);
    fclose(pubFile);

    if (m_privKey) {
        EVP_PKEY_free(m_privKey);
    }
    m_privKey = pkey;
    m_pubKey = EVP_PKEY_dup(pkey);

    clearSignCache();
    return true;
}

bool GMCrypto::loadSM2KeyPair(const std::string& privKeyFile, const std::string& pubKeyFile) {
    FILE* privFile = fopen(privKeyFile.c_str(), "rb");
    if (!privFile) {
        return false;
    }
    m_privKey = PEM_read_PrivateKey(privFile, nullptr, nullptr, nullptr);
    fclose(privFile);

    if (!m_privKey) {
        return false;
    }

    FILE* pubFile = fopen(pubKeyFile.c_str(), "rb");
    if (!pubFile) {
        return false;
    }
    m_pubKey = PEM_read_PUBKEY(pubFile, nullptr, nullptr, nullptr);
    fclose(pubFile);

    clearSignCache();
    return m_pubKey != nullptr;
}

bool GMCrypto::loadSM2Certificate(const std::string& certFile) {
    FILE* file = fopen(certFile.c_str(), "rb");
    if (!file) {
        return false;
    }
    m_cert = PEM_read_X509(file, nullptr, nullptr, nullptr);
    fclose(file);

    if (m_cert) {
        EVP_PKEY* pubKey = X509_get_pubkey(m_cert);
        if (pubKey) {
            if (m_pubKey) {
                EVP_PKEY_free(m_pubKey);
            }
            m_pubKey = pubKey;
        }
    }

    clearSignCache();
    return m_cert != nullptr;
}

ByteArray GMCrypto::sm2Sign(const ByteArray& data) {
    if (!m_privKey) {
        return ByteArray();
    }

    std::string cacheKey = makeCacheKey(data);
    ByteArray cachedSig;
    if (getFromSignCache(cacheKey, cachedSig)) {
        return cachedSig;
    }

    EVP_MD_CTX* mctx = EVP_MD_CTX_new();
    if (!mctx) {
        return ByteArray();
    }

    if (EVP_DigestSignInit(mctx, nullptr, EVP_sm3(), nullptr, m_privKey) <= 0) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    size_t sigLen = 0;
    if (EVP_DigestSign(mctx, nullptr, &sigLen, data.data(), data.size()) <= 0) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    ByteArray signature(sigLen);
    if (EVP_DigestSign(mctx, signature.data(), &sigLen, data.data(), data.size()) <= 0) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    signature.resize(sigLen);
    EVP_MD_CTX_free(mctx);

    addToSignCache(cacheKey, signature);

    return signature;
}

bool GMCrypto::sm2Verify(const ByteArray& data, const ByteArray& signature) {
    if (!m_pubKey) {
        return false;
    }

    EVP_MD_CTX* mctx = EVP_MD_CTX_new();
    if (!mctx) {
        return false;
    }

    if (EVP_DigestVerifyInit(mctx, nullptr, EVP_sm3(), nullptr, m_pubKey) <= 0) {
        EVP_MD_CTX_free(mctx);
        return false;
    }

    int result = EVP_DigestVerify(mctx, signature.data(), signature.size(), data.data(), data.size());
    EVP_MD_CTX_free(mctx);

    return result == 1;
}

ByteArray GMCrypto::sm3Hash(const ByteArray& data) {
    ByteArray hash(SM3_DIGEST_LENGTH);

    EVP_MD_CTX* mctx = EVP_MD_CTX_new();
    if (!mctx) {
        return ByteArray();
    }

    if (EVP_DigestInit_ex(mctx, EVP_sm3(), nullptr) <= 0) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    if (EVP_DigestUpdate(mctx, data.data(), data.size()) <= 0) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    unsigned int hashLen = SM3_DIGEST_LENGTH;
    if (EVP_DigestFinal_ex(mctx, hash.data(), &hashLen) <= 0) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    EVP_MD_CTX_free(mctx);
    return hash;
}

ByteArray GMCrypto::sm3HashFile(const std::string& filePath, size_t blockSize) {
    EVP_MD_CTX* mctx = EVP_MD_CTX_new();
    if (!mctx) {
        return ByteArray();
    }

    if (EVP_DigestInit_ex(mctx, EVP_sm3(), nullptr) <= 0) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    std::ifstream file(filePath, std::ios::binary);
    if (!file) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    ByteArray buffer(blockSize);
    while (file) {
        file.read(reinterpret_cast<char*>(buffer.data()), blockSize);
        std::streamsize bytesRead = file.gcount();
        if (bytesRead > 0) {
            if (EVP_DigestUpdate(mctx, buffer.data(), bytesRead) <= 0) {
                EVP_MD_CTX_free(mctx);
                return ByteArray();
            }
        }
    }

    ByteArray hash(SM3_DIGEST_LENGTH);
    unsigned int hashLen = SM3_DIGEST_LENGTH;
    if (EVP_DigestFinal_ex(mctx, hash.data(), &hashLen) <= 0) {
        EVP_MD_CTX_free(mctx);
        return ByteArray();
    }

    EVP_MD_CTX_free(mctx);
    return hash;
}

bool GMCrypto::sm3Verify(const ByteArray& data, const ByteArray& hash) {
    ByteArray computed = sm3Hash(data);
    if (computed.size() != hash.size()) {
        return false;
    }
    return std::memcmp(computed.data(), hash.data(), hash.size()) == 0;
}

ByteArray GMCrypto::sm4Encrypt(const ByteArray& plaintext, const ByteArray& key, const ByteArray& iv) {
    if (key.size() != SM4_KEY_LENGTH || iv.size() != SM4_IV_LENGTH) {
        return ByteArray();
    }

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) {
        return ByteArray();
    }

    if (EVP_EncryptInit_ex(ctx, EVP_sm4_cbc(), nullptr, key.data(), iv.data()) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return ByteArray();
    }

    ByteArray ciphertext(plaintext.size() + SM4_BLOCK_SIZE);
    int outLen1 = 0, outLen2 = 0;

    if (EVP_EncryptUpdate(ctx, ciphertext.data(), &outLen1, plaintext.data(), plaintext.size()) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return ByteArray();
    }

    if (EVP_EncryptFinal_ex(ctx, ciphertext.data() + outLen1, &outLen2) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return ByteArray();
    }

    ciphertext.resize(outLen1 + outLen2);
    EVP_CIPHER_CTX_free(ctx);

    return ciphertext;
}

bool GMCrypto::sm4EncryptFile(const std::string& inFile, const std::string& outFile, 
                              const ByteArray& key, ByteArray& iv, size_t blockSize) {
    if (key.size() != SM4_KEY_LENGTH) {
        return false;
    }

    iv = generateRandomIV();
    if (iv.empty()) {
        return false;
    }

    std::ifstream ifs(inFile, std::ios::binary);
    if (!ifs) {
        return false;
    }

    std::ofstream ofs(outFile, std::ios::binary);
    if (!ofs) {
        return false;
    }

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) {
        return false;
    }

    if (EVP_EncryptInit_ex(ctx, EVP_sm4_cbc(), nullptr, key.data(), iv.data()) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return false;
    }

    ByteArray buffer(blockSize);
    ByteArray outBuffer(blockSize + SM4_BLOCK_SIZE);
    int outLen = 0;

    while (ifs) {
        ifs.read(reinterpret_cast<char*>(buffer.data()), blockSize);
        std::streamsize bytesRead = ifs.gcount();
        if (bytesRead > 0) {
            if (EVP_EncryptUpdate(ctx, outBuffer.data(), &outLen, buffer.data(), bytesRead) <= 0) {
                EVP_CIPHER_CTX_free(ctx);
                return false;
            }
            ofs.write(reinterpret_cast<const char*>(outBuffer.data()), outLen);
        }
    }

    if (EVP_EncryptFinal_ex(ctx, outBuffer.data(), &outLen) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return false;
    }
    ofs.write(reinterpret_cast<const char*>(outBuffer.data()), outLen);

    EVP_CIPHER_CTX_free(ctx);
    return true;
}

ByteArray GMCrypto::sm4Decrypt(const ByteArray& ciphertext, const ByteArray& key, const ByteArray& iv) {
    if (key.size() != SM4_KEY_LENGTH || iv.size() != SM4_IV_LENGTH) {
        return ByteArray();
    }

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) {
        return ByteArray();
    }

    if (EVP_DecryptInit_ex(ctx, EVP_sm4_cbc(), nullptr, key.data(), iv.data()) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return ByteArray();
    }

    ByteArray plaintext(ciphertext.size());
    int outLen1 = 0, outLen2 = 0;

    if (EVP_DecryptUpdate(ctx, plaintext.data(), &outLen1, ciphertext.data(), ciphertext.size()) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return ByteArray();
    }

    if (EVP_DecryptFinal_ex(ctx, plaintext.data() + outLen1, &outLen2) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return ByteArray();
    }

    plaintext.resize(outLen1 + outLen2);
    EVP_CIPHER_CTX_free(ctx);

    return plaintext;
}

bool GMCrypto::sm4DecryptFile(const std::string& inFile, const std::string& outFile, 
                              const ByteArray& key, const ByteArray& iv, size_t blockSize) {
    if (key.size() != SM4_KEY_LENGTH || iv.size() != SM4_IV_LENGTH) {
        return false;
    }

    std::ifstream ifs(inFile, std::ios::binary);
    if (!ifs) {
        return false;
    }

    std::ofstream ofs(outFile, std::ios::binary);
    if (!ofs) {
        return false;
    }

    EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
    if (!ctx) {
        return false;
    }

    if (EVP_DecryptInit_ex(ctx, EVP_sm4_cbc(), nullptr, key.data(), iv.data()) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return false;
    }

    ByteArray buffer(blockSize);
    ByteArray outBuffer(blockSize);
    int outLen = 0;

    while (ifs) {
        ifs.read(reinterpret_cast<char*>(buffer.data()), blockSize);
        std::streamsize bytesRead = ifs.gcount();
        if (bytesRead > 0) {
            if (EVP_DecryptUpdate(ctx, outBuffer.data(), &outLen, buffer.data(), bytesRead) <= 0) {
                EVP_CIPHER_CTX_free(ctx);
                return false;
            }
            ofs.write(reinterpret_cast<const char*>(outBuffer.data()), outLen);
        }
    }

    if (EVP_DecryptFinal_ex(ctx, outBuffer.data(), &outLen) <= 0) {
        EVP_CIPHER_CTX_free(ctx);
        return false;
    }
    ofs.write(reinterpret_cast<const char*>(outBuffer.data()), outLen);

    EVP_CIPHER_CTX_free(ctx);
    return true;
}

ByteArray GMCrypto::generateRandomIV() {
    ByteArray iv(SM4_IV_LENGTH);
    if (RAND_bytes(iv.data(), SM4_IV_LENGTH) != 1) {
        return ByteArray();
    }
    return iv;
}

ByteArray GMCrypto::generateSM4Key() {
    ByteArray key(SM4_KEY_LENGTH);
    if (RAND_bytes(key.data(), SM4_KEY_LENGTH) != 1) {
        return ByteArray();
    }
    return key;
}

bool GMCrypto::createSelfSignedCert(const std::string& certFile, const std::string& keyFile, const std::string& cn) {
    if (!generateSM2KeyPair(keyFile, keyFile + ".pub")) {
        return false;
    }

    X509* x509 = X509_new();
    if (!x509) {
        return false;
    }

    X509_set_version(x509, 2);
    ASN1_INTEGER_set(X509_get_serialNumber(x509), 1);
    X509_gmtime_adj(X509_get_notBefore(x509), 0);
    X509_gmtime_adj(X509_get_notAfter(x509), 365 * 24 * 3600L);

    X509_set_pubkey(x509, m_privKey);

    X509_NAME* name = X509_get_subject_name(x509);
    X509_NAME_add_entry_by_txt(name, "CN", MBSTRING_ASC, reinterpret_cast<const unsigned char*>(cn.c_str()), -1, -1, 0);
    X509_NAME_add_entry_by_txt(name, "O", MBSTRING_ASC, (const unsigned char*)"GM_FUSE", -1, -1, 0);

    X509_set_issuer_name(x509, name);

    X509_sign(x509, m_privKey, EVP_sm3());

    FILE* file = fopen(certFile.c_str(), "wb");
    if (!file) {
        X509_free(x509);
        return false;
    }
    PEM_write_X509(file, x509);
    fclose(file);

    if (m_cert) {
        X509_free(m_cert);
    }
    m_cert = x509;

    clearSignCache();
    return true;
}
