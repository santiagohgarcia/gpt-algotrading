import cds from '@sap/cds';
import AlpacaService from './lib/alpaca-service.js';
// import PolygonService from './lib/alpaca-service.js';

const alpacaService = AlpacaService.getInstance();

export default () => {
  
  // Subscribe to all News after connecting
  alpacaService.newsSocket.onConnect(() => {
    alpacaService.newsSocket.subscribeForNews(["*"]);
  });

  // Handle News
  // alpacaService.newsSocket.onNews((news) => {
  //   console.log(news);

  //   // Generate new process to handle news
  //   cds.spawn({}, async () => {
  //     // Handle news here
  //   });
  // });

  // Example news
  const oExampleNews = {
    T: 'n',
    ID: 42255070,
    Headline: 'Musk Ally Ramaswamy Takes Aim At Biden&#39;s $6.6B Loan To Tesla Rival Rivian',
    Summary: 'Newly appointed government efficiency co-czar Vivek Ramaswamy says he will scrutinize a loan issued by the Biden administration to Tesla rival Rivian.',
    Author: 'Bibhu Pattnaik',
    CreatedAt: new Date(),
    UpdatedAt: new Date(),
    URL: 'https://www.benzinga.com/news/24/11/42255070/musk-ally-ramaswamy-takes-aim-at-bidens-6-6b-loan-to-tesla-rival-rivian',
    Symbols: ['TSLA'],
    Source: 'benzinga',
  };

  cds.spawn({}, async () => {
    // Handle spawning logic here
  });

  // Connect to start receiving news
  alpacaService.newsSocket.connect();
};