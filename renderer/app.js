// Main renderer application
(function () {
  'use strict';

  const SAVE_KEY = 'hotlegend_save';
  let currentCharacter = null;
  let selectedInventoryItem = null;
  let selectedShopItem = null;
  let shopBuyQty = 1;

  // DOM elements
  const charSelectScreen = document.getElementById('char-select-screen');
  const gameScreen = document.getElementById('game-screen');
  const charListEl = document.getElementById('char-list');
  const createPanel = document.getElementById('create-char-panel');
  const combatLogEl = document.getElementById('combat-log');
  const toastEl = document.getElementById('toast');
  const goldTextEl = document.getElementById('gold-text');
  const gameStatusEl = document.getElementById('game-status');

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
    renderInventory();
    renderAllocateButtons();
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
        renderInventory();
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
        if (currentCharacter.equipment[slot] && confirm(`卸下 ${currentCharacter.equipment[slot]} ？`)) {
          Inventory.unequip(currentCharacter, slot);
          renderEquipment();
          renderInventory();
          updateGameUI();
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
  function renderInventory() {
    const el = document.getElementById('inventory-display');
    const ch = currentCharacter;
    const countEl = document.getElementById('inv-count');

    if (!ch.inventory.length) {
      el.innerHTML = '<span style="color:#555;">背包为空</span>';
      countEl.textContent = '(0)';
      return;
    }

    countEl.textContent = `(${ch.inventory.length})`;

    let html = '';
    for (const item of ch.inventory) {
      const isEquippable = !!Inventory.getEquipmentSlot(item.name);
      const cls = selectedInventoryItem === item.name ? 'inv-item selected' : 'inv-item';
      const eqClass = isEquippable ? ' equippable' : '';
      html += `<div class="${cls}${eqClass}" data-name="${item.name}">
        <span class="inv-item-name">${item.name}${isEquippable ? ' ★' : ''}</span>
        <span class="inv-item-qty">x${item.quantity}</span>
      </div>`;
    }
    el.innerHTML = html;

    el.querySelectorAll('.inv-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedInventoryItem = item.dataset.name;
        renderInventory();
      });
    });
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

  document.getElementById('btn-equip-selected').addEventListener('click', () => {
    if (!selectedInventoryItem) { showToast('请先在背包中点击选择物品'); return; }
    const result = Inventory.equip(currentCharacter, selectedInventoryItem);
    if (result.success) {
      showToast(`装备了 ${selectedInventoryItem}`);
      selectedInventoryItem = null;
      renderInventory();
      renderEquipment();
      updateGameUI();
    } else {
      showToast(result.error);
    }
  });

  document.getElementById('btn-sell-selected').addEventListener('click', () => {
    if (!selectedInventoryItem) { showToast('请先在背包中点击选择物品'); return; }
    const eq = Inventory.findEquipment(selectedInventoryItem);
    const potion = window.gameData.items.potions.find(p => p.name === selectedInventoryItem);
    const price = eq ? eq.sellPrice : potion ? potion.sellPrice : 1;
    if (confirm(`确定出售 ${selectedInventoryItem}？售价: ${price} 金币`)) {
      Inventory.sell(currentCharacter, selectedInventoryItem);
      selectedInventoryItem = null;
      renderInventory();
      updateGameUI();
      showToast('出售成功');
    }
  });

  document.getElementById('btn-discard-selected').addEventListener('click', () => {
    if (!selectedInventoryItem) { showToast('请先在背包中点击选择物品'); return; }
    if (confirm(`确定丢弃 ${selectedInventoryItem} 吗？（不可恢复）`)) {
      Inventory.discard(currentCharacter, selectedInventoryItem);
      selectedInventoryItem = null;
      renderInventory();
      updateGameUI();
      showToast('物品已丢弃');
    }
  });

  // ========== Keyboard shortcuts ==========
  document.addEventListener('keydown', (e) => {
    if (!currentCharacter) return;
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
