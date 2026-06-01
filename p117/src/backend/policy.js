const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class PolicyManager extends EventEmitter {
    constructor(dataDir) {
        super();
        this.dataDir = dataDir;
        this.policyFile = path.join(dataDir, 'policies.json');
        this.settingsFile = path.join(dataDir, 'settings.json');
        this.policies = this.loadPolicies();
        this.settings = this.loadSettings();
    }

    loadPolicies() {
        const defaultPolicies = {
            mode: 'whitelist',
            whitelist: [],
            blacklist: [],
            devicePolicies: {}
        };

        if (fs.existsSync(this.policyFile)) {
            try {
                const data = fs.readFileSync(this.policyFile, 'utf8');
                return { ...defaultPolicies, ...JSON.parse(data) };
            } catch (error) {
                console.error('Failed to load policies:', error);
                return defaultPolicies;
            }
        }

        this.savePolicies(defaultPolicies);
        return defaultPolicies;
    }

    savePolicies(policies) {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            fs.writeFileSync(this.policyFile, JSON.stringify(policies, null, 2), 'utf8');
            this.policies = policies;
            this.emit('policies-updated', policies);
            return true;
        } catch (error) {
            console.error('Failed to save policies:', error);
            return false;
        }
    }

    getPolicies() {
        return { ...this.policies };
    }

    updatePolicies(policies) {
        return this.savePolicies(policies);
    }

    loadSettings() {
        const defaultSettings = {
            autoBlockUnknown: true,
            logFileOperations: true,
            showNotifications: true,
            monitorInterval: 2000,
            blockMode: 'unmount'
        };

        if (fs.existsSync(this.settingsFile)) {
            try {
                const data = fs.readFileSync(this.settingsFile, 'utf8');
                return { ...defaultSettings, ...JSON.parse(data) };
            } catch (error) {
                console.error('Failed to load settings:', error);
                return defaultSettings;
            }
        }

        this.saveSettings(defaultSettings);
        return defaultSettings;
    }

    saveSettings(settings) {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf8');
            this.settings = settings;
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            return false;
        }
    }

    getSettings() {
        return { ...this.settings };
    }

    updateSettings(settings) {
        return this.saveSettings(settings);
    }

    getDevicePolicy(deviceId, vendorId) {
        if (this.policies.devicePolicies && this.policies.devicePolicies[deviceId]) {
            return this.policies.devicePolicies[deviceId];
        }

        if (this.policies.blacklist.some(item =>
            item.id === deviceId || item.vendorId === vendorId
        )) {
            return {
                action: 'block',
                reason: '设备在黑名单中'
            };
        }

        if (this.policies.whitelist.some(item =>
            item.id === deviceId || item.vendorId === vendorId
        )) {
            return {
                action: 'allow',
                reason: '设备在白名单中'
            };
        }

        if (this.policies.mode === 'whitelist') {
            if (this.settings.autoBlockUnknown) {
                return {
                    action: 'block',
                    reason: '白名单模式，未知设备自动阻止'
                };
            }
            return {
                action: 'monitor',
                reason: '白名单模式，未知设备仅监控'
            };
        }

        return {
            action: 'monitor',
            reason: '黑名单模式，设备未在黑名单中'
        };
    }

    addToWhitelist(item) {
        const exists = this.policies.whitelist.some(i => i.id === item.id);
        if (exists) {
            return { success: false, message: '设备已在白名单中' };
        }

        this.policies.whitelist.push({
            ...item,
            addedAt: new Date().toISOString()
        });

        this.policies.blacklist = this.policies.blacklist.filter(i => i.id !== item.id);

        if (this.policies.devicePolicies && this.policies.devicePolicies[item.id]) {
            delete this.policies.devicePolicies[item.id];
        }

        this.savePolicies(this.policies);
        return { success: true, message: '已添加到白名单' };
    }

    addToBlacklist(item) {
        const exists = this.policies.blacklist.some(i => i.id === item.id);
        if (exists) {
            return { success: false, message: '设备已在黑名单中' };
        }

        this.policies.blacklist.push({
            ...item,
            addedAt: new Date().toISOString()
        });

        this.policies.whitelist = this.policies.whitelist.filter(i => i.id !== item.id);

        if (this.policies.devicePolicies && this.policies.devicePolicies[item.id]) {
            delete this.policies.devicePolicies[item.id];
        }

        this.savePolicies(this.policies);
        return { success: true, message: '已添加到黑名单' };
    }

    removeFromWhitelist(itemId) {
        const before = this.policies.whitelist.length;
        this.policies.whitelist = this.policies.whitelist.filter(i => i.id !== itemId);
        
        if (before === this.policies.whitelist.length) {
            return { success: false, message: '设备不在白名单中' };
        }

        this.savePolicies(this.policies);
        return { success: true, message: '已从白名单移除' };
    }

    removeFromBlacklist(itemId) {
        const before = this.policies.blacklist.length;
        this.policies.blacklist = this.policies.blacklist.filter(i => i.id !== itemId);

        if (before === this.policies.blacklist.length) {
            return { success: false, message: '设备不在黑名单中' };
        }

        this.savePolicies(this.policies);
        return { success: true, message: '已从黑名单移除' };
    }
}

module.exports = { PolicyManager };
