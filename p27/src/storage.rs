use std::fs::{File, OpenOptions};
use std::io::{Read, Write, BufReader, Seek, SeekFrom};
use std::path::PathBuf;
use zstd::stream::{Decoder, Encoder};
use zstd::dict::{EncoderDictionary, DecoderDictionary};

use crate::crypto::CryptoManager;

const DICTIONARY_SIZE: usize = 110 * 1024;
const DICTIONARY_UPDATE_THRESHOLD: usize = 1000;
const MAX_SAMPLES: usize = 10000;

pub struct CompressedStorage {
    path: PathBuf,
    dict_path: PathBuf,
    dictionary: Option<Vec<u8>>,
    encoder_dict: Option<EncoderDictionary<'static>>,
    decoder_dict: Option<DecoderDictionary<'static>>,
    samples: Vec<Vec<u8>>,
    line_count: usize,
    compression_level: i32,
    crypto: CryptoManager,
}

impl CompressedStorage {
    pub fn new(path: PathBuf, crypto: CryptoManager) -> Self {
        let dict_path = path.with_extension("dict");
        let mut storage = CompressedStorage {
            path,
            dict_path,
            dictionary: None,
            encoder_dict: None,
            decoder_dict: None,
            samples: Vec::new(),
            line_count: 0,
            compression_level: 3,
            crypto,
        };
        
        storage.load_dictionary();
        storage
    }

    fn load_dictionary(&mut self) {
        if let Ok(mut dict_file) = File::open(&self.dict_path) {
            let mut dict_data = Vec::new();
            if dict_file.read_to_end(&mut dict_data).is_ok() && !dict_data.is_empty() {
                self.set_dictionary(dict_data);
            }
        }
    }

    fn set_dictionary(&mut self, dict_data: Vec<u8>) {
        let encoder_dict = unsafe {
            EncoderDictionary::copy(&dict_data, self.compression_level)
        };
        let decoder_dict = unsafe {
            DecoderDictionary::copy(&dict_data)
        };
        self.dictionary = Some(dict_data);
        self.encoder_dict = Some(encoder_dict);
        self.decoder_dict = Some(decoder_dict);
    }

    fn train_dictionary(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if self.samples.is_empty() {
            return Ok(());
        }

        let sample_sizes: Vec<usize> = self.samples.iter().map(|s| s.len()).collect();
        let flat_samples: Vec<u8> = self.samples.concat();

        let dictionary = zstd::dict::from_buffer(
            &flat_samples,
            &sample_sizes,
            DICTIONARY_SIZE,
        )?;

        let mut dict_file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&self.dict_path)?;
        dict_file.write_all(&dictionary)?;

        self.set_dictionary(dictionary);
        println!("Dictionary trained with {} samples, size: {} bytes", 
                 self.samples.len(), self.dictionary.as_ref().unwrap().len());

