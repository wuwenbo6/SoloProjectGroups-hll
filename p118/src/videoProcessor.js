const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

class VideoProcessor extends EventEmitter {
  constructor(db, alarmSystem, emergencyRecorder = null, gpsTracker = null) {
    super();
    this.db = db;
    this.alarmSystem = alarmSystem;
    this.emergencyRecorder = emergencyRecorder;
    this.gpsTracker = gpsTracker;
    this.isProcessing = false;
    this.shouldStop = false;
    this.videoId = null;
    this.videoPath = null;
    this.settings = {};
    this.cv = null;
    this.vehicleCascade = null;
    this.plateCascade = null;
    this.previousDistances = [];
    this.distanceHistory = new Map();
    this.lastEventFrame = -1;
    this.eventFrameInterval = 30;
    
    this.vanishingPoint = null;
    this.laneLines = [];
    this.frameWidth = 1280;
    this.frameHeight = 720;
    
    this.kalmanFilters = new Map();
    
    this.loadOpenCV();
    this.loadSettings();
  }

  loadOpenCV() {
    try {
      this.cv = require('opencv4nodejs');
      console.log('OpenCV加载成功');
      
      const dataPath = this.getCascadeDataPath();
      if (dataPath) {
        const vehicleCascadePath = path.join(dataPath, 'haarcascade_car.xml');
        const plateCascadePath = path.join(dataPath, 'haarcascade_russian_plate_number.xml');
        
        if (fs.existsSync(vehicleCascadePath)) {
          this.vehicleCascade = new this.cv.CascadeClassifier(vehicleCascadePath);
          console.log('车辆检测分类器加载成功');
        }
        if (fs.existsSync(plateCascadePath)) {
          this.plateCascade = new this.cv.CascadeClassifier(plateCascadePath);
          console.log('车牌检测分类器加载成功');
        }
      }
    } catch (e) {
      console.warn('OpenCV加载失败，将使用模拟检测模式:', e.message);
      this.cv = null;
    }
  }

