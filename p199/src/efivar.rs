use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use thiserror::Error;

const EFIVARS_PATH: &str = "/sys/firmware/efi/efivars";

const EFI_VARIABLE_NON_VOLATILE: u32 = 0x00000001;
const EFI_VARIABLE_BOOTSERVICE_ACCESS: u32 = 0x00000002;
const EFI_VARIABLE_RUNTIME_ACCESS: u32 = 0x00000004;
const EFI_VARIABLE_AUTHENTICATED_WRITE_ACCESS: u32 = 0x00000010;

const READ_ONLY_ATTRIBUTES: u32 = EFI_VARIABLE_AUTHENTICATED_WRITE_ACCESS;

#[derive(Error, Debug)]
pub enum EfiVarError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid variable name format")]
    InvalidName,
    #[error("Variable not found")]
    NotFound,
    #[error("Invalid data format")]
    InvalidData,
    #[error("Permission denied (try sudo)")]
    PermissionDenied,
    #[error("Variable is read-only and cannot be modified")]
    ReadOnly,
    #[error("Critical variable requires --force flag to delete")]
    ForceRequired,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EfiVariable {
    pub name: String,
    pub guid: String,
    pub attributes: u32,
    pub data: Vec<u8>,
    pub data_hex: String,
}

impl EfiVariable {
    pub fn data_hex(&self) -> String {
        self.data_hex.clone()
    }

    pub fn data_as_string(&self) -> Option<String> {
        String::from_utf8(self.data.clone()).ok()
    }
}

pub struct EfiVarManager {
    base_path: PathBuf,
    pub store_path: Option<PathBuf>,
}

impl EfiVarManager {
    pub fn new() -> Self {
        Self {
            base_path: PathBuf::from(EFIVARS_PATH),
            store_path: None,
        }
    }

    pub fn new_with_path(path: &str) -> Self {
        Self {
            base_path: PathBuf::from(path),
            store_path: None,
        }
    }

    pub fn with_persistence(path: PathBuf) -> Result<Self, EfiVarError> {
        Ok(Self {
            base_path: path.clone(),
            store_path: Some(path),
        })
    }

    pub fn list_variables(&self) -> Vec<EfiVariable> {
        self.list_all().unwrap_or_default()
    }

    pub fn list_all(&self) -> Result<Vec<EfiVariable>, EfiVarError> {
        let mut vars = Vec::new();
        
        if !self.base_path.exists() {
            return Err(EfiVarError::NotFound);
        }

        for entry in fs::read_dir(&self.base_path)? {
            let entry = entry?;
            let file_name = entry.file_name();
            let file_name = file_name.to_string_lossy();
            
            if let Some((name, guid)) = self.parse_filename(&file_name) {
                match self.read_variable(&name, &guid) {
                    Ok(var) => vars.push(var),
                    Err(_) => continue,
                }
            }
        }
        
        Ok(vars)
    }

    fn parse_filename(&self, filename: &str) -> Option<(String, String)> {
        let parts: Vec<&str> = filename.rsplitn(2, '-').collect();
        if parts.len() == 2 {
            Some((parts[1].to_string(), parts[0].to_string()))
        } else {
            None
        }
    }

    pub fn read_variable(&self, name: &str, guid: &str) -> Result<EfiVariable, EfiVarError> {
        let file_name = format!("{}-{}", name, guid);
        let file_path = self.base_path.join(&file_name);
        
        if !file_path.exists() {
            return Err(EfiVarError::NotFound);
        }

        let mut file = fs::File::open(&file_path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        if buffer.len() < 4 {
            return Err(EfiVarError::InvalidData);
        }

        let attributes = u32::from_le_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]);
        let data = buffer[4..].to_vec();
        let data_hex = hex::encode(&data);

