class PatternGenerator {
  constructor() {
    this.charMap = this.initCharMap();
  }

  initCharMap() {
    return {
      'A': [
        [0,0,1,1,0,0],
        [0,1,0,0,1,0],
        [1,0,0,0,0,1],
        [1,1,1,1,1,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1]
      ],
      'B': [
        [1,1,1,1,0,0],
        [1,0,0,0,1,0],
        [1,1,1,1,0,0],
        [1,0,0,0,1,0],
        [1,0,0,0,1,0],
        [1,1,1,1,0,0]
      ],
      'C': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      'D': [
        [1,1,1,1,0,0],
        [1,0,0,0,1,0],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,1,0],
        [1,1,1,1,0,0]
      ],
      'E': [
        [1,1,1,1,1,1],
        [1,0,0,0,0,0],
        [1,1,1,1,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,1,1,1,1,1]
      ],
      'F': [
        [1,1,1,1,1,1],
        [1,0,0,0,0,0],
        [1,1,1,1,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0]
      ],
      'G': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [1,0,0,0,0,0],
        [1,0,0,1,1,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      'H': [
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,1,1,1,1,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1]
      ],
      'I': [
        [0,1,1,1,1,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,1,1,1,1,0]
      ],
      'J': [
        [0,0,1,1,1,0],
        [0,0,0,1,1,0],
        [0,0,0,1,1,0],
        [0,0,0,1,1,0],
        [1,0,0,1,1,0],
        [0,1,1,1,0,0]
      ],
      'K': [
        [1,0,0,0,1,0],
        [1,0,0,1,0,0],
        [1,0,1,0,0,0],
        [1,1,0,0,0,0],
        [1,0,1,0,0,0],
        [1,0,0,1,0,0]
      ],
      'L': [
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0],
        [1,1,1,1,1,1]
      ],
      'M': [
        [1,0,0,0,0,1],
        [1,1,0,0,1,1],
        [1,0,1,1,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1]
      ],
      'N': [
        [1,0,0,0,0,1],
        [1,1,0,0,0,1],
        [1,0,1,0,0,1],
        [1,0,0,1,0,1],
        [1,0,0,0,1,1],
        [1,0,0,0,0,1]
      ],
      'O': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      'P': [
        [1,1,1,1,0,0],
        [1,0,0,0,1,0],
        [1,0,0,0,1,0],
        [1,1,1,1,0,0],
        [1,0,0,0,0,0],
        [1,0,0,0,0,0]
      ],
      'Q': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,1,0,1],
        [1,0,0,0,1,0],
        [0,1,1,0,1,1]
      ],
      'R': [
        [1,1,1,1,0,0],
        [1,0,0,0,1,0],
        [1,0,0,0,1,0],
        [1,1,1,1,0,0],
        [1,0,1,0,0,0],
        [1,0,0,1,0,0]
      ],
      'S': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [0,1,1,1,0,0],
        [0,0,0,0,1,0],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      'T': [
        [1,1,1,1,1,1],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0]
      ],
      'U': [
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      'V': [
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [0,1,0,0,1,0],
        [0,1,0,0,1,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0]
      ],
      'W': [
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [1,0,1,1,0,1],
        [1,1,0,0,1,1],
        [1,0,0,0,0,1]
      ],
      'X': [
        [1,0,0,0,0,1],
        [0,1,0,0,1,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,1,0,0,1,0],
        [1,0,0,0,0,1]
      ],
      'Y': [
        [1,0,0,0,0,1],
        [0,1,0,0,1,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0]
      ],
      'Z': [
        [1,1,1,1,1,1],
        [0,0,0,0,1,0],
        [0,0,0,1,0,0],
        [0,0,1,0,0,0],
        [0,1,0,0,0,0],
        [1,1,1,1,1,1]
      ],
      '0': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [1,0,0,1,0,1],
        [1,0,1,0,0,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      '1': [
        [0,0,1,1,0,0],
        [0,1,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [0,0,1,1,0,0],
        [1,1,1,1,1,1]
      ],
      '2': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [0,0,0,0,0,1],
        [0,0,0,1,1,0],
        [0,0,1,0,0,0],
        [1,1,1,1,1,1]
      ],
      '3': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [0,0,0,1,1,0],
        [0,0,0,0,0,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      '4': [
        [0,0,0,1,0,0],
        [0,0,1,1,0,0],
        [0,1,0,1,0,0],
        [1,0,0,1,0,0],
        [1,1,1,1,1,1],
        [0,0,0,1,0,0]
      ],
      '5': [
        [1,1,1,1,1,1],
        [1,0,0,0,0,0],
        [1,1,1,1,1,0],
        [0,0,0,0,0,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      '6': [
        [0,0,1,1,0,0],
        [0,1,0,0,0,0],
        [1,1,1,1,1,0],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      '7': [
        [1,1,1,1,1,1],
        [0,0,0,0,0,1],
        [0,0,0,0,1,0],
        [0,0,0,1,0,0],
        [0,0,1,0,0,0],
        [0,0,1,0,0,0]
      ],
      '8': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      '9': [
        [0,1,1,1,1,0],
        [1,0,0,0,0,1],
        [1,0,0,0,0,1],
        [0,1,1,1,1,1],
        [0,0,0,0,0,1],
        [0,1,1,1,1,0]
      ],
      ' ': [
        [0,0,0,0,0,0],
        [0,0,0,0,0,0],
        [0,0,0,0,0,0],
        [0,0,0,0,0,0],
        [0,0,0,0,0,0],
        [0,0,0,0,0,0]
      ]
    };
  }

  circle(count, radius = 10) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      positions.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: 0
      });
    }
    return positions;
  }

  square(count, size = 10) {
    const positions = [];
    const perSide = Math.ceil(count / 4);
    
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < perSide && positions.length < count; i++) {
        const t = i / perSide;
        let x, y;
        
        switch (side) {
          case 0:
            x = -size + t * size * 2;
            y = size;
            break;
          case 1:
            x = size;
            y = size - t * size * 2;
            break;
          case 2:
            x = size - t * size * 2;
            y = -size;
            break;
          case 3:
            x = -size;
            y = -size + t * size * 2;
            break;
        }
        
        positions.push({ x, y, z: 0 });
      }
    }
    
    return positions.slice(0, count);
  }

  triangle(count, size = 10) {
    const positions = [];
    const height = size * Math.sqrt(3) / 2;
    const perSide = Math.ceil(count / 3);
    
    const vertices = [
      { x: 0, y: height * 2 / 3 },
      { x: -size / 2, y: -height / 3 },
      { x: size / 2, y: -height / 3 }
    ];
    
    for (let side = 0; side < 3; side++) {
      const start = vertices[side];
      const end = vertices[(side + 1) % 3];
      
      for (let i = 0; i < perSide && positions.length < count; i++) {
        const t = i / perSide;
        positions.push({
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          z: 0
        });
      }
    }
    
    return positions;
  }

  star(count, size = 10) {
    const positions = [];
    const points = 5;
    const outerRadius = size;
    const innerRadius = size * 0.4;
    
    const totalPoints = points * 2;
    const perSegment = Math.ceil(count / totalPoints);
    
    for (let i = 0; i < totalPoints; i++) {
      const angle1 = (i / totalPoints) * Math.PI * 2 - Math.PI / 2;
      const angle2 = ((i + 1) / totalPoints) * Math.PI * 2 - Math.PI / 2;
      const radius1 = i % 2 === 0 ? outerRadius : innerRadius;
      const radius2 = (i + 1) % 2 === 0 ? outerRadius : innerRadius;
      
      const start = {
        x: Math.cos(angle1) * radius1,
        y: Math.sin(angle1) * radius1
      };
      const end = {
        x: Math.cos(angle2) * radius2,
        y: Math.sin(angle2) * radius2
      };
      
      for (let j = 0; j < perSegment && positions.length < count; j++) {
        const t = j / perSegment;
        positions.push({
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          z: 0
        });
      }
    }
    
    return positions.slice(0, count);
  }

  heart(count, size = 10) {
    const positions = [];
    const points = Math.max(count, 50);
    
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      
      positions.push({
        x: x * size / 16,
        y: y * size / 16,
        z: 0
      });
    }
    
    return positions;
  }

  text(text, count, size = 10) {
    text = text.toUpperCase();
    const allPoints = [];
    const charWidth = 7;
    const charHeight = 6;
    const spacing = 1;
    
    let totalWidth = text.length * (charWidth + spacing) - spacing;
    let totalHeight = charHeight;
    
    for (let charIndex = 0; charIndex < text.length; charIndex++) {
      const char = text[charIndex];
      const charMap = this.charMap[char] || this.charMap[' '];
      
      for (let row = 0; row < charMap.length; row++) {
        for (let col = 0; col < charMap[row].length; col++) {
          if (charMap[row][col] === 1) {
            const x = charIndex * (charWidth + spacing) + col - totalWidth / 2;
            const y = charHeight / 2 - row;
            allPoints.push({ x, y, z: 0 });
          }
        }
      }
    }
    
    if (allPoints.length === 0) {
      return this.circle(count, size);
    }
    
    const result = [];
    const scale = size / Math.max(totalWidth, totalHeight);
    
    if (count <= allPoints.length) {
      const step = Math.floor(allPoints.length / count);
      for (let i = 0; i < count; i++) {
        const point = allPoints[i * step];
        result.push({
          x: point.x * scale,
          y: point.y * scale,
          z: point.z
        });
      }
    } else {
      for (let i = 0; i < count; i++) {
        const idx = i % allPoints.length;
        const point = allPoints[idx];
        const layer = Math.floor(i / allPoints.length);
        const offset = layer % 2 === 0 ? 0 : 0.3;
        
        result.push({
          x: point.x * scale + offset,
          y: point.y * scale + offset,
          z: Math.floor(layer / 2) * 0.5
        });
      }
    }
    
    return result;
  }

  spiral(count, radius = 10, turns = 3) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * turns * Math.PI * 2;
      const r = t * radius;
      
      positions.push({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        z: t * 5
      });
    }
    return positions;
  }

  grid(count, size = 10) {
    const positions = [];
    const side = Math.ceil(Math.sqrt(count));
    const spacing = (size * 2) / (side - 1 || 1);
    
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / side);
      const col = i % side;
      
      positions.push({
        x: -size + col * spacing,
        y: -size + row * spacing,
        z: 0
      });
    }
    
    return positions;
  }

  helix(count, radius = 10, height = 20) {
    const positions = [];
    const turns = 3;
    
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const angle = t * turns * Math.PI * 2;
      
      positions.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: t * height - height / 2
      });
    }
    
    return positions;
  }
}

export default PatternGenerator;
