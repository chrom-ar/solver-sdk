# Solver SDK

A starter SDK for building **Solvers** for the Chroma network.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/chrom-ar/solver-sdk)
[![npm version](https://badge.fury.io/js/@chrom-ar%2Fsolver-sdk.svg)](https://badge.fury.io/js/@chrom-ar%2Fsolver-sdk.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)


## Features

*   **Waku Integration:** Connects to the Waku network to send and receive messages.
*   **Message Handling:** Provides a framework for defining custom logic to handle incoming requests.
*   **Configurable:** Uses environment variables for easy configuration of keys, message types, etc.
*   **Signing:** Includes utilities for signing proposals (requires `SOLVER_PRIVATE_KEY`).
*   **Encryption (Optional):** Supports confidential messaging if `WAKU_ENCRYPTION_PRIVATE_KEY` is provided.
*   **Typed:** Built with TypeScript and uses Zod for runtime validation.

## Prerequisites

*   Node.js (v18 or higher recommended)
*   A package manager like `npm` or `yarn`
*   Environment variables set up (see Configuration)

## Installation

```bash
# Using npm
npm install @chrom-ar/solver-sdk

# Using yarn
yarn add @chrom-ar/solver-sdk
```

## Configuration

This SDK is configured using environment variables. Copy `.env.example` to `.env` file in the root of your project:

**Security Note:** Never commit your `.env` file containing private keys to version control. Add `.env` to your `.gitignore` file.

## Getting Started

1.  **Define your Handler Function:** Create a function that takes a `BodyMessage` object and returns a `Promise` resolving to a `ProposalResponse` object or `null`. This function contains your core solver logic.

    ```typescript
    // src/mySolverLogic.ts
    import { BodyMessage, ProposalResponse } from 'solver-starter'; // Adjust path as needed

    export async function handleYieldRequest(messageBody: BodyMessage): Promise<ProposalResponse | null> {
        console.log("Handling message:", messageBody);

        // --- Implement your logic here ---
        // Example: Validate input, fetch data, calculate results, build transactions...

        if (messageBody.type.toUpperCase() === 'YIELD' /* && other conditions met */) {
            // Construct the response based on your logic
            const proposal: ProposalResponse = {
                description: `Proposal for handling ${messageBody.amount} ${messageBody.fromToken}`,
                titles: ["Short Title TX 1", "Short Title TX 2"],
                calls: ["Description of tx 1", "Description of tx 2"],
                transactions: [/* transaction objects */]
            };
            return proposal;
        }

        // Return null if this handler doesn't apply or can't process the request
        return null;
    }
    ```

2.  **Start the Solver:** Use `SolverSDK.start()` in your main application file.

    ```typescript
    // src/main.ts
    import SolverSDK from 'solver-starter'; // Adjust path as needed
    import { handleYieldRequest } from './mySolverLogic.js';
    import dotenv from 'dotenv';
    import { pino } from 'pino';

    dotenv.config(); // Load .env file

    async function main() {
        const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
        logger.info("Starting solver...");

        try {
            // Pass your handler function and optionally a logger
            const solver = await SolverSDK.start(handleYieldRequest, logger);
            logger.info("Solver started successfully.");

            // Keep the solver running (e.g., wait for exit signal)
            const keepRunning = () => setTimeout(keepRunning, 1000 * 60 * 60); // Keep alive
            keepRunning();

            // Handle graceful shutdown
            process.on('SIGINT', async () => {
                logger.info("Shutting down solver...");
                await solver.stop();
                logger.info("Solver stopped.");
                process.exit(0);
            });

        } catch (error) {
            logger.error("Failed to start solver:", error);
            process.exit(1);
        }
    }

    main();
    ```

## Development

*   **Build:** Compile TypeScript to JavaScript.
    ```bash
    npm run build
    # or
    yarn build
    ```
*   **Test:** Run tests using Vitest.
    ```bash
    npm run test
    # or
    yarn test
    ```
*   **Run CLI:** Execute the command-line interface (if applicable).
    ```bash
    npm run cli -- [args...]
    # or
    yarn cli [args...]
    ```

## Core Concepts

*   **`SolverSDK`:** The main entry point for starting and stopping the solver service.
*   **`WakuTransport`:** Handles the connection and communication over the Waku network, including subscribing to topics and sending messages.
*   **Handler Function (`handleMessageBody`)**: The core piece of logic provided by the user. It receives validated `BodyMessage` objects and determines how to respond.
*   **Schemas (`BodyMessageSchema`, `ProposalResponseSchema`, etc.)**: Zod schemas define the expected structure of messages and configurations, providing runtime validation.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details (assuming a LICENSE file exists or will be added).
