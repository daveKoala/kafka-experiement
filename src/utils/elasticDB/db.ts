import { Client } from "@elastic/elasticsearch";

const ELASTICSEARCH_ENDPOINT = "http://localhost:9200";
// const ELASTICSEARCH_API_KEY = "";

export const esClient = new Client({
  node: ELASTICSEARCH_ENDPOINT,
  //   auth: { apiKey: ELASTICSEARCH_API_KEY },
});

export const esInfo = async () => {
  try {
    const result = await esClient.info();
    console.log({ result });
  } catch (error) {
    console.error("Elasticsearch connection error:", error);
  }
};
