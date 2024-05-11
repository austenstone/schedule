import { getInput, setOutput } from "@actions/core";
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
  const octokit = getOctokit('token');
  const inputDate = dayjs(inputs.date);
  const variablePrefix = 'Schedule'
  const variableName = (workflow, date: dayjs.Dayjs) => `${variablePrefix}_${workflow}_${+date.date}`;
  switch (context.eventName) {
    case 'schedule':
      const {
        data: { variables },
      } = await octokit.rest.actions.listRepoVariables(ownerRepo);
      const schedules = variables.filter((variable) => variable.name.startsWith(variablePrefix)).map((variable) => {
        return {
          date: dayjs(variable.name.split('_')[1]),
          ref: variable.value
        }
      });
      if (!schedules.length) break;
      let timeElapsed = 0;
      do {
        for (const schedule of schedules) {
          if (dayjs().isAfter(schedule.date)) {
            setOutput('ref', schedule.ref);
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
      console.log('Running on workflow_dispatch event');
      if (inputDate.isValid()) {
        try {
          await octokit.rest.actions.createRepoVariable({
            ...ownerRepo,
            name: variableName(context.workflow, inputDate),
            value: context.ref,
          });
        } catch (err) {
          console.log('Error creating variable', JSON.stringify(err, null, 2));
        }
      }
      break;
    default:
      setOutput('result', 'true');
      break;
  }
};

run();
