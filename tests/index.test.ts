import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import SolverSDK from "../src/index.js";
import { WakuTransport } from "../src/solver/waku.js";

// Placeholder for the actual handle function from yield.ts
const mockHandleFn = vi.fn();

// Mock the WakuTransport module
vi.mock("../src/solver/waku.js", () => {
  const mockWakuInstance = {
    stop: vi.fn().mockResolvedValue(undefined),
  };
  return {
    WakuTransport: {
      start: vi.fn().mockResolvedValue(mockWakuInstance),
    },
    handleMessageBodySchema: vi.fn(), // Assuming this needs mocking too, adjust if necessary
  };
});

describe("SolverSDK", () => {
  let solverSDKInstance: SolverSDK | null = null;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any created SDK instance
    if (solverSDKInstance) {
      await solverSDKInstance.stop();
      solverSDKInstance = null;
    }
  });

  describe("start", () => {
    it("should start WakuTransport and return a SolverSDK instance", async () => {
      // Arrange
      const handleFn = mockHandleFn; // Use the placeholder
      const mockWakuStart = vi.mocked(WakuTransport.start);

      // Act
      solverSDKInstance = await SolverSDK.start(handleFn);

      // Assert
      expect(solverSDKInstance).toBeInstanceOf(SolverSDK);
      expect(mockWakuStart).toHaveBeenCalledOnce();
      expect(mockWakuStart).toHaveBeenCalledWith(handleFn);

      // Optionally check if the wakuService property is set correctly
      // expect((solverSDKInstance as any).wakuService).toBeDefined();
    });
  });

  // Add tests for the stop method if needed
  describe("stop", () => {
    it("should call stop on the wakuService instance", async () => {
      // Arrange
      const handleFn = mockHandleFn;
      solverSDKInstance = await SolverSDK.start(handleFn);
      const wakuServiceInstance = (solverSDKInstance as SolverSDK).wakuService;
      const mockWakuStop = vi.mocked(wakuServiceInstance.stop);

      // Act
      await solverSDKInstance.stop();

      // Assert
      expect(mockWakuStop).toHaveBeenCalledOnce();
    });
  });
});
