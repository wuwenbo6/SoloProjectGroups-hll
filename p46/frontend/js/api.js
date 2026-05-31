const API_BASE = '/api';

async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

const WatershedAPI = {
    getAll: () => apiRequest(`${API_BASE}/watershed/`),
    get: (id) => apiRequest(`${API_BASE}/watershed/${id}`),
    create: (data) => apiRequest(`${API_BASE}/watershed/`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    update: (id, data) => apiRequest(`${API_BASE}/watershed/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    delete: (id) => apiRequest(`${API_BASE}/watershed/${id}`, {
        method: 'DELETE'
    }),
    getSubbasins: (id) => apiRequest(`${API_BASE}/watershed/${id}/subbasins`),
    getParameters: (projectPath) => apiRequest(`${API_BASE}/watershed/parameters?project_path=${encodeURIComponent(projectPath || '')}`)
};

const SimulationAPI = {
    getAll: (watershedId) => apiRequest(`${API_BASE}/simulation/?watershed_id=${watershedId || ''}`),
    get: (id) => apiRequest(`${API_BASE}/simulation/${id}`),
    create: (data) => apiRequest(`${API_BASE}/simulation/`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    delete: (id) => apiRequest(`${API_BASE}/simulation/${id}`, {
        method: 'DELETE'
    }),
    run: (id) => apiRequest(`${API_BASE}/simulation/${id}/run`, {
        method: 'POST'
    }),
    getStatus: (id) => apiRequest(`${API_BASE}/simulation/${id}/status`),
    getParameters: (id) => apiRequest(`${API_BASE}/simulation/${id}/parameters`)
};

const ResultsAPI = {
    getSimulationResults: (simulationId, params = {}) => {
        const queryString = new URLSearchParams(params).toString();
        return apiRequest(`${API_BASE}/results/simulation/${simulationId}?${queryString}`);
    },
    getSummary: (simulationId) => apiRequest(`${API_BASE}/results/simulation/${simulationId}/summary`),
    getTimeseries: (simulationId, variable, subbasin) => 
        apiRequest(`${API_BASE}/results/simulation/${simulationId}/timeseries?variable=${variable}&subbasin=${subbasin || ''}`),
    getStatistics: (simulationId) => apiRequest(`${API_BASE}/results/simulation/${simulationId}/statistics`)
};

const CalibrationAPI = {
    getAll: (watershedId) => apiRequest(`${API_BASE}/calibration/?watershed_id=${watershedId || ''}`),
    get: (id) => apiRequest(`${API_BASE}/calibration/${id}`),
    create: (data) => apiRequest(`${API_BASE}/calibration/`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    run: (id) => apiRequest(`${API_BASE}/calibration/${id}/run`, {
        method: 'POST'
    }),
    getStatus: (id) => apiRequest(`${API_BASE}/calibration/${id}/status`),
    getResults: (id) => apiRequest(`${API_BASE}/calibration/${id}/results`),
    getBest: (id) => apiRequest(`${API_BASE}/calibration/${id}/best`),
    delete: (id) => apiRequest(`${API_BASE}/calibration/${id}`, {
        method: 'DELETE'
    }),
    getAlgorithms: () => apiRequest(`${API_BASE}/calibration/algorithms`),
    getObjectiveFunctions: () => apiRequest(`${API_BASE}/calibration/objective-functions`)
};