        Ok(EfiVariable {
            name: name.to_string(),
            guid: guid.to_string(),
            attributes,
            data,
            data_hex,
        })
    }

    pub fn write_variable(
        &self,
        name: &str,
        guid: &str,
        attributes: u32,
        data: &[u8],
    ) -> Result<(), EfiVarError> {
        let file_name = format!("{}-{}", name, guid);
        let file_path = self.base_path.join(&file_name);

        let mut buffer = Vec::with_capacity(4 + data.len());
        buffer.extend_from_slice(&attributes.to_le_bytes());
        buffer.extend_from_slice(data);

        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&file_path)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::PermissionDenied {
                    EfiVarError::PermissionDenied
                } else {
                    EfiVarError::Io(e)
                }
            })?;

        file.write_all(&buffer)?;
        Ok(())
    }

    pub fn create_variable(
        &self,
        name: &str,
        guid: &str,
        attributes: u32,
        data: &[u8],
    ) -> Result<EfiVariable, EfiVarError> {
        let file_name = format!("{}-{}", name, guid);
        let file_path = self.base_path.join(&file_name);

        if file_path.exists() {
            return Err(EfiVarError::InvalidData);
        }

        self.write_variable(name, guid, attributes, data)?;
        self.read_variable(name, guid)
    }

    pub fn is_read_only(&self, attributes: u32) -> bool {
        (attributes & READ_ONLY_ATTRIBUTES) != 0
    }

    pub fn is_critical_variable(&self, name: &str) -> bool {
        let critical_prefixes = [
            "Boot",
            "Driver",
            "SysPrep",
            "PlatformLang",
            "Lang",
            "Timeout",
            "BootOrder",
            "BootNext",
            "BootCurrent",
            "BootOptionSupport",
            "SecureBoot",
            "PK",
            "KEK",
            "db",
            "dbx",
            "dbt",
            "dbr",
        ];
        
        for prefix in critical_prefixes.iter() {
            if name.starts_with(prefix) {
                return true;
            }
        }
        false
    }

    pub fn delete_variable(&self, name: &str, guid: &str, force: bool) -> Result<(), EfiVarError> {
        let file_name = format!("{}-{}", name, guid);
        let file_path = self.base_path.join(&file_name);

        if !file_path.exists() {
            return Err(EfiVarError::NotFound);
        }

        if self.is_critical_variable(name) && !force {
            return Err(EfiVarError::ForceRequired);
        }

        fs::remove_file(&file_path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                EfiVarError::PermissionDenied
            } else {
                EfiVarError::Io(e)
            }
        })?;

        Ok(())
    }

    pub fn update_variable(
        &self,
        name: &str,
        guid: &str,
        data: &[u8],
    ) -> Result<(), EfiVarError> {
        let file_name = format!("{}-{}", name, guid);
        let file_path = self.base_path.join(&file_name);

        if !file_path.exists() {
            return Err(EfiVarError::NotFound);
        }

        let mut file = fs::File::open(&file_path)?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        if buffer.len() < 4 {
            return Err(EfiVarError::InvalidData);
        }

        let attributes = u32::from_le_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]);
        
        if self.is_read_only(attributes) {
            return Err(EfiVarError::ReadOnly);
        }
        
        self.write_variable(name, guid, attributes, data)
    }

    pub fn get_variable(&self, name: &str, guid: &str) -> Result<EfiVariable, EfiVarError> {
        self.read_variable(name, guid)
    }

    pub fn set_variable(
        &self,
        name: &str,
        guid: &str,
        attributes: u32,
        data: &[u8],
    ) -> Result<EfiVariable, EfiVarError> {
        let file_path = self.base_path.join(format!("{}-{}", name, guid));
        if file_path.exists() {
            self.update_variable(name, guid, data)?;
        } else {
            self.write_variable(name, guid, attributes, data)?;
        }
        self.read_variable(name, guid)
    }

    pub fn backup_all(&self, output_path: &std::path::Path) -> Result<(), EfiVarError> {
        let vars = self.list_all()?;
        let mut archive = Vec::new();
        
        for var in &vars {
            let name_bytes = var.name.as_bytes();
            let guid_bytes = var.guid.as_bytes();
            let data_len = var.data.len() as u32;
            
            archive.extend(&(name_bytes.len() as u32).to_le_bytes());
            archive.extend(name_bytes);
            archive.extend(&(guid_bytes.len() as u32).to_le_bytes());
            archive.extend(guid_bytes);
            archive.extend(&var.attributes.to_le_bytes());
            archive.extend(&data_len.to_le_bytes());
            archive.extend(&var.data);
        }
        
        fs::write(output_path, &archive)?;
        Ok(())
    }

    pub fn restore_all(&self, input_path: &std::path::Path, force: bool) -> Result<Vec<String>, EfiVarError> {
        let data = fs::read(input_path)?;
        let mut restored = Vec::new();
        let mut offset = 0;
        
        while offset < data.len() {
            if offset + 4 > data.len() { break; }
            let name_len = u32::from_le_bytes(data[offset..offset+4].try_into().unwrap()) as usize;
            offset += 4;
            
            if offset + name_len > data.len() { break; }
            let name = String::from_utf8_lossy(&data[offset..offset+name_len]).to_string();
            offset += name_len;
            
            if offset + 4 > data.len() { break; }
            let guid_len = u32::from_le_bytes(data[offset..offset+4].try_into().unwrap()) as usize;
            offset += 4;
            
            if offset + guid_len > data.len() { break; }
            let guid = String::from_utf8_lossy(&data[offset..offset+guid_len]).to_string();
            offset += guid_len;
            
            if offset + 8 > data.len() { break; }
            let attributes = u32::from_le_bytes(data[offset..offset+4].try_into().unwrap());
            offset += 4;
            let data_len = u32::from_le_bytes(data[offset..offset+4].try_into().unwrap()) as usize;
            offset += 4;
            
            if offset + data_len > data.len() { break; }
            let var_data = &data[offset..offset+data_len];
            offset += data_len;
            
            let file_path = self.base_path.join(format!("{}-{}", name, guid));
            if !force && file_path.exists() {
                continue;
            }
            
            if self.write_variable(&name, &guid, attributes, var_data).is_ok() {
                restored.push(format!("{}-{}", name, guid));
            }
        }
        
        Ok(restored)
    }
}
