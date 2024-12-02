import Alpaca from '@alpacahq/alpaca-trade-api';

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

  async getTopAssetsWithMoreVolume(top) {
    // Get all active assets from Alpaca API
    const assets = await this.api.getAssets({ status: 'active', asset_class: "us_equity" })

    const tradeableSymbols = assets
      .filter(asset => asset.tradable)
      .map(asset => asset.symbol);

    const snapshots = await this.api.getSnapshots(tradeableSymbols);

    // Filter assets based on criteria
    return snapshots
      .filter(s => !!s.DailyBar?.Volume)
      .sort((a, b) => {
        return Number(b.DailyBar?.Volume) - Number(a.DailyBar?.Volume);
      })
      .slice(0, top)
      .map(snapshot => snapshot.symbol);

  }

}

export default AlpacaService;