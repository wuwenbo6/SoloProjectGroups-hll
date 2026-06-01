const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class DocumentConverter {
  constructor() {
    this.libreOfficePath = this.findLibreOffice();
    this.fontDirs = this.findFontDirectories();
    this.timeout = parseInt(process.env.CONVERSION_TIMEOUT || 600000);
  }

  findLibreOffice() {
    const possiblePaths = [
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      '/usr/bin/libreoffice',
      '/usr/bin/soffice',
      '/opt/libreoffice/program/soffice',
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return 'soffice';
  }

  findFontDirectories() {
    const fontDirs = [];
    
    const projectFontDir = path.join(__dirname, '..', 'fonts');
    
    const commonFontPaths = [
      projectFontDir,
      '/System/Library/Fonts',
      '/Library/Fonts',
      `${process.env.HOME || process.env.USERPROFILE}/Library/Fonts`,
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      `${process.env.HOME || process.env.USERPROFILE}/.fonts`,
      'C:\\Windows\\Fonts'
    ];

    for (const fontPath of commonFontPaths) {
      if (fs.existsSync(fontPath)) {
        fontDirs.push(fontPath);
      }
    }

    if (process.env.EXTRA_FONT_DIR) {
      const extraDirs = process.env.EXTRA_FONT_DIR.split(path.delimiter);
      for (const dir of extraDirs) {
        if (fs.existsSync(dir) && !fontDirs.includes(dir)) {
          fontDirs.push(dir);
        }
      }
    }

    return fontDirs;
  }

  async convert(inputPath, outputFormat, outputDir) {
    return new Promise((resolve, reject) => {
      const format = outputFormat.toLowerCase();
      let filter = '';
      
      if (format === 'pdf') {
        filter = 'writer_pdf_Export';
      } else if (format === 'html') {
        filter = 'HTML';
      }

      const env = { ...process.env };
      
      if (this.fontDirs.length > 0) {
        const fontPath = this.fontDirs.join(path.delimiter);
        if (process.platform === 'darwin' || process.platform === 'linux') {
          env.FONTCONFIG_PATH = env.FONTCONFIG_PATH || '';
          env.FONTCONFIG_FILE = env.FONTCONFIG_FILE || '';
        }
      }

      const fontArgs = this.fontDirs.map(dir => `--infilter="${dir}"`).join(' ');
      
      const conversionArgs = [];
      
      if (format === 'pdf') {
        conversionArgs.push('--norestore');
        conversionArgs.push('--nolockcheck');
        conversionArgs.push('--nologo');
        conversionArgs.push('--headless');
        conversionArgs.push('--convert-to pdf:writer_pdf_Export');
      } else {
        conversionArgs.push('--norestore');
        conversionArgs.push('--nolockcheck');
        conversionArgs.push('--nologo');
        conversionArgs.push('--headless');
        conversionArgs.push('--convert-to html');
      }
      
      conversionArgs.push(`--outdir "${outputDir}"`);
      conversionArgs.push(`"${inputPath}"`);

      const command = `"${this.libreOfficePath}" ${conversionArgs.join(' ')}`;

      console.log(`Executing: ${command}`);
      console.log(`Timeout: ${this.timeout}ms`);
      console.log(`Font directories: ${this.fontDirs.join(', ')}`);

      const options = {
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: env
      };

      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          console.error(`Conversion error: ${error.message}`);
          if (stderr) console.error(`stderr: ${stderr}`);
          if (stdout) console.log(`stdout: ${stdout}`);
          
          if (error.killed) {
            reject(new Error(`Conversion timed out after ${this.timeout / 1000} seconds. Try increasing CONVERSION_TIMEOUT.`));
          } else {
            reject(new Error(`Conversion failed: ${error.message}`));
          }
          return;
        }

        const inputFileName = path.basename(inputPath, path.extname(inputPath));
        const outputFileName = `${inputFileName}.${format}`;
        const outputPath = path.join(outputDir, outputFileName);

        if (fs.existsSync(outputPath)) {
          console.log(`Conversion successful: ${outputPath}`);
          resolve(outputPath);
        } else {
          console.log(`stdout: ${stdout}`);
          console.log(`stderr: ${stderr}`);
          reject(new Error('Output file not generated. Check LibreOffice installation and file format.'));
        }
      });
    });
  }
}

module.exports = new DocumentConverter();
