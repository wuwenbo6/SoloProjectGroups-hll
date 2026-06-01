from datetime import datetime
from .database import SessionLocal, TLEData, TLEHistory, init_db
from .sgp4_propagator import SGP4Propagator

class TLEManager:
    def __init__(self):
        init_db()
        self.db = next(SessionLocal())
    
    def add_tle(self, norad_id, name, line1, line2, source="manual", description=None, transition_minutes=5):
        existing = self.db.query(TLEData).filter(TLEData.norad_id == norad_id).first()
        
        if existing:
            from sgp4.api import Satrec
            old_sat = Satrec.twoline2rv(existing.line1, existing.line2)
            
            history = TLEHistory(
                tle_id=existing.id,
                norad_id=norad_id,
                name=existing.name,
                line1=existing.line1,
                line2=existing.line2,
                source=existing.source,
                epoch=existing.updated_at,
                replaced_at=datetime.utcnow(),
                version=existing.version,
                bstar=float(old_sat.bstar),
                inclination=float(old_sat.inclo),
                eccentricity=float(old_sat.ecco),
                period=float(old_sat.period)
            )
            self.db.add(history)
            
            existing.name = name
            existing.line1 = line1
            existing.line2 = line2
            existing.source = source
            existing.updated_at = datetime.utcnow()
            existing.description = description
            existing.version += 1
            existing.transition_minutes = transition_minutes
            
            self.db.commit()
            return existing
        else:
            tle = TLEData(
                norad_id=norad_id,
                name=name,
                line1=line1,
                line2=line2,
                source=source,
                description=description,
                version=1,
                transition_minutes=transition_minutes,
                is_active=True
            )
            self.db.add(tle)
            self.db.commit()
            return tle
    
    def get_tle(self, norad_id):
        return self.db.query(TLEData).filter(TLEData.norad_id == norad_id).first()
    
    def get_tle_with_history(self, norad_id):
        tle = self.get_tle(norad_id)
        if not tle:
            return None
        
        history = self.db.query(TLEHistory).filter(
            TLEHistory.norad_id == norad_id
        ).order_by(TLEHistory.replaced_at.desc()).limit(10).all()
        
        return {
            'current': tle,
            'history': history
        }
    
    def get_active_tle_for_time(self, norad_id, dt):
        tle = self.get_tle(norad_id)
        if not tle:
            return None, None, 1.0
        
        transition_end = tle.updated_at
        transition_start = transition_end
        
        history = self.db.query(TLEHistory).filter(
            TLEHistory.norad_id == norad_id
        ).order_by(TLEHistory.replaced_at.desc()).first()
        
        if history and tle.transition_minutes > 0:
            transition_start = history.replaced_at
            
            if dt < transition_start:
                return history.line1, history.line2, 0.0
            elif dt < transition_end:
                progress = (dt - transition_start).total_seconds() / (tle.transition_minutes * 60)
                progress = max(0.0, min(1.0, progress))
                return tle.line1, tle.line2, progress
            else:
                return tle.line1, tle.line2, 1.0
        else:
            return tle.line1, tle.line2, 1.0
    
    def get_all_tles(self):
        return self.db.query(TLEData).all()
    
    def search_tles(self, query):
        return self.db.query(TLEData).filter(
            (TLEData.name.contains(query)) | 
            (TLEData.norad_id.contains(query))
        ).all()
    
    def delete_tle(self, norad_id):
        tle = self.db.query(TLEData).filter(TLEData.norad_id == norad_id).first()
        if tle:
            self.db.delete(tle)
            self.db.commit()
            return True
        return False
    
    def get_tle_history(self, norad_id, limit=10):
        return self.db.query(TLEHistory).filter(
            TLEHistory.norad_id == norad_id
        ).order_by(TLEHistory.replaced_at.desc()).limit(limit).all()
    
    def load_sample_data(self):
        sample_tles = [
            {
                "norad_id": "25544",
                "name": "ISS (ZARYA)",
                "line1": "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9992",
                "line2": "2 25544  51.6400 208.9163 0006703  35.9764 324.1691 15.49676442424242",
                "description": "国际空间站"
            },
            {
                "norad_id": "20580",
                "name": "HUBBLE",
                "line1": "1 20580U 90037B   24001.50000000  .00000720  00000-0  35000-4 0  9998",
                "line2": "2 20580  28.4700 150.0000 0002800  90.0000 270.0000 15.09000000  9999",
                "description": "哈勃太空望远镜"
            },
            {
                "norad_id": "43873",
                "name": "TIANHE CORE MODULE",
                "line1": "1 43873U 98067JA  24001.50000000  .00020000  00000-0  12000-3 0  9999",
                "line2": "2 43873  41.4700  60.0000 0006000  80.0000 280.0000 15.60000000  9999",
                "description": "中国空间站天和核心舱"
            },
            {
                "norad_id": "39084",
                "name": "GPS BIIR-2",
                "line1": "1 39084U 13007A   24001.50000000  .00000010  00000-0  10000-4 0  9999",
                "line2": "2 39084  55.0000 120.0000 0050000 250.0000 110.0000  2.00560000  9999",
                "description": "GPS导航卫星"
            },
            {
                "norad_id": "40069",
                "name": "METEOR M2",
                "line1": "1 40069U 14037A   24001.50000000  .00000100  00000-0  50000-4 0  9999",
                "line2": "2 40069  98.7000  45.0000 0001000 270.0000  90.0000 14.20000000  9999",
                "description": "俄罗斯气象卫星"
            }
        ]
        
        starlink_tles = self._get_starlink_sample_data()
        sample_tles.extend(starlink_tles)
        
        for tle in sample_tles:
            self.add_tle(
                norad_id=tle["norad_id"],
                name=tle["name"],
                line1=tle["line1"],
                line2=tle["line2"],
                source="sample",
                description=tle.get("description")
            )
        
        return len(sample_tles)

    def _get_starlink_sample_data(self):
        return [
            {
                "norad_id": "44713",
                "name": "STARLINK-1007",
                "line1": "1 44713U 19074A   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44713  53.0000  30.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1007"
            },
            {
                "norad_id": "44714",
                "name": "STARLINK-1008",
                "line1": "1 44714U 19074B   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44714  53.0000  35.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1008"
            },
            {
                "norad_id": "44715",
                "name": "STARLINK-1009",
                "line1": "1 44715U 19074C   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44715  53.0000  40.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1009"
            },
            {
                "norad_id": "44716",
                "name": "STARLINK-1010",
                "line1": "1 44716U 19074D   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44716  53.0000  45.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1010"
            },
            {
                "norad_id": "44717",
                "name": "STARLINK-1011",
                "line1": "1 44717U 19074E   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44717  53.0000  50.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1011"
            },
            {
                "norad_id": "44718",
                "name": "STARLINK-1012",
                "line1": "1 44718U 19074F   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44718  53.0000  55.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1012"
            },
            {
                "norad_id": "44719",
                "name": "STARLINK-1013",
                "line1": "1 44719U 19074G   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44719  53.0000  60.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1013"
            },
            {
                "norad_id": "44720",
                "name": "STARLINK-1014",
                "line1": "1 44720U 19074H   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44720  53.0000  65.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1014"
            },
            {
                "norad_id": "44721",
                "name": "STARLINK-1015",
                "line1": "1 44721U 19074J   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44721  53.0000  70.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1015"
            },
            {
                "norad_id": "44722",
                "name": "STARLINK-1016",
                "line1": "1 44722U 19074K   24001.50000000  .00001000  00000-0  50000-4 0  9999",
                "line2": "2 44722  53.0000  75.0000 0001000  90.0000 270.0000 15.05000000  9999",
                "description": "星链卫星-1016"
            }
        ]