  getCascadeDataPath() {
    const possiblePaths = [
      path.join(__dirname, 'data'),
      path.join(process.cwd(), 'node_modules', 'opencv4nodejs', 'data'),
      '/usr/local/share/opencv4',
      '/usr/share/opencv',
      '/opt/homebrew/share/opencv4'
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const files = fs.readdirSync(p);
        if (files.some(f => f.endsWith('.xml'))) {
          return p;
        }
      }
    }
    return null;
  }

  loadSettings() {
    try {
      const dbSettings = this.db.getSettings();
      for (const [key, data] of Object.entries(dbSettings)) {
        this.settings[key] = data.value;
      }
    } catch (e) {
      this.settings = {
        distance_threshold: 3.0,
        danger_threshold: 1.5,
        plate_real_width: 0.4,
        focal_length: 800,
        confidence_threshold: 0.7,
        frame_skip: 2,
        alarm_enabled: true,
        min_vehicle_width: 50,
        night_brightness_threshold: 60,
        lane_filter_enabled: true,
        lane_center_tolerance: 0.25,
        night_mode_enabled: true,
        taillight_distance_enabled: true,
        kalman_filter_enabled: true,
        distance_smoothing_window: 5
      };
    }
  }

  async processVideo(videoPath, options = {}) {
    if (!fs.existsSync(videoPath)) {
      throw new Error('视频文件不存在: ' + videoPath);
    }

    this.isProcessing = true;
    this.shouldStop = false;
    this.previousDistances = [];
    this.distanceHistory.clear();
    this.kalmanFilters.clear();
    this.lastEventFrame = -1;
    this.vanishingPoint = null;
    this.laneLines = [];
    this.videoPath = videoPath;
    this.loadSettings();

    if (this.emergencyRecorder) {
      this.emergencyRecorder.start(videoPath, this.videoId);
    }

    const fileName = path.basename(videoPath);
    const videoInfo = {
      filePath: videoPath,
      fileName,
      fps: options.fps || 30,
      duration: 0,
      width: 1280,
      height: 720,
      totalFrames: 0
    };

    let cap = null;
    if (this.cv) {
      try {
        cap = new this.cv.VideoCapture(videoPath);
        videoInfo.width = cap.get(this.cv.CAP_PROP_FRAME_WIDTH);
        videoInfo.height = cap.get(this.cv.CAP_PROP_FRAME_HEIGHT);
        videoInfo.fps = cap.get(this.cv.CAP_PROP_FPS) || 30;
        videoInfo.totalFrames = cap.get(this.cv.CAP_PROP_FRAME_COUNT);
        videoInfo.duration = videoInfo.totalFrames / videoInfo.fps;
        this.frameWidth = videoInfo.width;
        this.frameHeight = videoInfo.height;
      } catch (e) {
        console.log('OpenCV读取视频信息失败，使用默认值:', e.message);
      }
    }

    this.videoId = this.db.addVideo(videoInfo);
    this.emit('processing:start', { videoId: this.videoId, videoInfo });

    if (this.emergencyRecorder && this.videoId) {
      this.emergencyRecorder.currentVideoId = this.videoId;
    }

    const result = this.cv && cap 
      ? await this.processWithOpenCV(cap, videoInfo, options)
      : await this.processWithSimulation(videoInfo, options);

    this.isProcessing = false;
    this.db.updateVideoStatus(this.videoId, result.error ? 'error' : 'completed', result.processedFrames);

    if (this.emergencyRecorder) {
      this.emergencyRecorder.stop();
    }

    if (this.gpsTracker && this.gpsTracker.isRecording) {
      this.gpsTracker.stopRecording();
    }

    return result;
  }

  async processWithOpenCV(cap, videoInfo, options) {
    const frameSkip = options.frameSkip || this.settings.frame_skip || 2;
    const totalFrames = videoInfo.totalFrames;
    let processedFrames = 0;
    let detectedEvents = [];
    let frameNumber = 0;
    const videoStartTime = Date.now();

    try {
      while (!this.shouldStop) {
        let frame;
        try {
          frame = cap.read();
        } catch (e) {
          console.log('读取帧失败:', e.message);
          break;
        }

        if (frame.empty) break;
        
        frameNumber++;
        
        if (frameNumber % frameSkip !== 0) continue;

        const timestamp = frameNumber / videoInfo.fps;
        const brightness = this.calculateBrightness(frame);
        const isNight = this.settings.night_mode_enabled && brightness < this.settings.night_brightness_threshold;
        
        if (this.emergencyRecorder) {
          this.emergencyRecorder.addFrame(frame, frameNumber, timestamp);
        }

        if (this.gpsTracker && this.gpsTracker.isRecording && frameNumber % 30 === 0) {
          const simulatedLat = 39.9042 + (Math.random() * 0.01 - 0.005);
          const simulatedLon = 116.4074 + (Math.random() * 0.01 - 0.005);
          this.gpsTracker.addPoint(simulatedLat, simulatedLon, videoStartTime + (timestamp * 1000));
        }
        
        let enhancedFrame = frame;
        if (isNight) {
          enhancedFrame = this.enhanceNightFrame(frame);
        }

        if (this.settings.lane_filter_enabled && frameNumber % (frameSkip * 5) === 0) {
          this.detectLaneLines(frame);
          this.estimateVanishingPoint(frame);
        }

        const detections = this.detectVehiclesEnhanced(enhancedFrame, frame, frameNumber, isNight);
        
        const filteredDetections = this.settings.lane_filter_enabled 
          ? this.filterAdjacentLaneVehicles(detections)
          : detections;

        this.db.addDetection({
          videoId: this.videoId,
          frameNumber,
          timestamp,
          vehicleCount: filteredDetections.length,
          detectedVehicles: filteredDetections
        });

        for (const vehicle of filteredDetections) {
          const plate = !isNight ? this.detectPlate(enhancedFrame, vehicle) : null;
          const taillights = isNight && this.settings.taillight_distance_enabled 
            ? this.detectTaillights(enhancedFrame, vehicle) 
            : null;
          
          const distanceData = this.calculateDistanceMultiSource(vehicle, plate, taillights, frameNumber);
          const distance = distanceData.distance;
          const riskLevel = this.assessRisk(distance);
          
          vehicle.distance = distance;
          vehicle.riskLevel = riskLevel;
          vehicle.distanceSource = distanceData.source;
          vehicle.isNight = isNight;
          vehicle.brightness = brightness;
          vehicle.inLane = vehicle.inLane !== undefined ? vehicle.inLane : true;
          
          if (plate) vehicle.plate = plate;
          if (taillights) vehicle.taillights = taillights;
          if (distanceData.smoothed) vehicle.smoothedDistance = distanceData.smoothed;

          const ttc = this.calculateTTC(distance, frameNumber, videoInfo.fps, vehicle.id);
          vehicle.ttc = ttc;

          if ((riskLevel === 'danger' || riskLevel === 'warning') && 
              (frameNumber - this.lastEventFrame) >= this.eventFrameInterval &&
              vehicle.inLane) {
            
            this.lastEventFrame = frameNumber;
            
            const eventData = {
              videoId: this.videoId,
              frameNumber,
              timestamp,
              distance,
              riskLevel,
              vehicleX: vehicle.x,
              vehicleY: vehicle.y,
              vehicleWidth: vehicle.width,
              vehicleHeight: vehicle.height,
              plateWidth: plate ? plate.width : null,
              plateHeight: plate ? plate.height : null,
              plateX: plate ? plate.x : null,
              plateY: plate ? plate.y : null,
              ttc,
              notes: this.generateEventNote(riskLevel, distance, distanceData.source, isNight),
              speed: null,
              relativeSpeed: null,
              imagePath: null
            };

            const eventId = this.db.addEvent(eventData);
            eventData.id = eventId;
            detectedEvents.push(eventData);

            if (this.settings.alarm_enabled) {
              if (riskLevel === 'danger') {
                this.alarmSystem.triggerDanger(distance, { frameNumber, eventId, isNight, source: distanceData.source });
              } else {
                this.alarmSystem.triggerWarning(distance, { frameNumber, eventId, isNight, source: distanceData.source });
              }
            }

            this.emit('detection:alert', eventData);
          }
        }

        const frameData = {
          frameNumber,
          timestamp,
          totalFrames,
          progress: Math.round((frameNumber / totalFrames) * 100),
          detections: filteredDetections,
          isNight,
          brightness,
          vanishingPoint: this.vanishingPoint,
          laneLines: this.laneLines,
          frameData: this.frameToBase64(enhancedFrame)
        };

        this.emit('frame:processed', frameData);
        processedFrames++;

        await this.sleep(1);
      }

      cap.release();

      return {
        success: true,
        videoId: this.videoId,
        processedFrames,
        totalFrames,
        events: detectedEvents,
        eventCount: detectedEvents.length,
        dangerCount: detectedEvents.filter(e => e.riskLevel === 'danger').length,
        warningCount: detectedEvents.filter(e => e.riskLevel === 'warning').length
      };
    } catch (error) {
      console.error('OpenCV处理错误:', error);
      return {
        success: false,
        error: error.message,
        processedFrames,
        events: detectedEvents
      };
    }
  }

  async processWithSimulation(videoInfo, options) {
    console.log('使用模拟检测模式处理视频');
    
    const frameSkip = options.frameSkip || this.settings.frame_skip || 2;
    const totalFrames = videoInfo.totalFrames || 1000;
    const fps = videoInfo.fps || 30;
    let processedFrames = 0;
    let detectedEvents = [];
    const videoStartTime = Date.now();

    const simulatedVehicles = this.generateSimulatedVehicles(totalFrames);

    for (let frameNumber = 0; frameNumber < totalFrames && !this.shouldStop; frameNumber += frameSkip) {
      const timestamp = frameNumber / fps;
      
      const isNight = Math.sin(frameNumber * 0.001) > 0.3;
      const brightness = isNight ? 30 + Math.random() * 30 : 100 + Math.random() * 100;
      
      if (this.emergencyRecorder) {
        this.emergencyRecorder.addFrame(null, frameNumber, timestamp);
      }

      if (this.gpsTracker && this.gpsTracker.isRecording && frameNumber % 30 === 0) {
        const simulatedLat = 39.9042 + (Math.random() * 0.01 - 0.005);
        const simulatedLon = 116.4074 + (Math.random() * 0.01 - 0.005);
        this.gpsTracker.addPoint(simulatedLat, simulatedLon, videoStartTime + (timestamp * 1000));
      }
      
      if (frameNumber % (frameSkip * 5) === 0) {
        this.simulateLaneDetection();
      }
      
      const vehicles = simulatedVehicles
        .map(v => this.getVehicleStateAtFrame(v, frameNumber, isNight))
        .filter(v => v && v.visible);

      const filteredVehicles = this.settings.lane_filter_enabled 
        ? this.filterAdjacentLaneVehicles(vehicles)
        : vehicles;

      this.db.addDetection({
        videoId: this.videoId,
        frameNumber,
        timestamp,
        vehicleCount: filteredVehicles.length,
        detectedVehicles: filteredVehicles
      });

      for (const vehicle of filteredVehicles) {
        const distance = vehicle.distance;
        const riskLevel = this.assessRisk(distance);
        vehicle.riskLevel = riskLevel;
        vehicle.isNight = isNight;
        vehicle.brightness = brightness;
        vehicle.ttc = this.calculateTTC(distance, frameNumber, fps, vehicle.id);

        if ((riskLevel === 'danger' || riskLevel === 'warning') && 
            (frameNumber - this.lastEventFrame) >= this.eventFrameInterval &&
            vehicle.inLane) {
          
          this.lastEventFrame = frameNumber;
          
          const eventData = {
            videoId: this.videoId,
            frameNumber,
            timestamp,
            distance,
            riskLevel,
            vehicleX: vehicle.x,
            vehicleY: vehicle.y,
            vehicleWidth: vehicle.width,
            vehicleHeight: vehicle.height,
            plateWidth: vehicle.plate ? vehicle.plate.width : null,
            plateHeight: vehicle.plate ? vehicle.plate.height : null,
            plateX: vehicle.plate ? vehicle.plate.x : null,
            plateY: vehicle.plate ? vehicle.plate.y : null,
            ttc: vehicle.ttc,
            notes: this.generateEventNote(riskLevel, distance, vehicle.distanceSource || 'vehicle', isNight)
          };

          const eventId = this.db.addEvent(eventData);
          eventData.id = eventId;
          detectedEvents.push(eventData);

          if (this.settings.alarm_enabled) {
            if (riskLevel === 'danger') {
              this.alarmSystem.triggerDanger(distance, { frameNumber, eventId, isNight });
            } else {
              this.alarmSystem.triggerWarning(distance, { frameNumber, eventId, isNight });
            }
          }

          this.emit('detection:alert', eventData);
        }
      }

      this.emit('frame:processed', {
        frameNumber,
        timestamp,
        totalFrames,
        progress: Math.round((frameNumber / totalFrames) * 100),
        detections: filteredVehicles,
        isSimulation: true,
        isNight,
        brightness,
        vanishingPoint: this.vanishingPoint,
        laneLines: this.laneLines
      });

      processedFrames++;
      await this.sleep(50);
    }

    this.emit('processing:complete', {
      success: true,
      videoId: this.videoId,
      processedFrames,
      totalFrames,
      events: detectedEvents,
      eventCount: detectedEvents.length,
      dangerCount: detectedEvents.filter(e => e.riskLevel === 'danger').length,
      warningCount: detectedEvents.filter(e => e.riskLevel === 'warning').length,
      isSimulation: true
    });

    return {
      success: true,
      isSimulation: true,
      videoId: this.videoId,
      processedFrames,
      totalFrames,
      events: detectedEvents,
      eventCount: detectedEvents.length,
      dangerCount: detectedEvents.filter(e => e.riskLevel === 'danger').length,
      warningCount: detectedEvents.filter(e => e.riskLevel === 'warning').length
    };
  }

  calculateBrightness(frame) {
    try {
      if (!this.cv) return 100;
      const gray = frame.bgrToGray();
      const small = gray.rescale(0.1);
      const mean = small.mean();
      return mean.w;
    } catch (e) {
      return 100;
    }
  }

  enhanceNightFrame(frame) {
    try {
      if (!this.cv) return frame;
      
      const lab = frame.cvtColor(this.cv.COLOR_BGR2Lab);
      const channels = lab.split();
      
      const clahe = new this.cv.CLAHE(3.0, new this.cv.Size(8, 8));
      channels[0] = clahe.apply(channels[0]);
      
      const merged = new this.cv.Mat(channels);
      const enhanced = merged.cvtColor(this.cv.COLOR_Lab2BGR);
      
      return enhanced;
    } catch (e) {
      console.log('夜间图像增强失败:', e.message);
      return frame;
    }
  }

  detectTaillights(frame, vehicle) {
    try {
      if (!this.cv) return null;
      
      const region = frame.getRegion(new this.cv.Rect(
        Math.max(0, vehicle.x),
        Math.max(0, vehicle.y + Math.floor(vehicle.height * 0.5)),
        Math.min(vehicle.width, frame.cols - vehicle.x),
        Math.min(Math.floor(vehicle.height * 0.4), frame.rows - vehicle.y - Math.floor(vehicle.height * 0.5))
      ));
      
      const hsv = region.cvtColor(this.cv.COLOR_BGR2HSV);
      
      const lowerRed1 = new this.cv.Vec3(0, 100, 100);
      const upperRed1 = new this.cv.Vec3(10, 255, 255);
      const lowerRed2 = new this.cv.Vec3(160, 100, 100);
      const upperRed2 = new this.cv.Vec3(180, 255, 255);
      
      const mask1 = hsv.inRange(lowerRed1, upperRed1);
      const mask2 = hsv.inRange(lowerRed2, upperRed2);
      const mask = mask1.bitwiseOr(mask2);
      
      const kernel = this.cv.getStructuringElement(this.cv.MORPH_ELLIPSE, new this.cv.Size(5, 5));
      const opened = mask.morphologyEx(kernel, this.cv.MORPH_OPEN);
      const closed = opened.morphologyEx(kernel, this.cv.MORPH_CLOSE);
      
      const contours = closed.findContours(this.cv.RETR_EXTERNAL, this.cv.CHAIN_APPROX_SIMPLE);
      
      const lights = [];
      for (const contour of contours) {
        const rect = contour.boundingRect();
        const area = contour.area;
        if (area > 20) {
          lights.push({
            x: vehicle.x + rect.x,
            y: vehicle.y + Math.floor(vehicle.height * 0.5) + rect.y,
            width: rect.width,
            height: rect.height,
            area
          });
        }
      }
      
      if (lights.length >= 2) {
        lights.sort((a, b) => a.x - b.x);
        const leftLight = lights[0];
        const rightLight = lights[lights.length - 1];
        
        const centerX = (leftLight.x + rightLight.x + rightLight.width) / 2;
        const centerY = (leftLight.y + leftLight.height / 2 + rightLight.y + rightLight.height / 2) / 2;
        const spacing = Math.abs(rightLight.x + rightLight.width - leftLight.x);
        
        return {
          left: leftLight,
          right: rightLight,
          centerX,
          centerY,
          spacing,
          count: lights.length
        };
      }
      
      return null;
    } catch (e) {
      return null;
    }
  }

  detectLaneLines(frame) {
    try {
      if (!this.cv) {
        this.simulateLaneDetection();
        return;
      }
      
      const height = frame.rows;
      const width = frame.cols;
      
      const roi = frame.getRegion(new this.cv.Rect(
        0,
        Math.floor(height * 0.5),
        width,
        Math.floor(height * 0.5)
      ));
      
      const gray = roi.bgrToGray();
      const blurred = gray.gaussianBlur(new this.cv.Size(5, 5), 0);
      const edges = blurred.canny(50, 150);
      
      const lines = edges.houghLinesP(
        2,
        Math.PI / 180,
        100,
        100,
        50
      );
      
      const filteredLines = [];
      for (const line of lines) {
        const x1 = line.x1;
        const y1 = line.y1 + height * 0.5;
        const x2 = line.x2;
        const y2 = line.y2 + height * 0.5;
        
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        
        if (Math.abs(angle) > 20 && Math.abs(angle) < 160) {
          const slope = (y2 - y1) / (x2 - x1);
          const intercept = y1 - slope * x1;
          
          filteredLines.push({
            x1, y1, x2, y2,
            slope,
            intercept,
            angle
          });
        }
      }
      
      this.laneLines = filteredLines.slice(0, 4);
      
    } catch (e) {
      console.log('车道线检测失败:', e.message);
      this.simulateLaneDetection();
    }
  }

  simulateLaneDetection() {
    const centerX = this.frameWidth / 2;
    const centerY = this.frameHeight * 0.4;
    
    this.vanishingPoint = { x: centerX + (Math.random() - 0.5) * 60, y: centerY };
    
    const laneWidth = this.frameWidth * 0.25;
    const bottomY = this.frameHeight;
    
    this.laneLines = [
      {
        x1: centerX - laneWidth,
        y1: bottomY,
        x2: this.vanishingPoint.x - 10,
        y2: this.vanishingPoint.y,
        slope: (bottomY - this.vanishingPoint.y) / (centerX - laneWidth - this.vanishingPoint.x + 10),
        intercept: bottomY
      },
      {
        x1: centerX + laneWidth,
        y1: bottomY,
        x2: this.vanishingPoint.x + 10,
        y2: this.vanishingPoint.y,
        slope: (bottomY - this.vanishingPoint.y) / (centerX + laneWidth - this.vanishingPoint.x - 10),
        intercept: bottomY
      }
    ];
  }

  estimateVanishingPoint(frame) {
    try {
      if (!this.cv || this.laneLines.length < 2) {
        if (!this.vanishingPoint) {
          this.vanishingPoint = { x: this.frameWidth / 2, y: this.frameHeight * 0.4 };
        }
        return;
      }
      
      const intersections = [];
      for (let i = 0; i < this.laneLines.length; i++) {
        for (let j = i + 1; j < this.laneLines.length; j++) {
          const l1 = this.laneLines[i];
          const l2 = this.laneLines[j];
          
          if (Math.abs(l1.slope - l2.slope) > 0.1) {
            const x = (l2.intercept - l1.intercept) / (l1.slope - l2.slope);
            const y = l1.slope * x + l1.intercept;
            
            if (x > 0 && x < this.frameWidth && y > 0 && y < this.frameHeight * 0.7) {
              intersections.push({ x, y });
            }
          }
        }
      }
      
      if (intersections.length > 0) {
        const avgX = intersections.reduce((sum, p) => sum + p.x, 0) / intersections.length;
        const avgY = intersections.reduce((sum, p) => sum + p.y, 0) / intersections.length;
        
        if (this.vanishingPoint) {
          this.vanishingPoint.x = this.vanishingPoint.x * 0.7 + avgX * 0.3;
          this.vanishingPoint.y = this.vanishingPoint.y * 0.7 + avgY * 0.3;
        } else {
          this.vanishingPoint = { x: avgX, y: avgY };
        }
      }
    } catch (e) {
      console.log('消失点估计失败:', e.message);
    }
  }

  isInEgoLane(vehicle) {
    const tolerance = this.settings.lane_center_tolerance || 0.25;
    
    const vehicleCenterX = vehicle.x + vehicle.width / 2;
    const frameCenterX = this.frameWidth / 2;
    
    const normalizedOffset = Math.abs(vehicleCenterX - frameCenterX) / (this.frameWidth / 2);
    
    if (this.vanishingPoint && this.laneLines.length >= 2) {
      const bottomY = this.frameHeight;
      const vehicleBottomY = vehicle.y + vehicle.height;
      
      let leftBound = this.frameWidth * 0.25;
      let rightBound = this.frameWidth * 0.75;
      
      const leftLines = this.laneLines.filter(l => l.slope < -0.5);
      const rightLines = this.laneLines.filter(l => l.slope > 0.5);
      
      if (leftLines.length > 0) {
        const leftLine = leftLines[0];
        leftBound = (vehicleBottomY - leftLine.intercept) / leftLine.slope;
      }
      
      if (rightLines.length > 0) {
        const rightLine = rightLines[0];
        rightBound = (vehicleBottomY - rightLine.intercept) / rightLine.slope;
      }
      
      const laneWidth = rightBound - leftBound;
      const laneCenter = (leftBound + rightBound) / 2;
      const egoTolerance = laneWidth * tolerance;
      
      return vehicleCenterX >= laneCenter - egoTolerance && vehicleCenterX <= laneCenter + egoTolerance;
    }
    
    return normalizedOffset < tolerance;
  }

  filterAdjacentLaneVehicles(vehicles) {
    return vehicles.map(vehicle => {
      const inLane = this.isInEgoLane(vehicle);
      return { ...vehicle, inLane };
    }).filter(vehicle => {
      if (vehicle.inLane) return true;
      const distance = vehicle.distance || this.calculateDistance(vehicle);
      return distance < this.settings.danger_threshold * 2;
    });
  }

  detectVehiclesEnhanced(enhancedFrame, originalFrame, frameNumber, isNight) {
    if (!this.vehicleCascade) {
      return [];
    }

    const gray = enhancedFrame.bgrToGray();
    const resized = gray.rescale(0.5);
    
    let scaleFactor = 1.1;
    let minNeighbors = 3;
    
    if (isNight) {
      scaleFactor = 1.05;
      minNeighbors = 2;
    }
    
    const detections = this.vehicleCascade.detectMultiScale(
      resized,
      scaleFactor,
      minNeighbors,
      0,
      new this.cv.Size(this.settings.min_vehicle_width / 2, this.settings.min_vehicle_width / 2)
    );

    const vehicles = [];
    for (let i = 0; i < detections.objects.length; i++) {
      const rect = detections.objects[i];
      const confidence = Math.min(1.0, detections.numDetections[i] / 8);
      
      const nightBonus = isNight ? 0.1 : 0;
      const adjustedConfidence = Math.min(1.0, confidence + nightBonus);
      
      if (adjustedConfidence >= this.settings.confidence_threshold * (isNight ? 0.85 : 1.0)) {
        vehicles.push({
          id: `vehicle_${frameNumber}_${i}`,
          x: rect.x * 2,
          y: rect.y * 2,
          width: rect.width * 2,
          height: rect.height * 2,
          confidence: adjustedConfidence
        });
      }
    }

    return vehicles.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  detectPlate(frame, vehicle) {
    if (!this.plateCascade) {
      return null;
    }

    try {
      const vehicleRegion = frame.getRegion(new this.cv.Rect(
        Math.max(0, vehicle.x),
        Math.max(0, vehicle.y + Math.floor(vehicle.height * 0.5)),
        Math.min(vehicle.width, frame.cols - vehicle.x),
        Math.min(Math.floor(vehicle.height * 0.5), frame.rows - vehicle.y - Math.floor(vehicle.height * 0.5))
      ));

      const gray = vehicleRegion.bgrToGray();
      const plates = this.plateCascade.detectMultiScale(
        gray,
        1.1,
        4,
        0,
        new this.cv.Size(20, 10)
      );

      if (plates.objects.length > 0) {
        const plate = plates.objects[0];
        return {
          x: vehicle.x + plate.x,
          y: vehicle.y + Math.floor(vehicle.height * 0.5) + plate.y,
          width: plate.width,
          height: plate.height,
          confidence: plates.numDetections[0] / 10
        };
      }
    } catch (e) {
    }

    return null;
  }

  calculateDistanceMultiSource(vehicle, plate, taillights, frameNumber) {
    const results = [];
    
    if (plate && plate.width > 0) {
      const plateDistance = this.calculateDistanceFromPlate(plate);
      results.push({ distance: plateDistance, source: 'plate', weight: 0.6 });
    }
    
    if (taillights && taillights.spacing > 0) {
      const taillightDistance = this.calculateDistanceFromTaillights(taillights);
      results.push({ distance: taillightDistance, source: 'taillights', weight: 0.5 });
    }
    
    const vehicleDistance = this.calculateDistanceFromVehicle(vehicle);
    results.push({ distance: vehicleDistance, source: 'vehicle', weight: 0.4 });
    
    if (results.length === 0) {
      return { distance: 999, source: 'none' };
    }
    
    const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
    let weightedDistance = 0;
    let bestSource = 'vehicle';
    let maxWeight = 0;
    
    for (const r of results) {
      weightedDistance += r.distance * r.weight;
      if (r.weight > maxWeight) {
        maxWeight = r.weight;
        bestSource = r.source;
      }
    }
    
    weightedDistance /= totalWeight;
    
    let smoothedDistance = weightedDistance;
    if (this.settings.kalman_filter_enabled) {
      smoothedDistance = this.applyKalmanFilter(vehicle.id, weightedDistance, frameNumber);
    } else {
      smoothedDistance = this.smoothDistance(vehicle.id, weightedDistance);
    }
    
    return {
      distance: smoothedDistance,
      rawDistance: weightedDistance,
      smoothed: smoothedDistance,
      source: bestSource,
      allSources: results
    };
  }

  calculateDistanceFromPlate(plate) {
    if (!plate || !plate.width) return 999;
    
    const realWidth = this.settings.plate_real_width || 0.4;
    const focalLength = this.settings.focal_length || 800;
    
    const distance = (realWidth * focalLength) / plate.width;
    return Math.max(0.1, Math.min(100, distance));
  }

  calculateDistanceFromTaillights(taillights) {
    if (!taillights || !taillights.spacing) return 999;
    
    const taillightSpacingReal = 1.5;
    const focalLength = this.settings.focal_length || 800;
    
    const distance = (taillightSpacingReal * focalLength) / taillights.spacing;
    return Math.max(0.1, Math.min(100, distance));
  }

  calculateDistanceFromVehicle(vehicle) {
    if (!vehicle || !vehicle.width) return 999;
    
    const realWidth = 1.8;
    const focalLength = this.settings.focal_length || 800;
    
    const distance = (realWidth * focalLength) / vehicle.width;
    return Math.max(0.1, Math.min(100, distance));
  }

  calculateDistance(object) {
    if (!object || !object.width) {
      return 999;
    }

    const realWidth = object.width && object.height && object.width > object.height * 2
      ? this.settings.plate_real_width
      : 1.8;

    const focalLength = this.settings.focal_length || 800;
    const apparentWidth = object.width;

    if (apparentWidth <= 0) return 999;

    const distance = (realWidth * focalLength) / apparentWidth;
    return Math.max(0.1, Math.min(100, distance));
  }

  applyKalmanFilter(vehicleId, measurement, frameNumber) {
    if (!this.kalmanFilters.has(vehicleId)) {
      const kf = {
        x: measurement,
        P: 1.0,
        Q: 0.01,
        R: 0.1
      };
      this.kalmanFilters.set(vehicleId, kf);
    }
    
    const kf = this.kalmanFilters.get(vehicleId);
    
    kf.P = kf.P + kf.Q;
    
    const K = kf.P / (kf.P + kf.R);
    kf.x = kf.x + K * (measurement - kf.x);
    kf.P = (1 - K) * kf.P;
    
    return kf.x;
  }

  smoothDistance(vehicleId, newDistance) {
    if (!this.distanceHistory.has(vehicleId)) {
      this.distanceHistory.set(vehicleId, []);
    }
    
    const history = this.distanceHistory.get(vehicleId);
    history.push(newDistance);
    
    const windowSize = this.settings.distance_smoothing_window || 5;
    if (history.length > windowSize) {
      history.shift();
    }
    
    const sum = history.reduce((a, b) => a + b, 0);
    return sum / history.length;
  }

  assessRisk(distance) {
    const dangerThreshold = this.settings.danger_threshold || 1.5;
    const warningThreshold = this.settings.distance_threshold || 3.0;

    if (distance <= dangerThreshold) {
      return 'danger';
    } else if (distance <= warningThreshold) {
      return 'warning';
    } else {
      return 'safe';
    }
  }

  calculateTTC(distance, frameNumber, fps, vehicleId = 'default') {
    const key = `${vehicleId}_distance`;
    if (!this.previousDistances) this.previousDistances = [];
    
    this.previousDistances.push({ frameNumber, distance, vehicleId });
    
    if (this.previousDistances.length > 60) {
      this.previousDistances = this.previousDistances.slice(-60);
    }

    const vehicleDistances = this.previousDistances.filter(d => d.vehicleId === vehicleId);
    if (vehicleDistances.length < 5) {
      return null;
    }

    let closingSpeed = 0;
    const recent = vehicleDistances.slice(-15);
    let validPairs = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const deltaFrames = recent[i].frameNumber - recent[i - 1].frameNumber;
      if (deltaFrames > 0) {
        const deltaDistance = recent[i].distance - recent[i - 1].distance;
        closingSpeed += deltaDistance / deltaFrames;
        validPairs++;
      }
    }
    
    if (validPairs === 0) return null;
    
    closingSpeed /= validPairs;
    closingSpeed *= fps;

    if (closingSpeed >= -0.1) {
      return null;
    }

    const ttc = Math.abs(distance / closingSpeed);
    return Math.max(0.1, Math.min(60, ttc));
  }

  generateEventNote(riskLevel, distance, source, isNight) {
    const sourceText = {
      'plate': '车牌检测',
      'taillights': '尾灯检测',
      'vehicle': '车辆检测'
    }[source] || '车辆检测';
    
    const nightText = isNight ? '（夜间模式）' : '';
    
    if (riskLevel === 'danger') {
      return `危险距离！${sourceText}${nightText}，距离 ${distance.toFixed(2)} 米，请立即减速！`;
    } else {
      return `注意车距！${sourceText}${nightText}，距离 ${distance.toFixed(2)} 米，请保持安全距离。`;
    }
  }

  generateSimulatedVehicles(totalFrames) {
    const vehicles = [];
    const vehicleCount = Math.floor(Math.random() * 3) + 2;
    
    for (let i = 0; i < vehicleCount; i++) {
      const startFrame = Math.floor(Math.random() * (totalFrames * 0.3));
      const endFrame = Math.floor(totalFrames * (0.5 + Math.random() * 0.5));
      const startDistance = 15 + Math.random() * 20;
      const endDistance = Math.random() > 0.5 ? 1 + Math.random() * 3 : startDistance - Math.random() * 10;
      
      const laneOffset = (i % 2 === 0) ? 0 : (Math.random() > 0.5 ? 0.4 : -0.4);
      
      vehicles.push({
        id: `vehicle_${i}`,
        startFrame,
        endFrame,
        startDistance,
        endDistance,
        baseX: 300 + i * 150 + Math.random() * 100,
        baseY: 200 + Math.random() * 50,
        baseWidth: 150 + Math.random() * 50,
        baseHeight: 100 + Math.random() * 30,
        hasPlate: Math.random() > 0.3,
        hasTaillights: Math.random() > 0.2,
        laneOffset
      });
    }
    
    return vehicles;
  }

  getVehicleStateAtFrame(vehicle, frameNumber, isNight = false) {
    if (frameNumber < vehicle.startFrame || frameNumber > vehicle.endFrame) {
      return null;
    }

    const progress = (frameNumber - vehicle.startFrame) / (vehicle.endFrame - vehicle.startFrame);
    const distance = vehicle.startDistance + (vehicle.endDistance - vehicle.startFrame) * progress;
    const scale = Math.max(0.2, 15 / Math.max(0.5, distance));
    
    const width = Math.max(30, vehicle.baseWidth * scale);
    const height = Math.max(20, vehicle.baseHeight * scale);
    
    const laneShift = vehicle.laneOffset * this.frameWidth * 0.3 * Math.sin(progress * Math.PI * 0.5);
    const x = vehicle.baseX - width / 2 + Math.sin(progress * Math.PI) * 20 + laneShift;
    const y = vehicle.baseY + (1 - scale) * 100;

    const state = {
      id: vehicle.id,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      distance: Math.max(0.5, distance),
      visible: true,
      confidence: 0.85 + Math.random() * 0.15,
      distanceSource: 'vehicle'
    };

    if (vehicle.hasPlate && !isNight) {
      const plateWidth = Math.round(width * 0.3);
      const plateHeight = Math.round(plateWidth * 0.3);
      state.plate = {
        x: Math.round(x + width / 2 - plateWidth / 2),
        y: Math.round(y + height * 0.65),
        width: plateWidth,
        height: plateHeight
      };
      state.distanceSource = 'plate';
    }
    
    if (vehicle.hasTaillights && isNight) {
      const tlWidth = Math.round(width * 0.12);
      const tlHeight = Math.round(tlWidth * 0.8);
      state.taillights = {
        left: {
          x: Math.round(x + width * 0.15),
          y: Math.round(y + height * 0.6),
          width: tlWidth,
          height: tlHeight
        },
        right: {
          x: Math.round(x + width * 0.75),
          y: Math.round(y + height * 0.6),
          width: tlWidth,
          height: tlHeight
        },
        spacing: Math.round(width * 0.6),
        count: 2
      };
      state.distanceSource = 'taillights';
    }

    state.inLane = this.isInEgoLane(state);

    return state;
  }

  frameToBase64(frame) {
    try {
      if (!this.cv) return null;
      const smallFrame = frame.rescale(0.3);
      const buffer = this.cv.imencode('.jpg', smallFrame, [this.cv.IMWRITE_JPEG_QUALITY, 70]);
      return 'data:image/jpeg;base64,' + buffer.toString('base64');
    } catch (e) {
      return null;
    }
  }

  stop() {
    this.shouldStop = true;
    this.isProcessing = false;
    this.emit('processing:stopped', { videoId: this.videoId });
    return { success: true };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isBusy() {
    return this.isProcessing;
  }
}

module.exports = VideoProcessor;
