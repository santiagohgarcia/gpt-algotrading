import cds from '@sap/cds';
import AlpacaService from './lib/alpaca-service.js';
import OpenAIService from './lib/openai-service.js';
import dotenv from 'dotenv';

dotenv.config();

const alpacaService = AlpacaService.getInstance();
const openAIService = OpenAIService.getInstance();

export default () => {

  // Subscribe to all News after connecting
  // alpacaService.newsSocket.onConnect(() => {
  //   alpacaService.newsSocket.subscribeForNews(["*"]);
  // });

  // Handle News
  // alpacaService.newsSocket.onNews((news) => {
  //   console.log(news);

  //   // Generate new process to handle news
  //   cds.spawn({}, async () => {
  //     // Handle news here
  //   });
  // });

  // Example news
  const symbol = "TSLA";

  cds.spawn({}, async () => {

    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(currentDate.getFullYear() - 1);

    const oneMonthAgo = new Date()
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    //Get Clock
    const clock = await alpacaService.api.getClock();

    //Check if market is open. If not, do nothing
    if(!clock.is_open){
      console.error(`Symbol ${symbol} is not tradeable`);
      return;
    }

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

    //Get historic dayly prices of last 1 month
    const latestDailyBars = alpacaService.api.getBarsV2(symbol, {
      start: oneMonthAgo.toISOString(),
      timeframe: alpacaService.api.newTimeframe(1, alpacaService.api.timeframeUnit.DAY),
    });

    //Get Latest News
    const latestNews = await alpacaService.getLatestNews([symbol], 10000)

    //Get Corporate Actions
    const corporateActions = await alpacaService.api.corporateActions([symbol], {
      start: oneYearAgo.toISOString().substring(0,10)
    })

    //OPENAI
    //Get Bracket order estimation from GPT
    const bracketOrder = await openAIService.getBracketOrderEstimateFor({
      symbol: symbol,
      latestBar: latestBar,
      latestDailyBars: latestDailyBars,
      corporateActions: corporateActions,
      news: latestNews
    });

    //Create Bracket order (only LONG supported for now)
    if (bracketOrder.side === "long") {

      await alpacaService.api.createOrder({
        side: "buy",
        symbol: symbol,
        type: "market",
        order_class: "bracket",
        qty: 1,
        nested: true,
        time_in_force: "gtc",
        take_profit: {
          limit_price: bracketOrder.take_profit_price
        },
        stop_loss: {
          stop_price: bracketOrder.stop_loss_price,
          // limit_price: (bracketOrder.stop_loss_price * 0.99).toFixed(2)
        }
      });

      console.log(`Order Created for ${symbol}. Take Profit ${bracketOrder.take_profit_price}. Stop Loss: ${bracketOrder.stop_loss_price}`)
    
    }

  });

  // // Connect to start receiving news
  // alpacaService.newsSocket.connect();

};