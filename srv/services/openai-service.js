import OpenAI from "openai";
import { readFile } from 'fs/promises';

const RESPONSE_SCHEMA = {
    name: "estimation_schema",
    schema: {
        type: "object",
        properties: {
            symbol: {
                description: "Current stock symbol being analyzed",
                type: "string"
            },
            side: {
                description: "Side of the position ('long', 'short' or 'none' in case of no trade)",
                type: "string"
            },
            reasoning: {
                description: "Reasoning for this estimation including web search sources used",
                type: "string"
            },
            entryPrice: {
                description: "Price at wich we will enter the position",
                type: "number"
            },
            takeProfitPrice: {
                description: "Take profit price of the bracket order",
                type: "number"
            },
            stopLossPrice: {
                description: "Stop loss price of the bracket order",
                type: "number"
            }
        },
        additionalProperties: false
    }
};

class OpenAIService {
    constructor(config) {
        // OpenAi instance
        this._openai = new OpenAI({
            apiKey: config.openAIAPIKey,
            baseURL: config.openAIAPIBaseURL
        });
        this.config = config;
    }

    static getInstance() {
        if (!this.instance) {

            if (process.env.OPENAI_MODEL.includes("search") && process.env.MODE === "backtesting") {
                throw "Not possible to use web search models with backtesting";
            }

            this.instance = new OpenAIService({
                model: process.env.OPENAI_MODEL,
                openAIAPIKey: process.env.OPENAI_API_KEY,
                openAIAPIBaseURL: process.env.OPENAI_API_BASE_URL
            });
        }
        return this.instance;
    }

    get api() {
        return this._openai;
    }

    async getEstimationForSymbol(symbolData) {

        let inputs = {
            model: this.config.model,
            messages: []
        };

        const symbol = symbolData.symbol;

        const systemContextText = await readFile("srv/services/text/system-context.md", 'utf8');

        //Gets Symbol Data in Text format to send to AI
        const stringSymbolData = JSON.stringify(symbolData);

        //Logic is different for o1-preview as the "System instructions and model configuration are not available yet."
        inputs.messages = [
            {
                role: "system",
                content: systemContextText
            },
            {
                role: "user",
                content: stringSymbolData,
            },
        ];

        inputs.response_format = {
            type: "json_schema",
            json_schema: RESPONSE_SCHEMA
        }
        
        //Call Completion API
        const completion = await this.api.chat.completions.create(inputs);

        //Get response and parse it to JSON object
        let jsonResponse = completion.choices[0].message.content;
        jsonResponse = jsonResponse
            .replaceAll("```json", "")
            .replaceAll("```", "")
            .replaceAll("\n", "")

        //Get response and parse it to JSON object
        try {

            let estimation = JSON.parse(jsonResponse);

            estimation.searchResults = completion.search_results;

            return estimation;

        } catch (error) {
            console.error(`Error when parsing response for ${symbol}:`, jsonResponse);
        }

    }

}

export default OpenAIService;