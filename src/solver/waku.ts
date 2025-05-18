import { Logger } from "@chrom-ar/utils";
import WakuClient, { WakuMessageEvent } from "@chrom-ar/waku-client";
import { z } from "zod";

import { signPayload, signProposal } from "./sign.js";
import {
  SolverConfigSchema,
  ProposalResponseSchema,
  type ProposalResponse,
  type MessageResponse,
  type Message,
  type HandleMessage,
} from "./types.js";

export class WakuTransport {
  private initialized = false;
  private waku: WakuClient | undefined;
  private config: z.infer<typeof SolverConfigSchema>;
  private logger: Logger | Console;
  private encryptionEnabled: boolean = false;

  constructor(handleMessage: HandleMessage, logger?: Logger) {
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

    this.logger = logger ?? console;
    this.encryptionEnabled = !!this.config.WAKU_ENCRYPTION_PRIVATE_KEY;
  }

  public static async start(handleMessage: HandleMessage, logger?: Logger): Promise<WakuTransport> {
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

      this.logger.info("[WakuTransport] Initialization complete.");
    } catch (error: unknown) {
      this.logger.error("[WakuTransport] Initialization failed.", error);
      throw error; // Re-throw error to indicate failure
    }
  }

  async stop(): Promise<void> {
    await this.waku!.stop();

    this.logger.info("[WakuTransport] Waku client stopped (assuming stop method exists).");

    this.initialized = false;
  }

  private validateMessageType(event: WakuMessageEvent<Record<string, unknown>>) {
    if (this.config.AVAILABLE_TYPES.length === 0) {
      return true;
    }

    return this.config.AVAILABLE_TYPES.includes(event.body.type.toUpperCase());
  }

  private async buildResponse(event: Message): Promise<MessageResponse | null> {
    try {
      const proposal: ProposalResponse | null = await this.config.handleMessage(event);

      if (proposal) {
        ProposalResponseSchema.parse(proposal); // Ensure proposal matches the schema

        return (await signProposal(proposal, this.config) as MessageResponse);
      }

      return null;
    } catch (error) {
      this.logger.error("[WakuTransport] Error validating message body or building response", { error, body: event.body });
      if (error instanceof z.ZodError) {
        this.logger.warn("[WakuTransport] Invalid message body received", { errors: error.errors });
      } else {
        console.error("Error building response:", error);
      }
      return null;
    }
  }

  private subscribeToPublicMessages() {
    // Subscribe to the default topic for public requests
    this.waku!.subscribe("", async (event: WakuMessageEvent<Message["body"]>) => {
      this.logger.info("[WakuTransport] Received public message:", event);

      if (!this.validateMessageType(event)) {
        this.logger.warn(`[WakuTransport] Received unknown/missing type (${event.body.type}) for ${event.replyTo}`);
        return;
      }

      const response = await this.buildResponse(event);

      if (!response) {
        this.logger.info(`[WakuTransport] No response generated for public request ${event.replyTo || "unknown"}`);
        return;
      }

      if (event.replyTo) {
        this.logger.info(`[WakuTransport] Sending public response to ${event.replyTo}`);
        await this.waku!.sendMessage(response, event.replyTo, event.replyTo);
      }
    });
  }

  // Handshake messages are only used for encrypted communication
  private subscribeToHandshakeMessages() {
    if (!this.encryptionEnabled) {
      this.logger.warn("[WakuTransport] Encryption is disabled, skipping handshake messages");
      return;
    }

    // Subscribe to the 'handshake' topic for confidential messages initiation
    this.waku!.subscribe("handshake", async (event: WakuMessageEvent<Record<string, unknown>>) => {
      this.logger.info("[WakuTransport] Received handshake message:", event);
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

        this.logger.info(`[WakuTransport] Sending handshake ACK to ${event.replyTo}`);

        // Pass the non-null publicKey
        await this.waku!.sendMessage(body, event.replyTo, this.waku!.publicKey);
      } catch (error) {
        this.logger.error(`[WakuTransport] Error signing handshake ACK for ${event.replyTo}`, error);
      }
    }, { expirationSeconds: Number.MAX_SAFE_INTEGER });
  }

  private subscribeToConfidentialMessages() {
    if (!this.encryptionEnabled) {
      this.logger.warn("[WakuTransport] Encryption is disabled, skipping confidential messages");
      return;
    }

    // Subscribe to own public key topic for encrypted confidential messages
    this.waku!.subscribe(this.waku!.publicKey!, async (event: WakuMessageEvent<Message["body"]>) => {
      this.logger.info("[WakuTransport] Received confidential message:", event);

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
        this.logger.info(`[WakuTransport] No response generated for confidential request ${event.replyTo}`);
        return;
      }

      this.logger.info(`[WakuTransport] Sending confidential response to ${event.replyTo}`);

      // Ensure publicKey is non-null for sending encrypted message
      if (!this.waku!.publicKey) {
        this.logger.error("[WakuTransport] Cannot send confidential response: Waku public key is not available.");
        return;
      }

      await this.waku!.sendMessage(response, event.replyTo, this.waku!.publicKey, event.body.signerPubKey);
    }, { encrypted: true, expirationSeconds: 60 * 60 * 24 }); // Example: 24 hours expiration

    this.logger.info(`[WakuTransport] Subscribed to confidential topic: ${this.waku!.publicKey}`);
  }
}
