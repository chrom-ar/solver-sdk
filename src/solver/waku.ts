import WakuClient, { Logger } from "@chrom-ar/waku-client";
import { signPayload, signProposal } from "./sign.js";
import { pino } from "pino";
import { z } from "zod";
import {
  handleMessageSchema,
  SolverConfigSchema,
  ProposalResponseSchema,
  type ProposalResponse,
  type MessageResponse,
  type WakuMessage,
} from "./types.js";

export class WakuTransport {
  private initialized = false;
  private waku: WakuClient | undefined;
  private config: z.infer<typeof SolverConfigSchema>;
  private logger: pino.Logger;
  private encryptionEnabled: boolean = false;

  constructor(handleMessage: typeof handleMessageSchema, logger?: pino.Logger) {
    this.config = SolverConfigSchema.parse({
      PRIVATE_KEY: process.env.SOLVER_PRIVATE_KEY,
      WAKU_ENCRYPTION_PRIVATE_KEY: process.env.WAKU_ENCRYPTION_PRIVATE_KEY,
      AVAILABLE_TYPES: process.env.AVAILABLE_TYPES?.split(",")?.map((type) => type.trim().toUpperCase()) || [],
      handleMessage: handleMessage,
    });

    // Validate necessary config immediately
    if (!this.config.PRIVATE_KEY) {
      throw new Error("PRIVATE_KEY must be provided in the configuration.");
    }
    // Optional: Validate key matching if encryption key is present
    if (this.config.WAKU_ENCRYPTION_PRIVATE_KEY && this.config.WAKU_ENCRYPTION_PRIVATE_KEY !== this.config.PRIVATE_KEY) {
      throw new Error("PRIVATE_KEY and WAKU_ENCRYPTION_PRIVATE_KEY MUST be the same if both are provided.");
    }

    this.logger = logger || pino({ level: process.env.LOG_LEVEL || "info" });
    this.encryptionEnabled = !!this.config.WAKU_ENCRYPTION_PRIVATE_KEY;
  }

