import cds from '@sap/cds';
import AlpacaService from './lib/alpaca-service.js';
import OpenAIService from './lib/openai-service.js';
import dotenv from 'dotenv';

dotenv.config();

const alpacaService = AlpacaService.getInstance();
const openAIService = OpenAIService.getInstance();

class GPTAlgotrading {

  constructor(config) {

    this.config = config;

  }

  static async scheduleProcess() {

    const symbols = [
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
    ];

    //Get Clock. 
    const clock = await alpacaService.api.getClock();

    //Get All positions
    const positions = await alpacaService.api.getPositions();

    //This process only runs at the beginning of the NEXT day (next open) Next 9.30M

    //Calculate miliseconds to next open + 5 min to be sure the market will be open
    const startAfterMs = new Date(clock.next_open) - new Date() + 300000 /*5 min after opening */;

    //Schedule closing open positions before market closes. This is done in case the dyno restarts in the middle of the day
    positions.forEach((position) => fnScheduleClosePosition(position.symbol, clock));

    let startProcessDateTime = new Date();
    startProcessDateTime.setTime(startProcessDateTime.getTime() + startAfterMs);

    console.log(`Process scheduled to run in ${startAfterMs}ms at ${startProcessDateTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}. Stocks ${symbols}`);

    //Run at opening of market, every 24hs
    cds.spawn({
      every: 86400000, //run every 24hs (24hs = 86400000ms)
      after: startAfterMs //Comment this line to run inmediately
    }, async () => {

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
        const latestDailyBars = alpacaService.api.getBarsV2(symbol, {
          start: oneYearAgo.toISOString(),
          timeframe: alpacaService.api.newTimeframe(1, alpacaService.api.timeframeUnit.DAY),
          sort: "desc"
        });

        //Get Latest News
        const latestNews = await alpacaService.api.getNews({
          symbols: [symbol],
          totalLimit: 50,
          includeContent: false
        });

        //OPENAI
        //Get Bracket order estimation from GPT
        const bracketOrder = await openAIService.getDailyEstimationFor({
          symbol: symbol,
          latestBar: latestBar,
          latestDailyBars: latestDailyBars,
          news: latestNews
        });

        //Create Order (long or short)
        await alpacaService.api.createOrder({
          side: bracketOrder.side === "long" ? "buy" : "sell",
          symbol: symbol,
          type: "market",
          qty: 1,
          time_in_force: "gtc"
        });

        console.log(`Order Created for ${symbol}. Side: ${bracketOrder.side}`)

        //Schedule closing the position at end of day
        fnScheduleClosePosition(symbol, clock);

      }

    });

  }

  static async shceduleClosePosition(symbol, clock) {

    //If the position has been opened. Set to close it 10 minutes before end of day
    const msToNextClose = new Date(clock.next_close) - new Date() - 600000 /*600000ms = 10min */;

    setTimeout(async () => {

      console.log(`Closing position for ${symbol}`);

      await alpacaService.api.closePosition(symbol);

      console.log(`Position for ${symbol} closed`);

    }, msToNextClose)

    let closePositionDateTime = new Date();
    closePositionDateTime.setTime(closePositionDateTime.getTime() + msToNextClose);

    console.log(`Position scheduled to be closed in ${msToNextClose}ms at ${closePositionDateTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);

  }

}

GPTAlgotrading.scheduleProcess();