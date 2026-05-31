let animationState = {
    isPlaying: false,
    isPaused: false,
    currentPart: 0,
    animationFrame: null,
    speed: 5,
    progress: 0
};

function initAnimation() {
    document.getElementById('btn-play').addEventListener('click', playAnimation);
    document.getElementById('btn-pause').addEventListener('click', pauseAnimation);
    document.getElementById('btn-reset').addEventListener('click', resetAnimation);
    document.getElementById('animation-speed').addEventListener('input', (e) => {
        animationState.speed = parseInt(e.target.value);
    });
}

function playAnimation() {
    const result = getCurrentResult();
    if (!result) {
        alert('请先运行排样');
        return;
    }
    
    if (animationState.isPaused) {
        animationState.isPaused = false;
        animationState.isPlaying = true;
        animate();
        return;
    }
    
    if (animationState.isPlaying) return;
    
    resetAnimationState();
    animationState.isPlaying = true;
    animate();
}

function pauseAnimation() {
    animationState.isPaused = true;
    animationState.isPlaying = false;
    if (animationState.animationFrame) {
        cancelAnimationFrame(animationState.animationFrame);
    }
}

function resetAnimation() {
    animationState.isPlaying = false;
    animationState.isPaused = false;
    animationState.currentPart = 0;
    animationState.progress = 0;
    
    if (animationState.animationFrame) {
        cancelAnimationFrame(animationState.animationFrame);
    }
    
    resetAnimationVisuals();
    updateAnimationProgress();
}

function resetAnimationState() {
    animationState.currentPart = 0;
    animationState.progress = 0;
    resetAnimationVisuals();
}

function resetAnimationVisuals() {
    const paths = document.querySelectorAll('#animation-parts path');
    paths.forEach(path => {
        path.style.strokeDashoffset = '1000';
        path.style.fillOpacity = '0.2';
    });
    
    const head = document.getElementById('cutting-head');
    if (head) {
        head.style.display = 'none';
    }
}

function animate() {
    if (!animationState.isPlaying || animationState.isPaused) return;
    
    const result = getCurrentResult();
    if (!result) return;
    
    const tsp = result.tsp;
    const placements = tsp.placements;
    
    placements.sort((a, b) => a.cutting_order - b.cutting_order);
    
    if (animationState.currentPart >= placements.length) {
        animationState.isPlaying = false;
        return;
    }
    
    const paths = document.querySelectorAll('#animation-parts path');
    const currentPathElement = paths[animationState.currentPart];
    
    if (!currentPathElement) {
        animationState.currentPart++;
        animationState.progress = 0;
        animationState.animationFrame = requestAnimationFrame(animate);
        return;
    }
    
    const pathLength = currentPathElement.getTotalLength();
    animationState.progress += animationState.speed * 2;
    
    const progress = Math.min(animationState.progress / pathLength, 1);
    const dashOffset = pathLength * (1 - progress);
    
    currentPathElement.style.strokeDashoffset = dashOffset;
    currentPathElement.style.fillOpacity = 0.2 + progress * 0.4;
    
    const point = currentPathElement.getPointAtLength(animationState.progress);
    const head = document.getElementById('cutting-head');
    if (head) {
        head.style.display = 'block';
        head.setAttribute('cx', point.x);
        head.setAttribute('cy', point.y);
    }
    
    updateAnimationProgress();
    
    if (animationState.progress >= pathLength) {
        animationState.currentPart++;
        animationState.progress = 0;
    }
    
    animationState.animationFrame = requestAnimationFrame(animate);
}

function updateAnimationProgress() {
    const result = getCurrentResult();
    if (!result) {
        document.getElementById('animation-progress').textContent = '进度: 0/0';
        return;
    }
    
    const total = result.tsp.placements.length;
    document.getElementById('animation-progress').textContent = 
        `进度: ${animationState.currentPart + 1}/${total}`;
}
