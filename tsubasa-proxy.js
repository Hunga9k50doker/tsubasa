const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const user_agents = require("./config/userAgents");
const settings = require("./config/config");
const { sleep, getRandomNumber, loadData } = require("./utils");
class Tsubasa {
  constructor(initData, accountIndex, proxy) {
    this.accountIndex = accountIndex;
    this.initData = initData;
    this.proxy = proxy;
    this.proxyIP = "Unknown IP";
    const userInfo = JSON.parse(decodeURIComponent(this.initData.split("user=")[1].split("&")[0]));
    const firstUserId = userInfo.id;
    this.headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
      "Content-Type": "application/json",
      Origin: "https://app.ton.tsubasa-rivals.com",
      Referer: "https://app.ton.tsubasa-rivals.com/",
      "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      "X-Player-Id": firstUserId.toString(),
      "X-Masterhash": "fcd309c672b6ede14f2416cca64caa8ceae4040470f67e83a6964aeb68594bbc",
    };
    this.config = this.loadConfig();
    this.session_user_agents = this.#load_session_data();
    this.session_name = null;
    this.skipTasks = settings.SKIP_TASKS;
    this.today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }

  #load_session_data() {
    try {
      const filePath = path.join(process.cwd(), "session_user_agents.json");
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      if (error.code === "ENOENT") {
        return {};
      } else {
        throw error;
      }
    }
  }

  #get_random_user_agent() {
    const randomIndex = Math.floor(Math.random() * user_agents.length);
    return user_agents[randomIndex];
  }

  #get_user_agent() {
    if (this.session_user_agents[this.session_name]) {
      return this.session_user_agents[this.session_name];
    }

    this.log(`Tạo user agent...`);
    const newUserAgent = this.#get_random_user_agent();
    this.session_user_agents[this.session_name] = newUserAgent;
    this.#save_session_data(this.session_user_agents);
    return newUserAgent;
  }

  #save_session_data(session_user_agents) {
    const filePath = path.join(process.cwd(), "session_user_agents.json");
    fs.writeFileSync(filePath, JSON.stringify(session_user_agents, null, 2));
  }

  #get_platform(userAgent) {
    const platformPatterns = [
      { pattern: /iPhone/i, platform: "ios" },
      { pattern: /Android/i, platform: "android" },
      { pattern: /iPad/i, platform: "ios" },
    ];

    for (const { pattern, platform } of platformPatterns) {
      if (pattern.test(userAgent)) {
        return platform;
      }
    }

    return "Unknown";
  }

  set_headers() {
    const platform = this.#get_platform(this.#get_user_agent());
    this.headers["sec-ch-ua"] = `"Not)A;Brand";v="99", "${platform} WebView";v="127", "Chromium";v="127`;
    this.headers["sec-ch-ua-platform"] = platform;
    this.headers["User-Agent"] = this.#get_user_agent();
  }

  createUserAgent() {
    try {
      const telegramauth = this.initData;
      const userData = JSON.parse(decodeURIComponent(telegramauth.split("user=")[1].split("&")[0]));
      this.session_name = userData.id;
      this.#get_user_agent();
    } catch (error) {
      this.log(`Kiểm tra lại query_id, hoặc thay query id mới: ${error.message}`);
    }
  }

  async log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const accountPrefix = `[Tài khoản ${this.accountIndex + 1}]`;
    const ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
    }

    console.log(`[${timestamp}] ${logMessage}`);
  }

  loadConfig() {
    const config = {
      enableTapUpgrades: settings.AUTO_UPGRADE_TAP,
      enableCardUpgrades: settings.AUTO_UPGRADE_CARD,
      enableEnergyUpgrades: settings.AUTO_UPGRADE_ENERGY,
      maxTapUpgradeLevel: settings.MAX_LEVEL_TAP,
      maxUpgradeCost: settings.MAX_PRICE_UPGRADE_CARD,
      maxEnergyUpgradeLevel: settings.MAX_LEVEL_ENERGY,
      dailycombo: settings.AUTO_DAILY_COMBO,
      cardsdailycombo: settings.DAILY_COMBO,
    };
    return config;
  }

  async checkProxyIP() {
    if (!this.proxy) {
      return;
    }

    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
      }
      return response.data.ip;
    } catch (error) {
      this.log(`Lỗi kiểm tra IP proxy: ${error.message}`, "warning");
    }
  }

  async callStartAPI(initData, axiosInstance) {
    const startUrl = "https://api.app.ton.tsubasa-rivals.com/api/start";
    const startPayload = { lang_code: "en", initData: initData };

    try {
      const startResponse = await axiosInstance.post(startUrl, startPayload);
      if (startResponse.status === 200 && startResponse.data && startResponse.data.game_data) {
        const { total_coins, energy, max_energy, multi_tap_count, profit_per_second } = startResponse.data.game_data.user || {};
        const masterHash = startResponse.data.master_hash;
        if (masterHash) {
          this.headers["X-Masterhash"] = masterHash;
        }

        const tasks = startResponse.data.task_info ? startResponse.data.task_info.filter((task) => (task.status === 0 || task.status === 1) && !settings.SKIP_TASKS.includes(task.id)) : [];

        return {
          ...startResponse.data.game_data.user,
          user_daily_reward: startResponse.data.user_daily_reward,
          total_coins,
          energy,
          max_energy,
          multi_tap_count,
          profit_per_second,
          tasks,
          success: true,
        };
      } else {
        return { success: false, error: `Lỗi gọi api start` };
      }
    } catch (error) {
      return { success: false, error: `Lỗi gọi api start: ${error.message}` };
    }
  }

  async callDailyRewardAPI(initData, axiosInstance, userInfo) {
    const dailyRewardUrl = "https://api.app.ton.tsubasa-rivals.com/api/daily_reward/claim";
    const dailyRewardPayload = { initData: initData };
    const { user_daily_reward } = userInfo;
    const today = new Date().setHours(0, 0, 0, 0);
    const dateConfig = new Date(user_daily_reward.last_update * 1000).setHours(0, 0, 0, 0);
    if (today === dateConfig) {
      this.log(`Bạn đã checkin hôm nay, streak: ${user_daily_reward.consecutive_count}`, "warning");
      return;
    }
    try {
      const dailyRewardResponse = await axiosInstance.post(dailyRewardUrl, dailyRewardPayload);
      if (dailyRewardResponse.status === 200) {
        return { success: true, message: "Điểm danh hàng ngày thành công" };
      } else {
        return { success: false, message: "Hôm nay bạn đã điểm danh rồi" };
      }
    } catch (error) {
      if (error.response && error.response.status === 400) {
        return { success: false, message: "Hôm nay bạn đã điểm danh rồi" };
      }
      return { success: false, message: `Lỗi điểm danh hàng ngày: ${error.message}` };
    }
  }

  async executeTask(initData, task, axiosInstance) {
    const { id: taskId, title } = task;

    const executeUrl = "https://api.app.ton.tsubasa-rivals.com/api/task/execute";
    const executePayload = { task_id: taskId, initData: initData };

    try {
      const executeResponse = await axiosInstance.post(executeUrl, executePayload);
      return executeResponse.status === 200;
    } catch (error) {
      this.log(`Lỗi khi làm nhiệm vụ ${taskId}| ${title}: ${error.message}`);
      return false;
    }
  }

  async checkTaskAchievement(initData, task, axiosInstance) {
    const { id: taskId, title } = task;

    const achievementUrl = "https://api.app.ton.tsubasa-rivals.com/api/task/achievement";
    const achievementPayload = { task_id: taskId, initData: initData };
    this.log(`Bắt đầu kiểm tra kết quả nhiệm vụ ${taskId}| ${title}...`);
    try {
      const achievementResponse = await axiosInstance.post(achievementUrl, achievementPayload);
      if (achievementResponse.status === 200) {
        if (achievementResponse.data && achievementResponse.data.task_info) {
          const updatedTask = achievementResponse.data.task_info.find((task) => task.id === taskId) || achievementResponse.data.update?.task;
          if (updatedTask && updatedTask.status === 2) {
            return { success: true, description: "success", reward: updatedTask.reward };
          } else if (updatedTask) {
            return { success: false, description: updatedTask.description || "Chưa đạt điều kiện hoặc nhiệm vụ cần thực hiện thủ công!" };
          }
        }
      }
      return { success: false, description: "Chưa đạt điều kiện hoặc nhiệm vụ cần thực hiện thủ công!" };
    } catch (error) {
      this.log(`Lỗi rồi ${taskId}| ${title}: ${error.response.data.message || error.message}`, "warning");
      return { success: false, description: error.message };
    }
  }

  async getUserInfo(initData, axiosInstance) {
    const startUrl = "https://api.app.ton.tsubasa-rivals.com/api/start";
    const startPayload = { lang_code: "en", initData: initData };
    try {
      const startResponse = await axiosInstance.post(startUrl, startPayload);
      if (startResponse.status === 200 && startResponse.data && startResponse.data.card_info) {
        const dailyCombo = startResponse.data.daily_combo;

        const cardInfo = startResponse.data.card_info.flatMap((category) => {
          return category.card_list.map((card) => ({
            categoryId: card.category,
            cardId: card.id,
            level: card.level,
            cost: card.cost,
            unlocked: card.unlocked,
            name: card.name,
            profitPerHour: card.profit_per_hour,
            nextProfitPerHour: card.next_profit_per_hour,
            unlockCardId: card.unlock_card_id,
            unlockCardLevel: card.unlock_card_level,
          }));
        });
        return { cardInfo, dailyCombo };
      } else {
        console.log("Không tìm thấy thông tin thẻ!");
        return null;
      }
    } catch (error) {
      console.log(`Lỗi lấy thông tin thẻ: ${error.message}`);
      return null;
    }
  }

  async handleUnlock(card, parentCard = null, cardInfo, initData, totalCoins, axiosInstance) {
    let cooldownCards = new Set();
    let cardLevelToUnlock = parentCard?.unlockCardLevel || 1;
    let cardCurrentLevel = card.level;
    let updatedTotalCoins = totalCoins;
    const { level_up_available_date } = card;
    if (parentCard) {
      this.log(`Nâng cấp thẻ ${card.cardId} | ${card.name} cần mở khóa thẻ ${parentCard.cardId} | ${parentCard.name} đến level ${cardLevelToUnlock}`, "warning");
    }

    if (level_up_available_date && level_up_available_date > 0) {
      const now = Math.floor(Date.now() / 1000);
      const secondsLeft = level_up_available_date - now;
      if (secondsLeft > 0) {
        const hours = Math.floor(secondsLeft / 3600);
        const minutes = Math.floor((secondsLeft % 3600) / 60);
        const seconds = secondsLeft % 60;
        this.log(`Chưa đến thời gian nâng cấp tiếp theo cho thẻ ${card.name} (${card.cardId}): Còn ${hours} hours ${minutes} minutes ${seconds} seconds to continue upgrade...`, "warning");
        return updatedTotalCoins;
      }
    }
    if (card.unlocked) {
      if (updatedTotalCoins < card.cost)
        return this.log(`Không đủ số dư để nâng cấp thẻ ${card.name} (${card.cardId}) lên level ${cardCurrentLevel + 1}. Cost: ${card.cost}, Balance còn: ${updatedTotalCoins}`, "warning");
      do {
        const levelUpUrl = "https://api.app.ton.tsubasa-rivals.com/api/card/levelup";
        const levelUpPayload = {
          category_id: card.categoryId,
          card_id: card.cardId,
          initData: initData,
        };
        try {
          const levelUpResponse = await axiosInstance.post(levelUpUrl, levelUpPayload);
          if (levelUpResponse.status === 200) {
            updatedTotalCoins -= card.cost;
            this.log(`Nâng cấp thẻ ${card.name} (${card.cardId}) lên level ${cardCurrentLevel + 1}. Cost: ${card.cost}, Balance còn: ${updatedTotalCoins}`, "success");
          }
        } catch (error) {
          if (error.response && error.response.status === 400 && error.response.data && error.response.data.message === "Wait for cooldown") {
            this.log(`Chưa đến thời gian nâng cấp tiếp theo cho thẻ ${card.name} (${card.cardId})`, "warning");
            cooldownCards.add(card.cardId);
          } else {
            this.log(`Lỗi nâng cấp thẻ ${card.name} (${card.cardId}): ${error.message}`, "warning");
          }
          return updatedTotalCoins;
        }
        cardCurrentLevel++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } while (cardCurrentLevel < cardLevelToUnlock);
    } else {
      const cardToUnlock = cardInfo.find((item) => item.cardId === card.unlockCardId);
      if (cardToUnlock) {
        await this.handleUnlock(cardToUnlock, card, cardInfo, initData, updatedTotalCoins, axiosInstance);
      }
    }
    return updatedTotalCoins;
  }

  async dailyCombo(initData, totalCoins, axiosInstance) {
    if (!this.config.dailycombo) {
      return totalCoins;
    }
    const cardsComboDaily = this.config.cardsdailycombo;

    let { cardInfo, dailyCombo } = await this.getUserInfo(initData, axiosInstance);
    // console.log(dailyCombo);
    if (!dailyCombo || !cardInfo) {
      this.log(`Không thể lấy thông tin daily combo của user. Bỏ qua...`, "warning");
      return;
    }

    if (dailyCombo && dailyCombo.card_ids.length === 3 && dailyCombo.card_ids.every((cardId) => cardId !== null) && dailyCombo.date === this.today) {
      this.log(`Daily combo hôm nay đã hoàn thành. Bỏ qua...`, "warning");
      return;
    }

    let updatedTotalCoins = totalCoins;
    const comboComplete = dailyCombo.card_ids.filter((item) => item !== null);
    for (let i = 0; i < cardsComboDaily.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const carDaily = cardInfo.find((item) => item.name?.toLowerCase() === cardsComboDaily[i]?.toLowerCase() && !comboComplete.includes(item.id));
      if (carDaily) {
        updatedTotalCoins = await this.handleUnlock(carDaily, null, cardInfo, initData, totalCoins, axiosInstance);
      }
    }
    return updatedTotalCoins;
  }

  async levelUpCards(initData, totalCoins, axiosInstance) {
    if (!this.config.enableCardUpgrades) {
      return totalCoins;
    }

    let updatedTotalCoins = totalCoins;
    let leveledUp = false;
    let cooldownCards = new Set();

    do {
      leveledUp = false;
      const cardInfo = await this.getUserInfo(initData, axiosInstance);
      if (!cardInfo) {
        console.log("Không lấy được thông tin thẻ. Hủy nâng cấp thẻ!");
        break;
      }

      const sortedCards = cardInfo.sort((a, b) => b.nextProfitPerHour - a.nextProfitPerHour);
      const currentTime = Math.floor(Date.now() / 1000);

      for (const card of sortedCards) {
        if (cooldownCards.has(card.cardId)) {
          continue;
        }

        if (card.level_up_available_date && card.level_up_available_date > 0) {
          const now = Math.floor(Date.now() / 1000);
          const secondsLeft = card.level_up_available_date - now;
          if (secondsLeft > 0) {
            const hours = Math.floor(secondsLeft / 3600);
            const minutes = Math.floor((secondsLeft % 3600) / 60);
            const seconds = secondsLeft % 60;
            this.log(`Chưa đến thời gian nâng cấp tiếp theo cho thẻ ${card.name} (${card.cardId}): Còn ${hours} hours ${minutes} minutes ${seconds} seconds to continue upgrade...`, "warning");
            continue;
          }
        }

        if (card.end_datetime && currentTime > card.end_datetime) {
          this.log(`Thẻ ${card.name} (${card.cardId}) đã hết hạn. Bỏ qua nâng cấp.`, "warning");
          continue;
        }

        if (card.unlocked && updatedTotalCoins >= card.cost && card.cost <= this.config.maxUpgradeCost) {
          const levelUpUrl = "https://api.app.ton.tsubasa-rivals.com/api/card/levelup";
          const levelUpPayload = {
            category_id: card.categoryId,
            card_id: card.cardId,
            initData: initData,
          };

          try {
            const levelUpResponse = await axiosInstance.post(levelUpUrl, levelUpPayload);
            if (levelUpResponse.status === 200) {
              updatedTotalCoins -= card.cost;
              leveledUp = true;
              this.log(`Nâng cấp thẻ ${card.name} (${card.cardId}) lên level ${card.level + 1}. Cost: ${card.cost}, Balance còn: ${updatedTotalCoins}`, "success");
              break;
            }
          } catch (error) {
            if (error.response && error.response.status === 400 && error.response.data && error.response.data.message === "Wait for cooldown") {
              this.log(`Chưa đến thời gian nâng cấp tiếp theo cho thẻ ${card.name} (${card.cardId})`, "warning");
              cooldownCards.add(card.cardId);
            } else {
              this.log(`Lỗi nâng cấp thẻ ${card.name} (${card.cardId}): ${error.message}`, "warning");
            }
          }
        }
      }
    } while (leveledUp);

    return updatedTotalCoins;
  }

  async callTapAPI(initData, tapCount, axiosInstance) {
    const tapUrl = "https://api.app.ton.tsubasa-rivals.com/api/tap";
    const tapPayload = { tapCount: tapCount, initData: initData };

    try {
      const tapResponse = await axiosInstance.post(tapUrl, tapPayload);
      if (tapResponse.status === 200) {
        const { total_coins, energy, max_energy, multi_tap_count, profit_per_second, energy_level, tap_level } = tapResponse.data.game_data.user;
        return { total_coins, energy, max_energy, multi_tap_count, profit_per_second, energy_level, tap_level, success: true };
      } else {
        return { success: false, error: `Lỗi tap: ${tapResponse.status}` };
      }
    } catch (error) {
      return { success: false, error: `Lỗi tap: ${error.message}` };
    }
  }

  async callEnergyRecoveryAPI(initData, axiosInstance) {
    const recoveryUrl = "https://api.app.ton.tsubasa-rivals.com/api/energy/recovery";
    const recoveryPayload = { initData: initData };

    try {
      const recoveryResponse = await axiosInstance.post(recoveryUrl, recoveryPayload);
      if (recoveryResponse.status === 200) {
        const { energy, max_energy } = recoveryResponse.data.game_data.user;
        return { energy, max_energy, success: true };
      } else {
        return { success: false, error: `Chưa thể hồi phục năng lượng` };
      }
    } catch (error) {
      return { success: false, error: `Chưa thể hồi phục năng lượng` };
    }
  }

  async tapAndRecover(initData, axiosInstance) {
    let continueProcess = true;
    let totalTaps = 0;

    while (continueProcess) {
      const startResult = await this.callStartAPI(initData, axiosInstance);
      if (!startResult.success) {
        this.log(startResult.error, "error");
        break;
      }

      let currentEnergy = startResult.energy;
      const maxEnergy = startResult.max_energy;
      const tapcount = Math.floor(currentEnergy / startResult.multi_tap_count);

      while (currentEnergy > 0) {
        const tapResult = await this.callTapAPI(initData, tapcount, axiosInstance);
        if (!tapResult.success) {
          this.log(tapResult.error, "error");
          continueProcess = false;
          break;
        }

        totalTaps += tapcount;
        this.log(`Tap thành công | Năng lượng còn ${tapResult.energy}/${tapResult.max_energy} | Balance : ${tapResult.total_coins}`, "success");
        currentEnergy = 0;

        const recoveryResult = await this.callEnergyRecoveryAPI(initData, axiosInstance);
        if (!recoveryResult.success) {
          this.log(recoveryResult.error, "warning");
          continueProcess = false;
          break;
        }

        if (recoveryResult.energy === maxEnergy) {
          currentEnergy = recoveryResult.energy;
          this.log(`Hồi năng lượng thành công | Năng lượng hiện tại: ${currentEnergy}/${maxEnergy}`, "success");
        } else {
          this.log(`Hồi năng lượng không đủ | Năng lượng hiện tại: ${recoveryResult.energy}/${maxEnergy}`, "warning");
          continueProcess = false;
          break;
        }
      }
    }

    return totalTaps;
  }

  async callTapLevelUpAPI(initData, axiosInstance) {
    const tapLevelUpUrl = "https://api.app.ton.tsubasa-rivals.com/api/tap/levelup";
    const payload = { initData: initData };

    try {
      const response = await axiosInstance.post(tapLevelUpUrl, payload);
      if (response.status === 200) {
        const { tap_level, tap_level_up_cost, multi_tap_count, total_coins } = response.data.game_data.user;
        return { success: true, tap_level, tap_level_up_cost, multi_tap_count, total_coins };
      } else {
        return { success: false, error: `Lỗi nâng cấp tap: ${response.status}` };
      }
    } catch (error) {
      return { success: false, error: `Lỗi nâng cấp tap: ${error.message}` };
    }
  }

  async callEnergyLevelUpAPI(initData, axiosInstance) {
    const energyLevelUpUrl = "https://api.app.ton.tsubasa-rivals.com/api/energy/levelup";
    const payload = { initData: initData };

    try {
      const response = await axiosInstance.post(energyLevelUpUrl, payload);
      if (response.status === 200) {
        const { energy_level, energy_level_up_cost, max_energy, total_coins } = response.data.game_data.user;
        return { success: true, energy_level, energy_level_up_cost, max_energy, total_coins };
      } else {
        return { success: false, error: `Lỗi nâng cấp energy: ${response.status}` };
      }
    } catch (error) {
      return { success: false, error: `Lỗi nâng cấp energy: ${error.message}` };
    }
  }

  async upgradeGameStats(initData, axiosInstance, tapResult) {
    let { total_coins, energy, max_energy, multi_tap_count, profit_per_second, tap_level, energy_level } = tapResult;

    let tap_level_up_cost = this.calculateTapLevelUpCost(tap_level);
    let energy_level_up_cost = this.calculateEnergyLevelUpCost(energy_level);

    if (this.config.enableTapUpgrades) {
      while (tap_level < this.config.maxTapUpgradeLevel && total_coins >= tap_level_up_cost && tap_level_up_cost <= this.config.maxUpgradeCost) {
        const tapUpgradeResult = await this.callTapLevelUpAPI(initData, axiosInstance);
        if (tapUpgradeResult.success) {
          tap_level = tapUpgradeResult.tap_level;
          total_coins = tapUpgradeResult.total_coins;
          multi_tap_count = tapUpgradeResult.multi_tap_count;
          tap_level_up_cost = this.calculateTapLevelUpCost(tap_level);
          this.log(`Nâng cấp Tap thành công | Level: ${tap_level} | Cost: ${tap_level_up_cost} | Balance: ${total_coins}`, "success");
        } else {
          this.log(tapUpgradeResult.error, "error");
          break;
        }
      }
    }

    if (this.config.enableEnergyUpgrades) {
      while (energy_level < this.config.maxEnergyUpgradeLevel && total_coins >= energy_level_up_cost && energy_level_up_cost <= this.config.maxUpgradeCost) {
        const energyUpgradeResult = await this.callEnergyLevelUpAPI(initData, axiosInstance);
        if (energyUpgradeResult.success) {
          energy_level = energyUpgradeResult.energy_level;
          total_coins = energyUpgradeResult.total_coins;
          max_energy = energyUpgradeResult.max_energy;
          energy_level_up_cost = this.calculateEnergyLevelUpCost(energy_level);
          this.log(`Nâng cấp Energy thành công | Level: ${energy_level} | Cost: ${energy_level_up_cost} | Balance: ${total_coins}`, "success");
        } else {
          this.log(energyUpgradeResult.error, "error");
          break;
        }
      }
    }
  }

  calculateTapLevelUpCost(currentLevel) {
    return 1000 * currentLevel;
  }

  calculateEnergyLevelUpCost(currentLevel) {
    return 1000 * currentLevel;
  }

  async wait(seconds) {
    for (let i = seconds; i > 0; i--) {
      process.stdout.write(`\r${colors.cyan(`[*] Chờ ${Math.floor(i / 60)} phút ${i % 60} giây để tiếp tục`)}`.padEnd(80));
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    console.log(`Bắt đầu vòng lặp mới...`);
  }

  async runAccount() {
    try {
      await this.checkProxyIP();
      let proxyIP = this.proxyIP;
      const initData = this.initData;
      const userData = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0]));
      const userId = userData.id;
      const firstName = userData.first_name || "";
      const lastName = userData.last_name || "";
      this.session_name = userId;

      const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
      console.log(`=========Tài khoản ${this.accountIndex + 1}|[${proxyIP}] ${firstName + " " + lastName} | Nghỉ ${timesleep} trước khi bắt đầu=============`.green);
      this.set_headers();
      if (!proxyIP) {
        this.log(`Không thể kiểm tra ip ${this.proxyIP}:...bỏ qua`);
        return;
      }
      const axiosInstance = axios.create({
        httpsAgent: this.proxy ? new HttpsProxyAgent(this.proxy) : undefined,
        headers: this.headers,
      });
      await sleep(timesleep);
      const startResult = await this.callStartAPI(this.initData, axiosInstance);

      if (!startResult.success) {
        this.log(`Lỗi bắt đầu tài khoản ${this.accountIndex + 1}| ${startResult.error}: bỏ qua...`, "warning");
        return;
      }

      if (startResult.total_coins !== undefined) {
        this.log(`Balance: ${startResult.total_coins} | Năng lượng: ${startResult.energy}/${startResult.max_energy} | Lợi nhuận: ${startResult.profit_per_second}`);
      }

      await this.callDailyRewardAPI(this.initData, axiosInstance, startResult);

      if (settings.AUTO_TAP) {
        const totalTaps = await this.tapAndRecover(initData, axiosInstance);
        this.log(`Tổng số lần tap: ${totalTaps}`, "success");
      }

      if (this.config.dailycombo) {
        this.log(`Bắt đầu daily combo...`);
        await this.dailyCombo(initData, startResult.total_coins, axiosInstance);
      }

      if (settings.AUTO_TASK) {
        this.log(`Bắt đầu nhiệm vụ...`);

        if (startResult.tasks && startResult.tasks.length > 0) {
          const tasks = startResult.tasks;
          for (const task of tasks) {
            this.log(`Bắt đầu nhiệm vụ ${task.id}| ${task.title}...`);
            await sleep(3);
            const executeResult = await this.executeTask(this.initData, task, axiosInstance);
            if (executeResult) {
              await sleep(3);

              const achievementResult = await this.checkTaskAchievement(this.initData, task, axiosInstance);
              if (achievementResult.success) {
                this.log(`Làm nhiệm vụ ${task.id}| ${task.title} thành công!`, "success");
              } else {
                this.log(`Làm nhiệm vụ ${task.id}| ${task.title} thất bại | ${achievementResult.description}`, "warning");
              }
            }
          }
        } else {
          this.log(`Không có nhiệm vụ nào khả dụng.`, "warning");
        }
      }

      if (this.config.enableCardUpgrades) {
        const updatedTotalCoins = await this.levelUpCards(this.initData, startResult.total_coins, axiosInstance);
        this.log(`Đã nâng cấp hết các thẻ đủ điều kiện | Balance: ${updatedTotalCoins}`, "success");
      }

      if (settings.AUTO_UPGRADE_ENERGY || settings.AUTO_UPGRADE_TAP) {
        await this.upgradeGameStats(initData, axiosInstance, startResult);
      }
    } catch (error) {
      this.log(`Lỗi xử lý tài khoản: ${error.message}`, "error");
    }
  }
}