  public static async start(handleMessage: typeof handleMessageSchema, logger?: pino.Logger): Promise<WakuTransport> {
    const wakuTransport = new WakuTransport(handleMessage, logger);
    await wakuTransport.initialize();

    return wakuTransport;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Pass the settings provider's getSetting method to WClient.start
      this.waku = await WakuClient.start();
      this.waku.setLogger(this.logger as unknown as Logger); // Use our logger

      this.logger.info("[WakuTransport] Waku client started.");

      this.subscribeToPublicMessages();
      this.subscribeToHandshakeMessages();
      this.subscribeToConfidentialMessages();

      this.initialized = true;

      this.logger.debug("[WakuTransport] Initialization complete.");
    } catch (error) {
      this.logger.error(error, "[WakuTransport] Initialization failed.");
      throw error; // Re-throw error to indicate failure
    }
  }

  async stop(): Promise<void> {
    await this.waku!.stop();

    this.logger.info("[WakuTransport] Waku client stopped (assuming stop method exists).");

    this.initialized = false;
  }

  private validateMessageType(event: { body: { type: string } }) {
    if (this.config.AVAILABLE_TYPES.length === 0) {
      return true;
    }

    return this.config.AVAILABLE_TYPES.includes(event.body.type.toUpperCase());
  }

  private async buildResponse(event: WakuMessage): Promise<MessageResponse | null> {
    try {
      const proposal: ProposalResponse | null = await this.config.handleMessage(event);

      if (proposal) {
        ProposalResponseSchema.parse(proposal); // Ensure proposal matches the schema

        return (await signProposal(proposal, this.config) as MessageResponse);
      }

      return null;
    } catch (error) {
      this.logger.error({ error, body: event.body }, "[WakuTransport] Error validating message body or building response");
      if (error instanceof z.ZodError) {
        this.logger.warn({ errors: error.errors }, "[WakuTransport] Invalid message body received");
      } else {
        console.error("Error building response:", error);
      }
      return null;
    }
  }

  private subscribeToPublicMessages() {
    // Subscribe to the default topic for public requests
    this.waku!.subscribe("", async (event: WakuMessage) => {
      this.logger.debug("[WakuTransport] Received public message:", event);

      if (!this.validateMessageType(event)) {
        this.logger.warn(`[WakuTransport] Received unknown/missing type (${event.body.type}) for ${event.replyTo}`);
        return;
      }

      const response = await this.buildResponse(event);

      if (!response) {
        this.logger.debug(`[WakuTransport] No response generated for public request ${event.replyTo || "unknown"}`);
        return;
      }

      this.logger.debug(`[WakuTransport] Sending public response to ${event.replyTo}`);

      await this.waku!.sendMessage(response, event.replyTo, event.replyTo);
    });
  }

  // Handshake messages are only used for encrypted communication
  private subscribeToHandshakeMessages() {
    if (!this.encryptionEnabled) {
      this.logger.warn("[WakuTransport] Encryption is disabled, skipping handshake messages");
      return;
    }

    // Subscribe to the 'handshake' topic for confidential messages initiation
    this.waku!.subscribe("handshake", async (event: { replyTo: string, body: { type: string } }) => {
      this.logger.debug("[WakuTransport] Received handshake message:", event);
      const { body: { type }, replyTo } = event;

      if (!this.validateMessageType(event)) {
        this.logger.warn(`[WakuTransport] Received unknown/missing type (${type}) for ${replyTo}`);
        return;
      }

      try {
        const { signer, signature } = await signPayload({}, this.config);
        // Ensure publicKey is available before proceeding
        if (!this.waku!.publicKey) {
          this.logger.error("[WakuTransport] Cannot send handshake ACK: Waku public key is not available.");
          return;
        }
        const body = { signer, signature, signerPubKey: this.waku!.publicKey };

        this.logger.debug(`[WakuTransport] Sending handshake ACK to ${event.replyTo}`);

        // Pass the non-null publicKey
        await this.waku!.sendMessage(body, event.replyTo, this.waku!.publicKey);
      } catch (error) {
        this.logger.error(error, `[WakuTransport] Error signing handshake ACK for ${event.replyTo}`);
      }
    });
  }

  private subscribeToConfidentialMessages() {
    if (!this.encryptionEnabled) {
      this.logger.warn("[WakuTransport] Encryption is disabled, skipping confidential messages");
      return;
    }

    // Subscribe to own public key topic for encrypted confidential messages
    this.waku!.subscribe(this.waku!.publicKey!, async (event: WakuMessage) => {
      this.logger.debug("[WakuTransport] Received confidential message:", event);

      if (!event.body.signerPubKey) {
        this.logger.error(`[WakuTransport] Cannot send encrypted response: Missing sender public key (signerPubKey) in confidential request from ${event.replyTo}`);
        return;
      }

      if (!this.validateMessageType(event)) {
        this.logger.warn(`[WakuTransport] Received unknown/missing type (${event.body.type}) for ${event.replyTo}`);
        return;
      }

      const response = await this.buildResponse(event);

      if (!response) {
        this.logger.debug(`[WakuTransport] No response generated for confidential request ${event.replyTo}`);
        return;
      }

      this.logger.debug(`[WakuTransport] Sending confidential response to ${event.replyTo}`);

      // Ensure publicKey is non-null for sending encrypted message
      if (!this.waku!.publicKey) {
        this.logger.error("[WakuTransport] Cannot send confidential response: Waku public key is not available.");
        return;
      }

      await this.waku!.sendMessage(response, event.replyTo, this.waku!.publicKey, event.body.signerPubKey);
    }, { encrypted: true, expirationSeconds: 60 * 60 * 24 }); // Example: 24 hours expiration

    this.logger.debug(`[WakuTransport] Subscribed to confidential topic: ${this.waku!.publicKey}`);
  }
}
