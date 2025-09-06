// import cds from '@sap/cds';

import dotenv from 'dotenv';
import NewsHandler from './NewsHandler.js';

dotenv.config();

const newsHandler = new NewsHandler({
    orderDollarSize: Number(process.env.ORDER_DOLLAR_SIZE),
    symbols: process.env.SYMBOLS.split(",")
})

//Start AI Portfolio Manager
newsHandler.start();