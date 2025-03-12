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
                description: "Side of the position (long or short)",
                type: "string"
            },
            reasoning: {
                description: "Reason for the prediction in not more than 500 characters",
                type: "string"
            },
            estimationForDate: {
                description: "Date this estimation is done for, in YYYY-MM-DD format",
                type: "string"
            },
            certainty: {
                description: "Certainty for this prediction expressed as a number from 0 to 100",
                type: "number"
            }
        },
        additionalProperties: false
    }
};

class OpenAIService {
    constructor(config) {
        // OpenAi instance
        this._openai = new OpenAI();
        this.config = config;


    }

    static getInstance() {
        if (!this.instance) {

            if (process.env.OPENAI_MODEL.includes("search") && process.env.MODE === "backtesting") {
                throw "Not possible to use web search models with backtesting";
            }

            this.instance = new OpenAIService({
                model: process.env.OPENAI_MODEL,
                mode: process.env.MODE
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

        //Just print this for one stock to check if the format is correct. 
        // if (symbol === "AAPL") {
        //     console.log("Requesting estimation for AAPL using system text:", symbolData);
        // }

        //Logic is different for o1-preview as the "System instructions and model configuration are not available yet."
        if (inputs.model === "o1-preview" || inputs.model === "o1-mini") {
            const sFullMessage = `${systemContextText}\n\n` +
                `Give your responses in the following JSON format schema:\n${JSON.stringify(RESPONSE_SCHEMA)}\n\n` +
                `The stock data is the following (in JSON format):\n\n${stringSymbolData}\n\n`;
            inputs.messages = [
                {
                    role: "user",
                    content: sFullMessage
                }
            ]
        } else { //Other models can have system instructions and response format
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
        }

        //Add web search parameters for search models
        if (inputs.model.includes("search")) {
            inputs.web_search_options = {
                search_context_size: "high"
            }
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

            // console.log("Estimate for received as:", estimation);

            return estimation;

        } catch (error) {
            console.error(`Error when parsing response for ${symbol}:`, jsonResponse);
        }

    }

}

export default OpenAIService;