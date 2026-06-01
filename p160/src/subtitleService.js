const fs = require('fs');
const path = require('path');

class SubtitleService {
  constructor() {
    this.supportedFormats = ['.srt'];
  }

  parseSRT(content) {
    const subtitles = [];
    const blocks = content.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 3) continue;

      const index = parseInt(lines[0]);
      const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      
      if (!timeMatch) continue;

      const startTime = this.timeToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
      const endTime = this.timeToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
      const text = lines.slice(2).join('\n').trim();

      subtitles.push({
        index,
        startTime,
        endTime,
        text
      });
    }

    return subtitles;
  }

  timeToSeconds(hours, minutes, seconds, milliseconds) {
    return parseInt(hours) * 3600 +
           parseInt(minutes) * 60 +
           parseInt(seconds) +
           parseInt(milliseconds) / 1000;
  }

  secondsToTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  findSubtitleFile(videoPath) {
    const videoDir = path.dirname(videoPath);
    const videoName = path.parse(videoPath).name;
    const subtitleExtensions = ['.srt', '.SRT'];

    for (const ext of subtitleExtensions) {
      const subtitlePath = path.join(videoDir, videoName + ext);
      if (fs.existsSync(subtitlePath)) {
        return subtitlePath;
      }
    }

    try {
      const files = fs.readdirSync(videoDir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.srt') {
          const subtitleName = path.parse(file).name.toLowerCase();
          if (videoName.toLowerCase().includes(subtitleName) || 
              subtitleName.includes(videoName.toLowerCase())) {
            return path.join(videoDir, file);
          }
        }
      }
    } catch (err) {
      console.error('Error searching subtitles:', err);
    }

    return null;
  }

  getSubtitles(videoPath) {
    const subtitlePath = this.findSubtitleFile(videoPath);
    if (!subtitlePath) return null;

    try {
      const content = fs.readFileSync(subtitlePath, 'utf-8');
      const subtitles = this.parseSRT(content);
      
      return {
        path: subtitlePath,
        name: path.basename(subtitlePath),
        language: this.detectLanguage(subtitlePath),
        subtitles
      };
    } catch (err) {
      console.error('Error reading subtitle:', err);
      return null;
    }
  }

  detectLanguage(subtitlePath) {
    const name = path.basename(subtitlePath).toLowerCase();
    
    if (name.includes('.zh.') || name.includes('.chs.') || name.includes('.sc.') || name.includes('中文')) {
      return 'zh-CN';
    }
    if (name.includes('.en.') || name.includes('.eng.') || name.includes('english')) {
      return 'en';
    }
    if (name.includes('.jp.') || name.includes('.jpn.') || name.includes('日本語')) {
      return 'ja';
    }
    if (name.includes('.ko.') || name.includes('.kor.') || name.includes('한국어')) {
      return 'ko';
    }
    
    return 'unknown';
  }

  toSRTFormat(subtitles) {
    return subtitles.map((sub, idx) => {
      const index = idx + 1;
      const startTime = this.secondsToTime(sub.startTime);
      const endTime = this.secondsToTime(sub.endTime);
      return `${index}\n${startTime} --> ${endTime}\n${sub.text}\n`;
    }).join('\n');
  }

  getSubtitleAtTime(subtitles, currentTime) {
    return subtitles.find(sub => 
      currentTime >= sub.startTime && currentTime <= sub.endTime
    );
  }

  convertToWebVTT(subtitles) {
    let vtt = 'WEBVTT\n\n';
    
    for (const sub of subtitles) {
      const startTime = this.secondsToVTTTime(sub.startTime);
      const endTime = this.secondsToVTTTime(sub.endTime);
      vtt += `${startTime} --> ${endTime}\n${sub.text}\n\n`;
    }
    
    return vtt;
  }

  secondsToVTTTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
}

module.exports = new SubtitleService();
