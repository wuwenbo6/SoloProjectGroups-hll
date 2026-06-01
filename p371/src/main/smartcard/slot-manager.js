const { EventEmitter } = require('events');

class SlotManager extends EventEmitter {
  constructor() {
    super();
    this._slots = new Map();
    this._slotToReader = new Map();
    this._readerToSlot = new Map();
    this._maxSlots = 8;
  }

  setMaxSlots(count) {
    this._maxSlots = count;
  }

  getMaxSlots() {
    return this._maxSlots;
  }

  addSlot(slotId) {
    if (!this._slots.has(slotId)) {
      this._slots.set(slotId, {
        id: slotId,
        readerName: null,
        connected: false,
        atr: null,
        virtual: false,
      });
      this.emit('slot-added', { slotId });
    }
  }

  removeSlot(slotId) {
    const slot = this._slots.get(slotId);
    if (slot) {
      if (slot.readerName) {
        this._readerToSlot.delete(slot.readerName);
      }
      this._slotToReader.delete(slotId);
      this._slots.delete(slotId);
      this.emit('slot-removed', { slotId });
    }
  }

  getSlot(slotId) {
    return this._slots.get(slotId) || null;
  }

  getAllSlots() {
    return Array.from(this._slots.values()).sort((a, b) => a.id - b.id);
  }

  getAvailableSlots() {
    return Array.from(this._slots.values())
      .filter((s) => !s.readerName)
      .sort((a, b) => a.id - b.id);
  }

  getUsedSlots() {
    return Array.from(this._slots.values())
      .filter((s) => s.readerName)
      .sort((a, b) => a.id - b.id);
  }

  assignReaderToSlot(slotId, readerName) {
    const slot = this._slots.get(slotId);
    if (!slot) {
      throw new Error(`Slot ${slotId} does not exist`);
    }

    const prevReader = slot.readerName;
    if (prevReader) {
      this._readerToSlot.delete(prevReader);
    }

    const prevSlot = this._readerToSlot.get(readerName);
    if (prevSlot !== undefined && prevSlot !== slotId) {
      const oldSlot = this._slots.get(prevSlot);
      if (oldSlot) {
        oldSlot.readerName = null;
        oldSlot.connected = false;
        oldSlot.atr = null;
      }
    }

    slot.readerName = readerName;
    this._slotToReader.set(slotId, readerName);
    this._readerToSlot.set(readerName, slotId);

    this.emit('slot-assigned', { slotId, readerName });

    return true;
  }

  unassignSlot(slotId) {
    const slot = this._slots.get(slotId);
    if (slot && slot.readerName) {
      const readerName = slot.readerName;
      this._readerToSlot.delete(readerName);
      this._slotToReader.delete(slotId);
      slot.readerName = null;
      slot.connected = false;
      slot.atr = null;
      this.emit('slot-unassigned', { slotId, readerName });
      return true;
    }
    return false;
  }

  getSlotForReader(readerName) {
    return this._readerToSlot.get(readerName);
  }

  getReaderForSlot(slotId) {
    return this._slotToReader.get(slotId);
  }

  setSlotStatus(slotId, status) {
    const slot = this._slots.get(slotId);
    if (slot) {
      if (status.connected !== undefined) slot.connected = status.connected;
      if (status.atr !== undefined) slot.atr = status.atr;
      this.emit('slot-status-changed', { slotId, status: { ...slot } });
    }
  }

  autoAssignReader(readerName, preferSlotId = null) {
    if (preferSlotId !== null) {
      const slot = this._slots.get(preferSlotId);
      if (slot && !slot.readerName) {
        this.assignReaderToSlot(preferSlotId, readerName);
        return preferSlotId;
      }
    }

    const available = this.getAvailableSlots();
    if (available.length > 0) {
      this.assignReaderToSlot(available[0].id, readerName);
      return available[0].id;
    }

    let newSlotId = 0;
    while (this._slots.has(newSlotId)) {
      newSlotId++;
    }

    if (newSlotId < this._maxSlots) {
      this.addSlot(newSlotId);
      this.assignReaderToSlot(newSlotId, readerName);
      return newSlotId;
    }

    throw new Error('No available slots');
  }

  swapSlots(slotId1, slotId2) {
    const slot1 = this._slots.get(slotId1);
    const slot2 = this._slots.get(slotId2);

    if (!slot1 || !slot2) {
      throw new Error('One or both slots do not exist');
    }

    const reader1 = slot1.readerName;
    const reader2 = slot2.readerName;

    if (reader1) {
      this._readerToSlot.set(reader1, slotId2);
    } else {
      this._readerToSlot.delete(reader1);
    }

    if (reader2) {
      this._readerToSlot.set(reader2, slotId1);
    } else {
      this._readerToSlot.delete(reader2);
    }

    if (reader1) this._slotToReader.set(slotId2, reader1);
    else this._slotToReader.delete(slotId2);

    if (reader2) this._slotToReader.set(slotId1, reader2);
    else this._slotToReader.delete(slotId1);

    slot1.readerName = reader2;
    slot2.readerName = reader1;

    const connectedTemp = slot1.connected;
    const atrTemp = slot1.atr;
    slot1.connected = slot2.connected;
    slot1.atr = slot2.atr;
    slot2.connected = connectedTemp;
    slot2.atr = atrTemp;

    this.emit('slot-swapped', { slotId1, slotId2 });

    return true;
  }

  clearAll() {
    for (const slotId of this._slots.keys()) {
      this.removeSlot(slotId);
    }
  }
}

module.exports = { SlotManager };
