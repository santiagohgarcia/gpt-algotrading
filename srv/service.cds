using { my.stocks as stocks } from './types/types.cds';

@(requires: 'authenticated-user')
service GPTService {

  /**
   * Returns structured data for the given stock symbol
   */
  function symbolData(symbol: String) returns stocks.SymbolData;

}
