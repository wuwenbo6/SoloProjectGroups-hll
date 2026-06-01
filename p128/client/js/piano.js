class PianoKeyboard {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }

        this.startNote = options.startNote || 21;
        this.endNote = options.endNote || 108;
        this.whiteKeyWidth = options.whiteKeyWidth || 40;
        this.blackKeyWidth = options.blackKeyWidth || 25;
        this.onKeyPress = options.onKeyPress || null;
        this.onKeyRelease = options.onKeyRelease || null;

        this.activeKeys = new Set();
        this.keyElements = new Map();

        this.init();
    }

    init() {
        this.render();
        this.attachEventListeners();
    }

    render() {
        this.container.innerHTML = '';
        
        let whiteKeyIndex = 0;
        const blackKeyOffsets = [1, 3, 6, 8, 10];

        for (let note = this.startNote; note <= this.endNote; note++) {
            const isBlack = MidiManager.isBlackKey(note);
            const noteName = MidiManager.noteToName(note);

            const keyElement = document.createElement('div');
            keyElement.dataset.note = note;
            keyElement.dataset.noteName = noteName;
            keyElement.className = `piano-key ${isBlack ? 'black-key' : 'white-key'}`;

            if (!isBlack) {
                keyElement.style.position = 'relative';
                keyElement.dataset.whiteIndex = whiteKeyIndex;
                whiteKeyIndex++;
            } else {
                const octaveStart = Math.floor(note / 12) * 12;
                const noteInOctave = note - octaveStart;
                const prevWhiteNote = note - 1;
                let prevWhiteIndex = 0;
                for (let n = this.startNote; n < prevWhiteNote; n++) {
                    if (!MidiManager.isBlackKey(n)) {
                        prevWhiteIndex++;
                    }
                }
                
                const leftPosition = prevWhiteIndex * this.whiteKeyWidth + this.whiteKeyWidth;
                keyElement.style.left = `${leftPosition - this.blackKeyWidth / 2}px`;
            }

            const label = document.createElement('span');
            label.className = 'key-label';
            label.textContent = noteName;
            keyElement.appendChild(label);

            this.container.appendChild(keyElement);
            this.keyElements.set(note, keyElement);
        }

        const totalWhiteKeys = Array.from({ length: this.endNote - this.startNote + 1 }, 
            (_, i) => this.startNote + i)
            .filter(n => !MidiManager.isBlackKey(n))
            .length;
        this.container.style.width = `${totalWhiteKeys * this.whiteKeyWidth}px`;
    }

    attachEventListeners() {
        this.container.addEventListener('mousedown', (e) => {
            const keyElement = e.target.closest('.piano-key');
            if (keyElement) {
                const note = parseInt(keyElement.dataset.note, 10);
                this.pressKey(note, 100);
                this.onKeyPress && this.onKeyPress(note, 100);
            }
        });

        this.container.addEventListener('mouseup', (e) => {
            const keyElement = e.target.closest('.piano-key');
            if (keyElement) {
                const note = parseInt(keyElement.dataset.note, 10);
                this.releaseKey(note);
                this.onKeyRelease && this.onKeyRelease(note);
            }
        });

        this.container.addEventListener('mouseleave', () => {
            this.activeKeys.forEach(note => {
                this.releaseKey(note);
                this.onKeyRelease && this.onKeyRelease(note);
            });
        });

        let isMouseDown = false;
        document.addEventListener('mousedown', () => { isMouseDown = true; });
        document.addEventListener('mouseup', () => { isMouseDown = false; });

        this.container.addEventListener('mouseover', (e) => {
            if (isMouseDown) {
                const keyElement = e.target.closest('.piano-key');
                if (keyElement) {
                    const note = parseInt(keyElement.dataset.note, 10);
                    if (!this.activeKeys.has(note)) {
                        this.pressKey(note, 100);
                        this.onKeyPress && this.onKeyPress(note, 100);
                    }
                }
            }
        });

        this.container.addEventListener('mouseout', (e) => {
            if (isMouseDown) {
                const keyElement = e.target.closest('.piano-key');
                if (keyElement) {
                    const note = parseInt(keyElement.dataset.note, 10);
                    this.releaseKey(note);
                    this.onKeyRelease && this.onKeyRelease(note);
                }
            }
        });
    }

    pressKey(note, velocity = 100) {
        const keyElement = this.keyElements.get(note);
        if (keyElement && !this.activeKeys.has(note)) {
            this.activeKeys.add(note);
            keyElement.classList.add('active');
        }
    }

    releaseKey(note) {
        const keyElement = this.keyElements.get(note);
        if (keyElement) {
            this.activeKeys.delete(note);
            keyElement.classList.remove('active');
        }
    }

    highlightCorrect(note) {
        const keyElement = this.keyElements.get(note);
        if (keyElement) {
            keyElement.classList.add('correct');
            setTimeout(() => {
                keyElement.classList.remove('correct');
            }, 500);
        }
    }

    highlightWrong(note) {
        const keyElement = this.keyElements.get(note);
        if (keyElement) {
            keyElement.classList.add('wrong');
            setTimeout(() => {
                keyElement.classList.remove('wrong');
            }, 500);
        }
    }

    highlightExpected(note) {
        this.clearAllHighlights();
        const keyElement = this.keyElements.get(note);
        if (keyElement) {
            keyElement.style.boxShadow = '0 0 15px 5px rgba(254, 202, 87, 0.6)';
            keyElement.style.transform = 'translateY(2px)';
        }
    }

    clearAllHighlights() {
        this.keyElements.forEach((element) => {
            element.style.boxShadow = '';
            element.style.transform = '';
            element.classList.remove('correct', 'wrong');
        });
    }

    clearAllActive() {
        this.activeKeys.forEach(note => {
            this.releaseKey(note);
        });
    }

    scrollToNote(note) {
        const keyElement = this.keyElements.get(note);
        if (keyElement) {
            const containerRect = this.container.parentElement.getBoundingClientRect();
            const keyRect = keyElement.getBoundingClientRect();
            
            const scrollLeft = keyElement.offsetLeft - containerRect.width / 2 + this.whiteKeyWidth / 2;
            this.container.parentElement.scrollTo({
                left: Math.max(0, scrollLeft),
                behavior: 'smooth'
            });
        }
    }

    getKeyElement(note) {
        return this.keyElements.get(note);
    }
}