async function runWorker(workerData) {
  const { queryId, accountIndex, proxy } = workerData;
  const to = new Tsubasa(queryId, accountIndex, proxy);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  }
}

async function main() {
  console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
  const queryIds = loadData("data.txt");
  const proxies = loadData("proxy.txt");

  if (queryIds.length > proxies.length) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${queryIds.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  let maxThreads = settings.MAX_THEADS;

  queryIds.map((val, i) => new Tsubasa(val, i, proxies[i]).createUserAgent());

  sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];

    while (currentIndex < queryIds.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, queryIds.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            queryId: queryIds[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message.error) {
                errors.push(`Tài khoản ${message.accountIndex}: ${message.error}`);
              }
              // console.log(`Tài khoản ${message.accountIndex}: ${message.error}`);
              resolve();
            });
            worker.on("error", (error) => {
              errors.push(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              // console.log(`Lỗi worker cho tài khoản ${currentIndex}: ${error.message}`);
              resolve();
            });
            worker.on("exit", (code) => {
              if (code !== 0) {
                errors.push(`Worker cho tài khoản ${currentIndex} thoát với mã: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < queryIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    const to = new Tsubasa(null, 0, proxies[0]);
    await sleep(3);
    console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
    console.log(`=============Hoàn thành tất cả tài khoản=============`.magenta);
    await to.countdown(settings.TIME_SLEEP * 60);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
