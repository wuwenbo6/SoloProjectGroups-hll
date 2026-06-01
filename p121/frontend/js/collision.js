class AABBNode {
    constructor(min, max, elementId) {
        this.min = min;
        this.max = max;
        this.elementId = elementId;
        this.left = null;
        this.right = null;
        this.isLeaf = true;
    }
}

class AABBBroadPhase {
    constructor() {
        this.root = null;
        this.elements = [];
    }

    build(elements) {
        this.elements = elements.filter(e => e.aabb_min && e.aabb_max);

        if (this.elements.length === 0) {
            this.root = null;
            return;
        }

        const boxes = this.elements.map(e => ({
            id: e.id,
            ifcId: e.ifc_id,
            ifcType: e.ifc_type,
            name: e.name,
            min: this.parseAabb(e.aabb_min),
            max: this.parseAabb(e.aabb_max),
        }));

        this.root = this._buildRecursive(boxes);
    }

    _buildRecursive(boxes) {
        if (boxes.length === 0) return null;

        if (boxes.length === 1) {
            return new AABBNode(boxes[0].min, boxes[0].max, boxes[0].id);
        }

        const centroid = this._computeCentroid(boxes);
        const axis = this._findLongestAxis(boxes);

        const sorted = [...boxes].sort((a, b) => {
            const ca = (a.min[axis] + a.max[axis]) / 2;
            const cb = (b.min[axis] + b.max[axis]) / 2;
            return ca - cb;
        });

        const mid = Math.floor(sorted.length / 2);
        const leftBoxes = sorted.slice(0, mid);
        const rightBoxes = sorted.slice(mid);

        const node = new AABBNode(
            this._computeMin(leftBoxes, rightBoxes),
            this._computeMax(leftBoxes, rightBoxes),
            null
        );
        node.isLeaf = false;
        node.left = this._buildRecursive(leftBoxes);
        node.right = this._buildRecursive(rightBoxes);

        return node;
    }

    _computeCentroid(boxes) {
        let cx = 0, cy = 0, cz = 0;
        boxes.forEach(b => {
            cx += (b.min[0] + b.max[0]) / 2;
            cy += (b.min[1] + b.max[1]) / 2;
            cz += (b.min[2] + b.max[2]) / 2;
        });
        return [cx / boxes.length, cy / boxes.length, cz / boxes.length];
    }

    _findLongestAxis(boxes) {
        const ranges = [0, 0, 0];
        boxes.forEach(b => {
            for (let i = 0; i < 3; i++) {
                ranges[i] = Math.max(ranges[i], b.max[i] - b.min[i]);
            }
        });
        return ranges.indexOf(Math.max(...ranges));
    }

    _computeMin(left, right) {
        const result = [Infinity, Infinity, Infinity];
        [...left, ...right].forEach(b => {
            for (let i = 0; i < 3; i++) {
                result[i] = Math.min(result[i], b.min[i]);
            }
        });
        return result;
    }

    _computeMax(left, right) {
        const result = [-Infinity, -Infinity, -Infinity];
        [...left, ...right].forEach(b => {
            for (let i = 0; i < 3; i++) {
                result[i] = Math.max(result[i], b.max[i]);
            }
        });
        return result;
    }

    parseAabb(aabbStr) {
        return aabbStr.split(',').map(parseFloat);
    }

    findCollisions() {
        if (!this.root) return [];

        const collisions = [];
        const checked = new Set();

        this._collectLeafBoxes(this.root, []);
        const leafBoxes = [];
        this._collectLeaves(this.root, leafBoxes);

        for (let i = 0; i < leafBoxes.length; i++) {
            for (let j = i + 1; j < leafBoxes.length; j++) {
                const key = `${Math.min(leafBoxes[i].elementId, leafBoxes[j].elementId)}-${Math.max(leafBoxes[i].elementId, leafBoxes[j].elementId)}`;
                if (checked.has(key)) continue;
                checked.add(key);

                if (this._intersect(leafBoxes[i], leafBoxes[j])) {
                    const elemA = this.elements.find(e => e.id === leafBoxes[i].elementId);
                    const elemB = this.elements.find(e => e.id === leafBoxes[j].elementId);
                    if (elemA && elemB) {
                        collisions.push({
                            element_a: {
                                id: elemA.id,
                                ifc_id: elemA.ifc_id,
                                ifc_type: elemA.ifc_type,
                                name: elemA.name,
                            },
                            element_b: {
                                id: elemB.id,
                                ifc_id: elemB.ifc_id,
                                ifc_type: elemB.ifc_type,
                                name: elemB.name,
                            },
                        });
                    }
                }
            }
        }

        return collisions;
    }

    _collectLeaves(node, result) {
        if (!node) return;
        if (node.isLeaf) {
            result.push(node);
        } else {
            this._collectLeaves(node.left, result);
            this._collectLeaves(node.right, result);
        }
    }

    _collectLeafBoxes(node, boxes) {
        if (!node) return;
        if (node.isLeaf) {
            boxes.push(node);
        } else {
            this._collectLeafBoxes(node.left, boxes);
            this._collectLeafBoxes(node.right, boxes);
        }
    }

    _intersect(nodeA, nodeB) {
        return (
            nodeA.min[0] <= nodeB.max[0] && nodeB.min[0] <= nodeA.max[0] &&
            nodeA.min[1] <= nodeB.max[1] && nodeB.min[1] <= nodeA.max[1] &&
            nodeA.min[2] <= nodeB.max[2] && nodeB.min[2] <= nodeA.max[2]
        );
    }

    findByPoint(x, y, z) {
        const results = [];
        this._searchPoint(this.root, x, y, z, results);
        return results;
    }

    _searchPoint(node, x, y, z, results) {
        if (!node) return;

        if (node.min[0] <= x && x <= node.max[0] &&
            node.min[1] <= y && y <= node.max[1] &&
            node.min[2] <= z && z <= node.max[2]) {

            if (node.isLeaf) {
                results.push(node.elementId);
            } else {
                this._searchPoint(node.left, x, y, z, results);
                this._searchPoint(node.right, x, y, z, results);
            }
        }
    }
}

window.AABBBroadPhase = AABBBroadPhase;
