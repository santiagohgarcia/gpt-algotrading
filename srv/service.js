// import cds from '@sap/cds';
import AlpacaService from './lib/alpaca-service.js';
import OpenAIService from './lib/openai-service.js';
import IndicatorsService from './lib/indicators-service.js';
import dotenv from 'dotenv';

dotenv.config();

const alpacaService = AlpacaService.getInstance();
const openAIService = OpenAIService.getInstance();
const indicatorsService = IndicatorsService.getInstance();

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
});

class GPTAlgotrading {

  constructor(config) {

    this.config = config;

  }

  //This process only runs at the beginning of the NEXT day (next open) Next 9.30AM.
  //Schedule opening the positions at the begining of the day
  async scheduleRebalancePortfolio() {

    //Get Clock. 
    const clock = await alpacaService.api.getClock();
    let startAfterMs = 0; //For dev mode, execute instantly

    //For production mode, Calculate miliseconds to next open + 5 min to be sure the market will be open
    if (this.config.mode === "production") {
      startAfterMs = new Date(clock.next_open) - new Date() + 300000 /*5 min AFTER opening */;
    }

    //Run at opening of market
    setTimeout(async () => {
      await this.rebalancePortfolio();
    }, startAfterMs);

    //Log scheduling
    let startProcessDateTime = new Date();
    startProcessDateTime.setTime(startProcessDateTime.getTime() + startAfterMs);

    console.log(`Rebalance Portfolio scheduled to run in ${startAfterMs}ms at ${startProcessDateTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}. Stocks ${this.config.symbols}`);

  }

  //Utils function to convert async generator into Array
  async _asyncGeneratorToArray(generator) {
    const result = [];
    for await (const item of generator) {
      result.push(item);
    }
    return result;
  }

  async getAllDataForSymbol(symbol) {

    //Get Latest Price Bar
    // const latestBar = await alpacaService.api.getLatestBar(symbol);

    //Get historic dayly prices of last year

    //Calculate begining of time date
    const unixEpoch = new Date(0);

    //Get latest daily bars (Last {barsTopLimit} bars from today)
    const latestBarsAsync = alpacaService.api.getBarsV2(symbol, {
      start: unixEpoch.toISOString(),
      limit: this.config.barsTopLimit,
      timeframe: alpacaService.api.newTimeframe(1, alpacaService.api.timeframeUnit.DAY),
      sort: "desc"
    });

    //Convert latest daily bars to array with only necesary fields
    const latestBars = [];

    for await (const bar of latestBarsAsync) {
      latestBars.push({
        date: new Date(bar.Timestamp).toISOString().substring(0, 10),
        close: bar.ClosePrice,
        high: bar.HighPrice,
        low: bar.LowPrice,
        volume: bar.Volume,
        VWAP: bar.VWAP
      });
    }

    //Add indicators to bars
    const latestBarsWithIndicators = await indicatorsService.addIndicatorsToBars(latestBars);

    //Get Latest News
    const latestNews = (await alpacaService.api.getNews({
      symbols: [symbol],
      totalLimit: this.config.newsTopLimit,
      includeContent: false
    })).map(newsArticle => {
      return {
        updatedAt: new Date(newsArticle.UpdatedAt).toISOString(),
        headline: newsArticle.Headline,
        summary: newsArticle.Summary
      }
    });

    //Returns an object with the symbol and the latest news, bars, indicators
    return {
      symbol: symbol,
      currentDateTime: new Date().toISOString(),
      latestBars: latestBarsWithIndicators,
      news: latestNews
    };
  }

  async rebalancePortfolio() {

    //Get Symbols to analyze
    const symbols = this.config.symbols;

    const estimationsForSymbols = [];
    const symbolsData = [];

    //Loop all symbols
    for (let index = 0; index < symbols.length; index++) {

      const symbol = symbols[index];

      //Get all data for current symbol from different sources (prices, indicators, news)
      const symbolData = await this.getAllDataForSymbol(symbol);
      symbolsData.push(symbolData);

      //Get estimation for each symbol, with certanty ponderation
      const estimationForSymbol = await openAIService.getEstimationForSymbol(symbolData)
      estimationsForSymbols.push(estimationForSymbol);

      await sleep(30*1000) //Wait 30s for the 30K token limit per minute on gpt-4o. This can be removed when we move to Tier2

    }
    
    //Create Rebalancing Orders in Alpaca
    await this.createRebalancingOrders(symbolsData,estimationsForSymbols)

  }

