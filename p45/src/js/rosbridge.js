export class ROSBridge {
    constructor(url = 'ws://localhost:9090') {
        this.url = url;
        this.socket = null;
        this.connected = false;
        this.listeners = {};
        this.topics = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }
    
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
    
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
    
    connect() {
        try {
            this.socket = new WebSocket(this.url);
            
            this.socket.onopen = () => {
                console.log('ROS Bridge connected');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
            };
            
            this.socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (err) {
                    console.error('Failed to parse ROS message:', err);
                }
            };
            
            this.socket.onclose = () => {
                console.log('ROS Bridge disconnected');
                this.connected = false;
                this.emit('disconnected');
                this.attemptReconnect();
            };
            
            this.socket.onerror = (error) => {
                console.error('ROS Bridge error:', error);
                this.emit('error', error);
            };
            
        } catch (err) {
            console.error('Failed to connect to ROS Bridge:', err);
            this.attemptReconnect();
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), 3000);
        }
    }
    
    handleMessage(message) {
        if (message.op === 'publish') {
            if (message.topic && this.topics[message.topic]) {
                this.topics[message.topic].callbacks.forEach(cb => cb(message.msg));
            }
            
            if (message.topic === '/cmd_vel') {
                this.emit('cmd_vel', message.msg);
            }
        }
    }
    
    advertise(topic, type) {
        if (!this.connected) return;
        
        this.socket.send(JSON.stringify({
            op: 'advertise',
            topic: topic,
            type: type
        }));
        
        if (!this.topics[topic]) {
            this.topics[topic] = { type, callbacks: [] };
        }
    }
    
    publish(topic, message) {
        if (!this.connected) return;
        
        if (!this.topics[topic]) {
            console.warn(`Topic ${topic} not advertised`);
            return;
        }
        
        this.socket.send(JSON.stringify({
            op: 'publish',
            topic: topic,
            msg: message
        }));
    }
    
    subscribe(topic, callback) {
        if (!this.connected) return;
        
        if (!this.topics[topic]) {
            this.topics[topic] = { callbacks: [] };
        }
        
        this.topics[topic].callbacks.push(callback);
        
        this.socket.send(JSON.stringify({
            op: 'subscribe',
            topic: topic
        }));
    }
    
    unsubscribe(topic) {
        if (!this.connected) return;
        
        this.socket.send(JSON.stringify({
            op: 'unsubscribe',
            topic: topic
        }));
        
        if (this.topics[topic]) {
            this.topics[topic].callbacks = [];
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.close();
        }
    }
    
    callService(service, args = {}) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('Not connected to ROS'));
                return;
            }
            
            const id = `service_${Date.now()}`;
            
            const handleResponse = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.id === id && message.op === 'service_response') {
                        this.socket.removeEventListener('message', handleResponse);
                        if (message.result) {
                            resolve(message.values);
                        } else {
                            reject(new Error('Service call failed'));
                        }
                    }
                } catch (err) {
                    reject(err);
                }
            };
            
            this.socket.addEventListener('message', handleResponse);
            
            this.socket.send(JSON.stringify({
                op: 'call_service',
                id: id,
                service: service,
                args: args
            }));
            
            setTimeout(() => {
                this.socket.removeEventListener('message', handleResponse);
                reject(new Error('Service call timeout'));
            }, 5000);
        });
    }
}
