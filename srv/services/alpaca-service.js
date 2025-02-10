
// const { v4: uuidv4 } = require('uuid');
import { v4 as uuidv4 } from 'uuid';
import Alpaca from '@alpacahq/alpaca-trade-api';

class AlpacaService {
  constructor(alpaca) {
    // Alpaca instance
    this._alpaca = alpaca;
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new AlpacaService(
        new Alpaca({
          keyId: process.env.ALPACA_KEY,
          secretKey: process.env.ALPACA_SECRET,
          paper: true
        })
      );
    }
    return this.instance;
  }

  get api() {
    return this._alpaca;
  }

  async closePositionAndWait(symbol) {

    return new Promise((res) => {
      //Wait until all orders are closed (have 0 open orders)
      this.api.closePosition(symbol).then(() => {

        const positionsCancelIntervalId = setInterval(async () => {
          const positions = await this.api.getPositions();
          const symbolPositions = positions.filter(position => position.symbol === symbol);
          if (symbolPositions.length === 0) {
            res();
            clearInterval(positionsCancelIntervalId);
          }
        }, 5000)

      });

    });
  }

  async createLimitOrderWithRetry(symbol, qty, side, currentPrice) {

    const clientOrderId = uuidv4();

    //If current price is not indicated, get it from latest trade
    if(!currentPrice) {
      currentPrice = (await this.api.getLatestTrade(symbol)).Price.toFixed(2);
    }

    //Create Order
    this.api.createOrder({
      client_order_id: clientOrderId,
      side: side,
      symbol: symbol,
      type: "limit",
      qty: qty,
      extended_hours: true, //Makes the order executable before 9AM and after 4:30PM. Only works with type=limit 
      time_in_force: "day",
      limit_price: currentPrice
    });

    console.log(`ALPACA: Order Triggered for ${symbol}. Side: ${side}. Qty: ${qty}. Price: ${currentPrice}.`)

    //Wait for retry
    setTimeout(async () => {

      const updatedOrder = await this.api.getOrderByClientId(clientOrderId);

     
      if(updatedOrder.status === "filled"){

        console.log(`ALPACA: Order Filled for ${symbol}. Side: ${side}. Qty: ${qty}. Price: ${currentPrice}.`)

      } else { //If after 30s order is not filled, retry 

          //Cancel old order
          await this.api.cancelOrder(updatedOrder.id); //TODO: improve this by replacing the order instead of cancelling and trying again

          //Retry forcing new price
          this.createLimitOrderWithRetry(symbol, qty, side)
  
      }

    }, 30 * 1000 /*30s*/)

  }

}

export default AlpacaService;