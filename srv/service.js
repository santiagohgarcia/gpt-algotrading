// import cds from '@sap/cds';
import AlpacaService from './lib/alpaca-service.js';
import OpenAIService from './lib/openai-service.js';
import IndicatorsService from './lib/indicators-service.js';
import dotenv from 'dotenv';

dotenv.config();

const alpacaService = AlpacaService.getInstance();
const openAIService = OpenAIService.getInstance();
const indicatorsService = IndicatorsService.getInstance();

class GPTAlgotrading {

  constructor(config) {

    this.config = config;

  }

  //This process only runs at the beginning of the NEXT day (next open) Next 9.30AM.
  //Schedule opening the positions at the begining of the day
  async scheduleOpenPositions() {

    //Get Clock. 
    const clock = await alpacaService.api.getClock();
    let startAfterMs = 0; //For dev mode, execute instantly

    //For production mode, Calculate miliseconds to next open + 5 min to be sure the market will be open
    if(this.config.mode === "production") {
      startAfterMs = new Date(clock.next_open) - new Date() - 600000 /*10 min BEFORE opening */;
    }

    let startProcessDateTime = new Date();
    startProcessDateTime.setTime(startProcessDateTime.getTime() + startAfterMs);

    //Run at opening of market
    setTimeout(async () => { 
      await this.openPositions();
    }, startAfterMs);

    console.log(`Process scheduled to run in ${startAfterMs}ms at ${startProcessDateTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}. Stocks ${this.config.symbols}`);

  }

  async _asyncGeneratorToArray(generator) {
    const result = [];
    for await (const item of generator) {
      result.push(item);
    }
    return result;
  }

  async openPositions() {

    const symbols = this.config.symbols;

    //Run for each stock
    for (let index = 0; index < symbols.length; index++) {

      const symbol = symbols[index];

      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      //Get Current Asset
      const asset = await alpacaService.api.getAsset(symbol);

      //Check if symbol is tradable
      if (!asset.tradable) {
        console.error(`Symbol ${symbol} is not tradeable`);
        return;
      }

      //Get information needed to send to GPT

      //Get Latest Price Bar
      const latestBar = await alpacaService.api.getLatestBar(symbol);

      //Get historic dayly prices of last year
      let latestDailyBarsAsync = alpacaService.api.getBarsV2(symbol, {
        start: oneYearAgo.toISOString(),
        timeframe: alpacaService.api.newTimeframe(1, alpacaService.api.timeframeUnit.DAY),
        sort: "desc"
      });

      let latestDailyBars = await this._asyncGeneratorToArray(latestDailyBarsAsync);
      
      //Add indicators to bars
      latestDailyBars = await indicatorsService.addIndicatorsToBars(latestDailyBars);

      //Get Latest News
      const latestNews = await alpacaService.api.getNews({
        symbols: [symbol],
        totalLimit: 50,
        includeContent: false
      });

      //OPENAI
      //Get Bracket order estimation from GPT
      const estimate = await openAIService.getDailyEstimationFor({
        symbol: symbol,
        latestBar: latestBar,
        latestDailyBars: latestDailyBars,
        news: latestNews
      });

      //Create Order (long or short)
      await alpacaService.api.createOrder({
        side: estimate.side === "long" ? "buy" : "sell",
        symbol: symbol,
        type: "market",
        qty: 1,
        time_in_force: "gtc"
      });

      console.log(`Order Created for ${symbol}. Side: ${estimate.side}`)

    }

  }

  async shceduleClosePositions() {

    const clock = await alpacaService.api.getClock();

    //If the position has been opened. Set to close it 10 minutes before end of day
    const msToNextClose = new Date(clock.next_close) - new Date() - 600000 /*600000ms = 10min */;

    setTimeout(async () => {
      await this.closePositions();
    }, msToNextClose)

    let closePositionDateTime = new Date();
    closePositionDateTime.setTime(closePositionDateTime.getTime() + msToNextClose);

    console.log(`Positions scheduled to be closed in ${msToNextClose}ms at ${closePositionDateTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

  }

  async closePositions() {
    console.log(`Closing positions`);

    await alpacaService.api.closeAllPositions();

    console.log(`Positions closed`);
  }

}

const gptAlgotrading = new GPTAlgotrading({
  mode: process.env.MODE,
  symbols: [
    "AAPL",
    "MSFT",
    "AMZN",
    "NVDA",
    "GOOGL",
    "TSLA",
    "GOOG",
    "BRK.B",
    "META",
    "UNH",
    "XOM",
    "LLY",
    "JPM",
    "JNJ",
    "V",
    "PG",
    "MA",
    "AVGO",
    "HD",
    "CVX",
    "MRK",
    "ABBV",
    "COST",
    "PEP",
    "ADBE"
  ]
})

//This is a daily algorithm

//Schedule opining positions at next open of the market
gptAlgotrading.scheduleOpenPositions();

//Schedule closing positions at market closing
gptAlgotrading.shceduleClosePositions();