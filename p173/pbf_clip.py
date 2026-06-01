import osmium
import osmium.geom
import json
import os
import csv
import zipfile
from shapely.geometry import shape, Point, Polygon, MultiPolygon
from shapely.prepared import prep
from typing import Callable, Optional, Dict, List
import threading
import time
import shapefile


class StreamGeoJSONExportHandler(osmium.SimpleHandler):
    def __init__(self, boundary_geom, output_file, 
                 progress_callback: Optional[Callable] = None,
                 file_size: int = 0,
                 include_relations: bool = True):
        super().__init__()
        self.boundary = prep(boundary_geom)
        self.boundary_geom = boundary_geom
        self.output_file = output_file
        self.progress_callback = progress_callback
        self.file_size = file_size
        self.include_relations = include_relations
        
        self._first_feature = True
        self._lock = threading.Lock()
        
        self.node_count = 0
        self.way_count = 0
        self.relation_count = 0
        self.features_exported = 0
        
        self._last_report = 0
        self._start_time = time.time()
        
        self._init_output()
    
    def _init_output(self):
        with open(self.output_file, 'w', encoding='utf-8') as f:
            f.write('{"type":"FeatureCollection","features":[')
    
    def _write_feature(self, feature_geojson):
        with self._lock:
            with open(self.output_file, 'a', encoding='utf-8') as f:
                if not self._first_feature:
                    f.write(',\n')
                else:
                    self._first_feature = False
                json.dump(feature_geojson, f, ensure_ascii=False)
    
    def _finalize_output(self):
        with open(self.output_file, 'a', encoding='utf-8') as f:
            f.write('\n]}')
    
    def _report_progress(self):
        if self.progress_callback:
            total_ops = self.node_count + self.way_count + self.relation_count
            if total_ops - self._last_report >= 50000:
                self._last_report = total_ops
                estimated_progress = min(10 + (total_ops / 10000000) * 80, 95)
                elapsed = time.time() - self._start_time
                self.progress_callback("processing", estimated_progress, {
                    "node_count": self.node_count,
                    "way_count": self.way_count,
                    "relation_count": self.relation_count,
                    "features_exported": self.features_exported,
                    "elapsed_seconds": round(elapsed, 1),
                    "file_size": self.file_size
                })
    
    def node(self, n):
        self.node_count += 1
        if n.location.valid():
            lon, lat = n.location.lon, n.location.lat
            p = Point(lon, lat)
            
            if self.boundary.contains(p):
                props = {tag.k: tag.v for tag in n.tags}
                props["@id"] = f"node/{n.id}"
                props["@type"] = "node"
                
                feature = {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": props
                }
                self._write_feature(feature)
                self.features_exported += 1
        
        if self.node_count % 10000 == 0:
            self._report_progress()
    
    def way(self, w):
        self.way_count += 1
        
        try:
            coords = []
            has_node_in_area = False
            
            for n in w.nodes:
                if n.location.valid():
                    lon, lat = n.location.lon, n.location.lat
                    coords.append((lon, lat))
                    p = Point(lon, lat)
                    if self.boundary.contains(p):
                        has_node_in_area = True
            
            if not coords or len(coords) < 2:
                return
            
            if has_node_in_area:
                if len(coords) >= 4 and coords[0] == coords[-1]:
                    try:
                        poly_coords = [[c[0], c[1]] for c in coords]
                        props = {tag.k: tag.v for tag in w.tags}
                        props["@id"] = f"way/{w.id}"
                        props["@type"] = "way"
                        
                        feature = {
                            "type": "Feature",
                            "geometry": {"type": "Polygon", "coordinates": [poly_coords]},
                            "properties": props
                        }
                        self._write_feature(feature)
                        self.features_exported += 1
                    except Exception:
                        pass
                else:
                    line_coords = [[c[0], c[1]] for c in coords]
                    props = {tag.k: tag.v for tag in w.tags}
                    props["@id"] = f"way/{w.id}"
                    props["@type"] = "way"
                    
                    feature = {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": line_coords},
                        "properties": props
                    }
                    self._write_feature(feature)
                    self.features_exported += 1
        
        except Exception:
            pass
        
        if self.way_count % 5000 == 0:
            self._report_progress()
    
    def relation(self, r):
        self.relation_count += 1
    
    def finalize(self):
        self._finalize_output()
        stats = {
            "node_count": self.node_count,
            "way_count": self.way_count,
            "relation_count": self.relation_count,
            "features_exported": self.features_exported,
            "file_size": self.file_size,
            "include_relations": self.include_relations
        }
        if self.progress_callback:
            self.progress_callback("completed", 100, stats)
        return stats


