namespace my.stocks;

type PriceData {
  dateTime   : DateTime;
  price      : Decimal(9,2);
  volume     : Integer;
}

type TechnicalData {
  rsi        : Decimal(5,2);
  macd       : Decimal(7,4);
  signal     : Decimal(7,4);
  histogram  : Decimal(7,4);
  sma20      : Decimal(9,2);
  sma50      : Decimal(9,2);
  sma200     : Decimal(9,2);
  bollinger  : {
    upper    : Decimal(9,2);
    middle   : Decimal(9,2);
    lower    : Decimal(9,2);
  };
}

type IndicatorData {
  overbought : Boolean;
  oversold   : Boolean;
  trend      : String;
}

type NewsItem {
  headline   : String;
  source     : String;
  time       : DateTime;
  sentiment  : String;
}

type SymbolData {
  symbol     : String;
  priceData  : PriceData;
  technicals : TechnicalData;
  indicators : IndicatorData;
  news       : many NewsItem;
}
