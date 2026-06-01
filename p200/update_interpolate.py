with open('api/routes/interpolate.ts', 'r') as f:
    content = f.read()

old_text = """    const allStats: InterpolationResult['stats'] = {};
    const allGrids: Record<string, Float64Array> = {};
    let gridWidth = 0;
    let gridHeight = 0;
    let paddedBounds;
    
    for (const metric of metrics) {
      const result = interpolateIDW(dataPoints, bounds, { ...params, padding: 0.1 }, metric);
      allStats[metric] = result.stats;
      allGrids[metric] = result.grid;
      gridWidth = result.gridWidth;
      gridHeight = result.gridHeight;
      setGrid(fileId, metric, result.grid);
      paddedBounds = result.paddedBounds;
    }
    
    const interpResult: InterpolationResult = {
      fileId,
      bounds,
      paddedBounds,
      stats: allStats,
      power: params.power,
      searchRadius: params.searchRadius,
      gridSize: params.gridSize,
      gridWidth,
      gridHeight,
      grids: allGrids,
    };"""

new_text = """    const allStats: InterpolationResult['stats'] = {};
    const allCoverageStats: InterpolationResult['coverageStats'] = {};
    const allGrids: Record<string, Float64Array> = {};
    let gridWidth = 0;
    let gridHeight = 0;
    let paddedBounds;
    
    for (const metric of metrics) {
      const result = interpolateIDW(dataPoints, bounds, { ...params, padding: 0.1 }, metric);
      allStats[metric] = result.stats;
      allGrids[metric] = result.grid;
      gridWidth = result.gridWidth;
      gridHeight = result.gridHeight;
      setGrid(fileId, metric, result.grid);
      paddedBounds = result.paddedBounds;
      if (result.coverageStats) {
        allCoverageStats[metric] = result.coverageStats;
      }
    }
    
    const interpResult: InterpolationResult = {
      fileId,
      bounds,
      paddedBounds,
      stats: allStats,
      coverageStats: allCoverageStats,
      power: params.power,
      searchRadius: params.searchRadius,
      gridSize: params.gridSize,
      gridWidth,
      gridHeight,
      grids: allGrids,
    };"""

content = content.replace(old_text, new_text)

with open('api/routes/interpolate.ts', 'w') as f:
    f.write(content)

print("File updated successfully")
