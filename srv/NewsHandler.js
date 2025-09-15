import AlpacaService from './services/alpaca-service.js';
import OpenAIService from './services/openai-service.js';
import IndicatorsService from './services/indicators-service.js';

const alpacaService = AlpacaService.getInstance();
const openAIService = OpenAIService.getInstance();
const indicatorsService = IndicatorsService.getInstance();


class NewsHandler {

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

    alpacaService.api.news_stream.onConnect(() => {

      //Subscribe to news
      alpacaService.api.news_stream.onNews(this.onNews.bind(this))

      alpacaService.api.news_stream.subscribeForNews(this.config.symbols);

    })

    alpacaService.api.news_stream.onError((error) => {
      console.log(error);
    });

    alpacaService.api.news_stream.connect();

  }

  async onNews(news) {

    news.Content = this.stripHtmlTags(news.Content);

    console.log(`News Received: `, news);

    //If market is closed, don't change anything
    // const clock = await alpacaService.api.getClock();

    // if (!clock.is_open) {
    //   console.log("MARKET CLOSED. SKIP NEWS.");
    //   return;
    // }

    news.Symbols
    .filter(symbol => this.config.symbols.includes(symbol))
    .forEach(async symbol => {

      console.log(`News Received for ${symbol}. Getting Data...`);

      const existingPosition = await alpacaService.getPosition(symbol);

      const symbolOpenOrders = await alpacaService.getOpenOrdersFor(symbol);

      if (existingPosition) {
        console.log(`${existingPosition.side} position already exists for ${symbol}. Keeping it and doing nothing`);
        return;
      }

      if(symbolOpenOrders.length > 0) {
        console.log(`Open orders already exists for ${symbol}. Keeping them and doing nothing`);
        return;
      }

      //Get all data for current symbol from different sources (prices, indicators, news)
      const symbolData = await this.getAllDataForSymbol(symbol);

      //Set the last News, as they are not available in the historic API real time
      symbolData.lastNews = news;

      console.log(`Data Received for ${symbol}`);

      console.log(`Getting bracket order for ${symbol}...`);

      //Get estimation for each symbol (bracket order)
      const bracketOrder = await openAIService.getEstimationForSymbol(symbolData);

      console.log(`Bracket order Received for ${symbol}:`, bracketOrder);

      if(bracketOrder.side === "none"){
        console.log(`No action recommended for ${symbol}. Doing nothing.`);
        return;
      }

      //Estimate Qty
      bracketOrder.qty = Math.floor(this.config.orderDollarSize / symbolData.latestMinuteBar.close)

      //Create bracket order
      await alpacaService.createBracketOrder(bracketOrder);

    });

  }


  async getAllDataForSymbol(symbol) {

    const asOfDate = new Date(); //Always use current date 

    //If this is development or production, get the latest bar (this is always a minute bar) of the current moment 
    //(we can't use the same API as the Hist Bars have 15 min delay in free mode. Ratas.)
    let latestMinuteBar = await alpacaService.api.getLatestBar(symbol);

    latestMinuteBar = latestMinuteBar ? {
      date: this.ESTDateTimeLocale.format(new Date(latestMinuteBar.Timestamp)) + " (New York Time)",
      close: latestMinuteBar.ClosePrice,
      high: latestMinuteBar.HighPrice,
      low: latestMinuteBar.LowPrice,
      open: latestMinuteBar.OpenPrice,
      volume: latestMinuteBar.Volume,
      VWAP: latestMinuteBar.VWAP
    } : {};


    //Get Daily Bars
    const previousDailyBarsWithIndicators = await this.getBarsWithIndicators(symbol, alpacaService.api.timeframeUnit.DAY);

    //Get Hour Bars
    //const previousHourlyBarsWithIndicators = await this.getBarsWithIndicators(symbol, alpacaService.api.timeframeUnit.HOUR);

    //Get Minute Bars
    //const previousMinuteBarsWithIndicators = await this.getBarsWithIndicators(symbol, alpacaService.api.timeframeUnit.MIN);

    //Get Latest News
    const latestNews = (await alpacaService.api.getNews({
      symbols: [symbol],
      totalLimit: 10,
      includeContent: true,
      sort: "desc"
    })).map(newsArticle => {
      return {
        datetime: this.ESTDateTimeLocale.format(new Date(newsArticle.UpdatedAt)) + " (New York Time)",
        headline: newsArticle.Headline,
        summary: newsArticle.Summary,
        content: this.stripHtmlTags(newsArticle.Content)
      }
    });

    //Returns an object with the symbol and the latest news, bars, indicators
    return {
      symbol: symbol,
      currentTimestamp: this.ESTDateTimeLocale.format(asOfDate) + " (New York Time)",
      latestMinuteBar: latestMinuteBar,
      previousDailyBars: previousDailyBarsWithIndicators.slice(0, 10),
      //previousHourlyBarsWithIndicators: previousHourlyBarsWithIndicators.slice(0, 10),
      //previousMinuteBarsWithIndicators: previousMinuteBarsWithIndicators.slice(0, 10),
      previousNews: latestNews
    };
  }

  async getBarsWithIndicators(symbol, periodUnit) {

    //Calculate begining of time date for bars query
    const unixEpoch = new Date(0);

    //Get latest bars (Last 220 bars)
    const previousBarsAsync = alpacaService.api.getBarsV2(symbol, {
      start: this.ESTDateLocale.format(unixEpoch),
      limit: 220,
      timeframe: alpacaService.api.newTimeframe(1, periodUnit),
      sort: "desc"
    });

    //Convert latest daily bars to array with only necesary fields
    const previousDailyBars = [];

    for await (const bar of previousBarsAsync) {
      previousDailyBars.push({
        date: this.ESTDateLocale.format(new Date(bar.Timestamp)),
        close: bar.ClosePrice,
        high: bar.HighPrice,
        low: bar.LowPrice,
        open: bar.OpenPrice,
        volume: bar.Volume,
        VWAP: bar.VWAP
      });
    }

    //Add indicators to bars
    const previousBarsWithIndicators = await indicatorsService.addIndicatorsToBars(previousDailyBars);

    return previousBarsWithIndicators;
  }

  stripHtmlTags(str) {
    return str ? str.replace(/<[^>]*>/g, '') : "";
  }

}



export default NewsHandler;