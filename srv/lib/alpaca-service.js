import Alpaca from '@alpacahq/alpaca-trade-api';
import dotenv from 'dotenv';

dotenv.config();

class AlpacaService {
  constructor(alpaca) {
    // Alpaca instance
    this._alpaca = alpaca;

    // News Socket logs.
    // Consumer needs to only connect and subscribe
    this._news_socket = alpaca.news_stream;

    this._news_socket.onConnect(() => {
      console.log("News Socket Connected");
    });

    this._news_socket.onError((err) => {
      console.log("News Socket Error:", err);
    });

    this._news_socket.onDisconnect(() => {
      console.log("News Socket Disconnected");
    });

    this._news_socket.on('message', async (msg) => {
      console.log("Message:", msg);
    });
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