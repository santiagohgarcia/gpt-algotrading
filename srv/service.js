// import cds from '@sap/cds';

import dotenv from 'dotenv';
import AIPortfolioManager from './AIPortfolioManager.js';

dotenv.config();

const portfolioManager = new AIPortfolioManager({
  mode: process.env.MODE,
  defaultPortfolioTotal: Number(process.env.DEFAULT_PORTFOLIO_TOTAL),
  barsTopLimit: Number(process.env.BARS_TOP_LIMIT),
  newsTopLimit: Number(process.env.NEWS_TOP_LIMIT),
  symbols: [
    "AAPL",
    // "TSLA",
    // "GOOG",
    // "GOOGL",
    // "BRK.B",
    // "META",
    // "UNH",
    // "XOM",
    // "LLY",
    // "JPM",
    // "MSFT",
    // "JNJ",
    // "V",
    // "PG",
    // "MA",
    // "AVGO",
    // "HD",
    // "CVX",
    // "MRK",
    // "ABBV",
    // "COST",
    // "PEP",
    // "ADBE",
    // "AMZN",
    // "NVDA"
  ] //TODO: Get list of stocks from somewhere else
})

//Start AI Portfolio Manager
portfolioManager.start();