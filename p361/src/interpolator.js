class MotionInterpolator {
  constructor(stepsPerRevolution = 200, unitsPerRevolution = 360) {
    this.stepsPerRevolution = stepsPerRevolution;
    this.unitsPerRevolution = unitsPerRevolution;
    this.stepsPerUnit = stepsPerRevolution / unitsPerRevolution;

    this.currentPosition = { x: 0, y: 0 };
    this.targetPosition = { x: 0, y: 0 };
    this.currentStep = { x: 0, y: 0 };

    this.maxSpeed = 500;
    this.acceleration = 200;
    this.currentSpeed = 0;

    this.isRunning = false;
    this.isPaused = false;

    this.trajectory = [];
    this.trajectoryIndex = 0;

    this.onStepCallback = null;
    this.onPositionUpdateCallback = null;
    this.onTrajectoryCompleteCallback = null;

    this.feedrate = 100;
    this.accelerationProfile = 'trapezoidal';
  }

  setStepsPerUnit(axis, stepsPerUnit) {
    if (axis === 'x' || axis === 'y') {
      this.stepsPerUnit = stepsPerUnit;
    }
  }

  setMaxSpeed(speed) {
    this.maxSpeed = speed;
  }

  setAcceleration(acceleration) {
    this.acceleration = acceleration;
  }

  setFeedrate(feedrate) {
    this.feedrate = feedrate;
  }

  setCurrentPosition(x, y) {
    this.currentPosition = { x, y };
    this.currentStep = {
      x: Math.round(x * this.stepsPerUnit),
      y: Math.round(y * this.stepsPerUnit)
    };
  }

  getCurrentPosition() {
    return { ...this.currentPosition };
  }

  getCurrentSteps() {
    return { ...this.currentStep };
  }

  setOnStep(callback) {
    this.onStepCallback = callback;
  }

  setOnPositionUpdate(callback) {
    this.onPositionUpdateCallback = callback;
  }

  setOnTrajectoryComplete(callback) {
    this.onTrajectoryCompleteCallback = callback;
  }

  unitsToSteps(units) {
    return Math.round(units * this.stepsPerUnit);
  }

  stepsToUnits(steps) {
    return steps / this.stepsPerUnit;
  }

  linearInterpolation(targetX, targetY, feedrate = null) {
    const speed = feedrate || this.feedrate;
    const dx = targetX - this.currentPosition.x;
    const dy = targetY - this.currentPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 0.001) {
      return [];
    }

    const totalSteps = Math.abs(this.unitsToSteps(distance));
    const stepRatio = totalSteps > 0 ? distance / totalSteps : 1;

    const points = [];
    for (let i = 0; i <= totalSteps; i++) {
      const ratio = i / totalSteps;
      points.push({
        x: this.currentPosition.x + dx * ratio,
        y: this.currentPosition.y + dy * ratio,
        feedrate: speed,
        type: 'linear'
      });
    }

    return points;
  }

  circularInterpolation(targetX, targetY, centerX, centerY, direction = 'cw', feedrate = null) {
    const speed = feedrate || this.feedrate;

    const startX = this.currentPosition.x;
    const startY = this.currentPosition.y;

    const radiusStart = Math.sqrt(
      Math.pow(startX - centerX, 2) +
      Math.pow(startY - centerY, 2)
    );
    const radiusEnd = Math.sqrt(
      Math.pow(targetX - centerX, 2) +
      Math.pow(targetY - centerY, 2)
    );
    const radius = (radiusStart + radiusEnd) / 2;

    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const endAngle = Math.atan2(targetY - centerY, targetX - centerX);

    let deltaAngle = endAngle - startAngle;
    if (direction === 'cw') {
      if (deltaAngle > 0) deltaAngle -= 2 * Math.PI;
    } else {
      if (deltaAngle < 0) deltaAngle += 2 * Math.PI;
    }

    const arcLength = Math.abs(deltaAngle * radius);
    const totalSteps = Math.max(1, Math.abs(this.unitsToSteps(arcLength)));

    const points = [];
    for (let i = 0; i <= totalSteps; i++) {
      const ratio = i / totalSteps;
      const angle = startAngle + deltaAngle * ratio;
      points.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        feedrate: speed,
        type: 'circular',
        centerX,
        centerY,
        radius
      });
    }

    return points;
  }

  helicalInterpolation(targetX, targetY, targetZ, centerX, centerY, direction = 'cw', feedrate = null) {
    const speed = feedrate || this.feedrate;
    const startX = this.currentPosition.x;
    const startY = this.currentPosition.y;
    const startZ = this.currentPosition.z || 0;

    const radius = Math.sqrt(
      Math.pow(startX - centerX, 2) +
      Math.pow(startY - centerY, 2)
    );

    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const endAngle = Math.atan2(targetY - centerY, targetX - centerX);

    let deltaAngle = endAngle - startAngle;
    if (direction === 'cw') {
      if (deltaAngle > 0) deltaAngle -= 2 * Math.PI;
    } else {
      if (deltaAngle < 0) deltaAngle += 2 * Math.PI;
    }

    const arcLength = Math.abs(deltaAngle * radius);
    const totalSteps = Math.max(1, Math.abs(this.unitsToSteps(arcLength)));
    const dz = targetZ - startZ;

    const points = [];
    for (let i = 0; i <= totalSteps; i++) {
      const ratio = i / totalSteps;
      const angle = startAngle + deltaAngle * ratio;
      points.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        z: startZ + dz * ratio,
        feedrate: speed,
        type: 'helical'
      });
    }

    return points;
  }

  addLinearMove(x, y, feedrate = null) {
    const points = this.linearInterpolation(x, y, feedrate);
    this.trajectory = this.trajectory.concat(points);
    if (points.length > 0) {
      const last = points[points.length - 1];
      this.currentPosition = { x: last.x, y: last.y };
    }
    return points.length;
  }

  addCircularMove(x, y, centerX, centerY, direction = 'cw', feedrate = null) {
    const points = this.circularInterpolation(x, y, centerX, centerY, direction, feedrate);
    this.trajectory = this.trajectory.concat(points);
    if (points.length > 0) {
      const last = points[points.length - 1];
      this.currentPosition = { x: last.x, y: last.y };
    }
    return points.length;
  }

  addArcByRadius(x, y, radius, direction = 'cw', feedrate = null) {
    const startX = this.currentPosition.x;
    const startY = this.currentPosition.y;
    const dx = x - startX;
    const dy = y - startY;
    const chordLength = Math.sqrt(dx * dx + dy * dy);

    if (chordLength < 0.001 || Math.abs(radius) < chordLength / 2) {
      return this.addLinearMove(x, y, feedrate);
    }

    const h = Math.sqrt(radius * radius - (chordLength / 2) * (chordLength / 2));
    const midX = (startX + x) / 2;
    const midY = (startY + y) / 2;

    const perpX = -dy / chordLength;
    const perpY = dx / chordLength;

    const sign = (direction === 'cw') === (radius > 0) ? 1 : -1;
    const centerX = midX + perpX * h * sign;
    const centerY = midY + perpY * h * sign;

    return this.addCircularMove(x, y, centerX, centerY, direction, feedrate);
  }

  addDwell(seconds) {
    this.trajectory.push({
      type: 'dwell',
      duration: seconds
    });
    return 1;
  }

  clearTrajectory() {
    this.trajectory = [];
    this.trajectoryIndex = 0;
  }

  getTrajectory() {
    return [...this.trajectory];
  }

  getTrajectoryLength() {
    return this.trajectory.length;
  }

  setTrajectory(trajectory) {
    this.trajectory = [...trajectory];
    this.trajectoryIndex = 0;
  }

  async executeTrajectory(stepIntervalMs = 1) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isPaused = false;
    this.trajectoryIndex = 0;

    while (this.trajectoryIndex < this.trajectory.length && this.isRunning) {
      if (this.isPaused) {
        await this.sleep(10);
        continue;
      }

      const point = this.trajectory[this.trajectoryIndex];

      if (point.type === 'dwell') {
        await this.sleep(point.duration * 1000);
        this.trajectoryIndex++;
        continue;
      }

      const targetStepX = Math.round(point.x * this.stepsPerUnit);
      const targetStepY = Math.round(point.y * this.stepsPerUnit);

      while ((this.currentStep.x !== targetStepX || this.currentStep.y !== targetStepY) && this.isRunning) {
        if (this.isPaused) {
          await this.sleep(10);
          continue;
        }

        const dx = targetStepX - this.currentStep.x;
        const dy = targetStepY - this.currentStep.y;

        if (dx !== 0) {
          this.currentStep.x += Math.sign(dx);
        }
        if (dy !== 0) {
          this.currentStep.y += Math.sign(dy);
        }

        this.currentPosition = {
          x: this.stepsToUnits(this.currentStep.x),
          y: this.stepsToUnits(this.currentStep.y)
        };

        if (this.onStepCallback) {
          this.onStepCallback(this.currentStep, this.currentPosition);
        }

        if (this.onPositionUpdateCallback) {
          this.onPositionUpdateCallback(this.currentPosition);
        }

        await this.sleep(stepIntervalMs);
      }

      this.trajectoryIndex++;
    }

    this.isRunning = false;

    if (this.onTrajectoryCompleteCallback) {
      this.onTrajectoryCompleteCallback();
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  stop() {
    this.isRunning = false;
    this.isPaused = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateRectangle(width, height, startX = 0, startY = 0, feedrate = null) {
    this.currentPosition = { x: startX, y: startY };
    this.clearTrajectory();

    this.addLinearMove(startX + width, startY, feedrate);
    this.addLinearMove(startX + width, startY + height, feedrate);
    this.addLinearMove(startX, startY + height, feedrate);
    this.addLinearMove(startX, startY, feedrate);

    return this.getTrajectory();
  }

  generateCircle(radius, centerX = 0, centerY = 0, feedrate = null) {
    this.currentPosition = { x: centerX + radius, y: centerY };
    this.clearTrajectory();

    this.addCircularMove(centerX + radius, centerY, centerX, centerY, 'cw', feedrate);

    return this.getTrajectory();
  }

  generateGCode() {
    const lines = [];
    lines.push('G21');
    lines.push('G90');
    lines.push('G0 X0 Y0');

    let posX = 0, posY = 0;

    for (const point of this.trajectory) {
      if (point.type === 'dwell') {
        lines.push(`G4 P${point.duration.toFixed(3)}`);
      } else if (point.type === 'linear') {
        const gcode = `G1 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} F${point.feedrate}`;
        lines.push(gcode);
        posX = point.x;
        posY = point.y;
      } else if (point.type === 'circular') {
        const i = point.centerX - posX;
        const j = point.centerY - posY;
        const gcode = `G2 X${point.x.toFixed(3)} Y${point.y.toFixed(3)} I${i.toFixed(3)} J${j.toFixed(3)} F${point.feedrate}`;
        lines.push(gcode);
        posX = point.x;
        posY = point.y;
      }
    }

    lines.push('M30');
    return lines.join('\n');
  }

  generateCSV() {
    const lines = [];
    lines.push('Index,X,Y,Z,Feedrate,Type');

    this.trajectory.forEach((point, index) => {
      if (point.type === 'dwell') {
        lines.push(`${index},,,,dwell,${point.duration}`);
      } else {
        const x = point.x.toFixed(4);
        const y = point.y.toFixed(4);
        const z = (point.z || 0).toFixed(4);
        lines.push(`${index},${x},${y},${z},${point.feedrate},${point.type}`);
      }
    });

    return lines.join('\n');
  }

  generateStepSequence() {
    const steps = [];
    let currentX = 0, currentY = 0;

    for (const point of this.trajectory) {
      if (point.type === 'dwell') {
        steps.push({ type: 'dwell', duration: point.duration });
        continue;
      }

      const targetX = Math.round(point.x * this.stepsPerUnit);
      const targetY = Math.round(point.y * this.stepsPerUnit);

      while (currentX !== targetX || currentY !== targetY) {
        const dx = targetX - currentX;
        const dy = targetY - currentY;

        let stepX = 0, stepY = 0;

        if (dx !== 0) {
          stepX = Math.sign(dx);
          currentX += stepX;
        }
        if (dy !== 0) {
          stepY = Math.sign(dy);
          currentY += stepY;
        }

        steps.push({
          type: 'step',
          dx: stepX,
          dy: stepY,
          x: currentX,
          y: currentY
        });
      }
    }

    return steps;
  }

  getBoundingBox() {
    if (this.trajectory.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const point of this.trajectory) {
      if (point.type !== 'dwell') {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }

    return { minX, maxX, minY, maxY };
  }

  getTotalDistance() {
    let distance = 0;
    let prevPoint = null;

    for (const point of this.trajectory) {
      if (point.type === 'dwell') continue;
      if (prevPoint && prevPoint.type !== 'dwell') {
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        distance += Math.sqrt(dx * dx + dy * dy);
      }
      prevPoint = point;
    }

    return distance;
  }
}

window.MotionInterpolator = MotionInterpolator;
