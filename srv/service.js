//import cds from '@sap/cds';

import dotenv from 'dotenv';
import NewsHandler from './NewsHandler.js';

dotenv.config();

const newsHandler = new NewsHandler({
    orderDollarSize: Number(process.env.ORDER_DOLLAR_SIZE),
    symbols: process.env.SYMBOLS.split(",")
})

//Start AI Portfolio Manager
newsHandler.start();

export default function () {

  //
  // Get Symbol Data
  //
  this.on('symbolData', async (req) => {

    return await newsHandler.getAllDataForSymbol(req.data.symbol);
  });

}
