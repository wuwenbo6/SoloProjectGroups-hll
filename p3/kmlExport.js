const { create } = require('xmlbuilder2');
const { generateEllipsePoints } = require('./triangulation');

function generateKML(data) {
  const kml = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('kml', { xmlns: 'http://www.opengis.net/kml/2.2' })
      .ele('Document')
        .ele('name').txt('Direction Finding Results').up()
        .ele('description').txt(`Triangulation result from ${data.timestamp}`).up();

  const style = kml.ele('Style', { id: 'emitterStyle' });
  style.ele('IconStyle')
    .ele('color').txt('ff0000ff').up()
    .ele('scale').txt('1.3').up()
    .ele('Icon')
      .ele('href').txt('http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png').up().up().up();
  style.ele('LabelStyle')
    .ele('color').txt('ff0000ff').up().up();

  const stationStyle = kml.ele('Style', { id: 'stationStyle' });
  stationStyle.ele('IconStyle')
    .ele('color').txt('ff00ff00').up()
    .ele('scale').txt('1.1').up()
    .ele('Icon')
      .ele('href').txt('http://maps.google.com/mapfiles/kml/shapes/target.png').up().up().up();

  const ellipseStyle = kml.ele('Style', { id: 'ellipseStyle' });
  ellipseStyle.ele('LineStyle')
    .ele('color').txt('800000ff').up()
    .ele('width').txt('2').up().up();
  ellipseStyle.ele('PolyStyle')
    .ele('color').txt('330000ff').up().up();

  const lineStyle = kml.ele('Style', { id: 'lineStyle' });
  lineStyle.ele('LineStyle')
    .ele('color').txt('ff00aa00').up()
    .ele('width').txt('2').up().up();

  data.stations.forEach((station, index) => {
    const stationId = station.id || station.station_id || index + 1;
    const stationLat = station.lat !== undefined ? station.lat : station.station_lat;
    const stationLng = station.lng !== undefined ? station.lng : station.station_lng;
    const stationAzimuth = station.azimuth;
    const stationError = station.error;
    
    const stationFolder = kml.ele('Placemark');
    stationFolder.ele('name').txt(`Station ${stationId}`).up();
    stationFolder.ele('styleUrl').txt('#stationStyle').up();
    stationFolder.ele('description').txt(`
      Azimuth: ${stationAzimuth.toFixed(2)}°\n
      Error: ${stationError.toFixed(2)}°\n
      Coordinates: ${stationLat.toFixed(6)}, ${stationLng.toFixed(6)}
    `).up();
    stationFolder.ele('Point')
      .ele('coordinates').txt(`${stationLng},${stationLat},0`).up().up();

    const lineEnd = {
      lat: stationLat + Math.sin(stationAzimuth * Math.PI / 180) * 0.5,
      lng: stationLng + Math.cos(stationAzimuth * Math.PI / 180) * 0.5
    };

    const linePlacemark = kml.ele('Placemark');
    linePlacemark.ele('name').txt(`Bearing from Station ${stationId}`).up();
    linePlacemark.ele('styleUrl').txt('#lineStyle').up();
    linePlacemark.ele('LineString')
      .ele('tessellate').txt('1').up()
      .ele('coordinates').txt(`${stationLng},${stationLat},0 ${lineEnd.lng},${lineEnd.lat},0`).up().up();
  });

  const emitterFolder = kml.ele('Placemark');
  emitterFolder.ele('name').txt('Estimated Emitter Position').up();
  emitterFolder.ele('styleUrl').txt('#emitterStyle').up();
  emitterFolder.ele('description').txt(`
    Probability: ${data.probability.toFixed(1)}%\n
    Power: ${data.power} dBm\n
    Terrain Factor: ${data.terrainFactor}\n
    Ellipse Major: ${(data.ellipseMajor / 1000).toFixed(2)} km\n
    Ellipse Minor: ${(data.ellipseMinor / 1000).toFixed(2)} km
  `).up();
  emitterFolder.ele('Point')
    .ele('coordinates').txt(`${data.emitterLng},${data.emitterLat},0`).up().up();

  const ellipsePoints = generateEllipsePoints(
    data.emitterLat, data.emitterLng,
    data.ellipseMajor, data.ellipseMinor,
    data.ellipseOrientation
  );
  
  const ellipsePlacemark = kml.ele('Placemark');
  ellipsePlacemark.ele('name').txt('Probability Ellipse').up();
  ellipsePlacemark.ele('styleUrl').txt('#ellipseStyle').up();
  ellipsePlacemark.ele('Polygon')
    .ele('outerBoundaryIs')
      .ele('LinearRing')
        .ele('coordinates').txt(
          ellipsePoints.map(p => `${p[1]},${p[0]},0`).join(' ') + 
          ` ${ellipsePoints[0][1]},${ellipsePoints[0][0]},0`
        ).up().up().up().up();

  return kml.end({ prettyPrint: true });
}

module.exports = { generateKML };
