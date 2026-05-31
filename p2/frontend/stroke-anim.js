const STROKE_DATA = {
    '己': [
        {type: 'horizontal', points: [[20, 30], [80, 30]]},
        {type: 'vertical', points: [[80, 30], [80, 70]]},
        {type: 'diagonal', points: [[20, 50], [50, 80]]}
    ],
    '已': [
        {type: 'horizontal', points: [[20, 30], [80, 30]]},
        {type: 'vertical', points: [[80, 30], [80, 70]]},
        {type: 'diagonal', points: [[20, 50], [50, 80]]},
        {type: 'dot', points: [[45, 55], [50, 50]]}
    ],
    '巳': [
        {type: 'horizontal', points: [[20, 30], [80, 30]]},
        {type: 'vertical', points: [[80, 30], [80, 70]]},
        {type: 'diagonal', points: [[20, 50], [50, 80]]},
        {type: 'horizontal', points: [[40, 55], [70, 55]]}
    ],
    '日': [
        {type: 'vertical', points: [[25, 20], [25, 80]]},
        {type: 'horizontal', points: [[25, 20], [75, 20]]},
        {type: 'horizontal', points: [[25, 50], [75, 50]]},
        {type: 'vertical', points: [[75, 20], [75, 80]]},
        {type: 'horizontal', points: [[25, 80], [75, 80]]}
    ],
    '曰': [
        {type: 'vertical', points: [[20, 20], [20, 80]]},
        {type: 'horizontal', points: [[20, 20], [80, 20]]},
        {type: 'horizontal', points: [[30, 45], [70, 45]]},
        {type: 'vertical', points: [[80, 20], [80, 80]]},
        {type: 'horizontal', points: [[20, 80], [80, 80]]}
    ],
    '人': [
        {type: 'diagonal-left', points: [[50, 20], [20, 80]]},
        {type: 'diagonal-right', points: [[50, 20], [80, 80]]}
    ],
    '入': [
        {type: 'diagonal-left', points: [[30, 30], [15, 80]]},
        {type: 'diagonal-right', points: [[70, 30], [85, 80]]}
    ],
    '土': [
        {type: 'horizontal', points: [[20, 30], [80, 30]]},
        {type: 'vertical', points: [[50, 30], [50, 80]]},
        {type: 'horizontal', points: [[15, 80], [85, 80]]}
    ],
    '士': [
        {type: 'horizontal', points: [[30, 25], [70, 25]]},
        {type: 'vertical', points: [[50, 25], [50, 75]]},
        {type: 'horizontal', points: [[15, 75], [85, 75]]}
    ],
    '学': [
        {type: 'dot', points: [[25, 15], [30, 20]]},
        {type: 'dot', points: [[45, 12], [50, 17]]},
        {type: 'dot', points: [[65, 15], [70, 20]]},
        {type: 'horizontal', points: [[20, 30], [80, 30]]},
        {type: 'diagonal-left', points: [[30, 40], [20, 60]]},
        {type: 'diagonal-right', points: [[70, 40], [80, 60]]},
        {type: 'horizontal', points: [[40, 60], [60, 60]]},
        {type: 'horizontal', points: [[15, 70], [85, 70]]},
        {type: 'vertical', points: [[50, 70], [50, 90]]}
    ],
    '而': [
        {type: 'horizontal', points: [[15, 20], [85, 20]]},
        {type: 'vertical', points: [[25, 20], [25, 80]]},
        {type: 'vertical', points: [[40, 20], [40, 80]]},
        {type: 'vertical', points: [[60, 20], [60, 80]]},
        {type: 'vertical', points: [[75, 20], [75, 80]]},
        {type: 'horizontal', points: [[15, 80], [85, 80]]}
    ],
    '时': [
        {type: 'vertical', points: [[20, 15], [20, 85]]},
        {type: 'horizontal', points: [[20, 15], [45, 15]]},
        {type: 'horizontal', points: [[20, 50], [45, 50]]},
        {type: 'horizontal', points: [[20, 85], [45, 85]]},
        {type: 'dot', points: [[55, 25], [60, 30]]},
        {type: 'horizontal', points: [[50, 40], [85, 40]]},
        {type: 'diagonal', points: [[65, 40], [70, 80]]}
    ],
    '习': [
        {type: 'diagonal', points: [[20, 20], [50, 80]]},
        {type: 'dot', points: [[35, 35], [40, 40]]},
        {type: 'horizontal', points: [[40, 50], [70, 50]]}
    ],
    '之': [
        {type: 'dot', points: [[45, 20], [50, 25]]},
        {type: 'diagonal', points: [[30, 40], [20, 70]]},
        {type: 'horizontal-diagonal', points: [[20, 70], [80, 80]]}
    ],
    '不': [
        {type: 'horizontal', points: [[20, 25], [80, 25]]},
        {type: 'diagonal-left', points: [[50, 25], [25, 80]]},
        {type: 'vertical', points: [[50, 25], [50, 60]]},
        {type: 'diagonal-right', points: [[50, 45], [75, 80]]}
    ],
    '亦': [
        {type: 'horizontal', points: [[25, 20], [75, 20]]},
        {type: 'vertical', points: [[35, 20], [35, 50]]},
        {type: 'diagonal', points: [[35, 50], [20, 80]]},
        {type: 'vertical', points: [[65, 20], [65, 50]]},
        {type: 'diagonal', points: [[65, 50], [80, 80]]},
        {type: 'horizontal', points: [[35, 55], [65, 55]]}
    ],
    '说': [
        {type: 'dot', points: [[15, 25], [20, 30]]},
        {type: 'horizontal', points: [[10, 40], [35, 40]]},
        {type: 'vertical', points: [[22, 40], [22, 80]]},
        {type: 'horizontal', points: [[10, 80], [35, 80]]},
        {type: 'diagonal', points: [[45, 20], [50, 80]]},
        {type: 'horizontal', points: [[55, 35], [85, 35]]},
        {type: 'diagonal', points: [[70, 35], [75, 60]]},
        {type: 'horizontal', points: [[55, 65], [85, 65]]}
    ],
    '悦': [
        {type: 'dot', points: [[15, 25], [20, 30]]},
        {type: 'dot', points: [[15, 45], [20, 50]]},
        {type: 'vertical', points: [[15, 25], [15, 75]]},
        {type: 'diagonal', points: [[35, 20], [40, 80]]},
        {type: 'horizontal', points: [[45, 35], [85, 35]]},
        {type: 'diagonal', points: [[60, 35], [65, 60]]},
        {type: 'horizontal', points: [[45, 65], [85, 65]]}
    ],
    '乐': [
        {type: 'diagonal-left', points: [[30, 15], [15, 40]]},
        {type: 'diagonal-right', points: [[50, 15], [65, 40]]},
        {type: 'horizontal', points: [[10, 45], [70, 45]]},
        {type: 'diagonal', points: [[40, 45], [35, 75]]},
        {type: 'horizontal', points: [[25, 55], [55, 55]]},
        {type: 'dot', points: [[15, 70], [20, 75]]},
        {type: 'dot', points: [[60, 70], [65, 75]]},
        {type: 'diagonal', points: [[40, 75], [50, 85]]}
    ],
    '乎': [
        {type: 'diagonal-left', points: [[50, 15], [20, 50]]},
        {type: 'diagonal-right', points: [[50, 15], [80, 50]]},
        {type: 'horizontal', points: [[15, 45], [85, 45]]},
        {type: 'vertical-hook', points: [[50, 45], [50, 85]]}
    ]
};