  async createRebalancingOrders(symbolsData, estimationsForSymbols) {
    //Get total certanty to generate percentages
    const totalCertanty = estimationsForSymbols.reduce((total, estimate) => total + estimate.certanty, 0);

    //Get Current Positions
    const positions = await alpacaService.api.getPositions();
    let portfolioTotalAmt = this.config.defaultPortfolioTotal;

    //If there are open positions, take the total market value as the portfolio total, otherwise default value
    if (positions.length > 0) {
      portfolioTotalAmt = positions.reduce((total, position) => total + Math.abs(Number(position.market_value)), 0);
    }

    //Rebalance Portfolio with Alpaca Orders
    //Loop all estimations
    for (let index = 0; index < estimationsForSymbols.length; index++) {

      const symbolEstimate = estimationsForSymbols[index];
      const symbol = symbolEstimate.symbol;
      const currentPosition = positions.find(position => position.symbol === symbolEstimate.symbol);
      const currentSymbolData = symbolsData.find(symbolData => symbolData.symbol === symbolEstimate.symbol);
      const currentSymbolLastPrice = Number(currentPosition?.current_price) || currentSymbolData?.close;
      const estimateSide = symbolEstimate.side;
      const estimatePercentage = symbolEstimate.certanty / totalCertanty;
      let currentQty = Number(currentPosition?.qty) || 0;

      console.log(`Creating order for ${symbol}. Current Qty: ${currentQty}`);

      //Get estimated amount. If the AI estimated a SHORT position, it is a negative amount.
      let estiamateAmt = (portfolioTotalAmt * estimatePercentage) * (estimateSide === "long" ? 1 : -1);
      estiamateAmt = Number(estiamateAmt.toFixed(2));

      //Estimate the non-fractional qty to represent the estimated amount. SHORT fractional orders are not supported.
      const estimateQty = Math.round(estiamateAmt / currentSymbolLastPrice);

      //If the algorithm assigned 0 allocation for this symbol, close the position
      if (estimateQty === 0) {
        if (currentPosition) {
          await alpacaService.api.closePosition(symbol);
        }
        continue;
      }

      //If the current posisiton is LONG and the estimated is SHORT (or viceversa), close the original position first
      if (Math.sign(estimateQty) != Math.sign(currentQty) && currentQty !== 0) {
        console.log(`${symbol} SWITCHING SIDES!`)
        await alpacaService.closePositionAndWait(symbol);
        currentQty = 0;
      }

      //Calculate the delta qty between the current qty of the position and the estimated qty
      //If delta is negative, we need to sell.
      //If delta is positive, we need to buy more.
      const deltaQty = estimateQty - currentQty;

      //If the delta is 0 we close the position.
      if (deltaQty === 0) {
        continue
      }

      //Create Order
      const side = deltaQty > 0 ? "buy" : "sell";
      await alpacaService.api.createOrder({
        side: side,
        symbol: symbol,
        type: "market",
        qty: Math.abs(deltaQty),
        //extended_hours: true, //Makes the order executable before 9AM and after 4:30PM. Only works with type=limit 
        time_in_force: "day"
      });

      console.log(`Order Created for ${symbol} (${side}). Qty: ${deltaQty}. Estimated Qty: ${estimateQty}. Position Side: ${estimateSide}`);

    }

  }

}

const gptAlgotrading = new GPTAlgotrading({
  mode: process.env.MODE,
  defaultPortfolioTotal: Number(process.env.DEFAULT_PORTFOLIO_TOTAL),
  barsTopLimit: Number(process.env.BARS_TOP_LIMIT),
  newsTopLimit: Number(process.env.NEWS_TOP_LIMIT),
  symbols: [
    "AAPL",
    "TSLA",
    "GOOG",
    "GOOGL",
    "BRK.B",
    "META",
    "UNH",
    "XOM",
    "LLY",
    "JPM",
    "MSFT",
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
    "ADBE",
    "AMZN",
    "NVDA"
  ] //TODO: Get list of stocks from somewhere else
})

//This is a daily algorithm

//Schedule opining positions at next open of the market
gptAlgotrading.scheduleRebalancePortfolio();