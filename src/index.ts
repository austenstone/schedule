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
  const octokit = getOctokit(inputs.token);
  const inputDate = dayjs(inputs.date);
  const variablePrefix = '_SCHEDULE'
  const workflow = (await octokit.rest.actions.listRepoWorkflows(ownerRepo)).data.workflows.find((workflow) => workflow.name === context.workflow);
  if (!workflow) {
    throw new Error(`Workflow ${context.workflow} not found in ${ownerRepo.owner}/${ownerRepo.repo}`);
  }
  const workflowId = workflow?.id;
  const variableName = (date: dayjs.Dayjs) => `${variablePrefix}_${workflowId}_${date.valueOf()}`;
  switch (context.eventName) {
    case 'push':
    case 'schedule':
      info(`👀 Checking for scheduled workflows...`);
      const {
        data: { variables },
      } = await octokit.rest.actions.listRepoVariables(ownerRepo);
      const schedules = variables.filter((variable) => variable.name.startsWith(variablePrefix)).map((variable) => {
        const parts = variable.name.split('_');
        console.log(parts);
        return {
          variableName: variable.name,
          workflow_id: parts[2],
          date: dayjs(+parts[3]),
          ref: variable.value
        }
      });
      info(`📅 Found ${schedules.length} scheduled workflows:
${schedules.map((schedule) => `${schedule.date.format()}: ${schedule.workflow_id} ${schedule.ref}`).join('\n')}`);
      if (!schedules.length) break;
      let timeElapsed = 0;
      do {
        for (const schedule of schedules) {
          if (dayjs().isAfter(schedule.date)) {
            info(`🚀 Running ${context.workflow} with ref:${schedule.ref} set for ${schedule.date.format()}`);
            setOutput('ref', schedule.ref);
            setOutput('date', +schedule.date);
            setOutput('result', 'true');
            // await octokit.rest.actions.createWorkflowDispatch({
            //   ...ownerRepo,
            //   workflow_id: schedule.workflow_id,
            //   ref: schedule.ref,
            // });
            try {
              await octokit.rest.actions.deleteRepoVariable({
                ...ownerRepo,
                name: schedule.variableName,
              });
            } catch (error) {
              info(`❌ Failed to delete variable ${schedule.variableName}`);
              console.error(JSON.stringify(error, null, 2));
            }
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
            name: variableName(inputDate),
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
