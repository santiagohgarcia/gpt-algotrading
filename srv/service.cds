using { my.stocks as stocks } from './types/types.cds';

service GPTService {

  /**
   * Returns structured data for the given stock symbol
   */
  function symbolData(symbol: String) returns stocks.SymbolData;

}
