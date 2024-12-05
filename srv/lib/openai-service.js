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

    async getEstimationForSymbol(symbolData) {

        const symbol = symbolData.symbol;

        const systemContextText =
        `You are a stock market analyst. Current timestamp is ${new Date().toISOString()}
        You will be provided with a stock current price, last daily bars, including close prices, technical indicators like RSI and SMA and latest news articles about that stock.
        Your task is to use this information to predict if the price will go up (long position) or down (short position) by the end of the current day.
        Indicate how certain you are about the prediction with a number from 0 to 100. If you are not sure you can set 0.`;

        //Gets Symbol Data in Text format to send to AI
        const userText = this.getTextForSymbolData(symbolData);

        //Just print this for one stock to check if the format is correct. 
        if (symbol === "AAPL") { 
            console.log("Requesting estimation using system text:", systemContextText);
            console.log("Requesting bracket estimate to GPT with:", userText);
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
                    content: userText,
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
                                description: "Side of the position (long or short)",
                                type: "string"
                            },
                            reasoning: {
                                description: "Reason for the prediction in not more than 1000 characters",
                                type: "string"
                            },
                            certanty: {
                                description: "Certainty for this prediction expressed as a number from 0 to 100",
                                type: "number"
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

    getTextForSymbolData(symbolData) {

        const symbol = symbolData.symbol;
        const latestBar = symbolData.latestBar;
        const latestDailyBarsWithIndicators = symbolData.latestDailyBarsWithIndicators;
        const news = symbolData.news;

        let finalText = `Information for ${symbol}:`

        //Current Price Section
        if (latestBar.ClosePrice) {
            finalText += `\n\nCurrent Price at ${new Date().toISOString()}: ${latestBar.ClosePrice}`;
        }

        //Latest Daily Bars section
        if (latestDailyBarsWithIndicators) {
            finalText += `\n\nLast Daily Bars and Indicators in CSV format:`;
            finalText += `\nDate,ClosePrice,TradeCount,Volume,VWAP,SMA(14,Close),RSI(14,Close)`;

            latestDailyBarsWithIndicators.forEach(bar => {
                const dailyBarTime = new Date(bar.Timestamp).toISOString().substring(0, 10);
                finalText += `\n${dailyBarTime},${bar.ClosePrice},${bar.TradeCount},${bar.Volume},${bar.VWAP},${bar.indicators.SMA},${bar.indicators.RSI}`;
            })

        }

        //News Section
        if (news) {
            news.forEach((article) => {
                const articleCreatedAt = new Date(article.CreatedAt);

                finalText += `\n\nNews on ${articleCreatedAt.toISOString()}\n${article.Headline}`;

                //Check that summary has valid content, some news only have empty spaces...
                if (!(!article.Summary || article.Summary.trim().length === 0)) {
                    finalText += `\n${article.Summary}`;
                }

            });
        }

        // finalText += `\n</${symbol}>`

        return finalText;

    }

}

export default OpenAIService;