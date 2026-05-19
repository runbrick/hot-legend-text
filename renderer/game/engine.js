// Game engine - combat loop, AI, loot, auto-potion
var GameEngine = {
  tickInterval: null,
  tickSpeed: 2000, // ms per combat round
  character: null,
  citiesData: null,
  dungeonsData: null,
  monsterData: null,
  combatLog: [],
  maxCombatLog: 100,
  isRunning: false,
  currentMonster: null,
  callbacks: null,

  init(character, callbacks) {
    this.character = character;
    this.citiesData = window.gameData.maps.cities;
    this.dungeonsData = window.gameData.maps.dungeons;
    this.monsterData = window.gameData.monsters;
    this.callbacks = callbacks || {};
    this.combatLog = [];
    this.currentMonster = null;
  },

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.addLog('system', '开始挂机...');
    this.tickInterval = setInterval(() => this.tick(), this.tickSpeed);
  },

  stop() {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.addLog('system', '挂机已停止');
  },

  setSpeed(ms) {
    this.tickSpeed = ms;
    if (this.isRunning) {
      clearInterval(this.tickInterval);
      this.tickInterval = setInterval(() => this.tick(), this.tickSpeed);
    }
  },

  isInCity() {
    return this.getCurrentCity() !== null;
  },

  getCurrentCity() {
    return this.citiesData.find(c => c.id === this.character.currentMapId) || null;
  },

  getCurrentDungeon() {
    return this.dungeonsData.find(d => d.id === this.character.currentMapId) || null;
  },

  tick() {
    const ch = this.character;
    if (!ch) return;

    // In city: no combat, just regen
    if (this.isInCity()) {
      if (ch.hp < ch.maxHp) {
        ch.hp = Math.min(ch.maxHp, ch.hp + Math.floor(ch.maxHp * 0.05));
      }
      if (ch.mp < ch.maxMp) {
        ch.mp = Math.min(ch.maxMp, ch.mp + Math.floor(ch.maxMp * 0.05));
      }
      if (this.callbacks.onUpdate) this.callbacks.onUpdate();
      return;
    }

    if (ch.hp <= 0) {
      this.handleDeath();
      return;
    }

    // In dungeon: combat
    const dungeon = this.getCurrentDungeon();
    if (!dungeon) {
      this.retreatToTown('未知区域');
      return;
    }

    const monster = this.getCurrentMonster(dungeon);
    if (!monster) {
      this.retreatToTown('该地图没有可挑战的怪物');
      return;
    }

    if (!this.canHandleDungeon(dungeon)) {
      this.retreatToTown('战力不足，自动撤退到最近主城');
      return;
    }

    this.currentMonster = monster;

    const result = this.combatRound(ch, monster);

    if (result.playerDead) {
      ch.hp = 0;
      this.handleDeath();
      return;
    }

    ch.hp = result.playerHp;
    ch.mp = Math.max(0, result.playerMp);

    const leveledUp = ch.addExp(result.expGained);
    ch.gold += result.goldGained;

    this.autoPotion(ch);

    const loot = this.rollLoot(monster);
    for (const item of loot) {
      ch.addItem(item.name, 1);
    }

    ch.addSkillExp(1 + Math.floor(ch.level / 5));

    let msg = '';
    if (result.monsterDead) {
      msg = `[战斗] 击败了 ${monster.name}，获得 ${result.expGained} 经验、${result.goldGained} 金币`;
      if (loot.length > 0) {
        msg += `，掉落：[${loot.map(l => l.name).join('、')}]`;
      }
      if (leveledUp) {
        msg += ` | 【升级！Lv.${ch.level} 获得5点待分配属性】`;
      }
    } else {
      msg = `[战斗] 与 ${monster.name} 战斗中... HP:${result.playerHp}/${ch.maxHp} MP:${result.playerMp}/${ch.maxMp}`;
    }

    this.addLog('combat', msg);

    if (this.callbacks.onUpdate) this.callbacks.onUpdate();

    const skillCountBefore = ch.skills.length;
    ch.checkNewSkills();
    if (ch.skills.length > skillCountBefore) {
      const newSkills = ch.skills.slice(skillCountBefore);
      for (const sk of newSkills) {
        this.addLog('system', `【学会新技能：${sk.name}】`);
      }
    }
  },

  combatRound(ch, monster) {
    const stats = ch.getTotalStats();
    const skillBonus = this.getSkillBonus(ch);

    const playerAtk = stats.attack + skillBonus.attackBonus;
    const playerMatk = stats.magicAttack + skillBonus.magicBonus;
    const totalDamage = (playerAtk + playerMatk) * (0.9 + Math.random() * 0.2);
    const reducedDamage = Math.max(1, Math.floor(totalDamage - monster.defense * 0.3));

    const monsterDamage = Math.max(1, Math.floor(
      monster.attack * (0.9 + Math.random() * 0.2) - (stats.defense + stats.magicDefense) * 0.2
    ));

    const newMonsterHp = monster.hp - reducedDamage;
    const monsterDead = newMonsterHp <= 0;

    let playerHp = ch.hp - monsterDamage;
    const playerDead = playerHp <= 0;

    if (!monsterDead && !playerDead) {
      playerHp -= Math.floor(monsterDamage * 0.6);
    }

    return {
      playerHp: Math.max(0, playerHp),
      playerMp: Math.max(0, ch.mp - Math.floor(stats.magicAttack * 0.3)),
      monsterDead,
      playerDead,
      expGained: monsterDead ? Math.floor(monster.exp * (0.9 + Math.random() * 0.2)) : 0,
      goldGained: monsterDead ? Math.floor(monster.gold * (0.8 + Math.random() * 0.4)) : 0
    };
  },

  getSkillBonus(ch) {
    let attackBonus = 0;
    let magicBonus = 0;

    for (const skill of ch.skills) {
      if (skill.level <= 0) continue;
      const def = window.gameData?.skills?.[ch.className]?.find(s => s.name === skill.name);
      if (!def) continue;

      if (def.effect.type === 'attackPercent') {
        attackBonus += Math.floor(ch.getTotalStats().attack * (def.effect.perLevel * skill.level) / 100);
      } else if (def.effect.type === 'magicPercent') {
        magicBonus += Math.floor(ch.getTotalStats().magicAttack * (def.effect.perLevel * skill.level) / 100);
      } else if (def.effect.type === 'heal' && skill.level > 0) {
        if (ch.hp < ch.maxHp * 0.7) {
          ch.hp = Math.min(ch.maxHp, ch.hp + def.effect.perLevel * skill.level);
        }
      } else if (def.effect.type === 'pet' && skill.level > 0) {
        attackBonus += def.effect.perLevel * skill.level;
      }
    }

    return { attackBonus, magicBonus };
  },

  getCurrentMonster(dungeon) {
    if (!dungeon) return null;
    const monsters = [];
    for (const name of dungeon.monsters) {
      const m = this.monsterData.monsters.find(mo => mo.name === name);
      if (m) {
        const weight = m.isBoss ? 1 : 5;
        for (let i = 0; i < weight; i++) monsters.push(m);
      }
    }
    return monsters.length > 0 ? monsters[Math.floor(Math.random() * monsters.length)] : null;
  },

  canHandleDungeon(dungeon) {
    if (!dungeon) return false;
    const cp = this.character.getCombatPower();
    let highestAttack = 0;
    for (const name of dungeon.monsters) {
      const m = this.monsterData.monsters.find(mo => mo.name === name);
      if (m && m.attack > highestAttack) highestAttack = m.attack;
    }
    return highestAttack <= (cp / 6) * 1.5;
  },

  retreatToTown(reason) {
    const dungeon = this.getCurrentDungeon();
    let cityId = 'bichon_city'; // default
    if (dungeon && dungeon.cityId) {
      cityId = dungeon.cityId;
    } else {
      // Find the nearest city by level
      const chLevel = this.character.level;
      for (let i = this.citiesData.length - 1; i >= 0; i--) {
        if (chLevel >= this.citiesData[i].minLevel) {
          cityId = this.citiesData[i].id;
          break;
        }
      }
    }
    this.character.currentMapId = cityId;
    const city = this.getCurrentCity();
    this.addLog('system', `${reason}，已撤退至 ${city ? city.name : '主城'}`);
    if (this.callbacks.onUpdate) this.callbacks.onUpdate();
  },

  handleDeath() {
    this.addLog('system', '【你被怪物击败了】复活在最近主城，生命值已恢复');
    const ch = this.character;
    const dungeon = this.getCurrentDungeon();
    const cityId = dungeon ? dungeon.cityId : 'bichon_city';
    ch.currentMapId = cityId;
    ch.hp = ch.maxHp;
    ch.mp = ch.maxMp;
    if (this.callbacks.onUpdate) this.callbacks.onUpdate();
  },

  rollLoot(monster) {
    const loot = [];
    if (!monster.drops) return loot;
    for (const drop of monster.drops) {
      if (Math.random() < drop.rate) {
        loot.push({ name: drop.name });
      }
    }
    return loot;
  },

  autoPotion(ch) {
    const hpPercent = ch.hp / ch.maxHp;
    const mpPercent = ch.mp / ch.maxMp;
    if (hpPercent < 0.5) {
      this.useBestPotion(ch, ['金创药(小)', '金创药(中)', '金创药(大)'], 'hp');
    }
    if (mpPercent < 0.3) {
      this.useBestPotion(ch, ['魔法药(小)', '魔法药(中)', '魔法药(大)'], 'mp');
    }
  },

  useBestPotion(ch, potionNames, type) {
    for (const name of potionNames) {
      const count = ch.getItemCount(name);
      if (count > 0) {
        const potionData = window.gameData?.items?.potions?.find(p => p.name === name);
        if (potionData && potionData.effect[type]) {
          ch.removeItem(name, 1);
          ch[type] = Math.min(ch[`max${type.toUpperCase()}`], ch[type] + potionData.effect[type]);
          return;
        }
      }
    }
  },

  // Travel to a city
  travelToCity(cityId) {
    const city = this.citiesData.find(c => c.id === cityId);
    if (!city) return { success: false, error: '主城不存在' };
    if (this.character.level < city.minLevel) return { success: false, error: '等级不足，无法前往此城' };

    this.character.currentMapId = cityId;
    this.currentMonster = null;
    this.addLog('system', `到达 ${city.name}（${city.region}）`);
    if (this.callbacks.onUpdate) this.callbacks.onUpdate();
    return { success: true };
  },

  // Enter a dungeon
  enterDungeon(dungeonId) {
    const dungeon = this.dungeonsData.find(d => d.id === dungeonId);
    if (!dungeon) return { success: false, error: '副本不存在' };

    // Check if player is in the correct city
    const currentCity = this.getCurrentCity();
    if (!currentCity || !currentCity.dungeons.includes(dungeonId)) {
      return { success: false, error: '请先从对应主城进入此副本' };
    }

    this.character.currentMapId = dungeonId;
    this.currentMonster = null;

    if (!this.canHandleDungeon(dungeon)) {
      this.retreatToTown('战力不足以在此副本生存');
      return { success: false, error: '战力不足' };
    }

    this.addLog('system', `进入 ${dungeon.name}，开始战斗！`);
    if (this.callbacks.onUpdate) this.callbacks.onUpdate();
    return { success: true };
  },

  // Buy item from NPC shop
  buyFromShop(itemName, quantity) {
    const city = this.getCurrentCity();
    if (!city) return { success: false, error: '你不在主城中' };

    // Find which NPC sells this item
    let found = false;
    for (const [npcName, npcData] of Object.entries(city.npc)) {
      if (npcData.sells.includes(itemName)) {
        found = true;
        break;
      }
    }
    if (!found) return { success: false, error: '此主城商店没有这个物品' };

    // Use Inventory.buyPotion logic
    const ch = this.character;
    const potion = window.gameData.items.potions.find(p => p.name === itemName);
    const equipment = (() => {
      const eq = window.gameData.equipment.equipment;
      for (const slot of Object.keys(eq)) {
        const item = eq[slot].find(e => e.name === itemName);
        if (item) return item;
      }
      return null;
    })();

    const price = potion ? potion.buyPrice : equipment ? Math.floor(equipment.sellPrice * 3) : 0;
    if (!price) return { success: false, error: '无法确定物品价格' };

    const totalCost = price * quantity;
    if (ch.gold < totalCost) return { success: false, error: '金币不足' };

    ch.gold -= totalCost;
    ch.addItem(itemName, quantity);
    return { success: true };
  },

  // Logging
  addLog(type, text) {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this.combatLog.unshift(`[${timestamp}] ${text}`);
    if (this.combatLog.length > this.maxCombatLog) {
      this.combatLog.length = this.maxCombatLog;
    }
    if (this.callbacks.onLog) this.callbacks.onLog(type, text);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameEngine;
}
