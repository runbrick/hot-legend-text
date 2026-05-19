// Character state management
class Character {
  constructor(data = null) {
    if (data) {
      this.load(data);
    } else {
      this.reset();
    }
  }

  reset() {
    this.name = '';
    this.className = '';
    this.classId = '';
    this.level = 1;
    this.exp = 0;
    this.gold = 0;
    this.hp = 0;
    this.maxHp = 0;
    this.mp = 0;
    this.maxMp = 0;
    this.baseStats = { attack: 0, defense: 0, magicAttack: 0, magicDefense: 0 };
    this.allocatedStats = { attack: 0, defense: 0, magicAttack: 0, magicDefense: 0 };
    this.pendingStatPoints = 0;
    this.equipment = {
      weapon: null,
      armor: null,
      helmet: null,
      necklace: null,
      bracelet1: null,
      bracelet2: null,
      ring1: null,
      ring2: null
    };
    this.skills = []; // { name, level: 0-3, exp }
    this.inventory = []; // [{ name, quantity, type }]
    this.currentMapId = 'bichon_wild';
  }

  create(name, className, classData) {
    this.name = name;
    this.className = className;
    this.classId = classData.id;
    this.level = 1;
    this.exp = 0;
    this.gold = 500;
    this.baseStats = { ...classData.baseStats };
    this.allocatedStats = { attack: 0, defense: 0, magicAttack: 0, magicDefense: 0 };
    this.pendingStatPoints = 0;
    this.maxHp = classData.baseHp;
    this.hp = this.maxHp;
    this.maxMp = classData.baseMp;
    this.mp = this.maxMp;
    this.equipment = { ...classData.startingEquipment };
    this.skills = [];
    this.inventory = [];

    // Add starting items
    for (const item of classData.startingItems) {
      this.addItem(item.name, item.quantity);
    }

    // Learn initial skills
    this.checkNewSkills();
  }

  // Total stats = base + allocated + equipment
  getTotalStats() {
    const totals = {
      attack: this.baseStats.attack + this.allocatedStats.attack,
      defense: this.baseStats.defense + this.allocatedStats.defense,
      magicAttack: this.baseStats.magicAttack + this.allocatedStats.magicAttack,
      magicDefense: this.baseStats.magicDefense + this.allocatedStats.magicDefense
    };

    // Add equipment stats (equipment slots store item names, look up stats)
    for (const itemName of Object.values(this.equipment)) {
      if (!itemName) continue;
      const eq = this.findEquipmentData(itemName);
      if (eq && eq.stats) {
        for (const [key, val] of Object.entries(eq.stats)) {
          if (totals[key] !== undefined) {
            totals[key] += val;
          }
        }
      }
    }

    return totals;
  }

  // Add experience, return true if leveled up
  addExp(amount) {
    this.exp += amount;
    const expNeeded = this.expToNextLevel();
    if (this.exp >= expNeeded) {
      this.exp -= expNeeded;
      this.levelUp();
      return true;
    }
    return false;
  }

  expToNextLevel() {
    return Math.floor(50 * Math.pow(this.level, 1.5) + 20);
  }

  levelUp() {
    this.level++;
    this.maxHp += 22;
    this.hp = this.maxHp;
    this.maxMp += 8;
    this.mp = this.maxMp;

    // Add base stat growth
    if (this.classId === 'warrior') {
      this.baseStats.attack += 3;
      this.baseStats.defense += 2;
      this.baseStats.magicDefense += 1;
    } else if (this.classId === 'wizard') {
      this.baseStats.attack += 1;
      this.baseStats.defense += 1;
      this.baseStats.magicAttack += 3;
      this.baseStats.magicDefense += 2;
    } else if (this.classId === 'taoist') {
      this.baseStats.attack += 2;
      this.baseStats.defense += 1;
      this.baseStats.magicAttack += 2;
      this.baseStats.magicDefense += 2;
    }

    this.pendingStatPoints += 5;
    this.checkNewSkills();
  }

  checkNewSkills() {
    const skillsData = window.gameData?.skills?.[this.className];
    if (!skillsData) return;

    for (const skillDef of skillsData) {
      if (this.level >= skillDef.learnLevel && !this.skills.find(s => s.name === skillDef.name)) {
        this.skills.push({
          name: skillDef.name,
          level: 0,
          exp: 0,
          maxLevel: skillDef.maxLevel
        });
      }
    }
  }

  // Allocate a stat point
  allocateStat(stat) {
    if (this.pendingStatPoints <= 0) return false;
    if (!['attack', 'defense', 'magicAttack', 'magicDefense'].includes(stat)) return false;
    this.allocatedStats[stat]++;
    this.pendingStatPoints--;
    return true;
  }

  // Add skill experience from combat
  addSkillExp(amount) {
    for (const skill of this.skills) {
      if (skill.level >= skill.maxLevel) continue;
      skill.exp += amount;
      const needed = this.skillExpNeeded(skill.level);
      if (skill.exp >= needed) {
        skill.exp -= needed;
        skill.level++;
      }
    }
  }

  skillExpNeeded(currentLevel) {
    return 100 * Math.pow(2, currentLevel);
  }

  // Look up equipment data from game data
  findEquipmentData(name) {
    const eq = window.gameData?.equipment?.equipment;
    if (!eq) return null;
    for (const slot of Object.keys(eq)) {
      const item = eq[slot].find(e => e.name === name);
      if (item) return item;
    }
    return null;
  }

  // Compute combat power (rough estimate for map eligibility)
  getCombatPower() {
    const stats = this.getTotalStats();
    return stats.attack * 3 + stats.magicAttack * 4 + stats.defense * 2 + stats.magicDefense * 2;
  }

  // Inventory management
  addItem(name, quantity = 1) {
    const existing = this.inventory.find(i => i.name === name);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.inventory.push({ name, quantity });
    }
  }

  removeItem(name, quantity = 1) {
    const existing = this.inventory.find(i => i.name === name);
    if (!existing) return false;
    existing.quantity -= quantity;
    if (existing.quantity <= 0) {
      this.inventory = this.inventory.filter(i => i.name !== name);
    }
    return true;
  }

  getItemCount(name) {
    const item = this.inventory.find(i => i.name === name);
    return item ? item.quantity : 0;
  }

  // Serialization
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      className: this.className,
      classId: this.classId,
      level: this.level,
      exp: this.exp,
      gold: this.gold,
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      baseStats: { ...this.baseStats },
      allocatedStats: { ...this.allocatedStats },
      pendingStatPoints: this.pendingStatPoints,
      equipment: { ...this.equipment },
      skills: this.skills.map(s => ({ ...s })),
      inventory: this.inventory.map(i => ({ ...i })),
      currentMapId: this.currentMapId
    };
  }

  load(data) {
    this.id = data.id || Date.now().toString();
    this.name = data.name;
    this.className = data.className;
    this.classId = data.classId;
    this.level = data.level;
    this.exp = data.exp;
    this.gold = data.gold;
    this.hp = data.hp;
    this.maxHp = data.maxHp;
    this.mp = data.mp;
    this.maxMp = data.maxMp;
    this.baseStats = { ...data.baseStats };
    this.allocatedStats = { ...data.allocatedStats };
    this.pendingStatPoints = data.pendingStatPoints || 0;
    this.equipment = { ...data.equipment };
    this.skills = (data.skills || []).map(s => ({ ...s }));
    this.inventory = (data.inventory || []).map(i => ({ ...i }));
    this.currentMapId = data.currentMapId || 'bichon_wild';
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Character;
}
