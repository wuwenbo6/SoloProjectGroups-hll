import osmium
import json
from datetime import datetime
from pathlib import Path
from shapely.geometry import LineString, mapping
from sqlalchemy.orm import Session
from models import RoadSegment, Region, PBFTask


class OSMHistoryHandler(osmium.SimpleHandler):
    def __init__(self, db: Session, region_id: str, task_id: str):
        super().__init__()
        self.db = db
        self.region_id = region_id
        self.task_id = task_id
        self.ways = {}
        self.nodes = {}
        self.count = 0

    def node(self, n):
        self.nodes[n.id] = (n.location.lon, n.location.lat)

    def way(self, w):
        if 'highway' not in w.tags:
            return

        highway_type = w.tags.get('highway', '')
        if not highway_type:
            return

        way_id = w.id
        timestamp = w.timestamp
        version = w.version

        coords = []
        for node_ref in w.nodes:
            if node_ref.ref in self.nodes:
                coords.append(self.nodes[node_ref.ref])

        if len(coords) < 2:
            return

        geometry = LineString(coords)
        geom_geojson = json.dumps(mapping(geometry))

        if way_id not in self.ways:
            self.ways[way_id] = {
                'first_seen': timestamp.year,
                'last_seen': timestamp.year,
                'name': w.tags.get('name', ''),
                'highway_type': highway_type,
                'geometry': geom_geojson,
                'versions': [version]
            }
        else:
            self.ways[way_id]['last_seen'] = timestamp.year
            if version not in self.ways[way_id]['versions']:
                self.ways[way_id]['versions'].append(version)

        self.count += 1
        if self.count % 1000 == 0:
            task = self.db.query(PBFTask).filter(PBFTask.id == self.task_id).first()
            if task:
                task.progress = min(95, int(self.count / 100))
                self.db.commit()

    def save_to_database(self):
        road_segments = []
        for way_id, data in self.ways.items():
            road_segment = RoadSegment(
                id=f"{self.region_id}_{way_id}",
                osm_id=way_id,
                name=data['name'],
                highway_type=data['highway_type'],
                geometry=data['geometry'],
                first_seen_year=data['first_seen'],
                last_seen_year=data['last_seen'],
                region_id=self.region_id
            )
            road_segments.append(road_segment)

        self.db.bulk_save_objects(road_segments)

        all_years = set()
        for data in self.ways.values():
            all_years.add(data['first_seen'])
            all_years.add(data['last_seen'])

        region = self.db.query(Region).filter(Region.id == self.region_id).first()
        if region:
            existing_years = set(json.loads(region.available_years))
            combined_years = sorted(existing_years.union(all_years))
            region.available_years = json.dumps(combined_years)

        self.db.commit()


def parse_pbf_file(file_path: str, db: Session, region_id: str, task_id: str):
    task = db.query(PBFTask).filter(PBFTask.id == task_id).first()
    if not task:
        return

    try:
        task.status = "processing"
        task.progress = 0
        db.commit()

        handler = OSMHistoryHandler(db, region_id, task_id)
        handler.apply_file(file_path, locations=True)

        handler.save_to_database()

        task.status = "completed"
        task.progress = 100
        task.completed_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        task.status = "error"
        task.error_message = str(e)
        task.completed_at = datetime.utcnow()
        db.commit()
        raise