class StreamOSMExportHandler(osmium.SimpleHandler):
    def __init__(self, boundary_geom, output_file,
                 progress_callback: Optional[Callable] = None,
                 file_size: int = 0,
                 include_relations: bool = True):
        super().__init__()
        self.boundary = prep(boundary_geom)
        self.boundary_geom = boundary_geom
        self.output_file = output_file
        self.progress_callback = progress_callback
        self.file_size = file_size
        self.include_relations = include_relations
        
        self.writer = osmium.SimpleWriter(output_file)
        self.kept_nodes = set()
        self.kept_ways = set()
        
        self.node_count = 0
        self.way_count = 0
        self.relation_count = 0
        self.relations_exported = 0
        
        self._last_report = 0
        self._start_time = time.time()
    
    def _report_progress(self):
        if self.progress_callback:
            total_ops = self.node_count + self.way_count + self.relation_count
            if total_ops - self._last_report >= 50000:
                self._last_report = total_ops
                estimated_progress = min(10 + (total_ops / 10000000) * 80, 95)
                elapsed = time.time() - self._start_time
                self.progress_callback("processing", estimated_progress, {
                    "node_count": self.node_count,
                    "way_count": self.way_count,
                    "relation_count": self.relation_count,
                    "kept_nodes": len(self.kept_nodes),
                    "kept_ways": len(self.kept_ways),
                    "relations_exported": self.relations_exported,
                    "elapsed_seconds": round(elapsed, 1),
                    "file_size": self.file_size
                })
    
    def node(self, n):
        self.node_count += 1
        if n.location.valid():
            p = Point(n.location.lon, n.location.lat)
            if self.boundary.contains(p):
                self.kept_nodes.add(n.id)
                self.writer.add_node(n)
        
        if self.node_count % 10000 == 0:
            self._report_progress()
    
    def way(self, w):
        self.way_count += 1
        has_node_in_area = False
        for n in w.nodes:
            if n.ref in self.kept_nodes:
                has_node_in_area = True
                break
        
        if has_node_in_area:
            self.kept_ways.add(w.id)
            self.writer.add_way(w)
        
        if self.way_count % 5000 == 0:
            self._report_progress()
    
    def relation(self, r):
        self.relation_count += 1
        if not self.include_relations:
            return
            
        has_kept_member = False
        for member in r.members:
            if member.type == 'n' and member.ref in self.kept_nodes:
                has_kept_member = True
                break
            if member.type == 'w' and member.ref in self.kept_ways:
                has_kept_member = True
                break
        
        if has_kept_member:
            self.writer.add_relation(r)
            self.relations_exported += 1
    
    def finalize(self):
        self.writer.close()
        stats = {
            "node_count": self.node_count,
            "way_count": self.way_count,
            "relation_count": self.relation_count,
            "kept_nodes": len(self.kept_nodes),
            "kept_ways": len(self.kept_ways),
            "relations_exported": self.relations_exported,
            "file_size": self.file_size,
            "include_relations": self.include_relations
        }
        if self.progress_callback:
            self.progress_callback("completed", 100, stats)
        return stats


