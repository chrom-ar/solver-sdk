import { z } from "zod";

export const TransactionSchema = z.object({
  chainId: z.number(),
  to: z.string(),
  value: z.number().or(z.string()),
  data: z.string(),
  gasLimit: z.number().or(z.string()).optional(),
  gasPrice: z.number().or(z.string()).optional(),
});

export const PartialTransactionSchema = z.object({
  chainId: z.number(),
  to: z.string(),
  value: z.number().or(z.string()).optional(),
  data: z.string().optional(),
  gasLimit: z.number().or(z.string()).optional(),
  gasPrice: z.number().or(z.string()).optional(),
  callData: z.any(), // Instructions for data
  callValue: z.any(), // Instructions for value
});

// Zod schema for ProposalResponse
export const ProposalResponseSchema = z.object({
  description: z.string(),
  titles: z.array(z.string()),
  calls: z.array(z.string()),
  transactions: z.array(TransactionSchema).optional(),
  partialTransactions: z.array(PartialTransactionSchema).optional(),
}).refine((data) => {
  return (data.transactions && data.transactions.length > 0) ||
    (data.partialTransactions && data.partialTransactions?.length > 0);
}, {
  message: "Either transactions or partialTransactions must be provided",
});

export const BodyMessageSchema = z.object({
  type: z.string(),
  amount: z.string().optional(),
  fromToken: z.string().optional(),
  fromChain: z.string(),
  fromAddress: z.string().optional(),
  toToken: z.string().optional(),
  recipientAddress: z.string().optional(),
  recipientChain: z.string().optional(),
  description: z.string().optional(),
  protocol: z.string().optional(), // Optional for claim and withdraw operations
  protocols: z.array(z.string()).optional(), // Optional to specify multiple protocols for operations
  transactionHash: z.string().optional(), // Optional for claim operations
  signerPubKey: z.string().optional(),
});

export const WakuMessageSchema = z.object({
  timestamp: z.number(),
  replyTo: z.string(),
  body: BodyMessageSchema,
});

export const MessageResponseSchema = z.object({
  proposal: ProposalResponseSchema,
  signer: z.string(),
  signature: z.string(),
});

export type BodyMessage = z.infer<typeof BodyMessageSchema>;
export type ProposalResponse = z.infer<typeof ProposalResponseSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;

export type WakuMessage = z.infer<typeof WakuMessageSchema>;
export type Message = WakuMessage;

// Zod schema for the handler function itself
export const handleMessageSchema = z.function()
  .args(WakuMessageSchema) // Expects a validated BodyMessage object
  .returns(z.promise(z.union([ProposalResponseSchema, z.null()]))); // Returns a promise that resolves to ProposalResponse or null
export type HandleMessage = z.infer<typeof handleMessageSchema>;

export const SolverConfigSchema = z.object({
  PRIVATE_KEY: z.string(),
  WAKU_ENCRYPTION_PRIVATE_KEY: z.string().optional(),
  AVAILABLE_TYPES: z.array(z.string()),
  handleMessage: handleMessageSchema,
});