class StrokeAnimation {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.currentStroke = 0;
        this.animationId = null;
        this.isPlaying = false;
        this.speed = 30;
        this.currentChar = null;
        this.strokes = [];
    }

    loadCharacter(char) {
        this.currentChar = char;
        this.strokes = STROKE_DATA[char] || [];
        this.currentStroke = 0;
        this.clear();
        this.drawGrid();
        this.updateStrokeInfo();
    }

    drawGrid() {
        this.ctx.strokeStyle = '#e0d5c7';
        this.ctx.lineWidth = 1;
        
        this.ctx.beginPath();
        this.ctx.moveTo(50, 0);
        this.ctx.lineTo(50, 100);
        this.ctx.moveTo(0, 50);
        this.ctx.lineTo(100, 50);
        this.ctx.stroke();
        
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(100, 100);
        this.ctx.moveTo(100, 0);
        this.ctx.lineTo(0, 100);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    clear() {
        this.ctx.clearRect(0, 0, 100, 100);
    }

    updateStrokeInfo() {
        const info = document.getElementById('stroke-info');
        if (info) {
            info.textContent = `笔画: ${this.currentStroke}/${this.strokes.length}`;
        }
    }

    drawStroke(strokeIndex, progress = 1) {
        if (strokeIndex >= this.strokes.length) return;
        
        const stroke = this.strokes[strokeIndex];
        const points = stroke.points;
        
        this.ctx.strokeStyle = '#8B4513';
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        this.ctx.moveTo(points[0][0], points[0][1]);
        
        if (points.length === 2) {
            const endX = points[0][0] + (points[1][0] - points[0][0]) * progress;
            const endY = points[0][1] + (points[1][1] - points[0][1]) * progress;
            this.ctx.lineTo(endX, endY);
        }
        
        this.ctx.stroke();
    }

    drawCompletedStrokes() {
        for (let i = 0; i < this.currentStroke; i++) {
            this.drawStroke(i, 1);
        }
    }

    play() {
        if (this.isPlaying || this.strokes.length === 0) return;
        
        this.isPlaying = true;
        this.currentStroke = 0;
        this.clear();
        this.drawGrid();
        this.animateStroke();
    }

    animateStroke() {
        if (this.currentStroke >= this.strokes.length) {
            this.isPlaying = false;
            return;
        }

        let progress = 0;
        const animate = () => {
            progress += 0.05;
            
            if (progress <= 1) {
                this.clear();
                this.drawGrid();
                this.drawCompletedStrokes();
                this.drawStroke(this.currentStroke, progress);
                this.animationId = setTimeout(animate, this.speed);
            } else {
                this.currentStroke++;
                this.updateStrokeInfo();
                this.animateStroke();
            }
        };
        
        animate();
    }

    pause() {
        this.isPlaying = false;
        if (this.animationId) {
            clearTimeout(this.animationId);
        }
    }

    reset() {
        this.pause();
        this.currentStroke = 0;
        this.clear();
        this.drawGrid();
        this.updateStrokeInfo();
    }

    nextStroke() {
        if (this.currentStroke < this.strokes.length) {
            this.currentStroke++;
            this.clear();
            this.drawGrid();
            this.drawCompletedStrokes();
            this.updateStrokeInfo();
        }
    }

    prevStroke() {
        if (this.currentStroke > 0) {
            this.currentStroke--;
            this.clear();
            this.drawGrid();
            this.drawCompletedStrokes();
            this.updateStrokeInfo();
        }
    }

    setSpeed(speed) {
        this.speed = Math.max(10, Math.min(100, speed));
    }

    hasCharacter(char) {
        return char in STROKE_DATA;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StrokeAnimation, STROKE_DATA };
}
