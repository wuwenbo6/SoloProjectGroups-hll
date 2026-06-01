class MidiManager {
    constructor() {
        this.midiAccess = null;
        this.inputs = [];
        this.outputs = [];
        this.currentInput = null;
        this.onNoteOn = null;
        this.onNoteOff = null;
        this.onControlChange = null;
        this.isConnected = false;
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            console.error('Web MIDI API is not supported in this browser.');
            return false;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            this.isConnected = true;
            this.refreshDevices();
            
            this.midiAccess.onstatechange = (event) => {
                console.log('MIDI state changed:', event.port.name, event.port.state);
                this.refreshDevices();
                this.onDeviceStateChange && this.onDeviceStateChange(event);
            };

            return true;
        } catch (error) {
            console.error('Error accessing MIDI devices:', error);
            return false;
        }
    }

    refreshDevices() {
        this.inputs = [];
        this.outputs = [];

        if (!this.midiAccess) return;

        this.midiAccess.inputs.forEach((input) => {
            this.inputs.push({ id: input.id, name: input.name, manufacturer: input.manufacturer });
        });

        this.midiAccess.outputs.forEach((output) => {
            this.outputs.push({ id: output.id, name: output.name, manufacturer: output.manufacturer });
        });

        this.onDevicesUpdated && this.onDevicesUpdated(this.inputs, this.outputs);
    }

    selectInput(deviceId) {
        if (this.currentInput) {
            this.currentInput.onmidimessage = null;
        }

        const input = this.midiAccess.inputs.get(deviceId);
        if (input) {
            this.currentInput = input;
            input.onmidimessage = this.handleMidiMessage.bind(this);
            console.log('Selected MIDI input:', input.name);
            return true;
        }
        return false;
    }

    handleMidiMessage(event) {
        const [status, data1, data2] = event.data;
        const messageType = status & 0xF0;
        const channel = (status & 0x0F) + 1;

        switch (messageType) {
            case 0x90:
                if (data2 > 0) {
                    this.onNoteOn && this.onNoteOn({
                        note: data1,
                        velocity: data2,
                        channel: channel,
                        timestamp: event.timeStamp
                    });
                } else {
                    this.onNoteOff && this.onNoteOff({
                        note: data1,
                        channel: channel,
                        timestamp: event.timeStamp
                    });
                }
                break;

            case 0x80:
                this.onNoteOff && this.onNoteOff({
                    note: data1,
                    velocity: data2,
                    channel: channel,
                    timestamp: event.timeStamp
                });
                break;

            case 0xB0:
                this.onControlChange && this.onControlChange({
                    controller: data1,
                    value: data2,
                    channel: channel,
                    timestamp: event.timeStamp
                });
                break;
        }
    }

    getInputs() {
        return this.inputs;
    }

    getOutputs() {
        return this.outputs;
    }

    static noteToName(noteNumber) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(noteNumber / 12) - 1;
        const noteIndex = noteNumber % 12;
        return noteNames[noteIndex] + octave;
    }

    static nameToNote(noteName) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
        if (!match) return null;
        
        const noteIndex = noteNames.indexOf(match[1]);
        const octave = parseInt(match[2], 10);
        
        if (noteIndex === -1) return null;
        return (octave + 1) * 12 + noteIndex;
    }

    static isBlackKey(noteNumber) {
        const noteIndex = noteNumber % 12;
        return [1, 3, 6, 8, 10].includes(noteIndex);
    }

    static getKeyColor(noteNumber) {
        return MidiManager.isBlackKey(noteNumber) ? 'black' : 'white';
    }
}
