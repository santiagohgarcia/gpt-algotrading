import { RSI, SMA } from 'technicalindicators';

class IndicatorsService {

    static getInstance() {
        if (!this.instance) {
            this.instance = new IndicatorsService();
        }
        return this.instance;
    }

    async addIndicatorsToBars(bars) {

       const sma = new SMA({period : 14, values : []});
       const rsi = new RSI({period: 14, values: []});

       return bars.reverse().map(bar => {
            bar.indicators = {
                SMA: sma.nextValue(bar.ClosePrice)?.toFixed(2),
                RSI: rsi.nextValue(bar.ClosePrice)?.toFixed(2)
            };
            return bar;
        }).reverse();

    }

}

export default IndicatorsService;