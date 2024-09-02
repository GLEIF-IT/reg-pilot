import express, { Request, Response } from "express";
import { ClientRequest } from "http";
import { createProxyMiddleware, RequestHandler } from "http-proxy-middleware";

const app = express();
const PORT = 3434; // Change this to 3434
const API_SERVICE_URL = "http://reg-pilot-api:8000";

// Proxy middleware options
const options = {
  target: API_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: {
    "^/": "/", // remove base path
  },
  onProxyReq: (proxyReq: ClientRequest, req: Request, res: Response) => {
    // Add the FORWARDED header
    const apiHost = new URL(API_SERVICE_URL).host;
    const forwardedHeader = `host: ${apiHost}`;
    proxyReq.setHeader("FORWARDED", forwardedHeader);

    // Optionally, you can modify other headers here
    proxyReq.setHeader("HOST", `${req.headers.host}`);

    console.log(
      `Proxy server received a request for ${req.url} and got headers ${JSON.stringify(req.headers)} and is sending a proxy request to ${API_SERVICE_URL} with headers ${JSON.stringify(proxyReq.getHeaders())}`,
    );
  },
};

// Create the proxy middleware
const proxy: RequestHandler = createProxyMiddleware(options);

// Proxy endpoints
app.use("/", proxy);

// Start the Proxy
app.listen(PORT, () => {
  console.log(`Proxy server is running at http://localhost:${PORT}`);
});