class CSVExportHandler(osmium.SimpleHandler):
    def __init__(self, boundary_geom, output_dir,
                 progress_callback: Optional[Callable] = None,
                 file_size: int = 0,
                 include_relations: bool = True):
        super().__init__()
        self.boundary = prep(boundary_geom)
        self.boundary_geom = boundary_geom
        self.output_dir = output_dir
        self.progress_callback = progress_callback
        self.file_size = file_size
        self.include_relations = include_relations
        
        os.makedirs(output_dir, exist_ok=True)
        
        self.nodes_file = os.path.join(output_dir, "nodes.csv")
        self.ways_file = os.path.join(output_dir, "ways.csv")
        self.relations_file = os.path.join(output_dir, "relations.csv")
        
        self._node_fields = ['id', 'lon', 'lat', 'tags']
        self._way_fields = ['id', 'node_count', 'node_ids', 'tags']
        self._relation_fields = ['id', 'member_count', 'members', 'tags']
        
        self._init_files()
        
        self.node_count = 0
        self.way_count = 0
        self.relation_count = 0
        self.nodes_exported = 0
        self.ways_exported = 0
        self.relations_exported = 0
        
        self._last_report = 0
        self._start_time = time.time()
        self._lock = threading.Lock()
    
    def _init_files(self):
        with open(self.nodes_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=self._node_fields)
            writer.writeheader()
        
        with open(self.ways_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=self._way_fields)
            writer.writeheader()
        
        with open(self.relations_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=self._relation_fields)
            writer.writeheader()
    
    def _tags_to_string(self, tags):
        return ';'.join([f"{tag.k}={tag.v}" for tag in tags])
    
    def _report_progress(self):
        if self.progress_callback:
            total_ops = self.node_count + self.way_count + self.relation_count
            if total_ops - self._last_report >= 50000:
                self._last_report = total_ops
                estimated_progress = min(10 + (total_ops / 10000000) * 80, 95)
                elapsed = time.time() - self._start_time
                self.progress_callback("processing", estimated_progress, {
                    "node_count": self.node_count,
                    "way_count": self.way_count,
                    "relation_count": self.relation_count,
                    "nodes_exported": self.nodes_exported,
                    "ways_exported": self.ways_exported,
                    "relations_exported": self.relations_exported,
                    "elapsed_seconds": round(elapsed, 1),
                    "file_size": self.file_size
                })
    
    def node(self, n):
        self.node_count += 1
        if n.location.valid():
            lon, lat = n.location.lon, n.location.lat
            p = Point(lon, lat)
            
            if self.boundary.contains(p):
                with self._lock:
                    with open(self.nodes_file, 'a', newline='', encoding='utf-8') as f:
                        writer = csv.DictWriter(f, fieldnames=self._node_fields)
                        writer.writerow({
                            'id': n.id,
                            'lon': lon,
                            'lat': lat,
                            'tags': self._tags_to_string(n.tags)
                        })
                self.nodes_exported += 1
        
        if self.node_count % 10000 == 0:
            self._report_progress()
    
    def way(self, w):
        self.way_count += 1
        
        has_node_in_area = False
        node_ids = []
        for n in w.nodes:
            node_ids.append(str(n.ref))
            if n.location.valid():
                p = Point(n.location.lon, n.location.lat)
                if self.boundary.contains(p):
                    has_node_in_area = True
        
        if has_node_in_area:
            with self._lock:
                with open(self.ways_file, 'a', newline='', encoding='utf-8') as f:
                    writer = csv.DictWriter(f, fieldnames=self._way_fields)
                    writer.writerow({
                        'id': w.id,
                        'node_count': len(w.nodes),
                        'node_ids': ','.join(node_ids),
                        'tags': self._tags_to_string(w.tags)
                    })
            self.ways_exported += 1
        
        if self.way_count % 5000 == 0:
            self._report_progress()
    
    def relation(self, r):
        self.relation_count += 1
        if not self.include_relations:
            return
        
        members = []
        for member in r.members:
            members.append(f"{member.type}:{member.ref}:{member.role}")
        
        with self._lock:
            with open(self.relations_file, 'a', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=self._relation_fields)
                writer.writerow({
                    'id': r.id,
                    'member_count': len(r.members),
                    'members': ';'.join(members),
                    'tags': self._tags_to_string(r.tags)
                })
        self.relations_exported += 1
    
    def finalize(self):
        stats = {
            "node_count": self.node_count,
            "way_count": self.way_count,
            "relation_count": self.relation_count,
            "nodes_exported": self.nodes_exported,
            "ways_exported": self.ways_exported,
            "relations_exported": self.relations_exported,
            "file_size": self.file_size,
            "include_relations": self.include_relations,
            "output_files": {
                "nodes": os.path.basename(self.nodes_file),
                "ways": os.path.basename(self.ways_file),
                "relations": os.path.basename(self.relations_file)
            }
        }
        if self.progress_callback:
            self.progress_callback("completed", 100, stats)
        return stats


