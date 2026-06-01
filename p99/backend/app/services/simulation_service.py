from sqlalchemy.orm import Session
from typing import List, Optional
import json

from backend.app.models.simulation import Simulation
from backend.app.schemas.simulation import SimulationCreate
from backend.app.services.particle_model import run_particle_simulation

class SimulationService:
    def __init__(self, db: Session):
        self.db = db

    def create_simulation(self, simulation_data: SimulationCreate) -> Simulation:
        sim_dict = simulation_data.model_dump()
        sim_dict.pop('weather_series', None)
        db_simulation = Simulation(**sim_dict)
        self.db.add(db_simulation)
        self.db.commit()
        self.db.refresh(db_simulation)
        return db_simulation

    def get_simulation(self, simulation_id: int) -> Optional[Simulation]:
        return self.db.query(Simulation).filter(Simulation.id == simulation_id).first()

    def get_all_simulations(self, skip: int = 0, limit: int = 100) -> List[Simulation]:
        return self.db.query(Simulation).offset(skip).limit(limit).all()

    def run_and_save_simulation(self, simulation_data: SimulationCreate) -> dict:
        wind_series = None
        if simulation_data.use_dynamic_weather and simulation_data.weather_series:
            wind_series = [wp.model_dump() for wp in simulation_data.weather_series]

        result = run_particle_simulation(
            source_lat=simulation_data.source_lat,
            source_lon=simulation_data.source_lon,
            emission_rate=simulation_data.emission_rate,
            wind_speed=simulation_data.wind_speed,
            wind_direction=simulation_data.wind_direction,
            stability_class=simulation_data.stability_class,
            duration_hours=simulation_data.duration_hours,
            grid_resolution=simulation_data.grid_resolution,
            num_particles=simulation_data.num_particles,
            wind_series=wind_series
        )

        result_json = json.dumps({
            'grid_lats': result['grid_lats'],
            'grid_lons': result['grid_lons'],
            'time_steps': result['time_steps'],
            'final_concentrations': result['concentrations'],
            'contours': result['contours'],
            'num_particles_used': result['num_particles_used']
        })

        sim_dict = simulation_data.model_dump()
        sim_dict.pop('weather_series', None)
        db_simulation = Simulation(
            **sim_dict,
            result_data=result_json
        )
        self.db.add(db_simulation)
        self.db.commit()
        self.db.refresh(db_simulation)

        return {
            'simulation': db_simulation,
            'result': result
        }

    def get_simulation_result(self, simulation_id: int) -> Optional[dict]:
        simulation = self.get_simulation(simulation_id)
        if simulation and simulation.result_data:
            return json.loads(simulation.result_data)
        return None

    def delete_simulation(self, simulation_id: int) -> bool:
        simulation = self.get_simulation(simulation_id)
        if simulation:
            self.db.delete(simulation)
            self.db.commit()
            return True
        return False
