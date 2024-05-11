import { getInput, info, summary } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import { parseDate } from 'chrono-node'
import { intervalToDuration } from 'date-fns'

interface Input {
  owner: string;
  repo: string;
  date: string;
  token: string;
  waitMs: number;
  waitDelayMs: number;
  workflow: string;
  ref: string;
  timezone: string;
  inputs: string;
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
  result.waitDelayMs = parseInt(getInput("wait-delay-ms"));
  result.workflow = getInput("workflow");
  result.ref = getInput("ref");
  result.timezone = getInput("timezone");
  result.inputs = getInput("inputs");

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
    timeStyle: 'medium',
    timeZone: inputs.timezone || 'UTC',
  });
  const durationString = (start: Date, end: Date) => Object.entries(intervalToDuration({ start, end })).map(([key, value]) => `${value} ${key}`).join(', ');
  const variablePrefix = '_SCHEDULE'
  const workflows = (await octokit.rest.actions.listRepoWorkflows(ownerRepo)).data.workflows;
  const workflow = workflows.find((workflow) => workflow.path.endsWith(inputs.workflow) || workflow.name === inputs.workflow || workflow.id === +inputs.workflow);
  if (!workflow) {
    throw new Error(`Workflow ${inputs.workflow} not found in ${ownerRepo.owner}/${ownerRepo.repo}`);
  }
  const workflowId = workflow?.id;
  const variableName = (date: Date) => `${variablePrefix}_${workflowId}_${date.valueOf()}`;
  const getSchedules = async (octokit: InstanceType<typeof GitHub>, ownerRepo: { owner: string; repo: string; }) => {
    const { data: { variables } } = await octokit.rest.actions.listRepoVariables(ownerRepo);
    const schedules = variables.filter((variable) => variable.name.startsWith(variablePrefix)).map((variable) => {
      const parts = variable.name.split('_');
      return {
        variableName: variable.name,
        workflow_id: parts[2],
        date: new Date(+parts[3]),
        ref: variable.value
      }
    });
    return schedules;
  };

  info(`👀 Checking for scheduled workflows... It's currently ${dateTimeFormatter.format(new Date(Date.now()))}`);
  const schedules = await getSchedules(octokit, ownerRepo);
  info(`📅 Found ${schedules.length} scheduled workflows:\n${schedules.map((schedule) => {
    return `${schedule.workflow_id}@${schedule.ref} will run in ${durationString(new Date(Date.now()), schedule.date)} (${dateTimeFormatter.format(schedule.date)})}`
  }).join('\n')}`);
  switch (context.eventName) {
    case 'push':
    case 'schedule':
      if (!schedules.length) break;
      let _schedules = schedules;
      const startTime = Date.now().valueOf();
      do {
        info(`👀 ... It's currently ${new Date().toLocaleTimeString()} and ${_schedules.length} workflows are scheduled to run.`);
        for (const [index, schedule] of _schedules.entries()) {
          if (Date.now().valueOf() < schedule.date.valueOf()) continue;
          info(`🚀 Running ${schedule.workflow_id}@ref:${schedule.ref} set for ${dateTimeFormatter.format(schedule.date)}`);
          await octokit.rest.actions.createWorkflowDispatch({
            ...ownerRepo,
            workflow_id: schedule.workflow_id,
            ref: schedule.ref,
            inputs: inputs.inputs ? JSON.parse(inputs.inputs) : undefined
          });
          await octokit.rest.actions.deleteRepoVariable({
            ...ownerRepo,
            name: schedule.variableName,
          });
          _schedules.splice(index, 1);
        }
        if (inputs.waitMs > 0) {
          await (async () => await new Promise((resolve) => setTimeout(resolve, inputs.waitDelayMs)))();
        }
        _schedules = await getSchedules(octokit, ownerRepo);
      } while (inputs.waitMs > (Date.now().valueOf() - startTime) && _schedules.length);
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
        info(`✅ Scheduled to run in ${durationString(new Date(Date.now()), inputDate)}!`);
      }
      break;
    case 'push':
    default:
      info(`⏩ Nothing to see here...`)
      break;
  }

  const _summary = summary.addHeading(`📅 Scheduled Workflows`);
  if (schedules.length) {
    _summary.addTable([
      [
        { data: 'Workflow', header: true },
        { data: `Scheduled Date (${inputs.timezone})`, header: true },
        { data: 'Ref', header: true },
        { data: 'Path', header: true }
      ],
      ...schedules.map((schedule) => {
        const _workflow = workflows.find((workflow) => workflow.id === +schedule.workflow_id);
        return [_workflow?.name || schedule.workflow_id, dateTimeFormatter.format(schedule.date), schedule.ref, _workflow?.path || 'unknown'];
      })
    ]);
  } else {
    _summary.addRaw('No scheduled workflows found');
  }
  await _summary.write();
};

run();
