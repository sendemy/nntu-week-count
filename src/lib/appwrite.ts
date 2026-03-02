import { Account, Client, TablesDB } from 'appwrite';

const client: Client = new Client();

client.setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT).setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

export const account: Account = new Account(client);
export const tablesDB: TablesDB = new TablesDB(client);
