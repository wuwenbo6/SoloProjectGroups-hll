const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class ThumbnailService {
  constructor() {
    this.defaultSize = 400;
  }

  async generateFromPdf(pdfPath, outputPath, size = this.defaultSize) {
    return new Promise((resolve, reject) => {
      const tempDir = path.dirname(outputPath);
      const baseName = path.basename(pdfPath, '.pdf');
      const tempImagePath = path.join(tempDir, `${baseName}_temp_thumb.png`);

      const command = `pdftocairo -png -f 1 -l 1 -scale-to ${size} "${pdfPath}" "${path.join(tempDir, baseName + '_temp_thumb')}"`;

      exec(command, { timeout: 30000 }, async (error, stdout, stderr) => {
        if (error) {
          try {
            await this.generateWithLibreOfficeFallback(pdfPath, outputPath, size);
            resolve(outputPath);
          } catch (fallbackError) {
            reject(new Error(`Failed to generate thumbnail: ${error.message}`));
          }
          return;
        }

        const generatedPath = `${tempImagePath}-1.png`;
        
        if (fs.existsSync(generatedPath)) {
          try {
            await sharp(generatedPath)
              .resize(size, size, {
                fit: 'inside',
                withoutEnlargement: true
              })
              .toFormat('png')
              .toFile(outputPath);
            
            fs.unlinkSync(generatedPath);
            resolve(outputPath);
          } catch (sharpError) {
            reject(sharpError);
          }
        } else {
          reject(new Error('Thumbnail image not generated'));
        }
      });
    });
  }

  async generateWithLibreOfficeFallback(pdfPath, outputPath, size) {
    return new Promise((resolve, reject) => {
      const tempDir = path.dirname(outputPath);
      const baseName = path.basename(pdfPath, '.pdf');
      const tempImagePath = path.join(tempDir, `${baseName}_thumb_temp.jpg`);

      const command = `convert -density 150 "${pdfPath}[0]" -background white -flatten -resize "${size}x${size}>" "${tempImagePath}"`;

      exec(command, { timeout: 30000 }, async (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        if (fs.existsSync(tempImagePath)) {
          try {
            await sharp(tempImagePath)
              .resize(size, size, {
                fit: 'inside',
                withoutEnlargement: true
              })
              .toFormat('png')
              .toFile(outputPath);
            
            fs.unlinkSync(tempImagePath);
            resolve(outputPath);
          } catch (sharpError) {
            reject(sharpError);
          }
        } else {
          reject(new Error('Fallback thumbnail generation failed'));
        }
      });
    });
  }

  async generateThumbnail(pdfPath, jobId, downloadsDir, size = this.defaultSize) {
    const thumbnailName = `${jobId}_thumb.png`;
    const thumbnailPath = path.join(downloadsDir, thumbnailName);

    try {
      await this.generateFromPdf(pdfPath, thumbnailPath, size);
      return thumbnailPath;
    } catch (error) {
      console.warn('Thumbnail generation failed:', error.message);
      return null;
    }
  }
}

module.exports = new ThumbnailService();
