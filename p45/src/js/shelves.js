import * as THREE from 'three';

export class ShelfManager {
    constructor(scene) {
        this.scene = scene;
        this.shelves = [];
        this.tags = [];
        this.shelfGroup = new THREE.Group();
        this.scene.add(this.shelfGroup);
    }
    
    createShelf(x, z, rotation = 0, width = 2, depth = 0.6, height = 2.5, levels = 4) {
        const shelf = {
            id: `shelf_${this.shelves.length}`,
            position: { x, z },
            rotation,
            width,
            depth,
            height,
            levels,
            tags: []
        };
        
        const group = new THREE.Group();
        
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x607D8B,
            metalness: 0.6,
            roughness: 0.4
        });
        
        const shelfMaterial = new THREE.MeshStandardMaterial({
            color: 0x8D6E63,
            roughness: 0.8
        });
        
        const legGeometry = new THREE.BoxGeometry(0.05, height, 0.05);
        const legPositions = [
            [-width / 2, height / 2, -depth / 2],
            [width / 2, height / 2, -depth / 2],
            [-width / 2, height / 2, depth / 2],
            [width / 2, height / 2, depth / 2]
        ];
        
        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeometry, frameMaterial);
            leg.position.set(...pos);
            leg.castShadow = true;
            group.add(leg);
        });
        
        const levelHeight = height / levels;
        const shelfPlateGeometry = new THREE.BoxGeometry(width, 0.03, depth);
        
        for (let i = 0; i < levels; i++) {
            const y = i * levelHeight + 0.1;
            const plate = new THREE.Mesh(shelfPlateGeometry, shelfMaterial);
            plate.position.set(0, y, 0);
            plate.castShadow = true;
            plate.receiveShadow = true;
            group.add(plate);
            
            const tagsPerLevel = Math.floor(width / 0.3);
            for (let j = 0; j < tagsPerLevel; j++) {
                const tagX = -width / 2 + 0.15 + j * 0.3;
                const tag = this.createRFIDTag(
                    shelf.id,
                    tagX,
                    y + 0.1,
                    depth / 2 - 0.05,
                    { shelfId: shelf.id, level: i, position: j }
                );
                group.add(tag.mesh);
                shelf.tags.push(tag);
                this.tags.push(tag);
            }
        }
        
        group.position.set(x, 0, z);
        group.rotation.y = rotation;
        
        shelf.group = group;
        this.shelves.push(shelf);
        this.shelfGroup.add(group);
        
        return shelf;
    }
    
    createRFIDTag(shelfId, x, y, z, metadata) {
        const tagId = `tag_${shelfId}_${metadata.level}_${metadata.position}`;
        
        const geometry = new THREE.BoxGeometry(0.1, 0.05, 0.01);
        const material = new THREE.MeshStandardMaterial({
            color: 0x4CAF50,
            emissive: 0x1B5E20,
            emissiveIntensity: 0.1
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        
        return {
            id: tagId,
            mesh,
            position: { x, y, z },
            metadata,
            scanned: false,
            scanTime: null
        };
    }
    
    createDefaultLayout() {
        this.clearAll();
        
        const shelfWidth = 3;
        const shelfDepth = 0.6;
        const aisleWidth = 2.5;
        const rows = 3;
        const cols = 4;
        
        const totalWidth = cols * (shelfWidth + aisleWidth) - aisleWidth;
        const totalDepth = rows * (shelfDepth * 2 + aisleWidth) - aisleWidth;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * (shelfWidth + aisleWidth) - totalWidth / 2 + shelfWidth / 2;
                const z = row * (shelfDepth * 2 + aisleWidth) - totalDepth / 2;
                
                this.createShelf(x, z, 0, shelfWidth, shelfDepth, 2.5, 4);
                this.createShelf(x, z + shelfDepth + 0.5, Math.PI, shelfWidth, shelfDepth, 2.5, 4);
            }
        }
    }
    
    clearAll() {
        this.shelves.forEach(shelf => {
            this.shelfGroup.remove(shelf.group);
        });
        this.shelves = [];
        this.tags = [];
    }
    
    loadLayout(layout) {
        this.clearAll();
        
        if (layout.shelves) {
            layout.shelves.forEach(shelfData => {
                this.createShelf(
                    shelfData.position.x,
                    shelfData.position.z,
                    shelfData.rotation || 0,
                    shelfData.width || 2,
                    shelfData.depth || 0.6,
                    shelfData.height || 2.5,
                    shelfData.levels || 4
                );
            });
        }
    }
    
    exportLayout() {
        return {
            version: '1.0',
            created: new Date().toISOString(),
            shelves: this.shelves.map(shelf => ({
                id: shelf.id,
                position: { x: shelf.position.x, z: shelf.position.z },
                rotation: shelf.rotation,
                width: shelf.width,
                depth: shelf.depth,
                height: shelf.height,
                levels: shelf.levels,
                tagCount: shelf.tags.length
            }))
        };
    }
    
    getAllTags() {
        return this.tags;
    }
    
    getTagById(tagId) {
        return this.tags.find(tag => tag.id === tagId);
    }
    
    getTagsInRange(position, range = 2) {
        const tagsInRange = [];
        
        this.shelves.forEach(shelf => {
            shelf.tags.forEach(tag => {
                const worldPos = tag.mesh.getWorldPosition(new THREE.Vector3());
                const distance = Math.sqrt(
                    Math.pow(worldPos.x - position.x, 2) +
                    Math.pow(worldPos.z - position.z, 2)
                );
                
                if (distance <= range) {
                    tagsInRange.push({
                        ...tag,
                        worldPosition: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
                        distance
                    });
                }
            });
        });
        
        return tagsInRange;
    }
    
    highlightTag(tagId, scanned = true) {
        const tag = this.getTagById(tagId);
        if (tag) {
            tag.scanned = scanned;
            if (scanned) {
                tag.mesh.material.color.setHex(0x8BC34A);
                tag.mesh.material.emissive.setHex(0x7CB342);
                tag.mesh.material.emissiveIntensity = 0.5;
            }
        }
    }
    
    resetAllTags() {
        this.tags.forEach(tag => {
            tag.scanned = false;
            tag.scanTime = null;
            tag.mesh.material.color.setHex(0x4CAF50);
            tag.mesh.material.emissive.setHex(0x1B5E20);
            tag.mesh.material.emissiveIntensity = 0.1;
        });
    }
}
