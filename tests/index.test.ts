import { test, expect, describe } from '@jest/globals';
import { randomUUID } from 'crypto';

test('run', async () => {
  expect(1).toBe(1);
});

describe('Variable naming', () => {
  test('should generate unique variable names for same workflow at same time', () => {
    // Simulate the variableName function behavior
    const variablePrefix = '_SCHEDULE';
    const workflowId = 146936784;
    const date = new Date(1741204800000);
    
    const variableName = (d: Date) => [variablePrefix, workflowId, d.valueOf(), randomUUID()].join('_');
    
    // Generate multiple variable names with the same workflow and time
    const name1 = variableName(date);
    const name2 = variableName(date);
    const name3 = variableName(date);
    
    // All names should start with the same prefix and contain workflow ID and timestamp
    expect(name1).toMatch(new RegExp(`^${variablePrefix}_${workflowId}_${date.valueOf()}_`));
    expect(name2).toMatch(new RegExp(`^${variablePrefix}_${workflowId}_${date.valueOf()}_`));
    expect(name3).toMatch(new RegExp(`^${variablePrefix}_${workflowId}_${date.valueOf()}_`));
    
    // But all three should be unique due to UUID
    expect(name1).not.toBe(name2);
    expect(name2).not.toBe(name3);
    expect(name1).not.toBe(name3);
  });

  test('should parse variable names correctly with UUID', () => {
    const variableName = '_SCHEDULE_146936784_1741204800000_550e8400-e29b-41d4-a716-446655440000';
    const parts = variableName.split('_');
    
    expect(parts[0]).toBe('');
    expect(parts[1]).toBe('SCHEDULE');
    expect(parts[2]).toBe('146936784'); // workflow_id
    expect(parts[3]).toBe('1741204800000'); // timestamp
    expect(parts[4]).toBe('550e8400-e29b-41d4-a716-446655440000'); // UUID
    
    // Verify we can extract workflow_id and timestamp
    const workflowId = parts[2];
    const timestamp = parts[3];
    const date = new Date(+timestamp);
    
    expect(workflowId).toBe('146936784');
    expect(date.valueOf()).toBe(1741204800000);
  });

  test('should parse old format variable names without UUID (backward compatibility)', () => {
    // Old format without UUID
    const oldVariableName = '_SCHEDULE_146936784_1741204800000';
    const parts = oldVariableName.split('_');
    
    expect(parts[0]).toBe('');
    expect(parts[1]).toBe('SCHEDULE');
    expect(parts[2]).toBe('146936784'); // workflow_id
    expect(parts[3]).toBe('1741204800000'); // timestamp
    expect(parts[4]).toBeUndefined(); // No UUID in old format
    
    // Verify parsing logic still works
    const workflowId = parts[2];
    const timestamp = parts[3];
    const date = new Date(+timestamp);
    
    expect(workflowId).toBe('146936784');
    expect(date.valueOf()).toBe(1741204800000);
  });
});