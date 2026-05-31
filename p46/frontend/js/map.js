let map;
let subbasinLayers = [];
let selectedWatershed = null;
let selectedSimulation = null;

function initMap() {
    map = L.map('mapContainer').setView([34.5, 108.5], 9);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
}

function clearSubbasinLayers() {
    subbasinLayers.forEach(layer => map.removeLayer(layer));
    subbasinLayers = [];
}

function displaySubbasins(subbasins) {
    clearSubbasinLayers();
    
    if (!subbasins || subbasins.length === 0) {
        return;
    }
    
    const colors = ['#33b5e5', '#99cc00', '#ffbb33', '#ff4444', '#aa66cc', '#00C851', '#ff8800', '#33b5e5'];
    
    subbasins.forEach((subbasin, index) => {
        const color = colors[index % colors.length];
        
        let geometry;
        try {
            if (typeof subbasin.geometry === 'string') {
                geometry = JSON.parse(subbasin.geometry);
            } else {
                geometry = subbasin.geometry;
            }
        } catch (e) {
            console.error('Failed to parse geometry:', e);
            return;
        }
        
        const layer = L.geoJSON(geometry, {
            style: {
                fillColor: color,
                weight: 2,
                opacity: 1,
                color: 'white',
                dashArray: '3',
                fillOpacity: 0.5
            }
        }).addTo(map);
        
        layer.bindPopup(createSubbasinPopup(subbasin));
        
        subbasinLayers.push(layer);
    });
    
    const bounds = L.featureGroup(subbasinLayers).getBounds();
    map.fitBounds(bounds, { padding: [20, 20] });
}

function createSubbasinPopup(subbasin) {
    return `
        <div class="subbasin-popup">
            <h6>${subbasin.name || `子流域 ${subbasin.subbasin_number}`}</h6>
            <table class="table table-sm table-borderless">
                <tr>
                    <td>子流域编号</td>
                    <td>${subbasin.subbasin_number}</td>
                </tr>
                <tr>
                    <td>面积</td>
                    <td>${subbasin.area ? subbasin.area.toFixed(2) : 'N/A'} km²</td>
                </tr>
                <tr>
                    <td>中心纬度</td>
                    <td>${subbasin.centroid_lat?.toFixed(4) || 'N/A'}</td>
                </tr>
                <tr>
                    <td>中心经度</td>
                    <td>${subbasin.centroid_lon?.toFixed(4) || 'N/A'}</td>
                </tr>
            </table>
        </div>
    `;
}

function highlightSubbasin(subbasinNumber) {
    subbasinLayers.forEach(layer => {
        layer.setStyle({ weight: 2, fillOpacity: 0.5 });
    });
    
    const layer = subbasinLayers.find(l => {
        const props = l.feature.properties || {};
        return props.subbasin_number === subbasinNumber;
    });
    
    if (layer) {
        layer.setStyle({ weight: 4, fillOpacity: 0.8 });
    }
}

document.addEventListener('DOMContentLoaded', initMap);
