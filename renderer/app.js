// Main renderer application
(function () {
  'use strict';

  const SAVE_KEY = 'hotlegend_save';
  let currentCharacter = null;
  let selectedInventoryItem = null;
  let selectedShopItem = null;
  let shopBuyQty = 1;
  let equipDetailSource = null; // 'equipment' | 'inventory' | 'slotChoice'
  let equipDetailItemName = null;

  // DOM elements
  const charSelectScreen = document.getElementById('char-select-screen');
  const gameScreen = document.getElementById('game-screen');
  const charListEl = document.getElementById('char-list');
  const createPanel = document.getElementById('create-char-panel');
  const combatLogEl = document.getElementById('combat-log');
  const toastEl = document.getElementById('toast');
  const goldTextEl = document.getElementById('gold-text');
  const gameStatusEl = document.getElementById('game-status');

  function isPotion(name) {
    return window.gameData?.items?.potions?.some(p => p.name === name);
  }

  // ========== Toast ==========
  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
  }

  // ========== Character Selection ==========
  function renderCharSelect() {
    charListEl.innerHTML = '';
    const characters = getSavedCharacters();

    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.className = 'char-slot';

      if (i < characters.length) {
        const ch = characters[i];
        const info = document.createElement('div');
        info.className = 'char-info';
        info.innerHTML = `<div class="char-name">${ch.name}</div>
          <div class="char-meta">${ch.className} | Lv.${ch.level} | 金币:${ch.gold}</div>`;
        info.addEventListener('click', () => enterGame(ch));

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteCharacter(i);
        });

        slot.appendChild(info);
        slot.appendChild(delBtn);
      } else {
        slot.innerHTML = `<span style="color:#555;">空位 ${i + 1}</span>`;
      }

      charListEl.appendChild(slot);
    }

    renderCreatePanel(characters);
  }

  function renderCreatePanel(characters) {
    createPanel.innerHTML = '';

    if (characters.length >= 3) {
      createPanel.innerHTML = '<span style="color:#aa3333;">角色槽位已满（3/3）</span>';
      return;
    }

    createPanel.innerHTML = `
      <label>角色名称</label>
      <input type="text" id="input-char-name" placeholder="输入角色名..." maxlength="8">
      <label>选择职业</label>
      <div class="class-select" id="class-select">
        <div class="class-option selected" data-class="战士">
          <span class="class-name">战士</span>
          <span class="class-desc">高生命 · 近战</span>
        </div>
        <div class="class-option" data-class="法师">
          <span class="class-name">法师</span>
          <span class="class-desc">高魔法 · 远程</span>
        </div>
        <div class="class-option" data-class="道士">
          <span class="class-name">道士</span>
          <span class="class-desc">均衡 · 召唤</span>
        </div>
      </div>
      <button id="btn-create-char" class="btn" style="width:100%;margin-top:10px;">创建角色</button>
    `;

    let selectedClass = '战士';
    document.querySelectorAll('.class-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.class-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedClass = opt.dataset.class;
      });
    });

    document.getElementById('btn-create-char').addEventListener('click', () => {
      const nameInput = document.getElementById('input-char-name');
      const name = nameInput.value.trim();
      if (!name) { showToast('请输入角色名称'); return; }
      createCharacter(name, selectedClass);
    });
  }

  function getSavedCharacters() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveCharacters(characters) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(characters));
  }

  function createCharacter(name, className) {
    const classData = window.gameData.classes[className];
    if (!classData) return;

    const characters = getSavedCharacters();
    if (characters.length >= 3) { showToast('角色槽位已满'); return; }

    const ch = new Character();
    ch.create(name, className, classData);
    ch.id = Date.now().toString();
    ch.currentMapId = 'bichon_city'; // Start in city

    characters.push(ch.toJSON());
    saveCharacters(characters);

    if (window.electronAPI) {
      window.electronAPI.saveCharacter(ch.toJSON());
    }

    showToast(`角色 ${name} 创建成功！`);
    renderCharSelect();
    enterGame(ch);
  }

  function deleteCharacter(index) {
    const characters = getSavedCharacters();
    const ch = characters[index];
    characters.splice(index, 1);
    saveCharacters(characters);

    if (window.electronAPI && ch.id) {
      window.electronAPI.deleteCharacter(ch.id);
    }

    showToast('角色已删除');
    renderCharSelect();
  }

  function enterGame(chData) {
    currentCharacter = new Character(chData);
    // Ensure currentMapId exists (backward compat)
    if (!currentCharacter.currentMapId) {
      currentCharacter.currentMapId = 'bichon_city';
    }

    gameScreen.classList.add('active');
    charSelectScreen.classList.remove('active');

    GameEngine.init(currentCharacter, {
      onUpdate: () => updateGameUI(),
      onLog: (type, text) => appendLog(type, text)
    });

    updateGameUI();
    renderEquipment();
    renderSkills();
    renderAllocateButtons();
    renderAutoPotionSettings();
    renderHotkeySettings();
    renderQuickBar();
    renderNavigation();
    renderShop();

    GameEngine.start();

    setInterval(() => {
      if (currentCharacter && GameEngine.isRunning) {
        autoSave();
      }
    }, 30000);
  }

  // ========== Save/Load ==========
  function autoSave() {
    if (!currentCharacter) return;
    const characters = getSavedCharacters();
    const chData = currentCharacter.toJSON();
    const index = characters.findIndex(c => c.id === chData.id);
    if (index >= 0) {
      characters[index] = chData;
    } else {
      characters.push(chData);
    }
    saveCharacters(characters);

    if (window.electronAPI) {
      window.electronAPI.saveCharacter(chData);
    }
  }

  function saveAndExit() {
    GameEngine.stop();
    autoSave();
    currentCharacter = null;
    selectedInventoryItem = null;
    combatLogEl.innerHTML = '';
    gameScreen.classList.remove('active');
    charSelectScreen.classList.add('active');
    renderCharSelect();
  }

  // ========== UI Update ==========
  function updateGameUI() {
    const ch = currentCharacter;
    if (!ch) return;

    // Summary
    document.getElementById('char-summary').innerHTML = `
      <div class="char-name-display">${ch.name}</div>
      <div class="char-class-display">${ch.className}</div>
      <div class="level-badge">Lv.${ch.level}</div>
    `;

    // HP bar
    const hpPct = Math.max(0, Math.floor((ch.hp / ch.maxHp) * 100));
    document.getElementById('hp-bar').style.width = hpPct + '%';
    document.getElementById('hp-text').textContent = `${ch.hp}/${ch.maxHp}`;

    // MP bar
    const mpPct = Math.max(0, Math.floor((ch.mp / ch.maxMp) * 100));
    document.getElementById('mp-bar').style.width = mpPct + '%';
    document.getElementById('mp-text').textContent = `${ch.mp}/${ch.maxMp}`;

    // EXP bar
    const expNeeded = ch.expToNextLevel();
    const expPct = Math.floor((ch.exp / expNeeded) * 100);
    document.getElementById('exp-bar').style.width = expPct + '%';
    document.getElementById('exp-text').textContent = `${ch.exp}/${expNeeded}`;

    // Stats
    const totals = ch.getTotalStats();
    document.getElementById('stats-display').innerHTML = `
      <div class="stat-row"><span>攻击力</span><span class="stat-val">${totals.attack}</span></div>
      <div class="stat-row"><span>防御力</span><span class="stat-val">${totals.defense}</span></div>
      <div class="stat-row"><span>魔法攻击</span><span class="stat-val">${totals.magicAttack}</span></div>
      <div class="stat-row"><span>魔法防御</span><span class="stat-val">${totals.magicDefense}</span></div>
      <div class="stat-row"><span>战力</span><span class="stat-val">${ch.getCombatPower()}</span></div>
    `;

    // Pending points
    const ppEl = document.getElementById('pending-points');
    const allocBtns = document.getElementById('allocate-buttons');
    if (ch.pendingStatPoints > 0) {
      ppEl.textContent = `[待分配: ${ch.pendingStatPoints}]`;
      ppEl.classList.add('highlight');
      allocBtns.style.display = 'grid';
    } else {
      ppEl.textContent = '';
      ppEl.classList.remove('highlight');
      allocBtns.style.display = 'none';
    }

    // Gold
    goldTextEl.textContent = ch.gold;

    // Location & Navigation
    renderNavigation();
    renderShop();
    renderSkills();
    renderQuickBar();
    // Update inventory button count
    const invBtn = document.getElementById('btn-inventory');
    if (invBtn) {
      invBtn.textContent = `背包 (${ch.inventory.length})`;
    }

    // Status
    const inCity = GameEngine.isInCity();
    if (!GameEngine.isRunning) {
      gameStatusEl.textContent = '○ 已暂停';
      gameStatusEl.style.color = '#aa3333';
    } else if (inCity) {
      gameStatusEl.textContent = '● 在城中';
      gameStatusEl.style.color = '#f0c850';
    } else {
      gameStatusEl.textContent = '● 挂机中';
      gameStatusEl.style.color = '#33aa33';
    }

    document.getElementById('btn-start-stop').textContent = GameEngine.isRunning ? '暂停挂机' : '开始挂机';
  }

  // ========== Navigation ==========
  function renderNavigation() {
    const ch = currentCharacter;
    if (!ch) return;
    const locEl = document.getElementById('current-location');
    const navEl = document.getElementById('nav-actions');
    const inCity = GameEngine.isInCity();
    const city = GameEngine.getCurrentCity();
    const dungeon = GameEngine.getCurrentDungeon();

    if (inCity && city) {
      locEl.innerHTML = `<span class="loc-city">${city.name}</span><span class="loc-region">${city.region}</span>`;

      // Travel to other cities
      let navHTML = '<div class="nav-section"><div class="nav-section-title">前往主城</div>';
      for (const c of GameEngine.citiesData) {
        if (c.id === city.id) continue;
        const locked = ch.level < c.minLevel;
        navHTML += `<button class="btn btn-small nav-btn" data-action="travel" data-id="${c.id}"
          ${locked ? 'disabled' : ''}>${c.name}${locked ? ' (Lv'+c.minLevel+')' : ''}</button>`;
      }
      navHTML += '</div>';

      // Enter dungeons
      navHTML += '<div class="nav-section"><div class="nav-section-title">进入副本</div>';
      for (const dId of city.dungeons) {
        const d = GameEngine.dungeonsData.find(dg => dg.id === dId);
        if (!d) continue;
        const locked = ch.level < d.minLevel;
        navHTML += `<button class="btn btn-small nav-btn${locked ? '' : ' btn-dungeon'}" data-action="dungeon" data-id="${d.id}"
          ${locked ? 'disabled' : ''}>${d.name}${locked ? ' (Lv'+d.minLevel+')' : ''}<br><small>Lv${d.minLevel}-${d.maxLevel}</small></button>`;
      }
      navHTML += '</div>';

      navEl.innerHTML = navHTML;
    } else if (dungeon) {
      const parentCity = GameEngine.citiesData.find(c => c.id === dungeon.cityId);
      locEl.innerHTML = `<span class="loc-dungeon">${dungeon.name}</span><span class="loc-region">${parentCity ? parentCity.region : ''}</span>`;

      navEl.innerHTML = `
        <div class="nav-section">
          <button class="btn btn-small btn-return" data-action="return-city">返回${parentCity ? parentCity.name : '主城'}</button>
        </div>
      `;
    } else {
      locEl.innerHTML = `<span class="loc-city">未知区域</span>`;
      navEl.innerHTML = `<button class="btn btn-small" data-action="return-city">返回比奇城</button>`;
    }

    // Bind navigation events
    navEl.querySelectorAll('[data-action="travel"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = GameEngine.travelToCity(btn.dataset.id);
        if (!result.success) showToast(result.error);
        updateGameUI();
      });
    });

    navEl.querySelectorAll('[data-action="dungeon"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const result = GameEngine.enterDungeon(btn.dataset.id);
        if (!result.success) showToast(result.error);
        updateGameUI();
      });
    });

    navEl.querySelectorAll('[data-action="return-city"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dungeon = GameEngine.getCurrentDungeon();
        const targetCity = dungeon ? dungeon.cityId : 'bichon_city';
        GameEngine.travelToCity(targetCity);
        updateGameUI();
      });
    });
  }

  // ========== NPC Shop ==========
  function renderShop() {
    const panel = document.getElementById('shop-panel');
    const content = document.getElementById('shop-content');
    const city = GameEngine.getCurrentCity();

    if (!city) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';

    let html = '';
    for (const [npcName, npcData] of Object.entries(city.npc)) {
      const typeLabel = npcName.includes('药') ? '出售各类药水' : '出售武器、衣服、首饰等装备';
      html += `<div class="shop-npc-card" data-npc="${npcName}">
        <span class="npc-name">${npcData.name}</span>
        <span class="npc-type">${npcName} — ${npcData.greeting}</span>
        <span class="npc-hint">双击打开商店</span>
      </div>`;
    }

    content.innerHTML = html;

    // Double-click to open modal
    content.querySelectorAll('.shop-npc-card').forEach(card => {
      card.addEventListener('dblclick', () => {
        openShopModal(card.dataset.npc);
      });
    });
  }

  function openShopModal(npcName) {
    const city = GameEngine.getCurrentCity();
    if (!city || !city.npc[npcName]) return;

    const npcData = city.npc[npcName];
    selectedShopItem = null;
    shopBuyQty = 1;

    const modal = document.getElementById('shop-modal');
    document.getElementById('shop-modal-title').textContent = `${npcData.name}（${npcName}）`;
    document.getElementById('shop-modal-qty').value = 1;

    // Build item list
    let html = '';
    for (const itemName of npcData.sells) {
      const potion = window.gameData.items.potions.find(p => p.name === itemName);
      const equipment = findEquipmentByName(itemName);
      const price = potion ? potion.buyPrice : equipment ? Math.floor(equipment.sellPrice * 3) : 0;
      const desc = potion ? potion.description : equipment ? `${equipment.slot} | Lv${equipment.level}+` : '';
      html += `<div class="modal-shop-item" data-item="${itemName}" data-price="${price}">
        <span class="shop-item-left">
          <span class="shop-item-name">${itemName}</span>
          <span class="shop-item-desc">${desc}</span>
        </span>
        <span class="shop-item-price">${price}金币</span>
      </div>`;
    }
    document.getElementById('shop-modal-body').innerHTML = html;

    // Item selection in modal
    document.querySelectorAll('#shop-modal-body .modal-shop-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedShopItem = item.dataset.item;
        document.getElementById('shop-modal-qty').value = 1;
        shopBuyQty = 1;
        document.querySelectorAll('#shop-modal-body .modal-shop-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });
      // Double-click to view equipment detail
      item.addEventListener('dblclick', () => {
        const eq = findEquipmentByName(item.dataset.item);
        if (eq) {
          showEquipDetail(item.dataset.item, 'shop');
        }
      });
    });

    // Quantity input
    const qtyInput = document.getElementById('shop-modal-qty');
    qtyInput.onchange = () => {
      shopBuyQty = Math.max(1, Math.min(99, parseInt(qtyInput.value) || 1));
    };

    // Buy button
    const buyBtn = document.getElementById('btn-buy-modal');
    buyBtn.onclick = () => {
      if (!selectedShopItem) { showToast('请先在列表中点击选择物品'); return; }
      shopBuyQty = Math.max(1, Math.min(99, parseInt(qtyInput.value) || 1));
      const result = GameEngine.buyFromShop(selectedShopItem, shopBuyQty);
      if (result.success) {
        showToast(`购买了 ${selectedShopItem} x${shopBuyQty}`);
        updateGameUI();
        openShopModal(npcName); // Refresh modal
      } else {
        showToast(result.error);
      }
    };

    modal.style.display = 'flex';
  }

  // Close modal button + overlay click
  document.getElementById('shop-modal-close').addEventListener('click', closeShopModal);
  document.getElementById('shop-modal').addEventListener('click', (e) => {
    if (e.target.id === 'shop-modal') closeShopModal();
  });

  function closeShopModal() {
    document.getElementById('shop-modal').style.display = 'none';
    selectedShopItem = null;
  }

  // ========== Equipment Detail Modal ==========
  function showEquipDetail(itemName, source) {
    const eq = Inventory.findEquipment(itemName);
    if (!eq) return;

    equipDetailSource = source;
    equipDetailItemName = itemName;

    const modal = document.getElementById('equip-detail-modal');
    document.getElementById('equip-detail-title').textContent = `装备详情 — ${eq.name}`;

    // Map slot names
    const slotLabels = {
      weapons: '武器', armors: '衣服', helmets: '头盔',
      necklaces: '项链', bracelets: '手镯', rings: '戒指'
    };
    const slotLabel = slotLabels[eq.slot] || eq.slot;

    // Build detail body
    let html = '';
    html += `<div class="detail-row"><span class="detail-label">类型</span><span class="detail-value">${slotLabel}</span></div>`;
    html += `<div class="detail-row"><span class="detail-label">需求等级</span><span class="detail-value">Lv.${eq.level}</span></div>`;
    if (eq.classes && eq.classes.length > 0) {
      html += `<div class="detail-row"><span class="detail-label">需求职业</span><span class="detail-value">${eq.classes.join(' / ')}</span></div>`;
    } else {
      html += `<div class="detail-row"><span class="detail-label">需求职业</span><span class="detail-value">全职业</span></div>`;
    }

    // Stats
    if (eq.stats && Object.keys(eq.stats).length > 0) {
      html += `<div class="detail-section-title">属性加成</div>`;
      const statLabels = {
        attack: '攻击力', defense: '防御力',
        magicAttack: '魔法攻击', magicDefense: '魔法防御',
        hp: '生命值', mp: '魔法值'
      };
      for (const [stat, val] of Object.entries(eq.stats)) {
        if (val === 0) continue;
        const label = statLabels[stat] || stat;
        html += `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value stat-positive">+${val}</span></div>`;
      }
    }

    if (source === 'shop') {
      const buyPrice = Math.floor(eq.sellPrice * 3);
      html += `<div class="detail-row"><span class="detail-label">购买价格</span><span class="detail-value">${buyPrice} 金币</span></div>`;
    } else {
      html += `<div class="detail-row"><span class="detail-label">出售价格</span><span class="detail-value">${eq.sellPrice} 金币</span></div>`;
    }

    // If viewing from inventory/shop while having something equipped, show comparison
    if (source === 'inventory' || source === 'shop') {
      const charSlotKey = getCharSlotKey(eq.slot);
      const currentEquip = currentCharacter.equipment[charSlotKey];
      if (currentEquip) {
        const diff = Inventory.compareEquipment(currentEquip, itemName);
        html += `<div class="equip-compare">
          <div class="compare-title">对比当前装备: ${currentEquip}</div>`;
        const diffLabels = { attack: '攻击力', defense: '防御力', magicAttack: '魔法攻击', magicDefense: '魔法防御', hp: '生命值', mp: '魔法值' };
        let hasDiff = false;
        for (const [stat, label] of Object.entries(diffLabels)) {
          const d = diff[stat];
          if (d === 0) continue;
          hasDiff = true;
          const cls = d > 0 ? 'up' : 'down';
          const sign = d > 0 ? '+' : '';
          html += `<div class="compare-row"><span class="compare-stat">${label}</span><span class="compare-diff ${cls}">${sign}${d}</span></div>`;
        }
        if (!hasDiff) {
          html += `<div class="compare-row"><span class="compare-diff same">属性相同</span></div>`;
        }
        html += `</div>`;
      }
    }

    // Check if character can equip (inventory only, not shop)
    if (source === 'inventory') {
      const canEquip = Inventory.canEquip(currentCharacter, eq);
      if (!canEquip) {
        let reason = '';
        if (currentCharacter.level < eq.level) reason = `需要等级 Lv.${eq.level}`;
        else if (eq.classes && !eq.classes.includes(currentCharacter.className)) reason = `职业不符（需要: ${eq.classes.join(' / ')}）`;
        html += `<div class="detail-note">⚠ ${reason}，无法装备</div>`;
      }

      if (currentCharacter.level < eq.level) {
        html += `<div class="detail-note">提示: 可在背包中保留此装备，达到等级后再装备</div>`;
      }
    }

    if (source === 'shop') {
      const buyPrice = Math.floor(eq.sellPrice * 3);
      if (currentCharacter.gold < buyPrice) {
        html += `<div class="detail-note">⚠ 金币不足，无法购买</div>`;
      }
    }

    document.getElementById('equip-detail-body').innerHTML = html;

    const slotChoiceEl = document.getElementById('equip-detail-slot-choice');
    const actionBtn = document.getElementById('equip-detail-btn-action');
    slotChoiceEl.style.display = 'none';
    actionBtn.style.display = '';

    // For inventory items that are rings/bracelets with both slots occupied, show slot choice
    const isDualSlot = (eq.slot === 'bracelets' || eq.slot === 'rings');
    if (source === 'inventory' && isDualSlot && Inventory.canEquip(currentCharacter, eq)) {
      const ch = currentCharacter;
      const slotLabels = { bracelets: ['手镯1', '手镯2'], rings: ['戒指1', '戒指2'] };
      const slotKeys = eq.slot === 'bracelets' ? ['bracelet1', 'bracelet2'] : ['ring1', 'ring2'];
      const bothOccupied = ch.equipment[slotKeys[0]] && ch.equipment[slotKeys[1]];
      if (bothOccupied) {
        equipDetailSource = 'slotChoice';
        const name1 = ch.equipment[slotKeys[0]] || '空';
        const name2 = ch.equipment[slotKeys[1]] || '空';
        document.getElementById('equip-detail-btn-slot1').textContent = `替换${slotLabels[eq.slot][0]} ${name1}`;
        document.getElementById('equip-detail-btn-slot2').textContent = `替换${slotLabels[eq.slot][1]} ${name2}`;
        slotChoiceEl.style.display = 'flex';
        actionBtn.style.display = 'none';
      }
    }

    // Action button (hidden when slot choice is shown)
    if (actionBtn.style.display !== 'none') {
      if (source === 'equipment') {
        actionBtn.textContent = '卸下';
        actionBtn.className = 'btn equip-detail-action-btn danger';
        actionBtn.disabled = false;
        actionBtn.style.opacity = '1';
        actionBtn.style.cursor = 'pointer';
      } else if (source === 'shop') {
        actionBtn.textContent = '购买';
        actionBtn.className = 'btn equip-detail-action-btn';
        const buyPrice = Math.floor(eq.sellPrice * 3);
        if (currentCharacter.gold < buyPrice) {
          actionBtn.disabled = true;
          actionBtn.style.opacity = '0.4';
          actionBtn.style.cursor = 'not-allowed';
        } else {
          actionBtn.disabled = false;
          actionBtn.style.opacity = '1';
          actionBtn.style.cursor = 'pointer';
        }
      } else {
        actionBtn.textContent = '装备';
        actionBtn.className = 'btn equip-detail-action-btn';
        if (!Inventory.canEquip(currentCharacter, eq)) {
          actionBtn.disabled = true;
          actionBtn.style.opacity = '0.4';
          actionBtn.style.cursor = 'not-allowed';
        } else {
          actionBtn.disabled = false;
          actionBtn.style.opacity = '1';
          actionBtn.style.cursor = 'pointer';
        }
      }
    }

    modal.style.display = 'flex';
  }

  function getCharSlotKey(dataSlot) {
    const slotMap = {
      weapons: 'weapon', armors: 'armor', helmets: 'helmet',
      necklaces: 'necklace', bracelets: 'bracelet1', rings: 'ring1'
    };
    return slotMap[dataSlot] || dataSlot;
  }

  function closeEquipDetail() {
    document.getElementById('equip-detail-modal').style.display = 'none';
    document.getElementById('equip-detail-slot-choice').style.display = 'none';
    document.getElementById('equip-detail-btn-action').style.display = '';
    equipDetailSource = null;
    equipDetailItemName = null;
  }

  // Equip detail modal buttons
  document.getElementById('equip-detail-btn-action').addEventListener('click', () => {
    if (!equipDetailItemName) return;
    if (equipDetailSource === 'equipment') {
      // Unequip
      const eq = Inventory.findEquipment(equipDetailItemName);
      const charSlotKey = getCharSlotKey(eq.slot);
      // Find which actual slot has this item (for bracelets/rings)
      let actualSlot = charSlotKey;
      if (eq.slot === 'bracelets') {
        if (currentCharacter.equipment.bracelet1 === equipDetailItemName) actualSlot = 'bracelet1';
        else if (currentCharacter.equipment.bracelet2 === equipDetailItemName) actualSlot = 'bracelet2';
      } else if (eq.slot === 'rings') {
        if (currentCharacter.equipment.ring1 === equipDetailItemName) actualSlot = 'ring1';
        else if (currentCharacter.equipment.ring2 === equipDetailItemName) actualSlot = 'ring2';
      }
      Inventory.unequip(currentCharacter, actualSlot);
      showToast(`卸下了 ${equipDetailItemName}`);
      closeEquipDetail();
      renderEquipment();
      updateGameUI();
    } else if (equipDetailSource === 'shop') {
      // Buy from shop
      const result = GameEngine.buyFromShop(equipDetailItemName, 1);
      if (result.success) {
        showToast(`购买了 ${equipDetailItemName}`);
        closeEquipDetail();
        closeShopModal();
        updateGameUI();
      } else {
        showToast(result.error);
      }
    } else if (equipDetailSource === 'inventory') {
      // Equip
      const result = Inventory.equip(currentCharacter, equipDetailItemName);
      if (result.success) {
        showToast(`装备了 ${equipDetailItemName}`);
        selectedInventoryItem = null;
        closeEquipDetail();
        renderEquipment();
        updateGameUI();
      } else if (result.needSlotChoice) {
        // Show slot choice (should already be showing, but ensure)
        showEquipDetail(equipDetailItemName, 'inventory');
      } else {
        showToast(result.error);
      }
    }
  });

  // Slot choice buttons in equip detail modal
  document.getElementById('equip-detail-btn-slot1').addEventListener('click', () => {
    if (equipDetailSource !== 'slotChoice' || !equipDetailItemName) return;
    const eq = Inventory.findEquipment(equipDetailItemName);
    const slotKey = eq.slot === 'bracelets' ? 'bracelet1' : 'ring1';
    const result = Inventory.equip(currentCharacter, equipDetailItemName, slotKey);
    if (result.success) {
      showToast(`装备了 ${equipDetailItemName}`);
      selectedInventoryItem = null;
      closeEquipDetail();
      renderEquipment();
      updateGameUI();
    } else {
      showToast(result.error);
    }
  });

  document.getElementById('equip-detail-btn-slot2').addEventListener('click', () => {
    if (equipDetailSource !== 'slotChoice' || !equipDetailItemName) return;
    const eq = Inventory.findEquipment(equipDetailItemName);
    const slotKey = eq.slot === 'bracelets' ? 'bracelet2' : 'ring2';
    const result = Inventory.equip(currentCharacter, equipDetailItemName, slotKey);
    if (result.success) {
      showToast(`装备了 ${equipDetailItemName}`);
      selectedInventoryItem = null;
      closeEquipDetail();
      renderEquipment();
      updateGameUI();
    } else {
      showToast(result.error);
    }
  });

  document.getElementById('equip-detail-close').addEventListener('click', closeEquipDetail);
  document.getElementById('equip-detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'equip-detail-modal') closeEquipDetail();
  });

  function findEquipmentByName(name) {
    const eq = window.gameData.equipment.equipment;
    for (const slot of Object.keys(eq)) {
      const item = eq[slot].find(e => e.name === name);
      if (item) return item;
    }
    return null;
  }

  // ========== Equipment ==========
  function renderEquipment() {
    const el = document.getElementById('equipment-display');
    const ch = currentCharacter;
    const slotLabels = {
      weapon: '武器', armor: '衣服', helmet: '头盔',
      necklace: '项链', bracelet1: '手镯1', bracelet2: '手镯2',
      ring1: '戒指1', ring2: '戒指2'
    };

    let html = '';
    for (const [slot, label] of Object.entries(slotLabels)) {
      const item = ch.equipment[slot];
      html += `<div class="equip-slot">
        <span class="equip-slot-label">${label}</span>
        <span class="equip-slot-item ${item ? '' : 'empty'}" data-slot="${slot}">${item || '空'}</span>
      </div>`;
    }
    el.innerHTML = html;

    el.querySelectorAll('.equip-slot-item:not(.empty)').forEach(item => {
      item.addEventListener('click', () => {
        const slot = item.dataset.slot;
        const itemName = currentCharacter.equipment[slot];
        if (itemName) {
          showEquipDetail(itemName, 'equipment');
        }
      });
    });
  }

  // ========== Skills ==========
  function renderSkills() {
    const el = document.getElementById('skills-display');
    const ch = currentCharacter;
    if (!ch.skills.length) {
      el.innerHTML = '<span style="color:#555;">暂未学会技能</span>';
      return;
    }

    let html = '';
    for (const skill of ch.skills) {
      const expNeeded = ch.skillExpNeeded(skill.level);
      const maxed = skill.level >= skill.maxLevel;
      html += `<div class="skill-row">
        <span class="skill-name">${skill.name}</span>
        <span class="skill-level">
          ${maxed ? `Lv.${skill.level} 满级` : `Lv.${skill.level} (${skill.exp}/${expNeeded})`}
        </span>
      </div>`;
    }
    el.innerHTML = html;
  }

  // ========== Inventory ==========
  function openInventoryModal() {
    const modal = document.getElementById('inventory-modal');
    const body = document.getElementById('inventory-modal-body');
    const ch = currentCharacter;
    selectedInventoryItem = null;

    if (!ch.inventory.length) {
      body.innerHTML = '<span style="color:#555;text-align:center;display:block;padding:20px;">背包为空</span>';
    } else {
      let html = '';
      for (const item of ch.inventory) {
        const isEquippable = !!Inventory.getEquipmentSlot(item.name);
        const eqClass = isEquippable ? ' equippable' : '';
        html += `<div class="inv-item${eqClass}" data-name="${item.name}">
          <span class="inv-item-name">${item.name}${isEquippable ? ' ★' : ''}</span>
          <span class="inv-item-qty">x${item.quantity}</span>
        </div>`;
      }
      body.innerHTML = html;

      body.querySelectorAll('.inv-item').forEach(item => {
        item.addEventListener('click', () => {
          selectedInventoryItem = item.dataset.name;
          body.querySelectorAll('.inv-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
        });
        // Double-click to view equipment detail
        item.addEventListener('dblclick', () => {
          const name = item.dataset.name;
          const eq = Inventory.findEquipment(name);
          if (eq) {
            showEquipDetail(name, 'inventory');
          }
        });
      });
    }

    modal.style.display = 'flex';
  }

  function closeInventoryModal() {
    document.getElementById('inventory-modal').style.display = 'none';
    selectedInventoryItem = null;
  }

  function refreshInventoryModal() {
    if (document.getElementById('inventory-modal').style.display === 'flex') {
      openInventoryModal();
    }
  }

  // ========== Stat Allocation ==========
  function renderAllocateButtons() {
    const el = document.getElementById('allocate-buttons');
    // Clear and rebuild buttons every time to ensure listeners work
    el.innerHTML = '';

    const buttons = [
      { stat: 'attack', label: '攻击+1' },
      { stat: 'defense', label: '防御+1' },
      { stat: 'magicAttack', label: '魔攻+1' },
      { stat: 'magicDefense', label: '魔防+1' }
    ];

    for (const btn of buttons) {
      const btnEl = document.createElement('button');
      btnEl.className = 'btn-stat';
      btnEl.textContent = btn.label;
      btnEl.addEventListener('click', () => {
        if (!currentCharacter || currentCharacter.pendingStatPoints <= 0) {
          showToast('没有待分配的属性点');
          return;
        }
        const ok = currentCharacter.allocateStat(btn.stat);
        if (ok) {
          showToast(`${btn.label}！剩余待分配: ${currentCharacter.pendingStatPoints}`);
          updateGameUI();
          renderAllocateButtons();
        }
      });
      el.appendChild(btnEl);
    }
  }

  function renderAutoPotionSettings() {
    const cfg = currentCharacter.autoPotionConfig;
    const el = document.getElementById('auto-potion-settings');
    if (!el) return;
    const thresholds = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    const labels = ['30%', '40%', '50%', '60%', '70%', '80%'];

    let html = '';
    html += '<div class="auto-potion-row"><label>启用</label>';
    html += `<input type="checkbox" id="auto-potion-enabled" ${cfg.enabled ? 'checked' : ''}></div>`;

    html += '<div class="auto-potion-row"><label>HP低于</label><select id="auto-potion-hp">';
    for (let i = 0; i < thresholds.length; i++) {
      html += `<option value="${thresholds[i]}" ${cfg.hpThreshold === thresholds[i] ? 'selected' : ''}>${labels[i]}</option>`;
    }
    html += '</select></div>';

    html += '<div class="auto-potion-row"><label>MP低于</label><select id="auto-potion-mp">';
    for (let i = 0; i < thresholds.length; i++) {
      html += `<option value="${thresholds[i]}" ${cfg.mpThreshold === thresholds[i] ? 'selected' : ''}>${labels[i]}</option>`;
    }
    html += '</select></div>';

    el.innerHTML = html;

    document.getElementById('auto-potion-enabled').addEventListener('change', (e) => {
      currentCharacter.autoPotionConfig.enabled = e.target.checked;
    });
    document.getElementById('auto-potion-hp').addEventListener('change', (e) => {
      currentCharacter.autoPotionConfig.hpThreshold = parseFloat(e.target.value);
    });
    document.getElementById('auto-potion-mp').addEventListener('change', (e) => {
      currentCharacter.autoPotionConfig.mpThreshold = parseFloat(e.target.value);
    });
  }

  function renderQuickBar() {
    const ch = currentCharacter;
    const slotsEl = document.getElementById('quick-slots');
    if (!slotsEl) return;
    let html = '';
    for (let i = 0; i < ch.quickSlots.length; i++) {
      const potionName = ch.quickSlots[i];
      const count = potionName ? ch.getItemCount(potionName) : 0;
      if (potionName && count > 0) {
        html += `<div class="quick-slot" data-slot="${i}" data-potion="${encodeURIComponent(potionName)}" title="${potionName} (x${count})">${potionName}<span class="quick-slot-count">x${count}</span></div>`;
      } else {
        // Auto-clear depleted slots
        if (potionName && count <= 0) {
          ch.quickSlots[i] = null;
        }
        html += `<div class="quick-slot empty" data-slot="${i}">空</div>`;
      }
    }
    slotsEl.innerHTML = html;

    slotsEl.querySelectorAll('.quick-slot:not(.empty)').forEach(slot => {
      slot.addEventListener('click', () => {
        const name = decodeURIComponent(slot.dataset.potion);
        const result = GameEngine.usePotion(currentCharacter, name);
        if (result.success) {
          showToast(`使用 ${name}`);
          renderQuickBar();
          updateGameUI();
        } else {
          showToast(result.error);
        }
      });
      slot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        currentCharacter.quickSlots[parseInt(slot.dataset.slot)] = null;
        renderQuickBar();
        showToast('已清除快捷栏位');
      });
    });
  }

  function openQuickBarConfig() {
    const modal = document.getElementById('quickbar-config-modal');
    const body = document.getElementById('quickbar-config-body');
    const ch = currentCharacter;

    const potionNames = [...new Set(
      ch.inventory.filter(item => isPotion(item.name)).map(item => item.name)
    )];

    let html = '';
    for (let i = 0; i < 5; i++) {
      const current = ch.quickSlots[i] || '';
      html += `<div class="config-row">
        <span class="config-label">槽位${i + 1}</span>
        <select class="quickbar-config-select" data-slot="${i}">
          <option value="">-- 空 --</option>`;
      for (const name of potionNames) {
        html += `<option value="${name}" ${current === name ? 'selected' : ''}>${name}</option>`;
      }
      html += '</select></div>';
    }
    body.innerHTML = html;
    modal.style.display = 'flex';
  }

  let capturingHotkey = false;

  async function renderHotkeySettings() {
    const el = document.getElementById('hotkey-settings');
    if (!el) return;

    let currentHotkey = 'CommandOrControl+Shift+H';
    if (window.electronAPI) {
      try {
        currentHotkey = await window.electronAPI.getHotkey();
      } catch (e) { /* use default */ }
    }

    const display = formatAccelerator(currentHotkey);
    el.innerHTML = `
      <div class="hotkey-display">
        <span class="hotkey-current">${display}</span>
        <button id="btn-capture-hotkey" class="btn-hotkey">修改</button>
      </div>
      <div class="hotkey-hint">隐藏/显示窗口</div>
    `;

    const btn = document.getElementById('btn-capture-hotkey');
    btn.addEventListener('click', () => {
      if (capturingHotkey) return;
      capturingHotkey = true;
      btn.textContent = '请按键...';
      btn.classList.add('capturing');
    });
  }

  function formatAccelerator(accel) {
    return accel
      .replace(/CommandOrControl/g, 'Ctrl')
      .replace(/Command/g, 'Cmd')
      .replace(/Control/g, 'Ctrl')
      .replace(/Alt/g, 'Alt')
      .replace(/Shift/g, 'Shift')
      .replace(/\+/g, ' + ');
  }

  // Key capture listener for hotkey rebinding
  document.addEventListener('keydown', async (e) => {
    if (!capturingHotkey) return;
    e.preventDefault();
    e.stopPropagation();

    const key = e.key;
    // Ignore modifier-only presses
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;

    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // Normalize key name
    let keyName = key.toUpperCase();
    if (keyName === ' ') keyName = 'Space';
    if (keyName.length === 1 && keyName >= 'A' && keyName <= 'Z') keyName = keyName;
    parts.push(keyName);

    const accelerator = parts.join('+');
    capturingHotkey = false;

    if (window.electronAPI) {
      const result = await window.electronAPI.setHotkey(accelerator);
      if (result.success) {
        showToast(`快捷键已设为 ${formatAccelerator(accelerator)}`);
      } else {
        showToast(result.error || '快捷键设置失败');
      }
    } else {
      showToast(`快捷键: ${formatAccelerator(accelerator)} (开发模式，仅显示)`);
    }

    renderHotkeySettings();
  }, true);

  function appendLog(type, text) {
    const div = document.createElement('div');
    div.className = 'log-' + type;
    div.textContent = text;
    combatLogEl.insertBefore(div, combatLogEl.firstChild);
    while (combatLogEl.children.length > 200) {
      combatLogEl.removeChild(combatLogEl.lastChild);
    }
  }

  // ========== Button Handlers ==========
  document.getElementById('btn-start-stop').addEventListener('click', () => {
    if (!currentCharacter) return;
    if (GameEngine.isRunning) {
      GameEngine.stop();
    } else {
      GameEngine.start();
    }
    updateGameUI();
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    autoSave();
    showToast('游戏已保存');
  });

  document.getElementById('btn-exit').addEventListener('click', () => {
    saveAndExit();
  });

  // Inventory modal buttons
  document.getElementById('btn-inventory').addEventListener('click', () => {
    openInventoryModal();
  });

  document.getElementById('btn-inv-close').addEventListener('click', closeInventoryModal);
  document.getElementById('inventory-modal').addEventListener('click', (e) => {
    if (e.target.id === 'inventory-modal') closeInventoryModal();
  });

  document.getElementById('btn-inv-use').addEventListener('click', () => {
    if (!selectedInventoryItem) { showToast('请先在背包中点击选择物品'); return; }
    if (!isPotion(selectedInventoryItem)) { showToast('此物品无法使用'); return; }
    const result = GameEngine.usePotion(currentCharacter, selectedInventoryItem);
    if (result.success) {
      showToast(`使用 ${selectedInventoryItem}`);
      selectedInventoryItem = null;
      refreshInventoryModal();
      renderQuickBar();
      updateGameUI();
    } else {
      showToast(result.error);
    }
  });

  document.getElementById('btn-inv-equip').addEventListener('click', () => {
    if (!selectedInventoryItem) { showToast('请先在背包中点击选择物品'); return; }
    const result = Inventory.equip(currentCharacter, selectedInventoryItem);
    if (result.success) {
      showToast(`装备了 ${selectedInventoryItem}`);
      selectedInventoryItem = null;
      refreshInventoryModal();
      renderEquipment();
      updateGameUI();
    } else if (result.needSlotChoice) {
      showEquipDetail(selectedInventoryItem, 'inventory');
    } else {
      showToast(result.error);
    }
  });

  document.getElementById('btn-inv-sell').addEventListener('click', () => {
    openSellModal();
  });

  // ========== Batch Sell Modal ==========
  function getItemSellPrice(name) {
    const eq = Inventory.findEquipment(name);
    if (eq) return eq.sellPrice;
    const potion = window.gameData.items.potions.find(p => p.name === name);
    if (potion) return potion.sellPrice;
    return 1;
  }

  function openSellModal() {
    const ch = currentCharacter;
    const modal = document.getElementById('sell-modal');
    const body = document.getElementById('sell-modal-body');
    if (!ch.inventory.length) {
      body.innerHTML = '<span class="sell-empty">背包为空</span>';
    } else {
      let html = `<div class="sell-header">
        <label><input type="checkbox" id="sell-select-all"> 全选</label>
      </div>`;
      for (const item of ch.inventory) {
        const price = getItemSellPrice(item.name);
        html += `<div class="sell-row" data-name="${encodeURIComponent(item.name)}">
          <input type="checkbox" class="sell-check" data-name="${encodeURIComponent(item.name)}">
          <span class="sell-name" title="${item.name}">${item.name}</span>
          <span class="sell-owned">x${item.quantity}</span>
          <span class="sell-price">${price}金</span>
          <input type="number" class="sell-qty" value="1" min="1" max="${item.quantity}" data-max="${item.quantity}">
          <button class="btn-sell-all" data-max="${item.quantity}">全部</button>
          <span class="sell-subtotal" data-unit="${price}">0</span>
        </div>`;
      }
      body.innerHTML = html;

      // Select all checkbox
      document.getElementById('sell-select-all').addEventListener('change', (e) => {
        body.querySelectorAll('.sell-check').forEach(cb => { cb.checked = e.target.checked; });
        updateSellTotal();
      });

      // Row checkboxes
      body.querySelectorAll('.sell-check').forEach(cb => {
        cb.addEventListener('change', () => updateSellTotal());
      });

      // Quantity inputs
      body.querySelectorAll('.sell-qty').forEach(input => {
        input.addEventListener('input', () => {
          const max = parseInt(input.dataset.max);
          let val = parseInt(input.value) || 0;
          if (val < 0) val = 0;
          if (val > max) val = max;
          input.value = val;
          updateSellRowSubtotal(input);
          updateSellTotal();
        });
      });

      // "全部" buttons
      body.querySelectorAll('.btn-sell-all').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.sell-row');
          const qtyInput = row.querySelector('.sell-qty');
          qtyInput.value = btn.dataset.max;
          updateSellRowSubtotal(qtyInput);
          updateSellTotal();
        });
      });
    }

    document.getElementById('sell-total').textContent = '合计: 0 金币';
    modal.style.display = 'flex';
  }

  function updateSellRowSubtotal(qtyInput) {
    const row = qtyInput.closest('.sell-row');
    const subtotalEl = row.querySelector('.sell-subtotal');
    const unitPrice = parseInt(subtotalEl.dataset.unit);
    const qty = parseInt(qtyInput.value) || 0;
    subtotalEl.textContent = (unitPrice * qty) + '金';
  }

  function updateSellTotal() {
    const body = document.getElementById('sell-modal-body');
    let total = 0;
    body.querySelectorAll('.sell-row').forEach(row => {
      const cb = row.querySelector('.sell-check');
      if (!cb.checked) return;
      const unitPrice = parseInt(row.querySelector('.sell-subtotal').dataset.unit);
      const qty = parseInt(row.querySelector('.sell-qty').value) || 0;
      total += unitPrice * qty;
    });
    document.getElementById('sell-total').textContent = '合计: ' + total + ' 金币';
  }

  document.getElementById('btn-sell-execute').addEventListener('click', () => {
    const body = document.getElementById('sell-modal-body');
    const ch = currentCharacter;
    let totalGold = 0;
    let soldCount = 0;

    body.querySelectorAll('.sell-row').forEach(row => {
      const cb = row.querySelector('.sell-check');
      if (!cb.checked) return;
      const name = decodeURIComponent(cb.dataset.name);
      const qty = parseInt(row.querySelector('.sell-qty').value) || 0;
      if (qty <= 0) return;
      const invItem = ch.inventory.find(i => i.name === name);
      if (!invItem) return;
      const actualQty = Math.min(qty, invItem.quantity);
      const unitPrice = getItemSellPrice(name);
      ch.gold += unitPrice * actualQty;
      ch.removeItem(name, actualQty);
      totalGold += unitPrice * actualQty;
      soldCount++;
    });

    if (soldCount > 0) {
      showToast(`出售成功，获得 ${totalGold} 金币`);
      document.getElementById('sell-modal').style.display = 'none';
      refreshInventoryModal();
      renderQuickBar();
      updateGameUI();
    } else {
      showToast('请勾选要出售的物品');
    }
  });

  document.getElementById('btn-sell-close').addEventListener('click', () => {
    document.getElementById('sell-modal').style.display = 'none';
  });

  document.getElementById('sell-modal').addEventListener('click', (e) => {
    if (e.target.id === 'sell-modal') {
      document.getElementById('sell-modal').style.display = 'none';
    }
  });

  document.getElementById('btn-inv-discard').addEventListener('click', () => {
    if (!selectedInventoryItem) { showToast('请先在背包中点击选择物品'); return; }
    if (confirm(`确定丢弃 ${selectedInventoryItem} 吗？（不可恢复）`)) {
      Inventory.discard(currentCharacter, selectedInventoryItem);
      selectedInventoryItem = null;
      refreshInventoryModal();
      updateGameUI();
      showToast('物品已丢弃');
    }
  });

  // Quick bar config modal
  document.getElementById('btn-quickbar-config').addEventListener('click', () => {
    openQuickBarConfig();
  });

  document.getElementById('btn-quickbar-save').addEventListener('click', () => {
    const selects = document.querySelectorAll('#quickbar-config-body .quickbar-config-select');
    selects.forEach(sel => {
      currentCharacter.quickSlots[parseInt(sel.dataset.slot)] = sel.value || null;
    });
    document.getElementById('quickbar-config-modal').style.display = 'none';
    renderQuickBar();
    showToast('快捷栏已保存');
  });

  document.getElementById('btn-quickbar-close').addEventListener('click', () => {
    document.getElementById('quickbar-config-modal').style.display = 'none';
  });

  document.getElementById('quickbar-config-modal').addEventListener('click', (e) => {
    if (e.target.id === 'quickbar-config-modal') {
      document.getElementById('quickbar-config-modal').style.display = 'none';
    }
  });

  // ========== Keyboard shortcuts ==========
  document.addEventListener('keydown', (e) => {
    if (!currentCharacter) return;
    // Quick slot keys 1-5
    if (['1', '2', '3', '4', '5'].includes(e.key)) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      const slotIndex = parseInt(e.key) - 1;
      const potionName = currentCharacter.quickSlots[slotIndex];
      if (potionName && currentCharacter.getItemCount(potionName) > 0) {
        const result = GameEngine.usePotion(currentCharacter, potionName);
        if (result.success) {
          showToast(`使用 ${potionName}`);
          renderQuickBar();
          updateGameUI();
        } else {
          showToast(result.error);
        }
      }
      return;
    }
    switch (e.key.toLowerCase()) {
      case 's':
        if (e.ctrlKey) { e.preventDefault(); autoSave(); showToast('已保存 (Ctrl+S)'); }
        break;
      case ' ':
        e.preventDefault();
        if (GameEngine.isRunning) { GameEngine.stop(); } else { GameEngine.start(); }
        updateGameUI();
        break;
    }
  });

  // ========== Before quit ==========
  if (window.electronAPI) {
    window.electronAPI.onBeforeQuit(() => {
      if (currentCharacter) {
        GameEngine.stop();
        autoSave();
      }
    });
  }

  // ========== Init ==========
  renderCharSelect();
})();
