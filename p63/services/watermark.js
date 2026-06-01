const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const fs = require('fs');

class WatermarkService {
  constructor() {
    this.defaultOptions = {
      text: 'CONFIDENTIAL',
      opacity: 0.3,
      fontSize: 50,
      color: { r: 0.5, g: 0.5, b: 0.5 },
      rotation: 45,
      spacing: 200
    };
  }

  async addTextWatermark(pdfPath, options = {}) {
    const opts = { ...this.defaultOptions, ...options };
    
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    const pages = pdfDoc.getPages();
    
    for (const page of pages) {
      const { width, height } = page.getSize();
      
      const textSize = opts.fontSize;
      const textWidth = helveticaFont.widthOfTextAtSize(opts.text, textSize);
      const textHeight = helveticaFont.heightAtSize(textSize);
      
      const cols = Math.ceil(width / opts.spacing) + 2;
      const rows = Math.ceil(height / opts.spacing) + 2;
      
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
          const x = (j - 1) * opts.spacing + (width % opts.spacing) / 2;
          const y = (i - 1) * opts.spacing + (height % opts.spacing) / 2;
          
          page.drawText(opts.text, {
            x: x,
            y: y,
            size: textSize,
            font: helveticaFont,
            color: rgb(opts.color.r, opts.color.g, opts.color.b),
            opacity: opts.opacity,
            rotate: degrees(opts.rotation)
          });
        }
      }
    }
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);
    
    return pdfPath;
  }

  async addWatermarkToPdf(pdfPath, watermarkConfig) {
    if (!watermarkConfig || !watermarkConfig.enabled) {
      return pdfPath;
    }

    return this.addTextWatermark(pdfPath, {
      text: watermarkConfig.text || 'CONFIDENTIAL',
      opacity: watermarkConfig.opacity || 0.3,
      fontSize: watermarkConfig.fontSize || 50,
      color: watermarkConfig.color || { r: 0.5, g: 0.5, b: 0.5 },
      rotation: watermarkConfig.rotation || 45,
      spacing: watermarkConfig.spacing || 200
    });
  }
}

module.exports = new WatermarkService();
