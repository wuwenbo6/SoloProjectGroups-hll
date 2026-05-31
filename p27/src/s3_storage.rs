use std::env;
use std::path::{Path, PathBuf};
use bytes::Bytes;
use rusoto_core::{HttpClient, Region};
use rusoto_credential::StaticProvider;
use rusoto_s3::{
    GetObjectRequest, PutObjectRequest, S3Client, S3,
    DeleteObjectRequest, ListObjectsV2Request,
};

pub struct S3Storage {
    client: S3Client,
    bucket: String,
    prefix: String,
    enabled: bool,
}

impl S3Storage {
    pub fn from_env() -> Result<Option<Self>, Box<dyn std::error::Error + Send + Sync>> {
        let bucket = match env::var("S3_BUCKET") {
            Ok(b) => b,
            Err(_) => return Ok(None),
        };

        let region = env::var("S3_REGION")
            .unwrap_or_else(|_| "us-east-1".to_string());
        let endpoint = env::var("S3_ENDPOINT").ok();
        let access_key = env::var("S3_ACCESS_KEY").ok();
        let secret_key = env::var("S3_SECRET_KEY").ok();
        let prefix = env::var("S3_PREFIX")
            .unwrap_or_else(|_| "logtail/".to_string());

        let region = if let Some(endpoint) = endpoint {
            Region::Custom {
                name: region,
                endpoint,
            }
        } else {
            region.parse()?
        };

        let client = if let (Some(ak), Some(sk)) = (access_key, secret_key) {
            let credentials = StaticProvider::new_minimal(ak, sk);
            let http_client = HttpClient::new()?;
            S3Client::new_with(http_client, credentials, region)
        } else {
            S3Client::new(region)
        };

        Ok(Some(S3Storage {
            client,
            bucket,
            prefix,
            enabled: true,
        }))
    }

    pub fn disabled() -> Self {
        S3Storage {
            client: S3Client::new(Region::UsEast1),
            bucket: String::new(),
            prefix: String::new(),
            enabled: false,
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    fn get_key(&self, local_path: &Path) -> String {
        let file_name = local_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown");
        format!("{}{}", self.prefix, file_name)
    }

    pub async fn upload_file(
        &self,
        local_path: &Path,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !self.enabled {
            return Ok(());
        }

        let content = tokio::fs::read(local_path).await?;
        let key = self.get_key(local_path);

        let request = PutObjectRequest {
            bucket: self.bucket.clone(),
            key: key.clone(),
            body: Some(Bytes::from(content).into()),
            content_type: Some("application/octet-stream".to_string()),
            ..Default::default()
        };

        self.client.put_object(request).await?;
        println!("Uploaded to S3: s3://{}/{}", self.bucket, key);
        Ok(())
    }

    pub async fn download_file(
        &self,
        key: &str,
        local_path: &Path,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !self.enabled {
            return Err("S3 storage is not enabled".into());
        }

        let request = GetObjectRequest {
            bucket: self.bucket.clone(),
            key: key.to_string(),
            ..Default::default()
        };

        let response = self.client.get_object(request).await?;
        let body = response.body.ok_or("Empty response body")?;
        let bytes = body.collect().await?.to_vec();

        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(local_path, bytes).await?;
        
        println!("Downloaded from S3: s3://{}/{}", self.bucket, key);
        Ok(())
    }

    pub async fn sync_to_s3(
        &self,
        local_files: &[PathBuf],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !self.enabled {
            return Ok(());
        }

        for file in local_files {
            if file.exists() {
                self.upload_file(file).await?;
            }
        }
        Ok(())
    }

    pub async fn list_files(
        &self,
    ) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
        if !self.enabled {
            return Ok(Vec::new());
        }

        let request = ListObjectsV2Request {
            bucket: self.bucket.clone(),
            prefix: Some(self.prefix.clone()),
            ..Default::default()
        };

        let response = self.client.list_objects_v2(request).await?;
        let keys = response
            .contents
            .unwrap_or_default()
            .into_iter()
            .filter_map(|obj| obj.key)
            .collect();

        Ok(keys)
    }

    pub async fn delete_file(
        &self,
        key: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !self.enabled {
            return Ok(());
        }

        let request = DeleteObjectRequest {
            bucket: self.bucket.clone(),
            key: key.to_string(),
            ..Default::default()
        };

        self.client.delete_object(request).await?;
        println!("Deleted from S3: s3://{}/{}", self.bucket, key);
        Ok(())
    }
}
