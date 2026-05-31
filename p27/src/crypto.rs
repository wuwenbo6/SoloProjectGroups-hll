use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use rand::RngCore;
use std::env;

const NONCE_LENGTH: usize = 12;
const KEY_LENGTH: usize = 32;

pub struct CryptoManager {
    cipher: Aes256Gcm,
    enabled: bool,
}

impl CryptoManager {
    pub fn new(key: &[u8]) -> Result<Self, Box<dyn std::error::Error>> {
        if key.len() != KEY_LENGTH {
            return Err(format!("Invalid key length: expected {} bytes, got {}", KEY_LENGTH, key.len()).into());
        }
        
        let cipher = Aes256Gcm::new_from_slice(key)?;
        Ok(CryptoManager {
            cipher,
            enabled: true,
        })
    }

    pub fn from_env() -> Result<Option<Self>, Box<dyn std::error::Error>> {
        match env::var("LOGTAIL_ENCRYPTION_KEY") {
            Ok(key_str) => {
                let key = if key_str.starts_with("0x") || key_str.starts_with("0X") {
                    hex::decode(&key_str[2..])?
                } else {
                    general_purpose::STANDARD.decode(&key_str)?
                };
                Ok(Some(Self::new(&key)?))
            }
            Err(_) => Ok(None),
        }
    }

    pub fn disabled() -> Self {
        let dummy_key = [0u8; KEY_LENGTH];
        let cipher = Aes256Gcm::new_from_slice(&dummy_key).unwrap();
        CryptoManager {
            cipher,
            enabled: false,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        if !self.enabled {
            return Ok(plaintext.to_vec());
        }

        let mut nonce_bytes = [0u8; NONCE_LENGTH];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self.cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| format!("Encryption failed: {}", e))?;

        let mut result = Vec::with_capacity(NONCE_LENGTH + ciphertext.len());
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);

        Ok(result)
    }

    pub fn decrypt(&self, ciphertext: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        if !self.enabled {
            return Ok(ciphertext.to_vec());
        }

        if ciphertext.len() <= NONCE_LENGTH {
            return Err("Ciphertext too short".into());
        }

        let (nonce_bytes, encrypted_data) = ciphertext.split_at(NONCE_LENGTH);
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = self.cipher
            .decrypt(nonce, encrypted_data)
            .map_err(|e| format!("Decryption failed: {}", e))?;

        Ok(plaintext)
    }

    pub fn generate_key() -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let mut key = vec![0u8; KEY_LENGTH];
        OsRng.fill_bytes(&mut key);
        Ok(key)
    }

    pub fn key_to_base64(key: &[u8]) -> String {
        general_purpose::STANDARD.encode(key)
    }

    pub fn key_to_hex(key: &[u8]) -> String {
        format!("0x{}", hex::encode(key))
    }
}
