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
  async scheduleRebalancePortfolio() {

    //Get Clock. 
    const clock = await alpacaService.api.getClock();
    let startAfterMs = 0; //For dev mode, execute instantly

    //For production mode, Calculate miliseconds to next open + 5 min to be sure the market will be open
    if (this.config.mode === "production") {
      startAfterMs = new Date(clock.next_open) - new Date() - 600000 /*10 min BEFORE opening */;
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
    const latestBar = await alpacaService.api.getLatestBar(symbol);

    //Get historic dayly prices of last year

    //Calculate {this.config.monthsAgoBars} months ago date
    const monthsAgoDate = new Date();
    monthsAgoDate.setMonth(monthsAgoDate.getMonth() - this.config.monthsAgoBars);

    //Get {this.config.monthsAgoBars} months ago daily bars
    const latestDailyBarsAsync = alpacaService.api.getBarsV2(symbol, {
      start: monthsAgoDate.toISOString(),
      timeframe: alpacaService.api.newTimeframe(1, alpacaService.api.timeframeUnit.DAY),
      sort: "desc"
    });

    //Convert latest daily bars to array
    const latestDailyBars = await this._asyncGeneratorToArray(latestDailyBarsAsync);

    //Add indicators to bars
    const latestDailyBarsWithIndicators = await indicatorsService.addIndicatorsToBars(latestDailyBars);

    //Get Latest News
    const latestNews = await alpacaService.api.getNews({
      symbols: [symbol],
      totalLimit: this.config.latestNewsCount,
      includeContent: false
    });

    //Returns an object with the symbol and the latest news, bars, indicators
    return {
      symbol: symbol,
      latestBar: latestBar,
      latestDailyBarsWithIndicators: latestDailyBarsWithIndicators,
      news: latestNews
    };
  }

  async rebalancePortfolio() {

    //Get Symbols to analyze
    const symbols = this.config.symbols;

    //Get all data for symbols from different sources (prices, indicators, news)
    const allDataForSymbols = await Promise.all(
      symbols.map(async (symbol) => await this.getAllDataForSymbol(symbol)
    ));

    const estimationsForSymbols = await Promise.all(
      symbols.map(async (symbol) => await this.getAllDataForSymbol(symbol)
    ));
    
    //Ask AI for a portfolio estimation ({symbol, side, percentage, reasoning})
    const portfolioEstimate = await openAIService.getPortfolioEstimation(allDataForSymbols);

    //Get Current Positions
    const positions = await alpacaService.api.getPositions();
    let portfolioTotal = this.config.defaultPortfolioTotal;

    //If there are open positions, take the total market value as the portfolio total, otherwise default value
    if (positions.length > 0) {
      portfolioTotal = positions.reduce((total, position) => total + position.MarketValue, 0);
    }

    //Rebalance Portfolio with Alpaca Orders
    const rebalancePortfolioOrdersPromises = portfolioEstimate.map(symbolEstimate => {
      const symbol = symbolEstimate.symbol;
      const currentPosition = positions.find(position => position.symbol === symbolEstimate.Symbol);
      const currentAmt = currentPosition.MarketValue || 0;
      const estimateSide = symbolEstimate.side;

      //Get estimated amount. If it is SHORT position, it is a negative amount
      const estiamateAmt = ( portfolioTotal * symbolEstimate.percentage / 100 ) * (estimateSide === "long" ? 1 : -1);

      //If the algorithm assigned 0 allocation for this symbol, simply close the position
      if(estiamateAmt === 0) {
        return alpacaService.api.closePosition(symbol);
      }

      //Calculate the delta amount between the current value of the position and the estimated for today
      //If delta is negative, we need to sell.
      //If delta is positive, we need to buy more.
      const deltaAmt = estiamateAmt - currentAmt;

      //If no changes to estimation, return resolved promise with no order
      if(deltaAmt === 0) {
        return Promise.resolve();
      }

      //Create Order
      return alpacaService.api.createOrder({
        side: deltaAmt > 0 ? "buy" : "sell", 
        symbol: symbol,
        type: "market",
        notional: Math.abs(deltaAmt),
        time_in_force: "gtc"
      });

    })

    return await Promise.all(rebalancePortfolioOrdersPromises);

  }

}

const gptAlgotrading = new GPTAlgotrading({
  mode: process.env.MODE,
  defaultPortfolioTotal: 10000, //TODO: Get this from somewhere
  monthsAgoBars: 1,
  latestNewsCount: 20,
  symbols: [
    "TSLA",
    "GOOG",
    "BRK.B",
    "META",
    "UNH",
    "XOM",
    "LLY",
    "JPM",
    "MSFT",
    "JNJ",
    "AAPL",
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
    "NVDA",
    "GOOGL"
  ] //TODO: Get list of stocks from somewhere else
})

//This is a daily algorithm

//Schedule opining positions at next open of the market
gptAlgotrading.scheduleRebalancePortfolio();