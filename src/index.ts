import { WakuTransport } from "./solver/waku.js";
import { HandleMessage } from "./solver/types.js";
import dotenv from "dotenv";
import { Logger } from "@chrom-ar/utils";

export * from "./solver/types.js";

dotenv.config(); // Load .env file

export default class SolverSDK {
  private wakuService: WakuTransport;

  constructor(wakuService: WakuTransport) {
    this.wakuService = wakuService;
  }

  public static async start(handleFn: HandleMessage, logger?: Logger) {
    const wakuService = await WakuTransport.start(handleFn, logger);

    return new SolverSDK(wakuService);
  }

  async stop() {
    if (this.wakuService) {
      await this.wakuService.stop();
    }
  }
}
