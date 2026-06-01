import copy


class Bitmap:
    def __init__(self, size=256):
        self.size = size
        self.bits = set()

    def set_bit(self, block_id):
        if 0 <= block_id < self.size:
            self.bits.add(block_id)

    def clear_bit(self, block_id):
        self.bits.discard(block_id)

    def is_set(self, block_id):
        return block_id in self.bits

    def clear_all(self):
        self.bits.clear()

    def get_dirty_blocks(self):
        return sorted(self.bits)

    def dirty_count(self):
        return len(self.bits)

    def diff(self, other):
        only_self = self.bits - other.bits
        only_other = other.bits - self.bits
        common = self.bits & other.bits
        return only_self, only_other, common

    def merge_from(self, other):
        self.bits |= other.bits

    def to_dict(self):
        return {"size": self.size, "dirty_blocks": sorted(self.bits)}

    def to_grid(self, cols=16):
        grid = []
        for i in range(self.size):
            row = i // cols
            col = i % cols
            if row >= len(grid):
                grid.append([])
            grid[row].append(1 if i in self.bits else 0)
        return grid

    def clone(self):
        b = Bitmap(self.size)
        b.bits = copy.copy(self.bits)
        return b