class ShapefileExportHandler(osmium.SimpleHandler):
    def __init__(self, boundary_geom, output_dir,
                 progress_callback: Optional[Callable] = None,
                 file_size: int = 0,
                 include_relations: bool = True):
        super().__init__()
        self.boundary = prep(boundary_geom)
        self.boundary_geom = boundary_geom
        self.output_dir = output_dir
        self.progress_callback = progress_callback
        self.file_size = file_size
        self.include_relations = include_relations
        
        os.makedirs(output_dir, exist_ok=True)
        
        self.points_path = os.path.join(output_dir, "points")
        self.lines_path = os.path.join(output_dir, "lines")
        self.polygons_path = os.path.join(output_dir, "polygons")
        
        self._max_field_length = 254
        self._init_shapefiles()
        
        self.node_count = 0
        self.way_count = 0
        self.relation_count = 0
        self.points_exported = 0
        self.lines_exported = 0
        self.polygons_exported = 0
        
        self._last_report = 0
        self._start_time = time.time()
        self._lock = threading.Lock()
    
    def _init_shapefiles(self):
        self.point_writer = shapefile.Writer(self.points_path, shapefile.POINT)
        self.point_writer.field('osm_id', 'C', 20)
        self.point_writer.field('osm_type', 'C', 10)
        self.point_writer.field('name', 'C', self._max_field_length)
        
        self.line_writer = shapefile.Writer(self.lines_path, shapefile.POLYLINE)
        self.line_writer.field('osm_id', 'C', 20)
        self.line_writer.field('osm_type', 'C', 10)
        self.line_writer.field('name', 'C', self._max_field_length)
        
        self.poly_writer = shapefile.Writer(self.polygons_path, shapefile.POLYGON)
        self.poly_writer.field('osm_id', 'C', 20)
        self.poly_writer.field('osm_type', 'C', 10)
        self.poly_writer.field('name', 'C', self._max_field_length)
    
    def _get_tag_value(self, tags, key, default=''):
        for tag in tags:
            if tag.k == key:
                value = tag.v
                if len(value) > self._max_field_length:
                    value = value[:self._max_field_length - 3] + '...'
                return value
        return default
    
    def _report_progress(self):
        if self.progress_callback:
            total_ops = self.node_count + self.way_count + self.relation_count
            if total_ops - self._last_report >= 50000:
                self._last_report = total_ops
                estimated_progress = min(10 + (total_ops / 10000000) * 80, 95)
                elapsed = time.time() - self._start_time
                self.progress_callback("processing", estimated_progress, {
                    "node_count": self.node_count,
                    "way_count": self.way_count,
                    "relation_count": self.relation_count,
                    "points_exported": self.points_exported,
                    "lines_exported": self.lines_exported,
                    "polygons_exported": self.polygons_exported,
                    "elapsed_seconds": round(elapsed, 1),
                    "file_size": self.file_size
                })
    
    def node(self, n):
        self.node_count += 1
        if n.location.valid():
            lon, lat = n.location.lon, n.location.lat
            p = Point(lon, lat)
            
            if self.boundary.contains(p):
                with self._lock:
                    self.point_writer.point(lon, lat)
                    self.point_writer.record(
                        osm_id=str(n.id),
                        osm_type='node',
                        name=self._get_tag_value(n.tags, 'name')
                    )
                self.points_exported += 1
        
        if self.node_count % 10000 == 0:
            self._report_progress()
    
    def way(self, w):
        self.way_count += 1
        
        try:
            coords = []
            has_node_in_area = False
            
            for n in w.nodes:
                if n.location.valid():
                    lon, lat = n.location.lon, n.location.lat
                    coords.append([lon, lat])
                    p = Point(lon, lat)
                    if self.boundary.contains(p):
                        has_node_in_area = True
            
            if not coords or len(coords) < 2:
                return
            
            if has_node_in_area:
                with self._lock:
                    if len(coords) >= 4 and coords[0] == coords[-1]:
                        self.poly_writer.poly([coords])
                        self.poly_writer.record(
                            osm_id=str(w.id),
                            osm_type='way',
                            name=self._get_tag_value(w.tags, 'name')
                        )
                        self.polygons_exported += 1
                    else:
                        self.line_writer.line([coords])
                        self.line_writer.record(
                            osm_id=str(w.id),
                            osm_type='way',
                            name=self._get_tag_value(w.tags, 'name')
                        )
                        self.lines_exported += 1
        
        except Exception:
            pass
        
        if self.way_count % 5000 == 0:
            self._report_progress()
    
    def relation(self, r):
        self.relation_count += 1
    
    def finalize(self):
        self.point_writer.close()
        self.line_writer.close()
        self.poly_writer.close()
        
        self._create_prj_files()
        
        stats = {
            "node_count": self.node_count,
            "way_count": self.way_count,
            "relation_count": self.relation_count,
            "points_exported": self.points_exported,
            "lines_exported": self.lines_exported,
            "polygons_exported": self.polygons_exported,
            "file_size": self.file_size,
            "include_relations": self.include_relations,
            "output_files": {
                "points": "points.shp",
                "lines": "lines.shp",
                "polygons": "polygons.shp"
            }
        }
        if self.progress_callback:
            self.progress_callback("completed", 100, stats)
        return stats
    
    def _create_prj_files(self):
        wkt = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'
        for base_path in [self.points_path, self.lines_path, self.polygons_path]:
            with open(base_path + '.prj', 'w') as f:
                f.write(wkt)


