import { getInput, info } from "@actions/core";
import { getOctokit } from "@actions/github";

interface Input {
  token: string;
}

const getInputs = (): Input => {
  const result = {} as Input;
  result.token = getInput("github-token");
  if (!result.token || result.token === "") {
    throw new Error("github-token is required");
  }
  return result;
}

export const run = async (): Promise<void> => {
  const input = getInputs();
  const octokit = getOctokit(input.token);

  const {
    data: { login },
  } = await octokit.rest.users.getAuthenticated();

  info(`Hello, ${login}!`);
};

run();
