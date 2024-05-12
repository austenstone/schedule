import { getInput, group, info, summary } from "@actions/core";
import { context, getOctokit } from "@actions/github";
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
  inputs: object;
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
  const workflowInputs = getInput("inputs");
  result.inputs = workflowInputs && workflowInputs.trim().length > 0 ? JSON.parse(workflowInputs) : undefined;

  return result;
}

export const run = async (): Promise<void> => {
  const inputs = getInputs();
  const ownerRepo = {
    owner: inputs.owner,
    repo: inputs.repo,
  };
  const octokit = getOctokit(inputs.token);
  const inputDate = inputs.date?.trim()?.length > 0 ? parseDate(inputs.date, {
    timezone: inputs.timezone || 'UTC'
  }) : undefined;
  const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: inputs.timezone || 'UTC',
  });
  const durationString = (start: Date, end: Date) => {
    const duration = intervalToDuration({ start, end })
    if (Object.values(duration).every((value) => value <= 0)) return 'NOW!';
    return Object.entries(duration).map(([key, value]) => `in ${value} ${key}`).join(', ');
  };
  const variablePrefix = '_SCHEDULE'
  const workflows = (await octokit.rest.actions.listRepoWorkflows(ownerRepo)).data.workflows;
  const workflow = workflows.find((workflow) => workflow.path.endsWith(inputs.workflow) || workflow.name === inputs.workflow || workflow.id === +inputs.workflow);
  if (!workflow) {
    throw new Error(`Workflow ${inputs.workflow} not found in ${ownerRepo.owner}/${ownerRepo.repo}`);
  }
  const workflowId = workflow?.id;
  const variableName = (date: Date) => [variablePrefix, workflowId, date.valueOf()].join('_');
  const variableValue = (ref: string, inputs: object) => `${ref},${inputs ? JSON.stringify(inputs) : ''}`;
  const getSchedules = async () => {
    const { data: { variables } } = await octokit.rest.actions.listRepoVariables(ownerRepo);
    if (!variables) return [];
    const schedules = variables.filter((variable) => variable.name.startsWith(variablePrefix)).map((variable) => {
      const parts = variable.name.split('_');
      const valParts = variable.value.split(/,(.*)/s);
      const workflowInputs = valParts[1] && valParts[1].trim().length > 0 ? JSON.parse(valParts[1]) : undefined;
      if (workflowInputs?.date) delete workflowInputs.date;
      return {
        variableName: variable.name,
        workflow_id: parts[2],
        date: new Date(+parts[3]),
        ref: valParts[0],
        inputs: workflowInputs
      }
    });
    return schedules;
  };
  const scheduleAdd = async () => {
    if (!inputDate) return;
    info(`🔍 You entered '${inputs.date}' which I assume is '${dateTimeFormatter.format(inputDate)}' your time (${inputs.timezone})`);
    info(`📅 Scheduling ${workflow.name} with ref:${inputs.ref} for ${dateTimeFormatter.format(inputDate)}`);
    return octokit.rest.actions.createRepoVariable({
      ...ownerRepo,
      name: variableName(inputDate),
      value: variableValue(inputs.ref, inputs.inputs),
    }).then(() => {
      info(`✅ Scheduled to run ${durationString(new Date(), inputDate)}!`)
    });
  }
  const scheduleRun = async () => {
    let _schedules = await getSchedules();
    info(`⌚ ${dateTimeFormatter.format(new Date(Date.now()))}`);
    info(`📅 Found ${_schedules.length} scheduled workflows:\n${_schedules.map((schedule) => {
      return `${schedule.workflow_id}@${schedule.ref} will run ${durationString(new Date(Date.now()), schedule.date)} (${dateTimeFormatter.format(schedule.date)})}`
    }).join('\n')}`);
    const startTime = Date.now().valueOf();
    return group('👀 Looking for scheduled workflows to run', async () => {

      do {
        info(`👀 ... It's currently ${new Date().toLocaleTimeString()} and ${_schedules.length} workflows are scheduled to run.`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const promises: Promise<any>[] = [];
        for (const [index, schedule] of _schedules.entries()) {
          if (Date.now().valueOf() < schedule.date.valueOf()) continue;
          info(`🚀 Running ${schedule.workflow_id}@ref:${schedule.ref} set for ${dateTimeFormatter.format(schedule.date)}`);

          promises.push(octokit.rest.actions.createWorkflowDispatch({
            ...ownerRepo,
            workflow_id: schedule.workflow_id,
            ref: schedule.ref,
            inputs: schedule.inputs
          }));

          promises.push(octokit.rest.actions.deleteRepoVariable({
            ...ownerRepo,
            name: schedule.variableName,
          }));

          _schedules.splice(index, 1);
        }

        if (inputs.waitMs > 0) {
          promises.push(new Promise((resolve) => setTimeout(resolve, inputs.waitDelayMs)));
        }

        await Promise.all(promises);
        _schedules = await getSchedules();
      } while (inputs.waitMs > (Date.now().valueOf() - startTime) && _schedules.length);
      info(`😪 No more workflows to run. I'll try again next time...`);
    });
  };
  const summaryWrite = async () => {
    const schedules = await getSchedules();
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
    return _summary.write();
  };


  if (context.eventName === 'workflow_dispatch' && inputDate) {
    await scheduleAdd();
  }
  await scheduleRun();
  await summaryWrite();
};

run();
