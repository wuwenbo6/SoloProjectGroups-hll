import numpy as np
import random
import math
from shapely.geometry import Polygon, box
from shapely.affinity import translate, rotate
from typing import List, Dict, Tuple, Optional

class Part:
    def __init__(self, part_id, polygon, quantity = 1):
        self.part_id = part_id
        self.polygon = polygon
        self.quantity = quantity
        self.area = polygon.area
        self.min_rotated_rect = polygon.minimum_rotated_rectangle
        self.bounds = polygon.bounds

class NestingSolutionGA:
    def __init__(self, parts: List[Dict], sheet_width: float, sheet_height: float, 
                 population_size: int = 50, generations: int = 100,
                 mutation_rate: float = 0.2, crossover_rate: float = 0.7):
        self.sheet_width = sheet_width
        self.sheet_height = sheet_height
        self.population_size = population_size
        self.generations = generations
        self.mutation_rate = mutation_rate
        self.crossover_rate = crossover_rate
        
        self.parts = []
        for p in parts:
            coords = p.get('points', [])
            if len(coords) >= 3:
                poly = Polygon(coords)
                self.parts.append(Part(p['id'], poly, p.get('quantity', 1)))
        
        self.total_parts = sum(p.quantity for p in self.parts)
        self.sheet_area = sheet_width * sheet_height
        self.total_part_area = sum(p.area * p.quantity for p in self.parts)
        
    def create_chromosome(self) -> List:
        chromosome = []
        part_list = []
        for part in self.parts:
            for _ in range(part.quantity):
                part_list.append(part)
        
        random.shuffle(part_list)
        
        for part in part_list:
            x = random.uniform(0, self.sheet_width)
            y = random.uniform(0, self.sheet_height)
            rotation = random.choice([0, 90, 180, 270])
            chromosome.append({
                'part': part,
                'x': x,
                'y': y,
                'rotation': rotation
            })
        
        return chromosome
    
    def check_collision(self, placed_polygons, new_poly, min_gap=0.1):
        for poly in placed_polygons:
            distance = new_poly.distance(poly)
            if distance < min_gap:
                return True
        return False
    
    def is_in_sheet(self, poly, margin=0.01):
        minx, miny, maxx, maxy = poly.bounds
        return (minx >= -margin and 
                miny >= -margin and 
                maxx <= self.sheet_width + margin and 
                maxy <= self.sheet_height + margin)
    
    def place_parts(self, chromosome):
        placed_polygons = []
        placements = []
        used_height = 0
        used_width = 0
        min_gap = 0.5
        
        sorted_genes = sorted(chromosome, key=lambda g: g['part'].area, reverse=True)
        
        for gene in sorted_genes:
            part = gene['part']
            x, y, rotation = gene['x'], gene['y'], gene['rotation']
            
            rotated_poly = rotate(part.polygon, rotation, origin='centroid')
            bounds = rotated_poly.bounds
            poly_width = bounds[2] - bounds[0]
            poly_height = bounds[3] - bounds[1]
            
            placed = False
            
            candidate_positions = []
            candidate_positions.append((x, y))
            candidate_positions.append((0, 0))
            
            for placed_poly in placed_polygons:
                pb = placed_poly.bounds
                candidate_positions.append((pb[2] + min_gap, pb[1]))
                candidate_positions.append((pb[0], pb[3] + min_gap))
                candidate_positions.append((pb[2] + min_gap, pb[3] + min_gap))
            
            for px in range(0, int(self.sheet_width - poly_width), max(10, int(poly_width / 2))):
                for py in range(0, int(self.sheet_height - poly_height), max(10, int(poly_height / 2))):
                    candidate_positions.append((px, py))
            
            for px, py in candidate_positions:
                translated = translate(rotated_poly, px - bounds[0], py - bounds[1])
                
                if self.is_in_sheet(translated) and not self.check_collision(placed_polygons, translated, min_gap):
                    placed_polygons.append(translated)
                    placements.append({
                        'part_id': part.part_id,
                        'x': px - bounds[0],
                        'y': py - bounds[1],
                        'rotation': rotation,
                        'polygon': translated
                    })
                    
                    t_bounds = translated.bounds
                    used_width = max(used_width, t_bounds[2])
                    used_height = max(used_height, t_bounds[3])
                    placed = True
                    break
            
            if not placed:
                continue
        
        return placed_polygons, placements, used_width * used_height
    
    def fitness(self, chromosome: List) -> float:
        _, placements, used_area = self.place_parts(chromosome)
        
        if len(placements) == 0:
            return 0
        
        placed_area = sum(p['polygon'].area for p in placements)
        coverage_ratio = placed_area / self.total_part_area
        
        if used_area > 0:
            utilization = placed_area / used_area
        else:
            utilization = 0
        
        return 0.7 * coverage_ratio + 0.3 * utilization - 0.001 * (len(chromosome) - len(placements))
    
    def crossover(self, parent1: List, parent2: List) -> List:
        if len(parent1) < 2 or len(parent2) < 2:
            return parent1.copy()
        
        point = random.randint(1, min(len(parent1), len(parent2)) - 1)
        child = parent1[:point]
        
        child_part_ids = [g['part'].part_id for g in child]
        
        for gene in parent2:
            if gene['part'].part_id not in child_part_ids or \
               child_part_ids.count(gene['part'].part_id) < gene['part'].quantity:
                child.append(gene.copy())
        
        return child
    
    def mutate(self, chromosome: List) -> List:
        mutated = chromosome.copy()
        
        for i in range(len(mutated)):
            if random.random() < self.mutation_rate:
                mutation_type = random.choice(['position', 'rotation', 'swap'])
                
                if mutation_type == 'position':
                    mutated[i]['x'] = random.uniform(0, self.sheet_width)
                    mutated[i]['y'] = random.uniform(0, self.sheet_height)
                elif mutation_type == 'rotation':
                    mutated[i]['rotation'] = random.choice([0, 90, 180, 270])
                elif mutation_type == 'swap' and len(mutated) > 1:
                    j = random.randint(0, len(mutated) - 1)
                    mutated[i], mutated[j] = mutated[j], mutated[i]
        
        return mutated
    
    def selection(self, population: List, fitness_scores: List[float]) -> List:
        tournament_size = 3
        selected = []
        
        for _ in range(len(population)):
            indices = random.sample(range(len(population)), tournament_size)
            best_idx = max(indices, key=lambda i: fitness_scores[i])
            selected.append(population[best_idx])
        
        return selected
    
    def optimize(self) -> Dict:
        population = [self.create_chromosome() for _ in range(self.population_size)]
        
        best_fitness_history = []
        best_chromosome = None
        best_fitness = 0
        
        for gen in range(self.generations):
            fitness_scores = [self.fitness(chromo) for chromo in population]
            
            current_best_idx = np.argmax(fitness_scores)
            current_best_fitness = fitness_scores[current_best_idx]
            
            if current_best_fitness > best_fitness:
                best_fitness = current_best_fitness
                best_chromosome = population[current_best_idx]
            
            best_fitness_history.append(current_best_fitness)
            
            selected = self.selection(population, fitness_scores)
            
            new_population = []
            
            for i in range(0, len(selected), 2):
                if i + 1 < len(selected):
                    parent1, parent2 = selected[i], selected[i + 1]
                    
                    if random.random() < self.crossover_rate:
                        child1 = self.crossover(parent1, parent2)
                        child2 = self.crossover(parent2, parent1)
                    else:
                        child1, child2 = parent1.copy(), parent2.copy()
                    
                    new_population.append(self.mutate(child1))
                    new_population.append(self.mutate(child2))
            
            population = new_population[:self.population_size]
        
        _, placements, used_area = self.place_parts(best_chromosome)
        
        placed_area = sum(p['polygon'].area for p in placements)
        utilization = (placed_area / self.sheet_area) * 100 if self.sheet_area > 0 else 0
        waste = ((self.sheet_area - placed_area) / self.sheet_area) * 100
        
        result_placements = []
        for idx, p in enumerate(placements):
            coords = list(p['polygon'].exterior.coords)
            result_placements.append({
                'part_id': p['part_id'],
                'x': p['x'],
                'y': p['y'],
                'rotation': p['rotation'],
                'points': [(float(c[0]), float(c[1])) for c in coords],
                'cutting_order': idx
            })
        
        return {
            'placements': result_placements,
            'utilization': utilization,
            'waste': waste,
            'sheet_width': self.sheet_width,
            'sheet_height': self.sheet_height,
            'parts_placed': len(placements),
            'total_parts': self.total_parts,
            'fitness_history': best_fitness_history
        }

def run_nesting(parts_data: List[Dict], sheet_width: float, sheet_height: float, **kwargs) -> Dict:
    ga = NestingSolutionGA(parts_data, sheet_width, sheet_height, **kwargs)
    return ga.optimize()
