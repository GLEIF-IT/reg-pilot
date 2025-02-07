import { convertDockerHost, replaceUrlHost } from "../../src/utils/test-host";

describe("replaceUrlHost", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("should replace 127.0.0.1 with host.docker.internal when USE_DOCKER_INTERNAL is true", () => {
    const url = "http://127.0.0.1:3000";
    const newUrl = replaceUrlHost(url);
    expect(newUrl).toBe("http://host.docker.internal:3000");
  });

  test("should replace localhost with host.docker.internal when USE_DOCKER_INTERNAL is true", () => {
    const url = "http://localhost:3000";
    const newUrl = replaceUrlHost(url);
    expect(newUrl).toBe("http://host.docker.internal:3000");
  });

  test("should replace additional hosts when provided", () => {
    const url = "http://example.com:3000";
    const newUrl = replaceUrlHost(url, "host.docker.internal", "example.com");
    expect(newUrl).toBe("http://host.docker.internal:3000");
  });

  test("should throw an error when no replacement is applied", () => {
    const url = "http://example.com:3000";
    expect(() => replaceUrlHost(url)).toThrowError(
      `Error appling replacement for URL: ${url}`,
    );
  });

  test("should replace URL when USE_DOCKER_INTERNAL is true and url keria", () => {
    const url =
      "http://keria:3902/oobi/EHjzNdad7GNyCagdabp1fQd1ebw1s72Jgf9WuoECA9MC/agent/EDDyFNUPIZcS3sE6sFWtNnvaDUtCGyncHuUpyCtRPeEn";
    const newUrl = replaceUrlHost(url, "host.docker.internal", "keria");
    expect(newUrl).toBe(
      "http://host.docker.internal:3902/oobi/EHjzNdad7GNyCagdabp1fQd1ebw1s72Jgf9WuoECA9MC/agent/EDDyFNUPIZcS3sE6sFWtNnvaDUtCGyncHuUpyCtRPeEn",
    );
  });
});

describe("convertDockerHost", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("should not replace URL when USE_DOCKER_INTERNAL is false", () => {
    process.env.USE_DOCKER_INTERNAL = "false";
    const url = "http://127.0.0.1:3000";
    const newUrl = convertDockerHost(url);
    expect(newUrl).toBe(url);
  });

  test("should replace URL when USE_DOCKER_INTERNAL is true", () => {
    process.env.USE_DOCKER_INTERNAL = "true";
    const url = "http://127.0.0.1:3000";
    const newUrl = convertDockerHost(url);
    expect(newUrl).toBe("http://host.docker.internal:3000");
  });
});
