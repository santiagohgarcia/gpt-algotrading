import OpenAI from "openai";
import { readFile } from 'fs/promises';

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

        const systemContextText = await readFile("srv/lib/text/system-context.md", 'utf8');

        //Gets Symbol Data in Text format to send to AI
        const stringSymbolData = JSON.stringify(symbolData);

        //Just print this for one stock to check if the format is correct. 
        if (symbol === "AAPL") {
            console.log("Requesting estimation using system text:", systemContextText);
            console.log("Requesting bracket estimate to GPT with:", symbolData);
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
                    content: stringSymbolData,
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

}

export default OpenAIService;