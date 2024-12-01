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

  _countWords(str) {
    // Trim the string to remove leading/trailing spaces
    // Split by spaces and filter out any empty strings (in case of multiple spaces)
    const words = str.trim().split(/\s+/).filter(word => word.length > 0);
    return words.length;
  }

  async getLatestNews(symbols, tokensLimit) {
    let accumTokens = 0;

    //Get latest 100 news
    const news = await this.api.getNews({
      symbols: symbols,
      totalLimit: 100,
      includeContent: true
    });

    //Filter up to "tokensLimit" words including Headline and Summary, to avoid overloading the GPT API
    return news.filter((article) => {
      //Get amount of words in Headline + Summary (or Content)
      const words = this._countWords(article.Headline) + this._countWords(article.Summary);

      //Adds to accumulated tokens for all news
      accumTokens = accumTokens + words;

      //Only return this news if the accumulated words so far are less than the total limit
      return accumTokens < tokensLimit;
    });

  }

}

export default AlpacaService;