const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const sharp = require('sharp')

try {
  const ffmpegPath = require('ffmpeg-static')
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
} catch (_) {
  console.warn('ffmpeg-static not available, using system ffmpeg')
}

let currentCommand = null
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e'
  })

  mainWindow.loadFile('index.html')
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

async function getAverageBrightness(imagePath) {
  try {
    const { data, info } = await sharp(imagePath)
      .resize(100, 100, { fit: 'inside' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })

    let sum = 0
    for (let i = 0; i < data.length; i++) {
      sum += data[i]
    }
    return sum / data.length / 255
  } catch (err) {
    return 0.5
  }
}

function gaussianSmooth(values, sigma) {
  const result = new Array(values.length)
  const radius = Math.ceil(sigma * 3)
  for (let i = 0; i < values.length; i++) {
    let sum = 0
    let weightSum = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
      const distance = i - j
      const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma))
      sum += values[j] * weight
      weightSum += weight
    }
    result[i] = sum / weightSum
  }
  return result
}

async function analyzeBrightnessSequence(folder, frameCount) {
  const brightness = []
  for (let i = 0; i < frameCount; i++) {
    const file = path.join(folder, `${String(i + 1).padStart(6, '0')}.jpg`)
    const b = await getAverageBrightness(file)
    brightness.push(b)
  }
  return brightness
}

