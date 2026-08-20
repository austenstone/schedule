import { test, expect, describe } from '@jest/globals';
import {
  variablePrefix,
  scheduleVariableName,
  scheduleVariableValue,
  parseScheduleVariable,
  durationString,
} from '../src/index';

// https://docs.github.com/rest/actions/variables#create-a-repository-variable
const GITHUB_VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const workflowId = 146936784;
const date = new Date(1741204800000);

describe('scheduleVariableName', () => {
  test('only uses characters GitHub accepts in a variable name', () => {
    for (let i = 0; i < 100; i++) {
      expect(scheduleVariableName(workflowId, date)).toMatch(GITHUB_VARIABLE_NAME);
    }
  });

  test('is unique for the same workflow at the same time', () => {
    const names = new Set(
      Array.from({ length: 100 }, () => scheduleVariableName(workflowId, date))
    );
    expect(names.size).toBe(100);
  });

  test('embeds the prefix, workflow id and timestamp', () => {
    expect(scheduleVariableName(workflowId, date)).toMatch(
      new RegExp(`^${variablePrefix}_${workflowId}_${date.valueOf()}_[0-9a-f]{32}$`)
    );
  });
});

describe('scheduleVariableValue', () => {
  test('encodes ref only when there are no inputs', () => {
    expect(scheduleVariableValue('refs/heads/main')).toBe('refs/heads/main,');
  });

  test('encodes ref and inputs', () => {
    expect(scheduleVariableValue('refs/heads/main', { name: 'Austen' })).toBe(
      'refs/heads/main,{"name":"Austen"}'
    );
  });
});

describe('parseScheduleVariable', () => {
  const roundTrip = (ref: string, inputs?: Record<string, unknown>, inputsIgnore?: string) =>
    parseScheduleVariable(
      {
        name: scheduleVariableName(workflowId, date),
        value: scheduleVariableValue(ref, inputs),
      },
      inputsIgnore
    );

  test('round trips a name and value produced by this action', () => {
    const schedule = roundTrip('refs/heads/main', { name: 'Austen' });
    expect(schedule.workflow_id).toBe(String(workflowId));
    expect(schedule.date.valueOf()).toBe(date.valueOf());
    expect(schedule.ref).toBe('refs/heads/main');
    expect(schedule.inputs).toEqual({ name: 'Austen' });
  });

  test('keeps inputs whose values contain commas', () => {
    const schedule = roundTrip('refs/heads/main', { name: 'Bob, the Builder' });
    expect(schedule.inputs).toEqual({ name: 'Bob, the Builder' });
  });

  test('leaves inputs undefined when none were stored', () => {
    expect(roundTrip('refs/heads/main').inputs).toBeUndefined();
  });

  test('drops ignored inputs', () => {
    const schedule = roundTrip(
      'refs/heads/main',
      { date: 'in 1 hour', workflow: 'basic.yml', name: 'Austen' },
      'date,workflow'
    );
    expect(schedule.inputs).toEqual({ name: 'Austen' });
  });

  test('drops ignored inputs even when their value is falsy', () => {
    const schedule = roundTrip(
      'refs/heads/main',
      { date: '', workflow: false, name: 'Austen' },
      'date,workflow'
    );
    expect(schedule.inputs).toEqual({ name: 'Austen' });
  });

  test('tolerates whitespace and empty entries in inputs-ignore', () => {
    const schedule = roundTrip(
      'refs/heads/main',
      { date: 'in 1 hour', name: 'Austen' },
      ' date , '
    );
    expect(schedule.inputs).toEqual({ name: 'Austen' });
  });

  test('still parses legacy variable names written before the unique suffix', () => {
    const schedule = parseScheduleVariable({
      name: `${variablePrefix}_${workflowId}_${date.valueOf()}`,
      value: 'refs/heads/main,',
    });
    expect(schedule.workflow_id).toBe(String(workflowId));
    expect(schedule.date.valueOf()).toBe(date.valueOf());
  });
});

describe('durationString', () => {
  const start = new Date('2025-01-01T10:00:00Z');

  test('reports NOW! when the schedule is due', () => {
    expect(durationString(start, start)).toBe('NOW!');
  });

  test('reports NOW! when the schedule is overdue', () => {
    expect(durationString(start, new Date('2025-01-01T09:00:00Z'))).toBe('NOW!');
  });

  test('describes how long until a future schedule', () => {
    expect(durationString(start, new Date('2025-01-01T11:30:00Z'))).toContain('30 minutes');
  });
});
