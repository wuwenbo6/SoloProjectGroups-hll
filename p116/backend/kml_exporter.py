from datetime import datetime, timedelta
from xml.etree.ElementTree import Element, SubElement, ElementTree, tostring
from xml.dom import minidom
import io

class KMLExporter:
    def __init__(self):
        pass
    
    def export_orbit_kml(self, satellite_name, norad_id, ground_track_points, orbit_path_points=None):
        kml = Element('kml')
        kml.set('xmlns', 'http://www.opengis.net/kml/2.2')
        
        document = SubElement(kml, 'Document')
        
        name = SubElement(document, 'name')
        name.text = f'{satellite_name} - Orbit Track'
        
        description = SubElement(document, 'description')
        description.text = f'Orbit track for {satellite_name} (NORAD ID: {norad_id})'
        
        style = SubElement(document, 'Style')
        style.set('id', 'groundTrackStyle')
        
        lineStyle = SubElement(style, 'LineStyle')
        color = SubElement(lineStyle, 'color')
        color.text = 'ff0000ff'
        width = SubElement(lineStyle, 'width')
        width.text = '3'
        
        iconStyle = SubElement(style, 'IconStyle')
        iconColor = SubElement(iconStyle, 'color')
        iconColor.text = 'ff0080ff'
        scale = SubElement(iconStyle, 'scale')
        scale.text = '1.2'
        
        folder = SubElement(document, 'Folder')
        folderName = SubElement(folder, 'name')
        folderName.text = 'Ground Track'
        
        if ground_track_points:
            self._add_line_string(folder, 'Ground Track Path', ground_track_points, 'groundTrackStyle')
            
            self._add_time_points(folder, ground_track_points)
        
        if orbit_path_points:
            orbitFolder = SubElement(document, 'Folder')
            orbitFolderName = SubElement(orbitFolder, 'name')
            orbitFolderName.text = 'Orbit Path (3D)'
            
            self._add_3d_orbit(orbitFolder, '3D Orbit', orbit_path_points)
        
        return self._prettify(kml)
    
    def _add_line_string(self, parent, name, points, style_id=None):
        placemark = SubElement(parent, 'Placemark')
        
        pmName = SubElement(placemark, 'name')
        pmName.text = name
        
        if style_id:
            styleUrl = SubElement(placemark, 'styleUrl')
            styleUrl.text = f'#{style_id}'
        
        linestring = SubElement(placemark, 'LineString')
        
        tessellate = SubElement(linestring, 'tessellate')
        tessellate.text = '1'
        
        altitudeMode = SubElement(linestring, 'altitudeMode')
        altitudeMode.text = 'absolute'
        
        coordinates = SubElement(linestring, 'coordinates')
        coord_str = ' '.join([
            f"{p['longitude']},{p['latitude']},{p.get('altitude', 0)}" 
            for p in points
        ])
        coordinates.text = coord_str
    
    def _add_time_points(self, parent, points):
        folder = SubElement(parent, 'Folder')
        folderName = SubElement(folder, 'name')
        folderName.text = 'Track Points'
        
        step = max(1, len(points) // 20)
        
        for i in range(0, len(points), step):
            point = points[i]
            placemark = SubElement(folder, 'Placemark')
            
            pmName = SubElement(placemark, 'name')
            time_str = point.get('time', '')
            if time_str:
                try:
                    dt = datetime.fromisoformat(time_str)
                    pmName.text = dt.strftime('%H:%M:%S')
                except:
                    pmName.text = f'Point {i}'
            else:
                pmName.text = f'Point {i}'
            
            p = SubElement(placemark, 'Point')
            p_altitude = SubElement(p, 'altitudeMode')
            p_altitude.text = 'absolute'
            
            p_coords = SubElement(p, 'coordinates')
            p_coords.text = f"{point['longitude']},{point['latitude']},{point.get('altitude', 0)}"
    
    def _add_3d_orbit(self, parent, name, points):
        placemark = SubElement(parent, 'Placemark')
        
        pmName = SubElement(placemark, 'name')
        pmName.text = name
        
        linestring = SubElement(placemark, 'LineString')
        
        extrude = SubElement(linestring, 'extrude')
        extrude.text = '1'
        
        tessellate = SubElement(linestring, 'tessellate')
        tessellate.text = '1'
        
        altitudeMode = SubElement(linestring, 'altitudeMode')
        altitudeMode.text = 'absolute'
        
        coordinates = SubElement(linestring, 'coordinates')
        coord_str = ' '.join([
            f"{p['longitude']},{p['latitude']},{p.get('altitude', 0) * 1000}" 
            for p in points
        ])
        coordinates.text = coord_str
    
    def _prettify(self, elem):
        rough_string = tostring(elem, 'utf-8')
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent='  ', encoding='UTF-8')
    
    def export_multi_satellite_kml(self, satellites_data):
        kml = Element('kml')
        kml.set('xmlns', 'http://www.opengis.net/kml/2.2')
        
        document = SubElement(kml, 'Document')
        
        name = SubElement(document, 'name')
        name.text = 'Multiple Satellite Orbits'
        
        colors = ['ff0000ff', 'ff00ff00', 'ffff0000', 'ff00ffff', 'ffff00ff', 'ffffff00']
        
        for idx, sat_data in enumerate(satellites_data):
            folder = SubElement(document, 'Folder')
            folderName = SubElement(folder, 'name')
            folderName.text = f"{sat_data['name']} ({sat_data['norad_id']})"
            
            color_idx = idx % len(colors)
            
            style = SubElement(folder, 'Style')
            style.set('id', f'style_{idx}')
            
            lineStyle = SubElement(style, 'LineStyle')
            color = SubElement(lineStyle, 'color')
            color.text = colors[color_idx]
            width = SubElement(lineStyle, 'width')
            width.text = '2'
            
            placemark = SubElement(folder, 'Placemark')
            pmName = SubElement(placemark, 'name')
            pmName.text = 'Ground Track'
            
            styleUrl = SubElement(placemark, 'styleUrl')
            styleUrl.text = f'#style_{idx}'
            
            linestring = SubElement(placemark, 'LineString')
            tessellate = SubElement(linestring, 'tessellate')
            tessellate.text = '1'
            altitudeMode = SubElement(linestring, 'altitudeMode')
            altitudeMode.text = 'absolute'
            
            coordinates = SubElement(linestring, 'coordinates')
            coord_str = ' '.join([
                f"{p['longitude']},{p['latitude']},{p.get('altitude', 0)}" 
                for p in sat_data.get('ground_track', [])
            ])
            coordinates.text = coord_str
        
        return self._prettify(kml)