async function applyLrDeflicker(inputFolder, outputFolder, frameCount, smoothness, globalExposure) {
  const rawBrightness = await analyzeBrightnessSequence(inputFolder, frameCount)
  const sigma = smoothness * frameCount / 100
  const smoothedBrightness = gaussianSmooth(rawBrightness, Math.max(0.5, sigma))

  for (let i = 0; i < frameCount; i++) {
    if (currentCommand === null) {
      break
    }
    const src = path.join(inputFolder, `${String(i + 1).padStart(6, '0')}.jpg`)
    const dst = path.join(outputFolder, `${String(i + 1).padStart(6, '0')}.jpg`)

    const targetBrightness = smoothedBrightness[i]
    const currentBrightness = rawBrightness[i]
    let adjustment = targetBrightness / Math.max(0.01, currentBrightness)
    adjustment *= (1 + globalExposure / 100)

    await sharp(src)
      .modulate({
        brightness: Math.max(0.2, Math.min(2.5, adjustment))
      })
      .jpeg({ quality: 95 })
      .toFile(dst)

    if (i % 10 === 0 && mainWindow) {
      const progress = 15 + (i / frameCount) * 55
      mainWindow.webContents.send('encode-progress', Math.round(progress))
    }
  }
}

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择JPEG序列文件夹'
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('scan-jpegs', async (event, folderPath) => {
  try {
    const files = fs.readdirSync(folderPath)
      .filter(f => /\.(jpg|jpeg)$/i.test(f))
      .sort()
      .map(f => ({
        name: f,
        path: path.join(folderPath, f)
      }))
    return { success: true, files }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('get-image-data', async (event, imagePath) => {
  try {
    const data = fs.readFileSync(imagePath)
    const ext = path.extname(imagePath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
    return {
      success: true,
      data: `data:${mime};base64,${data.toString('base64')}`
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('select-output', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '选择输出MP4文件路径',
    defaultPath: 'timelapse.mp4',
    filters: [{ name: 'MP4', extensions: ['mp4'] }]
  })
  if (result.canceled) return null
  return result.filePath
})

ipcMain.handle('get-image-dimensions', async (event, imagePath) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(imagePath, (err, metadata) => {
      if (err) {
        try {
          const sizeOf = require('image-size')
          const dims = sizeOf(imagePath)
          return resolve({ success: true, width: dims.width, height: dims.height })
        } catch (_) {
          return resolve({ success: false, error: err.message })
        }
      }
      const stream = metadata.streams.find(s => s.width && s.height)
      if (stream) {
        resolve({ success: true, width: stream.width, height: stream.height })
      } else {
        resolve({ success: false, error: '无法获取图片尺寸' })
      }
    })
  })
})

ipcMain.handle('encode-video', async (event, options) => {
  const {
    inputFolder,
    outputFolder,
    framerate,
    cropTop,
    cropBottom,
    cropLeft,
    cropRight,
    exposure,
    deflicker,
    deflickerSize,
    targetWidth,
    targetHeight,
    codec,
    crf,
    useLrDeflicker,
    lrSmoothness
  } = options

  return new Promise(async (resolve) => {
    try {
      const tempDir = path.join(app.getPath('temp'), 'timelapse-encoder-temp')
      const deflickerDir = path.join(tempDir, 'deflicker')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
      if (!fs.existsSync(deflickerDir)) fs.mkdirSync(deflickerDir, { recursive: true })

      const jpegFiles = fs.readdirSync(inputFolder)
        .filter(f => /\.(jpg|jpeg)$/i.test(f))
        .sort()

      if (jpegFiles.length === 0) {
        return resolve({ success: false, error: '未找到JPEG文件' })
      }

      currentCommand = { cancelled: false }

      jpegFiles.forEach((f, i) => {
        const src = path.join(inputFolder, f)
        const dst = path.join(tempDir, `${String(i + 1).padStart(6, '0')}.jpg`)
        fs.copyFileSync(src, dst)
      })

      let inputImagePath = tempDir

      if (useLrDeflicker) {
        if (mainWindow) mainWindow.webContents.send('encode-progress', 5)
        await applyLrDeflicker(tempDir, deflickerDir, jpegFiles.length, lrSmoothness, exposure)
        if (currentCommand.cancelled) {
          cleanup([tempDir])
          return resolve({ success: false, error: '已取消' })
        }
        inputImagePath = deflickerDir
      }

      let cmd = ffmpeg()
        .input(path.join(inputImagePath, '%06d.jpg'))
        .inputFPS(framerate)

      const vfFilters = []

      if (cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0) {
        vfFilters.push(`crop=iw-${cropLeft + cropRight}:ih-${cropTop + cropBottom}:${cropLeft}:${cropTop}`)
      }

      if (deflicker && !useLrDeflicker) {
        vfFilters.push(`deflicker=mode=2:size=${deflickerSize}`)
      }

      if (!useLrDeflicker && exposure !== 0) {
        vfFilters.push(`eq=brightness=${(exposure / 100).toFixed(2)}`)
      }

      if (targetWidth > 0 && targetHeight > 0) {
        vfFilters.push(`scale=${targetWidth}:${targetHeight}:flags=lanczos`)
      }

      if (vfFilters.length > 0) {
        cmd = cmd.videoFilters(vfFilters)
      }

      currentCommand.cmd = cmd

      const encoderOpts = codec === 'h265'
        ? ['-c:v libx265', '-preset medium', `-crf ${crf || 23}`, '-pix_fmt yuv420p', '-movflags +faststart', '-tag:v hvc1']
        : ['-c:v libx264', '-preset medium', `-crf ${crf || 18}`, '-pix_fmt yuv420p', '-movflags +faststart']

      cmd
        .outputOptions(encoderOpts)
        .on('progress', (progress) => {
          const percent = progress.percent ? Math.round(progress.percent) : 0
          mainWindow.webContents.send('encode-progress', percent)
        })
        .on('end', () => {
          currentCommand = null
          try {
            fs.rmSync(tempDir, { recursive: true, force: true })
          } catch (_) {}
          resolve({ success: true })
        })
        .on('error', (err) => {
          currentCommand = null
          try {
            fs.rmSync(tempDir, { recursive: true, force: true })
          } catch (_) {}
          resolve({ success: false, error: err.message })
        })
        .run()
    } catch (err) {
      currentCommand = null
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch (_) {}
      resolve({ success: false, error: err.message })
    }
  })
})

function cleanup(dirs) {
  dirs.forEach(dir => {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (_) {}
  })
}

ipcMain.handle('cancel-encode', async () => {
  try {
    if (currentCommand) {
      currentCommand.cancelled = true
      if (currentCommand.cmd) {
        currentCommand.cmd.kill()
      }
      currentCommand = null
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})
