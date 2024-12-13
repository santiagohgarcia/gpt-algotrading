import AlpacaService from './services/alpaca-service.js';
import OpenAIService from './services/openai-service.js';
import IndicatorsService from './services/indicators-service.js';
import xlsx from "json-as-xlsx"

const alpacaService = AlpacaService.getInstance();
const openAIService = OpenAIService.getInstance();
const indicatorsService = IndicatorsService.getInstance();

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms)
});

class AIPortfolioManager {

  constructor(config) {

    this.config = config;

    //EST Locale for DATE formatting. We always use NY time when formatting data
    this.ESTDateLocale = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    //EST Locale for DATE AND TIME formatting. We always use NY time when formatting data
    this.ESTDateTimeLocale = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

  }

  async start() {

    let summaryTableResults = [];

    switch (this.config.mode) {

      //For PRODUCTION mode, schedule the portfolio rebalancing for the next Open Market window
      case "production":
        this.scheduleRebalancePortfolio();
        break;

      //For DEVELOPMENT mode, run portfolio rebalancing now
      case "development":
        this.rebalancePortfolio(new Date());
        break;

      //For BACKTESTING mode, run simulation for several dates
      case "backtesting":

        summaryTableResults = await this.backtestRebalancePortfolio(this.config.backtestFromDate, this.config.backtestToDate);

        this.exportBacktestSummaryToExcel(summaryTableResults)

        break;

      default:
        break;
    }
  }

  exportBacktestSummaryToExcel(summaryTableResults) {
    const sheets = [{
      sheet: "Summary",
      columns: [
        { label: "Symbol", value: "symbol" },
        { label: "Date", value: "date" },
        { label: "Side", value: "side" },
        { label: "Certainty", value: "certainty" },
        { label: "Day Before Close Price", value: "dayBeforeClosePrice" },
        { label: "Current Day Close Price", value: "currentDayClosePrice" },
        { label: "PL", value: "profitLoss" },
        { label: "Reasoning", value: "reasoning" },
        { label: "Latest Minute Bar (JSON)", value: "currentLastMinuteBar" },
        { label: "Previous Daily Bars (JSON)", value: "previousDailyBars" },
        { label: "News (JSON)", value: "news" }
      ],
      content: summaryTableResults,
    }];

    const options = {
      fileName: `backtesting${new Date().getTime()}`,
      // extraLength: 1,
      writeMode: "writeFile",
      writeOptions: {}
    };

    xlsx(sheets, options)
  }

