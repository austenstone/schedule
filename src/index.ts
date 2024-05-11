import { getInput, info } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { parseDate } from 'chrono-node'

interface Input {
  owner: string;
  repo: string;
  date: string;
  token: string;
  waitMs: number;
  workflow: string;
  ref: string;
  timezone: string;
}

const getInputs = (): Input => {
  const result = {} as Input;
  result.owner = getInput("owner");
  result.repo = getInput("repo");
  if (result.repo.includes('/')) {
    result.repo = result.repo.split('/')[1];
  }
  result.date = getInput("date");
  result.token = getInput("github-token");
  result.waitMs = parseInt(getInput("wait-ms"));
  result.workflow = getInput("workflow");
  result.ref = getInput("ref");
  result.timezone = getInput("timezone");

  return result;
}

export const run = async (): Promise<void> => {
  const inputs = getInputs();
  const ownerRepo = {
    owner: inputs.owner,
    repo: inputs.repo,
  };
  const octokit = getOctokit(inputs.token);
  const inputDate = parseDate(inputs.date, {
    timezone: inputs.timezone || 'UTC'
  });
  const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'full',
    timeZone: inputs.timezone || 'UTC'
  });
  const variablePrefix = '_SCHEDULE'
  const workflow = (await octokit.rest.actions.listRepoWorkflows(ownerRepo)).data.workflows
    .find((workflow) => workflow.path.endsWith(inputs.workflow) || workflow.name === inputs.workflow || workflow.id === +inputs.workflow);
  if (!workflow) {
    throw new Error(`Workflow ${inputs.workflow} not found in ${ownerRepo.owner}/${ownerRepo.repo}`);
  }
  const workflowId = workflow?.id;
  const variableName = (date: Date) => `${variablePrefix}_${workflowId}_${date.valueOf()}`;

  switch (context.eventName) {
    case 'push':
    case 'schedule':
      info(`👀 Checking for scheduled workflows... It's currently ${dateTimeFormatter.format(new Date(Date.now()))}`);
      const {
        data: { variables },
      } = await octokit.rest.actions.listRepoVariables(ownerRepo);
      const schedules = variables.filter((variable) => variable.name.startsWith(variablePrefix)).map((variable) => {
        const parts = variable.name.split('_');
        return {
          variableName: variable.name,
          workflow_id: parts[2],
          date: new Date(+parts[3]),
          ref: variable.value
        }
      });
      info(`📅 Found ${schedules.length} scheduled workflows:\n${schedules.map((schedule) =>
        `${dateTimeFormatter.format(schedule.date)} - ${schedule.workflow_id} ${schedule.ref}`
      ).join('\n')}`);
      if (!schedules.length) break;
      let timeElapsed = 0;
      do {
        for (const [index, schedule] of schedules.entries()) {
          info(`if ${Date.now().valueOf()} < ${schedule.date.valueOf()}`);
          if (Date.now().valueOf() < schedule.date.valueOf()) continue;
          info(`🚀 Running ${schedule.workflow_id} with ref:${schedule.ref} set for ${dateTimeFormatter.format(schedule.date)}`);
          await octokit.rest.actions.createWorkflowDispatch({
            ...ownerRepo,
            workflow_id: schedule.workflow_id,
            ref: schedule.ref,
          });
          await octokit.rest.actions.deleteRepoVariable({
            ...ownerRepo,
            name: schedule.variableName,
          });
          schedules.splice(index, 1);
        }
        if (inputs.waitMs > 0) {
          await (async () => await new Promise((resolve) => setTimeout(resolve, 1000)))();
        }
        timeElapsed += 1000;
      } while (inputs.waitMs > timeElapsed && schedules.length);
      break;
    case 'workflow_dispatch':
      if (inputDate) {
        info(`🔍 You entered '${inputs.date}' which I assume is '${dateTimeFormatter.format(inputDate)}' your time (${inputs.timezone})`);
        info(`📅 Scheduling ${workflow.name} with ref:${inputs.ref} for ${dateTimeFormatter.format(inputDate)}`);
        await octokit.rest.actions.createRepoVariable({
          ...ownerRepo,
          name: variableName(inputDate),
          value: inputs.ref,
        });
        info(`✅ Scheduled!`);
      }
      break;
    case 'push':
    default:
      info(`⏩ Nothing to see here...`)
      break;
  }
};

run();
