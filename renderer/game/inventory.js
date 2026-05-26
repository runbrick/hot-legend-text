// Equipment and inventory management utilities
var Inventory = {
  // Find equipment in data by name
  findEquipment(name) {
    if (!name) return null;
    const eq = window.gameData.equipment.equipment;
    for (const slot of Object.keys(eq)) {
      const item = eq[slot].find(e => e.name === name);
      if (item) return { ...item, slot };
    }
    return null;
  },

  // Get equipment slot by name
  getEquipmentSlot(name) {
    const eq = window.gameData.equipment.equipment;
    for (const slot of Object.keys(eq)) {
      if (eq[slot].find(e => e.name === name)) return slot;
    }
    return null;
  },

  // Check if equipment can be used by character
  canEquip(character, equipment) {
    if (character.level < equipment.level) return false;
    if (equipment.classes && !equipment.classes.includes(character.className)) return false;
    return true;
  },

  // Equip an item from inventory. targetSlotKey allows choosing which slot to replace.
  equip(character, itemName, targetSlotKey = null) {
    const invItem = character.inventory.find(i => i.name === itemName);
    if (!invItem) return { success: false, error: '背包中没有此物品' };

    const eq = this.findEquipment(itemName);
    if (!eq) return { success: false, error: '此物品无法装备' };

    if (!this.canEquip(character, eq)) {
      return { success: false, error: '等级不足或职业不符，无法装备此物品' };
    }

    const slot = this.getEquipmentSlot(itemName);

    // Map data slot names to character equipment keys
    const slotMap = {
      'weapons': 'weapon',
      'armors': 'armor',
      'helmets': 'helmet',
      'necklaces': 'necklace',
      'bracelets': 'bracelet1',
      'rings': 'ring1'
    };

    // For bracelets and rings, respect targetSlotKey or auto-pick
    if (slot === 'bracelets') {
      if (targetSlotKey && ['bracelet1', 'bracelet2'].includes(targetSlotKey)) {
        return this._swapEquip(character, itemName, targetSlotKey);
      }
      if (!character.equipment.bracelet1) {
        return this._swapEquip(character, itemName, 'bracelet1');
      } else if (!character.equipment.bracelet2) {
        return this._swapEquip(character, itemName, 'bracelet2');
      } else {
        return { needSlotChoice: true, slot: 'bracelets', options: ['bracelet1', 'bracelet2'] };
      }
    } else if (slot === 'rings') {
      if (targetSlotKey && ['ring1', 'ring2'].includes(targetSlotKey)) {
        return this._swapEquip(character, itemName, targetSlotKey);
      }
      if (!character.equipment.ring1) {
        return this._swapEquip(character, itemName, 'ring1');
      } else if (!character.equipment.ring2) {
        return this._swapEquip(character, itemName, 'ring2');
      } else {
        return { needSlotChoice: true, slot: 'rings', options: ['ring1', 'ring2'] };
      }
    }

    const charSlotKey = slotMap[slot];
    return this._swapEquip(character, itemName, charSlotKey);
  },

  _swapEquip(character, itemName, charSlotKey) {
    const oldEquip = character.equipment[charSlotKey];
    // Remove from inventory
    character.removeItem(itemName, 1);
    // Put old equipment back to inventory
    if (oldEquip) {
      character.addItem(oldEquip, 1);
    }
    // Set new
    character.equipment[charSlotKey] = itemName;
    return { success: true };
  },

  // Unequip item to inventory
  unequip(character, slotKey) {
    const itemName = character.equipment[slotKey];
    if (!itemName) return { success: false, error: '该槽位没有装备' };

    character.addItem(itemName, 1);
    character.equipment[slotKey] = null;
    return { success: true };
  },

  // Compare two equipment items, return differences
  compareEquipment(currentName, newName) {
    const current = currentName ? this.findEquipment(currentName) : null;
    const newEq = newName ? this.findEquipment(newName) : null;

    const diff = {
      attack: 0, defense: 0, magicAttack: 0, magicDefense: 0, hp: 0, mp: 0
    };

    if (newEq) {
      for (const key of Object.keys(diff)) {
        diff[key] = (newEq.stats?.[key] || 0) - (current?.stats?.[key] || 0);
      }
    }

    return diff;
  },

  // Get gear score from equipment slot (for comparing drops)
  getEquipmentScore(equipment) {
    if (!equipment || !equipment.stats) return 0;
    const s = equipment.stats;
    return (s.attack || 0) * 3 + (s.magicAttack || 0) * 4 + (s.defense || 0) * 2 + (s.magicDefense || 0) * 2 + (s.hp || 0) * 0.5 + (s.mp || 0) * 0.3;
  },

  // Sell item from inventory
  sell(character, itemName, quantity = 1) {
    const invItem = character.inventory.find(i => i.name === itemName);
    if (!invItem) return { success: false, error: '背包中没有此物品' };
    const qty = Math.min(quantity, invItem.quantity);

    const eq = this.findEquipment(itemName);
    let unitPrice = 1;
    if (eq) {
      unitPrice = eq.sellPrice;
    } else {
      const potionData = window.gameData?.items?.potions?.find(p => p.name === itemName);
      if (potionData) {
        unitPrice = potionData.sellPrice;
      }
    }
    character.gold += unitPrice * qty;
    character.removeItem(itemName, qty);
    return { success: true };
  },

  // Discard item
  discard(character, itemName) {
    return character.removeItem(itemName, 1);
  },

  // Buy potion
  buyPotion(character, potionName, quantity = 1) {
    const potion = window.gameData?.items?.potions?.find(p => p.name === potionName);
    if (!potion) return { success: false, error: '商店中没有此物品' };

    const totalCost = potion.buyPrice * quantity;
    if (character.gold < totalCost) return { success: false, error: '金币不足' };

    character.gold -= totalCost;
    character.addItem(potionName, quantity);
    return { success: true };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Inventory;
}