  //This process only runs at the beginning of the NEXT day (next open) Next 9.30AM.
  //Schedule opening the positions at the begining of the day
  async scheduleRebalancePortfolio() {

    //Get Clock. 
    const clock = await alpacaService.api.getClock();

    const startAfterMs = new Date(clock.next_open) - new Date() + 120000 /*2 min AFTER opening */;

    //Run at opening of market
    setTimeout(async () => {
      await this.rebalancePortfolio(new Date());
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

  async getAllDataForSymbol(symbol, asOfDate) {

    let latestMinuteBar = null;

    //If this is a backtesting, get the minute bar from the As Of Date exact moment
    if (this.config.mode === "backtesting") {
      const latestBarAsync = alpacaService.api.getBarsV2(symbol, {
        start: asOfDate.toISOString(),
        end: asOfDate.toISOString(),
        limit: 1,
        timeframe: alpacaService.api.newTimeframe(1, alpacaService.api.timeframeUnit.MIN)
      });
      for await (const latestBar of latestBarAsync) {
        latestMinuteBar = latestBar;
      }
    } else {
      //If this is development or production, get the latest bar (this is always a minute bar) of the current moment 
      //(we can't use the same API as the Hist Bars have 15 min delay in free mode. Ratas.)
      latestMinuteBar = await alpacaService.api.getLatestBar(symbol);
    }

    latestMinuteBar = latestMinuteBar ? {
      date: this.ESTDateTimeLocale.format(new Date(latestMinuteBar.Timestamp)) + " (New York Time)",
      close: latestMinuteBar.ClosePrice,
      high: latestMinuteBar.HighPrice,
      low: latestMinuteBar.LowPrice,
      volume: latestMinuteBar.Volume,
      VWAP: latestMinuteBar.VWAP
    } : {};

    //Calculate begining of time date for bars query
    const unixEpoch = new Date(0);

    //Last day at midnight for bars query
    const asOfDatePreviousDayMidnight = new Date(asOfDate);
    asOfDatePreviousDayMidnight.setDate(asOfDatePreviousDayMidnight.getDate() - 1);
    asOfDatePreviousDayMidnight.setHours(0, 0, 0, 0);

    //Get latest daily bars (Last {barsTopLimit} bars from today)
    const previousDailyBarsAsync = alpacaService.api.getBarsV2(symbol, {
      start: this.ESTDateLocale.format(unixEpoch),
      end: this.ESTDateLocale.format(asOfDatePreviousDayMidnight), //Get all bars until last day (estimate will run for current day)
      limit: this.config.barsTopLimit,
      timeframe: alpacaService.api.newTimeframe(1, alpacaService.api.timeframeUnit.DAY),
      sort: "desc"
    });

    //Convert latest daily bars to array with only necesary fields
    const previousDailyBars = [];

    for await (const bar of previousDailyBarsAsync) {
      previousDailyBars.push({
        date: this.ESTDateLocale.format(new Date(bar.Timestamp)),
        close: bar.ClosePrice,
        high: bar.HighPrice,
        low: bar.LowPrice,
        volume: bar.Volume,
        VWAP: bar.VWAP
      });
    }

    //Add indicators to bars
    const previousDailyBarsWithIndicators = await indicatorsService.addIndicatorsToBars(previousDailyBars);

    //Get Latest News
    const latestNews = (await alpacaService.api.getNews({
      symbols: [symbol],
      start: unixEpoch.toISOString(),
      end: asOfDate.toISOString(),
      totalLimit: this.config.newsTopLimit,
      includeContent: true,
      sort: "desc"
    })).map(newsArticle => {
      return {
        datetime: this.ESTDateTimeLocale.format(new Date(newsArticle.UpdatedAt)) + " (New York Time)",
        headline: newsArticle.Headline,
        summary: newsArticle.Summary,
        content: newsArticle.Content
      }
    });

    //Returns an object with the symbol and the latest news, bars, indicators
    return {
      symbol: symbol,
      currentTimestamp: this.ESTDateTimeLocale.format(asOfDate) + " (New York Time)",
      currentLastMinuteBar: latestMinuteBar,
      previousDailyBars: previousDailyBarsWithIndicators,
      news: latestNews
    };
  }

  async rebalancePortfolio(asOfDate) {

    console.log(`Rebalancing portfolio. As of Date: ${asOfDate}`);

    //Get symbols data and estimations
    const symbolDataAndEstimations = await this.getSymbolsDataAndEstimations(asOfDate);

    //Print summary of estimations
    this.printSummaryOfEstimations(symbolDataAndEstimations);

    //Create Rebalancing Orders in Alpaca
    await this.createRebalancingOrders(symbolDataAndEstimations)

  }

  async backtestRebalancePortfolio(fromDate, toDate) {

    const currentDate = new Date(fromDate);
    currentDate.setHours(9, 32, 0, 0); //Simulate to run this after market opened every day
    toDate.setHours(9, 32, 0, 0)
    let backtestResults = [];

    //Loop from From Date to To Date, estimating in each date and saving results
    while (currentDate <= toDate) {

      //Skip saturdays and sundays
      if (!(currentDate.getDay() === 6 || currentDate.getDay() === 0)) {

        //Get symbols data and estimations
        const symbolDataAndEstimations = await this.getSymbolsDataAndEstimations(currentDate);

        //Print summary of estimations for current date
        this.printSummaryOfEstimations(symbolDataAndEstimations);

        //Save in a single array all the estimations to then compare with actual day bars
        backtestResults.push(symbolDataAndEstimations);
      }

      //Add one day to current Date
      currentDate.setDate(currentDate.getDate() + 1);

    }

    backtestResults = backtestResults.flat();

    //Get actual bars to compare
    const realMultiBars = await alpacaService.api.getMultiBarsV2(this.config.symbols, {
      start: this.ESTDateLocale.format(fromDate),
      end: this.ESTDateLocale.format(toDate), //Get all bars until last day (estimate will run for current day)
      timeframe: alpacaService.api.newTimeframe(1, alpacaService.api.timeframeUnit.DAY),
      sort: "asc"
    });

    //Calculate Diff and print results as a summary
    const summaryTable = backtestResults.map((backtestResult) => {

      //Get real bars for this symbol
      const symbolRealBars = realMultiBars.get(backtestResult.symbol).map(bar => {
        return {
          date: this.ESTDateLocale.format(new Date(bar.Timestamp)),
          close: bar.ClosePrice
        }
      });

      //Find current Date Real Bar
      const currentDateRealBar = symbolRealBars.find(bar => bar.date === backtestResult.estimation.estimationForDate);

      //If there is not current real bar, this day the market was closed. So no backtest result is needed
      if (!currentDateRealBar) {
        return null;
      }

      //remove content from news, as it now too long 
      backtestResult.data.news.forEach(newsArticle => delete newsArticle.content)

      //Calculate profit/loss
      const profitLoss = (currentDateRealBar.close - backtestResult.data.previousDailyBars[0].close) * (backtestResult.estimation.side === "long" ? 1 : -1)
      return {
        symbol: backtestResult.symbol,
        date: backtestResult.estimation.estimationForDate,
        side: backtestResult.estimation.side,
        certainty: backtestResult.estimation.certainty,
        dayBeforeClosePrice: backtestResult.data.previousDailyBars[0].close,
        currentDayClosePrice: currentDateRealBar.close,
        reasoning: backtestResult.estimation.reasoning,
        currentLastMinuteBar: JSON.stringify(backtestResult.data.currentLastMinuteBar),
        previousDailyBars: JSON.stringify(backtestResult.data.previousDailyBars),
        news: JSON.stringify(backtestResult.data.news),
        profitLoss: Number(profitLoss.toFixed(2))
      };

    }).filter(Boolean);

    console.table(summaryTable, ["symbol", "date", "side", "certainty", "dayBeforeClosePrice", "currentDayClosePrice", "profitLoss"]);

    const totalPL = summaryTable.reduce((total, st) => total + Number(st.profitLoss), 0);
    console.log("Total PL:", totalPL);

    return summaryTable;

  }

  printSummaryOfEstimations(symbolDataAndEstimations) {
    //Print summary of estimations
    const summary = symbolDataAndEstimations.map(symbolDataAndEstimation => {
      return symbolDataAndEstimation.estimation;
    });

    console.log(summary);
  }

  async getSymbolsDataAndEstimations(asOfDate) {

    //Get Symbols to analyze
    const symbolsDataAndEstimations = this.config.symbols.map(symbol => {
      return {
        symbol: symbol,
        data: {},
        estimation: {}
      }
    });

    //Loop all symbols
    for (let index = 0; index < symbolsDataAndEstimations.length; index++) {

      const symbolDataAndEstimation = symbolsDataAndEstimations[index];

      //Get all data for current symbol from different sources (prices, indicators, news)
      symbolDataAndEstimation.data = await this.getAllDataForSymbol(symbolDataAndEstimation.symbol, asOfDate);

      //Get estimation for each symbol, with certainty ponderation
      symbolDataAndEstimation.estimation = await Promise.all([
        await openAIService.getEstimationForSymbol(symbolDataAndEstimation.data, asOfDate),
        sleep(5000) // Make sure each call is done every 5 seconds to avoid reaching limits of tokens per minute
      ]).then(results => results[0])

    }

    return symbolsDataAndEstimations;

  }

  async createRebalancingOrders(symbolsDataAndEstimations) {

    //Get total certanty to generate percentages
    const totalCertainty = symbolsDataAndEstimations.reduce(
      (total, symbolsDataAndEstimation) => total + symbolsDataAndEstimation.estimation.certainty, 0);

    //Get Current Positions
    const positions = await alpacaService.api.getPositions();
    let portfolioTotalAmt = this.config.defaultPortfolioTotal;

    //If there are open positions, take the total market value as the portfolio total, otherwise default value
    if (positions.length > 0) {
      portfolioTotalAmt = positions.reduce((total, position) => total + Math.abs(Number(position.market_value)), 0);
    }

    //Rebalance Portfolio with Alpaca Orders
    //Loop all estimations
    for (let index = 0; index < symbolsDataAndEstimations.length; index++) {

      const symbolDataAndEstimation = symbolsDataAndEstimations[index];
      const symbol = symbolDataAndEstimation.symbol;
      const currentPosition = positions.find(position => position.symbol === symbolDataAndEstimation.symbol);
      const currentSymbolData = symbolDataAndEstimation.data;
      const currentSymbolLastPrice = Number(currentPosition?.current_price) || currentSymbolData.previousDailyBars[0]?.close;
      const estimateSide = symbolDataAndEstimation.estimation.side;
      const estimatePercentage = symbolDataAndEstimation.estimation.certainty / totalCertainty;
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

export default AIPortfolioManager;