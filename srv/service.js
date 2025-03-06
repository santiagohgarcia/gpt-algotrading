// import cds from '@sap/cds';

import dotenv from 'dotenv';
import AIPortfolioManager from './AIPortfolioManager.js';
import moment from 'moment-timezone';

dotenv.config();

const backtestFromDate = moment.tz(process.env.BACKTEST_FROM_DATE, "America/New_York").toDate();
const backtestToDate = moment.tz(process.env.BACKTEST_TO_DATE, "America/New_York").toDate();

const portfolioManager = new AIPortfolioManager({
  mode: process.env.MODE,
  backtestFromDate: backtestFromDate,
  backtestToDate: backtestToDate,
  defaultPortfolioTotal: Number(process.env.DEFAULT_PORTFOLIO_TOTAL),
  barsTopLimit: Number(process.env.BARS_TOP_LIMIT),
  symbols: [
    "AAPL", "NVDA", "MSFT", "AMZN", "META", "AVGO", "GOOGL", "TSLA", "GOOG", "BRK.B",
    "JPM", "LLY", "V", "UNH", "XOM", "COST", "MA", "WMT", "NFLX", "HD",
    "PG", "JNJ", "ABBV", "BAC", "CRM", "ORCL", "WFC", "CVX", "KO", "CSCO",
    "ACN", "IBM", "PLTR", "PEP", "MCD", "ABT", "DHR", "TXN", "LIN", "NKE" //40
    // "MRK", "TMO", "NEE", "PM", "UPS", "AMGN", "MDT", "INTC", "ADBE", "AMD"
    // "PG"
  ]
})

//Start AI Portfolio Manager
portfolioManager.start();