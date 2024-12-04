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

  async closePositionAndWait(symbol){

    return new Promise(async (res) => {
        //Wait until all orders are closed (have 0 open orders)
        await this.closePosition(symbol);

        const positionsCancelIntervalId = setInterval(async () => {
            const positions = await this.api.getPositions();
            const symbolPositions = positions.filter(position => position.symbol === symbol);
            if(symbolPositions.length === 0) {
                res();
                clearInterval(positionsCancelIntervalId);
            }
        },5000)
        
    });
}

}

export default AlpacaService;