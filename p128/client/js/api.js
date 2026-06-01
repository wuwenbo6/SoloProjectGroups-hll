const API_BASE_URL = 'http://localhost:3000/api';

const PianoAPI = {
    async analyzePerformance(performanceData) {
        try {
            const response = await fetch(`${API_BASE_URL}/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(performanceData),
            });
            return await response.json();
        } catch (error) {
            console.error('Error analyzing performance:', error);
            throw error;
        }
    },

    async getFingerSuggestions(note, context) {
        try {
            const response = await fetch(`${API_BASE_URL}/finger-suggestions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ note, context }),
            });
            return await response.json();
        } catch (error) {
            console.error('Error getting finger suggestions:', error);
            throw error;
        }
    },

    async savePracticeRecord(record) {
        try {
            const response = await fetch(`${API_BASE_URL}/practice-records`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(record),
            });
            return await response.json();
        } catch (error) {
            console.error('Error saving practice record:', error);
            throw error;
        }
    },

    async getPracticeHistory() {
        try {
            const response = await fetch(`${API_BASE_URL}/practice-records`);
            return await response.json();
        } catch (error) {
            console.error('Error getting practice history:', error);
            throw error;
        }
    },

    async getSheetMusic() {
        try {
            const response = await fetch(`${API_BASE_URL}/sheet-music`);
            return await response.json();
        } catch (error) {
            console.error('Error getting sheet music:', error);
            throw error;
        }
    },

    async getSheetMusicById(id) {
        try {
            const response = await fetch(`${API_BASE_URL}/sheet-music/${id}`);
            return await response.json();
        } catch (error) {
            console.error('Error getting sheet music by id:', error);
            throw error;
        }
    },
};
