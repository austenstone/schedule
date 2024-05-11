import { getInput, info } from "@actions/core";
import { getOctokit } from "@actions/github";

interface Input {
  token: string;
  projectName: string;
  owner: string;
  repo: string;
}

const getInputs = (): Input => {
  const result = {} as Input;
  result.token = getInput("github-token");
  result.projectName = getInput("project-name");
  result.owner = getInput("owner");
  result.repo = getInput("repo");
  if (result.repo.includes("/")) {
    const parts = result.repo.split("/");
    result.repo = parts[1];
  }
  if (!result.token || result.token === "") {
    throw new Error("github-token is required");
  }
  return result;
}

export const run = async (): Promise<void> => {
  const input = getInputs();
  const octokit = getOctokit(input.token);
  const ownerRepo = {
    owner: input.owner,
    repo: input.repo,
  };

  try {
    const { data: projects } = await octokit.rest.projects.listForRepo(ownerRepo);
    const project = projects.find((project) => project.name === input.projectName);
    if (!project) {
      throw new Error(`Project ${input.projectName} not found`);
    }
    info(`Project ID: ${project.id}`);

    const { data: columns } = await octokit.rest.projects.listColumns({
      project_id: project.id,
    });
    const column = columns.find((column) => column.name === "To do");
    if (!column) {
      throw new Error(`Column To do not found`);
    }

    const { data: cards } = await octokit.rest.projects.listCards({
      column_id: column.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      info(JSON.stringify(error, null, 2));
    }
  }
  const { data: projects } = await octokit.rest.projects.listForRepo(ownerRepo);
  const project = projects.find((project) => project.name === input.projectName);
  if (!project) {
    throw new Error(`Project ${input.projectName} not found`);
  }
  info(`Project ID: ${project.id}`);

  const { data: columns } = await octokit.rest.projects.listColumns({
    project_id: project.id,
  });
  const column = columns.find((column) => column. === "To do");
  if (!column) {
    throw new Error(`Column To do not found`);
  }

  const { data: cards } = await octokit.rest.projects.listCards({
    column_id: column.id,
  });
};

run();
