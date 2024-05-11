import { getInput, info, setOutput } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import dayjs from 'dayjs'

interface Input {
  date: string;
  token: string;
  waitMs: number;
}

const getInputs = (): Input => {
  const result = {} as Input;
  result.date = getInput("date");
  result.token = getInput("github-token");
  result.waitMs = parseInt(getInput("wait-ms"));
  return result;
}

export const run = async (): Promise<void> => {
  const inputs = getInputs();
  const ownerRepo = {
    owner: context.repo.owner,
    repo: context.repo.repo,
  };
  const GITHUB_HEADERS = {
    'Authorization': `token ${inputs.token}`,
    'Content-Type': 'application/json',
  };
  const octokit = getOctokit('token');
  const inputDate = dayjs(inputs.date);
  const variablePrefix = '_schedule'
  const variableName = (workflow, date: dayjs.Dayjs) => `${variablePrefix}_${workflow}_${+date}`;
  switch (context.eventName) {
    case 'push':
    case 'schedule':
      info(`👀 Checking for scheduled workflows...`);
      const {
        variables
      } = await (await fetch(`https://api.github.com/repos/${ownerRepo.owner}/${ownerRepo.repo}/actions/variables`, {
        headers: {
          'Authorization': `token ${inputs.token}`,
        },
      })).json();
      // const {
      //   data: { variables },
      // } = await octokit.rest.actions.listRepoVariables(ownerRepo);
      const schedules = variables.filter((variable) => variable.name.startsWith(variablePrefix)).map((variable) => {
        return {
          date: dayjs(variable.name.split('_')[2]),
          ref: variable.value
        }
      });
      info(`📅 Found ${schedules.length} scheduled workflows`)
      if (!schedules.length) break;
      let timeElapsed = 0;
      do {
        for (const schedule of schedules) {
          if (dayjs().isAfter(schedule.date)) {
            info(`🚀 Running ${context.workflow} with ref:${schedule.ref} set for ${schedule.date.format()}`);
            setOutput('ref', schedule.ref);
            setOutput('date', +schedule.date);
            setOutput('result', 'true');
            await octokit.rest.actions.deleteRepoVariable({
              ...ownerRepo,
              name: variableName(context.workflow, schedule.date),
            });
          }
        }
        if (inputs.waitMs > 0) {
          await (async () => await new Promise((resolve) => setTimeout(resolve, 1000)))();
        }
        timeElapsed += 1000;
      } while (inputs.waitMs > timeElapsed)
      break;
    case 'workflow_dispatch':
      if (inputDate.isValid()) {
        info(`📅 Scheduling ${context.workflow} with ref:${context.ref} for ${inputDate.format()}`);
        fetch(`https://api.github.com/repos/${ownerRepo.owner}/${ownerRepo.repo}/actions/variables`, {
          method: 'POST',
          headers: GITHUB_HEADERS,
          body: JSON.stringify({
            name: variableName(context.workflow, inputDate),
            value: context.ref,
          }),
        });
        info(`✅ Scheduled!`);
        // // This isn't currently working for some odd reason
        // // https://github.com/octokit/rest.js/issues/431
        // await octokit.rest.actions.createRepoVariable({
        //   ...ownerRepo,
        //   name: variableName(context.workflow, inputDate),
        //   value: context.ref,
        // });
      }
      break;
    default:
      setOutput('result', 'true');
      break;
  }
};

run();
