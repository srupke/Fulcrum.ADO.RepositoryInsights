// Mock for azure-devops-extension-api — used by webpack-dev-server in mock mode.
import { mockGitClient } from "./git-client";
import { mockCoreClient } from "./core-client";

export function getClient(clientClass: any): any {
  if (clientClass?.name === "CoreRestClient") return mockCoreClient;
  return mockGitClient;
}
