import { privateKeyToAccount } from "viem/accounts";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import tweetnaclUtils from "tweetnacl-util";

/**
 * Takes a valid transaction object and returns a "ready to broadcast" result
 *   that includes the transaction, signature, and the signer (public address).
 */
export const signProposal = async (proposal: unknown, config: { PRIVATE_KEY: string }): Promise<object | null> => {
  if (!proposal) {
    return null;
  }

  try {
    const { signature, signer } = await signPayload(proposal, config);

    return {
      proposal,
      signature,
      signer,
    };
  } catch (e) {
    console.error("Signing", e);
    return null;
  }
};

/**
 * Helper to sign an arbitrary JSON payload using the configured PRIVATE_KEY.
 * This is a simplistic approach that signs a stringified version of `payload`.
 * For real-world usage, consider EIP-712 or structured data hashing.
 */
export const signPayload = async (payload: object, config: { PRIVATE_KEY: string }): Promise<{ signature: string; signer: string }> => {
  const key = config.PRIVATE_KEY;
  const payloadString = JSON.stringify(payload);

  if (typeof key === "string" && key.startsWith("0x")) {
    return signWithEvm(payloadString, key);
  } else {
    return signWithSolana(payloadString, key);
  }
};

const signWithEvm = async (payloadString: string, privateKey: string): Promise<{ signature: string; signer: string }> => {
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const signer = account.address;

  // This is already a hex string
  const signature = await account.signMessage({
    message: payloadString,
  });

  return { signature, signer };
};

const signWithSolana = async (payloadString: string, privateKey: string): Promise<{ signature: string; signer: string }> => {
  const account = Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(privateKey),
    ),
  );
  const signer = account.publicKey.toBase58();
  const signature = Buffer.from(
    // This returns a Uint8Array signature
    nacl.sign.detached(
      tweetnaclUtils.decodeUTF8(payloadString),
      account.secretKey,
    ),
  ).toString("base64");

  return { signature, signer };
};
