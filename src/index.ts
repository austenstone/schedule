import { getInput, group, info, setFailed, summary, warning } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { parseDate } from 'chrono-node'
import { intervalToDuration } from 'date-fns'
import { randomUUID } from 'crypto'

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
  inputs?: Record<string, unknown>;
  inputsIgnore: string;
}

export interface Schedule {
  variableName: string;
  workflow_id: string;
  date: Date;
  ref: string;
  inputs?: Record<string, unknown>;
}

export const variablePrefix = '_SCHEDULE';

// GitHub rejects variable names containing anything outside [A-Za-z0-9_], so the
// hyphens randomUUID() produces have to go or every createRepoVariable call 422s.
export const scheduleVariableName = (workflowId: number | string, date: Date): string =>
  [variablePrefix, workflowId, date.valueOf(), randomUUID().replace(/-/g, '')].join('_');

export const scheduleVariableValue = (ref: string, inputs?: Record<string, unknown>): string =>
  `${ref},${inputs ? JSON.stringify(inputs) : ''}`;

export const parseScheduleVariable = (
  variable: { name: string; value: string },
  inputsIgnore = ''
): Schedule => {
  const parts = variable.name.split('_');
  const [ref, ...inputsParts] = variable.value.split(',');
  const inputsJson = inputsParts.join(',');
  const workflowInputs = inputsJson.trim().length > 0 ? JSON.parse(inputsJson) : undefined;
  inputsIgnore
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .forEach((key) => {
      if (workflowInputs && key in workflowInputs) delete workflowInputs[key];
    });
  return {
    variableName: variable.name,
    workflow_id: parts[2],
    date: new Date(+parts[3]),
    ref,
    inputs: workflowInputs,
  };
};

export const durationString = (start: Date, end: Date): string => {
  const duration = intervalToDuration({ start, end });
  if (Object.values(duration).every((value) => typeof value === 'number' && value <= 0)) return 'NOW!';
  return 'in ' + Object.entries(duration).map(([key, value]) => `${value} ${key}`).join(', ');
};

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
  result.inputsIgnore = getInput("inputs-ignore");

  // Validate inputs
  if (result.waitMs < 0) {
    throw new Error('wait-ms must be a non-negative number');
  }
  if (result.waitDelayMs < 0) {
    throw new Error('wait-delay-ms must be a non-negative number');
  }
  if (!result.workflow) {
    throw new Error('workflow input is required');
  }

  return result;
}

export const run = async (): Promise<void> => {
  const inputs = getInputs();
  const ownerRepo = {
    owner: inputs.owner,
    repo: inputs.repo,
  };
  if (!inputs.token) return setFailed('`github-token` input is required');
  const octokit = getOctokit(inputs.token);
  const inputDate = inputs.date?.trim()?.length > 0 ? parseDate(inputs.date, {
    timezone: inputs.timezone || 'UTC'
  }) : undefined;
  const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'medium',
    timeZone: inputs.timezone || 'UTC',
  });
  const workflows = await octokit.paginate(octokit.rest.actions.listRepoWorkflows, {...ownerRepo, per_page: 100});
  const workflow = workflows.find((workflow) => workflow.path.endsWith(inputs.workflow) || workflow.name === inputs.workflow || workflow.id === +inputs.workflow);
  if (!workflow) {
    throw new Error(`Workflow ${inputs.workflow} not found in ${ownerRepo.owner}/${ownerRepo.repo}`);
  }
  const workflowId = workflow.id;
  const getSchedules = async (): Promise<Schedule[]> =>
    octokit.paginate(octokit.rest.actions.listRepoVariables, {...ownerRepo, per_page: 100})
      .then((variables) => (variables ?? [])
        .filter((variable) => variable.name.startsWith(variablePrefix))
        .map((variable) => parseScheduleVariable(variable, inputs.inputsIgnore)));
  const scheduleAdd = async () => {
    if (!inputDate) return;
    info(`🔍 You entered '${inputs.date}' which I assume is '${dateTimeFormatter.format(inputDate)}' your time (${inputs.timezone})`);
    info(`📅 Scheduling ${workflow.name}@${inputs.ref} for ${dateTimeFormatter.format(inputDate)}`);
    return octokit.rest.actions.createRepoVariable({
      ...ownerRepo,
      name: scheduleVariableName(workflowId, inputDate),
      value: scheduleVariableValue(inputs.ref, inputs.inputs),
    }).then(() => {
      info(`✅ Scheduled to run ${durationString(new Date(), inputDate)}!`)
    });
  }
  const scheduleRun = async () => {
    let _schedules = await getSchedules();
    info(`⌚ ${dateTimeFormatter.format(new Date(Date.now()))}`);
    info(`📅 Found ${_schedules.length} scheduled workflows:\n${_schedules.map((schedule) => {
      const _workflow = workflows.find((workflow) => workflow.id === +schedule.workflow_id);
      return `${_workflow?.path || schedule.workflow_id}@${schedule.ref} will run ${durationString(new Date(Date.now()), schedule.date)} (${dateTimeFormatter.format(schedule.date)})}`
    }).join('\n')}`);
    const startTime = Date.now().valueOf();
    return group('👀 Looking for scheduled workflows to run', async () => {
      do {
        info(`👀 ... It's currently ${new Date().toLocaleTimeString()} and ${_schedules.length} workflows are scheduled to run.`);
        const due = _schedules.filter((schedule) => Date.now().valueOf() >= schedule.date.valueOf());
        for (const schedule of due) {
          const _workflow = workflows.find((workflow) => workflow.id === +schedule.workflow_id);
          info(`🚀 Running ${_workflow?.path || schedule.workflow_id}@ref:${schedule.ref} set for ${dateTimeFormatter.format(schedule.date)}`);

          await octokit.rest.actions.createWorkflowDispatch({
            ...ownerRepo,
            workflow_id: schedule.workflow_id,
            ref: schedule.ref,
            inputs: schedule.inputs
          }).then(async () => {
            // Only delete the variable if the workflow dispatch succeeded
            await octokit.rest.actions.deleteRepoVariable({
              ...ownerRepo,
              name: schedule.variableName,
            });
          }).catch((err) => {
            warning(`Failed to run ${_workflow?.path || schedule.workflow_id}@${schedule.ref} set for ${dateTimeFormatter.format(schedule.date)}:\nError: ${err instanceof Error ? err.message : err}`);
          });
        }

        if (inputs.waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, inputs.waitDelayMs));
        }

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
        ...schedules
          .sort((a, b) => a.date.valueOf() - b.date.valueOf())
          .map((schedule) => {
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

if (require.main === module) {
  run().catch((error) => {
    setFailed(`Action failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}
