// import cds from '@sap/cds';

import dotenv from 'dotenv';
import NewsHandler from './NewsHandler.js';

dotenv.config();

const newsHandler = new NewsHandler({
})

//Start AI Portfolio Manager
newsHandler.start();