def load_geojson_boundary(geojson_path: str):
    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if data.get("type") == "FeatureCollection":
        features = data.get("features", [])
        if not features:
            raise ValueError("GeoJSON FeatureCollection is empty")
        geom_shape = shape(features[0]["geometry"])
    elif data.get("type") == "Feature":
        geom_shape = shape(data["geometry"])
    else:
        geom_shape = shape(data)
    
    if isinstance(geom_shape, (Polygon, MultiPolygon)):
        return geom_shape
    
    raise ValueError("GeoJSON must contain a Polygon or MultiPolygon geometry")


def get_pbf_file_size(pbf_path: str) -> int:
    return os.path.getsize(pbf_path) if os.path.exists(pbf_path) else 0


def clip_pbf_with_filter(pbf_path: str, geojson_path: str, output_path: str,
                         output_format: str = "geojson",
                         progress_callback: Optional[Callable] = None,
                         include_relations: bool = True) -> dict:
    boundary_geom = load_geojson_boundary(geojson_path)
    file_size = get_pbf_file_size(pbf_path)
    
    if progress_callback:
        progress_callback("initializing", 5, {
            "file_size": file_size,
            "output_format": output_format,
            "include_relations": include_relations
        })
    
    output_format = output_format.lower()
    
    if output_format == "osm":
        handler = StreamOSMExportHandler(
            boundary_geom,
            output_path,
            progress_callback,
            file_size,
            include_relations
        )
    elif output_format == "csv":
        handler = CSVExportHandler(
            boundary_geom,
            output_path,
            progress_callback,
            file_size,
            include_relations
        )
    elif output_format == "shapefile" or output_format == "shp":
        handler = ShapefileExportHandler(
            boundary_geom,
            output_path,
            progress_callback,
            file_size,
            include_relations
        )
    else:
        handler = StreamGeoJSONExportHandler(
            boundary_geom,
            output_path,
            progress_callback,
            file_size,
            include_relations
        )
    
    if progress_callback:
        progress_callback("processing", 10, {
            "message": "Starting PBF processing...",
            "file_size": file_size
        })
    
    handler.apply_file(pbf_path, locations=True)
    stats = handler.finalize()
    
    return stats


def clip_pbf_to_osm(pbf_path: str, geojson_path: str, output_path: str,
                    progress_callback: Optional[Callable] = None,
                    include_relations: bool = True) -> dict:
    return clip_pbf_with_filter(pbf_path, geojson_path, output_path, "osm", 
                                progress_callback, include_relations)


def clip_pbf_to_geojson(pbf_path: str, geojson_path: str, output_path: str,
                        progress_callback: Optional[Callable] = None,
                        include_relations: bool = True) -> dict:
    return clip_pbf_with_filter(pbf_path, geojson_path, output_path, "geojson", 
                                progress_callback, include_relations)


def clip_pbf_to_csv(pbf_path: str, geojson_path: str, output_path: str,
                    progress_callback: Optional[Callable] = None,
                    include_relations: bool = True) -> dict:
    return clip_pbf_with_filter(pbf_path, geojson_path, output_path, "csv", 
                                progress_callback, include_relations)


def clip_pbf_to_shapefile(pbf_path: str, geojson_path: str, output_path: str,
                          progress_callback: Optional[Callable] = None,
                          include_relations: bool = True) -> dict:
    return clip_pbf_with_filter(pbf_path, geojson_path, output_path, "shapefile", 
                                progress_callback, include_relations)


def count_pbf_elements(pbf_path: str) -> dict:
    class CountHandler(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.nodes = 0
            self.ways = 0
            self.relations = 0
        
        def node(self, n):
            self.nodes += 1
        
        def way(self, w):
            self.ways += 1
        
        def relation(self, r):
            self.relations += 1
    
    handler = CountHandler()
    handler.apply_file(pbf_path)
    return {
        "nodes": handler.nodes,
        "ways": handler.ways,
        "relations": handler.relations
    }
