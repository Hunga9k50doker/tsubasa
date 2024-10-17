const fs = require("fs");
const path = require("path");
const axios = require("axios");
const colors = require("colors");
const readline = require("readline");
require("dotenv").config();

class Tsubasa {
  constructor() {
    this.data = this.loadData();
    this.headers = this.initHeaders();
    this.config = this.loadConfig();
    this.restDuration = parseInt(process.env.timeSleep) || 5;
  }

  loadData() {
    const dataFile = path.join(__dirname, "data.txt");
    return fs.readFileSync(dataFile, "utf8").replace(/\r/g, "").split("\n").filter(Boolean);
  }

  initHeaders() {
    const firstUserId = JSON.parse(decodeURIComponent(this.data[0].split("user=")[1].split("&")[0])).id;
    return {
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
  }

  log(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    switch (type) {
      case "success":
        console.log(`[${timestamp}] [*] ${msg}`.green);
        break;
      case "custom":
        console.log(`[${timestamp}] [*] ${msg}`.magenta);
        break;
      case "error":
        console.log(`[${timestamp}] [!] ${msg}`.red);
        break;
      case "warning":
        console.log(`[${timestamp}] [*] ${msg}`.yellow);
        break;
      default:
        console.log(`[${timestamp}] [*] ${msg}`.blue);
    }
  }

  loadConfig() {
    const config = {
      enableCardUpgrades: true,
      enableTapUpgrades: true,
      enableEnergyUpgrades: true,
      maxUpgradeCost: 1000000,
      maxTapUpgradeLevel: 5,
      maxEnergyUpgradeLevel: 5,
      dailycombo: false,
      cardsdailycombo: [],
    };
    try {
      config.enableTapUpgrades = process.env.enableTapUpgrades?.toLowerCase() === "true";
      config.enableCardUpgrades = process.env.enableCardUpgrades?.toLowerCase() === "true";
      config.enableEnergyUpgrades = process.env.enableEnergyUpgrades?.toLowerCase() === "true";
      config.maxTapUpgradeLevel = parseInt(process.env.maxTapUpgradeLevel) || 5;
      config.maxUpgradeCost = parseInt(process.env.maxUpgradeCost) || 1000000;
      config.maxEnergyUpgradeLevel = parseInt(process.env.maxEnergyUpgradeLevel) || 5;
      config.dailycombo = process.env.dailycombo?.toLowerCase() === "true";
      config.cardsdailycombo = process.env.cardsdailycombo || [];
      return config;
    } catch (error) {
      console.error("Không đọc được .env:", error.message);
      return config;
    }
  }

  async countdown(seconds) {
    for (let i = seconds; i >= 0; i--) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`===== Chờ ${i} giây để tiếp tục vòng lặp =====`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log("");
  }

  async callStartAPI(initData, axiosInstance) {
    const startUrl = "https://app.ton.tsubasa-rivals.com/api/start";
    const startPayload = { lang_code: "en", initData: initData };

    try {
      const startResponse = await axiosInstance.post(startUrl, startPayload);
      if (startResponse.status === 200 && startResponse.data && startResponse.data.game_data) {
        const { total_coins, energy, max_energy, multi_tap_count, profit_per_second } = startResponse.data.game_data.user || {};
        const masterHash = startResponse.data.master_hash;
        if (masterHash) {
          this.headers["X-Masterhash"] = masterHash;
        }

        const tasks = startResponse.data.task_info ? startResponse.data.task_info.filter((task) => task.status === 0 || task.status === 1) : [];

        return {
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

  async callDailyRewardAPI(initData, axiosInstance) {
    const dailyRewardUrl = "https://app.ton.tsubasa-rivals.com/api/daily_reward/claim";
    const dailyRewardPayload = { initData: initData };

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

  async executeTask(initData, taskId, axiosInstance) {
    const executeUrl = "https://app.ton.tsubasa-rivals.com/api/task/execute";
    const executePayload = { task_id: taskId, initData: initData };

    try {
      const executeResponse = await axiosInstance.post(executeUrl, executePayload);
      return executeResponse.status === 200;
    } catch (error) {
      this.log(`Lỗi khi làm nhiệm vụ ${taskId}: ${error.message}`);
      return false;
    }
  }

  async checkTaskAchievement(initData, taskId, axiosInstance) {
    const achievementUrl = "https://app.ton.tsubasa-rivals.com/api/task/achievement";
    const achievementPayload = { task_id: taskId, initData: initData };

    try {
      const achievementResponse = await axiosInstance.post(achievementUrl, achievementPayload);
      if (achievementResponse.status === 200) {
        if (achievementResponse.data && achievementResponse.data && achievementResponse.data.task_info) {
          const updatedTask = achievementResponse.data.task_info.find((task) => task.id === taskId);
          if (updatedTask && updatedTask.status === 2) {
            return { success: true, title: updatedTask.title, reward: updatedTask.reward };
          }
        }
      }
      return { success: false };
    } catch (error) {
      this.log(`Lỗi rồi ${taskId}: ${error.message}`);
      return { success: false };
    }
  }

  async getCardInfo(initData, axiosInstance) {
    const startUrl = "https://app.ton.tsubasa-rivals.com/api/start";
    const startPayload = { lang_code: "en", initData: initData };

    try {
      const startResponse = await axiosInstance.post(startUrl, startPayload);
      if (startResponse.status === 200 && startResponse.data && startResponse.data.card_info) {
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
          }));
        });
        return cardInfo;
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

    if (card.unlocked) {
      if (updatedTotalCoins < card.cost)
        return this.log(`Không đủ số dư để nâng cấp thẻ ${card.name} (${card.cardId}) lên level ${cardCurrentLevel + 1}. Cost: ${card.cost}, Balance còn: ${updatedTotalCoins}`, "warning");
      do {
        const levelUpUrl = "https://app.ton.tsubasa-rivals.com/api/card/levelup";
        const levelUpPayload = {
          category_id: card.categoryId,
          card_id: card.cardId,
          initData: initData,
        };
        try {
          const levelUpResponse = await axiosInstance.post(levelUpUrl, levelUpPayload);
          if (levelUpResponse.status === 200) {
            updatedTotalCoins -= card.cost;
            this.log(`Nâng cấp thẻ ${card.name} (${card.cardId}) lên level ${cardCurrentLevel + 1}. Cost: ${card.cost}, Balance còn: ${updatedTotalCoins}`);
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
    const cardsComboDaily = this.config.cardsdailycombo
      .replace(/[\[\]'"]/g, "") // Remove brackets, quotes
      .split(",")
      .map((item) => item.trim());

    let cardInfo = await this.getCardInfo(initData, axiosInstance);
    let updatedTotalCoins = totalCoins;
    let comboComplete = [];
    for (let i = 0; i < cardsComboDaily.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!cardInfo) {
        console.log("Không lấy được thông tin thẻ. Hủy nâng cấp thẻ!");
        return;
      }
      const carDaily = cardInfo.find((item) => item.name?.toLowerCase() === cardsComboDaily[i]?.toLowerCase());
      if (carDaily) {
        updatedTotalCoins = await this.handleUnlock(carDaily, null, cardInfo, initData, totalCoins, axiosInstance);
        cardInfo = await this.getCardInfo(initData, axiosInstance);
        const currentCarDaily = cardInfo.find((item) => item.name?.toLowerCase() === cardsComboDaily[i]?.toLowerCase());
        if (currentCarDaily.level > carDaily.level) {
          this.config.cardsdailycombo = cardsComboDaily.filter((item) => item?.toLowerCase() !== currentCarDaily.name.toLowerCase());
          comboComplete.push(currentCarDaily);
        }
      }
    }
    if (comboComplete.length === 3) {
      this.log(`Đã nâng hoàn thành dailycombo | Balance: ${updatedTotalCoins}`, "success");
      this.config.dailycombo = false;
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
      const cardInfo = await this.getCardInfo(initData, axiosInstance);
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

        if (card.end_datetime && currentTime > card.end_datetime) {
          this.log(`Thẻ ${card.name} (${card.cardId}) đã hết hạn. Bỏ qua nâng cấp.`, "warning");
          continue;
        }

        if (card.unlocked && updatedTotalCoins >= card.cost && card.cost <= this.config.maxUpgradeCost) {
          const levelUpUrl = "https://app.ton.tsubasa-rivals.com/api/card/levelup";
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
              this.log(`Nâng cấp thẻ ${card.name} (${card.cardId}) lên level ${card.level + 1}. Cost: ${card.cost}, Balance còn: ${updatedTotalCoins}`);
              break;
            }
          } catch (error) {
            if (error.response && error.response.status === 400 && error.response.data && error.response.data.message === "Wait for cooldown") {
              this.log(`Chưa đến thời gian nâng cấp tiếp theo cho thẻ ${card.name} (${card.cardId})`, "warning");
              cooldownCards.add(card.cardId);
            } else {
              console.log(error);
              this.log(`Lỗi nâng cấp thẻ ${card.name} (${card.cardId}): ${error.message}`, "error");
            }
          }
        }
      }
    } while (leveledUp);

    return updatedTotalCoins;
  }

  async callTapAPI(initData, tapcount, axiosInstance) {
    const tapUrl = "https://app.ton.tsubasa-rivals.com/api/tap";
    const tapPayload = { tapCount: tapcount, initData: initData };

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
    const recoveryUrl = "https://app.ton.tsubasa-rivals.com/api/energy/recovery";
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
    const tapLevelUpUrl = "https://app.ton.tsubasa-rivals.com/api/tap/levelup";
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
    const energyLevelUpUrl = "https://app.ton.tsubasa-rivals.com/api/energy/levelup";
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

  async upgradeGameStats(initData, axiosInstance) {
    const tapResult = await this.callTapAPI(initData, 1, axiosInstance);
    if (!tapResult.success) {
      this.log(tapResult.error, "error");
      return;
    }

    const requiredProps = ["total_coins", "energy", "max_energy", "multi_tap_count", "profit_per_second", "tap_level", "energy_level"];
    const missingProps = requiredProps.filter((prop) => tapResult[prop] === undefined);
    if (missingProps.length > 0) {
      this.log(`Missing required properties: ${missingProps.join(", ")}`, "error");
      return;
    }

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

  async main() {
    this.log(colors.yellow("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)"));
    while (true) {
      for (let i = 0; i < this.data.length; i++) {
        const initData = this.data[i];
        const userId = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0])).id;
        const firstName = JSON.parse(decodeURIComponent(initData.split("user=")[1].split("&")[0])).first_name;

        this.log(`========== Tài khoản ${i + 1} | ${firstName} ==========`, "custom");

        this.headers["X-Player-Id"] = userId.toString();

        const axiosInstance = axios.create({
          headers: this.headers,
        });

        try {
          const startResult = await this.callStartAPI(initData, axiosInstance);
          if (startResult.success) {
            if (startResult.total_coins !== undefined) {
              this.log(`Balance: ${startResult.total_coins}`);
              this.log(`Năng lượng: ${startResult.energy}/${startResult.max_energy}`);
              this.log(`Tap count: ${startResult.multi_tap_count}`);
              this.log(`Lợi nhuận mỗi giây: ${startResult.profit_per_second}`);
            }

            if (startResult.tasks && startResult.tasks.length > 0) {
              for (const task of startResult.tasks) {
                const executeResult = await this.executeTask(initData, task.id, axiosInstance);
                if (executeResult) {
                  const achievementResult = await this.checkTaskAchievement(initData, task.id, axiosInstance);
                  if (achievementResult.success) {
                    this.log(`Làm nhiệm vụ ${achievementResult.title} thành công | phần thưởng ${achievementResult.reward}`, "success");
                  }
                }
              }
            } else {
              this.log(`Không có nhiệm vụ nào khả dụng.`, "warning");
            }

            const totalTaps = await this.tapAndRecover(initData, axiosInstance);
            this.log(`Tổng số lần tap: ${totalTaps}`, "success");

            const dailyRewardResult = await this.callDailyRewardAPI(initData, axiosInstance);
            this.log(dailyRewardResult.message, dailyRewardResult.success ? "success" : "warning");

            if (this.config.dailycombo) {
              const newBalance = await this.dailyCombo(initData, startResult.total_coins, axiosInstance);
            }

            if (this.config.enableCardUpgrades) {
              const updatedTotalCoins = await this.levelUpCards(initData, startResult.total_coins, axiosInstance);
              this.log(`Đã nâng cấp hết các thẻ đủ điều kiện | Balance: ${updatedTotalCoins}`, "success");
            }

            await this.upgradeGameStats(initData, axiosInstance);
          } else {
            this.log(startResult.error, "error");
          }
        } catch (error) {
          this.log(`Lỗi xử lý tài khoản ${i + 1}: ${error.message}`, "error");
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(`Đã xử lý xong tất cả tài khoản.`);
      console.log("Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)".yellow);
      await wait(this.restDuration * 60);
    }
  }
}

async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${colors.cyan(`[*] Chờ ${Math.floor(i / 60)} phút ${i % 60} giây để tiếp tục`)}`.padEnd(80));
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 0);
  console.log(`Bắt đầu vòng lặp mới...`);
}

const client = new Tsubasa();
client.main().catch((err) => {
  client.log(err.message, "error");
  process.exit(1);
});
