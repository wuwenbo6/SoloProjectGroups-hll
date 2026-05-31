const API_BASE = 'http://localhost:8000';

async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
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
        console.error('API Error:', error);
        throw error;
    }
}

async function runNesting(parts, sheetWidth, sheetHeight, params = {}) {
    return apiRequest('/api/nesting', {
        method: 'POST',
        body: JSON.stringify({
            parts: parts.map(p => ({
                id: p.id,
                points: p.points,
                quantity: p.quantity || 1
            })),
            sheet_width: sheetWidth,
            sheet_height: sheetHeight,
            population_size: params.populationSize || 30,
            generations: params.generations || 50,
            mutation_rate: params.mutationRate || 0.2,
            min_safe_distance: params.safeDistance || 5.0,
            enable_common_edge: params.enableCommonEdge !== false,
            common_edge_tolerance: params.commonEdgeTolerance || 0.5,
            enable_heat_zone: params.enableHeatZone !== false,
            heat_zone_distance: params.heatZoneDistance || 25.0,
            heat_penalty: params.heatPenalty || 3.0
        })
    });
}

async function generateDXF(parts, sheetWidth, sheetHeight, params = {}) {
    const response = await fetch(`${API_BASE}/api/dxf`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            parts: parts.map(p => ({
                id: p.id,
                points: p.points,
                quantity: p.quantity || 1
            })),
            sheet_width: sheetWidth,
            sheet_height: sheetHeight,
            population_size: params.populationSize || 30,
            generations: params.generations || 50,
            mutation_rate: params.mutationRate || 0.2,
            min_safe_distance: params.safeDistance || 5.0,
            enable_common_edge: params.enableCommonEdge !== false,
            common_edge_tolerance: params.commonEdgeTolerance || 0.5,
            enable_heat_zone: params.enableHeatZone !== false,
            heat_zone_distance: params.heatZoneDistance || 25.0,
            heat_penalty: params.heatPenalty || 3.0
        })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.text();
}

async function saveSolution(name, resultData) {
    return apiRequest('/api/solutions', {
        method: 'POST',
        body: JSON.stringify({
            name: name,
            sheet_width: resultData.nesting.sheet_width,
            sheet_height: resultData.nesting.sheet_height,
            utilization: resultData.nesting.utilization,
            waste: resultData.nesting.waste,
            total_travel_distance: resultData.tsp.total_travel_distance,
            placements: resultData.tsp.placements,
            gcode: resultData.gcode
        })
    });
}

async function listSolutions() {
    return apiRequest('/api/solutions');
}

async function getSolution(solutionId) {
    return apiRequest(`/api/solutions/${solutionId}`);
}

async function deleteSolution(solutionId) {
    return apiRequest(`/api/solutions/${solutionId}`, {
        method: 'DELETE'
    });
}

function downloadGCode(solutionId) {
    window.open(`${API_BASE}/api/gcode/${solutionId}`, '_blank');
}

let currentNestingResult = null;

function setCurrentResult(result) {
    currentNestingResult = result;
}

function getCurrentResult() {
    return currentNestingResult;
}
