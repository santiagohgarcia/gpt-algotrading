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

    async getBracketOrderEstimateFor(params) {

        const symbol = params.symbol;
        const latestBar = params.latestBar;
        const latestDailyBars = params.latestDailyBars;
        const news = params.news;

        const systemContextText = "You are a stock and financial analyzer dedicated to estimate future prices of assets according to given information";

        let finalText = `Given the following information about ${symbol}:`

        //Current Price Section
        if (latestBar.ClosePrice) {
            finalText += `\n\nCurrent Price at ${new Date().toISOString()}: ${latestBar.ClosePrice}`;
        }

        //Latest Daily Prices section
        if(latestDailyBars){
            finalText += `\n\nLast 30 Day Prices:`;
            for await (const dailyBar of latestDailyBars) {
                const dailyBarTime = new Date(dailyBar.Timestamp).toISOString().substring(0,10);
                finalText += `\n${dailyBarTime}: ${dailyBar.ClosePrice}`;
            }
            
        }

        //News Section
        if (news) {
            news.forEach((article) => {
                const articleCreatedAt = new Date(article.CreatedAt);
                
                finalText += `\n\nNews Article received on: ${articleCreatedAt.toISOString()}\n${article.Headline}`;

                //Check that summary has valid content, some news only have empty spaces...
                if(!(!article.Summary || article.Summary.trim().length === 0)){
                    finalText += `\n${article.Summary}`;
                }

            });
        }

        //Final section for instructions and response format:
        finalText += `\n\nUsing this information estimate the price of this crypto token for a future time frame. Give your response in the following JSON format
            {
                "side": <side of the position: long or short>,
                "time_frame: <minute, day, week, month or year>,
                "take_profit_price": <take profit price> as Number,
                "stop_loss_price: <stop loss price> as Number,
                "reason": <reason for the prediction in no more than 1000 characters> as String,
                "certainty": <score how certain is this analysis from 1 to 100> as Integer
            }`;

        console.log("Requesting bracket estimate to GPT with:", finalText);

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
        });

        //Get response and parse it to JSON object
        let jsonResponse = completion.choices[0].message.content;

        jsonResponse = jsonResponse
            .replaceAll("```json","")
            .replaceAll("```","")
            .replaceAll("\n","")

        const bracket = JSON.parse(jsonResponse);

        console.log("Bracket estimate received as:", bracket);

        return bracket;

    }

}

export default OpenAIService;