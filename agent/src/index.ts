import { InvestmentAgent } from "./pipeline/index.js";

async function main() {
  const agent = new InvestmentAgent();
  await agent.run();
}

main().catch(console.error);
