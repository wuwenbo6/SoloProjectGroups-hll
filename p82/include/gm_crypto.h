#ifndef GM_CRYPTO_H
#define GM_CRYPTO_H

#include "common.h"
#include <openssl/evp.h>
#include <openssl/ec.h>
#include <openssl/sm2.h>
#include <openssl/sm3.h>
#include <openssl/sm4.h>
#include <openssl/rand.h>
#include <openssl/pem.h>
#include <openssl/x509.h>
#include <unordered_map>
#include <list>
#include <mutex>

class GMCrypto {
public:
    static constexpr size_t DEFAULT_SIGN_CACHE_SIZE = 1024;

    GMCrypto();
    ~GMCrypto();

    bool init();
    void cleanup();

    bool generateSM2KeyPair(const std::string& privKeyFile, const std::string& pubKeyFile);
    bool loadSM2KeyPair(const std::string& privKeyFile, const std::string& pubKeyFile);
    bool loadSM2Certificate(const std::string& certFile);

    ByteArray sm2Sign(const ByteArray& data);
    bool sm2Verify(const ByteArray& data, const ByteArray& signature);

    ByteArray sm3Hash(const ByteArray& data);
    bool sm3Verify(const ByteArray& data, const ByteArray& hash);

    ByteArray sm3HashFile(const std::string& filePath, size_t blockSize = 64 * 1024);

    ByteArray sm4Encrypt(const ByteArray& plaintext, const ByteArray& key, const ByteArray& iv);
    ByteArray sm4Decrypt(const ByteArray& ciphertext, const ByteArray& key, const ByteArray& iv);

    bool sm4EncryptFile(const std::string& inFile, const std::string& outFile, 
                        const ByteArray& key, ByteArray& iv, size_t blockSize = 64 * 1024);
    bool sm4DecryptFile(const std::string& inFile, const std::string& outFile, 
                        const ByteArray& key, const ByteArray& iv, size_t blockSize = 64 * 1024);

    ByteArray generateRandomIV();
    ByteArray generateSM4Key();

    bool createSelfSignedCert(const std::string& certFile, const std::string& keyFile, const std::string& cn);

    void setSignCacheSize(size_t size);
    void clearSignCache();

    EVP_PKEY* getPrivateKey() const { return m_privKey; }
    EVP_PKEY* getPublicKey() const { return m_pubKey; }
    X509* getCertificate() const { return m_cert; }

private:
    EVP_PKEY* m_privKey;
    EVP_PKEY* m_pubKey;
    X509* m_cert;
    bool m_initialized;

    size_t m_signCacheSize;
    mutable std::mutex m_cacheMutex;
    mutable std::unordered_map<std::string, ByteArray> m_signCache;
    mutable std::list<std::string> m_signCacheOrder;

    void addToSignCache(const std::string& key, const ByteArray& signature) const;
    bool getFromSignCache(const std::string& key, ByteArray& signature) const;
    std::string makeCacheKey(const ByteArray& data) const;
};

#endif
