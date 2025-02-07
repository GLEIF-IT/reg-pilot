/**
 * Replace the URL based on the environment variable and optional hosts
 */
export function convertDockerHost(
  url: string,
  moreHostsToReplace?: string,
  newHost?: string,
): string {
  if (newHost) {
    return replaceUrlHost(url, newHost, moreHostsToReplace);
  }
  if (process.env.USE_DOCKER_INTERNAL === "true") {
    url = replaceUrlHost(url, "host.docker.internal", moreHostsToReplace);
    return url;
  }
  if (process.env.DOCKER_HOST) {
    url = replaceUrlHost(url, process.env.DOCKER_HOST, moreHostsToReplace);
    return url;
  }
  return url;
}

/**
 * Replace the URL based on the environment variable and optional hosts
 */
export function replaceUrlHost(
  url: string,
  newHost: string = "host.docker.internal",
  moreHostsToReplace: string = "",
): string {
  const defaultHosts = ["127.0.0.1", "localhost"];
  const hostsToReplace = moreHostsToReplace
    ? defaultHosts.concat(moreHostsToReplace.split(","))
    : defaultHosts;

  for (const host of hostsToReplace) {
    if (url.includes(host)) {
      console.log(`Replacing URL host: ${host} -> ${newHost}`);
      return url.replace(host, newHost);
    }
  }

  throw new Error(`Error appling replacement for URL: ${url}`);
}
