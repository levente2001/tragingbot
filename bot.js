require('dotenv').config();
const WebSocket = require('ws');
const Binance = require('node-binance-api');
const binance = new Binance().options({
  APIKEY: process.env.APIKEY,
  APISECRET: process.env.APISECRET
});

const SOCKET = "wss://stream.binance.com:9443/ws/btcusdc@kline_1m";
const symbol = 'BTCUSDC';
const usdtAmount = 10; // Kereskedési mennyiség USDT-ben
const RSI_PERIOD = 14; // RSI időszak
let lastBuyPrice = 0; // Utolsó vétel árának követése
let isPositionOpen = false; // Pozíció nyitott állapotának jelzése
let closes = []; // Záró árak tárolása RSI számításhoz

// RSI kiszámítása
const calculateRSI = (closes) => {
  let gains = 0, losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }
  const avgGain = gains / RSI_PERIOD;
  const avgLoss = losses / RSI_PERIOD;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

// Kereskedési megbízások Binance API-n keresztül
async function order(side, quantity) {
  try {
    console.log(`Megrendelés küldése: ${side}`);
    const order = await binance.order({
      symbol: symbol,
      side: side,
      quantity: quantity,
      type: 'MARKET'
    });
    console.log("Megrendelés sikeres:", order);
    return true;
  } catch (error) {
    console.error("Hiba a megbízás küldésekor:", error);
    return false;
  }
}

// WebSocket indítása
const ws = new WebSocket(SOCKET);

ws.on('open', () => {
  console.log("Kapcsolat létrejött a Binance websocketen.");
});

ws.on('message', async (data) => {
  const json = JSON.parse(data);
  const candle = json.k;
  const isCandleClosed = candle.x;
  const close = parseFloat(candle.c);

  if (isCandleClosed) {
    console.log("Gyertya zárva, ár:", close);
    closes.push(close);

    if (closes.length > RSI_PERIOD) {
      closes.shift();
      const rsi = calculateRSI(closes);
      console.log(`RSI érték: ${rsi}`);

      // Vételi jelzés
      if (rsi < 30 && (!isPositionOpen || close > lastBuyPrice * 0.95)) {
        console.log("Vételi jel - RSI túladott szint alatt");
        const quantity = (usdtAmount / close).toFixed(6);
        const orderSucceeded = await order("BUY", quantity);
        if (orderSucceeded) {
          lastBuyPrice = close;
          isPositionOpen = true;
        }
      }

      // Eladási jelzés
      if (rsi > 70 && isPositionOpen) {
        console.log("Eladási jel - RSI túlvetett szint felett");
        const quantity = (usdtAmount / lastBuyPrice).toFixed(6);
        const orderSucceeded = await order("SELL", quantity);
        if (orderSucceeded) {
          isPositionOpen = false;
        }
      }
    }
  }
});

ws.on('close', () => {
  console.log("Kapcsolat lezárva.");
});
