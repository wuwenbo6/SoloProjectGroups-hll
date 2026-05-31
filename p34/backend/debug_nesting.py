import sys
sys.path.insert(0, '.')

from genetic_algorithm import NestingSolutionGA

parts_data = [
    {"id": "part1", "points": [(0, 0), (100, 0), (100, 50), (0, 50)], "quantity": 3},
    {"id": "part2", "points": [(0, 0), (80, 40), (40, 80)], "quantity": 2},
    {"id": "part3", "points": [(0, 0), (60, 0), (60, 60), (30, 90), (0, 60)], "quantity": 2}
]

print("=== 调试排样问题 ===")
print(f"输入零件数: {len(parts_data)}")
print(f"总数量: {sum(p['quantity'] for p in parts_data)}")

ga = NestingSolutionGA(parts_data, sheet_width=600, sheet_height=600, 
                       population_size=10, generations=5)

print(f"\nga.parts 长度: {len(ga.parts)}")
for i, p in enumerate(ga.parts):
    print(f"  Part {i}: id={p.part_id}, quantity={p.quantity}, area={p.area}")
print(f"ga.total_parts: {ga.total_parts}")

chromosome = ga.create_chromosome()
print(f"\n染色体长度: {len(chromosome)}")
for i, gene in enumerate(chromosome[:10]):
    print(f"  Gene {i}: part={gene['part'].part_id}, x={gene['x']:.1f}, y={gene['y']:.1f}")

placed_polys, placements, used_area = ga.place_parts(chromosome)
print(f"\n放置结果:")
print(f"  placed_polys: {len(placed_polys)}")
print(f"  placements: {len(placements)}")
for i, p in enumerate(placements[:15]):
    print(f"  Placement {i}: part_id={p['part_id']}, x={p['x']:.1f}, y={p['y']:.1f}")
