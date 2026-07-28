import { Provider } from '@nestjs/common';
import { MongoClient, Collection } from 'mongodb';

export const RESULTS_COLLECTION = 'RESULTS_COLLECTION';

export const mongoProvider: Provider = {
  provide: RESULTS_COLLECTION,
  useFactory: async (): Promise<Collection> => {
    const client = new MongoClient(process.env.MONGO_URL!);
    await client.connect();
    return client.db('research').collection('results');
  },
};