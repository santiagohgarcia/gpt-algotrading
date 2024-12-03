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

  get newsSocket() {
    return this._news_socket;
  }

}

export default AlpacaService;