        Ok(())
    }

    pub fn add_sample(&mut self, line: &str) {
        if self.samples.len() < MAX_SAMPLES {
            self.samples.push(line.as_bytes().to_vec());
        }
        self.line_count += 1;

        if self.should_update_dict() {
            if let Err(e) = self.train_dictionary() {
                eprintln!("Failed to train dictionary: {}", e);
            }
        }
    }

    fn should_update_dict(&self) -> bool {
        if self.dictionary.is_none() {
            self.line_count >= 100
        } else {
            self.line_count > 0 && self.line_count % DICTIONARY_UPDATE_THRESHOLD == 0
        }
    }

    pub fn compress_line(&self, line: &str) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let compressed = if let Some(encoder_dict) = &self.encoder_dict {
            let mut encoder = Encoder::with_prepared_dictionary(
                Vec::new(),
                encoder_dict,
            )?;
            encoder.write_all(line.as_bytes())?;
            encoder.finish()?
        } else {
            let mut encoder = Encoder::new(Vec::new(), self.compression_level)?;
            encoder.write_all(line.as_bytes())?;
            encoder.finish()?
        };
        
        let encrypted = self.crypto.encrypt(&compressed)?;
        Ok(encrypted)
    }

    pub fn decompress_line(&self, data: &[u8]) -> Result<String, Box<dyn std::error::Error>> {
        let decrypted = self.crypto.decrypt(data)?;
        let mut decompressed = String::new();
        
        let result = if let Some(decoder_dict) = &self.decoder_dict {
            let mut decoder = Decoder::with_prepared_dictionary(
                decrypted.as_slice(),
                decoder_dict,
            )?;
            decoder.read_to_string(&mut decompressed)
        } else {
            let mut decoder = Decoder::new(decrypted.as_slice())?;
            decoder.read_to_string(&mut decompressed)
        };

        match result {
            Ok(_) => Ok(decompressed),
            Err(_) => {
                let mut decoder = Decoder::new(decrypted.as_slice())?;
                decompressed.clear();
                decoder.read_to_string(&mut decompressed)?;
                Ok(decompressed)
            }
        }
    }

    pub fn append_compressed(&mut self, line: &str) -> Result<(), Box<dyn std::error::Error>> {
        self.add_sample(line);
        
        let compressed = self.compress_line(line)?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        
        let size_bytes = (compressed.len() as u32).to_le_bytes();
        file.write_all(&size_bytes)?;
        file.write_all(&compressed)?;
        Ok(())
    }

    pub fn read_all(&self) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let file = File::open(&self.path)?;
        let mut reader = BufReader::new(file);
        let mut lines = Vec::new();

        loop {
            let mut size_bytes = [0u8; 4];
            match reader.read_exact(&mut size_bytes) {
                Ok(_) => {}
                Err(_) => break,
            }
            
            let size = u32::from_le_bytes(size_bytes) as usize;
            let mut compressed = vec![0u8; size];
            reader.read_exact(&mut compressed)?;
            
            let line = self.decompress_line(&compressed)?;
            lines.push(line);
        }

        Ok(lines)
    }

    pub fn get_dict_stats(&self) -> (bool, usize, usize) {
        (
            self.dictionary.is_some(),
            self.samples.len(),
            self.dictionary.as_ref().map(|d| d.len()).unwrap_or(0),
        )
    }

    pub fn read_range(
        &self,
        start_line: usize,
        end_line: usize,
    ) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let file = File::open(&self.path)?;
        let mut reader = BufReader::new(file);
        let mut lines = Vec::new();
        let mut current_line = 0;

        loop {
            let mut size_bytes = [0u8; 4];
            match reader.read_exact(&mut size_bytes) {
                Ok(_) => {}
                Err(_) => break,
            }
            
            current_line += 1;
            
            if current_line >= start_line && current_line <= end_line {
                let size = u32::from_le_bytes(size_bytes) as usize;
                let mut compressed = vec![0u8; size];
                reader.read_exact(&mut compressed)?;
                
                let line = self.decompress_line(&compressed)?;
                lines.push(line);
            } else {
                let size = u32::from_le_bytes(size_bytes) as usize;
                let mut buf = vec![0u8; size];
                reader.read_exact(&mut buf)?;
            }
            
            if current_line > end_line {
                break;
            }
        }

        Ok(lines)
    }

    pub fn get_total_lines(&self) -> Result<usize, Box<dyn std::error::Error>> {
        let file = File::open(&self.path)?;
        let mut reader = BufReader::new(file);
        let mut count = 0;

        loop {
            let mut size_bytes = [0u8; 4];
            match reader.read_exact(&mut size_bytes) {
                Ok(_) => {
                    count += 1;
                    let size = u32::from_le_bytes(size_bytes) as usize;
                    let mut buf = vec![0u8; size];
                    reader.read_exact(&mut buf)?;
                }
                Err(_) => break,
            }
        }

        Ok(count)
    }

    pub fn is_encrypted(&self) -> bool {
        self.crypto.is_enabled()
    }
}

pub fn read_file_from_position(
    path: &PathBuf,
    offset: u64,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(offset))?;
    
    let mut reader = BufReader::new(file);
    let mut content = String::new();
    reader.read_to_string(&mut content)?;
    
    Ok(content.lines().map(|s| s.to_string()).collect())
}

pub fn get_file_size(path: &PathBuf) -> Result<u64, Box<dyn std::error::Error>> {
    let metadata = std::fs::metadata(path)?;
    Ok(metadata.len())
}
