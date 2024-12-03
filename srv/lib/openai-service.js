import OpenAI from "openai";

class OpenAIService {
    constructor() {
        // OpenAi instance
        this._openai = new OpenAI();
    }

    static getInstance() {
        if (!this.instance) {
            this.instance = new OpenAIService();
        }
        return this.instance;
    }

    get api() {
        return this._openai;
    }

    async getDailyEstimationFor(params) {

        const symbol = params.symbol;
        const latestBar = params.latestBar;
        const latestDailyBars = params.latestDailyBars;
        const news = params.news;

        const systemContextText =
            `You are a stock market analyst. Current timestamp is ${new Date().toISOString()}
        You will be provided with a stock current price, last year bars, including high, low, open, close prices, technical indicators like RSI and SMA and latest 50 news articles about that stock.
        Your task is to use this information to estimate if the price will go up (long position) or down (short position) by the end of the day.`;

        let finalText =
            `Information about ${symbol}:`

        //Current Price Section
        if (latestBar.ClosePrice) {
            finalText += `\n\nCurrent Price at ${new Date().toISOString()}: ${latestBar.ClosePrice}`;
        }

        //Latest Daily Bars section
        if (latestDailyBars) {
            finalText += `\n\nLast Year Daily Bars in CSV format:`;
            finalText += `\nDate,ClosePrice,HighPrice,LowPrice,OpenPrice,TradeCount,Volume,VWAP,SMA(14,Close),RSI(14,Close)`;
            for await (const dailyBar of latestDailyBars) {
                const dailyBarTime = new Date(dailyBar.Timestamp).toISOString().substring(0, 10);
                finalText += `\n${dailyBarTime},${dailyBar.ClosePrice},${dailyBar.HighPrice},${dailyBar.LowPrice},${dailyBar.OpenPrice},${dailyBar.TradeCount},${dailyBar.Volume},${dailyBar.VWAP},${dailyBar.indicators.SMA},${dailyBar.indicators.RSI}`;
            }
        }

        //News Section
        if (news) {
            news.forEach((article) => {
                const articleCreatedAt = new Date(article.CreatedAt);

                finalText += `\n\nNews Article received on: ${articleCreatedAt.toISOString()}\n${article.Headline}`;

                //Check that summary has valid content, some news only have empty spaces...
                if (!(!article.Summary || article.Summary.trim().length === 0)) {
                    finalText += `\n${article.Summary}`;
                }

            });
        }

        //Just print this for one stock to check if the format is correct. 
        if (symbol === "AAPL") { 
            console.log("Requesting estimation using system text:", systemContextText);
            console.log("Requesting bracket estimate to GPT with:", finalText);
        }

        const completion = await this.api.chat.completions.create({
            model: process.env.OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content: systemContextText
                },
                {
                    role: "user",
                    content: finalText,
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "estimation_schema",
                    schema: {
                        type: "object",
                        properties: {
                            symbol: {
                                description: "Current stock symbol being analyzed",
                                type: "string"
                            },
                            side: {
                                description: "Side of the position: long or short",
                                type: "string"
                            },
                            reasoning: {
                                description: "Reason for the prediction in not more than 1000 characters",
                                type: "string"
                            }
                        },
                        additionalProperties: false
                    }
                }
            }

        });

        //Get response and parse it to JSON object
        let estimation = JSON.parse(completion.choices[0].message.content);

        console.log("Estimate for received as:", estimation);

        return estimation;

    }

}

export default OpenAIService;