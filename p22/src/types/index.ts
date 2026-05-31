export interface VideoFile {
  file: File;
  name: string;
  size: number;
  type: string;
  url?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface OutputFile {
  name: string;
  url: string;
  size: number;
  blob: Blob;
}

export interface FilterConfig {
  scale: {
    enabled: boolean;
    width: number;
    height: number;
    keepAspect: boolean;
  };
  crop: {
    enabled: boolean;
    width: number;
    height: number;
    x: number;
    y: number;
  };
}

export interface ProcessingState {
  isProcessing: boolean;
  progress: number;
  logs: string[];
  currentCommand: string;
  error: string | null;
}

export interface FFmpegState {
  isLoaded: boolean;
  isLoading: boolean;
  loadProgress: number;
}

export interface CommandTemplate {
  name: string;
  description: string;
  command: string;
  icon: string;
  category: 'convert' | 'compress' | 'gif' | 'audio' | 'image' | 'other';
}

export interface ProcessTask {
  id: string;
  fileName: string;
  command: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  result?: Blob;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export const COMMAND_TEMPLATES: CommandTemplate[] = [
  {
    name: '格式转换',
    description: 'MP4 转 AVI',
    command: '-i input.mp4 output.avi',
    icon: 'repeat',
    category: 'convert',
  },
  {
    name: '转 WebM',
    description: 'MP4 转 WebM 格式',
    command: '-i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 output.webm',
    icon: 'repeat',
    category: 'convert',
  },
  {
    name: '转 MOV',
    description: 'MP4 转 QuickTime 格式',
    command: '-i input.mp4 -c copy output.mov',
    icon: 'repeat',
    category: 'convert',
  },
  {
    name: '压缩视频',
    description: '平衡质量压缩 (CRF 28)',
    command: '-i input.mp4 -vcodec libx264 -crf 28 output_compressed.mp4',
    icon: 'compress',
    category: 'compress',
  },
  {
    name: '轻度压缩',
    description: '高质量压缩 (CRF 23)',
    command: '-i input.mp4 -vcodec libx264 -crf 23 output_quality.mp4',
    icon: 'compress',
    category: 'compress',
  },
  {
    name: '强力压缩',
    description: '最大压缩 (CRF 32)',
    command: '-i input.mp4 -vcodec libx264 -crf 32 -preset slow output_small.mp4',
    icon: 'compress',
    category: 'compress',
  },
  {
    name: '720p 压缩',
    description: '缩放到720p并压缩',
    command: '-i input.mp4 -vf scale=-2:720 -c:v libx264 -crf 28 output_720p.mp4',
    icon: 'compress',
    category: 'compress',
  },
  {
    name: '480p 压缩',
    description: '缩放到480p并压缩',
    command: '-i input.mp4 -vf scale=-2:480 -c:v libx264 -crf 28 output_480p.mp4',
    icon: 'compress',
    category: 'compress',
  },
  {
    name: '高质量GIF',
    description: '320px 15fps 高质量',
    command: '-i input.mp4 -vf "fps=15,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output_hd.gif',
    icon: 'film',
    category: 'gif',
  },
  {
    name: '标准GIF',
    description: '320px 10fps 标准质量',
    command: '-i input.mp4 -vf "fps=10,scale=320:-1:flags=lanczos" output.gif',
    icon: 'film',
    category: 'gif',
  },
  {
    name: '小尺寸GIF',
    description: '240px 8fps 小文件',
    command: '-i input.mp4 -vf "fps=8,scale=240:-1:flags=lanczos" output_small.gif',
    icon: 'film',
    category: 'gif',
  },
  {
    name: '高分辨率GIF',
    description: '640px 15fps 清晰',
    command: '-i input.mp4 -vf "fps=15,scale=640:-1:flags=lanczos" output_large.gif',
    icon: 'film',
    category: 'gif',
  },
  {
    name: '提取MP3',
    description: '提取高品质音频',
    command: '-i input.mp4 -vn -acodec libmp3lame -q:a 2 output.mp3',
    icon: 'music',
    category: 'audio',
  },
  {
    name: '提取WAV',
    description: '无损音频格式',
    command: '-i input.mp4 -vn -acodec pcm_s16le output.wav',
    icon: 'music',
    category: 'audio',
  },
  {
    name: '提取AAC',
    description: '高效音频格式',
    command: '-i input.mp4 -vn -acodec copy output.aac',
    icon: 'music',
    category: 'audio',
  },
  {
    name: '提取封面',
    description: '提取第一帧作为图片',
    command: '-i input.mp4 -vframes 1 thumbnail.jpg',
    icon: 'image',
    category: 'image',
  },
  {
    name: '提取中间帧',
    description: '提取视频中间一帧',
    command: '-i input.mp4 -vf "select=eq(n\,100)" -vframes 1 frame_mid.jpg',
    icon: 'image',
    category: 'image',
  },
  {
    name: '提取PNG',
    description: '无损图片格式',
    command: '-i input.mp4 -vframes 1 thumbnail.png',
    icon: 'image',
    category: 'image',
  },
  {
    name: '调整尺寸',
    description: '缩放视频到720p',
    command: '-i input.mp4 -vf scale=-2:720 output_720p.mp4',
    icon: 'maximize',
    category: 'other',
  },
  {
    name: '水平翻转',
    description: '视频左右翻转',
    command: '-i input.mp4 -vf hflip output_hflip.mp4',
    icon: 'maximize',
    category: 'other',
  },
  {
    name: '垂直翻转',
    description: '视频上下翻转',
    command: '-i input.mp4 -vf vflip output_vflip.mp4',
    icon: 'maximize',
    category: 'other',
  },
  {
    name: '旋转90度',
    description: '视频顺时针旋转',
    command: '-i input.mp4 -vf transpose=1 output_rotated.mp4',
    icon: 'maximize',
    category: 'other',
  },
  {
    name: '灰度视频',
    description: '转为黑白视频',
    command: '-i input.mp4 -vf hue=s=0 output_gray.mp4',
    icon: 'maximize',
    category: 'other',
  },
];

export const TEMPLATE_CATEGORIES = [
  { id: 'convert', name: '格式转换', icon: 'repeat' },
  { id: 'compress', name: '压缩视频', icon: 'compress' },
  { id: 'gif', name: '转GIF', icon: 'film' },
  { id: 'audio', name: '提取音频', icon: 'music' },
  { id: 'image', name: '提取图片', icon: 'image' },
  { id: 'other', name: '其他', icon: 'maximize' },
];

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  scale: {
    enabled: false,
    width: 1280,
    height: 720,
    keepAspect: true,
  },
  crop: {
    enabled: false,
    width: 640,
    height: 480,
    x: 0,
    y: 0,
  },
};
