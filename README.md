# gpt-algotrading

```markdown
# Get Started

## Installation

1. Run the following command to install dependencies:

   ```bash
   npm install
   ```

## Environment Variables

2. Add the following environment variables to a `.env` file in the root of your project:

   ```env
   ALPACA_KEY=<Alpaca Key>
   ALPACA_SECRET=<Alpaca Secret Key>
   OPENAI_API_KEY=<OpenAI API Key>
   OPENAI_MODEL=<OpenAI model to use, e.g., gpt-4o, gpt-4o-mini>
   MODE=<development or production>
   NEWS_TOP_LIMIT=<max number of news articles to include in the analysis, e.g., 40>
   BARS_TOP_LIMIT=<max number of daily price bars to include in the analysis, e.g., 60>
   DEFAULT_PORTFOLIO_TOTAL=<initial portfolio amount to distribute, e.g., 50000>
   ```

   ### Notes:
   - Setting `MODE=development` will run the portfolio redistribution immediately.
   - Setting `MODE=production` will schedule the portfolio redistribution to the next market open + 2 minutes.

## Running the Application

3. Start the application by running:

   ```bash
   npm start
   ```
```