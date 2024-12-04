import OpenAI from "openai";
import tiktoken from "tiktoken";

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

    async getPortfolioEstimation(symbolsData) {

        //System Message
        const systemContextText =
            `You are a stock market analyst. Current timestamp is ${new Date().toISOString()}
        You will be provided with a list of stocks and last relevant information like current price, last daily prices, technical indicators and latest 10 news articles about each stock.
        The information for each stock will be divided by XML tags with the name of the stock (E.g. <AAPL>...</AAPL>)
        Your task is to use this information to estimate if each stock price will go up (LONG position) or down (SHORT position) by the end of the current day.
        Additionally, you will assign a percentage of distribution of each stock in a portfolio. Allocate greater percentage to the stocks that you are most certain about the estimated behaviour.
        If you are unsure about a stock behaviour for the day, you can set 0 as portfolio percentage to that stock.
        All percentage values should sum up to 1.00(100%). 
        Give your response in JSON format. All stocks enclosed by XML tags must have a record in the response.`;

        //User text (all symbols data separated by XML tags)
        const userText = symbolsData.map(this.getTextForSymbolData).join(`\n\n`);

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
                            estimations: {
                                description: "An array of stock estimations. Each record represents a stock enclosed by XML tags in the input. Every stock in the input must have a record in this array and the sum of the percentage fields should add up to 100.",
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        symbol: {
                                            description: "Stock symbol",
                                            type: "string"
                                        },
                                        side: {
                                            description: "Side of the position: long or short (lowercase)",
                                            type: "string"
                                        },
                                        percentage: {
                                            description: "Percentage allocation of this symbol in the portfolio. From 0.00 to 1.00",
                                            type: "number"
                                        }
                                    },
                                    additionalProperties: false
                                }
                            }
                        },
                        required: ["estimations"],
                        additionalProperties: false
                    }
                }
            }
        });

        const portfolioEstimation = JSON.parse(completion.choices[0].message.content);

        console.log("Estimate for received as:", portfolioEstimation);

        return portfolioEstimation;

    }

    getTextForSymbolData(symbolData) {

        const symbol = symbolData.symbol;
        const latestBar = symbolData.latestBar;
        const latestDailyBarsWithIndicators = symbolData.latestDailyBarsWithIndicators;
        const news = symbolData.news;

        let finalText = `<${symbol}>\nInformation for ${symbol}:`

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

        finalText += `\n</${symbol}>`

        return finalText;

    }

}

export default OpenAIService;